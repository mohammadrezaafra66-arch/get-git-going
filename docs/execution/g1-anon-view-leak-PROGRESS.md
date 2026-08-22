# G-1 — نشت داده به کاربر ناشناس روی کلاس view نگهبان `is_viewer_only` — PROGRESS

## HANDOFF STATE

```
Phase:                G-1 — anon view leak remediation
Status:               in progress
Branch:               feature/g1-anon-view-leak
Base:                 staging @ e209218b
Tasks:                1 of 7
Current task:         Phase 0 — measurement (complete), Phase 1 next
Blocked by:           nothing
Migrations applied:   none yet (370 reserved)
REST restarted after: n/a
Backup taken:         n/a — this mission applies GRANT/ALTER VIEW only, no data DDL
Typecheck:            not yet run (baseline 70)
Last commit:          e209218b
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

## مصرف‌کنندگان سمت برنامه — آیا (الف) چیزی را می‌شکند؟

پنج مصرف‌کنندهٔ واقعی در کد وجود دارد (بقیهٔ ارجاع‌ها در
`src/integrations/supabase/types.ts` تولیدشده‌اند و اجرا نمی‌شوند):

| فایل | view | مسیر سوارکننده | زیر پوستهٔ احراز؟ |
|---|---|---|---|
| `src/components/products/ProductPublishPricesCard.tsx` | `product_computed_prices_public` | `_app.products.$id.tsx` | بله |
| `src/components/sales/SalesProductRecommendations.tsx` | `product_computed_prices_public` | `_app.sales.search.tsx` | بله |
| `src/hooks/pricing/useAminHozoorBoardPrices.ts` | `product_computed_prices_public` | `_app.pricing.amin-hozoor-board.tsx` | بله |
| `src/lib/pricing/workbench-queries.ts` | `product_computed_prices_public` | `_app.pricing.my-workbench.tsx` | بله |
| `src/hooks/capital/useDynamicCapital.ts` | `v_dynamic_*` | `_app.accounting.dynamic-capital.tsx` | بله |

هر پنج‌تا از کلاینت مشترک `@/integrations/supabase/client` استفاده می‌کنند که پس
از ورود توکن کاربر را حمل می‌کند. مسیرهای واقعاً عمومی مخزن
(`public.sale-lists.$listId.tsx`، `api.public.bot.*`، `sitemap.xml`, `index.tsx`)
جست‌وجو شدند و **هیچ‌کدام** هیچ‌یک از این هشت view را نمی‌خوانند.

`vw_account_balances` هیچ ارجاعی در `src/` ندارد — حتی در فایل types. یعنی
viewی که بیشترین داده حساس را افشا می‌کند، هیچ مصرف‌کنندهٔ برنامه‌ای ندارد.

`publish_recipients_view` و `v_promotion_suggestions` هم مصرف‌کنندهٔ اجرایی
ندارند؛ فقط در types ظاهر می‌شوند.

**پس `REVOKE … FROM anon` هیچ قابلیت واردشده‌ای را نمی‌شکند.**

## تناقض‌های یافته‌شده

| انتظار | یافته | اثر |
|---|---|---|
| ۸ view در کلاس نگهبان | ۸ — مطابق | هیچ |
| گرنت anon = `SELECT` | `SELECT` به‌همراه `INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES` | دامنهٔ REVOKE باید کل امتیازها باشد، نه فقط SELECT |
| ۴۰۱ روی `v_dynamic_*` یعنی محافظت | ۴۰۱ از نبود `EXECUTE` روی `_capital_alloc_used` است، نه از گرنت | محافظت اتفاقی و شکننده |
| `SUPABASE_ANON_KEY` در `.env*` کلید کار است | آن یک جانگهدار ۳۲ کاراکتری است؛ کلید واقعی `ANON_KEY` در `deploy/lan/.env.lan` | با کلید غلط، سنجش «امن» گزارش می‌دهد |
| `security_invoker` کافی است | روی ۴ view خوانندهٔ واردشده را می‌شکند | (ب) نمی‌تواند درمان عمومی باشد |

## Owner-Gate

سه مورد در فاز ۵ مطرح می‌شود (هنوز پرسیده نشده):

1. بازنویسی `is_viewer_only` به حالت بسته‌شونده — گزینهٔ (ج)، که طبق قاعده
   خودمختار انجام نشد.
2. آیا G-1 از بیرون از LAN قابل دسترسی است. آنچه سنجیدم: Kong روی
   `0.0.0.0:9000` می‌شنود، پس هر میزبانی که به `192.168.170.8` مسیر دارد به آن
   می‌رسد. آنچه **نمی‌توانم** بسنجم: پیکربندی روتر/NAT شرکت. **`[U]`**
3. اینکه `sales` مانده و نام بانک را می‌بیند (G-2 و بند ۰.۹ بالا).

## گام بعدی

فاز ۱ — نوشتن `docs/verification/370-down.sql` **پیش از** هر مهاجرت، و اثبات آن
با `rollback-dryrun.sql`.
