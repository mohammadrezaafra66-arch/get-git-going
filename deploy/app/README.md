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