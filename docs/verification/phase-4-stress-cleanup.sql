-- phase-4-stress-cleanup.sql
--
-- Removes phase 4's OWN stress-test data. Run as part of phase 4, not left for the owner.
--
-- THIS IS NOT A MIGRATION AND MUST NEVER BECOME ONE. It deletes rows from business tables, and
-- phase 9 replays supabase/migrations/ against production. It lives here and is run by hand.
--
-- ---------------------------------------------------------------------------------------------
-- WHY IT EXISTS BEFORE THE STRESS TEST NEEDED IT
-- ---------------------------------------------------------------------------------------------
--
-- Phase 2 committed 50 stress receipts and left them; they became 50 of the 53 rows the
-- accountant's Asan bank-deposit export returned, and the owner ran a cleanup by hand days later.
-- Phase 3 wrote its cleanup WITH its stress test and did not repeat it. Phase 4 does the same.
--
-- WHAT THIS REMOVES
--
--   1. The 50 journal entries and 100 lines created by the 50 stress dual documents — FIRST,
--      because journal_entries.source_id is not a foreign key, so deleting the documents first
--      would leave 50 orphaned immutable posted entries that nothing can ever remove. Migration
--      360's delete guard also REFUSES the document delete while a posted entry references it, so
--      this order is not merely preferable, it is required.
--   2. The 50 dual_documents rows marked description='PHASE4_STRESS_do_not_keep'. Their document
--      numbers burn automatically via trg_dual_documents_burn_document_number.
--   3. DUAL-1405-000051 — the number minted by the same-source_id race probe against source_id
--      9d4e0000-0000-4000-8000-000000004004, for which no document exists and never did. It is
--      BURNED, not deleted: phase-2 Gate A m3 objected to numbers being removed by hand, and the
--      burn columns exist for exactly this. Phase 2 left the equivalent row behind as defect M5.
--
-- WHAT IT DELIBERATELY DOES NOT TOUCH
--
--   audit_logs. The 50 'dual_document_created' rows stay. The stress test really did happen, and an
--   audit trail edited to hide activity is worse than one referencing a deleted document. Nothing
--   joins audit_logs to dual_documents by foreign key.
--
-- HOW THE IMMUTABILITY GUARANTEE IS BYPASSED
--
--   trg_journal_entry_immutable / trg_journal_line_immutable (343) have no escape hatch. Exactly
--   those two are disabled, by name, for the duration — not session_replication_role='replica',
--   which would also disable trg_dual_documents_burn_document_number (which MUST fire) and every FK
--   check. ALTER TABLE ... DISABLE TRIGGER is transactional, so a failure restores them.
--
-- NO TRANSACTION CONTROL IN THIS FILE (Gate A M7). The caller owns the transaction:
--   dry-run : psql … -v downfile=/tmp/cleanup4.sql -f /tmp/rollback-dryrun.sql
--   for real: psql … -v ON_ERROR_STOP=1 --single-transaction -f /tmp/cleanup4.sql

SET client_encoding = 'UTF8';

CREATE TEMP TABLE _p4_docs ON COMMIT DROP AS
SELECT id FROM public.dual_documents WHERE description = 'PHASE4_STRESS_do_not_keep';

CREATE TEMP TABLE _p4_entries ON COMMIT DROP AS
SELECT je.id FROM public.journal_entries je
 WHERE je.source_type = 'dual_document'
   AND je.source_id IN (SELECT id FROM _p4_docs);

DO $$
DECLARE _d int; _e int;
BEGIN
  SELECT count(*) INTO _d FROM _p4_docs;
  SELECT count(*) INTO _e FROM _p4_entries;
  IF _d <> 50 OR _e <> 50 THEN
    RAISE EXCEPTION
      'safety gate: expected 50 stress dual documents and 50 stress entries, found % and %. Re-take the census before running this.',
      _d, _e
      USING ERRCODE = 'P0001';
  END IF;
END $$;

ALTER TABLE public.journal_lines   DISABLE TRIGGER trg_journal_line_immutable;
ALTER TABLE public.journal_entries DISABLE TRIGGER trg_journal_entry_immutable;

DELETE FROM public.journal_lines   WHERE journal_entry_id IN (SELECT id FROM _p4_entries);
DELETE FROM public.journal_entries WHERE id IN (SELECT id FROM _p4_entries);

ALTER TABLE public.journal_entries ENABLE TRIGGER trg_journal_entry_immutable;
ALTER TABLE public.journal_lines   ENABLE TRIGGER trg_journal_line_immutable;

-- Triggers are back on, so trg_dual_documents_burn_document_number burns each of the 50 numbers,
-- and trg_dual_documents_block_delete_when_posted now finds no posted entry and lets the delete run.
DELETE FROM public.dual_documents WHERE id IN (SELECT id FROM _p4_docs);

-- The race probe's orphan number.
SELECT public.burn_document_number(
         'dual',
         '9d4e0000-0000-4000-8000-000000004004'::uuid,
         'آزمون هم‌زمانی فاز ۴؛ سندی برای این شماره ثبت نشد');
