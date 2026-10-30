-- PREPARACAO LOCAL. NAO EXECUTADO. Nao instalar sem revisao de EXECUTE/ACLs.
-- Uma requisicao POST PostgREST, uma transacao. Nao dividir lock e escritas.
-- p_admin_id deve vir EXCLUSIVAMENTE de req.usuario.id autenticado no backend.
-- Guard service_role/perfil nao autentica parametros nem substitui ACLs.
CREATE FUNCTION public.decidir_solicitacao_acesso(
  p_admin_id bigint,
  p_solicitacao_id numeric,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $funcao$
DECLARE
  v_solicitacao record;
  v_usuarios_afetados bigint;
BEGIN
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = 'TA403', MESSAGE = 'Acesso recusado.';
  END IF;
  IF p_admin_id IS NULL OR p_admin_id <= 0 OR p_admin_id > 9007199254740991 THEN
    RAISE EXCEPTION USING ERRCODE = 'TA403', MESSAGE = 'Ator invalido.';
  END IF;
  IF p_solicitacao_id IS NULL OR p_solicitacao_id <= 0
     OR p_solicitacao_id::text IN ('NaN', 'Infinity', '-Infinity')
     OR p_solicitacao_id <> pg_catalog.trunc(p_solicitacao_id)
     OR p_status IS NULL OR p_status COLLATE pg_catalog."C" NOT IN ('aprovado', 'rejeitado') THEN
    RAISE EXCEPTION USING ERRCODE = 'TA400', MESSAGE = 'Entrada invalida.';
  END IF;
  PERFORM u.id FROM public.usuarios AS u
    WHERE u.id = p_admin_id AND u.perfil = 'admin';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'TA403', MESSAGE = 'Acesso recusado.';
  END IF;

  -- O handler usa Number.isInteger, NAO isSafeInteger. NUMERIC evita overflow
  -- de bigint no transporte de inteiros grandes aceitos pelo contrato atual.
  -- O esquema auditado tem PK INTEGER: valores acima dela sao ausentes (404).
  IF p_solicitacao_id > 2147483647 THEN
    RAISE EXCEPTION USING ERRCODE = 'TA404', MESSAGE = 'Solicitacao ausente.';
  END IF;
  -- PRIMEIRO LOCK de linha: solicitacao. Conferir status so DEPOIS do lock.
  SELECT s.usuario_id, s.perfil_solicitado, s.status
    INTO v_solicitacao
    FROM public.solicitacoes_acesso AS s
    WHERE s.id = p_solicitacao_id::integer
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'TA404', MESSAGE = 'Solicitacao ausente.';
  END IF;
  IF v_solicitacao.status IS DISTINCT FROM 'pendente'::public.solicitacoes_acesso_status_enum THEN
    RAISE EXCEPTION USING ERRCODE = 'TA409', MESSAGE = 'Solicitacao ja analisada.';
  END IF;

  IF p_status = 'aprovado' THEN
    -- Segundo lock implicito: UPDATE condicional do usuario. ENUMs distintos
    -- exigem conversao explicita via texto; nao alterar seus valores.
    UPDATE public.usuarios
      SET perfil = (v_solicitacao.perfil_solicitado::text)::public.usuarios_perfil_enum
      WHERE id = v_solicitacao.usuario_id AND perfil = 'participante';
    GET DIAGNOSTICS v_usuarios_afetados = ROW_COUNT;
    IF v_usuarios_afetados <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = 'TA412', MESSAGE = 'Perfil atual incompativel.';
    END IF;
  END IF;
  -- Rejeicao nao atualiza usuario nem exige que ele ainda seja participante.
  UPDATE public.solicitacoes_acesso
    SET status = p_status::public.solicitacoes_acesso_status_enum
    WHERE id = p_solicitacao_id::integer;

  RETURN pg_catalog.jsonb_build_object('mensagem', CASE WHEN p_status = 'aprovado'
    THEN 'Solicitação aprovada com sucesso!'
    ELSE 'Solicitação rejeitada com sucesso!' END);
  -- Sem captura de falhas: erro de status/cast/commit deve reverter tambem o
  -- perfil. PostgREST finaliza a transacao; nao ha COMMIT ou retry internos.
END;
$funcao$;
