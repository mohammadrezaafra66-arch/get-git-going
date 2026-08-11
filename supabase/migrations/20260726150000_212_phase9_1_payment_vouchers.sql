-- Phase 9.1 — خزانه: تفکیک صندوق/بانک + سند پرداخت خروجی + RLS
--   ۱۸۱ ستون `account_type` روی `bank_accounts` (bank | cash)
--   ۱۸۰ جدول `payment_vouchers` (خروج پول) — قرینهٔ منطقی `payment_receipts`
--   چک به‌عنوان کانال + فیلدهای چک در سمت پرداخت
--
-- هیچ داده‌ای حذف/تغییر نوع نمی‌شود: یک ستون با default امن اضافه می‌شود و یک
-- جدول جدید ساخته می‌شود. رکوردهای موجود `bank_accounts` همه 'bank' می‌مانند.

BEGIN;

-- ===========================================================================
-- ۱) ۱۸۱ — تمایز «صندوق نقدی» از «حساب بانکی»
--    پلن: افزودن account_type کم‌ریسک‌تر از جدول مستقل صندوق و با دادهٔ موجود
--    سازگارتر است. پیش‌فرض 'bank' یعنی هر حساب موجود دقیقاً مثل قبل رفتار می‌کند.
-- ===========================================================================
ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'bank';

ALTER TABLE public.bank_accounts
  DROP CONSTRAINT IF EXISTS bank_accounts_account_type_chk;

ALTER TABLE public.bank_accounts
  ADD CONSTRAINT bank_accounts_account_type_chk
  CHECK (account_type IN ('bank','cash'));

COMMENT ON COLUMN public.bank_accounts.account_type IS
  'نوع حساب (۱۸۱): bank = حساب بانکی، cash = صندوق نقدی. پیش‌فرض bank تا دادهٔ موجود دست‌نخورده بماند.';

-- ===========================================================================
-- ۲) ۱۸۰ — سند پرداخت خروجی
--    الان فقط `payment_receipts` (ورود پول) هست و پرداخت خرید تنها با
--    `purchases.paid_at` علامت می‌خورد، پس خروج پول هیچ سندی ندارد.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.payment_vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_number text UNIQUE,
  amount numeric NOT NULL CHECK (amount > 0),
  payment_date date NOT NULL,
  payment_time text CHECK (payment_time IS NULL OR payment_time ~ '^\d{2}:\d{2}$'),

  -- دریافت‌کنندهٔ پول: دقیقاً یکی از چهار نوع
  payee_type text NOT NULL
    CHECK (payee_type IN ('supplier','external_party','customer','other')),
  payee_supplier_id uuid REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  payee_party_id uuid REFERENCES public.external_parties(id) ON DELETE RESTRICT,
  payee_customer_id uuid REFERENCES public.customers(id) ON DELETE RESTRICT,
  payee_name text,

  document_channel text NOT NULL
    CHECK (document_channel IN
      ('card_to_card','paya','pol','satna','cash','cheque','other')),

  -- از کدام حساب/صندوق خارج شد
  source_bank_account_id uuid NOT NULL
    REFERENCES public.bank_accounts(id) ON DELETE RESTRICT,

  tracking_number text,
  -- فیلدهای چک؛ فقط وقتی کانال 'cheque' است معنا دارند
  cheque_number text,
  cheque_due_date date,

  description text,
  status text NOT NULL DEFAULT 'approved'
    CHECK (status IN ('draft','approved','rejected')),

  -- اتصال اختیاری به خرید (۹.۲)
  purchase_id uuid REFERENCES public.purchases(id) ON DELETE SET NULL,

  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- دریافت‌کننده باید با نوعش بخواند (قرینهٔ payment_receipts_receiver_exclusive_chk)
  CONSTRAINT payment_vouchers_payee_matches_type_chk CHECK (
    (payee_type = 'supplier'
       AND payee_supplier_id IS NOT NULL AND payee_party_id IS NULL AND payee_customer_id IS NULL)
    OR (payee_type = 'external_party'
       AND payee_party_id IS NOT NULL AND payee_supplier_id IS NULL AND payee_customer_id IS NULL)
    OR (payee_type = 'customer'
       AND payee_customer_id IS NOT NULL AND payee_supplier_id IS NULL AND payee_party_id IS NULL)
    OR (payee_type = 'other'
       AND payee_supplier_id IS NULL AND payee_party_id IS NULL AND payee_customer_id IS NULL
       AND payee_name IS NOT NULL AND length(trim(payee_name)) > 0)
  ),

  -- فیلدهای چک فقط برای کانال چک
  CONSTRAINT payment_vouchers_cheque_fields_chk CHECK (
    document_channel = 'cheque'
    OR (cheque_number IS NULL AND cheque_due_date IS NULL)
  ),
  -- برای کانال چک، شمارهٔ چک الزامی است
  CONSTRAINT payment_vouchers_cheque_number_required_chk CHECK (
    document_channel <> 'cheque' OR (cheque_number IS NOT NULL AND length(trim(cheque_number)) > 0)
  )
);

