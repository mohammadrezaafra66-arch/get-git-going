## فاز SH-RA.3 — راهنمای Smoke Test روی لپ‌تاپ

### دامنه
صرفاً مستندسازی. هیچ کد، compose، migration، secret یا اجرا تغییر نمی‌کند.

### فایل‌های مجاز برای ساخت
- `docs/self-host-governance/SH-RA.3_LAPTOP_SMOKE_TEST.md` — تنها فایل جدید این فاز.

### فایل‌های فقط‌خواندنی مرجع (بدون ویرایش)
- `docs/self-host-governance/06_PHASE_PROTOCOL.md`
- `deploy/app/README.md`
- `deploy/supabase/README.md`
- `deploy/proxy/README.md`

### ساختار سند پیشنهادی (فارسی، RTL، قابل copy-paste)

1. **مقدمه و دامنه** — هدف: اجرای کامل stack روی لپ‌تاپ توسعه‌دهنده برای smoke test؛ تأکید بر اینکه این محیط dev/staging سبک است نه production.
2. **پیش‌نیازها**
   - Docker Engine 24+ یا Docker Desktop
   - Docker Compose v2
   - Git
   - حداقل ۸ گیگ RAM آزاد، ۲۰ گیگ دیسک
   - دسترسی به اینترنت برای pull تصاویر اولیه
3. **Clone مخزن** — دستور `git clone` و `cd` به پوشه پروژه.
4. **ساخت فایل‌های env محلی** — کپی هر چهار `.env.example`:
   - `deploy/supabase/.env.example` → `deploy/supabase/.env`
   - `deploy/app/.env.production.example` → `deploy/app/.env.production` (مقادیر dummy لوکال؛ اشاره به `docs/self-host-governance/10_ENVIRONMENT_MATRIX.md`)
   - `deploy/proxy/.env.example` → `deploy/proxy/.env` و `Caddyfile.example` → `Caddyfile`
   - `deploy/backups/.env.example` → `deploy/backups/.env` (اختیاری برای smoke)
   - تأکید: مقادیر واقعی production استفاده نشود؛ فقط dummy/local؛ `chmod 600`.
5. **ساخت شبکه مشترک** — `docker network create afrakala-net`.
6. **بالا آوردن stack ‌Supabase** — `docker compose -f deploy/supabase/docker-compose.yml up -d` و انتظار healthy شدن.
7. **اجرای migration به‌صورت کنترل‌شده** — اشاره به `deploy/migration/README.md` و اینکه فقط در صورت نیاز عمدی با `DRY_RUN=false` اجرا شود؛ توضیح dry-run.
8. **بالا آوردن stack اپ (build محلی)** — `docker compose -f deploy/app/docker-compose.yml up -d --build`.
9. **بالا آوردن stack proxy** — `docker compose -f deploy/proxy/docker-compose.yml up -d` با اشاره به اینکه برای لوکال می‌توان از HTTP و دامنه `localhost` در Caddyfile استفاده کرد.
10. **چک‌لیست Smoke**
    - `curl -fsS http://localhost/api/healthz` ⇒ پاسخ `ok`
    - باز شدن صفحه `/login`
    - باز شدن صفحه `/products`
    - باز شدن صفحه `/pricing`
    - بدون خطای console در DevTools
    - بدون درخواست به CDN خارجی در tab Network (تأکید بر مقاومت اینترنت ایران)
11. **Tear-down و پاک‌سازی volume**
    - `docker compose -f deploy/proxy/docker-compose.yml down`
    - `docker compose -f deploy/app/docker-compose.yml down`
    - `docker compose -f deploy/supabase/docker-compose.yml down -v` (هشدار: `-v` همه داده لوکال را پاک می‌کند)
    - `docker network rm afrakala-net` (اختیاری)
12. **Troubleshooting**
    - تداخل پورت ۸۰/۴۴۳/۵۴۳۲ → چک با `lsof -i` و آزاد کردن یا تغییر در compose لوکال
    - خطای `network afrakala-net not found` → اجرای دستور create
    - خطای env mismatch بین stackها (مثلاً `JWT_SECRET` متفاوت بین supabase و app) → یکسان‌سازی
    - گیج شدن روی dry-run migration → توضیح که DRY_RUN پیش‌فرض true است و هیچ تغییری روی DB نمی‌دهد
    - Caddy گواهی نمی‌گیرد → برای لوکال از `http://localhost` استفاده شود نه دامنه واقعی

### بخش پایانی سند
- یادداشت: این راهنما فقط برای smoke test محلی است؛ برای production از `docs/SELF_HOST_UPDATE_RUNBOOK.md` و `docs/self-host-governance/08_OPS_RUNBOOK.md` استفاده شود.
- لینک‌های متقاطع به: `06_PHASE_PROTOCOL.md`, `09_INTERNET_RESILIENCE.md`, `10_ENVIRONMENT_MATRIX.md`.

### الزامات و ممنوعیت‌ها
- بدون اجرای هیچ دستور Docker/migration.
- بدون تغییر کد، compose، migration، secret یا env واقعی.
- بدون افزودن وابستگی.
- پایان کار با Phase Completion Report مطابق `06_PHASE_PROTOCOL.md`.
- شروع نکردن SH-RA.4.

### خروجی نهایی
یک فایل واحد `docs/self-host-governance/SH-RA.3_LAPTOP_SMOKE_TEST.md` آماده برای review.