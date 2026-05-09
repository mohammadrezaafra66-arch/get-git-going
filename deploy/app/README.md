
## Production vs Local/Staging
- `docker-compose.yml` — **build محلی** برای development/staging سبک.
- `docker-compose.prod.yml` — **pull از GHCR** برای production. هرگز build نمی‌کند.

مصرف production:
```bash
docker login ghcr.io
export IMAGE_TAG=sha-<commit>     # یا latest
docker compose -f deploy/app/docker-compose.prod.yml pull web
docker compose -f deploy/app/docker-compose.prod.yml up -d web
```

متغیرهای موردنیاز در `.env.production`:
- `GHCR_OWNER`, `GHCR_REPO`, `IMAGE_TAG` (اختیاری، پیش‌فرض `latest`)
- بقیه env های runtime app

جزئیات کامل به‌روزرسانی، rollback و migration در:
`docs/SELF_HOST_UPDATE_RUNBOOK.md`
# AfraKala App — Self-Host (Phase SH.3)

این پوشه فقط مربوط به **اپلیکیشن frontend/SSR** است. Supabase self-host و reverse proxy در فازهای بعد (SH.4 / SH.5) جداگانه اضافه می‌شوند.

## پیش‌نیازها

- Docker 24+ و Docker Compose v2
- شبکه docker خارجی `afrakala-net`:
  ```bash
  docker network create afrakala-net
  ```

## آماده‌سازی env

```bash
cp deploy/app/.env.production.example deploy/app/.env.production
# مقادیر را پر کنید. مقدار واقعی هیچ secret را در ریپو commit نکنید.
chmod 600 deploy/app/.env.production
```

نکات امنیتی:
- `SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_API_KEY`, `JWT_SECRET`, `POSTGRES_PASSWORD` **هرگز** نباید پیشوند `VITE_` بگیرند.
- Dockerfile در زمان build دایرکتوری `.output/public` را اسکن می‌کند؛ اگر هرکدام از این نام‌ها در client bundle پیدا شود، build شکست می‌خورد.

## Build

```bash
docker compose -f deploy/app/docker-compose.yml build
```

## اجرا

```bash
docker compose -f deploy/app/docker-compose.yml up -d
```

سرویس `web` پورت `3000` را فقط داخل شبکه `afrakala-net` expose می‌کند (host port منتشر نمی‌شود). در فاز بعد، Caddy جلوی این سرویس قرار می‌گیرد.

## Healthcheck

- مسیر: `GET /api/healthz`
- خروجی: `{ "ok": true }` با status `200`
- بدون auth، بدون اتصال به دیتابیس.

تست از داخل container:
```bash
docker exec afrakala-web wget -qO- http://127.0.0.1:3000/api/healthz
```

## دستورات مفید

```bash
# لاگ‌ها
docker compose -f deploy/app/docker-compose.yml logs -f web

# rebuild بدون cache
docker compose -f deploy/app/docker-compose.yml build --no-cache

# stop
docker compose -f deploy/app/docker-compose.yml down
```

## محدوده این فاز

این فاز فقط build/runtime اپ Node-only است. در این فاز:
- هیچ migration، RLS، Auth یا Storage تغییر نکرده.
- Supabase self-host stack ساخته نشده.
- Caddy/Nginx و SSL پیاده‌سازی نشده.
- OCR خارجی هنوز فعال است (تا فاز SH.6).

## نتیجه Smoke Test (Phase SH.3A)

- `vite.config.ts`: پلاگین Cloudflare به صورت شرطی غیرفعال می‌شود (`cloudflare: process.env.SELF_HOST_NODE === "1" ? false : undefined`). در Dockerfile متغیر `SELF_HOST_NODE=1` ست شده تا خروجی Node SSR ساخته شود؛ build داخل Lovable (preview/published) همچنان روی Cloudflare Workers اجرا می‌شود.
- برای build دستی self-host خارج از Docker از `SELF_HOST_NODE=1 bun run build` استفاده شود.
- خروجی build: `dist/client/` (assets) و `dist/server/server.js` (web `fetch` handler).
- آداپتر Node خام: `server/node-entry.mjs` — request/response را به Web Fetch تبدیل می‌کند، روی `HOST:PORT` listen می‌کند، SIGTERM/SIGINT را تمیز handle می‌کند.
- اجرا: `node server/node-entry.mjs` ✅ (تست‌شده با Node 20).
- `/api/healthz` → `{"ok":true}` با status 200.
- secret-leak scan روی `dist/client/`: **CLEAN** (هیچ‌یک از `SERVICE_ROLE / JWT_SECRET / POSTGRES_PASSWORD / LOVABLE_API_KEY` در client bundle نیست).
- خروجی build هیچ وابستگی Worker/Cloudflare runtime ندارد.