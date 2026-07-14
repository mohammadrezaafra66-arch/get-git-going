## رفع خطای `operator does not exist: text = app_role` هنگام ایجاد محصول

### تشخیص
تابع RLS `has_any_role(_user_id uuid, _roles text[])` و `has_role(_user_id uuid, _role text)` مستقیماً ستون `user_roles.role` (از نوع enum `app_role`) را با پارامتر `text` مقایسه می‌کنند:

```sql
-- has_any_role(text[])
SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY(_roles))
-- has_role(text)
SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
```

Postgres عملگر `app_role = text` را ندارد → خطای `operator does not exist: text = app_role`.

مسیر رسیدن به این خطا هنگام ایجاد محصول:
- policy `products_insert_dynamic` → `has_dynamic_permission(...)` → در fallback مسیر ورودی/به‌روزرسانی به `has_any_role(uuid, app_role[])` می‌رسد که خودش به overload text‌ای دلگیت می‌کند و اجرای درون تابع به مقایسهٔ enum با text گیر می‌کند.

### تغییر
یک migration تک‌مرحله‌ای که فقط بدنهٔ این دو تابع را با `role::text` اصلاح کند. هیچ signature/permission تغییر نمی‌کند:

```sql
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS(
  SELECT 1 FROM public.user_roles
  WHERE user_id = _user_id AND role::text = ANY(_roles)
) $$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS(
  SELECT 1 FROM public.user_roles
  WHERE user_id = _user_id AND role::text = _role
) $$;
```

### خارج از دامنه
- overloadهای `has_any_role(app_role[])` و `has_role(app_role)` دست‌نخورده باقی می‌مانند (خودشان به overload text‌ای دلگیت می‌کنند و پس از این fix درست کار خواهند کرد).
- policyها، schema، grants، RLS، RBAC، جدول‌ها، types و کد فرانت هیچ تغییری نمی‌کنند.
- سایر تابع‌های `has_*` بررسی شدند و مشکلی ندارند.

### راستی‌آزمایی
- پس از اعمال migration: ایجاد محصول در `/products/new` باید بدون خطا انجام شود.
- سایر بخش‌های وابسته به RBAC (که همین توابع را صدا می‌زنند) هم باید مثل قبل کار کنند، چون فقط بدنهٔ داخلی اصلاح شده و منطق منطبق بر همان مقایسه‌ای است که در جای‌های دیگر با cast صریح انجام می‌شد.

### Rollback
`CREATE OR REPLACE FUNCTION` با بدنهٔ قبلی (بدون `::text`). ولی توصیه نمی‌شود چون نسخهٔ قبلی همیشه در این مسیر خراب بوده است.

### ریسک
هیچ. `role::text` روی enum یک عملیات ایمن و deterministic است و رفتار مقایسهٔ برابری را حفظ می‌کند.
