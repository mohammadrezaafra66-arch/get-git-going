# OG-25 — بستن قاعدهٔ پیش‌فرض `ALTER DEFAULT PRIVILEGES … TO anon` — PROGRESS

## HANDOFF STATE

```
Phase:                OG-25 — close the anon default-privilege tap
Status:               in progress
Branch:               feature/og25-close-anon-default-privileges
Base:                 staging @ 1acbd730  (verified — matches the mission document)
Tasks:                6 of 7
Current task:         Phase 5 — review round 3 dispatched
Blocked by:           nothing
Migrations applied:   373-379 — all psql exit 0, gates green
REST restarted after: yes, after each
Backup taken:         n/a — this mission changes privileges only, no data DDL
Typecheck:            70 / 70 baseline (branch touches 0 TypeScript files)
Last commit:          see git log
Web rebuilt:          NO — deliberately. 0 files under src/, so APP_GIT_SHA was left alone
PR:                   not yet opened
```

## دامنه — تصمیم مالک، ورودی تثبیت‌شده

مالک در ۱۴۰۵/۰۶/۰۱ (2026-08-22) از روی یک تحلیل نوشتاری تصمیم گرفت. این‌ها
پرسش نیستند، ورودی‌اند:

| | تصمیم |
|---|---|
| دامنه | بستن شیرِ **آینده** + گرنت صریح روی سطوح عمومی + ممیزی اشیای موجود که **فقط گزارش** است. **هیچ REVOKE دسته‌جمعی روی اشیای موجود.** |
| کدام پیش‌فرض‌ها | `TABLES` و `SEQUENCES` — بله. **`FUNCTIONS` — خیر.** `anon=X` روی توابع به `authenticateBot` و مسیر احراز هویت می‌خورد. |
| اگر ممیزی نشان دهد سطحی از قبل شکسته است | **به‌عنوان Owner-Gate ثبت شود و برگردانده شود. اصلاح نشود.** |

---

## فاز ۰ — سنجش، بدون هیچ تغییری

### ۰.۱ — خودِ شیر

```sql
SELECT pg_get_userbyid(d.defaclrole), n.nspname, d.defaclobjtype, d.defaclacl::text
FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace;
```

هر هشت ردیف، نه فقط ردیف‌های `anon`:

```
supabase_admin | pgsodium       | r | {pgsodium_keyholder=arwdDxt/supabase_admin}
supabase_admin | pgsodium       | S | {pgsodium_keyholder=rwU/supabase_admin}
supabase_admin | pgsodium_masks | f | {pgsodium_keyiduser=X/supabase_admin}
supabase_admin | pgsodium_masks | r | {pgsodium_keyiduser=arwdDxt/supabase_admin}
supabase_admin | pgsodium_masks | S | {pgsodium_keyiduser=rwU/supabase_admin}
supabase_admin | public         | f | {postgres=X/…, anon=X/…, authenticated=X/…, service_role=X/…}
supabase_admin | public         | r | {postgres=arwdDxt/…, anon=arwdDxt/…, authenticated=arwdDxt/…, service_role=arwdDxt/…}
supabase_admin | public         | S | {postgres=rwU/…, anon=rwU/…, authenticated=rwU/…, service_role=rwU/…}
```

این مأموریت فقط `r` و `S` را، و فقط برای `anon`، در شِمای `public` می‌بندد.
پنج ردیف `pgsodium*` و ردیف `f` زمینه‌اند و دست نمی‌خورند.

### ۰.۲ — اثبات زنده‌بودن شیر، پیش از اصلاح

داخل `BEGIN … ROLLBACK`، یک view و یک sequence دورانداختنی ساخته شد:

```
view relacl      = {postgres=arwdDxt/…, supabase_admin=arwdDxt/…, anon=arwdDxt/…, authenticated=arwdDxt/…, service_role=arwdDxt/…}
view anon SELECT = true
seq  relacl      = {postgres=rwU/…, supabase_admin=rwU/…, anon=rwU/…, authenticated=rwU/…, service_role=rwU/…}
seq  anon USAGE  = true
```

و پس از بازگشت: `0 objects named _og25_probe% remain`.

**این تنها آزمونی است که ثابت می‌کند شیر واقعاً بسته شده. در پذیرش A1/A2 عیناً
تکرار می‌شود.**

### ۰.۳ — سرشماری اشیای موجود دارای گرنت `anon` (فقط گزارش)

```
relkind | privileges                                              | objects
r       | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE | 204
v       | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE | 7
```

مجموع اشیای `r`+`v` با گرنت anon: **۲۱۱**.
کل جدول‌های `public`: **۲۲۴**. کل viewها: **۲۰**.
جدول‌هایی که anon `SELECT` ندارد: **۲۲**.
sequenceها: ۶ تا، که **۵** تا به anon `USAGE` و `SELECT` می‌دهند
(`platform_release_number_seq` تنها استثناست).

#### عدد «۲۱۶ از ۲۲۴» در `deferred.md` — **آشتی می‌کند، و من یک فرضیه زود کوتاه آمدم**

> **این بند پس از بازبینی مستقل بازنویسی شد.** نسخهٔ اول دو فرضیه را آزمود —
> فقط‌جدول (انتظار ۲۱۶، یافته ۲۰۴) و جدول+view (انتظار ۲۱۰، یافته ۲۱۱) —
> نتیجه گرفت هیچ‌کدام جا نمی‌افتد و آن را «قابل‌آشتی‌نشدنی» ثبت کرد. فرضیهٔ
> سوم را نیازموده بودم و دقیقاً جا می‌افتد.

