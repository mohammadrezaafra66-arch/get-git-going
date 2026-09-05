SET client_encoding='UTF8';

-- 463 - the identity tier: functions that can repoint WHO a record belongs to, dedupe people, or
-- withdraw a machine credential.
--
-- ASCII-ONLY BY DESIGN, following 436.
--
-- Subject list derived by the query quoted verbatim in migration 461 section 0, widened by the
-- delegation-following closure the e2e gate uses (a wrapper that calls a writer is a writer).
-- That widening is what surfaced `_person_merge_repoint`: it contains no literal INSERT/UPDATE
-- token at all, because its write is inside an EXECUTE format(...) string.
--
-- This tier is SMALL - three functions - and that is a finding rather than an omission. Most of
-- the identity surface (assign_user_role_txt, revoke_user_role_txt, assign_user_role,
-- revoke_user_role) was already closed by migrations 399 and 436, and the rest of what touches
-- `user_roles` consults it as a GUARD rather than writing it.
--
-- ============================================================================
-- 1. _person_merge_repoint(p_table text, p_column text, p_winner uuid, p_loser uuid)
-- ============================================================================
--
-- The whole body:
--
--     PERFORM public._person_merge_assert_person_fk(p_table, p_column);
--     EXECUTE format('UPDATE public.%I SET %I = $1 WHERE %I = $2', p_table, p_column, p_column)
--       USING p_winner, p_loser;
--
-- SECURITY DEFINER, EXECUTE granted to `authenticated`, and NO authorization check. The only
-- check is `_person_merge_assert_person_fk`, which asserts that the named column really is a
-- foreign key to `persons`. That is a SAFETY check on the target - it stops the dynamic UPDATE
-- being aimed at an arbitrary column - and it is emphatically not an authorization check. It
-- says "this column is a person reference"; it never asks who is calling.
--
-- So any authenticated user, `viewer` included, could take EVERY row in ANY person-referencing
-- table that points at person A and repoint it at person B. Customers, suppliers, external
-- parties, profiles, identifiers - the entire commercial history of one party reassigned to
-- another, in one call, with no audit row of its own.
--
--     grep -rlF '_person_merge_repoint' src server -> src/integrations/supabase/types.ts
--
-- That is the generated type surface, not a call site. The one real caller is public.person_merge,
-- a SECURITY DEFINER function, and nested calls run with current_user = the function owner - so
-- revoking the direct grant does not touch the merge flow. This is migration 436's
-- apply_stock_movement reasoning exactly, and it is preferred here over a body guard for the
-- reason 436 gives: a guard on the helper would be evaluated against whoever drove person_merge,
-- duplicating a decision that belongs one level up.
--
-- ============================================================================
-- 2. delete_bot_api_key_secure(_key_id uuid, _reason text)
-- ============================================================================
--
-- This one DOES carry a real authorization check, and the check is good:
--
--     IF v_user_role IS DISTINCT FROM 'admin' AND v_user_role IS DISTINCT FROM v_managed_role
--     THEN RAISE EXCEPTION 'UNAUTHORIZED: ...' USING ERRCODE = 'P0001';
--
-- It reads `user_roles` directly rather than through has_role, which is why an automated sweep
-- keyed on the role helpers does not see it. The defect is not the body. The defect is that it
-- also granted EXECUTE to `anon`.
--
-- For an anonymous caller auth.uid() is NULL, so v_user_role is NULL, so both IS DISTINCT FROM
-- comparisons are true and the body refuses. The hole is therefore CLOSED BY THE BODY today -
-- but it is closed by a NULL comparison working out favourably, which is not a thing to rely on,
-- and the grant advertises an anonymous entry point into credential revocation that was never
-- intended. anon and PUBLIC go; `authenticated` STAYS, because
-- src/routes/_app.bot-api-keys.index.tsx calls it as the signed-in user and the body already
-- decides correctly for them.
--
-- ============================================================================
-- 3. detect_phone_collisions()
-- ============================================================================
--
-- Scans customers, suppliers, external_parties, profiles, visitors and person_identifiers for
-- one phone number shared by more than one PARTY, and inserts into public.phone_collisions. No
-- parameters, no authorization check, EXECUTE to `authenticated`.
--
-- Its output is an identity-resolution worklist - which two records are probably the same human -
-- and it is consumed by exactly one surface:
--
--     grep -rn 'detect_phone_collisions' src server
--       -> src/routes/_app.admin.phone-collisions.tsx
--       -> src/integrations/supabase/types.ts        (generated)
--
-- An ADMIN route. So the grant must stay for authenticated (the route calls it as the signed-in
-- user) and the body must carry the decision the route was assumed to be making. Migration 465's
-- companion finding applies here too: route guards on this codebase fail OPEN while roles load,
-- so "it is only on an admin page" was never a control.
--
-- Role set ARRAY['admin','manager']::text[] - the set public.gamification_assert_manager already
-- encodes for privileged back-office actions, and the same set adjust_warehouse_stock uses.
-- user_roles.role is TEXT; the ::text[] cast disambiguates from the app_role[] overload.
-- has_any_role(NULL, ...) is false, so an unauthenticated caller is refused by the same line.

