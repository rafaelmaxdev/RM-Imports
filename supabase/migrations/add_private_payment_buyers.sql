BEGIN;

-- Payment identity is never included in public order/address responses.
CREATE TABLE IF NOT EXISTS public.pedido_payment_buyers (
  pedido_id text PRIMARY KEY REFERENCES public.pedidos(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
  cpf text NOT NULL CHECK (cpf ~ '^[0-9]{11}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pedido_payment_buyers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pedido_payment_buyers FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedido_payment_buyers TO service_role;

-- No browser policies: the backend uses its service-role credential.
COMMIT;
