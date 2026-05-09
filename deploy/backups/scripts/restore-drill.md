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

---

## SH-RA.6A — Formal Monthly Drill Procedure

بخش بالا چک‌لیست سبک است؛ این بخش روال رسمی ماهانه‌ی **isolated drill**
بدون استفاده از stack staging کامل را مستند می‌کند. هیچ تماسی با production
ندارد و قابل اجرا روی همان سرور با container/volume یک‌بارمصرف است.

> این فایل فقط مستندسازی است. هیچ دستوری در فاز SH-RA.6A اجرا نشده.

### 1. Monthly Postgres restore drill (disposable container)

هدف: اطمینان از این‌که آخرین `*.dump` قابل restore است، **بدون** لمس کردن
`postgres` تولید.

```bash
# 1.1 آخرین Postgres backup را انتخاب کن
LATEST_PG=$(ls -1t "${BACKUP_ROOT}/pg"/**/*.dump 2>/dev/null | head -n1)
echo "drill candidate: ${LATEST_PG}"

# 1.2 یک Postgres یک‌بارمصرف با همان major version بالا بیار
#     (نام و port متفاوت تا با production تداخل نکند)
docker run -d --rm \
  --name afrakala-pg-drill \
  -e POSTGRES_PASSWORD=drill_only \
  -e POSTGRES_DB=drill \
  -p 55432:5432 \
  -v afrakala-pg-drill-data:/var/lib/postgresql/data \
  postgres:15

# 1.3 صبر برای ready شدن
until docker exec afrakala-pg-drill pg_isready -U postgres >/dev/null 2>&1; do
  sleep 1
done

# 1.4 restore داخل container یک‌بارمصرف (نه روی production!)
docker cp "${LATEST_PG}" afrakala-pg-drill:/tmp/drill.dump
docker exec afrakala-pg-drill pg_restore \
  -U postgres -d drill --no-owner --clean --if-exists /tmp/drill.dump

# 1.5 بخش "Verification" را اجرا کن (بخش 3 پایین)

# 1.6 tear down کامل (هم container هم volume)
docker stop afrakala-pg-drill
docker volume rm afrakala-pg-drill-data
```

قواعد سختگیرانه:

- نام container و volume باید پسوند `-drill` داشته باشد و **هرگز** با
  `afrakala-supabase-db` یا volumeهای production یکی نباشد.
- port متفاوت (مثلاً `55432`) برای اطمینان از عدم تداخل.
- قبل از tear down، خروجی verification را در drill log ذخیره کن.

### 2. Storage restore drill (disposable directory)

```bash
LATEST_ST=$(ls -1t "${BACKUP_ROOT}/storage"/**/*.tar.gz 2>/dev/null | head -n1)
echo "drill candidate: ${LATEST_ST}"

# 2.1 مسیر یک‌بارمصرف
DRILL_DIR=$(mktemp -d /tmp/afrakala-storage-drill.XXXX)

# 2.2 extract در مسیر یک‌بارمصرف (نه روی volume واقعی Storage)
tar -xzf "${LATEST_ST}" -C "${DRILL_DIR}"

# 2.3 شمارش فایل و اندازه
EXPECTED=$(zcat "${LATEST_ST}" | tar -t 2>/dev/null | grep -v '/$' | wc -l)
ACTUAL=$(find "${DRILL_DIR}" -type f | wc -l)
echo "files in archive: ${EXPECTED}"
echo "files extracted : ${ACTUAL}"

# 2.4 (اختیاری) checksum manifest در صورت وجود
if [[ -f "${DRILL_DIR}/MANIFEST.sha256" ]]; then
  ( cd "${DRILL_DIR}" && sha256sum -c MANIFEST.sha256 )
fi

# 2.5 tear down
rm -rf "${DRILL_DIR}"
```

قواعد سختگیرانه:

- مسیر extract حتماً زیر `/tmp` (یا یک volume موقت) — **هرگز** زیر مسیر
  واقعی Storage تولید (`/var/lib/.../storage`).
- بعد از drill، با `rm -rf` پاک‌سازی شود تا دیسک پر نشود.
- اگر backup شامل دیتای حساس مشتری است، dial کاربری که drill را اجرا می‌کند
  باید سطح دسترسی devops/admin داشته باشد و دستگاه drill نیز encrypted باشد.

### 3. Verification

اجرای اجباری (پس از restore، قبل از tear down):

