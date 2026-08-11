# پرامپت تأیید و تست — افراکالا (آیتم‌های ۱۴۰ تا ۱۹۳)

> **این سند یک مأموریت تأیید (verification) است، نه اجرا.**
> هدف: بررسی اینکه هر چیزی که در `docs/execution/AfraKala-execution-plan-140-193.md` قرار بود ساخته شود، **واقعاً و درست** ساخته شده یا نه.
> این مأموریت **فقط‌خواندنی** است: هیچ کد، migration، یا نوشتنی روی دیتابیس.
>
> **نحوهٔ استفاده:**
> ```powershell
> cd D:\AfraKalaTest\app
> claude
> ```
> ```
> Read docs/execution/AfraKala-verification-prompt-140-193.md completely and execute it. Verify only — write no application code, no migrations, no DB writes. Produce the report at docs/verification/VERIFY-REPORT.md.
> ```

---

## بخش ۰ — قواعد تأیید (RULES)

این قواعد بر هر چیز دیگری اولویت دارند.

### ۰.۱ ممنوعیت‌های مطلق
- **هیچ کد اپلیکیشنی، migration، یا fix ننویس** — حتی اگر باگ واضحی دیدی. فقط ثبتش کن.
- **هیچ نوشتنی روی دیتابیس نکن.** فقط `SELECT`, `\d`, `pg_get_functiondef`, `information_schema`. هیچ `INSERT/UPDATE/DELETE/CREATE/ALTER/DROP`.
- **branch را عوض نکن، چیزی commit/push نکن.**
- تنها فایلی که مجاز به نوشتنش هستی: `docs/verification/VERIFY-REPORT.md` و فایل‌های کمکی داخل همان پوشه.

### ۰.۲ محیط
- تأیید کن روی برنچ درست هستی:
  ```powershell
  cd D:\AfraKalaTest\app
  git branch --show-current      # انتظار: feature/navigation-modernization
  git log --oneline -12
  git status --short
  ```
- دیتابیس زنده = `afrakala`. الگوی اتصال:
  ```powershell
  $pw = (docker exec afrakala-lan-db printenv POSTGRES_PASSWORD).Trim()
  @"
  <SQL>
  "@ | docker exec -i -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala -A -F '|'
  ```

### ۰.۳ استاندارد شواهد (مهم — ضدخوش‌بینی)
برای هر مورد، **ادعای بدون شاهد ممنوع**. این چهار قانون را اعمال کن (از اشتباهات واقعی همین پروژه):

1. **کامپوننت/تابعِ بدون فراخوان زنده = وجود ندارد.** اگر فایلی ساخته شده ولی هیچ‌جا import/mount/صدا زده نمی‌شود، وضعیتش «ناقص» است نه «کامل». برای هر UI جدید با `rg` تأیید کن که واقعاً رندر/استفاده می‌شود.
2. **جدول/تابعِ ساخته‌شده ولی بی‌اتصال = ناقص.** اگر جدولی هست ولی هیچ تریگر/کدی آن را پر نمی‌کند، ثبت کن.
3. **ادعای PROGRESS.md را مستقل تأیید کن.** اگر `PROGRESS.md` می‌گوید فاز X «DONE» است، خودت با شاهد چک کن؛ به ادعا اعتماد نکن.
4. **برای هر «موجود است»، مسیر فایل + خط یا نام تابع + خروجی SQL بده.** برای هر «موجود نیست»، بنویس چه چیزی جستجو کردی.

### ۰.۴ برچسب وضعیت هر مورد
برای هر آیتم دقیقاً یکی:
- **`✅ ساخته‌شده و متصل`** — کد + داده/اتصال + دسترسی، همه درست.
- **`⚠️ ساخته‌شده ولی ناقص`** — هست ولی یک حلقه شکسته (UI بدون بک‌اند، جدول بی‌اتصال، mount نشده، seed نشده).
- **`❌ ساخته نشده`** — اثری نیست. با ذکر روش جستجو.
- **`❓ نامشخص`** — نتوانستی قطعی کنی؛ بنویس چه چیزی مانع شد.

### ۰.۵ اول این را بخوان
```powershell
type docs\execution\PROGRESS.md
```
جدول فازها و وضعیت ادعاشده را در گزارش بیاور، و کنار هر فاز، نتیجهٔ تأیید مستقل خودت را بگذار.

---

