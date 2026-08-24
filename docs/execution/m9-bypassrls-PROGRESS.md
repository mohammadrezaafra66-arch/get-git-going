# M9 — `BYPASSRLS` روی `anon` — OG-34 — PROGRESS

## HANDOFF STATE

```
Mission:              M9 — BYPASSRLS · OG-34, alone
Status:               complete — review round 1 answered, gate repaired by 385
Branch:               feature/m9-bypassrls
Base:                 staging @ 274bfa3e  (verified: git rev-parse origin/staging)
Part 1:               WITHDRAWN — no files were ever lost; see deferred.md
Part 2:               DONE — 384 applied+committed, 385 repairs its gate
Migrations:           384 (assertion) + 385 (repair of 384's gate)
Assertion gates:      1, repaired once in 385 — not a second gate
Review rounds:        1 of 2 used
Catalogue baseline:   a51ee08e55ff48453d7a2925f1c5d098 / pg_class 1105 / pg_proc 841
```

---

## حادثه‌ای که خودم ساختم، در همان فاز ۰ — ثبت پیش از هر چیز دیگر

**من `anon` را روی پایگاه‌دادهٔ تست زنده `BYPASSRLS` کردم، و برای حدود یک دقیقه
آن‌طور ماند.**

اسکریپت probe فاز ۰.۲ را با `psql --single-transaction -f` اجرا کردم، با این
تصور که آن پرچم کار `BEGIN … ROLLBACK` را می‌کند. **نمی‌کند.**
`--single-transaction` فایل را در `BEGIN … COMMIT` می‌پیچد، نه `ROLLBACK`. فایل
هم `ALTER ROLE anon BYPASSRLS;` داشت و هیچ `ROLLBACK`ی نداشت، چون قاعدهٔ M7 این
برنامه می‌گوید فایل نباید دستور تراکنش داشته باشد و فراخوان صاحب تراکنش است —
و من فراخوان را غلط انتخاب کردم.

بررسی بلافاصله بعد از probe نشانش داد (`anon rolbypassrls now: true`) و فوراً
برگرداندم:

```
ALTER ROLE anon NOBYPASSRLS;
  anon rolbypassrls: false
```

و از سه زاویهٔ مستقل تأیید شد، نه فقط با خواندن صفت:

```
HTTP:  customers 200 rows=0   persons 200 rows=0   journal_entries 200 rows=0
SQL:   customers=0  persons=0  journal_entries=0        (SET LOCAL ROLE anon)
pg_roles: bypassrls=true فقط روی postgres, service_role, supabase_admin,
          supabase_read_only_user — دقیقاً همان چهارتای خط پایهٔ ۰.۱
```

**دامنهٔ واقعی:** سرور تست، شبکهٔ محلی، حدود یک دقیقه. هیچ درخواست بیرونی در آن
بازه ثبت نشده و `pg_stat_statements` هم ترافیک تازه‌ای از `anon` روی آن جدول‌ها
نشان نمی‌دهد. ولی این کاهش شدت نیست — **من دقیقاً همان افشایی را که این مأموریت
برای مستندکردنش وجود دارد، برای یک دقیقه واقعی کردم.**

**درسی که در همین سند می‌ماند:** `--single-transaction` روش اثبات نیست. اثبات
یعنی `BEGIN` و `ROLLBACK` صریح **داخل** فایل probe — که برای فایل probe مجاز
است و برای فایل `*-down.sql` ممنوع. این دو قاعده را با هم قاطی کردم.

---

## فاز ۰ — سنجش. (به‌جز حادثهٔ بالا، هیچ تغییری.)

### ۰.۱ — صفت، روی هر ۲۸ نقش

```
role                        BYPASSRLS SUPER CANLOGIN INHERIT
anon                        false     false false    true
authenticated               false     false false    true
authenticator               false     false true     false
dashboard_user              false     false true     true
pg_*  (13 built-in roles)   false     false false    true
pgbouncer                   false     false true     true
pgsodium_key{holder,iduser,maker}  false false false true
postgres                    TRUE      false true     true
products_api_readonly       false     false false    false
service_role                TRUE      false false    true
supabase_admin              TRUE      TRUE  true     true
supabase_auth_admin         false     false true     false
supabase_read_only_user     TRUE      false true     true
supabase_replication_admin  false     false true     true
supabase_storage_admin      false     false true     false
```

**نقش‌هایی که امروز RLS را دور می‌زنند: چهار تا** — `postgres`, `service_role`,
`supabase_admin`, `supabase_read_only_user`.

