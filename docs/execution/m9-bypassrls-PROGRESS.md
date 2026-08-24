# M9 — `BYPASSRLS` روی `anon` — OG-34 — PROGRESS

## HANDOFF STATE

```
Mission:              M9 — BYPASSRLS · OG-34, alone
Status:               in progress
Branch:               feature/m9-bypassrls
Base:                 staging @ 274bfa3e  (verified: git rev-parse origin/staging)
Part 1:               DONE — lost-files incident recorded in deferred.md, commit adf31a68
Part 2:               Phase 0 complete
Migrations:           384 reserved (verified: highest on disk and on origin/staging is 383)
Assertion gates:      1 permitted
Review rounds:        max 2
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

## گام بعدی

فاز ۱ — فایل بازگشت پیش از مهاجرت ۳۸۴.
