# گزارش تأیید (Verification) — آیتم‌های ۱۴۰ تا ۱۹۳

> **نوع مأموریت:** فقط‌خواندنی. هیچ کد، migration، یا نوشتنی روی DB انجام نشد.
> **تاریخ:** 2026-07-26 · **برنچ:** `feature/navigation-modernization` · **DB:** `afrakala`
> **HEAD:** `8538924b` · **git status:** پاک (تنها فایل untracked: `docs/execution/AfraKala-verification-prompt-140-193.md`)
> **روش اتصال:** `psql -U supabase_admin -d afrakala` روی کانتینر `afrakala-lan-db`.

---

## ۰ — خلاصهٔ مدیریتی (یک نگاه)

| سنجه | نتیجه |
|---|---|
| فازهای ادعاشده DONE در `PROGRESS.md` | ۹ از ۹ |
| فازهایی که **کدشان** مستقلاً تأیید شد | **۹ از ۹** ✅ |
| موارد «ساخته‌شده ولی mount نشده» (نقض قانون ۱) | **۰** |
| موارد «جدول/تابع بی‌اتصال» (نقض قانون ۲) | **۰** |
| نقص اجرا (کد غلط/ناقص که باید رفع شود) | **۰** |
| گام عملیاتی انجام‌نشده (کد آماده، داده وارد نشده) | **۳ مورد** ⚠️ |
| ریسک تخریب داده | **۰** — همهٔ شمارش‌ها سالم |
| خطای type جدید | **۰** (کل `tsc --noEmit` = ۷۰ = baseline از پیش موجود) |

**نتیجهٔ کلی:** ادعای `PROGRESS.md` صادق است. هیچ موردی پیدا نشد که «DONE» اعلام شده ولی شاهد آن را رد کند.
**اما** سه زیرسیستم بزرگ (زنجیرهٔ سرمایه، چندانباره، اشخاص) از نظر کد کامل‌اند و از نظر داده **خالی**، پس در مرورگر «کار نمی‌کنند» تا وقتی گام عملیاتی‌شان انجام شود. مهم‌ترین‌شان در §۳.۱ آمده.

---

## ۱ — جدول تأیید فاز‌به‌فاز

### فاز ۱ — رفع‌های داده و پیکربندی

| آیتم | چه چیزی چک شد | وضعیت | شاهد |
|---|---|---|---|
| ۱.۱ / نقش خرید | `purchasing_expert` صفر شده باشد | ✅ ساخته‌شده و متصل | `SELECT count(*) … role_name='purchasing_expert'` → **0**؛ `DISTINCT role_name` شامل `purchase_specialist` (۷ نقش) |
| ۱.۲ / ۱۵۷ KPI سود | هر دو KPI فعال با وزن>۰ | ✅ ساخته‌شده و متصل | `profit_per_talk_minute` → `t / 0.002`؛ `total_profit` → `t / 0.0002` |
| ۱.۳ / ۱۹۲ بوست نامزدی | غیرصفر | ✅ ساخته‌شده و متصل | `boost_per_nomination=5`, `boost_cap_per_product=15` |
| ۱.۴ / ۱۶۲ صفحهٔ KPI در منو | ثبت + هم‌ترازی دسترسی | ✅ ساخته‌شده و متصل | `registry.ts:529-534` با `adminOnly: true`؛ `_app.gamification.tsx:84` `isAdmin = hasAnyRole(roles,["admin"])` و `:216` شرط نمایش لینک |
| ۱.۵ امتیازدهی کارشناس | راه الف یا ب | ✅ ساخته‌شده و متصل (راه الف) | `_app.accounting.salesperson-scoring.tsx:23` `requireAnyRole(["admin","accountant"])`، `:68` `DynamicScoringSection entityType="salesperson"`؛ ثبت در `registry.ts:475`؛ `/users/$userId` **دست‌نخورده** (`requireAdmin()` در `:18`) |
| ۱.۶ کوئری خراب گزارش | ستون‌های ناموجود حذف | ✅ ساخته‌شده و متصل | grep ستون‌های `total_receivables|overdue_receivables|…` در `_app.reports.tsx` → **خالی**؛ `:232` `supabase.rpc("get_receivables_summary")` |
| **۱.۷ 🔴 زنجیرهٔ سرمایه** | داده زنده | **⚠️ گام عملیاتی — نقص کد نیست** | `dynamic_entity_scores WHERE entity_type='salesperson'` → **0** (فقط ۲۸ ردیف `customer`)؛ `salesperson_capital_allocations_dynamic` → **۱۲۶ ردیف ولی `allocated_capital>0` = 0**؛ `customer_capital_allocations_dynamic` → **0** |

**تفسیر ۱.۷ (مهم):** زیرساخت و دسترسی کامل است، ولی **هیچ امتیاز کارشناسی وارد نشده**. طبق طراحی، سهم سرمایه از امتیاز کارشناس مشتق می‌شود؛ با امتیاز صفر، تخصیص صفر می‌شود و در نتیجه سقف اعتبار مشتری صفر می‌ماند. وجود ۱۲۶ ردیف تخصیصِ همه‌صفر نشان می‌دهد تخصیص **اجرا شده** ولی ورودی‌اش صفر بوده. **این باگ نیست؛ ورود داده لازم است** (§۴.۲).

---

### فاز ۲ — واحد پول تومان

