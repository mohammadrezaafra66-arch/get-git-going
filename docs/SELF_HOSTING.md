# Runbook نهایی Self-Hosting افراکالا

سند فارسی، عملیاتی و مرحله‌به‌مرحله برای نصب، راه‌اندازی، مهاجرت، بکاپ، مانیتورینگ، بازیابی و disaster recovery نسخه self-host پروژه افراکالا روی سرور Linux داخل ایران.

> این سند خروجی فاز **SH.9** است و مرجع رسمی عملیات self-host محسوب می‌شود. هیچ دستور این سند نباید بدون تأیید devops/admin روی production اجرا شود.

---

## ۱) هدف سند

- ارائه یک مرجع واحد برای راه‌اندازی کامل افراکالا روی سرور اختصاصی.
- تعریف دقیق «self-host» در این پروژه و مرز سرویس‌های فعال/غیرفعال.
- مستندسازی مسیر مهاجرت از Lovable/Supabase Cloud به استک داخلی.
- تعیین سیاست backup، restore، monitoring، security و disaster recovery.
- شفاف کردن کارهای باقی‌مانده برای تحقق ۱۰۰٪ self-host (به‌ویژه OCR — فاز SH.6).

---

## ۲) تعریف self-host در افراکالا

**هشدار اساسی:** صرفاً نصب PostgreSQL کافی نیست.

اپلیکیشن افراکالا بر پایه معماری Supabase ساخته شده؛ بنابراین «self-host واقعی» یعنی اجرای استک Supabase موردنیاز پروژه روی سرور خودمان، نه فقط دیتابیس.

### سرویس‌های لازم (Required)

- PostgreSQL (با extensionهای موردنیاز Supabase)
- GoTrue (Auth)
- PostgREST (REST API)
- Storage API
- Kong (API gateway)
- Meta (`postgres-meta` — backend موردنیاز Studio)
- Studio — فقط برای ادمین، پشت basic auth + IP allowlist یا SSH tunnel
- Database RLS فعال روی همه جدول‌های دامنه
- Database functions / RPCهای پروژه

### سرویس‌های غیرفعال مگر اثبات نیاز (Disabled unless proven needed)

- Realtime
- Edge Functions
- Imgproxy
- Analytics / Logflare
- Vector
- Inbucket (mail testing)

> **اصل:** «Supabase کامل در افراکالا» یعنی Supabase کاملِ موردنیاز پروژه، نه روشن‌کردن همه سرویس‌های Supabase بدون دلیل.

---

## ۳) معماری نهایی

```text
Internet
   |
   | 80/443
   v
Caddy Proxy  (تنها سرویس public)
   |
   +--> app.afrakala.ir     --> web:3000          (TanStack Start app)
   |
   +--> api.afrakala.ir     --> kong:8000         (Supabase API gateway)
   |
   +--> studio.afrakala.ir  --> studio:3000       (basic auth + IP allowlist / SSH tunnel)

Docker networks:
  - afrakala-net        (Caddy <-> web, Caddy <-> kong)
  - supabase-internal   (kong <-> auth/rest/storage <-> postgres)
```

قواعد:

- فقط Caddy روی پورت‌های `80/443` بایند می‌شود.
- Postgres هرگز public نمی‌شود (پورت روی host bind نشود).
- Kong مستقیماً public نیست؛ فقط از پشت Caddy روی `api.afrakala.ir`.
- Studio عمومی نمی‌شود (basic auth + IP allowlist، یا فقط SSH tunnel).

---

## ۴) ساختار پوشه‌ها روی سرور

```text
/opt/afrakala/
├── deploy/
│   ├── app/           # از repo: deploy/app/
│   ├── proxy/         # از repo: deploy/proxy/
│   ├── supabase/      # از repo: deploy/supabase/
│   ├── migration/     # از repo: deploy/migration/
│   └── backups/       # از repo: deploy/backups/
├── data/
│   ├── postgres/      # volume Postgres
│   ├── storage/       # volume Storage API
│   └── caddy/         # certs و state
├── backups/           # خروجی واقعی backup (در .gitignore)
└── logs/              # لاگ‌های container و cron
```

تمام مسیرهای زیر `data/` و `backups/` و `logs/` باید **خارج از repo** باشند و هرگز commit نشوند.

---

## ۵) پیش‌نیازهای سرور Linux

