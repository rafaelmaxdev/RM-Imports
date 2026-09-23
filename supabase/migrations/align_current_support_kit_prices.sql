INSERT INTO public.loja_config (key, value)
VALUES ('precos_base', '{"Torcedor":149.90,"Goleiro":149.90,"Treinamento":149.90}'::jsonb)
ON CONFLICT (key) DO UPDATE
SET value = COALESCE(public.loja_config.value, '{}'::jsonb) || EXCLUDED.value;
