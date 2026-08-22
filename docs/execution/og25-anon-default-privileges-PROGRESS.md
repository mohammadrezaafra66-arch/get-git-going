# OG-25 — بستن قاعدهٔ پیش‌فرض `ALTER DEFAULT PRIVILEGES … TO anon` — PROGRESS

## HANDOFF STATE

```
Phase:                OG-25 — close the anon default-privilege tap
Status:               in progress
Branch:               feature/og25-close-anon-default-privileges
Base:                 staging @ 1acbd730  (verified — matches the mission document)
Tasks:                1 of 7
Current task:         Phase 0 complete, Phase 1 next
Blocked by:           nothing
Migrations applied:   none yet (373 reserved; 370/371/372 applied and committed)
REST restarted after: n/a
Backup taken:         n/a — this mission changes privileges only, no data DDL
Typecheck:            not yet run (baseline 70)
Last commit:          1acbd730
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

#### تناقض ثبت‌شده: عدد «۲۱۶ از ۲۲۴» در `deferred.md`

`docs/execution/deferred.md` می‌گوید «۲۱۶ از ۲۲۴ جدول عمومی». امروز عدد
**۲۱۱** است — و آن ۲۱۱ شامل ۷ **view** هم هست، نه فقط جدول. یعنی جدول‌های
خالص **۲۰۴** از ۲۲۴ هستند.

اختلاف را کامل توضیح نمی‌توانم بدهم:

- مهاجرت ۳۷۰ شش **view** را از این مجموعه بیرون برد. اگر عدد اولیه ۲۱۶ شامل
  viewها بوده، انتظار ۲۱۰ می‌رفت؛ ۲۱۱ داریم.
- اگر عدد ۲۱۶ فقط جدول بوده، امروز باید هنوز ۲۱۶ جدول باشد؛ ۲۰۴ داریم.

هیچ‌کدام دقیق جا نمی‌افتد. احتمال قوی این است که `deferred.md` بدون پیوستن به
`pg_class` شمرده و جدول و view را قاطی کرده، و بین ۲۱ مرداد تا امروز چند
گرنت دیگر هم برداشته شده. **این را به‌عنوان تناقض ثبت می‌کنم و عدد امروز را
مبنا می‌گذارم، نه عدد سند.**

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
- `api.healthz`, `api.version`, `sitemap[.]xml`, `index`, `unauthorized`,
  `mcp`, `[.mcp]/*`, `[.well-known]/*`, `__root` — هیچ کوئری پایگاه‌داده‌ای
  ندارند. (`sitemap` صفر ارجاع به `supabase` دارد — بررسی شد.)
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

**پس فهرست دقیقاً همان دو سطحی است که تحلیل ورودی گفته بود — تأیید شد.**

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

## گام بعدی

فاز ۱ — فایل‌های بازگشت، پیش از هر مهاجرت.
