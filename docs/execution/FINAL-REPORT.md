# گزارش نهایی — اجرای پرامپت ۱۴۰–۱۹۳

> برنچ: `feature/navigation-modernization` · DB: `afrakala`
> نقطهٔ شروع: `ac448322` (پایان فاز ۱) · پایان: فاز ۹ کامل
> همهٔ ۹ فاز `DONE` در `docs/execution/PROGRESS.md`.

---

## ۱ — وضعیت آیتم‌ها (قبل → بعد)

| # | آیتم | قبل | بعد | کجا |
|---|---|---|---|---|
| ۱۴۳ | آموزش درون‌صفحهٔ متریک دستی | ❌ | ✅ | فاز ۴ |
| ۱۴۶ | کپی گروهی متن فروش با انتخاب حالت قیمت | ❌ | ✅ | فاز ۴ |
| ۱۴۷ | حذف پیش‌فاکتور موازی (`invoices`) | ⚠️ | ✅ | فاز ۶ |
| ۱۴۸ | فیش/چک بدون پیش‌فاکتور | ⚠️ | ✅ | فاز ۶ |
| ۱۵۰/۱۵۱ | سطل‌های سنی aging مطالبات و بدهی‌ها | ❌ | ✅ | فاز ۳ |
| ۱۵۲ | ثبت پیش‌فاکتور ردشده با دلیل | ❌ | ✅ | فاز ۶ |
| ۱۵۷ | فعال‌سازی KPIهای سود | 🔶 | ✅ | فاز ۱ |
| ۱۶۲ | ثبت صفحهٔ وزن‌دهی KPI در منو + هم‌ترازی دسترسی | ⚠️ | ✅ | فاز ۱ |
| ۱۶۴/۱۶۵ | سقف کانال = انتخاب رندومِ پایدارِ روزانه | ⚠️ | ✅ | فاز ۷ |
| ۱۶۶ | وزن مستقل محصول در تبلیغات | ❌ | ✅ | فاز ۷ |
| ۱۶۷/۱۶۸ | اتصال تبلیغ/نامزدی به گیمیفیکیشن + دیده شدن در لیدربرد | ❌ | ✅ | فاز ۷ |
| ۱۶۹ | UI پل customer↔person | 🔶 (بک‌اند آماده) | ✅ | فاز ۵ |
| ۱۷۰ | ایمپورت اکسل اشخاص | ❌ | ✅ | فاز ۵ |
| ۱۷۲ | اتصال مشتری به پروندهٔ شخص | 🔶 | ✅ | فاز ۵ |
| ۱۷۳ | افزایش موجودی هنگام خرید | ❌ | ✅ | فاز ۸ |
| ۱۷۴ | کسر موجودی هنگام قطعی‌کردن پیش‌فاکتور | ❌ | ✅ | فاز ۸ |
| ۱۷۵ | چک موجودی پیش از قطعی | ❌ | ✅ | فاز ۸ |
| ۱۷۶ | مدل چندانباره (ساخت/ویرایش/حذف + موجودی عددی) | ❌ | ✅ | فاز ۸ |
| ۱۷۷ | انتقال بین‌انباری | ❌ | ✅ | فاز ۸ |
| ۱۷۸ | انتخاب انبار در پیش‌فاکتور | ❌ | ✅ | فاز ۸ |
| ۱۷۹ | تغییر انبار هنگام قطعی | ❌ | ✅ | فاز ۸ |
| ۱۸۰ | سند پرداخت خروجی مستقل | ❌ | ✅ | فاز ۹ |
| ۱۸۱ | صندوق و ماندهٔ صندوق | ❌ | ✅ | فاز ۹ |
| ۱۸۲ | گزارش ورود/خروج صندوق با بازهٔ شمسی | ❌ | ✅ | فاز ۹ |
| ۱۸۳ | گزارش کاردکس به تفکیک انبار با تاریخ شمسی | ❌ | ✅ | فاز ۸ |
| ۱۸۵–۱۹۰ | ویزیتور = `salesperson_id` سازندهٔ پیش‌فاکتور | تصمیم | ✅ (بدون موجودیت جدید، طبق بخش ۱) | — |
| ۱۹۱ | واحد پول تومان در کل سیستم | ⚠️ | ✅ | فاز ۲ |
| ۱۹۲ | کالیبراسیون بوست نامزدی | 🔶 (صفر بود) | ✅ (۵/۱۵) | فاز ۱ |
| — | ناسازگاری نام نقش خرید (`purchasing_expert`) | ❌ باگ | ✅ | فاز ۱ |
| — | کوئری خراب گزارش مالی (ستون‌های ناموجود) | ❌ باگ | ✅ | فاز ۱ |
| — | `notify_on_stock_available` هرگز کار نمی‌کرد | ❌ باگ پنهان | ✅ | فاز ۸ |