`docs/execution/deferred.md` می‌گوید «۲۱۶ از ۲۲۴ جدول عمومی». سنجیده امروز:

```
r=204  v=7  S=5  TOTAL=216      (اشیای public که anon روی آن‌ها گرنت دارد)
relkind='r' کل = 224
```

**۲۰۴ + ۷ + ۵ = ۲۱۶.** یعنی کوئری اصلی همهٔ `relkind`ها را شمرده — جدول، view
و **sequence** — و مجموع را با شمار جدول‌ها مقایسه کرده. عدد سند درست بود؛
برچسبش («جدول») غلط بود.

علت اینکه من به آن نرسیدم همان نقطهٔ کوری است که MAJOR 4 بازبینی هم رویش
انگشت گذاشت: **sequenceها را اصلاً نشمرده بودم.** پنج sequence از قبل
`anon=rwU` دارند:

```
audit_logs_id_seq   bot_api_usage_logs_id_seq   employee_score_events_id_seq
payment_voucher_number_seq   score_snapshots_id_seq
```

پس سرشماری درست این مأموریت **۲۱۶** است، نه ۲۱۱. عدد ۲۱۱ در مهاجرت‌های ۳۷۵ و
در نسخهٔ اول ممیزی فقط `r`+`v` را می‌شمرد. مهاجرت **۳۷۸** سرشماری را روی هر سه
`relkind` و به‌صورت **مجموعهٔ نام‌ها** پین می‌کند.

بیست‌ودو جدولی که anon `SELECT` ندارد:

```
category_required_services, customer_capital_allocations_dynamic, daily_capital_inputs,
daily_capital_settings, daily_capital_snapshots, marketing_task_templates,
mutual_settlements, person_aliases, platform_releases, product_service_types,
purchase_idempotency, purchase_items, purchase_request_fulfillments, purchase_requests,
purchases, sale_list_items, sale_lists, sales_quote_item_services, sales_quote_items,
sales_quotes, salesperson_capital_allocations_dynamic, score_level_thresholds
```

### ۰.۴ — سطوح عمومی واقعی، مشتق‌شده از کد

روش عمداً با روش مأموریت G-1 فرق دارد. آن مأموریت فقط نام‌فایل‌های تختِ
نقطه‌دار را شمرد، پوشهٔ تودرتوی `src/routes/api/public/` را ندید و دو ادعای
نادرست تولید کرد. اینجا **۳۱ فایل مسیر** خارج از `_app` با `find` شمرده شد —
تخت و تودرتو با هم — و برای هرکدام مشخص شد چه کلاینتی می‌سازد.

| کلاینت | معنی نقش |
|---|---|
| `supabaseAdmin` از `client.server.ts` | service role، RLS را دور می‌زند، به `anon` وابسته **نیست** |
| `SUPABASE_PUBLISHABLE_KEY` بدون هدر `Authorization` | به‌عنوان `anon` |
| کلاینت مرورگر `@/integrations/supabase/client` خارج از `_app` | بدون نشست = `anon` |

نتیجهٔ طبقه‌بندی هر ۳۱ فایل:

- **هشت مسیر `api.public.bot.*`** — همه فقط `SERVICE-ROLE`. **نتیجهٔ تحلیل
  ورودی تأیید شد:** به `anon` وابسته نیستند.
- `api/public/hooks/ingest-market-rates.ts` — service role.
  `generate-marketing-tasks.ts` و `process-pricing-queue.ts` هیچ کلاینتی
  نمی‌سازند.
- ~~`api.healthz`~~, `api.version`, `sitemap[.]xml`, `index`, `unauthorized`,
  `mcp`, `[.mcp]/*`, `[.well-known]/*`, `__root` — هیچ کوئری پایگاه‌داده‌ای
  ندارند. (`sitemap` صفر ارجاع به `supabase` دارد — بررسی شد.)

  > **`api.healthz` غلط بود.** آن مسیر جدول `shop_settings` را با یک `fetch`
  > دستی و کلید anon می‌خواند. چون `supabase.from(...)` نمی‌نویسد، از هر دو
  > روش جست‌وجوی من رد شد. بازبینی مستقل پیدایش کرد؛ مهاجرت **۳۷۷** ثبتش
  > می‌کند. بند «BLOCKER 1» در فاز ۵ پایین.
- `login`, `register`, `reset-password`, `pending-approval`,
  `[.]lovable.oauth.consent` — کلاینت مرورگر، ولی فقط برای احراز هویت
  (`auth.*`)، نه خواندن جدول.
- **`api/public/products.ts`** — کوئری `products` با کلید publishable و بدون
  نشست ⇒ `anon`. (جست‌وجوی قیمت پشت پرچم `PUBLISH_PUBLIC_PRICES=false` است و
  از service role استفاده می‌کند — OG-29.)
- **`public.sale-lists.$listId.tsx`** — از راه
  `src/lib/public/get-public-sale-list.ts` که کلاینت **مرورگر** را وارد
  می‌کند، پس بدون نشست `anon` است. می‌خواند: `sale_lists`,
  `sale_price_types`, `sale_list_items`, `products`, `brands`, `categories`،
  و `rpc('refresh_sale_list_prices')`.

~~**پس فهرست دقیقاً همان دو سطحی است که تحلیل ورودی گفته بود — تأیید شد.**~~

