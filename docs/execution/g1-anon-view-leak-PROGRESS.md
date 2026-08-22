# G-1 — نشت داده به کاربر ناشناس روی کلاس view نگهبان `is_viewer_only` — PROGRESS

## HANDOFF STATE

```
Phase:                G-1 — anon view leak remediation
Status:               in progress
Branch:               feature/g1-anon-view-leak
Base:                 staging @ e209218b
Tasks:                5 of 7
Current task:         Phase 4 — independent review dispatched
Blocked by:           nothing
Migrations applied:   370 (2026-08-22, psql exit 0, gate NOTICE green)
REST restarted after: yes — docker restart afrakala-lan-rest, container Up
Backup taken:         n/a — this mission applies REVOKE/ALTER VIEW only, no data DDL
Typecheck:            70 / 70 baseline
Last commit:          c7dd8771 (docs + migration + rollback, before apply)
PR:                   not yet opened
```

## تصمیم گزینه — و اینکه از کجا آمد

پرسش پیش‌پرواز به مالک این بود که کدام درمان اعمال شود:

- **(الف)** `REVOKE … FROM anon` روی viewهای نشتی
- **(ب)** `security_invoker = true` تا RLS جدول پایه به‌جای مالک view اعمال شود
- **(ج)** بازنویسی خود `is_viewer_only` تا وقتی هویتی وجود ندارد بسته بماند
- **(د)** «بگذار خودم انتخاب کنم»

**پاسخ مالک: (د).**

طبق قاعده‌ای که *پیش از* پرسیدن در سند مأموریت تثبیت شده بود، پاسخ (د) به این معناست:

> **(الف)** گرفته می‌شود، و **(ب)** فقط روی viewهایی که فاز ۰ ثابت کند هیچ خوانندهٔ
> `authenticated` را نمی‌شکند، **به‌علاوه** اعمال می‌شود. **(ج)** به‌صورت خودمختار
> انجام نمی‌شود؛ به‌جایش به‌عنوان Owner-Gate مطرح می‌شود.

پس منبع تصمیم **این قاعده** است، نه انتخاب مستقیم مالک. مالک انتخاب را واگذار کرد.

---

## فاز ۰ — سنجش، پیش از هر تغییر

هیچ‌چیز در این فاز نوشته نشد. آزمون‌های DDL داخل `BEGIN … ROLLBACK` اجرا شدند و
بازگشتشان جداگانه تأیید شد. تولید (`192.168.170.10`) لمس نشد — نه کوئری، نه پینگ.

### ۰.۱ — اشتقاق کلاس نگهبان

فهرست هاردکد نشد؛ از کاتالوگ زنده مشتق شد:

```sql
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='v' AND pg_get_viewdef(c.oid) ILIKE '%is_viewer_only%';
```

**۸ view** — دقیقاً همان عددی که Gate A انتظار داشت. تناقضی نبود.
همه متعلق به `supabase_admin` و هیچ‌کدام `reloptions` ندارند.

```
product_computed_prices_public
publish_recipients_view
v_dynamic_customer_capital_balances
v_dynamic_salesperson_capital_balances
v_promotion_suggestions
vw_account_balances
vw_customer_receivables
vw_supplier_payables
```

### ۰.۲ — سابقهٔ `security_invoker`

**۱۰ view** از پیش `security_invoker=true` دارند. مجموع viewهای `public` = **۲۰**.

نکتهٔ مهم: این دو مجموعه **کاملاً مجزا** هستند —

```sql
-- viewهایی که هم security_invoker دارند و هم is_viewer_only را صدا می‌زنند:
0
```

یعنی ۱۰ view پیشین به RLS جدول پایه تکیه می‌کنند، نه به تابع نگهبان. پس
`security_invoker` در این مخزن الگوی جاافتاده‌ای است و اختراع تازه نیست.

### ۰.۳ — گرنت‌ها

`anon` روی ۶ view از ۸ گرنت دارد — و نه فقط `SELECT`، بلکه
`DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE`. همان مجموعه برای
`authenticated` هم صادر شده است.

| view | گرنت anon |
|---|---|
| `product_computed_prices_public` | بله |
| `publish_recipients_view` | بله |
| `v_dynamic_customer_capital_balances` | بله |
| `v_dynamic_salesperson_capital_balances` | بله |
| `v_promotion_suggestions` | بله |
| `vw_account_balances` | بله |
| `vw_customer_receivables` | **خیر** |
| `vw_supplier_payables` | **خیر** |

### ۰.۴ — طبقه‌بندی HTTP ناشناس

