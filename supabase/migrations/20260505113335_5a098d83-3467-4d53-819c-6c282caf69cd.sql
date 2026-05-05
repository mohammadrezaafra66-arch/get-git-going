-- 1) Validation rules table -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.validation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,                -- receipt | journal_entry | invoice | purchase
  field_key text NOT NULL,            -- e.g. receiver_name, payer_accounting_code
  rule_type text NOT NULL,            -- required | accounting_code_valid
  enabled boolean NOT NULL DEFAULT true,
  severity text NOT NULL DEFAULT 'warning', -- warning | blocking
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT validation_rules_scope_chk
    CHECK (scope IN ('receipt','journal_entry','invoice','purchase')),
  CONSTRAINT validation_rules_rule_type_chk
    CHECK (rule_type IN ('required','accounting_code_valid')),
  CONSTRAINT validation_rules_severity_chk
    CHECK (severity IN ('warning','blocking')),
  CONSTRAINT validation_rules_unique UNIQUE (scope, field_key, rule_type)
);

ALTER TABLE public.validation_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "validation_rules_select_authenticated" ON public.validation_rules;
CREATE POLICY "validation_rules_select_authenticated"
  ON public.validation_rules FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "validation_rules_admin_all" ON public.validation_rules;
CREATE POLICY "validation_rules_admin_all"
  ON public.validation_rules FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.touch_validation_rules_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_validation_rules ON public.validation_rules;
CREATE TRIGGER trg_touch_validation_rules
  BEFORE UPDATE ON public.validation_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_validation_rules_updated_at();

-- Seed default rules (idempotent)
INSERT INTO public.validation_rules (scope, field_key, rule_type, severity, message) VALUES
  ('receipt','receiver_name','required','warning',
   'نام گیرنده (صاحب حساب) روی فیش وارد نشده است. ادامه می‌دهید؟'),
  ('receipt','payer_accounting_code','accounting_code_valid','warning',
   'کد آسان واریزکننده در سیستم پیدا نشد. آیا با همین مقدار ثبت شود؟'),
  ('receipt','receiver_accounting_code','accounting_code_valid','warning',
   'کد آسان گیرنده در سیستم پیدا نشد. آیا با همین مقدار ثبت شود؟'),
  ('journal_entry','payer_accounting_code','required','blocking',
   'کد آسان واریزکننده در سند حسابداری اجباری است.'),
  ('journal_entry','receiver_accounting_code','required','blocking',
   'کد آسان گیرنده در سند حسابداری اجباری است.')
ON CONFLICT (scope, field_key, rule_type) DO NOTHING;

-- 2) journal_entries: add accounting code columns ---------------------------
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS payer_accounting_code text,
  ADD COLUMN IF NOT EXISTS receiver_accounting_code text;

-- Backfill from existing receipts where possible
UPDATE public.journal_entries je
SET payer_accounting_code = COALESCE(je.payer_accounting_code, pr.payer_accounting_code),
    receiver_accounting_code = COALESCE(je.receiver_accounting_code, pr.receiver_accounting_code)
FROM public.payment_receipts pr
WHERE je.source_type = 'payment_receipt'
  AND je.source_id = pr.id
  AND (je.payer_accounting_code IS NULL OR je.receiver_accounting_code IS NULL);

-- 3) Update post_receipt_accounting to populate the new columns -------------
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
    SELECT COALESCE(accounting_code, NULL) INTO v_receiver_code
      FROM public.bank_accounts WHERE id = v_receipt.destination_bank_account_id;
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

    INSERT INTO public.journal_lines(journal_entry_id, line_no, kind, ref_id, debit, credit, description)
    VALUES
      (v_journal_id, 1, v_debit_kind, v_debit_ref, v_receipt.amount, 0, v_debit_desc),
      (v_journal_id, 2, 'customer', v_receipt.customer_id, 0, v_receipt.amount, 'افزایش اعتبار/کاهش بدهی مشتری');
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