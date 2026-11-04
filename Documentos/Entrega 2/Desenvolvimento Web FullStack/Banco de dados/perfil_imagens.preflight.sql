-- MANUAL / SOMENTE LEITURA. Não é executado pela aplicação.
-- Rodar no SQL Editor com papel autorizado antes e depois da migração.
BEGIN READ ONLY;
SELECT current_user AS executor,
       has_schema_privilege(current_user, 'public', 'CREATE') AS pode_criar_tabelas;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'usuarios' AND column_name IN ('id', 'perfil');
SELECT conname, pg_get_constraintdef(oid) AS definicao
FROM pg_constraint WHERE conrelid = 'public.usuarios'::regclass AND contype IN ('p', 'u');
SELECT count(*) AS usuarios_existentes FROM public.usuarios;
SELECT perfil, count(*) FROM public.usuarios GROUP BY perfil;
SELECT to_regclass('public.perfil_imagens') AS referencias,
       to_regclass('public.perfil_imagens_objetos') AS diario;

-- Deve retornar ambos privados APÓS a criação MANUAL no Dashboard.
-- Antes disso, zero linhas é esperado. Nenhum bucket é criado neste script.
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets WHERE id IN ('perfil-fotos', 'perfil-capas');
-- Revisar TODAS as políticas: uma regra ampla pode autorizar os novos buckets.
SELECT schemaname, tablename, policyname, roles, cmd, permissive, qual, with_check
FROM pg_policies
WHERE (schemaname = 'storage' AND tablename IN ('objects', 'buckets'))
   OR (schemaname = 'public' AND tablename IN ('perfil_imagens', 'perfil_imagens_objetos'));
SELECT n.nspname AS esquema, c.relname AS tabela, c.relrowsecurity AS rls,
       c.relforcerowsecurity AS force_rls
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('perfil_imagens', 'perfil_imagens_objetos');
-- Conferir grants herdados e default privileges; anon/authenticated não devem
-- acessar as tabelas novas. service_role é exclusivo do servidor.
SELECT table_schema, table_name, grantee, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public' AND table_name IN ('perfil_imagens', 'perfil_imagens_objetos');
SELECT defaclrole::regrole AS papel, defaclnamespace::regnamespace AS esquema,
       defaclobjtype, defaclacl FROM pg_default_acl;
-- FORCE RLS não bloqueia BYPASSRLS; confirmar o atributo efetivo do papel.
SELECT rolname, rolsuper, rolbypassrls, rolinherit FROM pg_roles
WHERE rolname IN ('service_role', 'anon', 'authenticated');
SELECT membro.rolname AS membro, concedido.rolname AS papel_herdado
FROM pg_auth_members m
JOIN pg_roles membro ON membro.oid = m.member
JOIN pg_roles concedido ON concedido.oid = m.roleid;
-- has_table_privilege considera privilégios efetivos, inclusive herança.
SELECT r.rolname, c.oid::regclass AS tabela,
       has_table_privilege(r.oid, c.oid, 'SELECT') AS leitura,
       has_table_privilege(r.oid, c.oid, 'INSERT, UPDATE, DELETE') AS escrita,
       has_table_privilege(r.oid, c.oid, 'TRUNCATE, REFERENCES, TRIGGER') AS outros
FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE r.rolname IN ('service_role', 'anon', 'authenticated')
  AND n.nspname = 'public' AND c.relname IN ('perfil_imagens', 'perfil_imagens_objetos');
COMMIT;
