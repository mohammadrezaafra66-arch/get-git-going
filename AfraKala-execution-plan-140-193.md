# پرامپت اجرایی کامل — افراکالا (آیتم‌های ۱۴۰ تا ۱۹۳)

> **این سند یک مأموریت اجراست.** بر پایهٔ گزارش تحقیق `docs/research/*.md` نوshته شده و همهٔ تصمیم‌های محصولی در آن قطعی شده‌اند.
>
> **نحوهٔ استفاده:**
> ```powershell
> cd D:\AfraKalaTest\app
> claude
> ```
> ```
> Read AfraKala-execution-plan-140-193.md completely and execute it phase by phase, autonomously, to the end.
> ```

---

## بخش ۰ — قواعد اجرا (RULES OF ENGAGEMENT)

این قواعد بر هر چیز دیگری اولویت دارند.

### ۰.۱ برنچ، محیط، و منبع حقیقت

- **برنچ کاری = `feature/navigation-modernization`** (HEAD فعلی، همان که سرور از آن build می‌شود، `APP_GIT_SHA=a9315e78`). قبل از هر کاری تأیید کن:
  ```powershell
  cd D:\AfraKalaTest\app
  git branch --show-current   # باید feature/navigation-modernization باشد
  git status --short
  ```
  اگر برنچ دیگری بود، **متوقف شو و گزارش بده** — کار را روی برنچ اشتباه شروع نکن.
- **دیتابیس زنده = `afrakala`** (نه `postgres`، نه `afrakala_test`). در هر اتصال `-d afrakala` صریح باشد.
- الگوی اتصال DB (بدون مشکل quoting در PowerShell):
  ```powershell
  $pw = (docker exec afrakala-lan-db printenv POSTGRES_PASSWORD).Trim()
  @"
  <SQL here>
  "@ | docker exec -i -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala -v ON_ERROR_STOP=1
  ```
  هرگز از `psql -c` با SQL چندخطی/nested-quote استفاده نکن.
- `schema_full_export.sql` **قدیمی است**؛ مرجع، همیشه DB زنده و کد working tree است.

### ۰.۲ روش کار: فاز‌به‌فاز، اتمیک، خودگزارش‌ده

- فازها را **به ترتیب شماره** اجرا کن (Phase 1 → Phase 9). فازهای بعدی به قبلی وابسته‌اند.
- **هر فاز = یک واحد کامل**: کد/migration بنویس → build → تست خودکار → گزارش → ثبت پیشرفت → فاز بعد.
- **بعد از هر فاز، بدون توقف به فاز بعد برو** — مگر یکی از این دو:
  1. تست خودکار فاز شکست بخورد و بعد از یک تلاش رفع، باز هم شکست بخورد.
  2. عملیاتی لازم شود که **ریسک تخریب دادهٔ موجود** دارد (drop ستون/جدول دارای داده، تغییر نوع ستونِ پرِ داده، حذف رکورد).
  در این دو حالت: **متوقف شو، دقیق گزارش بده، منتظر تأیید بمان.**
- **در سؤالات محصولی متوقف نشو** — همه در بخش ۱ قطعی شده‌اند.

### ۰.۳ ثبت پیشرفت (CHECKPOINT — حیاتی)

این حجم در یک نشست جا نمی‌شود. برای بازیابی بعد از پایان context:

- یک فایل `docs/execution/PROGRESS.md` بساز و **بعد از پایان هر فاز** به‌روزش کن با: شمارهٔ فاز، وضعیت (DONE/IN-PROGRESS/BLOCKED)، شمارهٔ migration ساخته‌شده، commit SHA، و خلاصهٔ یک‌خطی.
- ساختار ثابت هر ردیف:
  ```
  ## Phase N — <title>
  - status: DONE
  - migrations: 20260725xxxxxx_2xx_<name>.sql
  - commit: <sha>
  - summary: <one line>
  - tests: <pass/fail + what was checked>
  ```
- اگر نشست تازه‌ای شروع شد (`claude --continue`)، **اول `docs/execution/PROGRESS.md` را بخوان** و از اولین فاز `IN-PROGRESS`/بعدِ آخرین `DONE` ادامه بده.

### ۰.۴ استاندارد کیفیت هر فاز

- **build سبز:** بعد از هر تغییر کد فرانت، `npm run build` (یا `pnpm build` طبق `package.json`) باید بدون خطا رد شود. اگر پروژه type-check جدا دارد (`tsc --noEmit` یا `npm run typecheck`)، آن را هم اجرا کن.
- **eslint:** خطای جدید معرفی نکن.
- **migration اتمیک و idempotent:** هر migration را با `BEGIN; ... COMMIT;` و تا حد امکان `IF NOT EXISTS` / `CREATE OR REPLACE` بنویس. با `ON_ERROR_STOP=1` اجرا کن.
- **نام‌گذاری migration:** `20260725<HHMMSS>_2<NN>_<snake_name>.sql` با شماره‌های ترتیبی که از آخرین migration موجود ادامه یابد. **محتوای فایل را باز کن تا شماره تکراری نسازی** (glob با تاریخ گمراه‌کننده است).
- **RLS از روز اول:** هر جدول جدید باید RLS داشته باشد، هماهنگ با الگوی نقش‌های موجود.
- **دادهٔ موجود سالم بماند:** هیچ `DROP`/`TRUNCATE` روی جدول دارای داده بدون تأیید صریح.

### ۰.۵ الگوهای موجود که باید دنبال شوند (کپی کن، از نو اختراع نکن)

از گزارش تحقیق، این‌ها الگوهای تأییدشدهٔ پروژه‌اند:

- **تاریخ شمسی:** `moment-jalaali` (`src/lib/messenger/format.ts` نمونه) یا helper `src/lib/i18n/jalali.ts` (`isoToJalaliDisplay`)؛ ورودی تاریخ: `src/shared/components/JalaliDateInput.tsx` یا `src/components/common/PersianDatePicker.tsx`.
- **ایمپورت اکسل:** `src/shared/components/CustomerImportForm.tsx` (SheetJS، سه‌مرحله‌ای: فایل → نگاشت ستون → پیش‌نمایش → درج دسته‌ای).
- **انتخاب چندتایی:** `src/components/products/ProductLabelsQuickDialog.tsx` (`useState<Set<string>>`, toggle با delete/add).
- **راهنمای درون‌صفحه:** `src/components/customers/CustomerCreditGuide.tsx` + route `_app.sales_.customers_.credit-allocation-guide.tsx`.
- **گزارش مالی امن:** الگوی receivables/payables (RPC با `SECURITY DEFINER` + چک `has_any_role` + ویو پایه + `requireAnyRole` در route + ثبت در `src/lib/navigation/registry.ts`).
- **فرمت پول:** `src/lib/i18n/formatters.ts` (`formatCurrency`).
- **toast:** `sonner`. **آیکون:** `lucide-react`. **UI:** `shadcn/ui`. **نمودار:** `Recharts` با `ResponsiveContainer`.
- **ثبت منو:** هر route جدید که باید در ناوبری دیده شود، در `src/lib/navigation/registry.ts` ثبت شود.
- **گارد دسترسی:** `requirePermission(module, action)` یا `requireAnyRole([...])` در `beforeLoad`؛ برای ماژول‌های seed‌نشده از `requireAnyRole` مستقیم استفاده کن (چون `has_dynamic_permission` برایشان fallback می‌زند).

### ۰.۶ نکات امنیتی

