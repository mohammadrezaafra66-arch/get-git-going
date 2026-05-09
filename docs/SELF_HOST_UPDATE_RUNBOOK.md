# Runbook به‌روزرسانی Self-Host افراکالا

این runbook مرجع عملیاتی برای هر تغییر روی staging/production است. بدون اجرای این مراحل، deploy ممنوع.

## ۰. مفاهیم پایه
- **Code** = GitHub repo + Docker image روی GHCR + فایل‌های compose/deploy + migrationها.
- **Data** = volume های Postgres و Storage + پوشه backup + dumpها + .env واقعی + گواهی‌ها. هرگز در Git.
- **Lovable** فقط ابزار توسعه است؛ هیچ runtime dependency ندارد.

## ۱. ترتیب درست بالا آوردن stackها (استقرار اولیه)
```bash
docker network create afrakala-net || true
docker compose -f deploy/supabase/docker-compose.yml up -d
docker compose -f deploy/app/docker-compose.prod.yml up -d   # production: pull from GHCR
docker compose -f deploy/proxy/docker-compose.yml up -d
```
دلیل: Caddy/proxy باید بعد از app و supabase بالا بیاید تا upstreamها (web:3000, kong:8000) قابل دسترس باشند.

## ۲. مسیر staging قبل از production (اجباری برای تغییرات مهم)
```
Lovable → GitHub main → GitHub Actions → GHCR (image tag = sha-<commit>)
        → staging server  → smoke test → migration test (در صورت وجود)
        → production server (دستی، با backup)
```
Staging می‌تواند: VPS جدا، یا همان سرور با compose جدا و دامنه `staging.afrakala.ir`، یا سرور داخلی شرکت.

قانون: هیچ migration بدون اجرای موفق روی staging به production نمی‌رود.

## ۳. آپدیت روزمره — دو سناریو

### سناریو A — تغییر فقط app/UI، بدون migration
```bash
cd /opt/afrakala
git pull
export IMAGE_TAG=sha-<commit>           # یا latest در صورت اعتماد به main
docker compose -f deploy/app/docker-compose.prod.yml pull web
docker compose -f deploy/app/docker-compose.prod.yml up -d web
curl -fsS https://app.afrakala.ir/api/healthz
```

### سناریو B — تغییر دارای migration (مرتبه‌ی حساس)
```bash
# 1) backup قبل از هر چیز
DRY_RUN=false bash deploy/backups/scripts/backup-postgres.sh

# 2) sync کد
cd /opt/afrakala && git pull

# 3) review migrationهای جدید
ls -lt supabase/migrations | head
#   هر فایل جدید را باز کن و طبق MIGRATION_SAFETY_POLICY بررسی کن.

# 4) اجرای واقعی migration (فقط با DRY_RUN=false)
DRY_RUN=false bash deploy/migration/scripts/apply-project-migrations.sh

# 5) deploy app
export IMAGE_TAG=sha-<commit>
docker compose -f deploy/app/docker-compose.prod.yml pull web
docker compose -f deploy/app/docker-compose.prod.yml up -d web

# 6) smoke test
bash deploy/migration/scripts/smoke-test.sh
curl -fsS https://app.afrakala.ir/api/healthz
```

قانون: migration **قبل** از deploy app اجرا می‌شود، مگر اینکه migration عمداً backward-compatible و post-deploy باشد و این مورد در کامنت بالای فایل migration ذکر شده باشد.

## ۴. اجرای واقعی migration vs پیش‌نمایش
اسکریپت‌های migration به طور پیش‌فرض `DRY_RUN=true` هستند. اجرای زیر فقط preview می‌دهد:
```bash
bash deploy/migration/scripts/apply-project-migrations.sh   # فقط preview
```
اجرای واقعی فقط زمانی مجاز است که:
- `.env` درست (DB_URL/credentials) ست شده باشد،
- target database قطعاً همان موردنظر است (نه production در حال بررسی staging)،
- backup تازه گرفته شده،
- اپراتور migration را خوانده و تأیید کرده.
```bash
DRY_RUN=false bash deploy/migration/scripts/apply-project-migrations.sh
```

## ۵. Rollback

### App-only rollback (آسان و امن)
```bash
export IMAGE_TAG=sha-<previous-good-commit>
docker compose -f deploy/app/docker-compose.prod.yml pull web
docker compose -f deploy/app/docker-compose.prod.yml up -d web
curl -fsS https://app.afrakala.ir/api/healthz
```

### Migration rollback (سخت و خطرناک)
- اگر migration معکوس وجود دارد → اجرا کن.
- در غیر این صورت → restore از آخرین backup سالم:
```bash
DRY_RUN=false bash deploy/backups/scripts/restore-postgres.sh <dump-file>
bash deploy/backups/scripts/verify-restore.sh
```
قانون: هر migration حساس باید **قبل از اجرا** backup داشته باشد، وگرنه deploy ممنوع.

## ۶. CI/CD امن
- GitHub Actions فقط image می‌سازد و به GHCR push می‌کند. **هیچ‌گاه** به production database دسترسی ندارد.
- production secrets فقط روی filesystem سرور (`.env.production`).
- production deploy و migration دستی (SSH) یا با runner امن داخلی.

## ۷. SMTP / Auth
- login پایه (email + password) نباید به SMTP خارجی وابسته باشد.
- Password reset ممکن است به SMTP وابسته باشد → fallback مدیریتی: ادمین می‌تواند از Studio (داخلی) رمز کاربر را reset کند.
- اگر SMTP خارجی استفاده شود، optional و documented در `.env.production` باشد (`SMTP_ENABLED=true|false`).

## ۸. تعریف رسمی «۱۰۰٪ self-host»
سیستم core وقتی ۱۰۰٪ self-host است که در runtime نیاز به هیچ‌کدام از این موارد نداشته باشد:
- Lovable Cloud
- Supabase Cloud
- CDN خارجی (jsdelivr, unpkg, ...)
- Google Fonts یا فونت/asset از CDN خارجی
- API هوش مصنوعی / OCR خارجی به‌عنوان وابستگی حیاتی

و باید همه این‌ها روی سرور خودمان باشد:
- app runtime (Node SSR در Docker)
- Postgres روی volume خودی
- Auth (GoTrue) self-host
- Storage self-host
- PostgREST self-host
- Reverse proxy (Caddy)
- Backup/Restore self-host
- Secrets خارج از Git (فقط `.env` روی سرور)