-- --------------------------------------------------------------------------------------------
-- 4. BODY CHANGE (one)
-- --------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.detect_phone_collisions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _inserted integer := 0;
BEGIN
  -- 463: authorization first. This builds an identity-resolution worklist and is served by an
  -- admin-only page; the page's guard is not a control (see 465 and route-guards.ts).
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager']::text[]) THEN
    RAISE EXCEPTION 'forbidden: only an admin or manager may run phone-collision detection'
      USING ERRCODE = '42501';
  END IF;

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

-- --------------------------------------------------------------------------------------------
-- 5. GRANTS. After the replace, because CREATE OR REPLACE restores the defaults.
--    PUBLIC is revoked separately from anon and is not redundant (wave 3: `=X/supabase_admin` is
--    a PUBLIC grant and survives `REVOKE ... FROM anon`).
-- --------------------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public._person_merge_repoint(text, text, uuid, uuid)
  FROM anon, authenticated, PUBLIC;

REVOKE EXECUTE ON FUNCTION public.delete_bot_api_key_secure(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_bot_api_key_secure(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.delete_bot_api_key_secure(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.detect_phone_collisions() FROM anon;
REVOKE EXECUTE ON FUNCTION public.detect_phone_collisions() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.detect_phone_collisions() TO authenticated;

-- --------------------------------------------------------------------------------------------
-- 6. VERIFY, in the same transaction.
-- --------------------------------------------------------------------------------------------
DO $verify$
DECLARE
  v_fn    text;
  v_open  text[] := '{}';
  v_admin uuid;
BEGIN
  -- 6a. the merge helper holds no direct grant at all.
  FOR v_fn IN
    SELECT p.proname || ' [' || r.rolname || ']'
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
    WHERE n.nspname = 'public' AND p.proname = '_person_merge_repoint'
      AND has_function_privilege(r.rolname, p.oid, 'EXECUTE')
  LOOP
    v_open := v_open || v_fn;
  END LOOP;
  IF array_length(v_open, 1) IS NOT NULL THEN
    RAISE EXCEPTION '463: _person_merge_repoint is still reachable: %', array_to_string(v_open, ', ');
  END IF;
  RAISE NOTICE '463: verified - _person_merge_repoint holds no anon/authenticated grant';

  -- 6b. the merge flow still works. The OPEN half: person_merge must still be able to reach it.
  IF NOT has_function_privilege('supabase_admin',
        'public._person_merge_repoint(text,text,uuid,uuid)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION '463: the function owner lost EXECUTE - person_merge is broken, not secured';
  END IF;
  RAISE NOTICE '463: verified - the owner still reaches it, so person_merge is intact';

  -- 6c. anon is gone from the other two, and authenticated is NOT - both have live callers.
  v_open := '{}';
  FOR v_fn IN
    SELECT p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('delete_bot_api_key_secure', 'detect_phone_collisions')
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    v_open := v_open || v_fn;
  END LOOP;
  IF array_length(v_open, 1) IS NOT NULL THEN
    RAISE EXCEPTION '463: anon still reaches: %', array_to_string(v_open, ', ');
  END IF;

  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('delete_bot_api_key_secure', 'detect_phone_collisions')
         AND has_function_privilege('authenticated', p.oid, 'EXECUTE')) <> 2 THEN
    RAISE EXCEPTION '463: an authenticated caller lost a function that has a live UI caller';
  END IF;
  RAISE NOTICE '463: verified - anon gone, authenticated kept for the two with live callers';

  -- 6d. the new body guard, probed with set_config and without calling the function.
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
  IF public.has_any_role(auth.uid(), ARRAY['admin','manager']::text[]) THEN
    PERFORM set_config('role', 'none', true);
    PERFORM set_config('request.jwt.claims', '', true);
    RAISE EXCEPTION '463: an unprivileged authenticated sub PASSES the identity-tier guard';
  END IF;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION '463: no admin exists to prove the open half';
  END IF;
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager']::text[]) THEN
    PERFORM set_config('role', 'none', true);
    PERFORM set_config('request.jwt.claims', '', true);
    RAISE EXCEPTION '463: a real admin is REFUSED by the identity-tier guard';
  END IF;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE '463: verified - the identity-tier guard refuses an unprivileged sub and admits an admin';
END
$verify$;
