# 02 — Architecture Overview | معماری اجرایی Self-Host

- Purpose: نمای کلی stackها، شبکه، و جریان داده.
- Audience: Dev/DevOps.
- Last updated: 2026-05-09
- Related: `deploy/app/`, `deploy/supabase/`, `deploy/proxy/`, `docs/SELF_HOSTING.md`

## استک‌ها

| استک | مسیر | کاربرد |
|---|---|---|
| App | `deploy/app/docker-compose.yml` (dev) / `docker-compose.prod.yml` (prod, pull-only) | اپ Node/TanStack Start |
| Supabase | `deploy/supabase/docker-compose.yml` | db, auth, rest, storage, kong, meta, studio |
| Proxy | `deploy/proxy/docker-compose.yml` | Caddy + TLS |
| Backups | `deploy/backups/` | postgres + storage + env secrets |
| Migration | `deploy/migration/` | apply + verify |

## جریان درخواست

```
Client → Caddy (TLS) → App (web) → Kong → {Auth, REST, Storage} → Postgres
                                  ↘ Healthz
```

## شبکه و پورت‌ها (مرجع: deploy/*)

- Caddy: 80/443 (public)
- App web: داخلی، فقط از طریق Caddy
- Kong: داخلی، فقط از طریق app/proxy
- Postgres: فقط داخل docker network (هرگز public)
- Studio: فقط از طریق SSH tunnel یا IP allowlist

## جریان build/deploy

```
Lovable → GitHub → GitHub Actions (build image) → GHCR
                                                    ↓
                              VPS: docker compose pull && up -d
```

## وابستگی‌های خارجی (همه optional)

- AI/OCR خارجی → flag، graceful fallback.
- SMTP/SMS → optional.

## مرز امنیتی

- Service role key فقط در .env سرور (chmod 600).
- هیچ secret با prefix `VITE_` نیست به‌جز anon/publishable.
- RLS روی همهٔ جداول.