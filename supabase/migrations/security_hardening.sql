-- Centralized authorization, distributed API throttling and idempotent stock restoration.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Remove legacy policies before installing one explicit policy per operation.
DO $$
DECLARE
  table_name text;
  policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'pedidos', 'produtos', 'loja_config', 'estoque_pronta_entrega',
    'pacotes', 'cupons', 'cupom_utilizacoes', 'custos_extras', 'image_cache'
  ] LOOP
    IF to_regclass('public.' || table_name) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    FOR policy_name IN
      SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = table_name
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, table_name);
    END LOOP;
  END LOOP;
END;
$$;

CREATE POLICY produtos_public_read ON public.produtos FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY produtos_admin_insert ON public.produtos FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY produtos_admin_update ON public.produtos FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY produtos_admin_delete ON public.produtos FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY loja_config_admin_read ON public.loja_config FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY loja_config_admin_insert ON public.loja_config FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY loja_config_admin_update ON public.loja_config FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY loja_config_admin_delete ON public.loja_config FOR DELETE TO authenticated USING (public.is_admin());

CREATE OR REPLACE VIEW public.loja_config_publico
WITH (security_barrier = true)
AS
SELECT key, value
FROM public.loja_config
WHERE key IN ('precos_base', 'precos_promocao', 'promocao_ativa', 'desconto_global', 'promocoes_time', 'pronta_entrega_markup');
REVOKE ALL ON public.loja_config_publico FROM PUBLIC;
GRANT SELECT ON public.loja_config_publico TO anon, authenticated;

CREATE POLICY estoque_admin_read ON public.estoque_pronta_entrega FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY estoque_admin_insert ON public.estoque_pronta_entrega FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY estoque_admin_update ON public.estoque_pronta_entrega FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY estoque_admin_delete ON public.estoque_pronta_entrega FOR DELETE TO authenticated USING (public.is_admin());

CREATE OR REPLACE VIEW public.estoque_publico
WITH (security_barrier = true)
AS
SELECT
  e.id,
  e.produto_id,
  e.tamanho,
  e.quantidade,
  e.personalizado,
  e.nome_personalizado,
  e.numero_personalizado,
  e.feminino,
  e.created_at,
  jsonb_build_object(
    'nome', p.nome,
    'imagem_urls', p.imagem_urls,
    'imagem_urls_feminina', p.imagem_urls_feminina,
    'cached_image_urls', p.cached_image_urls,
    'tipo', p.tipo,
    'time', p.time,
    'liga', p.liga,
    'temporada', p.temporada
  ) AS produtos
FROM public.estoque_pronta_entrega e
JOIN public.produtos p ON p.id = e.produto_id
WHERE e.quantidade > 0;
REVOKE ALL ON public.estoque_publico FROM PUBLIC;
GRANT SELECT ON public.estoque_publico TO anon, authenticated;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['pedidos', 'pacotes', 'cupons', 'cupom_utilizacoes', 'custos_extras', 'image_cache'] LOOP
    IF to_regclass('public.' || table_name) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())',
      table_name || '_admin_all',
      table_name
    );
  END LOOP;
END;
$$;

-- Shared rate limit state for serverless API instances. No client role receives table access.
CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  key text PRIMARY KEY,
  request_count integer NOT NULL,
  window_started_at timestamptz NOT NULL
);
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.api_rate_limits FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_api_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_count integer;
BEGIN
  IF p_key IS NULL OR length(p_key) > 160 OR p_limit < 1 OR p_window_seconds < 1 THEN
    RETURN false;
  END IF;

  INSERT INTO public.api_rate_limits AS limits (key, request_count, window_started_at)
  VALUES (p_key, 1, clock_timestamp())
  ON CONFLICT (key) DO UPDATE
    SET request_count = CASE
          WHEN limits.window_started_at <= clock_timestamp() - make_interval(secs => p_window_seconds) THEN 1
          ELSE limits.request_count + 1
        END,
        window_started_at = CASE
          WHEN limits.window_started_at <= clock_timestamp() - make_interval(secs => p_window_seconds) THEN clock_timestamp()
          ELSE limits.window_started_at
        END
  RETURNING request_count INTO current_count;

  RETURN current_count <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_api_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_api_rate_limit(text, integer, integer) TO service_role;

-- A repeated Mercado Pago webhook must never restore the same stock twice.
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS stock_reserved_at timestamptz,
  ADD COLUMN IF NOT EXISTS stock_restored_at timestamptz;

-- Existing pronta-entrega orders were reserved by the legacy client flow.
UPDATE public.pedidos
SET stock_reserved_at = COALESCE(created_at, now())
WHERE COALESCE(pronta_entrega, false)
  AND stock_reserved_at IS NULL
  AND status NOT IN ('cancelado', 'reembolsado');