---

## ۲ — migrationهای ساخته‌شده

| شماره | فایل | یک‌خط |
|---|---|---|
| ۲۰۱ | `20260725100000_201_phase1_config_activation.sql` | رفع نام نقش خرید، فعال‌سازی KPI سود، کالیبراسیون بوست نامزدی |
| ۲۰۲ | `20260726090000_202_phase2_currency_toman.sql` | واحد «ریال» → «تومان» در پیام خطای دو تریگر |
| ۲۰۳ | `20260726100000_203_phase3_aging_buckets.sql` | ستون `aging_bucket` روی دو ویو + بازسازی توابع summary با جمع/تعداد هر سطل |
| ۲۰۴ | `20260726101000_204_phase3_aging_lists.sql` | `aging_bucket` در توابع list + پذیرش سطل در `p_due_filter` |
| ۲۰۵ | `20260726110000_205_phase6_cheque_receive_side.sql` | کانال `cheque` + فیلدهای چک روی `payment_receipts` با CHECK نگهبان |
| ۲۰۶ | `20260726120000_206_phase6_quote_rejections.sql` | `get_my_rejected_quotes()` + ایندکس partial روی `audit_logs` |
| ۲۰۷ | `20260726130000_207_phase7_marketing.sql` | `products.promotion_weight`، ویو تبلیغات، سقف رندوم پایدار، KPI/rule تبلیغ، دو تریگر امتیاز |
| ۲۰۸ | `20260726131000_208_phase7_promotion_kpi_score.sql` | شمردن `promotions_completed` در `calculate_employee_score` |
| ۲۰۹ | `20260726140000_209_phase8_1_warehouse_tables.sql` | پنج جدول چندانباره + RLS + seed ماژول `warehouse` |
| ۲۱۰ | `20260726141000_210_phase8_2_5_stock_engine.sql` | `apply_stock_movement` و موتور خرید/قطعی/انتقال/همگام‌سازی `stock_status` |
| ۲۱۱ | `20260726142000_211_phase8_5_fix_stock_notify.sql` | رفع `spt.name` → `spt.title` در `notify_on_stock_available` |
| ۲۱۲ | `20260726150000_212_phase9_1_payment_vouchers.sql` | `bank_accounts.account_type` + جدول `payment_vouchers` + RLS + شمارهٔ خودکار |
| ۲۱۳ | `20260726151000_213_phase9_2_4_treasury.sql` | ماندهٔ حساب، گزارش دفتر با ماندهٔ تجمعی، پرداخت خرید با سند |

---

## ۳ — فایل‌های فرانت تغییرکرده (به تفکیک فاز)

**فاز ۲ — تومان:** `lib/i18n/formatters.ts`، `lib/accounting/receipt-extraction.ts`، `shared/components/InvoiceForm.tsx`، `shared/components/AdvancePaymentSection.tsx`، `components/accounting/PaymentReceiptDocuments.tsx`، `components/credit/DynamicScoringSection.tsx`، `routes/_app.accounting.dynamic-capital.tsx`، `routes/_app.products.$id.tsx`، `routes/_app.sales_.customers_.$customerId.credit.tsx`، `routes/_app.sales_.invoices_.$invoiceId.tsx`، `routes/_app.gamification.settings.tsx`

**فاز ۳ — aging:** `lib/accounting/aging.ts` (جدید)، `components/accounting/AgingBuckets.tsx` (جدید)، `routes/_app.accounting.receivables.tsx`، `routes/_app.accounting.payables.tsx`

**فاز ۴ — UX:** `lib/sales/bulk-sales-text.ts` (جدید)، `components/gamification/ManualMetricsGuide.tsx` (جدید)، `routes/_app.gamification_.admin_.manual-metrics_.guide.tsx` (جدید)، `routes/_app.sales.search.tsx`، `routes/_app.gamification.admin.manual-metrics.tsx`

**فاز ۵ — اشخاص:** `components/customers/CustomerPersonLink.tsx` (جدید)، `components/persons/PersonImportForm.tsx` (جدید)، `routes/_app.persons_.import.tsx` (جدید)، `routes/_app.persons.tsx`، `routes/_app.sales_.customers_.$customerId.edit.tsx`

**فاز ۶ — فروش:** `routes/_app.sales.index.tsx`، `shared/components/PaymentReceiptForm.tsx`، `routes/_app.sales.quotes.new.tsx`، `routes/_app.my-rejected-quotes.tsx` (جدید)

