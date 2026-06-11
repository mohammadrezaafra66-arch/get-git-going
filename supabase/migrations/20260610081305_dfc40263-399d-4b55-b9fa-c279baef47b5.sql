-- Restrict access to purchase cost & margin in product_computed_prices
-- 1) Public view (security_invoker) exposing only safe pricing columns
CREATE OR REPLACE VIEW public.product_computed_prices_public
WITH (security_invoker = true) AS
SELECT
  id, product_id, sale_price_type_id, pricing_rule_id,
  final_sale_price, rounded_sale_price,
  computed_at, computed_by, source
FROM public.product_computed_prices;

REVOKE ALL ON public.product_computed_prices_public FROM PUBLIC;
GRANT SELECT ON public.product_computed_prices_public TO authenticated;
GRANT ALL ON public.product_computed_prices_public TO service_role;

-- 2) Restrict SELECT on the base table to privileged roles only
DROP POLICY IF EXISTS pcp_read_authed ON public.product_computed_prices;
CREATE POLICY pcp_read_privileged
  ON public.product_computed_prices
  FOR SELECT
  TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));

-- 3) Stop broadcasting sensitive rows to all authenticated subscribers
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='product_computed_prices'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.product_computed_prices';
  END IF;
END $$;