COMMENT ON TABLE public.payment_vouchers IS
  'سند پرداخت / خروج پول (۱۸۰). منبع حقیقت خروج پول از خزانه؛ purchases.paid_at برای سازگاری می‌ماند.';

CREATE INDEX IF NOT EXISTS idx_payment_vouchers_date
  ON public.payment_vouchers (payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payment_vouchers_source_account
  ON public.payment_vouchers (source_bank_account_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_payment_vouchers_purchase
  ON public.payment_vouchers (purchase_id) WHERE purchase_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_vouchers_supplier
  ON public.payment_vouchers (payee_supplier_id) WHERE payee_supplier_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_payment_vouchers_updated_at ON public.payment_vouchers;
CREATE TRIGGER trg_payment_vouchers_updated_at
  BEFORE UPDATE ON public.payment_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();

-- ===========================================================================
-- ۳) شمارهٔ سند خودکار (PV-<سال>-<شمارنده>)
-- ===========================================================================
CREATE SEQUENCE IF NOT EXISTS public.payment_voucher_number_seq;

CREATE OR REPLACE FUNCTION public.trg_payment_voucher_set_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.voucher_number IS NULL OR length(trim(NEW.voucher_number)) = 0 THEN
    NEW.voucher_number := 'PV-' || to_char(now(), 'YYYY') || '-' ||
      lpad(nextval('public.payment_voucher_number_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_payment_vouchers_number ON public.payment_vouchers;
CREATE TRIGGER trg_payment_vouchers_number
  BEFORE INSERT ON public.payment_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.trg_payment_voucher_set_number();

-- ===========================================================================
-- ۴) RLS — مثل payment_receipts: admin/manager/accountant
-- ===========================================================================
ALTER TABLE public.payment_vouchers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_vouchers_select_finance ON public.payment_vouchers;
CREATE POLICY payment_vouchers_select_finance ON public.payment_vouchers
  FOR SELECT USING (
    public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[])
  );

DROP POLICY IF EXISTS payment_vouchers_insert_finance ON public.payment_vouchers;
CREATE POLICY payment_vouchers_insert_finance ON public.payment_vouchers
  FOR INSERT WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['admin','accountant']::text[])
  );

DROP POLICY IF EXISTS payment_vouchers_update_finance ON public.payment_vouchers;
CREATE POLICY payment_vouchers_update_finance ON public.payment_vouchers
  FOR UPDATE USING (public.has_any_role(auth.uid(), ARRAY['admin','accountant']::text[]))
          WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','accountant']::text[]));

DROP POLICY IF EXISTS payment_vouchers_delete_admin ON public.payment_vouchers;
CREATE POLICY payment_vouchers_delete_admin ON public.payment_vouchers
  FOR DELETE USING (public.has_role(auth.uid(), 'admin'::text));

COMMIT;