**فاز ۷ — مارکتینگ:** `lib/products/schemas.ts`، `components/products/ProductForm.tsx`، `routes/_app.products.$id.tsx`، `routes/_app.products.new.tsx`

**فاز ۸ — چندانباره:** `lib/warehouses/queries.ts` (جدید)، `lib/warehouses/transfers.ts` (جدید)، `components/warehouses/WarehouseSelect.tsx` (جدید)، `components/warehouses/ProductStockByWarehouse.tsx` (جدید)، `routes/_app.warehouses.tsx` (جدید)، `routes/_app.warehouses_.kardex.tsx` (جدید)، `routes/_app.warehouses_.transfers.tsx` (جدید)، `shared/components/PurchaseForm.tsx`، `routes/_app.sales.quotes.$quoteId.tsx`، `lib/rbac/roles.ts`

**فاز ۹ — خزانه:** `lib/treasury/queries.ts` (جدید)، `routes/_app.accounting.treasury.tsx` (جدید)، `routes/_app.accounting.payment-vouchers.tsx` (جدید)، `routes/_app.accounting.bank-accounts.tsx`، `routes/_app.accounting.purchase-payments.tsx`

**مشترک:** `lib/navigation/registry.ts` (ثبت ۹ route جدید)، `integrations/supabase/types.ts` (به‌روزرسانی دستی برای ستون/جدول‌های جدید)

---

## ۴ — نتیجهٔ تست‌های خودکار

| فاز | تست | نتیجه |
|---|---|---|
| ۱ | `purchasing_expert` = ۰ ردیف؛ دو KPI سود `enabled=t`؛ بوست ۵/۱۵ | PASS |
| ۲ | `rg ریال` روی سه فایل بحرانی خالی؛ دو تابع DB `has_rial=f` | PASS |
| ۳ | `aging_bucket` روی دو ویو؛ `bucket_d90_plus` در دو تابع summary؛ `aging_bucket` در دو تابع list | PASS |
| ۴ | build سبز؛ route راهنما در `routeTree.gen.ts` | PASS |
| ۵ | build سبز؛ route ایمپورت کامپایل شد؛ RPCهای پل + ستون `person_id` موجود | PASS |
| ۶ | `count(invoices)` = ۰؛ CHECK کانال شامل `cheque`؛ ستون‌های چک؛ `get_my_rejected_quotes` موجود؛ **تست منفی:** فیلد چک با کانال غیرچک رد شد | PASS |
| ۷ | کانال با `daily_quota=5` دقیقاً ۵ ردیف؛ دو فراخوانی متوالی مجموعهٔ یکسان (`shared=5, diff=0`)؛ `event_key='promotion_completed'`؛ breakdown امتیاز `contribution=2`؛ وزن ۲ → market_score دو برابر؛ وزن ۰ → خروج از پیشنهادها | PASS |
| ۸ | پنج جدول + `module='warehouse'`؛ **E2E:** خرید ۲۰ → قطعی ۶ → انتقال ۵ ⇒ WH-C=۹ / WH-N=۵؛ **تراز دفتر:** `SUM(delta)`=`SUM(quantity)`=۱۴؛ قطعی با موجودی ناکافی رد شد | PASS |
| ۹ | `payment_vouchers` + `bank_accounts.account_type`؛ مانده ۱٬۰۰۰٬۰۰۰→۷۵۰٬۰۰۰→۱٬۱۵۰٬۰۰۰→۱٬۰۵۰٬۰۰۰ و `last_running == current_balance`؛ سند خرید با `cash_price` و کانال چک؛ گارد دوباره‌پرداخت | PASS |
| همه | `npm run build` سبز؛ `tsc --noEmit` = ۷۰ خطا = **baseline دقیق**؛ `eslint` = ۸۲۰ error = **baseline دقیق** (هیچ خطای جدید) | PASS |

> **روش تست:** همهٔ تست‌های نوشتاری داخل `BEGIN … ROLLBACK` اجرا شدند و بعد از هر کدام خالی‌بودن جداول تأیید شد؛ هیچ دادهٔ آزمایشی در DB زنده نماند. تست توابع `SECURITY DEFINER` با `SET LOCAL request.jwt.claims` و شبیه‌سازی یک admin واقعی انجام شد تا گاردها **اجرا** شوند نه دور زده — همین روش یک باگ واقعی را بیرون کشید (بخش ۶).

---

## ۵ — کارهای باقی‌مانده / خارج از دامنه