**یک خطای سنجش که باید ثبت شود:** نخستین اجرا هر ۲۰ view را `REFUSED` نشان داد.
علت نبودِ حفاظت نبود — کلیدی که برداشته بودم اصلاً JWT نبود
(`SUPABASE_ANON_KEY` در `.env.example`، ۳۲ کاراکتر، یک بخش). کلید واقعی
`ANON_KEY` در `deploy/lan/.env.lan` است (۱۶۹ کاراکتر، سه بخش،
`role=anon, iss=supabase`). با کلید غلط، «همه‌چیز امن است» گزارش می‌شد. سنجش
با کلید درست تکرار شد و نتیجهٔ زیر معتبر است.

از `http://192.168.170.8:9000/rest/v1/<view>?select=*&limit=3`:

| view | کد | ردیف | طبقه |
|---|---|---|---|
| `product_computed_prices_public` | ۲۰۰ | ۳ | **LEAKING** |
| `publish_recipients_view` | ۲۰۰ | ۳ | **LEAKING** |
| `v_promotion_suggestions` | ۲۰۰ | ۳ | **LEAKING** |
| `vw_account_balances` | ۲۰۰ | ۱ | **LEAKING** |
| `v_dynamic_customer_capital_balances` | ۴۰۱ | — | REFUSED |
| `v_dynamic_salesperson_capital_balances` | ۴۰۱ | — | REFUSED |
| `vw_customer_receivables` | ۴۰۱ | — | REFUSED |
| `vw_supplier_payables` | ۴۰۱ | — | REFUSED |

ده view دیگر (خارج از کلاس نگهبان) هم سنجیده شدند: هفت‌تا REFUSED یا صفر ردیف،
و `v_pricing_recompute_queue_summary` یک ردیف — که در ۰.۹ روشن شد نشت نیست.

### ۰.۵ — دو ۴۰۱ مربوط به `v_dynamic_*` حل شد

Gate A این دو را «حل‌نشده» گذاشته بود. بدنهٔ پاسخ نشان می‌دهد:

```
42501 permission denied for function _capital_alloc_used
```

پس **گرنت جلویشان را نگرفته است** — گرنت `SELECT` دارند. چیزی که مانع شده نبودِ
`EXECUTE` روی یک تابع کمکی است. این سدی **اتفاقی** است، نه طراحی‌شده: اگر ACL آن
تابع روزی عوض شود، این دو view هم بی‌سروصدا نشت می‌کنند. با گزینهٔ (الف) این
وابستگی شکننده حذف می‌شود.

دو ۴۰۱ دیگر (`vw_customer_receivables`, `vw_supplier_payables`) واقعی‌اند —
هیچ گرنتی به `anon` ندارند.

### ۰.۶ — چه چیزی و چه مقدار افشا می‌شود

نشت **جزئی نیست، کامل است**: شمار ردیفی که `anon` می‌بیند دقیقاً برابر شمار
ردیفی است که مالک شیء می‌بیند.

| view | ردیف قابل‌دید anon | ردیف چشم مالک | نسبت |
|---|---|---|---|
| `product_computed_prices_public` | ۵۸۸ | ۵۸۸ | ۱۰۰٪ |
| `publish_recipients_view` | ۲۴ | ۲۴ | ۱۰۰٪ |
| `v_promotion_suggestions` | ۱۹٬۸۸۰ | ۱۹٬۸۸۰ | ۱۰۰٪ |
| `vw_account_balances` | ۱ | ۱ | ۱۰۰٪ |

محتوای واقعی که یک تماس بدون ورود دریافت می‌کند:

- **`vw_account_balances`** — عنوان حساب، **نام بانک (ملت)**، نوع حساب، ارز،
  مانده افتتاحیه، مجموع ورودی، مجموع خروجی، و **مانده جاری
  ۱۰٬۲۸۹٬۰۰۰٬۰۰۰ ریال**، به‌همراه شمار تراکنش‌ها.
- **`publish_recipients_view`** — شناسه، **نام کامل و نقش ۲۴ کاربر** سامانه.
- **`v_promotion_suggestions`** — نام محصول، SKU، وضعیت موجودی، نام کانال فروش،
  امتیازها و سهمیه‌های روزانه، برای ۱۹٬۸۸۰ ردیف.
- **`product_computed_prices_public`** — ۵۸۸ ردیف قیمت نهایی و گردشدهٔ فروش.

### ۰.۷ — جدول‌های پایه

هر هشت view روی جدول‌هایی می‌نشینند که **RLS روشن دارند** و هیچ‌کدام
`FORCE ROW LEVEL SECURITY` ندارند. چون viewها `SECURITY DEFINER` (پیش‌فرض
PostgreSQL) هستند و مالکشان `supabase_admin` است، RLS جدول پایه هرگز به
فراخوان اعمال نمی‌شود. **این ریشهٔ G-1 است** — نه یک سیاست RLS معیوب.

