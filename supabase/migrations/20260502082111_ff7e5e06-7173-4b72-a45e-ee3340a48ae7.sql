-- 1. Add idempotency fields
ALTER TABLE public.payment_receipts
  ADD COLUMN IF NOT EXISTS posting_status text NOT NULL DEFAULT 'unposted',
  ADD COLUMN IF NOT EXISTS posted_at timestamptz;

ALTER TABLE public.payment_receipts
  DROP CONSTRAINT IF EXISTS payment_receipts_posting_status_check;
ALTER TABLE public.payment_receipts
  ADD CONSTRAINT payment_receipts_posting_status_check
  CHECK (posting_status IN ('unposted','posted'));

-- 2. RPC: atomic accounting posting for a receipt
CREATE OR REPLACE FUNCTION public.post_receipt_accounting(
  p_receipt_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_receipt public.payment_receipts%ROWTYPE;
  v_link record;
  v_paid numeric;
  v_total numeric;
  v_new_status text;
  v_invoice_updates jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز برای ثبت سند حسابداری فیش';
  END IF;

  -- Lock the receipt row to serialize concurrent posters
  SELECT * INTO v_receipt
    FROM public.payment_receipts
   WHERE id = p_receipt_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'فیش یافت نشد';
  END IF;

  -- Idempotency: already posted? return without doing anything
  IF v_receipt.posting_status = 'posted' THEN
    RETURN jsonb_build_object('already_posted', true, 'posted_at', v_receipt.posted_at);
  END IF;

  IF v_receipt.status <> 'approved' THEN
    RAISE EXCEPTION 'فقط فیش تأییدشده قابل ثبت در حسابداری است';
  END IF;

  -- Mark posted FIRST (atomic guard inside the same tx)
  UPDATE public.payment_receipts
     SET posting_status = 'posted',
         posted_at = now()
   WHERE id = p_receipt_id;

  -- 1) Credit (receive from payer → customer credit balance)
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

  -- 3) Audit
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, diff)
  VALUES (
    COALESCE(p_user_id, auth.uid()),
    'receipt_accounting_posted',
    'payment_receipt',
    p_receipt_id::text,
    jsonb_build_object(
      'receipt_id', p_receipt_id,
      'customer_id', v_receipt.customer_id,
      'amount', v_receipt.amount,
      'receipt_type', v_receipt.receipt_type,
      'invoice_updates', v_invoice_updates,
      'note', 'پرداخت به گیرنده ثبت نشد: مدل حساب گیرنده/بانک در حال حاضر تعریف نشده است'
    )
  );

  RETURN jsonb_build_object(
    'already_posted', false,
    'invoice_updates', v_invoice_updates
  );
END;
$$;

REVOKE ALL ON FUNCTION public.post_receipt_accounting(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_receipt_accounting(uuid, uuid) TO authenticated;