## بخش ۱ — چک‌لیست تأیید فاز‌به‌فاز

برای هر فاز: کوئری/گرپ مشخص را اجرا کن، نتیجه را ثبت کن، برچسب بده.

---

### تأیید فاز ۱ — رفع‌های داده و پیکربندی

**۱.۱ — نام نقش خرید (باید رفع شده باشد):**
```sql
SELECT count(*) AS purchasing_expert_rows FROM public.role_permissions WHERE role_name='purchasing_expert';
SELECT DISTINCT role_name FROM public.role_permissions ORDER BY 1;
```
- انتظار: `purchasing_expert_rows = 0` و `purchase_specialist` در فهرست باشد.

**۱.۲ — KPIهای سود (باید فعال با وزن>۰):**
```sql
SELECT event_key, enabled, weight FROM public.gamification_kpis
  WHERE event_key IN ('total_profit','profit_per_talk_minute');
```
- انتظار: هر دو `enabled = t` با `weight > 0`.

**۱.۳ — بوست نامزدی (باید غیرصفر):**
```sql
SELECT boost_per_nomination, boost_cap_per_product FROM public.promotion_nomination_policy
  WHERE user_id IS NULL AND role IS NULL;
```
- انتظار: هر دو `> 0`.

**۱.۴ — ثبت صفحهٔ KPI در منو + هم‌ترازی دسترسی:**
```powershell
rg -n "gamification/settings" src/lib/navigation/registry.ts
rg -n "isAdminOrManager|adminOnly" src/routes/_app.gamification.tsx
```
- انتظار: ورودی `/gamification/settings` در registry با `adminOnly`؛ لینک هاب فقط برای admin.

**۱.۵ — صفحهٔ امتیازدهی کارشناس برای حسابدار:**
```powershell
Get-ChildItem src/routes -Filter "*salesperson-scoring*" -Recurse
rg -n "salesperson-scoring|DynamicScoringSection" src/routes | rg -i "accounting|salesperson"
rg -n "requireAnyRole|requireAdmin" src/routes/_app.users.$userId.tsx
```
- انتظار: یا route جدید `_app.accounting.salesperson-scoring.tsx` با گارد `admin/accountant` (راه الف)، یا گارد `/users/$userId` باز شده (راه ب). یکی باید باشد و در registry ثبت شده باشد.

**۱.۶ — رفع کوئری خراب گزارش مالی:**
```powershell
rg -n "total_receivables|overdue_receivables|due_today_receivables|future_receivables" src/routes/_app.reports.tsx
rg -n "get_receivables_summary" src/routes/_app.reports.tsx
```
- انتظار: دیگر ستون‌های ناموجود از `vw_customer_receivables` خوانده نشوند؛ به‌جایش `get_receivables_summary` استفاده شود.

**۱.۷ — 🔴 تست زندهٔ زنجیرهٔ سرمایه (مهم‌ترین تست فاز ۱):**
```sql
-- آیا امتیاز کارشناس وارد شده؟
SELECT count(*) AS salesperson_scores FROM public.dynamic_entity_scores WHERE entity_type='salesperson';
-- آیا تخصیص کارشناس غیرصفر تولید شده؟
SELECT count(*) FILTER (WHERE allocated_capital>0) AS sp_alloc_nonzero,
       count(*) AS sp_alloc_total
  FROM public.salesperson_capital_allocations_dynamic;
-- آیا تخصیص مشتری ردیف‌دار شده؟
SELECT count(*) AS customer_alloc_rows FROM public.customer_capital_allocations_dynamic;
```
- **تفسیر مهم:** فاز ۱ فقط «دسترسی و پیکربندی» را باز می‌کند؛ خودِ داده باید توسط **حسابدار به‌صورت دستی** وارد شود. پس:
  - اگر `salesperson_scores = 0` ⟹ هنوز کسی امتیاز وارد نکرده. این **نقص کد نیست**، بلکه یعنی گام عملیاتی (ورود داده) انجام نشده. در گزارش بنویس: «زیرساخت آماده است ولی داده وارد نشده؛ تا امتیاز کارشناس ثبت نشود، سقف اعتبار صفر می‌ماند.»
  - اگر `salesperson_scores > 0` ولی `sp_alloc_nonzero = 0` ⟹ یک اجرای مجدد تخصیص لازم است یا مشکل واقعی هست؛ دقیق بررسی کن.
