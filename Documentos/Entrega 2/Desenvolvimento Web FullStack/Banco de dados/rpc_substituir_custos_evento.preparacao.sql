-- PREPARACAO LOCAL. NAO EXECUTADO. NAO E UMA MIGRACAO AUTOMATICA.
-- Nao executar antes de revisar EXECUTE/default ACLs e validar em ambiente
-- descartavel autorizado. Nao contem GRANT/REVOKE nem altera configuracoes.
-- CREATE sem OR REPLACE: nao sobrescrever uma funcao existente.
-- Uma chamada POST RPC executa tudo na transacao do PostgREST. Nao separar
-- bloqueio, escrita e releitura em requisicoes diferentes.
-- p_usuario_id e fornecido pelo backend autenticado, nunca pelo corpo publico.
-- O guard service_role nao autentica esse ID nem substitui revisao de EXECUTE.

CREATE FUNCTION public.substituir_custos_evento(
  p_evento_id bigint,
  p_usuario_id bigint,
  p_custos jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $funcao$
DECLARE
  v_item jsonb;
  v_normalizados jsonb := '[]'::jsonb;
  v_categoria text;
  v_descricao text;
  v_valor text;
  v_resultado jsonb;
  -- Mesmo conjunto de whitespace do String.trim do ECMAScript.
  v_espacos constant text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
BEGIN
  -- Defesa adicional da futura entrada RPC. Nao substitui JWT/perfil do backend.
  -- O cliente privado configurado usa service_role; postgres/anon nao sao atalhos.
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = 'TC403', MESSAGE = 'Acesso recusado.';
  END IF;
  IF p_evento_id IS NULL OR p_evento_id <= 0 OR p_evento_id > 9007199254740991
     OR p_usuario_id IS NULL OR p_usuario_id <= 0 OR p_usuario_id > 9007199254740991 THEN
    RAISE EXCEPTION USING ERRCODE = 'TC400', MESSAGE = 'Identificador invalido.';
  END IF;
  IF p_custos IS NULL OR pg_catalog.jsonb_typeof(p_custos) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = 'TC400', MESSAGE = 'Lista de custos invalida.';
  END IF;

  -- Validar A LISTA INTEIRA antes de qualquer DELETE/INSERT ou lock de evento.
  -- O adaptador envia dinheiro normalizado em texto, nunca numeric JSON.
  FOR v_item IN
    SELECT j.value FROM pg_catalog.jsonb_array_elements(p_custos)
      WITH ORDINALITY AS j(value, ordem) ORDER BY j.ordem
  LOOP
    IF pg_catalog.jsonb_typeof(v_item) <> 'object'
       OR pg_catalog.jsonb_typeof(v_item -> 'categoria') IS DISTINCT FROM 'string'
       OR pg_catalog.jsonb_typeof(v_item -> 'descricao') IS DISTINCT FROM 'string'
       OR pg_catalog.jsonb_typeof(v_item -> 'valor_estimado') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION USING ERRCODE = 'TC400', MESSAGE = 'Item de custo invalido.';
    END IF;
    v_categoria := pg_catalog.btrim(v_item ->> 'categoria', v_espacos);
    v_descricao := pg_catalog.btrim(v_item ->> 'descricao', v_espacos);
    v_valor := v_item ->> 'valor_estimado';
    IF pg_catalog.char_length(v_categoria) NOT BETWEEN 1 AND 100
       OR pg_catalog.char_length(v_descricao) NOT BETWEEN 1 AND 255
       OR v_valor !~ '^(0|[1-9][0-9]{0,9})[.][0-9]{2}$' THEN
      RAISE EXCEPTION USING ERRCODE = 'TC400', MESSAGE = 'Item de custo invalido.';
    END IF;
    v_normalizados := v_normalizados || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('categoria', v_categoria, 'descricao', v_descricao,
                                   'valor_estimado', v_valor));
  END LOOP;

  PERFORM u.id FROM public.usuarios AS u
    WHERE u.id = p_usuario_id AND u.perfil = 'organizador';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'TC403', MESSAGE = 'Acesso recusado.';
  END IF;

  -- PRIMEIRO LOCK: mesma linha de evento que a futura publicacao deve bloquear.
  -- O SELECT anterior de perfil e leitura simples, sem FOR UPDATE.
  PERFORM e.id FROM public.eventos AS e
    WHERE e.id = p_evento_id AND e.usuario_id = p_usuario_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'TC404', MESSAGE = 'Evento nao encontrado.';
  END IF;

  DELETE FROM public.custos_evento WHERE evento_id = p_evento_id;
  FOR v_item IN
    SELECT j.value FROM pg_catalog.jsonb_array_elements(v_normalizados)
      WITH ORDINALITY AS j(value, ordem) ORDER BY j.ordem
  LOOP
    INSERT INTO public.custos_evento (evento_id, categoria, descricao, valor_estimado)
      VALUES (p_evento_id, v_item ->> 'categoria', v_item ->> 'descricao',
              (v_item ->> 'valor_estimado')::numeric(12,2));
  END LOOP;

  -- Releitura DENTRO da mesma transacao, com IDs reais e dinheiro em texto.
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', c.id, 'evento_id', c.evento_id, 'categoria', c.categoria,
    'descricao', c.descricao, 'valor_estimado', c.valor_estimado::text
  ) ORDER BY c.id), '[]'::jsonb)
    INTO v_resultado FROM public.custos_evento AS c WHERE c.evento_id = p_evento_id;
  RETURN v_resultado;
  -- Sem EXCEPTION que esconda falhas: qualquer erro aborta a transacao inteira.
  -- Sem COMMIT interno. O commit da requisicao precede a resposta de sucesso.
END;
$funcao$;
