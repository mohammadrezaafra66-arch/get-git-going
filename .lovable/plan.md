## بازطراحی «قوانین هزینه حمل» — اعمال مستقیم روی محصول

### آنچه تغییر می‌کند (نمای کاربر)

فرم «قانون حمل جدید/ویرایش» ساده‌تر و دقیق‌تر می‌شود:

1. **ویرایش کامل** — دکمه ویرایش از قبل در جدول هست؛ مطمئن می‌شویم همه مقادیر (از جمله نوع ارز جدید) به‌درستی pre-fill شوند.
2. **حذف فیلدهای غیرضروری از فرم**: «دسته‌بندی»، «برند»، «نوع کالا»، «ترتیب نمایش» از UI فرم برداشته می‌شوند. (ستون‌های دیتابیس می‌مانند تا داده قبلی از بین نرود؛ مقدار `sort_order` به‌صورت خودکار `0` ست می‌شود.)
3. **نوع محاسبه**: سه گزینه
   - ثابت (تومان) — بدون تغییر
   - درصدی — بدون تغییر
   - **ارزی (جدید)** — کاربر مبلغ + نوع ارز (دلار/درهم/...) را وارد می‌کند. هنگام محاسبه قیمت، آخرین نرخ فعال آن ارز از `currency_rates` ضرب می‌شود.
4. **انتخاب محصول الزامی و برجسته** — جستجوی محصول بالای فرم قرار می‌گیرد و انتخاب آن اجباری می‌شود؛ هر قانون به‌صورت مستقیم به یک محصول مشخص بسته می‌شود.
5. **عنوان قانون** اختیاری می‌شود (در صورت خالی بودن، خودکار از نام محصول ساخته می‌شود).

### تغییرات دیتابیس (migration جدید)

- افزودن مقدار `'currency'` به enum `public.shipping_cost_type`.
- افزودن ستون‌های جدید به `public.shipping_cost_rules`:
  - `cost_currency text NULL` با FK نرم به `currencies(code)` (یا CHECK سازگار با مقادیر `usd/aed/...`).
  - فقط زمانی پر می‌شود که `cost_type = 'currency'`.
- Validation Trigger (نه CHECK زمان‌محور): اگر `cost_type='currency'` بود، `cost_currency` نباید NULL باشد.
- ایندکس: `CREATE INDEX IF NOT EXISTS idx_shipping_rules_product_active ON shipping_cost_rules(product_id) WHERE is_active = true AND product_id IS NOT NULL;`
- RLS موجود دست‌نخورده می‌ماند (admin/accountant write، بقیه read).
- Audit log موجود کافی است؛ تغییر نمی‌کند.
- migration کاملاً idempotent و reversible (down notes داخل کامنت).

### تغییرات کد

**Schema (`src/lib/pricing/schemas.ts`)**
- `cost_type` به `z.enum(["fixed","percent","currency"])` گسترش.
- فیلد جدید `cost_currency: z.string().nullable().optional()`.
- refine: اگر `cost_type==='currency'` → `cost_currency` الزامی.
- refine: `product_id` الزامی (به‌جای حداقل یکی از چهار اسکوپ).
- `title` به `optional` تبدیل می‌شود؛ در submit اگر خالی بود از نام محصول پر می‌شود.

**Constants (`src/lib/pricing/constants.ts`)**
- افزودن `currency: "ارزی"` به `SHIPPING_COST_TYPE_LABELS`.

**Form (`src/shared/components/ShippingCostRuleForm.tsx`)**
- حذف بلوک‌های دسته/برند/نوع کالا/ترتیب نمایش از JSX.
- بالا بردن جستجوی محصول و قرار دادن آن به‌صورت required.
- افزودن Select «نوع ارز» که فقط وقتی `cost_type==='currency'` نمایش داده می‌شود؛ گزینه‌ها از `currencies` فعال (`fetchActiveCurrencies` یا یک query ساده روی جدول `currencies`).
- برچسب پویا برای فیلد مقدار: ثابت → «مبلغ (تومان)»، درصدی → «درصد (%)»، ارزی → «مبلغ (به ارز انتخابی)».
- `emptyShippingRule` به‌روزرسانی: `cost_currency: null`.

**List page (`src/routes/_app.pricing.shipping-rules.tsx`)**
- ستون «محدوده اعمال» به «محصول» تغییر؛ همیشه نام محصول نمایش داده می‌شود.
- ستون «ترتیب» حذف.
- نمایش مقدار: اگر `currency` بود → `{value} {CURRENCY_LABELS[cost_currency]}`.
- در `editing` map، `cost_currency` هم منتقل شود.

**Pricing engine (`src/lib/pricing/engine.ts`)**
- در بلوک shipping (خط ۱۴۹‑۱۸۰):
  - اضافه کردن `cost_currency` به `select`.
  - اگر `cost_type==='currency'`: گرفتن آخرین نرخ فعال آن ارز از `currency_rates` (همان الگویی که در محاسبه قیمت خرید ارزی استفاده می‌شود) و محاسبه `shipping_cost = round(value * rate)`.
  - اگر نرخ پیدا نشد → `PricingError("NO_SHIPPING_RATE", ...)`.
- در `steps` توضیح ارز و نرخ افزوده شود.

**Quick price (`src/lib/pricing/quick-price.ts`)** — همان منطق جدید برای پیش‌نمایش سریع.

### معیار پذیرش (طبق AFRAKALA_ACCEPTANCE_CRITERIA)

- migration در `supabase/migrations/` با timestamp جدید، idempotent، RLS حفظ‌شده.
- بدون CDN/فونت خارجی، بدون secret در client.
- `currency_rates` query با `limit(1)` و ایندکس فعلی پاسخ می‌دهد.
- UI فارسی، RTL، responsive (همان grid فعلی).
- audit trigger موجود به‌صورت خودکار تغییرات جدید را لاگ می‌کند.
- قابلیت ویرایش روی هر ردیف موجود و جدید.

### نکته سازگاری با داده قدیمی

ردیف‌های قدیمی که فقط `category_id` یا `brand_id` یا `product_type` دارند **بدون تغییر** باقی می‌مانند و engine همچنان آن‌ها را به‌عنوان fallback تطبیق می‌دهد (منطق specificity فعلی حفظ می‌شود). فقط فرم جدید فقط بر اساس محصول قانون می‌سازد.

اگر بخواهید قوانین قدیمی (غیر مرتبط با محصول مشخص) به‌صورت ماسبق پاک یا migrate شوند، در پیام بعدی اعلام کنید — به‌صورت پیش‌فرض حفظ می‌شوند.