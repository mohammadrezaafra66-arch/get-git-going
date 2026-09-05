# گزارش هات‌فیکس امنیتی — حذف TRUNCATE از جدول‌های نقش

**تاریخ:** ۲۰۲۶-۰۸-۳۱ · **وضعیت نهایی: PARTIAL**

دلیل PARTIAL بودن: بند ۹ (حل‌نشده) خالی نیست. تغییرِ مجاز کامل و موفق اجرا شد و همهٔ
شرط‌های خروج Stage 1 تا Stage 3 با شواهدشان برقرارند، ولی دو مورد باز ماند که در بند ۹
آمده. طبق دستورالعمل، این «انجام‌شده با ملاحظات» نیست — PARTIAL است.

---

## ۱. هویت ماشین

```
$ hostname
DESKTOP-MT8J1VR
```

مطابق انتظار. این ماشین PRODUCTION است (`192.168.170.10`). کار ادامه یافت.
پایگاه‌داده در تمام دستورها صریحاً `-d postgres` بود.

---

## ۲. جدول امتیازها — قبل و بعد

دستور یکسان قبل و بعد اجرا شد:

```
SELECT c.relname, r.rolname,
       has_table_privilege(r.rolname,c.oid,'TRUNCATE') AS can_truncate,
       has_table_privilege(r.rolname,c.oid,'SELECT')   AS can_select,
       has_table_privilege(r.rolname,c.oid,'INSERT')   AS can_insert,
       has_table_privilege(r.rolname,c.oid,'UPDATE')   AS can_update,
       has_table_privilege(r.rolname,c.oid,'DELETE')   AS can_delete
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role'),('authenticator')) AS r(rolname)
 WHERE n.nspname='public'
   AND c.relname IN ('user_roles','role_permissions','profiles')
 ORDER BY 1,2;
```

### BEFORE (خام)

```
     relname      |    rolname    | can_truncate | can_select | can_insert | can_update | can_delete
------------------+---------------+--------------+------------+------------+------------+------------
 profiles         | anon          | t            | t          | t          | t          | t
 profiles         | authenticated | t            | t          | t          | t          | t
 profiles         | authenticator | f            | f          | f          | f          | f
 profiles         | service_role  | t            | t          | t          | t          | t
 role_permissions | anon          | t            | t          | t          | t          | t
 role_permissions | authenticated | t            | t          | t          | t          | t
 role_permissions | authenticator | f            | f          | f          | f          | f
 role_permissions | service_role  | t            | t          | t          | t          | t
 user_roles       | anon          | t            | t          | t          | t          | t
 user_roles       | authenticated | t            | t          | t          | t          | t
 user_roles       | authenticator | f            | f          | f          | f          | f
 user_roles       | service_role  | t            | t          | t          | t          | t
(12 rows)
```

### AFTER (خام)

```
     relname      |    rolname    | can_truncate | can_select | can_insert | can_update | can_delete
------------------+---------------+--------------+------------+------------+------------+------------
 profiles         | anon          | f            | t          | t          | t          | t
 profiles         | authenticated | f            | t          | t          | t          | t
 profiles         | authenticator | f            | f          | f          | f          | f
 profiles         | service_role  | t            | t          | t          | t          | t
 role_permissions | anon          | f            | t          | t          | t          | t
 role_permissions | authenticated | f            | t          | t          | t          | t
 role_permissions | authenticator | f            | f          | f          | f          | f
 role_permissions | service_role  | t            | t          | t          | t          | t
 user_roles       | anon          | f            | t          | t          | t          | t
 user_roles       | authenticated | f            | t          | t          | t          | t
 user_roles       | authenticator | f            | f          | f          | f          | f
 user_roles       | service_role  | t            | t          | t          | t          | t
(12 rows)
```

### تفاوت، سطر به سطر

