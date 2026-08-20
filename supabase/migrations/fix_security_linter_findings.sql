-- Make public views obey the caller's grants and RLS policies.
ALTER VIEW public.loja_config_publico SET (security_invoker = true);
ALTER VIEW public.estoque_publico SET (security_invoker = true);

DROP POLICY IF EXISTS loja_config_public_read ON public.loja_config;
CREATE POLICY loja_config_public_read
  ON public.loja_config
  FOR SELECT
  TO anon, authenticated
  USING (
    key IN (
      'precos_base',
      'precos_promocao',
      'promocao_ativa',
      'desconto_global',
      'promocoes_time',
      'pronta_entrega_markup'
    )
  );

REVOKE ALL ON TABLE public.loja_config FROM anon, authenticated;
GRANT SELECT ON TABLE public.loja_config TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.loja_config TO authenticated;

DROP POLICY IF EXISTS estoque_public_read ON public.estoque_pronta_entrega;
CREATE POLICY estoque_public_read
  ON public.estoque_pronta_entrega
  FOR SELECT
  TO anon, authenticated
  USING (quantidade > 0);

REVOKE ALL ON TABLE public.estoque_pronta_entrega FROM anon, authenticated;
GRANT SELECT ON TABLE public.estoque_pronta_entrega TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.estoque_pronta_entrega TO authenticated;

-- Legacy SECURITY DEFINER helpers must not be exposed as public RPCs.
REVOKE ALL ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.incrementar_uso_cupom(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.incrementar_uso_cupom(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.log_admin_write() FROM PUBLIC, anon, authenticated;

-- Direct sales already run as an authenticated admin, so caller RLS is enough.
CREATE OR REPLACE FUNCTION public.venda_direta_entregue(pedido_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin access required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.pedidos SET status = 'enviado_fornecedor' WHERE id = $1 AND status = 'pago';
  UPDATE public.pedidos SET status = 'em_producao' WHERE id = $1 AND status = 'enviado_fornecedor';
  UPDATE public.pedidos SET status = 'a_caminho' WHERE id = $1 AND status = 'em_producao';
  UPDATE public.pedidos SET status = 'em_estoque' WHERE id = $1 AND status = 'a_caminho';
  UPDATE public.pedidos SET status = 'em_entrega' WHERE id = $1 AND status = 'em_estoque';
  UPDATE public.pedidos SET status = 'entregue' WHERE id = $1 AND status = 'em_entrega';
END;
$$;

REVOKE ALL ON FUNCTION public.venda_direta_entregue(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.venda_direta_entregue(text) TO authenticated;

-- This table is service-role only; an explicit deny policy documents that intent.
DROP POLICY IF EXISTS api_rate_limits_client_deny ON public.api_rate_limits;
CREATE POLICY api_rate_limits_client_deny
  ON public.api_rate_limits
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
