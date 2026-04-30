REVOKE EXECUTE ON FUNCTION public.get_product_recommendations(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_product_recommendations(uuid) TO authenticated;