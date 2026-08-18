-- 338-down.sql -- rollback for migration 338 (task 1.2)
--
-- *** DATA LOSS WARNING (Gate A m1) ***
-- DROP TABLE document_numbers destroys the ENTIRE numbering ledger. Document numbers are the one
-- artefact in this phase that cannot be regenerated: the series is max+1 over surviving rows, and
-- burned numbers are deliberately never reissued. Dropping the table and recreating it restarts
-- every series at 1, so numbers already given to real documents would be handed out a second time.
--
-- PRE-FLIGHT, run this first and stop if it is not 0:
--     SELECT count(*) FROM public.document_numbers;
--
-- Safe while assign_document_number has no callers (i.e. before phase 2 wires it in).
-- Roll this back BEFORE 337 (jalali_year), which it depends on.
SET client_encoding='UTF8';
BEGIN;
DROP TRIGGER IF EXISTS trg_burn_payment_document_number ON public.payment_vouchers;
DROP TRIGGER IF EXISTS trg_burn_receipt_document_number ON public.payment_receipts;
DROP FUNCTION IF EXISTS public.tg_burn_payment_document_number();
DROP FUNCTION IF EXISTS public.tg_burn_receipt_document_number();
DROP FUNCTION IF EXISTS public.burn_document_number(text, uuid, text);
DROP FUNCTION IF EXISTS public.assign_document_number(text, uuid);
DROP TABLE IF EXISTS public.document_numbers;
COMMIT;
