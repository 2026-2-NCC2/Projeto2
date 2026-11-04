-- PROPOSTA: não executar sem autorização. Uma aplicação; colisões abortam.
-- Preserva os estados atuais e todos os relacionamentos/dados de negócio.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SET LOCAL idle_in_transaction_session_timeout='15s';
-- Janela curta com o backend antigo parado/drenado. Não entrar em fila de DDL.
LOCK TABLE public.eventos,public.inscricoes IN ACCESS EXCLUSIVE MODE NOWAIT;
DO $$ BEGIN
  IF current_setting('server_version_num')::integer<150000 OR current_setting('server_version_num')::integer>=190000 THEN
    RAISE EXCEPTION 'Versão PostgreSQL não revisada.';
  END IF;
  IF current_setting('server_version_num')::integer>=170000 THEN
    EXECUTE 'SET LOCAL transaction_timeout=''30s''';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls) OR
    EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated') AND (rolsuper OR rolbypassrls)) OR
    NOT has_schema_privilege('service_role','public','USAGE') OR
    NOT has_table_privilege('service_role','public.usuarios','SELECT') OR NOT has_table_privilege('service_role','public.usuarios','UPDATE') OR
    NOT has_table_privilege('service_role','public.contas_teste_imagens','SELECT') OR
    NOT has_table_privilege('service_role','public.eventos','SELECT') OR NOT has_table_privilege('service_role','public.eventos','INSERT') OR
    NOT has_table_privilege('service_role','public.eventos','UPDATE') OR NOT has_table_privilege('service_role','public.inscricoes','SELECT') OR
    NOT has_table_privilege('service_role','public.inscricoes','INSERT') THEN
    RAISE EXCEPTION 'Permissões necessárias ausentes; nenhuma concessão automática em tabelas existentes.';
  END IF;
  IF pg_get_serial_sequence('public.eventos','id') IS NULL OR pg_get_serial_sequence('public.inscricoes','id') IS NULL OR
    NOT has_sequence_privilege('service_role',pg_get_serial_sequence('public.eventos','id'),'USAGE') OR
    NOT has_sequence_privilege('service_role',pg_get_serial_sequence('public.inscricoes','id'),'USAGE') THEN
    RAISE EXCEPTION 'Identity/sequence ou USAGE ausente; não conceder privilégios automaticamente.';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgenabled<>'D'
    AND tgrelid IN ('public.eventos'::regclass,'public.inscricoes'::regclass)) THEN
    RAISE EXCEPTION 'Trigger de negócio preexistente: revisar interação antes da migração.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.eventos WHERE status IS NULL OR status COLLATE pg_catalog."C" NOT IN ('Em planejamento','Ativo','Cancelado','Encerrado')) THEN
    RAISE EXCEPTION 'Estados desconhecidos: revisar sem converter registros automaticamente.';
  END IF;
END $$;
ALTER TABLE public.eventos
  ADD COLUMN versao integer NOT NULL DEFAULT 1 CHECK(versao>0),
  ADD COLUMN criacao_chave uuid,
  ADD COLUMN criacao_payload jsonb,
  ADD COLUMN publicado_em timestamptz,
  ADD COLUMN cancelado_em timestamptz,
  ADD COLUMN encerrado_em timestamptz,
  ADD CONSTRAINT eventos_ciclo_v1 CHECK(status IS NOT NULL AND status COLLATE pg_catalog."C" IN ('Em planejamento','Ativo','Cancelado','Encerrado')) NOT VALID;
ALTER TABLE public.eventos VALIDATE CONSTRAINT eventos_ciclo_v1;
CREATE UNIQUE INDEX eventos_criacao_unica_v1 ON public.eventos(usuario_id,criacao_chave) WHERE criacao_chave IS NOT NULL;