| جدول | نقش | can_truncate قبل | can_truncate بعد | SELECT / INSERT / UPDATE / DELETE |
|---|---|---|---|---|
| profiles | anon | `t` | **`f`** | بدون تغییر (همه `t`) |
| profiles | authenticated | `t` | **`f`** | بدون تغییر (همه `t`) |
| role_permissions | anon | `t` | **`f`** | بدون تغییر (همه `t`) |
| role_permissions | authenticated | `t` | **`f`** | بدون تغییر (همه `t`) |
| user_roles | anon | `t` | **`f`** | بدون تغییر (همه `t`) |
| user_roles | authenticated | `t` | **`f`** | بدون تغییر (همه `t`) |
| هر سه | service_role | `t` | `t` | لمس نشد — عمدی |
| هر سه | authenticator | `f` | `f` | لمس نشد |

دقیقاً ۶ تغییر، همگی از `t` به `f` و فقط در ستون `can_truncate`. هیچ ستون دیگری و
هیچ نقش دیگری تکان نخورد.

---

## ۳. شمارش ردیف‌ها — قبل و بعد

```
SELECT 'user_roles' t, count(*) FROM public.user_roles
UNION ALL SELECT 'role_permissions', count(*) FROM public.role_permissions
UNION ALL SELECT 'profiles', count(*) FROM public.profiles;
```

| جدول | BEFORE | AFTER | نتیجه |
|---|---|---|---|
| user_roles | 42 | 42 | یکسان |
| role_permissions | 186 | 186 | یکسان |
| profiles | 36 | 36 | یکسان |

هیچ داده‌ای جابه‌جا نشد. شمارش‌ها پس از تست اخلال (بند ۶) دوباره گرفته شد و باز هم
همان ۴۲ / ۱۸۶ / ۳۶ بود.

---

## ۴. md5 فایل SQL در دو طرف

| محل | md5 | حجم |
|---|---|---|
| `C:\afrakala\docs\audit\hotfix-20260831-revoke-truncate.sql` | `a0d1389bf3c8a3e529c5d26f67aaba0c` | 2168 بایت |
| `afrakala-lan-db:/tmp/hotfix.sql` | `a0d1389bf3c8a3e529c5d26f67aaba0c` | 2168 بایت |

یکسان. با یک بررسی جداگانه تأیید شد که فایل کاملاً ASCII است و هیچ بایت غیر‑ASCII
ندارد، پس خطر تخریب متن فارسی در مسیر PowerShell اصلاً موضوعیت نداشت.

**یک نکتهٔ فنی حین اجرا:** اولین `docker cp` شکست خورد، چون Git Bash مسیر داخل کانتینر
`/tmp/hotfix.sql` را به مسیر ویندوزی `C:/Users/AFRAKA~1/AppData/Local/Temp/hotfix.sql`
تبدیل کرد و `md5sum` پاسخ داد `No such file or directory`. با `MSYS_NO_PATHCONV=1`
تکرار شد و درست انجام گرفت. این یک مسئلهٔ ابزار بود، نه پایگاه‌داده، و هیچ اثری روی
محتوای اعمال‌شده نداشت.

---

## ۵. خروجی کامل psql و کد خروج

```
$ docker exec afrakala-lan-db psql -U postgres -d postgres \
      --single-transaction -v ON_ERROR_STOP=1 -f /tmp/hotfix.sql

BEGIN
psql:/tmp/hotfix.sql:1: WARNING:  there is already a transaction in progress
REVOKE
REVOKE
REVOKE
REVOKE
REVOKE
REVOKE
psql:/tmp/hotfix.sql:49: NOTICE:  hotfix: TRUNCATE removed in all 6 cases; SELECT intact in all 6
DO
COMMIT
WARNING:  there is no transaction in progress

PSQL_EXIT_CODE=0
```

شرط خروج Stage 2 برقرار است: خط `NOTICE` ظاهر شد و `psql` با کد صفر خارج شد.

