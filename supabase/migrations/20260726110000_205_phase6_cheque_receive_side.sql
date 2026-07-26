-- Phase 6 — «چک» به‌عنوان کانال سند در سمت دریافت (۱۴۸/۱۵۲)
-- سمت پرداخت (payment_vouchers) در فاز ۹ ساخته می‌شود؛ اینجا فقط دریافت.
-- هیچ ردیفی حذف/تغییر نمی‌شود: CHECK فقط گسترش می‌یابد و دو ستون nullable اضافه می‌شود.

BEGIN;

-- ۱) گسترش CHECK کانال سند با مقدار 'cheque'
ALTER TABLE public.payment_receipts
  DROP CONSTRAINT IF EXISTS payment_receipts_document_channel_check;

ALTER TABLE public.payment_receipts
  ADD CONSTRAINT payment_receipts_document_channel_check
  CHECK (
    document_channel IS NULL
    OR document_channel = ANY (
      ARRAY['card_to_card'::text, 'paya'::text, 'pol'::text, 'satna'::text,
            'cash'::text, 'cheque'::text, 'other'::text]
    )
  );

-- ۲) فیلدهای اختصاصی چک (فقط وقتی کانال 'cheque' است معنا دارند)
ALTER TABLE public.payment_receipts
  ADD COLUMN IF NOT EXISTS cheque_number text,
  ADD COLUMN IF NOT EXISTS cheque_due_date date;

COMMENT ON COLUMN public.payment_receipts.cheque_number IS
  'شمارهٔ چک — فقط وقتی document_channel = ''cheque'' پر می‌شود.';
COMMENT ON COLUMN public.payment_receipts.cheque_due_date IS
  'تاریخ سررسید چک — فقط وقتی document_channel = ''cheque'' پر می‌شود.';

-- ۳) اگر کانال چک نیست، فیلدهای چک نباید پر باشند.
ALTER TABLE public.payment_receipts
  DROP CONSTRAINT IF EXISTS payment_receipts_cheque_fields_chk;

ALTER TABLE public.payment_receipts
  ADD CONSTRAINT payment_receipts_cheque_fields_chk
  CHECK (
    document_channel = 'cheque'
    OR (cheque_number IS NULL AND cheque_due_date IS NULL)
  );

COMMIT;
