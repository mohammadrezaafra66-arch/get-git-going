SET client_encoding='UTF8';

-- =====================================================================
-- Rollback for migration 270 (employees linked to the person model, D8-3).
--
-- 270 was purely ADDITIVE: it added profiles.person_id + an index, created 39
-- person rows, and wrote 41 person_context_links rows with context_kind
-- 'staff_link'. It moved no existing column and repointed no existing key, so
-- this rollback is correspondingly narrow.
--
-- ⚠️ READ BEFORE RUNNING — THIS DELETES ROWS 270 CREATED
--
-- Rule 3 of the project's DB safety rules forbids DELETE on a table holding
-- data. This script deletes ONLY rows that migration 270 itself created, and
-- identifies them structurally rather than by a date guess:
--   * person_context_links with context_kind = 'staff_link' -- that kind had
--     ZERO rows before 270 (verified: customer 14, supplier 15,
--     accounting_party 1, staff_link 0), so every such row is 270's.
--   * persons that are referenced by one of those staff_link rows AND by
--     nothing else -- i.e. the 39 newly created ones. The 2 pre-existing
--     persons that were merely LINKED are protected by the "nothing else"
--     condition: they carry customer/supplier context links too.
--
-- If anyone has since created a staff_link by hand, or attached data to one of
-- the 39 new persons, this script will refuse rather than delete it -- see the
-- guard below. Check what it reports instead of forcing past it.
--
-- WHAT RUNNING THIS COSTS YOU: the user account -> person link disappears
-- again, so "one person, several roles" stops being true for staff, and the
-- deferred "a person can see their own record" rule from migration 264 loses
-- the column it depends on.
--
--   docker cp docs/verification/270-down.sql afrakala-lan-db:/tmp/270-down.sql
--   docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin \
--     -d afrakala -v ON_ERROR_STOP=1 --single-transaction -f /tmp/270-down.sql
-- =====================================================================

DO $rollback$
DECLARE
  _candidates uuid[];

  _deleted    int;
BEGIN
  -- Persons that exist ONLY because of a staff_link (the 39 created by 270).
  SELECT array_agg(p.id) INTO _candidates
  FROM public.persons p
  WHERE EXISTS (
          SELECT 1 FROM public.person_context_links l
           WHERE l.person_id = p.id AND l.context_kind = 'staff_link')
    AND NOT EXISTS (
          SELECT 1 FROM public.person_context_links l
           WHERE l.person_id = p.id AND l.context_kind <> 'staff_link');

  _candidates := COALESCE(_candidates, ARRAY[]::uuid[]);

  -- Refuse to delete a person that has acquired real references since 270.
  -- Any FK violation would abort the transaction anyway; this makes the reason
  -- explicit instead of surfacing a raw constraint name.
  IF EXISTS (
    SELECT 1 FROM public.customers  c WHERE c.person_id  = ANY(_candidates)
    UNION ALL
    SELECT 1 FROM public.suppliers  s WHERE s.person_id  = ANY(_candidates)
    UNION ALL
    SELECT 1 FROM public.external_parties e WHERE e.person_id = ANY(_candidates)
  ) THEN
    RAISE EXCEPTION
      'Rollback refused: at least one person created by migration 270 has since gained a customer/supplier/external-party record. Resolve those by hand first.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Unlink first so the FK from profiles does not block the delete.
  UPDATE public.profiles SET person_id = NULL WHERE person_id IS NOT NULL;

  DELETE FROM public.person_context_links WHERE context_kind = 'staff_link';

  DELETE FROM public.person_identifiers WHERE person_id = ANY(_candidates);

  DELETE FROM public.persons WHERE id = ANY(_candidates);
  GET DIAGNOSTICS _deleted = ROW_COUNT;

  RAISE NOTICE 'rollback 270: % persons deleted (expected 39), profiles unlinked, staff_link rows removed', _deleted;
END
$rollback$;

DROP INDEX IF EXISTS public.idx_profiles_person_id;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS person_id;