| آیتم | چه چیزی چک شد | وضعیت | شاهد |
|---|---|---|---|
| ۲.۱ سه فایل بحرانی | «ریال» نمانده | ✅ | grep «ریال» در `InvoiceForm.tsx` / `_app.accounting.dynamic-capital.tsx` / `_app.operations.receipts.tsx` → **هر سه خالی** |
| ۲.۲ پیش‌فرض formatCurrency | تومان | ✅ | `formatters.ts:12` → `currency = "تومان"` |
| ۲.۳ شاخهٔ OCR ریال→تومان | شاخهٔ اصلی هم تقسیم کند | ✅ | `receipt-extraction.ts:184-185` (شاخهٔ برچسب‌دار) و `:203-204` (fallback) — **هر دو** `isRial ? Math.round(n/10) : n` + هشدار در `:189`/`:208` |
| ۲.۴ (اضافه بر پرامپت) سمت DB | پیام خطای تریگرها | ✅ | `enforce_payment_receipt_link_limits` و `enforce_receipt_approval_allocation_limits` → `has_rial=f, has_toman=t`؛ **تعداد کل توابع با «ریال» = 0** |
| ۲.۵ (اضافه) سرتاسر `src` | «ریال» باقی‌مانده | ✅ | تنها بازمانده‌ها: regex/تشخیص در `receipt-extraction.ts` و type union `canonical.ts:51`. تأیید شد **هیچ‌جا** `currency: "ریال"` ست نمی‌شود (`builders.ts:136,163` هر دو `"تومان"`) ⟹ نشت نمایشی صفر |

---

### فاز ۳ — گزارش‌های سررسیدی aging

| آیتم | چه چیزی چک شد | وضعیت | شاهد |
|---|---|---|---|
| ۳.۱ ستون سطل روی ویوها | هر دو ویو | ✅ | `information_schema.columns` → `vw_customer_receivables|aging_bucket` و `vw_supplier_payables|aging_bucket` |
| ۳.۲ توابع summary | سطل برمی‌گردانند | ✅ | `get_receivables_summary` → `t`؛ `get_payables_summary` → `t` |
| ۳.۲b توابع list | سطل در خروجی | ✅ | `get_receivables_list` → `t`؛ `get_payables_list` → `t` |
| ۳.۲c محاسبهٔ زنده | واقعاً مقدار می‌دهد | ✅ | receivables: `current=2`؛ payables: `d1_30=1` |
| ۳.۳ UI (قانون ۱) | واقعاً رندر می‌شود | ✅ ساخته‌شده و متصل | receivables: import `:14`، **رندر** `AgingBucketCards :277`، ستون «سطل سنی» `:458`، `AgingBucketBadge :478,:535` — و payables: `:14, :294, :490, :513, :564` |

---

### فاز ۴ — کپی گروهی + آموزش

| آیتم | چه چیزی چک شد | وضعیت | شاهد |
|---|---|---|---|
| ۴.۱ انتخاب چندتایی + کپی گروهی | state + تابع + دکمه | ✅ | `_app.sales.search.tsx:404` `selectedProductIds: Set<string>`، `:416` `toggleProductSelection`، `:442` `handleBulkCopySalesText`، دکمه `:944`، «انتخاب همه» `:924` |
| ۴.۱b تابع تک‌محصولی دست‌نخورده | هنوز موجود | ✅ | `handleCopySalesText` در `:1260` و دکمهٔ خودش در `:1620` — مسیر موازی، دست‌نخورده |
| ۴.۲ دیالوگ حالت قیمت | باز شدن با اولین انتخاب | ✅ | `:409` `collectPriceModes`، `:411` `openPriceModeDialog`، فراخوان با اولین انتخاب `:423` و «انتخاب همه» `:438`، دیالوگ `:1054` با عنوان «کدام حالت‌های قیمت در متن بیاید؟» `:1057` |
| ۴.۳ صفحهٔ آموزش (قانون ۱) | route فعال + لینک | ✅ ساخته‌شده و متصل | فایل `_app.gamification_.admin_.manual-metrics_.guide.tsx`؛ **در routeTree** `routeTree.gen.ts:1236`؛ کامپوننت واقعاً استفاده شده (`guide.tsx:12 component: ManualMetricsGuide`)؛ دکمهٔ «راهنما» در `manual-metrics.tsx:282-284` |

---

### فاز ۵ — پل اشخاص + ایمپورت

| آیتم | چه چیزی چک شد | وضعیت | شاهد |
|---|---|---|---|
| ۵.۱ پل customer↔person (**قانون ۱**) | واقعاً فراخوانده شود | ✅ ساخته‌شده و متصل | زنجیرهٔ کامل: `_app.sales_.customers_.$customerId.edit.tsx:9` import + **رندر در `:45`** → `CustomerPersonLink.tsx:36-37` `useServerFn(linkCustomerToPerson/unlinkCustomerFromPerson)` → RPCهای DB. تأیید DB: `customer_set_person`, `customer_clear_person` موجود؛ `customers.person_id uuid` موجود |
| ۵.۲ ایمپورت اشخاص | SheetJS + درج | ✅ ساخته‌شده و متصل | `PersonImportForm.tsx:134` `XLSX.utils.sheet_to_json`، `:233` `createPersonFn`، `:285` `action:"persons_imported"`؛ route `_app.persons_.import.tsx:36` **رندر** `<PersonImportForm />` با گارد `:14`؛ ورودی از `_app.persons.tsx:114` + `registry.ts:360`/`:1157` |
| **۵.۳ دادهٔ زنده** | آیا استفاده شده؟ | **⚠️ گام عملیاتی** | `persons` → **0 ردیف**؛ `customers WHERE person_id IS NOT NULL` → **0**؛ `audit_logs action='persons_imported'` → **0** |

