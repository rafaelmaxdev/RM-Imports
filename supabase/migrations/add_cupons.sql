-- Create cupons table for discount coupons
CREATE TABLE IF NOT EXISTS cupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL CHECK (tipo IN ('porcentagem', 'fixo')),
  valor NUMERIC(10,2) NOT NULL CHECK (valor > 0),
  uso_maximo INTEGER,
  usos_atuais INTEGER NOT NULL DEFAULT 0,
  valor_minimo_pedido NUMERIC(10,2),
  data_expiracao TIMESTAMPTZ,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE cupons ENABLE ROW LEVEL SECURITY;

-- Authenticated users can do everything
CREATE POLICY "cupons_authenticated_all" ON cupons
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Public can only read active coupons (for validation)
CREATE POLICY "cupons_public_select" ON cupons
  FOR SELECT
  TO anon
  USING (ativo = true);

-- Function to increment usage count atomically
CREATE OR REPLACE FUNCTION incrementar_uso_cupom(cupom_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE cupons SET usos_atuais = usos_atuais + 1 WHERE id = cupom_id;
END;
$$;
