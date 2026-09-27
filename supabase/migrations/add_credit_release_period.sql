ALTER TABLE public.pedidos
ADD COLUMN IF NOT EXISTS credit_release_period text;

ALTER TABLE public.pedidos
DROP CONSTRAINT IF EXISTS pedidos_credit_release_period_check;

ALTER TABLE public.pedidos
ADD CONSTRAINT pedidos_credit_release_period_check
CHECK (credit_release_period IS NULL OR credit_release_period IN ('immediate', '14_days', '30_days'));
