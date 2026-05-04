# ادغام مدیریت کاربران در یک صفحه + بَج realtime

## وضعیت فعلی (یافته‌های بررسی)

- صفحهٔ `/users` فقط لیست read-only است (نام، تلفن، نقش، وضعیت).
- صفحهٔ `/users/pending` نسخهٔ کامل با تأیید/تأیید سریع/رد/غیرفعال‌سازی/فعال‌سازی + فیلتر وضعیت + جستجو + جزئیات + RPCهای امن سمت سرور (`approve_pending_user`, `quick_approve_user`, `reject_pending_user`, `deactivate_user`, `reactivate_user`).
- در منوی ادمین هر دو آیتم جداگانه وجود دارد و کاربر را گیج می‌کند.
- تأیید کاربر تازه ثبت‌نام‌شده فقط از `/users/pending` ممکن است و نیازی به دیتابیس یا جای دیگر نیست.

## تغییرات

### ۱) ادغام دو صفحه در `/users`
- محتوای کامل `_app.users.pending.tsx` (همراه با همهٔ دیالوگ‌ها، RPCها، فیلتر وضعیت، تأیید سریع، تأیید با نقش، رد، غیرفعال/فعال‌سازی، جزئیات با فیلدهای پویا) به `_app.users.tsx` منتقل می‌شود.
- عنوان صفحه: «مدیریت کاربران» با توضیح: «تأیید ثبت‌نام‌ها، تخصیص نقش، فعال/غیرفعال‌سازی و مشاهدهٔ همهٔ کاربران».
- فیلتر وضعیت پیش‌فرض روی **«همه»** (نه pending) تا هم نقش لیست کلی و هم نقش صف تأیید را داشته باشد.
- مسیر `/users/pending` به‌صورت redirect به `/users?status=pending` تبدیل می‌شود تا لینک‌های قدیمی نشکنند.
- `status` به search-param اضافه می‌شود تا بَج منو بتواند مستقیماً به فیلتر pending لینک کند.

### ۲) به‌روزرسانی منو
- آیتم `/users/pending` از `nav-items.ts` حذف می‌شود.
- یک آیتم تنها باقی می‌ماند: **«کاربران»** → `/users`.

### ۳) بَج realtime تعداد کاربران در انتظار
- یک کامپوننت کوچک `PendingUsersBadge` ساخته می‌شود که کنار آیتم منوی «کاربران» در سایدبار و در bottom-nav موبایل (در صورت وجود) عدد را نشان می‌دهد.
- منبع داده:
  - بار اول: `select count from profiles where status='pending'` (با React Query، فقط برای ادمین).
  - به‌روزرسانی: subscribe به کانال Supabase realtime روی جدول `profiles` با فیلتر `status=eq.pending` برای رویدادهای INSERT/UPDATE/DELETE → `invalidateQueries(['pending-users-count'])`.
- بَج فقط برای کاربران دارای نقش admin رندر می‌شود (`useAuth().roles.includes('admin')`).
- اگر عدد صفر باشد بَج نمایش داده نمی‌شود.

### ۴) فعال‌سازی realtime روی جدول profiles
- migration کوچک: `ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;` (idempotent با چک `pg_publication_tables`).
- چون RLS روی profiles فعال است و فقط ادمین می‌تواند ردیف‌ها را ببیند، payload realtime هم برای غیرادمین خالی می‌ماند → امن.

## فایل‌های تأثیرپذیر

| فایل | تغییر |
|---|---|
| `src/routes/_app.users.tsx` | بازنویسی کامل با محتوای صفحهٔ pending + پیش‌فرض «همه» + search-param `status` |
| `src/routes/_app.users.pending.tsx` | تبدیل به redirect ساده به `/users?status=pending` |
| `src/components/layout/nav-items.ts` | حذف آیتم `/users/pending` |
| `src/components/layout/PendingUsersBadge.tsx` | جدید — بَج realtime |
| `src/components/layout/AppSidebar.tsx` (و در صورت نیاز `MobileBottomNav.tsx`) | رندر بَج کنار آیتم «کاربران» |
| `supabase/migrations/<timestamp>_realtime_profiles.sql` | افزودن profiles به publication realtime |

## معیارهای پذیرش (طبق AFRAKALA_ACCEPTANCE_CRITERIA)

- بدون وابستگی خارجی جدید، بدون secret در frontend.
- RLS موجود روی `profiles` و `user_roles` دست نمی‌خورد؛ فقط publication realtime اضافه می‌شود.
- migration idempotent و reversible.
- query‌ها همان pagination/limit موجود را دارند.
- UI همچنان RTL، فارسی و mobile-first.
- realtime در صورت قطعی به‌صورت graceful degrade می‌شود (داده اولیه از REST می‌آید).

## بعد از تأیید این پلن

پاسخ کوتاه به سؤال شما: **«کاربر تازه ثبت‌نام‌شده را از منوی «کاربران» (بعد از ادغام) و با دکمهٔ «تأیید» یا «تأیید سریع» در ردیف همان کاربر فعال می‌کنید — هیچ ورود به دیتابیس یا جای دیگری لازم نیست.»** بعد از این تغییر، بَج قرمز کنار «کاربران» در سایدبار به شما می‌گوید چند نفر منتظرند.
