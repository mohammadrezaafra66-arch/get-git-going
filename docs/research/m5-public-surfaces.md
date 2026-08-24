# M5 — سطوح عمومی: OG-29 و OG-32 — سنجش و گزارش

> **مأموریت سنجش است، نه اصلاح.** قیمت عمومی منتشر نشد، `sale-lists` تعمیر نشد، هیچ دادهٔ
> آزمونی ساخته نشد، هیچ مهاجرتی نوشته نشد. **production لمس نشد.**
>
> پایه: `staging @ 9e2e019c` (تأیید شد). شاخه: `feature/m5-public-surfaces`.
> هر ادعا با دستور و خروجی واقعی‌اش می‌آید.

---

## ۰.۱ — مسیرهای بدون نشست، با پیمایش گذرای import

پیمایش از خود فایل مسیر متوقف نمی‌شود: هر `import` محلی دنبال شده و هر شیء داده‌ای که **هر
ماژول در زنجیره** لمس می‌کند ثبت شده. ابزارش در `m5-import-walk.json` است.

**۱۸ مسیر بدون لایهٔ احراز هویت `_app`:**

| مسیر | ماژول‌های زنجیره | اشیائی که لمس می‌شوند | کلاینت |
|---|---|---|---|
| `api/public/products.ts` | ۴ | `products`, `product_computed_prices_public` | `supabase` (anon) + `supabaseAdmin` |
| `api.healthz.ts` | ۱ | `/rest/v1/shop_settings?select=key&limit=1` | anon key |
| `api.version.ts` | ۲ | — | — |
| `public.sale-lists.$listId.tsx` | ۱۴ | `sale_lists`, `sale_list_items`, `products`, `brands`, `categories`, `sale_price_types` + RPC `get_recent_purchase_label`, `refresh_sale_list_prices` | `supabase` (anon) |
| `index.tsx` | ۷ | `profiles`, `user_roles`, `custom_roles` | `supabase` |
| `login.tsx` | ۱۶ | `profiles`, `user_roles`, `custom_roles`, +۱ · RPC ×۱ | `supabase` |
| `register.tsx` | ۱۵ | `profile_field_definitions`, `profile_field_values`, `profiles`, `user_roles`, `custom_roles` · RPC `set_profile_field_value` | `supabase` |
| `pending-approval.tsx` | ۱۰ | `profiles`, `user_roles`, `custom_roles` | `supabase` |
| `reset-password.tsx` | ۸ | — | `supabase` |
| `unauthorized.tsx` / `sitemap[.]xml.ts` | ۱ | — | — |
| `[.well-known]/oauth-protected-resource.ts` | ۳ | — | `supabase` |
| `[.mcp]/list-tools.ts` · `[.mcp]/invoke-tool/$tool.ts` | ۳ | — | `supabase` |
| `api/messenger/ai-chat.ts` | ۷ | `ai_conversations`, `ai_providers`, `ai_usage_routes`, `messenger_group_members`, `messenger_messages` · RPC ×۲ | `supabase` + `supabaseAdmin` |
| `api/public/hooks/process-pricing-queue.ts` | ۹ | **۱۳ جدول** شامل `purchase_prices`, `pricing_rules`, `product_computed_prices`, `suppliers`, `settlement_types` · RPC `claim_pricing_recompute_jobs` | `supabase` + `supabaseAdmin` |
| `api/public/hooks/ingest-market-rates.ts` | ۳ | ۲ جدول · RPC ×۳ | `supabase` + `supabaseAdmin` |
| `api/public/hooks/generate-marketing-tasks.ts` | ۴ | — · RPC ×۱ | `supabase` + `supabaseAdmin` |

**`register.tsx` تأیید شد که واقعاً `profile_field_definitions` را از یک import عمیق‌تر
می‌خواند** — همان الگویی که سند مأموریت هشدارش را داد.

> **نقصی در ابزار خودم که پیدا و اصلاح کردم:** regex اولم `/rest/v1/` را فقط در **ابتدای**
> رشته می‌گرفت، پس `${url}/rest/v1/shop_settings` در `api.healthz.ts` را ندید — دقیقاً همان
> `fetch` دست‌نویسی که M9 پیدا کرده بود. regex گشاد شد و دوباره اجرا شد. **این تنها ارجاع
> `/rest/v1/` قابل‌دسترس از یک مسیر بدون نشست است.**

