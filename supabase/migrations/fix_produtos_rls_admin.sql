-- Restrict INSERT/UPDATE/DELETE on produtos to admin users only
DROP POLICY IF EXISTS "Apenas admins podem modificar produtos" ON produtos;

CREATE POLICY "Apenas admins podem modificar produtos" ON produtos
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.jwt() ->> 'app_metadata'::text LIKE '%"role":"admin"%');

CREATE POLICY "Apenas admins podem atualizar produtos" ON produtos
  FOR UPDATE
  TO authenticated
  USING (auth.jwt() ->> 'app_metadata'::text LIKE '%"role":"admin"%')
  WITH CHECK (auth.jwt() ->> 'app_metadata'::text LIKE '%"role":"admin"%');

CREATE POLICY "Apenas admins podem deletar produtos" ON produtos
  FOR DELETE
  TO authenticated
  USING (auth.jwt() ->> 'app_metadata'::text LIKE '%"role":"admin"%');
