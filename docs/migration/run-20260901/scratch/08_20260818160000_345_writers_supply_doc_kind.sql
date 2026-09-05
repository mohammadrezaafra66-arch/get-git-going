-- 345 -- GATE A BLOCKER B1 -- teach the three existing ledger writers about doc_kind
--
-- DEFECT (found by the phase 1 Supervising Engineer, Gate A, severity BLOCKER)
-- Migration 341 added journal_entries.doc_kind NOT NULL and deliberately dropped its DEFAULT so
-- that a forgotten value could not silently become 'other'. That reasoning was right. What 341
-- did NOT do was check which EXISTING writers omit the column. All three do:
--
--   post_receipt_accounting     (the receipt posting button)
--   pay_purchase_with_voucher   (purchase payments)
--   post_mutual_settlement      (mutual settlement)
--
-- Every one of them now fails with 23502 (null value in column "doc_kind"). Three shipped
-- features were dead on the test database between 341 and this migration. Reproduced directly:
--   INSERT INTO journal_entries(source_type, source_id, entry_date, description, status, posted_by)
--   -> ERROR: null value in column "doc_kind" violates not-null constraint
--
-- FIX
-- Supply doc_kind explicitly in each writer, per ledger-decisions A1:
--   post_receipt_accounting    -> 'receipt'
--   pay_purchase_with_voucher  -> 'purchase_payment'
--   post_mutual_settlement     -> 'settlement'
--
-- The DEFAULT is NOT restored. Restoring it would fix the symptom by reintroducing exactly the
-- silent-'other' hole 341 closed: an entry with doc_kind='other' belongs to no export menu
-- option and disappears without an error. Explicit values are the correct fix.
--
-- This also gives 'purchase_payment' its first producer; Gate A noted it had none.
--
-- METHOD: each body below is the LIVE definition captured with pg_get_functiondef immediately
-- before this migration (CLAUDE.md rule 4 - read the live definition, change only what must
-- change). The ONLY edit in each is the doc_kind column and its literal in the
-- journal_entries INSERT. Nothing else was touched.
--
-- ROLLBACK: docs/verification/345-down.sql

SET client_encoding = 'UTF8';

