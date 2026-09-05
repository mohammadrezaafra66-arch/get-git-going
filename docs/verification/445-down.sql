-- Reverse of migration 445. Removes the schedule documentation comments only.
-- Applied to the afrakala database. Does NOT unschedule the cron jobs --
-- for that, run deploy/lan/scripts/cron-445-unschedule-afrakala-jobs.sql
-- against the postgres database.
SET client_encoding = 'UTF8';
COMMENT ON FUNCTION public.capture_score_snapshots() IS NULL;
COMMENT ON FUNCTION public.refresh_all_sale_list_prices() IS NULL;
COMMENT ON FUNCTION public.sync_product_price_observatory_rows() IS NULL;
