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
- status: TODO

## Phase 8 — چندانباره کامل
- status: TODO

## Phase 9 — خزانه: سند پرداخت خروجی + صندوق + گزارش + چک
- status: TODO
</content>
