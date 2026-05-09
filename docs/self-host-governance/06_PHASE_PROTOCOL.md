# 06 — Phase Protocol

- Purpose: قواعد ثابت همهٔ فازها + قالب پرامپت + قالب گزارش پایان فاز.
- Audience: همه.
- Last updated: 2026-05-09
- Related: `04_REPO_STANDARDS.md`, `05_MASTER_EXECUTION_PLAN.md`

## قواعد ثابت برای همهٔ فازها

- Lovable فقط ابزار توسعه است، نه وابستگی runtime.
- production نباید به Lovable Cloud وابسته باشد.
- Code و Data جدا هستند.
  - Code = GitHub repo + Docker image + scripts + docs + migrations.
  - Data = volume Postgres + volume Storage + backups + `.env` واقعی + گواهی‌ها.
- هیچ secret واقعی commit نشود.
- service role key هرگز در client bundle نباشد.
- GitHub Actions فقط image می‌سازد و به production DB دسترسی ندارد.
- production migration فقط دستی، با backup تازه، توسط اپراتور انسانی.
- هر integration خارجی → optional + feature flag + graceful failure.
- هر فاز کوچک، تک‌هدف، قابل بازبینی، handoff-ready، low-risk.
- پایان هر فاز = Phase Completion Report.

## قالب پرامپت شروع فاز

```
Phase <ID> — <Title>
Owner: <name>

Goal:
<یک هدف>

Read ONLY:
- docs/AFRAKALA_ACCEPTANCE_CRITERIA.md
- docs/self-host-governance/06_PHASE_PROTOCOL.md
- <فایل‌های مجاز این فاز>

Allowed files (write):
- <لیست دقیق>

Forbidden:
- تغییر کد اپ خارج از مسیرهای مجاز
- تغییر OCR (مگر فاز OCR)
- تغییر Dockerfile / compose (مگر فاز مربوطه)
- اجرای migration
- ساخت secret یا .env واقعی
- deploy واقعی
- اجرای typecheck/build/tests

Allowed commands: <لیست>
Forbidden commands: <لیست>

Inputs: <فایل‌ها/مقادیر ورودی>
Expected output: <خروجی قابل بازبینی>
Validation checklist: <چک‌ها>
Rollback note: <چگونه برگردانیم>

End with:
- Phase Completion Report (قالب پایین)
- جملهٔ پایانی استاندارد فاز
```

## قالب رسمی Phase Completion Report

```
Phase: <ID> — <Title>
Status: success / blocked / failed

Files created:
- <path>
Files edited:
- <path>
Files deleted:
- <path>

OCR changed? yes/no
Auth changed? yes/no
Storage changed? yes/no
Migration changed/executed? yes/no
Secret/env/certificate created? yes/no
Deploy/build/test executed? yes/no
Docker/Compose changed? yes/no
Database/Data changed? yes/no

Verification commands run:
- <cmd>
Verification results:
- <result>

Known issues:
- <...>

Manual actions required:
- <...>

Next recommended phase: <ID>
Ready for handoff: yes/no
```

## شرایط توقف اجباری (Stop conditions)

- یافت شدن secret در repo
- ساخت ناخواستهٔ `.env` واقعی
- اجرای ناخواستهٔ migration
- دسترسی به دادهٔ production
- تغییر Auth/Storage خارج از scope
- افزودن وابستگی خارجی بدون flag
- مبهم شدن مسیر root compose یا env
- دست زدن به فایل‌های forbidden

## قواعد پرامپت Lovable

- پرامپت کوچک، یک هدف.
- Allowed/Forbidden دقیق.
- گزارش پایانی الزامی.
- بدون تغییر چند featureای در یک پرامپت.
