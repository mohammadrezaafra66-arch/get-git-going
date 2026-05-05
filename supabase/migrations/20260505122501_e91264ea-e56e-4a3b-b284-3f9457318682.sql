-- 1) currency_sources: restrict SELECT to admin/accountant
DROP POLICY IF EXISTS currency_sources_read ON public.currency_sources;
CREATE POLICY currency_sources_read ON public.currency_sources
  FOR SELECT
  USING (public.has_any_role(auth.uid(), ARRAY['admin','accountant']::app_role[]));

-- 2) credit_requests: restrict SELECT to privileged roles or own requests
DROP POLICY IF EXISTS cr_read_authed ON public.credit_requests;
CREATE POLICY cr_read_privileged ON public.credit_requests
  FOR SELECT
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[])
    OR (public.has_role(auth.uid(), 'sales'::app_role) AND requested_by = auth.uid())
  );

-- 3) suppliers: restrict INSERT to privileged roles
DROP POLICY IF EXISTS suppliers_insert_authed ON public.suppliers;
CREATE POLICY suppliers_insert_privileged ON public.suppliers
  FOR INSERT
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[])
  );

-- 4) academy_quiz_questions: hide correct_value from non-admins
-- Restrict raw table SELECT to admin/manager only
DROP POLICY IF EXISTS aqq_select_authed ON public.academy_quiz_questions;
CREATE POLICY aqq_select_admin ON public.academy_quiz_questions
  FOR SELECT
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]));

-- Public-safe view excluding correct_value, accessible to all authenticated users
CREATE OR REPLACE VIEW public.academy_quiz_questions_public
WITH (security_invoker = true)
AS
SELECT id, quiz_id, question_text, options, order_index
FROM public.academy_quiz_questions;

GRANT SELECT ON public.academy_quiz_questions_public TO authenticated;