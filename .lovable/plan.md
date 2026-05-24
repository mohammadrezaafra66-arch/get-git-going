
# پلن رفع مشکل احراز هویت — Local Self-host

## محدوده

- محیط هدف: فقط Local self-host روی `192.168.170.8` (LAN، `deploy/lan/.env.lan`)
- بدون تغییر در dashboard / products / pricing / sale lists / bot API / storage / RLS / migrationهای موجود
- بدون تغییر در فایل‌های frontend (تشخیص نشان می‌دهد frontend سالم است)

---

## تشخیص ریشه‌ای (Root Cause)

### 1) «Database error saving new user» هنگام signup

این پیام **خروجی استاندارد GoTrue** وقتی است که trigger `on_auth_user_created` روی `auth.users` exception می‌اندازد. در این پروژه trigger به `public.handle_new_auth_user()` وصل است (migration `20260429123447`) و در `public.profiles` این ستون‌ها را insert می‌کند:

```
id, full_name, phone, position, status, is_active, registered_at
```

اگر روی DB لوکال یکی از این موارد برقرار نباشد، trigger با خطا rollback می‌شود و GoTrue همان پیام عمومی را برمی‌گرداند:

- ستون‌های `position` / `status` / `registered_at` / `is_active` در جدول `profiles` وجود ندارند (migration ناقص apply شده).
- enum `app_role` مقدار `'admin'` ندارد (برای کاربر اول).
- جدول `user_roles` constraint یا columnهای متفاوت دارد.

frontend بی‌گناه است؛ کد `supabase.auth.signUp` در `src/routes/login.tsx` و `src/routes/register.tsx` درست است.

### 2) «ایمیل یا رمز اشتباه» برای کاربر موجود بعد از reset دستی

`UPDATE auth.users SET encrypted_password = crypt('newpass', gen_salt('bf'))` نحویاً درست است، اما GoTrue علاوه بر `encrypted_password` این invariantها را هم بررسی می‌کند و در صورت نقض، همان پیام «Invalid login credentials» می‌دهد (نه پیام شفاف):

- `email_confirmed_at IS NULL` → کاربر «تأیید نشده» تلقی می‌شود.
- `banned_until > now()` یا `deleted_at IS NOT NULL`.
- `aud` یا `role` در ردیف auth.users خالی/نادرست.
- بعد از UPDATE مستقیم، `updated_at` تازه نشده و sessionهای قبلی هنوز معتبر هستند ولی login جدید چک سفت‌گیرتر می‌شود.
- اگر extension `pgcrypto` در schema `extensions` نصب باشد و `search_path` در session SQL شامل آن نبوده، تابع `crypt()` یا `gen_salt()` ممکن است تابع غلط/null hash تولید کرده باشد.

روش امن: استفاده از **Admin API** GoTrue (`auth.admin.updateUserById`) به‌جای UPDATE مستقیم. این مسیر همه invariantها (هش bcrypt با cost مناسب، اعتبار session، confirmed_at) را خودکار درست تنظیم می‌کند.

---

## مراحل اجرا (همه روی سرور لوکال، بدون commit کد)

### مرحله A — اعتبارسنجی state دیتابیس لوکال

روی سرور (یا داخل کانتینر `db` با psql) اجرا شود (read-only، بدون تغییر):

```sql
-- A1) آیا migrationها سینک‌اند؟
SELECT version FROM supabase_migrations.schema_migrations
ORDER BY version DESC LIMIT 10;
-- باید 20260429123447 موجود باشد.

-- A2) ساختار جدول profiles
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='profiles'
ORDER BY ordinal_position;
-- باید position, status, is_active, registered_at, phone, full_name داشته باشد.

-- A3) وجود trigger
SELECT tgname, tgrelid::regclass, proname
FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
WHERE tgname='on_auth_user_created';

-- A4) سلامت کاربر موجود (mohammadrezaafra66@gmail.com یا ایمیل مدنظر)
SELECT id, email, email_confirmed_at, banned_until, deleted_at,
       aud, role, encrypted_password IS NOT NULL AS has_pw,
       length(encrypted_password) AS pw_len,
       substring(encrypted_password,1,4) AS pw_prefix,
       updated_at
FROM auth.users WHERE email = 'EXISTING_USER@example.com';
-- مقدار درست: email_confirmed_at NOT NULL، banned_until NULL، aud='authenticated',
-- role='authenticated'، pw_prefix='$2a$' یا '$2b$'، pw_len=60.

-- A5) بازتولید خطای signup برای پیدا کردن exception واقعی
BEGIN;
SAVEPOINT s;
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
  raw_user_meta_data, email_confirmed_at, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
  'authenticated','authenticated','diag-signup@example.test',
  crypt('Test1234!', gen_salt('bf')),
  '{"full_name":"Diag Test"}'::jsonb, now(), now(), now());
-- اگر error داد، پیام دقیق exception از trigger پیدا می‌شود.
ROLLBACK;
```

### مرحله B — رفع علت signup (در صورت نقص schema)

اگر A2 یا A5 نشان داد ستون/enum مفقود است، **migration جدید نسازید**. به‌جای آن:

