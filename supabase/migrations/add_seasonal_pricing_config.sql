-- Expose only the public pricing configuration, including seasonal pricing.
INSERT INTO public.loja_config (key, value)
VALUES
  ('ano_temporada_lancamento', '2026'::jsonb),
  ('desconto_temporada_anterior', '{"Torcedor":6.671,"Jogador":5.266,"Retrô":0,"Manga Longa Torcedor":0,"Manga Longa Jogador":0,"Manga Longa Retrô":0,"Goleiro":0,"Treinamento":0,"Polo":0,"NBA":0}'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE VIEW public.loja_config_publico
WITH (security_barrier = true, security_invoker = true)
AS
SELECT key, value
FROM public.loja_config
WHERE key IN (
  'precos_base',
  'precos_promocao',
  'promocao_ativa',
  'desconto_global',
  'promocoes_time',
  'pronta_entrega_markup',
  'ano_temporada_lancamento',
  'desconto_temporada_anterior'
);

REVOKE ALL ON public.loja_config_publico FROM PUBLIC;
GRANT SELECT ON public.loja_config_publico TO anon, authenticated;

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
      'pronta_entrega_markup',
      'ano_temporada_lancamento',
      'desconto_temporada_anterior'
    )
  );
