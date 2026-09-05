-- 445 backward: remove the three jobs registered by
-- cron-445-schedule-afrakala-jobs.sql.
--
-- APPLY AGAINST THE postgres DATABASE, NOT afrakala:
--   psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 --single-transaction \
--        -f cron-445-unschedule-afrakala-jobs.sql
--
-- Safe to run when the jobs are absent. Touches only cron.job rows created by
-- 445; it deliberately leaves the pre-existing jobs 9-12 alone.

SET client_encoding = 'UTF8';

DO $$
DECLARE
  j text;
BEGIN
  FOREACH j IN ARRAY ARRAY[
    'afrakala-capture-score-snapshots-nightly',
    'afrakala-refresh-sale-list-prices-nightly',
    'afrakala-sync-price-observatory-daily'
  ] LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = j) THEN
      PERFORM cron.unschedule(j);
      RAISE NOTICE 'unscheduled %', j;
    END IF;
  END LOOP;
END $$;