> **این نتیجه‌گیری غلط بود، و دو بار غلط بود.** سطح سوم (`register.tsx` →
> `profile_field_definitions`) را خودم با پیمایش گذرا پیدا کردم — بند ۰.۶ب.
> سطح چهارم (`api.healthz` → `shop_settings`) و پنجم (دو RPC
> `get_recent_purchase_label*`) را **بازبینی مستقل** پیدا کرد — فاز ۵.
>
> آنچه از تحلیل ورودی **تأیید شد** این است که هر هشت مسیر `api.public.bot.*`
> با service role کار می‌کنند و به `anon` وابسته نیستند. آنچه **رد شد** این
> است که سطوح anon-وابسته دقیقاً دوتا باشند؛ **پنج‌تا هستند.**

#### حق anon امروز روی جدول‌های این دو سطح

```
products            SELECT=true   DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
brands              SELECT=true   DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
categories          SELECT=true   DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
sale_price_types    SELECT=true   DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
sale_lists          SELECT=FALSE  DELETE,INSERT,REFERENCES,TRIGGER,TRUNCATE,UPDATE
sale_list_items     SELECT=FALSE  DELETE,INSERT,REFERENCES,TRIGGER,TRUNCATE,UPDATE
refresh_sale_list_prices(uuid)    anon EXECUTE=true, SECURITY DEFINER
```

### ۰.۵ — خط پایهٔ رفتاری، پیش از هر تغییر

```
GET /api/public/products                 -> HTTP 200
     products=199
     keys=['capacity','id','is_active','model','name','price','stock_status']
     nonzero_prices=0          <-- OG-29 نگه‌داشته می‌شود؛ این عدد باید ۰ بماند

GET /public/sale-lists/<draft id>        -> HTTP 404, 8853 bytes
GET /public/sale-lists/<bogus id>        -> HTTP 404
```

شمار ردیف anon روی PostgREST:

```
products=355   brands=40   categories=12   sale_price_types=0
sale_lists=HTTP 401        sale_list_items=HTTP 401
```

شمار ردیف با نشست واقعی (از نشست‌های ذخیره‌شدهٔ خود پروژه در `e2e/auth/`،
تازه‌شده با `grant_type=refresh_token`؛ هیچ رمزی حدس زده نشد، هیچ توکنی چاپ نشد):

| نقش | products | brands | categories | sale_price_types | sale_lists | sale_list_items |
|---|---|---|---|---|---|---|
| accountant | ۳۵۵ | ۴۰ | ۱۲ | ۳ | ۲۰ | ۱۸۳۷ |
| admin | ۳۵۵ | ۴۰ | ۱۲ | ۳ | ۲۰ | ۱۸۳۷ |
| sales | ۳۵۵ | ۴۰ | ۱۲ | ۳ | ۰ | ۰ |

`test.manager` و `test.viewer` وضعیت `status=rejected` دارند: **NOT TESTABLE**.
فعال نشدند — خارج از دامنهٔ این مأموریت.

---

## تناقض‌های یافته‌شده

| انتظار | یافته | اثر |
|---|---|---|
| `deferred.md`: ۲۱۶ از ۲۲۴ جدول گرنت anon دارند | ۲۰۴ جدول + ۷ view = ۲۱۱ شیء؛ هیچ‌کدام دقیق با ۲۱۶ جا نمی‌افتد | عدد امروز مبنا شد، نه عدد سند |
| سطح عمومی `sale-lists` به `anon` روی `sale_lists`/`sale_list_items` وابسته است و کار می‌کند | anon روی هر دو **`SELECT` ندارد** — ولی `DELETE,INSERT,UPDATE,TRUNCATE` دارد | سطح از قبل شکسته است ⇒ Owner-Gate، نه اصلاح |
| `sale_price_types` برای صفحهٔ عمومی خوانا است | anon ۰ ردیف می‌بیند (RLS) | عنوان نوع‌قیمت روی صفحهٔ عمومی رندر نمی‌شود ⇒ همان Owner-Gate |
| یک لیست منتشرشده برای خط پایه وجود دارد | **صفر** — هر ۲۰ لیست `draft` | مسیر منتشرشده **NOT BASELINEABLE**؛ داده آزمایشی ساخته نشد |

---

## فاز ۰.۶ب — تصحیح ۰.۴ پس از یک سنجش عمیق‌تر

**نتیجهٔ «دقیقاً دو سطح عمومی» در ۰.۴ ناقص بود، و خودم ردش کردم.**

روش ۰.۴ هر فایل مسیر را بر اساس کلاینتی که **خودش** می‌سازد طبقه‌بندی می‌کرد.
`register.tsx` کلاینت مرورگر را فقط برای `auth.*` می‌سازد و خواندن جدولش یک
import آن‌طرف‌تر است. پس از قلم افتاد. این همان کلاس خطای G-1 است — جست‌وجویی
که یک پرش زودتر می‌ایستد — این‌بار در بُعدی دیگر.

سنجش دوباره با **پیمایش گذرای import** از هر ۳۱ مسیر خارج از `_app`:

```
register.tsx
  -> lib/profile-fields/queries.ts   fetchActiveProfileFields({ registerOnly: true })
     -> supabase.from("profile_field_definitions")
```

`anon` روی آن جدول **۴ از ۵ ردیف** را می‌بیند، از راه سیاست صریح و عمدی
«Public can read register form fields» (`is_active AND show_on_register`). پس
سطح عمومی **سوم** واقعی است، نه نظری. مهاجرت **۳۷۶** گرنتش را ثبت کرد.

پیمایش دو چیز دیگر هم نشان داد:

