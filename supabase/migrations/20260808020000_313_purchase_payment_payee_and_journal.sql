SET client_encoding='UTF8';

-- 313 - pay_purchase_with_voucher: third-party payee identity + a real journal entry.
--
-- ============================================================================
-- WHY
-- ============================================================================
-- Two gaps, both confirmed against the live database on 2026-08-08:
--
-- 1. NO LEDGER ENTRY AT ALL. pay_purchase_with_voucher inserted a
--    payment_vouchers row and stamped purchases.paid_at, and stopped there.
--    journal_entries held exactly one row, source_type='payment_receipt'.
--    Every rial that has ever left this company through a purchase payment is
--    invisible to the ledger and to the Asan export. Migration 312 added the
--    supplier_payable account_kind that made this fixable.
--
-- 2. NO PAYEE IDENTITY. payment_vouchers already has payee_party_id (FK ->
--    external_parties), payee_name and tracking_number, and the CHECK
--    payment_vouchers_payee_matches_type_chk already enforces the XOR between
--    payee kinds. The RPC ignored all of it: payee_type was derived solely
--    from purchases.supplier_id, so a payment made to a third party on the
--    supplier's instruction could not be recorded as such.
--
-- The receipt side (post_receipt_accounting + PaymentReceiptForm) already
-- solved the equivalent problem. This migration copies that shape rather than
-- inventing a second one.
--
-- ============================================================================
-- ASSUMPTION - what "the XOR" means on the payment side (read this)
-- ============================================================================
-- On the RECEIPT side the XOR is "our bank account" vs "external party",
-- because money either landed in our bank or it landed with a third party.
--
-- On the PAYMENT side that literal mirror does not exist: the money always
-- leaves OUR bank (payment_vouchers.source_bank_account_id is NOT NULL), so
-- "our bank account" is the SOURCE, never the payee. The real choice is who
-- RECEIVES it:
--
--     payee = the purchase's supplier      XOR     payee = an external party
--
-- That is exactly the XOR payment_vouchers_payee_matches_type_chk already
-- encodes, so this migration follows the live schema rather than the literal
-- wording. Recorded as an assumption in the mission report.
--
-- ============================================================================
-- THE JOURNAL ENTRY
-- ============================================================================
--     line 1   DEBIT  supplier_payable   amount   ref = purchases.supplier_id
--     line 2   CREDIT bank               amount   ref = source_bank_account_id
--
-- Per the direction convention documented in migration 312: debiting
-- supplier_payable REDUCES what we owe. Two lines, always balanced by
-- construction (the same numeric value on both sides).
--
-- A third-party payee does NOT get its own ledger line. Paying a third party
-- on the supplier's instruction still clears the SUPPLIER's debt and still
-- takes cash out of OUR bank - a third line would unbalance the entry and
-- would claim the third party is a debtor of ours, which it is not. The
-- third-party identity is carried as metadata exactly where the receipt side
-- carries it: on the voucher row (payee_party_id, payee_person_id via the
-- existing trigger) and on journal_entries.receiver_accounting_code.
--
-- ============================================================================
-- WHY THIS DOES NOT REFUSE TO POST WHEN AN ACCOUNTING CODE IS MISSING
-- ============================================================================
-- post_receipt_accounting refuses to post a receipt whose bank account has no
-- accounting_code. Copying that here would break almost everything: on this
-- database only 1 of 14 suppliers has an accounting_code, and 50 of 59
-- purchases have no supplier_id at all. Refusing would turn a payment path
-- that works today into one that fails for ~93% of suppliers.
--
-- Instead the entry is always written, and asan_list_journal_export reports a
-- blocked_reason for entries it cannot export yet - which is precisely what
-- that column exists for. A complete ledger with a named export gap beats an
-- empty ledger. Phase 4 of this mission adds the supplier_payable branch to
-- that resolver so the message names the supplier.
--
-- ============================================================================
-- SIGNATURE CHANGE - the old signature is DROPPED, not left behind
-- ============================================================================
-- Adding a defaulted parameter OVERLOADS a function; it does not replace it.
-- Leaving both would make every existing 9-argument call ambiguous and break
-- the feature at runtime. The 9-argument signature is dropped in this same
-- transaction. Pre-313 definition snapshotted at
-- docs/verification/pre-313/pay_purchase_with_voucher.live.sql
--
-- Live state at time of writing: payment_vouchers has 0 rows, journal_entries
-- has 1 row (a payment_receipt, untouched by this migration). No existing
-- money is read or rewritten.
-- ============================================================================

