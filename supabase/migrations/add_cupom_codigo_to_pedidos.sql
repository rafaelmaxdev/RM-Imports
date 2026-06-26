-- Add cupom columns to pedidos table
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cupom_codigo TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cupom_desconto NUMERIC(10,2);
