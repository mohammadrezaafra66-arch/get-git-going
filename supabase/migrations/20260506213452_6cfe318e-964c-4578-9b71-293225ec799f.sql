-- Security fix: revoke EXECUTE on sensitive credit functions from anon/PUBLIC
REVOKE ALL ON FUNCTION public.calculate_credit_score(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_credit_score(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_customer_credit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_customer_credit(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.hold_credit(uuid, numeric, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hold_credit(uuid, numeric, uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.release_credit(uuid, numeric, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_credit(uuid, numeric, uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.increase_credit(uuid, numeric, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increase_credit(uuid, numeric, uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public._ensure_credit_balance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._ensure_credit_balance(uuid) TO authenticated;