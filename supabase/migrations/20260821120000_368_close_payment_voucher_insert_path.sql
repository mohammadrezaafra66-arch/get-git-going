-- 368 — close the direct-INSERT path on public.payment_vouchers.
--
-- THE DEFECT. `createPaymentVoucher` (src/lib/treasury/queries.ts:189-218) inserted straight into
-- payment_vouchers with status='approved' and wrote no journal entry. The row still received a
-- voucher number from trg_payment_vouchers_number, still appeared in the treasury list, and — because
-- vw_account_balances read the source tables rather than the ledger — still moved the bank balance a
-- user sees. Two disagreeing truths about the same money, reachable by admin and accountant.
--
-- WHY A POLICY CHANGE AND NOT ONLY A FRONTEND DELETION. D13 already settled this for the receipt
-- side: "form and database — a form-only check is bypassed by a direct PostgREST call." Measured on
-- 2026-08-21 (ground-truth.md §13.4), payment_vouchers_insert_finance permits a logged-in admin or
-- accountant to INSERT through PostgREST with no journal entry. Deleting the page alone leaves that
-- open. D12 retired PaymentReceiptForm with a frontend-only deletion (commit e7dc789, no migration);
-- that is the right style and the wrong scope for this defect.
--
-- WHAT THIS DOES. Drops payment_vouchers_insert_finance and replaces it with NOTHING. That is the
-- A4/G6 pattern already used for journal_entries and journal_lines: an object written only by a
-- SECURITY DEFINER RPC carries no INSERT policy at all, and the RPC — running as the table owner —
-- writes regardless.
--
-- WHY THIS BREAKS NO LEGITIMATE WRITER. All three writers are SECURITY DEFINER and the table is not
-- FORCE ROW LEVEL SECURITY, so the owner bypasses RLS entirely. Measured, not assumed:
--     create_payment            prosecdef=true
--     pay_purchase_with_voucher prosecdef=true   (posts supplier_payable / bank, with its own
--                                                 debit = credit assertion)
--     reverse_document          prosecdef=true
--     payment_vouchers          relrowsecurity=true, relforcerowsecurity=false
-- The gate below re-asserts every one of those at apply time, so this migration refuses rather than
-- silently disabling a writer if any of them has changed.
--
-- WHAT IS DELIBERATELY NOT DONE HERE.
--   * SELECT, UPDATE and DELETE policies are untouched. Reading the voucher list, approving, and the
--     admin delete path all continue to work.
--   * The table-level GRANT to `anon` is untouched. It is the Supabase default across 216 of this
--     database's 224 public tables, not a property of this table, and RLS denies every policy for an
--     anonymous caller. Narrowing one table would be cosmetic. Recorded in deferred.md instead.
--
-- ROLLBACK: docs/verification/368-down.sql — statements only, dry-run proved before this file was
-- written (STATE AFTER ROLLBACK equalled STATE BEFORE; still_in_txn = t).

SET client_encoding = 'UTF8';

DROP POLICY IF EXISTS payment_vouchers_insert_finance ON public.payment_vouchers;

DO $chk$
DECLARE
  _n int;
  _forced boolean;
  _rls boolean;
BEGIN
  -- 1. The INSERT path must now be closed to every non-owner caller.
  SELECT count(*) INTO _n
    FROM pg_policy
   WHERE polrelid = 'public.payment_vouchers'::regclass
     AND polcmd = 'a';                                  -- 'a' = INSERT
  IF _n <> 0 THEN
    RAISE EXCEPTION '368: % INSERT polic(ies) still exist on payment_vouchers; the direct path is not closed', _n;
  END IF;

  -- 2. RLS must still be ON (otherwise dropping the policy would open the table, not close it)
  --    and must NOT be FORCED (otherwise the SECURITY DEFINER writers would be blocked too).
  SELECT relrowsecurity, relforcerowsecurity INTO _rls, _forced
    FROM pg_class WHERE oid = 'public.payment_vouchers'::regclass;
  IF NOT _rls THEN
    RAISE EXCEPTION '368: row level security is OFF on payment_vouchers; dropping the policy would expose the table';
  END IF;
  IF _forced THEN
    RAISE EXCEPTION '368: payment_vouchers is FORCE ROW LEVEL SECURITY; the owner would be subject to RLS and every SECURITY DEFINER writer would break';
  END IF;

  -- 3. Every legitimate writer must still exist and still be SECURITY DEFINER.
  SELECT count(*) INTO _n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname IN ('create_payment', 'pay_purchase_with_voucher', 'reverse_document')
     AND p.prosecdef;
  IF _n <> 3 THEN
    RAISE EXCEPTION '368: expected 3 SECURITY DEFINER writers of payment_vouchers, found %; closing the INSERT policy would strand a writer', _n;
  END IF;

  -- 4. The other three policies must survive untouched.
  SELECT count(*) INTO _n
    FROM pg_policy
   WHERE polrelid = 'public.payment_vouchers'::regclass
     AND polcmd IN ('r', 'w', 'd');                     -- SELECT, UPDATE, DELETE
  IF _n <> 3 THEN
    RAISE EXCEPTION '368: expected the SELECT/UPDATE/DELETE policies to remain, found %', _n;
  END IF;

  RAISE NOTICE '368: direct INSERT path closed. 0 INSERT policies, 3 SECURITY DEFINER writers intact, 3 other policies untouched.';
END
$chk$;