- **هشت مسیر `api.public.bot.*` تأیید شدند**: همه از راه `server/bot-api.ts` با
  service role کار می‌کنند (`bot_authenticate_key`, `bot_check_rate_limit`, …).
  به `anon` وابسته نیستند. **نتیجهٔ تحلیل ورودی درست بود.**
- `profiles`, `user_roles`, `custom_roles`, `role_permissions`, `log_event` از
  **هر** صفحهٔ عمومی از راه `lib/auth/*` و `lib/rbac/*` لمس می‌شوند. هر پنج‌تا
  به‌عنوان `anon` صفر ردیف می‌دهند. عمداً گرنت صریح نگرفتند — دادهٔ منتشرشده
  نیستند — ولی در ممیزی به‌عنوان پرریسک‌ترین بخش یک REVOKE دسته‌جمعی ثبت شدند.
- `public.sale-lists` تابع `get_recent_purchase_label` را هم صدا می‌زند
  (از `components/products/RecentPurchaseBadge.tsx`) که در ۰.۴ ندیده بودم.

---

## فاز ۱ — فایل‌های بازگشت، پیش از هر مهاجرت

هر چهار فایل **پیش از** نوشتن فایل رو به جلوی خودشان نوشته و با
`rollback-dryrun.sql` اثبات شدند. هیچ‌کدام `BEGIN`/`COMMIT`/`ROLLBACK` ندارند.

مجموعهٔ امتیازها از حافظه یا از «پیش‌فرض Supabase» بازنویسی نشد؛ از
`pg_default_acl` زندهٔ ۰.۱ خوانده شد: `arwdDxt` برای جدول‌ها (⇒ `GRANT ALL ON
TABLES`) و `rwU` برای sequenceها (⇒ `GRANT ALL ON SEQUENCES`).

**یک نکتهٔ عدم‌تقارن که باید خوانده شود:** `374-down` و `376-down` اشیا را به
**زیر** حالت پیش از مأموریت می‌برند، چون گرنت `SELECT` را برمی‌دارند در حالی که
آن اشیا از قبل گرنت گسترده‌تری داشتند. اجرای تنهای ۳۷۴-down مسیر
`/api/public/products` را می‌شکند — همان ۵۰۰ی که مهاجرت ۳۷۰ ساخت. برای برگرداندن
این مأموریت، فقط `373-down` را اجرا کنید و آن دو را دست نزنید. این در سربرگ هر
دو فایل نوشته شده است.

---

## فاز ۲ — تغییر

| مهاجرت | چه می‌کند | اشیای موجود |
|---|---|---|
| **۳۷۳** | `REVOKE ALL ON TABLES` و `ON SEQUENCES` از `anon` در `pg_default_acl` | صفر تغییر |
| **۳۷۴** | `GRANT SELECT` روی `products`, `brands`, `categories`, `sale_price_types` + `EXECUTE` روی `refresh_sale_list_prices` | صفر تغییر (no-op) |
| **۳۷۵** | فقط ادعا، هیچ شیئی نمی‌سازد | صفر |
| **۳۷۶** | `GRANT SELECT` روی `profile_field_definitions` | صفر تغییر (no-op) |

هیچ خط `ON FUNCTIONS` نوشته نشد — مالک صریحاً مستثنا کرده بود.

**اثبات «صفر شیء موجود تغییر کرد» با محاسبه، نه با ادعا.** md5 تمام
`relacl`های `public` برای `relkind IN ('r','v','S')`:

```
before 373 : 5e31cb642a399d0370f56da643424a2d
after  373 : 5e31cb642a399d0370f56da643424a2d
after  374 : 5e31cb642a399d0370f56da643424a2d
after  376 : 5e31cb642a399d0370f56da643424a2d
```

هر چهار یکسان. گرنت‌های ۳۷۴ و ۳۷۶ واقعاً no-op بودند، همان‌طور که سربرگشان
ادعا می‌کرد — چون `anon` از قبل `arwdDxt` داشت. آنچه عوض شد **ثبت** است، نه
دسترسی.

کوئری‌ای که این رقم را می‌سازد (بازبینی به‌درستی گفت ثبت نشده بود و بدون آن
قابل بازتولید نیست):

```sql
SELECT md5(string_agg(c.relname || '=' || coalesce(c.relacl::text, '~'), '|' ORDER BY c.relname))
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','v','S');
```

پس از هر مهاجرت: `docker restart afrakala-lan-rest`. ترتیب رعایت شد:
اعمال ← restart ← commit، پیش از مهاجرت بعدی.

### دروازهٔ ۳۷۵ — و اینکه در حالت سالم شکست خورد

سیزده اختلال پیش از اعمال زده شد. **اجرای اول روی پایگاه‌دادهٔ سالم ERROR داد.**
پیش‌نویس اول ادعا کرده بود `anon` نباید روی چهار جدول عمومی
`INSERT/UPDATE/DELETE/TRUNCATE` داشته باشد — که هم با مهاجرت ۳۷۴ خودم و هم با
دامنهٔ مالک در تضاد بود، چون ۳۷۴ عمداً جدولی را که از قبل گرنت گسترده‌تری دارد
تنگ نمی‌کند. **دروازه غلط بود، نه پایگاه‌داده.** حالا برابری **مجموعه** با
سنجش پیش از مأموریت را ادعا می‌کند، که سخت‌گیرانه‌تر است: هم افزودن امتیاز را
می‌گیرد هم حذفش.

نتیجهٔ اختلال‌ها پس از اصلاح:

```
BASELINE (healthy)            NOTICE: 375 OK …
P1 re-grant default TABLES    ERROR: 1 default-privilege entry for anon … still exist
P2 re-grant default SEQUENCES ERROR: 1 default-privilege entry for anon … still exist
P3 also close FUNCTIONS       ERROR: the FUNCTIONS default privilege … must not have changed it
P5 a public table loses SELECT ERROR: anon lost SELECT on public.brands
P6 G-1 via table grant        ERROR: G-1 regressed — anon holds SELECT on public.vw_account_balances
P7 G-1 via COLUMN grant       ERROR: G-1 regressed — anon holds a column-level SELECT on … .current_balance
P8 G-1 via PUBLIC grant       ERROR: G-1 regressed — anon holds SELECT on public.publish_recipients_view
P9b EXECUTE genuinely removed ERROR: anon lost EXECUTE on refresh_sale_list_prices(uuid)
P10 an existing object REVOKEd ERROR: 210 objects hold an anon grant, but Phase 0.3 measured 211
P11 a new object gains a grant ERROR: 212 objects hold an anon grant, but Phase 0.3 measured 211
```

**دو اختلالی که رد شدند و ماست‌مالی نشدند:**

- **P4** (`GRANT INSERT ON products TO anon`) رد شد چون **no-op است** — هر چهار
  جدول عمومی از قبل ۷ از ۷ امتیاز را دارند، پس چیزی برای افزودن نیست. جهت
  «افزوده‌شدن» روی این جدول‌ها ذاتاً غیرقابل‌آزمون است؛ جهت «حذف‌شدن» را P5
  اثبات می‌کند.
- **P9** (`REVOKE EXECUTE … FROM anon`) رد شد چون `proacl` با
  `=X/supabase_admin` شروع می‌شود — PostgreSQL توابع را به‌طور پیش‌فرض به
  `PUBLIC` می‌دهد. پس گرفتنش فقط از `anon` واقعاً توانایی `anon` را حذف
  نمی‌کند. اثبات: `before=true`, `after revoke anon=true`,
  `after revoke PUBLIC=false`. **بررسی درست بود؛ اختلال ناکافی بود.** P9b آن را
  کامل کرد و دروازه گرفت.

---

## فاز ۳ — ممیزی

`docs/research/anon-grant-audit.md`. **هیچ `REVOKE`ای در آن نیست، حتی
کامنت‌شده** — بررسی شد: هیچ خطی یک دستور SQL نیست؛ هر ذکر «REVOKE» متن فارسی
دربارهٔ تصمیم آینده است.

عدد سرخط: **از ۲۰۹ شیء که `anon` اجازهٔ `SELECT` دارد، فقط روی ۵ تا واقعاً
ردیف می‌بیند.**

---

## فاز ۴ — پذیرش A1 تا A12

| # | نتیجه |
|---|---|
| **A1** | view تازه: `anon SELECT = false` (خط پایه `true`)؛ `relacl` دیگر ورودی `anon` ندارد — **PASS، نتیجهٔ سرخط مأموریت** |
| **A2** | sequence تازه: `anon USAGE = false` (خط پایه `true`) — **PASS** |
| **A3** | `r` و `S` بدون `anon`؛ **`f` دست‌نخورده** با `anon=X` — **PASS** |
| **A4** | `HTTP 200`، ۱۹۹ محصول، همان ۷ کلید (خط پایه ۲۰۰/۱۹۹) — **PASS** |
| **A5** | **صفر قیمت غیرصفر** — OG-29 نگه داشته شد — **PASS** |
| **A6** | `404` برای شناسهٔ draft و برای شناسهٔ ناموجود (خط پایه ۴۰۴/۴۰۴) — **PASS** |
| **A7** | ۸ از ۸ view رد شدند؛ صفر امتیاز `anon` — G-1 رگرسیون نکرد — **PASS** |
| **A8** | accountant/admin `355 40 12 3 20 1837`؛ sales `355 40 12 3 0 0` — **دقیقاً برابر خط پایهٔ ۰.۵** — **PASS** |
| **A9** | acl-hash `5e31cb642a399d0370f56da643424a2d` = خط پایه (کوئری‌اش بالا ثبت شد)؛ سرشماری **۲۱۶** با آزمون اثر روی هر شش `relkind` = خط پایه — **PASS** |
| **A10** | **هر هفت** فایل بازگشت `exit=0`، نشانگر بازگشت دیده شد، صفر دستور تراکنش؛ سرشماری ۲۱۶ → ۲۱۶ — **PASS** |
| **A11** | `npx tsc --noEmit` = **۷۰** (خط پایهٔ D14) — **PASS** |
| **A12** | `git status --porcelain` روی مسیرهای این مأموریت: پاک — **PASS** |

دو معیار افزوده، چون دو سطح عمومی تازه پیدا شد:

| # | نتیجه |
|---|---|
| **A4ب** | `/api/healthz` → `ok=true`, `database: up` — سطحی که BLOCKER 1 بود — **PASS** |
| **A9ب** | سرشماری اثری: `r=204 v=7 S=5 m=0 p=0 f=0` = **۲۱۶** — **PASS** |

**این برنچ هیچ فایل TypeScript تغییر نمی‌دهد** (۱۸ فایل: ۷ مهاجرت، ۷ فایل
بازگشت، ۳ سند، و `00-progress.md`). پس ایمیج وب بازسازی **نشد** و
`APP_GIT_SHA` جابه‌جا نشد — جابه‌جا کردنش برای تغییری که هرگز به بسته نمی‌رسد،
مُهر را دروغ می‌کرد.

