-- PROPOSTA MANUAL: revisar preflight antes de aplicar no SQL Editor.
-- Não cria buckets, não altera usuarios, não insere/atualiza/exclui registros.
-- Não executar automaticamente. Uma aplicação apenas; nomes existentes abortam.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'usuarios'
        AND column_name = 'id' AND data_type = 'integer' AND is_nullable = 'NO') THEN
    RAISE EXCEPTION 'usuarios.id incompatível. Revisar preflight; nenhuma conversão automática.';
  END IF;
  IF to_regclass('public.perfil_imagens') IS NOT NULL
      OR to_regclass('public.perfil_imagens_objetos') IS NOT NULL THEN
    RAISE EXCEPTION 'Estruturas de imagens já existem. Comparar definição antes de prosseguir.';
  END IF;
END $$;

-- Diário durável dos caminhos gerados pelo servidor, inclusive antes do upload.
-- RESTRICT preserva o diário: exclusão de conta exigirá protocolo de limpeza.
CREATE TABLE public.perfil_imagens_objetos (
  operacao uuid PRIMARY KEY,
  usuario_id integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('foto', 'capa')),
  bucket text NOT NULL,
  caminho text NOT NULL,
  mime text NOT NULL CHECK (mime = 'image/webp'),
  tamanho integer NOT NULL,
  largura integer NOT NULL,
  altura integer NOT NULL,
  estado text NOT NULL DEFAULT 'reservado'
    CHECK (estado IN ('reservado', 'atual', 'limpeza', 'limpando', 'removido')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  reserva_ate timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  limpeza_apos timestamptz,
  lease_ate timestamptz,
  tentativas integer NOT NULL DEFAULT 0 CHECK (tentativas >= 0),
  ultimo_erro_codigo text CHECK (length(ultimo_erro_codigo) <= 64),
  UNIQUE (bucket, caminho),
  UNIQUE (operacao, usuario_id, tipo),
  CHECK ((tipo = 'foto' AND bucket = 'perfil-fotos'
            AND tamanho BETWEEN 1 AND 5242880 AND largura BETWEEN 1 AND 512 AND altura BETWEEN 1 AND 512)
      OR (tipo = 'capa' AND bucket = 'perfil-capas'
            AND tamanho BETWEEN 1 AND 10485760 AND largura BETWEEN 1 AND 1920 AND altura BETWEEN 1 AND 1920)),
  CHECK (caminho = usuario_id::text || '/' || operacao::text || '.webp'),
  CHECK (substring(operacao::text, 15, 1) = '4' AND substring(operacao::text, 20, 1) IN ('8', '9', 'a', 'b')),
  CHECK (estado NOT IN ('limpeza', 'limpando') OR limpeza_apos IS NOT NULL),
  CHECK (estado <> 'limpando' OR lease_ate IS NOT NULL)
);
-- Serializa reservas por slot; as futuras transações também devem bloquear a
-- linha de usuarios FOR UPDATE, inclusive quando ainda não houver referência.
CREATE UNIQUE INDEX perfil_imagens_reserva_unica
  ON public.perfil_imagens_objetos(usuario_id, tipo) WHERE estado = 'reservado';
CREATE UNIQUE INDEX perfil_imagens_atual_unica
  ON public.perfil_imagens_objetos(usuario_id, tipo) WHERE estado = 'atual';
CREATE INDEX perfil_imagens_fila_limpeza
  ON public.perfil_imagens_objetos(estado, limpeza_apos);

-- Um slot por tipo/usuário. A leitura faz JOIN com o diário para obter caminho
-- e metadados. Nenhuma URL (assinada ou pública) é persistida.
CREATE TABLE public.perfil_imagens (
  usuario_id integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('foto', 'capa')),
  objeto_id uuid NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, tipo),
  FOREIGN KEY (objeto_id, usuario_id, tipo)
    REFERENCES public.perfil_imagens_objetos(operacao, usuario_id, tipo) ON DELETE RESTRICT
);

-- JWT próprio do Express não equivale a auth.uid(). Sem políticas de acesso
-- direto pelo navegador. Apenas o backend privilegiado acessará estas tabelas.
ALTER TABLE public.perfil_imagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfil_imagens FORCE ROW LEVEL SECURITY;
ALTER TABLE public.perfil_imagens_objetos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfil_imagens_objetos FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.perfil_imagens, public.perfil_imagens_objetos FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.perfil_imagens, public.perfil_imagens_objetos TO service_role;
-- Revisar grants herdados/default no preflight; nenhum grant existente é alterado.
NOTIFY pgrst, 'reload schema';
COMMIT;
