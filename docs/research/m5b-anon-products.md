# M5B — بستن نشتی ستون‌های محصول برای `anon` (OG-49) و بررسی webhookهای عمومی (OG-50)

> **production لمس نشد.** هیچ دستوری به `192.168.170.10` اشاره نکرد.
> پایه: `staging @ fdaf963a` (تأیید شد). شاخه: `feature/m5b-anon-products`.
> مهاجرت‌ها: **۳۸۸** (اصلاح) و **۳۸۹** (بستن مسیر definer + تعمیر دروازهٔ ۳۸۸ + آشتی با ۳۸۰).
> هر ادعا با دستور و خروجی واقعی‌اش می‌آید.

---

## ۰.۳ — پرسش تعیین‌کننده، اول از همه

سند مأموریت درست گفت که این یک واقعیت کل ایمنی اصلاح را تعیین می‌کند: **`/api/public/products`
با کدام نقش به PostgREST وصل می‌شود؟**

```ts
const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_PUBLISHABLE_KEY!,   // ← کلید anon
  …);
const { data: rows } = await supabase
  .from("products")
  .select("id, name, model, capacity, stock_status, is_active")
  .eq("is_active", true)
  .neq("stock_status", "unavailable")
  .order("name", { ascending: true });
```

**به‌عنوان `anon`.** پس هر باریک‌کردنی باید این شش ستون را نگه دارد — و PostgREST برای ستونی که
فقط در `order=` یا فیلتر بیاید هم SELECT می‌خواهد، پس `name`، `is_active` و `stock_status` هم
به همان دلیل دوم لازم‌اند.

## ۰.۱ — سرشماری ستون‌ها، و دو لایه‌ای که نباید قاطی شوند

```
table-level SELECT on products for anon: true
column-level grants in information_schema for anon on products: 28
attacl (column ACLs) set on any products column: 0
relacl: {postgres=arwdDxt/postgres,anon=arwdDxt/postgres,
         authenticated=arwdDxt/postgres,service_role=arwdDxt/postgres}
```

**آن ۲۸ ردیف `column_privileges` مشتق از گرنت جدول‌اند، نه گرنت ستونی** — `attacl` صفر است.
این تمایز مهم است چون شکل اصلاح را تعیین می‌کند.

```
RLS enabled=true  FORCE=false
policy products_public_read              roles={anon} cmd=SELECT qual=(is_active = true)
policy public_api_read_active_products   roles={anon} cmd=SELECT qual=(is_active AND stock_status <> 'unavailable')
```

سیاست‌های permissive با OR جمع می‌شوند، پس اولی به‌تنهایی همان ۳۵۵ ردیف را می‌دهد.

**لایهٔ ستون و لایهٔ ردیف جدا هستند و این مأموریت فقط لایهٔ ستون را عوض می‌کند.** باریک‌کردن
ردیف‌ها تصمیم OG-30 است.

## ۰.۲ — چه چیزی واقعاً اجرا شده

> **هشدار روش‌شناختی، دو تا:** `pg_stat_statements` در ۲۰۲۶-۰۸-۲۴ در M6 صفر شد، و **probeهای
> خودِ من در همان جدول می‌نشینند** — همان‌طور که M4 و M5 هم مجبور شدند بگویند.

`anon` از دقیقاً سه جدول ردیف می‌گیرد: `products` ۳۵۵، `brands` ۴۰، `categories` ۱۲. بقیه
صفر ردیف یا ۴۰۱.

## ۰.۵ — هر مسیر `anon` که ستون‌های `products` را لمس می‌کند

| مسیر | ستون‌های لازم (خروجی + فیلتر + order) |
|---|---|
| `/api/public/products` | `id, name, model, capacity, stock_status, is_active` |
| `src/lib/public/get-public-sale-list.ts:100` | `id, name, description, brand_id, category_id` |
| specهای e2e با `ANON_KEY` | `products?select=id` و `products?select=id,name` |

