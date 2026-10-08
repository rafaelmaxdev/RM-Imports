BEGIN;

-- Existing packages do not acquire fabricated historical timestamps.
ALTER TABLE public.pacotes
  ADD COLUMN IF NOT EXISTS track_status_history boolean NOT NULL DEFAULT false;
ALTER TABLE public.pacotes
  ALTER COLUMN track_status_history SET DEFAULT true;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS status_history jsonb NOT NULL DEFAULT '[]'::jsonb
  CHECK (jsonb_typeof(status_history) = 'array');

CREATE OR REPLACE FUNCTION public.record_order_status_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status_history := '[]'::jsonb;
    RETURN NEW;
  END IF;

  -- Clients cannot edit history independently of a real status transition.
  NEW.status_history := OLD.status_history;
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pacotes AS p
    WHERE p.track_status_history
      AND (CASE jsonb_typeof(p.pedido_ids)
        WHEN 'array' THEN p.pedido_ids
        WHEN 'string' THEN (p.pedido_ids #>> '{}')::jsonb
        ELSE '[]'::jsonb
      END) ? NEW.id
  ) THEN
    NEW.status_history := OLD.status_history || jsonb_build_array(
      jsonb_build_object(
        'status', NEW.status,
        'from_status', OLD.status,
        'changed_at', clock_timestamp(),
        'source', 'status_transition'
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.record_order_status_history() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS record_order_status_history ON public.pedidos;
CREATE TRIGGER record_order_status_history
BEFORE INSERT OR UPDATE ON public.pedidos
FOR EACH ROW EXECUTE FUNCTION public.record_order_status_history();

COMMIT;
