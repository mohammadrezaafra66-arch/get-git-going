# PROGRESS — اجرای پرامپت ۱۴۰–۱۹۳

> برنچ: `feature/navigation-modernization` · DB: `afrakala` · شروع: 2026-07-25
> بعد از هر فاز به‌روز و commit می‌شود. برای ادامه در نشست جدید، از اولین فاز غیر-DONE ادامه بده.

## Phase 1 — رفع‌های داده و پیکربندی کم‌ریسک
- status: DONE
- migrations: `20260725100000_201_phase1_config_activation.sql`
- commit: (this commit)
- summary: رفع نام نقش خرید (۱۸ ردیف)، فعال‌سازی KPI سود، کالیبراسیون بوست نامزدی (۵/۱۵)، ثبت صفحهٔ KPI و صفحهٔ جدید امتیازدهی کارشناس در منو، رفع کوئری خراب گزارش مالی.
- tests: migration verify سبز (purchasing_expert=0؛ هر دو KPI سود enabled=t؛ boost=5/15)؛ `npm run build` سبز (۳۳s)؛ route جدید `/accounting/salesperson-scoring` کامپایل شد.
- کارهای انجام‌شده:
  - DB: `role_permissions.role_name` از `purchasing_expert` به `purchase_specialist`.
  - DB: `gamification_kpis` → `total_profit`, `profit_per_talk_minute` فعال (وزن‌ها از قبل هم‌مقیاس بودند).
  - DB: `promotion_nomination_policy` بوست ۰→۵ و سقف ۰→۱۵.
  - FE: `registry.ts` ثبت `/gamification/settings` (adminOnly) و `/accounting/salesperson-scoring`.
  - FE: `_app.gamification.tsx` لینک تنظیمات KPI فقط admin.
  - FE: route جدید `_app.accounting.salesperson-scoring.tsx` با گارد `requireAnyRole([admin,accountant])` + انتخاب کارشناس (`listAssignableUsers`) + `DynamicScoringSection entityType="salesperson"`.
  - FE: `_app.reports.tsx` FinanceReportTab از RPC `get_receivables_summary` استفاده می‌کند (به‌جای ستون‌های ناموجود ویو).

## Phase 2 — یکسان‌سازی واحد پول به تومان
- status: DONE
- migrations: `20260726090000_202_phase2_currency_toman.sql`
- commit: (this commit)
- summary: پیش‌فرض `formatCurrency` تومان شد؛ همهٔ برچسب‌های «ریال» در ۹ فایل UI به «تومان»؛ شاخهٔ برچسب‌دار OCR رسید حالا مثل fallback ریال→تومان تبدیل می‌کند؛ پیام‌های خطای دو تریگر DB هم تومان شد.
- tests: `rg ریال` روی سه فایل بحرانی خالی (PASS)؛ `npm run build` سبز (۳۳s)؛ verify SQL: هر دو تابع `has_rial=f, has_toman=t`.
- کارهای انجام‌شده:
  - `src/lib/i18n/formatters.ts:12` پیش‌فرض `currency = "تومان"`.
  - برچسب‌ها: `InvoiceForm.tsx`, `AdvancePaymentSection.tsx`, `PaymentReceiptDocuments.tsx`, `DynamicScoringSection.tsx`, `_app.accounting.dynamic-capital.tsx`, `_app.products.$id.tsx`, `_app.sales_.customers_.$customerId.credit.tsx`, `_app.sales_.invoices_.$invoiceId.tsx`, `_app.gamification.settings.tsx`.
  - `_app.operations.receipts.tsx` از پیش‌فرض جدید `formatCurrency` تومان می‌گیرد.
  - `src/lib/accounting/receipt-extraction.ts` شاخهٔ `amountLabeled`: واحد capture شد؛ اگر «ریال»/`rial` بود `Math.round(n/10)` + هشدار.
  - DB: `enforce_payment_receipt_link_limits`, `enforce_receipt_approval_allocation_limits` — فقط رشتهٔ واحد در پیام خطا.
- تأیید عدم تغییر داده: هیچ UPDATE/محاسبهٔ عددی روی داده انجام نشد؛ migration فقط بدنهٔ دو تابع را با `replace()` بازتعریف کرد.

## Phase 3 — گزارش‌های سررسیدی aging (۱۵۰/۱۵۱)
- status: DONE
- migrations: `20260726100000_203_phase3_aging_buckets.sql`, `20260726101000_204_phase3_aging_lists.sql`
- commit: (this commit)
- summary: ستون `aging_bucket` به دو ویو مطالبات/بدهی‌ها اضافه شد؛ توابع summary جمع و تعداد هر سطل را برمی‌گردانند؛ توابع list ستون سطل را برمی‌گردانند و `p_due_filter` مقادیر سطل را می‌پذیرد؛ UI هر دو صفحه کارت‌های سطل سنی (کلیک‌پذیر) + ستون/بَج سطل گرفت.
- tests: هر ۴ تست SQL سبز (ستون روی دو ویو؛ `bucket_d90_plus` در خروجی دو تابع summary؛ `aging_bucket` در خروجی دو تابع list؛ اجرای group-by بدون خطا). `npm run build` سبز. `eslint` روی فایل‌های تغییرکرده بدون خطا/هشدار. `tsc --noEmit`: ۷۰ خطا در baseline (`HEAD` قبل از تغییر) و ۷۰ خطا بعد از تغییر — هیچ خطای جدیدی در فایل‌های دست‌خورده نیست (خطاهای موجود در `src/lib/*/functions.ts` و `types.ts` از قبل بوده‌اند).
- سطل‌بندی: `current` (سررسید نشده یا امروز) · `d1_30` · `d31_60` · `d61_90` · `d90_plus`، بر مبنای `CURRENT_DATE - due_date`. برای payables سررسید = `purchase_date + payment_terms.days` و ردیف پرداخت‌شده در `current` می‌ماند تا آمار سنی را منحرف نکند.
- کارهای انجام‌شده:
  - DB: `CREATE OR REPLACE VIEW vw_customer_receivables` / `vw_supplier_payables` — فقط ستون جدید در انتها (بدون DROP، بدون ویوی وابسته).
  - DB: `get_receivables_summary` / `get_payables_summary` بازساخته شدند (تغییر `RETURNS TABLE` نیاز به DROP داشت) + ۱۰ ستون جدید (۵ مبلغ + ۵ تعداد) + GRANT مجدد.
  - DB: `get_receivables_list` / `get_payables_list` + ستون `aging_bucket` + پذیرش سطل در `p_due_filter`.
  - FE: `src/lib/accounting/aging.ts` (ثابت‌ها/نوع سطل)، `src/components/accounting/AgingBuckets.tsx` (`AgingBucketCards`، `AgingBucketBadge`).
  - FE: `_app.accounting.receivables.tsx` و `_app.accounting.payables.tsx` — ردیف کارت سطل سنی، ستون «سطل سنی» در جدول دسکتاپ، بَج در کارت موبایل، و ۵ گزینهٔ سطل در فیلتر «وضعیت سررسید».