- هیچ کلید/توکن/رمز را در گزارش یا کد چاپ نکن.
- **ناسازگاری نام نقش (رفعِ لازم در فاز ۱):** در `role_permissions` ردیف‌ها با `purchasing_expert` seed شده ولی enum مقدار `purchase_specialist` دارد → join هرگز match نمی‌کند. این را در فاز ۱ اصلاح کن.

---

## بخش ۱ — تصمیم‌های قطعی‌شده (مرجع، تغییر نده)

| # | موضوع | تصمیم نهایی |
|---|---|---|
| ۱ | پیش‌فاکتور موازی (۱۴۷) | کارت مردهٔ «فاکتورهای فروش» (`invoices`) حذف شود؛ همه‌چیز روی `sales_quotes` یکی شود. |
| ۲ | واحد پول (۱۹۱) | **تومان** در کل سیستم. سه نقطهٔ «ریال» اصلاح و پیش‌فرض `formatCurrency` تومان شود. |
| ۳ | ویزیتور (۱۸۵–۱۹۰) | ویزیتور = همان `salesperson_id` سازندهٔ پیش‌فاکتور (بدون موجودیت جدید). |
| ۴ | چندانباره (۱۷۶) | **مدل کامل چندانباره** با ساخت/ویرایش/حذف انبار (حداقل ۳۰ انبار)، موجودی عددی به‌ازای انبار، کسر هنگام قطعی، انتقال بین‌انباری، گزارش کاردکس. |
| ۵ | فیش بدون لینک (۱۴۸) | ثبت فیش/چک بدون پیش‌فاکتور مجاز شود؛ سناریو: شخصی بدون بدهی/پیش‌فاکتور پول یا چک می‌دهد، «دریافت» می‌زنیم و به او بدهکار می‌شویم (اعتبار مثبت مشتری). |
| ۶ | سقف کانال تبلیغات (۱۶۴/۱۶۵) | سقف = **انتخاب رندوم** حداکثر N محصول واجدشرایط برای هر کانال در روز. |
| ۷ | سند پرداخت خروجی + صندوق (۱۸۰/۱۸۱/۱۸۲) | سند پرداخت خروجی مستقل ساخته شود؛ «چک» به‌عنوان کانال/نوع پرداخت اضافه شود؛ صندوق و ماندهٔ صندوق و گزارش ورود/خروج ساخته شود. |

---

## بخش ۲ — نقشهٔ فازها

| فاز | عنوان | ریسک | مقصد |
|---|---|---|---|
| **۱** | رفع‌های داده/پیکربندی کم‌ریسک (سیستم‌های آمادهٔ خاموش را روشن می‌کند) | پایین | migration + پیکربندی + کد کوچک |
| **۲** | یکسان‌سازی واحد پول به تومان (بحرانی) | پایین‑متوسط | کد فرانت |
| **۳** | گزارش‌های سررسیدی aging (۱۵۰/۱۵۱) | پایین | migration (ویو/تابع) + UI |
| **۴** | UX کوچک: انتخاب چندتایی کپی فروش (۱۴۶) + آموزش درون‌صفحه (۱۴۳) | پایین | کد فرانت |
| **۵** | اشخاص: پل customer↔person (۱۶۹/۱۷۲) + ایمپورت اشخاص (۱۷۰) | متوسط | کد فرانت |
| **۶** | صفحهٔ فروش: یکی‌سازی پیش‌فاکتور (۱۴۷) + فیش بدون لینک (۱۴۸/۱۵۲) | متوسط | کد + migration |
| **۷** | مارکتینگ: سقف رندوم کانال (۱۶۴/۱۶۵) + اتصال به گیمیفیکیشن (۱۶۷/۱۶۸) + وزن محصول (۱۶۶) | متوسط | migration + کد |
| **۸** | **چندانباره کامل** (۱۷۳–۱۷۹، ۱۸۳) — بزرگ‌ترین فاز | بالا | migration سنگین + UI کامل |
| **۹** | خزانه: سند پرداخت خروجی + صندوق + گزارش (۱۸۰/۱۸۱/۱۸۲) + چک | بالا | migration + UI |

> فاز ۱۹۳/۱۴۴ (OCR تصویری با provider دارای vision) **در این پرامپت نیست** چون تصمیمش پیکربندی/هزینه‌ای است و کد لازم ندارد؛ در پایان به‌عنوان یادداشت می‌آید.

---

## بخش ۳ — شرح فازها

هر فاز این ساختار را دارد: **هدف · گام‌ها · تست خودکار · گزارش**.

---

### فاز ۱ — رفع‌های داده و پیکربندی کم‌ریسک

**هدف:** روشن‌کردن سیستم‌هایی که ساخته شده‌اند ولی خاموش‌اند. کمترین ریسک، بیشترین اثر فوری. این فاز عمدتاً پیکربندی و migration کوچک است.

**گام‌ها:**

1. **رفع ناسازگاری نام نقش خرید** (یافتهٔ بحرانی محیط):
   - در جدول `role_permissions`، ردیف‌هایی که `role_name='purchasing_expert'` دارند به `purchase_specialist` (مقدار واقعی enum) اصلاح شوند.
   - migration:
     ```sql
     BEGIN;
     UPDATE public.role_permissions
       SET role_name = 'purchase_specialist'
       WHERE role_name = 'purchasing_expert';
     COMMIT;
     ```
   - **قبل از اجرا:** تأیید کن که واقعاً enum مقدار `purchase_specialist` دارد و `purchasing_expert` ندارد:
     ```sql
     SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='app_role' ORDER BY 1;
     SELECT DISTINCT role_name FROM public.role_permissions ORDER BY 1;
     ```

2. **فعال‌سازی KPIهای سود (۱۵۷):**
   - دو KPI `total_profit` و `profit_per_talk_minute` در `gamification_kpis` الان `enabled=false`‌اند. آن‌ها را فعال کن و وزن معقول بده. **وزن فعلی را اول بخوان** و اگر صفر/ناچیز بود، مقدار متناسب با بقیهٔ KPIها بگذار:
     ```sql
     SELECT event_key, weight, enabled FROM public.gamification_kpis
       WHERE event_key IN ('total_profit','profit_per_talk_minute','total_sales','inbound_calls','outbound_calls');
     ```
   - migration:
     ```sql
     BEGIN;
     UPDATE public.gamification_kpis SET enabled = true
       WHERE event_key IN ('total_profit','profit_per_talk_minute');
     -- اگر وزن‌ها صفر/ناچیز بودند، مقدار متناسب ست کن (بر اساس مقیاس بقیه KPIها):
     UPDATE public.gamification_kpis SET weight = 0.0002
       WHERE event_key = 'total_profit' AND weight < 0.0002;
     COMMIT;
     ```
   > نکته: اگر مقیاس KPIهای فروش با ضریب لگاریتمی است (طبق تحقیق `total_sales` وزن `0.0001` دارد)، وزن سود را هم در همان مقیاس نگه‌دار تا امتیازها متعادل بمانند.

3. **کالیبراسیون بوست نامزدی تبلیغات (۱۹۲):**
   - در تنها سطر `promotion_nomination_policy`، مقادیر `boost_per_nomination` و `boost_cap_per_product` صفرند → بوست بی‌اثر. مقدار غیرصفر معقول بده:
     ```sql
     BEGIN;
     UPDATE public.promotion_nomination_policy
       SET boost_per_nomination = COALESCE(NULLIF(boost_per_nomination,0), 5),
           boost_cap_per_product = COALESCE(NULLIF(boost_cap_per_product,0), 15)
       WHERE user_id IS NULL AND role IS NULL;
     COMMIT;
     ```
   > مقدار دقیق را می‌توان بعداً از UI سیاست تنظیم کرد؛ هدف این گام فقط «از صفر درآوردن» است تا نامزدی اثر عددی داشته باشد.

