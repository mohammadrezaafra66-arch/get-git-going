-- 1) SELECT policies: align with the dynamic permission matrix
DROP POLICY IF EXISTS pricing_rules_select_role_scoped ON public.pricing_rules;
CREATE POLICY pricing_rules_select_role_scoped ON public.pricing_rules FOR SELECT
USING (
  has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[])
  OR has_dynamic_permission(auth.uid(), 'pricing', 'view')
);

DROP POLICY IF EXISTS shipping_rules_read ON public.shipping_cost_rules;
CREATE POLICY shipping_rules_read ON public.shipping_cost_rules FOR SELECT
USING (
  has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[])
  OR has_dynamic_permission(auth.uid(), 'pricing', 'view')
);

DROP POLICY IF EXISTS pcp_read_privileged ON public.product_computed_prices;
CREATE POLICY pcp_read_privileged ON public.product_computed_prices FOR SELECT
USING (
  has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[])
  OR has_dynamic_permission(auth.uid(), 'pricing', 'view')
);

-- 2) Rebuild the public sale-price view with the columns the frontend needs.
DROP VIEW IF EXISTS public.product_computed_prices_public;

CREATE VIEW public.product_computed_prices_public
WITH (security_invoker = true) AS
SELECT
  id,
  product_id,
  sale_price_type_id,
  pricing_rule_id,
  final_sale_price,
  rounded_sale_price,
  computed_at,
  source
FROM public.product_computed_prices;

REVOKE ALL ON public.product_computed_prices_public FROM anon;
GRANT SELECT ON public.product_computed_prices_public TO authenticated;