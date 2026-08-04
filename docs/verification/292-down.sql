-- Rollback for migration 292 — the sales-export source query.
-- No BEGIN/COMMIT: transaction control belongs to the caller (mission control rule 2.4).
--
-- Dropping this function disables export 1 entirely. It creates and changes no data, so the
-- rollback is complete: nothing needs unwinding, and any Asan numbers already assigned to
-- exported quotes stay assigned, which is correct — a number is burned, never recycled.
SET client_encoding='UTF8';

DROP FUNCTION IF EXISTS public.asan_list_sales_export(date, date);
