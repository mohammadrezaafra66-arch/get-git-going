-- 354 — payment_vouchers gains a reference to the received cheque it endorses
--
-- Phase 3, task 3.8 (MASTER-CHECKLIST). Schema support only; create_payment arrives in 355.
--
-- ---------------------------------------------------------------------------------------------
-- WHY THIS COLUMN HAS TO EXIST BEFORE 3.8 CAN BE WRITTEN
-- ---------------------------------------------------------------------------------------------
--
-- Task 3.8's Accept is: "the referenced cheque is not reusable — a second endorsement raises."
-- That cannot be enforced without somewhere to record which cheque was endorsed. Measured before
-- writing this: there is NO cheque register on this database at all —
--
--   SELECT table_name FROM information_schema.tables
--    WHERE table_schema='public' AND table_name ~ 'cheque';   -> 0 rows
--
-- A2 defers the cheque lifecycle deliberately, so this migration does NOT build one. It adds the
-- single reference the acceptance criterion needs and nothing more.
--
-- WHAT "THE SAME CHEQUE" MEANS HERE, established rather than assumed:
--
--   A cheque we hold is a payment_receipts row with document_channel = 'cheque'. That is the only
--   place a received cheque exists in this schema (migration 341 added the cheque channel; 348
--   gave payment_receipts_receiver_exclusive_chk its cheque branch). Its drawer is the receipt's
--   customer, which is why the endorsed credit line can key to cheque_receivable -> customers and
--   satisfy validate_journal_line_ref without any new mapping (T13 constraint 1).
--
--   So "the same cheque" = the same payment_receipts.id. A second endorsement of it is a second
--   payment_vouchers row carrying the same endorsed_receipt_id, and the partial UNIQUE index below
--   is what makes that raise.
--
-- WHY A PARTIAL UNIQUE INDEX AND NOT A PLAIN ONE:
--
--   status is draft | approved | rejected. A rejected voucher must not permanently consume the
--   cheque — an operator who rejects a mistaken endorsement has to be able to endorse it correctly.
--   The predicate therefore excludes 'rejected' only. A 'draft' voucher DOES hold the cheque, so a
--   half-finished endorsement cannot be raced by a second one.
--
-- ---------------------------------------------------------------------------------------------
-- WHAT WRITES OR DEPENDS ON payment_vouchers, MEASURED BEFORE CHANGING IT (README-EXECUTION §H)
-- ---------------------------------------------------------------------------------------------
--
--   Writers:  pay_purchase_with_voucher (the only SQL writer; INSERTs a fixed column list, so a
--             new nullable column cannot break it), and createPaymentVoucher in the front end
--             (src/lib/treasury/queries.ts, a named-column insert — same reasoning).
--   Readers:  asan_list_journal_export, get_account_ledger, person_fk_drift_report, person_merge,
--             validate_document_attachment_ref, and the view vw_account_balances. None of them
--             does SELECT *, and none enumerates columns positionally.
--   Triggers: trg_payment_vouchers_number, trg_payment_vouchers_derive_person,
--             trg_burn_payment_document_number, trg_cleanup_payment_attachments,
--             trg_payment_vouchers_updated_at. None reads the column set dynamically.
--
--   ADD COLUMN with no DEFAULT and no NOT NULL is metadata-only in PostgreSQL 11+, so it takes no
--   table rewrite and no long lock. payment_vouchers currently holds 0 rows in any case.
--
-- WHAT WILL READ THE ROWS THIS ENABLES:
--
--   Nothing reads endorsed_receipt_id yet — 355 writes it and phase 5 will read it. Recorded here
--   so the next author does not assume a consumer exists.
--
-- THE persons FK GATE (CLAUDE.md rule 9, migration 328):
--
--   trg_person_fk_registry_gate aborts DDL when the set of persons-referencing foreign keys and
--   person_merge's internal registry disagree. This FK references payment_receipts, NOT persons,
--   so it does not change that set and the gate does not fire. Verified by applying this whole
--   migration inside BEGIN … ROLLBACK before applying it for real.
--
-- Rollback: docs/verification/354-down.sql — statements only, with a pre-flight gate that refuses
-- to drop the column while any row carries a value.

SET client_encoding = 'UTF8';

ALTER TABLE public.payment_vouchers
  ADD COLUMN IF NOT EXISTS endorsed_receipt_id uuid
    REFERENCES public.payment_receipts(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.payment_vouchers.endorsed_receipt_id IS
  'The received cheque (payment_receipts row, document_channel=''cheque'') that this voucher '
  'endorses onward to the payee. NULL for every other kind of payment. There is no cheque register '
  'on this database (A2 defers the lifecycle), so a payment_receipts row IS the cheque. '
  'Migration 354, phase 3 task 3.8.';

-- One live endorsement per cheque. 'rejected' is excluded so a mistaken endorsement can be
-- corrected; 'draft' is NOT excluded, so a half-finished endorsement still holds the cheque.
CREATE UNIQUE INDEX IF NOT EXISTS payment_vouchers_endorsed_receipt_unique_idx
  ON public.payment_vouchers (endorsed_receipt_id)
  WHERE endorsed_receipt_id IS NOT NULL AND status <> 'rejected';

-- An endorsement is a cheque document by definition. This keeps the column from being populated
-- on a bank or cash voucher, where it would be meaningless and would silently consume a cheque.
ALTER TABLE public.payment_vouchers
  DROP CONSTRAINT IF EXISTS payment_vouchers_endorsed_requires_cheque_chk;
ALTER TABLE public.payment_vouchers
  ADD CONSTRAINT payment_vouchers_endorsed_requires_cheque_chk
  CHECK (endorsed_receipt_id IS NULL OR document_channel = 'cheque');
