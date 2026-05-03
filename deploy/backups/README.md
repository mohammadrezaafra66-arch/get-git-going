# AfraKala — Backup / Restore / Verify (Phase SH.8)

این پوشه شامل **اسکریپت‌ها و مستندات** backup، restore و verify برای استقرار
self-host افراکالا روی Linux است.

> ⚠️ این فاز فقط **ابزارها** را آماده می‌کند. هیچ backup واقعی، restore واقعی یا
> cron واقعی در این فاز اجرا نشده است. اجرای واقعی باید توسط devops/admin روی
> سرور با مقادیر واقعی `.env` انجام شود.

## انواع backup

| نوع | اسکریپت | فرمت | مسیر |
|-----|---------|------|------|
| Postgres | `backup-postgres.sh` | `pg_dump -Fc` | `${BACKUP_ROOT}/pg/YYYY-MM-DD/` |
| Storage | `backup-storage.sh` | `tar.gz` | `${BACKUP_ROOT}/storage/YYYY-MM-DD/` |
| Env / secrets | `backup-env-secrets.sh` | `tar.gz.age` (رمزشده) | `${BACKUP_ROOT}/env/YYYY-MM-DD/` |
| Offsite sync | `offsite-sync.example.sh` | rclone/rsync (نمونه) | remote |

## DRY_RUN

همه اسکریپت‌ها با `DRY_RUN=true` پیش‌فرض شروع می‌کنند:
- فقط plan را چاپ می‌کنند
- هیچ فایلی نمی‌نویسند، حذف نمی‌کنند، restore نمی‌کنند
- secret/password را echo نمی‌کنند

برای اجرای واقعی: `DRY_RUN=false`.
برای restore واقعی: علاوه بر آن `CONFIRM_RESTORE=true` و دو تایید دستی
(`APPLY` و `RESTORE`) لازم است.

## شروع

```bash
cp .env.example .env       # و مقادیر واقعی را پر کنید
chmod 600 .env             # فقط root بخواند

# تست بدون نوشتن
DRY_RUN=true bash scripts/backup-all.sh

# اجرای واقعی
DRY_RUN=false bash scripts/backup-all.sh

# verify
DRY_RUN=false bash scripts/verify-restore.sh
```

## Restore test

```bash
DRY_RUN=true bash scripts/restore-postgres.sh /path/to/postgres-XXXX.dump
DRY_RUN=false CONFIRM_RESTORE=true bash scripts/restore-postgres.sh /path/to/postgres-XXXX.dump
```

جزئیات و چک‌لیست در `scripts/restore-drill.md`.

## Retention

- محلی: `RETENTION_DAYS_LOCAL` (پیش‌فرض ۱۴ روز)
- offsite: `RETENTION_DAYS_OFFSITE` (پیش‌فرض ۳۰ روز)
- پاکسازی فقط داخل `BACKUP_ROOT/{pg,storage,env,storage-safety}` انجام می‌شود؛
  هرگز روی `/` یا مسیر خالی اجرا نمی‌شود.

## Offsite داخل ایران

- `offsite-sync.example.sh` فقط نمونه است.
- پیشنهاد: یک سرور دوم در DC داخلی با rsync/SSH، یا S3 سازگار داخلی با rclone.
- هیچ وابستگی به سرویس ابری خارج از کشور اضافه نشده است.
- offsite اختیاری است (`OFFSITE_ENABLED=true` تا فعال شود).

## Cron

`scripts/cron.example` فقط **نمونه** است. نصب واقعی با `crontab -e` توسط
ادمین انجام می‌شود.

## امنیت

- `service_role`، `POSTGRES_PASSWORD` و `AGE_IDENTITY_FILE` فقط روی سرور؛
  هرگز در ریپو commit نشوند.
- backupها شامل دیتای حساس و اطلاعات مشتریان است — دسترسی فقط برای
  devops/admin، سطح فایل `chmod 600`.
- env backup همیشه با `age` رمز می‌شود؛ فایل خام روی دیسک باقی نمی‌ماند
  (مستقیم از `tar` به `age` pipe می‌شود).
- restore scripts نیاز به دو تایید دستی + `CONFIRM_RESTORE=true` دارند.

## RBAC و audit

- اجرای backup/restore فقط توسط ادمین/devops. RBAC اپلیکیشن تغییر نمی‌کند.
- audit log اپلیکیشن تغییر نمی‌کند؛ اجرای backup/restore در
  `/var/log/afrakala-backup.log` و syslog سرور ثبت می‌شود (operational log).

## ارتباط با فازهای دیگر

- **SH.5** — Supabase self-host stack (آماده).
- **SH.7** — Migration scripts (mahar داده). این فاز برای اپراسیون پایدار
  پس از مهاجرت ساخته شده است.
- **SH.9** — Runbook نهایی (فاز بعد) به این اسکریپت‌ها ارجاع می‌دهد.

## Ignore — مهم

`.gitignore` و `.dockerignore` در این فاز برای بلاک‌کردن خروجی‌های backup
به‌روزرسانی شده‌اند. اگر `.gitignore` در محیط شما read-only بود، این بلاک را
دستی اضافه و commit کنید:

```
deploy/backups/.env
deploy/backups/pg/
deploy/backups/storage/
deploy/backups/storage-safety/
deploy/backups/env/
deploy/backups/**/*.dump
deploy/backups/**/*.tar
deploy/backups/**/*.tar.gz
deploy/backups/**/*.age
```