CREATE OR REPLACE FUNCTION public.reserve_order_stock(p_order_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_row public.pedidos%ROWTYPE;
  item jsonb;
  v_product_id uuid;
  v_existing_id uuid;
  v_quantity integer;
  is_personalized boolean;
  personalized_name text;
  personalized_number text;
  is_feminine boolean;
BEGIN
  SELECT * INTO order_row FROM public.pedidos WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF order_row.stock_reserved_at IS NOT NULL THEN RETURN true; END IF;
  IF NOT COALESCE(order_row.pronta_entrega, false) THEN RETURN true; END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(order_row.itens::jsonb)
  LOOP
    IF NOT COALESCE((item ->> 'prontaEntrega')::boolean, false) THEN CONTINUE; END IF;
    BEGIN
      v_product_id := (item ->> 'productId')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'invalid product';
    END;
    is_personalized := COALESCE((item ->> 'personalizado')::boolean, false);
    personalized_name := CASE WHEN is_personalized THEN NULLIF(item ->> 'nomePersonalizado', '') ELSE NULL END;
    personalized_number := CASE WHEN is_personalized THEN NULLIF(item ->> 'numeroPersonalizado', '') ELSE NULL END;
    is_feminine := COALESCE((item ->> 'feminino')::boolean, false);

    v_existing_id := NULL;
    SELECT id, quantidade INTO v_existing_id, v_quantity
    FROM public.estoque_pronta_entrega
    WHERE produto_id = v_product_id
      AND tamanho = item ->> 'tamanho'
      AND personalizado = is_personalized
      AND feminino = is_feminine
      AND nome_personalizado IS NOT DISTINCT FROM personalized_name
      AND numero_personalizado IS NOT DISTINCT FROM personalized_number
    FOR UPDATE;

    IF v_existing_id IS NULL OR v_quantity < 1 THEN RAISE EXCEPTION 'stock unavailable'; END IF;
    UPDATE public.estoque_pronta_entrega SET quantidade = quantidade - 1 WHERE id = v_existing_id;
  END LOOP;

  UPDATE public.pedidos SET stock_reserved_at = clock_timestamp() WHERE id = p_order_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_order_stock(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_order_stock(text) TO service_role;

CREATE OR REPLACE FUNCTION public.restore_order_stock_once(p_order_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_row public.pedidos%ROWTYPE;
  item jsonb;
  v_product_id uuid;
  v_existing_id uuid;
  is_personalized boolean;
  personalized_name text;
  personalized_number text;
  is_feminine boolean;
BEGIN
  SELECT * INTO order_row
  FROM public.pedidos
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND OR order_row.stock_reserved_at IS NULL OR order_row.stock_restored_at IS NOT NULL OR NOT COALESCE(order_row.pronta_entrega, false) THEN
    RETURN false;
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(order_row.itens::jsonb)
  LOOP
    v_product_id := NULL;
    IF NULLIF(item ->> 'productId', '') IS NOT NULL THEN
      BEGIN
        v_product_id := (item ->> 'productId')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        v_product_id := NULL;
      END;
    END IF;
    IF v_product_id IS NULL THEN
      SELECT id INTO v_product_id FROM public.produtos WHERE nome = item ->> 'nome' LIMIT 1;
    END IF;
    IF v_product_id IS NULL THEN
      CONTINUE;
    END IF;

    is_personalized := COALESCE((item ->> 'personalizado')::boolean, false);
    personalized_name := CASE WHEN is_personalized THEN NULLIF(item ->> 'nomePersonalizado', '') ELSE NULL END;
    personalized_number := CASE WHEN is_personalized THEN NULLIF(item ->> 'numeroPersonalizado', '') ELSE NULL END;
    is_feminine := COALESCE((item ->> 'feminino')::boolean, false);

    v_existing_id := NULL;
    SELECT id INTO v_existing_id
    FROM public.estoque_pronta_entrega
    WHERE produto_id = v_product_id
      AND tamanho = item ->> 'tamanho'
      AND personalizado = is_personalized
      AND feminino = is_feminine
      AND nome_personalizado IS NOT DISTINCT FROM personalized_name
      AND numero_personalizado IS NOT DISTINCT FROM personalized_number
    FOR UPDATE;

    IF v_existing_id IS NULL THEN
      INSERT INTO public.estoque_pronta_entrega (
        produto_id, tamanho, quantidade, personalizado,
        nome_personalizado, numero_personalizado, feminino
      ) VALUES (
        v_product_id, item ->> 'tamanho', 1, is_personalized,
        personalized_name, personalized_number, is_feminine
      );
    ELSE
      UPDATE public.estoque_pronta_entrega SET quantidade = quantidade + 1 WHERE id = v_existing_id;
    END IF;
  END LOOP;

  UPDATE public.pedidos SET stock_restored_at = clock_timestamp() WHERE id = p_order_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_order_stock_once(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_order_stock_once(text) TO service_role;

-- Minimal audit trail for direct administrative writes.
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid,
  operation text NOT NULL,
  entity_table text NOT NULL,
  entity_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_audit_read ON public.admin_audit_log FOR SELECT TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.log_admin_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_data jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  row_data := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  INSERT INTO public.admin_audit_log (actor_id, operation, entity_table, entity_id)
  VALUES (auth.uid(), TG_OP, TG_TABLE_NAME, COALESCE(row_data ->> 'id', row_data ->> 'key'));
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['pedidos', 'produtos', 'loja_config', 'estoque_pronta_entrega', 'pacotes', 'cupons', 'custos_extras'] LOOP
    IF to_regclass('public.' || table_name) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS admin_audit_write ON public.%I', table_name);
    EXECUTE format(
      'CREATE TRIGGER admin_audit_write AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_admin_write()',
      table_name
    );
  END LOOP;
END;
$$;
