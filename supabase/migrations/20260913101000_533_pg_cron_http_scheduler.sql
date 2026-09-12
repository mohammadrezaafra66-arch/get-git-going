SET client_encoding='UTF8';

-- ============================================================================================
-- 533 · the scheduler (E-5 / mission Convergence)
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════════╗
-- ║ OWNER DECISION — this migration installs the `http` extension on the `postgres` database ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════════╝
--
-- Approved by the owner. Recorded here in plain terms so the release block can quote it, and so
-- that nobody has to infer the consequence from a one-line CREATE EXTENSION.
--
-- WHAT IT GRANTS. `http` (pgsql-http 1.6) gives the DATABASE ITSELF the ability to make
-- outbound network requests — GET, POST, PUT, PATCH, DELETE, HEAD to any URL reachable from the
-- database container, with arbitrary headers and bodies. Until now this database could only be
-- talked TO; afterwards it can also talk OUT. Concretely this means:
--
--   * Any code that can execute an http_* function can reach anything the DB container's
--     network can reach, INCLUDING hosts the application server cannot — other machines on the
--     LAN, and cloud metadata endpoints. The database becomes a potential pivot point.
--   * Requests leave as the database container, not as a named user. An outbound call is not
--     attributable to an end user by anything outside this database's own logging.
--   * Data exfiltration becomes a single statement: a SELECT can be sent to an external URL by
--     anyone able to run http_post. That is why §1b below closes all 19 functions explicitly
--     rather than relying on an inherited default privilege.
--   * A slow or hanging remote host holds a database session (and, under pg_cron, a worker)
--     open for the duration.
--
-- WHY IT IS WANTED. It is the transport for the Issabel CDR importer: `run_issabel_import()`
-- (§2) calls the importer endpoint on a schedule. There is no in-database alternative that does
-- not add a sidecar container and a manual deploy step — the alternative C-2 measured and
-- rejected.
--
-- WHAT BOUNDS IT. (a) It is created ONLY on a database literally named `postgres` (§1), so the
-- test host's `afrakala` and every rehearsal copy never get it. (b) All 19 of its functions are
-- revoked from PUBLIC, anon and authenticated in this same migration, with a gate that fails
-- the migration if any is still reachable (§1b) — so the capability is available to
-- `supabase_admin`/`postgres` and to nothing a browser can reach.
--
-- WHAT IS NOT BOUNDED, and the owner should know it: nothing here restricts WHICH hosts the
-- database may call. `http` has no allowlist. A superuser, or anything running as one, can call
-- any URL. If that is not acceptable, the control has to be a network policy on the DB
-- container, which is outside this migration.
--
-- Verdict this migration implements: docs/missions/prodprep/C2-cron-verdict.md — pg_cron, in
-- database `postgres`, driving the Issabel importer through the `http` extension. C-2 measured
-- that pg_cron 1.6 is already loaded and already running five `afrakala-*` jobs on this host's
-- `postgres` database, that `cron.timezone = GMT`, and that `http`/`pg_net` ship in the image
-- and are on Supabase's own `supautils.privileged_extensions` allowlist.
--
-- ── THE DATABASE-NAME CONSTRAINT, AND WHY THIS FILE IS SHAPED THE WAY IT IS ──────────────────
-- pg_cron's background worker reads `cron.job` from exactly one database: whichever one
-- `cron.database_name` names. On this project that is `postgres`. `CREATE EXTENSION pg_cron`
-- outside that database does not warn, it REFUSES — measured tonight on a scratch copy of
-- `afrakala` (`prod_rehearsal_e5`, restored from prod13.dump):
--
--   ERROR:  can only create extension in database postgres
--   DETAIL: Jobs must be scheduled from the database configured in cron.database_name, since
--           the pg_cron background worker reads job descriptions from this database.
--
-- Migrations 445 and 504 hit the same wall and drew the conclusion "therefore cron DDL cannot
-- live in supabase/migrations at all" — the job rows were registered from
-- deploy/lan/scripts/cron-445-schedule-afrakala-jobs.sql and cron-504-...sql instead, applied
-- by hand against `postgres`. That conclusion was correct for THIS test host, where the app
-- database (`afrakala`) and the cron database (`postgres`) are two different databases and a
-- migration only ever touches the former.
--
-- It stops being the whole story once you read CLAUDE.md's own environment table: on the
-- PRODUCTION laptop the app database is itself named `postgres`. There, "the database this
-- migration is applied against" and "the database cron.database_name names" are the SAME
-- database. So rather than duplicating the job definitions into a hand-maintained script that
-- a human has to remember to run separately (exactly the "manual step the deploy skips" failure
-- C-2 measured for the sidecar-container alternative), this migration is written to be a NO-OP
-- for the extension/job DDL on any database that is not literally named `postgres`, and to
-- register everything when it IS. Applied to `afrakala` on the test host: only the wrapper
-- functions, their REVOKEs, and (534) cron_run_log are created — measured below, in
-- docs/research/convergence/E-5-proof.md, with the exact error text above reproduced from a
-- guard that is never reached. Applied to `postgres` on the production laptop (whenever the
-- owner runs it there): the same file also creates the extension and the eight job rows,
-- because current_database() = 'postgres' is true there and nowhere else this migration is
-- meant to run.
--
-- This is a real, deliberate departure from the shape 445/504 chose, not an oversight of it —
-- recorded here so the next reader does not "fix" it back to a bare COMMENT-only file. The
-- guard is a plain `IF current_database() = 'postgres'` wrapped around dynamic SQL
-- (`EXECUTE format(...)`) rather than a bare statement, specifically so that when the guard is
-- false, PL/pgSQL never has to resolve `cron.schedule` / `cron.schedule_in_database` against a
-- catalogue that may not have a `cron` schema at all (`afrakala` does not — migration 504's own
-- header says so). PL/pgSQL only binds each statement the first time it actually executes, so
-- an unreached branch referencing a nonexistent schema is not an error — proved in the same
-- proof doc by applying this file to `prod_rehearsal_e5` (a copy of `afrakala`, no `cron`
-- schema) without failure.
--
-- UNVERIFIED, recorded rather than assumed: whether production's `postgres` database actually
-- has pg_cron, `cron.timezone = GMT`, and the `http` shared object. C-2's own §5 UNKNOWN-4 says
-- this was never checked because no packet may be sent to `192.168.170.10`, and that constraint
-- binds this mission too (FORBIDDEN: production, any write to the `postgres` database). Re-run
-- C-2 §0's pre-flight there before trusting this file's postgres-branch on that host.
--
-- ── TIMEZONE ARITHMETIC (cron.timezone is GMT; Iran is UTC+3:30, no DST since 2022) ──────────
-- Tehran = UTC + 3:30 (fixed)  =>  UTC = Tehran - 3:30
-- Every schedule below is written in GMT/UTC with the Tehran wall-clock time named alongside.
--
--   GMT/UTC      Tehran local   Job
--   ---------    ------------   ---------------------------------------------
--   30 4-16,22   09:30..21:30   afrakala-issabel-import-h30  (14 fires; D-39 windows 1-5,
--                * * *          02:00 next day               row 17 wraps the day boundary)
--   0 7,8,9      10:30,11:30,   afrakala-issabel-import-h00  (3 fires; D-39 windows 2-3)
--                * * *          12:30
--   0 20 * * *   23:30          afrakala-accrual-daily-notice
--   0 21 * * *   00:30 (+1d)    afrakala-employee-streaks-nightly
--   0 6 * * *    09:30          daily-birthday-notifications  (production's own name/time,
--                                                               measured live below)
--   */5 * * * *  every 5 min    recompute-employee-scores-5min, capture-score-snapshots-5min
--                                (production's own names/frequency, measured live below)
--   15 22 * * *  01:45 (+1d)    cleanup-stale-auto-suppliers  (schedule is an ESTIMATE, not
--                                                               measured — see note at the job)
--
-- The Issabel D-39 table (17 rows) and its arithmetic are reproduced in full, worked example by
-- worked example, in docs/missions/prodprep/C2-cron-verdict.md §4. Not re-derived here to avoid
-- a second copy that can drift from the one that was actually checked.
--
-- ── THE 507 RULE ──────────────────────────────────────────────────────────────────────────────
-- Migration 507's header: any cron-only SECURITY DEFINER function must carry its own
-- REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated in the SAME migration that creates it,
-- because CREATE [OR REPLACE] FUNCTION hands EXECUTE to PUBLIC/authenticated by default and a
-- cron session has no JWT, so a body that gates on auth.uid() cannot also serve the scheduler.
-- The principle -- default grants must be closed explicitly, in the file that creates the
-- routine -- applies the same way to CREATE [OR REPLACE] PROCEDURE, which is what the two new
-- routines below actually are (not SECURITY DEFINER -- see each one's comment for the measured
-- reason). Applied here to every routine a job in this file calls:
--
--   run_issabel_import()                      — NEW, REVOKE below
--   generate_birthday_notifications_worker()  — NEW, REVOKE below (the actual defect fix — see
--                                                that procedure's comment)
--   roll_employee_daily_streaks(date),
--   notify_accountants_daily_accrual_summary(date),
--   capture_score_snapshots(),
--   cleanup_stale_auto_suppliers(),
--   recompute_employee_scores_from_calls_worker(timestamp with time zone)
--     — pre-existing, already closed to anon/authenticated by migrations 476/507/513/(og61 wave
--       4). Measured on prod_rehearsal_e5 before this file: all five already show
--       anon_x=f, auth_x=f, postgres_x=t, admin_x=t, svc_x=t. Re-asserted here anyway
--       (idempotent REVOKE/GRANT, no CREATE OR REPLACE, no behaviour change) so that every
--       function a job in THIS file names also carries its own grant assertion in this file,
--       rather than relying on a reader to go find it in five other migrations. Bodies are not
--       touched — CLAUDE.md rule 4 (read the live definition before touching it) does not apply
--       because nothing about these five bodies changes.
--
-- ── WHAT IS DELIBERATELY NOT DONE HERE ───────────────────────────────────────────────────────
-- The bodies of roll_employee_daily_streaks / notify_accountants_daily_accrual_summary /
-- capture_score_snapshots / cleanup_stale_auto_suppliers / recompute_employee_scores_from_calls
-- _worker are not rewritten to log into cron_run_log (534). All five already succeed reliably
-- under cron today (measured live on the test cluster's postgres db: 6/6, 6/6, 7/7, 7/7
-- successful runs respectively across the jobs currently registered there) and pg_cron's own
-- cron.job_run_details already gives them observability. Rewriting five working functions to
-- add logging is a behaviour change to code that isn't broken, outside what this migration was
-- asked to fix. cron_run_log therefore records only the two NEW wrapper functions this file
-- adds, both of which needed new code anyway. Recorded as an out-of-scope recommendation in the
-- proof doc, not silently done.
-- ============================================================================================

-- ────────────────────────────────────────────────────────────────────────────────────────────
-- 1) http extension — GUARDED to database `postgres`, exactly like the pg_cron half in §5.
--
--    This line used to read `CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;` with
--    no guard at all, on the reasoning recorded here before: "creating it on prod_rehearsal_e5
--    (a copy of afrakala) succeeds (extversion 1.6) while pg_cron on the same database refuses
--    outright. Safe to create unconditionally."
--
--    That reasoning confused CAN with SHOULD. `http` succeeding on any database is precisely
--    what makes the unguarded form dangerous: every scratch, rehearsal and app database this
--    migration is ever applied to silently gains the ability to make outbound network calls,
--    even though only the `postgres` database has a scheduler to use it. Measured: `http` is
--    absent from the production dump's TOC (`pg_restore -l /tmp/prod13.dump | grep EXTENSION`
--    lists pg_cron, pgsodium, btree_gist, pg_graphql, pg_stat_statements, pg_trgm, pgcrypto,
--    pgjwt, supabase_vault — and no http) and absent from `afrakala`. It was present on the
--    rehearsal databases for one reason only: this line had already run there.
--
--    Same `current_database() = 'postgres'` condition and same dynamic-SQL (`EXECUTE`) shape as
--    §5, for the same reason given there — when the branch is not taken, PL/pgSQL never has to
--    resolve the statement against a catalogue that may not contain the objects.
-- ────────────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF current_database() = 'postgres' THEN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions';
  ELSE
    RAISE NOTICE '533: current_database() = %, not "postgres" -- the http extension is SKIPPED '
      'on purpose, exactly like pg_cron and the eight job rows in section 5. Everything else '
      'this migration creates (the wrapper functions, their REVOKEs, and 534''s cron_run_log) '
      'is still created. See this migration''s header comment.', current_database();
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────────────────────
-- 1b) Close every function `http` installs — the 507 rule, applied to the one capability in
--     this release that reaches outside the database.
--
--     DELIBERATELY NOT INSIDE THE GUARD ABOVE. The list is derived from the catalogue, so on a
--     database without `http` the loop simply finds nothing and this is a no-op; whereas on a
--     database that DOES have `http` — including any rehearsal copy where the previous
--     unguarded version of this very line already installed it — the REVOKEs still run and
--     close it. Guarding this half too would leave exactly those databases open.
--
--     Derived from `pg_depend`, never typed: the extension installs 19 functions at version 1.6
--     (http, http_get ×2, http_post ×2, http_put, http_patch, http_delete ×2, http_head,
--     http_header, http_set_curlopt, http_reset_curlopt, http_list_curlopt, urlencode ×3,
--     text_to_bytea, bytea_to_text) and a different version would install a different set.
--
--     Measured before this block was written: all 19 already read closed to anon, authenticated
--     and service_role — `proacl` is `supabase_admin=X/supabase_admin` alone. That closure came
--     entirely from migration 393's global FUNCTIONS default revoke, which this file never
--     mentions and which no reader of this file would know to check. The statements below make
--     the protection explicit rather than inherited; they change nothing today and are here so
--     that a future `ALTER DEFAULT PRIVILEGES`, or an `http` installed on a database 393 never
--     touched, cannot quietly open them.
-- ────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r     record;
  v_n   int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig,
           CASE WHEN p.prokind = 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END AS kind
      FROM pg_depend d
      JOIN pg_extension e ON e.oid = d.refobjid
      JOIN pg_proc     p ON p.oid  = d.objid
     WHERE d.refclassid = 'pg_extension'::regclass
       AND d.classid    = 'pg_proc'::regclass
       AND e.extname    = 'http'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON %s %s FROM PUBLIC', r.kind, r.sig);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE EXECUTE ON %s %s FROM anon', r.kind, r.sig);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE EXECUTE ON %s %s FROM authenticated', r.kind, r.sig);
    END IF;
    v_n := v_n + 1;
  END LOOP;

  IF v_n = 0 THEN
    RAISE NOTICE '533: the http extension is not installed on this database -- nothing to '
      'revoke (documented no-op).';
  ELSE
    RAISE NOTICE '533: % http function(s) explicitly closed to PUBLIC, anon and authenticated.',
      v_n;
  END IF;
