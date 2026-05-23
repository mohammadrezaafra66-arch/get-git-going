# طرح بازطراحی Shell / Sidebar / Dashboard افراکالا

شاخه پیشنهادی: `feature/rtl-dashboard-shell-sidebar`
نوع تغییر: فقط Frontend/UI. بدون migration، بدون تغییر RLS/auth/storage/pricing/sale-list PDF/invoices/business logic.

---

## ۱) بررسی وضعیت موجود (Files inspected)

| لایه | فایل فعلی | وضعیت |
|---|---|---|
| Shell | `src/components/layout/AppShell.tsx` | RTL با `SidebarProvider` و `SidebarInset` — سالم، قابل استفاده مجدد. |
| Header | `src/components/layout/AppHeader.tsx` | شامل `SidebarTrigger`, `NotificationBell`, user menu. |
| Sidebar | `src/components/layout/AppSidebar.tsx` | کامل، RTL (`side="right"`)، با quick-access، جستجو، گروه‌های collapsible، badge صف قیمت‌گذاری، realtime users pending. |
| Nav config | `src/components/layout/nav-items.ts` | data-driven، ۹ گروه، ~۹۰ آیتم، با RBAC (`module`, `adminOnly`). |
| Mobile nav | `src/components/layout/MobileBottomNav.tsx` | role-aware. |
| Dashboard | `src/routes/_app.dashboard.tsx` | ساده، KPIهای خالی `—`، صرفاً معرفی فاز ۱. |
| Auth wrapper | `src/routes/_app.tsx` | مدیریت loading/error session. |
| UI kit | `src/components/ui/sidebar.tsx`, `card`, `button`, `collapsible`, `tooltip`, `dropdown-menu` (shadcn). | کامل. |
| Tokens | `src/styles.css` | شامل `--sidebar-*`, `--background`, `--primary` با oklch. |

**روت‌های موجود مرتبط (نمونه):** `/dashboard`, `/products`, `/products/categories`, `/products/brands`, `/pricing/*`, `/sales`, `/sales/quotes`, `/sales/invoices`, `/sales/customers`, `/accounting/receipts`, `/accounting/payables`, `/accounting/bank-accounts`, `/reports`, `/marketing/suggestions-history`, `/users`, `/roles`, `/admin/settings`, `/audit-logs`, `/notifications`, `/messages`, `/operations/tasks`.

**یافته‌های مهم:**
- زیرساخت shell/sidebar/RBAC کامل است؛ نیازی به بازنویسی نیست.
- `nav-items.ts` دقیقاً همان منبع data-driven مطلوب طرح است → فقط mapping به ۷ ماژول لازم است.
- هیچ روت اختصاصی برای «دستیار» (assistant) وجود ندارد. (سؤال در بخش ۸.)
- روت‌های «بازگشت از فروش»، «چک‌ها»، «پشتیبان‌گیری»، «هماهنگی‌ها»، «پرسش‌های پرتکرار»، «تحلیل پیش‌بینی»، «داشبوردهای تحلیلی»، «گزارش‌ساز پیشرفته» وجود ندارند — برای آن‌ها item ایجاد **نمی‌شود** (طبق دستور: «روت‌های خالی نسازید»).

---

## ۲) رویکرد طراحی — حداقل تهاجم

سه تغییر مستقل:

### الف) معماری ناوبری ۲-سطحی با ۷ ماژول اصلی (progressive disclosure)

افزودن یک «لایه نگاشت» روی `nav-items.ts` بدون تغییر ساختار خود فایل (تا RBAC، AppSidebar فعلی و mobile nav سالم بمانند). فایل جدید:

- `src/components/layout/primary-modules.ts` — تعریف ۷ ماژول اصلی (`dashboard | assistant | catalog | sales | finance | analytics | admin`) با: کلید، برچسب فارسی، آیکون، روت پیش‌فرض، و **لیست `to`های زیرمنو** که به آیتم‌های موجود `NAV_ITEMS` map می‌شوند.

نگاشت پیشنهادی (فقط روت‌های موجود):

