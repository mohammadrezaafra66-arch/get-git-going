-- 347 -- OG-10 -- external parties are valid cheque counterparties, in both directions
--
-- OWNER'S ANSWER (recorded 2026-08-18, both halves of OG-10):
--   * a cheque we RECEIVE may come from a party who is not a customer
--   * a cheque we ISSUE   may go   to   a party who is not a supplier
-- This is a normal business pattern for this company, not a rare exception.
--
-- Migration 341 hard-wired one target table per cheque kind:
--     cheque_receivable -> customers
--     cheque_payable    -> suppliers
-- This migration widens each to accept public.external_parties as well. It closes OG-10 and,
-- with it, Gate A defect M6 (the receipt-side mirror, which lands in phase 2 task 2.6).
--
-- WIDENING ONLY. No previously valid reference becomes invalid: every table allowed before is
-- still allowed. Verified before and after that journal_lines holds 0 cheque rows, so no
-- existing row is affected either way.
--
-- ===========================================================================================
-- DESIGN DECISION -- option (a), existence in any allowed table. Recorded with its reason.
-- ===========================================================================================
-- The brief offered:
--   (a) accept existence in either table
--   (b) mirror payment_vouchers' payee_type -- store the intended target explicitly
--
-- Chosen: (a). Three measured reasons, not convenience.
--
-- 1. (b) would repeat the exact defect Gate A caught in this phase. A discriminator only
--    enforces anything if it is NOT NULL, and journal_lines is written by THREE existing
--    functions -- post_receipt_accounting, pay_purchase_with_voucher, post_mutual_settlement.
--    Migration 341 added a NOT NULL column to journal_entries without sweeping its writers and
--    broke all three (Gate A BLOCKER B1). Adding a mandatory column to journal_lines now would
--    break the same three again. A NULLABLE discriminator enforces nothing and is worse than
--    both options.
--
-- 2. The ambiguity (b) protects against does not exist here. A discriminator matters when the
--    same id could name rows in two tables. Measured on this database:
--        customers vs external_parties  = 0 shared ids
--        suppliers vs external_parties  = 0 shared ids
--        customers vs suppliers         = 0 shared ids
--    Ids are v4 uuids from gen_random_uuid(), so a collision is not merely absent today, it is
--    not a thing that occurs. A cheque line's account_ref_id therefore resolves to at most one
--    row across all three tables, and "which table was meant" is answerable by lookup.
--
-- 3. payment_vouchers is not the precedent it looks like. It does NOT use a text discriminator
--    to disambiguate one polymorphic column; it uses SEPARATE TYPED COLUMNS -- payee_supplier_id,
--    payee_party_id, payee_customer_id -- each carrying a real FK, with payee_type and a XOR
--    CHECK keeping them consistent. That pattern buys referential integrity the database
--    enforces. journal_lines has ONE column, account_ref_id, and no FK is possible on it. Copying
--    only the discriminator half of that pattern would copy its bookkeeping cost without its
--    benefit.
--
-- Where the intent WILL be recorded: A2 defers the cheque lifecycle (cleared / bounced /
-- endorsed). When that is built it needs a cheque register table, and that table is where a
-- cheque's counterparty identity belongs -- with typed columns and real FKs, exactly as
-- payment_vouchers does it. journal_lines records the accounting fact; the register records the
-- cheque. Putting identity in journal_lines now would have to be undone then.
--
-- What (a) still enforces, so this is not "accept anything":
--   * a random uuid in none of the tables is refused (23503)
--   * a SUPPLIER id on a cheque_receivable is refused -- suppliers is not in that kind's set
--   * a CUSTOMER id on a cheque_payable   is refused -- customers is not in that kind's set
-- The validator is widened by exactly one table per kind, not made permissive.
--
-- ASAN EXPORT: untouched. D8 says cheque lines are SKIPPED by the export, not resolved, so no
-- account code is ever looked up for them and this change has no export consequence.
--
-- ROLLBACK: docs/verification/347-down.sql (written and dry-run validated before this applied)

SET client_encoding = 'UTF8';

DO $guard$
BEGIN
  IF current_database() <> 'afrakala' THEN
    RAISE EXCEPTION 'wrong database: % (expected afrakala)', current_database();
  END IF;
END
$guard$;

-- Pre-flight: this migration is only a widening if there are no cheque rows to invalidate.
DO $preflight$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.journal_lines
   WHERE account_kind IN ('cheque_receivable', 'cheque_payable');
  IF _n <> 0 THEN
    RAISE NOTICE '347: % existing cheque lines found; widening cannot invalidate them, continuing', _n;
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.validate_journal_line_ref()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  _targets text[];
  _target  text;
  _ok      boolean := false;
BEGIN
  IF NEW.account_kind IS NULL OR NEW.account_ref_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.account_kind   IS NOT DISTINCT FROM OLD.account_kind
     AND NEW.account_ref_id IS NOT DISTINCT FROM OLD.account_ref_id THEN
    RETURN NEW;
  END IF;

  -- One or more acceptable target tables per account kind. The cheque kinds carry two each
  -- (OG-10): the counterparty may be a customer/supplier OR an external party.
  _targets := CASE NEW.account_kind
    WHEN 'customer_credit'   THEN ARRAY['customers']
    WHEN 'bank'              THEN ARRAY['bank_accounts']
    WHEN 'external_party'    THEN ARRAY['external_parties']
    WHEN 'supplier_payable'  THEN ARRAY['suppliers']
    WHEN 'cheque_receivable' THEN ARRAY['customers', 'external_parties']  -- 347 (OG-10)
    WHEN 'cheque_payable'    THEN ARRAY['suppliers', 'external_parties']  -- 347 (OG-10)
    ELSE NULL          -- invoice_ar / clearing / other: control accounts, nothing to check
  END;

  IF _targets IS NULL THEN
    RETURN NEW;
  END IF;

  FOREACH _target IN ARRAY _targets LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1)', _target)
      INTO _ok USING NEW.account_ref_id;
    EXIT WHEN _ok;
  END LOOP;

  IF NOT _ok THEN
    RAISE EXCEPTION
      'ارجاع سطر سند نامعتبر است: ردیفی با شناسهٔ % در «%» یافت نشد (نوع حساب: %).',
      NEW.account_ref_id, array_to_string(_targets, '» یا «'), NEW.account_kind
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.validate_journal_line_ref() IS
  'Validates journal_lines.account_ref_id against the table(s) allowed for its account_kind. Cheque kinds accept external_parties as well as customers/suppliers (OG-10, migration 347).';

DO $verify$
DECLARE
  _def text;
  _n   int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'validate_journal_line_ref';

  IF _def NOT LIKE '%''customers'', ''external_parties''%' THEN
    RAISE EXCEPTION '347: cheque_receivable does not accept external_parties';
  END IF;
  IF _def NOT LIKE '%''suppliers'', ''external_parties''%' THEN
    RAISE EXCEPTION '347: cheque_payable does not accept external_parties';
  END IF;

  -- The trigger must still be attached; a widened validator that no longer fires is worse
  -- than a narrow one that does.
  SELECT count(*) INTO _n FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE p.proname = 'validate_journal_line_ref' AND NOT t.tgisinternal;
  IF _n < 1 THEN
    RAISE EXCEPTION '347: validate_journal_line_ref is not attached to any trigger';
  END IF;
END
$verify$;
