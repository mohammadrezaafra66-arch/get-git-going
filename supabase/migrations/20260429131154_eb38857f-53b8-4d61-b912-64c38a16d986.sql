REVOKE EXECUTE ON FUNCTION public.has_dynamic_permission(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_dynamic_permission(uuid, text, text) TO authenticated;