**`anon` و `authenticated` هر دو `false`اند. یعنی چیزی برای revoke وجود ندارد.**
این را صریح می‌نویسم به‌جای اینکه تغییری بتراشم تا مهاجرت را توجیه کنم.

### ۰.۱ب — دو فرض سند مأموریت که سنجش **رد** کرد

**۱. «انتظار داشته باش `rolsuper = true` روی `postgres` و `supabase_admin`».**
غلط است. فقط **`supabase_admin`** superuser است. `postgres` در این نصب
`rolsuper = false` دارد و `rolbypassrls = true` — یعنی برای `postgres` این صفت
**تهی نیست، معنادار است**. اگر آن فرض را می‌پذیرفتم، دروازه‌ای می‌ساختم که
`postgres` را «تهی» علامت می‌زد و در واقع تنها نقش غیر-superuserِ لاگین‌پذیری را
که RLS را دور می‌زند از دید پنهان می‌کرد.

**۲. «نقشی که از یک نقش `BYPASSRLS` ارث می‌برد، رفتارش را می‌گیرد».** غلط است.
`BYPASSRLS` یک **صفت** نقش است نه یک امتیاز، و صفت‌ها از راه عضویت به ارث
نمی‌رسند. سنجیده داخل `BEGIN … ROLLBACK`:

```
CREATE ROLE _m9_carrier BYPASSRLS;   CREATE ROLE _m9_heir INHERIT;
GRANT _m9_carrier TO _m9_heir;
  heir rolbypassrls attribute : false
  heir sees customers         : 0
```

راه واقعی رسیدن به صفت `SET ROLE` است، نه ارث. و این دقیقاً همان کاری است که
PostgREST می‌کند: `authenticator` عضو `anon`, `authenticated`, `service_role` و
`products_api_readonly` است و بر اساس JWT به یکی‌شان `SET LOCAL ROLE` می‌زند.
پس **هرکس بتواند JWTی با `role: service_role` بسازد، RLS را کامل دور می‌زند** —
که همان کلید service-role است و راز سمت‌سرور، نه یافتهٔ تازه، ولی ارزش ثبت دارد.

### ۰.۲ — افشا، سنجیده

`anon_before` وضعیت امروز است؛ `anon_AFTER` وضعیتی که یک `ALTER ROLE` می‌سازد.

| جدول | anon امروز | anon با BYPASSRLS | چشم مالک |
|---|---|---|---|
| `audit_logs` | ۰ | **۴۳٬۵۱۶** | ۴۳٬۵۱۶ |
| `notification_queue` | ۰ | **۱٬۲۳۳** | ۱٬۲۳۳ |
| `persons` | ۰ | **۸۴** | ۸۴ |
| `profiles` | ۰ | **۴۱** | ۴۱ |
| `user_roles` | ۰ | **۳۶** | ۳۶ |
| `customers` | ۰ | **۲۸** | ۲۸ |
| `shop_settings` | ۰ | ۲۶ | ۲۶ |
| `suppliers` | ۰ | ۱۵ | ۱۵ |
| `journal_lines` | ۰ | ۱۴ | ۱۴ |
| `journal_entries` | ۰ | ۷ | ۷ |
| `bank_accounts` | ۰ | ۱ | ۱ |
| `payment_vouchers` | ۰ | ۱ | ۱ |

**در هر دوازده مورد، `anon` با آن صفت دقیقاً همان چیزی را می‌بیند که مالک شیء
می‌بیند.** جدول‌ها از روی شواهد `pg_stat_statements` انتخاب شدند — یعنی
جدول‌هایی که `anon` **واقعاً** لمسشان کرده — نه از روی اینکه اسمشان حساس به‌نظر
می‌رسد.

و `audit_logs` با ۴۳٬۵۱۶ ردیف بدترین است: دفتر ممیزی همان سیستم.

### ۰.۳ — `pg_stat_statements`

`anon` تا امروز ۳۴ شیء متمایز در `public` را لمس کرده. ترافیک غالبش
`shop_settings` (۲۲٬۹۸۵ فراخوان — `/api/healthz`) است. `authenticated` ترافیک
واقعی محصول دارد: `notification_queue` (۲۰٬۰۵۶)، `profiles`, `user_roles`,
`role_permissions`, `products`, `currency_rates`.

### ۰.۴ — آیا اصلاً قابل پیشگیری است؟ **خیر. فقط تشخیص.**

این را سنجیدم، نه فرض کردم — چون OG-31 در M3 دو بار غلط ثبت شد به‌خاطر همین که
درمانی پیش از سنجش فرض شده بود.