- خارج از دامنه (طبق پلن): پرداخت جزئی خرید اضافه نشد؛ مانده تأمین‌کننده همچنان همه‌یا‌هیچ است.

## Phase 4 — UX کوچک: کپی گروهی فروش + آموزش درون‌صفحه
- status: DONE
- migrations: — (فقط فرانت)
- commit: (this commit)
- summary: در `/sales/search` انتخاب چندتایی محصول + دیالوگ انتخاب حالت‌های قیمت + «کپی گروهی» اضافه شد؛ صفحهٔ راهنمای متریک دستی ساخته و از فرم و منو قابل دسترسی شد.
- tests: `npm run build` سبز؛ route جدید در `routeTree.gen.ts` کامپایل شد (`AppGamificationAdminManualMetricsGuideRouteImport`)؛ `eslint` روی همهٔ فایل‌های تغییرکرده بدون خطا (فقط هشدارهای از پیش موجود در `_app.sales.search.tsx`)؛ `tsc --noEmit` = ۷۰ خطا، دقیقاً برابر baseline.
- ۴.الف — کپی گروهی فروش (۱۴۶):
  - `src/lib/sales/bulk-sales-text.ts` جدید: `buildProductSpecChips`, `priceModeKey`, `priceModeLabel`, `collectPriceModes`, `buildBulkSalesText`.
  - `_app.sales.search.tsx`: state `selectedProductIds: Set<string>`، چک‌باکس روی هر کارت، نوار ابزار «انتخاب همه / N انتخاب شده / حالت‌های قیمت / کپی گروهی / پاک کردن انتخاب».
  - با انتخاب اولین محصول، دیالوگ «کدام حالت‌های قیمت در متن بیاید؟» باز می‌شود؛ گزینهٔ «همه حالت‌ها» + چک‌باکس هر حالت (نوع قیمت × نوع تسویه). انتخابِ همهٔ موارد به‌صورت داخلی به «همه» نرمال می‌شود.
  - قالب متن: نام نمایشی، برند، دسته، نوع کالا، مشخصات کوتاه با ` • `، وضعیت، سپس «قیمت‌ها:» فقط برای حالت‌های انتخاب‌شده؛ بین محصولات خط جداکننده.
  - تابع تک‌محصولی `handleCopySalesText` دست‌نخورده ماند (فقط `specChips` به helper مشترک منتقل شد تا منطق دوتکه نشود).
- ۴.ب — آموزش درون‌صفحهٔ متریک دستی (۱۴۳):
  - `src/components/gamification/ManualMetricsGuide.tsx` (الگوی `CustomerCreditGuide`): ۶ بخش کارت‌محور — این فرم چیست، بازهٔ ویرایش ۵ روزه، سوییچ خودکار/دستی فروش، وزن متریک‌ها، مسیر گام‌به‌گام، خطاهای رایج + هشدار «چرا امتیاز تغییر نکرد؟».
  - route `_app.gamification_.admin_.manual-metrics_.guide.tsx` با همان گارد فرم (`requireAnyRole([admin,manager,accountant])`).
  - دکمهٔ «راهنما» در بالای `manual-metrics.tsx` + ثبت در `registry.ts` (زیرگروه `adm-gamification` + ردیف `ROUTE_ROLE_OVERRIDES`).

## Phase 5 — اشخاص: پل customer↔person + ایمپورت اشخاص
- status: DONE
- migrations: — (بک‌اند از قبل آماده بود؛ فقط UI)
- commit: (this commit)
- summary: بخش «اتصال به پروندهٔ شخص» به فرم ویرایش مشتری اضافه شد (PersonPicker + اتصال/قطع اتصال)؛ route ایمپورت اکسل اشخاص با فرم سه‌مرحله‌ای ساخته و در منو ثبت شد.
- tests: `npm run build` سبز؛ route جدید در `routeTree.gen.ts` (`AppPersonsImportRouteImport`, `'/persons/import'`)؛ `eslint` روی فایل‌های تغییرکرده بدون خطا؛ `tsc --noEmit` = ۷۰ = baseline. تأیید DB: `customer_set_person`/`customer_clear_person` موجود، `customers.person_id uuid` موجود، جداول `persons`/`person_identifiers`/`person_context_links` موجود.
- ۵.۱ — پل customer↔person (۱۶۹):
  - `src/components/customers/CustomerPersonLink.tsx` جدید: اگر `person_id` خالی است جستجوی شخص (`searchPersons`، حداقل ۲ کاراکتر، debounce ۳۵۰ms) + دکمهٔ «اتصال» → `linkCustomerToPerson`؛ اگر متصل است نمایش `getPerson` + دکمهٔ «قطع اتصال» → `unlinkCustomerFromPerson`.
  - `_app.sales_.customers_.$customerId.edit.tsx`: `person_id` به select اضافه شد و کارت جدید بالای فرم رندر می‌شود.
  - بک‌اند دست‌نخورده ماند (RPCهای `customer_set_person`/`customer_clear_person` که ساخت ردیف `person_context_links` را هم انجام می‌دهند).