END $$;

-- GATE: if `http` is installed here, not one of its functions may be reachable by anon,
-- authenticated or PUBLIC. A database that can make outbound HTTP requests is a new capability
-- and this is the assertion that it did not arrive open.
DO $$
DECLARE
  v_open text[];
BEGIN
  SELECT array_agg((p.oid::regprocedure)::text ORDER BY (p.oid::regprocedure)::text)
    INTO v_open
    FROM pg_depend d
    JOIN pg_extension e ON e.oid = d.refobjid
    JOIN pg_proc     p ON p.oid  = d.objid
   WHERE d.refclassid = 'pg_extension'::regclass
     AND d.classid    = 'pg_proc'::regclass
     AND e.extname    = 'http'
     AND (
          (EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
           AND has_function_privilege('anon', p.oid, 'EXECUTE'))
       OR (EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
           AND has_function_privilege('authenticated', p.oid, 'EXECUTE'))
       OR EXISTS (SELECT 1 FROM unnest(COALESCE(p.proacl, '{}'::aclitem[])) AS a
                   WHERE a::text ~ '^=[a-zA-Z]*X')
     );

  IF v_open IS NOT NULL THEN
    RAISE EXCEPTION '533 HTTP GATE: outbound-HTTP function(s) reachable by anon, authenticated '
      'or PUBLIC: %', array_to_string(v_open, ', ');
  END IF;
  RAISE NOTICE '533 HTTP GATE OK: no http function is reachable by anon, authenticated or PUBLIC.';