-- Defesa para escritores legados: versões e regras também valem fora das RPCs.
CREATE FUNCTION public.eventos_guardar_v1() RETURNS trigger LANGUAGE plpgsql
SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF OLD.status IN ('Cancelado','Encerrado') THEN RAISE EXCEPTION USING ERRCODE='EV409',MESSAGE='Evento finalizado.'; END IF;
  IF NEW.usuario_id<>OLD.usuario_id THEN RAISE EXCEPTION USING ERRCODE='EV409',MESSAGE='Proprietário imutável neste fluxo.'; END IF;
  IF ROW(NEW.criacao_chave,NEW.criacao_payload,NEW.publicado_em,NEW.cancelado_em,NEW.encerrado_em,NEW.versao)
    IS DISTINCT FROM ROW(OLD.criacao_chave,OLD.criacao_payload,OLD.publicado_em,OLD.cancelado_em,OLD.encerrado_em,OLD.versao) THEN
    RAISE EXCEPTION USING ERRCODE='EV409',MESSAGE='Metadados de criação, versão e histórico são geridos pelo banco.';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status='Em planejamento' AND NEW.status IN ('Ativo','Cancelado')) OR
    (OLD.status='Ativo' AND NEW.status IN ('Cancelado','Encerrado'))) THEN
    RAISE EXCEPTION USING ERRCODE='EV409',MESSAGE='Transição inválida.';
  END IF;
  IF OLD.status='Ativo' AND ROW(NEW.nome COLLATE pg_catalog."C",NEW.data,NEW.horario,NEW.local COLLATE pg_catalog."C",NEW.categoria COLLATE pg_catalog."C",NEW.publico)
      IS DISTINCT FROM ROW(OLD.nome COLLATE pg_catalog."C",OLD.data,OLD.horario,OLD.local COLLATE pg_catalog."C",OLD.categoria COLLATE pg_catalog."C",OLD.publico) THEN
    RAISE EXCEPTION USING ERRCODE='EV409',MESSAGE='Evento publicado permite somente descrição.';
  END IF;
  IF NEW.status='Ativo' AND (NEW.data+NEW.horario) AT TIME ZONE 'America/Sao_Paulo'<=clock_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE='EV409',MESSAGE='Evento já iniciado.';
  END IF;
  IF NEW.status='Encerrado' AND (NEW.data+NEW.horario) AT TIME ZONE 'America/Sao_Paulo'>clock_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE='EV409',MESSAGE='Evento ainda não iniciou.';
  END IF;
  NEW.versao:=OLD.versao+1;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status='Ativo' THEN NEW.publicado_em:=clock_timestamp(); END IF;
    IF NEW.status='Cancelado' THEN NEW.cancelado_em:=clock_timestamp(); END IF;
    IF NEW.status='Encerrado' THEN NEW.encerrado_em:=clock_timestamp(); END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER eventos_guardar_v1 BEFORE UPDATE ON public.eventos FOR EACH ROW EXECUTE FUNCTION public.eventos_guardar_v1();

