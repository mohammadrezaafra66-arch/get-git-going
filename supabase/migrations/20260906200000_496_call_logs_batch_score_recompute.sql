SET client_encoding='UTF8';

-- ============================================================================
-- 496 - call_logs: retire the PER-ROW score recompute, replace it with a BATCH one.
-- ============================================================================
--
-- WHAT IS WRONG TODAY
-- -------------------
-- Measured live on 2026-09-06, before this migration:
--
--   trg_call_logs_recompute_employee_score
--     AFTER INSERT OR DELETE OR UPDATE ON public.call_logs
--     FOR EACH ROW EXECUTE FUNCTION recompute_employee_scores_on_call_log()
--
-- FOR EACH ROW. The function body calls public.calculate_employee_score(employee_id),
-- which runs the whole scoring engine (compute_employee_score) and REWRITES that
-- employee's row in public.employee_scores. So an import of N call detail records
-- fires N full score recomputes and N writes to employee_scores.
--
-- Probe, run inside BEGIN ... ROLLBACK as an admin JWT with call_logs at 0 rows:
--   INSERT 100 rows in ONE statement
--   -> 100 rows appeared in employee_score_events (source_table='call_logs')
-- One recompute per row. Measured, not assumed.
--
-- AND IT SWALLOWS EVERY ERROR
-- ---------------------------
-- The body wraps the recompute in `EXCEPTION WHEN OTHERS THEN NULL`. That is not a
-- theoretical concern here: calculate_employee_score's FIRST statement is
-- `PERFORM public.gamification_assert_manager()`, which RAISEs 42501 unless
-- auth.uid() holds 'admin' or 'manager'. So today the trigger has TWO silent modes
-- and no way to tell them apart from outside:
--   * admin/manager session -> N real recomputes, N employee_scores rewrites, silent
--   * any other session     -> N raised-and-discarded 42501s, nothing happens, silent
-- Neither reports anything. An import would look identical in both cases.
--
-- WHAT THE RECOMPUTE ACTUALLY DOES WITH CALL DATA - NOTHING
-- ---------------------------------------------------------
-- Read with pg_get_functiondef and grepped, not inferred. public.compute_employee_score
-- (311 lines) names `call_logs` exactly ONCE, and it is a COMMENT saying the opposite of
-- what the trigger implies:
--
--   -- Calls / talk-minutes ALWAYS come from staff_daily_performance_metrics
--   -- (call_logs has no data and no automatic source exists). talk_time_minutes
--   -- is already in minutes. Applies to everyone.
--
-- It reads public.staff_daily_performance_metrics in 8 places and public.call_logs in
-- none. It does read public.employee_score_events, but only
-- `WHERE e.event_type = 'promotion_completed'` - so the 'call_insert' rows the old
-- trigger wrote were never fed back into any score either.
--
-- The consequence is worth stating precisely, because it is NOT "the trigger is
-- harmless". The recompute cannot move a score using call data, but it DOES re-derive
-- the score from every other source (sales_quotes, payment_receipts, customers,
-- gamification_kpis, shop_settings, staff_daily_performance_metrics) and overwrite
-- employee_scores. Those sources drift constantly. So a bulk import silently re-bases
-- every touched employee's stored score to whatever the other tables happen to say at
-- that moment, N times, in the middle of an import - a score movement with no
-- reviewable cause, triggered by data that does not feed the score at all.
--
-- Making the scoring engine read call_logs is a DIFFERENT change (D-34, an engine
-- change) and is explicitly NOT in this wave. public.compute_employee_score's body is
-- NOT touched by this migration. It is only read.
--
-- WHAT THIS MIGRATION DOES
-- ------------------------
--   1. DROP TRIGGER trg_call_logs_recompute_employee_score.
--   2. DROP FUNCTION recompute_employee_scores_on_call_log() - zero remaining
--      references, verified below and asserted at the end.
--   3. CREATE FUNCTION recompute_employee_scores_from_calls(_since) - ONE recompute
--      per DISTINCT employee, not per row, and it does NOT swallow errors: failures
--      are collected and returned to the caller in the result jsonb.
--
-- Same probe, after this migration: 100 rows inserted in one statement, then one call
-- to the batch function -> 1 row in employee_score_events, not 100.
--
-- WHY THERE IS NO pg_cron JOB IN THIS MIGRATION
-- ---------------------------------------------
-- The brief offered "at the end of an import run, or a nightly pg_cron job". The
-- nightly option is not available in this database today, for two independent measured
-- reasons:
--
--   (a) pg_cron is NOT INSTALLED in `afrakala`.
--         SELECT installed_version FROM pg_available_extensions WHERE name='pg_cron'
--         -> NULL   (and `SELECT count(*) FROM pg_namespace WHERE nspname='cron'` -> 0)
--       It is installed in the `postgres` database. The three jobs that operate on
--       afrakala (jobids 20, 21, 22) are scheduled FROM `postgres` with
--       database='afrakala'. A migration applied to `afrakala` therefore cannot call
--       cron.schedule at all - cron.job does not exist here.
--
--   (b) Even if it could, a cron session carries no JWT, so auth.uid() is NULL and
--       gamification_assert_manager() RAISEs 42501. The nightly job would do nothing.
--
-- So the batch is an END-OF-IMPORT-RUN call, made by the importer under an
-- admin/manager context - the first of the brief's two options. The importer is C-4,
-- which is blocked on the Issabel MySQL credential and is not built in this wave.
-- Until it exists, this function has no automatic caller, which is correct: call_logs
-- holds 0 rows and no application code writes to it (grepped: the only src/ and e2e/
-- mentions are the generated type file and the anon-grant security spec).
--
-- NOTHING IS LOST BY DROPPING THE TRIGGER
-- ---------------------------------------
-- call_logs holds 0 rows. No route, hook, service or server module writes to it.
-- The two other recompute triggers in the schema - on payment_receipts and
-- payment_receipt_links - are NOT touched by this migration and keep firing exactly
-- as before.
--
-- No DROP TABLE, no TRUNCATE, no DELETE, no data touched. anon receives nothing.
-- Rollback: docs/verification/496-down.sql
-- ============================================================================