> جدول بالا **پس از مهاجرت‌های ۳۷۷ تا ۳۷۹ دوباره اجرا شد**، نه اینکه از دور
> اول کپی شود. بازبینی دور دوم به‌درستی گفت نسخهٔ قبلی کهنه شده بود و هنوز
> «سرشماری ۲۱۱» و «۱۰ فایل» می‌گفت.

---

## فاز ۵ — بازبینی مستقل: **CHANGE REQUIRED**، و چهار ایراد واقعی

| # | شدت | یافته | وضعیت |
|---|---|---|---|
| ۱ | **BLOCKER** | سطح عمومی چهارم: `/api/healthz` جدول `shop_settings` را به‌عنوان anon می‌خواند | بسته — مهاجرت ۳۷۷ |
| ۲ | **BLOCKER** | سطح عمومی پنجم: دو RPC `get_recent_purchase_label*` — و افشای **زندهٔ** زمان‌بندی خرید | ثبت شد (۳۷۷) + **OG-33** |
| ۳ | MAJOR | دروازهٔ ۳۷۵ سرشماری را **می‌شمرد**، پس یک جابه‌جایی یک‌به‌یک از آن رد می‌شود | بسته — مهاجرت ۳۷۸ |
| ۴ | MAJOR | ۳۷۵ هیچ پوششی روی ACL sequenceهای موجود ندارد؛ ۵ sequence از قبل گرنت anon دارند | بسته — ۳۷۸ + اصلاح سرشماری به ۲۱۶ |
| ۵ | MINOR | بررسی ۱ نسبت به grantorهای دیگر کور است — ولی قابل بهره‌برداری نیست | پذیرفته، ثبت شد |
| ۶ | MINOR | «۲۱۶ از ۲۲۴» **آشتی می‌کند**؛ من یک فرضیه زود کوتاه آمدم | بسته — بند ۰.۳ بازنویسی شد |
| ۷ | MINOR | کوئری acl-hash ثبت نشده بود، پس رقم بازتولیدپذیر نبود | بسته — کوئری ثبت شد |
| ۸ | MINOR | دو ادعا تهی‌اند و یک کامنت قوت خودش را بزرگ‌نمایی می‌کند | بسته — پایین |

### BLOCKER 1 — `/api/healthz`

`src/routes/api.healthz.ts:57-68` از کلاینت Supabase استفاده **نمی‌کند**؛ URL را
دستی می‌سازد و `fetch` می‌زند با کلید publishable هم به‌عنوان `apikey` و هم
`Authorization`. سربرگ خود مسیر هم همین را می‌گوید. سربرگ مهاجرت ۳۷۴ **عکسش را
ادعا کرده بود** — که «`api.healthz` هیچ کوئری پایگاه‌داده‌ای نمی‌زند». آن ادعا
غلط است.

از دید روش: پیمایش گذرای من روی `supabase.from(...)` / `.rpc(...)` کلید می‌خورد،
و یک `fetch` دستی هرگز با آن شکل تطبیق نمی‌کند. **سه روش پشت سر هم هرکدام چیزی
را از دست دادند** — طبقه‌بندی فایل‌به‌فایل (۳۷۴)، پیمایش گذرا (۳۷۶)، و حالا
این. ثبتش می‌کنم چون درسِ روش است، نه یک اشتباه منفرد.

چرا فقط دفترداری نیست: `shop_settings` گرنت `anon` را **تنها** از پیش‌فرض شِما
دارد، و ممیزی فاز ۳ آن را بدون مصرف‌کننده فهرست کرده بود. یک REVOKE دسته‌جمعی —
همان تصمیمی که کل این مأموریت برای ممکن‌کردنش وجود دارد — آن را می‌گرفت،
probe ۴۰۱ می‌گرفت، `state: "down"` می‌داد، ۵۰۳ برمی‌گرداند و healthcheck هر
کانتینر وب روی دستگاه را ری‌استارت می‌کرد.

### BLOCKER 2 — افشای زمان‌بندی خرید، زنده

`public.sale-lists.$listId` → `sale-list-table.tsx` → `RecentPurchaseBadge` /
`RecentPurchaseGroup` → `rpc('get_recent_purchase_label')`. هر دو تابع
`SECURITY DEFINER` و برای `anon` اجراشدنی.

برخلاف `sale_lists` که ۴۰۱ می‌دهد (OG-32)، **این مسیر امروز کار می‌کند**:

```
POST /rest/v1/rpc/get_recent_purchase_label   (anon key, no session)
 -> {"status":"none","hours_since":967.17,
     "last_purchase_at":"2026-07-13T10:01:00.667437+00:00","is_today_purchase":false}

GET /rest/v1/purchases?select=id&limit=1      (same caller)
 -> HTTP 401
```

یعنی زمینهٔ `SECURITY DEFINER` زمان دقیق آخرین خرید هر محصولی را به تماس ناشناس
می‌دهد، در حالی که جدول `purchases` برای همان تماس بسته است. **همان کلاس نقص
G-1، این‌بار در یک تابع به‌جای یک view.**

و باید صریح بگویم: **من این را دیده بودم.** بند ۰.۶ب همین پرونده نوشته بود
«`public.sale-lists` تابع `get_recent_purchase_label` را هم صدا می‌زند که در ۰.۴
ندیده بودم» — و بعد هیچ کاری نکردم. دیدن و ننوشتن بدتر از ندیدن است.

