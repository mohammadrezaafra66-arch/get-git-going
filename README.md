# دستیار هوشمند افراکالا

سامانه یکپارچه مدیریت محصولات، قیمت‌گذاری، خرید، فروش، فاکتور، کاربران، گزارش‌ها و دانش سازمانی شرکت افراکالا.

## وضعیت فعلی: فاز ۱ — اسکلت معماری

این نسخه شامل زیرساخت کامل پروژه است؛ منطق هر ماژول در فازهای بعدی پیاده می‌شود.

**ویژگی‌های آماده:**
- ✅ احراز هویت ایمیل/رمز با ساخت خودکار پروفایل و نقش پیش‌فرض «بیننده»
- ✅ کنترل دسترسی نقش‌محور (RBAC) با ۵ نقش: مدیر کل، مدیر بخش، فروشنده، حسابدار، بیننده
- ✅ Sidebar فارسی RTL با گروه‌بندی ماژول‌ها + Bottom Nav موبایل
- ✅ مدیریت کامل کاربران و تخصیص نقش (فقط برای admin)
- ✅ ۱۲ ماژول با route و layout آماده
- ✅ فونت Vazirmatn به‌صورت local در `public/fonts/` (بدون CDN خارجی)
- ✅ دیتابیس PostgreSQL با RLS کامل، audit log، و trigger های updated_at

## شروع اولین مدیر کل

پس از ثبت‌نام اولین کاربر، در دیتابیس Cloud یک‌بار اجرا کنید:
```sql
update user_roles set role='admin' where user_id=(select id from auth.users where email='YOUR_EMAIL');
```

## اتصال به GitHub

از پنل Lovable → **Connectors → GitHub → Connect project** ریپازیتوری بسازید.
سپس کد به‌صورت دو‌طرفه بین Lovable و GitHub همگام می‌شود.

## Self-host با Docker

ساختار کد استاندارد است: React + Vite + TypeScript + TanStack Start + PostgreSQL.
فایل‌های آماده: `Dockerfile`، `docker-compose.yml`، `.dockerignore`.

```bash
# 1) متغیرهای محیطی را در .env تنظیم کنید (VITE_SUPABASE_URL و ...)
# 2) build و اجرا
docker compose build
docker compose up -d
# اپ روی http://localhost:3000
```

برای backend کامل self-host می‌توانید [Supabase self-hosted](https://supabase.com/docs/guides/self-hosting)
را روی همان سرور بالا آورده و `VITE_SUPABASE_URL` را به آن نشانه‌گذاری کنید.
فایل‌های `supabase/migrations/` بدون تغییر روی نمونه self-hosted اجرا می‌شوند.

هیچ وابستگی حیاتی به CDN خارجی، فونت آنلاین یا API بین‌المللی وجود ندارد.

## ساختار

```
src/
  routes/         # File-based routing (TanStack)
  components/
    layout/       # AppShell، Sidebar، Header، MobileNav
    common/       # PageHeader، EmptyState
    rbac/         # RoleGuard، PermissionGate
    ui/           # shadcn
  lib/
    auth/         # AuthProvider
    rbac/         # roles، ماتریس دسترسی
    i18n/         # formatters فارسی
  integrations/supabase/  # کلاینت دیتابیس
public/fonts/vazirmatn/   # فونت‌های local
```

## ماژول‌های در دست توسعه (فاز ۲ به بعد)

محصولات، قیمت‌گذاری rule-based، خرید، فروش، فاکتور، لیست‌های قیمت، گزارش‌ها، دانش سازمانی، بازخورد، پیام‌های داخلی.