### ۰.۸ — آیا (ب) واقعاً anon را می‌بندد؟

داخل `BEGIN … ROLLBACK`، `security_invoker=true` موقتاً روشن و به‌عنوان `anon`
خوانده شد. **هر هشت view بسته شدند** — چهارتا به صفر ردیف، چهارتا به `42501`.
پس از `ROLLBACK` بررسی شد که هیچ view نگهبانی `security_invoker` ندارد: **۰**.

### ۰.۸ب — دامنهٔ دقیق ادعا: «کلاس نگهبان» بسته شد، نه «همهٔ سطح anon»

بازبینی مستقل به‌درستی گفت من فقط گرنت **viewها** را بررسی کرده بودم. برای
دقت، سطح anon روی جدول‌های پایه هم سنجیده شد:

`anon` روی حدود ۱۹۰ جدول در `public` گرنت `SELECT` دارد — از جمله هر جدول پایهٔ
پشت viewهای نشتی. اما RLS روی همه‌شان برقرار است و همه خالی برمی‌گردند:

```
bank_accounts   HTTP=200 []      journal_entries HTTP=200 []
journal_lines   HTTP=200 []      profiles        HTTP=200 []
user_roles      HTTP=200 []
```

**یک استثنا، که طراحی عمدی است نه رگرسیون:** جدول `products` به anon
۳۵۵ ردیف می‌دهد (نام، SKU)، به‌واسطهٔ دو سیاست صریح `products_public_read` و
`public_api_read_active_products`. همان endpoint عمومی `/api/public/products`
بر همین تکیه می‌کند.

پس ادعای درست این است: **مسیر ناشناس روی کلاس نگهبان `is_viewer_only` بسته
شد.** نام و SKU محصول از راه دیگری و به‌عمد عمومی است، اما قیمت، موجودی، کانال،
امتیاز و سهمیه — که `v_promotion_suggestions` می‌داد — دیگر از هیچ راهی در
دسترس anon نیست، و هیچ دادهٔ مالی یا پرسنلی هم نیست.

### ۰.۹ — یک ادعای نادرست که پیش از ثبت اصلاح شد

در اجرای اول `v_pricing_recompute_queue_summary` را «LEAKING» علامت زده بودم،
چون یک ردیف برگرداند، و نزدیک بود آن را «تناقض: `security_invoker` کار نمی‌کند»
ثبت کنم. راستی‌آزمایی نشان داد اشتباه است:

```
base rows in pricing_recompute_queue = 41795
anon aggregate result                = 0, 0, 0, 0, null, null
```

یک view تجمیعی **همیشه** یک ردیف برمی‌گرداند. RLS همهٔ ۴۱٬۷۹۵ ردیف را فیلتر کرده
و تجمیع صفر شده است. یعنی `security_invoker` آنجا **درست کار کرده** — شاهدی
**به‌نفع** گزینهٔ (ب)، نه علیه آن. طبقهٔ درست: «پوستهٔ تجمیعی، بدون داده».

---

## فاز ۰ — سنجهٔ تعیین‌کننده برای شرط قاعدهٔ مالک

قاعده می‌گوید (ب) فقط جایی اعمال شود که «هیچ خوانندهٔ `authenticated` را نشکند».
این با JWT شبیه‌سازی‌شده برای چهار نقش، قبل و بعد، در تراکنش برگشتی سنجیده شد.

کاربران آزمون: `test.accountant` (فعال)، `test.sales` (فعال)، `test.admin` (فعال)،
`test.viewer` (وضعیت `rejected` — طبق سند مأموریت فعال نشد؛ نقش SQL از
`user_roles` خوانده می‌شود و مستقل از `status` است).

