# Operations Quick Reference — افراکالا Self-Host

مرجع کوتاه دستورات روزانه. مرجع کامل: `docs/SELF_HOSTING.md`.

> همه دستورات از `/opt/afrakala/deploy/<stack>` اجرا می‌شوند.

---

## App stack

```bash
cd /opt/afrakala/deploy/app
docker compose up -d --build      # start / rebuild
docker compose stop               # stop
docker compose restart web        # restart اپ
docker compose logs -f --tail=200 # logs
docker compose ps                 # status
```

## Proxy (Caddy)

```bash
cd /opt/afrakala/deploy/proxy
docker compose up -d
docker compose stop
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile  # reload بدون downtime
docker compose logs -f caddy
```

## Supabase stack

```bash
cd /opt/afrakala/deploy/supabase
docker compose up -d
docker compose stop
docker compose ps
docker compose logs -f kong auth rest storage
```

---

## Healthchecks

```bash
curl -fsS https://app.afrakala.ir/api/healthz
curl -I    https://api.afrakala.ir
bash /opt/afrakala/deploy/migration/scripts/smoke-test.sh
```

---

## Backup

```bash
cd /opt/afrakala/deploy/backups

# Dry-run (پیش‌فرض، امن)
DRY_RUN=true  bash scripts/backup-all.sh

# اجرای واقعی (فقط devops، با تأیید)
DRY_RUN=false bash scripts/backup-all.sh

# پاک‌سازی قدیمی‌ها (با retention از .env)
DRY_RUN=true  bash scripts/cleanup-old-backups.sh
DRY_RUN=false bash scripts/cleanup-old-backups.sh
```

## Verify restore (بدون تغییر دیتابیس)

```bash
cd /opt/afrakala/deploy/backups
DRY_RUN=true  bash scripts/verify-restore.sh
DRY_RUN=false bash scripts/verify-restore.sh
```

## Restore (خطرناک — فقط با مسئولیت کامل)

```bash
cd /opt/afrakala/deploy/backups
DRY_RUN=false CONFIRM_RESTORE=true bash scripts/restore-postgres.sh   # دو تأیید دستی APPLY/RESTORE
DRY_RUN=false CONFIRM_RESTORE=true bash scripts/restore-storage.sh    # safety snapshot خودکار
```

---

## Migration (مرجع: `deploy/migration/README.md`)

```bash
cd /opt/afrakala/deploy/migration

DRY_RUN=true bash scripts/apply-project-migrations.sh
DRY_RUN=true bash scripts/dump-auth.sh
DRY_RUN=true node scripts/export-storage.mjs
DRY_RUN=true node scripts/import-storage.mjs
DRY_RUN=true bash scripts/verify-db-counts.sh
DRY_RUN=true node scripts/verify-storage.mjs
```

اجرای واقعی فقط با `DRY_RUN=false` و طبق `scripts/cutover-checklist.md`.

---

## Logs و دیباگ سریع

```bash
# لاگ همه containerهای یک stack
docker compose logs -f --tail=300

# مصرف منابع
docker stats --no-stream

# دیسک
df -h /opt/afrakala /var/lib/docker

# آخرین خطاهای Caddy
docker compose -f /opt/afrakala/deploy/proxy/docker-compose.yml logs --tail=200 caddy | grep -i error
```

---

## Emergency rollback (خلاصه)

```bash
# اپ به نسخه قبلی
cd /opt/afrakala/repo
git fetch --tags
git checkout prod-<previous-tag>
cd /opt/afrakala/deploy/app
docker compose up -d --build

# دیتابیس به آخرین snapshot سالم
cd /opt/afrakala/deploy/backups
DRY_RUN=false CONFIRM_RESTORE=true bash scripts/restore-postgres.sh

# DNS rollback: کاهش TTL از قبل، بازگشت رکورد A به IP قبلی
```

مرجع کامل سناریوها: `docs/SELF_HOSTING.md` بخش **Disaster recovery**.

---

## یادآوری امنیتی

- `chmod 600` روی همه `.env`ها.
- هرگز `.env`/dump/certificate را commit نکن.
- Studio عمومی نیست؛ از SSH tunnel یا IP allowlist استفاده کن.
- هر اجرای backup/restore/migration در operational log سرور ثبت شود.