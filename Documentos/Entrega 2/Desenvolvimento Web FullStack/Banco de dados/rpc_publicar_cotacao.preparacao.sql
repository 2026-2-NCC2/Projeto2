-- PREPARACAO LOCAL: NAO EXECUTADO. Nao instalar sem revisao de ACLs/EXECUTE.
-- Backend privado autentica JWT/perfil e fornece ator e dia UTC; parametros
-- nao autenticam usuarios. Guard service_role nao substitui revisao de privilegios.
-- Mesmo protocolo do PUT: evento -> custos id ASC -> escritas.
-- Uma requisicao PostgREST, sem retry/idempotencia ou controle transacional interno.
CREATE FUNCTION public.publicar_cotacao(
  p_evento_id bigint, p_usuario_id bigint, p_prazo text,
  p_hoje_utc text, p_observacoes text, p_itens jsonb
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
  v_persistidos jsonb := '[]'::jsonb;
  v_categoria text;
  v_descricao text;
  v_valor text;
  v_custo record;
  v_id bigint;
  v_prazo date;
  v_hoje date;
  v_espacos constant text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
BEGIN
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = 'TP403', MESSAGE = 'Acesso recusado.';
  END IF;
  IF p_evento_id IS NULL OR p_evento_id <= 0 OR p_evento_id > 9007199254740991
     OR p_usuario_id IS NULL OR p_usuario_id <= 0 OR p_usuario_id > 9007199254740991 THEN
    RAISE EXCEPTION USING ERRCODE = 'TP400', MESSAGE = 'Identificador invalido.';
  END IF;
  IF p_itens IS NULL OR pg_catalog.jsonb_typeof(p_itens) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = 'TP400', MESSAGE = 'Lista de custos invalida.';
  END IF;

  -- Validar A LISTA INTEIRA antes de qualquer DELETE/INSERT ou lock de evento.
  -- O adaptador envia dinheiro normalizado em texto, nunca numeric JSON.
  FOR v_item IN
    SELECT j.value FROM pg_catalog.jsonb_array_elements(p_itens)
      WITH ORDINALITY AS j(value, ordem) ORDER BY j.ordem
  LOOP
    IF pg_catalog.jsonb_typeof(v_item) <> 'object'
       OR pg_catalog.jsonb_typeof(v_item -> 'categoria') IS DISTINCT FROM 'string'
       OR pg_catalog.jsonb_typeof(v_item -> 'descricao') IS DISTINCT FROM 'string'
       OR pg_catalog.jsonb_typeof(v_item -> 'valor_estimado') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION USING ERRCODE = 'TP400', MESSAGE = 'Item de custo invalido.';
    END IF;
    v_categoria := pg_catalog.btrim(v_item ->> 'categoria', v_espacos);
    v_descricao := pg_catalog.btrim(v_item ->> 'descricao', v_espacos);
    v_valor := v_item ->> 'valor_estimado';
    IF pg_catalog.char_length(v_categoria) NOT BETWEEN 1 AND 100
       OR pg_catalog.char_length(v_descricao) NOT BETWEEN 1 AND 255
       OR v_valor !~ '^(0|[1-9][0-9]{0,9})[.][0-9]{2}$' THEN
      RAISE EXCEPTION USING ERRCODE = 'TP400', MESSAGE = 'Item de custo invalido.';
    END IF;
    v_normalizados := v_normalizados || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('categoria', v_categoria, 'descricao', v_descricao,
                                   'valor_estimado', v_valor));
  END LOOP;


  -- Dia UTC confiavel capturado pelo backend antes de esperar locks.
  -- Nao usar CURRENT_DATE, nem aceitar p_hoje_utc do corpo publico.
  IF p_prazo IS NULL OR p_hoje_utc IS NULL OR p_observacoes IS NULL
     OR p_prazo !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     OR p_hoje_utc !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RAISE EXCEPTION USING ERRCODE = 'TP400', MESSAGE = 'Data invalida.';
  END IF;
  -- Captura restrita a calendario, antes dos locks/escritas; nao permite commit
  -- parcial nem esconde falhas transacionais. Preserva o erro de prazo do POST.
  BEGIN
    v_prazo := p_prazo::date;
    v_hoje := p_hoje_utc::date;
  EXCEPTION WHEN SQLSTATE '22007' OR SQLSTATE '22008' THEN
    RAISE EXCEPTION USING ERRCODE = 'TP401', MESSAGE = 'Prazo invalido.';
  END;
  IF pg_catalog.to_char(v_prazo, 'YYYY-MM-DD') <> p_prazo
     OR pg_catalog.to_char(v_hoje, 'YYYY-MM-DD') <> p_hoje_utc OR v_prazo < v_hoje THEN
    RAISE EXCEPTION USING ERRCODE = 'TP401', MESSAGE = 'Prazo passado ou invalido.';
  END IF;
  PERFORM u.id FROM public.usuarios AS u
    WHERE u.id = p_usuario_id AND u.perfil = 'organizador';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'TP403', MESSAGE = 'Acesso recusado.';
  END IF;
  PERFORM e.id FROM public.eventos AS e
    WHERE e.id = p_evento_id AND e.usuario_id = p_usuario_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'TP404', MESSAGE = 'Evento ausente.';
  END IF;
  FOR v_custo IN
    SELECT c.id, c.categoria, c.descricao, c.valor_estimado
      FROM public.custos_evento AS c WHERE c.evento_id = p_evento_id
      ORDER BY c.id FOR UPDATE
  LOOP
    v_categoria := pg_catalog.btrim(v_custo.categoria, v_espacos);
    v_descricao := pg_catalog.btrim(v_custo.descricao, v_espacos);
    v_valor := v_custo.valor_estimado::text;
    IF v_categoria IS NULL OR v_descricao IS NULL OR v_valor IS NULL
       OR pg_catalog.char_length(v_categoria) NOT BETWEEN 1 AND 100
       OR pg_catalog.char_length(v_descricao) NOT BETWEEN 1 AND 255
       OR v_valor !~ '^(0|[1-9][0-9]{0,9})[.][0-9]{2}$' THEN
      RAISE EXCEPTION USING ERRCODE = 'TP500', MESSAGE = 'Custos persistidos invalidos.';
    END IF;
    v_persistidos := v_persistidos || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('categoria', v_categoria, 'descricao', v_descricao,
                                   'valor_estimado', v_valor));
  END LOOP;
  IF pg_catalog.jsonb_array_length(v_persistidos) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'TP402', MESSAGE = 'Sem custos.';
  END IF;
  -- Ambos os arrays foram reconstruidos com os mesmos campos e forma JSONB.
  -- Comparacao C explicita: nao usar igualdade aproximada da collation ICU.
  IF v_normalizados::text COLLATE pg_catalog."C" IS DISTINCT FROM v_persistidos::text COLLATE pg_catalog."C" THEN
    RAISE EXCEPTION USING ERRCODE = 'TP409', MESSAGE = 'Revisao divergente.';
  END IF;
  INSERT INTO public.cotacoes (evento_id, prazo, modalidade, observacoes, status)
    VALUES (p_evento_id, v_prazo, 'Fechada', p_observacoes, 'Aberta')
    RETURNING id INTO v_id;
  FOR v_item IN
    SELECT j.value FROM pg_catalog.jsonb_array_elements(v_persistidos)
      WITH ORDINALITY AS j(value, ordem) ORDER BY j.ordem
  LOOP
    INSERT INTO public.itens_cotacao (cotacao_id, categoria, descricao, valor_estimado)
      VALUES (v_id, v_item ->> 'categoria', v_item ->> 'descricao',
              (v_item ->> 'valor_estimado')::numeric(12,2));
  END LOOP;
  RETURN pg_catalog.jsonb_build_object('id', v_id, 'evento_id', p_evento_id,
    'prazo', p_prazo, 'modalidade', 'Fechada', 'observacoes', p_observacoes,
    'status', 'Aberta', 'itens', v_persistidos);
  -- Sem captura: falhas propagam e abortam a transacao da requisicao.
END;
$funcao$;