| view | accountant | sales | admin | viewer | anon |
|---|---|---|---|---|---|
| `product_computed_prices_public` | ۵۸۸ → ۵۸۸ | ۵۸۸ → ۵۸۸ | ۵۸۸ → ۵۸۸ | ۰ → ۰ | ۵۸۸ → **42501** |
| `v_promotion_suggestions` | ۱۹۸۸۰ → ۱۹۸۸۰ | ۱۹۸۸۰ → ۱۹۸۸۰ | ۱۹۸۸۰ → ۱۹۸۸۰ | ۰ → ۰ | ۱۹۸۸۰ → **۰** |
| `publish_recipients_view` | ۲۴ → **۱** | ۲۴ → **۱** | ۲۴ → ۲۴ | ۰ → ۰ | ۲۴ → ۰ |
| `v_dynamic_customer_capital_balances` | ۱۴ → ۱۴ | ۱۴ → **۰** | ۱۴ → ۱۴ | ۰ → ۰ | 42501 → 42501 |
| `v_dynamic_salesperson_capital_balances` | ۲۱۰ → ۲۱۰ | ۲۱۰ → **۹** | ۲۱۰ → ۲۱۰ | ۰ → ۰ | 42501 → 42501 |
| `vw_account_balances` | ۱ → ۱ | ۱ → **۰** | ۱ → ۱ | ۰ → ۰ | ۱ → **۰** |
| `vw_customer_receivables` | 42501 → 42501 | 42501 → 42501 | 42501 → 42501 | 42501 | 42501 |
| `vw_supplier_payables` | 42501 → 42501 | 42501 → 42501 | 42501 → 42501 | 42501 | 42501 |

**نتیجه‌گیری مستقیم از این جدول:**

- (ب) روی **دو** view بی‌خطر است: `product_computed_prices_public` و
  `v_promotion_suggestions`. هیچ نقش واردشده‌ای تغییر نمی‌کند.
- (ب) روی **چهار** view یک خوانندهٔ واقعی را می‌شکند و طبق قاعده اعمال **نمی‌شود**:
  `publish_recipients_view` (accountant و sales از ۲۴ به ۱)،
  `v_dynamic_customer_capital_balances` (sales به ۰)،
  `v_dynamic_salesperson_capital_balances` (sales به ۹)،
  `vw_account_balances` (sales به ۰).
- دو view باقی‌مانده در هر حالت `42501` می‌دهند و موضوع (ب) نیستند.

نکته‌ای که باید Owner-Gate شود، نه تصمیم من: اینکه `sales` هم‌اکنون مانده و نام
بانک را از `vw_account_balances` می‌بیند، خودش پرسش‌برانگیز است. اصلاحش تغییر
رفتار برای کاربر واردشده است و خارج از دامنهٔ G-1 — پس اینجا فقط ثبت می‌شود.

## مصرف‌کنندگان سمت برنامه

> **این بخش پس از بازبینی مستقل بازنویسی شد. نسخهٔ اولش غلط بود.**
>
> نوشته بودم «پنج مصرف‌کنندهٔ واقعی» و اینکه `publish_recipients_view` و
> `v_promotion_suggestions` هیچ مصرف‌کنندهٔ اجرایی ندارند. هر دو ادعا نادرست
> بود. علتش یک نقص در روش جست‌وجوی من بود: این مخزن هم نام‌فایل تختِ نقطه‌دار
> دارد (`api.public.bot.*.ts`) و هم پوشهٔ تودرتو (`src/routes/api/public/`).
> من فقط تخت‌ها را شمردم. همین نقص، BLOCKER زیر را هم تولید کرد.

**یازده محل فراخوانی در نُه فایل** (به‌جز `src/integrations/supabase/types.ts`
که تولیدشده است):

| فایل | view | زمینه | احراز؟ |
|---|---|---|---|
| **`src/routes/api/public/products.ts`** | `product_computed_prices_public` | endpoint سمت سرور با `Access-Control-Allow-Origin: *` | **خیر — عمومی** |
| `src/components/products/ProductPublishPricesCard.tsx` | `product_computed_prices_public` | `_app.products.$id.tsx` | بله |
| `src/components/sales/SalesProductRecommendations.tsx` | `product_computed_prices_public` | `_app.sales.search.tsx` | بله |
| `src/hooks/pricing/useAminHozoorBoardPrices.ts` | `product_computed_prices_public` | `_app.pricing.amin-hozoor-board.tsx` | بله |
| `src/lib/pricing/workbench-queries.ts` (دو محل) | `product_computed_prices_public` | `_app.pricing.my-workbench.tsx` | بله |
| `src/routes/_app.pricing.live-price-list.tsx` | `product_computed_prices_public` | `_app` | بله |
| `src/routes/_app.pricing.market-intelligence.tsx` | `product_computed_prices_public` | `_app` | بله |
| `src/routes/_app.pricing.sale-lists_.$listId.tsx` (دو محل) | `product_computed_prices_public` | `_app` | بله |
| `src/routes/_app.pricing.sale-lists_.$listId.publish.tsx` | **`publish_recipients_view`** | `_app` | بله |
| `src/hooks/capital/useDynamicCapital.ts` | `v_dynamic_*` | `_app.accounting.dynamic-capital.tsx` | بله |

اصلاح‌های مشخص نسبت به نسخهٔ اول:

