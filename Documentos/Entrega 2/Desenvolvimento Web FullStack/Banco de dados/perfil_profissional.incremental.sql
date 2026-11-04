-- MANUAL: revisar preflight e aplicar no SQL Editor do Supabase.
-- Não executa DML, não preenche dados, não altera permissões ou políticas.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS redes_sociais jsonb,
  ADD COLUMN IF NOT EXISTS dados_comerciais jsonb;

DO $$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'usuarios'
        AND column_name IN ('redes_sociais', 'dados_comerciais')
        AND data_type = 'jsonb' AND is_nullable = 'YES'
        AND column_default IS NULL AND is_generated = 'NEVER') <> 2 THEN
    RAISE EXCEPTION 'Colunas profissionais incompatíveis. Transação cancelada.';
  END IF;
  -- Colunas homônimas preexistentes exigem revisão do conteúdo; sem conversão automática.
  IF EXISTS (SELECT 1 FROM public.usuarios
      WHERE (redes_sociais IS NOT NULL AND jsonb_typeof(redes_sociais) <> 'object')
         OR (dados_comerciais IS NOT NULL AND jsonb_typeof(dados_comerciais) <> 'object')) THEN
    RAISE EXCEPTION 'Conteúdo profissional incompatível. Revisar sem alterar registros.';
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