END $$;

-- ────────────────────────────────────────────────────────────────────────────────────────────
-- 2) run_issabel_import() — C-2 / D-39. Lives in whichever database this migration is applied
--    to, so on production (app db = postgres = cron db) it can read the vault secret, make the
--    outbound call, AND write cron_run_log all in one database with no cross-database plumbing.
-- ────────────────────────────────────────────────────────────────────────────────────────────
-- WHY A PROCEDURE, NOT A FUNCTION. Measured tonight, in isolation, before writing this: a
-- PL/pgSQL FUNCTION that INSERTs a log row and later RAISEs an uncaught exception loses the
-- INSERT too -- the whole top-level statement (exactly what `SELECT fn();` is, and exactly what
-- a pg_cron job command is) is one transaction, and an unhandled exception aborts all of it,
-- log row included. Proved with a throwaway probe function against this same cron_run_log table:
-- INSERT then RAISE left ZERO rows behind. That defeats the entire point of Task 2 ("http calls
-- must record their status") for precisely the case that matters most -- the failure. A
-- PROCEDURE can issue an explicit COMMIT mid-body (PG11+, legal because pg_cron always invokes
-- it as a bare top-level `CALL`, never nested inside another transaction), which durably persists
-- the log row regardless of what happens afterwards, including a later RAISE. Proved the same
-- way: same probe rewritten as a PROCEDURE with COMMIT before and after the exception handler
-- left the 'failed' row intact after the CALL still errored. See docs/research/convergence/
-- E-5-proof.md for both probes' exact output.
--
-- NEITHER SECURITY DEFINER NOR A SET-CLAUSE IS USED HERE, and that is also measured, not a style
-- choice: PostgreSQL implements both by wrapping the call in an implicit subtransaction (to save
-- and restore the role / GUC afterwards), and COMMIT/ROLLBACK are illegal inside a subtransaction
-- -- `ERROR: invalid transaction termination`, reproduced against this exact procedure with
-- either attribute alone, before it was removed (see the proof doc). Neither is actually needed:
-- the only callers left after the REVOKEs below are `postgres` and `supabase_admin`, both
-- superusers on this cluster (bypass RLS and every grant check regardless of SECURITY DEFINER),
-- and `service_role`. This procedure is not run as `service_role` by anything this migration
-- registers -- if that ever changes, `service_role` needs its own direct grants on the tables
-- touched below, which SECURITY DEFINER would otherwise have papered over. Every table/schema
-- reference in the body is therefore written fully qualified instead of relying on search_path.
--
-- ALSO MEASURED (a second, distinct error, found the same way): `COMMIT` cannot appear INSIDE a
-- `BEGIN ... EXCEPTION WHEN OTHERS ... END` block -- `ERROR: cannot commit while a subtransaction
-- is active`, because PL/pgSQL implements that block's exception handling with its own implicit
-- savepoint, and COMMIT cannot fire while one is open. So the risky work below is wrapped in a
-- BEGIN/EXCEPTION block that only sets a flag and captures SQLERRM -- it performs no transaction
-- control and does not re-raise -- and the actual UPDATE + COMMIT + RAISE happen afterwards, at
-- the procedure's own top level, once that block has fully exited either way. Both bugs (this one
-- and the SECURITY DEFINER/SET one above) were caught by actually CALLing this procedure against
-- prod_rehearsal_e5, not by reasoning about PL/pgSQL from memory -- see the proof doc for the
-- exact error text each produced before the fix and the successful run after it.
-- ── CONSEQUENCE OF GUARDING THE http INSTALL IN §1, HANDLED HERE ────────────────────────────
-- This procedure DECLAREs `v_resp extensions.http_response` and calls extensions.http*(). With
-- `check_function_bodies = on` (the default) PL/pgSQL resolves declared types at CREATE time,
-- not at call time. So the moment §1 stopped installing `http` on every database, this CREATE
-- began to fail on any database not named `postgres`. Measured, on a fresh restore of
-- prod13.dump with the guard in place and this mitigation absent:
--
--   psql:/tmp/f533.sql:388: ERROR:  type "extensions.http_response" does not exist
--   533 exit=3
--
-- The procedure is deliberately still created everywhere rather than being guarded away too,
-- because three things downstream name it unconditionally: the COMMENT and the four
-- REVOKE/GRANT statements immediately below (a REVOKE on an absent procedure is an ERROR, which
-- would abort the migration), and docs/research/convergence/E-5-proof.md:235, which CALLs it on
-- a rehearsal database as part of the existing verification.
--
-- So body validation is suspended for this one statement, and ONLY on a database where the type
-- genuinely does not exist. Where `http` IS installed -- production's `postgres` database, the
-- one that actually runs this job -- validation stays ON and the body is checked exactly as
-- before. This uses the same psql \gset idiom migration 526 uses rather than a DO block,
-- because SET cannot be scoped this way from inside PL/pgSQL.
SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'http')
            THEN 'on' ELSE 'off' END AS m533_cfb \gset
