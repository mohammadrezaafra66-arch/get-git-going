# 08 — Ops Runbook

- Purpose: عملیات روزانه + update/rollback procedures + backup/restore + DR.
- Audience: DevOps/Operator.
- Last updated: 2026-05-09 (SH-RA.5)
- Related: `docs/OPERATIONS_QUICK_REFERENCE.md`, `docs/SELF_HOST_UPDATE_RUNBOOK.md`, `docs/SELF_HOSTING.md`, `07_MIGRATION_SAFETY.md`

## 1. ترتیب راه‌اندازی stackها

1. Supabase (`deploy/supabase`)
2. App (`deploy/app/docker-compose.prod.yml` — pull-only، بدون build محلی)
3. Proxy (`deploy/proxy`)

## 2. عملیات روزانه

```bash
docker compose ps
docker compose logs --tail=200 web
df -h && free -m && uptime
curl -fsS https://app.afrakala.ir/api/healthz
```

ری‌استارت‌ها: `docker compose restart web | caddy | <supabase-service>`.

---

## 3. Update — Scenario A: app-only, no migration

فقط image جدید pull و up می‌شود. هیچ تغییر schema یا data انجام نمی‌شود.

```bash
cd /opt/afrakala

# 3.1 verify current IMAGE_TAG (دو منبع، هر دو باید سازگار باشند)
grep -E '^IMAGE_TAG=' deploy/app/.env.production
docker inspect afrakala-web --format '{{.Config.Image}}'

# 3.2 set new IMAGE_TAG (sha-<commit> ترجیح داده می‌شود؛ latest فقط در صورت اعتماد به main)
#     مقدار را در deploy/app/.env.production ویرایش کنید (نه فقط export موقت).
vi deploy/app/.env.production            # IMAGE_TAG=sha-<new-commit>

# 3.3 docker login ghcr.io   (در صورت expire شدن PAT یا اولین deploy)
echo "$GHCR_PAT" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin

# 3.4 pull image جدید
docker compose -f deploy/app/docker-compose.prod.yml pull web

# 3.5 up -d بدون downtime
docker compose -f deploy/app/docker-compose.prod.yml up -d web

# 3.6 healthcheck
curl -fsS https://app.afrakala.ir/api/healthz

# 3.7 logs (حداقل ۵ دقیقه پایش کنید)
docker compose -f deploy/app/docker-compose.prod.yml logs --tail=200 -f web

# 3.8 record deployed IMAGE_TAG (برای rollback آینده ضروری است)
date -u +"%Y-%m-%dT%H:%M:%SZ" >> deploy/app/.deploy-log
echo "deployed: $(grep -E '^IMAGE_TAG=' deploy/app/.env.production)" >> deploy/app/.deploy-log
```

---

## 4. Update — Scenario B: with migration

ترتیب اجباری: backup → review → confirm → migration → app deploy → smoke. هرگز migration بعد از deploy app اجرا نکنید مگر اینکه migration به‌صراحت backward-compatible/post-deploy باشد و در سرفصل فایل ذکر شده باشد.

```bash
cd /opt/afrakala

# 4.1 fresh backup قبل از هر چیز
DRY_RUN=false bash deploy/backups/scripts/backup-postgres.sh
ls -lt deploy/backups/data/postgres | head -3

# 4.2 sync کد و review migrationهای جدید
git fetch --all && git pull
ls -lt supabase/migrations | head
#   هر فایل migration جدید را باز کنید و طبق 07_MIGRATION_SAFETY.md بررسی کنید:
#     - reversible؟
#     - idempotent؟
#     - بدون DROP TABLE / DROP COLUMN / TRUNCATE / DELETE بدون WHERE؟
#     - search_path روی توابع SECURITY DEFINER ست شده؟

# 4.3 confirm: اگر هر SQL مخرب وجود دارد، بدون تأیید کتبی owner/devops متوقف شوید.

# 4.4 dry-run preview سپس apply واقعی
DRY_RUN=true  bash deploy/migration/scripts/apply-project-migrations.sh
DRY_RUN=false bash deploy/migration/scripts/apply-project-migrations.sh

# 4.5 deploy app (مطابق Scenario A، گام‌های 3.2 تا 3.5)
vi deploy/app/.env.production            # IMAGE_TAG=sha-<new-commit>
docker compose -f deploy/app/docker-compose.prod.yml pull web
docker compose -f deploy/app/docker-compose.prod.yml up -d web

# 4.6 smoke test + healthcheck
bash deploy/migration/scripts/smoke-test.sh
curl -fsS https://app.afrakala.ir/api/healthz

# 4.7 monitor logs حداقل ۱۵ دقیقه
docker compose -f deploy/app/docker-compose.prod.yml logs --tail=200 -f web
```

---

## 5. App rollback (by previous IMAGE_TAG)

rollback اپ ساده و امن است؛ هیچ تغییر داده‌ای ندارد.

