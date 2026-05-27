## هدف
اصلاح `GET /api/version` تا `supabasePublicUrl` از env عمومی runtime به نام `APP_SUPABASE_PUBLIC_URL` خوانده شود (با fallback به `VITE_SUPABASE_URL`، در غیر این صورت `"unknown"`).

## فایل‌های تغییر یافته

### 1. `src/routes/api.version.ts`
فقط خط ساخت `supabasePublicUrl` تغییر می‌کند:
```ts
supabasePublicUrl:
  process.env.APP_SUPABASE_PUBLIC_URL ||
  process.env.VITE_SUPABASE_URL ||
  "unknown",
```
بقیه منطق، headerها (`cache-control: no-store`, `content-type: application/json`) و وضعیت no-auth route دست‌نخورده باقی می‌ماند.

### 2. `deploy/lan/docker-compose.yml`
فقط در سرویس `web`، در بلوک `environment`، این خط اضافه می‌شود (بدون default، فقط reference به env):
```yaml
APP_SUPABASE_PUBLIC_URL: ${APP_SUPABASE_PUBLIC_URL:-}
```
هیچ IP واقعی، هیچ مقدار default، هیچ تغییر دیگری در سرویس‌ها یا build args.

### 3. `deploy/lan/.env.lan.example`
افزودن یک خط نمونه بدون مقدار، در بخش Public client-safe vars:
```
APP_SUPABASE_PUBLIC_URL=
```
هیچ IP، هیچ secret. فایل `deploy/lan/.env.lan` واقعی تغییر نمی‌کند.

### 4. `docs/lovable-change-reports/2026-05-27-api-version-supabase-public-url-runtime-env.md`
گزارش جدید شامل: هدف، فایل‌های تغییر یافته، توضیح فنی unknown شدن قبلی (VITE_SUPABASE_URL فقط build-time در bundle جا می‌گیرد و در runtime container روی process.env نیست)، تأکید بر اینکه APP_SUPABASE_PUBLIC_URL یک public runtime env است و secret نیست، تأییدات: security/RLS/RBAC/migration/storage/frontend impact = none، self-host/LAN acceptance، دستور تست. در گزارش هیچ IP واقعی نوشته نمی‌شود؛ فقط جمله «Set APP_SUPABASE_PUBLIC_URL in the local env file on each machine».

## فایل‌های دست‌نخورده
Dockerfile، deploy/app/docker-compose.yml، .github/workflows/build-image.yml، migrationها، RLS/RBAC، types.ts، edge functions، business frontend، auth config، deploy/lan/.env.lan واقعی.

## تأییدات امنیتی
- هیچ IP واقعی در repo نوشته نمی‌شود.
- هیچ secret خوانده یا serialize نمی‌شود؛ فقط همان دو env عمومی.
- route بدون auth باقی می‌ماند (مشابه healthz) و فقط فیلدهای امن قبلی + همان فیلد بازنویسی‌شده برمی‌گرداند.

## تست LAN (بعد از build mode)
روی هر دستگاه (PC Test / Laptop Server):
1. مقدار `APP_SUPABASE_PUBLIC_URL` را در `deploy/lan/.env.lan` همان دستگاه برابر public Supabase URL همان دستگاه قرار بده (خارج از repo).
2. `docker compose -f deploy/lan/docker-compose.yml up -d --build web`
3. `curl -s http://<host>:3000/api/version` — فیلد `supabasePublicUrl` باید مقدار env را نشان دهد؛ اگر env تنظیم نشده باشد، `"unknown"` بدون خطا.