**تفسیر ۵.۳:** چون جدول `persons` خالی است، جستجوی PersonPicker هیچ نتیجه‌ای نمی‌دهد و پل عملاً قابل استفاده نیست تا اولین شخص (دستی یا با ایمپورت) ساخته شود. کد سالم است.

---

### فاز ۶ — یکی‌سازی پیش‌فاکتور + فیش بدون لینک

| آیتم | چه چیزی چک شد | وضعیت | شاهد |
|---|---|---|---|
| ۶.۱ دادهٔ invoices | تخریب نشده | ✅ | `count(*) FROM invoices` → **0** (همان مقدار تحقیق)؛ **`invoices` و `invoice_items` هر دو موجود ⟹ drop نشده** |
| ۶.۲ کارت فاکتور موازی | حذف از `/sales` | ✅ | هابِ واقعی `_app.sales.index.tsx` است (نه `_app.sales.tsx` که layout است). فهرست کامل `Link to=` در هاب: customers, search, stock-alerts, **quotes**, quote-share-logs, send-queue — **هیچ لینکی به invoices**. ورودی‌های منو هم `hiddenFromMenu: true` برای `/sales/invoices` و `/invoices` |
| ۶.۳ فیش بدون پیش‌فاکتور | ممکن + راهنما | ✅ | `receipt-types.ts` → `requiresInvoiceLinks(t) { return t === "invoice_payment"; }` ⟹ سه نوع دیگر بدون لینک مجازند. اجبار فقط در `PaymentReceiptForm.tsx:877-879`. راهنمای فارسی در `:1239-1241` («دریافت بدون پیش‌فاکتور…»). جداول اعتبار موجود: `customer_credit_balance/ledger/profile` |
| ۶.۳b چک سمت دریافت | کانال + فیلد | ✅ | CHECK کانال `payment_receipts` شامل `'cheque'`؛ ستون‌های `cheque_number`, `cheque_due_date`؛ zod آینهٔ همان دو CHECK در `:252-257` |
| ۶.۴ پیش‌فاکتور ردشده با دلیل | ثبت + نمایش | ✅ ساخته‌شده و متصل | نوشتن: `_app.sales.quotes.new.tsx:641` `action:"sales_quote_rejected"`؛ خواندن: RPC `get_my_rejected_quotes` موجود در DB و فراخوانده در `_app.my-rejected-quotes.tsx:38`؛ route در `routeTree.gen.ts:333` و `registry.ts:327` |
| ۶.۴b دادهٔ زنده | لاگ رد | ℹ️ اطلاعی | `audit_logs action='sales_quote_rejected'` → **0** (هنوز هیچ ثبتی رد نشده — طبیعی) |

---

### فاز ۷ — مارکتینگ

| آیتم | چه چیزی چک شد | وضعیت | شاهد |
|---|---|---|---|
| ۷.۱ سقف رندوم کانال | هر کانال ≤ سقف | ✅ | **تست معتبر per-channel:** کانال `4f009d0f…` با `daily_quota=5` → `returned=5`, `within_quota=t` |
| ۷.۱b رندوم پایدار | نشانه در تابع | ✅ | `uses_md5=t`, `uses_row_number=t`, **`still_old_boolean_gate=f`** (گیت بولی قبلی حذف شده) |
| ۷.۱c پایداری روزانه | دو فراخوان یکسان | ✅ | `only_in_first=0`, `only_in_second=0`, `shared=5` |
| ۷.۱d واجدشرایطی | `score>0 & stock_factor>0` | ✅ | `violations=0` روی ۱۰۰۰ ردیف |
| ۷.۲ اتصال به گیمیفیکیشن | rule + مسیر امتیاز | ✅ ساخته‌شده و متصل | `gamification_kpi_rules` → `promotion_completed / xp=15 / active=t`؛ تریگرها: `trg_promotion_nominations_score` (روی `promotion_nominations`) و `trg_audit_promotion_used_score` (روی `audit_logs`)؛ KPI شمارشی: `gamification_kpis.promotions_completed / weight=2 / enabled=t`؛ **و در محاسبه شمرده می‌شود:** `calculate_employee_score` شامل `promotions_completed` → `t` |
| ۷.۲b دادهٔ زنده | رویداد امتیاز | **⚠️ گام عملیاتی** | `employee_score_events WHERE event_type ILIKE '%promot%'` → **0** (از زمان deploy کسی پیشنهاد استفاده/نامزد نکرده) |
| ۷.۳ وزن مستقل محصول | در فرمول ویو | ✅ ساخته‌شده و متصل | `pg_get_viewdef(v_promotion_suggestions) ILIKE '%promotion_weight%'` → **t**؛ ستون `products.promotion_weight` با `default 1`, `NOT NULL`؛ **۳۵۴ محصول همه روی مقدار خنثی ۱، ۰ محصول تنظیم‌شده ⟹ بدون regression** |

---

### فاز ۸ — چندانباره (بزرگ‌ترین)