- ۵.۲ — ایمپورت اکسل اشخاص (۱۷۰):
  - `src/components/persons/PersonImportForm.tsx` (الگوی `CustomerImportForm`): SheetJS، سقف ۱۰۰۰ ردیف، حدس خودکار نگاشت از عنوان ستون (فارسی/انگلیسی)، پیش‌نمایش ۵ ردیف، نوار پیشرفت.
  - ستون‌های قابل نگاشت: `display_name*`, `legal_name`, `kind` (حقیقی/حقوقی)، `notes` + چهار شناسه: موبایل، کد ملی، شناسه اقتصادی، ایمیل.
  - درج از طریق serverFnهای موجود `createPerson` و `createPersonIdentifier` انجام می‌شود تا RLS، نرمال‌سازی شناسه و گارد تکراری بین‌اشخاص حفظ شود (نه insert مستقیم).
  - شناسه‌ها best-effort‌اند: شناسهٔ نامعتبر باعث دورانداختن شخصِ ساخته‌شده نمی‌شود و در جدول «هشدارها» گزارش می‌گردد.
  - `audit_logs` با `action:"persons_imported"` (شامل success/failed/total/تعداد هشدار شناسه/نام فایل).
  - route `_app.persons_.import.tsx` با `requireAnyRole([admin,manager])` + ثبت در `registry.ts` و `ROUTE_ROLE_OVERRIDES` + دکمهٔ «ایمپورت اکسل» در هدر صفحهٔ `/persons`.

## Phase 6 — یکی‌سازی پیش‌فاکتور + فیش بدون لینک
- status: DONE
- migrations: `20260726110000_205_phase6_cheque_receive_side.sql`, `20260726120000_206_phase6_quote_rejections.sql`
- commit: (this commit)
- summary: کارت «فاکتورهای فروش» از هاب فروش حذف شد (جدول `invoices` صفر ردیف)؛ کانال «چک» + فیلدهای چک در سمت دریافت اضافه شد؛ مسیر «دریافت بدون پیش‌فاکتور» در UI صریح شد؛ رد شدن پیش‌فاکتور با دلیل ثبت و در صفحهٔ «درخواست‌های رد شدهٔ من» نمایش داده می‌شود.
- tests: `SELECT count(*) FROM invoices` = ۰ (حذف کارت امن بود)؛ CHECK کانال شامل `cheque`؛ ستون‌های `cheque_number`/`cheque_due_date` موجود؛ `get_my_rejected_quotes` با امضای درست موجود؛ INSERT با `document_channel='cash'` + `cheque_number` توسط `payment_receipts_cheque_fields_chk` رد شد (تست منفی سبز، هیچ ردیف آزمایشی باقی نماند)؛ `post_receipt_accounting` شامل `increase_credit` است. `npm run build` سبز؛ `eslint` بدون خطا؛ `tsc --noEmit` = ۷۰ = baseline.
- ۶.الف — یکی‌سازی پیش‌فاکتور (۱۴۷):
  - `_app.sales.index.tsx`: کارت «فاکتورهای فروش» حذف شد (با کامنت توضیح چرایی). قبل از حذف تأیید شد `invoices` صفر ردیف دارد.
  - جدول `invoices` **drop نشد** و routeها/گاردها دست‌نخورده ماندند (گزارش‌ها و `payment_receipt_links` هنوز به آن ارجاع می‌دهند). ورودی‌های منو از قبل `hiddenFromMenu: true` بودند، پس کارت هاب آخرین نقطهٔ ورود قابل‌دید بود.
- ۶.ب — فیش/چک بدون لینک (۱۴۸/۱۵۲):
  - یافته: اعتبارسنجی از قبل روی `requiresInvoiceLinks()` گیت شده بود، پس `positive_credit`/`prepayment`/`debt_payment` بدون پیش‌فاکتور کار می‌کردند — مشکل «کشف‌ناپذیری» بود نه انسداد. راهنمای صریح فارسی در زیر انتخاب نوع فیش اضافه شد (هر دو حالت: نوع بدون‌لینک انتخاب‌شده / پیشنهاد سوییچ به «اعتبار مثبت مستقل»).
  - تأیید اتصال اعتبار: `post_receipt_accounting` → `increase_credit` → `customer_credit_balance.available_credit` + ردیف `customer_credit_ledger`. یعنی ثبت `positive_credit` پس از تأیید و «ثبت حسابداری» واقعاً ما را به مشتری بدهکار می‌کند. اتصال ناقص نبود؛ چیزی اضافه نشد.
  - چک: migration 205 مقدار `cheque` را به CHECK کانال سند افزود و دو ستون nullable `cheque_number`/`cheque_due_date` + CHECK نگهبان (اگر کانال چک نیست، این دو باید NULL باشند). UI: گزینهٔ «چک» در فهرست روش انتقال، فیلدهای شمارهٔ چک (اجباری) و سررسید چک (`JalaliDateInput`) فقط در همان حالت، و پاک‌سازی خودکار هنگام تعویض کانال. زod schema آینهٔ همان دو CHECK است.
