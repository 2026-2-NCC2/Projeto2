-- RASCUNHO MANUAL. Não aplicar sem revisão/autorização. Nenhum bucket.
-- Reutiliza usuarios como identidade; não altera seus dados/colunas comerciais.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
BEGIN
  IF to_regclass('public.portfolio_itens') IS NOT NULL THEN
    RAISE EXCEPTION 'portfolio_itens já existe. Não reaplicar; revisar definição.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='usuarios' AND column_name='id'
        AND data_type='integer' AND is_nullable='NO') THEN
    RAISE EXCEPTION 'usuarios.id deve ser integer NOT NULL. Revisar preflight.';
  END IF;
  IF NOT EXISTS(
      SELECT 1 FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attname='id' AND NOT a.attisdropped
      JOIN pg_index i ON i.indexrelid=c.conindid
      WHERE c.conrelid='public.usuarios'::regclass AND c.contype IN ('p','u')
        AND c.conkey=ARRAY[a.attnum] AND c.convalidated AND NOT c.condeferrable
        AND i.indisunique AND i.indisvalid AND i.indisready AND i.indimmediate
        AND i.indpred IS NULL AND i.indexprs IS NULL) THEN
    RAISE EXCEPTION 'usuarios.id exige PRIMARY KEY ou UNIQUE válida e não diferível.';
  END IF;
END $$;
CREATE TABLE public.portfolio_itens (
  id uuid PRIMARY KEY,
  fornecedor_id integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  titulo text NOT NULL CHECK(length(btrim(titulo)) BETWEEN 1 AND 120),
  descricao text NOT NULL CHECK(length(btrim(descricao)) BETWEEN 1 AND 2000),
  categoria text NOT NULL CHECK(length(btrim(categoria)) BETWEEN 1 AND 80),
  versao integer NOT NULL DEFAULT 1 CHECK(versao>0),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CHECK(substring(id::text,15,1)='4' AND substring(id::text,20,1) IN ('8','9','a','b'))
);
CREATE INDEX portfolio_itens_fornecedor ON public.portfolio_itens(fornecedor_id,criado_em DESC,id);
ALTER TABLE public.portfolio_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_itens FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.portfolio_itens FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.portfolio_itens TO service_role;
DO $$
DECLARE alvo regclass:='public.portfolio_itens'; extras text; versao integer:=current_setting('server_version_num')::integer;
BEGIN
  IF versao<150000 OR versao>=190000 THEN RAISE EXCEPTION 'Versão não revisada.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls) THEN RAISE EXCEPTION 'BYPASSRLS ausente.'; END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated') AND (rolbypassrls OR rolsuper)) THEN
    RAISE EXCEPTION 'anon/authenticated não podem possuir BYPASSRLS ou SUPERUSER.';
  END IF;
  -- Lista de privilégios em has_table_privilege significa QUALQUER um.
  -- Conferir separadamente para exigir TODOS os quatro privilégios CRUD.
  IF NOT has_table_privilege('service_role',alvo,'SELECT')
    OR NOT has_table_privilege('service_role',alvo,'INSERT')
    OR NOT has_table_privilege('service_role',alvo,'UPDATE')
    OR NOT has_table_privilege('service_role',alvo,'DELETE') THEN
    RAISE EXCEPTION 'service_role sem CRUD efetivo completo.';
  END IF;
  extras:='TRUNCATE,REFERENCES,TRIGGER';IF versao>=170000 THEN extras:=extras||',MAINTAIN'; END IF;
  IF has_table_privilege('anon',alvo,'SELECT,INSERT,UPDATE,DELETE,'||extras)
    OR has_table_privilege('authenticated',alvo,'SELECT,INSERT,UPDATE,DELETE,'||extras)
    OR has_table_privilege('service_role',alvo,extras)
    OR has_table_privilege('service_role',alvo,'SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION,DELETE WITH GRANT OPTION')
    OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.oid=alvo
      AND a.grantee NOT IN(c.relowner,(SELECT oid FROM pg_roles WHERE rolname='service_role'))
      AND NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.oid=a.grantee AND r.rolsuper)) THEN
    RAISE EXCEPTION 'Privilégios inesperados. Revisar sem alterar defaults globais.';
  END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