- `publish_recipients_view` **مصرف‌کنندهٔ اجرایی دارد**. بی‌ضرر است — گرنت
  `authenticated` دست‌نخورده ماند و این view عمداً `security_invoker` نگرفت، پس
  آن خواننده هنوز همان ۲۴ ردیف را می‌بیند.
- `v_promotion_suggestions` واقعاً مصرف‌کنندهٔ اجرایی ندارد. این یکی درست بود.
- `vw_account_balances` واقعاً هیچ ارجاعی در `src/` ندارد. این هم درست بود.

## BLOCKER — `/api/public/products` را شکستم، و بازبین پیدایش کرد

`src/routes/api/public/products.ts` یک endpoint عمومی سمت سرور است که کلاینت را
با `SUPABASE_PUBLISHABLE_KEY` و `persistSession: false` می‌سازد — یعنی به‌عنوان
`anon` و بدون هیچ نشستی — و `product_computed_prices_public` را می‌خواند.

پس از اعمال ۳۷۰، زنده خراب بود:

```
curl http://192.168.170.8:3100/api/public/products
{"error":"Failed to fetch prices"}
HTTP:500
```

بازبین علیت را در پایگاه‌داده و داخل `BEGIN … ROLLBACK` اثبات کرد، و نکتهٔ مهمی
افزود: اگر فقط گرنت anon برگردد ولی `security_invoker` بماند، همچنان
`permission denied for function has_dynamic_permission` می‌گیرد. یعنی **هیچ نیمی
از درمان را نمی‌شود صرفاً شل کرد.**

### اصلاح

گرنت anon برنگشت. به‌جایش جست‌وجوی قیمت در همان handler به کلاید service-role
منتقل شد — **و فقط جست‌وجوی قیمت**:

- کوئری `products` روی مسیر anon/RLS باقی می‌ماند، زیر سیاست عمدی
  `public_api_read_active_products`
  (`is_active = true AND stock_status <> 'unavailable'`).
- کلاینت service-role هرگز تصمیم نمی‌گیرد چه چیزی عمومی است؛ فقط قیمت
  شناسه‌هایی را حل می‌کند که RLS از قبل آزادشان کرده، و فقط برای
  `BASE_SALE_PRICE_TYPE_CODE`.

شکل و محتوای پاسخ دقیقاً همان پیش از ۳۷۰ است. این قید در خود فایل به‌صورت
کامنت ثبت شد تا ویرایش بعدی ناخواسته کوئری `products` را هم روی service-role
نبرد.

## مهاجرت ۳۷۱ — دروازه‌ای که واقعاً نگهبانی می‌کند

بازبین ثابت کرد دروازهٔ `DO $chk$` خود ۳۷۰ می‌تواند روی **سه** حالت پایانی غلط
هم «370 OK» چاپ کند: شمارش ۲ بدون بررسی *کدام* دو view؛ آزمون
`grantee = 'anon'` که گرنت به `PUBLIC` را نمی‌بیند؛ و پوشش فقط ۴ از ۶ view در
بررسی `authenticated`.

۳۷۰ اعمال و commit شده بود و این مخزن مهاجرت اعمال‌شده را ویرایش نمی‌کند
(قاعدهٔ ۶). پس دروازهٔ اصلاح‌شده به‌صورت **مهاجرت ۳۷۱** آمد — مهاجرتی که هیچ
شیئی را تغییر نمی‌دهد و فقط ادعا می‌کند، با **نام** به‌جای **شمار**، و با
`has_table_privilege` به‌جای پرس‌وجوی نام گیرنده.

اثبات اینکه ۳۷۱ همان چیزی را می‌گیرد که ۳۷۰ از دست می‌داد — هر اختلال در
`BEGIN … ROLLBACK` جداگانه:

```
BASELINE (healthy)   NOTICE: 371 OK: guard class matches by name; anon holds none of 7 …
2a wrong two views   ERROR: security_invoker is on the wrong guard-class views.
                            expected {product_computed_prices_public,v_promotion_suggestions},
                            found   {publish_recipients_view,vw_account_balances}
2b PUBLIC grant      ERROR: anon still holds SELECT on public.vw_account_balances
                            (effective privilege, not just a named grant)
2c authenticated     ERROR: authenticated lost SELECT on public.publish_recipients_view
                            — the revoke hit the wrong role
2d body rewritten    ERROR: the is_viewer_only view class has changed. expected {8}, found {7}
```

هر پنج حالت درست تشخیص داده شد. `psql exit=0` هنگام اعمال روی پایگاه‌دادهٔ سالم.

## تناقض‌های یافته‌شده