- **داشبورد** → `/dashboard`, `/operations/tasks`, `/notifications`, `/reports` (به‌عنوان «نمای کلی/گزارش‌ها»)
- **دستیار** → `/pricing/market-intelligence`, `/pricing/product-recommendations`, `/marketing/suggestions`, `/marketing/suggestions-history`, `/pricing/price-alerts`, `/messages`
- **کالا** → `/products`, `/products/categories`, `/products/brands`, `/products/labels`, `/pricing/quick-price`, `/pricing/sale-lists`, `/price-lists`, `/pricing/purchase-prices`
- **فروش** → `/sales/customers`, `/sales`, `/sales/quotes`, `/sales/invoices`, `/sales/stock-alerts`, `/sales/credit-customers`
- **مالی** → `/accounting/receipts`, `/accounting/purchase-payments`, `/accounting/bank-accounts`, `/accounting/external-parties`, `/accounting/daily-capital`, `/accounting/receivables`, `/accounting/payables`
- **تحلیل** → `/reports`, `/sales/quote-share-logs`, `/pricing/amin-hozoor-board`, `/pricing/market-intelligence`, `/marketing/suggestions-history`
- **مدیریت** → `/users`, `/roles`, `/admin/roles`, `/admin/settings`, `/audit-logs`, `/bot-api-keys` و سایر `/admin/*`

### ب) بازنویسی `AppSidebar.tsx` به مدل ۲-سطحی

- نوار آیکونی باریک سمت راست (۷۶px) با ۷ آیکون ماژول؛ فعال‌شدن با کلیک یا بر اساس روت فعلی.
- پنل زیرمنوی متنی (۲۲۰px) فقط برای ماژول فعال (progressive disclosure).
- بالای ماژول‌ها: لوگو + «افراکالا / دستیار هوشمند کسب‌وکار» + search box (Ctrl+K placeholder، عملکرد جستجوی فعلی منو حفظ شود).
- پایین: لینک‌های «اعلان‌ها» با badge موجود، «راهنما» (لینک به `/knowledge`)، پروفایل کاربر (email + roles از `useAuth`)، دکمه collapse.
- حالت collapsed: فقط ستون آیکونی ۷-تایی + tooltip.
- موبایل: drawer از سمت راست (همان رفتار فعلی `SidebarProvider` با `side="right"`).
- **حفظ:** badge صف pricing recompute، badge pending users، realtime subscription، RBAC از `hasPermissionEx`، quick-access در پایین زیرمنوی داشبورد.

### ج) ارتقای صفحه داشبورد (`_app.dashboard.tsx`)

- breadcrumb «خانه / داشبورد».
- KPI cards با مقادیر **placeholder واضح** («—» یا «در حال آماده‌سازی») — **هیچ داده fake که با backend در تضاد باشد ساخته نمی‌شود**. مقادیر نمونه پیشنهادی فقط در صورت اجازه شما اضافه می‌شود (سؤال در بخش ۸).
- دو کارت چارت placeholder (بدون افزودن کتابخانه چارت جدید — از div + متن «نمودار به‌زودی»).
- لیست فعالیت‌های اخیر: استفاده از داده واقعی notifications اگر RLS اجازه دهد، در غیر این‌صورت skeleton.
- لیست وظایف: لینک به `/operations/tasks` با وضعیت empty.
- دکمه «بررسی تولدهای امروز» فعلی حفظ می‌شود.

---

## ۳) فایل‌هایی که تغییر می‌کنند

| فایل | نوع | علت |
|---|---|---|
| `src/components/layout/primary-modules.ts` | **جدید** | تعریف ۷ ماژول و نگاشت به روت‌های موجود. |
| `src/components/layout/AppSidebar.tsx` | ویرایش | ساختار ۲-سطحی، layout دو-ستونی. RBAC و badgeها حفظ. |
| `src/routes/_app.dashboard.tsx` | ویرایش | KPI cards + breadcrumb + activities/tasks placeholders. |
| `src/styles.css` | ویرایش جزئی | tuning متغیرهای sidebar (پالت دقیق درخواست: `#0F172A`, `#3B82F6`,…) فقط در صورت اختلاف. |
| `docs/lovable-change-reports/2026-05-23-HHMM-rtl-dashboard-shell-sidebar.md` | جدید | گزارش تغییرات. |