- Ubuntu 22.04 LTS یا 24.04 LTS (یا Debian 12).
- حداقل ۴ هسته CPU، ۸GB RAM، ۱۰۰GB SSD برای شروع.
- کاربر غیر root با `sudo`.
- Firewall فقط پورت‌های `22, 80, 443` باز باشد (`ufw` یا `nftables`).
- SSH hardening: غیرفعال‌سازی password auth، فقط key-based.
- ساعت سیستم با `chrony` یا `systemd-timesyncd` همگام.
- locale: `fa_IR.UTF-8` و `en_US.UTF-8` فعال.

---

## ۶) نصب Docker و Docker Compose

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg lsb-release
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
```

بررسی:

```bash
docker --version
docker compose version
```

---

## ۷) آماده‌سازی GitHub و clone پروژه

```bash
sudo mkdir -p /opt/afrakala
sudo chown -R "$USER":"$USER" /opt/afrakala
cd /opt/afrakala
# <OWNER>/<REPO> را با مسیر واقعی GitHub جایگزین کن (مثلاً afrakala-org/afrakala)
git clone git@github.com:<OWNER>/<REPO>.git repo
ln -s /opt/afrakala/repo/deploy /opt/afrakala/deploy
```

به‌روزرسانی نسخه:

```bash
cd /opt/afrakala/repo
git fetch --all
git checkout <tag-or-branch>
git pull --ff-only
```

---

## ۸) `.gitignore` و secret safety

قبل از هر deploy این بررسی‌ها را انجام بده:

```bash
grep -nE "(\.env$|\.env\.production$|certs/|\.pem$|\.key$|\.crt$)" .gitignore
```

باید بلاک امنیتی self-host (افزوده در SH.4B) موجود باشد و این موارد ignore شوند:

- `deploy/app/.env*` (به‌جز `*.example`)
- `deploy/proxy/.env`، `deploy/proxy/Caddyfile`، `deploy/proxy/certs/`
- `deploy/supabase/.env`، `deploy/supabase/volumes/`
- `deploy/migration/.env`، `deploy/migration/dumps/`، `storage-export/`
- `deploy/backups/.env`، `deploy/backups/{pg,storage,env,storage-safety}/`
- `*.pem, *.key, *.crt, *.csr, *.p12, *.pfx, *.dump, *.tar, *.tar.gz, *.age`

**ممنوعیت‌های مطلق:**

- commit کردن `.env` واقعی، certificate، private key، dump، یا backup.
- prefix کردن `service role key` با `VITE_` یا قرار دادن آن در client bundle.

---

## ۹) ساخت Docker network

```bash
# فقط `afrakala-net` external است و باید دستی ساخته شود.
# `supabase-internal` خودکار توسط compose استک Supabase ساخته می‌شود (driver: bridge).
docker network create afrakala-net || true
```

`afrakala-net` در composeهای app/proxy/supabase به‌صورت `external: true` رفرنس می‌شود؛ `supabase-internal` فقط داخل استک Supabase تعریف می‌شود.

---

## ۱۰) راه‌اندازی app stack

```bash
cd /opt/afrakala/deploy/app
cp .env.production.example .env.production
# ویرایش با مقادیر واقعی
chmod 600 .env.production
docker compose up -d --build
docker compose ps
```

مرجع کامل: `deploy/app/README.md`.

> قبل از production مقادیر `.env.production` باید توسط مسئول فنی تکمیل شوند (Supabase URL داخلی، anon key، service role key فقط server-side، API timeout ≥ ۱۵ ثانیه).

---

## ۱۱) راه‌اندازی proxy stack

```bash
cd /opt/afrakala/deploy/proxy
cp Caddyfile.example Caddyfile
cp .env.example .env
chmod 600 .env Caddyfile
docker compose up -d
docker compose logs -f caddy
```

- compression در Caddy فعال باشد (`encode zstd gzip`).
- در `Caddyfile.example` این هدرها تنظیم شده‌اند: `Strict-Transport-Security` (HSTS)، `X-Content-Type-Options`، `X-Frame-Options`، `Referrer-Policy`. (CSP فعلاً تنظیم نشده — در صورت نیاز به‌صورت آگاهانه افزوده شود.)
- Studio پشت `basic_auth` + `@allowed_ips` قرار گیرد.

مرجع: `deploy/proxy/README.md`.

---

## ۱۲) راه‌اندازی Supabase stack

```bash
cd /opt/afrakala/deploy/supabase
cp .env.example .env
mkdir -p volumes/api
cp kong.yml.example volumes/api/kong.yml
chmod 600 .env
docker compose up -d
docker compose ps
```

سرویس‌های فعال: `db, auth, rest, storage, meta, kong, studio`.
سرویس‌های `realtime, functions, imgproxy, analytics, vector, inbucket` در compose comment باشند تا با تصمیم آگاهانه فعال شوند.

مرجع: `deploy/supabase/README.md`.

---

## ۱۳) تنظیم envها

قواعد ثابت:

- همه فایل‌های `.env` با `chmod 600` و owner کاربر deploy.
- هرگز `.env` در repo نباشد.
- secretها از روی password manager سازمانی کپی شوند، نه از چت.
- هر تغییر env باید در changelog عملیاتی سرور ثبت شود.

متغیرهای حیاتی:

- `POSTGRES_PASSWORD`، `JWT_SECRET`، `ANON_KEY`، `SERVICE_ROLE_KEY`
- `SITE_URL`، `API_EXTERNAL_URL`
- `SMTP_*` (در صورت نیاز به ایمیل)
- `BACKUP_ROOT`، `RETENTION_DAYS_LOCAL`، `AGE_RECIPIENT`

---

## ۱۴) DNS و SSL

- رکوردهای `A`/`AAAA` برای `app.afrakala.ir`، `api.afrakala.ir`، `studio.afrakala.ir` به IP سرور.
- TTL پایین (۳۰۰ ثانیه) قبل از cutover.
- Caddy خودش Let's Encrypt را مدیریت می‌کند؛ نیازی به دستکاری دستی certificate نیست.
- اگر Let's Encrypt در دسترس نبود، از CA داخلی/خصوصی استفاده شود و certificate در `deploy/proxy/certs/` (ignore شده) قرار گیرد.

---

## ۱۵) Smoke tests

```bash
# سلامت اپ
curl -fsS https://app.afrakala.ir/api/healthz

