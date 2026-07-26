-- Phase 9.2–9.4 — خزانه: اتصال پرداخت خرید + ماندهٔ حساب + گزارش ورود/خروج
--   ۹.۲ ساخت سند پرداخت هنگام پرداخت یک خرید
--   ۹.۳ ۱۸۱ تابع/ویو ماندهٔ صندوق و حساب
--   ۹.۴ ۱۸۲ گزارش دوطرفهٔ ورود/خروج با ماندهٔ تجمعی
--
-- الگوی امن گزارش مالی طبق پلن: RPC با SECURITY DEFINER + چک `has_any_role`.

BEGIN;

-- ===========================================================================
-- ۹.۳ — ماندهٔ هر حساب/صندوق (۱۸۱)
--   مانده = opening_balance
--          + مجموع payment_receipts تأییدشده با destination_bank_account_id = حساب
--          - مجموع payment_vouchers تأییدشده با source_bank_account_id = حساب
--
--   نکته: فیش‌های `pending_review`/`rejected` در مانده نمی‌آیند، چون پول
--   تأییدنشده هنوز جزو دارایی خزانه نیست. همین منطق برای سند پرداخت.
-- ===========================================================================
CREATE OR REPLACE VIEW public.vw_account_balances AS
 WITH inflow AS (
   SELECT pr.destination_bank_account_id AS account_id,
          COALESCE(SUM(pr.amount), 0)::numeric AS total_in,
          COUNT(*)::bigint AS in_count
     FROM public.payment_receipts pr
    WHERE pr.destination_bank_account_id IS NOT NULL
      AND pr.status = 'approved'
    GROUP BY pr.destination_bank_account_id
 ), outflow AS (
   SELECT pv.source_bank_account_id AS account_id,
          COALESCE(SUM(pv.amount), 0)::numeric AS total_out,
          COUNT(*)::bigint AS out_count
     FROM public.payment_vouchers pv
    WHERE pv.status = 'approved'
    GROUP BY pv.source_bank_account_id
 )
 SELECT ba.id AS account_id,
        ba.title,
        ba.bank_name,
        ba.account_type,
        ba.currency,
        ba.is_active,
        ba.opening_balance,
        COALESCE(i.total_in, 0)::numeric  AS total_in,
        COALESCE(o.total_out, 0)::numeric AS total_out,
        (ba.opening_balance + COALESCE(i.total_in, 0) - COALESCE(o.total_out, 0))::numeric
          AS current_balance,
        COALESCE(i.in_count, 0)::bigint  AS in_count,
        COALESCE(o.out_count, 0)::bigint AS out_count
   FROM public.bank_accounts ba
   LEFT JOIN inflow  i ON i.account_id = ba.id
   LEFT JOIN outflow o ON o.account_id = ba.id;

COMMENT ON VIEW public.vw_account_balances IS
  'ماندهٔ جاری هر حساب/صندوق (۱۸۱). فقط اسناد approved در مانده اثر دارند.';

DROP FUNCTION IF EXISTS public.get_account_balances(text, boolean);