```bash
cd /opt/afrakala

# 5.1 IMAGE_TAG قبلی سالم را از .deploy-log یا git log پیدا کنید
tail -20 deploy/app/.deploy-log

# 5.2 ست کردن IMAGE_TAG به نسخه سالم قبلی
vi deploy/app/.env.production            # IMAGE_TAG=sha-<previous-good>

# 5.3 pull + up -d
docker compose -f deploy/app/docker-compose.prod.yml pull web
docker compose -f deploy/app/docker-compose.prod.yml up -d web

# 5.4 healthcheck
curl -fsS https://app.afrakala.ir/api/healthz

# 5.5 logs
docker compose -f deploy/app/docker-compose.prod.yml logs --tail=200 web

# 5.6 record rollback (incident log)
echo "$(date -u +%FT%TZ) ROLLBACK to $(grep ^IMAGE_TAG deploy/app/.env.production)" \
  >> deploy/app/.deploy-log
```

---

## 6. DB rollback — DANGER

> ⚠️ DB rollback **با** app rollback یکی نیست. App rollback بی‌خطر است؛ DB rollback ریسک از دست رفتن داده دارد.

قواعد سختگیرانه:

- DB rollback فقط با یکی از این دو روش مجاز است:
  1. **restore از backup تأییدشده** (verified با `verify-restore.sh`).
  2. **اجرای reverse migration تأییدشده** که توسط نویسنده migration نوشته و توسط owner/devops review شده.
- **هرگز** DB rollback روی production بدون تأیید کتبی admin/devops اجرا نکنید.
- restore روی production نیازمند **incident note تازه** (تاریخ، اپراتور، دلیل، backup file، تأییدکننده) است.
- اگر backup قابل اعتماد ندارید، توقف کنید و escalate کنید — هرگز سعی نکنید migration را به‌صورت دستی reverse مهندسی کنید.

مرجع اسکریپت‌ها (فقط برای آگاهی، نه اجرای خودکار):

```bash
# توقف app قبل از restore (تا writeهای جدید روی DB نیمه‌restore نشود)
docker compose -f deploy/app/docker-compose.prod.yml stop web

DRY_RUN=false bash deploy/backups/scripts/restore-postgres.sh <verified-dump-file>
bash deploy/backups/scripts/verify-restore.sh

# بازگرداندن app روی IMAGE_TAG سازگار با schema بازگشتی
vi deploy/app/.env.production
docker compose -f deploy/app/docker-compose.prod.yml up -d web
```

---

## 7. GHCR image consistency note

image production **باید دقیقاً** الگوی زیر را رعایت کند — همان الگو که در `.github/workflows/build-image.yml` (push) و `deploy/app/docker-compose.prod.yml` (pull) استفاده می‌شود:

```
ghcr.io/${GHCR_OWNER}/${GHCR_REPO}-web:${IMAGE_TAG:-latest}
```

قواعد:

- `GHCR_OWNER` و `GHCR_REPO` باید در `deploy/app/.env.production` ست شده باشند (مثال در `.env.production.example`). مقدار واقعی فقط روی سرور قرار می‌گیرد و **هرگز** در Git commit نمی‌شود.
- اگر یکی از این دو خالی یا اشتباه باشد، `docker compose pull web` با خطای `manifest unknown` یا `denied` شکست می‌خورد.
- `IMAGE_TAG=latest` فقط در صورتی مجاز است که policy تیم انتشار از main را تأیید کرده باشد. برای rollback و audit دقیق، `sha-<commit>` ترجیح داده می‌شود.
- اگر tag مشخصی روی GHCR وجود ندارد، توقف کنید — احتمالاً GitHub Actions موفق نبوده. به workflow run بروید و قبل از تلاش مجدد علت را بررسی کنید.

---

## 8. Stop conditions (اپراتور باید فوراً متوقف شود)

اگر **هرکدام** از موارد زیر رخ داد، deploy/rollback را قطع کنید و escalate کنید (owner/devops):

- backup تازه گرفته نشده یا قدیمی‌تر از ۲۴ ساعت است.
- smoke test fail می‌شود.
- محتوای migration ناشناخته یا فاقد review است.
- migration حاوی SQL مخرب (`DROP`, `TRUNCATE`, `DELETE` بدون `WHERE`, `ALTER ... DROP COLUMN`) بدون تأیید کتبی است.
- `IMAGE_TAG` ناشناخته یا غیرقابل تطبیق با کامیت GitHub است.
- `docker compose pull` از GHCR شکست می‌خورد (auth یا manifest).
- `curl /api/healthz` پس از deploy `200 OK` برنمی‌گرداند.
- لاگ‌های startup خطاهای جدی (uncaught exception, DB connection refused, missing env) نشان می‌دهند.
- در `git status` یا `git diff` هر secret/env واقعی/certificate دیده می‌شود.
- `GHCR_OWNER` یا `GHCR_REPO` در env ست نیست.

---

## 9. Post-update report (template)

پس از هر deploy/rollback روی production، این بلوک را پر کنید و در incident/deploy log نگه دارید:

```text
--- Afrakala Self-Host Deploy Report ---
Date/Time (UTC):     YYYY-MM-DDTHH:MM:SSZ
Operator:            <name>
Scenario:            A (app-only) | B (with migration) | rollback
Previous IMAGE_TAG:  sha-<...>
New IMAGE_TAG:       sha-<...>
Migration applied:   yes / no
Migration files:     <list filenames or n/a>
Backup file:         deploy/backups/data/postgres/<file>.sql.gz
Backup verified:     yes / no
Healthcheck (/api/healthz):  pass / fail
Smoke test result:           pass / fail / n/a
Logs reviewed (min 15m):     yes / no
Rollback needed:             yes / no
Notes / anomalies:
  -
----------------------------------------
```

---

## 10. Backup policy

- روزانه: Postgres، Storage، secrets رمز‌شده (age/sops).
- نگه‌داری محلی: ۱۴ روز. offsite: ۳۰ روز.
- ماهانه: drill restore طبق روال رسمی در
  `deploy/backups/scripts/restore-drill.md` (بخش "SH-RA.6A — Formal
  Monthly Drill Procedure"). drill روی container/volume یک‌بارمصرف اجرا
  می‌شود و **هرگز** production را لمس نمی‌کند.

## 11. Restore policy

- Backup بدون restore-test معتبر نیست.
- restore فقط روی staging؛ روی production فقط در emergency با تأیید owner/devops + incident note.

## 12. Disaster Recovery (سناریوها)

- خرابی DB → restore آخرین snapshot سالم (طبق بخش ۶).
- از دست رفتن Storage → restore از backup فایل.
- از دست رفتن سرور → provision جدید + restore + DNS.
- خرابی گواهی → renew دستی Caddy یا fallback manual cert.
- در دسترس نبودن GHCR → استفاده از image cache محلی روی VPS (آخرین tag سالم pull‌شده).
- در دسترس نبودن GitHub → ادامه با snapshot محلی repo.
- قطع اینترنت بین‌الملل → core طبق `09_INTERNET_RESILIENCE.md` کار کند.

## 13. Monitoring

uptime-kuma (healthz)، docker stats، آلارم disk/RAM، آلارم backup job، آلارم expiry گواهی Caddy.

## 14. Reference

برای جزئیات بیشتر و کانتکست staging→production و CI/CD، به runbook کامل مراجعه کنید:

- `docs/SELF_HOST_UPDATE_RUNBOOK.md`
- `docs/self-host-governance/07_MIGRATION_SAFETY.md`
- `docs/self-host-governance/09_INTERNET_RESILIENCE.md`
- `deploy/backups/scripts/restore-drill.md` (روال drill ماهانه backup/restore)

---

## 9. Pricing recompute worker scheduler (PRICE-RT.5)

worker قیمت‌گذاری به‌صورت خودکار صف `pricing_recompute_queue` را خالی می‌کند تا
تغییر نرخ ارز / قیمت خرید بدون مداخلهٔ اپراتور به قیمت فروش propagate شود.
دکمهٔ UI فقط emergency است؛ حالت عادی کار = scheduler روی host.

- مرجع کامل: `docs/PRICING_RECOMPUTE_WORKER.md`
- اسکریپت آماده: `deploy/app/scripts/pricing-worker-cron.example.sh`
- نصب گام‌به‌گام: `deploy/app/scripts/install-pricing-worker-cron.example.sh`
- متغیر محیطی الزامی: `PRICING_WORKER_TOKEN` (server-only، فقط در
  `/etc/afrakala/app.env` با chmod 600؛ هرگز در Git یا VITE_)

### راه‌اندازی اولیه (یک‌بار)

```bash
sudo install -d -m 0750 /etc/afrakala
sudo install -d -m 0755 /var/log/afrakala
sudo chmod 600 /etc/afrakala/app.env       # PRICING_WORKER_TOKEN=<long-random>
sudo install -m 0755 /opt/afrakala/deploy/app/scripts/pricing-worker-cron.example.sh \
     /usr/local/bin/afrakala-pricing-worker.sh
sudo /usr/local/bin/afrakala-pricing-worker.sh   # smoke test
sudo tail -n 5 /var/log/afrakala/pricing-worker.log
```

سپس systemd timer (پیشنهاد) یا crontab سیستم را طبق
`install-pricing-worker-cron.example.sh` فعال کنید.

### پایش روزانه

```bash
systemctl list-timers | grep afrakala-pricing-worker
sudo journalctl -u afrakala-pricing-worker.service -n 50 --no-pager
sudo tail -n 50 /var/log/afrakala/pricing-worker.log
```

از داشبورد `/pricing/recompute-prices` یا view زیر برای سلامت صف:

```sql
select pending_count, processing_count, failed_count, oldest_pending_at, latest_error
from public.v_pricing_recompute_queue_summary;
```

شرط هشدار: `failed_count > 0` یا `pending_count > 100` یا
`oldest_pending_at` قدیمی‌تر از ۱۰ دقیقه.

### غیرفعال‌سازی موقت (هنگام migration)

```bash
sudo systemctl stop afrakala-pricing-worker.timer
# پس از پایان migration:
sudo systemctl start afrakala-pricing-worker.timer
```
