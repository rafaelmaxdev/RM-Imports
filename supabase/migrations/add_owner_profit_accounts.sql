BEGIN;

CREATE TABLE IF NOT EXISTS public.owner_withdrawals (
  id uuid PRIMARY KEY,
  owner text NOT NULL CHECK (owner IN ('rafael', 'renan')),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0 AND amount_cents <= 9007199254740991),
  withdrawal_date date NOT NULL,
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 300),
  profit_basis_cents bigint NOT NULL CHECK (abs(profit_basis_cents::numeric) <= 9007199254740991),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid NOT NULL REFERENCES auth.users(id),
  voided_at timestamptz,
  voided_by uuid REFERENCES auth.users(id),
  void_reason text CHECK (length(void_reason) <= 300),
  CHECK (
    (voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL)
    OR (voided_at IS NOT NULL AND voided_by IS NOT NULL
        AND void_reason IS NOT NULL AND length(btrim(void_reason)) > 0)
  )
);

ALTER TABLE public.owner_withdrawals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.owner_withdrawals FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.owner_withdrawals TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.owner_withdrawals TO service_role;
DROP POLICY IF EXISTS owner_withdrawals_admin_read ON public.owner_withdrawals;
CREATE POLICY owner_withdrawals_admin_read ON public.owner_withdrawals
FOR SELECT TO authenticated USING (public.is_admin());

-- Finance inputs only; no addresses, phone numbers or private payment identity.
-- The service backend computes realized profits from this coherent snapshot.
CREATE OR REPLACE FUNCTION public.owner_finance_sources()
RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'orders', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'status', status, 'total', total, 'itens', itens,
        'admin_order', admin_order, 'reposicao', reposicao,
        'pronta_entrega', pronta_entrega, 'payment_method', payment_method,
        'mp_payment_id', mp_payment_id::text, 'comissao_calculada', comissao_calculada,
        'rev_share_percentual', rev_share_percentual
      ) ORDER BY id) FROM public.pedidos
    ), '[]'::jsonb),
    'packages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'status', status, 'pedido_ids', pedido_ids,
        'custo', custo, 'frete', frete, 'taxa_importacao', taxa_importacao
      ) ORDER BY id) FROM public.pacotes
    ), '[]'::jsonb),
    'stock', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'produto_id', produto_id, 'tamanho', tamanho, 'custo', custo,
        'personalizado', personalizado, 'feminino', feminino,
        'nome_personalizado', nome_personalizado, 'numero_personalizado', numero_personalizado
      ) ORDER BY id) FROM public.estoque_pronta_entrega
    ), '[]'::jsonb),
    'products', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', id, 'nome', nome) ORDER BY id)
      FROM public.produtos
    ), '[]'::jsonb),
    'config', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('key', key, 'value', value) ORDER BY key)
      FROM public.loja_config WHERE key IN ('custo_base', 'personalizacao_custo')
    ), '[]'::jsonb),
    'extras', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'quantidade', quantidade, 'preco', preco
      ) ORDER BY id) FROM public.custos_extras
    ), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.get_owner_finance_snapshot()
RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
  WITH source AS MATERIALIZED (SELECT public.owner_finance_sources() AS data)
  SELECT jsonb_build_object(
    'sources', data,
    'fingerprint', md5(data::text),
    'withdrawals', COALESCE((
      SELECT jsonb_agg(to_jsonb(w) ORDER BY withdrawal_date DESC, recorded_at DESC, id)
      FROM public.owner_withdrawals AS w
    ), '[]'::jsonb)
  ) FROM source;
$$;