| آیتم | چه چیزی چک شد | وضعیت | شاهد |
|---|---|---|---|
| ۸.۱ پنج جدول | وجود | ✅ | `warehouses`, `warehouse_stock`, `stock_movements`, `stock_transfers`, `stock_transfer_items` — هر ۵ |
| ۸.۲ RLS + seed ماژول | فعال + seed | ✅ | `relrowsecurity=t` روی هر ۵؛ policy: warehouses **۴**، بقیه **۲** هرکدام؛ `module='warehouse'` seed شده برای ۵ نقش (admin/manager کامل، accountant/purchase_specialist/sales فقط `can_view`) |
| ۸.۳ تریگر خرید | افزایش موجودی + `in` | ✅ ساخته‌شده و متصل | `trg_purchase_items_stock_in` روی `purchase_items`؛ `purchases.warehouse_id` موجود؛ تابع `trg_purchase_item_stock_in` |
| ۸.۴ کسر هنگام قطعی + چک | کسر + جلوگیری | ✅ ساخته‌شده و متصل | `trg_sales_quotes_stock_out` روی `sales_quotes` (شرط `NEW.status='accepted' AND OLD.status IS DISTINCT FROM 'accepted'` — خط ۲۸۶ migration 210)؛ `sales_quotes.warehouse_id` موجود؛ `check_quote_stock_availability` موجود؛ **جلوگیری واقعی:** `apply_stock_movement` شامل پیام «موجودی کافی نیست» → `t` و `FOR UPDATE` → `t` (ضد race) |
| ۸.۵ انتقال بین‌انباری | تریگر confirm | ✅ | `trg_stock_transfers_confirm` (شرط `status='confirmed'`، خط ۳۷۹) + تابع `trg_stock_transfer_confirm` |
| ۸.۶ همگام‌سازی stock_status | تریگر/تابع | ✅ | `sync_product_stock_status` شامل `stock_status` → `t` |
| ۸.۶b کاردکس خودتوصیف | ستون علامت‌دار | ✅ | `stock_movements.delta` موجود (`quantity` مثبت + `delta` علامت‌دار) |
| ۸.۷ UI انبار (**قانون ۱**) | route فعال | ✅ ساخته‌شده و متصل | ۳ فایل route؛ **هر سه در `routeTree.gen.ts`** (`:23`, `:62`, `:63`)؛ ثبت منو `registry.ts:265, 272, 279` |
| ۸.۷b انتخاب انبار در فرم‌ها (**قانون ۱**) | mount واقعی | ✅ ساخته‌شده و متصل | `PurchaseForm.tsx` import `:23` + **رندر `:464`** + schema `:76` + insert `:187`؛ `quotes.new.tsx` import `:45` + **رندر `:422`** + نوشتن `:238`؛ `quotes.$quoteId.tsx` import `:43-44` + **رندر `:551`** + چک موجودی `:381` + `shortages :385`؛ `products.$id.tsx` import `:37` + **رندر `:640`** |
| ۸.۸ کاردکس شمسی | فیلتر تاریخ شمسی | ✅ | `_app.warehouses_.kardex.tsx:29` `JalaliDateInput`، `:169`/`:173` دو فیلد بازه، `:35`/`:75` `fetchStockMovements` |
| **۸.۹ 🔴 دادهٔ زنده** | جریان واقعی | **⚠️ زیرساخت خوابیده** | `warehouses` → **0 ردیف** (و `default_set=0`)؛ `stock_movements` → **0**؛ `warehouse_stock` → **0**؛ `stock_transfers` → **0**؛ **`default_warehouse_id()` → NULL** |

**تفسیر ۸.۹ — مهم‌ترین یافتهٔ عملیاتی این گزارش:** طبق طراحیِ سازگاری‌با‌گذشته، وقتی هیچ انباری تعریف نشده و سند انبار ندارد، تریگرهای موجودی **no-op** می‌کنند. یعنی همین حالا:

- ثبت خرید **موجودی را زیاد نمی‌کند**،
- قطعی‌کردن پیش‌فاکتور **موجودی را کم نمی‌کند و چک موجودی هم عملاً بی‌اثر است**،
- `WarehouseSelect` هنگام صفر بودن انبارها **هیچ چیز رندر نمی‌کند** (`WarehouseSelect.tsx:39` → `if (whQ.isLoading || warehouses.length === 0) return null;`)، پس کاربر در فرم خرید/پیش‌فاکتور **هیچ فیلد انباری نمی‌بیند**،
- `ProductStockByWarehouse` هم مخفی می‌ماند (`:30` → `return null`).

این «سکوت» عمدی و بی‌خطر است، ولی **قابل اشتباه گرفتن با خرابی**. تا اولین انبار ساخته و پیش‌فرض نشود، کل فاز ۸ در مرورگر نامرئی است. صفحهٔ `/warehouses` خودش این را با هشدار زرد می‌گوید.

---

### فاز ۹ — خزانه

