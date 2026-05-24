# Local Auth Diagnosis & Runbook — Self-host (LAN)

- Date: 2026-05-24
- Scope: فقط احراز هویت روی سرور لوکال `192.168.170.8` (`deploy/lan/.env.lan`)
- Sensitive changes: ندارد — هیچ فایل کد، migration، RLS، Docker یا env تغییر نمی‌کند.
- Package changes: ندارد.
- Docker changes: ندارد.
- DB/RLS/migration changes: migration جدید ساخته نمی‌شود؛ فقط migrationهای موجود روی DB لوکال apply می‌شوند.

## خلاصه تشخیص

دو علامت گزارش‌شده:

1. **«Database error saving new user»** هنگام signup.
2. **«ایمیل یا رمز عبور اشتباه است.»** برای کاربر موجود — حتی بعد از reset دستی با
   `UPDATE auth.users SET encrypted_password = crypt('newpass', gen_salt('bf'))`.

frontend سالم است (login form، AuthProvider، session.ts، guard `_authenticated`،
`reset-password.tsx`). علت هر دو علامت در سرویس GoTrue / state دیتابیس لوکال است.

### علت 1 — Signup

trigger `on_auth_user_created` به تابع `public.handle_new_auth_user()` وصل است
(migration `20260429123447_…`) که در `public.profiles` این ستون‌ها را insert می‌کند:
`id, full_name, phone, position, status, is_active, registered_at` و برای کاربر اول
در `public.user_roles` نقش `'admin'` می‌گذارد. اگر یکی از این invariantها در DB
لوکال برقرار نباشد (ستون مفقود، enum مفقود، constraint متفاوت)، trigger
exception می‌اندازد و GoTrue همان پیام عمومی *Database error saving new user* را
برمی‌گرداند.

### علت 2 — Login بعد از reset دستی

ترکیب `crypt + gen_salt('bf')` نحویاً درست است، اما GoTrue علاوه بر هش، این
شرایط را هم چک می‌کند و در صورت نقض همان پیام «Invalid login credentials» را
می‌دهد (پیام شفاف‌تر نمی‌دهد):

- `email_confirmed_at IS NULL` ⇒ کاربر «تأیید نشده» تلقی می‌شود.
- `banned_until > now()` یا `deleted_at IS NOT NULL`.
- `aud` یا `role` در ردیف auth.users خالی/نادرست.
- `pgcrypto` در schema غیرمنتظره نصب باشد و `search_path` در session ای که UPDATE
  اجرا شده شامل آن نبوده — hash تولیدی غلط می‌شود.
- پس از UPDATE مستقیم، فیلدهای جانبی (`updated_at`، `recovery_token`،
  `confirmation_token`) ناسازگار بمانند.

راه امن: **Admin API** GoTrue.

---

## مرحله A — Read-only Validation روی DB لوکال

داخل کانتینر `db` یا با `psql` به Postgres لوکال:

```sql
-- A1) migrationها سینک‌اند؟
SELECT version FROM supabase_migrations.schema_migrations
ORDER BY version DESC LIMIT 10;
-- باید 20260429123447 موجود باشد.

-- A2) ساختار جدول profiles
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='profiles'
ORDER BY ordinal_position;
-- باید position, status, is_active, registered_at, phone, full_name داشته باشد.

-- A3) trigger
SELECT tgname, tgrelid::regclass, proname
FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
WHERE tgname='on_auth_user_created';

-- A4) سلامت کاربر موجود
SELECT id, email, email_confirmed_at, banned_until, deleted_at,
       aud, role, encrypted_password IS NOT NULL AS has_pw,
       length(encrypted_password) AS pw_len,
       substring(encrypted_password,1,4) AS pw_prefix, updated_at
FROM auth.users WHERE email = 'EXISTING_USER@example.com';
-- درست: email_confirmed_at NOT NULL، banned_until NULL، aud='authenticated',
-- role='authenticated'، pw_prefix='$2a$' یا '$2b$'، pw_len=60.

-- A5) بازتولید خطای signup برای دیدن پیام exception واقعی
BEGIN;
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
  raw_user_meta_data, email_confirmed_at, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
  'authenticated','authenticated','diag-signup@example.test',
  crypt('Test1234!', gen_salt('bf')),
  '{"full_name":"Diag Test"}'::jsonb, now(), now(), now());
ROLLBACK;
```

