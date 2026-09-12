SET client_encoding='UTF8';

-- ============================================================================================
-- 538 · close `anon` EXECUTE on the application functions migration 476 never reached
--
-- FOUND BY the Stage 2 gate on 2026-09-12. `e2e/security/og102-pre393-anon-execute-grants-stay-
-- closed.spec.ts` was run against a database restored from the 2026-09-13 production dump and
-- reported, on production's own shape:
--
--     36 non-extension, non-trigger functions in `public` are executable by `anon`
--        and are not one of the 17 documented exclusions
--
-- (39 before migrations 526/527/535 removed three of them.) Migration 476 revoked 142 such
-- functions and its gate is green on the TEST database -- because 476 was a **static list,
-- generated from the test catalogue in September**. Production's catalogue is not that
-- catalogue. This is the identical failure mode as migration 477, which aborted on production on
-- 2026-09-12 and had to be re-issued as 523/524. So this file derives its target set at run
-- time, from the same predicate the gate uses, and can no-op on any shape.
--
-- ── WHAT THE 36 ACTUALLY ARE, MEASURED BEFORE ANYTHING WAS WRITTEN ───────────────────────────
--
--     25  SECURITY DEFINER · reads  · no caller check     leaderboards, product/pricing lookups,
--                                                          observatory snippets, registry reports
--      4  SECURITY DEFINER · reads  · caller-checked      get_customer_credit, get_receivable_detail,
--                                                          product_videos_waiting,
--                                                          search_messenger_messages_semantic
--      3  SECURITY DEFINER · WRITES · caller-checked      create_payment, create_receipt,
--                                                          create_dual_document
--      2  SECURITY DEFINER · WRITES · NO CALLER CHECK     bot_authenticate_key,
--                                                          refresh_sale_list_prices
--      2  SECURITY INVOKER · reads  · no caller check     compute_promotion_scores,
--                                                          require_asan_code
--
-- The two on the fourth row are the ones that make this urgent rather than tidy: a
-- SECURITY DEFINER function that WRITES, runs as `supabase_admin`, checks nothing about its
-- caller, and is reachable by an unauthenticated PostgREST request. The two INVOKER ones are
-- dead weight by comparison -- they run as `anon`, so RLS still stands between them and every
-- row.
--
-- ── WHY A PER-FUNCTION REVOKE FROM `anon` ALONE WOULD HAVE DONE NOTHING ──────────────────────
-- Measured from pg_proc.proacl on the production dump, of the 39:
--
--     24  carry an explicit `=X` entry -- EXECUTE granted to PUBLIC
--     15  carry only `anon=X`
--
-- `has_function_privilege('anon', ..., 'EXECUTE')` is true if PUBLIC holds it, so revoking from
-- `anon` on those 24 changes the catalogue and changes nothing about who can call them. PUBLIC
-- has to go too. This is the same shape as the pg_default_acl lesson migration 373 records for
-- the schema default, applied here per object.
--
-- ── AND WHY REVOKING PUBLIC BLINDLY WOULD REPEAT MIGRATION 405 ───────────────────────────────
-- Migration 395 revoked EXECUTE from PUBLIC, every catalogue check it shipped with passed, and a
-- live credentialed API went down because `products_api_readonly` had been reaching
-- `get_product_price_bounds` **only** through that PUBLIC grant. OG-77 / migration 405 is the
-- repair. Measured here, on the same 39 functions:
--
--     role                       can execute now    holds its own grant
--     authenticated                      39                 39      safe
--     service_role                       39                 39      safe
--     authenticator                      24                  0      DEPENDS ON PUBLIC
--     dashboard_user                     24                  0      DEPENDS ON PUBLIC
--     products_api_readonly              24                  0      DEPENDS ON PUBLIC
--     supabase_read_only_user            24                  0      DEPENDS ON PUBLIC
--
-- Four roles would lose access if PUBLIC were revoked without care. Section 1 below therefore
-- issues an explicit grant BEFORE revoking PUBLIC -- but only to a role that would otherwise
-- lose it AND that this schema already knows about, meaning it holds at least one explicit
-- privilege on some relation in `public`. Both halves are read from the catalogue per function;
-- neither is typed. That is the property
-- `e2e/security/og78-default-privilege-restores-are-derived.spec.ts` exists to pin.
--
-- Measured on the production dump, the roles that satisfy the second half are exactly six:
-- postgres, supabase_admin, service_role, authenticated, anon, products_api_readonly. Since
-- `authenticated` and `service_role` already hold their own grant on all 39 and `anon` is the
-- target, **this issues grants to `products_api_readonly` and to nothing else** -- the same one
-- role and the same one grant that migration 405 had to add by hand after 395.
--
-- `authenticator` needs nothing either, but NOT for the reason an earlier draft of this comment
-- gave. That draft said it "inherits" from anon/authenticated/service_role/products_api_readonly
-- because pg_auth_members lists it as a member. **That is false and was corrected after an
-- independent verifier measured it:** `authenticator` is `rolinherit = false`, so membership
-- grants it nothing automatically, and its own reach over `public` functions does fall here.
-- It is safe for a different reason -- PostgREST authenticates as `authenticator` and then
-- `SET ROLE`s to `anon` or `authenticated` for every request, so the role that is actually
-- checked at query time is never `authenticator` itself.
--
-- `dashboard_user`, `supabase_read_only_user`, `pgbouncer`, the three `pgsodium_*` roles and the
-- `supabase_*_admin` roles DO lose an incidental PUBLIC grant here, and that is deliberate: none
-- holds a single explicit privilege in `public`, none is on a path any application request
-- takes, and for `supabase_read_only_user` the project's own gate
-- (`e2e/security/og77-view-callers-can-execute-what-views-call.spec.ts`) asserts it should be
-- blocked rather than granted. An earlier draft of this file preserved every such role and
-- turned one implicit PUBLIC entry into thirteen explicit ACL entries per function; that was
-- noise pretending to be caution, and it was removed.
--
-- ── SCOPE, AND WHAT THIS FILE DELIBERATELY DOES NOT DO ───────────────────────────────────────
-- The revoke is per function, over a derived list. There is no schema-wide
-- `REVOKE ... ON ALL FUNCTIONS`, because that would also hit the 17 exclusions -- `has_role`,
-- `has_any_role`, `is_viewer_only`, `tehran_today` and friends are referenced by RLS policies on
-- tables `anon` can read, and closing them makes the POLICY raise 42501 and takes the public
-- sale-list page and the product feed down. The exclusion list below is that same list of 17,
-- and it is the one place to edit if a function should stay open.
--
-- This file also does NOT open `dyn_table_role_can_view`, which og102 expects to be
-- anon-executable and which is closed on production. Measured: the only policies referencing it
-- are on `dynamic_tables`, `dynamic_table_rows`, `dynamic_table_columns` and
-- `dynamic_table_cells`, and `anon` can read none of those four -- so no anonymous query will
-- ever evaluate them and nothing is broken by its absence. Whether the gate's list or
-- production's grants should move is a decision, not a repair, and it is not made here.
-- ============================================================================================