- ۶.ج — پیش‌فاکتور رد شده با دلیل (۱۵۲):
  - طبق «تصمیم ساده‌سازی» پلن، جدول جدید ساخته نشد؛ از `audit_logs` با `action='sales_quote_rejected'` استفاده شد.
  - `_app.sales.quotes.new.tsx`: `onError` به‌جای toast تنها، دیالوگ رد را باز می‌کند — دلیل سیستمی + فیلد توضیح یک‌خطی + دکمهٔ «ثبت دلیل» که در `audit_logs` می‌نویسد (reason/note/customer_name/final_amount).
  - نکتهٔ RLS: `audit_logs` فقط به admin اجازهٔ SELECT می‌دهد. به‌جای بازکردن policy (که کل تاریخچهٔ کاربر را افشا می‌کرد)، migration 206 یک تابع باریک `get_my_rejected_quotes(p_limit)` با `SECURITY DEFINER` ساخت که فقط ردیف‌های `action='sales_quote_rejected'` و `actor_id = auth.uid()` را برمی‌گرداند + ایندکس partial.
  - route جدید `_app.my-rejected-quotes.tsx` + ثبت در `registry.ts` (گروه فروش).

## Phase 7 — مارکتینگ: سقف رندوم کانال + گیمیفیکیشن + وزن محصول
- status: DONE
- migrations: `20260726130000_207_phase7_marketing.sql`, `20260726131000_208_phase7_promotion_kpi_score.sql`
- commit: (this commit)
- summary: سقف کانال از گیت بولی به «انتخاب رندومِ پایدارِ روزانه» تغییر کرد؛ وزن مستقل محصول (`products.promotion_weight`) در فرمول تبلیغات ضرب شد و در فرم محصول قابل ویرایش است؛ استفاده از پیشنهاد و نامزدی محصول حالا رویداد امتیاز می‌سازند و در لیدربرد شمرده می‌شوند.
- tests: همه سبز —
  - سقف per-channel: کانال با `daily_quota=5` دقیقاً ۵ ردیف برمی‌گرداند (`within_quota=t`). **نکته:** در فراخوانی `(NULL,0,200)` شمارش per-channel به‌خاطر LIMIT سراسری بریده می‌شود (۳+۸۶+۱۱۱=۲۰۰)، پس تست معتبر، فراخوانی per-channel با limit بزرگ است.
  - پایداری روزانه: دو فراخوانی متوالی همان مجموعه → `only_in_a=0, only_in_b=0, shared=5`.
  - واجدشرایطی: `score<=0 OR stock_factor<=0` → ۰ نقض.
  - `event_key='promotion_completed'` در `gamification_kpi_rules` موجود.
  - زنجیرهٔ گیمیفیکیشن: درج `audit_logs(action='promotion_suggestion_used')` → تریگر → ردیف `employee_score_events` (`from_audit=1`) → `calculate_employee_score` breakdown: `{"value":1,"weight":2,"contribution":2}` یعنی در لیدربرد دیده می‌شود (۱۶۸). تریگر نامزدی هم تست شد (`from_nominations=1`).
  - وزن محصول: `promotion_weight=2` → `market_score` دقیقاً دو برابر (`doubled_exactly=t`)؛ `=0` → محصول از پیشنهادها خارج می‌شود؛ هر ۳۵۴ محصول روی مقدار خنثی ۱ هستند پس **هیچ regression روی رفتار موجود نیست**.
  - همهٔ تست‌های نوشتاری داخل transaction با ROLLBACK اجرا شدند: `leaked=0`, `non_neutral_left=0` — هیچ دادهٔ آزمایشی باقی نماند.
  - `npm run build` سبز؛ `eslint` بدون خطا؛ `tsc --noEmit` = ۷۰ = baseline.
- ۷.الف — سقف رندوم کانال (۱۶۴/۱۶۵):
  - `compute_promotion_scores` بازنویسی شد: گیت قبلی `used_today < daily_quota` (بولی روی کل کانال) حذف و جایش `ROW_NUMBER() OVER (PARTITION BY channel_id ORDER BY md5(channel_id || تاریخ تهران || product_id))` با فیلتر `rn <= daily_quota` آمد.
  - «رندوم پایدار» = کلید مرتب‌سازی در طول یک روز ثابت است، پس refresh همان مجموعه را می‌دهد. تاریخ تهران استفاده شد تا با مرز `used_today` در ویو هم‌راستا باشد.
  - شرط `stock_factor > 0` صریح اضافه شد (طبق پلن) تا ناموجودها هرگز انتخاب نشوند.
  - `daily_quota` تهی یا صفر = بی‌نهایت (رفتار قبلی حفظ شد).
- ۷.ب — اتصال تبلیغ/نامزدی به گیمیفیکیشن (۱۶۷/۱۶۸):
  - `gamification_kpi_rules`: ردیف `promotion_completed` (xp=15) — کلید مورد انتظار تست پلن.
  - `gamification_kpis`: ردیف `promotions_completed` (weight=2، مقیاس شمارشی مثل `deals_registered`) — این جدولی است که واقعاً در محاسبهٔ امتیاز خوانده می‌شود.
  - دو تریگر `SECURITY DEFINER`: روی `audit_logs` (فقط `WHEN action='promotion_suggestion_used'`) و روی `promotion_nominations` (AFTER INSERT) که ردیف `employee_score_events(event_type='promotion_completed')` می‌سازند و بلافاصله `calculate_employee_score` را صدا می‌زنند تا امتیاز در لیدربرد تازه شود.
  - migration 208: `calculate_employee_score` با سه تغییر حداقلی بازتعریف شد — شمارنده‌های `_promo_d/w/m/t`، یک SELECT شمارش رویدادها در بازه‌های روز/هفته/ماه/کل، و شاخهٔ CASE برای `promotions_completed`. بقیهٔ بدنه بیت‌به‌بیت همان قبلی است، پس هیچ KPI موجودی تغییر محاسبه نداد.
  - ایندکس partial `idx_employee_score_events_promotion` برای شمارش سریع.
