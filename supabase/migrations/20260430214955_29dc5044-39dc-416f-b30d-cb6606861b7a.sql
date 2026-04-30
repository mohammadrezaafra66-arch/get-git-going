DROP POLICY IF EXISTS "Authenticated can view kpi rules" ON public.gamification_kpi_rules;

CREATE POLICY "Admin/manager can view kpi rules"
  ON public.gamification_kpi_rules FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));