```
CREATE EVENT TRIGGER _m9_et ON ddl_command_start WHEN TAG IN ('ALTER ROLE') …
ERROR:  event triggers are not supported for ALTER ROLE
```

PostgreSQL اجازه‌اش را **نمی‌دهد**. نقش‌ها شیء سطح‌کلاستر و مشترک بین
پایگاه‌داده‌ها هستند و event triggerها per-database. پس هیچ سازوکار درون-پایگاهی
نمی‌تواند جلوی `ALTER ROLE anon BYPASSRLS` را بگیرد.

چه کسی می‌تواند تنظیمش کند: فقط superuser. در این نصب فقط **`supabase_admin`**.

**پس تحویل این مأموریت یک ادعاست که بلند شکست می‌خورد، نه پیشگیری‌ای که وجود
ندارد.** و یک ادعا فقط وقتی اجرا شود کار می‌کند — که Owner-Gate بند ۵ است.

### ۰.۴د — `supabase_read_only_user`

```
canlogin=true  bypassrls=true  valid_until=<none>  member of pg_read_all_data
```

نقشی زیرساختی که Supabase مدیریتش می‌کند و **برای خواندن همه‌چیز طراحی شده**.
لمسش نکردم — ولی در فهرست «دست نزن» سند مأموریت نبود و صفت را دارد، پس
Owner-Gate می‌شود نه تصمیم من.

### ۰.۵ — خط پایهٔ R1–R10

```
R2  /api/public/products      200, 199 محصول, صفر قیمت غیرصفر
R3  public sale-list          404   (صفر لیست منتشرشده)
R4  هشت view نگهبان           ۸ از ۸ رد
R5  view/sequence تازه        anon هیچ امتیازی نمی‌گیرد
R6  pg_default_acl            r=false  S=false  f=true
R7  get_recent_purchase_label 401  (M3 برنگشته)
R9  digest a51ee08e55ff48453d7a2925f1c5d098  pg_class 1105  pg_proc 841
R10 git status                صفر ورودی
healthz                       ok=true  db=up
```

---

## اصلاح‌های ثبتی پس از بازبینی مستقل — ۲۰۲۶-۰۸-۲۴

بازبین مستقل حکم **CHANGE** داد. شش چیز در همین سند غلط بود یا اثبات‌ناپذیر. هرکدام سر جای
خودش با خط‌خوردگی می‌ماند، نه اینکه پاک شود.

### ۱. «قابل پیشگیری نیست، فقط تشخیص» — ~~درست~~ **بیش از حد کلی بود**

بند ۰.۴ نوشته بود هیچ سازوکار درون‌پایگاهی نمی‌تواند جلوی `ALTER ROLE anon BYPASSRLS` را
بگیرد. من فقط **یک** مسیر را سنجیده بودم (event trigger) و از آن به کل تعمیم داده بودم.
همان شکل خطایی که OG-31 را در M3 دو بار غلط ثبت کرد.

`supautils` روی این سرور بار شده و فهرستی از نقش‌های رزروشده دارد. سنجیده، به‌عنوان نقش
**غیر-superuser** `postgres`:

```
ALTER ROLE anon BYPASSRLS                  -> 42501 "anon" is a reserved role,
                                                    only superusers can modify it
ALTER ROLE authenticated BYPASSRLS         -> BLOCKED
ALTER ROLE authenticator BYPASSRLS         -> BLOCKED
ALTER ROLE products_api_readonly BYPASSRLS -> SUCCEEDED
CREATE ROLE _m9r_new BYPASSRLS             -> SUCCEEDED
```

و به‌عنوان superuser `supabase_admin`: `ALTER ROLE anon BYPASSRLS` -> SUCCEEDED.

پس گزارهٔ درست باریک‌تر از حرف من است **و باریک‌تر از حرف بازبین**: سه نقش از چهار نقش
درخواست‌پذیر واقعاً محافظت می‌شوند، ولی `products_api_readonly` در فهرست رزرو نیست، ساختن
نقش تازهٔ `BYPASSRLS` برای هیچ‌کس بسته نیست، و superuser اصلاً محدود نمی‌شود. این را بازبین
ندیده بود. ادعا هنوز لازم است — ولی به‌عنوان کنترلِ دقیقاً همان مسیرهایی که supautils باز
می‌گذارد، نه به‌عنوان «تنها کنترل موجود».

آنچه از بند ۰.۴ سرجایش می‌ماند: event trigger واقعاً روی `ALTER ROLE` نمی‌نشیند، و
`ON login` روی PostgreSQL 15 وجود ندارد.

### ۲. ~~«`pg_stat_statements` ترافیک تازه‌ای از anon نشان نمی‌دهد»~~ — **پس گرفته می‌شود**

