-- RASCUNHO NÃO APLICÁVEL NESTA ETAPA. Revisar/homologar antes de autorizar.
-- Não cria buckets nem altera eventos/usuarios/perfil_imagens.
-- Worker de eventos ainda é pendência de ativação; não aplicar isoladamente.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TABLE public.eventos_imagens (
  operacao uuid PRIMARY KEY,
  evento_id integer REFERENCES public.eventos(id) ON DELETE SET NULL,
  evento_origem integer NOT NULL CHECK(evento_origem>0),
  usuario_id integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  posicao smallint NOT NULL CHECK(posicao BETWEEN 0 AND 8), -- 0=capa, 1..8=galeria
  bucket text NOT NULL CHECK(bucket='eventos-imagens'),
  caminho text NOT NULL,
  mime text NOT NULL CHECK(mime='image/webp'),
  tamanho integer NOT NULL CHECK(tamanho BETWEEN 1 AND 10485760),
  largura integer NOT NULL CHECK(largura BETWEEN 1 AND 1920),
  altura integer NOT NULL CHECK(altura BETWEEN 1 AND 1920),
  estado text NOT NULL DEFAULT 'reservado' CHECK(estado IN ('reservado','atual','limpeza','limpando','removido')),
  reserva_ate timestamptz NOT NULL DEFAULT(now()+interval '15 minutes'),
  limpeza_apos timestamptz,
  lease_ate timestamptz,
  tentativas integer NOT NULL DEFAULT 0 CHECK(tentativas>=0),
  ultimo_erro_codigo text CHECK(length(ultimo_erro_codigo)<=64),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE(bucket,caminho),
  CHECK(evento_id IS NULL OR evento_id=evento_origem),
  CHECK(caminho=evento_origem::text || '/' || operacao::text || '.webp'),
  CHECK(substring(operacao::text,15,1)='4' AND substring(operacao::text,20,1) IN ('8','9','a','b')),
  CHECK(estado NOT IN ('limpeza','limpando') OR limpeza_apos IS NOT NULL),
  CHECK(estado<>'limpando' OR lease_ate IS NOT NULL)
);
CREATE UNIQUE INDEX eventos_imagens_reserva_unica ON public.eventos_imagens(evento_id,posicao) WHERE estado='reservado';
CREATE UNIQUE INDEX eventos_imagens_atual_unica ON public.eventos_imagens(evento_id,posicao) WHERE estado='atual';
CREATE INDEX eventos_imagens_limpeza ON public.eventos_imagens(estado,limpeza_apos);
-- Na exclusão do evento, o diário é preservado com evento_id=NULL. O worker
-- futuro deve agendar essas linhas para limpeza, nunca devolvê-las na leitura.
ALTER TABLE public.eventos_imagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eventos_imagens FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.eventos_imagens FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.eventos_imagens TO service_role;
DO $$
DECLARE alvo regclass := 'public.eventos_imagens'; extras text; versao integer := current_setting('server_version_num')::integer;
BEGIN
  IF versao<150000 OR versao>=190000 THEN RAISE EXCEPTION 'Versão não revisada.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls) THEN RAISE EXCEPTION 'BYPASSRLS ausente.'; END IF;
  extras:='TRUNCATE,REFERENCES,TRIGGER';
  IF versao>=170000 THEN extras:=extras||',MAINTAIN'; END IF;
  IF has_table_privilege('anon',alvo,'SELECT,INSERT,UPDATE,DELETE,'||extras)
      OR has_table_privilege('authenticated',alvo,'SELECT,INSERT,UPDATE,DELETE,'||extras)
      OR has_table_privilege('service_role',alvo,extras)
      OR has_table_privilege('service_role',alvo,'SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION,DELETE WITH GRANT OPTION')
      OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.oid=alvo
        AND a.grantee NOT IN(c.relowner,(SELECT oid FROM pg_roles WHERE rolname='service_role'))
        AND NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.oid=a.grantee AND r.rolsuper)) THEN
    RAISE EXCEPTION 'Privilégios inesperados; revisar preflight sem alterar defaults globais.';
  END IF;
END $$;
COMMIT;
