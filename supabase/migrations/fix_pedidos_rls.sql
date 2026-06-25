-- Fix RLS policies for pedidos table:
-- Restrict SELECT to authenticated users only (currently public)
-- Restrict UPDATE/DELETE to authenticated users only

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Qualquer um pode ler pedidos" ON pedidos;
DROP POLICY IF EXISTS "Qualquer um pode criar pedidos" ON pedidos;
DROP POLICY IF EXISTS "Qualquer um pode atualizar pedidos" ON pedidos;

-- Create restricted policies
CREATE POLICY "Apenas autenticados podem ler pedidos"
  ON pedidos FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Qualquer um pode criar pedidos"
  ON pedidos FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Apenas autenticados podem atualizar pedidos"
  ON pedidos FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Restrict venda_direta_entregue to service_role only (SECURITY DEFINER function)
REVOKE EXECUTE ON FUNCTION venda_direta_entregue FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION venda_direta_entregue TO service_role;
