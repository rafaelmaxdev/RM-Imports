-- Add personalization columns to estoque_pronta_entrega
-- This allows marking stock items as personalized with a name and number.

-- Step 1: Add columns
ALTER TABLE estoque_pronta_entrega ADD COLUMN IF NOT EXISTS personalizado boolean DEFAULT false;
ALTER TABLE estoque_pronta_entrega ADD COLUMN IF NOT EXISTS nome_personalizado text;
ALTER TABLE estoque_pronta_entrega ADD COLUMN IF NOT EXISTS numero_personalizado text;

-- Step 2: Drop the old unique constraint (produto_id, tamanho)
ALTER TABLE estoque_pronta_entrega DROP CONSTRAINT IF EXISTS estoque_pronta_entrega_produto_id_tamanho_key;

-- Step 3: Create a new unique constraint that includes personalization
-- Non-personalized items: unique on (produto_id, tamanho) where personalizado = false
-- Personalized items: unique on (produto_id, tamanho, nome_personalizado, numero_personalizado) where personalizado = true
-- Since Postgres partial unique indexes can't have multiple conditions easily,
-- we use a simpler approach: unique on (produto_id, tamanho, personalizado, COALESCE(nome_personalizado, ''), COALESCE(numero_personalizado, ''))
CREATE UNIQUE INDEX IF NOT EXISTS estoque_pronta_entrega_unique_item
  ON estoque_pronta_entrega (produto_id, tamanho, personalizado, COALESCE(nome_personalizado, ''), COALESCE(numero_personalizado, ''));