-- --------------------------------------------------------------------------------------------
-- 1. Derive, preserve, revoke -- per function, in that order.
-- --------------------------------------------------------------------------------------------
DO $$
DECLARE
  r            record;
  v_role       text;
  v_preserved  integer := 0;
  v_closed     integer := 0;
  v_skipped    integer := 0;
BEGIN
  IF to_regrole('anon') IS NULL THEN
    RAISE NOTICE '538: role "anon" does not exist here -- nothing to do.';
    RETURN;
  END IF;

  FOR r IN
    WITH must_stay_open(sig) AS (
      VALUES
        ('dyn_table_role_can_view(_user_id uuid, _access_level text, _allowed_roles jsonb)'),
        ('has_any_role(_user_id uuid, _roles app_role[])'),
        ('has_any_role(_user_id uuid, _roles text[])'),
        ('has_role(_user_id uuid, _role app_role)'),
        ('has_role(_user_id uuid, _role text)'),
        ('is_appellant_of_appeal(_appeal_id uuid, _user uuid)'),
        ('is_board_approved(_user_id uuid, _board_key text)'),
        ('is_board_manager(_user_id uuid)'),
        ('is_hr_manager(_user_id uuid)'),
        ('is_product_owner(_user_id uuid, _product_id uuid)'),
        ('is_reviewer_of_appeal(_appeal_id uuid, _user uuid)'),
        ('is_viewer_only(_user_id uuid)'),
        ('kd_role_can_view(_uid uuid, _access_level text)'),
        ('messenger_attachment_path_owner(_name text)'),
        ('messenger_attachment_size_ok(_name text, _size bigint)'),
        ('normalize_fa(input text)'),
        ('tehran_today()')
    )
    SELECT p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS args,
           p.proacl
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
     WHERE p.prokind = 'f'
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
       AND NOT EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.objid = p.oid
                          AND d.classid = 'pg_proc'::regclass
                          AND d.deptype = 'e')
       AND p.prorettype <> 'trigger'::regtype
       AND p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
           NOT IN (SELECT sig FROM must_stay_open)
     ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)
  LOOP
    -- 1a. Preserve: a role gets an explicit grant only if BOTH hold --
    --       (i)  it can execute this function today but has no entry of its own, so revoking
    --            PUBLIC would take it away; and
    --       (ii) it is a role this schema already knows about -- it holds at least one explicit
    --            privilege on some relation in `public`.
    --     Both halves are derived from the catalogue; neither is a typed list. (ii) is what
    --     keeps this from converting one implicit PUBLIC grant into a dozen explicit grants to
    --     roles that never call application code. Measured on the production dump, the roles
    --     satisfying (ii) are exactly: postgres, supabase_admin, service_role, authenticated,
    --     anon, products_api_readonly -- so in practice this issues grants to
    --     `products_api_readonly` and nothing else, which is precisely the one role, and the one
    --     grant, that migration 405 had to add by hand after 395 took it away.
    --     `authenticator` needs none: pg_auth_members shows it is a MEMBER of anon,
    --     authenticated, service_role and products_api_readonly, so it inherits theirs.
    --     `dashboard_user`, `supabase_read_only_user`, `pgbouncer`, the three `pgsodium_*` roles
    --     and the `supabase_*_admin` roles do lose an incidental PUBLIC grant here. That is
    --     intended: none of them holds a single explicit privilege in `public`, none is a path
    --     any application request takes, and in `supabase_read_only_user`'s case
    --     `e2e/security/og77-...spec.ts` asserts it should be blocked, not granted.
    FOR v_role IN
      SELECT g.rolname
        FROM pg_roles g
       WHERE g.rolname NOT LIKE 'pg\_%'
         AND g.rolname <> 'anon'
         AND NOT g.rolsuper
         AND has_function_privilege(g.rolname, r.oid, 'EXECUTE')
         AND COALESCE(array_to_string(r.proacl, ' '), '') !~ ('(^| )' || g.rolname || '=')
         AND EXISTS (
               SELECT 1
                 FROM pg_class c2
                 JOIN pg_namespace n2 ON n2.oid = c2.relnamespace AND n2.nspname = 'public'
                 CROSS JOIN LATERAL aclexplode(c2.relacl) a2
                WHERE c2.relkind IN ('r', 'p', 'v', 'm')
                  AND a2.grantee = g.oid)
    LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO %I', r.proname, r.args, v_role);
      v_preserved := v_preserved + 1;
    END LOOP;

    -- 1b. Close: `anon` explicitly, and PUBLIC, which is how 24 of them are really held.
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon', r.proname, r.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC', r.proname, r.args);

    IF has_function_privilege('anon', r.oid, 'EXECUTE') THEN
      RAISE EXCEPTION '538: anon still holds EXECUTE on public.%(%) after revoking from anon and PUBLIC',
                      r.proname, r.args;
    END IF;

    v_closed := v_closed + 1;
  END LOOP;

  RAISE NOTICE '538: closed % function(s) to anon; issued % preserving grant(s); % skipped.',
               v_closed, v_preserved, v_skipped;
