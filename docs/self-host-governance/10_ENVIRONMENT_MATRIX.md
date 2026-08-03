# 10 — Environment Matrix (Template)

- Purpose: نقشهٔ کامل متغیرهای محیطی برای self-host افراکالا (تکمیل‌شده در SH-RA.2C).
- Audience: DevOps.
- Last updated: 2026-05-09
- Related: `04_REPO_STANDARDS.md`, `09_INTERNET_RESILIENCE.md`

## قانون طلایی

- فقط **نام** متغیرها اینجا.
- هیچ مقدار واقعی، secret، URL یا token commit نشود.
- مقادیر فقط در `.env` سرور (chmod 600).

## محیط‌ها

| ID | محیط | هدف | DB | Storage | env | اپراتور |
|---|---|---|---|---|---|---|
| L | Lovable Preview | توسعه/preview | Lovable Cloud | Lovable | managed | dev |
| D | Local Laptop | smoke محلی | docker postgres | docker | `.env` خارج repo | dev |
| S | Staging VPS | تست قبل از prod | self-host | self-host | `.env` سرور | devops |
| P | Production VPS | prod | self-host | self-host | `.env` سرور | owner+devops |

برای هر محیط: purpose، database، storage، env file، allowed commands، forbidden commands، migration policy، backup policy، data policy، domain/URL، who can operate (در SH-RA.2C کامل می‌شود).

## ماتریس یکپارچهٔ متغیرها (SH-RA.2C)

ستون‌ها:
- **scope**: `client` (در bundle) / `server` (فقط runtime سرور).
- **required?**: در محیط Production self-host الزامی است یا اختیاری.
- **default**: مقدار پیش‌فرض در صورت تعریف نشدن.
- **stack**: کدام stack از self-host این متغیر را مصرف می‌کند (`app`, `supabase`, `proxy`, `backups`, `migration`).
- **secret?**: آیا مقدار واقعی محرمانه است (هرگز در repo / client).

قانون: هر متغیر `VITE_*` به‌طور خودکار client است و فقط برای کلیدهای anon/publishable مجاز است. هر چیز محرمانه باید بدون پیشوند `VITE_` و فقط server باشد.

### App stack (`deploy/app/.env.production.example`)

| name | scope | required? | default | stack | secret? |
|---|---|---|---|---|---|
| `VITE_SUPABASE_URL` | client | yes | — | app | no |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | client | yes | — | app | no |
| `VITE_SUPABASE_PROJECT_ID` | client | yes | — | app | no |
| `SUPABASE_URL` | server | yes | `http://kong:8000` | app | no |
| `SUPABASE_PUBLISHABLE_KEY` | server | yes | — | app | no |
| `SUPABASE_SERVICE_ROLE_KEY` | server | yes | — | app | **yes** |
| `LOVABLE_API_KEY` | server | no | — | app | **yes** |
| `OCR_ENABLED` (legacy) | server | no | `false` | app | no |
| `EXTERNAL_OCR_ENABLED` | server | no | `false` (prod) / `true` (dev) | app | no |
| `EXTERNAL_API_TIMEOUT_MS` | server | no | `15000` (floor enforced) | app | no |
| `MARKET_RATES_EXTERNAL_ENABLED` | server | no | `false` | app | no |
| `NAVASAN_ENABLED` | server | no | `false` | app | no |
| `NAVASAN_API_KEY` | server | no | — | app | **yes** |
| `NAVASAN_BASE_URL` | server | no | `https://www.navasan.tech/api` | app | no |
| `TGJU_ENABLED` | server | no | `false` | app | no |
| `TGJU_API_KEY` | server | no | — | app | **yes** |
| `TGJU_BASE_URL` | server | no | — | app | no |
| `MARKET_RATES_AUTO_INGEST_ENABLED` | server | no | `false` | app | no |
| `MARKET_RATES_CRON_SECRET` | server | no (yes if scheduler on) | — | app | **yes** |
| `MARKET_RATES_INGEST_INTERVAL_MINUTES` | server | no | `15` | app | no |
| `PRICING_WORKER_TOKEN` | server | yes (for cron worker) | — | app | **yes** |
| `MARKETING_TASKS_WORKER_TOKEN` | server | yes (for cron worker) | — | app | **yes** |
| `NODE_ENV` | server | yes | `production` | app | no |
| `HOST` | server | no | `0.0.0.0` | app | no |
| `PORT` | server | no | `3000` | app | no |