- ۷.ج — وزن مستقل محصول (۱۶۶):
  - `product_recommendation_overrides` **استفاده نشد** چون ساختارش cross-sell محصول→محصول است (۱۵۳۵ ردیف، ستون `recommended_product_id`) و ضریب وزن نیست. طبق اجازهٔ پلن یک ستون سبک ساخته شد: `products.promotion_weight numeric NOT NULL DEFAULT 1` + CHECK `[0,100]`.
  - در ویو `v_promotion_suggestions` در هر سه عبارت (`score`, `market_score`, `final_score`) به‌صورت `COALESCE(p.promotion_weight, 1)` ضرب شد. پیش‌فرض ۱ = خنثی، پس محصولات بدون تنظیم دقیقاً مثل قبل رفتار می‌کنند.
  - FE: `promotion_weight` به `productSchema` (`z.coerce.number().min(0).max(100).default(1)`)، به `DEFAULTS` فرم، به فیلد عددی جدید «وزن تبلیغ محصول» در `ProductForm.tsx` با توضیح فارسی، و به مسیر load/save در `_app.products.$id.tsx` و `_app.products.new.tsx` اضافه شد.
  - `src/integrations/supabase/types.ts` دستی به‌روز شد (Row/Insert/Update برای `products`) — همان روشی که برای `bank_accounts.accounting_code` در migration 155 استفاده شده بود؛ بدون آن دو خطای TS جدید می‌ماند.
- یادداشت بازیابی: این فاز وسط کار با خطای ۵۲۹ سرور قطع شد. در نشست بعد تأیید شد هر دو migration از قبل روی DB اعمال شده‌اند (ستون، CHECK، ویو، تابع، دو ردیف KPI، دو تریگر، ایندکس، و شاخهٔ CASE) پس **دوباره اجرا نشدند**؛ فقط سیم‌کشی فرانت ۷.ج تکمیل شد.

## Phase 8 — چندانباره کامل
- status: DONE
- commit: (this commit؛ ۸.۱–۸.۵ در commit قبلی `f7e57f44`)
- migrations: `20260726140000_209_phase8_1_warehouse_tables.sql`, `20260726141000_210_phase8_2_5_stock_engine.sql`, `20260726142000_211_phase8_5_fix_stock_notify.sql`
- ۸.۱ جداول + RLS + seed ماژول — DONE
  - پنج جدول: `warehouses`, `warehouse_stock`, `stock_movements`, `stock_transfers`, `stock_transfer_items`.
  - ایندکس یکتای partial `uq_warehouses_single_default` → تنها یک انبار پیش‌فرض.
  - RLS روی هر پنج جدول فعال (۴ policy برای warehouses، ۲ برای بقیه). خواندن: admin/manager/accountant/sales/purchase_specialist؛ نوشتن: admin/manager. کاردکس از دید کاربر فقط‌خواندنی است.
  - ماژول `warehouse` در `role_permissions` برای ۵ نقش seed شد (قبلاً seed نبود و fallback می‌زد).
  - tests: هر ۵ جدول موجود؛ `module='warehouse'` موجود؛ `relrowsecurity=t` روی همه.
- ۸.۲–۸.۵ موتور حرکت موجودی — DONE
  - **قاعدهٔ مرکزی:** هیچ‌کس مستقیم `warehouse_stock` را دست نمی‌زند؛ همه از `apply_stock_movement()` رد می‌شوند تا موجودی و کاردکس همیشه یکی بمانند. `SELECT ... FOR UPDATE` جلوی race در کسر همزمان را می‌گیرد.
  - **ستون `stock_movements.delta` (تصمیم طراحی):** `quantity` طبق CHECK فاز ۸.۱ همیشه مثبت است و جهت از `movement_type` می‌آید — ولی نوع `adjust` هر دو جهت را دارد و با movement_type قابل تفسیر نبود. باگ واقعی: `adjust_warehouse_stock` مقدار منفی پاس می‌داد و به CHECK می‌خورد. راه‌حل: ستون `delta` اثر علامت‌دار را نگه می‌دارد، `quantity = abs(delta)`. کاردکس برای هر پنج نوع خودتوصیف شد.
  - ۸.۲ (۱۷۳): ستون `purchases.warehouse_id` (nullable) + تریگر `trg_purchase_items_stock_in` روی `purchase_items` → افزایش موجودی + کاردکس `in`.
  - ۸.۳ (۱۷۴/۱۷۵): ستون `sales_quotes.warehouse_id` + تریگر روی گذار `status → 'accepted'` → کسر + کاردکس `out`. چک موجودی داخل `apply_stock_movement` است، پس کسر ناکافی کل UPDATE را رد می‌کند و پیش‌فاکتور accepted **نمی‌شود**. تابع `check_quote_stock_availability(quote, warehouse)` برای پیش‌نمایش در UI (خطا نمی‌دهد، گزارش می‌دهد). گارد دوباره‌کسر: اگر کاردکس `sale_quote_confirm` برای آن سند وجود داشته باشد، رد می‌شود.
  - ۸.۴ (۱۷۷): تریگر روی گذار `status → 'confirmed'` → دو ردیف کاردکس (`transfer_out` مبدأ اول، تا اگر موجودی کافی نبود کل تراکنش رد شود، سپس `transfer_in` مقصد).
  - ۸.۵: `sync_product_stock_status()` مجموع موجودی همهٔ انبارها را می‌بیند → `available`/`unavailable`. **محافظ داده:** محصولی که هیچ ردیف `warehouse_stock` ندارد دست‌نخورده می‌ماند تا وضعیت دستی موجود تخریب نشود.
  - **سازگاری با گذشته:** اگر هیچ انباری تعریف نشده باشد (`default_warehouse_id()` تهی) و سند انبار نداشته باشد، همهٔ تریگرها no-op می‌کنند. یعنی تا لحظه‌ای که کاربر انبار نسازد، جریان خرید/فروش موجود دقیقاً مثل قبل کار می‌کند.
  - `adjust_warehouse_stock()` برای تعدیل دستی (گارد admin/manager).
