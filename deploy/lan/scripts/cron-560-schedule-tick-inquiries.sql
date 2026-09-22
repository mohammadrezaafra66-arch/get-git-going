-- 560 forward: register the inquiry SLA ticker against the afrakala database.
--
-- APPLY AGAINST THE postgres DATABASE, NOT afrakala:
--   psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 --single-transaction \
--        -f cron-560-schedule-tick-inquiries.sql
--
-- pg_cron's background worker reads cron.job from the database named by
-- cron.database_name (= 'postgres' here), so the job row must be created
-- there. cron.schedule_in_database(...) sets the target database per job, so
-- the command still runs against afrakala. No postgresql.conf change and no
-- container restart is required for scheduling.
--
-- On PRODUCTION the app database is named postgres — use the same schedule
-- with the 4th argument 'postgres' (see docs/qa/collab-prod-promotion-checklist-20260922.md).
--
-- Idempotent: an existing job of the same name is removed first.
-- ASCII-only.

SET client_encoding = 'UTF8';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'afrakala-tick-inquiries-1min') THEN
    PERFORM cron.unschedule('afrakala-tick-inquiries-1min');
  END IF;
END $$;

SELECT cron.schedule_in_database(
  'afrakala-tick-inquiries-1min',
  '* * * * *',
  'SELECT public.tick_inquiries();',
  'afrakala',
  'supabase_admin',
  true);