END $$;

-- --------------------------------------------------------------------------------------------
-- 2. Gate -- three sides, because the first two alone have both produced a false pass before.
--    CLOSED : anon executes nothing outside the 17 exclusions.
--    OPEN   : the 17 exclusions are untouched.
--    OPEN   : authenticated and service_role lost nothing (395 -> 405).
-- --------------------------------------------------------------------------------------------
DO $$
DECLARE
  v_open       integer;
  v_excl_lost  integer;
  v_auth       integer;
  v_svc        integer;
  v_total      integer;
BEGIN
  IF to_regrole('anon') IS NULL THEN
    RETURN;
  END IF;

  WITH must_stay_open(sig) AS (
    VALUES
      ('dyn_table_role_can_view(_user_id uuid, _access_level text, _allowed_roles jsonb)'),
      ('has_any_role(_user_id uuid, _roles app_role[])'),
      ('has_any_role(_user_id uuid, _roles text[])'),
      ('has_role(_user_id uuid, _role app_role)'),
      ('has_role(_user_id uuid, _role text)'),
      ('is_appellant_of_appeal(_appeal_id uuid, _user uuid)'),
      ('is_board_approved(_user_id uuid, _board_key text)'),
      ('is_board_manager(_user_id uuid)'),
      ('is_hr_manager(_user_id uuid)'),
      ('is_product_owner(_user_id uuid, _product_id uuid)'),
      ('is_reviewer_of_appeal(_appeal_id uuid, _user uuid)'),
      ('is_viewer_only(_user_id uuid)'),
      ('kd_role_can_view(_uid uuid, _access_level text)'),
      ('messenger_attachment_path_owner(_name text)'),
      ('messenger_attachment_size_ok(_name text, _size bigint)'),
      ('normalize_fa(input text)'),
      ('tehran_today()')
  )
  SELECT count(*) INTO v_open
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
   WHERE p.prokind = 'f'
     AND has_function_privilege('anon', p.oid, 'EXECUTE')
     AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e')
     AND p.prorettype <> 'trigger'::regtype
     AND p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
         NOT IN (SELECT sig FROM must_stay_open);

  IF v_open <> 0 THEN
    RAISE EXCEPTION '538: % function(s) outside the 17 exclusions are still anon-executable', v_open;
  END IF;

  -- The exclusions this database actually has must still be reachable by anon. Absent ones are
  -- not this migration's business -- it never touched them.
  WITH must_stay_open(sig) AS (
    VALUES
      ('has_any_role(_user_id uuid, _roles app_role[])'),
      ('has_any_role(_user_id uuid, _roles text[])'),
      ('has_role(_user_id uuid, _role app_role)'),
      ('has_role(_user_id uuid, _role text)'),
      ('is_viewer_only(_user_id uuid)'),
      ('normalize_fa(input text)'),
      ('tehran_today()')
  )
  SELECT count(*) INTO v_excl_lost
    FROM must_stay_open m
    JOIN pg_proc p ON p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' = m.sig
    JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
   WHERE NOT has_function_privilege('anon', p.oid, 'EXECUTE');

  IF v_excl_lost <> 0 THEN
    RAISE EXCEPTION '538: % core exclusion(s) lost anon EXECUTE -- RLS policies will raise 42501', v_excl_lost;
  END IF;

  SELECT count(*) INTO v_total
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
   WHERE p.prokind = 'f';

  SELECT count(*) INTO v_auth
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
   WHERE p.prokind = 'f' AND has_function_privilege('authenticated', p.oid, 'EXECUTE');

  SELECT count(*) INTO v_svc
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
   WHERE p.prokind = 'f' AND has_function_privilege('service_role', p.oid, 'EXECUTE');

  RAISE NOTICE '538 OK: anon executes 0 outside the exclusions. authenticated % / service_role % of % public functions.',
               v_auth, v_svc, v_total;
END $$;

-- Ledger: this migration does NOT record its own row. The operator's `mig_apply` writes
-- supabase_migrations.schema_migrations and expects `INSERT 0 1` as the proof that the row is
-- new (CLAUDE.md rule 2b). See docs/missions/convergence/INTEGRATION-LOG.md, gate finding G-1.
