-- 423 — زمان تسویه برای هر خرید اجباری است، در هر سه لایه.
--
-- WHY. `vw_supplier_payables` سررسید را چنین می‌سازد:
--     CASE WHEN pt.days IS NOT NULL THEN (p.purchase_date + pt.days) ELSE p.purchase_date END
-- یعنی نبودِ ترم، به‌جای «نامشخص»، بی‌صدا به «سررسید = تاریخ خرید» تبدیل می‌شود و ردیف از
-- فردای خرید «معوق» گزارش می‌شود. عددِ غلط با برچسب اطمینان‌بخش — همان چیزی که مهاجرت ۴۱۹ از
-- سمت مطالبات حذف کرد. این مهاجرت در را می‌بندد به‌جای اینکه فقط نمایشش را درست کند.
--
-- WHAT WAS ALREADY CLOSED, MEASURED 2026-09-04 ON THE TEST DATABASE:
--   * `create_purchase` ترمِ NULL را رد می‌کند (23503 / PURCHASE_PAYMENT_TERM_INVALID) و ترم
--     غیرفعال را هم (22023 / PURCHASE_PAYMENT_TERM_INACTIVE).
--   * `authenticated` روی جدول `purchases` مجوز INSERT ندارد، پس RPC تنها درِ ساخت است.
-- WHAT WAS STILL OPEN — و دلیل وجود این مایگریشن:
--   * `authenticated` مجوز UPDATE دارد، از جمله روی ستون `payment_term_id`. با یک PATCH ساده از
--     PostgREST، ادمین یا مدیر ترم را از هر خریدِ موجود برمی‌داشت. اندازه‌گیری‌شده: یک ردیف تغییر کرد.
--   * `payment_terms.days` نال‌پذیر بود، پس یک ترمِ *فعال* با `days` تهی قانونی بود و
--     `create_purchase` می‌پذیرفتش (فقط `id` و `is_active` را می‌خواند، نه `days`).
--   * کلید خارجی `ON DELETE SET NULL` بود. اندازه‌گیری‌شده روی دادهٔ واقعی داخل ROLLBACK: حذف ترم
--     «نقدی» ترم را از **۲۸۶ از ۳۰۳ خرید** می‌کَند، در یک جمله.
--
-- DATA IMPACT: هیچ. پیش از اجرا اندازه‌گیری شد —
--   purchases = 303، `payment_term_id IS NULL` = 0، FK یتیم = 0
--   payment_terms = 5، `days IS NULL` = 0
-- پس هیچ ردیف موجودی نه بازنویسی می‌شود و نه حذف. هر چهار جملهٔ زیر روی همین داده داخل
-- BEGIN…ROLLBACK تمرین و تأیید شده‌اند.
--
-- purchase_requests — عمداً دست‌نخورده. یک «درخواست خرید» خرید نیست: ترم وقتی تعیین می‌شود که
-- درخواست به خرید تبدیل شود، نه وقتی کسی کالایی می‌خواهد. آن جدول اصلاً ستون `payment_term_id`
-- ندارد (۱۶ ستون، اندازه‌گیری‌شده) و هیچ constraint ای این‌جا به آن اضافه نمی‌شود.
-- **این تصمیم مالک است؛ لطفاً بعداً «اصلاحش» نکنید.**

SET client_encoding='UTF8';

-- ۱) هیچ خریدی بدون ترم — نه در ساخت، نه در ویرایش.
ALTER TABLE public.purchases
  ALTER COLUMN payment_term_id SET NOT NULL;

COMMENT ON COLUMN public.purchases.payment_term_id IS
  'زمان تسویهٔ خرید. اجباری (۴۲۳): سررسید پرداختنی از purchase_date + payment_terms.days ساخته می‌شود، و ترمِ تهی سررسید را بی‌صدا به تاریخ خرید تبدیل می‌کرد.';

-- ۲) هیچ ترمی بدون تعداد روز. `days = 0` («نقدی») معتبر است و دست‌نخورده می‌ماند.
ALTER TABLE public.payment_terms
  ALTER COLUMN days SET NOT NULL;

ALTER TABLE public.payment_terms
  DROP CONSTRAINT payment_terms_days_check;

ALTER TABLE public.payment_terms
  ADD CONSTRAINT payment_terms_days_check CHECK (days >= 0);

COMMENT ON COLUMN public.payment_terms.days IS
  'تعداد روز تا سررسید. اجباری و نامنفی (۴۲۳). صفر یعنی نقدی.';

-- ۳) ترمی که در خریدی استفاده شده، حذف‌شدنی نیست.
--
-- تصمیم مالک، ۲۰۲۶-۰۹-۰۴: حذف یک ترمِ درحال‌استفاده ترم را بی‌صدا از یک خرید واقعی می‌کَند و
-- سررسیدش را «نامشخص» می‌کند — دقیقاً همان خرابی‌ای که این مایگریشن برای بستنش نوشته شده. ترمی که
-- منسوخ شود **غیرفعال** می‌شود (`is_active = false`)، نه حذف. سمت فروش از قبل همین‌طور کار می‌کند
-- (`settlement_types`)؛ این‌جا هم قرینه‌اش می‌شود.
--
-- بی‌خطر بودن روی دادهٔ موجود: RESTRICT فقط حذف‌های آینده را می‌سنجد، نه ردیف‌های موجود، و صفر FK
-- یتیم وجود دارد — پس افزودنش نمی‌تواند شکست بخورد.
-- هیچ مسیر حذفی در رابط کاربری وجود ندارد (اندازه‌گیری‌شده: صفر `.delete()` روی payment_terms در
-- کل src/ و server/؛ صفحهٔ مدیریت فقط is_active را toggle می‌کند)، پس این تغییر خطای خامی به
-- کاربر نشان نمی‌دهد.
ALTER TABLE public.purchases
  DROP CONSTRAINT purchases_payment_term_id_fkey;

ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_payment_term_id_fkey
  FOREIGN KEY (payment_term_id) REFERENCES public.payment_terms(id) ON DELETE RESTRICT;