**عمداً تغییر نمی‌کنند:** `AppShell.tsx`, `AppHeader.tsx`, `MobileBottomNav.tsx`, `nav-items.ts`, `_app.tsx`, تمام روت‌های زیر `_app.*`, تمام فایل‌های pricing/sale-list/PDF/invoice/auth/supabase/migration/deploy.

---

## ۴) تأیید مرزهای ایمنی

- ❌ بدون DB migration. ❌ بدون تغییر RLS/policies. ❌ بدون تغییر auth/storage. ❌ بدون تغییر pricing engine, sale-list PDF, settlement types, invoices, pricing_rules.
- ❌ بدون تغییر روت‌های public sale list (`public.sale-lists.$listId.tsx`).
- ❌ بدون رنامیگ روت‌ها یا حذف کد.
- ❌ بدون افزودن dependency جدید (از shadcn + lucide موجود استفاده می‌شود).
- ✅ تماماً Frontend.

---

## ۵) سطح ریسک

**LOW** — تغییرات روی shell/sidebar نمایش‌محور است و RBAC / data hooks فعلی حفظ می‌شود. تنها ریسک واقعی: اگر آیتمی از `NAV_ITEMS` در نگاشت ۷ ماژول قرار نگیرد، کاربر آن را در سایدبار نمی‌بیند (اما روت همچنان قابل دسترس مستقیم است). برای پوشش: یک ماژول fallback «بیشتر» اضافه می‌کنیم که آیتم‌های unmapped را در پایین زیرمنوی «مدیریت» نشان دهد.

---

## ۶) پلن تست دستی

1. Login → `/dashboard` → سایدبار راست، ۷ آیکون.
2. کلیک روی هر ۷ ماژول → فقط زیرمنوی همان ماژول دیده شود.
3. ناوبری به `/products`, `/sales/quotes`, `/accounting/receipts` → آیتم active درست highlight شود.
4. RBAC: ورود با کاربر `sales` → ماژول «مدیریت» نباید قابل کلیک باشد یا زیرمنوی خالی نشان دهد.
5. collapse sidebar → فقط ۷ آیکون + tooltip.
6. Mobile (<768px) → drawer از راست باز شود.
7. صف pricing recompute (admin) → badge قرمز/زرد روی آیتم آن دیده شود.
8. کاربران در انتظار تأیید (admin) → badge کنار «کاربران».
9. جستجوی منو از بالای سایدبار → نتایج همان آیتم‌های مجاز.
10. داشبورد → KPI cards، breadcrumb، دکمه تولد همچنان کار کند.
11. `npm run build` و `npm run lint`.

---

## ۷) Self-Host Acceptance Check

- بدون CDN/فونت آنلاین جدید (فونت Vazirmatn اگر قبلاً local نباشد، اضافه نمی‌شود مگر اجازه دهید).
- بدون secret جدید.
- بدون وابستگی به سرویس خارجی.
- سازگار با Docker/Linux deployment فعلی.

---

## ۸) پرسش‌ها قبل از پیاده‌سازی

1. **«دستیار»**: روت اختصاصی assistant/chat وجود ندارد. آیا این ماژول را به ابزارهای هوشمند موجود (`/pricing/market-intelligence`, `/pricing/product-recommendations`, `/marketing/suggestions`) map کنم، یا روت placeholder `/assistant` بسازم با صفحه «به‌زودی»؟
2. **KPIهای داشبورد**: مقادیر نمونه (۱۲۸,۴۵۰,۰۰۰ تومان و …) را به‌صورت **placeholder ثابت** نمایش دهم (هشدار: داده fake) یا فقط skeleton/«—» تا اتصال به backend واقعی در فاز بعد؟
3. **فونت Vazirmatn**: اگر در پروژه local نیست، اضافه کنم به `src/assets/fonts/` و در `styles.css` بارگذاری کنم؟ (سازگار با self-host)
4. **آیتم‌های unmapped**: ماژول fallback «بیشتر» اضافه شود یا همه آیتم‌ها به یکی از ۷ ماژول map شوند (با کمی فشار معنایی)؟

پس از تأیید این ۴ مورد، پیاده‌سازی را آغاز می‌کنم.