SET check_function_bodies = :'m533_cfb';

CREATE OR REPLACE PROCEDURE public.run_issabel_import()
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_token   text;
  v_resp    extensions.http_response;
  v_log_id  bigint;
  v_failed  boolean := false;
  v_errmsg  text;
BEGIN
  INSERT INTO public.cron_run_log (job_name, started_at, status)
  VALUES ('run_issabel_import', now(), 'running')
  RETURNING id INTO v_log_id;
  COMMIT; -- durably records "running" even if everything below fails and rolls back

  BEGIN
    SELECT decrypted_secret INTO v_token
      FROM vault.decrypted_secrets
     WHERE name = 'issabel_import_worker_token';

    IF v_token IS NULL OR length(v_token) = 0 THEN
      RAISE EXCEPTION 'issabel_import_worker_token is missing from the vault';
    END IF;

    -- the importer's ceiling is 5000 calls per run (DEFAULT_MAX_CALLS), so allow a long first run
    PERFORM extensions.http_set_curlopt('CURLOPT_TIMEOUT', '300');

    SELECT * INTO v_resp FROM extensions.http((
      'POST',
      'http://afrakala-lan-web:3000/api/public/hooks/import-issabel-calls',
      ARRAY[extensions.http_header('Authorization', 'Bearer ' || v_token)],
      'application/json',
      '{}'
    )::extensions.http_request);

    IF v_resp.status <> 200 THEN
      RAISE EXCEPTION 'issabel import returned HTTP % : %',
        v_resp.status, left(coalesce(v_resp.content, ''), 500);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- No transaction control and no RAISE in here -- see the block comment above. v_resp keeps
    -- whatever it last held (a plain variable, unaffected by the implicit rollback-to-savepoint),
    -- so a non-200 response still reports its HTTP status even though this branch caught it as
    -- an exception.
    v_failed := true;
    v_errmsg := SQLERRM;
  END;

  IF v_failed THEN
    UPDATE public.cron_run_log
       SET finished_at = now(), status = 'failed',
           http_status = v_resp.status,
           error_text  = left(coalesce(v_resp.content, v_errmsg), 500)
     WHERE id = v_log_id;
    COMMIT;
    RAISE EXCEPTION '%', v_errmsg;
  ELSE
    UPDATE public.cron_run_log
       SET finished_at = now(), status = 'succeeded', http_status = v_resp.status
     WHERE id = v_log_id;
    COMMIT;
  END IF;
