SET client_encoding='UTF8';

-- 312 - Add the seventh account_kind: supplier_payable.
--
-- ============================================================================
-- WHY
-- ============================================================================
-- journal_lines.account_kind has carried six values since the ledger was
-- created (migration 20260502090826):
--
--     customer_credit, bank, external_party, invoice_ar, clearing, other
--
-- There is a customer-side liability account (customer_credit) but no
-- supplier-side one. That is why pay_purchase_with_voucher writes no journal
-- entry at all today: there is literally no account_kind it could debit.
-- Every purchase payment in this system is therefore invisible to the ledger
-- and to the Asan export.
--
-- This migration adds exactly ONE new value. It deliberately does NOT add a
-- 'mutual_settlement' kind: a mutual settlement is a DOCUMENT TYPE (a
-- journal_entries.source_type carrying several combined lines), not an ACCOUNT
-- type. Confusing the two would put a settlement "account" in the chart of
-- accounts that no real accounting code could ever map to.
--
-- ============================================================================
-- DIRECTION CONVENTION - read this before writing any supplier_payable line
-- ============================================================================
-- supplier_payable is a LIABILITY account (what we owe our suppliers), so it
-- behaves as the mirror image of customer_credit:
--
--   DEBIT  supplier_payable  = our debt to the supplier DECREASES
--                              (we paid them; cash left us)
--   CREDIT supplier_payable  = our debt to the supplier INCREASES
--                              (we bought on credit; goods arrived, cash did not leave)
--
-- Example - paying a supplier 1,000,000 from our bank account:
--     line 1  debit  supplier_payable  1000000   (we owe 1,000,000 less)
--     line 2  credit bank              1000000   (1,000,000 left the bank)
--
-- Getting this backwards inflates supplier debt on every payment instead of
-- clearing it, and the error is invisible until someone reconciles a supplier
-- statement, so it is written here rather than left to convention.
--
-- ============================================================================
-- account_ref_id CONTRACT
-- ============================================================================
-- For account_kind='supplier_payable', account_ref_id references
-- public.suppliers(id) - exactly mirroring customer_credit, which references
-- public.customers(id). It is NOT persons(id): the ledger keys on the trading
-- entity, and suppliers.person_id (NOT NULL since migration 242-era work) is
-- the bridge back to the unified person when a report needs it. That bridge is
-- what makes the mutual-settlement position (a person who is both customer and
-- supplier) computable without a second identity system.
--
-- No FK is declared, because account_ref_id is polymorphic across all seven
-- kinds - the same limitation the existing six values already live with.
--
-- ============================================================================
-- SAFETY
-- ============================================================================
-- CHECK constraints cannot be extended in place, so this is DROP + ADD. Adding
-- a value to a CHECK is purely permissive: no existing row can violate the
-- wider list, and Postgres validates the new constraint against the whole
-- table before committing anyway. Reversible via docs/verification/312-down.sql
-- (safe to run as long as no supplier_payable row has been written yet - the
-- down script checks and refuses rather than failing halfway).
--
-- This migration touches no data and no money. Zero rows change.
-- ============================================================================

-- Guard: refuse to run if the live constraint is not the six-value list this
-- migration was written against. If another migration widened or narrowed it
-- first, silently replacing it here would drop that change on the floor.
DO $guard$
DECLARE
  _def text;
  _expected text := 'CHECK ((account_kind = ANY (ARRAY[''customer_credit''::text, ''bank''::text, ''external_party''::text, ''invoice_ar''::text, ''clearing''::text, ''other''::text])))';
BEGIN
  SELECT pg_get_constraintdef(oid) INTO _def
    FROM pg_constraint
   WHERE conrelid = 'public.journal_lines'::regclass
     AND conname  = 'journal_lines_account_kind_chk';

  IF _def IS NULL THEN
    RAISE EXCEPTION 'journal_lines_account_kind_chk does not exist. Aborting: this database is not in the state migration 312 expects.';
  END IF;

  IF _def = _expected THEN
    RETURN;  -- expected pre-state
  END IF;

  -- Already applied? Then this is a re-run, which is fine.
  IF position('supplier_payable' in _def) > 0 THEN
    RAISE NOTICE 'supplier_payable is already present in journal_lines_account_kind_chk; 312 is idempotent, continuing.';
    RETURN;
  END IF;

  RAISE EXCEPTION 'Unexpected journal_lines_account_kind_chk definition, aborting. Live: %', _def;
END
$guard$;

ALTER TABLE public.journal_lines
  DROP CONSTRAINT IF EXISTS journal_lines_account_kind_chk;

ALTER TABLE public.journal_lines
  ADD CONSTRAINT journal_lines_account_kind_chk CHECK (
    account_kind IN (
      'customer_credit',
      'bank',
      'external_party',
      'invoice_ar',
      'clearing',
      'other',
      'supplier_payable'
    )
  );

COMMENT ON COLUMN public.journal_lines.account_kind IS
  'نوع حساب دفتر. مقادیر: customer_credit (بدهی/اعتبار مشتری، ref=customers.id)، '
  'bank (حساب بانکی ما، ref=bank_accounts.id)، external_party (طرف حساب خارجی، '
  'ref=external_parties.id)، supplier_payable (بدهی ما به تأمین‌کننده، '
  'ref=suppliers.id — بدهکار یعنی کاهش بدهی/پرداخت، بستانکار یعنی افزایش بدهی/خرید نسیه)، '
  'invoice_ar / clearing / other (حساب‌های کنترلی، ref=NULL). '
  'مهاجرت ۳۱۲ مقدار supplier_payable را اضافه کرد.';

-- Post-condition: prove the widened list is live and still rejects garbage.
DO $verify$
DECLARE
  _def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO _def
    FROM pg_constraint
   WHERE conrelid = 'public.journal_lines'::regclass
     AND conname  = 'journal_lines_account_kind_chk';

  IF position('supplier_payable' in _def) = 0 THEN
    RAISE EXCEPTION 'Post-condition failed: supplier_payable not in the new constraint.';
  END IF;
  IF position('customer_credit' in _def) = 0
     OR position('bank' in _def) = 0
     OR position('external_party' in _def) = 0
     OR position('invoice_ar' in _def) = 0
     OR position('clearing' in _def) = 0
     OR position('other' in _def) = 0 THEN
    RAISE EXCEPTION 'Post-condition failed: one of the original six kinds was lost.';
  END IF;
  RAISE NOTICE '312 OK: account_kind now accepts 7 values including supplier_payable.';
END
$verify$;
