# پکیج J — گزارش‌های مالی سررسیدی (aging) — آیتم‌های ۱۵۰ و ۱۵۱

## خلاصهٔ پکیج
هر دو گزارش «سررسیدی» در سیستم **وجود دارند و کاملاً سیم‌کشی شده‌اند**: صفحهٔ «مطالبات مشتریان» (`/accounting/receivables`) و «بدهی تأمین‌کنندگان» (`/accounting/payables`)، هر دو با RPCهای اختصاصی (`get_receivables_*` / `get_payables_*`)، ویوهای پایه (`vw_customer_receivables` / `vw_supplier_payables`)، محافظ نقش (admin/manager/accountant) و ثبت در منوی ناوبری. **فیلد سررسید (due date) وجود دارد** — روی `invoices` به‌صورت صریح (`due_date`, `settlement_due_date`, ...) و روی `purchases` به‌صورت محاسبه‌شده (`purchase_date + payment_terms.days`). تنها شکاف نسبت به یک گزارش «aging» کلاسیک این است که بازه‌بندی به‌صورت **معوق / امروز / فردا / آینده** است و **نه** سطل‌های استاندارد ۰-۳۰ / ۳۰-۶۰ / ۶۰-۹۰ / ۹۰+. به همین دلیل هر دو آیتم `🔶 جزئی` ارزیابی می‌شوند: گزارش «بر اساس سررسید» ساخته شده و کار می‌کند، اما «دسته‌بندی سنی» (aging buckets) پیاده نشده است.

---

### آیتم ۱۵۰ — گزارش سررسیدی مطالبات مشتریان (aging receivables)

**وضعیت:** 🔶 جزئی

**پاسخ کوتاه:** گزارش مطالبات مشتریان بر اساس تاریخ سررسید به‌طور کامل ساخته، به بک‌اند وصل و در منو نصب شده و فیلد سررسید واقعاً وجود دارد؛ اما بازه‌بندی سنی استاندارد (۰-۳۰/۳۰-۶۰/۶۰-۹۰/۹۰+) پیاده نشده و به‌جای آن فقط چهار حالت معوق/امروز/فردا/آینده ارائه می‌شود.

**شواهد:**
- **فیلد سررسید (بررسی اول — کلیدی):** روی `invoices` این ستون‌ها وجود دارند (`information_schema.columns`): `due_date (date)`, `collection_due_date (date)`, `expected_settlement_date (date)`, `actual_settlement_date (timestamptz)`, `settlement_due_date (date)`, `settlement_days (integer)`. ویو از `i.due_date` استفاده می‌کند. برای پیش‌فاکتور (`sales_quotes`) ستون due مستقیم نیست و ویو `q.expires_at::date` را به‌عنوان سررسید می‌گیرد. ⟹ **فیلد سررسید موجود است.**
- **L1 (UI):** `src/routes/_app.accounting.receivables.tsx:150` کامپوننت `ReceivablesPage`؛ کارت‌های خلاصه (خط ۲۲۹-۲۵۹: کل/معوق/سررسید امروز/سررسید فردا/آینده/تعداد)، فیلتر «وضعیت سررسید» (خط ۳۲۱-۳۴۱)، جدول با ستون «سررسید» و بَج «معوق/… روز» (خط ۴۳۶-۴۵۳)، شیت جزئیات (خط ۵۶۴+). در منو ثبت شده: `src/lib/navigation/registry.ts:366` با label «مطالبات مشتریان».
- **L2 (front):** سه `useQuery` → RPCهای `get_receivables_summary` (خط ۱۶۶)، `get_receivables_list` با `p_due_filter` (خط ۱۸۱-۱۸۹)، `get_receivable_detail` (خط ۲۰۰). دادهٔ واقعی، بدون mock.
- **L3 (DB):** `get_receivables_list(date,date,uuid,text,text,int,int)` روی `vw_customer_receivables` کوئری می‌زند؛ `p_due_filter` فقط `all/overdue/today/tomorrow/future` را می‌پذیرد (در غیر این صورت `RAISE EXCEPTION 'invalid due filter'`). ویو `outstanding_amount = GREATEST(total_amount - deposit - confirmed_paid, 0)`، `is_overdue = due_date < CURRENT_DATE AND outstanding>0`، `days_until_due = due_date - CURRENT_DATE`؛ فقط فاکتورهای `commitment_confirmed = true` و غیرلغوشده با مانده > ۰ (به‌علاوهٔ پیش‌فاکتورهای `accepted`). `get_receivables_summary` جمع‌ها را با `FILTER (WHERE is_overdue)` / `due_date = CURRENT_DATE` / `= CURRENT_DATE+1` / `> CURRENT_DATE+1` می‌سازد — **بدون سطل ۰-۳۰/۳۰-۶۰/۶۰-۹۰/۹۰+**.
- **L4 (access):** route guard `requireAnyRole(["admin","manager","accountant"])` (خط ۴۵-۴۷)؛ خودِ RPCها هم `IF NOT has_any_role(auth.uid(), ['admin','manager','accountant']) THEN RAISE 'forbidden' (42501)`. ماژول `accounting` در `role_permissions` seed نشده اما این گزارش با `has_any_role` مستقیم (نه `has_dynamic_permission`) محافظت می‌شود، پس مستقل از seed کار می‌کند.