4. **ثبت صفحهٔ وزن‌دهی KPI در منو + هم‌ترازی دسترسی (۱۶۲):**
   - صفحهٔ `/gamification/settings` در `registry.ts` ثبت نشده و فقط از هاب قابل دسترسی است؛ ضمناً لینکش برای manager دیده می‌شود ولی گارد فقط admin است.
   - در `src/lib/navigation/registry.ts` یک ورودی برای `/gamification/settings` با `adminOnly: true` اضافه کن (زیر گروه گیمیفیکیشن).
   - شرط نمایش لینک در هاب (`_app.gamification.tsx`) را از `isAdminOrManager` به فقط‑admin تغییر بده تا با گارد route هم‌تراز شود.

5. **باز کردن دسترسی حسابدار به ثبت امتیاز کارشناس (پیش‌نیاز حیاتی زنجیرهٔ سرمایه):**
   - صفحهٔ `/users/$userId` که `DynamicScoringSection` را برای ثبت امتیاز کارشناس دارد، پشت `requireAdmin()` است؛ ولی RLS جدول `dynamic_entity_scores` به accountant هم اجازهٔ نوشتن می‌دهد (ناهماهنگی). دو راه — **راه امن‌تر را انتخاب کن:**
     - **راه الف (ترجیحی):** یک route جدید و سبک بساز، مثلاً `_app.accounting.salesperson-scoring.tsx`، با گارد `requireAnyRole(["admin","accountant"])` که فقط `DynamicScoringSection entityType="salesperson"` را برای انتخاب کارشناس و ورود امتیاز ماهانه نمایش دهد. این کار صفحهٔ ادمینِ کاربر را دست‌نخورده نگه می‌دارد و فقط قابلیت امتیازدهی کارشناس را به حسابدار می‌دهد.
     - راه ب: گارد `/users/$userId` را به `requireAnyRole(["admin","accountant"])` تغییر بده — **این را انتخاب نکن** مگر مطمئن باشی صفحهٔ کاربر اطلاعات حساس دیگری ندارد که نباید حسابدار ببیند. (احتمالاً دارد؛ پس راه الف.)
   - در `registry.ts` ثبت شود.

6. **رفع کوئری خراب گزارش مالی (یافتهٔ بحرانی J):**
   - در `src/routes/_app.reports.tsx` (کامپوننت `FinanceReportTab`، حدود خط ۲۳۰) ستون‌های `total_receivables, overdue_receivables, due_today_receivables, future_receivables` از `vw_customer_receivables` خوانده می‌شوند که **روی ویو وجود ندارند** (ستون‌های واقعی: `outstanding_amount`, `is_overdue`, `due_date`).
   - اصلاح کن تا از RPCهای موجود `get_receivables_summary` استفاده کند (همان که صفحهٔ receivables استفاده می‌کند) — به‌جای کوئری مستقیم روی ویو. این هم باگ را رفع می‌کند هم با الگوی امن هماهنگ می‌شود.

**تست خودکار فاز ۱:**
```sql
-- نقش خرید
SELECT count(*) AS should_be_zero FROM public.role_permissions WHERE role_name='purchasing_expert';
-- KPI سود
SELECT event_key, enabled, weight FROM public.gamification_kpis WHERE event_key IN ('total_profit','profit_per_talk_minute');
-- بوست نامزدی
SELECT boost_per_nomination, boost_cap_per_product FROM public.promotion_nomination_policy WHERE user_id IS NULL AND role IS NULL;
```
- `should_be_zero` باید ۰ باشد.
- هر دو KPI سود `enabled=t` با وزن غیرصفر.
- بوست‌ها غیرصفر.
- build فرانت سبز؛ route جدید امتیازدهی کارشناس و صفحهٔ KPI در منو ظاهر شوند.
- **تست دستیِ گزارش‌شده:** بعد از ثبت یک امتیاز نمونه برای یک کارشناس و اجرای مجدد تخصیص در `/accounting/dynamic-capital`، تأیید کن `salesperson_capital_allocations_dynamic` حالا ردیفی با `allocated_capital>0` دارد و `customer_capital_allocations_dynamic` ردیف‌دار می‌شود. (این اثبات زنده‌شدن کل زنجیرهٔ سرمایه است.)

**گزارش فاز ۱:** چه چیزهایی روشن شد، migrationها، و نتیجهٔ تست زنجیرهٔ سرمایه.

---

### فاز ۲ — یکسان‌سازی واحد پول به تومان (بحرانی)

**هدف:** حذف ریسک خطای ۱۰ برابری. کل DB تومان است؛ فقط لایهٔ نمایش در چند نقطه «ریال» می‌زند.

**گام‌ها (بر اساس یافته‌های دقیق پکیج K):**

1. **پیش‌فرض `formatCurrency`:** در `src/lib/i18n/formatters.ts:12`، پیش‌فرض پارامتر واحد را از `"ریال"` به `"تومان"` تغییر بده. (این ریشهٔ تسهیل‌گر همهٔ موارد است.)

2. **InvoiceForm (بحرانی ۱):** در `src/shared/components/InvoiceForm.tsx` همهٔ برچسب‌های «ریال» را به «تومان» تغییر بده — خطوط ۳۲۳، ۳۶۶، ۵۹۸، ۶۰۲، ۶۰۷، ۶۱۷، ۸۰۸ (جمع کل، اعتبار، بدهی، بیعانه). عدد دست‌نخورده می‌ماند؛ فقط واحد نمایش درست می‌شود.

3. **dynamic-capital (بحرانی ۲):** در `src/routes/_app.accounting.dynamic-capital.tsx` برچسب‌های «ریال» به «تومان» — خطوط ۳۱۵ (Label ورودی «سرمایه کل»)، ۳۲۸، ۴۶۹، ۵۰۱، ۶۳۴، ۶۷۹. تابع محلی `fmtMoney` (خط ۷۳) هم واحدش تومان شود.

4. **صف بازبینی OCR رسید (متوسط):** در `src/routes/_app.operations.receipts.tsx:286` فراخوانی `formatCurrency(parsed_amount)` واحد صریح `"تومان"` بگیرد.

5. **شاخهٔ برچسب‌دار OCR (متوسط):** در `src/lib/accounting/receipt-extraction.ts` شاخهٔ اصلی «مبلغ: X ریال» (خطوط ۱۷۵–۱۸۳) عدد را بدون `÷۱۰` ذخیره می‌کند در حالی که fallback (خط ۱۹۶) تبدیل را انجام می‌دهد. شاخهٔ اصلی را هم‌رفتار fallback کن: اگر واحدِ تشخیص‌داده‌شده روی فیش «ریال» بود، `Math.round(n/10)` اعمال شود و همان هشدار «مبلغ به ریال بود؛ به تومان تبدیل شد» ثبت گردد.

**نکتهٔ حیاتی regression:** تغییرات صرفاً برچسبی‌اند و **نباید هیچ عددی را در DB تغییر دهند**. مطمئن شو هیچ‌جا ضرب/تقسیم ۱۰ در مسیر ذخیره اضافه نمی‌کنی (به‌جز همان اصلاح شاخهٔ OCR که خواندن ورودی است نه تغییر دادهٔ موجود).

