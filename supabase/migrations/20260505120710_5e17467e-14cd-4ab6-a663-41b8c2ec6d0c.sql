-- 1) Add beneficiary_accounting_code column to payment_receipts
ALTER TABLE public.payment_receipts
  ADD COLUMN IF NOT EXISTS beneficiary_accounting_code text;

COMMENT ON COLUMN public.payment_receipts.beneficiary_accounting_code IS
  'کد آسان طلبکار/ذینفع نهایی (طرفی که بدهی ما به او با این پرداخت کم می‌شود). ممکن است با گیرنده فیزیکی فیش متفاوت باشد.';

-- 2) Function to post a journal entry for an approved receipt
CREATE OR REPLACE FUNCTION public.post_receipt_journal(_receipt_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  entry_id uuid;
BEGIN
  SELECT id, customer_id, amount, payment_date, payer_accounting_code,
         beneficiary_accounting_code, receiver_accounting_code, tracking_number
    INTO r
  FROM public.payment_receipts
  WHERE id = _receipt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'فیش پیدا نشد: %', _receipt_id;
  END IF;

  -- Skip if already posted
  IF EXISTS (SELECT 1 FROM public.journal_entries
             WHERE source_type = 'payment_receipt' AND source_id = _receipt_id::text) THEN
    SELECT id INTO entry_id FROM public.journal_entries
      WHERE source_type = 'payment_receipt' AND source_id = _receipt_id::text
      LIMIT 1;
    RETURN entry_id;
  END IF;

  INSERT INTO public.journal_entries (
    source_type, source_id, entry_date, status,
    payer_accounting_code, receiver_accounting_code, description
  ) VALUES (
    'payment_receipt', _receipt_id::text, COALESCE(r.payment_date, CURRENT_DATE), 'posted',
    r.payer_accounting_code,
    COALESCE(r.beneficiary_accounting_code, r.receiver_accounting_code),
    'سند خودکار فیش واریزی - شماره پیگیری ' || COALESCE(r.tracking_number, '')
  )
  RETURNING id INTO entry_id;

  -- Debit: beneficiary (طلبکار - بدهی ما به او کم می‌شود)
  INSERT INTO public.journal_lines (journal_entry_id, line_no, account_kind, debit, credit, description)
  VALUES (
    entry_id, 1, 'accounting_code',
    r.amount, 0,
    'بدهکار: ' || COALESCE(r.beneficiary_accounting_code, r.receiver_accounting_code, '—')
  );

  -- Credit: payer (پرداخت‌کننده - بدهی او به ما کم می‌شود)
  INSERT INTO public.journal_lines (journal_entry_id, line_no, account_kind, debit, credit, description)
  VALUES (
    entry_id, 2, 'accounting_code',
    0, r.amount,
    'بستانکار: ' || COALESCE(r.payer_accounting_code, '—')
  );

  RETURN entry_id;
END;
$$;

-- 3) Trigger to auto-post when approved
CREATE OR REPLACE FUNCTION public.trg_post_receipt_on_approve()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved')
     AND NEW.payer_accounting_code IS NOT NULL
     AND COALESCE(NEW.beneficiary_accounting_code, NEW.receiver_accounting_code) IS NOT NULL
  THEN
    PERFORM public.post_receipt_journal(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_receipts_post_journal ON public.payment_receipts;
CREATE TRIGGER trg_payment_receipts_post_journal
AFTER INSERT OR UPDATE OF status ON public.payment_receipts
FOR EACH ROW EXECUTE FUNCTION public.trg_post_receipt_on_approve();