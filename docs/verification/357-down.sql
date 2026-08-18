-- 357-down.sql — reverse migration 357 (payment_vouchers delete guard, Gate A OG-20).
--
-- STATEMENTS ONLY. No BEGIN, no COMMIT, no ROLLBACK — the caller owns the transaction (Gate A M7).
--
-- WHAT 357 ADDED, and therefore what this removes:
--   1. trigger  trg_payment_vouchers_block_delete_when_posted  on public.payment_vouchers
--   2. function tg_payment_vouchers_block_delete_when_posted()
--
-- READ THIS BEFORE RUNNING IT.
--
-- Removing the guard reopens the asymmetry Gate A objected to: payment_receipts is protected by
-- trg_payment_receipts_block_delete_when_posted (migration 353) and payment_vouchers would not be,
-- on the same immutability model. A posted voucher would then delete freely and leave its journal
-- entry orphaned — source_id is not a foreign key — permanently, because a posted entry is
-- immutable (343) and reverse_document does not exist (OG-14).
--
-- The order matters and is the reverse of 357's: drop the trigger first, then the function it
-- points at. Dropping the function first would fail on the dependency.
--
-- Note for whoever runs this: docs/verification/phase-3-stress-cleanup.sql deletes journal entries
-- BEFORE vouchers, so it works with or without this guard. Removing the guard does not fix a
-- cleanup script; it only removes a protection.

SET client_encoding = 'UTF8';

DROP TRIGGER IF EXISTS trg_payment_vouchers_block_delete_when_posted ON public.payment_vouchers;

DROP FUNCTION IF EXISTS public.tg_payment_vouchers_block_delete_when_posted();