| آیتم | چه چیزی چک شد | وضعیت | شاهد |
|---|---|---|---|
| ۹.۱ جدول سند پرداخت | وجود + ساختار | ✅ | `payment_vouchers` با **۲۱ ستون** شامل `payee_type` + سه FK دریافت‌کننده + `source_bank_account_id` + `cheque_number/cheque_due_date` + `purchase_id` + `voucher_number` |
| ۹.۱b account_type | ستون روی bank_accounts | ✅ | `account_type text DEFAULT 'bank'`؛ **دادهٔ موجود سالم:** تنها حساب موجود `bank` مانده |
| ۹.۱c RLS | فعال | ✅ | `relrowsecurity=t`، **۴ policy** |
| ۹.۲ کانال چک هر دو سمت | CHECK | ✅ | `payment_receipts` → `allows_cheque=t`؛ `payment_vouchers` → `allows_cheque=t` |
| ۹.۳ ماندهٔ حساب | ویو/تابع + فرمول | ✅ ساخته‌شده و متصل | ویو `vw_account_balances`؛ توابع `get_account_balances`, `get_account_ledger`, `pay_purchase_with_voucher`. فرمول تأیید شد: `uses_opening=t`, `counts_inflow=t`, `counts_outflow=t`. **خروجی زنده:** opening `100,000,000` + ورودی `10,100,000,000` = مانده `10,200,000,000` |
| ۹.۴ اتصال پرداخت خرید | ساخت voucher | ✅ ساخته‌شده و متصل | `_app.accounting.purchase-payments.tsx:44` import، `:150-153` مسیر شرطی `payPurchaseWithVoucher`، fallback رفتار قبلی وقتی حساب انتخاب نشود |
| ۹.۵ UI مانده + گزارش (**قانون ۱**) | route فعال + شمسی | ✅ ساخته‌شده و متصل | ۲ فایل route؛ **در routeTree** `:150`, `:156`؛ منو `registry.ts:440, 447, 1038, 1039`؛ treasury: `fetchAccountBalances :61`, `fetchAccountLedger :73`, `JalaliDateInput :29`, `running_balance :92`؛ bank-accounts فیلد+ستون `account_type` (`:44, :59, :80, :182`) |
| ۹.۶ دادهٔ زنده | سند/صندوق | **⚠️ گام عملیاتی** | `payment_vouchers` → **0 ردیف**؛ `bank_accounts` → فقط ۱ حساب و آن هم `bank` ⟹ **هیچ صندوق نقدی (`cash`) تعریف نشده** |

---

## ۲ — تأیید موارد «خارج از دامنه» (باید ساخته‌نشده باشند)

| مورد | انتظار | وضعیت | شاهد |
|---|---|---|---|
| ۲.الف ویزیتور (۱۸۵–۱۹۰) | موجودیت مستقل ساخته **نشده** | ✅ تأیید شد ساخته نشده | `information_schema.tables ILIKE '%visitor%'` → 0؛ `columns ILIKE '%visitor%'` → 0؛ grep `visitor|ویزیتور` در `src` → خالی |
| ۲.الف۲ انتساب خودکار (۱۸۸) | نیازمند pg_cron که نصب نیست | ✅ تأیید شد | `pg_extension WHERE extname='pg_cron'` → **0 ردیف** (در `pg_available_extensions` هست ولی **نصب نشده**) |
| ۲.ب OCR تصویری (۱۴۴/۱۹۳) | هیچ provider با `vision` | ✅ تأیید شد غیرفعال | `ai_providers`: `ollama` → `{chat,embeddings}`؛ `openai_compatible` → `{chat}`. **هیچ‌کدام `vision` در capabilities ندارند** (هرچند `ollama.vision_model=qwen3.6:latest` ست شده، capability اعلام نشده ⟹ خاموش) |
| ۲.ج لیدربرد Realtime (۱۶۱) | هنوز polling | ✅ تأیید شد polling | `useGamification.ts:40` و `:115` → `refetchInterval: 120_000`؛ هیچ `postgres_changes`/`supabase.channel`/`.subscribe(` |
| ۲.د یکپارچگی کامل اشخاص | `suppliers`/`external_parties` بدون `person_id` | ✅ تأیید شد انجام نشده | query ستون `person_id` روی آن دو جدول → **0 ردیف** (فقط پل `customers↔persons` در فاز ۵) |

---

## ۳ — یافته‌های بحرانی

### ۳.۱ 🔴 فاز ۸ در مرورگر نامرئی است (بالاترین اثر)
همان‌طور که در ۸.۹ آمد: `warehouses`=0 و `default_warehouse_id()`=NULL ⟹ تریگرهای موجودی no-op، و `WarehouseSelect`/`ProductStockByWarehouse` خودشان را مخفی می‌کنند. **نتیجه:** کاربری که انتظار دارد «کسر موجودی هنگام قطعی» کار کند، هیچ اثری نمی‌بیند و ممکن است آن را باگ بداند. **رفع: ساخت اولین انبار در `/warehouses` و تعیین آن به‌عنوان پیش‌فرض.** این نقص کد نیست.

### ۳.۲ ⚠️ هیچ ادعای نادرستی در `PROGRESS.md` پیدا نشد
هر ۹ فاز که `DONE` اعلام شده بودند، از نظر **کد و اتصال** مستقلاً تأیید شدند. ضمناً `PROGRESS.md` خودش محدودیت‌های عملیاتی (سازگاری با گذشته در فاز ۸، لزوم ورود امتیاز در فاز ۱) را صریح ثبت کرده بود ⟹ گزارش‌دهی صادقانه بوده.

### ۳.۳ ℹ️ دو کوئری خودِ پرامپت تأیید نتیجهٔ گمراه‌کننده می‌دهند
اگر کسی این پرامپت را دوباره اجرا کند، این دو مورد **نتیجهٔ منفی کاذب** می‌دهند:

1. **§۱.۲** از ستون `gamification_kpis.event_key` استفاده می‌کند که **وجود ندارد** (ستون واقعی `key` است). کوئری با `ERROR: column "event_key" does not exist` می‌شکند. با ستون درست، هر دو KPI سبزند.
2. **§۷.۱** از `compute_promotion_scores(NULL, 0, 500)` استفاده می‌کند؛ `LIMIT` سراسری (مرتب بر `final_score`) نتایج را می‌بُرد و کانالِ دارای سهمیه اصلاً در ۵۰۰ ردیف اول نمی‌آید ⟹ کوئری **۰ ردیف** برمی‌گرداند و شبیه «سقف کار نمی‌کند» به‌نظر می‌رسد. تست معتبر، فراخوانی **per-channel** با limit بزرگ است (که سبز شد: ۵ ≤ ۵).

