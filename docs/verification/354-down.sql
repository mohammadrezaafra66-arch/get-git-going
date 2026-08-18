-- 354-down.sql — reverse migration 354 (endorsed-cheque reference on payment_vouchers).
--
-- STATEMENTS ONLY. No BEGIN, no COMMIT, no ROLLBACK — the caller owns the transaction
-- (Gate A M7, phase-2 remediation). Apply for real with --single-transaction; dry-run with
-- docs/verification/rollback-dryrun.sql.
--
-- WHAT 354 ADDED, and therefore what this removes:
--   1. payment_vouchers.endorsed_receipt_id           (FK -> payment_receipts, ON DELETE RESTRICT)
--   2. payment_vouchers_endorsed_receipt_unique_idx   (partial UNIQUE: one live endorsement per cheque)
--   3. payment_vouchers_endorsed_requires_cheque_chk  (CHECK: only a cheque voucher may carry one)
--   4. the COMMENTs on the column
--
-- PRE-FLIGHT GATE. Dropping the column destroys the only record of which received cheque was
-- endorsed onward. That is data, not structure. If any voucher carries a value, this file refuses
-- rather than silently discarding it — the operator must decide what to do with those rows first.

SET client_encoding = 'UTF8';

DO $$
DECLARE
  _n int;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'payment_vouchers'
       AND column_name = 'endorsed_receipt_id'
  ) THEN
    EXECUTE 'SELECT count(*) FROM public.payment_vouchers WHERE endorsed_receipt_id IS NOT NULL'
      INTO _n;
    IF _n > 0 THEN
      RAISE EXCEPTION
        '354-down refuses: % payment_vouchers row(s) carry endorsed_receipt_id. Dropping the column would destroy the only record of which received cheque was endorsed onward. Resolve those rows first.',
        _n
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
END $$;

ALTER TABLE public.payment_vouchers
  DROP CONSTRAINT IF EXISTS payment_vouchers_endorsed_requires_cheque_chk;

DROP INDEX IF EXISTS public.payment_vouchers_endorsed_receipt_unique_idx;

ALTER TABLE public.payment_vouchers
  DROP COLUMN IF EXISTS endorsed_receipt_id;
