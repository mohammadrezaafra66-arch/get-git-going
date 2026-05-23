# RTL Dashboard Shell + Sidebar + Dashboard Refresh

تاریخ: 2026-05-23 08:45 UTC
شاخه: `feature/rtl-dashboard-shell-sidebar`
نوع تغییر: فقط Frontend/UI
ریسک: LOW

---

## ۱) هدف

ارتقای shell، سایدبار و داشبورد به یک تجربه RTL حرفه‌ای دو-سطحی با ۷ ماژول اصلی (progressive disclosure) بدون شکستن هیچ روت، RBAC، یا منطق کسب‌وکار.

## ۲) فایل‌های بررسی‌شده

- `src/components/layout/AppShell.tsx`
- `src/components/layout/AppHeader.tsx`
- `src/components/layout/AppSidebar.tsx`
- `src/components/layout/MobileBottomNav.tsx`
- `src/components/layout/nav-items.ts`
- `src/components/ui/sidebar.tsx` / `tooltip.tsx` / `card.tsx`
- `src/routes/_app.tsx`
- `src/routes/_app.dashboard.tsx`
- `src/styles.css`
- `src/lib/auth/AuthProvider.tsx` (read-only)
- `src/lib/rbac/roles.ts` (read-only)
- ساختار `src/routes/` برای نگاشت دقیق ماژول‌ها به روت‌های موجود

## ۳) فایل‌های تغییریافته

| فایل | نوع | علت |
|---|---|---|
| `src/components/layout/primary-modules.ts` | جدید | تعریف ۷ ماژول اصلی + ماژول fallback «بیشتر»، با نگاشت **فقط به روت‌های موجود** در `NAV_ITEMS`. helperهای `resolveActiveModule` و `itemsForModule`. |
| `src/components/layout/AppSidebar.tsx` | بازنویسی | معماری ۲-سطحی: نوار آیکونی ۷-تایی سمت راست + پنل زیرمنوی ماژول فعال. حفظ RBAC، realtime badgeها (pending users / pricing queue)، جستجوی منو، quick-access، collapsible icon mode، tooltip. اضافه شدن جستجوی Ctrl+K placeholder، پروفایل کاربر و دکمه خروج در footer. |
| `src/routes/_app.dashboard.tsx` | ارتقا | breadcrumb «خانه / داشبورد»، ۴ KPI card با placeholder شفاف («—» + برچسب «در حال آماده‌سازی»)، دو کارت چارت placeholder (بدون کتابخانه چارت جدید)، فعالیت‌های اخیر skeleton، کارت وظایف با لینک به `/operations/tasks`، ۶ stat ثانویه. دکمه «بررسی تولدهای امروز» حفظ شد. |
| `docs/lovable-change-reports/2026-05-23-0845-rtl-dashboard-shell-sidebar.md` | جدید | همین گزارش. |

## ۴) فایل‌هایی که تغییر **نکرده‌اند**

- `nav-items.ts` (منبع حقیقت ناوبری بدون تغییر باقی ماند → RBAC، MobileBottomNav و سایر مصرف‌کنندگان سالم.)
- `AppShell.tsx`, `AppHeader.tsx`, `MobileBottomNav.tsx`
- `_app.tsx` و تمام روت‌های زیر `_app.*`
- `_app.pricing.sale-lists*` و سایر روت‌های pricing
- `src/lib/pdf/sale-list-pdf.ts`
- `public.sale-lists.$listId.tsx`
- تمام فایل‌های `supabase/`, `deploy/`, `docs/self-host-governance/*`
- `src/integrations/supabase/*`, `src/lib/auth/*`, `src/lib/rbac/*`
- هیچ migration، RLS, policy، storage rule، edge function، یا env var تغییر نکرده است.

## ۵) نگاشت ۷ ماژول → روت‌های موجود

- **داشبورد** → `/dashboard`, `/notifications`, `/operations/tasks`, `/operations/daily-mood`
- **دستیار** → `/pricing/market-intelligence`, `/pricing/product-recommendations`, `/pricing/price-alerts`, `/marketing/suggestions`, `/marketing/suggestions-history`, `/messages`
- **کالا** → محصولات، دسته‌بندی، برندها، ویژگی‌ها، برچسب‌ها، قیمت‌های خرید/فروش، کارگاه قیمت، تأمین‌کنندگان، خرید
- **فروش** → جستجوی فروش، مشتریان، اشخاص، پیش‌فاکتور، فاکتور، هشدار موجودی، اعتبار مشتریان
- **مالی** → فیش‌ها، مطالبات، بدهی، پرداخت خرید، حساب بانکی، طرف‌های حساب، سرمایه روز
- **تحلیل** → گزارش‌ها، لاگ اشتراک، گیمیفیکیشن، لاگ فعالیت
- **مدیریت** → کاربران، نقش‌ها، تنظیمات، ارز، تسویه، API ربات، ابزارها
- **بیشتر** (fallback) → بازخورد، دانش، آکادمی، جداول داده پویا

