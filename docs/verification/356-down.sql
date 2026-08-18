-- 356-down.sql — reverse migration 356 (unconditional endorsement uniqueness, B1).
--
-- STATEMENTS ONLY. No BEGIN, no COMMIT, no ROLLBACK — the caller owns the transaction (Gate A M7).
--
-- WHAT 356 CHANGED, and therefore what this puts back:
--   1. payment_vouchers_endorsed_receipt_unique_idx — from unconditional back to the partial form
--      that excluded status = 'rejected'.
--   2. create_payment — its endorsement EXISTS guard, back to the same 'rejected' exclusion.
--
-- READ THIS BEFORE RUNNING IT.
--
-- Reverting reopens phase-3 Gate A defect B1: a rejected voucher's journal entry stays posted and
-- immutable (343), so freeing the cheque on rejection lets the SAME cheque be credited twice, with
-- no way back while reverse_document does not exist (OG-14). Gate A reproduced one 300,000 cheque
-- becoming 600,000 credited across two suppliers. The owner chose the unconditional rule on
-- 2026-08-19 knowing the cost: a mistaken endorsement cannot be corrected until reverse_document
-- exists.
--
-- This file therefore restores the PREVIOUS behaviour faithfully rather than a safer variant — a
-- rollback file that quietly improves on what it reverts is not a rollback. If you are running it,
-- you are choosing the double-credit risk deliberately.
--
-- PRE-FLIGHT GATE. If two or more live vouchers already share an endorsed_receipt_id — which the
-- unconditional index makes impossible but a prior state may have allowed — the partial index
-- cannot be created either, and this file says so rather than failing on an opaque duplicate-key
-- error.

SET client_encoding = 'UTF8';

DO $$
DECLARE _dupe int;
BEGIN
  SELECT count(*) INTO _dupe FROM (
    SELECT endorsed_receipt_id
      FROM public.payment_vouchers
     WHERE endorsed_receipt_id IS NOT NULL AND status <> 'rejected'
     GROUP BY endorsed_receipt_id HAVING count(*) > 1) q;
  IF _dupe > 0 THEN
    RAISE EXCEPTION
      '356-down refuses: % cheque(s) are already referenced by more than one non-rejected voucher. The partial index cannot be rebuilt over them. Resolve the duplicates first.',
      _dupe
      USING ERRCODE = 'P0001';
  END IF;
END $$;

DROP INDEX IF EXISTS public.payment_vouchers_endorsed_receipt_unique_idx;

CREATE UNIQUE INDEX payment_vouchers_endorsed_receipt_unique_idx
  ON public.payment_vouchers (endorsed_receipt_id)
  WHERE endorsed_receipt_id IS NOT NULL AND status <> 'rejected';

COMMENT ON INDEX public.payment_vouchers_endorsed_receipt_unique_idx IS
  'Reverted by 356-down to the partial form from migration 354. Excludes status=''rejected'', which '
  'reopens Gate A defect B1 — see docs/execution/phase-3-GATE-A.md.';

-- Restore the guard inside create_payment to match the index it is paired with. Only the two
-- predicate lines differ from the 356 version; everything else is byte-identical, so this is a
-- targeted revert rather than a re-authoring.
DO $$
DECLARE _src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_payment';

  IF _src IS NULL THEN
    RAISE EXCEPTION '356-down: create_payment does not exist; nothing to revert'
      USING ERRCODE = 'P0001';
  END IF;

  IF position('AND pv.status <> ''rejected''' in _src) > 0 THEN
    RAISE NOTICE '356-down: create_payment already carries the rejected-exclusion guard; leaving it.';
    RETURN;
  END IF;

  _src := replace(
            _src,
            'WHERE pv.endorsed_receipt_id = p_endorsed_cheque_id)',
            'WHERE pv.endorsed_receipt_id = p_endorsed_cheque_id'
              || E'\n                  AND pv.status <> ''rejected'')');

  EXECUTE _src;
  RAISE NOTICE '356-down: create_payment guard reverted to the rejected-exclusion form.';
END $$;