**هیچ‌کدام `select=*` نمی‌زند** — همان چیزی که گرنت ستونی را امن می‌کند. مسیر
`get-public-sale-list` امروز مرده است (SELECT روی `sale_lists` اول با ۴۲۵۰۱ می‌افتد، OG-32)
ولی ستون‌هایش نگه داشته شدند تا برای هرکس OG-32 را تعمیر کند شکستی کاشته نشود.

مسیرهای bot (`api.public.bot.*`) از `supabaseAdmin` و RPC اختصاصی استفاده می‌کنند، نه `anon`.

## طبقه‌بندی ستون‌ها — با شاهد، نه از روی نام

```
sku              355/355   'AFK-2026-00001'
created_by       355/355   uuid   ← پنج مقدار متمایز، هر پنج به پروفایل کارمند واقعی
updated_by       353/355   uuid
base_currency    355/355   'aed'        ارزی که کالا با آن خریده می‌شود
product_type     355/355   'foreign'    سیگنال تأمین: داخلی یا وارداتی
dedup_key        349/355   '<uuid>|<hash>'  شناسهٔ داخلی رکوردهای دیگر را حمل می‌کند
status           355/355   'active'     چرخهٔ عمر داخلی، متمایز از is_active
promotion_weight 355/355   1            وزن رتبه‌بندی داخلی
accounting_code    5/355   '7009'
technical_notes    1/355 · torob_url 1/355 · barcode 0/355 · received_at 0/355 · category 0/355
```

**هیچ ستون قیمت یا بها روی این جدول نیست** — قیمت‌ها در `product_computed_prices` زندگی
می‌کنند. پس این هرگز نقض OG-29 نبود.

```
KEPT   9: id, name, model, capacity, stock_status, is_active, brand_id, category_id, description
REVOKED 19: sku, accounting_code, created_by, updated_by, dedup_key, base_currency, product_type,
            status, promotion_weight, technical_notes, torob_url, barcode, received_at, category,
            color, primary_spec, unit, created_at, updated_at
```

**keep-list نوشته شد نه revoke-list، عمداً:** ستونی که فردا اضافه شود با keep-list به `anon`
داده نمی‌شود. fail-closed.

## مکانیزم — گرنت ستونی، و چرا نه view

ریسکی که گرنت ستونی را خطرناک می‌کند `select=*` است، و هیچ مسیر `anon`ی آن را نمی‌زند (بالا).
مسیر view دو خطر داشت که این ندارد: `CREATE OR REPLACE VIEW` مقدار `reloptions` را **بی‌صدا
می‌اندازد** (سنجیده در M4)، و شیء تازه باید در برابر OG-25 دوباره تأیید شود.

**و بعداً معلوم شد هیچ‌کدام از دو مکانیزم لایهٔ درست نبودند** — پایین.

---

## اشتباهی که دروازهٔ خودم گرفت، و دو بار دیگر تکرارش کردم

پیش‌نویس اول ۳۸۸ `GRANT` را قبل از `REVOKE` گذاشت، با این استدلال که وگرنه پنجره‌ای بدون
دسترسی می‌ماند. **هر دو نیمهٔ استدلال غلط بود:**

```
388: anon LOST a public product column: brand_id, capacity, category_id, description, id…
```

`REVOKE SELECT ON <table> FROM <role>` امتیاز **ستونی** را هم پاک می‌کند، پس گرنت‌دادن و بعد
revokeکردن گرنت‌ها را می‌شوید. و پنجره‌ای هم نیست، چون مهاجرت با `--single-transaction` اعمال
می‌شود.

**همین تله دو بار دیگر مرا زد**، هر دو بار در ساختن اختلال برای کوبیدن دروازه: اختلال‌های
E1/F1/F2 اول «PASSED» گزارش شدند چون خودِ اختلال ساخته نشده بود، نه چون دروازه نابینا بود.
سه بار تکرار یعنی این را باید نوشت نه به خاطر سپرد:

> **در PostgreSQL، برای ساختن حالتِ «گرنت ستونی بدون گرنت جدول»، اول `REVOKE` سطح جدول و بعد
> `GRANT` ستونی. ترتیب برعکس، حالت را نمی‌سازد — پاکش می‌کند.**

