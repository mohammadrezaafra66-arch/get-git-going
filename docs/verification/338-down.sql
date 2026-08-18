-- 338-down.sql -- rollback for migration 338 (task 1.2)
-- Safe while nothing references assign_document_number (i.e. before phase 2 wires it in).
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
