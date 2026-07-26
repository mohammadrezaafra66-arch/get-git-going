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
- status: TODO

## Phase 4 — UX کوچک: کپی گروهی فروش + آموزش درون‌صفحه
- status: TODO

## Phase 5 — اشخاص: پل customer↔person + ایمپورت اشخاص
- status: TODO

## Phase 6 — یکی‌سازی پیش‌فاکتور + فیش بدون لینک
- status: TODO

## Phase 7 — مارکتینگ: سقف رندوم کانال + گیمیفیکیشن + وزن محصول
- status: TODO

## Phase 8 — چندانباره کامل
- status: TODO

## Phase 9 — خزانه: سند پرداخت خروجی + صندوق + گزارش + چک
- status: TODO
</content>