- **باگ کشف‌شده و رفع‌شده (migration 211):** `notify_on_stock_available` به `spt.name` ارجاع می‌داد ولی `sale_price_types` ستون `name` ندارد (واقعی: `title`). خطا در بلوک `EXCEPTION` بلعیده می‌شد، پس «اعلان موجود شدن کالا به کارشناس» **هرگز** کار نکرده بود. چون ۸.۵ از این پس `stock_status` را خودکار عوض می‌کند و همین تریگر مرتب آتش می‌گیرد، بدون این اصلاح خروجی ۸.۵ روی کاغذ درست ولی در عمل خاموش می‌ماند. اصلاح با `replace()` روی `pg_get_functiondef` انجام شد (نه بازتایپ بدنه) تا رشته‌های فارسی در معرض خرابی encoding نروند.
- tests (جریان کامل پلن، همه داخل transaction با ROLLBACK — هیچ دادهٔ آزمایشی باقی نماند):
  1. ساخت ۳ انبار ✓
  2. خرید با انتخاب انبار → موجودی ۱۰، کاردکس `in`/delta ۱۰، `stock_status='available'` ✓
  3. پیش‌فاکتور با همان محصول → قطعی (`draft→sent→accepted`، طبق validator موجود) → موجودی ۱۰−۴=۶، کاردکس `out`/delta −۴ ✓
  4. قطعی با موجودی ناکافی (۵ از ۳) → **رد شد** با پیام فارسی نام‌بردهٔ محصول/انبار/موجود/درخواست؛ پیش‌فاکتور accepted نشد ✓
  5. انتقال ۲ عدد WH-C→WH-N → ۴ و ۲، دو ردیف کاردکس ✓
  6. کاردکس کامل محصول (۴ حرکت) ✓
  - `check_quote_stock_availability`: کافی → `is_sufficient=t`؛ ناکافی (۵ از ۳) → `f` ✓
  - ۸.۵ دوطرفه: `in 5` → available، `out 5` → unavailable ✓
  - `adjust` علامت‌دار: `+7` → qty ۷ (delta +۷)؛ `-5` → qty ۲ (quantity ۵، delta −۵)؛ `-99` رد شد و موجودی دست‌نخورده ماند ✓
  - `warehouse_stock.quantity < 0` → ۰ ردیف (غیرممکن) ✓
- ۸.۶ UI مدیریت انبار — DONE
  - `src/lib/warehouses/queries.ts`: `fetchWarehouses`, `createWarehouse`, `updateWarehouse`, `deleteWarehouse`, `getWarehouseDeleteBlockers`, `fetchProductStockByWarehouse`, `adjustWarehouseStock`, `checkQuoteStockAvailability`, `fetchStockMovements`.
  - route `_app.warehouses.tsx` با گارد `requireAnyRole([admin,manager])` (هم‌تراز policy نوشتن RLS): فهرست + ساخت/ویرایش + تعیین انبار پیش‌فرض + حذف محافظت‌شده.
  - **حذف محافظت‌شده:** قبل از حذف، تعداد موجودی/حرکت کاردکس/سند انتقال شمرده و نمایش داده می‌شود. اگر سابقه دارد، دکمه به «غیرفعال کن» تبدیل می‌شود (FKها `ON DELETE RESTRICT` هستند و DB هم اجازه نمی‌داد). فقط انبار خالیِ بی‌سابقه حذف قطعی می‌شود.
  - هشدار درون‌صفحه اگر هیچ انبار پیش‌فرضی تعیین نشده باشد (چون در آن حالت اسناد بدون انبارِ مشخص موجودی را جابه‌جا نمی‌کنند).
  - `ProductStockByWarehouse` روی صفحهٔ محصول (۱۷۶): موجودی به تفکیک انبار + مجموع. اگر محصول ردیف انباری ندارد رندر نمی‌شود.
- ۸.۷ UI انتخاب انبار در خرید و پیش‌فاکتور — DONE
  - `WarehouseSelect` مشترک؛ گزینهٔ اول همیشه «انبار پیش‌فرض (نام)». اگر هیچ انباری تعریف نشده باشد **هیچ چیز رندر نمی‌کند** (چون تریگرها هم no-op‌اند و فیلد خالی کاربر را گیج می‌کرد).
  - خرید (۱۷۳): `warehouse_id` به schema/defaults/insert `PurchaseForm` اضافه شد. تریگر روی `purchase_items` مقدار `purchases.warehouse_id` را می‌خواند، و PurchaseForm همیشه ردیف `purchase_items` را mirror می‌کند.
  - پیش‌فاکتور (۱۷۸): RPC `create_sales_quote_with_items` پارامتر انبار ندارد. **تصمیم:** به‌جای دست‌زدن به یک RPC مسیر پول، `warehouse_id` بلافاصله بعد از ساخت با UPDATE ست می‌شود — بی‌خطر چون سند `draft` ساخته می‌شود و موجودی فقط در `accepted` حرکت می‌کند.
  - تغییر انبار هنگام قطعی (۱۷۹) + چک موجودی (۱۷۵): در دیالوگ «پذیرش» صفحهٔ `$quoteId`، `WarehouseSelect` برای بازنویسی انبار + نتیجهٔ زندهٔ `check_quote_stock_availability`. اگر کمبود باشد دکمهٔ تأیید **disabled** می‌شود و ردیف‌های کمبود با «نیاز/موجود» نشان داده می‌شوند. انبار **قبل از** تغییر وضعیت ذخیره می‌شود چون تریگر کسر در همان لحظه `sales_quotes.warehouse_id` را می‌خواند.
