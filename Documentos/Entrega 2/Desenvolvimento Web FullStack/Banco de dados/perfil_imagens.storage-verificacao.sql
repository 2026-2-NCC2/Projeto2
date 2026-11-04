-- MANUAL / SOMENTE LEITURA, após criação manual dos buckets no Dashboard.
-- A ausência de políticas aplicáveis é intencional: acesso só pelo backend.
BEGIN READ ONLY;
SELECT esperado.id,
       b.id IS NOT NULL AS existe,
       b.public IS FALSE AS privado,
       b.file_size_limit = esperado.limite AS limite_correto,
       b.allowed_mime_types = ARRAY['image/webp']::text[] AS mime_correto
FROM (VALUES ('perfil-fotos', 5242880::bigint), ('perfil-capas', 10485760::bigint)) esperado(id, limite)
LEFT JOIN storage.buckets b ON b.id = esperado.id;
SELECT policyname, roles, cmd, permissive, qual, with_check
FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects';
-- Também verificar API com anon em homologação: INSERT/SELECT/UPDATE/DELETE
-- devem ser negados nos dois buckets. Não testar contra arquivos de produção.
COMMIT;
