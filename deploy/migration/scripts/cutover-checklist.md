# Cutover Checklist — مهاجرت از Lovable Cloud به Self-Host

این چک‌لیست را به‌ترتیب و دستی اجرا کنید. هر مرحله را تیک بزنید.

## ۰. آمادگی
- [ ] تأیید backup کامل source (در SH.8 ساخته می‌شود)
- [ ] تأیید سلامت stack self-host (`docker compose ps`)
- [ ] تأیید Caddy و دامنه‌ها (app/api/studio)
- [ ] `.env` migration کامل و امن است (روی سرور، نه در ریپو)

## ۱. Freeze
- [ ] طبق `freeze-writes.md` نوشتن متوقف شد
- [ ] زمان freeze ثبت شد

## ۲. Dump از source
- [ ] `DRY_RUN=true bash dump-auth.sh` — pre-flight
- [ ] `DRY_RUN=false bash dump-auth.sh` — dump واقعی
- [ ] `pg_dump` کامل دیتای public (در SH.8 خودکار می‌شود)

## ۳. Storage export
- [ ] `DRY_RUN=true node export-storage.mjs`
- [ ] `DRY_RUN=false node export-storage.mjs`
- [ ] `storage-manifest.json` ساخته شد

## ۴. Apply migrations روی target
- [ ] `DRY_RUN=true bash apply-project-migrations.sh`
- [ ] `DRY_RUN=false bash apply-project-migrations.sh`

## ۵. Restore data
- [ ] restore دیتای public روی target (با pg_restore)
- [ ] `CONFIRM_PRODUCTION=true bash restore-auth.sh <dump>`

## ۶. Storage import
- [ ] `DRY_RUN=false node import-storage.mjs`
- [ ] `node verify-storage.mjs` → بدون mismatch/missing

## ۷. Verify
- [ ] `bash verify-db-counts.sh` → تمام جدول‌ها OK
- [ ] `bash smoke-test.sh` → app/auth/rest/storage پاس

## ۸. DNS Switch
- [ ] DNS رکورد `app.afrakala.ir` و `api.afrakala.ir` به سرور self-host
- [ ] انتظار TTL، تأیید propagation
- [ ] Studio همچنان فقط با IP allowlist + basic auth

## ۹. Post-cutover
- [ ] مانیتور لاگ Caddy، Postgres، GoTrue (۳۰ دقیقه)
- [ ] مانیتور خطاهای اپ
- [ ] رفع freeze (بازگرداندن GRANTها و حذف banner)

## ۱۰. Rollback (در صورت خرابی)
- [ ] DNS را به source برگردانید
- [ ] freeze را بردارید روی source
- [ ] log incident را ثبت کنید و قبل از تلاش بعدی root-cause را برطرف کنید