-- Shared development database with other agents' migrations in flight: fail cleanly on
-- a lock fight instead of blocking someone else's transaction indefinitely.
SET lock_timeout = '60s';


-- ----------------------------------------------------------------------------
-- 1. Retire the per-row trigger and its function.
--
--    Verified before writing this file:
--      * the function is used by exactly ONE trigger, the one dropped here
--          SELECT tgrelid::regclass, tgname FROM pg_trigger
--           WHERE tgfoid = 'public.recompute_employee_scores_on_call_log()'::regprocedure
--          -> call_logs.trg_call_logs_recompute_employee_score  (1 row)
--      * no other function body mentions it
--          SELECT ... FROM pg_proc WHERE prosrc LIKE '%recompute_employee_scores_on_call_log%'
--          -> 0 rows
--
--    CLAUDE.md rule 3 forbids DROP TABLE / TRUNCATE / DELETE on data. DROP FUNCTION is
--    explicitly permitted, and leaving an orphaned trigger function behind would invite
--    someone to re-attach the very thing this migration exists to remove.
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_call_logs_recompute_employee_score ON public.call_logs;
DROP FUNCTION IF EXISTS public.recompute_employee_scores_on_call_log();


-- ----------------------------------------------------------------------------
-- 2. The batch recompute.
--
--    Scope: one PERFORM calculate_employee_score per DISTINCT employee_id present in
--    call_logs, optionally narrowed to rows created at or after _since so an importer
--    can recompute only the employees its own run touched.
--
--    Authorization: the SAME bar the old path had - gamification_assert_manager(),
--    admin or manager - but asserted ONCE, up front, and NOT swallowed. A caller
--    without the role now gets the 42501 instead of silence. SECURITY DEFINER matches
--    calculate_employee_score and recompute_all_employee_scores, both of which are
--    SECURITY DEFINER today.
--
--    Error handling is the deliberate opposite of the function this replaces. A failure
--    on one employee must not abandon the remaining employees, so each is wrapped - but
--    the error is CAPTURED and RETURNED, never discarded. `failure_count` in the result
--    is the value an importer checks.
--
--    One employee_score_events row is written per employee recomputed, with
--    event_type 'call_batch_recompute'. That is both the audit trail for a batch and
--    the probe: the same query that returned 100 for the per-row trigger returns 1 here.
--    The event_type is deliberately NOT 'promotion_completed', which is the only
--    event_type compute_employee_score reads, so these rows stay inert to scoring.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_employee_scores_from_calls(
  _since timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _uid      uuid := auth.uid();
  _emp      uuid;
  _ok       integer := 0;
  _seen     integer := 0;
  _failures jsonb := '[]'::jsonb;
BEGIN
  -- Admin or manager, exactly as before -- but raised, not swallowed.
  PERFORM public.gamification_assert_manager();

  FOR _emp IN
    SELECT DISTINCT cl.employee_id
      FROM public.call_logs cl
     WHERE cl.employee_id IS NOT NULL
       AND (_since IS NULL OR cl.created_at >= _since)
     ORDER BY 1
  LOOP
    _seen := _seen + 1;
    BEGIN
      PERFORM public.calculate_employee_score(_emp);
      _ok := _ok + 1;

      INSERT INTO public.employee_score_events
        (employee_id, event_type, source_table, source_id, payload)
      VALUES
        (_emp, 'call_batch_recompute', 'call_logs', NULL,
         jsonb_build_object('since', _since, 'actor', _uid));
    EXCEPTION WHEN OTHERS THEN
      -- Captured, not discarded. This is the whole point of the replacement.
      _failures := _failures || jsonb_build_object(
        'employee_id', _emp,
        'sqlstate',    SQLSTATE,
        'message',     SQLERRM
      );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'employees_seen',       _seen,
    'employees_recomputed', _ok,
    'failure_count',        jsonb_array_length(_failures),
    'failures',             _failures,
    'since',                _since
  );