# سلامت API
curl -I https://api.afrakala.ir

# وضعیت containerها
cd /opt/afrakala/deploy/app && docker compose ps
cd /opt/afrakala/deploy/proxy && docker compose ps
cd /opt/afrakala/deploy/supabase && docker compose ps

# لاگ زنده
docker compose logs -f --tail=200
```

اسکریپت آماده: `deploy/migration/scripts/smoke-test.sh`.

---

## ۱۶) مسیر مهاجرت از Lovable/Supabase Cloud

ترتیب رسمی (مرجع کامل: `deploy/migration/README.md` و `cutover-checklist.md`):

1. Backup کامل از source (Cloud) — `deploy/backups/scripts/backup-all.sh` روی source یا snapshot Cloud.
2. **Freeze writes** روی source — راهنمای `deploy/migration/scripts/freeze-writes.md`.
3. Dump دیتابیس + Auth از source.
4. Apply project migrations روی target — `apply-project-migrations.sh`.
5. Restore Auth (`restore-auth.sh`) و داده‌های دامنه.
6. Export/Import Storage — `export-storage.mjs` → `import-storage.mjs`.
7. `verify-db-counts.sh` — تطبیق row count.
8. `verify-storage.mjs` — تطبیق SHA-256 manifest.
9. `smoke-test.sh` روی target.
10. **DNS cutover** به IP سرور self-host.
11. مانیتورینگ لاگ‌ها (Caddy + Kong + app) برای ۲۴ ساعت اول.
12. Unfreeze writes پس از تأیید نهایی.

> همه اسکریپت‌ها به‌صورت پیش‌فرض `DRY_RUN=true` هستند. مهاجرت واقعی فقط با `DRY_RUN=false` و تأیید کتبی devops/admin.

---

## ۱۷) سیاست Backup

مرجع کامل: `deploy/backups/README.md`.

- Postgres: روزانه `pg_dump -Fc` در `BACKUP_ROOT/pg/YYYY-MM-DD/` با `chmod 600`.
- Storage: روزانه `tar.gz` در `BACKUP_ROOT/storage/YYYY-MM-DD/`.
- Env/Secrets: هفتگی، `tar | age -r $AGE_RECIPIENT` (بدون فایل خام روی دیسک).
- Retention محلی: `RETENTION_DAYS_LOCAL` (پیشنهاد: ۱۴ روز).
- Offsite: کپی روزانه به یک سرور دوم داخل ایران (نمونه: `offsite-sync.example.sh`).
- Cron نمونه: `deploy/backups/scripts/cron.example` (هرگز بدون بازبینی نصب نشود).

> **اصل طلایی:** backup بدون restore test قابل اعتماد نیست.

---

## ۱۸) سیاست Restore

- Restore Postgres: `restore-postgres.sh` با `DRY_RUN=false` + `CONFIRM_RESTORE=true` + دو تأیید دستی (`APPLY` و `RESTORE`).
- Restore Storage: `restore-storage.sh` که قبل از overwrite یک **safety snapshot** در `storage-safety/` می‌گیرد.
- Verify: `verify-restore.sh` خوانایی dump را بدون تغییر دیتابیس بررسی می‌کند.

---

## ۱۹) Restore drill ماهانه

طبق `deploy/backups/scripts/restore-drill.md`:

- یک‌بار در ماه، آخرین backup روی محیط staging restore شود.
- نتیجه drill در operational log سرور ثبت شود.
- در صورت شکست، root cause در همان روز رسیدگی شود.

---

## ۲۰) Monitoring و logها

- لاگ‌های container با `docker compose logs` و فایل‌های `/var/log/afrakala-*.log`.
- مانیتورینگ سبک با `uptime-kuma` (self-host) برای healthcheckهای HTTP.
- متریک سیستم با `node_exporter` + `prometheus` + `grafana` (همه self-host).
- Alert بر اساس: قطعی healthcheck، استفاده دیسک > ۸۰٪، شکست backup، خطای Caddy/Kong.
- نگهداری لاگ حداقل ۳۰ روز با rotation.

---

## ۲۱) Security hardening

**ممنوع:**

- commit کردن `.env`، certificate، private key، dump، backup.
- public کردن Postgres یا Kong مستقیم.
- public کردن Studio.
- قرار دادن `service role key` در frontend یا prefix با `VITE_`.

**لازم:**

- `chmod 600` برای همه `.env`ها.
- فقط Caddy public باشد.
- firewall فقط `22/80/443`.
- SSH key-based، root login غیرفعال.
- Studio پشت SSH tunnel یا basic auth + IP allowlist.
- Backupها رمزگذاری‌شده (`age`).
- دسترسی به سرور و backupها فقط برای devops/admin.

**Manual secret scan قبل از deploy:**

```bash
grep -R "SERVICE_ROLE" dist/client deploy 2>/dev/null || true
grep -R "BEGIN PRIVATE KEY" deploy 2>/dev/null || true
grep -R "POSTGRES_PASSWORD=" deploy 2>/dev/null || true
```

خروجی این سه دستور باید خالی باشد (به‌جز فایل‌های `*.example` با placeholder).

---

## ۲۲) Incident response

برای هر incident:

1. **تشخیص**: لاگ + healthcheck + متریک.
2. **اقدام فوری**: ایزوله‌سازی سرویس مشکل‌دار، اعلام به ادمین.
3. **Mitigation**: rollback، restart، یا restore.
4. **Verify**: smoke test کامل.
5. **Postmortem**: ثبت در operational log و اصلاح Runbook در صورت نیاز.

---

## ۲۳) Disaster recovery

| سناریو | تشخیص | اقدام فوری | Rollback | Verify |
|---|---|---|---|---|
| App down | healthcheck `app.afrakala.ir` ❌ | `docker compose restart web` | `git checkout <prev-tag> && up -d --build` | smoke test |
| Supabase down | `api.afrakala.ir` ❌ | بررسی `kong, auth, rest, storage` | restart سرویس مشکل‌دار | curl به Kong |
| Postgres corrupt | لاگ db خطای fatal | stop stack، restore از آخرین dump سالم | snapshot قبلی | `verify-db-counts.sh` |
| Storage از دست رفت | فایل‌ها 404 | `restore-storage.sh` با آخرین tar.gz | safety snapshot | `verify-storage.mjs` |
| Env/Secrets leak | کشف کلید خارج | rotate همه کلیدها (DB، JWT، service role)، invalidate session | — | scan repo + لاگ Auth |
| DNS اشتباه | کاربر به سرور قدیمی می‌رود | اصلاح رکورد، کاهش TTL، انتظار propagation | بازگشت رکورد قبلی | `dig` از چند ISP ایران |
| Migration fail | exit ≠ 0 یا verify ناهمخوان | unfreeze، بازگشت DNS به source، تحلیل لاگ | restore از pre-migration backup | counts + smoke |

---

## ۲۴) Rollback plan

- Tag هر deploy موفق در git (`prod-YYYYMMDD-HHMM`).
- Backup خودکار قبل از هر migration.
- در صورت مشکل: `git checkout <prev-tag>` + `docker compose up -d --build` + در صورت نیاز restore دیتابیس.
- DNS rollback با کاهش TTL از قبل آماده باشد.

---

## ۲۵) کارهای باقی‌مانده برای ۱۰۰٪ self-host (مهم — SH.6 / OCR)

نسخه self-host عملیاتی با SH.3 تا SH.9 بالا می‌آید، **اما** اگر OCR خارجی هنوز فعال باشد، سیستم از نظر strict self-host صددرصد نیست (وابستگی به API ابری خارج از ایران).

برای تحویل نهایی ۱۰۰٪ self-host، فاز **SH.6** باید انجام شود:

- حذف OCR خارجی، یا
- اختیاری کردن OCR با `OCR_ENABLED=false` به‌عنوان پیش‌فرض، یا
- جایگزینی با راهکار داخلی: **Tesseract.js** (سبک، کلاینت)، **PaddleOCR** (سرور، فارسی)، یا میکروسرویس OCR self-host.
- Fallback به **ورود دستی** اطلاعات وقتی OCR در دسترس نیست.

در فاز SH.9 کد OCR تغییر نمی‌کند؛ این بخش صرفاً documentation است.

---

## ۲۶) Production checklist (قبل از go-live)

- [ ] `.gitignore` بلاک امنیتی self-host دارد (SH.4B).
- [ ] `.dockerignore` خروجی‌های backup/migration را ignore می‌کند.
- [ ] هیچ `.env` واقعی در repo نیست (`git ls-files | grep '\.env$'` خالی).
- [ ] Build اپ روی Docker پاس شده.
- [ ] Caddy بالا آمده، HTTPS سالم، HSTS فعال.
- [ ] Supabase stack بالا آمده، Studio public نیست.
- [ ] فقط پورت‌های `22/80/443` public هستند.
- [ ] Postgres روی host bind نشده.
- [ ] Backup `DRY_RUN` پاس شده روی staging.
- [ ] Restore drill روی staging موفق بوده.
- [ ] Migration `DRY_RUN` پاس شده.
- [ ] Smoke test کامل پاس شده.
- [ ] DNS cutover با TTL پایین از قبل برنامه‌ریزی شده.
- [ ] Monitoring و alerting فعال است.
- [ ] تصمیم OCR (SH.6) ثبت شده — فعال/غیرفعال/جایگزین.
- [ ] Operational log سرور آماده ثبت backup/restore/migration است.

---

## ۲۷) RBAC و دسترسی

- عملیات سرور (deploy، backup، restore، migration) فقط برای **devops/admin**.
- backupها شامل داده حساس مشتریان‌اند؛ دسترسی محدود و رمزگذاری اجباری.
- `service role key` فقط server-side؛ هرگز در client bundle.
- Studio فقط ادمین، با IP allowlist یا SSH tunnel.

---

## ۲۸) Audit log

- اپلیکیشن audit log داخلی خود را دارد (روی جدول‌های دامنه).
- اجرای backup/restore/migration باید در **operational log سرور** (نه در DB اپ) ثبت شود — مثلاً `/var/log/afrakala-*.log` با rotation.
- audit log اپ بعد از اجرای migrationهای پروژه روی target فعال/منتقل می‌شود.

---

## ۲۹) Performance

- سرویس‌های غیرضروری Supabase خاموش بمانند (Realtime, Analytics, Vector, Imgproxy).
- Realtime فقط در صورت نیاز قطعی فعال شود.
- Caddy compression (`zstd gzip`) فعال.
- Backup retention کنترل‌شده تا دیسک پر نشود.
- Timeout همه درخواست‌های API کلاینت ≥ ۱۵ ثانیه (سازگار با اینترنت ملی).
- Fontها، JS و assets لوکال (بدون CDN خارجی).

---

## ۳۰) مراجع داخلی

- `deploy/app/README.md`
- `deploy/proxy/README.md`
- `deploy/supabase/README.md`
- `deploy/migration/README.md` + `scripts/cutover-checklist.md` + `scripts/freeze-writes.md`
- `deploy/backups/README.md` + `scripts/restore-drill.md` + `scripts/cron.example`
- `docs/OPERATIONS_QUICK_REFERENCE.md` (دستورات سریع روزانه)

---

**پایان Runbook SH.9.** برای ۱۰۰٪ self-host واقعی، فاز SH.6 (OCR) باقی مانده است.