-- A7.7 / MANUAL. Não executar automaticamente. Não é a migração.
-- Somente catálogos pg_catalog; sem linhas de negócio nem chamadas a RPCs.
-- Não contém BEGIN/SET/DDL/DML. READ ONLY deve ser imposto externamente,
-- se desejado. Parar no primeiro erro. Resultados devem ter acesso restrito.

-- Q01 Ambiente da sessão; não identifica sozinho o projeto Supabase.
SELECT pg_catalog.current_setting('server_version_num') AS versao,
 pg_catalog.current_schema() AS schema_sessao,pg_catalog.current_schemas(false) AS schemas,
 pg_catalog.current_setting('transaction_isolation') AS isolamento,
 pg_catalog.current_setting('default_transaction_isolation') AS isolamento_padrao,
 pg_catalog.current_setting('statement_timeout') AS statement_timeout,
 pg_catalog.current_setting('lock_timeout') AS lock_timeout,
 pg_catalog.current_setting('idle_in_transaction_session_timeout') AS idle_timeout,
 pg_catalog.current_setting('transaction_timeout',true) AS transaction_timeout;

-- Q02 Presença, tipo, owner, RLS e estimativa (não contagem) de linhas.
WITH nomes(nome) AS (VALUES ('usuarios'),('eventos'),('inscricoes'),
 ('contas_teste_imagens'),('eventos_criacao_admin'))
SELECT nomes.nome AS tabela,n.nspname AS schema,c.oid IS NOT NULL AS presente,
 c.relkind,pg_catalog.pg_get_userbyid(c.relowner) AS proprietario,
 c.relrowsecurity,c.relforcerowsecurity,c.reltuples AS estimativa_linhas
FROM nomes LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
LEFT JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid AND c.relname=nomes.nome
ORDER BY nomes.nome;

-- Q03 Colunas, tipos, nulabilidade, identity e defaults; sem ler valores.
SELECT c.relname AS tabela,a.attname AS coluna,
 pg_catalog.format_type(a.atttypid,a.atttypmod) AS tipo,a.attnotnull,
 a.attidentity,a.attgenerated,pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS padrao
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
WHERE n.nspname='public' AND c.relname IN
 ('usuarios','eventos','inscricoes','contas_teste_imagens','eventos_criacao_admin')
ORDER BY c.relname,a.attnum;

-- Q04 Constraints das dependências e FKs de entrada: integridade e retenção.
SELECT n.nspname AS schema,c.relname AS tabela,k.conname,k.contype,
 k.convalidated,k.condeferrable,k.condeferred,
 pg_catalog.pg_get_constraintdef(k.oid,true) AS definicao
FROM pg_catalog.pg_constraint k JOIN pg_catalog.pg_class c ON c.oid=k.conrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE (n.nspname='public' AND c.relname IN
 ('usuarios','eventos','inscricoes','contas_teste_imagens','eventos_criacao_admin'))
 OR k.confrelid IN (SELECT x.oid FROM pg_catalog.pg_class x
 JOIN pg_catalog.pg_namespace nx ON nx.oid=x.relnamespace
 WHERE nx.nspname='public' AND x.relname IN ('usuarios','eventos','eventos_criacao_admin'))
ORDER BY n.nspname,c.relname,k.conname;

-- Q05 Índices: unicidade, validade, predicados e colunas.
SELECT c.relname AS tabela,i.relname AS indice,x.indisunique,x.indisprimary,
 x.indisvalid,x.indisready,pg_catalog.pg_get_indexdef(i.oid) AS definicao
FROM pg_catalog.pg_index x JOIN pg_catalog.pg_class c ON c.oid=x.indrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
JOIN pg_catalog.pg_class i ON i.oid=x.indexrelid
WHERE n.nspname='public' AND c.relname IN
 ('usuarios','eventos','inscricoes','contas_teste_imagens','eventos_criacao_admin')
ORDER BY c.relname,i.relname;

-- Q06 Triggers não internos e sua função direta, sem executá-los.
SELECT c.relname AS tabela,t.tgname,t.tgenabled,
 pg_catalog.pg_get_triggerdef(t.oid,true) AS trigger_def,
 p.oid::pg_catalog.regprocedure AS funcao,p.prosecdef,p.proconfig,
 pg_catalog.pg_get_functiondef(p.oid) AS funcao_def
FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
WHERE NOT t.tgisinternal AND n.nspname='public' AND c.relname IN
 ('usuarios','eventos','inscricoes','contas_teste_imagens','eventos_criacao_admin')
ORDER BY c.relname,t.tgname;

-- Q07 Assinaturas exatas, inclusive ausências. Não chama capacidades.
WITH esperadas(assinatura) AS (VALUES
 ('public.gerir_evento_v1(text,integer,integer,jsonb,integer,uuid)'),
 ('public.eventos_capacidades_v1()'),('public.eventos_vagas_v3(integer[])'),
 ('public.inscrever_evento_v1(integer,integer)'),
 ('public.criar_evento_admin_v1(integer,integer,jsonb,uuid)'),
 ('public.admin_eventos_capacidades_v1()'))
SELECT assinatura,pg_catalog.to_regprocedure(assinatura) IS NOT NULL AS presente FROM esperadas;

-- Q08 Definições/overloads/owner/INVOKER/search_path; comparar com SQL versionado.
SELECT p.oid::pg_catalog.regprocedure AS funcao,
 pg_catalog.pg_get_userbyid(p.proowner) AS proprietario,l.lanname,
 p.prosecdef,p.provolatile,p.proconfig,pg_catalog.pg_get_functiondef(p.oid) AS definicao
FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
JOIN pg_catalog.pg_language l ON l.oid=p.prolang
WHERE n.nspname='public' AND p.prokind='f' AND p.proname IN
 ('gerir_evento_v1','eventos_capacidades_v1','eventos_vagas_v3','inscrever_evento_v1',
 'eventos_guardar_v1','inscricoes_guardar_evento_v1','eventos_vagas_guardar_v3',
 'criar_evento_admin_v1','admin_eventos_capacidades_v1') ORDER BY p.proname,p.oid;

-- Q09 Sequences OWNED BY/identity; sem last_value/nextval/setval.
SELECT c.relname AS tabela,a.attname AS coluna,ns.nspname AS schema_sequence,
 s.relname AS sequence,pg_catalog.pg_get_userbyid(s.relowner) AS proprietario,d.deptype
FROM pg_catalog.pg_class s JOIN pg_catalog.pg_namespace ns ON ns.oid=s.relnamespace
JOIN pg_catalog.pg_depend d ON d.classid='pg_catalog.pg_class'::pg_catalog.regclass
 AND d.objid=s.oid AND d.refclassid='pg_catalog.pg_class'::pg_catalog.regclass AND d.deptype IN ('a','i')
JOIN pg_catalog.pg_class c ON c.oid=d.refobjid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum=d.refobjsubid
WHERE s.relkind='S' AND n.nspname='public' AND c.relname IN ('eventos','inscricoes')
ORDER BY c.relname,a.attname;

-- Q10 Papéis e memberships transitivos; USAGE distingue herança disponível.
WITH RECURSIVE alvos AS (
 SELECT oid,rolname FROM pg_catalog.pg_roles WHERE rolname IN ('service_role','anon','authenticated')
), herdados(origem,papel) AS (
 SELECT oid,oid FROM alvos UNION
 SELECT h.origem,m.roleid FROM herdados h JOIN pg_catalog.pg_auth_members m ON m.member=h.papel
)
SELECT a.rolname AS origem,r.rolname AS papel,r.rolsuper,r.rolbypassrls,r.rolinherit,
 pg_catalog.pg_has_role(a.oid,r.oid,'USAGE') AS disponivel_sem_set_role
FROM herdados h JOIN alvos a ON a.oid=h.origem JOIN pg_catalog.pg_roles r ON r.oid=h.papel
ORDER BY a.rolname,r.rolname;

