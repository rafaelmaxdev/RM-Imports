BEGIN;

-- Distinguish administrative release from actual receipt of payment.
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS admin_payment_exempt boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.check_pedido_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  allowed_transitions text[] := ARRAY[
    'pendente→pago', 'pendente→cancelado',
    'pago→reembolsado', 'pago→cancelado', 'pago→enviado_fornecedor',
    'enviado_fornecedor→em_producao', 'enviado_fornecedor→cancelado',
    'em_producao→a_caminho', 'em_producao→cancelado',
    'a_caminho→em_estoque', 'a_caminho→cancelado',
    'em_estoque→em_entrega', 'em_estoque→cancelado',
    'em_entrega→entregue', 'entregue→reembolsado'
  ];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('pendente', 'pago') THEN
      RAISE EXCEPTION 'Invalid initial status: %', NEW.status;
    END IF;
    RETURN NEW;
  END IF;

  -- This reversal is exclusively for an unpaid administrative release.
  IF OLD.status = 'pago' AND NEW.status = 'pendente'
     AND OLD.admin_order IS TRUE AND NEW.admin_order IS FALSE
     AND OLD.admin_payment_exempt IS TRUE AND NEW.admin_payment_exempt IS FALSE
     AND OLD.mp_payment_id IS NULL AND NEW.mp_payment_id IS NULL
     AND public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF OLD.status <> NEW.status
     AND NOT (OLD.status || '→' || NEW.status = ANY(allowed_transitions)) THEN
    RAISE EXCEPTION 'Invalid status transition: % → %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_pedido_admin_order(
  p_order_id text,
  p_is_admin boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  order_row public.pedidos%ROWTYPE;
  new_status text;
  new_exempt boolean;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin access required' USING ERRCODE = '42501';
  END IF;
  IF p_is_admin IS NULL THEN
    RAISE EXCEPTION 'admin flag required';
  END IF;

  SELECT * INTO order_row FROM public.pedidos
  WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;

  new_status := order_row.status;
  new_exempt := order_row.admin_payment_exempt;
  IF p_is_admin AND order_row.status = 'pendente' THEN
    IF order_row.mp_payment_id IS NOT NULL THEN
      RAISE EXCEPTION 'Confira o pagamento existente antes de liberar este pedido.';
    END IF;
    new_status := 'pago';
    new_exempt := true;
  ELSIF NOT p_is_admin AND order_row.admin_payment_exempt THEN
    IF order_row.mp_payment_id IS NOT NULL THEN
      -- A real payment must never be undone by the admin toggle.
      new_exempt := false;
    ELSIF order_row.status = 'pago' THEN
      new_status := 'pendente';
      new_exempt := false;
    ELSIF order_row.status IN ('cancelado', 'reembolsado') THEN
      new_exempt := false;
    ELSE
      RAISE EXCEPTION 'Pedido já em andamento. Registre o pagamento real antes de remover a marcação de Admin.';
    END IF;
  END IF;

  UPDATE public.pedidos
  SET admin_order = p_is_admin, status = new_status,
      admin_payment_exempt = new_exempt
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'admin_order', p_is_admin,
    'status', new_status,
    'admin_payment_exempt', new_exempt
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_pedido_admin_order(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_pedido_admin_order(text, boolean) TO authenticated;

COMMIT;
