CREATE TABLE IF NOT EXISTS custos_extras (
  id BIGINT PRIMARY KEY,
  nome TEXT NOT NULL,
  quantidade INTEGER NOT NULL DEFAULT 1,
  preco NUMERIC(10,2) NOT NULL,
  data TEXT NOT NULL,
  cor TEXT NOT NULL DEFAULT '#F4A261',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE custos_extras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "custos_extras_authenticated_all" ON custos_extras
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
