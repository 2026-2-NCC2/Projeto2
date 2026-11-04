-- Somente leitura. Revisar antes e repetir depois da migração.
BEGIN READ ONLY;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'usuarios'
ORDER BY ordinal_position;
SELECT count(*) AS usuarios_existentes FROM public.usuarios;
SELECT perfil, count(*) FROM public.usuarios GROUP BY perfil;
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'public.usuarios'::regclass;
SELECT policyname, roles, cmd, qual, with_check FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'usuarios';
SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'usuarios';
SELECT trigger_name, action_statement FROM information_schema.triggers
WHERE event_object_schema = 'public' AND event_object_table = 'usuarios';
COMMIT;
