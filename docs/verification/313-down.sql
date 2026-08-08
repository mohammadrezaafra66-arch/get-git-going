-- Down script for migration 313 (purchase payment: payee identity + journal entry).
--
-- Restores the exact pre-313 9-argument pay_purchase_with_voucher, byte-for-byte
-- from docs/verification/pre-313/pay_purchase_with_voucher.live.sql, and drops
-- the 11-argument version so no overload survives (rule 5 in both directions).
--
-- WHAT REVERTING COSTS YOU:
--   * purchase payments stop producing any journal entry again - the ledger
--     goes back to being blind to every rial that leaves for a purchase;
--   * a third-party payee can no longer be recorded on a purchase payment;
--   * no audit_logs row is written for a purchase payment.
--
-- DATA NOTE. Journal entries and voucher rows already written by 313 are NOT
-- removed here. Deleting posted ledger entries is an accounting decision, not
-- a migration one. To find them:
--     SELECT * FROM public.journal_entries WHERE source_type = 'payment_voucher';
-- Reverting while such rows exist is safe (they simply stop being produced),
-- but note that docs/verification/312-down.sql will refuse to run until the
-- supplier_payable lines under those entries are resolved.
--
-- NO BEGIN / COMMIT here - transaction control belongs to the caller
-- (apply with psql --single-transaction -v ON_ERROR_STOP=1).
SET client_encoding='UTF8';

DROP FUNCTION IF EXISTS public.pay_purchase_with_voucher(uuid,uuid,date,text,numeric,text,text,date,text,uuid,text);

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
$function$;

DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'pay_purchase_with_voucher';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'Down script failed: % overloads survive (want exactly 1).', _n;
  END IF;
  RAISE NOTICE '313 reverted: pay_purchase_with_voucher is back to its 9-argument, no-ledger form.';
END $$;
