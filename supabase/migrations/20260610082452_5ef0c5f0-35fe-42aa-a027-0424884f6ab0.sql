-- Fix sensitive data exposure on purchase_items and pricing_rules
-- 1) purchase_items: remove broad authenticated SELECT, restrict to admin/manager/accountant
DROP POLICY IF EXISTS "all authenticated read purchase_items" ON public.purchase_items;
CREATE POLICY "purchase_items_select_role_scoped"
  ON public.purchase_items
  FOR SELECT
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));

-- 2) pricing_rules: replace dynamic permission policy with strict role-scoped policy
DROP POLICY IF EXISTS "pricing_rules_select_dynamic" ON public.pricing_rules;
CREATE POLICY "pricing_rules_select_role_scoped"
  ON public.pricing_rules
  FOR SELECT
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));