این ادعا در ثبت حادثهٔ خودساخته آمده بود، به‌عنوان شاهدِ تبرئه‌کننده برای آن یک دقیقه.
با ابزار این سرور اثبات‌پذیر نیست:

```
pg_stat_statements extversion = 1.10
has stats_since column        = false
```

`stats_since` از نسخهٔ ۱.۱۱ (PostgreSQL 16) آمده. روی ۱.۱۰ شمارنده‌ها تجمعی‌اند و هیچ
برچسب زمانی ندارند، پس یک پنجرهٔ یک‌دقیقه‌ای بدون snapshot قبل/بعد جدا نمی‌شود — و من
چنین snapshotی نگرفته بودم. گزارهٔ درست: **دانستنی نیست.** این حادثه را سبک‌تر نمی‌کند؛
فقط شاهدی را که نداشتم پس می‌گیرد.

و چیزی که آن ثبت نگفته بود و باید می‌گفت: `--single-transaction` **کل فایل** را commit
می‌کند، پس هرچه دیگری در آن فایل probe بود هم commit شد. بررسی شد: هیچ باقی‌مانده‌ای نیست
— نه نقش، نه رابطه، نه تابعی با الگوی `%m9%` — و digest کاتالوگ بایت‌به‌بایت با خط پایهٔ
برنامه یکی است. ولی این را باید خود آن ثبت می‌گفت، نه بازبین.

### ۳. ~~«۱۳ نقش داخلی `pg_*`»~~ → **۱۲**

```
pg_* role count = 12    total roles = 28
```

با ۱۳، جدول بند ۰.۱ روی‌هم ۲۹ نقش می‌شمرد و با عنوان خودش («هر ۲۸ نقش») می‌جنگید.

### ۴. بند ۰.۵ عنوانش «خط پایهٔ R1–R10» بود ولی **هشت سطر** دارد

R1 و R8 خط پایه ندارند و این را ننوشته بودم. R8 حالا سنجیده شد: `npx tsc --noEmit` =
**۷۰**، دقیقاً روی خط پایهٔ برنامه. R1 (سه شاخهٔ ویزارد تا صفحهٔ مرور، بدون submit)
**اجرا نشد** و به‌عنوان اجرانشده ثبت می‌شود، نه سبز — سه ورودی ویزارد
(`/sales/quotes/new`، `/purchases/create`، `/pricing/sale-lists/new`) هر سه ۲۰۰ می‌دهند
ولی این فقط رسیدن به route است. این مأموریت صفر فایل `src/` و صفر شیء schema عوض کرد.

### ۵. جملهٔ `FORCE ROW LEVEL SECURITY` گمراه‌کننده بود

بخش «چرا یک ادعا» نوشته بود «و هیچ‌کدامشان `FORCE ROW LEVEL SECURITY` ندارند». عدد درست
است — از ۲۰۲ جدول خواندنی برای `anon`، صفر تا FORCE دارند — ولی جمله طوری خوانده می‌شود
که انگار FORCE اگر بود کمک می‌کرد. **نمی‌کرد.** سنجیده:

```
جدول با FORCE RLS و صفر policy، anon با BYPASSRLS  ->  ۳ ردیف دید
```

`BYPASSRLS` بر `FORCE` مقدم است. آن جمله فقط توصیف است، نه یک کاهش‌دهندهٔ ازدست‌رفته.

### ۶. دروازهٔ ۳۸۴ دو جای واقعی سوراخ داشت — مهاجرت ۳۸۵ تعمیرش می‌کند

هر دو را خودم بازتولید کردم، نه از روی گزارش:

```
تعویض superuser (dashboard_user تنها superuser، supabase_admin دیگر نیست)   -> ۳۸۴ پاس
دو-پرشی  anon -> _m9m -> service_role،  anon واقعاً SET ROLE می‌تواند        -> ۳۸۴ پاس
```

اولی دقیقاً همان خطایی است که خودِ فایل ۳۸۴ دو کامنت بالاتر تشخیص داده بود: «شمارش نمی‌تواند
تعویض را ببیند». بار اول که تعویض را امتحان کردم گرفته شد، ولی به‌خاطر ترتیب دستورهای خودم —
`ALTER ROLE supabase_admin NOSUPERUSER` امتیاز superuser نشستِ در حال اجرا را همان‌جا
می‌گیرد و دستور بعدی را می‌بندد. با ترتیب درست (اول ترفیع، بعد تنزل) سوراخ باز است.