- ۸.۸ UI انتقال + گزارش کاردکس — DONE
  - `src/lib/warehouses/transfers.ts` + route `_app.warehouses_.transfers.tsx`: ساخت سند draft، افزودن/حذف کالا (با پیام فارسی برای تکراری بودن محصول در یک سند)، قطعی‌کردن، حذف فقط draft. سند قطعی‌شده فقط‌خواندنی است چون کاردکسش سند حسابرسی است.
  - route `_app.warehouses_.kardex.tsx` (۱۸۳): فیلتر انبار + نوع حرکت + بازهٔ تاریخ **شمسی** (`JalaliDateInput`) + جستجوی نام کالا، کارت‌های مجموع ورود/خروج/خالص، و ستون مقدار با علامت +/− از `delta`.
  - مرتب‌سازی کاردکس با tie-break روی `id` انجام می‌شود چون ردیف‌های ساخته‌شده در یک transaction `created_at` یکسان دارند.
- ثبت در ناوبری: سه route در `registry.ts` زیر گروه `purchasing` با ماژول `warehouse`.
- **`ModuleKey` و `AppRole`:** ماژول `warehouse` به `ModuleKey` و `PERMISSIONS` اضافه شد (هم‌تراز RLS و seed). ضمناً `AppRole` فرانت `purchase_specialist` و `site` را نداشت در حالی که enum دیتابیس و `role_permissions` دارند (فاز ۱ همین پلن نام seed را از `purchasing_expert` به `purchase_specialist` اصلاح کرد)، پس گاردها نمی‌توانستند نامشان را ببرند. هر دو به type و `ROLE_LABELS` اضافه شدند ولی **عمداً به `ALL_ROLES` اضافه نشدند** چون آن لیست UI انتخاب نقش را می‌سازد و باید همان ۵ نقش سیستمی بماند.
- `src/integrations/supabase/types.ts` دستی برای پنج جدول جدید (Row/Insert/Update) به‌روز شد.
- tests نهایی فاز ۸:
  - هر دو تست SQL پلن سبز (۵ جدول + `module='warehouse'`).
  - **جریان کامل E2E** (transaction با ROLLBACK): ۳ انبار → خرید ۲۰ عدد دقیقاً از مسیری که `PurchaseForm` می‌نویسد → پیش‌فاکتور ۶ عدد قطعی → انتقال ۵ عدد. نتیجه: WH-C=۹ (۲۰−۶−۵)، WH-N=۵ ✓
  - **تراز دفتر:** `SUM(delta)` کل کاردکس = ۱۴ = `SUM(quantity)` کل `warehouse_stock` → `ledger_balances=t` ✓
  - `npm run build` سبز؛ هر سه route در `routeTree.gen.ts`؛ `eslint --fix` روی همهٔ فایل‌ها بدون خطا؛ `tsc --noEmit` = ۷۰ = baseline.

## Phase 9 — خزانه: سند پرداخت خروجی + صندوق + گزارش + چک
- status: DONE
- commit: (this commit؛ DB در commit قبلی `8c52b848`)
- migrations: `20260726150000_212_phase9_1_payment_vouchers.sql`, `20260726151000_213_phase9_2_4_treasury.sql`
- ۹.۱ صندوق + سند پرداخت خروجی + RLS — DONE
  - `bank_accounts.account_type` (`bank` | `cash`) با پیش‌فرض `'bank'` → حساب موجود دقیقاً مثل قبل رفتار می‌کند (تأیید شد: تنها حساب موجود `bank` ماند). طبق پلن این از جدول مستقل صندوق کم‌ریسک‌تر است.
  - جدول `payment_vouchers`: مبلغ/تاریخ/ساعت، `payee_type` چهارگانه با FKهای nullable، `document_channel` شامل `cheque`، `source_bank_account_id`، فیلدهای چک، `status`، و `purchase_id` اختیاری.
  - سه CHECK نگهبان: دریافت‌کننده باید با نوعش بخواند (قرینهٔ `payment_receipts_receiver_exclusive_chk`)؛ فیلدهای چک فقط برای کانال چک؛ شمارهٔ چک برای کانال چک الزامی.
  - شمارهٔ سند خودکار `PV-<سال>-<۵رقمی>` با sequence + تریگر BEFORE INSERT.
  - RLS مثل `payment_receipts`: خواندن admin/manager/accountant، نوشتن admin/accountant، حذف فقط admin.
- ۹.۲ اتصال پرداخت خرید به سند خروجی — DONE
  - `pay_purchase_with_voucher(...)` اتمیک: سند `approved` می‌سازد و `purchases.paid_at` را ست می‌کند. مبلغ پیش‌فرض `cash_price` وگرنه `total_amount`. گارد دوباره‌پرداخت: اگر سند approved برای آن خرید هست، رد می‌شود.
  - `purchases.paid_at` برای سازگاری می‌ماند ولی منبع حقیقتِ خروج پول `payment_vouchers` است.
- ۹.۳ ماندهٔ حساب/صندوق (۱۸۱) — DONE
  - ویو `vw_account_balances`: `opening_balance + ورودی‌های approved − خروجی‌های approved`. اسناد `pending_review`/`rejected` در مانده اثر ندارند (پول تأییدنشده جزو دارایی خزانه نیست).
  - RPC `get_account_balances(p_account_type, p_include_inactive)` با `SECURITY DEFINER` + `has_any_role`.
- ۹.۴ گزارش ورود/خروج با ماندهٔ تجمعی (۱۸۲) — DONE
  - RPC `get_account_ledger(account, from, to)`: ورودی‌ها از `payment_receipts` و خروجی‌ها از `payment_vouchers` در یک UNION، مرتب بر `(تاریخ, created_at, id)`، با `running_balance` به‌صورت window function.
  - **ماندهٔ ابتدای بازه** درست محاسبه می‌شود: `opening_balance` حساب + همهٔ حرکات تأییدشدهٔ **قبل از** `p_from_date`، پس گزارش یک بازهٔ وسط سال از ماندهٔ واقعی شروع می‌کند نه از صفر.
