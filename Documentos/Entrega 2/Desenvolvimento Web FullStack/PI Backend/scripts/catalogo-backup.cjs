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
// V2: mant?m o contrato hist?rico acima. O manifesto novo inclui todos os schemas
// n?o sist?micos; OIDs n?o entram na compara??o offline.
const inventarioSql = `SELECT n.nspname AS schema,c.relname AS name,c.relkind AS kind,
 EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e') AS extension_owned
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND c.relkind IN ('r','p','m','f')
 ORDER BY n.nspname COLLATE "C",c.relname COLLATE "C"`;
const catalogoOfflineSql = `WITH rels AS (
 SELECT c.*,n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND c.relkind IN ('r','p','m','v','f','S')
), funcs AS (
 SELECT p.*,n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND p.prokind IN ('f','p')
)
SELECT jsonb_build_object(
 'relations',(SELECT jsonb_agg(jsonb_build_object('schema',r.nspname,'name',r.relname,'kind',r.relkind,
 'owner',pg_get_userbyid(r.relowner),'acl',r.relacl,'rls',r.relrowsecurity,'force',r.relforcerowsecurity,
 'partition',CASE WHEN r.relispartition THEN pg_get_expr(r.relpartbound,r.oid) END,
 'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
 'required',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'acl',a.attacl,
 'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
 FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped)) ORDER BY r.nspname,r.relname) FROM rels r),
 'functions',(SELECT jsonb_agg(jsonb_build_object('schema',p.nspname,'signature',p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
 'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'def',pg_get_functiondef(p.oid),'config',p.proconfig,'definer',p.prosecdef)
 ORDER BY p.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) FROM funcs p),
 'constraints',(SELECT jsonb_agg(jsonb_build_object('schema',r.nspname,'table',r.relname,'name',k.conname,
 'valid',k.convalidated,'def',pg_get_constraintdef(k.oid)) ORDER BY r.nspname,r.relname,k.conname)
 FROM pg_constraint k JOIN rels r ON r.oid=k.conrelid),
 'indexes',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.schemaname,i.tablename,i.indexname) FROM pg_indexes i
 WHERE i.schemaname !~ '^pg_' AND i.schemaname<>'information_schema'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.schemaname,p.tablename,p.policyname) FROM pg_policies p
 WHERE p.schemaname !~ '^pg_' AND p.schemaname<>'information_schema'),
 'triggers',(SELECT jsonb_agg(jsonb_build_object('schema',r.nspname,'table',r.relname,'name',t.tgname,
 'enabled',t.tgenabled,'def',pg_get_triggerdef(t.oid)) ORDER BY r.nspname,r.relname,t.tgname)
 FROM pg_trigger t JOIN rels r ON r.oid=t.tgrelid WHERE NOT t.tgisinternal),
 'schemas',(SELECT jsonb_agg(jsonb_build_object('name',nspname,'owner',pg_get_userbyid(nspowner),'acl',nspacl) ORDER BY nspname)
 FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname<>'information_schema'),
 'defaults',(SELECT jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),'schema',n.nspname,
 'type',d.defaclobjtype,'acl',d.defaclacl) ORDER BY pg_get_userbyid(d.defaclrole),n.nspname,d.defaclobjtype)
 FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace),
 'sequences',(SELECT jsonb_agg(jsonb_build_object('schema',s.schemaname,'name',s.sequencename,
 'owner',s.sequenceowner,'type',s.data_type::text,'start',s.start_value::text,'min',s.min_value::text,
 'max',s.max_value::text,'increment',s.increment_by::text,'cycle',s.cycle,'cache',s.cache_size::text,
 'last',s.last_value::text) ORDER BY s.schemaname,s.sequencename) FROM pg_sequences s
 WHERE s.schemaname !~ '^pg_' AND s.schemaname<>'information_schema'),
 'sequence_links',(SELECT jsonb_agg(jsonb_build_object('schema',s.nspname,'sequence',s.relname,
 'table_schema',t.nspname,'table',t.relname,'column',a.attname,'dependency',d.deptype)
 ORDER BY s.nspname,s.relname,t.nspname,t.relname,a.attname)
 FROM rels s JOIN pg_depend d ON d.classid='pg_class'::regclass AND d.objid=s.oid
 AND d.refclassid='pg_class'::regclass AND d.deptype IN ('a','i')
 JOIN rels t ON t.oid=d.refobjid JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid WHERE s.relkind='S'),
 'views',(SELECT jsonb_agg(jsonb_build_object('schema',r.nspname,'name',r.relname,'def',pg_get_viewdef(r.oid))
 ORDER BY r.nspname,r.relname) FROM rels r WHERE r.relkind IN ('v','m')),
 'inheritance',(SELECT jsonb_agg(jsonb_build_object('schema',c.nspname,'child',c.relname,
 'parent_schema',p.nspname,'parent',p.relname) ORDER BY c.nspname,c.relname,p.nspname,p.relname)
 FROM pg_inherits i JOIN rels c ON c.oid=i.inhrelid JOIN rels p ON p.oid=i.inhparent),
 'types',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',t.typname,'kind',t.typtype,
 'owner',pg_get_userbyid(t.typowner),'acl',t.typacl,'base',format_type(t.typbasetype,t.typtypmod),
 'enum',(SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid),
 'checks',(SELECT jsonb_agg(pg_get_constraintdef(k.oid) ORDER BY k.conname) FROM pg_constraint k WHERE k.contypid=t.oid))
 ORDER BY n.nspname,t.typname) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
 WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND t.typtype IN ('e','d')),
 'extensions',(SELECT jsonb_agg(jsonb_build_object('name',e.extname,'version',e.extversion,'schema',n.nspname)
 ORDER BY e.extname) FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace),
 'roles',(SELECT jsonb_agg(jsonb_build_object('name',rolname,'super',rolsuper,'inherit',rolinherit,'create_role',rolcreaterole,
 'create_db',rolcreatedb,'login',rolcanlogin,'replication',rolreplication,'bypass',rolbypassrls,'config',rolconfig)
 ORDER BY rolname) FROM pg_roles WHERE rolname !~ '^pg_'),
 'memberships',(SELECT jsonb_agg(jsonb_build_object('role',pg_get_userbyid(roleid),'member',pg_get_userbyid(member),
 'grantor',pg_get_userbyid(grantor),'admin',admin_option,'inherit',inherit_option,'set',set_option)
 ORDER BY pg_get_userbyid(roleid),pg_get_userbyid(member),pg_get_userbyid(grantor)) FROM pg_auth_members),
 'event_triggers',(SELECT jsonb_agg(jsonb_build_object('name',evtname,'event',evtevent,'owner',pg_get_userbyid(evtowner),
 'enabled',evtenabled,'tags',evttags,'def',pg_get_functiondef(evtfoid)) ORDER BY evtname) FROM pg_event_trigger)
) AS catalogo;`;
module.exports = { catalogoSql, inventarioSql, catalogoOfflineSql };
