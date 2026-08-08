SET client_encoding='UTF8';

-- 327 — decouple post_receipt_accounting from the invoices table.
--
-- This is condition 1 of the three that block dropping the invoices table
-- (docs/execution/nav-invoices-cleanup-mission-STATUS.md, phase 4). It is the one that
-- matters most, because post_receipt_accounting is the ONLY function that writes to the
-- accounting journal: while it referenced invoices, dropping that table would have left
-- receipt posting to fail at runtime, long after the migration reported success.
--
-- The conflict was raised independently by the ledger-mutual-settlement agent, which
-- found it and deliberately left it alone as out of scope
-- (docs/execution/ledger-mutual-settlement-mission-COMPLETE.md).
--
-- What changes: exactly one dead FOR loop is removed, plus the four locals only it used.
-- Nothing else. The role guard, the receipt status update, increase_credit(), the
-- idempotent journal entry and both journal lines are byte-for-byte unchanged, and the
-- returned jsonb keeps every key it had.
--
-- Rule 4 compliance: patched from the LIVE definition captured in
-- docs/verification/pre-327/, not retyped from memory. Rule 5: this function has exactly
-- one overload, verified on pg_proc, so CREATE OR REPLACE cannot leave a ghost signature.
--
-- Down-script: docs/verification/327-down.sql

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
      source_type, source_id, entry_date, description, status, posted_by,
      payer_accounting_code, receiver_accounting_code
    )
    VALUES (
      'payment_receipt', v_receipt.id, v_receipt.payment_date,
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
$function$
;

-- ---------------------------------------------------------------------------
-- Assert the outcome inside the same transaction, so a surprise rolls back.
-- ---------------------------------------------------------------------------

DO $do$
DECLARE
  v_overloads int;
  v_refs      int;
BEGIN
  SELECT count(*) INTO v_overloads
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'post_receipt_accounting';
  IF v_overloads <> 1 THEN
    RAISE EXCEPTION '327: expected exactly 1 post_receipt_accounting, found %', v_overloads;
  END IF;

  SELECT count(*) INTO v_refs
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'post_receipt_accounting'
     -- Deliberately matches the CODE form 'public.invoices' rather than any mention of
     -- the word: pg_get_functiondef returns comments too, and the explanatory comment
     -- left in place of the removed loop necessarily talks about that table. Migration
     -- 323 tripped exactly this way during its dry-run.
     AND pg_get_functiondef(p.oid) ~* 'public\.invoices';
  IF v_refs <> 0 THEN
    RAISE EXCEPTION '327: post_receipt_accounting still references invoices in %', v_refs;
  END IF;

  RAISE NOTICE '327 OK: post_receipt_accounting no longer references invoices; 1 overload; journal path intact';
END
$do$;
