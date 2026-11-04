-- Somente leitura. Executar antes e depois da migração; guardar os resultados.
BEGIN READ ONLY;
SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'usuarios'
ORDER BY ordinal_position;

SELECT count(*) AS usuarios_existentes FROM public.usuarios;
SELECT conname, pg_get_constraintdef(oid) AS definicao
FROM pg_constraint WHERE conrelid = 'public.usuarios'::regclass;
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'usuarios';
SELECT relrowsecurity, relforcerowsecurity FROM pg_class
WHERE oid = 'public.usuarios'::regclass;
SELECT policyname, roles, cmd, qual, with_check FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'usuarios';
SELECT trigger_name, action_timing, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public' AND event_object_table = 'usuarios';
SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'usuarios';
COMMIT;
