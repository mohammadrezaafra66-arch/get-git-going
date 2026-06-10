-- 1) Person-related child tables: mirror persons visibility_scope rules

DROP POLICY IF EXISTS person_identifiers_select_via_person ON public.person_identifiers;
CREATE POLICY person_identifiers_select_via_person ON public.person_identifiers
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.persons p
    WHERE p.id = person_identifiers.person_id
      AND (
        (p.visibility_scope = 'internal_general' AND public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant','sales','viewer']::app_role[]))
        OR (p.visibility_scope = 'restricted_finance' AND public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]))
        OR (p.visibility_scope = 'restricted_executive' AND public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]))
      )
  )
);

DROP POLICY IF EXISTS person_context_links_select_via_person ON public.person_context_links;
CREATE POLICY person_context_links_select_via_person ON public.person_context_links
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.persons p
    WHERE p.id = person_context_links.person_id
      AND (
        (p.visibility_scope = 'internal_general' AND public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant','sales','viewer']::app_role[]))
        OR (p.visibility_scope = 'restricted_finance' AND public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]))
        OR (p.visibility_scope = 'restricted_executive' AND public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]))
      )
  )
);

DROP POLICY IF EXISTS pfv_select_via_person ON public.person_field_values;
CREATE POLICY pfv_select_via_person ON public.person_field_values
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.persons p
    WHERE p.id = person_field_values.person_id
      AND (
        (p.visibility_scope = 'internal_general' AND public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant','sales','viewer']::app_role[]))
        OR (p.visibility_scope = 'restricted_finance' AND public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]))
        OR (p.visibility_scope = 'restricted_executive' AND public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]))
      )
  )
);

-- 2) currency_sources: revoke column-level SELECT on api_key from non-service roles
REVOKE SELECT (api_key) ON public.currency_sources FROM PUBLIC;
REVOKE SELECT (api_key) ON public.currency_sources FROM anon;
REVOKE SELECT (api_key) ON public.currency_sources FROM authenticated;
-- service_role retains GRANT ALL.

-- 3) waybills: remove viewer role from SELECT policy
DROP POLICY IF EXISTS waybills_select ON public.waybills;
CREATE POLICY waybills_select ON public.waybills
FOR SELECT TO authenticated USING (
  public.has_any_role(auth.uid(), ARRAY['admin','manager','sales','accountant']::app_role[])
);