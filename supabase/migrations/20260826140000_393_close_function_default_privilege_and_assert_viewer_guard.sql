-- 393 — close the FUNCTIONS default privilege (OG-31), and give `is_viewer_only` the
--        assertions nothing has ever held over it (OG-44, OG-45).
--
-- Owner authority: `docs/execution/00-progress.md`, phase-1 answers of 2026-08-25, #5 —
-- "OG-31 close the FUNCTIONS default privilege (anon=X)? -> YES, fold it into the
-- three-part security mission." OG-38 is NOT actioned here; it is a business decision about
-- a platform role and is left to the owner (see the mission progress file).
--
-- Rollback: `docs/verification/393-down.sql`, written BEFORE this file from the live
-- captured `pg_default_acl` state and dry-run proved (A5.28).
--
-- ============================================================================
-- 1. WHAT IS WRONG
-- ============================================================================
--
-- `pg_default_acl` carries, for supabase_admin in schema `public`:
--
--    objtype 'f' | {postgres=X, anon=X, authenticated=X, service_role=X}
--
-- and there is no global (defaclnamespace = 0) row, so PostgreSQL's built-in
-- `acldefault()` also applies and hands every new function an implicit PUBLIC grant.
-- Both together mean: **every function created by supabase_admin in `public` is executable
-- by an anonymous caller the moment it exists**, with no GRANT written anywhere.
--
-- Measured on the live database 2026-08-26, `public` holding 840 functions:
--
--    anon-executable                          741
--    SECURITY DEFINER                         427
--    SECURITY DEFINER *and* anon-executable   342
--
-- A SECURITY DEFINER function runs with its owner's privileges and walks past both column
-- grants and RLS. This is the door `find_duplicate_product` came through (OG-49, migration
-- 389) and the door `calculate_adjusted_price` came through (OG-55, migration 390) — that
-- second one returned the REAL SALE PRICE, 38,985,000, to a caller whose table SELECT was
-- refused with 42501. Neither needed a mistake to be made. They were open by default.
--
-- ============================================================================
-- 2. WHY THE OBVIOUS FIX DOES NOT WORK, AND WHAT DOES
-- ============================================================================
--
-- M3 measured this and recorded it in migration 381's header; it was re-measured
-- independently for this migration, inside an explicit BEGIN ... ROLLBACK, and reproduced:
--
--   P2  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC
--       + ... FROM anon
--       -> new function ACL {=X, postgres=X, supabase_admin=X, authenticated=X, service_role=X}
--       -> anon CAN STILL EXECUTE. The `anon=X` entry is gone; the bare `=X` (PUBLIC) is not.
--
-- A schema-scoped row is applied ON TOP of `acldefault()`; it cannot remove what
-- `acldefault()` puts there. A **global** row (no `IN SCHEMA`) *replaces* `acldefault()`,
-- which is the only form that can drop the PUBLIC grant:
--
--   P3  ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC   (global)
--       + ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon
--       -> new function ACL {postgres=X, supabase_admin=X, authenticated=X, service_role=X}
--       -> anon: NO.  authenticated: yes.  service_role: yes.
--
-- ============================================================================
-- 3. THE BLAST RADIUS, MEASURED — AND WHY THIS MIGRATION IS SIX STATEMENTS, NOT TWO
-- ============================================================================
--
-- The global row is global: it governs every schema in which supabase_admin creates
-- functions. OG-31's gate row calls that blast radius "an owner decision, not an agent's".
-- Measured, it is worse than the row says in two ways and containable in one:
--
--   P4  with the global row in place, a new function in `extensions` comes out
--       {supabase_admin=X} — anon NO, **authenticated NO**. It strips EVERY role, not
--       merely anon. An `ALTER EXTENSION ... UPDATE` that recreates a pgcrypto or
--       uuid-ossp function would silently take it away from the application too.
--
--   ...and the list of affected schemas is five, not the four the gate row names. Every
--   schema in which supabase_admin owns functions, counted live:
--
--       extensions  61      graphql  6      pgbouncer  1      pgsodium 119      vault  3
--
--   `pgbouncer.get_auth` is the connection pooler's own credential-lookup function and its
--   proacl is NULL, i.e. it runs entirely on the PUBLIC grant. Silently stripping it is a
--   connection-pooling outage.
--
--   P5  ALTER DEFAULT PRIVILEGES IN SCHEMA extensions GRANT EXECUTE ON FUNCTIONS TO PUBLIC
--       -> a new function there is PUBLIC-executable again: prior behaviour restored exactly.
--   P6  ...and a new function in `public` is STILL closed to anon. The restore is
--       schema-local and does not leak back.
--
-- So this migration closes the tap globally and immediately restores the prior default in
-- every schema except `public`. **Its only behavioural effect is in `public`** — which is
-- exactly the scope the owner authorised — and that containment is asserted below rather
-- than asserted in prose. `pgsodium_masks` is included in the restore list because it
-- already carries its own default-acl row and the pgsodium extension creates objects there;
-- restoring PUBLIC keeps its effective default identical to today's.
--
-- ============================================================================
-- 4. WHAT THIS MIGRATION DOES *NOT* DO
-- ============================================================================
--
--  * **It revokes nothing from any existing function.** All 741 currently anon-executable
--    functions stay exactly as they are. `CREATE OR REPLACE` preserves an existing ACL, so
--    future migrations that replace today's functions are unaffected too — asserted below.
--    Nothing in `src/` can break as a result of this migration; the e2e suite is run anyway
--    because privileges changed (A4.16).
--  * The batched REVOKE across those 741 is deliberately NOT attempted here. It is the
--    function-side twin of OG-30 and is raised as its own gate (**OG-61**), with the census
--    attached, exactly as the OG-25 pattern prescribes: close the future tap, audit the
--    existing set report-only, hand back anything already broken as a new gate.
--  * `refresh_sale_list_prices` — VOLATILE, SECURITY DEFINER, writes, and anon+PUBLIC
--    executable today — is left alone ON PURPOSE. A6.33 (OG-48) makes revoking it the first
--    step of the sale-lists repair, and A6.35 (OG-32) blocks that repair until OG-48 is
--    resolved. Its measured state is recorded in the audit so that mission can start from it.
--  * `set_profile_field_value` needs no new GRANT: it already carries an explicit `anon=X`
--    of its own, so the one keep-list entry this surface has is already recorded in the
--    catalogue. Verified, not assumed — asserted below.
--  * OG-38 (`supabase_read_only_user` LOGIN / BYPASSRLS) is untouched. Nothing about that
--    role is altered by this file.
--
-- ============================================================================
-- 5. OG-44 AND OG-45 — ASSERTION, NOT CHANGE
-- ============================================================================
--
-- `is_viewer_only(uuid)` backs 8 views + 93 RLS policies + 1 function, and OG-44 records
-- that nothing anywhere asserts its security properties: an independent reviewer showed
-- `ALTER FUNCTION ... SECURITY INVOKER`, `RESET search_path` and `GRANT EXECUTE TO PUBLIC`
-- all pass every gate in this programme. Migration 387 catches a constant-returning body
-- only INDIRECTLY, through vacuity guards. This migration asserts the function directly:
-- SECURITY DEFINER, STABLE, owned by supabase_admin, search_path pinned, PUBLIC holding
-- nothing — and, behaviourally, that it still discriminates.
--
-- OG-45 has no remedy available to a migration. `supabase_read_only_user` holds no grant on
-- any of the eight views; its SELECT comes wholly from `pg_read_all_data` membership, so
-- there is nothing to REVOKE. What stands between it and all eight is one absence: it holds
-- no EXECUTE on `is_viewer_only`. **That absence is pinned below**, so the single GRANT that
-- would open all eight can no longer be made without failing this gate.
--
-- A6.34 (OG-51) respected: the eight views' predicate is NOT touched by this migration.

