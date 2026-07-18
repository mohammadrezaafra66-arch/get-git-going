
DROP POLICY IF EXISTS "Admin/manager can insert kpis" ON public.gamification_kpis;
DROP POLICY IF EXISTS "Admin/manager can update kpis" ON public.gamification_kpis;
DROP POLICY IF EXISTS "Admin/manager can delete kpis" ON public.gamification_kpis;

CREATE POLICY "Admin can insert kpis" ON public.gamification_kpis
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can update kpis" ON public.gamification_kpis
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can delete kpis" ON public.gamification_kpis
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