مهاجرت ۳۷۷ ثبتش می‌کند. **بستنش را انجام نمی‌دهد** — تصمیم کسب‌وکاری است، و
`REVOKE … FROM anon` به‌تنهایی هم کاری نمی‌کند چون PostgreSQL توابع را به
`PUBLIC` هم می‌دهد. **OG-33**.

### MAJOR 3 و 4 — دروازهٔ ۳۷۵ دو بار دور خورد

سربرگ خود ۳۷۵ می‌گوید «با نام ادعا کن، مجموعه را مقایسه کن، هرگز شمار» — و بعد
بررسی ۶ می‌شمرد. بازبین ثابت کرد:

```
BEGIN;
  REVOKE ALL ON TABLE public.payment_vouchers FROM anon;
  GRANT SELECT ON TABLE public.api_products_pricing TO anon;
  -- census 211 -> 211، دروازه سبز، در حالی که یک شیء موجود باطل شده بود
ROLLBACK;
```

و شیئی که جایش نشسته بی‌ضرر نیست: `api_products_pricing` هیچ
`security_invoker` ندارد. مستقل بررسی و برگرداندم: با آن گرنت، `anon`
**۳۵۵ ردیف** شامل قیمت خرید از تأمین‌کننده و قیمت فروش جاری می‌خواند.

و ۳۷۵ هیچ ادعایی روی ACL **sequence**های موجود ندارد، در حالی که ۳۷۳ روی
sequenceها عمل می‌کند. `information_schema.role_table_grants` اصلاً
sequence نمی‌بیند.

مهاجرت **۳۷۸** هر دو را می‌بندد: مقایسهٔ **مجموعهٔ ۲۱۶ نام** روی `r`/`v`/`S`
به‌علاوهٔ آزمون امتیاز مستقیم برای هر sequence. نتیجهٔ حمله‌ها:

```
R1 swap (defeated 375)      375: OK    378: ERROR lost {r:payment_vouchers} ; gained {v:api_products_pricing}
R2 GRANT ALL ON SEQUENCES   375: OK    378: ERROR lost {} ; gained {S:platform_release_number_seq}
R3 revoke one sequence                 378: ERROR lost {S:audit_logs_id_seq} ; gained {}
R4 re-grant default TABLES             378: ERROR 1 default-privilege entry … still exist
R5 close FUNCTIONS                     378: ERROR the FUNCTIONS default privilege must be untouched
R6 shop_settings loses SELECT          378: ERROR anon lost SELECT on public.shop_settings
R7 G-1 via column grant                378: ERROR anon holds a column-level SELECT on … current_balance
```

### MINOR 5 — پذیرفته، و بازبین خودش نتوانست به حالت غلط برساندش

بررسی ۱ روی `defaclrole = 'supabase_admin'` فیلتر می‌کند و به
`pg_namespace` join می‌زند، پس یک `ALTER DEFAULT PRIVILEGES` سراسری بدون
`IN SCHEMA` (که `defaclnamespace = 0` دارد) هرگز join نمی‌شود. ولی فقط
`supabase_admin` در `public` اجازهٔ ساخت دارد، و probe شیء تازه نوعِ بی‌شِما را
می‌گیرد. **شکاف نهفته، نه نقص.** ثبت شد.

### MINOR 8 — دو ادعای تهی

بازبین هر دو توضیح مرا مستقل تأیید کرد، ولی به‌درستی گفت پیامدشان ثبت نشده:

- `GRANT EXECUTE … TO anon` در ۳۷۴ و ادعای تابعِ ۳۷۵ عملاً **هرگز نمی‌توانند
  شکست بخورند**، چون `PUBLIC` گرنت دارد. در ۳۷۸ همین را در کامنت خود بررسی
  نوشتم و دلیل نگه‌داشتنش را هم گفتم: دقیقاً همان اشتباهی است که یک مأموریت
  `FUNCTIONS` (OG-31) ممکن است مرتکب شود.
- کامنت ۳۷۵ می‌گفت برابری مجموعه «اگر امتیازی افزوده شود شکست می‌خورد» —
  برای این چهار جدول **نادرست** است، چون هر ۷ امتیاز را دارند و چیزی برای
  افزودن نیست. اغراق بود.

### یک تخطی ترتیبی که خودم مرتکب شدم

قاعدهٔ فاز ۱ می‌گوید فایل بازگشت باید **پیش از** مهاجرت نوشته و **اثبات** شود.
`377-down.sql` پیش از مهاجرت نوشته شد، ولی اجرای اول dry-run بی‌صدا هیچ خروجی
نداد — `rollback-dryrun.sql` از `/tmp` کانتینر پاک شده بود و من خروجی خالی را
به‌جای شکست خواندم. **پس ۳۷۷ را پیش از اثبات واقعی فایل بازگشتش اعمال کردم.**
اثبات بعداً اجرا شد و `exit=0` داد و حالت ۸۴۱ → ۸۴۱ برگشت، ولی ترتیب رعایت نشد
و ثبتش می‌کنم به‌جای اینکه وانمود کنم شد.

---

## فاز ۵، دور دوم — **CHANGE REQUIRED** دوباره، و چهار راه دیگر برای شکستن دروازه

بازبین هر ۸ یافتهٔ دور اول را بسته دید، ولی **دروازهٔ ۳۷۸ را چهار بار دیگر
شکست** — و هر چهار یک اشتباه‌اند، همانی که این برنامه در **چهار دروازهٔ پیاپی**
مرتکب شده:

> **پرسیدن از کاتالوگ که چه کسی «نام برده شده»، وقتی پرسش این است که فراخوان
> چه کاری «می‌تواند بکند».**