**دربارهٔ دو WARNING:** هر دو مورد انتظار و بی‌ضررند و از ترکیب `--single-transaction`
با `BEGIN;`/`COMMIT;` صریح داخل فایل می‌آیند. psql خودش یک تراکنش باز می‌کند، پس
`BEGIN` داخل فایل هشدار «already in progress» می‌دهد؛ و بعد از اینکه `COMMIT` فایل آن
تراکنش را بست، commit ضمنی psql هشدار «no transaction in progress» می‌دهد. کار دقیقاً
یک بار commit شد — که مقایسهٔ before/after در بند ۲ هم تأییدش می‌کند.

---

## ۶. اخلال عمدی — اثبات اینکه assertion واقعی است

کل تست داخل یک تراکنش انجام شد که با `ROLLBACK` بسته شد. چیزی commit نشد.

**آنچه بازگردانده شد:** `GRANT TRUNCATE ON TABLE public.user_roles TO anon;`

```
BEGIN
GRANT
   phase   | anon_truncate_restored
-----------+------------------------
 INSIDE TX | t
(1 row)

ERROR:  hotfix: TRUNCATE still held in 1 cases
CONTEXT:  PL/pgSQL function inline_code_block line 13 at RAISE
ROLLBACK
PSQL_EXIT_CODE=0
```

سه چیز ثابت شد:

1. GRANT واقعاً اثر کرد — داخل تراکنش `anon_truncate_restored = t` شد.
2. همان assertion که در هات‌فیکس هست **خطا داد**: `TRUNCATE still held in 1 cases`.
   یعنی اگر تغییر با چنین وضعی اجرا می‌شد، تراکنش عقب می‌رفت و هیچ چیز commit نمی‌شد.
3. `ROLLBACK` اثر کرد. بررسی پس از تراکنش:

```
     relname      |    rolname    | can_truncate | can_select
------------------+---------------+--------------+------------
 profiles         | anon          | f            | t
 profiles         | authenticated | f            | t
 role_permissions | anon          | f            | t
 role_permissions | authenticated | f            | t
 user_roles       | anon          | f            | t
 user_roles       | authenticated | f            | t
(6 rows)
```

GRANT بازگردانده‌شده باقی نماند. `can_truncate` همچنان `f` است.

---

## ۷. وضعیت HTTP — قبل و بعد

| آدرس | BEFORE | AFTER |
|---|---|---|
| `http://192.168.170.10:3000/login` | 200 | 200 |
| `http://192.168.170.10:3000/dashboard` | 200 | 200 |
| `http://192.168.170.10:3000/api/healthz` | — | 200 |

بدون تغییر. هیچ کانتینری restart نشد و لازم هم نبود: PostgREST با نقش `authenticator`
وصل می‌شود و `SET ROLE` می‌زند، پس revoke بلافاصله در سطح پایگاه‌داده اعمال شد.

وضعیت گیت هم دست‌نخورده ماند: شاخه `main`، کامیت `bfcc723a`، صفر فایل tracked
تغییریافته.

---

## ۸. تأیید نشده

مواردی که نتوانستم اثبات کنم و نباید به‌عنوان اثبات‌شده خوانده شوند:

1. **بهره‌برداری واقعی از حفره تست نشد.** آسیب‌پذیری از روی امتیازهای کاتالوگ و این
   واقعیت که RLS شامل `TRUNCATE` نمی‌شود استنتاج شده — استدلال محکمی است، ولی هیچ
   `TRUNCATE` واقعی از مسیر Kong اجرا نشد، چون آن کار داده را نابود می‌کرد و خارج از
   حدود مأموریت بود.
2. **جریان ثبت‌نام از نظر عملکردی آزمایش نشد.** فقط در سطح امتیاز تأیید شد که `INSERT`
   برای `anon` روی `profiles` هنوز `t` است. اینکه فرم ثبت‌نام واقعاً کار می‌کند آزمایش
   نشد، چون دستورالعمل ساختن داده و ورود با کاربر واقعی را منع کرده بود.
