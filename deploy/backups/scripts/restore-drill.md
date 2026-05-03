# Restore Drill — تمرین ریستور ماهانه

> Backup بدون **تست restore** بی‌ارزش است. حداقل ماهی یک‌بار drill اجرا کنید.

## هدف
- اطمینان از سالم بودن آخرین backupها
- تأیید زمان واقعی RTO/RPO
- آموزش تیم devops برای زمان حادثه واقعی

## سناریوی استاندارد ماهانه

1. **انتخاب backup** — آخرین `*.dump` و `*.tar.gz` و `*.tar.gz.age`
2. **بالا آوردن staging** — یک stack موازی Supabase self-host روی سرور/VM جدا
   (هرگز روی production)
3. **Restore database**
   ```bash
   DRY_RUN=true bash scripts/restore-postgres.sh /path/to/postgres-XXXX.dump
   DRY_RUN=false CONFIRM_RESTORE=true bash scripts/restore-postgres.sh /path/to/postgres-XXXX.dump
   ```
4. **Restore storage**
   ```bash
   DRY_RUN=false CONFIRM_RESTORE=true bash scripts/restore-storage.sh /path/to/storage-XXXX.tar.gz
   ```
5. **Decrypt env (در صورت نیاز)**
   ```bash
   age -d -i $AGE_IDENTITY_FILE /path/to/env-secrets-XXXX.tar.gz.age | tar -xzf -
   ```
6. **Smoke test** — `bash deploy/migration/scripts/smoke-test.sh`
7. **مقایسه counts** — `bash deploy/migration/scripts/verify-db-counts.sh`
8. **ثبت نتیجه drill** — تاریخ، زمان، حجم، مدت restore، خطاها

## چک‌لیست drill
- [ ] انتخاب آخرین backup
- [ ] بالا آوردن محیط staging
- [ ] restore database OK
- [ ] restore storage OK
- [ ] env decrypt OK
- [ ] smoke test PASS
- [ ] verify-db-counts PASS
- [ ] نتیجه و زمان‌ها ثبت شد
- [ ] محیط staging پاک شد

## ⚠️ هشدارها
- روی **production** هرگز restore تستی انجام نده.
- backupهای قدیمی را قبل از drill حذف نکن.
- service-role key مرحله staging را با production یکی نکن.