| انتظار | یافته | اثر |
|---|---|---|
| ۸ view در کلاس نگهبان | ۸ — مطابق | هیچ |
| گرنت anon = `SELECT` | `SELECT` به‌همراه `INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES` | دامنهٔ REVOKE باید کل امتیازها باشد، نه فقط SELECT |
| ۴۰۱ روی `v_dynamic_*` یعنی محافظت | ۴۰۱ از نبود `EXECUTE` روی `_capital_alloc_used` است، نه از گرنت | محافظت اتفاقی و شکننده |
| `SUPABASE_ANON_KEY` در `.env*` کلید کار است | آن یک جانگهدار ۳۲ کاراکتری است؛ کلید واقعی `ANON_KEY` در `deploy/lan/.env.lan` | با کلید غلط، سنجش «امن» گزارش می‌دهد |
| `security_invoker` کافی است | روی ۴ view خوانندهٔ واردشده را می‌شکند | (ب) نمی‌تواند درمان عمومی باشد |

## Owner-Gate — چهار مورد باز، هیچ‌کدام خودمختار تغییر نکرد

تاریخ طرح: ۱۴۰۵/۰۶/۰۱ (2026-08-22). پاسخ: **باز**.
هیچ‌کدام مانع تحویل ۳۷۰ نیست؛ ۳۷۰ نشت را می‌بندد و این چهار مورد دربارهٔ
دوام و دامنهٔ آن است.

### OG-25 — قاعدهٔ `ALTER DEFAULT PRIVILEGES` که همین نقص را بازتولید می‌کند

**این مهم‌ترین یافتهٔ مأموریت است و بزرگ‌تر از G-1.**

```sql
SELECT pg_get_userbyid(defaclrole), defaclnamespace::regnamespace::text,
       defaclobjtype::text, defaclacl::text FROM pg_default_acl;
```

```
supabase_admin | public | r | {postgres=arwdDxt/…, anon=arwdDxt/…, authenticated=arwdDxt/…, service_role=arwdDxt/…}
supabase_admin | public | S | {… anon=rwU/… …}
supabase_admin | public | f | {… anon=X/… …}
```

یعنی هر **جدول یا view تازه‌ای** که `supabase_admin` در `public` بسازد، خودکار
`arwdDxt` به `anon` می‌گیرد — و هر **تابع تازه** خودکار `EXECUTE` به `anon`.

نتیجه‌های عملی:

- G-1 اشتباه روی هشت شیء نبود؛ **پیش‌فرض شِما** بود. آن هشت‌تا فقط جایی بودند که
  کسی نگاه کرد.
- ۳۷۰ یک وصلهٔ نقطه‌ای است. `CREATE OR REPLACE VIEW` روی این شش‌تا ACL را حفظ
  می‌کند، اما یک `DROP VIEW` + `CREATE VIEW` (که وقتی فهرست ستون‌ها عوض شود
  مهاجرت‌ها انجام می‌دهند) گرنت anon را **بی‌سروصدا برمی‌گرداند**.
- هر view یا جدول تازه‌ای که فردا ساخته شود، از روز اول این نقص را دارد.

چرا خودمختار عوضش نکردم: تغییر یک قاعدهٔ پیش‌فرض در سطح شِما روی هر شیء آینده
اثر می‌گذارد و می‌تواند جدول‌هایی را که *واقعاً* باید عمومی باشند بشکند
(مسیرهای `api.public.bot.*` بر همین تکیه می‌کنند). دامنه‌اش از یک اصلاح G-1
بسیار بزرگ‌تر است.

**پرسش از مالک:** آیا مأموریتی جداگانه برای بستن این قاعده و ممیزی همهٔ اشیای
`public` تعریف شود؟

### OG-26 — بازنویسی `is_viewer_only` به حالت بسته‌شونده

گزینهٔ (ج) از پرسش پیش‌پرواز. `is_viewer_only(NULL)` برای فراخوان بی‌هویت
`false` برمی‌گرداند، یعنی نگهبان **باز** می‌شود نه بسته. طبق قاعده‌ای که پاسخ
(د) را ترجمه کرد، این خودمختار انجام نشد.

اثر: رفتار هر هشت view و هر مصرف‌کنندهٔ دیگر آن تابع را هم‌زمان عوض می‌کند.

### OG-27 — آیا G-1 از بیرون از LAN قابل دسترسی بود

آنچه سنجیدم: `docker port` نشان می‌دهد Kong روی `0.0.0.0:9000` و `[::]:9000`
می‌شنود، پس هر میزبانی که به `192.168.170.8` مسیر دارد به آن می‌رسد.