### ۳.۴ ✅ هیچ ریسک تخریب داده‌ای پیدا نشد
- `invoices`/`invoice_items` هر دو موجود (drop نشده‌اند) و `invoices` همان ۰ ردیف تحقیق.
- ستون‌های جدید همه default امن دارند: `promotion_weight=1` (۳۵۴ محصول خنثی)، `account_type='bank'` (حساب موجود دست‌نخورده).
- **هیچ دادهٔ آزمایشیِ باقی‌مانده از تست‌های نشست اجرا نیست:** `Q-TEST-1/Q-OVER/Q-E2E` → 0؛ `TEST-CHK-GUARD/TRK-IN-1/TRK-9` → 0؛ انبارهای `WH-C/WH-N/WH-S` → 0. (تست‌ها داخل `ROLLBACK` بودند و درست برگشتند.)
- اصلاح migration 211 پایدار است: `notify_on_stock_available` → `still_broken=f`, `fixed=t`.

### ۳.۵ ℹ️ دو انحراف نام‌گذاری از متن پرامپت (اثر عملکردی ندارد)
- §۷.۳ انتظار `recommendation_override` یا `product_weight` در ویو داشت؛ پیاده‌سازی از ستون `products.promotion_weight` استفاده کرده. پلن اجرایی صریحاً «یا یک ستون سبک» را مجاز کرده بود، و `product_recommendation_overrides` (۱۵۳۵ ردیف، cross-sell محصول→محصول) برای این کار نامناسب بود. **نیاز برآورده شده.**
- §۹.۳ انتظار نام `get_account_balance` (مفرد) داشت؛ پیاده‌سازی `get_account_balances` + `get_account_ledger` است. **نیاز برآورده شده.**

---

## ۴ — کارهای باقی‌مانده (سه دستهٔ جدا)

### ۴.۱ نقص اجرا (کد ناقص/غلط که باید رفع شود)
**هیچ موردی پیدا نشد.** هیچ کامپوننتی بدون mount، هیچ جدولی بی‌اتصال، و هیچ خطای type جدیدی نبود.

### ۴.۲ گام عملیاتی (کد آماده، داده وارد نشده) — **۳ مورد**

| # | چه کاری | چرا لازم است | کجا انجام شود |
|---|---|---|---|
| ۱ | **ساخت اولین انبار + تعیین پیش‌فرض** | تا این نشود، کل فاز ۸ خوابیده است (§۳.۱): موجودی زیاد/کم نمی‌شود و فیلد انبار در فرم‌ها دیده نمی‌شود | `/warehouses` → «انبار جدید» → «تعیین به‌عنوان پیش‌فرض» |
| ۲ | **ورود امتیاز کارشناسان فروش** | تا امتیاز صفر است، تخصیص سرمایه صفر می‌ماند و سقف اعتبار مشتری صفر (§۱.۷) | `/accounting/salesperson-scoring` سپس اجرای مجدد تخصیص در `/accounting/dynamic-capital` |
| ۳ | **تعریف صندوق نقدی (`cash`)** | فاز ۹ ساخته شده ولی هیچ حساب `cash` وجود ندارد، پس «ماندهٔ صندوق» چیزی برای نشان دادن ندارد (§۹.۶) | `/accounting/bank-accounts` → نوع حساب = «صندوق نقدی» |

تکمیلی (نه مسدودکننده): ساخت اولین «شخص» تا پل customer↔person قابل استفاده شود (§۵.۳)؛ و یک بار استفاده از پیشنهاد تبلیغ تا امتیاز مارکتینگ در لیدربرد ظاهر شود (§۷.۲b).

### ۴.۳ خارج از دامنه (اصلاً در پرامپت اجرایی نبود)
1. **ویزیتور (۱۸۵–۱۹۰):** موجودیت مستقل، گزارش‌های ویزیتورمحور، انتساب خودکار. تصمیم بخش ۱ این بود که ویزیتور = `salesperson_id`؛ گزارش‌های اختصاصی ساخته نشدند. انتساب خودکار به `pg_cron` نیاز دارد که **نصب نیست**.
2. **OCR تصویری (۱۴۴/۱۹۳):** نیازمند ثبت `vision` در `capabilities` یک provider — پیکربندی، نه کد.
3. **لیدربرد Realtime (۱۶۱):** همچنان polling ۱۲۰ ثانیه.
4. **یکپارچگی کامل اشخاص:** `suppliers`/`external_parties` هنوز `person_id` ندارند.
5. **پرداخت جزئی خرید:** `purchases.paid_at` همچنان باینری (همه‌یا‌هیچ).

---

## ۵ — جدول مقایسه‌ای ۵۴ آیتم (قبل → الان)

«قبل» از `docs/research/00-SUMMARY.md`. «الان» = نتیجهٔ تأیید مستقل همین گزارش.

