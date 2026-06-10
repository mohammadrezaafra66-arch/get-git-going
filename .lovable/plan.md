# رفع مشکل: نبود trigger روی auth.users و backfill پروفایل‌های گم‌شده

## تشخیص
- `public.handle_new_auth_user()` موجود و درست است (full_name/phone/position از raw_user_meta_data، status='pending' برای کاربران بعدی، اولین کاربر → admin + active، audit log).
- `public.handle_new_user()` نسخهٔ ساده‌تر/قدیمی است — **دست‌نخورده باقی می‌ماند**.
- هیچ trigger روی `auth.users` در DB cloud وجود ندارد → روی self-host LAN هم همین وضع است، در نتیجه profile ساخته نمی‌شود.
- در DB cloud فعلی هیچ کاربر یتیم (auth.users بدون profile) وجود ندارد، ولی روی self-host LAN وجود دارد؛ migration باید idempotent باشد.

## فایل‌های inspected
- `supabase/migrations/*` (برای زمان‌بندی)
- function definitions: `public.handle_new_auth_user`, `public.handle_new_user`
- جدول `public.profiles`, `public.user_roles`, `public.audit_logs`
- `src/routes/register.tsx` (تأیید این‌که فقط `signUp` صدا می‌زند و انتظار trigger دارد)

## تغییرات
**فقط یک فایل migration جدید** با timestamp تازه در `supabase/migrations/`:

### ۱. ساخت trigger روی `auth.users`
```sql
DROP TRIGGER IF EXISTS on_auth_user_created_afrakala ON auth.users;
CREATE TRIGGER on_auth_user_created_afrakala
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
```
- نام منحصربه‌فرد `on_auth_user_created_afrakala` تا با trigger احتمالی قبلی برخورد نکند.
- `DROP IF EXISTS` فقط همین trigger هم‌نام را برمی‌دارد — هیچ trigger دیگر روی `auth.users` (مثلاً triggerهای داخلی Supabase auth) لمس نمی‌شود.
- `handle_new_auth_user` خودش `ON CONFLICT DO NOTHING` دارد، پس re-run امن است.

### ۲. Backfill کاربران یتیم
```sql
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT u.id, u.email, u.raw_user_meta_data, u.created_at
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE p.id IS NULL
  LOOP
    INSERT INTO public.profiles (id, full_name, phone, position, status, is_active, registered_at)
    VALUES (
      r.id,
      COALESCE(r.raw_user_meta_data->>'full_name', r.email),
      r.raw_user_meta_data->>'phone',
      r.raw_user_meta_data->>'position_proposed',
      'pending',
      true,
      COALESCE(r.created_at, now())
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (r.id, 'user', r.id::text, 'user_profile_backfilled',
            jsonb_build_object('email', r.email, 'reason', 'missing_profile_backfill'));
  END LOOP;
END $$;
```
- همهٔ یتیم‌ها به‌صورت `pending` می‌آیند (مدیر در `/users?status=pending` می‌بیند و تأیید می‌کند).
- بدون role assignment (تنها اولین کاربر admin می‌شود، که آن منطق در trigger است نه backfill).
- audit log برای ردیابی.

## چیزهایی که تغییر **نمی‌کند**
- `public.handle_new_user` (دست‌نخورده — بدون تأیید حذف/جایگزین نمی‌شود).
- هیچ جدول/ستون/enum/role/policy/volume.
- هیچ migration قدیمی.
- هیچ کد frontend (`/register`, `/users`, ...).
- هیچ RLS/RBAC.

## اثرات
- **Migration impact**: یک trigger جدید روی `auth.users` + backfill داده‌های گم‌شدهٔ `profiles`. Reversible.
- **RLS/RBAC**: بدون تغییر. (نقش‌ها همان‌طور که بود.)
- **Audit**: ردیف `user_profile_backfilled` برای هر backfill + `user_registered` برای ثبت‌نام‌های بعدی از طریق trigger.
- **Self-host**: کاملاً سازگار — فقط SQL استاندارد روی schema موجود.

## Test path
1. Backup کامل DB قبل از اجرا (روی production الزامی).
2. `bash deploy/local/scripts/local-apply-migrations.sh` روی local.
3. SQL check: `SELECT tgname FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND tgname='on_auth_user_created_afrakala';` باید ۱ ردیف برگرداند.
4. SQL check: `SELECT count(*) FROM auth.users u LEFT JOIN public.profiles p ON p.id=u.id WHERE p.id IS NULL;` باید ۰ باشد.
5. ثبت‌نام تستی از `/register` → بررسی ساخته‌شدن profile با `status='pending'` و دیده‌شدن در `/users?status=pending`.
6. روی staging/LAN قبل از production.

## Rollback
```sql
DROP TRIGGER IF EXISTS on_auth_user_created_afrakala ON auth.users;
```
Backfillها در `public.profiles` با `status='pending'` می‌مانند و بی‌خطرند؛ در صورت نیاز می‌توان رکوردهای backfill‌شده را با کمک audit log (`action='user_profile_backfilled'`) شناسایی و حذف کرد.

## ریسک‌های باقی‌مانده
- اگر در آینده trigger همنام دیگری توسط تیم دیگر اضافه شود، `DROP IF EXISTS` در re-run آن را خواهد برداشت — به همین دلیل نام namespace‌دار `_afrakala` انتخاب شده.
- `handle_new_auth_user` در صورت خطای داخلی (مثلاً جدول `audit_logs` در آینده تغییر schema بدهد) می‌تواند signUp را شکست بدهد؛ schema فعلی سازگار است.
