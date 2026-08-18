-- phase-2-remediation-testdata-cleanup.sql
--
-- Gate A phase 2, defects M4 and M5. A ONE-TIME operational script for the TEST database.
--
-- THIS IS NOT A MIGRATION AND MUST NEVER BECOME ONE. It deletes rows that exist only because a
-- stress test was run against the shared test database on 2026-08-18. Shipping it under
-- supabase/migrations/ would put a DELETE over business tables into the sequence that phase 9
-- replays against production. It lives here, it is run by hand, and it is recorded in
-- docs/execution/phase-2-REMEDIATION-PROGRESS.md with its real before/after output.
--
-- ---------------------------------------------------------------------------------------------
-- M4 — what is being removed and why
-- ---------------------------------------------------------------------------------------------
--
-- Phase 2's stress test committed 50 receipts marked description='PHASE2_STRESS_do_not_keep'.
-- They are not inert test noise. Measured by Gate A:
--
--   * They are 50 of the 53 rows asan_list_bank_deposit_export returns for 2026-08-18, each with
--     blocked_reason = NULL — i.e. 50 fabricated "bank deposits" of 1,000 Toman, carrying a real
--     customer's real Asan code, on a page the accountant uses (/admin/asan-export).
--   * They add 50,000 Toman to the only bank account's total_in in vw_account_balances.
--   * They add 50 permanent posted entries to journal_entries, which held ONE row before phase 2.
--   * They add 50,000 Toman of spendable credit to customer d634ac60 (شخص آزمایشی 23).
--
-- Migration 350 does NOT hide them: they carry document_channel = NULL (the bank branch), so the
-- cash/cheque exclusion does not reach them. They have to be removed.
--
-- ---------------------------------------------------------------------------------------------
-- The phase's stated reason they "cannot be deleted" is wrong, and the real obstacle is elsewhere
-- ---------------------------------------------------------------------------------------------
--
-- phase-2-PROGRESS.md says: "migration 343 makes a posted entry immutable, so they cannot be
-- deleted". Gate A measured the opposite (M8): the RECEIPTS delete cleanly. What survives is their
-- JOURNAL ENTRIES, orphaned, because journal_entries.source_id is not a foreign key. So a naive
-- "just delete the receipts" turns 50 exportable fake deposits into 50 orphaned immutable posted
-- entries that asan_list_journal_export still returns and that nothing can ever remove.
--
-- Both halves therefore have to go, and the entries have to go FIRST.
--
-- ---------------------------------------------------------------------------------------------
-- How the immutability guarantee is bypassed, and why this way
-- ---------------------------------------------------------------------------------------------
--
-- trg_journal_entry_immutable / trg_journal_line_immutable (migration 343) have no escape hatch:
-- their bodies are `IF OLD.status = 'posted' THEN RAISE`. There is no GUC, no role check, nothing.
-- Removing these rows requires disabling them for the duration of the delete. Two ways exist:
--
--   (a) SET LOCAL session_replication_role = 'replica'
--       Rejected. It disables EVERY user trigger and every FK check for the session, including
--       tg_burn_receipt_document_number (which must fire, so the 50 document numbers are recorded
--       as burned) and tg_asan_burn_journal_entry_number (which burns the Asan document number).
--       Too wide a hole for the job.
--
--   (b) ALTER TABLE ... DISABLE TRIGGER <name>          <-- chosen
--       Disables exactly the two immutability triggers and nothing else. It is transactional in
--       PostgreSQL, so if anything below fails the triggers come back with the rollback, and it
--       holds ACCESS EXCLUSIVE on the two tables for the duration, so a concurrent session blocks
--       and then sees the re-enabled state rather than an unguarded table. Other agents share this
--       database (CLAUDE.md, "six agents"), which is why that property matters.
--
-- This is a deliberate, one-time, recorded bypass of a guarantee this programme installed on
-- purpose. It is written down here rather than done quietly at a psql prompt precisely because
-- Gate A m3 established that the last hand-edit of the numbering ledger was recorded only in a
-- test log.
--
-- audit_logs is deliberately NOT touched. The 50 'receipt_created' and 50 'credit_payment' rows
-- stay. The stress test really did happen and an audit trail that is edited to hide activity is
-- worse than one that references a deleted document. Nothing joins audit_logs to payment_receipts
-- on a foreign key, so nothing breaks.
--
-- ---------------------------------------------------------------------------------------------
-- M5 — the orphaned document number
-- ---------------------------------------------------------------------------------------------
--
-- RCP-1405-000051 is committed against source_id 8141b507-3905-4c2e-918f-a05b81b510c0, for which
-- no payment_receipts row exists and never did — it is the artefact of the same stress run's
-- same-source_id race probe, which called assign_document_number directly and committed. burned_at
-- is NULL, so the numbering ledger currently presents it as a live issued number pointing at a
-- document that does not exist.
--
-- Decision: BURN it, do not delete it. Gate A m3 objected to numbers being removed by hand; the
-- burn columns exist for exactly this and preserve the record that the serial was consumed. The
-- same applies to the 50 stress numbers, which burn automatically via tg_burn_receipt_document_number.
--
-- Consequence, recorded rather than hidden: the receipt series on this database will resume at
-- RCP-1405-000052, and serials 1-51 will all be present and marked burned. On a test database that
-- is the honest outcome. Production has its own database and its own series and is untouched.
--
-- ---------------------------------------------------------------------------------------------
-- NO TRANSACTION CONTROL IN THIS FILE (Gate A M7). The caller owns the transaction:
--   dry-run : psql … -v downfile=/tmp/cleanup.sql -f /tmp/rollback-dryrun.sql
--   for real: psql … -v ON_ERROR_STOP=1 --single-transaction -f /tmp/cleanup.sql
-- ---------------------------------------------------------------------------------------------

