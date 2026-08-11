-- Rollback for migration 295 — the secondary bank-deposit export source.
-- No BEGIN/COMMIT: transaction control belongs to the caller (mission control rule 2.4).
--
-- The function creates and changes no data, so the rollback is complete. This is the SECONDARY
-- deposit path; dropping it leaves the accounting-document export from 4.5/4.6, which is the
-- default for deposits anyway.
SET client_encoding='UTF8';

DROP FUNCTION IF EXISTS public.asan_list_bank_deposit_export(date, date);
