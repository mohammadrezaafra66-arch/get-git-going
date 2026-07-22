-- =====================================================================
-- مورد ۱۳۴ — چهار نوع مستقل فیش واریزی
-- =====================================================================
--
-- ⚠️  هشدار: این migration دادهٔ مالی موجود را برگشت‌ناپذیر تغییر می‌دهد.
--     بدون گرفتن بکاپ اجرا نشود.
--
-- ---------------------------------------------------------------------
-- ۱) بکاپ اجباری — قبل از اجرا این را بزنید:
--
--     CREATE TABLE payment_receipts_backup_20260722 AS
--       SELECT * FROM public.payment_receipts;
--
-- ---------------------------------------------------------------------
-- ۲) پیش‌بررسی — ببینید چند ردیف تبدیل می‌شود:
--
--     SELECT receipt_type, count(*)
--       FROM public.payment_receipts
--      GROUP BY receipt_type
--      ORDER BY 2 DESC;
--
-- ---------------------------------------------------------------------
-- ۳) بازگشت (rollback) — اگر لازم شد وضعیت قبلی را برگردانید:
--
--     ALTER TABLE public.payment_receipts
--       DROP CONSTRAINT IF EXISTS payment_receipts_receipt_type_check;
--
--     UPDATE public.payment_receipts
--        SET receipt_type = 'payment'
--      WHERE receipt_type IN ('invoice_payment', 'debt_payment', 'positive_credit');
--     -- ⚠️ توجه: اگر بعد از اعمال این migration فیش‌های جدیدی با نوع
--     --    debt_payment یا positive_credit ثبت شده باشند، دستور بالا آن‌ها را
--     --    هم به 'payment' برمی‌گرداند و تفکیکشان از بین می‌رود. در آن صورت
--     --    به‌جای دستور بالا از جدول بکاپ بازیابی کنید.
--
--     ALTER TABLE public.payment_receipts
--       ADD CONSTRAINT payment_receipts_receipt_type_check
--       CHECK (receipt_type IN ('payment', 'prepayment'));
--
--     ALTER TABLE public.payment_receipts
--       ALTER COLUMN receipt_type SET DEFAULT 'payment';
--
-- ---------------------------------------------------------------------
-- یادداشت دربارهٔ توابع حسابداری:
--   نسخهٔ فعلی public.post_receipt_accounting() (آخرین تعریف در
--   20260505113335_5a098d83-3467-4d53-819c-6c282caf69cd.sql) دیگر روی
--   receipt_type شرط ندارد؛ حلقهٔ تسویه مستقیماً روی payment_receipt_links
--   می‌چرخد. چون فقط فیش‌های نوع invoice_payment رکورد لینک دارند، رفتار آن
--   برای سه نوع دیگر خودبه‌خود no-op است و نیازی به تغییر تابع نیست.
--   افزایش اعتبار مشتری (increase_credit) هم بدون قید نوع اجرا می‌شود و
--   برای هر چهار نوع درست است.
-- =====================================================================

BEGIN;

-- گام ۱ — constraint قدیمی باید اول برداشته شود، وگرنه UPDATE گام ۲ رد می‌شود.
ALTER TABLE public.payment_receipts
  DROP CONSTRAINT IF EXISTS payment_receipts_receipt_type_check;

-- گام ۲ — مهاجرت داده: هر فیش «پرداخت» موجود در واقع پرداخت متصل به
-- پیش‌فاکتور بوده است. 'prepayment' دست‌نخورده باقی می‌ماند.
UPDATE public.payment_receipts
   SET receipt_type = 'invoice_payment'
 WHERE receipt_type = 'payment';

-- گام ۳ — constraint جدید با چهار مقدار.
ALTER TABLE public.payment_receipts
  ADD CONSTRAINT payment_receipts_receipt_type_check
  CHECK (receipt_type IN ('invoice_payment', 'debt_payment', 'prepayment', 'positive_credit'));

-- گام ۴ — پیش‌فرض ستون هم باید به مقدار جدید تغییر کند، وگرنه هر INSERT ای
-- که receipt_type نفرستد با constraint جدید شکست می‌خورد.
ALTER TABLE public.payment_receipts
  ALTER COLUMN receipt_type SET DEFAULT 'invoice_payment';

COMMIT;