END;
$function$;

COMMENT ON FUNCTION public.recompute_employee_scores_from_calls(timestamptz) IS
  'Batch replacement for the per-row trigger trg_call_logs_recompute_employee_score, '
  'removed by migration 496. Recomputes each employee score ONCE per import run '
  'instead of once per imported call detail record. Pass _since to narrow to the rows '
  'a single run created. Requires admin or manager. Unlike the trigger it replaced, it '
  'returns its failures instead of discarding them -- check failure_count.';

REVOKE ALL ON FUNCTION public.recompute_employee_scores_from_calls(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recompute_employee_scores_from_calls(timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.recompute_employee_scores_from_calls(timestamptz) TO authenticated;


-- ----------------------------------------------------------------------------
-- 3. Assertions. A migration that cannot prove its own postcondition is a claim.
-- ----------------------------------------------------------------------------
DO $do$
DECLARE
  _trg   int;
  _oldfn int;
  _newfn int;
BEGIN
  -- 3a. The per-row trigger is gone by name. (Counted separately rather than asserting
  --     "no triggers at all", so a later migration that legitimately adds one to
  --     call_logs cannot make this assertion retroactively wrong.)
  IF EXISTS (SELECT 1 FROM pg_trigger
              WHERE tgrelid = 'public.call_logs'::regclass
                AND tgname = 'trg_call_logs_recompute_employee_score') THEN
    RAISE EXCEPTION '496: trg_call_logs_recompute_employee_score still exists on call_logs';
  END IF;

  SELECT count(*) INTO _trg
    FROM pg_trigger
   WHERE tgrelid = 'public.call_logs'::regclass
     AND NOT tgisinternal;

  -- 3b. The old trigger function is gone, with zero references left behind.
  SELECT count(*) INTO _oldfn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'recompute_employee_scores_on_call_log';
  IF _oldfn <> 0 THEN
    RAISE EXCEPTION '496: recompute_employee_scores_on_call_log still exists';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public'
                AND p.prosrc LIKE '%recompute_employee_scores_on_call_log%') THEN
    RAISE EXCEPTION '496: some function body still references the dropped trigger function';
  END IF;

  -- 3c. The batch function exists, exactly once (no overload).
  SELECT count(*) INTO _newfn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'recompute_employee_scores_from_calls';
  IF _newfn <> 1 THEN
    RAISE EXCEPTION '496: expected exactly 1 recompute_employee_scores_from_calls, found %',
      _newfn;
  END IF;

  -- 3d. anon cannot execute it.
  IF has_function_privilege('anon',
       'public.recompute_employee_scores_from_calls(timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION '496: anon can execute recompute_employee_scores_from_calls';
  END IF;

  -- 3e. compute_employee_score was NOT touched -- it must still be there, unchanged in
  --     signature, and still be the function the batch path ends up calling.
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'compute_employee_score') THEN
    RAISE EXCEPTION '496: compute_employee_score is missing';
  END IF;

  RAISE NOTICE
    '496 OK: per-row call_logs recompute retired (call_logs now carries % user trigger(s)); batch entry point installed; anon has nothing',
    _trg;
END
$do$;
