-- Security fixes: restrict anon SELECT on products columns, narrow profile_field_definitions public read

-- 1) products: revoke anon access to sensitive columns (keep policy for public sale list which only needs safe columns)
REVOKE SELECT ON TABLE public.products FROM anon;
GRANT SELECT (id, name, description, brand_id, category_id, stock_status, model, color, capacity, primary_spec, is_active)
  ON public.products TO anon;

-- Also restrict the anon read policy to active products only
DROP POLICY IF EXISTS products_public_read ON public.products;
CREATE POLICY products_public_read ON public.products
  FOR SELECT TO anon
  USING (is_active = true);

-- 2) profile_field_definitions: limit public read to fields actually shown on the public register form
DROP POLICY IF EXISTS "Anyone can read active fields for register" ON public.profile_field_definitions;
CREATE POLICY "Public can read register form fields" ON public.profile_field_definitions
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true AND show_on_register = true);
