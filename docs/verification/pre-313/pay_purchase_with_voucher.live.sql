CREATE OR REPLACE FUNCTION public.pay_purchase_with_voucher(_purchase_id uuid, _source_bank_account_id uuid, _payment_date date DEFAULT NULL::date, _document_channel text DEFAULT 'cash'::text, _amount numeric DEFAULT NULL::numeric, _tracking_number text DEFAULT NULL::text, _cheque_number text DEFAULT NULL::text, _cheque_due_date date DEFAULT NULL::date, _description text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _purchase record;
  _amt numeric;
  _voucher_id uuid;
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

  INSERT INTO public.payment_vouchers (
    amount, payment_date, payee_type, payee_supplier_id, payee_name,
    document_channel, source_bank_account_id, tracking_number,
    cheque_number, cheque_due_date, description, status, purchase_id, created_by
  ) VALUES (
    _amt,
    COALESCE(_payment_date, CURRENT_DATE),
    CASE WHEN _purchase.supplier_id IS NOT NULL THEN 'supplier' ELSE 'other' END,
    _purchase.supplier_id,
    CASE WHEN _purchase.supplier_id IS NULL THEN 'تأمین‌کننده نامشخص' ELSE NULL END,
    _document_channel,
    _source_bank_account_id,
    _tracking_number,
    _cheque_number,
    _cheque_due_date,
    COALESCE(_description, 'پرداخت خرید'),
    'approved',
    _purchase_id,
    auth.uid()
  )
  RETURNING id INTO _voucher_id;

  UPDATE public.purchases
     SET paid_at = COALESCE(paid_at, now())
   WHERE id = _purchase_id;

  RETURN _voucher_id;
END;
$function$

