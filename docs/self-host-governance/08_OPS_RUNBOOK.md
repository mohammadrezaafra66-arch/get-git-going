# 08 — Ops Runbook

- Purpose: عملیات روزانه + backup/restore + DR.
- Audience: DevOps/Operator.
- Last updated: 2026-05-09
- Related: `docs/OPERATIONS_QUICK_REFERENCE.md`, `docs/SELF_HOST_UPDATE_RUNBOOK.md`, `docs/SELF_HOSTING.md`

## ترتیب راه‌اندازی stackها

1. Supabase (`deploy/supabase`)
2. App (`deploy/app/docker-compose.prod.yml` — pull-only)
3. Proxy (`deploy/proxy`)

## عملیات روزانه

```bash
docker compose ps
docker compose logs --tail=200 web
df -h && free -m && uptime
curl -fsS https://app.afrakala.ir/api/healthz
```

ری‌استارت‌ها: `docker compose restart web | caddy | <supabase-service>`.

## آپدیت فقط اپ (بدون migration)

```bash
git pull
docker compose -f deploy/app/docker-compose.prod.yml pull web
docker compose -f deploy/app/docker-compose.prod.yml up -d web
curl -fsS https://app.afrakala.ir/api/healthz
```

## آپدیت با migration

```bash
bash deploy/backups/scripts/backup-postgres.sh
git pull
ls -lt supabase/migrations | head
DRY_RUN=true  bash deploy/migration/scripts/apply-project-migrations.sh
DRY_RUN=false bash deploy/migration/scripts/apply-project-migrations.sh
docker compose -f deploy/app/docker-compose.prod.yml pull web
docker compose -f deploy/app/docker-compose.prod.yml up -d web
bash deploy/migration/scripts/smoke-test.sh
```

## Backup policy

- روزانه: Postgres، Storage، secrets رمز‌شده (age/sops).
- نگه‌داری محلی: ۱۴ روز. offsite: ۳۰ روز.
- ماهانه: drill restore روی staging.

## Restore policy

- Backup بدون restore-test معتبر نیست.
- restore فقط روی staging؛ روی production فقط در emergency با تأیید owner/devops.

## Disaster Recovery (سناریوها)

- خرابی DB → restore آخرین snapshot سالم.
- از دست رفتن Storage → restore از backup فایل.
- از دست رفتن سرور → provision جدید + restore + DNS.
- خرابی گواهی → renew دستی Caddy یا fallback manual cert.
- در دسترس نبودن GHCR → استفاده از image cache محلی روی VPS.
- در دسترس نبودن GitHub → ادامه با snapshot محلی repo.
- قطع اینترنت بین‌الملل → core طبق `09_INTERNET_RESILIENCE.md` کار کند.

## Monitoring

uptime-kuma (healthz)، docker stats، آلارم disk/RAM، آلارم backup job.

## Emergency Rollback

- App: pull image قبلی از GHCR + `up -d`.
- DB: `restore-postgres.sh` با آخرین snapshot سالم.
- DNS: بازگشت به IP قبلی (TTL پایین قبلی).