**تست خودکار فاز ۲:**
- grep تأییدی: در سه فایل بحرانی، دیگر رشتهٔ «ریال» در context نمایش پول نماند:
  ```powershell
  rg -n "ریال" src/shared/components/InvoiceForm.tsx src/routes/_app.accounting.dynamic-capital.tsx src/routes/_app.operations.receipts.tsx
  ```
  (نتیجه باید خالی یا فقط در کامنت‌های بی‌ربط باشد.)
- build سبز.
- **تست دستیِ گزارش‌شده:** یک محصول در پیش‌فاکتور و در InvoiceForm با هم مقایسه شود — همان عدد، حالا هر دو «تومان». در dynamic-capital برچسب ورودی «سرمایه کل (تومان)» باشد.

**گزارش فاز ۲:** فهرست نقاط اصلاح‌شده + تأیید عدم تغییر داده.

---

### فاز ۳ — گزارش‌های سررسیدی aging (۱۵۰/۱۵۱)

**هدف:** افزودن سطل‌های سنی استاندارد به گزارش‌های موجود. داده کامل است؛ فقط لایهٔ bucketing و ستون‌های UI اضافه می‌شود.

**گام‌ها:**

1. **ویو مطالبات:** `vw_customer_receivables` را با `CREATE OR REPLACE VIEW` گسترش بده و یک ستون `aging_bucket` اضافه کن بر مبنای `CURRENT_DATE - due_date`:
   - `current` (سررسید نشده یا امروز)، `d1_30`، `d31_60`، `d61_90`، `d90_plus`.
   - **مراقب باش:** `CREATE OR REPLACE VIEW` نمی‌تواند نوع ستون‌های موجود را عوض کند یا ستون میانی حذف کند؛ فقط ستون‌های جدید را **در انتها** اضافه کن. اگر ساختار اجازه نداد، ابتدا `DROP VIEW ... CASCADE` سپس بازساخت — ولی چون توابع به ویو وابسته‌اند، ترتیب drop/create و بازساخت توابع را رعایت کن و **قبلش از تعریف توابع وابسته backup بگیر** (در متن migration کپی کن).

2. **تابع summary مطالبات:** `get_receivables_summary` را طوری گسترش بده که جمعِ هر سطل را هم برگرداند (علاوه بر معوق/امروز/فردا/آینده که فعلاً دارد) — با `FILTER (WHERE aging_bucket = ...)`.

3. **همین دو کار را برای payables تکرار کن:** `vw_supplier_payables` + `get_payables_summary` با همان سطل‌بندی بر مبنای سررسید محاسبه‌شده (`purchase_date + payment_terms.days`).

4. **UI:** در `_app.accounting.receivables.tsx` و `_app.accounting.payables.tsx` کارت‌های خلاصهٔ سطل‌های سنی (۵ سطل) اضافه کن و در جدول یک ستون/بَج «سطل سنی» نشان بده. از الگوی کارت‌های موجود همان صفحه استفاده کن.

**نکته دربارهٔ payables:** مانده تأمین‌کننده فعلاً «همه‌یا‌هیچ» است (`paid_at` باینری، بدون پرداخت جزئی). برای aging صرف کافی است؛ **پرداخت جزئی خرید را در این فاز اضافه نکن** (خارج از دامنه؛ اگر لازم شد فاز جدا).

**تست خودکار فاز ۳:**
```sql
-- ستون جدید ویو
SELECT column_name FROM information_schema.columns WHERE table_name='vw_customer_receivables' AND column_name='aging_bucket';
-- تابع خروجی سطل‌ها را برمی‌گرداند
SELECT * FROM public.get_receivables_summary(NULL,NULL,NULL);  -- باید فیلدهای سطل داشته باشد
```
- build سبز؛ کارت‌های سطل سنی در هر دو صفحه دیده شوند.
- **تست دستیِ گزارش‌شده:** اگر داده‌ای موجود نیست، حداقل صحت اجرای کوئری‌ها و رندر بدون خطا تأیید شود.

**گزارش فاز ۳.**

---

### فاز ۴ — UX کوچک: انتخاب چندتایی کپی فروش + آموزش درون‌صفحه

**هدف:** دو قابلیت مستقل و کوچک که تجربهٔ کاربر را بهتر می‌کنند.

**گام ۴.الف — کپی متن فروش گروهی (۱۴۶):**

نیازمندی دقیق کاربر: در صفحهٔ جستجوی سریع فروش (`/sales/search`)، کاربر بتواند چند محصول را تیک بزند و یک «کپی گروهی» بگیرد که برای هر محصول فقط **اطلاعات حداقلی** (نام/برند/دسته/نوع/مشخصات کوتاه/وضعیت) + قیمت‌های **منتخب** را بیاورد. وقتی اولین محصول تیک خورد، از کاربر بپرسد کدام حالت‌های قیمت (تسویه ۱ تا چند روزه و…) در متن بیایند، با گزینهٔ «همه».

- **زیرساخت انتخاب:** state `selectedProductIds: Set<string>` روی نتایج اضافه کن (الگوی `ProductLabelsQuickDialog.tsx`). چک‌باکس روی هر کارت + «انتخاب همه».
- **دیالوگ انتخاب حالت قیمت:** وقتی اولین محصول انتخاب شد، یک دیالوگ باز شود که فهرست حالت‌های قیمت فعال را از همان داده‌ای که RPC برمی‌گرداند نشان دهد (نوع قیمت × نوع تسویه)، با چک‌باکس هر حالت + «همه». انتخاب کاربر در state نگه‌داری شود.
- **تابع کپی گروهی:** `handleBulkCopySalesText` بساز که روی محصولات انتخابی حلقه بزند و برای هرکدام قالب زیر را بسازد (بدون کد/دسته/… کاملِ تک‌محصولی؛ فقط حداقلی طبق نیاز کاربر):
  ```
  <نام نمایشی محصول>
  برند: <brand>
  دسته: <category>
  نوع کالا: <خارجی/ایرانی>
  <specChips کوتاه با  •  >
  وضعیت: <STOCK_LABEL>

  قیمت‌ها:
  • <فقط حالت‌های انتخاب‌شده>: <formatNumber> تومان
  ...
  ```
  بین محصولات یک خط جداکننده. کل متن با `navigator.clipboard.writeText`. `toast.success`.
- **مهم:** تابع تک‌محصولی موجود (`handleCopySalesText`) را **دست نزن**؛ این یک مسیر جدید موازی است.

**گام ۴.ب — آموزش درون‌صفحهٔ متریک دستی (۱۴۳):**

- یک route راهنما مشابه `credit-allocation-guide` بساز (مثلاً `_app.gamification_.admin_.manual-metrics_.guide.tsx`) با کامپوننت Card-based که به زبان ساده و روان فارسی توضیح دهد: فرم متریک دستی چیست، بازهٔ ویرایش ۵ روزه چطور کار می‌کند، سوییچ خودکار/دستی فروش، و اینکه وزن هر متریک کجا تنظیم می‌شود و چطور روی امتیاز اثر می‌گذارد.
- در صفحهٔ `manual-metrics.tsx` یک دکمه/لینک «راهنما» به این صفحه اضافه کن.

**تست خودکار فاز ۴:** build سبز. **تست دستیِ گزارش‌شده:** انتخاب چند محصول → دیالوگ حالت قیمت → کپی گروهی؛ صحت متن خروجی. صفحهٔ راهنما رندر و از دکمه قابل دسترسی باشد.