---

## بازبینی مستقل — دور ۱ و ۲، هر دو **CHANGE**

### H1 (HIGH) — **مهاجرت ۳۸۸ نشتی را نبست**

بازبین `sku` را با همان کلید anon منتشرشده بیرون کشید. خودم بازتولیدش کردم:

```
public.find_duplicate_product(uuid,uuid,text,text,text,uuid)
  secdef=true  volatility=s  anon_EXECUTE=true  PUBLIC_EXECUTE=true
  returns: TABLE(id uuid, name text, sku text)
  body has an auth guard? false

گام ۱ (anon): /rest/v1/products?select=brand_id,category_id,capacity
              -> [{"brand_id":"c1a39a59-…","category_id":"a93be3f8-…","capacity":"24000"}]
گام ۲ (anon): /rest/v1/rpc/find_duplicate_product?p_brand_id=…&p_category_id=…&p_capacity=24000
              -> [{"id":"dffc51af-…","name":"کولر24هزارجنرال گلد","sku":"AFK-2026-00003"}]
```

**`SECURITY DEFINER` از هر دو لایه‌ای که ۳۸۸ به آن تکیه کرده رد می‌شود** — گرنت ستونی و RLS —
چون بدنه به‌عنوان `supabase_admin` اجرا می‌شود. و چهار ورودی از پنج‌تا دقیقاً ستون‌هایی‌اند که
۳۸۸ **عمداً باز نگه داشته**. ادعای خودِ ۳۸۸ که «هر مسیر anon شمرده شد» همان چیزی است که باید
می‌گرفتش. **view باریک هم نمی‌بستش** — تابع definer از هر دو مکانیزم یکسان رد می‌شود.

**و تنها همین یکی است — با جارو، نه با نمونه‌گیری.** ۲۷ تابع anon-executable که ستونی از فهرست
بازپس‌گرفته را لمس می‌کنند از کاتالوگ شمرده شدند، و هر `STABLE` بدون نگهبانِ ایستا واقعاً
به‌عنوان `anon` صدا زده شد. `VOLATILE`ها خوانده شدند نه صدا زده، چون می‌نویسند:

```
mi_get_emerging_products / mi_get_price_movers / mi_get_seller_favorite_products /
mi_get_seller_top_products / mi_get_top_checked_today / mi_get_trending_products
    -> {"code":"P0001","message":"unauthenticated"}    نگهبان دارند؛ regex ایستای من شکلش
                                                        را ندید، فراخوان واقعی حلش کرد
asan_list_sales_export / search_product_ids / get_sales_search_products  -> نگهبان دارند
bot_get_product_for_key / bot_list_products_for_key -> کلید-محور؛ bot_api_keys به anon []
products_assign_sku / sync_product_price_observatory_row -> توابع trigger، endpoint نیستند
find_duplicate_product -> **تنها یکی که جواب داد**
```

### H2 (HIGH) — **۳۸۸ دروازهٔ مهاجرت ۳۸۰ را می‌شکند**

خودم اجرایش کردم روی پایگاه پس از ۳۸۸:

```
ERROR:  380: the anon privilege census drifted.
  expected-but-absent : {"r:products=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE"}
  found-but-unexpected: {"r:products=DELETE,INSERT,REFERENCES,TRIGGER,TRUNCATE,UPDATE"}
```

و یک تعارض دوم و تیزتر — قاعدهٔ ۳۸۰ بند ۳، عیناً:

> «`anon` فقط جایی امتیاز ستونی دارد که همان امتیاز را در سطح جدول هم داشته باشد. گرنت ستونی
> که فراتر از گرنت جدول برود، برای بند ۲ نامرئی است، چون ACL ستونی هرگز `relacl` را تکان
> نمی‌دهد.»

یعنی ۳۸۸ از دقیقاً همان سازه‌ای ساخته شده که ۳۸۰ ممنوعش کرده.

