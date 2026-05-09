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

ساختار کد استاندارد: React + Vite + TypeScript + TanStack Start + Supabase self-host.

> ⚠️ **مهم:** برای deploy از پوشهٔ `deploy/` استفاده کنید، **نه** فایل `docker-compose.yml` ریشه (که از فاز SH-RA.2A به‌نام `docker-compose.legacy.yml.bak` آرشیو شده است).

استک‌های رسمی self-host:

| استک | فایل | کاربرد |
|---|---|---|
| Supabase | `deploy/supabase/docker-compose.yml` | db + auth + rest + storage + kong + meta + studio |
| App (dev/staging) | `deploy/app/docker-compose.yml` | build محلی image |
| App (production) | `deploy/app/docker-compose.prod.yml` | pull از GHCR |
| Proxy | `deploy/proxy/docker-compose.yml` | Caddy + TLS |

ترتیب راه‌اندازی، آپدیت و rollback در `docs/SELF_HOST_UPDATE_RUNBOOK.md` و نقشه راه کامل در `docs/SELF_HOST_ROADMAP_FA.md` است.
فایل‌های `supabase/migrations/` بدون تغییر روی نمونه self-hosted اجرا می‌شوند (سیاست امنیتی: `docs/MIGRATION_SAFETY_POLICY.md`).

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
