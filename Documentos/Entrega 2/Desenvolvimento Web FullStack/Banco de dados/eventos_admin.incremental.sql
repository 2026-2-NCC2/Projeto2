-- PROPOSTA MANUAL. Revisar e autorizar antes de aplicar. Não executar pela aplicação.
-- Reutiliza gerir_evento_v1 sem substituir a função ou alterar registros existentes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$
BEGIN
  IF to_regclass('public.eventos_criacao_admin') IS NOT NULL
    OR to_regprocedure('public.criar_evento_admin_v1(integer,integer,jsonb,uuid)') IS NOT NULL
    OR to_regprocedure('public.admin_eventos_capacidades_v1()') IS NOT NULL THEN
    RAISE EXCEPTION 'Estruturas já existem; comparar definições, não reaplicar.';
  END IF;
  IF to_regprocedure('public.gerir_evento_v1(text,integer,integer,jsonb,integer,uuid)') IS NULL
    OR to_regprocedure('public.eventos_capacidades_v1()') IS NULL THEN
    RAISE EXCEPTION 'Gestão segura de eventos ausente.';
  END IF;
  IF public.eventos_capacidades_v1() NOT IN (1,3) THEN RAISE EXCEPTION 'Versão de gestão não revisada.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls AND NOT rolsuper)
    OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated') AND (rolbypassrls OR rolsuper)) THEN
    RAISE EXCEPTION 'Papéis incompatíveis.';
  END IF;
END $$;

CREATE TABLE public.eventos_criacao_admin (
  admin_id integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  chave uuid NOT NULL,
  organizador_id integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  evento_id integer NOT NULL UNIQUE REFERENCES public.eventos(id) ON DELETE RESTRICT,
  criado_em timestamptz NOT NULL DEFAULT now(),
  assinatura bytea NOT NULL CHECK(octet_length(assinatura)=32),
  PRIMARY KEY(admin_id,chave),
  CHECK(admin_id<>organizador_id),
  CHECK(substring(chave::text,15,1)='4' AND substring(chave::text,20,1) IN ('8','9','a','b'))
);
ALTER TABLE public.eventos_criacao_admin ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eventos_criacao_admin FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.eventos_criacao_admin FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.eventos_criacao_admin TO service_role;

CREATE FUNCTION public.admin_eventos_capacidades_v1()
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog AS $$
  SELECT jsonb_build_object('versao',1,'controleCapacidade',public.eventos_capacidades_v1()=3)
$$;