```bash
# 3.1 خوانایی فایل‌های backup (non-destructive)
DRY_RUN=false bash deploy/backups/scripts/verify-restore.sh

# 3.2 queryable بودن DB یک‌بارمصرف
docker exec afrakala-pg-drill psql -U postgres -d drill -c "SELECT 1;"

# 3.3 وجود جدول‌های مهم
docker exec afrakala-pg-drill psql -U postgres -d drill -c "
  SELECT table_schema, table_name
  FROM information_schema.tables
  WHERE table_schema='public'
    AND table_name IN ('products','sale_lists','sale_list_items',
                        'product_sale_price_history','user_roles')
  ORDER BY table_name;"

# 3.4 شمارش رکورد جدول‌های حیاتی (اگر اسکریپت موجود است)
if [[ -x deploy/migration/scripts/verify-db-counts.sh ]]; then
  PGHOST=127.0.0.1 PGPORT=55432 PGUSER=postgres PGPASSWORD=drill_only PGDATABASE=drill \
    bash deploy/migration/scripts/verify-db-counts.sh
fi

# 3.5 storage: شمارش فایل و checksum (همان گام 2.3 و 2.4)
```

تمام خروجی‌ها در drill log کپی شوند.

### 4. Acceptance criteria

drill **فقط** زمانی pass محسوب می‌شود که **همه** موارد زیر برقرار باشند:

- [ ] `pg_restore` بدون error تمام شود (exit code = 0).
- [ ] `verify-restore.sh` exit code = 0 برگرداند.
- [ ] `SELECT 1;` روی DB یک‌بارمصرف pass شود.
- [ ] جدول‌های حیاتی (`products`, `sale_lists`, `sale_list_items`,
      `product_sale_price_history`, `user_roles`) وجود داشته باشند.
- [ ] استخراج storage بدون error انجام شود.
- [ ] تعداد فایل extract شده با تعداد فایل داخل archive یکی باشد.
- [ ] در صورت وجود `MANIFEST.sha256`، تمام checksumها OK باشند.
- [ ] drill log با تمام فیلدهای بخش ۶ تکمیل و ذخیره شده باشد.

اگر **حتی یکی** از این موارد fail شد، آن backup `invalid` علامت‌گذاری می‌شود
و طبق بخش ۵ پاسخ داده می‌شود.

### 5. Failure handling

اگر drill fail شد:

1. backup مربوطه را در drill log به عنوان `invalid` علامت بزن (فیلد decision).
2. backup قبلی شناخته‌شده‌ی سالم را **حذف نکن** — این تنها fallback‌ات است.
3. owner/devops را بلافاصله مطلع کن (در incident log).
4. علت ریشه‌ای را بررسی کن:
   - cron backup ناقص اجرا شده؟
   - دیسک پر شده؟ (`df -h ${BACKUP_ROOT}`)
   - permission/ownership فایل‌ها درست است؟
   - نسخه `pg_dump` سرور با نسخه Postgres سازگار است؟
5. پس از رفع علت، یک backup جدید بگیر:
   ```bash
   DRY_RUN=false bash deploy/backups/scripts/backup-all.sh
   ```
6. drill را روی backup جدید **تکرار کن** تا pass شود.
7. تا زمانی که drill pass نشده، production را در حالت "no destructive
   migration" نگه دار (Stop conditions در `08_OPS_RUNBOOK.md` بخش ۸).

### 6. Drill log template

این template را برای هر drill ماهانه پر کن و در مسیر امن (مثلاً
`/var/log/afrakala/drill-YYYY-MM.txt` یا incident system) ذخیره کن.

```text
--- AfraKala Restore Drill Log ---
Date/Time (UTC):       YYYY-MM-DDTHH:MM:SSZ
Operator:              <name>
Environment:           drill (disposable)   # هرگز "production"
Postgres backup file:  ${BACKUP_ROOT}/pg/YYYY-MM-DD/postgres-XXXX.dump
Storage backup file:   ${BACKUP_ROOT}/storage/YYYY-MM-DD/storage-XXXX.tar.gz
Env backup file:       ${BACKUP_ROOT}/env/YYYY-MM-DD/env-XXXX.tar.gz.age   (در صورت drill)
Restore target (DB):   docker container "afrakala-pg-drill" port 55432
Restore target (ST):   /tmp/afrakala-storage-drill.XXXX

Verification commands run:
  - verify-restore.sh
  - SELECT 1; in drill DB
  - critical tables exist check
  - verify-db-counts.sh (if available)
  - file-count compare (storage)
  - sha256sum -c MANIFEST.sha256 (if present)

Result:
  pg_restore:           pass / fail
  verify-restore.sh:    pass / fail
  DB queryable:         pass / fail
  critical tables:      pass / fail
  storage extract:      pass / fail
  file count match:     pass / fail (expected=<n>, actual=<n>)
  checksum verify:      pass / fail / n/a

Issues / anomalies:
  -

Decision:              valid / invalid
Next action:           none / new backup + repeat drill / escalate
Tear-down completed:   yes (container removed, volume removed, /tmp dir removed)
----------------------------------
```

### Reference

- روال update/rollback و stop conditions: `docs/self-host-governance/08_OPS_RUNBOOK.md`
- خط‌مشی migration ایمن: `docs/self-host-governance/07_MIGRATION_SAFETY.md`
- اسکریپت‌های backup/restore/verify: `deploy/backups/scripts/`