**گزارش فاز ۴.**

---

### فاز ۵ — اشخاص: پل customer↔person + ایمپورت اشخاص

**هدف:** فعال‌کردن پلی که بک‌اندش آماده است ولی UI ندارد، و افزودن ایمپورت اکسل برای اشخاص.

**گام‌ها:**

1. **UI پل customer↔person (۱۶۹):** بک‌اند آماده است (`linkCustomerToPerson`/`unlinkCustomerFromPerson` در `src/lib/customers/functions.ts`، RPCهای `customer_set_person`/`customer_clear_person`). در فرم ویرایش مشتری (`_app.sales_.customers_.$customerId.edit.tsx`) یک بخش «اتصال به پروندهٔ شخص» اضافه کن:
   - یک PersonPicker (جستجو در `persons` بر اساس `display_name`/شناسه‌ها) + دکمهٔ «اتصال» که `linkCustomerToPerson` را صدا بزند.
   - اگر مشتری قبلاً `person_id` دارد، نمایش شخص متصل + دکمهٔ «قطع اتصال» (`unlinkCustomerFromPerson`).

2. **ایمپورت اکسل اشخاص (۱۷۰):** الگوی `CustomerImportForm.tsx` را برای موجودیت `persons` تکرار کن:
   - route جدید مثلاً `_app.persons_.import.tsx` با گارد `requireAnyRole(["admin","manager"])` (هماهنگ با دسترسی `persons`).
   - فرم سه‌مرحله‌ای: انتخاب فایل → نگاشت ستون (`display_name*`, `kind`, شناسه‌ها مثل موبایل/کدملی) → پیش‌نمایش → درج دسته‌ای در `persons` (+ در صورت وجود شناسه، درج در `person_identifiers`).
   - `audit_logs` با `action:"persons_imported"`.

**تست خودکار فاز ۵:** build سبز. **تست دستیِ گزارش‌شده:** اتصال یک مشتری به یک شخص و تأیید پرشدن `customers.person_id` و ساخت ردیف در `person_context_links`؛ قطع اتصال؛ ایمپورت چند شخص از یک فایل نمونه.

**گزارش فاز ۵.**

---

### فاز ۶ — صفحهٔ فروش: یکی‌سازی پیش‌فاکتور + فیش بدون لینک

**هدف:** حذف موازی‌کاری پیش‌فاکتور و رفع باگ ثبت فیش/دریافت بدون پیش‌فاکتور.

**گام ۶.الف — یکی‌سازی پیش‌فاکتور (۱۴۷):**

- در صفحهٔ `/sales` (route مربوطه در `src/routes`)، کارت «فاکتورهای فروش» (که به مسیر مبتنی بر `invoices` می‌رود، `a:nth-child(5)` در ارجاع کاربر) را **حذف** کن.
- مطمئن شو کارت «پیش‌فاکتورها» (`sales_quotes`، `a:nth-child(2)`) تنها مسیر است و همهٔ قابلیت‌های لازم را دارد.
- **قبل از حذف تأیید کن** جدول `invoices` واقعاً بدون داده است (تحقیق: ۰ ردیف، «dead parallel»):
  ```sql
  SELECT count(*) FROM public.invoices;
  ```
  اگر صفر بود، حذف کارت و مسیرش امن است. اگر ناصفر شد (خلاف انتظار)، **متوقف شو و گزارش بده** — داده‌ای هست که تصمیمش را باید بگیریم.
- route و کامپوننت‌های مختص `invoices` را که دیگر استفاده نمی‌شوند حذف/غیرفعال کن، ولی **جدول `invoices` را drop نکن** (ممکن است گزارش‌ها/ویوها به‌عنوان reference از آن استفاده کنند؛ فقط UI را حذف کن).

**گام ۶.ب — فیش/چک بدون لینک به پیش‌فاکتور (۱۴۸/۱۵۲):**

نیازمندی دقیق کاربر: گاهی شخصی **بدون بدهی و بدون پیش‌فاکتور** پول یا چک می‌دهد؛ باید «دریافت» بزنیم و **به او بدهکار شویم** (اعتبار مثبت مشتری ثبت شود).

- در `PaymentReceiptForm.tsx`، اعتبارسنجی‌ای که برای نوع `invoice_payment` «حداقل یک پیش‌فاکتور» را اجباری می‌کند، طوری اصلاح شود که این سناریو ممکن شود. مسیر تمیز: استفاده از نوع موجود `positive_credit` (اعتبار مثبت مستقل) که **از قبل بدون پیش‌فاکتور کار می‌کند**.
- مطمئن شو در UI، وقتی کاربر «دریافت بدون پیش‌فاکتور» می‌خواهد، نوع `positive_credit` (یا `prepayment`) به‌روشنی قابل انتخاب است و پیام/راهنمای فارسی دارد که یعنی «این مبلغ به‌عنوان اعتبار/طلب مشتری ثبت می‌شود».
- تأیید کن که ثبت `positive_credit` واقعاً ماندهٔ اعتبار مشتری را افزایش می‌دهد (اثرش در `customer_credit_*` یا مسیر مربوطه دیده شود). اگر این اتصال ناقص بود، آن را کامل کن.
- **چک:** چون کاربر «چک» را هم مطرح کرد، مطمئن شو کانال پرداخت `cheque` قابل ثبت است (این در فاز ۹ به‌صورت کامل‌تر با سند پرداخت خروجی می‌آید؛ در این فاز فقط سمت دریافت).

**گام ۶.ج — ثبت درخواست/پیش‌فاکتور ردشده با دلیل (۱۵۲):**

نیازمندی: وقتی پیش‌فاکتوری طبق قوانین نمی‌تواند ثبت شود، یک علامت ضربدر باشد و با زدن آن، دلیل در یک خط توضیح داده و به صفحهٔ خود کاربر منتقل شود.

- بررسی کن الان وقتی ثبت رد می‌شود چه می‌شود (طبق تحقیق D8). اگر هیچ رکوردی از تلاش ناموفق ذخیره نمی‌شود:
  - یک مکانیزم سبک بساز: هنگام رد شدن، یک دیالوگ که دلیل رد را نشان دهد و امکان ثبت یک یادداشت/دلیل یک‌خطی بدهد، سپس رکوردی (مثلاً در یک جدول `sales_quote_rejections` یا در `audit_logs` با action مشخص) ثبت شود و در صفحهٔ خود کاربر (لیست فعالیت‌ها/اعلان‌ها) قابل مشاهده باشد.
  - **تصمیم ساده‌سازی:** اگر ساخت جدول جدید سنگین است، از `audit_logs` با `action='sales_quote_rejected'` + متن دلیل استفاده کن و در صفحهٔ کاربر یک بخش «درخواست‌های رد شدهٔ من» بر اساس همان لاگ نشان بده. (کم‌ریسک‌تر.)

**تست خودکار فاز ۶:**
```sql
SELECT count(*) FROM public.invoices;  -- تأیید صفر قبل از حذف کارت
```
- build سبز.
- **تست دستیِ گزارش‌شده:** ثبت یک دریافت `positive_credit` بدون پیش‌فاکتور برای یک مشتری و تأیید افزایش اعتبار/طلب او؛ تأیید حذف کارت فاکتور موازی؛ تست مسیر رد پیش‌فاکتور با دلیل.

**گزارش فاز ۶.**

---