**ولی این نقصِ انتخاب مکانیزم نیست، و صادقانه‌بودن اقتضا می‌کند این را بگویم:** **هر** اصلاحی
برای OG-49 که SELECT سطح-جدول را بردارد این سرشماری را می‌شکند — view باریک هم همان ردیف را
جابه‌جا می‌کرد **به‌علاوهٔ** افزودن شیئی که سرشماری باید حملش کند. سرشماری برای گرفتن تغییر
**ناخواسته** ساخته شده. ۳۸۸ تغییری عمدی داد و **پین را به‌روز نکرد** — و آن گام همراه چیزی
است که جا انداختم.

### M2 — حفرهٔ دروازهٔ ۳۸۸

۳۸۸ دو **فهرست نام‌برده** را می‌سنجید. بازبین با افزودن ستون تازه و گرنت‌دادنش به `anon` ردش
کرد: ستون در هیچ فهرستی نیست، پس هیچ‌چیز نگاهش نمی‌کند. **سنجیدن فهرست همان سنجیدن مجموعه
نیست.**

### آنچه بازبین سنجید و ۳۸۸ درست بود

هر مسیر مستقیم بسته است — `select=*`، ستون‌به‌ستون، فقط-`order=`، فقط-فیلتر، `like` به‌عنوان
oracle، `or=`/`and=`/`not.and=`، alias، و همهٔ شکل‌های embed → ۴۲۵۰۱.
`/api/public/products` ۲۰۰ با ۱۹۹ محصول و هفت کلید و `price: 0`.
`authenticated` و `service_role` هر ۲۸ ستون. ردیف‌ها ۳۵۵ و دو سیاست دست‌نخورده.
`388-down.sql` معکوس دقیق. **و دروازهٔ ۳۸۸ از تلهٔ `PUBLIC` رد نشد** — `has_column_privilege`
گرنت به `PUBLIC` را می‌بیند، و بازبین دو بار از آن راه حمله کرد و هر دو بار گرفته شد. پنج
دروازهٔ قبلی این برنامه دقیقاً از همان تمایز افتاده بودند.

---

## مهاجرت ۳۸۹ — پاسخ به هر سه

**۱. H1:** دو `REVOKE`، از `anon` **و** از `PUBLIC`.

```
proacl: {=X/supabase_admin, supabase_admin=X, anon=X, authenticated=X, service_role=X, postgres=X}
```

آن `=X` ابتدایی `PUBLIC` است. **PostgreSQL به‌طور پیش‌فرض EXECUTE توابع را به PUBLIC می‌دهد**،
پس revoke از `anon` تنها هیچ نمی‌کند — همان تله‌ای که مهاجرت ۳۸۱ دو بار برایش نوشته شد.

و فراخوان واقعی نمی‌شکند. دقیقاً یکی هست — `src/lib/products/duplicate-check.ts:23` از کلاینت
مرورگر، یعنی `authenticated`. سنجیده داخل `BEGIN … ROLLBACK` پیش از نوشتن فایل:

```
BEFORE            anon=true   authenticated=true  service_role=true  PUBLIC=true
AFTER-revoke-only anon=false  authenticated=true   ← گرنت صریح خودش را دارد
```

پس ۳۸۹ هیچ GRANT جبرانی ندارد؛ افزودنش یعنی دادن چیزی که پس گرفته نشده.

**۲. M2:** دروازه به **برابری مجموعه** بازنویسی شد — مجموعهٔ ستون‌هایی که `anon` **واقعاً**
می‌تواند بخواند، محاسبه‌شده روی هر ستون زنده، باید دقیقاً برابر آن نُه باشد. ستون فردا اضافه‌شده
با ساختار گرفته می‌شود نه با یادآوریِ کسی.

**۳. H2:** ردیف سرشماری `r:products` و بند ۳ مهاجرت ۳۸۰ بازنشسته می‌شوند و جایشان قاعده‌ای
می‌آید که **دو حالت را از هم تشخیص می‌دهد**: گرنت ستونی روی هر شیء **دیگری** بدون گرنت جدول
(دسترسی‌ای که از سرشماری فرار می‌کند — همان خطری که ۳۸۰ نوشته بود) در برابر باریک‌کردن عمدی
`products`. و روی خودِ `products` هر امتیاز **غیر-SELECT** در سطح ستون همچنان خطاست.

