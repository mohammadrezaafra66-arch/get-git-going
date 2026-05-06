# گیمیفیکیشن «طلای زمان» — فاز ۱

## ایده‌ی محوری
هر خرید را با مقایسه‌ی **«قیمت همان تأمین‌کننده با مهلت»** و **«قیمت همان تأمین‌کننده اگر همین الان نقد می‌دادیم»** می‌سنجیم. نوسان بازار خنثی می‌شود چون دو قیمت **هم‌زمان از یک تأمین‌کننده** مقایسه می‌شوند.

## تغییرات دیتابیس (یک migration)

**۱) ستون‌های جدید روی `purchases`:**
- `cash_price numeric` — قیمت نقدی همان تأمین‌کننده در همان لحظه
- `cash_price_currency` — ارز قیمت نقدی
- `paid_at timestamptz` — زمان تسویه‌ی واقعی
- `paid_by uuid` — حسابداری که پرداخت کرد

**۲) تنظیمات قابل ویرایش (در `shop_settings`):**
- `accountant_daily_interest_rate` (پیش‌فرض `0.001` = ۰.۱٪ روزانه)
- `purchase_score_enabled` (روشن/خاموش گیمیفیکیشن خرید)
- `purchase_score_grace_days` (پیش‌فرض ۲ روز)

سیاست RLS جدید: حسابدار اجازه‌ی ویرایش **فقط همین سه کلید** را دارد.

**۳) دو KPI rule جدید در `gamification_kpi_rules`:**
- `purchase_long_term_score` — مسئول خرید
- `payment_late_pay_score` — حسابدار

**۴) View کمکی `vw_purchase_float`** برای نمایش شاخص‌ها در داشبورد.

**۵) دو trigger خودکار:**

*مسئول خرید* (روی INSERT خرید):
```text
implied_daily = (purchase_price − cash_price) / cash_price / promised_days
score = (ref_rate − implied_daily) × promised_days × amount / 100000
```
- اگر `cash_price` خالی باشد ⇒ امتیاز ۰ (انگیزه‌ی پر کردن فیلد)
- اگر نقدی یا بدون مهلت باشد ⇒ امتیاز ۰
- اگر تأمین‌کننده مهلت داد بدون افزایش قیمت ⇒ امتیاز بالا
- اگر گرانی روزانه‌اش از نرخ مرجع بیشتر شد ⇒ امتیاز ۰

*حسابدار* (روی UPDATE اولین مقداردهی `paid_at`):
```text
actual_days = paid_at − purchase_date
- اگر actual > promised + grace ⇒ امتیاز منفی (دیرکرد)
- اگر actual ≤ promised × 0.5 ⇒ امتیاز ۰ (خیلی زود)
- وگرنه ⇒ (actual − promised×0.5) × amount × ref_rate / 100000
```

هر دو امتیاز در `employee_score_events` با `event_type` مربوطه ثبت می‌شوند تا با موتور achievements/missions موجود سازگار باشد.

## تغییرات frontend

**۱) `src/shared/components/PurchaseForm.tsx`**
- اضافه شدن فیلد اختیاری «قیمت نقدی همین تأمین‌کننده» (با badge کوچک «امتیازآور») در کنار قیمت خرید
- ارسال مقدار به ستون `cash_price` و `cash_price_currency`
- Tooltip توضیحی: «اگر این تأمین‌کننده همین الان قرار بود نقد بفروشد، قیمتش چه می‌شد؟ پر کردن این فیلد امتیاز شما را بالا می‌برد.»

**۲) صفحه‌ی جدید `src/routes/_app.admin.gamification-purchase-settings.tsx`**
- قابل دسترسی برای admin و accountant
- ویرایش سه تنظیم: نرخ بهره روزانه (با نمایش معادل سالانه)، فعال/خاموش، روزهای ارفاق
- preview ساده: «خرید نمونه با ۳۰ روز مهلت و قیمت نقدی X و قیمت با مهلت Y → امتیاز Z»
- آیتم منو در گروه `admin` با آیکن `Coins`

**۳) `src/components/layout/nav-items.ts`**
- افزودن لینک منو به صفحه‌ی تنظیمات بالا

## معیار پذیرش
- ثبت خرید با cash_price ⇒ رکورد در `employee_score_events` با امتیاز محاسبه‌شده
- ثبت خرید بدون cash_price ⇒ رکورد با امتیاز ۰ و reason=`missing_cash_price`
- به‌روزرسانی `paid_at` توسط حسابدار ⇒ رکورد امتیاز حسابدار
- حسابدار از صفحه‌ی تنظیمات می‌تواند نرخ روزانه را تغییر دهد و در خریدهای بعدی اعمال شود
- migration reversible (تمام DROP IF EXISTS / IF NOT EXISTS)

## فاز ۲ (در آینده، خارج از این کار)
- چک پسینی ماهانه: اگر مارجین فروش محصولات یک خریدار افت کرد، ضریب امتیاز ماه بعد کم شود
- صفحه‌ی پرداخت رسید که `paid_at`/`paid_by` را روی خرید ست کند
- داشبورد «طلای زمان این ماه» برای نمایش رنکینگ
