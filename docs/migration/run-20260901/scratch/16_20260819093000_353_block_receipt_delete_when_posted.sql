-- 353 — a receipt that has posted to the ledger cannot be deleted
--
-- Gate A phase 2, defect M8 (docs/execution/phase-2-GATE-A.md).
--
-- WHY
--
-- Migration 343 made a posted journal entry immutable. It did not make the SOURCE row immutable,
-- and journal_entries.source_id is not a foreign key (ground-truth §5), so nothing connected the
-- two. Gate A measured the gap, as supabase_admin, inside BEGIN … ROLLBACK:
--
--   C3 DELETE payment_receipts as supabase_admin | SUCCEEDED
--   C4 after the delete | journal_entries=1 journal_lines=2 document_numbers=1
--                         credit_ledger_rows=1 available_credit=1284000.00
--   C5 the surviving entry | source row no longer exists: t
--   C6 delete the orphaned entry | sqlstate=P0001 msg=سند ثبت‌شده قابل تغییر نیست؛ برای اصلاح، سند برگشتی بزنید
--
-- Three residues, all permanent: an immutable posted entry pointing at nothing, and a customer
-- credit balance still carrying money whose receipt no longer exists. The document number is the
-- one thing that was handled correctly — tg_burn_receipt_document_number burns it.
--
-- Phase 1's Gate A raised the mechanism as M5 when journal_entries held ONE row. Phase 2 raised
-- that to 51 and shipped the function that creates every future one, so the exposure grew
-- fifty-fold in the same phase whose progress file asserted — wrongly — that these rows "cannot be
-- deleted".
--
-- THE FIX, AND ITS LIMIT
--
-- Refuse the delete at the door. That closes both residues at once: if the receipt cannot go, the
-- entry cannot be orphaned and the credit cannot be stranded, so no compensating balance logic is
-- needed and none is added here.
--
-- It is deliberately NOT the whole answer. The real remedy for a wrong posted document is a
-- reversal, and public.reverse_document does not exist (SELECT count(*) FROM pg_proc WHERE
-- proname='reverse_document' -> 0). That is OG-14, and it is explicitly out of scope for this
-- mission — it belongs to its own dispatch. Until it lands, this guard converts a silent,
-- irreversible corruption into a loud refusal. A refusal the user cannot yet act on is still
-- better than a corruption nobody notices, but it is a stopgap and is recorded as one.
--
-- The message deliberately mirrors tg_journal_entry_immutable's wording, because a user who hits
-- one will eventually hit the other and they describe the same rule. It names the reversal remedy
-- even though the remedy is not built yet: inventing a different instruction here would have to be
-- un-invented when OG-14 closes.
--
-- WHAT READS WHAT I AM ABOUT TO CREATE:
--
--   * Nothing reads a trigger. It fires on DELETE on public.payment_receipts and either raises or
--     returns OLD.
--
-- WHAT WRITES WHAT I AM ABOUT TO CHANGE — i.e. who deletes payment_receipts today:
--
--   * Database: nothing. A catalogue scan of every public function body for
--     'delete from … payment_receipts' returns ZERO functions. person_merge reassigns the persons
--     FKs, it does not delete receipts.
--   * Frontend: exactly one call site, src/shared/components/PaymentReceiptForm.tsx:1039 —
--     `await supabase.from("payment_receipts").delete().eq("id", receiptId)`. That is the legacy
--     compensating delete which ground-truth §4.1 records as a guaranteed no-op: payment_receipts
--     has no DELETE policy, so it matches zero rows. It targets a receipt the form has just
--     created with status='pending_review' and no journal entry, so even if a DELETE policy were
--     ever added, this guard would let it through.
--   * Operator: supabase_admin at a psql prompt, which is the path Gate A used and the one this
--     guard exists to stop.
--
--   So no working path is broken. The only behaviour that changes is a delete that would have
--   silently corrupted the ledger.
--
-- ORDERING AGAINST THE TEST-DATA CLEANUP: docs/verification/phase-2-remediation-testdata-cleanup.sql
-- removes the 50 stress receipts. It deletes their journal entries FIRST and the receipts second,
-- so by the time it reaches payment_receipts no posted entry references those rows and this guard
-- passes. Verified after applying — see docs/execution/phase-2-REMEDIATION-PROGRESS.md task R5.
-- Do not drop this trigger to make a cleanup run; order the cleanup correctly instead.
--
-- Rollback: docs/verification/353-down.sql — statements only, no BEGIN/COMMIT (M7).

SET client_encoding = 'UTF8';

CREATE OR REPLACE FUNCTION public.tg_payment_receipts_block_delete_when_posted()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  _entry_id uuid;
BEGIN
  SELECT je.id INTO _entry_id
    FROM public.journal_entries je
   WHERE je.source_type = 'payment_receipt'
     AND je.source_id = OLD.id
     AND je.status = 'posted'
   LIMIT 1;

  IF _entry_id IS NOT NULL THEN
    RAISE EXCEPTION
      'این فیش سند حسابداری ثبت‌شده دارد و حذف نمی‌شود؛ سند ثبت‌شده فقط با سند برگشتی اصلاح می‌شود'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN OLD;
END;
$function$;

COMMENT ON FUNCTION public.tg_payment_receipts_block_delete_when_posted() IS
  'Refuses to delete a payment_receipts row that has a posted journal entry. Without it the entry '
  'survives the delete permanently orphaned and undeletable, and the customer credit the receipt '
  'granted is stranded. Migration 353, Gate A M8. Stopgap until reverse_document exists (OG-14).';

DROP TRIGGER IF EXISTS trg_payment_receipts_block_delete_when_posted ON public.payment_receipts;
CREATE TRIGGER trg_payment_receipts_block_delete_when_posted
  BEFORE DELETE ON public.payment_receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_payment_receipts_block_delete_when_posted();
