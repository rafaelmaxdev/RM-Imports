BEGIN;

INSERT INTO public.loja_config (key, value)
VALUES ('desconto_global_nome', 'null'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE VIEW public.loja_config_publico
WITH (security_barrier = true, security_invoker = true)
AS
SELECT key, value FROM public.loja_config
WHERE key IN (
  'precos_base', 'precos_promocao', 'promocao_ativa',
  'desconto_global', 'desconto_global_ends_at', 'desconto_global_nome',
  'promocoes_time', 'pronta_entrega_markup',
  'ano_temporada_lancamento', 'desconto_temporada_anterior'
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
  'ano_temporada_lancamento', 'desconto_temporada_anterior'
));

-- Supply the existing campaign's name without replacing its discount/deadline.
UPDATE public.loja_config
SET value = jsonb_set(value, '{Santa Cruz,nome}',
  '"SANTA SUBIU, PREÇO CAIU!"'::jsonb)
WHERE key = 'promocoes_time'
  AND jsonb_typeof(value -> 'Santa Cruz') = 'object'
  AND COALESCE(value #>> '{Santa Cruz,nome}', '') = '';

COMMIT;
