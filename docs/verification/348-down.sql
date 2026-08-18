-- 348-down.sql — rollback for
--   supabase/migrations/20260818180000_348_receipt_cheque_receiver_check.sql
--
-- Restores payment_receipts_receiver_exclusive_chk to the definition that was live
-- immediately before migration 348, captured with pg_get_constraintdef on 2026-08-18:
--
--   CHECK ((((destination_bank_account_id IS NOT NULL) AND (receiver_party_id IS NULL))
--        OR ((destination_bank_account_id IS NULL) AND (receiver_party_id IS NOT NULL))
--        OR ((status = 'pending_review'::text) AND (destination_bank_account_id IS NULL)
--            AND (receiver_party_id IS NULL))))
--
-- DATA LOSS WARNING — read before running.
--
-- The 348 definition is strictly WEAKER than this one. Rolling it back is therefore NOT
-- automatically safe: any cheque receipt created by create_receipt after 348 has
-- destination_bank_account_id IS NULL, receiver_party_id IS NULL and status='approved',
-- and violates the restored constraint. ADD CONSTRAINT validates existing rows, so the
-- statement below will FAIL with 23514 rather than silently corrupting anything — which is
-- the intended behaviour, but it means this rollback cannot run while such rows exist.
--
-- Pre-flight gate. Expect 0. If it is not 0, roll 349 back first, decide what happens to
-- those receipts (reversal, not deletion — see rollback-plan.md "Data half"), and only then
-- run this file.
--
--   SELECT count(*) FROM public.payment_receipts
--    WHERE document_channel = 'cheque'
--      AND destination_bank_account_id IS NULL
--      AND receiver_party_id IS NULL
--      AND status <> 'pending_review';
--
-- Ordering: roll 349 (the function) back before 348 (the constraint). Reversing that order
-- leaves create_receipt live against a constraint it cannot satisfy for cheques.

SET client_encoding = 'UTF8';

BEGIN;

ALTER TABLE public.payment_receipts
  DROP CONSTRAINT IF EXISTS payment_receipts_receiver_exclusive_chk;

ALTER TABLE public.payment_receipts
  ADD CONSTRAINT payment_receipts_receiver_exclusive_chk CHECK (
       ((destination_bank_account_id IS NOT NULL) AND (receiver_party_id IS NULL))
    OR ((destination_bank_account_id IS NULL) AND (receiver_party_id IS NOT NULL))
    OR ((status = 'pending_review'::text)
        AND (destination_bank_account_id IS NULL)
        AND (receiver_party_id IS NULL))
  );

COMMIT;