### فاز ۷ — مارکتینگ: سقف رندوم کانال + اتصال به گیمیفیکیشن + وزن محصول

**هدف:** سه شکاف مارکتینگ که در تصمیم‌ها قطعی شد.

**گام ۷.الف — سقف رندوم کانال (۱۶۴/۱۶۵):**

نیازمندی قطعی‌شده: سقف = **انتخاب رندوم** حداکثر N محصول واجدشرایط برای هر کانال در روز (نه گیت شمارش فعلی، نه N تای برتر بر اساس امتیاز — بلکه رندوم).

- منطق فعلی: `compute_promotion_scores` یک گیت بولی روی کل کانال دارد (`used_today < daily_quota`) و همهٔ واجدشرایط‌ها را برمی‌گرداند.
- تغییر: در ویو/تابع، برای هر کانال حداکثر `daily_quota` محصول به‌صورت **رندومِ پایدار در طول روز** انتخاب شود.
  - «رندوم پایدار» یعنی در طول یک روز، هر بار refresh همان مجموعهٔ رندوم را بدهد (نه اینکه هر بار عوض شود). راهکار: seed رندوم بر اساس ترکیب `channel_id + CURRENT_DATE` (مثلاً با `setseed` یا `md5(channel_id || current_date)` به‌عنوان کلید مرتب‌سازی).
  - الگوی پیشنهادی در تابع: `ROW_NUMBER() OVER (PARTITION BY channel_id ORDER BY md5(channel_id::text || CURRENT_DATE::text || product_id::text))` سپس فیلتر `rn <= daily_quota`.
  - محصولات باید همچنان واجدشرایط باشند (`score > 0`، `stock_factor > 0`).
- در UI صفحهٔ پیشنهادها، رفتار جدید را تأیید کن: اگر سقف کانال ۵ باشد، دقیقاً حداکثر ۵ محصول (رندوم پایدار امروز) برای آن کانال نشان داده شود.

**گام ۷.ب — اتصال نامزدی/تبلیغ به گیمیفیکیشن (۱۶۷/۱۶۸):**

- الان انجام تبلیغ/نامزدی فقط در `audit_logs` ثبت می‌شود؛ هیچ رویداد امتیاز گیمیفیکیشن ندارد.
- یک `event_key` جدید (مثلاً `promotion_completed`) در `gamification_kpi_rules` تعریف کن با وزن معقول.
- یک مسیر امتیازدهی بساز: هنگام ثبت «استفاده از پیشنهاد» یا «نامزدی»، یک رکورد `employee_score_events` برای مسئول مارکتینگ ساخته شود (یا تریگر روی `promotion_nominations`/درج مربوطه، یا در همان server function که `audit_logs` می‌نویسد، به‌صورت اتمیک `employee_score_events` هم درج شود).
- تأیید کن امتیاز مسئول مارکتینگ در لیدربرد دیده می‌شود (۱۶۸).

**گام ۷.ج — وزن مستقل محصول در پیشنهاد (۱۶۶):**

- الان «وزن محصول» فقط از مجموع وزن برچسب‌ها می‌آید؛ وزن مستقل تک‌محصول وجود ندارد. جدول `product_recommendation_overrides` هست ولی در ویوی تبلیغات استفاده نمی‌شود.
- تصمیم ساده: یک ضریب وزن مستقل محصول برای تبلیغ اضافه کن — یا با استفاده از `product_recommendation_overrides` (اگر ساختارش مناسب است) یا یک ستون سبک. آن را در فرمول `market_score` ویو ضرب/جمع کن.
- **مراقب regression:** تغییر فرمول ویو نباید رفتار موجود را برای محصولات بدون override بشکند (ضریب پیش‌فرض = خنثی، مثلاً ۱).

**تست خودکار فاز ۷:**
```sql
-- سقف رندوم: برای کانالی با daily_quota مشخص، تعداد ردیف نباید از quota بیشتر شود
SELECT channel_id, count(*) FROM public.compute_promotion_scores(NULL, 0, 200) GROUP BY channel_id;  -- هر کانال ≤ quota
-- event_key جدید
SELECT event_key FROM public.gamification_kpi_rules WHERE event_key='promotion_completed';
```
- build سبز.
- **تست دستیِ گزارش‌شده:** یک کانال با سقف ۵ → حداکثر ۵ محصول؛ refresh دوباره همان ۵ محصول (پایداری روزانه)؛ انجام یک تبلیغ → ثبت امتیاز مارکتینگ در لیدربرد.

**گزارش فاز ۷.**

---

### فاز ۸ — چندانباره کامل (بزرگ‌ترین فاز)

**هدف:** ساخت کامل مدل چندانباره از صفر. این فاز به‌تنهایی سنگین‌ترین بخش پروژه است. با احتیاط و گام‌به‌گام پیش برو و **بعد از هر زیرگام migration، تست بزن**.

**تصمیم قطعی کاربر:** حداقل ۳۰ انبار؛ قابلیت ساخت/ویرایش/حذف انبار؛ موجودی عددی؛ کسر هنگام قطعی؛ انتقال بین‌انباری؛ گزارش کاردکس.

**معماری داده (بساز):**

1. **جدول `warehouses`:**
   ```
   id uuid PK default gen_random_uuid()
   name text NOT NULL
   code text UNIQUE            -- اختیاری، کد کوتاه انبار
   is_active boolean default true
   is_default boolean default false   -- انبار پیش‌فرض برای عملیات
   notes text
   created_at, updated_at timestamptz
   ```
   - RLS: مدیریت (insert/update/delete) فقط `admin`/`manager`؛ خواندن برای نقش‌های عملیاتی.
   - ماژول `warehouse` را در `role_permissions` seed کن (چون الان seed نشده و fallback می‌زند).

2. **جدول موجودی به‌ازای انبار `warehouse_stock`:**
   ```
   id uuid PK
   warehouse_id uuid FK → warehouses(id) ON DELETE RESTRICT
   product_id uuid FK → products(id) ON DELETE CASCADE
   quantity numeric NOT NULL default 0 CHECK (quantity >= 0)
   updated_at timestamptz
   UNIQUE(warehouse_id, product_id)
   ```
   - این «موجودی عددی» است که سیستم الان ندارد (فقط `stock_status` متنی دارد).

3. **جدول لاگ حرکت کالا `stock_movements` (کاردکس):**
   ```
   id uuid PK
   product_id uuid FK
   warehouse_id uuid FK
   movement_type text CHECK (movement_type IN ('in','out','transfer_in','transfer_out','adjust'))
   quantity numeric NOT NULL CHECK (quantity > 0)
   ref_type text            -- 'purchase' | 'sale_quote_confirm' | 'transfer' | 'manual'
   ref_id uuid              -- شناسهٔ سند منبع
   related_warehouse_id uuid -- برای انتقال (مبدأ/مقصد)
   note text
   created_by uuid
   created_at timestamptz default now()
   ```
   - هر تغییر موجودی باید یک ردیف کاردکس بسازد (منبع حقیقت حرکت).

4. **جدول سند انتقال `stock_transfers`:**
   ```
   id uuid PK
   from_warehouse_id uuid FK → warehouses(id)
   to_warehouse_id uuid FK → warehouses(id)
   status text CHECK (status IN ('draft','confirmed')) default 'draft'
   note text
   created_by uuid, confirmed_by uuid
   created_at, confirmed_at timestamptz
   CHECK (from_warehouse_id <> to_warehouse_id)
   ```
   - و `stock_transfer_items` (product_id, quantity) با FK به `stock_transfers`.

