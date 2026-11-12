-- A10.1: proposta manual, uma aplicação. Não executar remotamente sem autorização.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF to_regclass('public.admin_perfis_auditoria') IS NOT NULL OR
    to_regprocedure('public.alterar_perfil_admin_v1(integer,integer,text,text,text,uuid)') IS NOT NULL THEN
   RAISE EXCEPTION 'Objetos existentes: comparar definições, não reaplicar.';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls AND NOT rolsuper) THEN
   RAISE EXCEPTION 'service_role incompatível.';
 END IF;
END $$;
CREATE TABLE public.admin_perfis_auditoria(
 admin_id integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
 chave uuid NOT NULL,
 usuario_id integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
 perfil_anterior text NOT NULL CHECK(perfil_anterior IN ('participante','organizador','fornecedor','admin')),
 perfil_novo text NOT NULL CHECK(perfil_novo IN ('participante','organizador','fornecedor','admin')),
 motivo text NOT NULL CHECK(length(btrim(motivo)) BETWEEN 10 AND 1000),
 criado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(admin_id,chave), CHECK(perfil_anterior<>perfil_novo)
);
ALTER TABLE public.admin_perfis_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_perfis_auditoria FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_perfis_auditoria FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.admin_perfis_auditoria TO service_role;
CREATE FUNCTION public.admin_perfis_capacidades_v1() RETURNS integer
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$ SELECT 1 $$;
CREATE FUNCTION public.alterar_perfil_admin_v1(p_admin integer,p_usuario integer,p_anterior text,p_novo text,p_motivo text,p_chave uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE atual text; registro public.admin_perfis_auditoria%ROWTYPE;
BEGIN
 SET LOCAL lock_timeout='2s';
 IF current_setting('transaction_isolation')<>'read committed' THEN
   RAISE EXCEPTION USING ERRCODE='AP409',MESSAGE='Isolamento incompatível.';
 END IF;
 IF p_admin IS NULL OR p_admin<=0 OR p_usuario IS NULL OR p_usuario<=0 OR p_chave IS NULL
   OR substring(p_chave::text,15,1)<>'4' OR substring(p_chave::text,20,1) NOT IN ('8','9','a','b')
   OR p_anterior IS NULL OR p_novo IS NULL OR p_anterior NOT IN ('participante','organizador','fornecedor','admin')
   OR p_novo NOT IN ('participante','organizador','fornecedor','admin') OR p_anterior=p_novo
   OR p_motivo IS NULL OR length(btrim(p_motivo)) NOT BETWEEN 10 AND 1000 OR p_motivo ~ '[[:cntrl:]]' THEN
   RAISE EXCEPTION USING ERRCODE='AP400',MESSAGE='Dados inválidos.';
 END IF;
 -- Bloqueia DML concorrente em usuários antes de ler perfis; não altera dados de negócio.
 -- Também serializa aprovações antigas que fazem UPDATE de usuarios.perfil.
 LOCK TABLE public.usuarios IN SHARE ROW EXCLUSIVE MODE;
 LOCK TABLE public.contas_teste_imagens IN SHARE MODE;
 IF NOT EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id=p_admin AND u.perfil::text='admin')
   OR EXISTS(SELECT 1 FROM public.contas_teste_imagens WHERE usuario_id=p_admin AND estado<>'ativa') THEN
   RAISE EXCEPTION USING ERRCODE='AP403',MESSAGE='Administrador indisponível.';
 END IF;
 SELECT * INTO registro FROM public.admin_perfis_auditoria WHERE admin_id=p_admin AND chave=p_chave;
 IF FOUND THEN
   IF ROW(registro.usuario_id,registro.perfil_anterior,registro.perfil_novo,registro.motivo)
     IS DISTINCT FROM ROW(p_usuario,p_anterior,p_novo,btrim(p_motivo)) THEN
     RAISE EXCEPTION USING ERRCODE='AP409',MESSAGE='Chave utilizada com outros dados.';
   END IF;
   RETURN jsonb_build_object('id',registro.usuario_id,'perfil',registro.perfil_novo,'confirmado',true);
 END IF;
 SELECT perfil::text INTO atual FROM public.usuarios WHERE id=p_usuario FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='AP404',MESSAGE='Usuário ausente.'; END IF;
 IF atual<>p_anterior THEN RAISE EXCEPTION USING ERRCODE='AP409',MESSAGE='Perfil alterado; atualizar consulta.'; END IF;
 IF EXISTS(SELECT 1 FROM public.contas_teste_imagens WHERE usuario_id=p_usuario AND estado<>'ativa') THEN
   RAISE EXCEPTION USING ERRCODE='AP409',MESSAGE='Conta em encerramento.';
 END IF;
 IF atual='admin' AND p_novo<>'admin' AND NOT EXISTS(
   SELECT 1 FROM public.usuarios u WHERE u.id<>p_usuario AND u.perfil::text='admin'
   AND NOT EXISTS(SELECT 1 FROM public.contas_teste_imagens c WHERE c.usuario_id=u.id AND c.estado<>'ativa')) THEN
   RAISE EXCEPTION USING ERRCODE='AP412',MESSAGE='Último administrador autorizado.';
 END IF;
 IF p_usuario=p_admin AND p_novo<>'admin' THEN
   RAISE EXCEPTION USING ERRCODE='AP413',MESSAGE='Não remova seu próprio acesso administrativo.';
 END IF;
 UPDATE public.usuarios SET perfil=p_novo::public.usuarios_perfil_enum WHERE id=p_usuario;
 INSERT INTO public.admin_perfis_auditoria(admin_id,chave,usuario_id,perfil_anterior,perfil_novo,motivo)
 VALUES(p_admin,p_chave,p_usuario,atual,p_novo,btrim(p_motivo));
 RETURN jsonb_build_object('id',p_usuario,'perfil',p_novo,'confirmado',true);