### Supabase stack (`deploy/supabase/.env.example`)

| name | scope | required? | default | stack | secret? |
|---|---|---|---|---|---|
| `POSTGRES_DB` | server | yes | `postgres` | supabase | no |
| `POSTGRES_PASSWORD` | server | yes | — | supabase | **yes** |
| `JWT_SECRET` | server | yes | — | supabase | **yes** |
| `JWT_EXPIRY` | server | no | `3600` | supabase | no |
| `ANON_KEY` | server | yes | — | supabase | no (public JWT) |
| `SERVICE_ROLE_KEY` | server | yes | — | supabase | **yes** |
| `SITE_URL` | server | yes | — | supabase | no |
| `API_EXTERNAL_URL` | server | yes | — | supabase | no |
| `ADDITIONAL_REDIRECT_URLS` | server | no | — | supabase | no |
| `DISABLE_SIGNUP` | server | no | `false` | supabase | no |
| `ENABLE_EMAIL_SIGNUP` | server | no | `true` | supabase | no |
| `ENABLE_EMAIL_AUTOCONFIRM` | server | no | `false` (الزامی برای admin approval) | supabase | no |
| `SMTP_ADMIN_EMAIL` | server | no | — | supabase | no |
| `SMTP_HOST` | server | no | — | supabase | no |
| `SMTP_PORT` | server | no | `587` | supabase | no |
| `SMTP_USER` | server | no | — | supabase | no |
| `SMTP_PASS` | server | no | — | supabase | **yes** |
| `SMTP_SENDER_NAME` | server | no | `AfraKala` | supabase | no |
| `DASHBOARD_USERNAME` | server | yes | `admin` | supabase | no |
| `DASHBOARD_PASSWORD` | server | yes | — | supabase | **yes** |

### Proxy stack (`deploy/proxy/.env.example`)

| name | scope | required? | default | stack | secret? |
|---|---|---|---|---|---|
| `APP_DOMAIN` | server | yes | — | proxy | no |
| `API_DOMAIN` | server | yes | — | proxy | no |
| `STUDIO_DOMAIN` | server | yes | — | proxy | no |
| `ADMIN_ALLOWED_IP` | server | no | — | proxy | no |
| `STUDIO_BASIC_AUTH_USER` | server | yes | — | proxy | no |
| `STUDIO_BASIC_AUTH_HASH` | server | yes | — | proxy | **yes** |

### Backups stack (`deploy/backups/.env.example`)

| name | scope | required? | default | stack | secret? |
|---|---|---|---|---|---|
| `BACKUP_ROOT` | server | yes | `/opt/afrakala/backups` | backups | no |
| `RETENTION_DAYS_LOCAL` | server | no | `14` | backups | no |
| `RETENTION_DAYS_OFFSITE` | server | no | `30` | backups | no |
| `SUPABASE_COMPOSE_FILE` | server | yes | — | backups | no |
| `SUPABASE_PROJECT_NAME` | server | yes | — | backups | no |
| `POSTGRES_CONTAINER_NAME` | server | yes | `db` | backups | no |
| `POSTGRES_DB` | server | yes | `postgres` | backups | no |
| `POSTGRES_USER` | server | yes | `postgres` | backups | no |
| `POSTGRES_PASSWORD` | server | yes | — | backups | **yes** |
| `SUPABASE_STORAGE_VOLUME_PATH` | server | yes | — | backups | no |
| `ENV_FILES_TO_BACKUP` | server | yes | — | backups | no |
| `AGE_RECIPIENT` | server | yes | — | backups | no |
| `AGE_IDENTITY_FILE` | server | yes | — | backups | **yes** |
| `OFFSITE_ENABLED` | server | no | `false` | backups | no |
| `OFFSITE_REMOTE_NAME` | server | no | — | backups | no |
| `OFFSITE_REMOTE_PATH` | server | no | — | backups | no |
| `DRY_RUN` | server | no | `true` | backups | no |
| `CONFIRM_RESTORE` | server | no | `false` | backups | no |