- **باگ خودم که تست گرفتش:** در `get_account_ledger` به `external_parties.name` ارجاع داده بودم ولی ستون واقعی `full_name` است. نکتهٔ روش‌شناختی: اجرای تست با کاربر `supabase_admin` اول `forbidden` می‌داد (چون `auth.uid()` تهی است) و همین خطای واقعی را پنهان می‌کرد؛ با `SET LOCAL request.jwt.claims` و شبیه‌سازی یک admin واقعی، گارد **اجرا** شد و باگ بیرون افتاد. تست‌های گارد‌دار باید با JWT شبیه‌سازی‌شده اجرا شوند، نه با دور زدن گارد.
- tests (همه داخل transaction با ROLLBACK؛ هیچ دادهٔ آزمایشی باقی نماند):
  - دو تست SQL پلن: جدول `payment_vouchers` موجود ✓؛ ستون `bank_accounts.account_type` با default `'bank'` ✓
  1. تعریف صندوق نقدی (`account_type='cash'`, opening ۱٬۰۰۰٬۰۰۰) ✓
  2. سند پرداخت خروجی ۲۵۰٬۰۰۰ → شمارهٔ خودکار `PV-2026-00001`، مانده ۷۵۰٬۰۰۰ ✓
  3. دریافت ۴۰۰٬۰۰۰ به همان صندوق → مانده ۱٬۱۵۰٬۰۰۰ ✓
  4. گزارش دوطرفه: سه ردیف با ماندهٔ تجمعی ۷۵۰٬۰۰۰ → ۱٬۱۵۰٬۰۰۰ → ۱٬۰۵۰٬۰۰۰؛ `last_running == current_balance == ۱٬۰۵۰٬۰۰۰` ✓؛ فیلتر بازهٔ «فقط امروز» از ماندهٔ ۱٬۱۵۰٬۰۰۰ شروع کرد (روز قبل در opening لحاظ شد) ✓
  5. پرداخت با کانال «چک» + شمارهٔ چک + سررسید ✓
  - نام طرف حساب در گزارش از supplier/external_party/customer/payee_name درست resolve شد ✓
- ۹.۵ + UI خزانه — DONE
  - `src/lib/treasury/queries.ts`: لایهٔ داده (ماندهٔ حساب، گزارش دفتر، فهرست/ساخت سند پرداخت، پرداخت خرید).
  - route `_app.accounting.treasury.tsx` (۱۸۱/۱۸۲): کارت‌های مجموع صندوق‌ها/بانک‌ها/کل، جدول ماندهٔ هر حساب (ماندهٔ اولیه، ورودی، خروجی، ماندهٔ جاری) با فیلتر نوع و نمایش غیرفعال‌ها، و با کلیک روی «ورود/خروج» گزارش دوطرفهٔ همان حساب با بازهٔ **تاریخ شمسی** + ماندهٔ تجمعی + کارت‌های جمع ورودی/خروجی/خالص/ماندهٔ پایان بازه.
  - route `_app.accounting.payment-vouchers.tsx` (۱۸۰/۹.۵): فهرست اسناد پرداخت با فیلتر بازهٔ شمسی + دیالوگ ساخت سند. نوع دریافت‌کننده چهارگانه با picker مربوطه (تأمین‌کننده/طرف خارجی/مشتری/سایر)، انتخاب حساب مبدأ همراه نمایش ماندهٔ جاری، و فیلدهای چک فقط برای کانال «چک» (با پاک‌سازی خودکار هنگام تعویض کانال، آینهٔ CHECK دیتابیس). گارد ساخت: admin/accountant.
  - `_app.accounting.bank-accounts.tsx`: فیلد «نوع حساب» (حساب بانکی/صندوق نقدی) در فرم + ستون «نوع» در جدول.
  - `_app.accounting.purchase-payments.tsx` (۹.۲): فیلد اختیاری «از حساب/صندوق». اگر انتخاب شود، پرداخت از `pay_purchase_with_voucher` رد می‌شود و سند خزانه می‌سازد؛ اگر خالی بماند **رفتار قبل از فاز ۹ حفظ می‌شود** (فقط `paid_at`). برای کانال چک، شمارهٔ چک اجباری و دکمه تا پر شدنش disabled است.
  - ثبت دو route در `registry.ts` (گروه `finance`) + `types.ts` دستی برای `payment_vouchers` و `bank_accounts.account_type`. ضمناً `bank_accounts.accounting_code` (migration 155) هم از `types.ts` جا افتاده بود و اضافه شد.
- tests نهایی فاز ۹:
  - جریان ۹.۲ کامل: سند با مبلغ **`cash_price` (۸۵۰٬۰۰۰)** ساخته شد نه `total_amount` (۹۰۰٬۰۰۰) ✓؛ کانال چک با شماره و سررسید ✓؛ `purchase_id` لینک شد ✓؛ `paid_at` اتمیک ست شد ✓؛ مانده ۵٬۰۰۰٬۰۰۰ → ۴٬۱۵۰٬۰۰۰ ✓
  - گارد دوباره‌پرداخت: تلاش دوم با پیام فارسی «برای این خرید از قبل سند پرداخت ثبت شده است» رد شد ✓
  - `npm run build` سبز؛ هر دو route در `routeTree.gen.ts`؛ `tsc --noEmit` = ۷۰ = baseline.
  - **eslint:** baseline کل `src` = ۸۲۰ error / ۴۱۸ warning؛ بعد از کار من = ۸۲۰ error / ۴۱۹ warning → **هیچ error جدیدی اضافه نشد**. روی فایل‌های خودم: ۰ error، ۴ warning.

---

## گزارش نهایی
`docs/execution/FINAL-REPORT.md` ساخته شد (بخش ۴ پلن).
</content>
