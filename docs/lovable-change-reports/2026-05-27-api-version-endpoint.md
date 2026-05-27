# گزارش تغییر — افزودن endpoint /api/version

تاریخ: 2026-05-27

## هدف
افزودن endpoint عمومی `GET /api/version` برای مشاهده نسخه/commit/زمان build اپ در runtime، بدون افشای هیچ secret. علاوه بر آن، پاس دادن `GIT_SHA`، `BUILD_TIME` و `APP_ENV` در زنجیره build (Dockerfile، LAN compose، GitHub Actions).

## فایل‌های بررسی‌شده
- `src/routes/api.healthz.ts` (الگوی مرجع server route)
- `Dockerfile`
- `deploy/lan/docker-compose.yml`
- `.github/workflows/build-image.yml`
- `src/start.ts`, `src/integrations/supabase/auth-middleware.ts` (تأیید این که route عمومی بدون auth مشکلی ندارد — healthz نیز همین الگو را دارد)

## فایل‌های تغییریافته
1. **`src/routes/api.version.ts`** (جدید)
   - TanStack Start file route مشابه `api.healthz`.
   - فقط whitelist مشخص از `process.env` خوانده می‌شود: `APP_ENV`, `NODE_ENV`, `APP_GIT_SHA`, `APP_BUILD_TIME`, `VITE_SUPABASE_URL`.
   - Header `cache-control: no-store` و `content-type: application/json`.

2. **`Dockerfile`**
   - افزودن `ARG GIT_SHA`, `ARG BUILD_TIME`, `ARG APP_ENV` در runtime stage و map به `APP_GIT_SHA`, `APP_BUILD_TIME`, `APP_ENV` (بدون پیشوند `VITE_`).

3. **`deploy/lan/docker-compose.yml`**
   - افزودن `GIT_SHA`, `BUILD_TIME`, `APP_ENV: lan` به `services.web.build.args`.

4. **`.github/workflows/build-image.yml`**
   - افزودن `build-args` به step "Build & push" با `GIT_SHA=${{ github.sha }}`، `BUILD_TIME=${{ github.run_id }}`، `APP_ENV=production`.

## امنیت
- خروجی JSON فقط شامل فیلدهای از پیش‌تعریف‌شده است؛ هیچ ساخت dynamic از env انجام نمی‌شود.
- هیچ‌کدام از `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `POSTGRES_PASSWORD`, `LOVABLE_API_KEY`, `SMTP_PASS`, کلیدها/گذرواژه‌های private خوانده یا برگردانده نمی‌شود.
- `VITE_SUPABASE_URL` عمومی است (در client bundle هم وجود دارد).
- متغیرهای جدید (`APP_GIT_SHA`, `APP_BUILD_TIME`, `APP_ENV`) پیشوند `VITE_` ندارند → به client bundle نشت نمی‌کنند.
- secret-leak scan در workflow کماکان روی image جدید اجرا می‌شود.

## Migration / RLS / RBAC / Audit
- بدون تغییر. هیچ migration، policy، grant، trigger، یا audit جدید.

## Self-Host Acceptance Check
- بدون وابستگی به CDN/سرویس خارجی.
- روی Linux + Docker LAN قابل اجرا.
- در صورت set نبودن `GIT_SHA`/`BUILD_TIME` در shell، default `local-unknown` استفاده می‌شود؛ سرویس crash نمی‌کند.

## تست LAN

1. در shell سرور/لپ‌تاپ LAN:
   ```powershell
   $env:GIT_SHA = (git rev-parse HEAD)
   $env:BUILD_TIME = (Get-Date -Format "o")
   docker compose -f deploy/lan/docker-compose.yml build web
   docker compose -f deploy/lan/docker-compose.yml up -d web
   ```
   یا روی Linux:
   ```bash
   export GIT_SHA="$(git rev-parse HEAD)"
   export BUILD_TIME="$(date -Iseconds)"
   docker compose -f deploy/lan/docker-compose.yml build web
   docker compose -f deploy/lan/docker-compose.yml up -d web
   ```

2. curl برای بررسی body:
   ```bash
   curl -s http://localhost:3000/api/version | jq
   curl -s http://LAN_HOST_IP:3000/api/version | jq
   ```
   انتظار:
   ```json
   {
     "ok": true,
     "app": "AfraKala",
     "environment": "lan",
     "commit": "<sha>",
     "commitShort": "<7-char>",
     "buildTime": "<iso>",
     "supabasePublicUrl": "http://LAN_HOST_IP:8000"
   }
   ```

3. curl برای header:
   ```bash
   curl -sI http://localhost:3000/api/version | grep -i cache-control
   # Cache-Control: no-store
   ```

## ریسک‌های باقی‌مانده
- LOW. اگر `deploy/local/docker-compose.yml` یا `deploy/app/docker-compose.yml` بعداً نیاز به همین build-args داشتند، باید جداگانه اضافه شوند (در این تغییر فقط LAN لمس شد).

## وضعیت build/lint/typecheck/test
- build توسط harness خودکار اجرا می‌شود.
- تست واحد مستقل برای route وجود ندارد؛ تست با curl روی LAN لازم است (بالا).