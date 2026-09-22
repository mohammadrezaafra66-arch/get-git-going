-- 560: document + (when applied to postgres) register SLA ticker for inquiries.
--
-- WHY THIS FILE HAS TWO PATHS
-- ---------------------------
-- pg_cron 1.6 lives in database `postgres` (cron.database_name). Creating or
-- calling cron.* from `afrakala` fails — there is no cron schema there.
--
-- On the TEST host the app DB is `afrakala`, so:
--   1) Apply this file to afrakala → COMMENT only (ledger + discoverability).
--   2) Apply the companion script
--      deploy/lan/scripts/cron-560-schedule-tick-inquiries.sql
--      to postgres → registers job with database='afrakala'.
--
-- On PRODUCTION the app DB is itself `postgres`, so applying this file there
-- also registers the job with database='postgres' (see DO block below).
-- Prefer the companion script on test; prefer this DO block on prod when the
-- migration runs against postgres.
--
-- Idempotent: unschedule by jobname before schedule.
-- ASCII-only. No Persian literals.

SET client_encoding = 'UTF8';

COMMENT ON FUNCTION public.tick_inquiries() IS
  'Scheduled by pg_cron job "afrakala-tick-inquiries-1min" in the postgres database: * * * * * (every minute). Advances inquiry SLA statuses and may call auto_submit_penalty. On TEST register via deploy/lan/scripts/cron-560-schedule-tick-inquiries.sql (target DB afrakala). On PROD this migration registers target DB postgres when applied there.';

DO $$
DECLARE
  target_db text;
  j text := 'afrakala-tick-inquiries-1min';
BEGIN
  IF current_database() <> 'postgres' THEN
    RAISE NOTICE '560: current_database()=% — cron registration skipped (apply companion script to postgres on TEST).',
      current_database();
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_database WHERE datname = 'afrakala') THEN
    target_db := 'afrakala';
  ELSE
    target_db := 'postgres';
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = j) THEN
    PERFORM cron.unschedule(j);
  END IF;

  PERFORM cron.schedule_in_database(
    j,
    '* * * * *',
    'SELECT public.tick_inquiries();',
    target_db,
    'supabase_admin',
    true
  );

  RAISE NOTICE '560: scheduled % targeting database=%', j, target_db;
END $$;