**سه webhook زیر `api/public/hooks/` بیشترین سطح را دارند** — یکی‌شان ۱۳ جدول از جمله
`purchase_prices` و `pricing_rules`. نگهبانشان سنجیده نشد و در دامنهٔ این مأموریت نبود؛
ثبت می‌شود به‌عنوان **OG-50**.

---

## ۰.۲ — آنچه نقش‌ها **واقعاً** اجرا کردند

> **دو هشدار روش‌شناختی که باید همراه هر عددی بیایند:**
> ۱. `pg_stat_statements` در ۲۰۲۶-۰۸-۲۴ در M6 صفر شد. هرچه پیش از آن تاریخ بوده در بافر نیست.
> ۲. **probeهای خودِ من در همین جدول می‌نشینند.** `sale_lists` و `sale_list_items` هرکدام
>    دقیقاً یک فراخوان `anon` دارند و **آن یکی، curl خودم چند دقیقه پیش بود.**

```
  anon 2309  select set_config('search_path',...)          ← سربار PostgREST
  anon 1222  SELECT "shop_settings"."key" ... LIMIT 1       ← /api/healthz
  anon   50  SELECT "products"....
  anon   23  SELECT "payment_terms"...
  anon   23  SELECT "suppliers"...
  anon   23  SELECT "warehouses"...
  anon   17  SELECT "person_identifiers"...
  anon   15  SELECT "persons"...
  distinct statements: anon 49، authenticated 401
```

> **تفکیکی که نباید از آمار خوانده شود:** برای هر ردیف `s.rows = s.calls`. این **تعداد ردیف
> داده نیست** — PostgREST پاسخ را در یک ردیف JSON می‌پیچد، پس `rows=1` یعنی «یک بدنهٔ پاسخ».
> برای دانستن اینکه `anon` واقعاً چه چیزی گرفت، باید از خودِ HTTP پرسید:

```
  shop_settings                  HTTP 200  rows=0
  products                       HTTP 200  rows=355
  brands                         HTTP 200  rows=40
  categories                     HTTP 200  rows=12
  sale_price_types               HTTP 200  rows=0
  payment_terms/suppliers/warehouses/persons/person_identifiers/
  notification_queue/dashboard_ticker_events/phone_collisions/product_labels
                                 HTTP 200  rows=0
  sale_lists                     HTTP 401  42501
  sale_list_items                HTTP 401  42501
  product_computed_prices_public HTTP 401  42501
```

**`anon` از دقیقاً سه جدول ردیف می‌گیرد: `products` ۳۵۵، `brands` ۴۰، `categories` ۱۲.**
بقیه یا صفر ردیف (سکوت RLS) یا ۴۰۱ (رد امتیاز).

---

## ۰.۳ — `/api/public/products`، بدنهٔ واقعی

```
HTTP   http://192.168.170.8:3100/api/public/products     status=200  bytes=42924
HTTPS  https://test.myafrakala.ir/api/public/products    status=200
payload identical over both protocols: True
```

