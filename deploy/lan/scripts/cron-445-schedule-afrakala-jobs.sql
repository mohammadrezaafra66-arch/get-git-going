-- 445 forward: register three periodic jobs that execute against the afrakala
-- database.
--
-- APPLY AGAINST THE postgres DATABASE, NOT afrakala:
--   psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 --single-transaction \
--        -f cron-445-schedule-afrakala-jobs.sql
--
-- pg_cron's background worker reads cron.job from the database named by
-- cron.database_name (= 'postgres' here), so the job rows must be created
-- there. cron.schedule_in_database(...) sets the target database per job, so
-- the commands still run against afrakala. No postgresql.conf change and no
-- container restart is required.
--
-- cron.timezone is GMT and Iran observes UTC+3:30 year-round (no DST since
-- 2022), so every schedule below is written in GMT with the Tehran local time
-- it corresponds to stated alongside it.
--
-- Idempotent: an existing job of the same name is removed first.

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
    END IF;
  END LOOP;
END $$;

-- 30 22 * * * GMT  =  02:00 Asia/Tehran (next calendar day)
SELECT cron.schedule_in_database(
  'afrakala-capture-score-snapshots-nightly',
  '30 22 * * *',
  'SELECT public.capture_score_snapshots();',
  'afrakala',
  'supabase_admin',
  true);

-- 45 22 * * * GMT  =  02:15 Asia/Tehran (next calendar day)
SELECT cron.schedule_in_database(
  'afrakala-refresh-sale-list-prices-nightly',
  '45 22 * * *',
  'SELECT public.refresh_all_sale_list_prices();',
  'afrakala',
  'supabase_admin',
  true);

-- 0 23 * * * GMT  =  02:30 Asia/Tehran (next calendar day)
SELECT cron.schedule_in_database(
  'afrakala-sync-price-observatory-daily',
  '0 23 * * *',
  'SELECT public.sync_product_price_observatory_rows();',
  'afrakala',
  'supabase_admin',
  true);
