-- 445: record, inside the afrakala database, which functions are on a schedule.
--
-- WHY THIS MIGRATION CARRIES NO cron DDL
-- --------------------------------------
-- pg_cron 1.6 is installed in the *postgres* database, because the background
-- worker reads its job list from the database named by cron.database_name,
-- which is 'postgres' on this deployment. Creating the extension here is
-- refused outright:
--
--   ERROR:  can only create extension in database postgres
--   DETAIL: Jobs must be scheduled from the database configured in
--           cron.database_name, since the pg_cron background worker reads
--           job descriptions from this database.
--
-- The jobs themselves therefore live in postgres and are registered by
-- deploy/lan/scripts/cron-445-schedule-afrakala-jobs.sql. They execute
-- against afrakala via cron.schedule_in_database(...,'afrakala'), which needs
-- no configuration change and no container restart.
--
-- This file exists so that a reader of the afrakala database can discover the
-- schedule from the function itself, rather than having to know that a second
-- database holds the scheduler. It is pure metadata: COMMENT only, no data or
-- schema change. Reverse with docs/verification/445-down.sql.

SET client_encoding = 'UTF8';

COMMENT ON FUNCTION public.capture_score_snapshots() IS
  'Scheduled by pg_cron job "afrakala-capture-score-snapshots-nightly" in the postgres database: 30 22 * * * GMT = 02:00 Asia/Tehran daily. Copies employee_scores into score_snapshots and prunes snapshots older than 90 days.';

COMMENT ON FUNCTION public.refresh_all_sale_list_prices() IS
  'Scheduled by pg_cron job "afrakala-refresh-sale-list-prices-nightly" in the postgres database: 45 22 * * * GMT = 02:15 Asia/Tehran daily. Updates sale_list_items rows whose current_price differs from the latest product_computed_prices value.';

COMMENT ON FUNCTION public.sync_product_price_observatory_rows() IS
  'Scheduled by pg_cron job "afrakala-sync-price-observatory-daily" in the postgres database: 0 23 * * * GMT = 02:30 Asia/Tehran daily. Rebuilds the rows and system cells of dynamic table "afrakala-product-price-observatory" from the active product catalogue.';