DO $guard$
BEGIN
  IF current_database() NOT IN ('afrakala','postgres') THEN
    RAISE EXCEPTION 'wrong database: % (expected afrakala)', current_database();
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.post_receipt_accounting(p_receipt_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_receipt public.payment_receipts%ROWTYPE;
  -- 327: kept, but now always returns empty. See the note at the removed loop below.
  v_invoice_updates jsonb := '[]'::jsonb;
  v_journal_id uuid;
  v_existing_journal uuid;
  v_debit_kind text;
  v_debit_ref uuid;
  v_debit_desc text;
  v_balance record;
  v_journal_summary jsonb;
  v_receiver_code text;
  v_bank_title text;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::text, 'accountant'::text]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز برای ثبت سند حسابداری فیش';
  END IF;

  SELECT * INTO v_receipt
    FROM public.payment_receipts
   WHERE id = p_receipt_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'فیش یافت نشد';
  END IF;

  IF v_receipt.posting_status = 'posted' THEN
    RETURN jsonb_build_object('already_posted', true, 'posted_at', v_receipt.posted_at);
  END IF;

  IF v_receipt.status <> 'approved' THEN
    RAISE EXCEPTION 'فقط فیش تأییدشده قابل ثبت در حسابداری است';
  END IF;

  IF (v_receipt.destination_bank_account_id IS NULL AND v_receipt.receiver_party_id IS NULL)
     OR (v_receipt.destination_bank_account_id IS NOT NULL AND v_receipt.receiver_party_id IS NOT NULL) THEN
    RAISE EXCEPTION 'برای ثبت سند، باید دقیقاً یکی از «بانک ما» یا «طرف خارجی» به‌عنوان گیرنده انتخاب شده باشد';
  END IF;

  -- Resolve receiver accounting code from chosen receiver entity
  IF v_receipt.receiver_accounting_code IS NOT NULL AND length(trim(v_receipt.receiver_accounting_code)) > 0 THEN
    v_receiver_code := v_receipt.receiver_accounting_code;
  ELSIF v_receipt.receiver_party_id IS NOT NULL THEN
    SELECT accounting_code INTO v_receiver_code FROM public.external_parties WHERE id = v_receipt.receiver_party_id;
  ELSIF v_receipt.destination_bank_account_id IS NOT NULL THEN
    -- Migration 155: bank_accounts.accounting_code now EXISTS, so the bank
    -- receiver resolves its code exactly the way the external-party branch
    -- above does. Migration 149 wrote NULL here only because the column did
    -- not exist at the time; that is no longer true.
    SELECT accounting_code, title
      INTO v_receiver_code, v_bank_title
      FROM public.bank_accounts
     WHERE id = v_receipt.destination_bank_account_id;

    -- Refuse rather than post a blank code.
    --
    -- The generic receiver_accounting_code check further down would also stop
    -- this, but only while that validation_rule stays enabled, and its stored
    -- message is one of the strings corrupted on 2026-07-11, so it cannot tell
    -- the accountant what to actually do. This check is unconditional and
    -- names the account, because a journal entry carrying an empty receiver
    -- code is worse than a refused receipt: it is a silent hole in the ledger
    -- that nobody is ever prompted to fix.
    IF v_receiver_code IS NULL OR length(trim(v_receiver_code)) = 0 THEN
      RAISE EXCEPTION
        'کد حسابداری برای حساب بانکی «%» ثبت نشده است. ابتدا در صفحهٔ «حساب‌های بانکی» کد حسابداری این حساب را وارد کنید، سپس فیش را دوباره ثبت کنید.',
        COALESCE(v_bank_title, '?')
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Enforce blocking rules from validation_rules for journal_entry scope
  IF EXISTS (
    SELECT 1 FROM public.validation_rules
    WHERE scope='journal_entry' AND enabled AND severity='blocking'
      AND field_key='payer_accounting_code' AND rule_type='required'
  ) AND (v_receipt.payer_accounting_code IS NULL OR length(trim(v_receipt.payer_accounting_code)) = 0) THEN
    RAISE EXCEPTION 'کد آسان واریزکننده برای ثبت سند حسابداری اجباری است.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.validation_rules
    WHERE scope='journal_entry' AND enabled AND severity='blocking'
      AND field_key='receiver_accounting_code' AND rule_type='required'
  ) AND (v_receiver_code IS NULL OR length(trim(v_receiver_code)) = 0) THEN
    RAISE EXCEPTION 'کد آسان گیرنده برای ثبت سند حسابداری اجباری است.';
  END IF;

  UPDATE public.payment_receipts
     SET posting_status = 'posted',
         posted_at = now()
   WHERE id = p_receipt_id;

  PERFORM public.increase_credit(
    v_receipt.customer_id,
    v_receipt.amount,
    v_receipt.id,
    p_user_id
  );

  -- 327: the invoice allocation loop was removed here.
  --
  -- It joined payment_receipt_links to the invoice table, then wrote invoice.status as
  -- paid / partially_paid / unpaid. Measured on the live database before removal:
  -- payment_receipt_links held 3 rows and ZERO of them had a non-null invoice_id, and
  -- that table held 0 rows -- so the join produced no rows on any call and this
  -- block had no effect. v_invoice_updates was therefore always '[]' already.
  --
  -- Why it had to go: this was the last thing tying the ONLY function that writes to the
  -- accounting journal to that table. A function body referencing a dropped table
  -- fails at EXECUTION time, not at DROP time, so leaving it here meant the eventual
  -- DROP of that table would pass its migration and then silently break receipt
  -- posting later. See docs/execution/nav-invoices-cleanup-mission-STATUS.md, phase 4.
  --
  -- NOT a behaviour change and NOT a feature port: no equivalent "mark the sales quote
  -- paid" step was added in its place. Whether settling a receipt should move a
  -- sales_quotes row is a product decision, deliberately not smuggled into a decoupling
  -- migration. The receipt's own posting, the customer credit increase and the journal
  -- entry below are all untouched.
  --
  -- 'invoice_updates' REMAINS in the returned jsonb, always as an empty array. The
  -- accountant UI reads it (_app.accounting.receipts.$receiptId.tsx) and writes it into
  -- an audit_logs diff, so the response shape is kept stable on purpose.

  -- Create journal entry (idempotent)
  SELECT id INTO v_existing_journal
    FROM public.journal_entries
   WHERE source_type = 'payment_receipt' AND source_id = v_receipt.id;

  IF v_existing_journal IS NULL THEN
    IF v_receipt.destination_bank_account_id IS NOT NULL THEN
      v_debit_kind := 'bank';
      v_debit_ref  := v_receipt.destination_bank_account_id;
      v_debit_desc := 'واریز به حساب بانکی شرکت';
    ELSE
      v_debit_kind := 'external_party';
      v_debit_ref  := v_receipt.receiver_party_id;
      v_debit_desc := 'پرداخت به طرف خارجی';
    END IF;

    INSERT INTO public.journal_entries(
      doc_kind, source_type, source_id, entry_date, description, status, posted_by,
      payer_accounting_code, receiver_accounting_code
    )
    VALUES (
      'receipt', 'payment_receipt', v_receipt.id, v_receipt.payment_date,
      'سند فیش واریزی شماره ' || v_receipt.tracking_number, 'posted', p_user_id,
      NULLIF(trim(COALESCE(v_receipt.payer_accounting_code,'')), ''),
      NULLIF(trim(COALESCE(v_receiver_code,'')), '')
    )
    RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines(journal_entry_id, line_no, account_kind, account_ref_id, debit, credit, description)
    VALUES
      (v_journal_id, 1, v_debit_kind, v_debit_ref, v_receipt.amount, 0, v_debit_desc),
      (v_journal_id, 2, 'customer_credit', v_receipt.customer_id, 0, v_receipt.amount, 'افزایش اعتبار/کاهش بدهی مشتری');
  ELSE
    v_journal_id := v_existing_journal;
    UPDATE public.journal_entries
       SET payer_accounting_code = COALESCE(payer_accounting_code, NULLIF(trim(COALESCE(v_receipt.payer_accounting_code,'')), '')),
           receiver_accounting_code = COALESCE(receiver_accounting_code, NULLIF(trim(COALESCE(v_receiver_code,'')), ''))
     WHERE id = v_journal_id;
  END IF;

  SELECT public.get_customer_credit(v_receipt.customer_id) INTO v_balance;

  v_journal_summary := jsonb_build_object(
    'journal_id', v_journal_id,
    'debit_kind', v_debit_kind,
    'debit_ref', v_debit_ref
  );

  RETURN jsonb_build_object(
    'posted', true,
    'invoice_updates', v_invoice_updates,
    'customer_credit', row_to_json(v_balance),
    'journal', v_journal_summary
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.pay_purchase_with_voucher(_purchase_id uuid, _source_bank_account_id uuid, _payment_date date DEFAULT NULL::date, _document_channel text DEFAULT 'cash'::text, _amount numeric DEFAULT NULL::numeric, _tracking_number text DEFAULT NULL::text, _cheque_number text DEFAULT NULL::text, _cheque_due_date date DEFAULT NULL::date, _description text DEFAULT NULL::text, _payee_party_id uuid DEFAULT NULL::uuid, _payee_accounting_code text DEFAULT NULL::text)
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
      doc_kind, source_type, source_id, entry_date, description, status, posted_by,
      payer_accounting_code, receiver_accounting_code
    )
    VALUES (
      'purchase_payment', 'payment_voucher', _voucher_id, _pay_date,
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

CREATE OR REPLACE FUNCTION public.post_mutual_settlement(_person_id uuid, _offset_amount numeric, _cash_amount numeric DEFAULT 0, _bank_account_id uuid DEFAULT NULL::uuid, _note text DEFAULT NULL::text, _entry_date date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _pos        record;
  _settle_id  uuid;
  _journal_id uuid;
  _date       date;
  _dir        text;
  _resid_r    numeric;
  _resid_p    numeric;
  _line       int := 0;
  _d          numeric;
  _c          numeric;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','accountant']::text[]) THEN
    RAISE EXCEPTION 'دسترسی لازم برای ثبت تسویهٔ متقابل را ندارید.' USING ERRCODE = '42501';
  END IF;

  _offset_amount := COALESCE(_offset_amount, 0);
  _cash_amount   := COALESCE(_cash_amount, 0);
  _date          := COALESCE(_entry_date, CURRENT_DATE);

  IF _offset_amount < 0 OR _cash_amount < 0 THEN
    RAISE EXCEPTION 'مبلغ تسویه نمی‌تواند منفی باشد.' USING ERRCODE = '22023';
  END IF;
  IF _offset_amount = 0 AND _cash_amount = 0 THEN
    RAISE EXCEPTION 'حداقل یکی از «مبلغ تهاتر» یا «مبلغ نقدی» باید بزرگ‌تر از صفر باشد.' USING ERRCODE = '22023';
  END IF;

  -- person_settlement_position also enforces the one-customer/one-supplier
  -- rule and the role check, so the two paths cannot drift apart.
  SELECT * INTO _pos FROM public.person_settlement_position(_person_id);

  IF _pos.customer_id IS NULL OR _pos.supplier_id IS NULL THEN
    RAISE EXCEPTION 'تسویهٔ متقابل فقط برای شخصی ممکن است که هم پروندهٔ مشتری دارد و هم تأمین‌کننده.'
      USING ERRCODE = '22023';
  END IF;

  IF _offset_amount > LEAST(GREATEST(_pos.receivable, 0), GREATEST(_pos.payable, 0)) THEN
    RAISE EXCEPTION
      'مبلغ تهاتر (%) از کمترینِ طلب (%) و بدهی (%) بیشتر است؛ نمی‌توان بیش از آنچه هست تهاتر کرد.',
      _offset_amount, _pos.receivable, _pos.payable
      USING ERRCODE = '22023';
  END IF;

  _resid_r := GREATEST(_pos.receivable, 0) - _offset_amount;
  _resid_p := GREATEST(_pos.payable,    0) - _offset_amount;

  IF _cash_amount > 0 THEN
    IF _bank_account_id IS NULL THEN
      RAISE EXCEPTION 'برای جابه‌جایی وجه نقد باید حساب بانکی انتخاب شود.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.bank_accounts WHERE id = _bank_account_id) THEN
      RAISE EXCEPTION 'حساب بانکی یافت نشد.' USING ERRCODE = '22023';
    END IF;

    IF _resid_r > 0 AND _resid_p > 0 THEN
      -- Both sides still open means the offset was left short on purpose;
      -- taking cash before finishing the offset would be moving money that
      -- the two balances could have cancelled for free.
      RAISE EXCEPTION
        'هر دو طرف هنوز باز است (طلب % و بدهی %)؛ اول تهاتر را کامل کنید، بعد تفاوت را نقدی تسویه کنید.',
        _resid_r, _resid_p USING ERRCODE = '22023';
    END IF;

    IF _resid_r > 0 THEN
      _dir := 'customer_pays';
      IF _cash_amount > _resid_r THEN
        RAISE EXCEPTION 'مبلغ نقدی (%) از باقیماندهٔ طلب ما (%) بیشتر است.', _cash_amount, _resid_r
          USING ERRCODE = '22023';
      END IF;
    ELSIF _resid_p > 0 THEN
      _dir := 'we_pay';
      IF _cash_amount > _resid_p THEN
        RAISE EXCEPTION 'مبلغ نقدی (%) از باقیماندهٔ بدهی ما (%) بیشتر است.', _cash_amount, _resid_p
          USING ERRCODE = '22023';
      END IF;
    ELSE
      RAISE EXCEPTION 'بعد از تهاتر چیزی برای تسویهٔ نقدی باقی نمانده است.' USING ERRCODE = '22023';
    END IF;
  ELSE
    _dir := 'balanced';
  END IF;

  INSERT INTO public.mutual_settlements(
    person_id, customer_id, supplier_id, entry_date,
    offset_amount, cash_amount, direction, bank_account_id, note, created_by)
  VALUES (
    _person_id, _pos.customer_id, _pos.supplier_id, _date,
    _offset_amount, _cash_amount, _dir,
    CASE WHEN _cash_amount > 0 THEN _bank_account_id ELSE NULL END,
    NULLIF(btrim(COALESCE(_note, '')), ''), auth.uid())
  RETURNING id INTO _settle_id;

  INSERT INTO public.journal_entries(
    doc_kind, source_type, source_id, entry_date, description, status, posted_by)
  VALUES (
    'settlement', 'mutual_settlement', _settle_id, _date,
    'سند تسویهٔ متقابل با «' || COALESCE(_pos.display_name, '؟') || '»',
    'posted', auth.uid())
  RETURNING id INTO _journal_id;

  IF _offset_amount > 0 THEN
    _line := _line + 1;
    INSERT INTO public.journal_lines(
      journal_entry_id, line_no, account_kind, account_ref_id, debit, credit, description)
    VALUES (_journal_id, _line, 'supplier_payable', _pos.supplier_id, _offset_amount, 0,
            'تهاتر — کاهش بدهی ما به این شخص');
    _line := _line + 1;
    INSERT INTO public.journal_lines(
      journal_entry_id, line_no, account_kind, account_ref_id, debit, credit, description)
    VALUES (_journal_id, _line, 'customer_credit', _pos.customer_id, 0, _offset_amount,
            'تهاتر — کاهش طلب ما از این شخص');
  END IF;

  IF _cash_amount > 0 AND _dir = 'customer_pays' THEN
    _line := _line + 1;
    INSERT INTO public.journal_lines(
      journal_entry_id, line_no, account_kind, account_ref_id, debit, credit, description)
    VALUES (_journal_id, _line, 'bank', _bank_account_id, _cash_amount, 0,
            'دریافت تفاوت تسویه از این شخص');
    _line := _line + 1;
    INSERT INTO public.journal_lines(
      journal_entry_id, line_no, account_kind, account_ref_id, debit, credit, description)
    VALUES (_journal_id, _line, 'customer_credit', _pos.customer_id, 0, _cash_amount,
            'کاهش طلب ما بابت تفاوت نقدی');
  ELSIF _cash_amount > 0 AND _dir = 'we_pay' THEN
    _line := _line + 1;
    INSERT INTO public.journal_lines(
      journal_entry_id, line_no, account_kind, account_ref_id, debit, credit, description)
    VALUES (_journal_id, _line, 'supplier_payable', _pos.supplier_id, _cash_amount, 0,
            'کاهش بدهی ما بابت تفاوت نقدی');
    _line := _line + 1;
    INSERT INTO public.journal_lines(
      journal_entry_id, line_no, account_kind, account_ref_id, debit, credit, description)
    VALUES (_journal_id, _line, 'bank', _bank_account_id, 0, _cash_amount,
            'پرداخت تفاوت تسویه به این شخص');
  END IF;

  SELECT SUM(debit), SUM(credit) INTO _d, _c
    FROM public.journal_lines WHERE journal_entry_id = _journal_id;
  IF _d IS DISTINCT FROM _c THEN
    RAISE EXCEPTION 'سند تسویهٔ متقابل تراز نشد (بدهکار % / بستانکار %)؛ ثبت لغو شد.', _d, _c
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'mutual_settlements', _settle_id::text, 'mutual_settlement_posted',
    jsonb_build_object(
      'person_id',        _person_id,
      'customer_id',      _pos.customer_id,
      'supplier_id',      _pos.supplier_id,
      'receivable_before', _pos.receivable,
      'payable_before',    _pos.payable,
      'offset_amount',    _offset_amount,
      'cash_amount',      _cash_amount,
      'direction',        _dir,
      'bank_account_id',  CASE WHEN _cash_amount > 0 THEN _bank_account_id ELSE NULL END,
      'journal_entry_id', _journal_id));

  RETURN _settle_id;
END;
$function$;

DO $verify$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.prokind IN ('f','p')
     AND p.proname IN ('post_receipt_accounting','pay_purchase_with_voucher','post_mutual_settlement')
     AND pg_get_functiondef(p.oid) ~ 'doc_kind';
  IF _n <> 3 THEN
    RAISE EXCEPTION '345: expected all 3 ledger writers to reference doc_kind, found %', _n;
  END IF;
END
$verify$;
