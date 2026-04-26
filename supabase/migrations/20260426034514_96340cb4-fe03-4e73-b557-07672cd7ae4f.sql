-- Deny all direct access to internal counter table; updates happen via SECURITY DEFINER function only.
DROP POLICY IF EXISTS sales_quote_counters_no_access ON public.sales_quote_counters;
CREATE POLICY sales_quote_counters_no_access ON public.sales_quote_counters
FOR ALL
USING (false)
WITH CHECK (false);