CREATE FUNCTION public.get_account_balances(
  p_account_type text DEFAULT NULL,
  p_include_inactive boolean DEFAULT false
)
RETURNS TABLE(
  account_id uuid,
  title text,
  bank_name text,
  account_type text,
  currency text,
  is_active boolean,
  opening_balance numeric,
  total_in numeric,
  total_out numeric,
  current_balance numeric,
  in_count bigint,
  out_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT v.account_id, v.title, v.bank_name, v.account_type, v.currency, v.is_active,
         v.opening_balance, v.total_in, v.total_out, v.current_balance,
         v.in_count, v.out_count
    FROM public.vw_account_balances v
   WHERE (p_account_type IS NULL OR v.account_type = p_account_type)
     AND (p_include_inactive OR v.is_active)
   ORDER BY v.account_type, v.title;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_account_balances(text, boolean)
  TO anon, authenticated, service_role, postgres;

-- ===========================================================================
-- ۹.۴ — گزارش ورود/خروج یک صندوق در بازهٔ تاریخ، با ماندهٔ تجمعی (۱۸۲)
--   ورودی‌ها از payment_receipts و خروجی‌ها از payment_vouchers کنار هم،
--   مرتب بر تاریخ، با running balance که از ماندهٔ ابتدای بازه شروع می‌شود.
-- ===========================================================================
DROP FUNCTION IF EXISTS public.get_account_ledger(uuid, date, date);

CREATE FUNCTION public.get_account_ledger(
  p_account_id uuid,
  p_from_date date DEFAULT NULL,
  p_to_date date DEFAULT NULL
)
RETURNS TABLE(
  entry_id uuid,
  entry_kind text,          -- 'in' | 'out'
  entry_date date,
  document_number text,
  counterparty text,
  document_channel text,
  amount numeric,
  signed_amount numeric,
  running_balance numeric,
  description text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _opening numeric;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- ماندهٔ ابتدای بازه = opening_balance حساب + همهٔ حرکات تأییدشدهٔ قبل از p_from_date
  SELECT ba.opening_balance INTO _opening
    FROM public.bank_accounts ba WHERE ba.id = p_account_id;
  IF _opening IS NULL THEN
    RAISE EXCEPTION 'حساب یافت نشد.' USING ERRCODE = '22023';
  END IF;

  IF p_from_date IS NOT NULL THEN
    _opening := _opening
      + COALESCE((SELECT SUM(pr.amount) FROM public.payment_receipts pr
                   WHERE pr.destination_bank_account_id = p_account_id
                     AND pr.status = 'approved' AND pr.payment_date < p_from_date), 0)
      - COALESCE((SELECT SUM(pv.amount) FROM public.payment_vouchers pv
                   WHERE pv.source_bank_account_id = p_account_id
                     AND pv.status = 'approved' AND pv.payment_date < p_from_date), 0);
  END IF;

  RETURN QUERY
  WITH entries AS (
    SELECT pr.id AS entry_id,
           'in'::text AS entry_kind,
           pr.payment_date AS entry_date,
           pr.tracking_number AS document_number,
           COALESCE(c.name, pr.payer_name) AS counterparty,
           pr.document_channel,
           pr.amount,
           pr.amount AS signed_amount,
           pr.description,
           pr.created_at
      FROM public.payment_receipts pr
      LEFT JOIN public.customers c ON c.id = pr.customer_id
     WHERE pr.destination_bank_account_id = p_account_id
       AND pr.status = 'approved'
       AND (p_from_date IS NULL OR pr.payment_date >= p_from_date)
       AND (p_to_date   IS NULL OR pr.payment_date <= p_to_date)
    UNION ALL
    SELECT pv.id AS entry_id,
           'out'::text AS entry_kind,
           pv.payment_date AS entry_date,
           pv.voucher_number AS document_number,
           -- external_parties names its column full_name, not name.
           COALESCE(s.name, ep.full_name, c2.name, pv.payee_name) AS counterparty,
           pv.document_channel,
           pv.amount,
           -pv.amount AS signed_amount,
           pv.description,
           pv.created_at
      FROM public.payment_vouchers pv
      LEFT JOIN public.suppliers s        ON s.id  = pv.payee_supplier_id
      LEFT JOIN public.external_parties ep ON ep.id = pv.payee_party_id
      LEFT JOIN public.customers c2       ON c2.id = pv.payee_customer_id
     WHERE pv.source_bank_account_id = p_account_id
       AND pv.status = 'approved'
       AND (p_from_date IS NULL OR pv.payment_date >= p_from_date)
       AND (p_to_date   IS NULL OR pv.payment_date <= p_to_date)
  )
  SELECT e.entry_id, e.entry_kind, e.entry_date, e.document_number, e.counterparty,
         e.document_channel, e.amount, e.signed_amount,
         (_opening + SUM(e.signed_amount) OVER (
            ORDER BY e.entry_date, e.created_at, e.entry_id
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW))::numeric AS running_balance,
         e.description
    FROM entries e
   ORDER BY e.entry_date, e.created_at, e.entry_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_account_ledger(uuid, date, date)
  TO anon, authenticated, service_role, postgres;

-- ===========================================================================
-- ۹.۲ — ساخت سند پرداخت برای یک خرید
--   `purchases.paid_at` برای سازگاری می‌ماند ولی منبع حقیقتِ خروج پول
--   `payment_vouchers` است. تابع اتمیک: سند می‌سازد و خرید را پرداخت‌شده می‌کند.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.pay_purchase_with_voucher(
  _purchase_id uuid,
  _source_bank_account_id uuid,
  _payment_date date DEFAULT NULL,
  _document_channel text DEFAULT 'cash',
  _amount numeric DEFAULT NULL,
  _tracking_number text DEFAULT NULL,
  _cheque_number text DEFAULT NULL,
  _cheque_due_date date DEFAULT NULL,
  _description text DEFAULT NULL
)
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

GRANT EXECUTE ON FUNCTION public.pay_purchase_with_voucher(
  uuid, uuid, date, text, numeric, text, text, date, text
) TO authenticated, service_role, postgres;

COMMIT;