- **این تمایز را در گزارش پررنگ کن** چون کاربر ممکن است انتظار داشته باشد سقف اعتبار خودکار پر شود، در حالی که نیازمند ورود دستی امتیاز است.

---

### تأیید فاز ۲ — واحد پول تومان

**۲.۱ — سه فایل بحرانی نباید «ریال» در نمایش پول داشته باشند:**
```powershell
rg -n "ریال" src/shared/components/InvoiceForm.tsx
rg -n "ریال" src/routes/_app.accounting.dynamic-capital.tsx
rg -n "ریال" src/routes/_app.operations.receipts.tsx
```
- انتظار: خالی، یا فقط در کامنت بی‌ربط. هر «ریال» باقی‌مانده در context نمایش = نقص.

**۲.۲ — پیش‌فرض formatCurrency:**
```powershell
rg -n "function formatCurrency|currency = " src/lib/i18n/formatters.ts
```
- انتظار: پیش‌فرض `"تومان"` نه `"ریال"`.

**۲.۳ — شاخهٔ OCR ریال→تومان:**
```powershell
rg -n "n / 10|n/10|Math.round" src/lib/accounting/receipt-extraction.ts
```
- انتظار: شاخهٔ اصلی «مبلغ ... ریال» هم مثل fallback تقسیم بر ۱۰ کند.

---

### تأیید فاز ۳ — گزارش‌های سررسیدی aging

**۳.۱ — ستون سطل سنی روی ویوها:**
```sql
SELECT table_name, column_name FROM information_schema.columns
  WHERE table_name IN ('vw_customer_receivables','vw_supplier_payables') AND column_name='aging_bucket'
  ORDER BY 1;
```
- انتظار: هر دو ویو ستون `aging_bucket` داشته باشند.

**۳.۲ — توابع summary سطل برمی‌گردانند:**
```sql
SELECT pg_get_functiondef('public.get_receivables_summary'::regproc) LIKE '%aging_bucket%' AS recv_has_buckets;
SELECT pg_get_functiondef('public.get_payables_summary'::regproc) LIKE '%aging_bucket%' AS pay_has_buckets;
```
- انتظار: هر دو `t`.

**۳.۳ — UI کارت‌های سطل سنی:**
```powershell
rg -n "aging_bucket|سطل|۹۰\+|d90_plus|d31_60" src/routes/_app.accounting.receivables.tsx src/routes/_app.accounting.payables.tsx
```
- انتظار: کارت/ستون سطل سنی در هر دو صفحه.

---

### تأیید فاز ۴ — کپی گروهی + آموزش

**۴.۱ — زیرساخت انتخاب چندتایی و کپی گروهی:**
```powershell
rg -n "selectedProductIds|Set<string>|handleBulkCopySalesText|انتخاب همه" src/routes/_app.sales.search.tsx
```
- انتظار: state انتخاب چندتایی + تابع کپی گروهی. (و تابع تک‌محصولی `handleCopySalesText` هنوز دست‌نخورده باشد.)

**۴.۲ — دیالوگ انتخاب حالت قیمت:**
```powershell
rg -n "حالت قیمت|settlement|Dialog|Checkbox" src/routes/_app.sales.search.tsx | rg -i "settlement|قیمت"
```
- انتظار: دیالوگ انتخاب حالت‌های قیمت هنگام اولین انتخاب.

**۴.۳ — صفحهٔ آموزش متریک دستی:**
```powershell
Get-ChildItem src/routes -Filter "*manual-metrics*guide*" -Recurse
rg -n "راهنما|guide" src/routes/_app.gamification.admin.manual-metrics.tsx
```
- انتظار: route راهنما + دکمهٔ لینک در صفحهٔ متریک.

---

### تأیید فاز ۵ — پل اشخاص + ایمپورت

**۵.۱ — UI پل customer↔person (باید واقعاً فراخوانده شود):**
```powershell
rg -n "linkCustomerToPerson|unlinkCustomerFromPerson|PersonPicker|person_id" src/routes/_app.sales_.customers_.$customerId.edit.tsx
rg -n "linkCustomerToPerson|unlinkCustomerFromPerson" src --type tsx
```
- انتظار: فرم ویرایش مشتری واقعاً `linkCustomerToPerson` را صدا بزند (نه فقط تعریف در lib). **قانون ۱ را اعمال کن:** اگر فقط در `functions.ts` هست و هیچ `.tsx` صدایش نمی‌زند ⟹ `⚠️ ناقص`.