| # | آیتم | قبل | الان | توضیح |
|---|---|---|---|---|
| ۱۴۰الف | باگ اکسل فیش‌ها | ✅ | ✅ | خارج از این پرامپت (قبلاً رفع) |
| ۱۴۰ب | زنجیرهٔ سرمایه→اعتبار | ⚠️ | ⚠️ **کد ✅ / داده ✗** | §۱.۷ — ورود امتیاز لازم |
| ۱۴۱٫۱ | تخصیص سطح کارشناس | ⚠️ | ⚠️ کد ✅ / داده ✗ | ۱۲۶ ردیف همه‌صفر |
| ۱۴۱٫۲ | منابع/وزن امتیاز کارشناس | ⚠️ | ✅ | صفحهٔ امتیازدهی ساخته شد (۱.۵) |
| ۱۴۱٫۳ | سهم مشتری از سهم کارشناس | ✅ | ✅ | — |
| ۱۴۲ | مسئول محصول | ✅ | ✅ | — |
| ۱۴۳ | آموزش درون‌صفحه متریک | 🔶 | **✅** | route راهنما + دکمه (۴.۳) |
| ۱۴۴ | آپلود عکس فیش + استخراج | 🔶 | 🔶 | خارج از دامنه — vision پیکربندی نشده |
| ۱۴۵ | ایمپورت اکسل (اشخاص) | 🔶 | **✅** | فرم سه‌مرحله‌ای (۵.۲) |
| ۱۴۶ | کپی متن فروش چندتایی | 🔶 | **✅** | انتخاب چندتایی + دیالوگ حالت قیمت (۴.۱/۴.۲) |
| ۱۴۷ | دو مسیر پیش‌فاکتور | ✅(با بدهی) | **✅ یکی شد** | کارت موازی حذف، جدول حفظ (۶.۲) |
| ۱۴۸ | باگ ثبت فیش | 🔶 | **✅** | بدون‌لینک + راهنما + چک (۶.۳) |
| ۱۴۹ | الگوریتم پیشنهاد | ✅ | ✅ | — |
| ۱۵۰ | aging مطالبات | 🔶 | **✅** | ستون+توابع+UI (۳.۱–۳.۳) |
| ۱۵۱ | aging بدهی‌ها | 🔶 | **✅** | همان |
| ۱۵۲ | سرنوشت درخواست ردشده | ⚠️ | **✅** | دیالوگ + audit + صفحهٔ کاربر (۶.۴) |
| ۱۵۳ | امتیازدهی کارشناس | 🔶 | ✅ کد / داده ✗ | صفحه ساخته شد، داده وارد نشده |
| ۱۵۴ | سهم کارشناس بر اساس امتیاز | ⚠️ | ⚠️ کد ✅ / داده ✗ | §۱.۷ |
| ۱۵۵ | ورود دستی سرمایه روز | ✅ | ✅ | — |
| ۱۵۶ | متریک فروش | ✅ | ✅ | — |
| ۱۵۷ | متریک سود | ⚠️ | **✅** | KPIها فعال با وزن (۱.۲) |
| ۱۵۸–۱۶۰ | تماس ورودی/خروجی/مکالمه | ✅ | ✅ | — |
| ۱۶۱ | لیدربرد لحظه‌ای | 🔶 | 🔶 | خارج از دامنه — polling ۱۲۰s |
| ۱۶۲ | وزن‌دهی KPI | ✅ | **✅ + در منو** | ثبت + هم‌ترازی گارد (۱.۴) |
| ۱۶۳ | تعریف کانال تبلیغات | ✅ | ✅ | — |
| ۱۶۴ | سقف روزانه کانال | 🔶 | **✅** | رندوم پایدار (۷.۱) |
| ۱۶۵ | اعمال واقعی سقف | 🔶 | **✅** | گیت بولی حذف شد |
| ۱۶۶ | وزن مستقل محصول | 🔶 | **✅** | `promotion_weight` در فرمول (۷.۳) |
| ۱۶۷ | ثبت انجام پیشنهاد | ⚠️ | **✅** کد / رویداد ۰ | تریگر ساخته شد (۷.۲) |
| ۱۶۸ | اتصال تبلیغ به امتیاز | ⚠️ | **✅** کد / رویداد ۰ | در `calculate_employee_score` شمرده می‌شود |
| ۱۶۹ | مدل یکپارچهٔ اشخاص | 🔶 | **⚠️ پل ✅، یکپارچگی کامل ✗** | فقط customer↔person |
| ۱۷۰ | ایمپورت اکسل عمومی | 🔶 | **✅** (برای اشخاص) | ۵.۲ |
| ۱۷۱ | ثبت خرید از فروشنده | ✅ | ✅ | — |
| ۱۷۲ | ماتریس عملیات per نوع شخص | 🔶 | ⚠️ | پل ساخته شد؛ ماتریس کامل نه |
| ۱۷۳ | موجودی + افزایش با خرید | 🔶 | **✅ کد / خوابیده** | تریگر ✅ ولی بدون انبار no-op (§۳.۱) |
| ۱۷۴ | قطعی ⟵ کسر موجودی | ❌ | **✅ کد / خوابیده** | تریگر روی `status→accepted` |
| ۱۷۵ | بررسی موجودی پیش از قطعی | ❌ | **✅ کد / خوابیده** | `apply_stock_movement` + RPC پیش‌نمایش |
| ۱۷۶ | مدل چندانباره | ❌ | **✅** | ۵ جدول + RLS + UI |
| ۱۷۷ | انتقال بین‌انباری | ❌ | **✅** | سند + تریگر + UI |
| ۱۷۸ | فیلد انتخاب انبار | ❌ | **✅ کد / مخفی** | رندر می‌شود ولی با ۰ انبار خودش را مخفی می‌کند |
| ۱۷۹ | تغییر انبار هنگام قطعی | ❌ | **✅** | در دیالوگ پذیرش + چک موجودی |
| ۱۸۰ | سند دریافت نقد/چک/بانک | 🔶 | **✅** | چک هر دو سمت + `payment_vouchers` |
| ۱۸۱ | صندوق و ماندهٔ صندوق | ❌ | **✅ کد / صندوق تعریف نشده** | `account_type` + ویو مانده (۹.۱/۹.۳) |
| ۱۸۲ | گزارش ورود/خروج صندوق | 🔶 | **✅** | `get_account_ledger` + UI شمسی |
| ۱۸۳ | گزارش کالا به تفکیک انبار | ❌ | **✅ کد / داده ۰** | کاردکس شمسی (۸.۸) |
| ۱۸۴ | «قطعی‌کردن» در کد | 🔶 | **✅** | نقطهٔ قطعی = گذار به `accepted` |
| ۱۸۵–۱۹۰ | ویزیتور و گزارش‌هایش | ❌ | ❌ **(عمداً)** | خارج از دامنه — §۲.الف |
| ۱۹۱ | واحد پول | ⚠️ | **✅** | تومان همه‌جا، ۰ تابع DB با ریال |
| ۱۹۲ | نامزدی تبلیغات | 🔶 | **✅** | بوست ۵/۱۵ |
| ۱۹۳ | یکپارچگی LLM/GPT | 🔶 | 🔶 | خارج از دامنه — vision خاموش |