> **نکتهٔ TLS، سنجیده:** `curl` ویندوزی از schannel استفاده می‌کند و `--cacert` را نمی‌پذیرد؛
> با آن HTTPS خطای `SEC_E_INTERNAL_ERROR` می‌دهد. با Node و
> `NODE_EXTRA_CA_CERTS=…\mkcert\rootCA.pem` کار می‌کند — همان روشی که سند تجویز کرده. بدون آن
> متغیر: `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. hosts فایل هر دو نام را به `192.168.170.8` می‌برد.

**۱. وضعیت:** ۲۰۰ روی هر دو پروتکل.
**۲. تعداد محصول:** ۱۹۹.
**۳. آیا هیچ فیلد قیمتی مقدار واقعی و غیرصفر دارد؟**

```
کلیدی که بررسی شد، دقیقاً: 'price'   (تنها کلید قیمت‌مانند موجود)
price == 0        روی 199 از 199
محصولات با قیمت غیرصفر: 0
محصولات بدون کلید price اصلاً: 0
```

**پاسخ صریح به تفکیکی که سند خواسته بود: کلید `price` روی هر ۱۹۹ محصول *حاضر است و مقدارش
`0`* — این حالت «کلید هست و صفر است» است، نه «کلید غایب است».**

**۴. آیا چیز دیگری لو می‌دهد؟** خودِ endpoint نه:

```
هر کلید موجود: capacity, id, is_active, model, name, price, stock_status
کلیدهای منطبق با الگوی cost/supplier/stock-qty/staff/internal: NONE
```

**ولی مسیر مستقیم REST داستان دیگری دارد.** همان کلید عمومی `anon` روی
`/rest/v1/products?select=*` **۲۸ ستون از ۳۵۵ محصول** می‌دهد:

```
accounting_code, barcode, base_currency, brand_id, capacity, category, category_id,
color, created_at, created_by, dedup_key, description, id, is_active, model, name,
primary_spec, product_type, promotion_weight, received_at, sku, status, stock_status,
technical_notes, torob_url, unit, updated_at, updated_by
```

پرشدگی سنجیده شد:

```
sku              روی 355 از 355   نمونه 'AFK-2026-00003'
created_by       روی 355 از 355
updated_by       روی 353 از 355
accounting_code  روی   5 از 355   نمونه '7430'
description      روی   7 از 355
technical_notes  روی   1 از 355
torob_url        روی   1 از 355
barcode          روی   0 از 355
```

و `created_by` واقعی است، نه زباله:

```
distinct created_by on products = 5; of those resolving to a profile = 5
```

**هیچ ستون قیمت یا بهایی روی `products` وجود ندارد** (قیمت‌ها در `product_computed_prices`
زندگی می‌کنند)، پس **این افشای قیمت نیست**. ولی `sku` و `created_by`/`updated_by` و
`accounting_code` به هر دارندهٔ کلید anon منتشرشده می‌رسد. این پیش از این مأموریت وجود داشته و
از جنس OG-30 است؛ ثبت می‌شود به‌عنوان **OG-49**.

**چرا قیمت صفر است** — خود فایل توضیحش را دارد:

```ts
const PUBLISH_PUBLIC_PRICES = false;
...
if (PUBLISH_PUBLIC_PRICES && ids.length > 0) { … }
price: priceMap.get(row.id) ?? 0,
```

یعنی صفر بودن **عمدی و تحت کنترل یک پرچم** است، نه تصادفی. سربرگ فایل ثبت می‌کند که
از ۲۰۲۶-۰۸-۱۰ به‌طور تصادفی صفر بوده (فیلتر `sale_price_types!inner` که `anon` هیچ ردیفی از
آن نمی‌دید) و G-1 آن صفر تصادفی را به یک پرچم صریح تبدیل کرد.

---

## ۰.۴ — `sale-lists`: خراب است؟ و اگر SELECT موفق می‌شد چه نشان می‌داد؟

### (الف) آیا صفحه خراب است؟ — **نه. با متانت شکست می‌خورد.**

بارگذاری در مرورگر واقعی، **بدون هیچ نشستی** (`storageState: {cookies:[],origins:[]}`):

```
HTTP status : 404
final URL   : /public/sale-lists/4b3a0351-ffcf-4c20-8a1d-628e28b51631
visible text: «محیط تست myafrakala.ir — اطلاعات این بخش واقعی نیست»
              ۴۰۴ لیست فروش یافت نشد
              این لیست وجود ندارد یا هنوز منتشر نشده است.
console errors: Failed to load resource: 404 || [auth-diagnostic] INITIAL_SESSION {hasSession:false}
```

نه صفحهٔ سفید، نه استک‌تریس، نه خطای خام. **یک ۴۰۴ فارسی تمیز.**

ولی متنش **بین دو علتِ کاملاً متفاوت مبهم است**: «وجود ندارد» و «هنوز منتشر نشده» — و علت
واقعی هیچ‌کدام نیست، بلکه **رد امتیاز** است.

### (ب) اگر SELECT موفق می‌شد چه نشان می‌داد؟ — و کدام‌یک از سه علت است

سه علتی که سند خواسته بود از هم جدا شوند، جدا شدند:

```
as anon, in-file BEGIN … ROLLBACK:
  anon SELECT sale_lists       -> DENIED 42501 (privilege, not RLS)
  anon SELECT sale_list_items  -> DENIED 42501 (privilege, not RLS)
  anon SELECT sale_price_types -> 0 rows        (RLS silence; owner sees 3)

over HTTP as anon:
  /rest/v1/sale_lists       401 {"code":"42501","message":"permission denied for table sale_lists"}
  /rest/v1/sale_list_items  401 {"code":"42501","message":"permission denied for table sale_list_items"}
  /rest/v1/sale_price_types 200 []
  /rest/v1/products         200 (rows)
```

**علت اصلی: رد امتیاز، نه سکوت RLS.** پرس‌وجو خطا می‌دهد.

```
anon_SELECT   sale_lists=false  sale_list_items=false
              products=true  brands=true  categories=true  sale_price_types=true
