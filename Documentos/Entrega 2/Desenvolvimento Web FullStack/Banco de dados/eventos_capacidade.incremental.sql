-- Etapa 3. Proposta local; aplicar somente em janela autorizada, após Etapa 1.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
LOCK TABLE public.eventos,public.inscricoes IN ACCESS EXCLUSIVE MODE NOWAIT;
DO $$ BEGIN
  IF current_setting('server_version_num')::integer<150000 OR current_setting('server_version_num')::integer>=190000 THEN
    RAISE EXCEPTION 'Versão PostgreSQL não revisada.';
  END IF;
  IF public.eventos_capacidades_v1()<>1 OR
    NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.eventos'::regclass AND tgname='eventos_guardar_v1' AND tgenabled='O') OR
    NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.inscricoes'::regclass AND tgname='inscricoes_guardar_evento_v1' AND tgenabled='O') THEN
    RAISE EXCEPTION 'Etapa 1 incompatível; revisar antes de aplicar.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.inscricoes'::regclass
    AND contype='u' AND convalidated AND NOT condeferrable
    AND pg_get_constraintdef(oid)='UNIQUE (usuario_id, evento_id)') THEN
    RAISE EXCEPTION 'Unicidade de inscrições ausente ou incompatível.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.inscricoes WHERE status IS NULL OR status COLLATE pg_catalog."C" NOT IN ('Confirmada','Cancelada')) THEN
    RAISE EXCEPTION 'Status de inscrição desconhecido: revisar sem converter dados.';
  END IF;
END $$;
-- NULL mantém o comportamento dos legados; nunca derivar de publico.
ALTER TABLE public.eventos ADD COLUMN capacidade_maxima integer,
 ADD CONSTRAINT eventos_capacidade_v3 CHECK(capacidade_maxima IS NULL OR capacidade_maxima>0);
CREATE INDEX inscricoes_confirmadas_evento_v3 ON public.inscricoes(evento_id)
 WHERE status COLLATE pg_catalog."C"='Confirmada';

CREATE FUNCTION public.eventos_vagas_guardar_v3() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.capacidade_maxima IS DISTINCT FROM OLD.capacidade_maxima THEN
    IF current_setting('transaction_isolation')<>'read committed' THEN
      RAISE EXCEPTION USING ERRCODE='EV409',MESSAGE='Use READ COMMITTED para controlar vagas.';
    END IF;
    IF NEW.capacidade_maxima IS NOT NULL AND NEW.capacidade_maxima <
      (SELECT count(*) FROM public.inscricoes WHERE evento_id=NEW.id AND status COLLATE pg_catalog."C"='Confirmada') THEN
      RAISE EXCEPTION USING ERRCODE='CP409',MESSAGE='Capacidade abaixo das inscrições confirmadas.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER eventos_vagas_guardar_v3 BEFORE UPDATE ON public.eventos
 FOR EACH ROW EXECUTE FUNCTION public.eventos_vagas_guardar_v3();

CREATE OR REPLACE FUNCTION public.inscricoes_guardar_evento_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE e public.eventos%ROWTYPE; perfil_atual text;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF ROW(NEW.usuario_id,NEW.evento_id) IS DISTINCT FROM ROW(OLD.usuario_id,OLD.evento_id) THEN
      RAISE EXCEPTION USING ERRCODE='EV409',MESSAGE='Identidade da inscrição é imutável.';
    END IF;
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  END IF;
  IF NEW.status IS NULL OR NEW.status COLLATE pg_catalog."C" NOT IN ('Confirmada','Cancelada') THEN
    RAISE EXCEPTION USING ERRCODE='EV400',MESSAGE='Status de inscrição inválido.';
  END IF;
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION USING ERRCODE='EV409',MESSAGE='Use READ COMMITTED para controlar vagas.';
  END IF;
  SELECT perfil::text INTO perfil_atual FROM public.usuarios WHERE id=NEW.usuario_id FOR UPDATE;
  IF perfil_atual IS DISTINCT FROM 'participante' OR EXISTS(
    SELECT 1 FROM public.contas_teste_imagens WHERE usuario_id=NEW.usuario_id AND estado<>'ativa') THEN
    RAISE EXCEPTION USING ERRCODE='EV403',MESSAGE='Participante indisponível.';
  END IF;
  SELECT * INTO e FROM public.eventos WHERE id=NEW.evento_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='IN409',MESSAGE='Evento indisponível para inscrição.'; END IF;
  IF TG_OP='INSERT' OR NEW.status COLLATE pg_catalog."C"='Confirmada' THEN
    IF e.status<>'Ativo' OR (e.data+e.horario) AT TIME ZONE 'America/Sao_Paulo'<=clock_timestamp() THEN
      RAISE EXCEPTION USING ERRCODE='IN409',MESSAGE='Evento indisponível para inscrição.';
    END IF;
  END IF;
  IF NEW.status COLLATE pg_catalog."C"='Confirmada' THEN
    IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM public.inscricoes WHERE evento_id=NEW.evento_id AND usuario_id=NEW.usuario_id) THEN
      RAISE EXCEPTION USING ERRCODE='DU409',MESSAGE='Você já está inscrito neste evento.';
    END IF;
    -- Consulta posterior ao lock, com snapshot novo de READ COMMITTED.
    IF e.capacidade_maxima IS NOT NULL AND
      (SELECT count(*) FROM public.inscricoes WHERE evento_id=NEW.evento_id AND status COLLATE pg_catalog."C"='Confirmada')>=e.capacidade_maxima THEN
      RAISE EXCEPTION USING ERRCODE='LT409',MESSAGE='Evento lotado. Não há vagas disponíveis.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER inscricoes_guardar_evento_v1 ON public.inscricoes;
