-- Aplicação MANUAL no SQL Editor do Supabase. Não altera usuários existentes.
-- Execute primeiro perfil_usuarios.preflight.sql e confira public.usuarios.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Sem DEFAULT / NOT NULL: registros atuais continuam com NULL, sem backfill.
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS telefone varchar(30),
  ADD COLUMN IF NOT EXISTS biografia varchar(1000);

-- IF NOT EXISTS não garante compatibilidade: abortar se já houver outro tipo.
DO $$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'usuarios'
        AND ((column_name = 'telefone' AND data_type = 'character varying'
              AND character_maximum_length = 30)
          OR (column_name = 'biografia' AND data_type = 'character varying'
              AND character_maximum_length = 1000))
        AND is_nullable = 'YES' AND column_default IS NULL) <> 2 THEN
    RAISE EXCEPTION 'Colunas de perfil incompatíveis. Transação cancelada; revisar estrutura.';
  END IF;
END $$;

-- Disponibilizar as novas colunas ao PostgREST após o commit.
NOTIFY pgrst, 'reload schema';
COMMIT;
