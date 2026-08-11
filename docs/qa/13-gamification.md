# ماژول ۱۳ — گیمیفیکیشن (امتیاز، مأموریت، مدال، لیگ، پاداش)

**تستر مسئول:** کارمند: نیلا/آرمین (`test.sales`)؛ مدیریت: حانیه (`test.manager`) و محمدرضا (`test.admin`). تست منفی: `test.viewer`/`test.sales`.
**مسیرها:** `/gamification`, `/gamification/leaderboard`, `/gamification/achievements`, `/gamification/settings`, `/gamification/admin`, `/gamification/admin/kpi-rules`, `/gamification/admin/missions`, `/gamification/admin/achievements`, `/gamification/admin/leagues`, `/gamification/admin/rewards`, `/gamification/admin/analytics`, `/gamification/admin/purchase-settings`.

## الف) این ماژول چه کاری می‌کند
هر کارمند بر اساس عملکردش امتیاز، مدال، مأموریت و رتبهٔ لیگ می‌گیرد و در «لیدربورد» دیده می‌شود. مدیر قوانین امتیازدهی (KPI)، مأموریت‌ها، مدال‌ها، لیگ‌ها و پاداش‌ها را تعریف می‌کند و «تحلیل گیمیفیکیشن» را می‌بیند.

> پیش‌نیاز: داشبورد/لیدربورد کارمند با هر کاربر باز می‌شود؛ بخش مدیریت نیازمند admin/manager است.

## ب) تست‌کیس‌ها

| شناسه | عنوان | اولویت | پیش‌نیاز | مراحل | نتیجهٔ مورد انتظار | نتیجهٔ واقعی | وضعیت |
|---|---|---|---|---|---|---|---|
| GAM-001 | داشبورد کارمند | P1 | `test.sales` | ۱) `/gamification` را باز کن | امتیاز، مأموریت‌های امروز، مدال‌ها و رتبهٔ خودت نمایش داده می‌شود | | |
| GAM-002 | لیدربورد | P1 | لاگین | ۱) `/gamification/leaderboard` را باز کن | رتبه‌بندی کارمندان (روزانه/هفتگی/ماهانه/کل) نمایش داده می‌شود | | |
| GAM-003 | مدال‌های من | P2 | `test.sales` | ۱) `/gamification/achievements` را باز کن | مدال‌های کسب‌شده و در انتظار نمایش داده می‌شوند | | |
| GAM-004 | داشبورد مدیریت | P2 | `test.manager` | ۱) `/gamification/admin` را باز کن | نمای کلی مدیریتی گیمیفیکیشن نمایش داده می‌شود | | |
| GAM-005 | قوانین امتیاز (KPI) | P1 | `test.manager`/admin | ۱) `/gamification/admin/kpi-rules` ۲) یک قانون بساز | قانون ذخیره می‌شود؛ کلید رویداد تکراری → toast «کلید رویداد تکراری است» | | |
| GAM-006 | مأموریت‌ها | P1 | `test.manager`/admin | ۱) `/gamification/admin/missions` ۲) مأموریت با تاریخ شروع/پایان بساز | ذخیره می‌شود؛ تاریخ نامعتبر → «تاریخ پایان باید بعد از تاریخ شروع باشد.»؛ تکراری → «این مأموریت قبلاً تعریف شده است.» | | |
| GAM-007 | مدال‌ها | P2 | `test.manager`/admin | ۱) `/gamification/admin/achievements` ۲) مدال با شرط بساز | ذخیره می‌شود؛ شرط تکراری → «این شرط قبلاً برای یک مدال دیگر تعریف شده است.» | | |
| GAM-008 | پاداش‌ها | P1 | `test.manager`/admin | ۱) `/gamification/admin/rewards` ۲) پاداش بساز/ویرایش کن | toast «پاداش ذخیره شد» | | |
| GAM-009 | لیگ‌ها | P2 | `test.manager`/admin | ۱) `/gamification/admin/leagues` ۲) تنظیمات لیگ/فصل را ببین | تنظیمات لیگ و فصل‌ها نمایش داده می‌شوند | | |
| GAM-010 | تحلیل گیمیفیکیشن | P2 | `test.manager`/admin | ۱) `/gamification/admin/analytics` را باز کن | نمودارهای تحلیلی (روند، برترین‌ها، ریسک) نمایش داده می‌شوند | | |
| GAM-011 | طلای زمان (خرید) | P1 | `test.manager`/accountant/admin | ۱) `/gamification/admin/purchase-settings` را باز کن | تنظیمات امتیاز خرید نمایش داده می‌شوند | | |

## ج) تست‌های منفی (هر سه لایه)

| شناسه | نقش/سناریو | اولویت | چه کاری امتحان کن | نتیجهٔ مورد انتظار | نتیجهٔ واقعی | وضعیت |
|---|---|---|---|---|---|---|
| GAM-N01 | `test.sales` — route مدیریت | P0 | `/gamification/admin/missions` را مستقیم باز کن | باید به `/unauthorized` هدایت شوی (guard `requireAnyRole(["admin","manager"])`) | | |
| GAM-N02 | `test.sales` — تنظیمات | P0 | `/gamification/settings` را باز کن | باید به `/unauthorized` هدایت شوی (guard `requireAnyRole(["admin"])`) | | |
| GAM-N03 | `test.sales` — امتیاز دیگران (RLS) | P0 | امتیاز کارمند دیگر را بخواه | RLS `employee_scores` فقط امتیاز خودت یا admin/manager؛ امتیاز دیگران نباید دیده شود (لیدربورد استثناست) — **اگر جزئیات دیگران دیده شد بررسی کن** | | |
| GAM-N04 | `test.viewer` — CRUD مدیریتی (⚠️ لایهٔ عملیات) | P0 | با نقش پایین، از طریق درخواست مستقیم، CRUD گیمیفیکیشن را امتحان کن | لایهٔ `lib/operations/gamification*` فقط به RLS متکی است؛ RLS نوشتن را به admin/manager محدود می‌کند — **اگر نقش پایین توانست بنویسد = یافتهٔ امنیتی `رد`** | | |

## د) موبایل

| شناسه | صفحه | بررسی | نتیجهٔ واقعی | وضعیت |
|---|---|---|---|---|
| GAM-M01 | `/gamification` | کارت‌های امتیاز/مأموریت تک‌ستونی روی موبایل | | |
| GAM-M02 | `/gamification/leaderboard` | جدول رتبه‌بندی داخل کانتینر اسکرول‌شونده، RTL | | |
| GAM-M03 | `/gamification/admin/analytics` | نمودارها روی موبایل بدون اسکرول افقی | | |
