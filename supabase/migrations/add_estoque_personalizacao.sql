-- Add personalization columns to estoque_pronta_entrega
-- This allows marking stock items as personalized with a name and number.

-- Step 1: Add columns
ALTER TABLE estoque_pronta_entrega ADD COLUMN IF NOT EXISTS personalizado boolean DEFAULT false;
ALTER TABLE estoque_pronta_entrega ADD COLUMN IF NOT EXISTS nome_personalizado text;
ALTER TABLE estoque_pronta_entrega ADD COLUMN IF NOT EXISTS numero_personalizado text;
ALTER TABLE estoque_pronta_entrega ADD COLUMN IF NOT EXISTS feminino boolean DEFAULT false;

-- Step 2: Drop the old unique constraint (produto_id, tamanho)
ALTER TABLE estoque_pronta_entrega DROP CONSTRAINT IF EXISTS estoque_pronta_entrega_produto_id_tamanho_key;

-- Step 3: Recreate the unique constraint including personalization columns.
-- A unique CONSTRAINT (not just an index) is needed so PostgREST can properly
-- handle ON CONFLICT internally (e.g. for .insert().select() chains).
-- Since Postgres unique constraints don't support expressions like COALESCE,
-- we use a workaround: add a virtual column or use a unique index + constraint.
-- Here we create a unique constraint on all columns; NULLs in unique constraints
-- are treated as distinct values in Postgres, so each combination is unique.
-- Drop old constraint/index if re-running migration
ALTER TABLE estoque_pronta_entrega DROP CONSTRAINT IF EXISTS estoque_pronta_entrega_unique_item;
DROP INDEX IF EXISTS estoque_pronta_entrega_unique_idx;

ALTER TABLE estoque_pronta_entrega ADD CONSTRAINT estoque_pronta_entrega_unique_item
  UNIQUE (produto_id, tamanho, personalizado, nome_personalizado, numero_personalizado, feminino);

-- Also keep the unique index for query performance on the same columns
CREATE UNIQUE INDEX IF NOT EXISTS estoque_pronta_entrega_unique_idx
  ON estoque_pronta_entrega (produto_id, tamanho, personalizado, COALESCE(nome_personalizado, ''), COALESCE(numero_personalizado, ''), feminino);