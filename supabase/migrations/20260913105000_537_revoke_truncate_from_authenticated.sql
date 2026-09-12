SET client_encoding='UTF8';

-- ============================================================================================
-- 537 · TRUNCATE is not filtered by RLS, and `authenticated` holds it on almost every table
--
-- FOUND BY the Stage 2 gate on 2026-09-12, while attributing the grants on `cron_run_log`
-- (migration 534). The grants on that table were not 534's doing; they are the schema default,
-- and the default includes TRUNCATE. Measured on a restore of the 2026-09-13 production dump:
--
--     role            tables in public with TRUNCATE      (227 tables total)
--     postgres        227
--     supabase_admin  227
--     service_role    227
--     authenticated   214          <-- this migration
--     anon              0          <-- already closed by 477 / 523 / 524
--
-- WHY THIS IS NOT COSMETIC. Every other privilege `authenticated` holds on these tables is
-- filtered by row-level security: a SELECT, INSERT, UPDATE or DELETE is rewritten with the
-- table's policies and an unprivileged caller sees or changes nothing. **TRUNCATE is not.**
-- PostgreSQL applies no policy to TRUNCATE -- there is no such thing as a TRUNCATE policy -- so
-- the privilege is the whole of the protection. Any caller holding an `authenticated` JWT can
-- empty 214 tables, and RLS will not stop one of them.
--
-- The 13 tables `authenticated` does NOT hold it on are the precedent for this file, not an
-- exception to it: `purchases`, `purchase_items`, `purchase_requests`,
-- `purchase_request_fulfillments`, `purchase_idempotency`, `profiles`, `user_roles`,
-- `role_permissions`, `daily_capital_inputs`, `daily_capital_settings`,
-- `daily_capital_snapshots`, `customer_capital_allocations_dynamic`,
-- `salesperson_capital_allocations_dynamic`. Migrations 250, 259 and 268 each hardened the few
-- tables they happened to touch. This one finishes the set instead of adding a fourteenth.
--
-- ── NOTHING LEGITIMATELY NEEDS IT, AND THAT WAS MEASURED, NOT ASSUMED ────────────────────────
-- Five functions in `public` contain a TRUNCATE statement:
--
--     bot_query_table_rows              TRUNCATE _bot_q_rows
--     export_dynamic_table_rows         TRUNCATE _x_rows
--     query_dynamic_table_rows          TRUNCATE _q_rows
--     recompute_dynamic_capital_setting TRUNCATE _sp_cust
--     run_daily_capital_allocation      TRUNCATE _sp_cust
--
-- Every one of them truncates a TEMPORARY table -- those names live in `pg_temp_*`, are owned by
-- the session, and are reached by no grant in `public`. And every one of the five is
-- SECURITY DEFINER owned by `supabase_admin`, so the privilege that matters is the owner's, not
-- the caller's. Revoking from `authenticated` cannot break any of them.
--
-- No migration in this repository issues an explicit `GRANT TRUNCATE`. The privilege arrives
-- only through the schema's default ACL, which is why section 2 exists.
--
-- ── SECTION 2 IS THE HALF THAT IS EASY TO MISS ───────────────────────────────────────────────
-- Revoking on the 214 existing tables fixes today and nothing else: the next `CREATE TABLE`
-- re-grants `arwdDxt` from the schema default and the hole reopens one table at a time. And the
-- default is registered TWICE, under two different grantors -- measured from pg_default_acl on
-- the production dump:
--
--     supabase_admin | public | r | postgres=arwdDxt/supabase_admin authenticated=arwdDxt/... service_role=...
--     postgres       | public | r | postgres=arwdDxt/postgres       authenticated=arwdDxt/... service_role=...
--
-- `ALTER DEFAULT PRIVILEGES` without `FOR ROLE` only touches the *current* role's entry, so a
-- single statement would leave the other one intact and the fix would look complete while
-- being half-applied. This is the same trap migration 373 documented for FUNCTIONS, in the
-- other direction. Both grantors are handled below.
--
-- `service_role` keeps TRUNCATE. It is the server-side key, it never reaches a browser, and
-- taking it away would break any future maintenance path that needs it.
--
-- ── SHAPE TOLERANCE ──────────────────────────────────────────────────────────────────────────
-- Catalogue-driven throughout: the REVOKE list is read from pg_class/relacl at run time, so this
-- file no-ops on a database where the work is already done and cannot abort on one whose table
-- set differs from the one it was written against. That is migration 477's lesson, and 523/524
-- are the corrected pattern this file copies.
-- ============================================================================================