سربرگ خود ۳۷۵ این قاعده را نوشته بود. ۳۷۸ آن را برای **sequence**ها اعمال کرد —
بررسی ۳ با `has_sequence_privilege` و بازبین نتوانست بشکندش — و سرشماری
جدول/view را روی `aclexplode … grantee = 'anon'` رها کرد. بستن جابه‌جایی
یک‌به‌یک، محمولِ زیرش را درست نکرد.

| # | شدت | حمله | ۳۷۸ | ۳۷۹ |
|---|---|---|---|---|
| ۹ | **MAJOR** | `GRANT SELECT … TO PUBLIC` | OK | `gained: {v:api_products_pricing}` |
| ۱۰ | **MAJOR** | MATERIALIZED VIEW با گرنت مستقیم anon | OK | `gained: {m:_atk_mv}` |
| ۱۰ب | MAJOR | PARTITIONED TABLE | — | `gained: {p:_atk_p}` |
| ۱۱ | **MAJOR** | `GRANT products_api_readonly TO anon` (نقش موجود) | OK | `gained: {v:api_product_price_rows, v:api_products_pricing}` |
| ۱۲ | MINOR | گرنت سطح‌ستون خارج از هشت view نگهبان | OK | `a column-level grant reaching anon exists on … .purchase_price` |

**بار سه‌تای اول یکی است و همان بار دور اول:** `api_products_pricing`
`security_invoker` ندارد، پس ۳۵۵ ردیف که ۳۲۱‌تایشان قیمت خرید از تأمین‌کننده
دارند به تماس ناشناس می‌رسد. و حملهٔ ۱۱ حتی نقش تازه‌ای نمی‌خواهد —
`products_api_readonly` از قبل وجود دارد.

### مهاجرت ۳۷۹

- محمول سرشماری از **هویت** به **اثر** تغییر کرد:
  `has_table_privilege` / `has_sequence_privilege`، که گرنت به `PUBLIC` و نقشِ
  ارث‌بری‌شده را هم می‌بیند.
- **«هر امتیازی»، نه فقط `SELECT`.** `sale_lists` و `sale_list_items` برای anon
  `DELETE/INSERT/UPDATE/TRUNCATE` دارند و `SELECT` ندارند (OG-32)، پس سرشماری
  فقط‌SELECT بی‌صدا از ۲۱۶ به **۲۱۴** می‌افتاد. پیش از نوشتن سنجیدم: مجموعهٔ
  اثری «هر امتیازی» و مجموعهٔ نامی امروز **عنصر‌به‌عنصر یکسان‌اند**
  (`only in effect-set: <none> | only in name-set: <none>`).
- دامنه به `relkind IN ('r','v','S','m','p','f')`. امروز `m=0 p=0 f=0` است، و
  **دقیقاً به همین دلیل باید حالا پین شود**: شیء بعدی از این نوع وگرنه نامرئی
  متولد می‌شود.
- جاروی ستونی روی **هر** شیء در دامنه، نه فقط هشت view نگهبان.

### دو یافتهٔ دیگر دور دوم

**MINOR 13 — و روشی که هیچ‌کدام از ما به‌کار نبرده بودیم.** بازبین برای یافتن
سطح ششم `pg_stat_statements` را پرسید که نقش `anon` واقعاً **چه چیزی اجرا
کرده**. این روش به شکل کد وابسته نیست و با `fetch` دستی هم دور نمی‌خورد —
دقیقاً همان چیزی که BLOCKER 1 را از هر دو جست‌وجوی من پنهان کرده بود.

سطح ششمی نبود. ولی دو شیء بیرون آمد که در فهرست نام‌بردهٔ bootstrap ممیزی نبودند:
`notification_queue` (۱۵ بار به‌عنوان anon) و `presence_logs` از راه
`is_user_online`. مسیرشان عمومی نیست — زیر `AppHeader` یعنی پوستهٔ احرازشده — ولی
کامپوننت پیش از چسبیدن توکن شلیک می‌کند. یک REVOKE دسته‌جمعی که از فهرست ممیزی
ساخته شود، **اولین رندر زنگ اعلان را در هر بار بارگذاری صفحه ۴۰۱ می‌کند.**
به بخش ریسک ممیزی افزوده شد.

**MINOR 14 — جدول پذیرش کهنه شده بود.** درست بود: هنوز «سرشماری ۲۱۱» و «۱۰
فایل» می‌گفت در حالی که برنچ ۱۸ فایل و سرشماری ۲۱۶ دارد. کل جدول **دوباره
اجرا** شد، نه کپی.

### آنچه بازبین تأیید کرد

هر دو BLOCKER دور اول واقعاً بسته؛ گرنت‌های ۳۷۷ no-op کاتالوگی بودند همان‌طور که
ادعا شده بود؛ رقم acl-digest حالا **دقیقاً بازتولید می‌شود**
(`5e31cb642a399d0370f56da643424a2d`)؛ ممیزی همچنان بدون هیچ `REVOKE`؛ اعداد
اصلاح‌شده بازتولید می‌شوند؛ و **سرشماری sequenceها در ۳۷۸ درست انجام شده بود** —
هر سه حملهٔ او را با نام گرفت.

و دربارهٔ تخطی ترتیبی که خودم افشا کردم: بازبین آن را «قاعده شکسته شد، شیء سالم
است» ارزیابی کرد و مستقل تأیید کرد که ۳۷۷ سه گرنتِ از پیش موجود است.

## گام بعدی

بازبینی دور سوم.
