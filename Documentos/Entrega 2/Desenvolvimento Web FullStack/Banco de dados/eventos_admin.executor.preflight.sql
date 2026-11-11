-- A7.10 / PROPOSTA MANUAL, NÃO EXECUTADA. Não é migração.
-- Somente catálogos/funções nativas pg_catalog. Sem SET ROLE, DDL ou objetos teste.
-- Executar futuramente com autorização e saída restrita, na identidade pretendida.
-- postgres é candidato; supabase_admin é apenas inventariado, não recomendado.

-- E01 Identidade efetiva e candidatos presentes; comparar a conexão pretendida.
SELECT session_user AS identidade_conexao,current_user AS executor_efetivo,
 pg_catalog.current_setting('server_version_num') AS versao;
SELECT r.rolname,r.rolcanlogin,r.rolsuper,r.rolcreaterole,r.rolcreatedb,
 r.rolinherit,r.rolbypassrls
FROM pg_catalog.pg_roles r
WHERE r.rolname IN ('postgres','supabase_admin','service_role',current_user)
ORDER BY r.rolname;

-- E02 Schema e capacidade de criar os objetos NOVOS nele, não de criar database.
SELECT r.rolname,n.nspname,pg_catalog.pg_get_userbyid(n.nspowner) AS owner_schema,
 pg_catalog.has_schema_privilege(r.oid,n.oid,'USAGE') AS uso,
 pg_catalog.has_schema_privilege(r.oid,n.oid,'CREATE') AS criar,
 pg_catalog.has_schema_privilege(r.oid,n.oid,'CREATE WITH GRANT OPTION') AS conceder_create,
 pg_catalog.has_database_privilege(r.oid,pg_catalog.current_database(),'CONNECT') AS conectar
FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_namespace n
WHERE n.nspname='public' AND r.rolname IN ('postgres','supabase_admin','service_role',current_user);

-- E03 REFERENCES da tabela/coluna id para as FKs novas, leitura e ownership.
-- Ausência de usuarios/eventos/coluna id deve ser interpretada como bloqueio.
SELECT r.rolname,c.relname AS tabela,pg_catalog.pg_get_userbyid(c.relowner) AS owner_tabela,
 a.attname AS coluna,pg_catalog.has_table_privilege(r.oid,c.oid,'REFERENCES') AS references_tabela,
 pg_catalog.has_column_privilege(r.oid,c.oid,a.attnum,'REFERENCES') AS references_coluna,
 pg_catalog.has_table_privilege(r.oid,c.oid,'SELECT') AS leitura,
 pg_catalog.has_table_privilege(r.oid,c.oid,'REFERENCES WITH GRANT OPTION') AS conceder_references,
 pg_catalog.pg_has_role(r.oid,c.relowner,'USAGE') AS privilegios_do_owner
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attname='id' AND NOT a.attisdropped
CROSS JOIN pg_catalog.pg_roles r
WHERE n.nspname='public' AND c.relname IN ('usuarios','eventos')
 AND r.rolname IN ('postgres','supabase_admin','service_role',current_user)
ORDER BY r.rolname,c.relname;

-- E04 A migração chama capacidades existentes: EXECUTE não implica propriedade/DDL.
SELECT r.rolname,p.oid::pg_catalog.regprocedure AS funcao,
 pg_catalog.pg_get_userbyid(p.proowner) AS owner_funcao,
 pg_catalog.has_function_privilege(r.oid,p.oid,'EXECUTE') AS executar,
 pg_catalog.has_function_privilege(r.oid,p.oid,'EXECUTE WITH GRANT OPTION') AS conceder_execucao,
 pg_catalog.pg_has_role(r.oid,p.proowner,'USAGE') AS privilegios_do_owner
FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
CROSS JOIN pg_catalog.pg_roles r
WHERE n.nspname='public' AND p.proname IN ('eventos_capacidades_v1','gerir_evento_v1',
 'criar_evento_admin_v1','admin_eventos_capacidades_v1')
 AND r.rolname IN ('postgres','supabase_admin','service_role',current_user)
ORDER BY r.rolname,p.oid;

