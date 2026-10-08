-- Run AFTER add_order_status_history.sql.
-- Only the package and timestamps explicitly confirmed by the store are seeded.
BEGIN;

-- Keep concurrent status writes from interleaving with this one-off import.
LOCK TABLE public.pedidos, public.pacotes IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  package_ids jsonb;
BEGIN
  SELECT CASE jsonb_typeof(pedido_ids)
    WHEN 'array' THEN pedido_ids
    WHEN 'string' THEN (pedido_ids #>> '{}')::jsonb
    ELSE '[]'::jsonb
  END INTO package_ids
  FROM public.pacotes
  WHERE id = 'fd110d05-6fa2-40b6-9f54-129c13bee137'
    AND status = 'em_producao';

  IF package_ids IS NULL OR jsonb_array_length(package_ids) <> 7
     OR NOT (package_ids @> '["UL-DNKU6XEF","UL-M5TGWZY3","UL-8Z9YHQCX","UL-A49JYE7N","UL-H6VUH24Z","UL-BHBR5JDC","UL-H2U4QY7H"]'::jsonb) THEN
    RAISE EXCEPTION 'O pacote mudou. Confira os pedidos antes de importar o histórico.';
  END IF;

  IF (SELECT count(*) FROM public.pedidos
      WHERE package_ids ? id AND status = 'em_producao') <> 7 THEN
    RAISE EXCEPTION 'Os status dos pedidos mudaram. A importação não foi aplicada.';
  END IF;
END;
$$;

-- Temporarily bypass ONLY the history writer, under a table lock and transaction.
-- Status validation, RLS and other triggers remain in effect. A failure rolls back
-- both the data updates and the temporary trigger change.
ALTER TABLE public.pedidos DISABLE TRIGGER record_order_status_history;

-- Approval times verified using the Mercado Pago payments API.
-- No payment timestamp is invented for admin orders or external Pix payments.
WITH approvals(pedido_id, payment_id, approved_at) AS (
  VALUES
    ('UL-8Z9YHQCX', '181796197683', '2026-10-06T21:03:38.000-04:00'),
    ('UL-H2U4QY7H', '179426540805', '2026-09-22T20:26:56.000-04:00'),
    ('UL-BHBR5JDC', '180547181661', '2026-09-29T21:32:37.000-04:00'),
    ('UL-H6VUH24Z', '181274614113', '2026-10-03T20:01:11.000-04:00')
)
UPDATE public.pedidos AS p
SET status_history = p.status_history || jsonb_build_array(
  jsonb_build_object(
    'status', 'pago',
    'changed_at', a.approved_at,
    'source', 'mercado_pago'
  )
)
FROM approvals AS a
WHERE p.id = a.pedido_id
  AND p.mp_payment_id::text = a.payment_id
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(p.status_history) AS event
    WHERE event ->> 'status' = 'pago'
  );

-- 07/10/2026 02:34 in Pernambuco = 07/10/2026 05:34 UTC.
-- This is the production start reported by the store, not a supplier-send event.
UPDATE public.pedidos AS p
SET status_history = p.status_history || jsonb_build_array(
  jsonb_build_object(
    'status', 'em_producao',
    'changed_at', '2026-10-07T05:34:00.000Z',
    'source', 'store_reported'
  )
)
WHERE p.id IN (
  'UL-DNKU6XEF', 'UL-M5TGWZY3', 'UL-8Z9YHQCX', 'UL-A49JYE7N',
  'UL-H6VUH24Z', 'UL-BHBR5JDC', 'UL-H2U4QY7H'
)
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(p.status_history) AS event
    WHERE event ->> 'status' = 'em_producao'
  );

ALTER TABLE public.pedidos ENABLE TRIGGER record_order_status_history;

-- Record subsequent real transitions too, without importing any other past dates.
UPDATE public.pacotes SET track_status_history = true
WHERE id = 'fd110d05-6fa2-40b6-9f54-129c13bee137';

COMMIT;
