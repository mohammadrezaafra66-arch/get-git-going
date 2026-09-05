# گزارش هات‌فیکس امنیتی — بستن مسیر ناشناس به `revoke_user_role_txt`

**تاریخ:** ۲۰۲۶-۰۸-۳۱ · **وضعیت نهایی: PARTIAL**

همهٔ شرط‌های خروج Stage 0 تا Stage 3 با شواهدشان برقرارند و تغییرِ مجاز کامل و موفق
اعمال شد. وضعیت PARTIAL است چون بخش «حل‌نشده» خالی نیست — مهم‌ترینش این است که همین
تابع هنوز برای هر کاربر احراز‌هویت‌شده قابل فراخوانی است. نوشتن COMPLETE این‌جا
گمراه‌کننده می‌شد: کسی که فقط تیتر را بخواند فکر می‌کند `revoke_user_role_txt` امن شده،
در حالی که فقط نیمی از حفره بسته شده.

---

## ۱. هویت ماشین

```
$ hostname
DESKTOP-MT8J1VR
```

مطابق انتظار — سرور تولید. همهٔ کوئری‌ها با `-d postgres` صریح اجرا شدند.

---

## ۲. فایل پشتیبان

```
$ docker exec afrakala-lan-db pg_dump -U postgres -d postgres -Fc -f /tmp/pre-rolerevoke.dump
pg_dump: warning: there are circular foreign-key constraints on this table:
pg_dump: detail: key
pg_dump: hint: You might not be able to restore the dump without using --disable-triggers
             or temporarily dropping the constraints.
pg_dump exit=0

$ docker exec afrakala-lan-db ls -la /tmp/pre-rolerevoke.dump
-rw-r--r-- 1 root root 29720685 Aug 31 19:01 /tmp/pre-rolerevoke.dump

$ docker cp afrakala-lan-db:/tmp/pre-rolerevoke.dump "C:\Users\AfRa KaLa\Desktop\pre-rolerevoke.dump"
docker cp exit=0
```

| مورد | مقدار |
|---|---|
| نام فایل | `C:\Users\AfRa KaLa\Desktop\pre-rolerevoke.dump` |
| حجم | **۲۹٬۷۲۰٬۶۸۵ بایت** (~۲۹.۷ مگابایت) |
| قالب | `pg_dump -Fc` از پایگاه‌دادهٔ `postgres` |

حجم در محدودهٔ ~۳۰ مگابایت مورد انتظار است، نه چند کیلوبایت. شرط توقف Stage 0 فعال
نشد.

هشدار circular foreign key همان هشدار همیشگی این پایگاه‌داده است؛ یعنی بازیابی این
دامپ به `--disable-triggers` نیاز دارد. مسیر برگشت این تغییر بازیابی نیست، یک `GRANT`
است.

---

## ۳. ردیف امتیاز — قبل و بعد

کوئری یکسان قبل و بعد اجرا شد:

```sql
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       has_function_privilege('anon',p.oid,'EXECUTE')         AS anon_can,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS auth_can,
       has_function_privilege('service_role',p.oid,'EXECUTE')  AS svc_can
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='revoke_user_role_txt';
```

### BEFORE

```
       proname        |             args              | anon_can | auth_can | svc_can
----------------------+-------------------------------+----------+----------+---------
 revoke_user_role_txt | _target_user uuid, _role text | t        | t        | t
(1 row)
```

### AFTER

```
       proname        |             args              | anon_can | auth_can | svc_can
----------------------+-------------------------------+----------+----------+---------
 revoke_user_role_txt | _target_user uuid, _role text | f        | t        | t
(1 row)
```

### تفاوت

| ستون | قبل | بعد |
|---|---|---|
| `anon_can` | `t` | **`f`** |
| `auth_can` | `t` | `t` — دست‌نخورده |
| `svc_can` | `t` | `t` — دست‌نخورده |

**بررسی overload:** دقیقاً یک ردیف، قبل و بعد. شمارش مستقل هم تأیید شد:

```sql
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='revoke_user_role_txt';
-- 1
```

تابع overload ندارد، پس `REVOKE` با یک امضا کل سطح تماس را پوشش داد و شرط توقف
Stage 1 فعال نشد.

### ACL خام — گویاتر از ستون‌های بولی

**BEFORE:**

```
       proname        |             proacl              | public_can
----------------------+---------------------------------+------------
 revoke_user_role_txt | =X/supabase_admin              +| t
                      | postgres=X/supabase_admin      +|
                      | supabase_admin=X/supabase_admin+|
                      | anon=X/supabase_admin          +|
                      | authenticated=X/supabase_admin +|
                      | service_role=X/supabase_admin   |
```

**AFTER:**

