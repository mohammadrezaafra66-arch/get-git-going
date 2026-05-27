## هدف
افزودن endpoint عمومی `GET /api/version` به AfraKala برای نمایش نسخه فعلی اجراشده، بدون افشای هیچ secret. علاوه بر آن، Dockerfile و LAN compose و GitHub Actions workflow طوری به‌روز شوند که commit hash و زمان build در runtime در دسترس باشند.

## فایل‌هایی که ساخته یا تغییر می‌کنند

1. **افزودن** `src/routes/api.version.ts`
   - TanStack Start file route مشابه `src/routes/api.healthz.ts`
   - Handler GET، خروجی JSON با ساختار خواسته‌شده
   - فقط whitelist زیر خوانده شود (هیچ secret/private/password):
     - `process.env.APP_ENV || process.env.NODE_ENV || "unknown"`
     - `process.env.APP_GIT_SHA || "unknown"` (و `commitShort` = 7 کاراکتر اول)
     - `process.env.APP_BUILD_TIME || "unknown"`
     - `process.env.VITE_SUPABASE_URL || "unknown"` (publishable URL، public)
   - Header `cache-control: no-store`
   - `content-type: application/json`
   - بدون auth (مشابه healthz)؛ مسیر زیر `/api/` می‌ماند نه `/api/public/`، چون hosting LAN است و prefix `public` فقط برای bypass auth در published Lovable لازم است؛ برای سازگاری با الگوی healthz همان روش نگه داشته می‌شود.

2. **به‌روزرسانی** `Dockerfile`
   - افزودن سه ARG در runtime stage (یا قبل از build stage تا در client هم در صورت نیاز در دسترس باشد — اینجا فقط server نیاز است، پس در runtime stage کافی است، ولی برای امن‌سازی و در دسترس بودن در SSR و در صورت نیاز در آینده، در هر دو stage تعریف می‌کنیم):
     ```
     ARG GIT_SHA
     ARG BUILD_TIME
     ARG APP_ENV
     ENV APP_GIT_SHA=$GIT_SHA \
         APP_BUILD_TIME=$BUILD_TIME \
         APP_ENV=$APP_ENV
     ```
   - این ENVها هیچ‌کدام `VITE_` ندارند، پس به client bundle نشت نمی‌کنند.
   - چون مقدارها در runtime stage تنظیم می‌شوند، در `process.env` داخل server route قابل خواندن‌اند.

3. **به‌روزرسانی** `deploy/lan/docker-compose.yml`
   - در سرویس `web` → `build.args` اضافه شود:
     ```yaml
     GIT_SHA: ${GIT_SHA:-local-unknown}
     BUILD_TIME: ${BUILD_TIME:-local-unknown}
     APP_ENV: lan
     ```
   - بقیه ساختار، ENVها، secrets، Kong و db دست‌نخورده باقی می‌ماند.

4. **به‌روزرسانی** `.github/workflows/build-image.yml`
   - در step `Build & push` افزودن `build-args`:
     ```yaml
     build-args: |
       GIT_SHA=${{ github.sha }}
       BUILD_TIME=${{ github.run_id }}
       APP_ENV=production
     ```
   - بقیه workflow (tags، scan، GHCR push) بدون تغییر.

5. **افزودن** `docs/lovable-change-reports/2026-05-27-api-version-endpoint.md`
   - گزارش استاندارد طبق قوانین پروژه (فایل‌های تغییریافته، دلیل، RLS/RBAC impact = none، migration impact = none، self-host acceptance، تست LAN).

## امنیت
- خروجی فقط شامل فیلدهای whitelist است؛ ساخت dynamic از `process.env` انجام نمی‌شود.
- هیچ‌کدام از `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `POSTGRES_PASSWORD`, `LOVABLE_API_KEY`, `SMTP_PASS` و سایر secrets خوانده یا برگردانده نمی‌شود.
- `VITE_SUPABASE_URL` عمومی است (به client bundle هم بسته می‌شود) و افشای آن مشکل امنیتی نیست.
- بدون auth قرار داده می‌شود تا برای health-check و عیب‌یابی نسخه روی LAN در دسترس باشد؛ هیچ اطلاعات حساسی برنمی‌گرداند.
- `cache-control: no-store` برای جلوگیری از cache در پراکسی‌ها.

## بدون تغییر
- هیچ migration، RLS، RBAC، storage policy، auth config، schema، types.ts، edge function، یا frontend بیزینس‌لاجیک تغییر نمی‌کند.
- `deploy/local/docker-compose.yml` و `deploy/app/docker-compose.yml` در این فاز تغییر نمی‌کنند مگر بخواهید (در گزارش ذکر می‌کنم به‌عنوان "remaining manual"). اگر می‌خواهید همه composeها همین build-args را داشته باشند، بگویید تا اضافه کنم.

## تست روی LAN
1. در پوشه `deploy/lan/` این متغیرها را قبل از build set کنید (یا در `.env.lan`):
   ```powershell
   $env:GIT_SHA = (git rev-parse HEAD)
   $env:BUILD_TIME = (Get-Date -Format "o")
   ```
2. اجرای rebuild:
   ```
   docker compose -f deploy/lan/docker-compose.yml build web
   docker compose -f deploy/lan/docker-compose.yml up -d web
   ```
3. تست با curl:
   ```
   curl -s http://localhost:3000/api/version
   curl -s http://LAN_HOST_IP:3000/api/version
   ```
   انتظار: JSON شامل `commit`, `commitShort`, `buildTime`, `environment: "lan"`, `supabasePublicUrl`.
4. تست header:
   ```
   curl -sI http://localhost:3000/api/version | grep -i cache-control
   ```

## ریسک‌ها
- LOW. فقط یک route read-only و چند build-arg جدید.
- اگر کاربر `GIT_SHA` در محیط set نکند، مقدار "local-unknown" برمی‌گردد (طبق default در compose).

آماده برای پیاده‌سازی.