### کوبیدن ۳۸۹ پیش از اعمال

```
پایهٔ اصلاح‌نشده                                  CAUGHT
the fix itself                                   PASSED
P1 anon regains EXECUTE                          CAUGHT
P2 PUBLIC regains EXECUTE (تلهٔ M3)              CAUGHT
P3 authenticated loses EXECUTE (جهت 386)         CAUGHT
P4 ستون تازه با گرنت به anon (حفرهٔ بازبین)      CAUGHT
P5 ستون تازه بدون گرنت                           PASSED — درست است
P6 sku از راه PUBLIC نه anon                     CAUGHT
P7 یک ستون عمومی از دست رفت                      CAUGHT
P8 تابع rename شد (نگهبان تهی‌بودن)              CAUGHT
E1 گرنت ستونی روی brands بدون گرنت جدول          CAUGHT
E2 base_margin_percent از سرشماری قاچاق شد        CAUGHT
F1 UPDATE در سطح ستون روی products               CAUGHT
F2 INSERT در سطح ستون روی products               CAUGHT
```

**و یک حفرهٔ ظریف که اختلال خودم پیدا کرد:** `has_function_privilege` روی نامی که resolve نشود
**خطای خام PostgreSQL** می‌دهد نه `false`. با نگهبان تهی‌بودن در انتها، rename‌شدن تابع مهاجرت
را با `function … does not exist` می‌انداخت — امن، ولی اپراتور را به جای غلط می‌فرستاد. نگهبان
به **ابتدای** دروازه منتقل شد.

### محدودیتی که پنهان نمی‌شود

در replay کامل و به‌ترتیب، ۳۸۰ پیش از ۳۸۹ اجرا می‌شود و باز روی ردیف کهنهٔ سرشماری می‌افتد.
مهاجرت اعمال‌شده ویرایش نمی‌شود (قاعدهٔ ۶ AGENTS.md)، پس از اینجا رفع‌شدنی نیست — همان
محدودیتی که ۳۸۵ برای پیام بند ۱ مهاجرت ۳۸۴ ثبت کرد، روی مسیر replayی که خودش از قبل شکسته
است: `supabase_migrations.schema_migrations` اصلاً ۳۷۴ تا ۳۸۹ را حمل نمی‌کند.

---

## OG-50 — سه webhook عمومی: **نشتی پیدا نشد**

هر سه فقط `POST` دارند و همه با Bearer token در برابر یک env سمت‌سرور محافظت می‌شوند، و اگر
توکن پیکربندی نشده باشد **اجرا نمی‌کنند** — fail-closed، و در خود کد کامنت شده.

```
POST بدون توکن:
  generate-marketing-tasks   HTTP 401  {"ok":false,"error":"Unauthorized"}
  ingest-market-rates        HTTP 500  {"reason":"MARKET_RATES_CRON_SECRET_not_configured"}
  process-pricing-queue      HTTP 500  {"error":"PRICING_WORKER_TOKEN is not configured"}
POST با توکن غلط:  هر سه 401 / 500
GET:               هر سه 200، ولی فقط پوستهٔ HTML برنامه — نشتی نیست
```

بررسی ترتیب خواندن پیش از هر POST: در هر سه، بررسی توکن **پیش از** هر نوشتن و هر تماس بیرونی
است. `ingest-market-rates` کامنتش می‌گوید چرا: «چون تماس API بیرونی راه می‌اندازد و با کلاینت
service-role می‌نویسد (دور زدن RLS) و هرگز نباید توسط فراخوان بی‌هویت صدا زده شود».

**وضعیت عملیاتی که مالک باید بداند:**

```
MARKETING_TASKS_WORKER_TOKEN = SET          ← این hook زنده و محافظت‌شده است
PRICING_WORKER_TOKEN         = not set      ← worker بازمحاسبهٔ قیمت عملاً بی‌اثر است
MARKET_RATES_CRON_SECRET     = not set      ← ingest نرخ بازار عملاً بی‌اثر است
```

