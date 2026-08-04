-- Rollback for migration 297 — the invoice_ar Asan code.
-- No BEGIN/COMMIT: transaction control belongs to the caller (mission control rule 2.4).
--
-- Dropping the table makes `invoice_ar` unresolvable again, so any accounting document
-- containing such a line goes back to being blocked and named. That is a safe direction: it
-- stops emitting a code, it never emits a wrong one.
--
-- The row builder must then be restored to migration 294's version, which reads no control
-- table. Re-apply it after this script:
--   docker cp supabase/migrations/20260805143000_294_asan_journal_export_source.sql \
--     afrakala-lan-db:/tmp/mig294.sql
--   docker exec ... psql -v ON_ERROR_STOP=1 --single-transaction -f /tmp/mig294.sql
SET client_encoding='UTF8';

DROP TABLE IF EXISTS public.asan_control_accounts;