هیچ روت جدیدی ساخته نشده است. آیتم‌های unmapped از طریق ماژول «بیشتر» قابل دسترس‌اند و جستجوی منو (Ctrl K placeholder) کل `NAV_ITEMS` را پوشش می‌دهد.

## ۶) تأثیرات

- **Migration impact:** بدون migration.
- **RLS/RBAC impact:** RBAC حفظ شد — همان `hasPermissionEx(roles, module, "view")` روی `NAV_ITEMS` اعمال می‌شود؛ هر آیتمی که در ماژول map شده اما برای کاربر مجاز نیست، در زیرمنو ظاهر نمی‌شود. ماژول‌های با شمارش صفر در نوار آیکون disabled می‌شوند.
- **Audit log impact:** بدون تغییر.
- **سازگاری self-host:** بدون CDN/فونت آنلاین جدید (Vazirmatn از قبل local است). بدون dependency جدید. سازگار با Linux + Docker.
- **عملکرد:** بدون افزایش query؛ همان دو `useQuery` قبلی (pending users, pricing queue) استفاده می‌شود.

## ۷) پلن تست دستی

1. `/dashboard` → سایدبار سمت راست با ۷ آیکون + ماژول «بیشتر» قابل مشاهده.
2. کلیک روی هر ماژول → فقط زیرمنوی همان ماژول نمایش داده شود؛ ناوبری به `defaultTo` انجام شود.
3. ناوبری مستقیم به `/products`, `/sales/quotes`, `/accounting/receipts` → ماژول و آیتم active درست highlight شوند.
4. کاربر `sales` → ماژول‌های «مدیریت» و «مالی» با شمارش صفر/کم نمایش داده شوند (disabled یا empty state).
5. Collapse سایدبار → فقط ستون آیکونی ۷-تایی + tooltip فارسی.
6. Mobile (<768px) → drawer از راست باز شود، `MobileBottomNav` بدون تغییر کار کند.
7. Admin → badge قرمز/زرد روی `/pricing/recompute-prices` و badge کاربران در انتظار روی `/users`.
8. جستجوی منو → نتایج فقط از آیتم‌های مجاز.
9. داشبورد → breadcrumb، KPIها، چارت‌های placeholder، فعالیت‌ها skeleton، دکمه تولد همچنان کار کند.
10. خروج از حساب از طریق دکمه LogOut در footer سایدبار → redirect به `/login`.

## ۸) Self-Host Acceptance Check

- ✅ بدون migration.
- ✅ بدون تغییر RLS/policies/storage/auth.
- ✅ بدون CDN خارجی.
- ✅ بدون secret جدید.
- ✅ سازگار با Docker/Linux deployment.
- ✅ بدون dependency جدید (shadcn + lucide موجود).

## ۹) به‌روزرسانی Local

نوع: A — فقط کد frontend.
مراحل: `git pull` → rebuild image → recreate سرویس app. بدون backup/export.

## ۱۰) ریسک‌های باقی‌مانده

- آیتم‌های `NAV_ITEMS` که در هیچ ماژولی map نشده‌اند فقط از طریق ماژول «بیشتر» یا جستجو قابل دسترس‌اند. اگر کاربر روت خاصی را در سایدبار پیدا نکرد، باید آن `to` را به آرایه `paths` ماژول مربوطه در `primary-modules.ts` اضافه کرد.
- KPIهای داشبورد placeholder هستند («—» + برچسب «در حال آماده‌سازی») — هیچ داده fake نمایش داده نمی‌شود. اتصال به backend واقعی در PR بعد.

## ۱۱) Verification

- Build/lint: توسط Lovable به‌صورت خودکار پس از commit اجرا می‌شود.
- Typecheck: script مستقل وجود ندارد (همان `npm run build`).
- Tests: تست خودکار برای shell موجود نیست — پلن تست دستی بخش ۷.