**و یک سوراخ سوم را در پیش‌نویس تعمیر خودم پیدا کردم**، از همان خانوادهٔ خطای
هویت-در-برابر-اثر که پنج دروازهٔ قبلی این برنامه را شکست: `pg_has_role(...,'USAGE')` **ارث**
را می‌سنجد، نه `SET ROLE` را. و `BYPASSRLS` ارث نمی‌رسد.

```
GRANT supabase_read_only_user TO products_api_readonly;
  pg_has_role(...,'USAGE')  -> false      پیش‌نویس ۳۸۵: پاس
  pg_has_role(...,'MEMBER') -> true       واقعیت: می‌تواند SET ROLE بزند
```

`products_api_readonly` و `authenticator` هر دو `NOINHERIT`اند، یعنی یک بررسی `USAGE` دقیقاً
نسبت به آن دو نقشی کور است که بیش از همه احتمال دارد چیزی به آنها گرنت شود. مورد دو-پرشی
`anon` فقط از این جهت گرفته شد که `anon` اتفاقاً `INHERIT` است.

مهاجرت ۳۸۵ چک‌های ۴ و ۵ مهاجرت ۳۸۴ را **بازنشسته** می‌کند و جایشان می‌گذارد: مجموعهٔ
superuserها با **نام**؛ دسترسی `SET ROLE` **گذرا** و با `MEMBER`؛ به‌علاوهٔ دو بند در همان
موضوعی که چک ۴ ادعایش را داشت — عضویت در `pg_read_all_data`/`pg_write_all_data` (که هیچ
دروازهٔ مبتنی بر `relacl` و هیچ digest کاتالوگی نمی‌بیندش) و `rolconfig`. چک‌های ۱، ۲ و ۳
مهاجرت ۳۸۴ سرجایشان می‌مانند.

**چیزی که از اینجا قابل تعمیر نیست:** متن استثنای چک ۱ در ۳۸۴ هنوز می‌گوید «PostgreSQL
نمی‌تواند جلوی ALTER ROLE را بگیرد، پس این ادعا تنها کنترل است». در replay، ۳۸۴ زودتر از
۳۸۵ اجرا می‌شود و مهاجرت اعمال‌شده ویرایش نمی‌شود. سربرگ ۳۸۵ این را صریح می‌نویسد تا کسی
که آن خطا را می‌بیند بداند اول باید پیکربندی supautils را نگاه کند.

### ۳۸۵ پیش از اعمال، با چهارده اختلال کوبیده شد

پایه پاس؛ سیزده اختلالِ معتبر، هر سیزده گرفته شد — تعویض superuser، superuser اضافه،
تنزل تنها superuser (نگهبان تهی‌بودن)، `SET ROLE` یک‌پرشی و دو‌پرشی و سه‌پرشی،
یک‌پرشی به نقش `NOINHERIT` (همانی که پیش‌نویس را شکست)، `pg_read_all_data` مستقیم و
باواسطه و روی نقش `NOINHERIT`، و هر دو شکل `rolconfig`. یک اختلال (`GRANT postgres TO
authenticated`) اصلاً ساختنی نبود: `postgres` از پیش عضو `authenticated` است و گرنت دور
می‌سازد — این واقعیتِ نصب است، نه شکست دروازه.

### آنچه بازبین سنجید و درست بود

جدول نقش‌ها، هر دوازده عدد افشا، هر دو فرض ردشده، ناممکن‌بودن event trigger، و کل خط
رگرسیون — همه بازتولید شدند و مو به مو خواندند.

## Part 1 — ثبت «۲۷ فایل گم‌شده» پس گرفته شد

بازبین شمرد و دید عدد با فهرست نمی‌خواند (۲۷ در برابر ۳۵) و یک سطر `rls-fix…` است، یعنی
جای یک نام فایل سه‌نقطه گذاشته شده. دنبال همان رفتم و معلوم شد **هیچ فایلی گم نشده بود.**

`D:\AfraKalaTest` خودش یک مخزن گیت جداگانه است و `D:\AfraKalaTest\app` مخزنی تودرتو داخل
آن. اسنپ‌شات `git status` مبنای آن ثبت، از **والد** گرفته شده بود — شاهدش این است که خود
`app/` در آن فهرست untracked آمده، چیزی که فقط از والد ممکن است. هر ۳۹ ورودی همین حالا
سر جایشان‌اند، با mtime تیر–مرداد و دست‌نخورده.

جزئیات کامل و درسی که می‌ماند، در `docs/execution/deferred.md`.

## گام بعدی

مأموریت M9 اینجا تمام می‌شود. بعدی به ترتیب M6 است و این سند مجازش نمی‌کند.