```

**و یک علت دوم پشتش پنهان است:** حتی اگر آن دو گرنت داده شوند، `sale_price_types` برای `anon`
**صفر ردیف** می‌دهد (مالک ۳ می‌بیند) — سکوت RLS. پس عنوان نوع‌قیمت هم رندر نمی‌شد. **بستن یکی
بدون دیگری صفحه را کار نمی‌اندازد.**

### **و یافته‌ای که ترتیب کد پنهانش کرده — یک نوشتنِ راه‌اندازی‌شدنی توسط کاربر بی‌هویت**

`src/lib/public/get-public-sale-list.ts` خط ۵۰:

```ts
await supabase.rpc("refresh_sale_list_prices", { p_list_id: listId });
```

و آن تابع:

```
volatility=v   secdef=true   anon_EXECUTE=true
body contains INSERT/UPDATE/DELETE: true
```

یعنی `VOLATILE`، `SECURITY DEFINER`، **`anon` روی آن EXECUTE دارد**، و بدنه‌اش می‌نویسد.

**امروز اجرا نمی‌شود** — و علتش را از روی کد و تجربی هر دو اثبات کردم. SELECT روی `sale_lists`
در خط ۳۸ **اول** اجرا می‌شود، برای `anon` با ۴۲۵۰۱ خطا می‌دهد، و خط ۴۷ `return null` می‌کند.
RPC خط ۵۰ هرگز نوبتش نمی‌رسد:

```
BEFORE page load:  anon calls to refresh_sale_list_prices = 0
AFTER  page load:  anon calls to refresh_sale_list_prices = 0
sale_list_items rows = 1837  (بدون تغییر)
```

**ولی این یعنی همان رد امتیازی که OG-32 را «خراب» می‌کند، تنها چیزی است که جلوی یک نوشتنِ
بی‌هویت را گرفته.** یک `GRANT SELECT ON sale_lists TO anon` — یعنی دقیقاً بدیهی‌ترین شکل
«تعمیر OG-32» — هم‌زمان مسیر نوشتن را باز می‌کند. → **OG-48**

---

## ۰.۵ — خط پایهٔ لیست‌های منتشرشده

```
total sale_lists = 20   published = 0   distinct statuses = draft
```

**صفر، همان‌طور که انتظار می‌رفت. هیچ دادهٔ آزمونی ساخته نشد.**

---

## فاز ۱ — تنها دروازهٔ این مأموریت

`e2e/security/public-price-exposure.spec.ts` — **۳ از ۳ سبز.**

خاصیتی که ادعا می‌کند: *هیچ سطح عمومی، قیمت واقعی و غیرصفری به فراخوان بی‌هویت نمی‌دهد.*
**دوطرفه** است: هم بی‌هویت چیزی نمی‌گیرد، هم فراخوانِ مجازِ واردشده هنوز داده‌اش را می‌گیرد.
هیچ شمارش ردیفی سنجاق نشده. نگهبان تهی‌بودن دارد.

### کوبیدنِ predicate پیش از اعتماد — و حفره‌ای که پیدا شد

```
A1 all prices 0            -> PASS
A2 one real price appears  -> FAIL: 1 product(s) carry a non-zero price
A3 price key renamed       -> FAIL: 1 product(s) carry a non-zero price
A4 feed emptied entirely   -> FAIL: vacuity guard - feed empty
A5 price present as string -> PASS      ← حفره
```

**A5 حفرهٔ واقعی بود:** `typeof v === "number"` مقدار `"12500000"` را رد می‌کند، و
**PostgREST ستون‌های `numeric` را دقیقاً به‌صورت رشتهٔ JSON برمی‌گرداند.** predicate تعمیر شد
تا رشتهٔ عددی را هم بگیرد. **دروازه یک بار تعمیر شد؛ دروازهٔ دومی ساخته نشد.**

---

## **یافتهٔ اصلی این مأموریت — پیامد ثبت‌نشدهٔ M4**

اجرای اول دروازه **قرمز** بود، و علتش یک باگ در دروازه نبود:

```
service_role JWT claims = {'exp':…, 'iss':'supabase', 'role':'service_role'}
has 'sub': False