**۵.۲ — ایمپورت اشخاص:**
```powershell
Get-ChildItem src/routes -Filter "*persons*import*" -Recurse
rg -n "persons_imported|sheet_to_json" src/routes/_app.persons_.import.tsx
```
- انتظار: route ایمپورت اشخاص با SheetJS + درج در `persons`.

---

### تأیید فاز ۶ — یکی‌سازی پیش‌فاکتور + فیش بدون لینک

**۶.۱ — دادهٔ invoices دست‌نخورده (نباید تخریب شده باشد):**
```sql
SELECT count(*) AS invoices_rows FROM public.invoices;
```
- انتظار: همان مقدار قبلی (طبق تحقیق ۰). اگر ناگهان داده اضافه/کم شده، پرچم قرمز.

**۶.۲ — کارت فاکتور موازی حذف شده:**
```powershell
rg -n "فاکتورهای فروش|invoices/create|invoices\b" src/routes/_app.sales.tsx
```
- انتظار: کارت «فاکتورهای فروش» (مقصد `invoices`) از صفحهٔ `/sales` حذف شده باشد؛ فقط «پیش‌فاکتورها» بماند. **جدول `invoices` نباید drop شده باشد** (فقط UI).

**۶.۳ — فیش بدون لینک به پیش‌فاکتور:**
```powershell
rg -n "positive_credit|حداقل یک پیش‌فاکتور|بدون پیش‌فاکتور|اعتبار مثبت" src/shared/components/PaymentReceiptForm.tsx
```
- انتظار: ثبت `positive_credit` بدون اجبار انتخاب پیش‌فاکتور ممکن باشد، با راهنمای فارسی.
- تأیید اتصال به اعتبار مشتری:
  ```sql
  SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'customer_credit%';
  ```

**۶.۴ — ثبت پیش‌فاکتور ردشده با دلیل:**
```powershell
rg -n "sales_quote_rejected|sales_quote_rejections|درخواست‌های رد شده|رد شد" src --type tsx
```
- انتظار: مکانیزمی برای ثبت رد + نمایش در صفحهٔ کاربر (جدول جدید یا `audit_logs`).

---

### تأیید فاز ۷ — مارکتینگ

**۷.۱ — سقف رندوم کانال (هر کانال ≤ سقف):**
```sql
-- تعداد پیشنهاد هر کانال نباید از daily_quota آن بیشتر باشد
SELECT s.channel_id, mc.daily_quota, count(*) AS returned
  FROM public.compute_promotion_scores(NULL, 0, 500) s
  JOIN public.marketing_channels mc ON mc.id = s.channel_id
  WHERE mc.daily_quota IS NOT NULL AND mc.daily_quota > 0
  GROUP BY s.channel_id, mc.daily_quota;
-- برای هر ردیف باید returned <= daily_quota باشد
-- تأیید رندوم بودن در تعریف تابع/ویو:
SELECT pg_get_functiondef('public.compute_promotion_scores'::regproc) LIKE '%md5%' AS uses_random_ordering;
```
- انتظار: `returned ≤ daily_quota` برای هر کانال؛ و نشانهٔ رندوم پایدار (`md5`/`ROW_NUMBER OVER PARTITION`) در تابع.
- **تست پایداری روزانه (گزارش‌شده):** تابع را دو بار در یک روز صدا بزن؛ مجموعهٔ محصولات هر کانال باید یکسان باشد.

**۷.۲ — اتصال تبلیغ به گیمیفیکیشن:**
```sql
SELECT event_key FROM public.gamification_kpi_rules WHERE event_key ILIKE '%promot%';
-- آیا تریگر/رویداد امتیاز ساخته شده؟
SELECT tgname FROM pg_trigger WHERE tgrelid='public.promotion_nominations'::regclass AND NOT tgisinternal;
SELECT count(*) FROM public.employee_score_events WHERE event_type ILIKE '%promot%';
```
- انتظار: `event_key` تبلیغ در قوانین KPI؛ و مسیری (تریگر یا server function) که امتیاز مارکتینگ می‌سازد.

**۷.۳ — وزن مستقل محصول در پیشنهاد:**
```sql
SELECT pg_get_viewdef('public.v_promotion_suggestions') ILIKE '%recommendation_override%'
    OR pg_get_viewdef('public.v_promotion_suggestions') ILIKE '%product_weight%' AS view_uses_product_weight;
```
- انتظار: `t` (فرمول ویو حالا وزن مستقل محصول را در نظر می‌گیرد).