**`api/messenger/ai-chat.ts`** که M5 به‌عنوان `[U]` گذاشته بود: بازبین حلش کرد — هدر
`Authorization` می‌خواهد و بعد `auth.getUser()`؛ POST بی‌هویت ۴۰۱، با کلید anon هم ۴۰۱.
**بسته است.**

---

## آنچه عمداً دست نخورد

**`categories.base_margin_percent`** — حاشیهٔ سود پایه، پرشده روی هر ۱۲ دسته با مقدار `15.00`،
خواندنی برای `anon`. **از هر چیزی روی `products` حساس‌تر است**، ولی جدول دیگری است و تصمیم
OG-49 ستون‌های محصول را نام می‌برد. → **OG-52**

**`effective_currencies_view`** — `security_invoker=true`، `anon` روی view گرنت دارد، و
تعریفش `products.base_currency` و `products.status` را می‌خواند که هر دو بازپس گرفته شدند. پس
برای `anon` از ۲۰۰-با-آرایهٔ-خالی به ۴۲۵۰۱ رفت. **دسترسی عوض نشد، شکل خطا عوض شد** — و هیچ
فراخوان anonی ندارد (تنها فراخوان `src/lib/pricing/effective-currencies.ts` از کلاینت مرورگر
است). ثبت شد، اصلاح نشد. → **OG-53**

**۷۴۰ تابع anon-executable در `public`، که ۳۴۵ تایشان `SECURITY DEFINER`اند.** قلمرو OG-31.
۳۸۹ **یک** تابع را revoke می‌کند، همان که سنجیده شد ستونی را که OG-49 نام می‌برد لو می‌دهد.

**`anon` هنوز `INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER` روی `products` دارد.** امروز
بی‌اثر است چون هیچ سیاست نوشتنی برای `anon` وجود ندارد، پس RLS ردش می‌کند. قلمرو OG-30.

**`calculate_adjusted_price`** — anon-executable، `VOLATILE`، `received_at` را داخلی می‌خواند.
صدا زده **نشد** چون فراخوانی `VOLATILE` می‌نویسد. **حل‌نشده ثبت می‌شود، نه امن ادعا می‌شود.** → `[U]`

---

## عدم قطعیت‌ها

۱. `calculate_adjusted_price` سنجیده نشد (بالا).
۲. `/api/public/bot/*` با کلید bot معتبر آزموده نشد — فقط زنجیرهٔ `bot_api_keys` که به `anon`
   آرایهٔ خالی می‌دهد.
۳. از ۷۴۰ تابع anon-executable، فقط زیرمجموعه‌ای که ستون بازپس‌گرفته را لمس می‌کند سنجیده شد.
   بقیه ممکن است چیز دیگری لو بدهند؛ **ادعایی درباره‌شان نمی‌شود.**
۴. replay in-order آزموده نشد (محدودیت بالا).

---

## ۹. چرخهٔ کنترل‌شدهٔ (الف) — آیا ۳۸۸ رگرسیون داشت؟

اجرای کامل e2e در ۲۰۲۶-۰۸-۲۵ با **۹۲ شکست در ۴٫۷ ساعت** تمام شد، در برابر خط پایهٔ **۴۷ در ۴۶٫۶ دقیقه**.
مقایسهٔ دوطرفه: ۴۶ از ۴۷ هنوز می‌افتند، ۱ بهبود یافت (`products/torob-url-and-excel:235`)، ۴۲ تازه.

سه فرضیه سنجیده شد و دو تا مرد:

| فرضیه | سنجش | نتیجه |
|---|---|---|
| build عوض شده بود | `git log ebff94e2..a19fd811` خالی، diff دو فایل سند | **مرد** — کد یکسان |
| مرورگرهای رهاشدهٔ Playwright | ۷۵ فرایند شمرده شد، **فقط ۲** از Playwright | **مرد** — و این شمارش خودش غلط بود، پایین |
| محیط کند شده بود | HTML در ۰٫۴۲ ثانیه، ولی ۱۴۶ chunk هرکدام ۰٫۱۵–۳٫۱ ثانیه | **ماند** |