آنچه **نتوانستم** بسنجم: پیکربندی روتر/NAT شرکت. آن خارج از دسترس این نشست است
و بررسی‌اش از سمت تولید ممنوع بود. **`[U]` — نامعلوم.**

اهمیتش: اگر پاسخ «بله» باشد، این یک افشای واقعی بوده، نه فقط یک نقص داخلی، و
تصمیم اطلاع‌رسانی با مالک است.

### OG-28 — اینکه `sales` مانده و نام بانک را می‌بیند (G-2)

`vw_account_balances` به نقش `sales` عنوان حساب، نام بانک و مانده جاری را نشان
می‌دهد (۱ ردیف، همان که admin و accountant می‌بینند). روشن‌کردن
`security_invoker` روی این view آن را به ۰ می‌رساند — یعنی RLS جدول پایه این را
برای فروش مجاز نمی‌داند، ولی view تعریف‌کننده دورش می‌زند.

عمداً در ۳۷۰ اصلاح نشد، چون تغییر رفتار برای کاربر **واردشده** است و خارج از
دامنهٔ G-1. همین برای سه view دیگر هم صادق است
(`publish_recipients_view`: accountant و sales از ۲۴ به ۱،
`v_dynamic_customer_capital_balances`: sales از ۱۴ به ۰،
`v_dynamic_salesperson_capital_balances`: sales از ۲۱۰ به ۹).

**پرسش از مالک:** آیا این چهار مورد تنگ‌تر شوند؟ هر کدام یک تصمیم کسب‌وکاری
است، نه فنی.

---

## فاز ۱ — فایل بازگشت، پیش از هر مهاجرت

`docs/verification/370-down.sql` **قبل از** نوشتن مهاجرت نوشته شد. مجموعهٔ امتیازها
از حافظه بازنویسی نشد؛ از `pg_class.relacl` روی کاتالوگ زنده خوانده شد و روی هر شش
view یکسان بود: `anon=arwdDxt/supabase_admin` (یعنی `GRANT ALL`، نه فقط `SELECT`).

اثبات با `docs/verification/rollback-dryrun.sql` (اعمال، ادعا، دور ریختن):

```
>>>> running the down file inside a transaction we control
SET / ALTER VIEW x2 / GRANT x6
>>>> down file completed; still inside the transaction   still_in_txn = t
ROLLBACK
>>>> STATE AFTER ROLLBACK — must equal STATE BEFORE      public_functions = 841
```

و تأیید جداگانه که چیزی باقی نماند:

```
42 anon privileges (expect 42 = 6 views x 7)  |  0 guard views with reloptions (expect 0)
```

فایل هیچ `BEGIN`/`COMMIT`/`ROLLBACK` ندارد — قاعدهٔ M7 از مهاجرت ۳۵۰ به بعد.

## فاز ۲ — اعمال

مهاجرت **پیش از** اعمال commit شد (`c7dd8771`)، که سخت‌گیرانه‌تر از قاعدهٔ «هرگز
اعمال‌شده ولی commit‌نشده» است. پیش از اعمال، آزادبودن شمارهٔ ۳۷۰ دوباره هم روی
دیسک و هم روی `origin/staging` بررسی شد.

پیش از اعمال واقعی، مهاجرت داخل `BEGIN … ROLLBACK` هم آزموده شد تا رفتار دروازه و
تریگرهای رویدادی معلوم شود؛ دروازه سبز شد و anon روی `vw_account_balances` به
`42501` خورد. بازگشت تأیید شد (۴۲ امتیاز anon دست‌نخورده باقی ماند).

```
docker cp … afrakala-lan-db:/tmp/mig370.sql
psql -U supabase_admin -d afrakala -v ON_ERROR_STOP=1 --single-transaction -f /tmp/mig370.sql

SET / REVOKE x6 / ALTER VIEW x2 / DO
NOTICE:  370 OK: 8 guard-class views, 0 anon privileges, 2 security_invoker, authenticated intact
psql exit=0

docker restart afrakala-lan-rest   ->  afrakala-lan-rest  Up 6 seconds
```

ترتیب رعایت شد: commit ← اعمال ← restart ← commit نتایج.

---

## فاز ۳ — پذیرش A1 تا A11

### A1 — anon روی HTTP، هر هشت view

```
product_computed_prices_public           401  42501 permission denied for view …
publish_recipients_view                  401  42501 permission denied for view …
v_dynamic_customer_capital_balances      401  42501 permission denied for view …
v_dynamic_salesperson_capital_balances   401  42501 permission denied for view …
v_promotion_suggestions                  401  42501 permission denied for view …
vw_account_balances                      401  42501 permission denied for view …
vw_customer_receivables                  401  42501 permission denied for view …
vw_supplier_payables                     401  42501 permission denied for view …
```