### Migration stack (`deploy/migration/.env.example`)

| name | scope | required? | default | stack | secret? |
|---|---|---|---|---|---|
| `SOURCE_SUPABASE_URL` | server | yes | — | migration | no |
| `SOURCE_SERVICE_ROLE_KEY` | server | yes | — | migration | **yes** |
| `SOURCE_DB_HOST` | server | yes | — | migration | no |
| `SOURCE_DB_PORT` | server | no | `5432` | migration | no |
| `SOURCE_DB_NAME` | server | no | `postgres` | migration | no |
| `SOURCE_DB_USER` | server | no | `postgres` | migration | no |
| `SOURCE_DB_PASSWORD` | server | yes | — | migration | **yes** |
| `TARGET_SUPABASE_URL` | server | yes | — | migration | no |
| `TARGET_SERVICE_ROLE_KEY` | server | yes | — | migration | **yes** |
| `TARGET_DB_HOST` | server | yes | `localhost` | migration | no |
| `TARGET_DB_PORT` | server | no | `5432` | migration | no |
| `TARGET_DB_NAME` | server | no | `postgres` | migration | no |
| `TARGET_DB_USER` | server | no | `postgres` | migration | no |
| `TARGET_DB_PASSWORD` | server | yes | — | migration | **yes** |
| `STORAGE_BUCKET_PAYMENT_RECEIPTS` | server | yes | `payment-receipt-documents` | migration | no |
| `STORAGE_EXPORT_DIR` | server | no | `./storage-export` | migration | no |
| `DRY_RUN` | server | no | `true` | migration | no |
| `CONFIRM_PRODUCTION` | server | no | `false` | migration | no |

### Feature flags (Internet Resilience خلاصه)

| flag | default (prod) | اثر در صورت `false` |
|---|---|---|
| `EXTERNAL_OCR_ENABLED` | `false` | OCR خارجی غیرفعال؛ ورود دستی receipt الزامی. |
| `OCR_ENABLED` (legacy) | `false` | معادل قدیمی، fallback. |
| `MARKET_RATES_EXTERNAL_ENABLED` | `false` | فقط ثبت دستی نرخ ارز. |
| `NAVASAN_ENABLED` | `false` | عدم تماس با Navasan. |
| `TGJU_ENABLED` | `false` | عدم تماس با TGJU. |
| `ENABLE_EMAIL_AUTOCONFIRM` | `false` | signup منتظر تایید ادمین می‌ماند (الزام پروژه). |

### Server-only — هرگز VITE_

`SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `POSTGRES_PASSWORD`, `SMTP_PASS`, `DASHBOARD_PASSWORD`, `LOVABLE_API_KEY`, `NAVASAN_API_KEY`, `TGJU_API_KEY`, `STUDIO_BASIC_AUTH_HASH`, `*_SERVICE_ROLE_KEY`, `*_DB_PASSWORD`, `AGE_IDENTITY_FILE`.

## الزامات لپ‌تاپ

Docker Desktop یا Docker Engine، Compose v2، Git، Node 20، Bun. حداقل: 4 vCPU، 8GB RAM، 100GB SSD. در صورت نیاز mapping محلی hosts.

## رده‌بندی VPS

- **A) Staging/min:** 4 vCPU، 8GB RAM، 100GB SSD.
- **B) Small production:** 8 vCPU، 16GB RAM، 200GB NVMe، disk/offsite برای backup.
- **C) Safer production:** 8–12 vCPU، 32GB RAM، 300–500GB NVMe، storage جدا برای backup.

## Server baseline

Ubuntu 22.04 LTS، Docker Engine، Compose v2، UFW، fail2ban، unattended-upgrades، SSH hardening، فقط پورت‌های public 22/80/443، monitoring با uptime-kuma.

## قانون staging

production هرگز اولین محیطی نیست که تغییر را می‌بیند.
مسیر: Lovable → GitHub → GHCR → staging → smoke test → production.

## ممنوعیت‌ها

- prefix `VITE_` فقط برای anon/publishable.
- هیچ مقدار واقعی اینجا commit نشود.
- در SH-RA.2C تمام `*.env*` (به‌جز `.env.example`) اسکن شود تا چیزی track نشده باشد.