---

### تأیید فاز ۸ — چندانباره (بزرگ‌ترین — دقیق تست کن)

**۸.۱ — جداول ساخته شدند:**
```sql
SELECT table_name FROM information_schema.tables
  WHERE table_schema='public'
    AND table_name IN ('warehouses','warehouse_stock','stock_movements','stock_transfers','stock_transfer_items')
  ORDER BY 1;
```
- انتظار: هر ۵ جدول.

**۸.۲ — RLS و seed ماژول:**
```sql
SELECT DISTINCT module FROM public.role_permissions WHERE module='warehouse';
SELECT tablename, count(*) AS policies FROM pg_policies
  WHERE schemaname='public' AND tablename IN ('warehouses','warehouse_stock','stock_movements','stock_transfers','stock_transfer_items')
  GROUP BY tablename ORDER BY 1;
```
- انتظار: ماژول `warehouse` seed شده؛ هر جدول جدید RLS دارد.

**۸.۳ — تریگر افزایش موجودی هنگام خرید:**
```sql
SELECT tgname FROM pg_trigger WHERE tgrelid IN ('public.purchases'::regclass,'public.purchase_items'::regclass) AND NOT tgisinternal;
-- تابعی که warehouse_stock را افزایش می‌دهد
SELECT proname FROM pg_proc WHERE prosrc ILIKE '%warehouse_stock%' AND prosrc ILIKE '%purchase%';
```
- انتظار: تریگر/تابعی که موجودی را با خرید زیاد می‌کند و کاردکس `in` می‌سازد.
- تأیید فیلد انبار روی خرید:
  ```sql
  SELECT column_name FROM information_schema.columns WHERE table_name='purchases' AND column_name='warehouse_id';
  ```

**۸.۴ — تابع کسر + چک موجودی هنگام قطعی:**
```sql
SELECT proname FROM pg_proc WHERE (prosrc ILIKE '%warehouse_stock%' AND prosrc ILIKE '%sales_quote%')
    OR proname ILIKE '%confirm%quote%' OR proname ILIKE '%finalize%';
```
- انتظار: تابعی که هنگام قطعی‌کردن، موجودی کسر می‌کند و اگر ناکافی بود **جلوگیری** می‌کند.
- فیلد انبار روی پیش‌فاکتور:
  ```sql
  SELECT column_name FROM information_schema.columns WHERE table_name IN ('sales_quotes','sales_quote_items') AND column_name ILIKE '%warehouse%';
  ```

**۸.۵ — تابع انتقال بین‌انباری:**
```sql
SELECT proname FROM pg_proc WHERE proname ILIKE '%transfer%' AND prosrc ILIKE '%warehouse_stock%';
```
- انتظار: تابعی که هنگام confirm انتقال، مبدأ را کم و مقصد را زیاد می‌کند + دو کاردکس.

**۸.۶ — همگام‌سازی stock_status:**
```sql
SELECT proname FROM pg_proc WHERE prosrc ILIKE '%stock_status%' AND prosrc ILIKE '%warehouse_stock%';
```
- انتظار: تریگری که `stock_status` متنی را با موجودی عددی هماهنگ می‌کند.

**۸.۷ — UI انبار:**
```powershell
Get-ChildItem src/routes -Filter "*warehouse*" -Recurse
rg -n "warehouses|انبار" src/lib/navigation/registry.ts
```
- انتظار: route مدیریت انبار (`_app.warehouses.tsx`)، ثبت در منو، و صفحهٔ انتقال + گزارش کاردکس. **قانون ۱:** هر کدام باید واقعاً route فعال باشند.

**۸.۸ — گزارش کاردکس با تاریخ شمسی:**
```powershell
rg -n "stock_movements|کاردکس|moment-jalaali|JalaliDateInput" src/routes | rg -i "warehouse|stock|کاردکس"
```
- انتظار: گزارش حرکت کالا با فیلتر انبار و بازهٔ تاریخ شمسی.