**علت واقعی را مالک پیدا کرد، نه این مأموریت.** شانزده فرایند یتیم `chrome-headless-shell`، یکی با ۳٫۷۵
ساعت CPU انباشته، از Playwright **پایتونی** (`site-packages/playwright/driver/...cli.js run-driver`) —
یعنی از ابزار جانبی، نه از اجرای npx مجموعه. الگوی `chrome|node` این نام را نمی‌گیرد. این در OG-54 ثبت شد.

### آزمون A/B روی ماشین تمیزشده

پس از پاک‌سازی (`chrome-headless-shell = 0`, CPU بیکار ۹٪)، `e2e/asan/product-asan-code.spec.ts`
چهار بار اجرا شد — دو بار با ۳۸۸ برگردانده از طریق `388-down.sql`، دو بار با ۳۸۸ اعمال‌شده:

| وضعیت ۳۸۸ | اجرا | نتیجه |
|---|---|---|
| برگردانده (`table SELECT=true`, `attacl=0`) | ۱ | ۵ passed — ۱۸٫۷ ثانیه |
| برگردانده | ۲ | ۵ passed — ۱۴٫۲ ثانیه |
| اعمال‌شده (`table SELECT=false`, `sku=false`, `name=true`, `attacl=9`) | ۳ | ۵ passed — ۱۴٫۹ ثانیه |
| اعمال‌شده | ۴ | ۵ passed — ۱۳٫۹ ثانیه |

**سبز در هر دو نیمه.** همان spec پیش‌تر ۵ شکست داده بود، تماماً روی `page.goto` — یعنی آن شکست‌ها
از یتیم‌ها بود. ۳۸۸ تبرئه است، با سنجش نه با استدلال. سرشماری امضای خطا روی هر ۹۲ بلوک هم
**صفر مورد `42501`** می‌دهد.

## ۱۰. یک هشدار غلط که خودم ساختم، و چرا اینجا نوشته می‌شود

پس از اعمال ۳۸۹، فراخوان زندهٔ `find_duplicate_product` **برای `authenticated` هم** `404 / PGRST202`
داد. نتیجه گرفتم ۳۸۹ تابع را از schema cache انداخته و کار واقعی برنامه را خوابانده، و نظریه ساختم که
`REVOKE ... FROM PUBLIC` نقش `authenticator` را برهنه کرده است.

**هر دو غلط بود.** شاهد کنترل نظریه را کشت: `get_default_purchase_assignee` هم برای `authenticator`
اجازه ندارد و از همان مسیر **۲۰۰** می‌دهد — و ۱۳۲ تابع دیگر در همین وضعیت‌اند که برنامه به آن‌ها RPC می‌زند.
علت واقعی این بود که **نام پارامترها را خودم اشتباه نوشته بودم**: امضای واقعی
`p_brand_id, p_category_id, p_model, p_color, p_capacity, p_exclude_id` است و من `p_name` فرستادم
به‌جای `p_color`. `PGRST202` روی عدم‌تطابق نام پارامتر هم می‌افتد، نه فقط روی نبود تابع.

با نام‌های درست، از `pg_get_function_identity_arguments` و نه از حافظه:

```
authenticated -> 200 :: []
anon          -> 401 :: {"code":"42501","message":"permission denied for function find_duplicate_product"}
```

**درس، که از خودِ اشتباه مهم‌تر است:** `PGRST202` سه علت متفاوت دارد — تابع وجود ندارد، تابع در
cache نیست، نام پارامتر نمی‌خواند — و هر سه یک متن می‌دهند. تشخیص دادن بینشان با حدس ممکن نیست؛
شاهد کنترل لازم است. اگر کنترل را نگرفته بودم، مهاجرتی سالم را به‌عنوان رگرسیون گزارش می‌کردم و
مأموریت را متوقف.