CREATE TRIGGER inscricoes_guardar_evento_v1 BEFORE INSERT OR UPDATE ON public.inscricoes
 FOR EACH ROW EXECUTE FUNCTION public.inscricoes_guardar_evento_v1();
CREATE OR REPLACE FUNCTION public.gerir_evento_v1(p_acao text,p_usuario integer,p_evento integer DEFAULT NULL,
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
  IF p_dados ? 'capacidade_maxima' THEN
    IF p_dados->'capacidade_maxima'<>'null'::jsonb THEN
      IF jsonb_typeof(p_dados->'capacidade_maxima') IS DISTINCT FROM 'number' OR
         (p_dados->>'capacidade_maxima')!~'^[1-9][0-9]*$' THEN
        RAISE EXCEPTION USING ERRCODE='EV400',MESSAGE='Capacidade inválida.';
      END IF;
      IF (p_dados->>'capacidade_maxima')::numeric>2147483647 THEN
        RAISE EXCEPTION USING ERRCODE='EV400',MESSAGE='Capacidade inválida.';
      END IF;
    END IF;
    dados:=dados||jsonb_build_object('capacidade_maxima',p_dados->'capacidade_maxima');
  END IF;
  IF p_acao='criar' THEN
    IF p_chave IS NULL THEN RAISE EXCEPTION USING ERRCODE='EV400',MESSAGE='Chave obrigatória.'; END IF;
    SELECT * INTO e FROM public.eventos WHERE usuario_id=p_usuario AND criacao_chave=p_chave FOR UPDATE;
    IF FOUND THEN
      IF e.criacao_payload IS DISTINCT FROM dados THEN RAISE EXCEPTION USING ERRCODE='EV409',MESSAGE='Chave já utilizada com outros dados.'; END IF;
      RETURN to_jsonb(e)-'criacao_payload'-'criacao_chave';
    END IF;
    IF (v_data+v_horario) AT TIME ZONE 'America/Sao_Paulo'<=clock_timestamp() THEN RAISE EXCEPTION USING ERRCODE='EV400',MESSAGE='Início deve ser futuro.'; END IF;
    INSERT INTO public.eventos(nome,data,horario,local,categoria,publico,descricao,status,usuario_id,criacao_chave,criacao_payload,capacidade_maxima)
      VALUES(dados->>'nome',v_data,v_horario,dados->>'local',dados->>'categoria',(dados->>'publico')::integer,dados->>'descricao','Em planejamento',p_usuario,p_chave,dados,(dados->>'capacidade_maxima')::integer) RETURNING * INTO e;
  ELSE
    SELECT * INTO e FROM public.eventos WHERE id=p_evento AND usuario_id=p_usuario FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='EV404',MESSAGE='Evento não encontrado.'; END IF;
    IF p_versao IS NULL OR e.versao<>p_versao THEN RAISE EXCEPTION USING ERRCODE='EV409',MESSAGE='Versão divergente.'; END IF;
    IF p_acao='editar' THEN
      IF e.status='Ativo' THEN
        -- A UI envia todos os campos. Compare a representação normalizada,
        -- mas preserve literalmente os valores legados, inclusive NULL e segundos.
        IF dados-'descricao'-'capacidade_maxima' IS DISTINCT FROM jsonb_build_object('nome',btrim(e.nome),'data',to_char(e.data,'YYYY-MM-DD'),
          'horario',left(e.horario::text,5),'local',btrim(e.local),
          'categoria',COALESCE(NULLIF(btrim(e.categoria),''),'Corporativo'),'publico',e.publico) THEN
          RAISE EXCEPTION USING ERRCODE='EV409',MESSAGE='Evento publicado permite somente descrição.';
        END IF;
        UPDATE public.eventos SET descricao=dados->>'descricao',capacidade_maxima=CASE WHEN dados ? 'capacidade_maxima' THEN (dados->>'capacidade_maxima')::integer ELSE e.capacidade_maxima END WHERE id=e.id RETURNING * INTO e;
      ELSE
        IF (v_data+v_horario) AT TIME ZONE 'America/Sao_Paulo'<=clock_timestamp() THEN RAISE EXCEPTION USING ERRCODE='EV409',MESSAGE='Evento já iniciado.'; END IF;
        UPDATE public.eventos SET nome=dados->>'nome',data=v_data,horario=v_horario,local=dados->>'local',categoria=dados->>'categoria',
          capacidade_maxima=CASE WHEN dados ? 'capacidade_maxima' THEN (dados->>'capacidade_maxima')::integer ELSE e.capacidade_maxima END,publico=(dados->>'publico')::integer,descricao=dados->>'descricao' WHERE id=e.id RETURNING * INTO e;
      END IF;
    ELSIF p_acao='publicar' AND e.status='Em planejamento' THEN UPDATE public.eventos SET status='Ativo' WHERE id=e.id RETURNING * INTO e;
    ELSIF p_acao='cancelar' AND e.status IN ('Em planejamento','Ativo') THEN UPDATE public.eventos SET status='Cancelado' WHERE id=e.id RETURNING * INTO e;
    ELSIF p_acao='encerrar' AND e.status='Ativo' THEN UPDATE public.eventos SET status='Encerrado' WHERE id=e.id RETURNING * INTO e;
    ELSE RAISE EXCEPTION USING ERRCODE='EV409',MESSAGE='Transição inválida.'; END IF;
  END IF;
  RETURN to_jsonb(e)-'criacao_payload'-'criacao_chave';
END $$;


-- Uma consulta calcula capacidade, ocupação e saldo no mesmo snapshot.
CREATE FUNCTION public.eventos_vagas_v3(p_eventos integer[]) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT COALESCE(jsonb_agg(to_jsonb(v)),'[]'::jsonb) FROM (
 SELECT e.id,e.capacidade_maxima,count(i.id)::integer AS inscritos_confirmados,
 CASE WHEN e.capacidade_maxima IS NULL THEN NULL
 ELSE greatest(0,e.capacidade_maxima-count(i.id)::integer) END AS vagas_restantes,
 e.capacidade_maxima IS NOT NULL AND count(i.id)>=e.capacidade_maxima AS lotado
 FROM public.eventos e LEFT JOIN public.inscricoes i ON i.evento_id=e.id AND i.status COLLATE pg_catalog."C"='Confirmada'
 WHERE e.id=ANY(p_eventos) GROUP BY e.id) v
$$;
CREATE OR REPLACE FUNCTION public.eventos_capacidades_v1() RETURNS integer LANGUAGE sql STABLE
 SECURITY INVOKER SET search_path=pg_catalog AS $$ SELECT 3 $$;
REVOKE ALL ON FUNCTION public.eventos_vagas_v3(integer[]),public.eventos_vagas_guardar_v3() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.eventos_vagas_v3(integer[]),public.eventos_vagas_guardar_v3() TO service_role;
DO $$
DECLARE alvo regprocedure;
BEGIN
 FOREACH alvo IN ARRAY ARRAY['public.eventos_vagas_v3(integer[])'::regprocedure,'public.eventos_vagas_guardar_v3()'::regprocedure] LOOP
 IF has_function_privilege('anon',alvo,'EXECUTE') OR has_function_privilege('authenticated',alvo,'EXECUTE') OR
 has_function_privilege('service_role',alvo,'EXECUTE WITH GRANT OPTION') OR EXISTS(
 SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid=alvo
 AND a.grantee NOT IN(p.proowner,(SELECT oid FROM pg_roles WHERE rolname='service_role'))
 AND NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.oid=a.grantee AND r.rolsuper)) THEN
 RAISE EXCEPTION 'Grant inesperado em função nova.'; END IF;
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
