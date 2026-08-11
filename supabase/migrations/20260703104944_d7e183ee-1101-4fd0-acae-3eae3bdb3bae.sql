CREATE POLICY "public_api_read_active_products"
  ON public.products
  FOR SELECT
  TO anon
  USING (is_active = true AND stock_status <> 'unavailable');

GRANT SELECT ON public.products TO anon;