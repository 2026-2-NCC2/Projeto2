"use strict";
// Metadados publicos e de autorizacao; nunca inclui senhas de roles.
const catalogoSql = `WITH tables AS (
 SELECT c.oid,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='r'
), functions AS (
 SELECT p.* FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prokind='f'
)
SELECT jsonb_build_object(
 'tables',(SELECT jsonb_agg(jsonb_build_object('name',t.relname,'rls',t.relrowsecurity,'force_rls',t.relforcerowsecurity,
   'privileges',(SELECT jsonb_object_agg(r.rolname,jsonb_build_object('select',has_table_privilege(r.oid,t.oid,'SELECT'),
    'insert',has_table_privilege(r.oid,t.oid,'INSERT'),'update',has_table_privilege(r.oid,t.oid,'UPDATE'),'delete',has_table_privilege(r.oid,t.oid,'DELETE')))
    FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role','postgres')),
   'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,
    'identity',a.attidentity,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
    FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped)
 ) ORDER BY t.relname) FROM tables t),
 'functions',(SELECT jsonb_agg(jsonb_build_object('name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),
   'definition',pg_get_functiondef(p.oid),'security_definer',p.prosecdef,'configuration',p.proconfig,
   'execute',(SELECT jsonb_object_agg(r.rolname,has_function_privilege(r.oid,p.oid,'EXECUTE')) FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role','postgres')))
   ORDER BY p.proname,pg_get_function_identity_arguments(p.oid)) FROM functions p),
 'constraints',(SELECT jsonb_agg(jsonb_build_object('table',t.relname,'name',c.conname,'definition',pg_get_constraintdef(c.oid)) ORDER BY t.relname,c.conname)
   FROM pg_constraint c JOIN tables t ON t.oid=c.conrelid),
 'indexes',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.tablename,i.indexname) FROM pg_indexes i WHERE i.schemaname='public'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.tablename,p.policyname) FROM pg_policies p WHERE p.schemaname='public'),
 'triggers',(SELECT jsonb_agg(jsonb_build_object('name',g.tgname,'enabled',g.tgenabled,'definition',pg_get_triggerdef(g.oid)) ORDER BY g.tgname)
   FROM pg_trigger g WHERE g.tgrelid IN (SELECT oid FROM tables) AND NOT g.tgisinternal),
 'sequences',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.sequencename) FROM pg_sequences s WHERE s.schemaname='public')
) AS catalogo;`;
module.exports = { catalogoSql };