CREATE OR REPLACE FUNCTION public.record_owner_withdrawal(
  p_id uuid,
  p_owner text,
  p_amount_cents bigint,
  p_withdrawal_date date,
  p_note text,
  p_profit_cents bigint,
  p_fingerprint text,
  p_actor uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  existing public.owner_withdrawals%ROWTYPE;
  saved public.owner_withdrawals%ROWTYPE;
  withdrawn numeric;
  entitlement numeric;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = p_actor AND raw_app_meta_data ->> 'role' = 'admin'
  ) THEN
    RAISE EXCEPTION 'Acesso administrativo necessário.' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL OR p_owner IS NULL OR p_owner NOT IN ('rafael', 'renan')
     OR p_amount_cents IS NULL OR p_amount_cents <= 0 OR p_amount_cents > 9007199254740991
     OR p_withdrawal_date IS NULL OR p_withdrawal_date > timezone('America/Recife', now())::date
     OR p_note IS NULL OR length(p_note) > 300
     OR p_profit_cents IS NULL OR abs(p_profit_cents::numeric) > 9007199254740991 THEN
    RAISE EXCEPTION 'Dados do saque inválidos.' USING ERRCODE = '22023';
  END IF;

  -- ponytail: one lock for two partners; prevents duplicate/overlapping withdrawals.
  PERFORM pg_advisory_xact_lock(hashtextextended('rm-owner-withdrawals', 0));
  SELECT * INTO existing FROM public.owner_withdrawals WHERE id = p_id;
  IF FOUND THEN
    IF existing.owner <> p_owner OR existing.amount_cents <> p_amount_cents
       OR existing.withdrawal_date <> p_withdrawal_date OR existing.note <> btrim(p_note) THEN
      RAISE EXCEPTION 'Este identificador já pertence a outro registro.' USING ERRCODE = '22023';
    END IF;
    RETURN to_jsonb(existing);
  END IF;

  -- A changed cost/order between calculation and submission requires a refresh.
  LOCK TABLE public.pedidos, public.pacotes, public.estoque_pronta_entrega,
    public.produtos, public.loja_config, public.custos_extras IN SHARE MODE;
  IF p_fingerprint IS NULL OR md5(public.owner_finance_sources()::text) <> p_fingerprint THEN
    RAISE EXCEPTION 'Os dados financeiros mudaram. Atualize os saldos e tente novamente.' USING ERRCODE = '40001';
  END IF;

  SELECT COALESCE(sum(amount_cents), 0) INTO withdrawn
  FROM public.owner_withdrawals WHERE owner = p_owner AND voided_at IS NULL;
  -- Equal partners; rounding leftovers stay in the store, never overdistributed.
  entitlement := floor(greatest(p_profit_cents::numeric, 0) * 30 / 100);
  IF p_amount_cents > entitlement - withdrawn THEN
    RAISE EXCEPTION 'Saldo insuficiente para registrar este saque.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.owner_withdrawals (
    id, owner, amount_cents, withdrawal_date, note, profit_basis_cents, recorded_by
  ) VALUES (
    p_id, p_owner, p_amount_cents, p_withdrawal_date, btrim(p_note), p_profit_cents, p_actor
  ) RETURNING * INTO saved;
  RETURN to_jsonb(saved);
END;
$$;

CREATE OR REPLACE FUNCTION public.void_owner_withdrawal(p_id uuid, p_reason text, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  saved public.owner_withdrawals%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = p_actor AND raw_app_meta_data ->> 'role' = 'admin'
  ) THEN
    RAISE EXCEPTION 'Acesso administrativo necessário.' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION 'Informe o motivo da anulação.' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('rm-owner-withdrawals', 0));
  SELECT * INTO saved FROM public.owner_withdrawals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro de saque não encontrado.' USING ERRCODE = '22023';
  END IF;
  IF saved.voided_at IS NULL THEN
    UPDATE public.owner_withdrawals
    SET voided_at = now(), voided_by = p_actor, void_reason = btrim(p_reason)
    WHERE id = p_id RETURNING * INTO saved;
  END IF;
  RETURN to_jsonb(saved);
END;
$$;

REVOKE ALL ON FUNCTION public.owner_finance_sources() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_owner_finance_snapshot() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_owner_withdrawal(uuid, text, bigint, date, text, bigint, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.void_owner_withdrawal(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_finance_sources() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_owner_finance_snapshot() TO service_role;
GRANT EXECUTE ON FUNCTION public.record_owner_withdrawal(uuid, text, bigint, date, text, bigint, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.void_owner_withdrawal(uuid, text, uuid) TO service_role;

COMMIT;
