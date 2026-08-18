-- 349-down.sql — rollback for
--   supabase/migrations/20260818181000_349_create_receipt.sql
--
-- Drops public.create_receipt. Nothing in the application calls it yet: the legacy create
-- path (PaymentReceiptForm.tsx, four PostgREST inserts) survives until task 6.9 by decision
-- D12, so dropping this function restores the previous behaviour rather than breaking
-- receipt creation. Verified 2026-08-18: `grep -rn create_receipt src/ server/` returns no
-- call site.
--
-- The full argument list is spelled out because DROP FUNCTION resolves by signature. Do not
-- shorten it — a mistyped signature errors rather than dropping the wrong thing, but a
-- *matching* prefix would not, and this project has already been bitten by an accidental
-- overload (CLAUDE.md rule 5).
--
-- DATA NOTE — this file removes the function, not the documents it created.
--
-- Receipts and journal entries written by create_receipt stay. That is deliberate: posted
-- entries are immutable (migration 343) and deleting a payment_receipts row burns its
-- document number, which is never reused. To undo the *data*, restore the pre-phase dump
-- (D:\AfraKalaBackups\pre-phase2-*.dump) or reverse the documents — see rollback-plan.md,
-- "Phases 2, 3, 4 — Data half".
--
--   SELECT count(*) FROM public.journal_entries
--    WHERE doc_kind = 'receipt' AND source_type = 'payment_receipt';
--
-- Ordering: run this file BEFORE 348-down.sql. 348-down restores a constraint that cheque
-- receipts violate, and it is this function that creates them.

SET client_encoding = 'UTF8';

BEGIN;

DROP FUNCTION IF EXISTS public.create_receipt(
  text,                     -- p_channel
  uuid,                     -- p_customer_id
  numeric,                  -- p_amount
  date,                     -- p_payment_date
  time without time zone,   -- p_payment_time
  uuid,                     -- p_destination_bank_account_id
  text,                     -- p_tracking_number
  text,                     -- p_source_bank
  text,                     -- p_cheque_number
  date,                     -- p_cheque_due_date
  text,                     -- p_cheque_bank
  text,                     -- p_description
  jsonb,                    -- p_allocations
  uuid[]                    -- p_attachment_ids
);

COMMIT;
