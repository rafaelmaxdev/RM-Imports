-- Venda Direta: RPC function to mark an order as "entregue" directly
-- This bypasses the status transition trigger for admin direct sales.
-- Execute this in the Supabase SQL Editor.

CREATE OR REPLACE FUNCTION venda_direta_entregue(pedido_id text)
RETURNS void AS $$
BEGIN
  -- Disable the trigger temporarily for this transaction
  -- by updating step by step through valid transitions
  UPDATE pedidos SET status = 'enviado_fornecedor' WHERE id = pedido_id AND status = 'pago';
  UPDATE pedidos SET status = 'em_producao' WHERE id = pedido_id AND status = 'enviado_fornecedor';
  UPDATE pedidos SET status = 'a_caminho' WHERE id = pedido_id AND status = 'em_producao';
  UPDATE pedidos SET status = 'em_estoque' WHERE id = pedido_id AND status = 'a_caminho';
  UPDATE pedidos SET status = 'em_entrega' WHERE id = pedido_id AND status = 'em_estoque';
  UPDATE pedidos SET status = 'entregue' WHERE id = pedido_id AND status = 'em_entrega';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
