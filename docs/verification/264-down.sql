SET client_encoding='UTF8';

-- =====================================================================
-- Rollback for migration 264 (ownership-aware RLS on persons and children).
--
-- Restores the three SELECT policies exactly as captured from the live
-- catalog BEFORE 264 was applied:
--   docs/verification/pre-264/policies-before.txt
-- and drops the two objects that 264 introduced:
--   public.can_read_person(uuid)          — new in 264, no prior definition
--   idx_pcl_person_customer_active        — new in 264
-- (Both were verified to appear in no other migration before writing this.)
--
-- ⚠️ WARNING — WHAT RUNNING THIS COSTS YOU
-- This re-opens the CRITICAL leak that 264 closed. Under the restored
-- policies every user holding the `sales` role reads EVERY person whose
-- visibility_scope = 'internal_general', plus their person_identifiers
-- (mobile, email, national ID, IBAN), regardless of who is responsible for
-- the underlying customer. That leak was proven outside the UI with a direct
-- PostgREST call — see docs/verification/pre-264-rls-evidence.json.
-- Run this ONLY if 264 caused a concrete production problem, and treat the
-- window it is reverted for as a known data-exposure window.
--
-- NOTE: 264 also assigned test customer «تست ماهرو» to salesperson-a as a
-- stable fixture. That is DATA, not schema, and is deliberately NOT reverted
-- here — undoing it would break the ownership half of the HARD GATE test.
--
-- Run it the same way as any migration on this stack:
--   docker cp docs/verification/264-down.sql afrakala-lan-db:/tmp/264-down.sql
--   docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin \
--     -d afrakala -v ON_ERROR_STOP=1 --single-transaction -f /tmp/264-down.sql
-- =====================================================================

-- ── persons ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS persons_select_by_visibility_scope ON public.persons;
CREATE POLICY persons_select_by_visibility_scope
  ON public.persons FOR SELECT TO authenticated
  USING (
    (visibility_scope = 'internal_general'
     AND public.has_any_role(auth.uid(),
           ARRAY['admin','manager','accountant','sales','viewer']))
 OR (visibility_scope = 'restricted_finance'
     AND public.has_any_role(auth.uid(),
           ARRAY['admin','manager','accountant']))
 OR (visibility_scope = 'restricted_executive'
     AND public.has_any_role(auth.uid(),
           ARRAY['admin','manager']))
  );

-- ── person_identifiers ───────────────────────────────────────────────
DROP POLICY IF EXISTS person_identifiers_select_via_person ON public.person_identifiers;
CREATE POLICY person_identifiers_select_via_person
  ON public.person_identifiers FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.persons p
      WHERE p.id = person_identifiers.person_id
        AND (
              (p.visibility_scope = 'internal_general'
               AND public.has_any_role(auth.uid(),
                     ARRAY['admin','manager','accountant','sales','viewer']))
           OR (p.visibility_scope = 'restricted_finance'
               AND public.has_any_role(auth.uid(),
                     ARRAY['admin','manager','accountant']))
           OR (p.visibility_scope = 'restricted_executive'
               AND public.has_any_role(auth.uid(),
                     ARRAY['admin','manager']))
            )
    )
  );

-- ── person_context_links ─────────────────────────────────────────────
DROP POLICY IF EXISTS person_context_links_select_via_person ON public.person_context_links;
CREATE POLICY person_context_links_select_via_person
  ON public.person_context_links FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.persons p
      WHERE p.id = person_context_links.person_id
        AND (
              (p.visibility_scope = 'internal_general'
               AND public.has_any_role(auth.uid(),
                     ARRAY['admin','manager','accountant','sales','viewer']))
           OR (p.visibility_scope = 'restricted_finance'
               AND public.has_any_role(auth.uid(),
                     ARRAY['admin','manager','accountant']))
           OR (p.visibility_scope = 'restricted_executive'
               AND public.has_any_role(auth.uid(),
                     ARRAY['admin','manager']))
            )
    )
  );

-- ── objects introduced by 264 ────────────────────────────────────────
-- Dropped AFTER the policies above no longer reference the function.
DROP FUNCTION IF EXISTS public.can_read_person(uuid);
DROP INDEX  IF EXISTS public.idx_pcl_person_customer_active;
