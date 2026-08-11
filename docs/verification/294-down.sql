-- Rollback for migration 294 — the shared accounting-document source.
-- No BEGIN/COMMIT: transaction control belongs to the caller (mission control rule 2.4).
--
-- The function creates and changes no data, so the rollback is complete. Asan numbers already
-- assigned to exported documents stay assigned, which is correct: a number is burned, never
-- recycled.
SET client_encoding='UTF8';

DROP FUNCTION IF EXISTS public.asan_list_journal_export(date, date, text);
