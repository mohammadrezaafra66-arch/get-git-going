# AfraKala — Local Self-Host (لپ‌تاپ)

این stack فقط برای **اجرای محلی روی لپ‌تاپ توسعه‌دهنده** است: یک ماه تست و دیباگ
قبل از انتقال به سرور production. این فاز Caddy/SSL/DNS/cutover ندارد و هیچ
migration یا داده‌ای را از Lovable Cloud به production منتقل نمی‌کند.

> ⚠️ این setup **production نیست**. پورت‌ها فقط روی `127.0.0.1` publish می‌شوند،
> هیچ TLS وجود ندارد، و مقادیر env ضعیف برای راحتی dev مجاز است. هرگز این stack
> را روی سرور با IP عمومی بالا نیاورید.

## سرویس‌های فعال

- `web` — اپ TanStack Start SSR (همان Dockerfile production، context = repo root)
- `db` — `supabase/postgres:15.6.1.139` با همان init scripts فاز SH
- `auth` — GoTrue
- `rest` — PostgREST
- `storage` — Supabase Storage API (file backend, volume محلی)
- `meta` — postgres-meta (backend Studio)
- `kong` — API gateway
- `studio` — UI ادمین Supabase

سرویس‌های عمداً غیرفعال در این فاز: realtime, edge-functions, imgproxy,
analytics, vector, logflare, inbucket. اگر در آینده لازم شد، در همین compose
اضافه شوند.

## پورت‌ها (همگی فقط 127.0.0.1)

| سرویس | URL |
|---|---|
| Web (اپ) | http://localhost:3000 |
| Kong / Supabase API | http://localhost:8000 |
| Studio | http://localhost:3001 |
| Postgres (psql/dev) | `postgresql://postgres@127.0.0.1:54322/postgres` |

## پیش‌نیاز

- Docker Engine + Docker Compose v2
- `psql` (فقط برای اجرای migration؛ `apt install postgresql-client`)
- `openssl` (برای ساخت secret)

## راه‌اندازی اولیه

```bash
cp deploy/local/.env.local.example deploy/local/.env.local
# مقادیر زیر را با ابزارهای واقعی پر کنید (داخل repo commit نشود):
#   POSTGRES_PASSWORD : openssl rand -base64 32
#   JWT_SECRET        : openssl rand -base64 64
#   ANON_KEY / SERVICE_ROLE_KEY : ابزار رسمی Supabase JWT generator
#   VITE_SUPABASE_PUBLISHABLE_KEY = همان ANON_KEY
#   SUPABASE_PUBLISHABLE_KEY      = همان ANON_KEY
#   SUPABASE_SERVICE_ROLE_KEY     = همان SERVICE_ROLE_KEY
#   DASHBOARD_PASSWORD : یک رمز قوی برای basic auth Studio

bash deploy/local/scripts/local-up.sh
```

اولین اجرا چند دقیقه طول می‌کشد (build image و pull image‌های Supabase).

## اجرای migrationهای پروژه روی DB local

```bash
# فقط لیست بدون اجرا:
DRY_RUN=true bash deploy/local/scripts/local-apply-migrations.sh

# اجرای واقعی (روی DB local، نه Cloud):
bash deploy/local/scripts/local-apply-migrations.sh
```

اسکریپت همهٔ `*.sql` داخل `supabase/migrations/` را به ترتیب filename روی
`postgres@127.0.0.1:54322/postgres` اجرا می‌کند، روی هر خطا متوقف می‌شود و
secret را echo نمی‌کند.

## healthcheck

```bash
bash deploy/local/scripts/local-healthcheck.sh
```

بررسی می‌کند: `web /api/healthz`، صفحهٔ اصلی، Kong، `auth/v1/health`,
`rest/v1/`, Studio. اگر `auth/v1/health` در نسخهٔ GoTrue شما در مسیر دیگری بود،
این URL را در اسکریپت اصلاح کنید — مسیر استاندارد همین است.

## دیدن لاگ‌ها

```bash
docker compose -f deploy/local/docker-compose.yml logs -f
# یا فقط یک سرویس:
docker compose -f deploy/local/docker-compose.yml logs -f web
docker compose -f deploy/local/docker-compose.yml logs -f db
```

## خاموش‌کردن

```bash
# توقف بدون پاک‌کردن داده‌ها:
bash deploy/local/scripts/local-down.sh

# پاک‌کردن کامل DB و Storage محلی (DESTRUCTIVE — فقط local):
bash deploy/local/scripts/local-reset-db.sh
```

## آپدیت بعد از تغییر در Lovable / GitHub

جریان روزمرهٔ تست در این فاز:

```bash
git pull
docker compose --env-file deploy/local/.env.local \
  -f deploy/local/docker-compose.yml up -d --build web

# اگر migration جدید اضافه شده:
bash deploy/local/scripts/local-apply-migrations.sh

bash deploy/local/scripts/local-healthcheck.sh
```

معمولاً فقط سرویس `web` نیاز به re-build دارد؛ سرویس‌های Supabase دست‌نخورده
بالا می‌مانند و داده‌ها در volumeها حفظ می‌شوند.

## دستورهای کوتاه (مرجع سریع)

```bash
docker compose -f deploy/local/docker-compose.yml up -d --build
docker compose -f deploy/local/docker-compose.yml logs -f
docker compose -f deploy/local/docker-compose.yml down
bash deploy/local/scripts/local-apply-migrations.sh
bash deploy/local/scripts/local-healthcheck.sh
```

## هشدارهای امنیتی

- این stack TLS ندارد و **برای دسترسی از اینترنت طراحی نشده**.
- مقادیر `.env.local` هرگز commit نشوند (در `.gitignore`).
- `service_role` فقط در محیط سرور (داخل docker network) استفاده می‌شود؛
  در client bundle نباید برود.
- migrationهای این فاز فقط روی DB **local** اجرا می‌شوند. هیچ اتصالی به
  Lovable Cloud یا production انجام نمی‌شود.