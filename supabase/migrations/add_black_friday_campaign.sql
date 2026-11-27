BEGIN;

INSERT INTO public.loja_config (key, value)
VALUES ('black_friday', 'null'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE VIEW public.loja_config_publico
WITH (security_barrier = true, security_invoker = true)
AS
SELECT key, value FROM public.loja_config
WHERE key IN (
  'precos_base', 'precos_promocao', 'promocao_ativa',
  'desconto_global', 'desconto_global_ends_at', 'desconto_global_nome',
  'promocoes_time', 'pronta_entrega_markup',
  'ano_temporada_lancamento', 'desconto_temporada_anterior', 'black_friday'
);

REVOKE ALL ON public.loja_config_publico FROM PUBLIC;
GRANT SELECT ON public.loja_config_publico TO anon, authenticated;

DROP POLICY IF EXISTS loja_config_public_read ON public.loja_config;
CREATE POLICY loja_config_public_read ON public.loja_config
FOR SELECT TO anon, authenticated
USING (key IN (
  'precos_base', 'precos_promocao', 'promocao_ativa',
  'desconto_global', 'desconto_global_ends_at', 'desconto_global_nome',
  'promocoes_time', 'pronta_entrega_markup',
  'ano_temporada_lancamento', 'desconto_temporada_anterior', 'black_friday'
));

COMMIT;