**شکاف نسبت به نیازمندی:** اگر «گزارش سررسیدی» به معنای «گزارش بر اساس تاریخ سررسید» باشد، کامل است. اگر به معنای «aging» کلاسیک با ستون‌های سنی ۰-۳۰/۳۰-۶۰/۶۰-۹۰/۹۰+ (بر مبنای تعداد روز گذشته از سررسید) باشد، این بخش **وجود ندارد**؛ فعلاً فقط چهار وضعیت گسسته (معوق/امروز/فردا/آینده) هست.

**برنچ:** بله — فایل‌ها و توابع در working tree فعلی (`feature/navigation-modernization`=سرور) موجودند.

**وابستگی‌ها:** `vw_customer_receivables`، `payment_receipt_links` + `payment_receipts` (برای پرداخت تأییدشده)، `invoices.due_date`/`commitment_confirmed`، `sales_quotes.expires_at`.

**برای رفع چه لازم است:** افزودن سطل‌های سنی به ویو/توابع (مثلاً ستون‌های current / 1-30 / 31-60 / 61-90 / 90+ بر مبنای `CURRENT_DATE - due_date`) و نمایش آن‌ها در خلاصه و جدول UI. زیرساخت سررسید و مانده کامل است؛ صرفاً یک لایهٔ دسته‌بندی و چند ستون UI اضافه می‌شود.

**ریسک/پیچیدگی:** پایین — همهٔ داده‌های لازم (due_date، outstanding، days_until_due) موجود است؛ کار عمدتاً افزودن bucketing و ستون‌های نمایشی است.

---

### آیتم ۱۵۱ — گزارش سررسیدی بدهی تأمین‌کنندگان (aging payables)

**وضعیت:** 🔶 جزئی

**پاسخ کوتاه:** گزارش بدهی تأمین‌کنندگان بر اساس سررسید پرداخت به‌طور کامل ساخته و به بک‌اند وصل است و سررسید از `purchase_date + payment_terms.days` محاسبه می‌شود؛ اما مانند طرف مطالبات، بازه‌بندی سنی استاندارد ندارد و مانده به‌صورت «همه‌یا‌هیچ» (پرداخت‌شده=۰، وگرنه کل مبلغ) است نه پرداخت جزئی.

