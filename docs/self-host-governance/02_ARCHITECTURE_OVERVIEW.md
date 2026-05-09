# 02 — Architecture Overview | معماری اجرایی Self-Host

- Purpose: نمای کلی stackها، شبکه، جریان build/deploy و ADRها.
- Audience: Dev/DevOps.
- Last updated: 2026-05-09
- Related: `deploy/app/`, `deploy/supabase/`, `deploy/proxy/`, `docs/SELF_HOSTING.md`

## نمودار سطح بالا (Build/Deploy)

```
Lovable (dev only)
   │ git push
   ▼
GitHub repo ───► GitHub Actions (build only) ───► GHCR (image registry)
                                                       │
                                                       │ docker compose pull (manual SSH)
                                                       ▼
                                                 VPS Linux
```

GitHub Actions **هرگز** به production DB وصل نمی‌شود؛ فقط image می‌سازد.

## معماری VPS

```
Internet ──► Caddy (80/443 only)
                │
                ├── app.afrakala.ir ──► web:3000   (Node SSR، non-root، healthcheck)
                └── api.afrakala.ir ──► kong:8000  (Supabase gateway)

Studio: ترجیحاً از طریق SSH tunnel.
اگر public شد: Caddy + IP allowlist + basic auth.
```

## Stackها

| Stack | مسیر | کاربرد |
|---|---|---|
| App | `deploy/app/docker-compose.yml` (dev) / `docker-compose.prod.yml` (prod, pull-only) | اپ Node/TanStack Start |
| Supabase | `deploy/supabase/docker-compose.yml` | db, auth, rest, storage, kong, meta, studio محدود |
| Proxy | `deploy/proxy/docker-compose.yml` | Caddy + TLS (ACME یا manual) |
| Backups | `deploy/backups/` | postgres + storage + env secrets |
| Migration | `deploy/migration/` | apply + verify (manual) |

## Supabase services

- **فعال‌های لازم:** db, auth, rest, storage, kong, meta, studio (محدود).
- **غیرفعال مگر ثابت شود نیاز است:** realtime, edge-functions, imgproxy, analytics/logflare, vector, inbucket.

## مدل شبکه

- شبکهٔ مشترک Docker: `afrakala-net` (external).
- Postgres: **بدون** host port عمومی.
- Kong: **بدون** host port مستقیم عمومی؛ فقط از طریق Caddy.
- Studio: **بدون** host port مستقیم عمومی.
- تنها پورت‌های public روی firewall: 22, 80, 443.

## App image

- non-root user، healthcheck داخلی، خروجی log به stdout/stderr.
- هیچ data یا secret داخل image نیست.
- production فقط `pull` می‌کند، هرگز روی VPS build نمی‌شود.

## ADR — تصمیم‌های معماری

- **چرا فقط Postgres کافی نیست؟** Auth/Storage/REST/Kong برای rate limit، RLS، فایل و توکن لازم‌اند.
- **چرا Supabase self-host؟** سازگاری ۱:۱ با کد فعلی + استقلال از Cloud.
- **چرا Caddy؟** TLS خودکار، ساده، production-grade، بدون وابستگی خارجی پیچیده.
- **چرا migration دستی؟** کاهش ریسک data loss؛ Actions به DB دسترسی ندارد.
- **چرا code/data جدا؟** rebuild/restore/rollback مستقل و امن.
- **چرا فعلاً auto-deploy نه؟** قبل از drill موفق restore و gate، production حساس‌تر از سرعت deploy است.