-- Q11 Privilégios efetivos de tabelas, herdados e opções de concessão.
WITH privs(privilegio) AS (
 VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')
 UNION ALL SELECT 'MAINTAIN' WHERE pg_catalog.current_setting('server_version_num')::integer>=170000
)
SELECT r.rolname,c.relname AS tabela,v.privilegio,
 pg_catalog.has_table_privilege(r.oid,c.oid,v.privilegio) AS efetivo,
 pg_catalog.has_table_privilege(r.oid,c.oid,v.privilegio||' WITH GRANT OPTION') AS pode_conceder
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
CROSS JOIN pg_catalog.pg_roles r CROSS JOIN privs v
WHERE n.nspname='public' AND c.relname IN
 ('usuarios','eventos','inscricoes','contas_teste_imagens','eventos_criacao_admin')
 AND r.rolname IN ('service_role','anon','authenticated') ORDER BY c.relname,r.rolname,v.privilegio;

-- Q12 ACLs das relações e schema, incluindo PUBLIC e outros beneficiários.
WITH objetos AS (
 SELECT n.nspname||'.'||c.relname AS objeto,c.relowner AS dono,
 COALESCE(c.relacl,pg_catalog.acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner)) AS acl
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE (n.nspname='public' AND c.relname IN
 ('usuarios','eventos','inscricoes','contas_teste_imagens','eventos_criacao_admin'))
 OR (c.relkind='S' AND EXISTS (SELECT 1 FROM pg_catalog.pg_depend d
 JOIN pg_catalog.pg_class t ON t.oid=d.refobjid JOIN pg_catalog.pg_namespace nt ON nt.oid=t.relnamespace
 WHERE d.classid='pg_catalog.pg_class'::pg_catalog.regclass AND d.objid=c.oid
 AND d.refclassid='pg_catalog.pg_class'::pg_catalog.regclass AND d.deptype IN ('a','i')
 AND nt.nspname='public' AND t.relname IN ('eventos','inscricoes')))
 UNION ALL SELECT 'schema public',nspowner,COALESCE(nspacl,pg_catalog.acldefault('n',nspowner))
 FROM pg_catalog.pg_namespace WHERE nspname='public'
)
SELECT o.objeto,pg_catalog.pg_get_userbyid(o.dono) AS proprietario,
 CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END AS beneficiario,
 pg_catalog.pg_get_userbyid(a.grantor) AS concedente,a.privilege_type,a.is_grantable
FROM objetos o CROSS JOIN LATERAL pg_catalog.aclexplode(o.acl) a ORDER BY o.objeto,beneficiario,a.privilege_type;

-- Q13 EXECUTE efetivo e ACLs de RPCs/auxiliares; PUBLIC consta na ACL.
SELECT p.oid::pg_catalog.regprocedure AS funcao,r.rolname,
 pg_catalog.has_function_privilege(r.oid,p.oid,'EXECUTE') AS executar,
 pg_catalog.has_function_privilege(r.oid,p.oid,'EXECUTE WITH GRANT OPTION') AS pode_conceder,
 COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner)) AS acl
FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
CROSS JOIN pg_catalog.pg_roles r WHERE n.nspname='public' AND p.proname IN
 ('gerir_evento_v1','eventos_capacidades_v1','eventos_vagas_v3','inscrever_evento_v1',
 'eventos_guardar_v1','inscricoes_guardar_evento_v1','eventos_vagas_guardar_v3',
 'criar_evento_admin_v1','admin_eventos_capacidades_v1')
 AND r.rolname IN ('service_role','anon','authenticated') ORDER BY p.oid,r.rolname;

-- Q14 Schema e sequences: privilégios efetivos e opções de concessão.
SELECT r.rolname,n.nspname AS schema,
 pg_catalog.has_schema_privilege(r.oid,n.oid,'USAGE') AS uso,
 pg_catalog.has_schema_privilege(r.oid,n.oid,'CREATE') AS criar,
 pg_catalog.has_schema_privilege(r.oid,n.oid,'USAGE WITH GRANT OPTION') AS conceder_uso,
 pg_catalog.has_schema_privilege(r.oid,n.oid,'CREATE WITH GRANT OPTION') AS conceder_criacao
FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_namespace n
WHERE n.nspname='public' AND r.rolname IN ('service_role','anon','authenticated');
SELECT r.rolname,ns.nspname AS schema,s.relname AS sequence,v.privilegio,
 pg_catalog.has_sequence_privilege(r.oid,s.oid,v.privilegio) AS efetivo,
 pg_catalog.has_sequence_privilege(r.oid,s.oid,v.privilegio||' WITH GRANT OPTION') AS pode_conceder
