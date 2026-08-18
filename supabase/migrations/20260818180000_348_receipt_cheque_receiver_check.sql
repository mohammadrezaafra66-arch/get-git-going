-- 348 — payment_receipts: a cheque receipt has no "receiver" row
--
-- Phase 2, contradiction C4 (docs/execution/phase-2-PROGRESS.md).
--
-- WHY
--
-- payment_receipts_receiver_exclusive_chk requires exactly one of
-- destination_bank_account_id / receiver_party_id on every row that is not still
-- pending_review. That was correct while every receipt was money landing either in one of
-- our bank accounts or with an external party.
--
-- A cheque receipt is neither. Decision D7 posts a cheque the moment we accept it, to
-- account_kind='cheque_receivable' — we are holding a piece of paper, not a balance in an
-- account. There is no cheque register to point at (A2 defers the cheque lifecycle), and the
-- drawer is a customer, so it cannot go in receiver_party_id either (that column is an FK to
-- external_parties). Contract §1's journal table resolves the ledger side against the drawer;
-- the source row simply has no receiver to name.
--
-- So the constraint gets a fourth branch: document_channel='cheque' may carry neither.
--
-- WHAT ALREADY DEPENDS ON THIS CONSTRAINT — asked before writing, per the phase-2 mission §G,
-- and answered from the live catalogue rather than from the repo:
--
--   * post_receipt_accounting carries its OWN "exactly one of bank / external party" guard in
--     its body (live definition, the IF immediately after the not-found check). Relaxing the
--     table constraint does not relax that function: a legacy cheque receipt approved with no
--     receiver is refused there with a Persian message instead of posting a wrong entry.
--     Loud, not silent.
--   * No other function, view or trigger reads this constraint. Constraints are not
--     referenced by name anywhere in public.
--   * PaymentReceiptForm.tsx (the legacy create path, kept until task 6.9 by D12) inserts
--     with status='pending_review', which the third branch already permits. Unaffected.
--
-- The change is strictly WEAKENING: every row that satisfied the old predicate satisfies the
-- new one. All 7 rows present at write time satisfy both. Nothing that writes today can start
-- failing because of this.
--
-- The migration-328 person-FK registry gate fires on ALTER TABLE. This migration adds and
-- removes no foreign key, so the FK set and person_merge's registry still agree and the gate
-- passes. person_fk_registry_report() was verified all-`ok` immediately before applying.
--
-- Rollback: docs/verification/348-down.sql — read its DATA LOSS WARNING first. The restored
-- constraint is stricter, so it fails (23514) rather than running while cheque receipts exist.

SET client_encoding = 'UTF8';

ALTER TABLE public.payment_receipts
  DROP CONSTRAINT IF EXISTS payment_receipts_receiver_exclusive_chk;

ALTER TABLE public.payment_receipts
  ADD CONSTRAINT payment_receipts_receiver_exclusive_chk CHECK (
    -- money landed in one of our accounts
       ((destination_bank_account_id IS NOT NULL) AND (receiver_party_id IS NULL))
    -- money landed with an external party
    OR ((destination_bank_account_id IS NULL) AND (receiver_party_id IS NOT NULL))
    -- still being entered: the receiver has not been chosen yet
    OR ((status = 'pending_review'::text)
        AND (destination_bank_account_id IS NULL)
        AND (receiver_party_id IS NULL))
    -- 348: a cheque we are holding. Neither column applies; the ledger side is
    -- cheque_receivable against the drawer. See D7, A2 and contract §1.
    OR ((document_channel = 'cheque'::text)
        AND (destination_bank_account_id IS NULL)
        AND (receiver_party_id IS NULL))
  );

COMMENT ON CONSTRAINT payment_receipts_receiver_exclusive_chk ON public.payment_receipts IS
  'A receipt names exactly one receiver — one of our bank accounts or an external party — '
  'except while it is still pending_review, or when it is a cheque we are holding '
  '(document_channel=''cheque''), which has no receiver row at all. Migration 348.';
