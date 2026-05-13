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

## ترتیب bootstrap دیتابیس (initdb)

فایل‌های `/docker-entrypoint-initdb.d/` به ترتیب الفبایی اجرا می‌شوند. در تصویر
`supabase/postgres`، اسکریپت رسمی `migrate.sh` قبل از فایل‌های `zz-*` اجرا
می‌شود و خودش با `psql -U supabase_admin` به دیتابیس وصل می‌شود. بنابراین
افراکالا فقط **یک** pre-migrate script دارد:

1. `00-afrakala-pre-supabase-admin.sh` — فقط role `supabase_admin` را با پسورد
   `POSTGRES_PASSWORD` ایجاد/به‌روزرسانی می‌کند تا `migrate.sh` بتواند اجرا شود.
   این فایل عمداً `anon`, `authenticated`, `service_role`, `authenticator`,
   `supabase_auth_admin` یا `supabase_storage_admin` را نمی‌سازد.
2. `migrate.sh` رسمی تصویر — roleها/schemaهای baseline داخلی Supabase را ایجاد
   می‌کند.
3. `zz-10-afrakala-roles.sh` — بعد از migration رسمی، وجود roleهای مورد انتظار
   را assert می‌کند، `dashboard_user` را در صورت نبود می‌سازد، و password roleهای
   login را normalize می‌کند.
4. `zz-20-afrakala-schemas.sql` — فقط top-upهای idempotent برای extension/grant.
5. `zz-30-afrakala-jwt.sh` — تنظیم `app.settings.jwt_secret` و
   `app.settings.jwt_exp` در سطح دیتابیس.

این ترتیب هم جلوی خطای `role "supabase_admin" does not exist` را می‌گیرد، هم
از ساخت زودهنگام همهٔ roleهای baseline و خطای `role "anon" already exists`
جلوگیری می‌کند.

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

---

## Bootstrap deterministic (SH-FIX-SUPABASE-INIT)

قبلاً compose فقط image `supabase/postgres` را بالا می‌آورد و در local staging
سرویس‌های gotrue/rest/storage یا خود `migrate.sh` با خطاهایی مانند:

- `role "supabase_admin" does not exist`
- `role "authenticator" does not exist`
- `schema "auth" does not exist`
- `type "auth.factor_type" does not exist`

شکست می‌خوردند. حالا `volumes/db/init/` شامل یک اسکریپت pre-migrate و سه
اسکریپت post-migrate idempotent است که entrypoint رسمی تصویر در **اولین boot
روی volume خالی** اجرا می‌کند. هر فایل مستقیماً (نه به‌صورت زیرشاخه) داخل
`/docker-entrypoint-initdb.d/` mount می‌شود، چون `docker-entrypoint.sh` فایل‌های
داخل زیرشاخه‌ها را اجرا نمی‌کند:

| فایل | کار |
|------|-----|
| `00-afrakala-pre-supabase-admin.sh` | فقط ساخت/به‌روزرسانی `supabase_admin` قبل از `migrate.sh`. |
| `zz-10-afrakala-roles.sh` | assert نقش‌های baseline بعد از migration رسمی، ساخت `dashboard_user` در صورت نبود، و normalize passwordها. |
| `zz-20-afrakala-schemas.sql` | top-upهای idempotent برای `extensions`, `graphql_public`, grants و default privileges. |
| `zz-30-afrakala-jwt.sh` | تنظیم `app.settings.jwt_secret` و `app.settings.jwt_exp` در سطح DB. مقدار از env `JWT_SECRET` / `JWT_EXPIRY`. |

سپس gotrue / storage در اولین استارت، migrationهای داخلی خود را روی schemaهای
`auth` / `storage` اجرا می‌کنند (مانند `auth.factor_type`, `storage.objects` و …).
**هیچ psql دستی پس از اولین boot لازم نیست.**

### Reset کامل local staging (پاک کردن volume و boot از صفر)

```bash
cd deploy/supabase
docker compose --env-file .env -f docker-compose.yml down -v
docker compose --env-file .env -f docker-compose.yml up -d
```

`down -v` ولوم `db-data` و `storage-data` را حذف می‌کند تا اسکریپت‌های initdb
دوباره اجرا شوند. روی production هرگز `-v` نزنید.

### دستورات verify

```bash
# 1) proof ترتیب mount در compose
rg -n "docker-entrypoint-initdb.d/(00-afrakala-pre-supabase-admin|zz-10-afrakala-roles|zz-20-afrakala-schemas|zz-30-afrakala-jwt)" docker-compose.yml

# 2) وضعیت سرویس‌ها (بعد از حدود 120 ثانیه نباید restarting باشند)
docker compose --env-file .env -f docker-compose.yml ps

# 3) proof لاگ initdb دیتابیس
docker compose --env-file .env -f docker-compose.yml logs db | \
  grep -E "00-afrakala-pre-supabase-admin|migrate.sh|zz-10-afrakala-roles|zz-20-afrakala-schemas|zz-30-afrakala-jwt|role \"anon\" already exists|supabase_admin|syntax error"

# 4) لاگ سه سرویسی که قبلاً شکست می‌خوردند
docker compose --env-file .env -f docker-compose.yml logs --tail=80 auth
docker compose --env-file .env -f docker-compose.yml logs --tail=80 rest
docker compose --env-file .env -f docker-compose.yml logs --tail=80 storage

# 5) تأیید نقش‌ها و schemaها از داخل DB (بدون expose پورت)
docker compose --env-file .env -f docker-compose.yml exec -T db \
  psql -U postgres -d "$POSTGRES_DB" -c "
    SELECT rolname
    FROM pg_roles
    WHERE rolname IN (
      'anon','authenticated','service_role','authenticator','supabase_admin',
      'supabase_auth_admin','supabase_storage_admin','dashboard_user'
    )
    ORDER BY rolname;
  "
docker compose --env-file .env -f docker-compose.yml exec -T db \
  psql -U postgres -d "$POSTGRES_DB" -c "\dn" | grep -E 'auth|storage|extensions'

# 6) Kong health (از داخل شبکه docker، بدون expose روی هاست)
docker compose --env-file .env -f docker-compose.yml exec -T kong \
  curl -fsS http://localhost:8000/auth/v1/health || echo "auth health failed"
```

### قواعد پایدار

- پورت `5432` Postgres هرگز روی هاست publish نمی‌شود.
- Studio/Kong هم پورتی روی هاست ندارند؛ دسترسی فقط از طریق Caddy (فاز proxy).
- اسکریپت‌های initdb افراکالا (`00-afrakala-pre-supabase-admin.sh` و `zz-*`) فقط
  روی **volume خالی** اجرا می‌شوند؛ روی DB موجود اثر ندارند (الزام idempotency
  رعایت شده).
- migrationهای اپ (`deploy/supabase/migrations/`) از مسیر جدا
  `/var/lib/afrakala/migrations` فقط mount شده‌اند و **توسط initdb اجرا
  نمی‌شوند**؛ apply آن‌ها در فاز SH.7 با `apply-project-migrations.sh`.

## آمادگی برای SH.7 (migration scripts)

stack از نظر ساختاری آماده است:
- پوشه `migrations/` در DB به‌صورت read-only mount می‌شود.
- در SH.7 اسکریپت dump/restore از Supabase ابری به این Postgres ساخته می‌شود.
- در SH.6 (در صورت تعریف) قاعدتاً DNS/SSL واقعی Caddy و سپس انتقال داده.