**شواهد:**
- **فیلد سررسید:** جدول `purchases` ستون `due_date` صریح **ندارد**؛ ستون‌های مرتبط: `purchase_date (date)`, `payment_term_id (uuid)`, `paid_at (timestamptz)`, `paid_by (uuid)`. ویو `vw_supplier_payables` سررسید را محاسبه می‌کند: `CASE WHEN pt.days IS NOT NULL THEN (p.purchase_date + (pt.days||' days')::interval)::date ELSE p.purchase_date END` با `LEFT JOIN payment_terms pt ON pt.id = p.payment_term_id`. ⟹ **سررسید به‌صورت محاسبه‌شده موجود است** (نه ستون فیزیکی).
- **L1 (UI):** `src/routes/_app.accounting.payables.tsx:157` کامپوننت `PayablesPage`؛ کارت‌های خلاصه (خط ۲۴۶-۲۷۶)، فیلتر «وضعیت سررسید» (خط ۳۳۸-۳۵۸)، سوییچ «نمایش پرداخت‌شده‌ها» (خط ۳۹۷-۴۰۷)، جدول با ستون‌های «سررسید/مدت پرداخت/مانده/وضعیت» (خط ۴۴۹-۴۹۹)، شیت جزئیات + اقلام خرید (خط ۵۸۸+). در منو: `src/lib/navigation/registry.ts:373` با label «بدهی تأمین‌کنندگان».
- **L2 (front):** `get_payables_summary` (خط ۱۷۴)، `get_payables_list` با `p_due_filter` و `p_include_paid` (خط ۱۹۷-۲۰۶)، `get_payable_detail` (خط ۲۱۷). دادهٔ واقعی.
- **L3 (DB):** `get_payables_list(date,date,uuid,text,text,int,int,bool)` و `get_payables_summary(...)` روی `vw_supplier_payables`. در ویو: `is_paid = (paid_at IS NOT NULL)`؛ `outstanding_amount = CASE WHEN paid_at IS NOT NULL THEN 0 ELSE COALESCE(cash_price, total_amount, 0) END` (⟹ **بدون پشتیبانی پرداخت جزئی**)؛ `days_until_due` و `is_overdue` بر مبنای سررسید محاسبه‌شده. `get_payables_summary` با `WHERE is_paid = false` و همان FILTERهای معوق/امروز/فردا/آینده — **بدون سطل ۰-۳۰/۳۰-۶۰/۶۰-۹۰/۹۰+**.
- **L4 (access):** route guard `requireAnyRole(["admin","manager","accountant"])` (خط ۴۵-۴۷)؛ RPCها هم internally `has_any_role(...)` را چک می‌کنند (`forbidden`/42501). مستقل از seed ماژول `accounting`.

**شکاف نسبت به نیازمندی:** دو شکاف: (۱) نبود دسته‌بندی سنی (aging buckets) مانند آیتم ۱۵۰؛ (۲) مانده تأمین‌کننده «همه‌یا‌هیچ» است و پرداخت جزئی خرید ردیابی نمی‌شود — اگر گزارش بدهی سررسیدی نیاز به مانده‌ی جزئی داشته باشد، ناقص است. ضمناً وقتی `payment_term_id` خالی باشد سررسید = تاریخ خرید در نظر گرفته می‌شود.

**برنچ:** بله — در working tree فعلی موجود است.

**وابستگی‌ها:** `vw_supplier_payables`، `purchases.payment_term_id` → `payment_terms.days`، `purchases.paid_at`، `suppliers`.

**برای رفع چه لازم است:** افزودن سطل‌های سنی به ویو/توابع payables، و در صورت نیاز به مانده‌ی دقیق، مدل‌سازی پرداخت‌های جزئی خرید (به‌جای پرچم `paid_at` باینری) تا `outstanding_amount` واقعی محاسبه شود. برای aging صرف، فقط bucketing و ستون‌های UI کافی است.

**ریسک/پیچیدگی:** پایین تا متوسط — bucketing سنی پایین است؛ اما اگر پرداخت جزئی خرید هم لازم شود، متوسط (نیاز به مدل دادهٔ پرداخت خرید).

---

## بخش پشتیبان J3 — فهرست گزارش‌های موجود در سیستم (baseline)

| مسیر (route) | URL | عنوان فارسی | محافظ | ماهیت |
|---|---|---|---|---|
| `_app.reports.tsx` | `/reports` | گزارش‌ها | `requirePermission("reports","view")` | صفحهٔ گزارش با ۳ تب: **بازاریابی**، **فروش**، **مالی** |
| `_app.accounting.receivables.tsx` | `/accounting/receivables` | مطالبات مشتریان | `requireAnyRole(admin,manager,accountant)` | گزارش سررسیدی مطالبات (آیتم ۱۵۰) |
| `_app.accounting.payables.tsx` | `/accounting/payables` | بدهی تأمین‌کنندگان | `requireAnyRole(admin,manager,accountant)` | گزارش سررسیدی بدهی (آیتم ۱۵۱) |
| `_app.dashboard.tsx` | `/dashboard` | داشبورد | (route اصلی) | KPIهای کلی |
| `_app.gamification.admin.analytics.tsx` | `/gamification/admin/analytics` | تحلیل گیمیفیکیشن | — | تحلیل باشگاه/گیمیفیکیشن |