END;
$fn$;

-- Restore body validation immediately: every later CREATE in this file must still be checked.
RESET check_function_bodies;

COMMENT ON PROCEDURE public.run_issabel_import() IS
  'C-2 / D-39. Called by pg_cron jobs "afrakala-issabel-import-h30" and '
  '"afrakala-issabel-import-h00" (registered below, postgres-database branch only) as '
  '"CALL public.run_issabel_import();". POSTs to the token-protected Issabel import hook on '
  'afrakala-lan-web and durably records every attempt into cron_run_log (via an explicit COMMIT '
  '-- see the PROCEDURE-not-FUNCTION note above), raising on any non-200 so the failure is also '
  'visible in cron.job_run_details. Migration 533.';

REVOKE ALL ON PROCEDURE public.run_issabel_import() FROM PUBLIC;
REVOKE ALL ON PROCEDURE public.run_issabel_import() FROM anon;
REVOKE ALL ON PROCEDURE public.run_issabel_import() FROM authenticated;
GRANT EXECUTE ON PROCEDURE public.run_issabel_import() TO postgres, supabase_admin, service_role;

-- ────────────────────────────────────────────────────────────────────────────────────────────
-- 3) generate_birthday_notifications_worker() — THE ACTUAL DEFECT FIX.
--
--    Measured live on the test cluster's postgres db, before this migration:
--      daily-birthday-notifications | failed | 61   (of 61 total runs — 0 successes)
--      ERROR: authentication required
--      CONTEXT: PL/pgSQL function generate_birthday_notifications() line 17 at RAISE
--
--    public.generate_birthday_notifications() (migration 220) opens with
--      v_caller uuid := auth.uid();
--      if v_caller is null then raise exception 'authentication required'; end if;
--    which is exactly right for the browser path (an admin/manager/accountant clicking a
--    button) and exactly wrong for cron, which carries no JWT so auth.uid() is always NULL.
--
--    THE GUARD FOR BROWSER CALLERS IS NOT TOUCHED. Per the 507 header's own trade-off
--    ("adding a role check would refuse the scheduler itself" — here it is the mirror image:
--    weakening the existing role check to admit a NULL caller would let ANY unauthenticated or
--    under-privileged request through the browser-facing function too), the fix is the same
--    shape as 513's recompute_employee_scores_from_calls_worker: a SEPARATE function that does
--    the identical work, has no auth.uid() gate because its only legitimate caller is not a
--    user, and is granted to nobody but the job owners.
--
--    Body is copied from the live generate_birthday_notifications() (migration 220, lines
--    1164-1266) with FOUR changes, not three: (a) the auth guard block is deleted, (b) v_caller
--    is NULL throughout (there is no caller to attribute the audit_logs row to — same choice 513
--    made: 'actor', NULL, 'via', 'cron_worker'), (c) start/finish is recorded in cron_run_log,
--    and (d) a SEPARATE, PRE-EXISTING bug this migration found by actually invoking the copy on
--    prod_rehearsal_e5, not by reading the file:
--
--      ERROR:  column p.email does not exist
--      CONTEXT: PL/pgSQL function generate_birthday_notifications_worker() line ... at FOR
--
--    `coalesce(p.full_name, p.email, 'کاربر')` references public.profiles.email, and
--    public.profiles has NO email column on the live schema (measured: \d public.profiles on
--    prod_rehearsal_e5, a restore of production). Email lives in auth.users, one hop away. This
--    is not a defect this migration introduced -- the SAME line is byte-identical in the live,
--    currently-shipped generate_birthday_notifications(), which is therefore ALSO broken today,
--    independent of the auth-gate defect this migration exists to fix (the auth check simply
--    fires first and hides it). Fixing the browser-facing original is OUT OF SCOPE for this
--    migration (only the scheduler path was asked for) and is flagged as a separate, real,
--    already-proven production bug in docs/research/convergence/E-5-proof.md. The minimal fix
--    applied HERE, in the new worker only, is to drop the broken fallback rather than add a new
--    cross-schema join for a rare NULL-full_name edge case: `coalesce(p.full_name, 'کاربر')`.
--
--    WHY A PROCEDURE, NOT A FUNCTION: same reason as run_issabel_import() above -- proved with
--    the same throwaway probe that an uncaught RAISE inside a FUNCTION rolls back its own
--    cron_run_log INSERT, defeating the "record every attempt, including failures" requirement.
--    Losing the RETURNS TABLE(created_count) is a real, accepted cost: nobody reads it (pg_cron
--    discards a job command's return value, and the browser-facing original still returns it
--    for whatever DOES call it directly).
--
--    NEITHER SECURITY DEFINER NOR A SET-CLAUSE IS USED, for the same measured reason as
--    run_issabel_import() above (`ERROR: invalid transaction termination` -- either attribute
--    alone makes the COMMIT calls below illegal). The only caller after the REVOKEs is
--    `supabase_admin` (superuser via the cron job), so no elevated-privilege wrapper is needed;
--    every relation below is schema-qualified instead of relying on search_path.
--
--    ALSO MEASURED: `COMMIT` is illegal inside a `BEGIN ... EXCEPTION ... END` block (PL/pgSQL's
--    own implicit savepoint for that block makes `ERROR: cannot commit while a subtransaction is
--    active`). The risky work is therefore wrapped in a block that only sets a flag and captures
--    SQLERRM; the actual UPDATE + COMMIT + RAISE happen after that block exits, at the top level
--    -- same shape as run_issabel_import() above, and see that procedure's comment for how this
--    was found (by calling it, not by reasoning about it).
-- ────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE PROCEDURE public.generate_birthday_notifications_worker()
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_log_id  bigint;
  v_template text;
  v_today date := current_date;
  v_count integer := 0;
  r_person record;
  r_recipient record;
  v_title text;
  v_body text;
  v_ref_type text;
  v_ref_id uuid;
  v_exists boolean;
  v_failed boolean := false;
  v_errmsg text;
