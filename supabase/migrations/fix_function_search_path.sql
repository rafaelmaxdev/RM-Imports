-- Add search_path to functions to silence lint warnings.
-- These must remain executable by anon/authenticated -- the frontend calls them.
-- Safe to run multiple times.

ALTER FUNCTION venda_direta_entregue SET search_path = public;
ALTER FUNCTION incrementar_uso_cupom SET search_path = public;
ALTER FUNCTION get_user_role SET search_path = public;