CREATE FUNCTION public.gerir_evento_v1(p_acao text,p_usuario integer,p_evento integer DEFAULT NULL,
  p_dados jsonb DEFAULT '{}'::jsonb,p_versao integer DEFAULT NULL,p_chave uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE e public.eventos%ROWTYPE; perfil_atual text; dados jsonb; v_data date; v_horario time;
BEGIN
  SET LOCAL lock_timeout='2s';
  SELECT perfil::text INTO perfil_atual FROM public.usuarios WHERE id=p_usuario FOR UPDATE;
  IF perfil_atual IS DISTINCT FROM 'organizador' OR EXISTS(SELECT 1 FROM public.contas_teste_imagens WHERE usuario_id=p_usuario AND estado<>'ativa') THEN
    RAISE EXCEPTION USING ERRCODE='EV403',MESSAGE='Organizador indisponível.';
  END IF;
  IF p_acao IN ('criar','editar') THEN
    IF jsonb_typeof(p_dados) IS DISTINCT FROM 'object' OR
      EXISTS(SELECT 1 FROM unnest(ARRAY['nome','data','horario','local','categoria','descricao']) c WHERE jsonb_typeof(p_dados->c) IS DISTINCT FROM 'string') OR
      jsonb_typeof(p_dados->'publico') IS DISTINCT FROM 'number' OR (p_dados->>'publico')!~'^[1-9][0-9]*$' OR
      length(btrim(p_dados->>'nome')) NOT BETWEEN 1 AND 100 OR length(btrim(p_dados->>'local')) NOT BETWEEN 1 AND 200 OR
      length(btrim(p_dados->>'categoria')) NOT BETWEEN 1 AND 100 OR length(p_dados->>'descricao')>10000 OR
      (p_dados->>'data')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR (p_dados->>'horario')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
      RAISE EXCEPTION USING ERRCODE='EV400',MESSAGE='Dados inválidos.';
    END IF;
    IF EXISTS(SELECT 1 FROM unnest(ARRAY['nome','local','categoria']) c WHERE (p_dados->>c) COLLATE pg_catalog."C" ~ '[[:cntrl:]]') OR
      translate(p_dados->>'descricao',chr(9)||chr(10)||chr(13),'') COLLATE pg_catalog."C" ~ '[[:cntrl:]]' OR
      (p_dados->>'data') COLLATE pg_catalog."C" < '1000-01-01' THEN
      RAISE EXCEPTION USING ERRCODE='EV400',MESSAGE='Dados inválidos.';
    END IF;
    BEGIN
      v_data:=(p_dados->>'data')::date;v_horario:=(p_dados->>'horario')::time;
      IF (p_dados->>'publico')::integer<=0 THEN RAISE EXCEPTION USING ERRCODE='EV400',MESSAGE='Público inválido.'; END IF;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN
      RAISE EXCEPTION USING ERRCODE='EV400',MESSAGE='Data, horário ou público inválido.';
    END;
    dados:=jsonb_build_object('nome',btrim(p_dados->>'nome'),'data',to_char(v_data,'YYYY-MM-DD'),'horario',left(v_horario::text,5),
      'local',btrim(p_dados->>'local'),'categoria',btrim(p_dados->>'categoria'),'publico',(p_dados->>'publico')::integer,'descricao',btrim(p_dados->>'descricao'));
  END IF;
  IF p_acao='criar' THEN
    IF p_chave IS NULL THEN RAISE EXCEPTION USING ERRCODE='EV400',MESSAGE='Chave obrigatória.'; END IF;
    SELECT * INTO e FROM public.eventos WHERE usuario_id=p_usuario AND criacao_chave=p_chave FOR UPDATE;
    IF FOUND THEN
      IF e.criacao_payload IS DISTINCT FROM dados THEN RAISE EXCEPTION USING ERRCODE='EV409',MESSAGE='Chave já utilizada com outros dados.'; END IF;
      RETURN to_jsonb(e)-'criacao_payload'-'criacao_chave';
    END IF;
    IF (v_data+v_horario) AT TIME ZONE 'America/Sao_Paulo'<=clock_timestamp() THEN RAISE EXCEPTION USING ERRCODE='EV400',MESSAGE='Início deve ser futuro.'; END IF;
    INSERT INTO public.eventos(nome,data,horario,local,categoria,publico,descricao,status,usuario_id,criacao_chave,criacao_payload)
      VALUES(dados->>'nome',v_data,v_horario,dados->>'local',dados->>'categoria',(dados->>'publico')::integer,dados->>'descricao','Em planejamento',p_usuario,p_chave,dados) RETURNING * INTO e;
  ELSE
    SELECT * INTO e FROM public.eventos WHERE id=p_evento AND usuario_id=p_usuario FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='EV404',MESSAGE='Evento não encontrado.'; END IF;
    IF p_versao IS NULL OR e.versao<>p_versao THEN RAISE EXCEPTION USING ERRCODE='EV409',MESSAGE='Versão divergente.'; END IF;
    IF p_acao='editar' THEN
      IF e.status='Ativo' THEN
        -- A UI envia todos os campos. Compare a representação normalizada,
        -- mas preserve literalmente os valores legados, inclusive NULL e segundos.
        IF dados-'descricao' IS DISTINCT FROM jsonb_build_object('nome',btrim(e.nome),'data',to_char(e.data,'YYYY-MM-DD'),
          'horario',left(e.horario::text,5),'local',btrim(e.local),
          'categoria',COALESCE(NULLIF(btrim(e.categoria),''),'Corporativo'),'publico',e.publico) THEN
          RAISE EXCEPTION USING ERRCODE='EV409',MESSAGE='Evento publicado permite somente descrição.';
        END IF;
        UPDATE public.eventos SET descricao=dados->>'descricao' WHERE id=e.id RETURNING * INTO e;
      ELSE
        IF (v_data+v_horario) AT TIME ZONE 'America/Sao_Paulo'<=clock_timestamp() THEN RAISE EXCEPTION USING ERRCODE='EV409',MESSAGE='Evento já iniciado.'; END IF;
        UPDATE public.eventos SET nome=dados->>'nome',data=v_data,horario=v_horario,local=dados->>'local',categoria=dados->>'categoria',
          publico=(dados->>'publico')::integer,descricao=dados->>'descricao' WHERE id=e.id RETURNING * INTO e;
      END IF;
    ELSIF p_acao='publicar' AND e.status='Em planejamento' THEN UPDATE public.eventos SET status='Ativo' WHERE id=e.id RETURNING * INTO e;
    ELSIF p_acao='cancelar' AND e.status IN ('Em planejamento','Ativo') THEN UPDATE public.eventos SET status='Cancelado' WHERE id=e.id RETURNING * INTO e;
    ELSIF p_acao='encerrar' AND e.status='Ativo' THEN UPDATE public.eventos SET status='Encerrado' WHERE id=e.id RETURNING * INTO e;
    ELSE RAISE EXCEPTION USING ERRCODE='EV409',MESSAGE='Transição inválida.'; END IF;
  END IF;
  RETURN to_jsonb(e)-'criacao_payload'-'criacao_chave';
END $$;

-- Mesmo lock de evento usado por cancelamento/encerramento. Também protege
-- INSERTs legados, sem cancelar ou modificar inscrições existentes.
CREATE FUNCTION public.inscricoes_guardar_evento_v1() RETURNS trigger LANGUAGE plpgsql
SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE e public.eventos%ROWTYPE; perfil_atual text;
BEGIN
  SELECT perfil::text INTO perfil_atual FROM public.usuarios WHERE id=NEW.usuario_id FOR UPDATE;
  IF perfil_atual IS DISTINCT FROM 'participante' OR EXISTS(SELECT 1 FROM public.contas_teste_imagens WHERE usuario_id=NEW.usuario_id AND estado<>'ativa') THEN
    RAISE EXCEPTION USING ERRCODE='EV403',MESSAGE='Participante indisponível.';
  END IF;
  SELECT * INTO e FROM public.eventos WHERE id=NEW.evento_id FOR UPDATE;
  IF NOT FOUND OR e.status<>'Ativo' OR (e.data+e.horario) AT TIME ZONE 'America/Sao_Paulo'<=clock_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE='EV409',MESSAGE='Evento indisponível para inscrição.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inscricoes_guardar_evento_v1 BEFORE INSERT ON public.inscricoes FOR EACH ROW EXECUTE FUNCTION public.inscricoes_guardar_evento_v1();
CREATE FUNCTION public.inscrever_evento_v1(p_usuario integer,p_evento integer) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE novo_id integer;
BEGIN
  SET LOCAL lock_timeout='2s';
  INSERT INTO public.inscricoes(usuario_id,evento_id) VALUES(p_usuario,p_evento) RETURNING id INTO novo_id;
  RETURN novo_id;
END $$;
CREATE FUNCTION public.eventos_capacidades_v1() RETURNS integer LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog AS $$ SELECT 1 $$;
REVOKE ALL ON FUNCTION public.eventos_guardar_v1(),public.inscricoes_guardar_evento_v1(),
  public.gerir_evento_v1(text,integer,integer,jsonb,integer,uuid),public.inscrever_evento_v1(integer,integer),public.eventos_capacidades_v1() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.eventos_guardar_v1(),public.inscricoes_guardar_evento_v1(),
  public.gerir_evento_v1(text,integer,integer,jsonb,integer,uuid),public.inscrever_evento_v1(integer,integer),public.eventos_capacidades_v1() TO service_role;
DO $$
DECLARE alvo regprocedure;
BEGIN
  FOREACH alvo IN ARRAY ARRAY['public.eventos_guardar_v1()'::regprocedure,'public.inscricoes_guardar_evento_v1()'::regprocedure,
    'public.gerir_evento_v1(text,integer,integer,jsonb,integer,uuid)'::regprocedure,
    'public.inscrever_evento_v1(integer,integer)'::regprocedure,'public.eventos_capacidades_v1()'::regprocedure] LOOP
    IF has_function_privilege('anon',alvo,'EXECUTE') OR has_function_privilege('authenticated',alvo,'EXECUTE') OR
      has_function_privilege('service_role',alvo,'EXECUTE WITH GRANT OPTION') OR EXISTS(
        SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid=alvo
        AND a.grantee NOT IN(p.proowner,(SELECT oid FROM pg_roles WHERE rolname='service_role'))
        AND NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.oid=a.grantee AND r.rolsuper)) THEN
      RAISE EXCEPTION 'Grant inesperado em função nova. Revisar defaults sem alterá-los globalmente.';
    END IF;
  END LOOP;
END $$;
-- Sem alteração de RLS, políticas, defaults globais ou privilégios de tabelas.
NOTIFY pgrst,'reload schema';
COMMIT;
