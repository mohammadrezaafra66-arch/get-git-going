-- phase-3-stress-cleanup.sql
--
-- Removes phase 3's OWN stress-test data. Run as part of phase 3, not left for the owner.
--
-- THIS IS NOT A MIGRATION AND MUST NEVER BECOME ONE. It deletes rows from business tables, and
-- phase 9 replays supabase/migrations/ against production. It lives here and is run by hand.
--
-- ---------------------------------------------------------------------------------------------
-- WHY IT EXISTS BEFORE THE STRESS TEST DID
-- ---------------------------------------------------------------------------------------------
--
-- Phase 2 committed 50 stress receipts and left them. They became 50 of the 53 rows the
-- accountant's Asan bank-deposit export returned at /admin/asan-export, each with
-- blocked_reason = NULL — 50 fabricated deposits presented as clean and submittable — and removing
-- them needed a hand-run by the owner days later. Phase 3's exit criteria forbid repeating that.
--
-- WHAT THIS REMOVES
--
--   1. The 50 journal entries and 100 lines created by the 50 stress payments — FIRST, because
--      journal_entries.source_id is not a foreign key, so deleting the vouchers first would leave
--      50 orphaned immutable posted entries that nothing can ever remove (Gate A M8).
--   2. The 50 payment_vouchers rows marked description='PHASE3_STRESS_do_not_keep'. Their document
--      numbers burn automatically via trg_burn_payment_document_number.
--   3. PAY-1405-000051 — the number minted by the same-source_id race probe against source_id
--      7c9e5a10-3f2b-4d61-9e88-000000003003, for which no voucher exists and never did. It is
--      BURNED, not deleted: Gate A m3 objected to numbers being removed by hand, and the burn
--      columns exist for exactly this. Phase 2 left the equivalent row (RCP-1405-000051) behind as
--      defect M5; this phase does not.
--
-- WHAT IT DELIBERATELY DOES NOT TOUCH
--
--   audit_logs. The 50 'payment_created' rows stay. The stress test really did happen, and an
--   audit trail edited to hide activity is worse than one referencing a deleted document. Nothing
--   joins audit_logs to payment_vouchers by foreign key.
--
-- HOW THE IMMUTABILITY GUARANTEE IS BYPASSED
--
--   trg_journal_entry_immutable / trg_journal_line_immutable (343) have no escape hatch. Exactly
--   those two triggers are disabled, by name, for the duration — not
--   session_replication_role='replica', which would also disable
--   trg_burn_payment_document_number (which MUST fire) and every FK check. ALTER TABLE ... DISABLE
--   TRIGGER is transactional, so a failure anywhere restores them with the rollback.
--
--   Note for the record: payment_vouchers has no equivalent of migration 353's delete guard, so a
--   posted payment voucher deletes freely and would orphan its entry. That asymmetry is recorded
--   in phase-3-PROGRESS.md as OG-20; it is not fixed here.
--
-- NO TRANSACTION CONTROL IN THIS FILE (Gate A M7). The caller owns the transaction:
--   dry-run : psql … -v downfile=/tmp/cleanup3.sql -f /tmp/rollback-dryrun.sql
--   for real: psql … -v ON_ERROR_STOP=1 --single-transaction -f /tmp/cleanup3.sql

SET client_encoding = 'UTF8';

CREATE TEMP TABLE _p3_vouchers ON COMMIT DROP AS
SELECT id FROM public.payment_vouchers WHERE description = 'PHASE3_STRESS_do_not_keep';

CREATE TEMP TABLE _p3_entries ON COMMIT DROP AS
SELECT je.id FROM public.journal_entries je
 WHERE je.source_type = 'payment_voucher'
   AND je.source_id IN (SELECT id FROM _p3_vouchers);

-- Refuse to run against anything unexpected.
DO $$
DECLARE _v int; _e int;
BEGIN
  SELECT count(*) INTO _v FROM _p3_vouchers;
  SELECT count(*) INTO _e FROM _p3_entries;
  IF _v <> 50 OR _e <> 50 THEN
    RAISE EXCEPTION
      'safety gate: expected 50 stress vouchers and 50 stress entries, found % and %. Re-take the census before running this.',
      _v, _e
      USING ERRCODE = 'P0001';
  END IF;
END $$;

ALTER TABLE public.journal_lines   DISABLE TRIGGER trg_journal_line_immutable;
ALTER TABLE public.journal_entries DISABLE TRIGGER trg_journal_entry_immutable;

DELETE FROM public.journal_lines   WHERE journal_entry_id IN (SELECT id FROM _p3_entries);
DELETE FROM public.journal_entries WHERE id IN (SELECT id FROM _p3_entries);

ALTER TABLE public.journal_entries ENABLE TRIGGER trg_journal_entry_immutable;
ALTER TABLE public.journal_lines   ENABLE TRIGGER trg_journal_line_immutable;

-- Triggers are back on, so trg_burn_payment_document_number burns each of the 50 numbers.
DELETE FROM public.payment_vouchers WHERE id IN (SELECT id FROM _p3_vouchers);

-- The race probe's orphan number.
SELECT public.burn_document_number(
         'payment',
         '7c9e5a10-3f2b-4d61-9e88-000000003003'::uuid,
         'آزمون هم‌زمانی فاز ۳؛ سندی برای این شماره ثبت نشد');
