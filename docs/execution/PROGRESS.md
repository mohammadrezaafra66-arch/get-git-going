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
- status: TODO

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
