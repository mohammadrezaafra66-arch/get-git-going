-- 504 forward: register the nightly employee-streak roll, which executes against the
-- afrakala database.
--
-- APPLY AGAINST THE postgres DATABASE, NOT afrakala:
--   psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 --single-transaction \
--        -f cron-504-schedule-employee-streaks.sql
--
-- pg_cron 1.6 is installed in postgres, not in afrakala - there is no `cron` schema in
-- afrakala at all, so `cron.schedule_in_database(...)` cannot be called from a migration
-- applied there. The background worker reads cron.job from the database named by
-- cron.database_name (= 'postgres' here), so the job row must be created there;
-- cron.schedule_in_database(...) sets the target database per job, so the command still runs
-- against afrakala. No postgresql.conf change and no container restart is required. This is
-- the same split migration 445 established for the three existing nightly jobs.
--
-- WHY 21:00 GMT. cron.timezone is GMT and Iran observes UTC+3:30 year-round (no DST since
-- 2022), so 0 21 * * * GMT = 00:30 Asia/Tehran on the FOLLOWING calendar day. The job
-- therefore always fires just after the Tehran date rolls over, and
-- roll_employee_daily_streaks() defaults p_day to tehran_today() - 1 so it settles the day
-- that has just ended. Running it at 02:00 Tehran like the other three jobs would work
-- equally well; running it BEFORE Tehran midnight would not, because the day would still be
-- in progress.
--
-- The job runs with no JWT, so auth.uid() is NULL inside it. roll_employee_daily_streaks()
-- is SECURITY DEFINER and asserts no role, precisely so that this is fine.
--
-- Idempotent: an existing job of the same name is removed first.

SET client_encoding = 'UTF8';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'afrakala-employee-streaks-nightly') THEN
    PERFORM cron.unschedule('afrakala-employee-streaks-nightly');
  END IF;
END $$;

-- 0 21 * * * GMT  =  00:30 Asia/Tehran (next calendar day)
SELECT cron.schedule_in_database(
  'afrakala-employee-streaks-nightly',
  '0 21 * * *',
  'SELECT public.roll_employee_daily_streaks();',
  'afrakala',
  'supabase_admin',
  true);
