## مشکلات و راه‌حل

### ۱) دکمهٔ ساخت پارامتر امتیازدهی وجود ندارد
در کارت «وزن KPIهای پیوسته» یک دکمهٔ «افزودن پارامتر جدید» با یک دیالوگ اضافه می‌شود. فیلدها: `key` (انگلیسی، snake_case)، `label_fa`، `weight`، `source` (invoices | manual | penalty)، `unit` اختیاری، `direction` (higher_better | lower_better)، `enabled`. تابع موجود `upsertKpi` از قبل امکان درج را می‌دهد و بعد از ثبت، لیست KPIها refetch می‌شود.

### ۲) ارور WebSocket هنگام ثبت امتیاز دستی
Server function `recordManualScoreAdjustment` از `requireSupabaseAuth` (auto-generated) استفاده می‌کند که کلاینت Supabase را بدون stub برای Realtime می‌سازد؛ در Node 20 هنگام صدا زدن `.rpc()`/`context.supabase` خطای «Node.js detected but native WebSocket not found» تولید می‌شود. راه‌حل هم‌جهت با پروژه: جایگزینی با `requireSupabaseAuthNode20` (نسخهٔ hand-authored که transport بی‌اثر برای realtime پاس می‌دهد؛ در `messenger-auth-middleware.ts` برای همین منظور وجود دارد).

### ۳) فقط ادمین می‌تواند تنظیمات را تغییر دهد
- گارد مسیر `/gamification/settings` از `["admin", "manager"]` به `["admin"]` سخت می‌شود.
- بررسی نقش داخل `recordManualScoreAdjustment` نیز فقط admin را می‌پذیرد.
- سیاست‌های RLS جدول `gamification_kpis` (INSERT/UPDATE/DELETE) از admin+manager به admin-only محدود می‌شود؛ همچنین سیاست UPDATE/DELETE جدول `gamification_kpi_rules` و `employee_score_events.insert` (در صورت وجود سیاست) بازبینی می‌شود.

### ۴) نمایش امتیاز در داشبورد (MyScoreCard)
کامپوننت از قبل موجود و به `employee_scores.total_score` وصل است؛ پس از فعال شدن ثبت دستی و اجرای `calculate_employee_score`، مقدار به‌روز می‌شود — نیازی به تغییر کد نیست، فقط با تست دستی تأیید می‌شود.

## فایل‌ها/تغییرات

- `src/lib/gamification/manual-score.functions.ts`: جایگزینی import و middleware با `requireSupabaseAuthNode20`؛ حذف چک `isManager` و نگه داشتن فقط `isAdmin`.
- `src/routes/_app.gamification.settings.tsx`:
  - `beforeLoad` → `requireAnyRole(["admin"])`.
  - افزودن کامپوننت `NewKpiDialog` داخل هدر `KpiWeightsCard` با دکمهٔ «پارامتر جدید» و invalidation کوئری `settings-kpis`.
- Migration کوچک: بازنویسی سیاست‌های `gamification_kpis` به admin-only (drop و create مجدد سیاست‌های insert/update/delete).

## چک لیست تست پس از اعمال

۱. با نقش **admin**: `/gamification/settings` باز شود.
۲. دکمهٔ «پارامتر جدید» → فرم را با key منحصربه‌فرد پر کن → ثبت → پارامتر در جدول ظاهر شود.
۳. وزن یک پارامتر را تغییر بده → ذخیره → توست موفقیت.
۴. «ثبت امتیاز دستی» → کارمند، مقدار +۱۰، دلیل ≥۱۰ کاراکتر → بدون ارور WebSocket ثبت شود و توست موفقیت.
۵. با همان کارمند لاگین کن → `/dashboard` → کارت «امتیاز من» مقدار جدید را نشان دهد.
۶. با نقش **manager یا employee**: مراجعه به `/gamification/settings` باید redirect یا 403 شود.
۷. با کاربر غیرادمین تلاش برای صدا زدن `recordManualScoreAdjustment` → با خطای «Forbidden: admin role required» رد شود.
۸. تلاش مستقیم برای INSERT روی `gamification_kpis` با کاربر manager → با خطای RLS رد شود.
