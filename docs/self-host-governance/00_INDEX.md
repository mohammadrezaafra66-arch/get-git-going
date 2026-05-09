# 00 — INDEX | فهرست بستهٔ حاکمیت Self-Host

- Purpose: نقشهٔ کل بسته؛ ورود هر نفر جدید از این فایل.
- Audience: همه.
- Last updated: 2026-05-09
- Related: `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`

این پوشه «بستهٔ حاکمیت ۱۰۰٪ self-host» افراکالاست. شامل ۱۱ سند: این INDEX + ده سند تخصصی (01..10). قبل از هر فاز، فایل‌های مرتبط را بخوان.

## ترتیب خواندن

1. `01_PROJECT_CHARTER.md` — چرا و چه چیزی
2. `02_ARCHITECTURE_OVERVIEW.md` — معماری اجرایی + ADR
3. `03_REQUIREMENTS_REQ_SH.md` — REQ-SH-001..015 + gate
4. `04_REPO_STANDARDS.md` — استاندارد repo و secrets
5. `05_MASTER_EXECUTION_PLAN.md` — نقشهٔ فازها
6. `06_PHASE_PROTOCOL.md` — قواعد ثابت + قالب گزارش
7. `07_MIGRATION_SAFETY.md` — سیاست migration
8. `08_OPS_RUNBOOK.md` — عملیات + DR
9. `09_INTERNET_RESILIENCE.md` — اینترنت ملی/بین‌الملل
10. `10_ENVIRONMENT_MATRIX.md` — ماتریس محیط (قالب)

## قبل از پیاده‌سازی چه بخوانم

- هر تغییر زیرساخت: 02 + 04 + 07.
- هر فاز جدید: 06 + 05 + 03.
- هر integration خارجی: 09.
- هر کار روی env/secrets: 04 + 10.
- هر کار روی production: 07 + 08.

## قانون gating

- SH-RA.2A **شروع نمی‌شود** تا SH-DOC.1 توسط کاربر بازبینی و تأیید شود.
- اگر بین این اسناد و `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md` تعارض پیدا شد، فایل acceptance criteria حاکم است.

## جدول اسناد

| # | فایل | چه زمانی |
|---|---|---|
| 00 | INDEX | اولین ورود |
| 01 | PROJECT_CHARTER | شروع پروژه |
| 02 | ARCHITECTURE_OVERVIEW | قبل تغییر زیرساخت |
| 03 | REQUIREMENTS_REQ_SH | قبل هر فاز |
| 04 | REPO_STANDARDS | قبل هر commit |
| 05 | MASTER_EXECUTION_PLAN | شروع فاز |
| 06 | PHASE_PROTOCOL | شروع/پایان فاز |
| 07 | MIGRATION_SAFETY | هر migration |
| 08 | OPS_RUNBOOK | عملیات روزانه |
| 09 | INTERNET_RESILIENCE | feature خارجی |
| 10 | ENVIRONMENT_MATRIX | تنظیم env |
