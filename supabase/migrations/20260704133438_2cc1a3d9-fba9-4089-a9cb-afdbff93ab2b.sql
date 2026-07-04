
-- Deny-all policies for internal counter tables
-- These tables are only touched server-side (service_role bypasses RLS).
-- Adding explicit deny policies satisfies the "RLS enabled no policy" linter.

CREATE POLICY "Deny all client access" ON public.product_sku_counters
  FOR ALL TO authenticated, anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Deny all client access" ON public.waybill_number_counter
  FOR ALL TO authenticated, anon
  USING (false) WITH CHECK (false);
