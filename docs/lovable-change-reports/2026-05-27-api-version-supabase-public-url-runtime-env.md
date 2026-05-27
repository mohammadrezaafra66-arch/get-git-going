# 2026-05-27 — `/api/version` supabasePublicUrl از env عمومی runtime

## هدف
اصلاح فیلد `supabasePublicUrl` در پاسخ `GET /api/version` تا مقدار از env عمومی runtime به نام `APP_SUPABASE_PUBLIC_URL` خوانده شود، با fallback به `VITE_SUPABASE_URL` و در نهایت `"unknown"`.

## فایل‌های تغییر یافته
- `src/routes/api.version.ts` — فقط منطق ساخت `supabasePublicUrl`. headerها، status، ساختار JSON و no-auth بودن route دست‌نخورده.
- `deploy/lan/docker-compose.yml` — افزودن `APP_SUPABASE_PUBLIC_URL: ${APP_SUPABASE_PUBLIC_URL:-}` فقط در `environment` سرویس `web`. بدون default، بدون IP.
- `deploy/lan/.env.lan.example` — افزودن خط نمونه `APP_SUPABASE_PUBLIC_URL=` بدون مقدار.
- این گزارش (جدید).

## دلیل فنی unknown شدن قبلی
`VITE_SUPABASE_URL` فقط به عنوان build-arg به مرحله build داده می‌شد و در زمان build داخل bundle frontend جایگزین می‌شد (`import.meta.env.VITE_*`). در runtime کانتینر web هیچ `process.env.VITE_SUPABASE_URL` تنظیم نشده بود، پس route سمت سرور همیشه به fallback `"unknown"` می‌رسید.

## ماهیت env جدید
`APP_SUPABASE_PUBLIC_URL` یک **public runtime env** است (همان URLی که از مرورگر LAN قابل دسترسی است). secret نیست، در bundle قرار نمی‌گیرد و هیچ کلید/توکن/پسوردی را افشا نمی‌کند.

## Impact
- Security: none — فقط یک URL عمومی برگردانده می‌شود؛ هیچ secret خوانده، serialize یا dump نمی‌شود. هرگز `process.env` کامل برنمی‌گردد.
- RLS/RBAC: none
- Migration: none
- Storage: none
- Frontend business logic: none
- Auth config: none
- Edge functions: none

## Self-host / LAN acceptance
- بدون وابستگی به CDN یا API خارجی.
- بدون IP واقعی در repo؛ مقدار واقعی فقط در `.env.lan` همان دستگاه قرار می‌گیرد.
- سازگار با Linux + Docker.

## راهنمای تنظیم
Set `APP_SUPABASE_PUBLIC_URL` in the local env file on each machine (PC Test و Laptop Server هرکدام مقدار مخصوص خود را دارند). هیچ مقدار مشترک hardcode وجود ندارد.

## تست
1. مقدار `APP_SUPABASE_PUBLIC_URL` را در `deploy/lan/.env.lan` همان دستگاه قرار بده.
2. `docker compose -f deploy/lan/docker-compose.yml up -d --build web`
3. `curl -s http://<host>:3000/api/version` — فیلد `supabasePublicUrl` باید مقدار env را نشان دهد.
4. اگر env تنظیم نشود، مقدار `"unknown"` بدون خطا برمی‌گردد.

## تأییدات
- هیچ IP واقعی وارد repo نشد.
- هیچ secret خوانده یا نمایش داده نشد.
- route همچنان no-auth، با `cache-control: no-store` و `content-type: application/json`.