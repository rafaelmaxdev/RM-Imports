-- Add custo column to estoque_pronta_entrega for tracking purchase cost
ALTER TABLE estoque_pronta_entrega
ADD COLUMN IF NOT EXISTS custo NUMERIC(10,2);

COMMENT ON COLUMN estoque_pronta_entrega.custo IS 'Purchase cost for items acquired outside the system. Used to calculate profit in the financial report.';
