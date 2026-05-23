DROP POLICY IF EXISTS "crf_read" ON public.currency_rate_fetches;

CREATE POLICY "crf_read"
  ON public.currency_rate_fetches FOR SELECT
  TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));