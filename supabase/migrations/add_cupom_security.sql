-- Dados de influenciador e regras de uso dos cupons.
ALTER TABLE public.cupons
  ADD COLUMN IF NOT EXISTS uso_unico_por_cliente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS influenciador boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS influenciador_handle text,
  ADD COLUMN IF NOT EXISTS rev_share_percentual numeric(5,2),
  ADD COLUMN IF NOT EXISTS observacao_interna text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.cupons'::regclass
      AND conname = 'cupons_rev_share_percentual_check'
  ) THEN
    ALTER TABLE public.cupons
      ADD CONSTRAINT cupons_rev_share_percentual_check
      CHECK (
        rev_share_percentual IS NULL
        OR (rev_share_percentual >= 0 AND rev_share_percentual <= 100)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.cupons'::regclass
      AND conname = 'cupons_influenciador_dados_check'
  ) THEN
    ALTER TABLE public.cupons
      ADD CONSTRAINT cupons_influenciador_dados_check
      CHECK (
        NOT influenciador
        OR (
          NULLIF(btrim(influenciador_handle), '') IS NOT NULL
          AND rev_share_percentual IS NOT NULL
        )
      );
  END IF;
END;
$$;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS telefone_normalizado text,
  ADD COLUMN IF NOT EXISTS influenciador_handle text,
  ADD COLUMN IF NOT EXISTS rev_share_percentual numeric(5,2),
  ADD COLUMN IF NOT EXISTS valor_base_comissao numeric(10,2),
  ADD COLUMN IF NOT EXISTS comissao_calculada numeric(10,2),
  ADD COLUMN IF NOT EXISTS cupom_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.pedidos'::regclass
      AND conname = 'pedidos_cupom_id_fkey'
  ) THEN
    ALTER TABLE public.pedidos
      ADD CONSTRAINT pedidos_cupom_id_fkey
      FOREIGN KEY (cupom_id) REFERENCES public.cupons(id);
  END IF;
END;
$$;

-- pedido_id fica sem FK porque a reserva antecede a criação do pedido.
CREATE TABLE IF NOT EXISTS public.cupom_utilizacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cupom_id uuid NOT NULL REFERENCES public.cupons(id),
  pedido_id text NOT NULL,
  telefone_normalizado text,
  status text NOT NULL CHECK (status IN ('reservado', 'confirmado', 'liberado')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cupom_utilizacoes ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS cupom_utilizacoes_pedido_id_uidx
  ON public.cupom_utilizacoes (pedido_id);

CREATE UNIQUE INDEX IF NOT EXISTS cupom_utilizacoes_cupom_telefone_ativo_uidx
  ON public.cupom_utilizacoes (cupom_id, telefone_normalizado)
  WHERE status IN ('reservado', 'confirmado');

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

  IF v_cupom.uso_unico_por_cliente
     AND NULLIF(btrim(p_telefone_normalizado), '') IS NULL THEN
    RAISE EXCEPTION 'Telefone é obrigatório para este cupom';
  END IF;

  IF v_cupom.uso_unico_por_cliente
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
    status
  )
  VALUES (
    v_cupom.id,
    p_pedido_id,
    p_telefone_normalizado,
    'reservado'
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

CREATE OR REPLACE FUNCTION public.finalizar_uso_cupom(
  p_pedido_id text,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_utilizacao public.cupom_utilizacoes%ROWTYPE;
  v_status text;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('confirmado', 'liberado') THEN
    RAISE EXCEPTION 'Status de finalização inválido';
  END IF;

  IF NULLIF(btrim(p_pedido_id), '') IS NULL THEN
    RAISE EXCEPTION 'Pedido é obrigatório';
  END IF;

  SELECT u.*
    INTO v_utilizacao
    FROM public.cupom_utilizacoes AS u
   WHERE u.pedido_id = p_pedido_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilização do cupom não encontrada';
  END IF;

  PERFORM 1
     FROM public.cupons AS c
    WHERE c.id = v_utilizacao.cupom_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cupom da utilização não encontrado';
  END IF;

  SELECT u.status
    INTO v_status
    FROM public.cupom_utilizacoes AS u
   WHERE u.id = v_utilizacao.id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilização do cupom não encontrada';
  END IF;

  IF v_status = p_status THEN
    RETURN;
  END IF;

  IF v_status <> 'reservado' THEN
    RAISE EXCEPTION 'Transição de uso do cupom inválida';
  END IF;

  UPDATE public.cupom_utilizacoes
     SET status = p_status,
         updated_at = now()
   WHERE id = v_utilizacao.id;

  IF p_status = 'liberado' THEN
    UPDATE public.cupons
       SET usos_atuais = greatest(usos_atuais - 1, 0)
     WHERE id = v_utilizacao.cupom_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reservar_cupom(text, text, text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reservar_cupom(text, text, text, numeric) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_cupom(text, text, text, numeric) TO service_role;

REVOKE ALL ON FUNCTION public.finalizar_uso_cupom(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalizar_uso_cupom(text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalizar_uso_cupom(text, text) TO service_role;

DROP POLICY IF EXISTS "cupons_public_select" ON public.cupons;
