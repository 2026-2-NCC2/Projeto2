-- SOMENTE LEITURA, depois de aplicação expressamente autorizada.
BEGIN READ ONLY;
SELECT (SELECT count(*) FROM public.usuarios) AS usuarios,
 (SELECT count(*) FROM public.termos_aceites) AS aceites,
 (SELECT count(*) FROM public.termos_documentos WHERE ativo) AS documentos_ativos;
SELECT documento_id,versao,hash,ativo,aprovado_em FROM public.termos_documentos;
SELECT relname,relrowsecurity,relforcerowsecurity,relacl FROM pg_class
 WHERE oid IN('public.termos_documentos'::regclass,'public.termos_aceites'::regclass);
SELECT p.oid::regprocedure,p.proowner::regrole AS proprietario,p.prosecdef,p.proconfig,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated,
 has_function_privilege('service_role',p.oid,'EXECUTE') AS service_role
 FROM pg_proc p WHERE p.oid IN ('public.cadastrar_usuario_termos_v1(text,text,text,text,text,text)'::regprocedure,'public.termos_publicacao_bloquear_v1(text,text,text)'::regprocedure);
SELECT md5(COALESCE(jsonb_agg(to_jsonb(u) ORDER BY u.id),'[]'::jsonb)::text) AS hash_usuarios FROM public.usuarios u;
SELECT conrelid::regclass,conname,convalidated,pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid IN('public.termos_documentos'::regclass,'public.termos_aceites'::regclass);
SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN('termos_documentos','termos_aceites');
SELECT r.rolname,c.relname,has_table_privilege(r.oid,c.oid,'SELECT') AS leitura,
 has_table_privilege(r.oid,c.oid,'INSERT') AS inserir,has_table_privilege(r.oid,c.oid,'UPDATE') AS editar,
 has_table_privilege(r.oid,c.oid,'DELETE') AS excluir FROM pg_roles r CROSS JOIN pg_class c
 WHERE r.rolname IN('anon','authenticated','service_role') AND c.oid IN('public.termos_documentos'::regclass,'public.termos_aceites'::regclass);
COMMIT;
