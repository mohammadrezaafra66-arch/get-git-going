# 10 — Environment Matrix (Template)

- Purpose: قالب نقشهٔ محیط‌ها. **مقادیر** در SH-RA.2C تکمیل می‌شود؛ این فایل قالب است.
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

## ماتریس متغیرها (قالب — تکمیل در SH-RA.2C)

| Variable | L | D | S | P | حساس؟ | محل |
|---|---|---|---|---|---|---|
| `VITE_SUPABASE_URL` | ✓ | ✓ | ✓ | ✓ | خیر | client |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ✓ | ✓ | ✓ | ✓ | خیر | client |
| `VITE_SUPABASE_PROJECT_ID` | ✓ | ✓ | ✓ | ✓ | خیر | client |
| `SUPABASE_SERVICE_ROLE_KEY` | — | — | ✓ | ✓ | بله | server |
| `JWT_SECRET` | — | — | ✓ | ✓ | بله | server |
| `POSTGRES_PASSWORD` | — | ✓ | ✓ | ✓ | بله | server |
| `EXTERNAL_API_TIMEOUT_MS` | — | ✓ | ✓ | ✓ | خیر | server |
| `OCR_ENABLED` / `EXTERNAL_OCR_ENABLED` | — | ✓ | ✓ | ✓ | خیر | server |
| `EXTERNAL_AI_ENABLED` | — | ✓ | ✓ | ✓ | خیر | server |
| `SMTP_*` | — | اختیاری | ✓ | ✓ | بله | server |
| `BACKUP_*` | — | — | ✓ | ✓ | بله | server |
| `<TBD در SH-RA.2C>` |  |  |  |  |  |  |

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