**توابع/تریگرها (بساز):**

5. **تابع افزایش موجودی هنگام خرید (۱۷۳):** یک تابع/تریگر که هنگام درج در `purchases`/`purchase_items`، موجودی محصول را در انبار مربوطه افزایش دهد و ردیف کاردکس `in` بسازد.
   - **انبار خرید:** به فرم خرید یک فیلد انتخاب انبار مقصد اضافه کن (پیش‌فرض = انبار پیش‌فرض). اگر افزودن فیلد به `purchases` لازم است (`warehouse_id`)، ستون nullable اضافه کن.

6. **تابع کسر موجودی هنگام قطعی‌کردن پیش‌فاکتور (۱۷۴):** هنگام «قطعی‌کردن» یک `sales_quote` (تبدیل به فروش قطعی)، موجودی محصولات از انبار انتخاب‌شده کسر شود و کاردکس `out` ساخته شود.
   - **چک موجودی پیش از قطعی (۱۷۵):** قبل از کسر، اگر موجودی کافی نبود، قطعی‌کردن **مجاز نباشد** و پیام خطای فارسی واضح بدهد.
   - **انتخاب انبار در پیش‌فاکتور (۱۷۸):** به فرم پیش‌فاکتور فیلد انتخاب انبار اضافه کن.
   - **تغییر انبار هنگام قطعی (۱۷۹):** در مرحلهٔ قطعی‌کردن، امکان تغییر انبار انتخاب‌شده باشد.

7. **تابع انتقال بین‌انباری (۱۷۷):** هنگام `confirmed` شدن یک `stock_transfer`، موجودی مبدأ کم و مقصد زیاد شود و دو ردیف کاردکس (`transfer_out`/`transfer_in`) ساخته شود.

8. **همگام‌سازی `stock_status` متنی با موجودی عددی (اختیاری ولی توصیه‌شده):** یک تریگر که وقتی مجموع موجودی محصول در همهٔ انبارها صفر شد، `stock_status='unavailable'` و وقتی مثبت شد `available` — تا سیستم فعلی که بر `stock_status` تکیه دارد (مثل جستجوی فروش و نوتیف موجود شدن) هماهنگ بماند. **این اتصال مهم است** چون کل UI فعلی بر `stock_status` سوار است.

**UI (بساز):**

9. **مدیریت انبار:** route `_app.warehouses.tsx` (فهرست + ساخت/ویرایش/حذف با گارد `admin`/`manager`). حذف انبار باید محافظت داشته باشد: اگر انبار موجودی غیرصفر یا حرکت ثبت‌شده دارد، به‌جای حذف فیزیکی هشدار بده یا soft-delete/غیرفعال کن (چون FK با `ON DELETE RESTRICT` است). در `registry.ts` ثبت شود.

10. **نمایش موجودی به تفکیک انبار:** در صفحهٔ محصول، موجودی هر انبار را نشان بده.

11. **سند انتقال:** route برای ساخت و قطعی‌کردن انتقال بین دو انبار.

12. **گزارش کاردکس/ورود‑خروج کالا به تفکیک انبار با تاریخ شمسی (۱۸۳):** route گزارش با فیلتر بازهٔ تاریخ شمسی (از `JalaliDateInput`/`PersianDatePicker`) و فیلتر انبار، که ردیف‌های `stock_movements` را نشان دهد. از الگوی گزارش‌های موجود و `moment-jalaali` استفاده کن.

**زیرگام‌بندی و تست:** این فاز را در **زیرگام‌های مجزا** اجرا کن و بعد از هر زیرگام migration تست بزن:
- ۸.۱ جداول (`warehouses`, `warehouse_stock`, `stock_movements`, `stock_transfers`, `stock_transfer_items`) + RLS + seed ماژول.
- ۸.۲ توابع/تریگرهای خرید (افزایش موجودی).
- ۸.۳ توابع/تریگرهای قطعی‌کردن (کسر + چک موجودی).
- ۸.۴ انتقال بین‌انباری.
- ۸.۵ همگام‌سازی `stock_status`.
- ۸.۶ UI مدیریت انبار.
- ۸.۷ UI انتخاب انبار در خرید و پیش‌فاکتور.
- ۸.۸ UI انتقال + گزارش کاردکس.

**تست خودکار فاز ۸ (بعد از هر زیرگام مربوطه):**
```sql
-- جداول ساخته شدند
SELECT table_name FROM information_schema.tables WHERE table_name IN ('warehouses','warehouse_stock','stock_movements','stock_transfers','stock_transfer_items') ORDER BY 1;
-- ماژول warehouse seed شد
SELECT DISTINCT module FROM public.role_permissions WHERE module='warehouse';
```
- **تست جریان کامل (گزارش‌شده):**
  1. ساخت ۲–۳ انبار از UI.
  2. ثبت یک خرید با انتخاب انبار → تأیید افزایش `warehouse_stock` و ردیف کاردکس `in`.
  3. ساخت پیش‌فاکتور با همان محصول و انتخاب انبار → قطعی‌کردن → تأیید کسر موجودی و کاردکس `out`.
  4. تلاش برای قطعی‌کردن با موجودی ناکافی → باید رد شود.
  5. انتقال مقداری از انبار ۱ به ۲ → تأیید کم/زیاد شدن دو طرف و دو ردیف کاردکس.
  6. گزارش کاردکس با فیلتر تاریخ شمسی و انبار → نمایش درست حرکت‌ها.
- build سبز بعد از هر زیرگام UI.

**گزارش فاز ۸:** تفصیلی، با نتیجهٔ هر زیرگام و جریان تست کامل.

> **توجه ویژه:** این فاز محتمل‌ترین نقطه برای تمام‌شدن context است. **حتماً بعد از هر زیرگام `PROGRESS.md` را به‌روز و commit کن** تا با `--continue` از همان زیرگام ادامه پیدا کند.

---

### فاز ۹ — خزانه: سند پرداخت خروجی + صندوق + گزارش + چک

**هدف:** ساخت سمت «خروج پول» و مفهوم صندوق که کلاً وجود ندارند.

**تصمیم قطعی کاربر:** سند پرداخت خروجی مستقل لازم است؛ چک به‌عنوان نوع/کانال؛ صندوق و ماندهٔ صندوق و گزارش ورود/خروج.

**گام‌ها:**

1. **مدل صندوق/حساب (۱۸۱):** به `bank_accounts` یک ستون `account_type` اضافه کن (`bank` | `cash`) تا «صندوق نقدی» از «حساب بانکی» متمایز شود. (یا اگر تمیزتر دیدی، جدول مستقل صندوق؛ ولی افزودن `account_type` کم‌ریسک‌تر و با داده موجود سازگارتر است.)

2. **سند پرداخت خروجی مستقل (۱۸۰/I2):** الان فقط `payment_receipts` (ورود پول) هست و پرداخت خرید فقط با `purchases.paid_at` علامت می‌خورد. یک جدول `payment_vouchers` (سند پرداخت/خروج پول) بساز، هم‌ساختار منطقی با `payment_receipts` ولی جهت خروج:
   ```
   id, amount(numeric, تومان), payment_date, payment_time,
   payee_type text ('supplier'|'external_party'|'customer'|'other'),
   payee_supplier_id / payee_party_id / payee_customer_id (nullable FKها),
   document_channel text CHECK (... 'card_to_card','paya','pol','satna','cash','cheque','other'),  -- چک اینجا اضافه می‌شود
   source_bank_account_id uuid FK → bank_accounts,   -- از کدام حساب/صندوق خارج شد
   tracking_number, description, status, created_by, created_at
   ```
   - RLS مثل `payment_receipts` (admin/manager/accountant).
   - **چک:** مقدار `cheque` در `document_channel` هم برای این جدول و هم (طبق فاز ۶) برای سمت دریافت اضافه شود. اگر فیلدهای شمارهٔ چک/سررسید لازم است، ستون‌های `cheque_number`, `cheque_due_date` (nullable) اضافه کن.