3. **کد وضعیت ۲۰۰ به‌معنای درست رندر شدن صفحه نیست.** `/login` و `/dashboard` فقط از
   نظر HTTP status سنجیده شدند؛ صفحه‌ای که خطا نشان دهد هم می‌تواند ۲۰۰ برگرداند.
4. **قابلیت بازیابی فایل دامپ آزمایش نشد** (`pre-revoke-20260831.dump`). طبق
   دستورالعمل به آن تکیه نشد؛ مسیر برگشت این تغییر یک `GRANT` است، نه restore.
5. **هیچ‌کدام از ۵۲۳ migration اجرا یا بازبینی نشد.**

---

## ۹. حل‌نشده

این بخش خالی نیست، پس وضعیت گزارش **PARTIAL** است.

### ۹.۱ همین حفره روی حدود ۲۰۰ جدول دیگر باز است

این هات‌فیکس ۳ جدول را بست. بررسی کاتالوگ (فقط SELECT) نشان می‌دهد پس از این تغییر:

```
    rolname    | tables_with_truncate
---------------+----------------------
 anon          |                  197
 authenticated |                  208
```

از مجموع **۲۲۱** جدول `public`. نمونه‌هایی از جدول‌های کسب‌وکار که `anon` هنوز
می‌تواند `TRUNCATE` کند:

```
 audit_logs
 payment_receipts
 persons
 product_computed_prices
 products
 settlement_types
```

(`sales_quotes` در همین نمونه استثنا بود و امتیاز TRUNCATE برای `anon` ندارد.)

بنابراین سناریوی «قفل شدن همه از سیستم» بسته شد، ولی سناریوی «نابودی داده» باز است.
یک فراخوان ناشناس روی پورت ۸۰۰۰ همچنان می‌تواند `persons` یا `audit_logs` را در یک
دستور خالی کند. این خارج از حدود مجاز این مأموریت بود و **عمداً لمس نشد**.

### ۹.۲ این اصلاح در هیچ migration ای ثبت نشده، پس پایدار نیست

جست‌وجو در `supabase/migrations/` نشان می‌دهد تنها فایلی که `REVOKE TRUNCATE` دارد این
است:

```
20260803193000_268_capital_ceiling_not_overridable.sql
  line 412: REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.daily_capital_inputs   FROM authenticated;
  line 413: REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.daily_capital_settings FROM authenticated;
```

یعنی سابقهٔ این الگو وجود دارد، ولی هرگز شامل سه جدول نقش نشده. تغییر امروز فقط روی
پایگاه‌دادهٔ زنده اعمال شد. **اگر روزی پایگاه‌داده از روی migration ها دوباره ساخته
شود، حفره برمی‌گردد.** ساختن migration در این مأموریت صریحاً ممنوع بود، پس انجام نشد.

### ۹.۳ ریشهٔ مشکل بررسی نشد

اینکه چرا `anon` و `authenticated` از ابتدا `arwdDxt` کامل روی این جدول‌ها گرفته‌اند —
یعنی کدام migration این GRANT را زده — دنبال نشد.

---

## پیوست — فایل اعمال‌شده

`C:\afrakala\docs\audit\hotfix-20260831-revoke-truncate.sql`
md5 `a0d1389bf3c8a3e529c5d26f67aaba0c`، ۲۱۶۸ بایت، ASCII خالص.

## مسیر برگشت

اگر لازم شد، هر خط جداگانه:

```
GRANT TRUNCATE ON TABLE public.user_roles       TO anon;
GRANT TRUNCATE ON TABLE public.user_roles       TO authenticated;
GRANT TRUNCATE ON TABLE public.role_permissions TO anon;
GRANT TRUNCATE ON TABLE public.role_permissions TO authenticated;
GRANT TRUNCATE ON TABLE public.profiles         TO anon;
GRANT TRUNCATE ON TABLE public.profiles         TO authenticated;
```

از دامپ بازیابی نکنید.
