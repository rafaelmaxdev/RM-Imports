-- Run after add_package_item_costs.sql. Keep the service-only snapshot and fingerprint in sync.
BEGIN;

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
        'custo', custo, 'frete', frete, 'taxa_importacao', taxa_importacao,
        'custos_itens_usd', custos_itens_usd
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

REVOKE ALL ON FUNCTION public.owner_finance_sources() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_finance_sources() TO service_role;

COMMIT;
