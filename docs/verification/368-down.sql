-- 368-down.sql — reverse migration 368 (close the direct-INSERT path on payment_vouchers).
--
-- STATEMENTS ONLY. No BEGIN, no COMMIT, no ROLLBACK — the caller owns the transaction
-- (Gate A phase-2 M7, the rule established from migration 350 onward).
--
-- WHAT 368 DID: dropped the RLS policy `payment_vouchers_insert_finance` and replaced it with
-- nothing, so that only a SECURITY DEFINER writer running as the table owner can insert a voucher
-- (D19, mirroring the A4/G6 pattern already used for journal_entries and journal_lines).
--
-- WHAT THIS FILE RESTORES: that policy, exactly as it was captured from the live catalogue on
-- 2026-08-21 before 368 was written (ground-truth.md §13.4):
--
--   polname=payment_vouchers_insert_finance  cmd=a  permissive=true  roles=PUBLIC
--   WITH CHECK = has_any_role(uid(), ARRAY['admin'::text, 'accountant'::text])
--
-- `uid()` in that stored expression is `auth.uid()` — it renders unqualified because `auth` is on
-- the search_path when the expression is printed. It is written qualified here so the restore does
-- not depend on the caller's search_path. The resulting policy is behaviourally identical.
--
-- WHAT THIS FILE DOES NOT DO. It does not restore the deleted frontend page or
-- `createPaymentVoucher`; those are a separate git revert. Restoring this policy alone re-opens the
-- direct PostgREST insert path for `admin` and `accountant` — which is the whole point of a
-- rollback, and is why this file should only be run deliberately.

SET client_encoding = 'UTF8';

DROP POLICY IF EXISTS payment_vouchers_insert_finance ON public.payment_vouchers;

CREATE POLICY payment_vouchers_insert_finance
  ON public.payment_vouchers
  FOR INSERT
  TO public
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::text, 'accountant'::text]));