1. **OCR تصویری (۱۴۴/۱۹۳):** خارج از دامنهٔ این پرامپت بود. زیرساخت آماده است؛ فقط باید یک provider با `capabilities` شامل `vision` و `vision_model` معتبر در `ai_providers` ثبت و با `testProviderCapability(...,"vision")` تست شود. تصمیم پیکربندی/هزینه‌ای است، نه کد.
2. **پرداخت جزئی خرید:** طبق پلن به فاز ۳ اضافه نشد. مانده تأمین‌کننده همچنان «همه‌یا‌هیچ» (`paid_at` باینری) است. برای aging دقیق‌تر payables یا پرداخت چندمرحله‌ای، یک فاز جدا لازم است. زیرساخت `payment_vouchers` حالا وجود دارد و می‌تواند پایهٔ آن باشد.
3. **لیدربرد Realtime واقعی:** همچنان polling ۱۲۰ ثانیه.
4. **یکپارچه‌سازی کامل سه مدل شخص:** `suppliers` و `external_parties` هنوز به `persons` مهاجرت نکرده‌اند. پل `customers↔persons` فعال شد ولی بقیه دست‌نخورده‌اند.
5. **`AppRole` و `ALL_ROLES`:** `purchase_specialist` و `site` به type و `ROLE_LABELS` اضافه شدند ولی عمداً به `ALL_ROLES` نه — چون آن لیست UI انتخاب نقش را می‌سازد. اگر بخواهید این دو نقش در انتخابگر نقش هم بیایند، یک تغییر جدا و آگاهانه لازم است.
6. **eslint موجود:** ۸۲۰ خطای prettier/type از قبل در کد بود و دست نخورد (خارج از دامنه). فقط فایل‌های دست‌خورده تمیز نگه داشته شدند.
7. **`tsc --noEmit`:** ۷۰ خطای از قبل موجود (عمدتاً `src/lib/*/functions.ts` و `_app.products.index.tsx`) دست نخورد.

---

## ۶ — باگ‌های کشف‌شدهٔ خارج از فهرست اولیه

سه باگ واقعی که در مسیر اجرا پیدا و رفع شدند:

1. **`notify_on_stock_available` هرگز کار نکرده بود** (فاز ۸): به `spt.name` ارجاع می‌داد ولی ستون واقعی `sale_price_types.title` است. خطا در بلوک `EXCEPTION` بلعیده می‌شد (`RAISE WARNING … RETURN NEW`)، پس «اعلان موجود شدن کالا به کارشناس» بی‌صدا خاموش بود. چون فاز ۸.۵ از این پس `stock_status` را خودکار عوض می‌کند، بدون این اصلاح خروجی فاز روی کاغذ درست ولی در عمل خاموش می‌ماند.
2. **`adjust_warehouse_stock` با CHECK تضاد داشت** (فاز ۸): مقدار منفی پاس می‌داد در حالی که `stock_movements.quantity` باید مثبت باشد. با افزودن ستون `delta` (اثر علامت‌دار) و `quantity = abs(delta)` رفع شد و کاردکس برای هر پنج نوع حرکت خودتوصیف گشت.
3. **`get_account_ledger` به ستون ناموجود ارجاع می‌داد** (فاز ۹): `external_parties.name` در حالی که ستون `full_name` است — باگ خودم، که فقط با شبیه‌سازی JWT ادمین بیرون افتاد (اجرای مستقیم به‌عنوان `supabase_admin` اول `forbidden` می‌داد و خطای واقعی را پنهان می‌کرد).

---

## ۷ — تأیید سلامت

```
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

**دادهٔ موجود سالم مانده:**
- هیچ `DROP TABLE`/`TRUNCATE`/حذف رکوردی انجام نشد.
- هیچ ستونِ پرِ داده تغییر نوع نداد.
- `DROP FUNCTION`ها فقط روی توابع خواندنی بودند (تغییر `RETURNS TABLE` راه دیگری ندارد) و بلافاصله بازساخته شدند با GRANT مجدد.
- `DROP VIEW` انجام نشد؛ همهٔ ویوها با `CREATE OR REPLACE` و افزودن ستون **در انتها** گسترش یافتند.
- ستون‌های جدید همه یا nullable بودند یا default امن داشتند (`promotion_weight=1`، `account_type='bank'`) تا ردیف‌های موجود رفتارشان عوض نشود — هر دو با کوئری تأیید شد.
- سازگاری با گذشته در فاز ۸: تا وقتی هیچ انباری تعریف نشده باشد، تریگرهای موجودی no-op می‌کنند و جریان خرید/فروش دقیقاً مثل قبل کار می‌کند. محصول بدون ردیف `warehouse_stock` وضعیت دستی‌اش را حفظ می‌کند.
- سازگاری با گذشته در فاز ۹: اگر حساب مبدأ انتخاب نشود، پرداخت خرید همان رفتار قبلی (`paid_at` تنها) را دارد.