## مرحله B — Apply migrationهای موجود (اگر A2/A5 نقص schema نشان داد)

قبل از اجرا، backup بگیرید:

```bash
bash deploy/backups/scripts/backup-postgres.sh
```

سپس:

```bash
bash deploy/migration/scripts/apply-project-migrations.sh \
  --env-file deploy/lan/.env.lan
```

بعد از apply، مراحل A2/A3/A5 را تکرار کنید. **migration جدید نسازید.**

## مرحله C — Reset امن رمز کاربر موجود (Admin API)

```bash
# روی همان host (KONG داخلی)
curl -sS -X PUT \
  "http://localhost:8000/auth/v1/admin/users/<USER_UUID>" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"password":"NewPass1234!","email_confirm":true}'
```

این مسیر همزمان bcrypt درست تولید می‌کند، `email_confirmed_at` را پر می‌کند، و
invariantهای GoTrue را برآورده می‌سازد.

## مرحله D — تأیید عملکرد (Acceptance)

1. `http://192.168.170.8:3000/login` با رمز جدید ⇒ redirect به `/dashboard`.
2. Refresh صفحه ⇒ session باقی می‌ماند (`persistSession: true`).
3. signup با ایمیل جدید:
   - `ENABLE_EMAIL_AUTOCONFIRM=true` ⇒ بلافاصله login.
   - `=false` ⇒ پیام «ایمیل تأیید نشده» در UI (متن فارسی در `translateAuthError`).
4. رمز اشتباه ⇒ «ایمیل یا رمز عبور اشتباه است.» (موجود در `src/routes/login.tsx`).

## تنظیمات GoTrue که در `deploy/lan/.env.lan` باید بررسی شوند

| متغیر | مقدار توصیه‌شده برای LAN | اثر |
|---|---|---|
| `DISABLE_SIGNUP` | `false` | اجازه ثبت‌نام جدید |
| `ENABLE_EMAIL_SIGNUP` | `true` | فعال بودن مسیر email/password |
| `ENABLE_EMAIL_AUTOCONFIRM` | `true` (LAN داخلی، بدون SMTP) | login فوری پس از signup |
| `GOTRUE_SMTP_HOST` | خالی در حالت autoconfirm | جلوگیری از خطای SMTP در signup |
| `JWT_SECRET` | همان مقدار قبلی | تغییر باعث invalidate شدن همه sessionها می‌شود |

## ریسک‌ها

- اگر apply migration روی DB لوکال inconsistent باشد، حتماً backup قبلی موجود باشد.
- اگر `SERVICE_ROLE_KEY` در `.env.lan` چرخانده شده، اول env را اصلاح کنید.
- وقتی `ENABLE_EMAIL_AUTOCONFIRM=false` و SMTP موجود نیست، signup موفق ولی login
  تا تأیید ایمیل بسته است — رفتار درست است، نه bug.

## Rollback

- مرحله A: read-only.
- مرحله B: در صورت بروز مشکل، restore از `deploy/backups/.../<latest>`.
- مرحله C: قابل تکرار با رمز قبلی است.

## Files inspected / changed

- inspected: `src/routes/login.tsx`, `src/routes/register.tsx`,
  `src/lib/auth/session.ts`, `src/lib/auth/AuthProvider.tsx`,
  `src/routes/reset-password.tsx`, `src/integrations/supabase/client.ts`,
  `supabase/migrations/20260424144837_*.sql`,
  `supabase/migrations/20260429123447_*.sql`,
  `deploy/lan/.env.lan.example`.
- changed (code): هیچ.
- created: همین فایل گزارش.

## Self-Host Acceptance Check

- بدون CDN / فونت خارجی / dependency جدید.
- بدون تغییر در ساختار dashboard / products / pricing / sale lists / bot API / storage.
- بدون secret در commit.
- مسیر کاملاً Linux + Docker + Supabase self-host سازگار است.