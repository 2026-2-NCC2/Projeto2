-- Somente metadados. Nao chama RPCs nem altera tabelas, permissoes ou dados.
-- Executar SOMENTE no SQL Editor do PI Backend: gnwybroqfvwosiqzsfla.
-- Conferir o projeto na interface: current_database nao identifica o project ref.
-- Exportar o JSON para arquivo local, sem credenciais. Nao precisa enviar senhas.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '15s';

WITH alvos AS (
  SELECT c.oid, n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    AND c.relname IN ('usuarios', 'eventos', 'custos_evento', 'cotacoes',
                     'itens_cotacao', 'propostas', 'inscricoes', 'solicitacoes_acesso')
), funcoes AS (
  SELECT p.*, n.nspname
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
    AND p.proname IN ('substituir_custos_evento', 'publicar_cotacao',
                     'decidir_solicitacao_acesso', 'avaliar_proposta')
)
SELECT pg_catalog.jsonb_build_object(
  'database', pg_catalog.current_database(),
  'session_user', session_user,
  'transaction_read_only', pg_catalog.current_setting('transaction_read_only'),
  'functions', COALESCE((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'name', p.proname,
      'identity_arguments', pg_catalog.pg_get_function_identity_arguments(p.oid),
      'result', pg_catalog.pg_get_function_result(p.oid),
      'security_definer', p.prosecdef,
      'configuration', p.proconfig,
      'definition', pg_catalog.pg_get_functiondef(p.oid),
      'execute_by_role', (SELECT pg_catalog.jsonb_object_agg(r.rolname,
        pg_catalog.has_function_privilege(r.oid, p.oid, 'EXECUTE'))
        FROM pg_catalog.pg_roles r
        WHERE r.rolname IN ('service_role', 'anon', 'authenticated')),
      'public_execute_grant', EXISTS (
        SELECT 1 FROM pg_catalog.aclexplode(COALESCE(p.proacl,
          pg_catalog.acldefault('f', p.proowner))) a
        WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')
    ) ORDER BY p.proname, p.oid) FROM funcoes p
  ), '[]'::jsonb),
  'tables', COALESCE((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'name', a.relname, 'rls', a.relrowsecurity,
      'force_rls', a.relforcerowsecurity,
      'privileges_by_role', (SELECT pg_catalog.jsonb_object_agg(r.rolname,
        pg_catalog.jsonb_build_object(
          'select', pg_catalog.has_table_privilege(r.oid, a.oid, 'SELECT'),
          'insert', pg_catalog.has_table_privilege(r.oid, a.oid, 'INSERT'),
          'update', pg_catalog.has_table_privilege(r.oid, a.oid, 'UPDATE'),
          'delete', pg_catalog.has_table_privilege(r.oid, a.oid, 'DELETE')))
        FROM pg_catalog.pg_roles r
        WHERE r.rolname IN ('service_role', 'anon', 'authenticated'))
    ) ORDER BY a.relname) FROM alvos a
  ), '[]'::jsonb),
  'foreign_keys', COALESCE((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'name', c.conname, 'table', c.conrelid::regclass::text,
      'references', c.confrelid::regclass::text,
      'definition', pg_catalog.pg_get_constraintdef(c.oid))
      ORDER BY c.conrelid, c.conname)
    FROM pg_catalog.pg_constraint c
    WHERE c.contype = 'f' AND
      (c.conrelid IN (SELECT oid FROM alvos) OR c.confrelid IN (SELECT oid FROM alvos))
  ), '[]'::jsonb),
  'custom_triggers', COALESCE((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'table', t.tgrelid::regclass::text, 'name', t.tgname,
      'enabled', t.tgenabled, 'definition', pg_catalog.pg_get_triggerdef(t.oid),
      'function_definition', pg_catalog.pg_get_functiondef(t.tgfoid))
      ORDER BY t.tgrelid, t.tgname)
    FROM pg_catalog.pg_trigger t
    WHERE NOT t.tgisinternal AND t.tgrelid IN (SELECT oid FROM alvos)
  ), '[]'::jsonb)
) AS preflight_homologacao_escrita;

ROLLBACK;
