-- SOMENTE LEITURA; não aplicar a migração nesta etapa.
BEGIN READ ONLY;
SELECT current_database() AS banco,current_user AS usuario,current_setting('server_version_num') AS versao,
 (SELECT count(*) FROM public.usuarios) AS usuarios,
 to_regclass('public.termos_documentos') AS documentos,
 to_regclass('public.termos_aceites') AS aceites,
 to_regprocedure('public.cadastrar_usuario_termos_v1(text,text,text,text,text,text)') AS cadastro_rpc,
 to_regprocedure('public.termos_publicacao_bloquear_v1(text,text,text)') AS bloqueio_publicacao,
 has_table_privilege('service_role','public.usuarios','INSERT') AS pode_cadastrar,
 has_table_privilege('service_role','public.usuarios','SELECT') AS pode_retornar_id,
 has_schema_privilege('service_role','public','USAGE') AS pode_acessar_schema,
 has_sequence_privilege('service_role',pg_get_serial_sequence('public.usuarios','id'),'USAGE') AS pode_usar_sequencia;
SELECT column_name,data_type,is_nullable FROM information_schema.columns
 WHERE table_schema='public' AND table_name='usuarios' ORDER BY ordinal_position;
SELECT conname,pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.usuarios'::regclass;
SELECT md5(COALESCE(jsonb_agg(to_jsonb(u) ORDER BY u.id),'[]'::jsonb)::text) AS hash_usuarios FROM public.usuarios u;
SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname IN ('postgres','service_role','anon','authenticated');
SELECT tgname,pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid='public.usuarios'::regclass AND NOT tgisinternal;
COMMIT;