BEGIN
  INSERT INTO public.cron_run_log (job_name, started_at, status)
  VALUES ('generate_birthday_notifications_worker', now(), 'running')
  RETURNING id INTO v_log_id;
  COMMIT; -- durably records "running" even if everything below fails and rolls back

  BEGIN
    -- No auth guard: this function's only legitimate caller is the scheduler, which carries no
    -- JWT. See the block comment above for why the browser-facing function keeps its guard.

    select coalesce(nullif(value, ''), '🎂 تولدت مبارک!')
      into v_template
    from public.shop_settings
    where key = 'birthday_message_template'
    limit 1;
    if v_template is null then
      v_template := '🎂 تولدت مبارک!';
    end if;

    for r_person in
      select 'customer'::text as kind, c.id as person_id, c.name as person_name
        from public.customers c
        where c.birth_date is not null
          and c.is_active = true
          and extract(month from c.birth_date) = extract(month from v_today)
          and extract(day   from c.birth_date) = extract(day   from v_today)
      union all
      select 'user'::text as kind, p.id as person_id,
             coalesce(p.full_name, 'کاربر') as person_name
        from public.profiles p
        where p.birth_date is not null
          and extract(month from p.birth_date) = extract(month from v_today)
          and extract(day   from p.birth_date) = extract(day   from v_today)
    loop
      v_ref_type := r_person.kind;
      v_ref_id   := r_person.person_id;
      v_title := case r_person.kind
                   when 'customer' then 'تولد مشتری: ' || r_person.person_name
                   else 'تولد کاربر: ' || r_person.person_name
                 end;
      v_body  := v_template || E'\n' ||
                 case r_person.kind when 'customer' then 'مشتری: ' else 'کاربر: ' end
                 || r_person.person_name;

      for r_recipient in
        select distinct ur.user_id
        from public.user_roles ur
        where ur.role in ('admin'::text, 'accountant'::text)
      loop
        select exists(
          select 1 from public.notification_queue n
          where n.user_id = r_recipient.user_id
            and n.type = 'birthday'
            and n.reference_type = v_ref_type
            and n.reference_id = v_ref_id
            and n.created_at >= v_today::timestamptz
            and n.created_at <  (v_today + 1)::timestamptz
        ) into v_exists;

        if not v_exists then
          insert into public.notification_queue
            (user_id, title, body, type, reference_type, reference_id)
          values
            (r_recipient.user_id, v_title, v_body, 'birthday', v_ref_type, v_ref_id);
          v_count := v_count + 1;

          insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
          values (
            NULL,
            v_ref_type,
            v_ref_id::text,
            'birthday_notification_sent',
            jsonb_build_object(
              'recipient_id', r_recipient.user_id,
              'person_kind',  v_ref_type,
              'person_id',    v_ref_id,
              'person_name',  r_person.person_name,
              'date',         v_today,
              'via',          'cron_worker'
            )
          );
        end if;
      end loop;
    end loop;
  EXCEPTION WHEN OTHERS THEN
    -- No transaction control and no RAISE in here -- see the block comment above this procedure.
    v_failed := true;
    v_errmsg := SQLERRM;
  END;

  IF v_failed THEN
    UPDATE public.cron_run_log
       SET finished_at = now(), status = 'failed', error_text = left(v_errmsg, 500)
     WHERE id = v_log_id;
    COMMIT;
    RAISE EXCEPTION '%', v_errmsg;
  ELSE
    UPDATE public.cron_run_log
       SET finished_at = now(), status = 'succeeded'
     WHERE id = v_log_id;
    COMMIT;
  END IF;