**۸.۹ — 🔴 تست جریان کامل انبار (گزارش‌شده، فقط خواندن نتیجه):**
اگر داده‌ای برای تست وجود دارد، این‌ها را از دیتابیس تأیید کن (بدون ساختن داده):
```sql
-- آیا هیچ حرکت کالایی ثبت شده؟
SELECT movement_type, count(*) FROM public.stock_movements GROUP BY 1 ORDER BY 1;
-- آیا موجودی عددی برای محصولی ثبت شده؟
SELECT count(*) AS stock_rows, count(DISTINCT warehouse_id) AS warehouses_used FROM public.warehouse_stock;
```
- اگر خالی بود، بنویس «زیرساخت ساخته شده ولی هنوز جریان واقعی (خرید→قطعی→انتقال) تست نشده؛ نیازمند تست دستی کاربر در مرورگر».

---

### تأیید فاز ۹ — خزانه

**۹.۱ — جدول سند پرداخت خروجی + account_type:**
```sql
SELECT table_name FROM information_schema.tables WHERE table_name='payment_vouchers';
SELECT column_name, data_type FROM information_schema.columns WHERE table_name='payment_vouchers' ORDER BY ordinal_position;
SELECT column_name FROM information_schema.columns WHERE table_name='bank_accounts' AND column_name='account_type';
```
- انتظار: جدول `payment_vouchers` با فیلدهای جهت‌خروج + ستون `account_type` روی `bank_accounts`.

**۹.۲ — کانال چک:**
```sql
-- چک در CHECK constraint کانال پرداخت هست؟
SELECT pg_get_constraintdef(oid) FROM pg_constraint
  WHERE conname ILIKE '%document_channel%' AND conrelid IN ('public.payment_vouchers'::regclass, 'public.payment_receipts'::regclass);
```
- انتظار: مقدار `cheque` در فهرست مجاز کانال، در هر دو سمت دریافت و پرداخت.

**۹.۳ — تابع/ویو ماندهٔ حساب:**
```sql
SELECT proname FROM pg_proc WHERE proname ILIKE '%account_balance%' OR proname='get_account_balance';
SELECT table_name FROM information_schema.views WHERE table_name ILIKE '%balance%';
```
- انتظار: تابع/ویو محاسبهٔ مانده (opening + دریافت‌ها − پرداخت‌ها).

**۹.۴ — اتصال پرداخت خرید به voucher:**
```powershell
rg -n "payment_vouchers|payment_voucher" src/routes/_app.accounting.purchase-payments.tsx src/lib
```
- انتظار: هنگام پرداخت خرید، امکان/ساخت `payment_voucher`.

**۹.۵ — UI مانده + گزارش ورود/خروج صندوق:**
```powershell
Get-ChildItem src/routes -Filter "*treasury*","*cash*","*voucher*","*payment-voucher*" -Recurse
rg -n "مانده صندوق|payment_vouchers|صندوق|account_balance" src/routes | rg -i "accounting|treasury|صندوق"
```
- انتظار: صفحهٔ نمایش مانده + گزارش دوطرفهٔ ورود/خروج با تاریخ شمسی.

---

## بخش ۲ — بررسی موارد «خارج از دامنه» (باید تأیید شود که واقعاً ساخته نشده‌اند)

این موارد در پرامپت اجرایی **عمداً نبودند**. تأیید کن که وضعیتشان همان «ساخته‌نشده» است، تا کاربر بداند این‌ها هنوز کار دارند:

**۲.الف — ویزیتور و گزارش‌هایش (۱۸۵–۱۹۰):**
```sql
-- آیا موجودیت/فیلد ویزیتور مستقل ساخته شده؟
SELECT table_name FROM information_schema.tables WHERE table_name ILIKE '%visitor%';
SELECT column_name, table_name FROM information_schema.columns WHERE column_name ILIKE '%visitor%';
```
```powershell
rg -n "visitor|ویزیتور" src --type tsx
```
- انتظار (طبق تصمیم): موجودیت مستقل ویزیتور ساخته **نشده** (قرار بود = `salesperson_id`). تأیید کن که:
  - گزارش‌های ویزیتورمحور (۱۸۶/۱۸۷/۱۹۰) وجود ندارند.
  - انتساب خودکار ویزیتور (۱۸۸) وجود ندارد (نیازمند pg_cron که نصب نیست — چک کن: `SELECT * FROM pg_extension WHERE extname='pg_cron';`).

**۲.ب — OCR تصویری / GPT vision (۱۴۴/۱۹۳):**
```sql
SELECT kind, is_active, capabilities, vision_model FROM public.ai_providers;
```
- انتظار: هنوز هیچ provider ای `vision` در `capabilities` ندارد ⟹ OCR تصویری غیرفعال. (زیرساخت آماده، پیکربندی نشده.)