-- --------------------------------------------------------------------------------------------
-- 1. Existing tables: revoke TRUNCATE from `authenticated` wherever it is actually held.
-- --------------------------------------------------------------------------------------------
DO $$
DECLARE
  r          record;
  v_revoked  integer := 0;
  v_already  integer := 0;
BEGIN
  IF to_regrole('authenticated') IS NULL THEN
    RAISE NOTICE '537: role "authenticated" does not exist here -- nothing to do.';
    RETURN;
  END IF;

  FOR r IN
    SELECT c.oid, c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p')
     ORDER BY c.relname
  LOOP
    IF has_table_privilege('authenticated', r.oid, 'TRUNCATE') THEN
      EXECUTE format('REVOKE TRUNCATE ON TABLE public.%I FROM authenticated', r.relname);
      v_revoked := v_revoked + 1;
    ELSE
      v_already := v_already + 1;
    END IF;
  END LOOP;

  RAISE NOTICE '537: TRUNCATE revoked from authenticated on % table(s); % already closed.',
               v_revoked, v_already;
END $$;

-- --------------------------------------------------------------------------------------------
-- 2. Future tables: stop the schema default from re-granting it. BOTH grantors.
--    ALTER DEFAULT PRIVILEGES is not catalogue-dependent and is safe to re-issue, so this is
--    idempotent by construction rather than by guard.
-- --------------------------------------------------------------------------------------------
DO $$
DECLARE
  g        text;
  v_done   text[] := '{}';
BEGIN
  IF to_regrole('authenticated') IS NULL THEN
    RAISE NOTICE '537: role "authenticated" absent -- default privileges untouched.';
    RETURN;
  END IF;

  FOREACH g IN ARRAY ARRAY['supabase_admin', 'postgres']
  LOOP
    IF to_regrole(g) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE TRUNCATE ON TABLES FROM authenticated',
      g);
    v_done := v_done || g;
  END LOOP;

  RAISE NOTICE '537: default TRUNCATE privilege revoked for grantor(s): %',
               COALESCE(array_to_string(v_done, ', '), '(none)');
END $$;

-- --------------------------------------------------------------------------------------------
-- 3. Gate. Both halves, because either one alone is a false pass:
--    a) no existing table still grants TRUNCATE to `authenticated`;
--    b) no remaining pg_default_acl entry for TABLES in public would re-grant it.
--    Plus the third side that 395/405 taught this project to check: `service_role` must NOT
--    have lost anything, or a revoke that looks clean takes a credentialed path down.
-- --------------------------------------------------------------------------------------------
DO $$
DECLARE
  v_left      integer;
  v_defaults  integer;
  v_service   integer;
  v_tables    integer;
BEGIN
  IF to_regrole('authenticated') IS NULL THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_left
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
     AND has_table_privilege('authenticated', c.oid, 'TRUNCATE');

  IF v_left <> 0 THEN
    RAISE EXCEPTION '537: % table(s) in public still grant TRUNCATE to authenticated', v_left;
  END IF;

  SELECT count(*) INTO v_defaults
    FROM pg_default_acl d
    JOIN pg_namespace n ON n.oid = d.defaclnamespace
   WHERE n.nspname = 'public'
     AND d.defaclobjtype = 'r'
     AND array_to_string(d.defaclacl, ' ') ~ 'authenticated=[a-zA-Z]*D';

  IF v_defaults <> 0 THEN
    RAISE EXCEPTION '537: % default-privilege entr(y/ies) would still re-grant TRUNCATE to authenticated', v_defaults;
  END IF;

  SELECT count(*) INTO v_tables
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p');

  SELECT count(*) INTO v_service
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
     AND has_table_privilege('service_role', c.oid, 'TRUNCATE');

  IF v_service <> v_tables THEN
    RAISE EXCEPTION '537: service_role holds TRUNCATE on only % of % tables -- this migration must not have touched it',
                    v_service, v_tables;
  END IF;

  RAISE NOTICE '537 OK: authenticated holds TRUNCATE on 0 of % tables; service_role still holds it on all %.',
               v_tables, v_service;
END $$;

-- Ledger: this migration does NOT record its own row. The operator's `mig_apply` writes
-- supabase_migrations.schema_migrations and expects `INSERT 0 1` as the proof that the row is
-- new (CLAUDE.md rule 2b). See docs/missions/convergence/INTEGRATION-LOG.md, gate finding G-1.
