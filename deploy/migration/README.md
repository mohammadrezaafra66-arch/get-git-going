# AfraKala — Migration Scripts (Phase SH.7)

این پوشه شامل **اسکریپت‌ها و مستندات** مهاجرت از Lovable / Supabase Cloud به
Supabase self-host افراکالا است.

> ⚠️ این فاز فقط **ابزارها** را آماده می‌کند. هیچ migration واقعی، dump واقعی،
> restore واقعی، یا انتقال فایل واقعی در این فاز انجام نشده است. اجرای واقعی
> فقط روی staging/production توسط مسئول فنی (devops/admin) انجام می‌شود.

## ترتیب کلی مهاجرت

1. backup کامل source (SH.8)
2. freeze writes (`scripts/freeze-writes.md`)
3. dump auth (`dump-auth.sh`)
4. export storage (`export-storage.mjs`)
5. apply project migrations روی target (`apply-project-migrations.sh`)
6. restore data + auth روی target (`restore-auth.sh` + pg_restore دستی)
7. import storage (`import-storage.mjs`)
8. verify (`verify-db-counts.sh`, `verify-storage.mjs`)
9. smoke test (`smoke-test.sh`)
10. DNS switch + monitoring + unfreeze

جزئیات قدم‌به‌قدم در `scripts/cutover-checklist.md`.

## امنیت

- `service_role` key و `DB_PASSWORD` فقط در `.env` (روی سرور) نگهداری شوند —
  هرگز در ریپو commit نشوند.
- فقط ادمین/devops مجاز به اجرای این اسکریپت‌هاست (RBAC اپ تغییر نمی‌کند).
- اجرای migration روی production فقط با تأیید مدیر فنی.
- dumpها (`dumps/`) و export storage (`storage-export/`) شامل دیتای حساس‌اند —
  مکان امن و رمزگذاری شده نگهداری شوند.

## DRY_RUN

همه اسکریپت‌ها به‌صورت پیش‌فرض با `DRY_RUN=true` کار می‌کنند:
- فقط plan را چاپ می‌کنند
- هیچ نوشتنی روی DB یا storage انجام نمی‌دهند
- secret یا password را echo نمی‌کنند

برای اجرای واقعی: `DRY_RUN=false` و در صورت لزوم `CONFIRM_PRODUCTION=true`.

## مثال‌های اجرای dry-run

```bash
cp .env.example .env   # و مقادیر را پر کنید

# 1) apply migrations (plan only)
DRY_RUN=true bash scripts/apply-project-migrations.sh

# 2) dump auth (command preview only)
DRY_RUN=true bash scripts/dump-auth.sh

# 3) restore auth (preview)
DRY_RUN=true bash scripts/restore-auth.sh ./dumps/auth-XXXX.dump

# 4) export storage
DRY_RUN=true node scripts/export-storage.mjs

# 5) import storage
DRY_RUN=true node scripts/import-storage.mjs

# 6) verify
node scripts/verify-storage.mjs
bash scripts/verify-db-counts.sh

# 7) smoke test
bash scripts/smoke-test.sh
```

## ارتباط با فازهای دیگر

- **SH.5** — Supabase self-host stack scaffold (آماده).
- **SH.6** — تنظیمات شبکه/DNS/SSL واقعی (جداگانه).
- **SH.7 (این فاز)** — migration scripts.
- **SH.8** — Backup/Restore رسمی و خودکار (هنوز ساخته نشده). اسکریپت‌های
  `dumps/` فعلی موقت‌اند و در SH.8 با backup کامل و scheduled جایگزین می‌شوند.
- **OCR** — موضوع جدا، در SH.6 بررسی می‌شود؛ این فاز OCR را تغییر نداده.

## Audit logs پس از مهاجرت

جدول `audit_logs` در `verify-db-counts.sh` بررسی می‌شود. اگر count source و
target یکسان نبود، root-cause را قبل از unfreeze پیدا کنید.

## فایل‌ها/پوشه‌هایی که نباید در ریپو commit شوند

اگر `.gitignore` قابل ویرایش نبود، **به‌صورت دستی** این موارد را به
`.gitignore` اضافه و commit کنید:

```
deploy/migration/.env
deploy/migration/dumps/
deploy/migration/storage-export/
deploy/migration/**/*.dump
deploy/migration/**/storage-manifest*.json
```

`.dockerignore` در این فاز برای مسدودکردن این مسیرها از build context اپ
به‌روزرسانی شده است.