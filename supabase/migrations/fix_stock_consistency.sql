-- Make direct sales and administrative finalization atomic and idempotent.

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
    'em_entrega→entregue', 'em_entrega→cancelado',
    'entregue→reembolsado'
  ];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('pendente', 'pago') THEN
      RAISE EXCEPTION 'Invalid initial status: %', NEW.status;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status <> NEW.status
     AND NOT (OLD.status || '→' || NEW.status = ANY(allowed_transitions)) THEN
    RAISE EXCEPTION 'Invalid status transition: % → %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_order_admin(
  p_order_id text,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_row public.pedidos%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin access required' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('cancelado', 'reembolsado') THEN
    RAISE EXCEPTION 'invalid final status';
  END IF;

  SELECT * INTO order_row
  FROM public.pedidos
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF order_row.status = p_status THEN RETURN; END IF;

  UPDATE public.pedidos SET status = p_status WHERE id = p_order_id;
  PERFORM public.restore_order_stock_once(p_order_id);

  IF p_status = 'cancelado' AND order_row.status = 'pendente' AND order_row.cupom_id IS NOT NULL THEN
    PERFORM public.finalizar_uso_cupom(p_order_id, 'liberado');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_order_admin(text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_order_admin(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_direct_sale(
  p_order_id text,
  p_items jsonb,
  p_customer_name text,
  p_payment_method text
)
RETURNS SETOF public.pedidos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
  product_row public.produtos%ROWTYPE;
  stock_id uuid;
  stock_quantity integer;
  is_personalized boolean;
  is_feminine boolean;
  personalized_name text;
  personalized_number text;
  unit_price numeric;
  order_items jsonb := '[]'::jsonb;
  order_total numeric := 0;
  local_now timestamp := timezone('America/Recife', now());
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin access required' USING ERRCODE = '42501';
  END IF;
  IF p_order_id !~ '^UL-[A-Z2-9]{8}$' THEN RAISE EXCEPTION 'invalid order id'; END IF;
  IF p_customer_name IS NULL OR length(btrim(p_customer_name)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid customer name';
  END IF;
  IF p_payment_method NOT IN ('pix', 'credit_card', 'debit_card') THEN
    RAISE EXCEPTION 'invalid payment method';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'invalid items';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO product_row
    FROM public.produtos
    WHERE id = NULLIF(item ->> 'productId', '')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'product not found'; END IF;

    unit_price := (item ->> 'preco')::numeric;
    IF unit_price <= 0 OR unit_price > 2000 THEN RAISE EXCEPTION 'invalid item price'; END IF;
    IF NULLIF(item ->> 'tamanho', '') IS NULL THEN RAISE EXCEPTION 'invalid size'; END IF;

    is_personalized := COALESCE((item ->> 'personalizado')::boolean, false);
    is_feminine := COALESCE((item ->> 'feminino')::boolean, false);
    personalized_name := CASE WHEN is_personalized THEN NULLIF(item ->> 'nomePersonalizado', '') ELSE NULL END;
    personalized_number := CASE WHEN is_personalized THEN NULLIF(item ->> 'numeroPersonalizado', '') ELSE NULL END;

    stock_id := NULL;
    SELECT id, quantidade INTO stock_id, stock_quantity
    FROM public.estoque_pronta_entrega
    WHERE produto_id = product_row.id
      AND tamanho = item ->> 'tamanho'
      AND personalizado = is_personalized
      AND feminino = is_feminine
      AND nome_personalizado IS NOT DISTINCT FROM personalized_name
      AND numero_personalizado IS NOT DISTINCT FROM personalized_number
    FOR UPDATE;

    IF stock_id IS NULL OR stock_quantity < 1 THEN RAISE EXCEPTION 'stock unavailable'; END IF;
    UPDATE public.estoque_pronta_entrega SET quantidade = quantidade - 1 WHERE id = stock_id;

    order_total := order_total + unit_price;
    order_items := order_items || jsonb_build_array(jsonb_build_object(
      'productId', product_row.id,
      'nome', product_row.nome,
      'tipo', product_row.tipo,
      'temporada', product_row.temporada,
      'tamanho', item ->> 'tamanho',
      'genero', CASE WHEN is_feminine THEN 'Feminino' ELSE 'Masculino' END,
      'personalizado', is_personalized,
      'nomePersonalizado', personalized_name,
      'numeroPersonalizado', personalized_number,
      'preco', unit_price,
      'yupooUrl', COALESCE(product_row.yupoo_url, ''),
      'feminino', is_feminine,
      'prontaEntrega', true
    ));
  END LOOP;

  IF order_total > 2000 THEN RAISE EXCEPTION 'invalid order total'; END IF;

  INSERT INTO public.pedidos (
    id, data, hora, itens, total, status, endereco, payment_method,
    admin_order, pronta_entrega, reposicao, stock_reserved_at
  ) VALUES (
    p_order_id,
    to_char(local_now, 'DD/MM/YYYY'),
    to_char(local_now, 'HH24:MI'),
    order_items,
    order_total,
    'pago',
    jsonb_build_object(
      'nome', btrim(p_customer_name), 'rua', '', 'numero', '', 'complemento', '',
      'bairro', '', 'cidade', '', 'estado', '', 'cep', '', 'telefone', '',
      'deliveryMethod', 'venda_direta'
    ),
    p_payment_method,
    false, true, false, now()
  );

  UPDATE public.pedidos SET status = 'enviado_fornecedor' WHERE id = p_order_id;
  UPDATE public.pedidos SET status = 'em_producao' WHERE id = p_order_id;
  UPDATE public.pedidos SET status = 'a_caminho' WHERE id = p_order_id;
  UPDATE public.pedidos SET status = 'em_estoque' WHERE id = p_order_id;
  UPDATE public.pedidos SET status = 'em_entrega' WHERE id = p_order_id;
  UPDATE public.pedidos SET status = 'entregue' WHERE id = p_order_id;

  RETURN QUERY SELECT * FROM public.pedidos WHERE id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_direct_sale(text, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_direct_sale(text, jsonb, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.receive_replenishment_order(p_order_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_row public.pedidos%ROWTYPE;
  item jsonb;
  v_product_id uuid;
  stock_id uuid;
  stock_quantity integer;
  is_personalized boolean;
  is_feminine boolean;
  personalized_name text;
  personalized_number text;
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

    stock_id := NULL;
    SELECT id, quantidade INTO stock_id, stock_quantity
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
        produto_id, tamanho, quantidade, personalizado,
        nome_personalizado, numero_personalizado, feminino
      ) VALUES (
        v_product_id, item ->> 'tamanho', 1, is_personalized,
        personalized_name, personalized_number, is_feminine
      )
      ON CONFLICT DO NOTHING
      RETURNING id INTO stock_id;

      IF stock_id IS NULL THEN
        SELECT id, quantidade INTO stock_id, stock_quantity
        FROM public.estoque_pronta_entrega
        WHERE produto_id = v_product_id
          AND tamanho = item ->> 'tamanho'
          AND personalizado = is_personalized
          AND feminino = is_feminine
          AND nome_personalizado IS NOT DISTINCT FROM personalized_name
          AND numero_personalizado IS NOT DISTINCT FROM personalized_number
        FOR UPDATE;
        UPDATE public.estoque_pronta_entrega
        SET quantidade = stock_quantity + 1
        WHERE id = stock_id;
      END IF;
    ELSE
      UPDATE public.estoque_pronta_entrega
      SET quantidade = stock_quantity + 1
      WHERE id = stock_id;
    END IF;
  END LOOP;

  UPDATE public.pedidos SET reposicao = true WHERE id = p_order_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.receive_replenishment_order(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.receive_replenishment_order(text) TO authenticated;