```bash
# روی سرور لوکال
cd "/path/to/repo"
bash deploy/migration/scripts/apply-project-migrations.sh \
  --env-file deploy/lan/.env.lan
```

این اسکریپت migrationهای موجود (از جمله `20260429123447_…`) را روی DB لوکال apply می‌کند. بعد از اجرا، A2/A3/A5 را دوباره چک کنید.

اگر همه schemaها درست‌اند ولی trigger همچنان خطا می‌دهد (مثلاً `user_roles` enum 'admin' ندارد)، خروجی exception از A5 برای تصمیم بعدی کافی است (در turn جداگانه، بدون تغییر در plan فعلی).

### مرحله C — reset امن رمز کاربر موجود

به‌جای UPDATE مستقیم، از سرور یک تماس Admin API انجام دهید (service-role key از `deploy/lan/.env.lan`):

```bash
# روی سرور (همان host) — KONG داخلی
curl -sS -X PUT \
  "http://localhost:8000/auth/v1/admin/users/<USER_UUID>" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"password":"NewPass1234!","email_confirm":true}'
```

این کار همزمان: bcrypt درست تولید می‌کند، `email_confirmed_at` را پر می‌کند، sessionهای قبلی را invalidate نمی‌کند و invariantها را برآورده می‌کند.

### مرحله D — تأیید عملکرد

1. در `192.168.170.8:3000/login`، با ایمیل/رمز جدید وارد شوید → باید به `/dashboard` redirect شود.
2. صفحه را refresh کنید → session باید باقی بماند (localStorage در `supabase.auth-token`).
3. در tab «ثبت‌نام» با یک ایمیل تستی جدید signup کنید:
   - اگر `ENABLE_EMAIL_AUTOCONFIRM=true` در `.env.lan` → باید بلافاصله login شود.
   - اگر `false` → پیام «ایمیل تأیید نشده» در UI دیده شود (متن فارسی در `translateAuthError` قبلاً موجود است).
4. رمز اشتباه بدهید → پیام «ایمیل یا رمز عبور اشتباه است.» (موجود در `src/routes/login.tsx:121`).

---

## تنظیمات GoTrue که باید روی `.env.lan` بررسی شوند

| متغیر | مقدار توصیه‌شده برای استفاده داخلی LAN | اثر |
|---|---|---|
| `DISABLE_SIGNUP` | `false` | اجازه ثبت‌نام جدید |
| `ENABLE_EMAIL_SIGNUP` | `true` | فعال بودن مسیر email/password |
| `ENABLE_EMAIL_AUTOCONFIRM` | `true` (LAN داخلی، بدون SMTP) | کاربر بلافاصله می‌تواند login کند |
| `GOTRUE_SMTP_HOST` | خالی در صورت autoconfirm | جلوگیری از خطای SMTP در signup |
| `JWT_SECRET` | همان مقدار قبلی | تغییر این مقدار همه sessionها را باطل می‌کند |

اگر `JWT_SECRET` اخیراً عوض شده باشد، کاربران موجود مجبور به login مجدد می‌شوند ولی این «خطا» نیست.

---

## فایل‌هایی که تغییر می‌کنند

**کد frontend / migration: هیچ‌کدام.**

فقط یک فایل گزارش طبق قاعده پروژه:

- `docs/lovable-change-reports/2026-05-24-HHMM-local-auth-diagnosis-runbook.md` — حاوی همین تشخیص، SQLهای مرحله A، runbook مرحله B/C، چک‌لیست D و rollback (هیچ‌چیز برای rollback لازم نیست چون فقط run-time fix در DB لوکال است).

---

## ریسک‌ها

- اگر apply migration روی لوکال با state inconsistent مواجه شود، باید قبلش از Postgres لوکال backup گرفته شود (`deploy/backups/scripts/backup-postgres.sh`).
- Admin API call نیاز به `SERVICE_ROLE_KEY` صحیح در `.env.lan` دارد؛ اگر key چرخانده شده باشد، اول key را در فایل env اصلاح کنید.
- در صورت فعال بودن `ENABLE_EMAIL_AUTOCONFIRM=false` و نبود SMTP، signup موفق ثبت می‌شود ولی login تا تأیید ایمیل بسته است — این رفتار «درست» است، نه bug.

## معیار پذیرش (مطابق درخواست شما)

- کاربر تأیید‌شدهٔ موجود می‌تواند login کند (پس از مرحله C). ✔
- کاربر جدید می‌تواند signup کند (پس از مرحله B). ✔
- اگر autoconfirm فعال باشد، login بلافاصله ممکن است. ✔
- اگر autoconfirm غیرفعال باشد، UI پیام «ایمیل شما هنوز تأیید نشده است» را می‌دهد (موجود است). ✔
- رمز اشتباه → پیام شفاف فارسی (موجود است). ✔
- session بعد از refresh باقی می‌ماند (`persistSession: true` در `client.ts`). ✔
- مسیرهای محافظت‌شده کاربر معتبر را بیرون نمی‌اندازند (گارد `_authenticated` + `ensureAuthReady` صحیح است). ✔
- هیچ فایل نامرتبط تغییر نمی‌کند. ✔
