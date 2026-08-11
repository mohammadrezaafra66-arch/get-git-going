-- 298-down.sql — reverse migration 298 (search_visible_persons)
-- No BEGIN / COMMIT — harness may \i this inside an outer transaction.

DROP FUNCTION IF EXISTS public.search_visible_persons(text, integer, integer, text);
DROP FUNCTION IF EXISTS public.search_visible_persons(text, integer, integer);

-- Restore pre-298 aliases SELECT wording (EXISTS on persons, RLS-filtered).
DROP POLICY IF EXISTS person_aliases_select_via_person ON public.person_aliases;
CREATE POLICY person_aliases_select_via_person
  ON public.person_aliases
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.persons p WHERE p.id = person_aliases.person_id));

NOTIFY pgrst, 'reload schema';