CREATE FUNCTION public.criar_evento_admin_v1(p_admin integer,p_organizador integer,p_dados jsonb,p_chave uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE anterior public.eventos_criacao_admin%ROWTYPE; evento jsonb; assinatura_atual bytea;
BEGIN
  SET LOCAL lock_timeout='2s';
  IF p_admin IS NULL OR p_organizador IS NULL OR p_admin=p_organizador OR p_chave IS NULL
    OR substring(p_chave::text,15,1)<>'4' OR substring(p_chave::text,20,1) NOT IN ('8','9','a','b')
    OR jsonb_typeof(p_dados) IS DISTINCT FROM 'object'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_dados) k WHERE k NOT IN
      ('nome','data','horario','local','categoria','publico','descricao','capacidade_maxima')) THEN
    RAISE EXCEPTION USING ERRCODE='EV400',MESSAGE='Argumentos inválidos.';
  END IF;
  -- Ordem estável; trava de ambos os usuários preservada até o commit.
  PERFORM id FROM public.usuarios WHERE id IN(p_admin,p_organizador) ORDER BY id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=p_admin AND perfil::text='admin') THEN
    RAISE EXCEPTION USING ERRCODE='EV403',MESSAGE='Administrador indisponível.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=p_organizador AND perfil::text='organizador') THEN
    RAISE EXCEPTION USING ERRCODE='EV403',MESSAGE='Organizador indisponível.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.contas_teste_imagens WHERE usuario_id IN(p_admin,p_organizador) AND estado<>'ativa') THEN
    RAISE EXCEPTION USING ERRCODE='EV403',MESSAGE='Conta em encerramento.';
  END IF;
  assinatura_atual:=sha256(convert_to(jsonb_build_object('organizador_id',p_organizador,'dados',p_dados)::text,'UTF8'));
  SELECT * INTO anterior FROM public.eventos_criacao_admin WHERE admin_id=p_admin AND chave=p_chave;
  IF FOUND THEN
    IF anterior.organizador_id<>p_organizador OR anterior.assinatura<>assinatura_atual THEN
      RAISE EXCEPTION USING ERRCODE='EV409',MESSAGE='Chave já utilizada com outros dados.';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.eventos WHERE id=anterior.evento_id AND usuario_id=p_organizador) THEN
      RAISE EXCEPTION USING ERRCODE='EV409',MESSAGE='Vínculo do evento divergente.';
    END IF;
    RETURN jsonb_build_object('id',anterior.evento_id,'usuario_id',p_organizador,'admin_criador_id',p_admin);
  END IF;
  -- Validações, capacidade, futuro e estado inicial são os da RPC já aprovada.
  -- Chave interna independente evita atribuir ao admin uma criação do Organizador.
  evento:=public.gerir_evento_v1('criar',p_organizador,NULL,p_dados,NULL,gen_random_uuid());
  IF (evento->>'usuario_id')::integer IS DISTINCT FROM p_organizador OR evento->>'status' IS DISTINCT FROM 'Em planejamento' THEN
    RAISE EXCEPTION USING ERRCODE='EV409',MESSAGE='Criação não confirmada.';
  END IF;
  INSERT INTO public.eventos_criacao_admin(admin_id,chave,organizador_id,evento_id,assinatura)
    VALUES(p_admin,p_chave,p_organizador,(evento->>'id')::integer,assinatura_atual);
  RETURN jsonb_build_object('id',(evento->>'id')::integer,'usuario_id',p_organizador,'admin_criador_id',p_admin);
END $$;
REVOKE ALL ON FUNCTION public.admin_eventos_capacidades_v1(),public.criar_evento_admin_v1(integer,integer,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_eventos_capacidades_v1(),public.criar_evento_admin_v1(integer,integer,jsonb,uuid) TO service_role;

DO $$
DECLARE alvo regclass:='public.eventos_criacao_admin'; privs text:='SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER';
  extras text:='UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'; f regprocedure;
BEGIN
  IF current_setting('server_version_num')::integer NOT BETWEEN 150000 AND 189999 THEN RAISE EXCEPTION 'Versão não revisada.'; END IF;
  IF current_setting('server_version_num')::integer>=170000 THEN privs:=privs||',MAINTAIN'; extras:=extras||',MAINTAIN'; END IF;
  IF has_table_privilege('anon',alvo,privs) OR has_table_privilege('authenticated',alvo,privs)
    OR NOT has_table_privilege('service_role',alvo,'SELECT') OR NOT has_table_privilege('service_role',alvo,'INSERT')
    OR has_table_privilege('service_role',alvo,extras||',SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION')
    OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.oid=alvo
      AND a.grantee NOT IN(c.relowner,(SELECT oid FROM pg_roles WHERE rolname='service_role'))
      AND NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.oid=a.grantee AND r.rolsuper)) THEN
    RAISE EXCEPTION 'Privilégios inesperados na auditoria. Nenhum default global foi alterado.';
  END IF;
  FOREACH f IN ARRAY ARRAY['public.admin_eventos_capacidades_v1()'::regprocedure,'public.criar_evento_admin_v1(integer,integer,jsonb,uuid)'::regprocedure] LOOP
    IF has_function_privilege('anon',f,'EXECUTE') OR has_function_privilege('authenticated',f,'EXECUTE')
      OR NOT has_function_privilege('service_role',f,'EXECUTE') OR has_function_privilege('service_role',f,'EXECUTE WITH GRANT OPTION')
      OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid=f
        AND a.grantee NOT IN(p.proowner,(SELECT oid FROM pg_roles WHERE rolname='service_role'))
        AND NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.oid=a.grantee AND r.rolsuper)) THEN
      RAISE EXCEPTION 'Privilégios inesperados nas funções novas.';
    END IF;
  END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
