GRANT SELECT ON public.products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;

GRANT SELECT ON public.product_computed_prices_public TO anon;
GRANT SELECT ON public.product_computed_prices_public TO authenticated;
GRANT ALL ON public.product_computed_prices_public TO service_role;