```
       proname        |             proacl              | public_can
----------------------+---------------------------------+------------
 revoke_user_role_txt | postgres=X/supabase_admin      +| f
                      | supabase_admin=X/supabase_admin+|
                      | authenticated=X/supabase_admin +|
                      | service_role=X/supabase_admin   |
```

دو ورودی حذف شدند و فقط همان دو: `=X/supabase_admin` (که ورودی PUBLIC است — نقش خالی
قبل از `=`) و `anon=X/supabase_admin`. سه ورودی دیگر (`postgres`، `supabase_admin`،
`authenticated`، `service_role`) بی‌تغییر ماندند. `public_can` از `t` به `f` رفت.

---

## ۴. md5 فایل SQL در دو طرف

| محل | md5 | حجم |
|---|---|---|
| `C:\afrakala\docs\audit\hotfix-20260831-revoke-role-txt.sql` | `c70567e89d9dac140897fd914aff380f` | 1246 بایت |
| `afrakala-lan-db:/tmp/hotfix-role.sql` | `c70567e89d9dac140897fd914aff380f` | 1246 بایت |

یکسان. بررسی جداگانه تأیید کرد فایل کاملاً ASCII است و هیچ بایت غیر‑ASCII ندارد.

انتقال با `MSYS_NO_PATHCONV=1` انجام شد، چون Git Bash در غیر این صورت مسیر داخل
کانتینر `/tmp/...` را به یک مسیر ویندوزی تبدیل می‌کند — همان مسئله‌ای که در هات‌فیکس
قبلی هم دیده شد. مسئلهٔ ابزار است، نه پایگاه‌داده، و اثری روی محتوای اعمال‌شده ندارد.

---

## ۵. خروجی کامل psql و کد خروج

```
$ docker exec afrakala-lan-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/hotfix-role.sql

BEGIN
REVOKE
REVOKE
psql:/tmp/hotfix-role.sql:28: NOTICE:  hotfix: anon can no longer execute revoke_user_role_txt; authenticated still can
DO
COMMIT

PSQL_EXIT_CODE=0
```

شرط خروج Stage 2 برقرار است: خط `NOTICE` ظاهر شد و `psql` با کد صفر خارج شد.

طبق دستور `--single-transaction` اضافه نشد و به همین دلیل — برخلاف هات‌فیکس TRUNCATE
امروز صبح — هیچ `WARNING` ای دربارهٔ تراکنش تودرتو در خروجی نیست. فایل خودش
`BEGIN`/`COMMIT` دارد و دقیقاً یک بار commit شد.

---

## ۶. اخلال عمدی — اثبات اینکه assertion واقعی است

کل تست داخل یک تراکنش انجام شد که با `ROLLBACK` بسته شد. چیزی commit نشد.

**آنچه بازگردانده شد:**
`GRANT EXECUTE ON FUNCTION public.revoke_user_role_txt(_target_user uuid, _role text) TO anon;`

```
BEGIN
GRANT
   phase   | anon_restored
-----------+---------------
 INSIDE TX | t
(1 row)

ERROR:  hotfix: anon still executes revoke_user_role_txt
CONTEXT:  PL/pgSQL function inline_code_block line 10 at RAISE
ROLLBACK
PSQL_EXIT_CODE=0
```

سه چیز ثابت شد:

1. `GRANT` واقعاً اثر کرد — داخل تراکنش `anon_restored = t` شد.
2. همان assertion که در هات‌فیکس هست **خطا داد** با پیام
   `hotfix: anon still executes revoke_user_role_txt`. خط
   `assertion PASSED - this must NOT appear during the disturbance test` که عمداً
   در نسخهٔ تست گذاشته شده بود، ظاهر **نشد**. یعنی اگر تغییر با چنین وضعی اجرا می‌شد،
   تراکنش عقب می‌رفت و هیچ چیز commit نمی‌شد.
3. `ROLLBACK` اثر کرد. بررسی پس از تراکنش:

```
       proname        | anon_can | auth_can | svc_can | public_can
----------------------+----------+----------+---------+------------
 revoke_user_role_txt | f        | t        | t        | f
```

`GRANT` بازگردانده‌شده باقی نماند.

**۳.۳ — حملهٔ واقعی اجرا نشد**، حتی داخل تراکنش. طبق دستورالعمل، کوئری امتیاز شاهد
کافی است.

---

## سلامت سیستم پس از تغییر

هیچ کانتینری restart نشد و لازم هم نبود: PostgREST با نقش `authenticator` وصل می‌شود
و `SET ROLE` می‌زند، پس بررسی امتیاز در لحظهٔ اجرا توسط خود پایگاه‌داده انجام می‌شود.

