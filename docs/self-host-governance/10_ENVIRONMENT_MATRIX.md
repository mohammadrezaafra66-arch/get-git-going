# 10 — Environment Matrix (Template)

- Purpose: نقشهٔ متغیرهای محیطی برای هر محیط. **مقادیر** در فاز SH-RA.2C پر می‌شود؛ این فایل فعلاً قالب خالی است.
- Audience: DevOps.
- Last updated: 2026-05-09
- Related: `04_REPO_STANDARDS.md`, `09_INTERNET_RESILIENCE.md`

## قانون طلایی

- فقط **نام** متغیرها در این فایل ثبت می‌شود.
- **هیچ مقدار واقعی، secret، URL، یا token** اینجا commit نمی‌شود.
- مقادیر فقط در `.env` سرور (chmod 600) زندگی می‌کنند.

## محیط‌ها

| ID | محیط | محل اجرا | منبع secrets |
|---|---|---|---|
| L | Lovable Preview | Lovable runtime | Lovable Cloud (managed) |
| D | Local Laptop (smoke) | docker desktop / linux dev | `.env` محلی، خارج از repo |
| S | Staging VPS | Linux + Docker | `.env` سرور |
| P | Production VPS | Linux + Docker | `.env` سرور |

## ماتریس متغیرها (به‌صورت قالب — در SH-RA.2C کامل می‌شود)

| Variable | L | D | S | P | حساس؟ | محل تعریف |
|---|---|---|---|---|---|---|
| `VITE_SUPABASE_URL` | ✓ | ✓ | ✓ | ✓ | خیر | client |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ✓ | ✓ | ✓ | ✓ | خیر | client |
| `VITE_SUPABASE_PROJECT_ID` | ✓ | ✓ | ✓ | ✓ | خیر | client |
| `SUPABASE_SERVICE_ROLE_KEY` | — | — | ✓ | ✓ | بله | server only |
| `EXTERNAL_API_TIMEOUT_MS` | — | ✓ | ✓ | ✓ | خیر | server |
| `EXPERIMENTAL_OCR_ENABLED` | — | ✓ | ✓ | ✓ | خیر | server |
| `OCR_ENABLED` | — | ✓ | ✓ | ✓ | خیر | server |
| `EXTERNAL_OCR_ENABLED` | — | ✓ | ✓ | ✓ | خیر | server |
| `EXTERNAL_AI_ENABLED` | — | ✓ | ✓ | ✓ | خیر | server |
| `SMTP_*` | — | اختیاری | ✓ | ✓ | بله | server |
| `BACKUP_*` | — | — | ✓ | ✓ | بله | server |
| `<TBD در SH-RA.2C>` |  |  |  |  |  |  |

## ممنوعیت‌ها

- prefix `VITE_` فقط برای anon/publishable. هیچ secret سرور نباید VITE_ بگیرد.
- هیچ مقدار اینجا commit نشود.
- در SH-RA.2C از scan کردن همهٔ `*.env*` در repo (به‌جز `.env.example`) استفاده شود.