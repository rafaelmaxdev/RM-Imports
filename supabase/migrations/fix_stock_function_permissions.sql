-- Keep browser-callable admin RPCs under RLS and reserve privileged finalization for the API.

ALTER FUNCTION public.create_direct_sale(text, jsonb, text, text) SECURITY INVOKER;
ALTER FUNCTION public.receive_replenishment_order(text) SECURITY INVOKER;

REVOKE ALL ON FUNCTION public.finalize_order_admin(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_order_admin(text, text) TO service_role;