as service_role (no sub) : uid()=NULL      product_computed_prices_public=0   v_promotion_suggestions=0
as service_role (WITH sub): uid()=05098088 product_computed_prices_public=588
```

**`service_role` — نقشی که کل خط لولهٔ سمت‌سرور استفاده می‌کند — از هر هشت view کلاس نگهبان
صفر ردیف می‌گیرد**، چون JWT‌اش ادعای `sub` ندارد، پس `uid()` تهی است و predicate مهاجرت ۳۸۶
(`uid() IS NOT NULL`) می‌بنددش. **بی‌صدا: صفر ردیف، بدون خطا.**

M4 این را نسنجیده بود — پذیرشش admin/accountant/sales (که همه `sub` دارند) و uid تهی را
سنجید، ولی هرگز `service_role` از مسیر PostgREST را.

**دامنهٔ اثر امروز: صفر.** تنها خوانندهٔ سمت‌سرور از این view‌ها این است:

```
src/routes/api/public/products.ts:108   supabaseAdmin.from("product_computed_prices_public")
```

و پشت `PUBLISH_PUBLIC_PRICES = false` است، پس اجرا نمی‌شود. بقیهٔ خواننده‌ها سمت‌کلاینت‌اند
(`supabase`، نشست واردشده) و `sub` دارند.

**ولی تلهٔ نهفته است:** لحظه‌ای که مالک OG-29 را «منتشر کن» پاسخ دهد و پرچم `true` شود،
feed **باز هم صفر منتشر می‌کند** — بی‌صدا، بدون خطا، بدون هیچ سیگنالی. → **OG-51**

به همین دلیل نیمهٔ دوطرفهٔ دروازه از JWT کارمندِ واردشده استفاده می‌کند نه از کلید
service_role: ادعای `service_role > 0` دروازه را برای همیشه قرمز می‌کرد، و ادعای
`service_role = 0` این غافلگیری را به‌عنوان رفتار درست تثبیت می‌کرد. هیچ‌کدام صادقانه نیست.

---

## فاز ۲ — خط رگرسیون

```
G-1     0 of 8 views where anon holds ANY privilege (must be 0)          ✔
OG-25   new view anon_SELECT=false   new seq anon_USAGE=false            ✔
M3      get_recent_purchase_label as anon: HTTP 401, anon_EXECUTE=false  ✔
M9      rolbypassrls anon=false  authenticated=false                     ✔
M6      e2e/phase6/m6-route-guard.spec.ts  59 passed                     ✔
M4      views with the exact 387 tail: 8 of 8                            ✔
        security_invoker=true on: product_computed_prices_public,
                                   v_promotion_suggestions               ✔ (by name)
