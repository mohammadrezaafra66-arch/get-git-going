SET client_encoding='UTF8';

-- =====================================================================
-- Rollback for migration 265 (in-flight row fix for the persons SELECT policy).
--
-- This restores the POST-264 state, not the pre-264 state. Layering:
--   265-down.sql  → back to 264 (leak closed, but person creation BROKEN)
--   264-down.sql  → back to pre-264 (person creation works, but LEAK OPEN)
-- Run 265-down then 264-down to get all the way back.
--
-- ⚠️ WARNING — WHAT RUNNING THIS COSTS YOU
-- Reverting to the 264 policy re-breaks EVERY person-creation path in the app.
-- Under the 264 policy, `INSERT ... RETURNING` on public.persons fails with
--   ERROR: new row violates row-level security policy for table "persons"
-- because RETURNING applies the SELECT policy, and can_read_person() is STABLE
-- and re-reads persons, so it cannot see the row being inserted. This affects
-- admin too — it is not a role problem. Eight e2e/persons specs go red.
-- There is no good reason to run this on its own; it is here for completeness
-- of the rollback chain.
--
--   docker cp docs/verification/265-down.sql afrakala-lan-db:/tmp/265-down.sql
--   docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin \
--     -d afrakala -v ON_ERROR_STOP=1 --single-transaction -f /tmp/265-down.sql
-- =====================================================================

-- Restore the 264 single-function rule.
CREATE OR REPLACE FUNCTION public.can_read_person(p_person_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.persons p
    WHERE p.id = p_person_id
      AND (
            (p.visibility_scope = 'internal_general'
             AND public.has_any_role(auth.uid(),
                   ARRAY['admin','manager','accountant','viewer']))
         OR (p.visibility_scope = 'restricted_finance'
             AND public.has_any_role(auth.uid(),
                   ARRAY['admin','manager','accountant']))
         OR (p.visibility_scope = 'restricted_executive'
             AND public.has_any_role(auth.uid(),
                   ARRAY['admin','manager']))
         OR (p.visibility_scope = 'internal_general'
             AND public.has_role(auth.uid(), 'sales')
             AND EXISTS (
                   SELECT 1
                   FROM public.person_context_links pcl
                   JOIN public.customers c ON c.id = pcl.ref_id
                   WHERE pcl.person_id  = p.id
                     AND pcl.ref_table  = 'customers'
                     AND pcl.ended_at   IS NULL
                     AND (c.responsible_id = auth.uid()
                          OR c.responsible_id IS NULL)
                 ))
          )
  );
$$;

COMMENT ON FUNCTION public.can_read_person(uuid) IS
  'Single source of truth for person read access (migration 264). Ownership shape mirrors the customers RLS policy; do not duplicate this logic inline.';

-- Point the persons policy back at the wrapper (this is what breaks RETURNING).
DROP POLICY IF EXISTS persons_select_by_visibility_scope ON public.persons;
CREATE POLICY persons_select_by_visibility_scope
  ON public.persons FOR SELECT TO authenticated
  USING (public.can_read_person(id));

-- Drop the function 265 introduced, now that no policy references it.
DROP FUNCTION IF EXISTS public.can_read_person_scoped(uuid, text);
