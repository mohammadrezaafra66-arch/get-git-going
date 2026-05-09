# 05 — Master Execution Plan

- Purpose: نقشهٔ اجرایی همهٔ فازها از SH-DOC.1 تا SH-RA.9.
- Audience: PM/Lead.
- Last updated: 2026-05-09
- Related: `03_REQUIREMENTS_REQ_SH.md`, `06_PHASE_PROTOCOL.md`

## وضعیت‌ها
⬜ todo · 🟡 in-progress · ✅ done · ❌ blocked

## جدول خلاصه

| Phase | عنوان | REQs | وضعیت |
|---|---|---|---|
| SH-DOC.1 | بستهٔ حاکمیت (۱۱ سند) | 015 | 🟡 |
| SH-RA.2A | ایمنی legacy compose + env | 002, 003, 013 | ⬜ |
| SH-RA.2B | OCR feature flag (server) | 008 | ⬜ |
| SH-RA.2B-UI | پیام UI برای OCR غیرفعال (اختیاری) | 008 | ⬜ |
| SH-RA.2C | مستندسازی ENV + flagهای self-host | 003, 004, 008 | ⬜ |
| SH-RA.3 | smoke test روی لپ‌تاپ | 005, 006 | ⬜ |
| SH-RA.4 | نهایی‌سازی compose production (pull-only) | 014 | ⬜ |
| SH-RA.5 | runbook update + rollback | 010 | ⬜ |
| SH-RA.6A | runbook backup/restore drill | 009 | ⬜ |
| SH-RA.6B | اجرای drill روی staging | 009 | ⬜ |
| SH-RA.7 | چک‌لیست آمادگی VPS | 011, 012 | ⬜ |
| SH-RA.GATE | بازبینی REQ-SH-001..015 | همه | ⬜ |
| SH-RA.8 | برنامهٔ cutover production | 010 | ⬜ |
| SH-RA.9 | پژوهش OCR محلی (اختیاری) | 007, 008 | ⬜ |

## مدل Interleaving

1. ساخت اسناد حاکمیت (SH-DOC.1)
2. بازبینی و تأیید کاربر
3. شروع SH-RA.2A
4. بازبینی اسناد بعد از اولین فاز واقعی (در صورت نیاز)
5. ادامه با 2B/2C
6. اجرای smoke test روی لپ‌تاپ
7. حرکت به سمت staging
8. عبور از GATE قبل از cutover

## جزئیات فازها (قالب ثابت)

> برای هر فاز: Goal · Scope · Allowed files · Forbidden · Expected output · Risk · Acceptance · Handoff.

### SH-DOC.1 — Self-host governance pack
- Goal: ساخت ۱۱ سند حاکمیت.
- Scope: فقط `docs/self-host-governance/`.
- Allowed: ۱۱ فایل لیست‌شده در `00_INDEX.md`.
- Forbidden: کد، compose، migration، secret.
- Output: ۱۱ سند آماده بازبینی.
- Risk: low.
- Acceptance: همهٔ ۱۱ فایل وجود داشته باشند و reportهای فاز کامل باشد.
- Handoff: تأیید کاربر → SH-RA.2A.

### SH-RA.2A — Legacy compose + env safety
- Goal: تصمیم‌گیری دربارهٔ `docker-compose.yml` (ریشه) و `docker-compose.legacy.yml.bak`.
- Scope: فقط بازرسی + یک خط README، بدون تغییر `deploy/*`.
- Allowed: حذف/آرشیو/نگه‌داشتن یکی از دو فایل ریشه + یادداشت.
- Forbidden: تغییر کد اپ، Supabase، migration.
- Output: تصمیم `DELETE_BAK` / `KEEP_BAK` / `ARCHIVE_ROOT_COMPOSE` با دلیل.
- Risk: low-medium.
- Acceptance: مسیر production فقط از `deploy/app/docker-compose.prod.yml` می‌گذرد.
- Handoff: گزارش فاز.

### SH-RA.2B — OCR feature flag (server only)
- Goal: افزودن `EXPERIMENTAL_OCR_ENABLED` و `EXTERNAL_API_TIMEOUT_MS` در server fn OCR.
- Scope: فقط server fnها؛ بدون تغییر UI.
- Allowed: فایل server fn OCR.
- Forbidden: UI، migration، Docker.
- Acceptance: OCR وقتی flag=false غیرفعال و core سالم.

### SH-RA.2B-UI (اختیاری)
- Goal: پیام UI «OCR غیرفعال است» وقتی flag=false.
- Scope: فقط presentation.

### SH-RA.2C — ENV docs
- Goal: تکمیل `10_ENVIRONMENT_MATRIX.md` با تمام نام متغیرها (نه مقدار).
- Acceptance: لیست کامل، بدون secret.

### SH-RA.3 — Laptop smoke-test guide
- Goal: راهنمای اجرای کامل stack روی لپ‌تاپ.

### SH-RA.4 — Production compose finalize
- Goal: `deploy/app/docker-compose.prod.yml` فقط `image:` از GHCR، image name از `.github/workflows/build-image.yml` خوانده شود.

### SH-RA.5 — Update + rollback runbook
- Goal: به‌روزرسانی `SELF_HOST_UPDATE_RUNBOOK.md` با rollback دقیق.

### SH-RA.6A — Backup/Restore drill runbook
### SH-RA.6B — اجرای drill روی staging (توسط کاربر)
### SH-RA.7 — VPS readiness checklist
### SH-RA.GATE — بازبینی REQ-SH-001..015
### SH-RA.8 — Production cutover plan
### SH-RA.9 — Optional local OCR research

## یادداشت SH-RA.2A

SH-RA.2A باید **هر دو** فایل زیر را در صورت وجود inspect کند:
- `docker-compose.yml` (ریشه)
- `docker-compose.legacy.yml.bak` (ریشه)

سپس تصمیم با دلیل ثبت شود: `DELETE_BAK` / `KEEP_BAK` / `ARCHIVE_ROOT_COMPOSE`.
