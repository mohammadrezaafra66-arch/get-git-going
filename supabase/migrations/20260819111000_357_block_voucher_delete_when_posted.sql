-- 357 — a posted payment voucher cannot be deleted (Gate A phase 3, OG-20)
--
-- ==============================================================================================
-- WHY THIS EXISTS, AND WHY IT IS NOT DEFERRED
-- ==============================================================================================
--
-- Migration 353 added trg_payment_receipts_block_delete_when_posted so a receipt carrying a posted
-- journal entry cannot be deleted and orphan it (phase-2 Gate A, M8). payment_vouchers had no
-- equivalent, so a posted payment voucher deleted freely and left an immutable orphaned entry —
-- the same failure, on the path phase 3 opened.
--
-- Phase 3 deferred this to OG-14 (reverse_document) on the grounds that a second stopgap is not the
-- cure. Phase-3 Gate A pushed back: this guard is 353's trigger with two identifiers changed, and
-- phase 3 is the phase that made the failure reachable. The owner agreed with Gate A. Building it
-- does not pre-empt OG-14 — reverse_document remains the cure for both sides — it stops one more
-- orphan being creatable in the meantime.
--
-- Why an orphan is worse than a refusal: journal_entries.source_id is NOT a foreign key
-- (ground-truth §5), so deleting the source document does not cascade. The entry survives with a
-- source_id that resolves to nothing, it cannot be deleted because a posted entry is immutable
-- (343), and it cannot be withdrawn because reverse_document does not exist (OG-14). It is
-- permanent, it is counted by every ledger reader, and nothing can remove it.
--
-- ==============================================================================================
-- WHAT WRITES OR DEPENDS ON WHAT I AM CHANGING  (README-EXECUTION §H, first half)
-- ==============================================================================================
--
--   Existing DELETE paths on payment_vouchers:
--     * policy payment_vouchers_delete_admin — DELETE granted to admin only, through PostgREST.
--     * trg_burn_payment_document_number (BEFORE DELETE) — burns the document number.
--     * trg_cleanup_payment_attachments (BEFORE DELETE) — clears attachments.
--     * No SQL function issues DELETE FROM payment_vouchers. Measured.
--     * docs/verification/phase-3-stress-cleanup.sql deletes vouchers — but AFTER deleting their
--       journal entries, so by the time this guard fires there is no posted entry to find and it
--       passes. Re-proved after applying this migration, and recorded in the remediation progress
--       file; the script's step order was already load-bearing and remains so.
--
--   Trigger ordering: PostgreSQL fires BEFORE DELETE triggers in name order —
--     trg_burn_payment_document_number, trg_cleanup_payment_attachments,
--     trg_payment_vouchers_block_delete_when_posted
--   so the burn and cleanup run first. That is harmless: this trigger RAISEs, which aborts the
--   whole statement, so their effects roll back with it. The same ordering property holds for 353
--   on the receipt side, where trg_burn_receipt_document_number sorts before the guard.
--
-- WHAT WILL READ THE ROWS THIS AFFECTS (§H, second half): nothing new. This migration creates no
-- rows and changes no column; it only refuses a DELETE that previously succeeded.
--
-- ==============================================================================================
-- MIRRORS 353 EXACTLY
-- ==============================================================================================
--
-- The body below is trg_payment_receipts_block_delete_when_posted with source_type changed from
-- 'payment_receipt' to 'payment_voucher' and the message changed from فیش to سند پرداخت. Same
-- BEFORE DELETE timing, same FOR EACH ROW, same SECURITY-clause-free definition (it needs no
-- elevation — it reads journal_entries, which the deleting session can already see), same
-- SET search_path, same ERRCODE, same RETURN OLD.
--
-- Rollback: docs/verification/357-down.sql — statements only, trigger before function.

SET client_encoding = 'UTF8';

CREATE OR REPLACE FUNCTION public.tg_payment_vouchers_block_delete_when_posted()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  _entry_id uuid;
BEGIN
  SELECT je.id INTO _entry_id
    FROM public.journal_entries je
   WHERE je.source_type = 'payment_voucher'
     AND je.source_id = OLD.id
     AND je.status = 'posted'
   LIMIT 1;

  IF _entry_id IS NOT NULL THEN
    RAISE EXCEPTION
      'این سند پرداخت سند حسابداری ثبت‌شده دارد و حذف نمی‌شود؛ سند ثبت‌شده فقط با سند برگشتی اصلاح می‌شود'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN OLD;
END;
$function$;

COMMENT ON FUNCTION public.tg_payment_vouchers_block_delete_when_posted() IS
  'Refuses to delete a payment_vouchers row that has a posted journal entry. Without it the entry '
  'survives the delete permanently orphaned and undeletable (source_id is not an FK, and 343 makes '
  'a posted entry immutable). Migration 357, phase-3 Gate A OG-20 — the mirror of migration 353 on '
  'the receipt side. Stopgap until reverse_document exists (OG-14).';

DROP TRIGGER IF EXISTS trg_payment_vouchers_block_delete_when_posted ON public.payment_vouchers;
CREATE TRIGGER trg_payment_vouchers_block_delete_when_posted
  BEFORE DELETE ON public.payment_vouchers
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_payment_vouchers_block_delete_when_posted();