**۲.ج — لیدربرد Realtime واقعی (۱۶۱):**
```powershell
rg -n "supabase.channel|postgres_changes|\.subscribe\(|refetchInterval" src/hooks/gamification/useGamification.ts
```
- انتظار: هنوز `refetchInterval` (polling) است، نه Realtime واقعی.

**۲.د — یکپارچه‌سازی کامل اشخاص (۱۶۹/۱۷۲):**
```sql
-- آیا suppliers/external_parties به persons گره خورده‌اند؟
SELECT column_name, table_name FROM information_schema.columns
  WHERE table_name IN ('suppliers','external_parties') AND column_name='person_id';
```
- انتظار: `suppliers`/`external_parties` هنوز `person_id` ندارند ⟹ یکپارچگی کامل انجام نشده (فقط پل customer↔person در فاز ۵).

---

## بخش ۳ — سلامت کلی

```powershell
# چیزی خراب/تخریب نشده باشد
git status --short
git log --oneline -15

# migrationهای ساخته‌شده در این چند روز
Get-ChildItem supabase/migrations -Filter "202607*" | Sort-Object Name | Select-Object -Last 25
```
```sql
-- شمارش رکورد جداول مهم که نباید تخریب شوند
SELECT
  (SELECT count(*) FROM public.customers)        AS customers,
  (SELECT count(*) FROM public.products)          AS products,
  (SELECT count(*) FROM public.sales_quotes)      AS quotes,
  (SELECT count(*) FROM public.suppliers)         AS suppliers,
  (SELECT count(*) FROM public.purchases)         AS purchases;
```
- تأیید کن هیچ داده‌ای به‌طور ناخواسته حذف نشده.

---

## بخش ۴ — قالب گزارش خروجی

فایل `docs/verification/VERIFY-REPORT.md` را با این ساختار بساز:

### ۴.۱ — جدول اصلی تأیید (per فاز و per آیتم)

| فاز | آیتم | چه چیزی چک شد | وضعیت | شاهد (فایل:خط / تابع / خروجی SQL) |
|---|---|---|---|---|
| ۱ | ۱۵۷ | KPI سود فعال | ✅/⚠️/❌ | ... |
| ... | ... | ... | ... | ... |

هر آیتم از فازهای ۱ تا ۹ + بخش «خارج از دامنه» یک ردیف داشته باشد.

### ۴.۲ — جدول مقایسه‌ای ۵۴ آیتم (قبل → الان)
از `docs/research/00-SUMMARY.md` وضعیت «قبل» را بردار و کنار وضعیت «الان» بگذار، تا مشخص شود هر آیتم واقعاً جلو رفته یا نه.

### ۴.۳ — یافته‌های بحرانی
- هر جا PROGRESS.md ادعای DONE کرده ولی شاهد آن را رد می‌کند.
- هر جا کد ساخته شده ولی mount/اتصال ندارد (قانون ۱).
- هر ریسک تخریب داده.

### ۴.۴ — کارهای باقی‌مانده
سه دسته جدا:
1. **نقص اجرا:** چیزی که در پرامپت بود ولی ناقص/غلط ساخته شده (نیازمند رفع).
2. **گام عملیاتی:** چیزی که کدش آماده است ولی داده وارد نشده (مثل امتیاز کارشناس برای زنجیرهٔ سرمایه).
3. **خارج از دامنه:** چیزی که اصلاً در پرامپت نبود (ویزیتور، OCR تصویری، Realtime، یکپارچگی کامل اشخاص).

### ۴.۵ — تأیید سلامت
خروجی `git status --short` و شمارش جداول؛ تأیید عدم تخریب.

---

## بخش ۵ — یادآوری پایانی
- **فقط خواندن.** هیچ کد/migration/نوشتن DB.
- **هر ادعا با شاهد.** بدون شاهد ننویس.
- **قانون ۱ را همه‌جا اعمال کن:** «ساخته‌شده» یعنی واقعاً mount/متصل/قابل‌فراخوان، نه صرفِ وجود فایل.
- تمایز «نقص کد» از «گام عملیاتی نشده» (مثل ورود امتیاز کارشناس) را روشن نگه‌دار.
- گزارش: فارسی، مستقیم، جدول‌محور، با شواهد.