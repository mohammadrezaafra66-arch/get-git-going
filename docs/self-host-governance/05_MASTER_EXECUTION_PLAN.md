# 05 — Master Execution Plan

- Purpose: نقشهٔ اجرایی همهٔ فازها از SH-DOC.1 تا SH-RA.9 با وضعیت زنده.
- Audience: PM/Lead.
- Last updated: 2026-05-09
- Related: `03_REQUIREMENTS_REQ_SH.md`, `06_PHASE_PROTOCOL.md`

## وضعیت‌ها
⬜ todo · 🟡 in-progress · ✅ done · ❌ blocked

## جدول فازها

| Phase | عنوان | خروجی | REQها | وضعیت |
|---|---|---|---|---|
| SH-DOC.1 | بستهٔ حاکمیت (۱۱ سند) | `docs/self-host-governance/00..10` | REQ-SH-015 | 🟡 |
| SH-RA.2A | پاکسازی compose ریشه + تأیید عدم track شدن `.env` | inspect `docker-compose.yml` و `docker-compose.legacy.yml.bak` (هرکدام موجود)، تصمیم DELETE/KEEP/ARCHIVE، یک خط README | REQ-SH-001, REQ-SH-002 | ⬜ |
| SH-RA.2B | OCR feature flag (server fn فقط) | `EXPERIMENTAL_OCR_ENABLED`, `EXTERNAL_API_TIMEOUT_MS` | REQ-SH-010 | ⬜ |
| SH-RA.2B-UI | پیام UI برای OCR غیرفعال (اختیاری) | بدون تغییر منطق | REQ-SH-010 | ⬜ |
| SH-RA.2C | مستندسازی همهٔ `.env`ها در `10_ENVIRONMENT_MATRIX.md` | فقط نام متغیر، نه مقدار | REQ-SH-001 | ⬜ |
| SH-RA.3 | راهنمای smoke-test روی لپ‌تاپ | فایل جدید | — | ⬜ |
| SH-RA.4 | نهایی‌سازی compose production (pull-only) | بدون build روی VPS | REQ-SH-003 | ⬜ |
| SH-RA.5 | runbook update + rollback | به‌روزرسانی | REQ-SH-014 | ⬜ |
| SH-RA.6A | runbook backup/restore drill | مستندات drill | REQ-SH-007 | ⬜ |
| SH-RA.6B | اجرای drill (کاربر) و ثبت نتیجه | گزارش | REQ-SH-008 | ⬜ |
| SH-RA.7 | چک‌لیست آمادگی VPS | فایل | REQ-SH-013 | ⬜ |
| SH-RA.GATE | بازبینی gate خوداظهار: REQ-SH-001..015 | جدول وضعیت نهایی | همه | ⬜ |
| SH-RA.8 | برنامهٔ cutover production | runbook cutover | REQ-SH-014 | ⬜ |
| SH-RA.9 | پژوهش OCR محلی (اختیاری) | یادداشت | REQ-SH-010 | ⬜ |

## قوانین انتقال بین فازها

- بدون تأیید کاربر، فاز بعدی شروع نمی‌شود.
- هر فاز فقط فایل‌های مجاز خود را دست می‌زند.
- پایان هر فاز = Phase Completion Report طبق `06_PHASE_PROTOCOL.md`.

## یادداشت SH-RA.2A

SH-RA.2A باید **هر دو** فایل زیر را در صورت وجود inspect کند:
- `docker-compose.yml` (ریشه)
- `docker-compose.legacy.yml.bak` (ریشه)

سپس یکی از تصمیم‌ها را با دلیل ثبت کند: `DELETE_BAK` / `KEEP_BAK` / `ARCHIVE_ROOT_COMPOSE`.