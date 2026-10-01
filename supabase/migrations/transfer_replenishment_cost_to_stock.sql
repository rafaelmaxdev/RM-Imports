-- Persist each replenishment item's landed cost so a later direct sale can
-- calculate profit from the stock row.
CREATE OR REPLACE FUNCTION public.receive_replenishment_order(p_order_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  order_row public.pedidos%ROWTYPE;
  item jsonb;
  v_product_id uuid;
  stock_id uuid;
  stock_quantity integer;
  stock_cost numeric;
  is_personalized boolean;
  is_feminine boolean;
  personalized_name text;
  personalized_number text;
  v_cost_base jsonb := '{}'::jsonb;
  v_personalization_cost jsonb := '{}'::jsonb;
  v_item_cost_usd numeric;
  v_package_cost numeric;
  v_package_shipping numeric;
  v_package_tax numeric;
  v_dollar_rate numeric;
  v_package_cost_usd numeric;
  v_landed_cost numeric;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin access required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO order_row
  FROM public.pedidos
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF COALESCE(order_row.reposicao, false) THEN RETURN false; END IF;
  IF NOT COALESCE(order_row.pronta_entrega, false) OR order_row.status NOT IN ('a_caminho', 'em_estoque') THEN
    RAISE EXCEPTION 'order is not ready for replenishment';
  END IF;

  SELECT value INTO v_cost_base FROM public.loja_config WHERE key = 'custo_base';
  SELECT value INTO v_personalization_cost FROM public.loja_config WHERE key = 'personalizacao_custo';

  SELECT custo, frete, taxa_importacao, dolar_rate
  INTO v_package_cost, v_package_shipping, v_package_tax, v_dollar_rate
  FROM public.pacotes
  WHERE CASE jsonb_typeof(pedido_ids)
    WHEN 'array' THEN pedido_ids ? p_order_id
    WHEN 'string' THEN (pedido_ids #>> '{}')::jsonb ? p_order_id
    ELSE false
  END
  ORDER BY created_at DESC
  LIMIT 1;

  IF COALESCE(v_package_cost, 0) > 0 AND COALESCE(v_dollar_rate, 0) > 0 THEN
    v_package_cost_usd := v_package_cost / v_dollar_rate;
  END IF;

  IF order_row.status = 'a_caminho' THEN
    UPDATE public.pedidos SET status = 'em_estoque' WHERE id = p_order_id;
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
    IF v_product_id IS NULL THEN RAISE EXCEPTION 'product not found'; END IF;

    is_personalized := COALESCE((item ->> 'personalizado')::boolean, false);
    is_feminine := COALESCE((item ->> 'feminino')::boolean, false);
    personalized_name := CASE WHEN is_personalized THEN NULLIF(item ->> 'nomePersonalizado', '') ELSE NULL END;
    personalized_number := CASE WHEN is_personalized THEN NULLIF(item ->> 'numeroPersonalizado', '') ELSE NULL END;
    v_item_cost_usd := COALESCE((v_cost_base ->> (item ->> 'tipo'))::numeric, 0)
      + CASE WHEN is_personalized THEN COALESCE((v_personalization_cost ->> (item ->> 'tipo'))::numeric, 0) ELSE 0 END;
    v_landed_cost := NULL;
    IF v_item_cost_usd > 0 AND COALESCE(v_package_cost_usd, 0) > 0 THEN
      v_landed_cost := round(
        v_item_cost_usd * v_dollar_rate
        + COALESCE(v_package_shipping, 0) * v_item_cost_usd / v_package_cost_usd
        + COALESCE(v_package_tax, 0) * v_item_cost_usd / v_package_cost_usd,
        2
      );
    END IF;

    stock_id := NULL;
    SELECT id, quantidade, custo INTO stock_id, stock_quantity, stock_cost
    FROM public.estoque_pronta_entrega
    WHERE produto_id = v_product_id
      AND tamanho = item ->> 'tamanho'
      AND personalizado = is_personalized
      AND feminino = is_feminine
      AND nome_personalizado IS NOT DISTINCT FROM personalized_name
      AND numero_personalizado IS NOT DISTINCT FROM personalized_number
    FOR UPDATE;

    IF stock_id IS NULL THEN
      INSERT INTO public.estoque_pronta_entrega (
        produto_id, tamanho, quantidade, custo, personalizado,
        nome_personalizado, numero_personalizado, feminino
      ) VALUES (
        v_product_id, item ->> 'tamanho', 1, v_landed_cost, is_personalized,
        personalized_name, personalized_number, is_feminine
      )
      ON CONFLICT DO NOTHING
      RETURNING id INTO stock_id;

      IF stock_id IS NULL THEN
        SELECT id, quantidade, custo INTO stock_id, stock_quantity, stock_cost
        FROM public.estoque_pronta_entrega
        WHERE produto_id = v_product_id
          AND tamanho = item ->> 'tamanho'
          AND personalizado = is_personalized
          AND feminino = is_feminine
          AND nome_personalizado IS NOT DISTINCT FROM personalized_name
          AND numero_personalizado IS NOT DISTINCT FROM personalized_number
        FOR UPDATE;
        UPDATE public.estoque_pronta_entrega
        SET quantidade = stock_quantity + 1,
            custo = CASE
              WHEN v_landed_cost IS NULL THEN stock_cost
              WHEN stock_quantity = 0 OR stock_cost IS NULL THEN v_landed_cost
              ELSE round((stock_cost * stock_quantity + v_landed_cost) / (stock_quantity + 1), 2)
            END
        WHERE id = stock_id;
      END IF;
    ELSE
      UPDATE public.estoque_pronta_entrega
      SET quantidade = stock_quantity + 1,
          custo = CASE
            WHEN v_landed_cost IS NULL THEN stock_cost
            WHEN stock_quantity = 0 OR stock_cost IS NULL THEN v_landed_cost
            ELSE round((stock_cost * stock_quantity + v_landed_cost) / (stock_quantity + 1), 2)
          END
      WHERE id = stock_id;
    END IF;
  END LOOP;

  UPDATE public.pedidos SET reposicao = true WHERE id = p_order_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.receive_replenishment_order(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_replenishment_order(text) TO authenticated;
