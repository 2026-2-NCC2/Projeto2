-- RASCUNHO MANUAL. Não executar sem autorização específica de migração.
-- Registro interno; não marca nem modifica contas preexistentes.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TABLE public.contas_teste_imagens (
  registro uuid PRIMARY KEY,
  usuario_id integer NOT NULL UNIQUE CHECK(usuario_id>0),
  -- Sem FK a usuarios: preserva histórico/tombstones depois da exclusão.
  email text NOT NULL UNIQUE,
  estado text NOT NULL DEFAULT 'ativa' CHECK(estado IN ('ativa','encerrando','excluida')),
  atividades integer NOT NULL DEFAULT 0 CHECK(atividades>=0),
  incerta boolean NOT NULL DEFAULT false,
  criado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  encerrado_em timestamptz,
  aguardar_ate timestamptz,
  excluido_em timestamptz,
  manifesto jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(manifesto)='array'),
  CHECK(email='imagem-teste-'||registro::text||'@example.invalid'),
  CHECK(estado='ativa' OR (encerrado_em IS NOT NULL AND aguardar_ate IS NOT NULL)),
  CHECK(estado<>'excluida' OR (excluido_em IS NOT NULL AND atividades=0 AND NOT incerta))
);
ALTER TABLE public.contas_teste_imagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contas_teste_imagens FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.contas_teste_imagens FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.contas_teste_imagens TO service_role;
DO $$
DECLARE extra text:='TRUNCATE,REFERENCES,TRIGGER'; v integer:=current_setting('server_version_num')::integer;
BEGIN
  IF v<150000 OR v>=190000 THEN RAISE EXCEPTION 'Versão não revisada.'; END IF;
  IF v>=170000 THEN extra:=extra||',MAINTAIN'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls)
    OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated') AND (rolsuper OR rolbypassrls))
    OR has_table_privilege('anon','public.contas_teste_imagens','SELECT,INSERT,UPDATE,DELETE,'||extra)
    OR has_table_privilege('authenticated','public.contas_teste_imagens','SELECT,INSERT,UPDATE,DELETE,'||extra)
    OR has_table_privilege('service_role','public.contas_teste_imagens',extra)
    OR has_table_privilege('service_role','public.contas_teste_imagens','SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION,DELETE WITH GRANT OPTION')
    OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
      WHERE c.oid='public.contas_teste_imagens'::regclass AND a.grantee NOT IN(c.relowner,(SELECT oid FROM pg_roles WHERE rolname='service_role'))
      AND NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.oid=a.grantee AND r.rolsuper)) THEN
    RAISE EXCEPTION 'Privilégios inesperados. Nenhuma alteração de defaults globais.';
  END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
