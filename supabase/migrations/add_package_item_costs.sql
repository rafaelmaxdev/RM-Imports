-- Costs in USD, keyed by order ID and line index within the order.
ALTER TABLE public.pacotes
  ADD COLUMN IF NOT EXISTS custos_itens_usd jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(custos_itens_usd) = 'object');
