-- 1) Enforce mutually-exclusive receiver: exactly one of destination_bank_account_id / receiver_party_id
ALTER TABLE public.payment_receipts
  DROP CONSTRAINT IF EXISTS payment_receipts_receiver_exclusive_chk;

ALTER TABLE public.payment_receipts
  ADD CONSTRAINT payment_receipts_receiver_exclusive_chk
  CHECK (
    (destination_bank_account_id IS NOT NULL AND receiver_party_id IS NULL)
    OR
    (destination_bank_account_id IS NULL AND receiver_party_id IS NOT NULL)
    OR
    -- allow legacy/null while pending review (status changes will tighten later)
    (status = 'pending_review' AND destination_bank_account_id IS NULL AND receiver_party_id IS NULL)
  );

-- 2) Update post_receipt_accounting() to handle external_party receiver in the journal
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
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]) THEN
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

  -- Enforce: exactly one receiver side must be set when posting
  IF (v_receipt.destination_bank_account_id IS NULL AND v_receipt.receiver_party_id IS NULL)
     OR (v_receipt.destination_bank_account_id IS NOT NULL AND v_receipt.receiver_party_id IS NOT NULL) THEN
    RAISE EXCEPTION 'برای ثبت سند، باید دقیقاً یکی از «بانک ما» یا «طرف خارجی» به‌عنوان گیرنده انتخاب شده باشد';
  END IF;

  UPDATE public.payment_receipts
     SET posting_status = 'posted',
         posted_at = now()
   WHERE id = p_receipt_id;

  -- 1) Increase payer (customer) credit balance
  PERFORM public.increase_credit(
    v_receipt.customer_id,
    v_receipt.amount,
    v_receipt.id,
    p_user_id
  );

  -- 2) Settle linked invoices for payment-type receipts
  IF v_receipt.receipt_type = 'payment' THEN
    FOR v_link IN
      SELECT prl.invoice_id, i.total_amount, i.status
        FROM public.payment_receipt_links prl
        JOIN public.invoices i ON i.id = prl.invoice_id
       WHERE prl.receipt_id = p_receipt_id
    LOOP
      v_total := v_link.total_amount;

      SELECT COALESCE(SUM(prl.amount), 0)
        INTO v_paid
        FROM public.payment_receipt_links prl
        JOIN public.payment_receipts pr ON pr.id = prl.receipt_id
       WHERE prl.invoice_id = v_link.invoice_id
         AND pr.status = 'approved';

      v_new_status := NULL;
      IF v_paid >= v_total - 0.001 THEN
        v_new_status := 'paid';
      ELSIF v_paid > 0 THEN
        v_new_status := 'partially_paid';
      END IF;

      IF v_new_status IS NOT NULL AND v_new_status <> v_link.status THEN
        UPDATE public.invoices
           SET status = v_new_status
         WHERE id = v_link.invoice_id;

        v_invoice_updates := v_invoice_updates || jsonb_build_object(
          'invoice_id', v_link.invoice_id,
          'from', v_link.status,
          'to', v_new_status,
          'paid_total', v_paid,
          'invoice_total', v_total
        );
      END IF;
    END LOOP;
  END IF;

  -- 3) Journal entry
  SELECT id INTO v_existing_journal
    FROM public.journal_entries
   WHERE source_type = 'payment_receipt' AND source_id = p_receipt_id
   LIMIT 1;

  IF v_existing_journal IS NULL THEN
    -- Determine debit side: bank OR external_party (mutually exclusive, validated above)
    IF v_receipt.destination_bank_account_id IS NOT NULL THEN
      v_debit_kind := 'bank';
      v_debit_ref  := v_receipt.destination_bank_account_id;
      v_debit_desc := 'دریافت به حساب بانکی ما';
    ELSE
      v_debit_kind := 'external_party';
      v_debit_ref  := v_receipt.receiver_party_id;
      v_debit_desc := 'کاهش بدهی ما به طرف خارجی گیرنده (یا افزایش طلب از او)';
    END IF;

    INSERT INTO public.journal_entries (
      source_type, source_id, entry_date, description,
      status, posted_by, posted_at
    ) VALUES (
      'payment_receipt',
      p_receipt_id,
      COALESCE(v_receipt.payment_date, current_date),
      'ثبت سند فیش واریزی شماره پیگیری ' || COALESCE(v_receipt.tracking_number, p_receipt_id::text),
      'posted',
      p_user_id,
      now()
    ) RETURNING id INTO v_journal_id;

    -- Debit line (receiver: bank or external_party)
    INSERT INTO public.journal_lines (
      journal_entry_id, line_no, account_kind, account_ref_id,
      description, debit, credit
    ) VALUES (
      v_journal_id, 1, v_debit_kind, v_debit_ref,
      v_debit_desc,
      v_receipt.amount, 0
    );

    -- Credit line: payer customer credit
    INSERT INTO public.journal_lines (
      journal_entry_id, line_no, account_kind, account_ref_id,
      description, debit, credit
    ) VALUES (
      v_journal_id, 2, 'customer_credit', v_receipt.customer_id,
      'افزایش اعتبار/کاهش بدهی واریزکننده',
      0, v_receipt.amount
    );

    SELECT * INTO v_balance
      FROM public.validate_journal_entry_balance(v_journal_id);

    IF NOT v_balance.is_balanced THEN
      RAISE EXCEPTION 'سند حسابداری نامتوازن است (بدهکار=% ، بستانکار=%)',
        v_balance.total_debit, v_balance.total_credit;
    END IF;

    v_journal_summary := jsonb_build_object(
      'journal_entry_id', v_journal_id,
      'total_debit', v_balance.total_debit,
      'total_credit', v_balance.total_credit,
      'lines', jsonb_build_array(
        jsonb_build_object('line_no', 1, 'account_kind', v_debit_kind, 'account_ref_id', v_debit_ref, 'debit', v_receipt.amount, 'credit', 0),
        jsonb_build_object('line_no', 2, 'account_kind', 'customer_credit', 'account_ref_id', v_receipt.customer_id, 'debit', 0, 'credit', v_receipt.amount)
      )
    );

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, diff)
    VALUES (
      COALESCE(p_user_id, auth.uid()),
      'journal_entry_created',
      'journal_entry',
      v_journal_id::text,
      v_journal_summary || jsonb_build_object('receipt_id', p_receipt_id)
    );
  ELSE
    v_journal_id := v_existing_journal;
    v_journal_summary := jsonb_build_object('journal_entry_id', v_journal_id, 'reused', true);
  END IF;

  RETURN jsonb_build_object(
    'posted', true,
    'receipt_id', p_receipt_id,
    'invoice_updates', v_invoice_updates,
    'journal', v_journal_summary
  );
END;
$function$;