**جزئیات `/reports` (`_app.reports.tsx`):**
- **تب بازاریابی** (خط ۵۹-۶۷): ۵ کارت واقعی — `MarketingTrendingCard`, `MarketingTopCheckedTodayCard`, `MarketingEmergingProductsCard`, `MarketingPromotionSuggestionsUsedCard`, `MarketingActiveChannelsCard` (import خط ۱۶-۲۰).
- **تب فروش** (`SalesReportTab`, خط ۸۱): KPI تعداد فاکتور/جمع/پرداخت‌شده + وضعیت فاکتورها + ۵ مشتری برتر؛ مستقیماً از جدول `invoices` (خط ۸۹-۹۴) کوئری می‌زند (بازهٔ روز اخیر، بدون RPC).
- **تب مالی** (`FinanceReportTab`, خط ۲۲۳): کارت‌های جمع مطالبات/معوقات/سررسید امروز/وصولی.
  - ⚠️ **باگ احتمالی (شاهد کد):** این تب در خط ۲۳۰-۲۳۳ از `vw_customer_receivables` ستون‌های `total_receivables, overdue_receivables, due_today_receivables, future_receivables` را select می‌کند، اما ویو **چنین ستون‌هایی ندارد** (ستون‌های واقعی: `outstanding_amount`, `is_overdue`, `due_date`, ...). این کوئری در عمل خطا/داده‌ی خالی برمی‌گرداند. (خارج از دامنهٔ آیتم‌های ۱۵۰/۱۵۱ اما بخشی از baseline گزارش‌ها.) پرداخت‌ها از `payment_receipts` (خط ۲۵۵) خوانده می‌شود.

**الگویی که یک گزارش جدید باید دنبال کند:** برای گزارش‌های مالی سنگین، الگوی receivables/payables (RPC با `SECURITY DEFINER` + چک `has_any_role` + ویو پایه + محافظ `requireAnyRole` در route + ثبت در `registry.ts`) الگوی درست و امن است؛ الگوی `SalesReportTab`/`FinanceReportTab` (کوئری مستقیم از جدول/ویو در فرانت) سبک‌تر ولی شکننده‌تر است (نمونهٔ باگ ستون‌ها بالا).

---

## بخش پشتیبان J4 — الگوی محاسبهٔ مانده/بدهی مشتری (پایهٔ هر دو گزارش)

**منبع اصلی مانده/طلب مشتری = ویو `vw_customer_receivables`**، نه توابع اعتبار. فرمول مانده در ویو:

```
outstanding_amount = GREATEST(
    total_amount
    - COALESCE(deposit_amount, 0)
    - COALESCE(confirmed_paid_amount, 0),   -- جمع payment_receipt_links با receipt status ∈ (approved,verified,confirmed,posted)
    0
)
```
با شرط‌های `commitment_confirmed = true`، `status <> 'cancelled'`، `outstanding > 0`؛ به‌علاوهٔ پیش‌فاکتورهای `accepted` (مانده = `final_amount - confirmed_paid`). این همان پایه‌ای است که `get_receivables_list/summary/detail` روی آن می‌نشینند.

**تفکیک از توابع «اعتبار» (که مانده نیستند):**
- `calculate_customer_realtime_credit(uuid)` → `jsonb`: **سقف اعتبار پویا** را حساب می‌کند (تخصیص سرمایهٔ فروشنده × سهم امتیاز مشتری، محدودشده با `credit_limit`)، نه بدهی. اگر `customer_credit_profile.has_overdue = true` باشد سقف را ۰ برمی‌گرداند (`binding_constraint='overdue'`). وابسته به `calculate_dynamic_score`, `salesperson_capital_allocations_dynamic`, `customer_capital_allocations_dynamic`, `daily_capital_settings`.
- `get_customer_dynamic_credit(uuid)` نیز موجود است (هم‌خانوادهٔ اعتبار).
- جداول مرتبط اعتبار که در DB وجود دارند: `customer_credit_profile`, `customer_credit_balance`, `customer_credit_ledger`, `customer_capital_allocations_dynamic` (تأییدشده با `information_schema.tables`).

**جمع‌بندی J4:** برای «بدهی/طلب» در گزارش‌های سررسیدی، مبنا **`vw_customer_receivables.outstanding_amount`** است (فاکتور محور). توابع `calculate_customer_realtime_credit` / `get_customer_dynamic_credit` مربوط به **سقف اعتبار** هستند و نباید با مانده اشتباه گرفته شوند؛ جداول `customer_credit_balance`/`customer_credit_ledger` هم لایهٔ اعتبار/دفترکل اعتبار را نگه می‌دارند، نه مانده‌ی سررسیدی فاکتورها.
