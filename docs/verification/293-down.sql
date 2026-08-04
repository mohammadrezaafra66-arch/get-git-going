-- Rollback for migration 293 — the purchase export source, and the canonical row shape.
-- No BEGIN/COMMIT: transaction control belongs to the caller (mission control rule 2.4).
--
-- This drops the purchase source and restores migration 292's original `quote_*` output names
-- for the sales source, so the database ends up exactly as 292 left it. The application code
-- from M4.4 would then have to be reverted too — they are one unit.
--
-- Neither function creates or changes any data, so nothing needs unwinding. Asan numbers already
-- assigned to exported documents stay assigned, which is correct: a number is burned, never
-- recycled.
SET client_encoding='UTF8';

DROP FUNCTION IF EXISTS public.asan_list_purchase_export(date, date);
DROP FUNCTION IF EXISTS public.asan_list_sales_export(date, date);

-- Re-apply migration 292 to restore the previous sales source:
--   docker cp supabase/migrations/20260805123000_292_asan_sales_export_source.sql \
--     afrakala-lan-db:/tmp/mig292.sql
--   docker exec ... psql -v ON_ERROR_STOP=1 --single-transaction -f /tmp/mig292.sql