SET client_encoding = 'UTF8';

-- The exact set, resolved once and reused, so every statement below acts on the same 50 rows.
CREATE TEMP TABLE _stress_receipts ON COMMIT DROP AS
SELECT id, customer_id, amount
  FROM public.payment_receipts
 WHERE description = 'PHASE2_STRESS_do_not_keep';

CREATE TEMP TABLE _stress_entries ON COMMIT DROP AS
SELECT je.id
  FROM public.journal_entries je
 WHERE je.source_type = 'payment_receipt'
   AND je.source_id IN (SELECT id FROM _stress_receipts);

-- Refuse to run against anything unexpected. 50 receipts, 50 entries, nothing else.
DO $$
DECLARE _r int; _e int;
BEGIN
  SELECT count(*) INTO _r FROM _stress_receipts;
  SELECT count(*) INTO _e FROM _stress_entries;
  IF _r <> 50 OR _e <> 50 THEN
    RAISE EXCEPTION
      'safety gate: expected 50 stress receipts and 50 stress entries, found % and %. Stop and re-read the census before running this.',
      _r, _e
      USING ERRCODE = 'P0001';
  END IF;
END $$;

-- 1. The journal entries, first, with the two immutability triggers disabled for exactly this step.
ALTER TABLE public.journal_lines   DISABLE TRIGGER trg_journal_line_immutable;
ALTER TABLE public.journal_entries DISABLE TRIGGER trg_journal_entry_immutable;

DELETE FROM public.journal_lines
 WHERE journal_entry_id IN (SELECT id FROM _stress_entries);

DELETE FROM public.journal_entries
 WHERE id IN (SELECT id FROM _stress_entries);

ALTER TABLE public.journal_entries ENABLE TRIGGER trg_journal_entry_immutable;
ALTER TABLE public.journal_lines   ENABLE TRIGGER trg_journal_line_immutable;

-- 2. The credit the stress receipts granted. Delete the ledger rows and take the same amount back
--    off the balance, per person, computed from the rows actually removed rather than assumed.
CREATE TEMP TABLE _credit_backout ON COMMIT DROP AS
SELECT c.person_id AS customer_person_id, sum(l.amount) AS amount
  FROM public.customer_credit_ledger l
  JOIN public.customers c ON c.id = l.customer_id
 WHERE l.reference_type = 'receipt'
   AND l.reference_id IN (SELECT id FROM _stress_receipts)
 GROUP BY c.person_id;

DELETE FROM public.customer_credit_ledger
 WHERE reference_type = 'receipt'
   AND reference_id IN (SELECT id FROM _stress_receipts);

UPDATE public.customer_credit_balance b
   SET available_credit = b.available_credit - k.amount,
       updated_at = now()
  FROM _credit_backout k
 WHERE b.customer_person_id = k.customer_person_id;

-- 3. The receipts. Triggers are back on, so tg_burn_receipt_document_number burns each of the 50
--    numbers and tg_cleanup_receipt_attachments clears any attachments. payment_receipt_links and
--    payment_receipt_documents cascade (ON DELETE CASCADE, verified in pg_constraint).
DELETE FROM public.payment_receipts
 WHERE id IN (SELECT id FROM _stress_receipts);

-- 4. M5 — the orphaned number from the same-source_id race probe.
SELECT public.burn_document_number(
         'receipt',
         '8141b507-3905-4c2e-918f-a05b81b510c0'::uuid,
         'آزمون هم‌زمانی فاز ۲؛ سندی برای این شماره ثبت نشد');