توجه: پیام خطا اکنون روی هر هشت‌تا **مربوط به خود view** است. پیش از ۳۷۰، دو
`v_dynamic_*` خطای `permission denied for function _capital_alloc_used` می‌دادند —
یعنی حالا سد از گرنت می‌آید، نه از یک ACL اتفاقی. **PASS**

### A2 — امتیاز anon

`0 anon privilege rows (expect 0)` — از ۴۲ به ۰. **PASS**

### A3 — دقیقاً دو view با `security_invoker`

```
product_computed_prices_public -> {security_invoker=true}
v_promotion_suggestions        -> {security_invoker=true}
2 total (expect 2)
```
**PASS**

### A4 — مقایسه با خط پایهٔ فاز ۰ (نه با انتظار)

هر ۳۲ خانه **دقیقاً** برابر خط پایه است. هیچ نقش واردشده‌ای تغییر نکرد.

| view | accountant | sales | admin | viewer |
|---|---|---|---|---|
| `product_computed_prices_public` | ۵۸۸ | ۵۸۸ | ۵۸۸ | ۰ |
| `publish_recipients_view` | ۲۴ | ۲۴ | ۲۴ | ۰ |
| `v_dynamic_customer_capital_balances` | ۱۴ | ۱۴ | ۱۴ | ۰ |
| `v_dynamic_salesperson_capital_balances` | ۲۱۰ | ۲۱۰ | ۲۱۰ | ۰ |
| `v_promotion_suggestions` | ۱۹۸۸۰ | ۱۹۸۸۰ | ۱۹۸۸۰ | ۰ |
| `vw_account_balances` | ۱ | ۱ | ۱ | ۰ |
| `vw_customer_receivables` | 42501 | 42501 | 42501 | 42501 |
| `vw_supplier_payables` | 42501 | 42501 | 42501 | 42501 |

**PASS**

### A5 — `authenticated` هنوز `SELECT` دارد

هر شش view: `authenticated SELECT = yes`. REVOKE به نقش اشتباه نخورد. **PASS**

### A6 — کلاس نگهبان هنوز هشت view است

`8 views reference is_viewer_only (expect 8)`. **PASS**

### A7 — هیچ بدنهٔ viewی بازنویسی نشد

`8 guard-class views still SELECT-filtered by NOT is_viewer_only(uid()) (expect 8)`.
این مأموریت هیچ `CREATE OR REPLACE VIEW` نزد. **PASS**

### A8 — شمار کل viewها

`20 views in public (baseline 20)`. **PASS**

### A9 — ده view پیشین دست‌نخورده

`12 views carry security_invoker in total (10 pre-existing + 2 new = 12)`. **PASS**

### A10 — typecheck

```
npx tsc --noEmit | grep -c "error TS"
70
```

دقیقاً روی خط پایهٔ ۷۰. این مأموریت هیچ فایل TypeScript را لمس نکرد. **PASS**

### A11 — آزمون سرتاسری روی HTTP با نشست واقعی

رمز فرضی `AfraTest!1404` برای `test.accountant` کار نکرد
(`invalid_grant`). به‌جای حدس‌زدن رمز، از نشست ذخیره‌شدهٔ خود پروژه در
`e2e/auth/accountant.storage.json` استفاده و با `grant_type=refresh_token` تازه شد.
هیچ توکنی چاپ نشد.

```
  product_computed_prices_public           HTTP 200  rows=588
  publish_recipients_view                  HTTP 200  rows=24
  v_dynamic_customer_capital_balances      HTTP 200  rows=14
  v_dynamic_salesperson_capital_balances   HTTP 200  rows=210
  v_promotion_suggestions                  HTTP 200  rows=19880
  vw_account_balances                      HTTP 200  rows=1

  --- identical requests with NO session ---
  vw_account_balances                      HTTP 401
  publish_recipients_view                  HTTP 401
  v_promotion_suggestions                  HTTP 401
  product_computed_prices_public           HTTP 401
```

پس از restart سرویس REST، نشست واقعی همان شمار ردیف خط پایه را می‌گیرد و همان
درخواست بدون نشست ۴۰۱ می‌شود. **PASS**

**نتیجهٔ فاز ۳: هر یازده معیار PASS.**

## گام بعدی

فاز ۴ — بازبینی مستقل، سپس فاز ۵ (Owner-Gateها) و فاز ۶ (به‌روزرسانی
`00-progress.md`، PR، ادغام).