FROM pg_catalog.pg_class s JOIN pg_catalog.pg_namespace ns ON ns.oid=s.relnamespace
CROSS JOIN pg_catalog.pg_roles r CROSS JOIN (VALUES ('USAGE'),('SELECT'),('UPDATE')) v(privilegio)
WHERE s.relkind='S' AND r.rolname IN ('service_role','anon','authenticated')
 AND EXISTS (SELECT 1 FROM pg_catalog.pg_depend d
 JOIN pg_catalog.pg_class t ON t.oid=d.refobjid JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
 WHERE d.classid='pg_catalog.pg_class'::pg_catalog.regclass AND d.objid=s.oid
 AND d.refclassid='pg_catalog.pg_class'::pg_catalog.regclass AND d.deptype IN ('a','i')
 AND n.nspname='public' AND t.relname IN ('eventos','inscricoes')) ORDER BY s.oid,r.rolname,v.privilegio;

-- Q15 Políticas: expressões são definições, nunca avaliadas aqui.
SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename IN
 ('usuarios','eventos','inscricoes','contas_teste_imagens','eventos_criacao_admin') ORDER BY tablename,policyname;

-- Q16 Defaults globais/public por owner: podem abortar a migração.
SELECT pg_catalog.pg_get_userbyid(d.defaclrole) AS proprietario,
 CASE WHEN d.defaclnamespace=0 THEN '(global)' ELSE n.nspname END AS schema,
 d.defaclobjtype,d.defaclacl
FROM pg_catalog.pg_default_acl d LEFT JOIN pg_catalog.pg_namespace n ON n.oid=d.defaclnamespace
WHERE d.defaclnamespace=0 OR n.nspname='public';

-- Q17 Settings persistentes: allowlist evita expor JWT ou outros segredos.
SELECT CASE WHEN s.setdatabase=0 THEN '(todos)' ELSE '(banco configurado)' END AS escopo_banco,
 CASE WHEN s.setrole=0 THEN '(todos)' ELSE pg_catalog.pg_get_userbyid(s.setrole) END AS papel,v.configuracao
FROM pg_catalog.pg_db_role_setting s CROSS JOIN LATERAL pg_catalog.unnest(s.setconfig) v(configuracao)
WHERE (s.setdatabase=0 OR s.setdatabase=(SELECT oid FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database()))
 AND pg_catalog.split_part(v.configuracao,'=',1) IN
 ('search_path','default_transaction_isolation','statement_timeout','lock_timeout',
 'idle_in_transaction_session_timeout','transaction_timeout')
 AND (s.setrole=0 OR s.setrole IN (SELECT oid FROM pg_catalog.pg_roles
 WHERE rolname IN ('service_role','authenticator','anon','authenticated')));

-- Q18 Arestas de membership e opção ADMIN; complementar os privilégios efetivos.
WITH RECURSIVE papeis(oid) AS (
 SELECT oid FROM pg_catalog.pg_roles WHERE rolname IN ('service_role','anon','authenticated')
 UNION SELECT m.roleid FROM papeis p JOIN pg_catalog.pg_auth_members m ON m.member=p.oid
)
SELECT pg_catalog.pg_get_userbyid(m.member) AS membro,
 pg_catalog.pg_get_userbyid(m.roleid) AS papel,m.admin_option
FROM pg_catalog.pg_auth_members m WHERE m.member IN (SELECT oid FROM papeis);

-- Q19 Valores ENUM permitidos nas colunas de perfil/estado, nunca registros.
SELECT c.relname AS tabela,a.attname AS coluna,e.enumlabel,e.enumsortorder
FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
JOIN pg_catalog.pg_enum e ON e.enumtypid=a.atttypid
WHERE n.nspname='public' AND c.relname IN ('usuarios','contas_teste_imagens','eventos','inscricoes')
 AND a.attname IN ('perfil','estado','status') ORDER BY c.relname,a.attname,e.enumsortorder;

-- Limites: sem contagens exatas nem dados pessoais/payloads de negócio.
-- Não executar funções de aplicação para inferir versão: revisar Q08.
-- Constraints validadas não comprovam todas as invariantes semânticas dos dados.
-- Chamadas dinâmicas em funções e hooks PostgREST exigem revisão manual separada.
