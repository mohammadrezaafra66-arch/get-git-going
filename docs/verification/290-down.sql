-- Rollback for migration 290 — Asan document numbering.
-- No BEGIN/COMMIT: transaction control belongs to the caller (mission control rule 2.4).
--
-- WARNING: dropping asan_export_numbers destroys the record of which Asan number belongs to
-- which document. If any export has already been handed to the accountant, do not run this —
-- re-exporting after the table is gone would renumber documents that already exist in Asan.
SET client_encoding='UTF8';

DROP TRIGGER IF EXISTS trg_asan_burn_journal_entry_number ON public.journal_entries;
DROP TRIGGER IF EXISTS trg_asan_burn_purchase_number ON public.purchases;
DROP TRIGGER IF EXISTS trg_asan_burn_sales_quote_number ON public.sales_quotes;

DROP FUNCTION IF EXISTS public.tg_asan_burn_journal_entry_number();
DROP FUNCTION IF EXISTS public.tg_asan_burn_purchase_number();
DROP FUNCTION IF EXISTS public.tg_asan_burn_sales_quote_number();
DROP FUNCTION IF EXISTS public.asan_burn_document_number(text, uuid, text);
DROP FUNCTION IF EXISTS public.asan_assign_document_number(text, uuid);

DROP TABLE IF EXISTS public.asan_export_numbers;