SET client_encoding='UTF8';

-- ============================================================================
-- CHANGE
-- ============================================================================

-- Close the tap. The global row replaces acldefault(); the schema row drops anon.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- Restore the prior default everywhere else supabase_admin creates functions, so that the
-- only schema whose behaviour changes is `public`.
ALTER DEFAULT PRIVILEGES IN SCHEMA extensions     GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA graphql        GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA pgbouncer      GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA pgsodium       GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA pgsodium_masks GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA vault          GRANT EXECUTE ON FUNCTIONS TO PUBLIC;

-- ============================================================================
-- THE GATE — one gate for the whole mission (A2.9), two-sided (A2.10)
-- ============================================================================
--
-- CLOSED side  C1-C8 : the forbidden thing is shut.
-- OPEN side    O1-O9 : the legitimate thing still works. A disturbance that empties the
--                      surface for everyone must FAIL here, not pass.
--
-- Probe functions are created and dropped inside this transaction. Nothing survives it.

DO $gate$
DECLARE
  probe_pub    text := 'public._og31_gate_probe';
  s            text;
  ok           boolean;
  n            int;
  n_viewer     int;
  n_other      int;
  n_disagree   int;
  fn           text;
BEGIN
  ------------------------------------------------------------------ C1
  SELECT count(*) INTO n
  FROM pg_default_acl WHERE defaclnamespace = 0 AND defaclobjtype = 'f'
    AND defaclrole = 'supabase_admin'::regrole;
  IF n <> 1 THEN
    RAISE EXCEPTION '393 C1: expected exactly 1 global FUNCTIONS default-acl row for supabase_admin, found %. Without it acldefault() still applies and the PUBLIC grant returns.', n;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_default_acl d, aclexplode(d.defaclacl) a
    WHERE d.defaclnamespace = 0 AND d.defaclobjtype = 'f'
      AND d.defaclrole = 'supabase_admin'::regrole
      AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
  ) INTO ok;
  IF ok THEN
    RAISE EXCEPTION '393 C1: the global FUNCTIONS default-acl row still grants EXECUTE to PUBLIC';
  END IF;

  ------------------------------------------------------------------ C2
  SELECT EXISTS (
    SELECT 1 FROM pg_default_acl d
    JOIN pg_namespace ns ON ns.oid = d.defaclnamespace
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE d.defaclobjtype = 'f' AND ns.nspname = 'public'
      AND a.grantee = 'anon'::regrole AND a.privilege_type = 'EXECUTE'
  ) INTO ok;
  IF ok THEN
    RAISE EXCEPTION '393 C2: the public FUNCTIONS default-acl row still grants EXECUTE to anon';
  END IF;

  ------------------------------------------------------------------ C3/C4 + O1
  -- Behavioural. Catalogue state can be right while the effect is wrong; this creates a
  -- real function under the new defaults and asks the privilege system directly.
  EXECUTE format('CREATE FUNCTION %s() RETURNS int LANGUAGE sql IMMUTABLE AS %L', probe_pub, 'SELECT 1');

  IF has_function_privilege('anon', probe_pub || '()', 'EXECUTE') THEN
    RAISE EXCEPTION '393 C3: a function freshly created in public is STILL executable by anon — the tap is not closed';
  END IF;
  IF has_function_privilege('supabase_read_only_user', probe_pub || '()', 'EXECUTE') THEN
    RAISE EXCEPTION '393 C4: a function freshly created in public is executable by supabase_read_only_user';
  END IF;

  -- O1 — and it must NOT have closed for everyone. This is the A2.10 half: a disturbance
  -- that empties the surface for all roles fails here instead of passing as "secure".
  IF NOT has_function_privilege('authenticated', probe_pub || '()', 'EXECUTE') THEN
    RAISE EXCEPTION '393 O1: a function freshly created in public is NOT executable by authenticated — this migration has broken every signed-in caller, not just anon';
  END IF;
  IF NOT has_function_privilege('service_role', probe_pub || '()', 'EXECUTE') THEN
    RAISE EXCEPTION '393 O1: a function freshly created in public is NOT executable by service_role — every server-side route would break';
  END IF;

  ------------------------------------------------------------------ O2
  -- Containment, per schema, behaviourally. A missing restore line shows up here — this is
  -- the check that catches `pgbouncer` being forgotten.
  FOREACH s IN ARRAY ARRAY['extensions','graphql','pgbouncer','pgsodium','pgsodium_masks','vault'] LOOP
    EXECUTE format('CREATE FUNCTION %I._og31_gate_probe() RETURNS int LANGUAGE sql IMMUTABLE AS %L', s, 'SELECT 1');

    IF NOT has_function_privilege('anon', format('%I._og31_gate_probe()', s), 'EXECUTE') THEN
      RAISE EXCEPTION '393 O2: a function freshly created in schema % is no longer PUBLIC-executable — the global row has escaped `public` and will strip this schema on the next extension update', s;
    END IF;
    IF NOT has_function_privilege('authenticated', format('%I._og31_gate_probe()', s), 'EXECUTE') THEN
      RAISE EXCEPTION '393 O2: schema % lost EXECUTE for authenticated', s;
    END IF;

    EXECUTE format('DROP FUNCTION %I._og31_gate_probe()', s);
  END LOOP;

  ------------------------------------------------------------------ O6a
  -- CREATE OR REPLACE must preserve an existing ACL, or every future migration that
  -- replaces a function would silently revoke it from anon. This is the claim that "nothing
  -- existing breaks" rests on, so it is measured rather than asserted in the header.
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s() TO anon', probe_pub);
  EXECUTE format('CREATE OR REPLACE FUNCTION %s() RETURNS int LANGUAGE sql IMMUTABLE AS %L', probe_pub, 'SELECT 2');
  IF NOT has_function_privilege('anon', probe_pub || '()', 'EXECUTE') THEN
    RAISE EXCEPTION '393 O6a: CREATE OR REPLACE dropped an explicit anon grant — existing functions are NOT safe from this change';
  END IF;

  EXECUTE format('DROP FUNCTION %s()', probe_pub);

  ------------------------------------------------------------------ C5  (OG-45)
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'is_viewer_only';
  IF n <> 1 THEN
    RAISE EXCEPTION '393 C5: expected exactly one public.is_viewer_only, found % — an overload would let a caller reach a signature this gate does not check (the OG-33/383 failure mode)', n;
  END IF;

  IF has_function_privilege('supabase_read_only_user', 'public.is_viewer_only(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '393 C5: supabase_read_only_user holds EXECUTE on is_viewer_only. That role bypasses RLS and can SELECT all eight guard-class views; this single grant is the only thing that was standing between it and every one of them (OG-45).';
  END IF;

  ------------------------------------------------------------------ C6  (OG-44)
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
    WHERE p.oid = 'public.is_viewer_only(uuid)'::regprocedure
      AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
  ) INTO ok;
  IF ok THEN
    RAISE EXCEPTION '393 C6: is_viewer_only grants EXECUTE to PUBLIC — which hands it to supabase_read_only_user and to every future role, reopening OG-45 without anyone writing a GRANT to that role';
  END IF;

  ------------------------------------------------------------------ C7
  -- Regression bar: the doors earlier missions closed must still be shut, against anon AND
  -- PUBLIC. Checked by NAME across all overloads, per the lesson migration 383 records.
  FOREACH fn IN ARRAY ARRAY['find_duplicate_product','get_recent_purchase_label','get_recent_purchase_labels','calculate_adjusted_price'] LOOP
    SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public' AND p.proname = fn;
    IF n = 0 THEN
      RAISE EXCEPTION '393 C7: % has vanished from public — a wholesale DROP would otherwise pass this check silently', fn;
    END IF;

    SELECT count(*) INTO n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public' AND p.proname = fn
      AND ( has_function_privilege('anon', p.oid, 'EXECUTE')
            OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0 AND a.privilege_type='EXECUTE') );
    IF n > 0 THEN
      RAISE EXCEPTION '393 C7: % is executable by anon or PUBLIC again (% signature(s)) — OG-33/OG-49/OG-55 regression', fn, n;
    END IF;
  END LOOP;

  ------------------------------------------------------------------ O3/O4  (OG-44 properties)
  IF NOT (has_function_privilege('anon','public.is_viewer_only(uuid)','EXECUTE')
          AND has_function_privilege('authenticated','public.is_viewer_only(uuid)','EXECUTE')
          AND has_function_privilege('service_role','public.is_viewer_only(uuid)','EXECUTE')) THEN
    RAISE EXCEPTION '393 O3: is_viewer_only is no longer executable by anon/authenticated/service_role — the guard would fail closed on all 8 views and all 93 policies';
  END IF;

  SELECT p.prosecdef INTO ok FROM pg_proc p WHERE p.oid = 'public.is_viewer_only(uuid)'::regprocedure;
  IF NOT ok THEN
    RAISE EXCEPTION '393 O4: is_viewer_only is no longer SECURITY DEFINER — as INVOKER it reads user_roles as the caller, and a caller who cannot read that table gets a silently wrong answer';
  END IF;

  SELECT (p.proconfig IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))
    INTO ok FROM pg_proc p WHERE p.oid = 'public.is_viewer_only(uuid)'::regprocedure;
  IF NOT ok THEN
    RAISE EXCEPTION '393 O4: is_viewer_only has no pinned search_path — a SECURITY DEFINER function without one is resolvable against a caller-controlled schema';
  END IF;

  SELECT (p.provolatile = 's') INTO ok FROM pg_proc p WHERE p.oid = 'public.is_viewer_only(uuid)'::regprocedure;
  IF NOT ok THEN
    RAISE EXCEPTION '393 O4: is_viewer_only is no longer STABLE';
  END IF;

  SELECT (p.proowner = 'supabase_admin'::regrole) INTO ok FROM pg_proc p WHERE p.oid = 'public.is_viewer_only(uuid)'::regprocedure;
  IF NOT ok THEN
    RAISE EXCEPTION '393 O4: is_viewer_only is no longer owned by supabase_admin — a DEFINER function runs with its owner rights, so the owner IS the privilege level';
  END IF;

  ------------------------------------------------------------------ O5  (OG-44, behavioural)
  -- The property migration 387 only reaches indirectly: the guard must actually
  -- discriminate. `SELECT true` and `SELECT false` bodies both die here.
  WITH u AS (
    SELECT user_id, array_agg(DISTINCT role::text ORDER BY role::text) AS roles
    FROM user_roles GROUP BY user_id
  )
  SELECT count(*) FILTER (WHERE roles = ARRAY['viewer']),
         count(*) FILTER (WHERE roles <> ARRAY['viewer']),
         count(*) FILTER (WHERE public.is_viewer_only(user_id) <> (roles = ARRAY['viewer']))
    INTO n_viewer, n_other, n_disagree
  FROM u;

  -- Vacuity guard first: with either population empty the agreement check proves nothing.
  IF n_viewer < 1 OR n_other < 1 THEN
    RAISE EXCEPTION '393 O5: cannot test the guard — viewer-only users=%, other users=%. Both populations must be non-empty or a constant-returning body passes silently.', n_viewer, n_other;
  END IF;
  IF n_disagree <> 0 THEN
    RAISE EXCEPTION '393 O5: is_viewer_only disagrees with user_roles for % user(s). A constant body, an inverted predicate or a broken role lookup all land here.', n_disagree;
  END IF;

  ------------------------------------------------------------------ O6b
  -- The one keep-list entry this surface has, recorded by measurement rather than by
  -- writing a redundant GRANT: register.tsx:131 -> lib/profile-fields/queries.ts:38 calls
  -- set_profile_field_value, possibly before a session exists.
  IF NOT has_function_privilege('anon','public.set_profile_field_value(uuid,text,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION '393 O6b: anon lost EXECUTE on set_profile_field_value — registration writes profile fields through it before a session necessarily exists';
  END IF;

  ------------------------------------------------------------------ O7
  -- The guard class is still eight views, and they still call the guard. If a view were
  -- rewritten to drop the call, C5/C6 would keep passing while the class silently opened.
  SELECT count(*) INTO n FROM pg_views
   WHERE schemaname = 'public' AND definition LIKE '%is_viewer_only%';
  IF n <> 8 THEN
    RAISE EXCEPTION '393 O7: % public views reference is_viewer_only, expected 8 (OG-51/A6.34 — the guard class is fixed at eight and this migration must not have moved it)', n;
  END IF;

  SELECT count(*) INTO n FROM pg_policies
   WHERE COALESCE(qual,'') || ' ' || COALESCE(with_check,'') LIKE '%is_viewer_only%';
  IF n < 90 THEN
    RAISE EXCEPTION '393 O7: only % RLS policies reference is_viewer_only; 93 were measured on 2026-08-26 and a collapse to near-zero means the viewer restriction has been voided wholesale', n;
  END IF;

  RAISE NOTICE '393 OK: the FUNCTIONS default tap is closed in public and NOWHERE ELSE — a fresh function there is unreachable by anon and by supabase_read_only_user while authenticated and service_role keep EXECUTE, and a fresh function in each of extensions/graphql/pgbouncer/pgsodium/pgsodium_masks/vault is still PUBLIC-executable. CREATE OR REPLACE preserves grants, so no existing function changed. is_viewer_only is single-signature, SECURITY DEFINER, STABLE, supabase_admin-owned, search_path-pinned, closed to PUBLIC and to supabase_read_only_user, still open to anon/authenticated/service_role, and still DISCRIMINATES (% viewer-only vs % other users, 0 disagreements). The four previously closed definer doors remain shut against anon and PUBLIC by name across all overloads.', n_viewer, n_other;
END $gate$;
