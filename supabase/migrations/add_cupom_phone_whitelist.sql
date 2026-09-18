ALTER TABLE public.cupons
  ADD COLUMN IF NOT EXISTS telefones_sem_limite text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.cupom_utilizacoes
  ADD COLUMN IF NOT EXISTS sem_limite_por_cliente boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.cupons'::regclass
      AND conname = 'cupons_telefones_sem_limite_format_check'
  ) THEN
    ALTER TABLE public.cupons
      ADD CONSTRAINT cupons_telefones_sem_limite_format_check
      CHECK (
        telefones_sem_limite::text ~ '^\{(55[0-9]{10,11}(,55[0-9]{10,11})*)?\}$'
      );
  END IF;
END;
$$;

DROP INDEX IF EXISTS public.cupom_utilizacoes_cupom_telefone_ativo_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS cupom_utilizacoes_cupom_telefone_ativo_uidx
  ON public.cupom_utilizacoes (cupom_id, telefone_normalizado)
  WHERE status IN ('reservado', 'confirmado')
    AND NOT sem_limite_por_cliente;

CREATE OR REPLACE FUNCTION public.reservar_cupom(
  p_cupom_codigo text,
  p_telefone_normalizado text,
  p_pedido_id text,
  p_total numeric
)
RETURNS TABLE (
  cupom_id uuid,
  codigo text,
  desconto numeric,
  influenciador_handle text,
  rev_share_percentual numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cupom public.cupons%ROWTYPE;
  v_desconto numeric;
  v_sem_limite_por_cliente boolean;
BEGIN
  IF NULLIF(btrim(p_cupom_codigo), '') IS NULL THEN
    RAISE EXCEPTION 'Código do cupom é obrigatório';
  END IF;

  IF NULLIF(btrim(p_pedido_id), '') IS NULL THEN
    RAISE EXCEPTION 'Pedido é obrigatório';
  END IF;

  IF p_total IS NULL OR p_total < 0 THEN
    RAISE EXCEPTION 'Total do pedido inválido';
  END IF;

  SELECT c.*
    INTO v_cupom
    FROM public.cupons AS c
   WHERE c.codigo = p_cupom_codigo
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cupom não encontrado';
  END IF;

  IF NOT v_cupom.ativo THEN
    RAISE EXCEPTION 'Cupom inativo';
  END IF;

  IF v_cupom.data_expiracao IS NOT NULL
     AND v_cupom.data_expiracao <= now() THEN
    RAISE EXCEPTION 'Cupom expirado';
  END IF;

  IF v_cupom.valor_minimo_pedido IS NOT NULL
     AND p_total < v_cupom.valor_minimo_pedido THEN
    RAISE EXCEPTION 'Pedido abaixo do valor mínimo do cupom';
  END IF;

  IF v_cupom.uso_maximo IS NOT NULL
     AND v_cupom.usos_atuais >= v_cupom.uso_maximo THEN
    RAISE EXCEPTION 'Limite de uso do cupom atingido';
  END IF;

  v_sem_limite_por_cliente := NOT coalesce(v_cupom.uso_unico_por_cliente, false)
    OR coalesce(
      p_telefone_normalizado = ANY(v_cupom.telefones_sem_limite),
      false
    );

  IF v_cupom.uso_unico_por_cliente
     AND NULLIF(btrim(p_telefone_normalizado), '') IS NULL THEN
    RAISE EXCEPTION 'Telefone é obrigatório para este cupom';
  END IF;

  IF v_cupom.uso_unico_por_cliente
     AND NOT v_sem_limite_por_cliente
     AND EXISTS (
       SELECT 1
       FROM public.cupom_utilizacoes AS u
       WHERE u.cupom_id = v_cupom.id
         AND u.telefone_normalizado = p_telefone_normalizado
         AND u.status IN ('reservado', 'confirmado')
     ) THEN
    RAISE EXCEPTION 'Cupom já reservado para este cliente';
  END IF;

  IF v_cupom.tipo = 'porcentagem' THEN
    v_desconto := p_total * v_cupom.valor / 100;
  ELSE
    v_desconto := v_cupom.valor;
  END IF;

  v_desconto := round(
    least(
      v_desconto,
      coalesce(v_cupom.desconto_maximo, v_desconto),
      p_total
    ),
    2
  );

  INSERT INTO public.cupom_utilizacoes (
    cupom_id,
    pedido_id,
    telefone_normalizado,
    status,
    sem_limite_por_cliente
  )
  VALUES (
    v_cupom.id,
    p_pedido_id,
    p_telefone_normalizado,
    'reservado',
    v_sem_limite_por_cliente
  );

  UPDATE public.cupons
     SET usos_atuais = usos_atuais + 1
   WHERE id = v_cupom.id;

  RETURN QUERY
  SELECT v_cupom.id,
         v_cupom.codigo,
         v_desconto,
         v_cupom.influenciador_handle,
         v_cupom.rev_share_percentual;
END;
$$;

REVOKE ALL ON FUNCTION public.reservar_cupom(text, text, text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reservar_cupom(text, text, text, numeric) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_cupom(text, text, text, numeric) TO service_role;