**جمع‌بندی حرکت:** از ۱۲ مورد `❌ وجود ندارد`، **۱۰ مورد به ✅ رسیدند** (۱۷۴–۱۷۹، ۱۸۱، ۱۸۳ و…) و ۲ گروه (ویزیتور) عمداً دست‌نخورده ماندند. از `🔶/⚠️`ها، ۱۵ مورد به ✅ رسیدند و ۴ مورد به‌دلیل نبود داده در حالت «کد ✅ / داده ✗» هستند.

---

## ۶ — تأیید سلامت

```
$ git branch --show-current
feature/navigation-modernization

$ git status --short
?? docs/execution/AfraKala-verification-prompt-140-193.md      ← تنها فایل untracked (خودِ پرامپت)

$ git log --oneline -11
8538924b feat(treasury): treasury UI, payment voucher form and purchase-payment link (9.5)
8c52b848 feat(treasury): payment vouchers, cash boxes and account ledger (9.1-9.4 DB)
7037c49c feat(warehouse): warehouse UI, kardex report and transfer documents (8.6-8.8)
f7e57f44 feat(warehouse): multi-warehouse schema and stock movement engine (8.1-8.5)
a234342a feat(marketing): random daily channel cap, promotion weight, gamification hook
9af5481a feat(sales): drop parallel invoice card, add cheque receipts and quote rejections
7825330f feat(persons): customer-person link UI and Excel import for persons
da6830cd feat(sales): bulk sales-text copy and manual-metrics in-page guide
80198fa1 feat(accounting): add aging buckets to receivables and payables reports
847206f4 feat(currency): unify display currency to Toman across the app
ac448322 chore: phase 1 checkpoint
```

**شمارش جداول اصلی (بدون تخریب):**

| customers | products | quotes | suppliers | purchases | receipts | user_roles |
|---|---|---|---|---|---|---|
| 6 | 354 | 5 | 12 | 1 | 2 | 36 |

**migrationهای فازهای ۱–۹ (۱۳ فایل، همه اعمال‌شده):**
`201` پیکربندی · `202` تومان · `203`/`204` aging · `205` چک دریافت · `206` رد پیش‌فاکتور · `207`/`208` مارکتینگ · `209`/`210`/`211` چندانباره · `212`/`213` خزانه

**تأیید اعمال شدن (نمونهٔ تجمعی):** ویوهای aging = ۲ · جداول انبار = ۵ · `payment_vouchers` = ۱ · ستون `promotion_weight` = ۱ · توابع موتور موجودی = ۵ · توابع خزانه = ۳

**سلامت type:** `npx tsc --noEmit` → **۷۰ خطا**، دقیقاً برابر baselineِ از پیش موجود؛ **۰ خطا** در فایل‌های اضافه‌شدهٔ فازها.

---

## ۷ — محدودیت‌های همین تأیید (صداقت روش)

- **جریان زندهٔ انبار و خزانه اجرا نشد** چون ماموریت فقط‌خواندنی است و داده‌ای هم موجود نیست (۰ انبار، ۰ سند پرداخت). صحت این مسیرها در نشست اجرا با تست‌های `BEGIN…ROLLBACK` تأیید شده بود، ولی **این گزارش آن را مستقلاً بازتولید نکرد**. تست دستی کاربر در مرورگر پس از ساخت اولین انبار لازم است.
- **گاردهای RLS و `SECURITY DEFINER` با JWT شبیه‌سازی‌شده آزمایش نشدند** (نوشتن لازم می‌شد). وجود policyها و متن گاردها بررسی شد، نه رفتار زمان اجرا برای هر نقش.
- **`npm run build` اجرا نشد** چون `.output/` و احتمالاً `routeTree.gen.ts` را می‌نویسد و خارج از مجوز نوشتن این مأموریت بود. به‌جایش `tsc --noEmit` (که چیزی نمی‌نویسد) اجرا شد و «فعال بودن route»ها از `routeTree.gen.ts` موجود در repo تأیید شد.
- شمارش «۵۴ آیتم» در §۵ بر پایهٔ ردیف‌های `00-SUMMARY.md` است؛ چند شماره (مثل ۱۴۱٫۱–۱۴۱٫۳) زیرآیتم‌اند، پس تعداد ردیف‌ها با ۵۴ دقیقاً یکی نیست.