```
afrakala-lan-web    | Up 9 days (healthy)
afrakala-lan-auth   | Up 9 days
afrakala-lan-kong   | Up 9 days (healthy)
afrakala-lan-db     | Up 9 days (healthy)
afrakala-lan-storage| Up 9 days
afrakala-lan-rest   | Up 9 days
afrakala-lan-meta   | Up 9 days (healthy)

healthz -> HTTP 200
```

هیچ داده‌ای لمس نشد. شمارش ردیف جدول‌هایی که این تابع می‌نویسد:

```
     t      | count
------------+-------
 user_roles |    42
 profiles   |    36
```

همان اعداد امروز صبح. وضعیت گیت هم دست‌نخورده: شاخه `main`، کامیت `bfcc723a`، صفر
فایل tracked تغییریافته.

---

## ۷. تأیید نشده

1. **بستن حفره از انتها به انتها آزمایش نشد.** طبق بند ۳.۳ حملهٔ واقعی اجرا نشد، پس
   بسته شدن مسیر در سطح **امتیاز** اثبات شده، نه با یک درخواست واقعی از پورت ۸۰۰۰.
   **چه چیزی قطعی‌ترش می‌کند:** یک `POST /rest/v1/rpc/revoke_user_role_txt` با کلید
   anon و بدون توکن کاربر، که باید `42501` بگیرد — ولی آن کار در صورت شکستِ فرضِ ما
   نقش یک ادمین واقعی را می‌گرفت و صریحاً ممنوع بود.
2. **کش schema ی PostgREST بررسی نشد.** بستن امتیاز بلافاصله در پایگاه‌داده اعمال
   می‌شود، ولی اینکه آیا PostgREST هنوز این RPC را در خروجی OpenAPI خودش *تبلیغ*
   می‌کند یا نه بررسی نشد. این روی امنیت اثری ندارد (فراخوانی‌اش رد می‌شود) ولی روی
   ظاهر مستندات API اثر دارد.
3. **رفتار تابع برای کاربر احراز‌هویت‌شده آزمایش نشد** — نه فراخوانده شد و نه بدنه‌اش
   از نظر منطق مجوزدهی بازبینی شد.
4. **آن ۲۵ تابع دیگر migration 399 در این نشست دوباره بررسی نشدند.** بر پایهٔ گزارش
   round two پذیرفته شدند که از قبل بسته‌اند.
5. **قابلیت بازیابی دامپ آزمایش نشد.** هشدار circular FK نشان می‌دهد بازیابی به
   `--disable-triggers` نیاز دارد.

---

## ۸. حل‌نشده

این بخش خالی نیست، پس وضعیت گزارش **PARTIAL** است.

### ۸.۱ همین تابع هنوز برای هر کاربر احراز‌هویت‌شده باز است (OG-74)

`auth_can` عمداً `t` باقی ماند، چون مسیر واقعی برنامه به آن وابسته است. ولی روی این
پایگاه‌داده **۴۲ تخصیص نقش** وجود دارد و هیچ گارد داخلی در بدنهٔ تابع نیست که بررسی
کند فراخواننده حق گرفتن نقش از دیگری را دارد یا نه. یعنی یک کاربر با نقش `sales` یا
حتی `viewer` که وارد شده باشد، همچنان می‌تواند
`SELECT public.revoke_user_role_txt('<admin uuid>','admin')` را اجرا کند.

آنچه امروز بسته شد، فقط مسیر **احراز‌هویت‌نشده** است. بستن کامل نیازمند یک تغییر
رفتاری در بدنهٔ تابع است که صریحاً خارج از حدود این مأموریت بود.

### ۸.۲ حفرهٔ TRUNCATE روی ۲۰۵ جدول دیگر

مأموریت جداگانه. در این گزارش لمس نشد.

### ۸.۳ این اصلاح در هیچ migration ای ثبت نشده

مثل هات‌فیکس TRUNCATE امروز صبح، این `REVOKE` فقط روی پایگاه‌دادهٔ زنده اعمال شد.
migration 399 در این درخت نیست و ساختن migration جدید در حدود مجاز نبود. اگر
پایگاه‌داده روزی از روی فایل‌های migration بازساخته شود، `anon=X` و ورودی PUBLIC
برمی‌گردند.

---

## پیوست — فایل اعمال‌شده

`C:\afrakala\docs\audit\hotfix-20260831-revoke-role-txt.sql`
md5 `c70567e89d9dac140897fd914aff380f`، ۱۲۴۶ بایت، ASCII خالص.

## مسیر برگشت

یک دستور، نه بازیابی دامپ:

```sql
GRANT EXECUTE ON FUNCTION public.revoke_user_role_txt(_target_user uuid, _role text) TO anon;
```

از دامپ بازیابی نکنید.
