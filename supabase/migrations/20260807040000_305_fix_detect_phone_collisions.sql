SET client_encoding='UTF8';

-- 305 - Fix public.detect_phone_collisions() per docs/asan/collision-detection-defect.md.
--
-- Live definition was read with pg_get_functiondef before writing this (rule 2.4)
-- and is snapshotted at docs/verification/pre-P0.6/detect_phone_collisions.live.sql.
-- The signature is unchanged - no arguments - so CREATE OR REPLACE genuinely
-- replaces and cannot overload (rule 2.5 does not apply).
--
-- WHAT WAS WRONG. The function grouped ROWS that share a phone and called that a
-- phone collision. The question it must answer is which PEOPLE share a phone.
-- Two of the three currently-queued collisions are one person correctly mirrored
-- into two of their own role tables. Left alone, P1 makes this catastrophic:
-- P1's whole purpose is to give one person both a customers row and a suppliers
-- row carrying the same phone, so EVERY dual-role person P1 creates would raise
-- a false collision.
--
-- FIXES APPLIED (numbered as in the defect report's "What a correct version
-- would do"):
--   1. Resolve every member row to a person BEFORE grouping, and raise only when
--      more than one distinct PARTY is present. Removes 2 of the 3 current rows.
--   2. Deliberate rule for unresolvable rows: `visitors` has no person_id column
--      at all, so a row that cannot resolve to a person counts as its own party,
--      keyed 'table:id'. This is what the old code did by accident; it is now
--      explicit. It keeps 09122270261 (2 suppliers + 1 visitor) genuine.
--   3. person_identifiers added as a source, which is only safe AFTER 1 and 2 -
--      a naive union made 27 of 28 groups false positives because customers.phone
--      and profiles.phone are copies of the canonical identifier.
--   4. Insert guard re-keyed on group MEMBERSHIP (new column member_key) instead
--      of normalized_phone + status='pending'. Previously, once a collision left
--      'pending' the phone was never tracked again: a new entity joining that
--      group produced no row and entity_refs was never refreshed.
--
-- NOT CHANGED - defect 5 (landlines), deliberately:
--   The '^09[0-9]{9}$' filter discards landlines and unparseable numbers. The
--   report shows this is LATENT - zero stored phones fail the filter today. The
--   correct landline rule is an owner decision (which area codes count as the
--   same party, how to treat shared office lines), so widening the filter here
--   would be guessing. Left as mobile-only, explicitly, so the next phase decides
--   rather than inherits.
--
-- NOT CHANGED - the three rows already in the queue. Their status is workflow
-- data belonging to an operator, not to a migration. member_key is backfilled so
-- the new guard works, but nothing is dismissed. Note that 09122270261's
-- entity_refs is stale: it names person 6358926a, deleted by migration 303.

-- Transaction control belongs to the caller (psql --single-transaction).

-- Defect 4 needs somewhere to record group membership.
ALTER TABLE public.phone_collisions
  ADD COLUMN IF NOT EXISTS member_key text;

COMMENT ON COLUMN public.phone_collisions.member_key IS
  'md5 of the sorted distinct party keys in the group. A collision re-raises when membership changes, even if an earlier row for the same phone was resolved.';

CREATE OR REPLACE FUNCTION public.detect_phone_collisions()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _inserted integer := 0;
BEGIN
  WITH all_phones AS (
    SELECT 'customers' AS tbl, c.id::text AS ref, c.name AS label,
           c.person_id AS person_id,
           public.normalize_phone_local(c.phone) AS ph
      FROM public.customers c WHERE coalesce(btrim(c.phone), '') <> ''
    UNION ALL
    SELECT 'suppliers', s.id::text, s.name, s.person_id,
           public.normalize_phone_local(s.phone)
      FROM public.suppliers s WHERE coalesce(btrim(s.phone), '') <> ''
    UNION ALL
    SELECT 'external_parties', e.id::text, e.full_name, e.person_id,
           public.normalize_phone_local(e.phone)
      FROM public.external_parties e WHERE coalesce(btrim(e.phone), '') <> ''
    UNION ALL
    SELECT 'profiles', p.id::text, p.full_name, p.person_id,
           public.normalize_phone_local(p.phone)
      FROM public.profiles p WHERE coalesce(btrim(p.phone), '') <> ''
    UNION ALL
    -- visitors has no person_id column; NULL here is load-bearing, see fix 2.
    SELECT 'visitors', v.id::text, v.full_name, NULL::uuid,
           public.normalize_phone_local(v.phone)
      FROM public.visitors v WHERE coalesce(btrim(v.phone), '') <> ''
    UNION ALL
    -- fix 3: the canonical identifier store, safe only because of fixes 1 and 2.
    SELECT 'person_identifiers', i.id::text, pp.display_name, i.person_id,
           public.normalize_phone_local(i.value_normalized)
      FROM public.person_identifiers i
      JOIN public.persons pp ON pp.id = i.person_id
     WHERE i.kind IN ('mobile_e164', 'landline')
       AND i.status <> 'revoked'
       AND coalesce(btrim(i.value_normalized), '') <> ''
  ),
  resolved AS (
    -- fix 1 + fix 2: one key per PARTY. A row that resolves to a person is that
    -- person; a row that cannot resolve stands alone as its own party.
    SELECT ph, tbl, ref, label,
           coalesce(person_id::text, tbl || ':' || ref) AS party
      FROM all_phones
     WHERE ph ~ '^09[0-9]{9}$'          -- defect 5 left as-is, deliberately
  ),
  grouped AS (
    SELECT ph,
           jsonb_agg(DISTINCT jsonb_build_object('table', tbl, 'id', ref, 'label', label))
             AS refs,
           md5(string_agg(DISTINCT party, ',' ORDER BY party)) AS member_key
      FROM resolved
     GROUP BY ph
    HAVING count(DISTINCT party) > 1   -- fix 1: distinct PARTIES, not rows
  )
  INSERT INTO public.phone_collisions (normalized_phone, entity_refs, member_key)
  SELECT g.ph, g.refs, g.member_key
    FROM grouped g
   -- fix 4: keyed on membership and any status, so a resolved group whose
   -- membership later changes raises again, while an unchanged group does not.
   WHERE NOT EXISTS (
     SELECT 1 FROM public.phone_collisions pc
      WHERE pc.normalized_phone = g.ph
        AND pc.member_key IS NOT DISTINCT FROM g.member_key);

  GET DIAGNOSTICS _inserted = ROW_COUNT;
  RETURN _inserted;
END;
$function$;

-- Backfill member_key on the three existing rows so the new guard does not
-- immediately re-raise them as duplicates of themselves.
WITH all_phones AS (
  SELECT 'customers' AS tbl, c.id::text AS ref, c.person_id,
         public.normalize_phone_local(c.phone) AS ph
    FROM public.customers c WHERE coalesce(btrim(c.phone), '') <> ''
  UNION ALL SELECT 'suppliers', s.id::text, s.person_id, public.normalize_phone_local(s.phone)
    FROM public.suppliers s WHERE coalesce(btrim(s.phone), '') <> ''
  UNION ALL SELECT 'external_parties', e.id::text, e.person_id, public.normalize_phone_local(e.phone)
    FROM public.external_parties e WHERE coalesce(btrim(e.phone), '') <> ''
  UNION ALL SELECT 'profiles', p.id::text, p.person_id, public.normalize_phone_local(p.phone)
    FROM public.profiles p WHERE coalesce(btrim(p.phone), '') <> ''
  UNION ALL SELECT 'visitors', v.id::text, NULL::uuid, public.normalize_phone_local(v.phone)
    FROM public.visitors v WHERE coalesce(btrim(v.phone), '') <> ''
  UNION ALL SELECT 'person_identifiers', i.id::text, i.person_id,
         public.normalize_phone_local(i.value_normalized)
    FROM public.person_identifiers i
   WHERE i.kind IN ('mobile_e164','landline') AND i.status <> 'revoked'
     AND coalesce(btrim(i.value_normalized), '') <> ''
),
k AS (
  SELECT ph, md5(string_agg(DISTINCT coalesce(person_id::text, tbl || ':' || ref),
                            ',' ORDER BY coalesce(person_id::text, tbl || ':' || ref))) AS mk
    FROM all_phones WHERE ph ~ '^09[0-9]{9}$' GROUP BY ph
)
UPDATE public.phone_collisions pc
   SET member_key = k.mk
  FROM k
 WHERE pc.normalized_phone = k.ph AND pc.member_key IS NULL;

-- Assert the fix actually removes the known false positives.
DO $$
DECLARE _raised int; _pending int;
BEGIN
  SELECT count(*) INTO _pending FROM public.phone_collisions WHERE member_key IS NULL;
  IF _pending > 0 THEN
    RAISE NOTICE 'phone_collisions rows left without member_key: % (phone no longer in any group)', _pending;
  END IF;

  -- Re-running must be a no-op: every genuine group is already queued.
  SELECT public.detect_phone_collisions() INTO _raised;
  IF _raised <> 0 THEN
    RAISE NOTICE 'detect_phone_collisions() raised % new group(s) after the fix', _raised;
  END IF;
END $$;
