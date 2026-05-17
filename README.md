# دستیار هوشمند افراکالا

سامانه یکپارچه مدیریت محصولات، قیمت‌گذاری، خرید، فروش، فاکتور، کاربران، گزارش‌ها و دانش سازمانی شرکت افراکالا.

## وضعیت فعلی پروژه

> برچسب قبلی «فاز ۱ — اسکلت معماری» در نسخه‌های اولیه‌ی README درج شده بود و اکنون **قدیمی** است.
>
> وضعیت واقعی **ترکیبی** است: برخی ماژول‌ها کامل‌اند (مثل products، pricing، self-host)، بسیاری «نیمه‌کامل» (مثل persons/customers، sales، accounting)، و چند مورد نیاز به inventory متمرکز دارند.
>
> پیش از هر prompt توسعه‌ای (افزودن ماژول، تغییر schema، migration، ادغام identity)، این دو سند را بخوانید تا کار موازی/تکراری ایجاد نشود:
>
> - `docs/REPO_STATE_INVENTORY.md` — نقشه‌ی فعلی ماژول‌ها، مسیرهای write مستقیم، چک‌لیست persons/customers، گام‌های امن پیشنهادی و شرایط توقف.
> - `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md` — معیارهای پذیرش پروژه (self-host، امنیت، RLS/RBAC، audit، عملکرد، UI فارسی RTL).

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

> ⚠️ **مهم:** Production و self-host افراکالا از پوشهٔ `deploy/` (شامل `deploy/app`, `deploy/supabase`, `deploy/proxy`, `deploy/backups`) اجرا می‌شود. هیچ فایل `docker-compose.yml` در ریشهٔ ریپو وجود ندارد و نباید برای production استفاده شود (فاز SH-RA.2A: legacy compose حذف شد).

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