-- Guard: the pre-state must be the 9-argument function this was written
-- against, or a re-run of 313 itself.
DO $guard$
DECLARE
  _n int;
BEGIN
  SELECT count(*) INTO _n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'pay_purchase_with_voucher';

  IF _n = 0 THEN
    RAISE EXCEPTION 'pay_purchase_with_voucher does not exist. Aborting: not the state 313 expects.';
  END IF;
  IF _n > 1 THEN
    RAISE EXCEPTION 'pay_purchase_with_voucher already has % overloads. Resolve that before running 313.', _n;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'pay_purchase_with_voucher'
       AND p.oid::regprocedure::text IN (
         'pay_purchase_with_voucher(uuid,uuid,date,text,numeric,text,text,date,text)',
         'pay_purchase_with_voucher(uuid,uuid,date,text,numeric,text,text,date,text,uuid,text)'
       )
  ) THEN
    RAISE EXCEPTION 'Unexpected pay_purchase_with_voucher signature; aborting 313.';
  END IF;
END
$guard$;

-- Rule 5: drop the previous signature in the SAME migration, so no overload
-- survives to make calls ambiguous.
DROP FUNCTION IF EXISTS public.pay_purchase_with_voucher(uuid,uuid,date,text,numeric,text,text,date,text);

CREATE OR REPLACE FUNCTION public.pay_purchase_with_voucher(
  _purchase_id             uuid,
  _source_bank_account_id  uuid,
  _payment_date            date    DEFAULT NULL::date,
  _document_channel        text    DEFAULT 'cash'::text,
  _amount                  numeric DEFAULT NULL::numeric,
  _tracking_number         text    DEFAULT NULL::text,
  _cheque_number           text    DEFAULT NULL::text,
  _cheque_due_date         date    DEFAULT NULL::date,
  _description             text    DEFAULT NULL::text,
  _payee_party_id          uuid    DEFAULT NULL::uuid,
  _payee_accounting_code   text    DEFAULT NULL::text
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _purchase        record;
  _amt             numeric;
  _voucher_id      uuid;
  _party           record;
  _payee_type      text;
  _payee_name      text;
  -- Plain text, not _party.full_name: PL/pgSQL resolves record fields when it
  -- plans the expression, so touching _party.full_name inside a CASE fails with
  -- "record is not assigned yet" even in a branch that never runs. The dry-run
  -- caught exactly that.
  _party_name      text;
  _pay_date        date;
  _payer_code      text;   -- our side: the bank account the money leaves from
  _receiver_code   text;   -- their side: supplier, or the third party we paid
  _supplier_name   text;
  _journal_id      uuid;
  _existing_journal uuid;
  _debit_desc      text;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','accountant']::text[]) THEN
    RAISE EXCEPTION 'دسترسی لازم برای ثبت سند پرداخت را ندارید.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _purchase FROM public.purchases WHERE id = _purchase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'خرید یافت نشد.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.payment_vouchers WHERE purchase_id = _purchase_id
              AND status = 'approved') THEN
    RAISE EXCEPTION 'برای این خرید از قبل سند پرداخت ثبت شده است.' USING ERRCODE = '23505';
  END IF;

  -- مبلغ پیش‌فرض: قیمت نقدی، وگرنه مبلغ کل خرید
  _amt := COALESCE(_amount, _purchase.cash_price, _purchase.total_amount);
  IF _amt IS NULL OR _amt <= 0 THEN
    RAISE EXCEPTION 'مبلغ پرداخت نامعتبر است.' USING ERRCODE = '22023';
  END IF;

  IF _source_bank_account_id IS NULL THEN
    RAISE EXCEPTION 'حساب بانکی مبدأ پرداخت الزامی است.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bank_accounts WHERE id = _source_bank_account_id) THEN
    RAISE EXCEPTION 'حساب بانکی مبدأ یافت نشد.' USING ERRCODE = '22023';
  END IF;

  _pay_date := COALESCE(_payment_date, CURRENT_DATE);

  -- ---------------------------------------------------------------------
  -- Payee identity. Exactly one branch runs; the shape it produces is the
  -- one payment_vouchers_payee_matches_type_chk already requires.
  -- ---------------------------------------------------------------------
  IF _payee_party_id IS NOT NULL THEN
    SELECT * INTO _party FROM public.external_parties WHERE id = _payee_party_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'طرف حساب خارجی انتخاب‌شده یافت نشد.' USING ERRCODE = '22023';
    END IF;
    IF NOT _party.is_active THEN
      RAISE EXCEPTION 'طرف حساب خارجی «%» غیرفعال است و نمی‌توان به او پرداخت ثبت کرد.',
        _party.full_name USING ERRCODE = '22023';
    END IF;
    _payee_type    := 'external_party';
    _payee_name    := NULL;
    _party_name    := _party.full_name;
    _receiver_code := NULLIF(btrim(COALESCE(_party.accounting_code, '')), '');
  ELSIF _purchase.supplier_id IS NOT NULL THEN
    _payee_type := 'supplier';
    _payee_name := NULL;
    SELECT NULLIF(btrim(COALESCE(s.accounting_code, '')), ''), s.name
      INTO _receiver_code, _supplier_name
      FROM public.suppliers s WHERE s.id = _purchase.supplier_id;
  ELSE
    -- No supplier on the purchase and no third party chosen. Same fallback the
    -- pre-313 function used, kept so existing behaviour does not change.
    _payee_type    := 'other';
    _payee_name    := 'تأمین‌کننده نامشخص';
    _receiver_code := NULL;
  END IF;

  -- An explicitly supplied code always wins, mirroring the receipt side where
  -- beneficiary_accounting_code overrides the derived one.
  _receiver_code := COALESCE(NULLIF(btrim(COALESCE(_payee_accounting_code, '')), ''), _receiver_code);

  SELECT NULLIF(btrim(COALESCE(accounting_code, '')), '')
    INTO _payer_code
    FROM public.bank_accounts WHERE id = _source_bank_account_id;

  INSERT INTO public.payment_vouchers (
    amount, payment_date, payee_type, payee_supplier_id, payee_party_id, payee_name,
    document_channel, source_bank_account_id, tracking_number,
    cheque_number, cheque_due_date, description, status, purchase_id, created_by
  ) VALUES (
    _amt,
    _pay_date,
    _payee_type,
    CASE WHEN _payee_type = 'supplier'       THEN _purchase.supplier_id ELSE NULL END,
    CASE WHEN _payee_type = 'external_party' THEN _payee_party_id       ELSE NULL END,
    _payee_name,
    _document_channel,
    _source_bank_account_id,
    NULLIF(btrim(COALESCE(_tracking_number, '')), ''),
    _cheque_number,
    _cheque_due_date,
    COALESCE(_description, 'پرداخت خرید'),
    'approved',
    _purchase_id,
    auth.uid()
  )
  RETURNING id INTO _voucher_id;
  -- payee_person_id is filled by trg_payment_vouchers_derive_person.

  UPDATE public.purchases
     SET paid_at = COALESCE(paid_at, now())
   WHERE id = _purchase_id;

  -- ---------------------------------------------------------------------
  -- Ledger. Idempotent on (source_type, source_id), which is also a UNIQUE
  -- constraint, so a retry cannot produce a second entry.
  -- ---------------------------------------------------------------------
  SELECT id INTO _existing_journal
    FROM public.journal_entries
   WHERE source_type = 'payment_voucher' AND source_id = _voucher_id;

  IF _existing_journal IS NULL THEN
    _debit_desc := CASE
      WHEN _payee_type = 'external_party'
        THEN 'کاهش بدهی به تأمین‌کننده — پرداخت به شخص ثالث «' || COALESCE(_party_name, '؟') || '»'
      WHEN _payee_type = 'supplier'
        THEN 'کاهش بدهی به تأمین‌کننده «' || COALESCE(_supplier_name, '؟') || '»'
      ELSE 'کاهش بدهی به تأمین‌کننده (تأمین‌کننده نامشخص)'
    END;

    INSERT INTO public.journal_entries(
      source_type, source_id, entry_date, description, status, posted_by,
      payer_accounting_code, receiver_accounting_code
    )
    VALUES (
      'payment_voucher', _voucher_id, _pay_date,
      'سند پرداخت خرید' ||
        COALESCE(' شماره ' || (SELECT voucher_number FROM public.payment_vouchers WHERE id = _voucher_id), ''),
      'posted', auth.uid(),
      _payer_code, _receiver_code
    )
    RETURNING id INTO _journal_id;

    INSERT INTO public.journal_lines(
      journal_entry_id, line_no, account_kind, account_ref_id, debit, credit, description)
    VALUES
      (_journal_id, 1, 'supplier_payable', _purchase.supplier_id, _amt, 0, _debit_desc),
      (_journal_id, 2, 'bank',             _source_bank_account_id, 0, _amt, 'خروج وجه از حساب بانکی');
  ELSE
    _journal_id := _existing_journal;
  END IF;

  -- Balance assertion. Cheap, and it turns a silent accounting bug into a
  -- refused transaction.
  IF (SELECT SUM(debit) FROM public.journal_lines WHERE journal_entry_id = _journal_id)
     IS DISTINCT FROM
     (SELECT SUM(credit) FROM public.journal_lines WHERE journal_entry_id = _journal_id) THEN
    RAISE EXCEPTION 'سند حسابداری پرداخت تراز نشد؛ ثبت لغو شد.' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'payment_vouchers', _voucher_id::text, 'purchase_payment_posted',
    jsonb_build_object(
      'purchase_id',      _purchase_id,
      'amount',           _amt,
      'payment_date',     _pay_date,
      'payee_type',       _payee_type,
      'payee_party_id',   CASE WHEN _payee_type = 'external_party' THEN _payee_party_id ELSE NULL END,
      'payee_supplier_id',CASE WHEN _payee_type = 'supplier'       THEN _purchase.supplier_id ELSE NULL END,
      'document_channel', _document_channel,
      'tracking_number',  NULLIF(btrim(COALESCE(_tracking_number, '')), ''),
      'journal_entry_id', _journal_id
    ));

  RETURN _voucher_id;
END;
$function$;

COMMENT ON FUNCTION public.pay_purchase_with_voucher(uuid,uuid,date,text,numeric,text,text,date,text,uuid,text) IS
  'ثبت پرداخت یک خرید: سند پرداخت + سند دفتر متوازن (بدهکار supplier_payable، بستانکار bank). '
  'گیرندهٔ پرداخت یا تأمین‌کنندهٔ خرید است یا یک طرف حساب خارجی (_payee_party_id) — نه هر دو. '
  'مهاجرت ۳۱۳.';

-- Post-conditions: exactly one signature survives, and it is the new one.
DO $verify$
DECLARE
  _n int;
BEGIN
  SELECT count(*) INTO _n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'pay_purchase_with_voucher';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'Post-condition failed: % overloads of pay_purchase_with_voucher survive (want exactly 1).', _n;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.oid::regprocedure::text = 'pay_purchase_with_voucher(uuid,uuid,date,text,numeric,text,text,date,text,uuid,text)'
  ) THEN
    RAISE EXCEPTION 'Post-condition failed: the 11-argument signature is not the surviving one.';
  END IF;

  RAISE NOTICE '313 OK: pay_purchase_with_voucher now takes a payee identity and posts a balanced journal entry.';
END
$verify$;