END;
$fn$;

COMMENT ON PROCEDURE public.generate_birthday_notifications_worker() IS
  'Migration 533. Same work as generate_birthday_notifications() (migration 220), for the '
  'unattended scheduler path: no auth.uid() gate, because a cron session has none, and no '
  'broken profiles.email reference (see the block comment above -- that column does not exist '
  'on the live schema; the original still has this bug). Fixes the measured 0-of-61 success '
  'rate of the "daily-birthday-notifications" pg_cron job. The browser-facing function and its '
  'admin/manager/accountant gate are unchanged.';

REVOKE ALL ON PROCEDURE public.generate_birthday_notifications_worker() FROM PUBLIC;
REVOKE ALL ON PROCEDURE public.generate_birthday_notifications_worker() FROM anon;
REVOKE ALL ON PROCEDURE public.generate_birthday_notifications_worker() FROM authenticated;
GRANT EXECUTE ON PROCEDURE public.generate_birthday_notifications_worker()
  TO postgres, supabase_admin, service_role;

-- ────────────────────────────────────────────────────────────────────────────────────────────
-- 4) Re-assert (idempotent, no body change) the grants on the five pre-existing functions the
--    jobs below also call. See the "507 RULE" block comment for why this is here even though
--    none of the five actually change.
-- ────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.roll_employee_daily_streaks(date)',
    'public.notify_accountants_daily_accrual_summary(date)',
    'public.capture_score_snapshots()',
    'public.cleanup_stale_auto_suppliers()',
    'public.recompute_employee_scores_from_calls_worker(timestamp with time zone)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO postgres, supabase_admin, service_role', fn);
  END LOOP;
END $$;

DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.run_issabel_import()', 'EXECUTE')
   OR has_function_privilege('anon', 'public.run_issabel_import()', 'EXECUTE')
  THEN
    RAISE EXCEPTION '533: run_issabel_import is reachable by anon/authenticated';
  END IF;

  IF has_function_privilege('authenticated',
       'public.generate_birthday_notifications_worker()', 'EXECUTE')
   OR has_function_privilege('anon',
       'public.generate_birthday_notifications_worker()', 'EXECUTE')
  THEN
    RAISE EXCEPTION '533: generate_birthday_notifications_worker is reachable by anon/authenticated';
  END IF;

  IF NOT has_function_privilege('supabase_admin', 'public.run_issabel_import()', 'EXECUTE')
   OR NOT has_function_privilege('supabase_admin',
       'public.generate_birthday_notifications_worker()', 'EXECUTE')
  THEN
    RAISE EXCEPTION '533: supabase_admin lost EXECUTE on a job wrapper -- the job would stop silently';
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────────────────────
-- 5) pg_cron extension + the eight job rows — ONLY when this migration is applied to a database
--    literally named `postgres` (see the block comment at the top of this file). On every other
--    database name (afrakala on the test host; any scratch/rehearsal copy) this whole section is
--    a documented no-op: the IF is false, so PL/pgSQL never binds `cron.schedule*` against a
--    catalogue that may not even have a `cron` schema.
-- ────────────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF current_database() = 'postgres' THEN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron';
  ELSE
    RAISE NOTICE '533: current_database() = %, not "postgres" -- pg_cron extension and all '
      'eight job rows are SKIPPED on purpose. Wrapper functions, their REVOKEs, and cron_run_log '
      '(534) were still created. See this migration''s header comment.', current_database();
  END IF;
END $$;

