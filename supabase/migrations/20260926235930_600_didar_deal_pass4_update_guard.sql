SET client_encoding = 'UTF8';

-- PASS 4 P11: let a sales UPDATE reach the row so the owner/delete trigger can
-- RAISE (PostgREST PATCH on others was a silent 200 + 0 rows under owner-only RLS).
-- WITH CHECK stays owner/author/privileged so other columns on others' deals still refuse.

DROP POLICY IF EXISTS sales_interactions_update_staff ON public.sales_interactions;
CREATE POLICY sales_interactions_update_staff ON public.sales_interactions
  FOR UPDATE TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
    OR author_id = auth.uid()
    OR salesperson_id = auth.uid()
    OR (
      kind = 'request'
      AND public.has_any_role(auth.uid(), ARRAY['sales', 'admin', 'manager', 'accountant']::text[])
    )
  )
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
    OR author_id = auth.uid()
    OR salesperson_id = auth.uid()
  );