END $$;
REVOKE ALL ON FUNCTION public.admin_perfis_capacidades_v1(),public.alterar_perfil_admin_v1(integer,integer,text,text,text,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_perfis_capacidades_v1(),public.alterar_perfil_admin_v1(integer,integer,text,text,text,uuid) TO service_role;
DO $$ DECLARE f regprocedure; BEGIN
 IF has_table_privilege('anon','public.admin_perfis_auditoria','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 OR has_table_privilege('authenticated','public.admin_perfis_auditoria','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 OR has_table_privilege('service_role','public.admin_perfis_auditoria','UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION') THEN
   RAISE EXCEPTION 'Privilégios inesperados na auditoria.';
 END IF;
 IF current_setting('server_version_num')::integer>=170000 AND
   has_table_privilege('service_role','public.admin_perfis_auditoria','MAINTAIN') THEN RAISE EXCEPTION 'MAINTAIN inesperado.'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
   WHERE c.oid='public.admin_perfis_auditoria'::regclass AND a.grantee NOT IN(c.relowner,(SELECT oid FROM pg_roles WHERE rolname='service_role'))
   AND NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.oid=a.grantee AND r.rolsuper)) THEN RAISE EXCEPTION 'Beneficiário inesperado.'; END IF;
 FOREACH f IN ARRAY ARRAY['public.admin_perfis_capacidades_v1()'::regprocedure,'public.alterar_perfil_admin_v1(integer,integer,text,text,text,uuid)'::regprocedure] LOOP
   IF has_function_privilege('anon',f,'EXECUTE') OR has_function_privilege('authenticated',f,'EXECUTE')
   OR has_function_privilege('service_role',f,'EXECUTE WITH GRANT OPTION') OR EXISTS(
     SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid=f
     AND a.grantee NOT IN(p.proowner,(SELECT oid FROM pg_roles WHERE rolname='service_role'))
     AND NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.oid=a.grantee AND r.rolsuper)) THEN RAISE EXCEPTION 'RPC exposta.'; END IF;
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