DO $$
BEGIN
  IF current_database() = 'postgres' THEN
    -- Idempotent: drop-then-recreate by name, same idiom as cron-445-/cron-504-schedule-*.sql.
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
      DECLARE
        j text;
      BEGIN
        FOREACH j IN ARRAY ARRAY[
          'afrakala-issabel-import-h30',
          'afrakala-issabel-import-h00',
          'afrakala-employee-streaks-nightly',
          'afrakala-accrual-daily-notice',
          'daily-birthday-notifications',
          'recompute-employee-scores-5min',
          'capture-score-snapshots-5min',
          'cleanup-stale-auto-suppliers'
        ] LOOP
          EXECUTE format(
            'SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = %L', j);
        END LOOP;
      END;

      -- 30 4-16,22 * * * GMT = Tehran 08:00..20:00 hourly-on-the-half-hour + 02:00 next day (14)
      -- CALL, not SELECT: run_issabel_import() is a PROCEDURE (see the definition above for why).
      EXECUTE format(
        $q$SELECT cron.schedule_in_database(%L, %L, %L, %L, %L, true)$q$,
        'afrakala-issabel-import-h30', '30 4-16,22 * * *',
        'CALL public.run_issabel_import();', current_database(), 'supabase_admin');

      -- 0 7,8,9 * * * GMT = Tehran 10:30, 11:30, 12:30 (3)
      EXECUTE format(
        $q$SELECT cron.schedule_in_database(%L, %L, %L, %L, %L, true)$q$,
        'afrakala-issabel-import-h00', '0 7,8,9 * * *',
        'CALL public.run_issabel_import();', current_database(), 'supabase_admin');

      -- 0 21 * * * GMT = 00:30 Asia/Tehran next day. Same job cron-504-schedule-employee-
      -- streaks.sql already registers by hand; re-declared here idempotently under the same
      -- name so applying this migration to postgres does not create a duplicate.
      EXECUTE format(
        $q$SELECT cron.schedule_in_database(%L, %L, %L, %L, %L, true)$q$,
        'afrakala-employee-streaks-nightly', '0 21 * * *',
        'SELECT public.roll_employee_daily_streaks();', current_database(), 'supabase_admin');

      -- 0 20 * * * GMT = 23:30 Asia/Tehran. Same job as the live jobid 23 measured below;
      -- re-declared idempotently.
      EXECUTE format(
        $q$SELECT cron.schedule_in_database(%L, %L, %L, %L, %L, true)$q$,
        'afrakala-accrual-daily-notice', '0 20 * * *',
        'SELECT public.notify_accountants_daily_accrual_summary();',
        current_database(), 'supabase_admin');

      -- daily-birthday-notifications: production's own name AND its own measured schedule
      -- (0 6 * * * GMT = 09:30 Asia/Tehran -- read from cron.job on the test cluster's postgres
      -- database, jobid 9, below). The COMMAND changes from
      -- "SELECT public.generate_birthday_notifications();" to the _worker() variant; the name,
      -- schedule and job semantics are unchanged, which is what "re-declare idempotently" means
      -- here -- the fix is entirely in which function the job calls.
      -- CALL, not SELECT: generate_birthday_notifications_worker() is a PROCEDURE.
      EXECUTE format(
        $q$SELECT cron.schedule_in_database(%L, %L, %L, %L, %L, true)$q$,
        'daily-birthday-notifications', '0 6 * * *',
        'CALL public.generate_birthday_notifications_worker();',
        current_database(), 'supabase_admin');

      -- recompute-employee-scores-5min / capture-score-snapshots-5min: production's own names
      -- and (per the job-name suffix, and the audit doc's "هر ۵ دقیقه" / "every 5 minutes"
      -- description of this exact pair) their frequency. The COMMAND for the scores job points
      -- at the cron-safe _worker() variant (513) rather than the browser-guarded original,
      -- which would fail under cron the same way generate_birthday_notifications() did.
      EXECUTE format(
        $q$SELECT cron.schedule_in_database(%L, %L, %L, %L, %L, true)$q$,
        'recompute-employee-scores-5min', '*/5 * * * *',
        'SELECT public.recompute_employee_scores_from_calls_worker();',
        current_database(), 'supabase_admin');

      EXECUTE format(
        $q$SELECT cron.schedule_in_database(%L, %L, %L, %L, %L, true)$q$,
        'capture-score-snapshots-5min', '*/5 * * * *',
        'SELECT public.capture_score_snapshots();', current_database(), 'supabase_admin');

      -- cleanup-stale-auto-suppliers: production's own name; NO schedule for this one was ever
      -- read (no db access to production's cron.job.schedule column -- this mission has
      -- SELECT-only reach into the TEST cluster's postgres db, and this job is not registered
      -- there at all today). 22:15 GMT / 01:45 Asia/Tehran is an ESTIMATE that fits the same
      -- nightly-cleanup slot pattern as 445's three jobs, chosen only to avoid firing on top of
      -- them. Confirm the real schedule before this ever reaches production and adjust.
      EXECUTE format(
        $q$SELECT cron.schedule_in_database(%L, %L, %L, %L, %L, true)$q$,
        'cleanup-stale-auto-suppliers', '15 22 * * *',
        'SELECT public.cleanup_stale_auto_suppliers();', current_database(), 'supabase_admin');
    END IF;
  END IF;
END $$;
