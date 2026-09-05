-- 341 -- task 1.4 -- cheque account kinds + journal_entries.doc_kind
--
-- Implements ledger-decisions A1 and A2.
--
-- A2: widen the journal_lines account_kind CHECK with cheque_receivable and cheque_payable, and
--     teach validate_journal_line_ref their target tables.
-- A1: add journal_entries.doc_kind NOT NULL with CHECK
--     ('receipt','payment','dual','purchase_payment','settlement','other'), backfilling the
--     existing payment_receipt entry to 'receipt'.
--
-- TARGET TABLES FOR THE CHEQUE KINDS -- a decision A2 requires but does not name.
--   cheque_receivable -> customers   (a cheque WE HOLD, received from a customer)
--   cheque_payable    -> suppliers   (a cheque WE ISSUED, owed to a supplier)
-- This mirrors the existing customer_credit->customers and supplier_payable->suppliers mapping,
-- and it is the shape phases 2 and 3 need: a receipt's cheque branch debits cheque_receivable
-- against the paying customer, and an endorsed cheque later credits the same customer's line.
--
-- KNOWN EDGE, recorded not guessed at: payment_vouchers.payee_type also allows external_party
-- and customer. An own cheque issued to an external party rather than a supplier would fail this
-- validation. No such document can exist yet (payment_vouchers holds 0 rows and the payment RPC
-- is phase 3), so this is not deferred breakage - it is a boundary phase 3 must confirm or widen.
--   >>> OG-10: can an own cheque be issued to an external party, not only a supplier?
--
-- ROLLBACK: docs/verification/341-down.sql

SET client_encoding = 'UTF8';

DO $guard$
BEGIN
  IF current_database() NOT IN ('afrakala','postgres') THEN
    RAISE EXCEPTION 'wrong database: % (expected afrakala)', current_database();
  END IF;
END
$guard$;

-- ------------------------------------------------- A2: widen account_kind ----
ALTER TABLE public.journal_lines
  DROP CONSTRAINT IF EXISTS journal_lines_account_kind_chk;

ALTER TABLE public.journal_lines
  ADD CONSTRAINT journal_lines_account_kind_chk
  CHECK (account_kind = ANY (ARRAY[
    'customer_credit'::text,
    'bank'::text,
    'external_party'::text,
    'invoice_ar'::text,
    'clearing'::text,
    'other'::text,
    'supplier_payable'::text,
    'cheque_receivable'::text,
    'cheque_payable'::text
  ]));

-- ------------------------------ A2: teach the ref validator the new kinds ----
CREATE OR REPLACE FUNCTION public.validate_journal_line_ref()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  _target text;
  _ok     boolean;
BEGIN
  IF NEW.account_kind IS NULL OR NEW.account_ref_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.account_kind   IS NOT DISTINCT FROM OLD.account_kind
     AND NEW.account_ref_id IS NOT DISTINCT FROM OLD.account_ref_id THEN
    RETURN NEW;
  END IF;

  _target := CASE NEW.account_kind
    WHEN 'customer_credit'   THEN 'customers'
    WHEN 'bank'              THEN 'bank_accounts'
    WHEN 'external_party'    THEN 'external_parties'
    WHEN 'supplier_payable'  THEN 'suppliers'
    WHEN 'cheque_receivable' THEN 'customers'   -- 341: a cheque we hold, from a customer
    WHEN 'cheque_payable'    THEN 'suppliers'   -- 341: a cheque we issued, to a supplier
    ELSE NULL          -- invoice_ar / clearing / other: control accounts
  END;

  IF _target IS NULL THEN
    RETURN NEW;
  END IF;

  EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1)', _target)
    INTO _ok USING NEW.account_ref_id;

  IF NOT _ok THEN
    RAISE EXCEPTION
      'ارجاع سطر سند نامعتبر است: ردیفی با شناسهٔ % در «%» یافت نشد (نوع حساب: %).',
      NEW.account_ref_id, _target, NEW.account_kind
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------- A1: doc_kind column ----
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS doc_kind text;

-- Backfill BEFORE the constraint and the NOT NULL, so neither can fail on legacy rows.
UPDATE public.journal_entries
   SET doc_kind = 'receipt'
 WHERE doc_kind IS NULL AND source_type = 'payment_receipt';

UPDATE public.journal_entries
   SET doc_kind = 'payment'
 WHERE doc_kind IS NULL AND source_type = 'payment_voucher';

UPDATE public.journal_entries
   SET doc_kind = 'settlement'
 WHERE doc_kind IS NULL AND source_type = 'mutual_settlement';

UPDATE public.journal_entries
   SET doc_kind = 'other'
 WHERE doc_kind IS NULL;

ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_doc_kind_chk;

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_doc_kind_chk
  CHECK (doc_kind = ANY (ARRAY[
    'receipt'::text,
    'payment'::text,
    'dual'::text,
    'purchase_payment'::text,
    'settlement'::text,
    'other'::text
  ]));

ALTER TABLE public.journal_entries
  ALTER COLUMN doc_kind SET NOT NULL;

-- No DEFAULT is left on the column, deliberately. A1 specifies 'other' as the BACKFILL value,
-- not as an ongoing default. Leaving a default would let a future INSERT that forgets doc_kind
-- silently become 'other', which is the value the export treats as "belongs to no menu option" -
-- i.e. the document would vanish from every export with no error. Requiring the value makes the
-- omission a loud failure instead.
ALTER TABLE public.journal_entries
  ALTER COLUMN doc_kind DROP DEFAULT;

COMMENT ON COLUMN public.journal_entries.doc_kind IS
  'Business kind of the document (A1). asan_list_journal_export filters on this instead of inferring from line shapes. No default: every writer must state it.';

DO $verify$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.journal_entries WHERE doc_kind IS NULL;
  IF _n <> 0 THEN
    RAISE EXCEPTION '341: % journal_entries rows still have doc_kind IS NULL', _n;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='journal_entries'
                AND column_name='doc_kind' AND column_default IS NOT NULL) THEN
    RAISE EXCEPTION '341: doc_kind still carries a DEFAULT';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid='public.journal_lines'::regclass
                    AND conname='journal_lines_account_kind_chk'
                    AND pg_get_constraintdef(oid) LIKE '%cheque_receivable%'
                    AND pg_get_constraintdef(oid) LIKE '%cheque_payable%') THEN
    RAISE EXCEPTION '341: account_kind CHECK does not carry both cheque kinds';
  END IF;
END
$verify$;