3. **اتصال پرداخت خرید به سند خروجی:** هنگام پرداخت یک خرید (مسیر `purchase-payments`)، به‌جای صرفِ `paid_at`، یک `payment_voucher` هم ساخته شود (یا امکان ساختش باشد) تا خروج پول در خزانه ثبت شود. `purchases.paid_at` می‌تواند بماند برای سازگاری، ولی منبع حقیقتِ خروج پول، `payment_vouchers` است.

4. **محاسبهٔ ماندهٔ صندوق/حساب (۱۸۱):** یک ویو/تابع `get_account_balance` بساز که برای هر `bank_account` مانده را حساب کند:
   ```
   مانده = opening_balance
          + مجموع payment_receipts که destination_bank_account_id = این حساب (ورود)
          - مجموع payment_vouchers که source_bank_account_id = این حساب (خروج)
   ```
   - یک صفحه/بخش که ماندهٔ جاری هر صندوق/حساب را نشان دهد.

5. **گزارش ورود/خروج صندوق بر اساس بازهٔ تاریخ (۱۸۲):** یک گزارش دوطرفه که برای یک صندوق/حساب و یک بازهٔ تاریخ شمسی، ورودی‌ها (`payment_receipts`) و خروجی‌ها (`payment_vouchers`) را کنار هم با ماندهٔ تجمعی نشان دهد.
   - از الگوی امن receivables (RPC + `has_any_role` + `requireAnyRole`) و تاریخ شمسی استفاده کن.

**زیرگام‌بندی:**
- ۹.۱ `account_type` روی `bank_accounts` + جدول `payment_vouchers` + RLS.
- ۹.۲ اتصال پرداخت خرید به voucher.
- ۹.۳ تابع/ویو ماندهٔ حساب + صفحهٔ نمایش مانده.
- ۹.۴ گزارش ورود/خروج صندوق با تاریخ شمسی.
- ۹.۵ افزودن چک (کانال + فیلدهای چک) در هر دو سمت دریافت/پرداخت.

**تست خودکار فاز ۹:**
```sql
SELECT table_name FROM information_schema.tables WHERE table_name='payment_vouchers';
SELECT column_name FROM information_schema.columns WHERE table_name='bank_accounts' AND column_name='account_type';
```
- build سبز.
- **تست جریان کامل (گزارش‌شده):**
  1. تعریف یک صندوق نقدی (`account_type='cash'`).
  2. ثبت یک سند پرداخت خروجی از آن صندوق → تأیید کاهش ماندهٔ محاسبه‌شده.
  3. ثبت یک دریافت به همان صندوق → تأیید افزایش مانده.
  4. گزارش ورود/خروج با بازهٔ تاریخ شمسی → نمایش درست دو طرف + ماندهٔ تجمعی.
  5. ثبت یک پرداخت با کانال «چک» و شمارهٔ چک.

**گزارش فاز ۹.**

---

## بخش ۴ — گزارش نهایی (بعد از فاز ۹)

یک فایل `docs/execution/FINAL-REPORT.md` بساز شامل:

1. **جدول ۵۴ آیتم با وضعیت نهایی** (قبل → بعد): چه چیزی از ❌/⚠️/🔶 به ✅ رسید.
2. **فهرست همهٔ migrationهای ساخته‌شده** (شماره + یک‌خط توضیح).
3. **فهرست فایل‌های فرانت تغییرکرده** (گروه‌بندی per فاز).
4. **نتیجهٔ همهٔ تست‌های خودکار** (pass/fail).
5. **کارهای باقی‌مانده / خارج از دامنه:**
   - OCR تصویری (۱۴۴/۱۹۳): نیازمند ثبت provider دارای vision در `ai_providers` — پیکربندی، نه کد. (طبق پکیج F، زیرساخت آماده است؛ فقط باید یک provider با `capabilities` شامل `vision` و `vision_model` معتبر و کلید ثبت شود، سپس با `testProviderCapability(...,"vision")` تست شود.)
   - پرداخت جزئی خرید (اگر بعداً برای aging دقیق payables لازم شد).
   - لیدربرد Realtime واقعی (الان polling ۱۲۰ ثانیه؛ اگر «لحظه‌ای واقعی» لازم شد، افزودن Supabase Realtime).
   - یکپارچه‌سازی کامل سه مدل شخص (`suppliers`/`external_parties` به `persons`) اگر لازم شد.
6. **تأیید سلامت:** `git log --oneline` فازها + تأیید اینکه دادهٔ موجود سالم مانده.

---

## بخش ۵ — چک‌لیست نهایی پذیرش

- [ ] هر ۹ فاز `DONE` در `PROGRESS.md`.
- [ ] همهٔ تست‌های خودکار هر فاز pass شده.
- [ ] build نهایی سبز؛ بدون خطای type/eslint جدید.
- [ ] زنجیرهٔ سرمایه با دادهٔ امتیاز کارشناس، سقف اعتبار غیرصفر تولید می‌کند.
- [ ] واحد پول همه‌جا تومان.
- [ ] گزارش‌های سررسیدی سطل سنی دارند.
- [ ] کپی گروهی فروش با انتخاب حالت قیمت کار می‌کند.
- [ ] پل customer↔person و ایمپورت اشخاص کار می‌کند.
- [ ] کارت فاکتور موازی حذف؛ فیش بدون پیش‌فاکتور (اعتبار مثبت) کار می‌کند.
- [ ] سقف رندوم کانال + امتیاز مارکتینگ در لیدربرد.
- [ ] مدل چندانباره کامل: ساخت/ویرایش/حذف انبار، موجودی عددی، کسر هنگام قطعی، چک موجودی، انتقال، گزارش کاردکس شمسی.
- [ ] خزانه: سند پرداخت خروجی، صندوق، ماندهٔ صندوق، گزارش ورود/خروج، چک.
- [ ] `FINAL-REPORT.md` کامل.
- [ ] دادهٔ موجود تخریب نشده؛ هیچ drop/truncate ناخواسته.

---

## بخش ۶ — یادآوری‌های پایانی

- **فاز‌به‌فاز، بی‌وقفه، تا آخر.** فقط برای شکست تست (بعد از یک تلاش رفع) یا ریسک تخریب داده مکث کن.
- **بعد از هر فاز `PROGRESS.md` را commit کن** — این تنها راه بازیابی بعد از پایان context است.
- **migration اتمیک + idempotent + `ON_ERROR_STOP=1`.**
- **دادهٔ موجود مقدس است:** بدون تأیید، هیچ `DROP`/`TRUNCATE`/تغییر نوع ستونِ پرِ داده.
- **الگوهای موجود را کپی کن** (بخش ۰.۵)، از نو اختراع نکن.
- **هیچ کلید/رمز را چاپ نکن.**
- گزارش هر فاز: فارسی، مستقیم، با شواهد (فایل:خط، شماره migration، خروجی تست).