-- =====================================================================
-- 155 - bank_accounts.accounting_code + bank receiver posting
-- =====================================================================
-- Two blocking rows in validation_rules require a payer AND a receiver
-- accounting code on every journal entry. Migration 149 deliberately wrote
-- NULL for the bank receiver's code because bank_accounts had no such column,
-- which left the bank-receiver path permanently unpostable: the rule rejected
-- exactly the value 149 was forced to leave empty.
--
-- The column has since been added by hand on the LAN database. Section 1
-- carries that change to any other server, idempotently. Section 2 makes the
-- posting function actually read it.
--
-- Both sections live in ONE file on purpose: replacing the function before the
-- column exists would produce a function that errors on its first bank receipt.
--
-- Apply with:
--   psql -U supabase_admin -d afrakala --single-transaction -v ON_ERROR_STOP=1 -f <file>
-- No inner BEGIN/COMMIT -- see docs/execution-progress.md.

-- ---------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------
-- Nullable on purpose. Existing accounts have no code yet, and a NOT NULL
-- default would invent an accounting code, which is exactly the kind of guess
-- that must not be made about money.
ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS accounting_code text;

COMMENT ON COLUMN public.bank_accounts.accounting_code IS
  'Accounting code in the external Asan system. Nullable: a bank account without a code cannot be used as a receipt receiver.';

-- ---------------------------------------------------------------------
-- 2. post_receipt_accounting -- bank receiver branch only
-- ---------------------------------------------------------------------
-- This body is the LIVE definition, dumped with pg_get_functiondef and changed
-- in exactly two places:
--   * the ELSIF bank-receiver branch, which now reads
--     bank_accounts.accounting_code and refuses a blank one
--   * one added local variable, v_bank_title, which that branch needs so the
--     error can name the account
--
-- EVERYTHING ELSE IS BYTE-IDENTICAL, including the Persian strings that were
-- already corrupted to runs of '?' by the 2026-07-11 encoding incident. Those
-- are NOT repaired here: their original wording is unknown, and inventing new
-- Persian for money-critical error paths is a human decision, not a guess to
-- make in passing. They remain on the list of things needing re-entry.

CREATE OR REPLACE FUNCTION public.post_receipt_accounting(p_receipt_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_receipt public.payment_receipts%ROWTYPE;
  v_link record;
  v_paid numeric;
  v_total numeric;
  v_new_status text;
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
    RAISE EXCEPTION '???????????? ?????????????? ???????? ?????? ?????? ???????????????? ??????';
  END IF;

  SELECT * INTO v_receipt
    FROM public.payment_receipts
   WHERE id = p_receipt_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '?????? ???????? ??????';
  END IF;

  IF v_receipt.posting_status = 'posted' THEN
    RETURN jsonb_build_object('already_posted', true, 'posted_at', v_receipt.posted_at);
  END IF;

  IF v_receipt.status <> 'approved' THEN
    RAISE EXCEPTION '?????? ?????? ???????????????? ???????? ?????? ???? ???????????????? ??????';
  END IF;

  IF (v_receipt.destination_bank_account_id IS NULL AND v_receipt.receiver_party_id IS NULL)
     OR (v_receipt.destination_bank_account_id IS NOT NULL AND v_receipt.receiver_party_id IS NOT NULL) THEN
    RAISE EXCEPTION '???????? ?????? ???????? ???????? ???????????? ?????? ???? ?????????? ?????? ???? ???????? ???????????? ????????????????? ???????????? ???????????? ?????? ????????';
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
    RAISE EXCEPTION '???? ???????? ???????????????????? ???????? ?????? ?????? ???????????????? ???????????? ??????.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.validation_rules
    WHERE scope='journal_entry' AND enabled AND severity='blocking'
      AND field_key='receiver_accounting_code' AND rule_type='required'
  ) AND (v_receiver_code IS NULL OR length(trim(v_receiver_code)) = 0) THEN
    RAISE EXCEPTION '???? ???????? ???????????? ???????? ?????? ?????? ???????????????? ???????????? ??????.';
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

  -- Allocate to invoices
  FOR v_link IN
    SELECT prl.invoice_id, prl.amount AS link_amount, i.total_amount, i.status
      FROM public.payment_receipt_links prl
      JOIN public.invoices i ON i.id = prl.invoice_id
     WHERE prl.receipt_id = p_receipt_id
  LOOP
    SELECT COALESCE(SUM(amount), 0) INTO v_paid
      FROM public.payment_receipt_links
     WHERE invoice_id = v_link.invoice_id;

    v_total := v_link.total_amount;
    IF v_paid >= v_total THEN
      v_new_status := 'paid';
    ELSIF v_paid > 0 THEN
      v_new_status := 'partially_paid';
    ELSE
      v_new_status := 'unpaid';
    END IF;

    UPDATE public.invoices SET status = v_new_status WHERE id = v_link.invoice_id;

    v_invoice_updates := v_invoice_updates || jsonb_build_object(
      'invoice_id', v_link.invoice_id,
      'paid_total', v_paid,
      'new_status', v_new_status
    );
  END LOOP;

  -- Create journal entry (idempotent)
  SELECT id INTO v_existing_journal
    FROM public.journal_entries
   WHERE source_type = 'payment_receipt' AND source_id = v_receipt.id;

  IF v_existing_journal IS NULL THEN
    IF v_receipt.destination_bank_account_id IS NOT NULL THEN
      v_debit_kind := 'bank';
      v_debit_ref  := v_receipt.destination_bank_account_id;
      v_debit_desc := '?????????? ???? ???????? ?????????? ????????';
    ELSE
      v_debit_kind := 'external_party';
      v_debit_ref  := v_receipt.receiver_party_id;
      v_debit_desc := '???????????? ???? ?????? ??????????';
    END IF;

    INSERT INTO public.journal_entries(
      source_type, source_id, entry_date, description, status, posted_by,
      payer_accounting_code, receiver_accounting_code
    )
    VALUES (
      'payment_receipt', v_receipt.id, v_receipt.payment_date,
      '?????? ?????? ???????????? ?????????? ' || v_receipt.tracking_number, 'posted', p_user_id,
      NULLIF(trim(COALESCE(v_receipt.payer_accounting_code,'')), ''),
      NULLIF(trim(COALESCE(v_receiver_code,'')), '')
    )
    RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines(journal_entry_id, line_no, account_kind, account_ref_id, debit, credit, description)
    VALUES
      (v_journal_id, 1, v_debit_kind, v_debit_ref, v_receipt.amount, 0, v_debit_desc),
      (v_journal_id, 2, 'customer_credit', v_receipt.customer_id, 0, v_receipt.amount, '???????????? ????????????/???????? ???????? ??????????');
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
