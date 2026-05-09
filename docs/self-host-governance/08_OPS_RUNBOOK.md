# 08 — Ops Runbook (Pointer)

- Purpose: ارجاع به دستورات روزانه و runbook به‌روزرسانی.
- Audience: DevOps.
- Last updated: 2026-05-09
- Related: `docs/OPERATIONS_QUICK_REFERENCE.md`, `docs/SELF_HOST_UPDATE_RUNBOOK.md`, `docs/SELF_HOSTING.md`

## مرجع‌ها

- دستورات روزانه: `docs/OPERATIONS_QUICK_REFERENCE.md`
- آپدیت/rollback: `docs/SELF_HOST_UPDATE_RUNBOOK.md`
- مرجع کامل: `docs/SELF_HOSTING.md`

## ترتیب راه‌اندازی stackها

1. Supabase (`deploy/supabase`)
2. App (`deploy/app/docker-compose.prod.yml` — pull-only)
3. Proxy (`deploy/proxy`)

## healthcheckهای پایه

```bash
curl -fsS https://app.afrakala.ir/api/healthz
curl -I    https://api.afrakala.ir
bash /opt/afrakala/deploy/migration/scripts/smoke-test.sh
```

## Emergency Rollback (خلاصه)

- اپ → image قبلی از GHCR + `docker compose up -d`.
- دیتابیس → `restore-postgres.sh` با آخرین snapshot سالم.
- DNS → بازگشت به IP قبلی (TTL پایین قبلی).

جزئیات: `docs/OPERATIONS_QUICK_REFERENCE.md` بخش Emergency rollback.