-- E05 ACLs default do CRIADOR; null schema representa defaults globais.
-- Defaults do owner herdado não substituem os defaults do papel criador.
SELECT pg_catalog.pg_get_userbyid(d.defaclrole) AS criador,n.nspname AS schema,
 d.defaclobjtype,
 CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END AS beneficiario,
 a.privilege_type,a.is_grantable
FROM pg_catalog.pg_default_acl d LEFT JOIN pg_catalog.pg_namespace n ON n.oid=d.defaclnamespace
CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) a
WHERE (d.defaclnamespace=0 OR n.nspname='public')
 AND d.defaclrole IN (SELECT oid FROM pg_catalog.pg_roles
 WHERE rolname IN ('postgres','supabase_admin',current_user))
ORDER BY criador,schema,d.defaclobjtype,beneficiario;

-- E06 Heranças transitivas, disponibilidade e ADMIN OPTION nas arestas.
WITH RECURSIVE origem AS (
 SELECT oid,rolname FROM pg_catalog.pg_roles
 WHERE rolname IN ('postgres','supabase_admin','service_role','anon','authenticated',current_user)
), caminho(origem,papel) AS (
 SELECT oid,oid FROM origem UNION
 SELECT c.origem,m.roleid FROM caminho c JOIN pg_catalog.pg_auth_members m ON m.member=c.papel
)
SELECT o.rolname AS origem,r.rolname AS papel,
 pg_catalog.pg_has_role(o.oid,r.oid,'USAGE') AS disponivel_sem_set_role,
 r.rolsuper,r.rolbypassrls
FROM caminho c JOIN origem o ON o.oid=c.origem JOIN pg_catalog.pg_roles r ON r.oid=c.papel
ORDER BY o.rolname,r.rolname;
SELECT pg_catalog.pg_get_userbyid(m.member) AS membro,
 pg_catalog.pg_get_userbyid(m.roleid) AS papel,m.admin_option
FROM pg_catalog.pg_auth_members m
WHERE m.member IN (SELECT oid FROM pg_catalog.pg_roles
 WHERE rolname IN ('postgres','supabase_admin','service_role','anon','authenticated',current_user));

-- E07 Linguagens e tipos usados na criação; não invoca funções da aplicação.
SELECT r.rolname,l.lanname,pg_catalog.has_language_privilege(r.oid,l.oid,'USAGE') AS uso
FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_language l
WHERE l.lanname IN ('sql','plpgsql') AND r.rolname IN ('postgres','supabase_admin',current_user);
SELECT r.rolname,t.typname,pg_catalog.has_type_privilege(r.oid,t.oid,'USAGE') AS uso
FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_type t
JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
WHERE n.nspname='pg_catalog' AND t.typname IN ('int4','uuid','jsonb','bytea','timestamptz')
 AND r.rolname IN ('postgres','supabase_admin',current_user);

-- E08 Colisões de nomes, inclusive relações de tipo inesperado e overloads.
SELECT n.nspname,c.relname,c.relkind,pg_catalog.pg_get_userbyid(c.relowner) AS proprietario
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname='eventos_criacao_admin';
SELECT p.oid::pg_catalog.regprocedure AS funcao,pg_catalog.pg_get_userbyid(p.proowner) AS proprietario
FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('criar_evento_admin_v1','admin_eventos_capacidades_v1');

-- E09 Event triggers podem interferir em DDL; ler definições não os executa.
SELECT e.evtname,e.evtevent,e.evtenabled,e.evttags,
 pg_catalog.pg_get_userbyid(e.evtowner) AS proprietario,
 e.evtfoid::pg_catalog.regprocedure AS funcao,
 pg_catalog.pg_get_functiondef(e.evtfoid) AS definicao
FROM pg_catalog.pg_event_trigger e ORDER BY e.evtname;

-- Limite: não comprova CREATE/GRANT/REVOKE executados nem restrições do provedor.
-- Objetos novos serão do criador efetivo, salvo efeitos externos a revisar.
-- Não invoca a RPC de capacidades: comparar sua definição pelo preflight A7.7.
