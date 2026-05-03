# AfraKala — Supabase Self-Host Stack (Phase SH.5 scaffold)

این پوشه فقط **اسکلت** استقرار self-host Supabase برای افراکالا است.
در این فاز هیچ migration، seed، داده، کاربر، فایل storage یا secret واقعی
ساخته/منتقل نشده است.

## سرویس‌های فعال در این stack

| سرویس | تصویر | چرا |
|-------|-------|-----|
| `db` (Postgres) | `supabase/postgres` | پایگاه داده اصلی |
| `auth` (GoTrue) | `supabase/gotrue` | احراز هویت کاربران |
| `rest` (PostgREST) | `postgrest/postgrest` | REST API روی DB با احترام به RLS |
| `storage` | `supabase/storage-api` | فایل‌های رسید/سند (file backend لوکال) |
| `meta` | `supabase/postgres-meta` | پشت Studio |
| `studio` | `supabase/studio` | کنسول داخلی (محدود به ادمین) |
| `kong` | `kong:2.8` | API gateway برای auth/rest/storage |

## سرویس‌های عمداً غیرفعال

بدون اثبات نیاز اضافه نمی‌شوند تا سطح حمله کم بماند:

- `realtime` — این پروژه طبق قواعد، realtime را فقط در موارد خاص استفاده می‌کند.
- `edge-functions` — منطق سرور در TanStack Start و server functions اپ است.
- `imgproxy` — تبدیل تصویر فعلاً نیاز نیست.
- `analytics` / `logflare` / `vector` — لاگ ساده‌تر کافی است.
- `inbucket` — SMTP واقعی استفاده می‌شود، نه inbox تستی.

اگر در آینده نیاز شد، فقط بلاک سرویس را به `docker-compose.yml` اضافه و در
`kong.yml` route مربوطه را ثبت کنید.

## شبکه و امنیت

- هیچ سرویسی پورتی روی هاست **publish نمی‌کند**.
- `db`, `auth`, `rest`, `storage`, `meta` فقط روی شبکه داخلی `supabase-internal`.
- `kong` و `studio` علاوه بر شبکه داخلی، به شبکه external **`afrakala-net`** متصل‌اند
  تا Caddy (از فاز SH.4) بتواند به آن‌ها برسد.
- پیش از start اولیه، شبکه را بسازید:
  ```bash
  docker network create afrakala-net
  ```
- دسترسی Studio فقط از طریق Caddy با `basic_auth` + IP allowlist
  (یا SSH tunnel) — هرگز عمومی نشود.

## فایل‌های پیکربندی

| فایل | نقش | در ریپو؟ |
|------|-----|----------|
| `docker-compose.yml` | تعریف stack | ✅ بله |
| `.env.example` | الگوی متغیرها | ✅ بله |
| `kong.yml.example` | الگوی Kong | ✅ بله |
| `.env` | مقادیر واقعی | ❌ ignored |
| `volumes/` | داده runtime | ❌ ignored |
| `migrations/` | فایل‌های SQL برای فاز SH.7 | ✅ پوشه ساخته (محتوا بعداً) |

## استقرار اولیه روی سرور (دستی)

```bash
cd /opt/afrakala/supabase

# 1) شبکه مشترک با Caddy
docker network create afrakala-net || true

# 2) متغیرها
cp .env.example .env
# مقادیر POSTGRES_PASSWORD / JWT_SECRET / ANON_KEY / SERVICE_ROLE_KEY را
# با ابزار رسمی Supabase تولید و جایگزین کنید.

# 3) Kong
mkdir -p volumes/api
cp kong.yml.example volumes/api/kong.yml

# 4) start
docker compose up -d
docker compose ps
```

## آنچه در این فاز انجام **نشده**

- ❌ هیچ migration اجرا نشد.
- ❌ هیچ داده‌ای منتقل نشد.
- ❌ هیچ کاربر auth منتقل نشد.
- ❌ هیچ فایل storage منتقل نشد.
- ❌ هیچ secret/cert/.env واقعی ساخته نشد.
- ❌ Dockerfile اپ یا proxy تغییر نکرد.
- ❌ schema یا feature module تغییر نکرد.
- ❌ OCR تغییر نکرد.

## آمادگی برای SH.7 (migration scripts)

stack از نظر ساختاری آماده است:
- پوشه `migrations/` در DB به‌صورت read-only mount می‌شود.
- در SH.7 اسکریپت dump/restore از Supabase ابری به این Postgres ساخته می‌شود.
- در SH.6 (در صورت تعریف) قاعدتاً DNS/SSL واقعی Caddy و سپس انتقال داده.