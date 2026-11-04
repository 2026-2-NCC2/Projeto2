-- MANUAL / SOMENTE LEITURA. Executar no projeto correto, antes da aplicação.
-- Não confirma o project ref; conferir a identidade do projeto no Dashboard.
BEGIN READ ONLY;
SET LOCAL statement_timeout='15s';
SELECT current_user AS executor, current_setting('server_version') AS versao,
       has_schema_privilege(current_user,'public','CREATE') AS pode_criar,
       to_regclass('public.portfolio_itens') AS tabela_deve_ser_null;
SELECT column_name,data_type,is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='usuarios' AND column_name='id';
SELECT conname,pg_get_constraintdef(oid) AS definicao
FROM pg_constraint WHERE conrelid=to_regclass('public.usuarios') AND contype IN ('p','u');
SELECT rolname,rolsuper,rolbypassrls,rolinherit
FROM pg_roles WHERE rolname IN ('service_role','anon','authenticated',current_user);
-- Defaults globais e de public: a migração revoga os grants diretos nas novas
-- tabelas; privilégios herdados ou terceiros inesperados provocam erro.
SELECT d.defaclrole::regrole AS proprietario,
       d.defaclnamespace AS esquema_oid,n.nspname AS esquema,
       d.defaclobjtype,d.defaclacl
FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
WHERE d.defaclobjtype='r' AND (d.defaclnamespace=0 OR n.nspname='public');
SELECT r.rolname AS papel,m.rolname AS papel_do_qual_e_membro,m.rolsuper,m.rolbypassrls
FROM pg_roles r CROSS JOIN pg_roles m
WHERE r.rolname IN ('anon','authenticated','service_role') AND r.oid<>m.oid
  AND pg_has_role(r.oid,m.oid,'MEMBER')
ORDER BY r.rolname,m.rolname;
ROLLBACK;