digest  a51ee08e55ff48453d7a2925f1c5d098|1105|841  = reference           ✔
typecheck  70  (baseline exactly 70)                                     ✔
APP_GIT_SHA  a19fd811   —   build performed by this mission: NO
```

### مجموعهٔ e2e — **عمداً اجرا نشد، با دلیل**

سند اجازه می‌دهد در صورت صفر بودن تغییر کد، با استدلال صرف‌نظر شود. این مأموریت **صفر فایل
`src/`** عوض می‌کند:

```
git diff --name-only 9e2e019c..HEAD -- src/     →  (خالی)
```

تنها فایل کد، یک spec **تازه** است که فقط GET می‌زند و روی هیچ spec دیگری اثر ندارد. در مقابل،
اجرای کامل مجموعه **می‌نویسد** — رسید و پیش‌فاکتور و سند می‌سازد، و همان شمارش
`payment_receipts` را جابه‌جا می‌کند که OG-43 و OG-46 رویش بازند. **ارزش تشخیصی صفر در برابر
آلودن دو Owner-Gate باز.** پس اجرا نشد، و خط پایهٔ ۴۷ (OG-43/OG-47) دست‌نخورده می‌ماند.

---

## احکام

**OG-29 — هیچ قیمت واقعی روی هیچ سطح عمومی منتشر نمی‌شود.**
`/api/public/products` روی هر ۱۹۹ محصول `price: 0` می‌دهد (کلید حاضر، مقدار صفر). منبع قیمت
`product_computed_prices_public` برای `anon` ۴۰۱ است. **این رفتار درست است و اصلاح نشد.**

**OG-32 — `sale-lists` خراب است، ولی نه به شکلی که ثبت شده بود.** صفحه یک ۴۰۴ فارسی تمیز
می‌دهد، نه صفحهٔ سفید. علت **رد امتیاز** است نه سکوت RLS، و پشتش یک علت دوم (`sale_price_types`
صفر ردیف) پنهان است. **تعمیر نشد.** و همان رد امتیاز تنها چیزی است که جلوی یک نوشتنِ
بی‌هویت را گرفته (OG-48).

---

## Owner-Gateهای تازه

**OG-48 — تعمیر بدیهی OG-32 هم‌زمان یک نوشتنِ بی‌هویت را باز می‌کند.**
`get-public-sale-list.ts:50` تابع `refresh_sale_list_prices` را صدا می‌زند: `VOLATILE`،
`SECURITY DEFINER`، `anon` روی آن EXECUTE دارد، بدنه‌اش `INSERT/UPDATE/DELETE` دارد. امروز
اجرا نمی‌شود چون SELECT قبلش با ۴۲۵۰۱ می‌افتد و تابع `return null` می‌کند — تجربی اثبات شد
(صفر فراخوان پیش و پس از بارگذاری صفحه). یک `GRANT SELECT ON sale_lists TO anon` این را
فعال می‌کند. **هر تعمیر OG-32 باید اول تصمیم بگیرد `anon` حق EXECUTE روی آن RPC را دارد یا نه.**

**OG-49 — `anon` بیست‌وهشت ستون از ۳۵۵ محصول می‌گیرد، نه هفت.**
endpoint عمومی هفت کلید منتشر می‌کند، ولی `/rest/v1/products?select=*` با همان کلید anon
`sku` (۳۵۵/۳۵۵)، `created_by` (۳۵۵/۳۵۵، هر پنج uuid به پروفایل واقعی می‌رسند)،
`updated_by` (۳۵۳/۳۵۵) و `accounting_code` (۵/۳۵۵) می‌دهد. **قیمت نیست** — `products` اصلاً
ستون قیمت ندارد — پس OG-29 نقض نشده. از جنس OG-30 است و پیش از این مأموریت وجود داشته.

**OG-50 — سه webhook زیر `api/public/hooks/` سنجیده نشدند.**
`process-pricing-queue` از زنجیرهٔ importش **۱۳ جدول** لمس می‌کند، شامل `purchase_prices`،
`pricing_rules`، `product_computed_prices`، `suppliers`. نگهبانشان (اگر داشته باشند) در دامنهٔ
M5 نبود. **`[U]` — سنجیده نشده، و ادعایی هم درباره‌شان نمی‌شود.**

**OG-51 — `service_role` از هر هشت view کلاس نگهبان صفر ردیف می‌گیرد.**
JWT سرویس‌رول `sub` ندارد، پس `uid()` تهی است و predicate مهاجرت ۳۸۶ می‌بنددش — بی‌صدا.
امروز اثرش صفر است (تنها خوانندهٔ سمت‌سرور پشت `PUBLISH_PUBLIC_PRICES = false` است)، ولی
**لحظه‌ای که OG-29 پاسخ «منتشر کن» بگیرد، feed باز هم صفر منتشر می‌کند بدون هیچ خطایی.**
تصمیم لازم: آیا view‌ها باید `service_role` را استثنا کنند، یا فراخوان سمت‌سرور باید
`sub` بفرستد، یا پرچم انتشار باید اول این را بسنجد.

---

## عدم قطعیت‌ها — جایی که مطمئن نیستم می‌گویم نیستم

۱. **نگهبان سه webhook سنجیده نشد** (OG-50). نمی‌دانم بی‌هویت‌اند یا کلید می‌خواهند.
۲. **`api/messenger/ai-chat.ts`** پنج جدول و دو RPC لمس می‌کند و زیر `_app` نیست. نگهبانش را
   نسنجیدم؛ دو توکن نگهبان‌مانند دارد ولی اثرش آزموده نشد.
۳. **`[.mcp]` و `[.well-known]`** فقط شمارش ماژول شدند؛ رفتار زمان اجرایشان سنجیده نشد.
۴. **HTTPS فقط از این ماشین سنجیده شد** و فقط با Node. از دستگاه دیگری روی LAN آزموده نشد.
۵. `sale_lists` و `sale_list_items` هرکدام یک فراخوان `anon` در `pg_stat_statements` دارند و
   **آن یکی probe خودم بود** — نه ترافیک واقعی کاربر.

---

## مرزها

**production لمس نشد.** هیچ دستوری به `192.168.170.10` اشاره نکرد.
صفر مهاجرت، صفر DDL، صفر `INSERT`/`UPDATE`/`DELETE`، صفر restart، صفر build، صفر دادهٔ آزمون.
تنها probeای که نقش عوض کرد داخل `BEGIN … ROLLBACK` نوشته‌شده در خود فایل بود، با اثبات بازگشت.
مجموعهٔ کامل e2e اجرا نشد، با دلیل. `deploy/lan/.env.lan` و پشتیبان‌هایش نه خوانده‌شده چاپ
شدند و نه commit.
