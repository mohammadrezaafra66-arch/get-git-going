# صف بازمحاسبهٔ قیمت، کوئری کُند سایدبار و audit_logs — پژوهش read-only

- تاریخ: 2026-09-14 · ابزار: Claude Code · شاخه: `feature/pricing-queue-research-20260914` (worktree از `origin/main` = `a935be0b`)
- منبع داده: dump تولید `D:\AfraKalaTest\dumps\afrakala-db-20260913-post-release-696.dump`
  (md5 `b4e43d31e055ea23ab860608e9a7adfc`، `Archive created at 2026-09-13 18:38:51 UTC`، `dbname: postgres`)
  بازگردانده در دیتابیس دورریختنی `pricing_research_20260914` روی `afrakala-lan-db` (کامپیوتر تست).
- هیچ نوشتنی روی `afrakala` یا 192.168.170.10 انجام نشد؛ هیچ کوئری‌ای روی تولید اجرا نشد. hook صدا زده نشد. هیچ index واقعی ساخته نشد.
- «لحظهٔ اندازه‌گیری» در همهٔ مقایسه‌های قیمت = لحظهٔ dump، یعنی `2026-09-13 18:38:51Z` — نه امروز.

برچسب شواهد: **[cited]** فایل:خط · **[quoted]** نقل عین · **[measured]** دستور + خروجی · **[compared]** · **[derived]** محاسبه از اعداد اندازه‌گیری‌شده (فرمول ذکر شده) · **[assertion]** ادعای بدون اندازه‌گیری.

---

## ۱. خلاصه برای مالک

1. **قیمت کالاهای موجود که امروز به مشتری گفته می‌شود درست است؛ قیمت ذخیره‌شدهٔ ۵۵ کالای دلاریِ ناموجود ۱۰٫۴٪ تا ۴۵٫۳٪ کمتر از قیمت واقعی است.** در لحظهٔ نسخهٔ پشتیبان (۲۲ شهریور، ساعت ۲۲:۰۸ تهران)، هر ۳٬۲۸۶ قیمتِ ۱۰۶ کالای موجود دقیقاً با فرمول می‌خواند. همهٔ ۱۴۲ کالایی که قیمت کهنه دارند «ناموجود» هستند.
2. خطر واقعی این است: وقتی یکی از این کالاها دوباره موجود شود، تا کسی «انتشار دسته‌ای قیمت» را نزند، همان قیمت کهنه و ارزان در جست‌وجوی فروش و پیش‌فاکتور دیده می‌شود.
3. صف ۱۱۹ هزار ردیفی «کار عقب‌افتاده» نیست. ۹۹٫۷٪ آن تکراری است: فقط **۳۷۶ کالا** پشتش هستند، یعنی به‌طور میانگین ۳۱۵ ردیف برای هر کالا.
4. این صف هیچ‌وقت خودکار کار نکرده است. تنها باری که پردازش شد بامداد ۲۶ مرداد (۲۰۲۶-۰۸-۱۶ UTC) بود: یک مدیر سه بار دکمه را زد و ۷۵ ردیف رفت.
5. خالی‌کردن ردیف‌به‌ردیف صف حدود ۳ تا ۴ شبانه‌روز کار ماشین است و حدود ۳۶۰ هزار ردیف به گزارش ممیزی اضافه می‌کند. اگر فقط یک بار برای هر کالا اجرا شود، حدود ربع ساعت طول می‌کشد.
6. پیش از هر بازمحاسبه، باید قیمت خرید سه کالا اصلاح شود. عددشان اشتباه وارد شده و بازمحاسبه برای یکی ۵۶٬۸۷۷ میلیارد تومان منتشر می‌کند.
7. کندی سایدبار (حدود ۶ ثانیه برای مدیران) و صفحهٔ گزارش ممیزی از یک علت است: قاعدهٔ دسترسی برای **هر ردیف** دوباره اجرا می‌شود. با یک تغییر بی‌خطر در همان قاعده، زمان روی نسخهٔ پشتیبان به ۳۰ میلی‌ثانیه رسید.
8. گزارش ممیزی روزی حدود ۱٬۸۰۰ ردیف رشد می‌کند و هیچ سیاست پاک‌سازی ندارد. با این روند یک سال بعد حدود ۷۶۵ هزار ردیف می‌شود.
9. دو صفحهٔ «خراب» کسی را از کار نینداخته است. رسید: پیوندی برای نمایش وجود ندارد (۰ ردیف). تابلوی قیمت: کار می‌کند، فقط هر بار یک درخواستِ ناموفق اضافه می‌فرستد.

---

## مغایرت‌ها با ground truth مأموریت

| # | ground truth | آنچه یافتم | شاهد |
|---|---|---|---|
| G1 | «تنها فراخوان `claim_pricing_recompute_jobs` وب‌هوک `POST /api/public/hooks/process-pricing-queue` است» | **نادرست.** مسیر دوم وجود دارد: server function `triggerPricingRecomputeQueue`، یعنی دکمهٔ «پردازش صف قیمت‌ها» در `/pricing/recompute-prices`. **اجرای ۲۰۲۶-۰۸-۱۶ از همین دکمه بوده، نه از هوک.** | [cited] `src/lib/pricing/process-queue.functions.ts:20,48` و `src/routes/_app.pricing.recompute-prices.tsx:30,57`؛ [measured] پایین‌تر در B2 |
| G2 | «چهار trigger `enqueue_pricing_recompute` را صدا می‌زنند» | درست، ولی غیرمستقیم: هر trigger یک تابع trigger (`trg_enqueue_on_*`) را اجرا می‌کند و آن تابع `enqueue_pricing_recompute` را صدا می‌زند. | [measured] `pg_trigger` join `pg_proc` |
| G3 | pending = 119,779 (تولید، ۱۴ سپتامبر) | dump ۱۳ سپتامبر ۱۸:۳۸: **118,254 pending / 74 done / 1 failed**. اختلاف ۱٬۵۲۵ با رشد روزانهٔ اندازه‌گیری‌شده (۱٬۴۹۹ ردیف در ۰۹-۱۳) سازگار است. تناقض نیست. | [measured] |
| G4 | audit_logs = 118,708 | dump: **116,095**. همان عددی که 542 در توضیحش ثبت کرده. سازگار. | [measured] |
| G5 | view: ۵٬۳۰۳ms / audit count: ۴٬۹۴۴ms به‌عنوان admin | dump **پیش از 542** است. با بدنه‌های قبلی: ۳٬۸۹۸ / ۳٬۷۱۱ms. با بدنه‌های 542 (در تراکنش rollback‌شده): **۶٬۱۹۸ / ۵٬۸۸۴ms**. هم‌مرتبهٔ تولید است. | [measured] بخش D |
| G6 | `cron.job` چهار job دارد | روی restore قابل بررسی نبود: `pg_cron` فقط در دیتابیس `postgres` ساخته می‌شود و restore خطا داد. ضمناً `deploy/lan/scripts/cron-445-schedule-afrakala-jobs.sql:26-29` سه job **دیگر** با نام‌های `afrakala-*` تعریف می‌کند که در فهرست تولید نیستند. یعنی آن اسکریپت روی تولید نصب نیست. این را فقط ثبت می‌کنم و اندازه نگرفته‌ام. | [cited] |

---

## ۲. سه یافته

### یافتهٔ ۱ — صف بازمحاسبه هرگز راه نیفتاده؛ قیمت کالاهای ناموجود کهنه مانده

- **چیست:** چهار trigger با هر تغییر نرخ ارز، قیمت خرید، قانون قیمت یا قانون حمل، ردیف به صف اضافه می‌کنند. هیچ scheduler‌ای صف را خالی نمی‌کند. دو مسیر دستیِ به‌روزرسانی قیمت، یعنی «انتشار دسته‌ای» و «ویرایش سریع نرخ ارز»، **فقط** کالاهای `status='active'` با `stock_status in ('available','limited')` را بازمحاسبه می‌کنند:
  - [quoted] `src/lib/pricing/publish-prices.ts:250`: `q = q.eq("status", "active").in("stock_status", ["available", "limited"]);`
  - [quoted] `src/lib/pricing/effective-currencies.ts:165-167`: `.eq("base_currency", currency) .eq("status", "active") .in("stock_status", ["available", "limited"]),`

  پس صف تنها مسیری است که کالای ناموجود را پوشش می‌داد، و خاموش است.
- **از کی:** قدیمی‌ترین ردیف pending در `2026-05-24 12:49:11Z` ثبت شده. کد در ۲۰۲۶-۰۵-۱۱ توسط `gpt-engineer-app[bot]` نوشته شده (commitهای `c24e9b6a`, `5e47f5e4`, `060b3e0d`, `6abfe9d6`). [measured] [cited]
- **به چه کسی آسیب می‌زند:** فروش و مشتری، در لحظهٔ برگشت کالا به موجودی. [measured] ۱۵ قلم پیش‌فاکتور در ۳۰ روز اخیر روی کالاهایی ثبت شده که امروز ≥۱۰٪ کهنه‌اند و همه اکنون `unavailable` هستند. آیا قیمت در لحظهٔ صدور هم کهنه بوده؟ اندازه‌پذیر نبود (بخش ۷).
- **چقدر:** [measured] روی ۳۳۹ قیمت نقدیِ پایه که قابل محاسبه‌اند:

  | | تعداد |
  |---|---|
  | منطبق با فرمول | ۱۹۶ |
  | متفاوت | ۱۴۳ |
  | متفاوت ≥۱۰٪ (همه دلاری، ۱۰٫۴٪ تا ۴۵٫۳٪ **کمتر** از قیمت درست) | ۵۵ |
  | قیمت خرید غلط‌واردشده | ۳ |

  - جمع قیمت‌های کهنهٔ متفاوت: `30,028,010,000` تومان. همان کالاها با فرمول امروز: `32,431,450,000` تومان (**+۸٫۰۰٪**).
  - در همهٔ ردیف‌ها (پایه و ترم‌های تسویه): ۱۴۲ کالا حداقل یک قیمت کهنه دارند و ۵۸ کالا حداقل یک قیمت ≥۱۰٪ کهنه.
  - همهٔ ۱۴۲ کالا: ۱۳۱ `active/unavailable`، ۱۰ `inactive/unavailable`، ۱ `active/unknown`.
  - کالاهای موجود: [measured] `in-stock products compared: 106 rows 3286 differing rows 0`.

### یافتهٔ ۲ — سایدبار و صفحات ممیزی کُندند چون قاعدهٔ RLS برای هر ردیف اجرا می‌شود

- **چیست:** سیاست‌های RLS روی `pricing_recompute_queue` و `audit_logs` تابع SECURITY DEFINER را بدون `(SELECT …)` صدا می‌زنند. نتیجه این است که Postgres تابع را برای هر ردیف دوباره اجرا می‌کند:
  - `has_any_role(uid(), ARRAY[...])` + `NOT is_viewer_only(uid())`
  - `has_role(uid(), 'admin')` + `NOT is_viewer_only(uid())`

  همین جست‌وجو به‌عنوان superuser ۱۷ms طول می‌کشد و به‌عنوان admin ۶٬۱۹۸ms. **index کمکی نمی‌کند**، چون هزینه اسکن نیست، اجرای تابع برای هر ردیف است. [measured]

  در `audit_logs` یک مشکل دوم هم هست: هیچ indexی با `created_at` شروع نمی‌شود. پس `ORDER BY created_at DESC LIMIT` باید همهٔ ۱۱۶ هزار ردیف را بخواند و برای هر کدام RLS را اجرا کند.
- **از کی:**
  - view از ۲۰۲۶-۰۶-۱۵ `security_invoker` شد ([cited] `supabase/migrations/20260615065224_4f833d42-…sql:2`).
  - policy `admins read audit logs` از ۲۰۲۶-۰۴-۲۴ وجود دارد ([cited] `20260424144837_08d37d59-…sql:106-109`).
  - 542 (۲۰۲۶-۰۹-۱۴) برای هر فراخوان یک `EXISTS` روی `profiles` اضافه کرد و هزینه را حدود ×۱٫۵ کرد ([cited] `20260914130000_542_…sql:266-271`، [measured] ۳٬۸۹۸→۶٬۱۹۸ms).
- **به چه کسی آسیب می‌زند:**
  - سایدبار: ۲۶ کاربر با نقش admin، manager یا accountant (admin 23، manager 2، accountant 1 [measured]) در هر mount سایدبار.
  - `/audit-logs` و `/admin/audit`: admin (و manager که RLS نتیجه را برایش خالی می‌کند؛ یافتهٔ جانبی).
  - `/admin/audit` هر ۶۰ ثانیه دوباره می‌خواند ([cited] `_app.admin.audit.tsx:87-130`، `refetchInterval: 60_000`).
- **چقدر:** [measured] روی restore با بدنه‌های 542:
  - view: ۶٫۲ ثانیه
  - `/audit-logs` (limit 200): ۵٫۹ ثانیه
  - `/admin/audit` صفحهٔ ۰: ۵٫۷ ثانیه
  - `/admin/audit` صفحهٔ ۲۱: ۶٫۵ ثانیه

### یافتهٔ ۳ — دو صفحه به رابطهٔ ناموجود اشاره می‌کنند، اما امروز کسی مسدود نیست

- **`/accounting/receipts/$receiptId`**
  - از `invoice:invoices(...)` می‌خواند. جدول `invoices` در migration 332 (۲۰۲۶-۰۸-۰۸) حذف شد.
  - [measured] `payment_receipt_links` روی تولید **۰ ردیف** دارد (۶ رسید `invoice_payment`، آخرین ۲۰۲۶-۰۹-۱۳). پس صفحه عبارت «هیچ پیش‌فاکتوری متصل نیست» را نشان می‌دهد، که با داده هم درست است.
  - آسیب امروز: یک درخواست شبکهٔ ناموفق در هر باز شدن صفحه. آسیب فردا: اگر پیوند quote ثبت شود، دیده نمی‌شود.
- **`/pricing/amin-hozoor-board`**
  - embed با نام FKای که هیچ‌وقت ساخته نشده شکست می‌خورد و به fallback بدون join می‌رود ([quoted] `src/lib/pricing/board-access.ts:72,78-90`).
  - [measured] ۴۰۱ نشست تابلو از ۱۵ کاربر، استفادهٔ هفتگی تا ۲۰۲۶-۰۹-۱۳. ۶ درخواست دسترسی، همه `approved` (آخرین ۲۰۲۶-۰۸-۰۱).
  - آسیب امروز: در هر نمایش کارت درخواست‌ها (هر ۴۵ ثانیه برای مدیران) یک درخواست ناموفق + دو کوئری اضافه.

---

## A. صف برای چیست و وقتی می‌ماند چه می‌شکند

### A1. دو تابع — عین تعریف زنده (restore)

[measured] `pg_get_functiondef` روی `pricing_research_20260914`:

```sql
CREATE OR REPLACE FUNCTION public.enqueue_pricing_recompute(_product_ids uuid[], _reason text, _source_table text DEFAULT NULL::text, _source_id uuid DEFAULT NULL::uuid, _sale_price_type_id uuid DEFAULT NULL::uuid, _priority integer DEFAULT 100)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  inserted_count integer := 0;
BEGIN
  IF _product_ids IS NULL OR array_length(_product_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;
  INSERT INTO public.pricing_recompute_queue (
    product_id, reason, source_table, source_id, sale_price_type_id, priority, status
  )
  SELECT DISTINCT pid, _reason, _source_table, _source_id, _sale_price_type_id, _priority, 'pending'
  FROM unnest(_product_ids) AS pid
  WHERE pid IS NOT NULL
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$function$
```

```sql
CREATE OR REPLACE FUNCTION public.claim_pricing_recompute_jobs(_batch_size integer DEFAULT 25, _max_attempts integer DEFAULT 3)
 RETURNS SETOF pricing_recompute_queue LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF _batch_size IS NULL OR _batch_size < 1 THEN _batch_size := 25; END IF;
  IF _batch_size > 100 THEN _batch_size := 100; END IF;
  RETURN QUERY
  WITH picked AS (
    SELECT id FROM public.pricing_recompute_queue
    WHERE status = 'pending' AND attempts < _max_attempts
    ORDER BY priority ASC, enqueued_at ASC
    LIMIT _batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.pricing_recompute_queue q
  SET status = 'processing', started_at = now(), attempts = q.attempts + 1
  FROM picked WHERE q.id = picked.id
  RETURNING q.*;
END;
$function$
```

**enqueue:** برای هر کالا یک ردیف pending می‌گذارد. dedupe فقط روی
`uq_prq_pending_dedupe UNIQUE (product_id, reason, COALESCE(source_table,''), COALESCE(source_id,'0…'), COALESCE(sale_price_type_id,'0…')) WHERE status IN ('pending','processing')` [measured `\d+`] است. چون `source_id` شناسهٔ ردیف منبع است (مثلاً هر ردیف نرخ ارز)، **هر تغییر نرخ برای هر کالا یک ردیف تازه می‌سازد**. dedupe فقط تکرارِ همان منبع را حذف می‌کند.

**claim:** فقط وضعیت را به `processing` می‌برد. خودِ بازمحاسبه در Node است.

**یک «recompute» دقیقاً چه چیزی را عوض می‌کند** — [cited] `src/lib/pricing/process-recompute-queue.server.ts:94-136` هر job را به `publishProductPrices` می‌سپارد. آن تابع ([cited] `src/lib/pricing/publish-prices.ts:105-186`) برای هر نوع‌قیمت فعال (۳ عدد) این کارها را می‌کند:

| جدول | ستون(ها) | تعداد برای هر ردیف صف (امروز) |
|---|---|---|
| **`product_computed_prices`** (upsert روی `product_id,sale_price_type_id,settlement_type_id`) | **`rounded_sale_price`**، `final_sale_price`، `currency_rate`، `purchase_price_toman`، `shipping_cost`، `margin_amount`، `computed_at`، `computed_by`، `source` | ۳ × (۱ پایه + ۲۲ ترم تسویهٔ فعال) = **۶۹** [measured: `active spt x (1+active settlements) = 69`] |
| `price_calculation_snapshots` (insert؛ `force_snapshot: true` فقط برای ردیف پایه) | کل breakdown | ۳ |
| `product_sale_price_history` (insert فقط اگر قیمت عوض شده باشد) | `old_sale_price`، `new_sale_price` | ۰ تا ۳ |
| `pricing_recompute_queue` | `status`، `processed_at`، `error` | ۱ |

triggerهای جانبی [measured `pg_trigger`]:
- هر upsert در `product_computed_prices` → `sync_sale_list_items_from_computed` (UPDATE روی `sale_list_items`).
- هر snapshot → `audit_price_snapshots` (یک ردیف `audit_logs`).
- هر history → `audit_sale_price_history`، `notify_accountants_on_sale_price_change` (یک ردیف `notification_queue` برای هر accountant)، `_par_after_price_history_insert` (هشدار قیمت) و `sync_sale_list_items_from_history`.

**آنچه فروش واقعاً می‌بیند:**
- `/sales/search` و پیش‌فاکتور قیمت را از RPC `get_sales_search_products` می‌گیرند که از `product_computed_prices` می‌خواند. [measured] بدنهٔ تابع: `LEFT JOIN product_computed_prices pcp` و `JOIN product_computed_prices pcp2`.
- [quoted] `src/routes/_app.sales.quotes.new.tsx:1091-1098`:
  «the settlement-aware path open to sales is the SECURITY DEFINER RPC get_sales_search_products».
- تابلو قیمت، فهرست‌های فروش و market-intelligence هم از `product_computed_prices_public` می‌خوانند ([cited] grep در بخش A1 روش).

**مسیرهای دیگرِ نویسنده در همین جدول** [measured] `source` در `product_computed_prices`:

| source | base | تعداد | آخرین نوشتن |
|---|---|---|---|
| `batch_publish` | پایه/ترم | 591 / 5,457 | 2026-09-13 14:59:58Z |
| `workbench_save` | پایه/ترم | 155 / 1,119 | 2026-09-13 11:49:46Z |
| `currency_rate_change` | پایه | 171 | 2026-09-13 12:22:28Z |
| `queue_purchase_price_changed` | پایه/ترم | 34 / 216 | 2026-08-16 20:49:53Z |
| `sale_list_zero_fix` / `sales_search` / `manual_publish` | — | 30 / 12 / 7 | ≤ 2026-08-20 |

### A2. آیا قیمت‌ها کهنه‌اند؟ — جدول بیست کالا

**روش (honest proxy):**
1. `calculateSalePrice` ([cited] `src/lib/pricing/engine.ts:77-270`، `queries.ts:84-116`، `constants.ts:48-54`) را خط‌به‌خط در SQL بازنویسی کردم: همان انتخاب قیمت خرید، نرخ، قانون (`priority ASC, created_at DESC`، اولین منطبق)، قانون حمل (specificity) و گرد کردن.
2. آن را روی restore در لحظهٔ `2026-09-13 18:38:51Z` اجرا کردم. متن کامل در پیوست الف است.
3. **اعتبارسنجی** [measured]: در ردیف‌هایی که بعد از آخرین تغییر قانون قیمت (`2026-09-02 10:11:43Z`) و قانون حمل (`2026-08-19 09:42:44Z`) و با همان قیمت خرید و نرخ نوشته شده‌اند، بازنویسی باید دقیقاً همان عدد را بدهد:
   ```
   calib after last rule/ship change | f | 5404 | 5404
   calib after last rule/ship change | t |  579 |  579
   ```
   ۵٬۹۸۳ از ۵٬۹۸۳ منطبق. همهٔ ۵۲۸ عدم‌انطباقِ کالیبراسیون قبل از تغییر قانون ۲۰۲۶-۰۹-۰۲ نوشته شده بودند (`before_rule_change = 398 / 130`)، یعنی خودشان کهنه‌اند، نه خطای بازنویسی.

**انتخاب بیست کالا:**
- «قدیمی‌ترین entry pending برای هر کالا»، مرتب بر `min(enqueued_at)`.
- [measured] `ties at min | 179`: ۱۷۹ کالا دقیقاً یک `enqueued_at` دارند (`2026-05-24 12:49:11Z`، ثبت انبوه). بین آن‌ها با SKU مرتب کردم.
- ستون‌ها قیمت نقدی پایه (`cash_price`, `settlement_type_id IS NULL`) را نشان می‌دهند.

[measured] خروجی `analyze4.sql`:

| # | SKU | کالا | موجودی | ردیف pending | قیمت ذخیره‌شده | آخرین نوشتن (UTC) | source | ارز خرید | قیمت خرید | نرخ | قیمت اگر الان محاسبه شود | اختلاف |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | AFK-2026-00001 | یخچال ساید بای ساید ال جی مدل X287 رنگ سیلور | available | 85 | 456,100,000 | 2026-09-13 14:55:30 | batch_publish | toman | 450,000,000 | 1 | 456,100,000 | 0.00% |
| 2 | AFK-2026-00002 | ماشین ظرفشویی بوش مدل SMS43D02ME | unavailable | 48 | 10,000 | 2026-06-13 12:03:53 | workbench_save | toman | 5,199 | 1 | 10,000 | 0.00% ⚠ |
| 3 | AFK-2026-00003 | کولر24هزارجنرال گلد | unavailable | 898 | 107,400,000 | 2026-08-16 20:48:41 | queue_purchase_price_changed | usd | 575 | 230,000 | 134,000,000 | **+24.77%** |
| 4 | AFK-2026-00004 | کولر12هزارجنرال گلد | unavailable | 896 | 63,300,000 | 2026-05-10 08:44:43 | manual_publish | usd | 300 | 230,000 | 69,900,000 | **+10.43%** |
| 5 | AFK-2026-00005 | یخچال ساید بای ساید سامسونگ RS80سیلور34فوت | available | 76 | 491,500,000 | 2026-09-13 14:53:26 | batch_publish | toman | 485,000,000 | 1 | 491,500,000 | 0.00% |
| 6 | AFK-2026-00006 | کولر گازی یونیوا 12000 مدل لوکس GHS | unavailable | 919 | 62,600,000 | 2026-08-19 05:51:25 | currency_rate_change | usd | 330 | 230,000 | 77,200,000 | **+23.32%** |
| 7 | AFK-2026-00007 | یخچال ساید بای ساید ال جی مدل X287 رنگ سفید | available | 61 | 445,900,000 | 2026-09-13 14:50:34 | batch_publish | toman | 440,000,000 | 1 | 445,900,000 | 0.00% |
| 8 | AFK-2026-00008 | ماشین لباسشویی 9 کیلویی سامسونگ مدل W90 رنگ سفید | available | 73 | 137,300,000 | 2026-09-13 14:52:58 | batch_publish | toman | 135,500,000 | 1 | 137,300,000 | 0.00% |
| 9 | AFK-2026-00009 | کولر30جنرال گلدویتالی | unavailable | 906 | 146,300,000 | 2026-07-15 09:35:09 | workbench_save | usd | 770 | 230,000 | 179,500,000 | **+22.69%** |
| 10 | AFK-2026-00010 | ماشین ظرفشویی ال جی مدل DFC513FVسیلور | unavailable | 51 | 300,000 | 2026-07-12 09:20:48 | workbench_save | toman | 300,000 | 1 | 300,000 | 0.00% ⚠ |
| 11 | AFK-2026-00011 | کولرجنرال گلد36هزار | unavailable | 46 | 68,100,000 | 2026-04-30 17:08:56 | currency_rate_change | — | — | — | قابل محاسبه نیست | — (قیمت خرید معتبر ندارد) |
| 12 | AFK-2026-00012 | کولرجنرال گلد36پنلی انزو | unavailable | 41 | — | — | — | — | — | — | قابل محاسبه نیست | — (قیمت خرید معتبر ندارد) |
| 13 | AFK-2026-00013 | جنرال شکار 12000 مدل لبخندی استیل معمولی سرد و گرم | available | 208 | 73,300,000 | 2026-09-13 14:55:22 | batch_publish | toman | 72,000,000 | 1 | 73,300,000 | 0.00% |
| 14 | AFK-2026-00014 | 30ایوولی md1 | unavailable | 47 | 153,400,000 | 2026-08-16 20:49:28 | queue_purchase_price_changed | toman | 153,000,000 | 1 | 155,100,000 | +1.11% |
| 15 | AFK-2026-00016 | جنرال شکار 12000 مدل لبخندی استیل معمولی سردوگرم | unavailable | 45 | 61,200,000 | 2026-05-10 08:42:37 | manual_publish | toman | 60,000,000 | 1 | 60,800,000 | −0.65% |
| 16 | AFK-2026-00017 | جنرال گلد 12000 مدل پلاتینیوم معمولی سرد وگرم | available | 1061 | 77,200,000 | 2026-09-13 14:50:38 | batch_publish | usd | 330 | 230,000 | 77,200,000 | 0.00% |
| 17 | AFK-2026-00018 | جنرال گلد 18000 مدل پلاتینیوم معمولی سرد وگرم | available | 1045 | 101,500,000 | 2026-09-13 14:54:58 | batch_publish | usd | 434 | 230,000 | 101,500,000 | 0.00% |
| 18 | AFK-2026-00019 | کولر گازی جنرال گلد 24000 مدل پلاتینیوم GG-MS24000 PLATINUM معمولی سرد وگرم | available | 1037 | 130,400,000 | 2026-09-13 14:54:49 | batch_publish | usd | 558 | 230,000 | 130,400,000 | 0.00% |
| 19 | AFK-2026-00020 | کولر گازی جنرال گلد 30000 مدل ویتالی GG-MS30 VITALLY معمولی سرد وگرم | unavailable | 944 | 150,600,000 | 2026-08-16 20:49:29 | queue_purchase_price_changed | usd | 805 | 230,000 | 187,900,000 | **+24.77%** |
| 20 | AFK-2026-00021 | موتور برق 21 اسب بخار جنرال برلین مدل BE_6500EIG | available | 896 | 214,500,000 | 2026-09-13 14:50:21 | batch_publish | usd | 920 | 230,000 | 214,500,000 | 0.00% |

⚠ ردیف ۲ و ۱۰ با فرمول منطبق‌اند، اما قیمت خرید ۵٬۱۹۹ و ۳۰۰٬۰۰۰ تومان برای ماشین ظرفشویی به ورود داده‌ی غلط شبیه است. این [assertion] است؛ اندازه‌گیری نشده.

**الگوی جدول [compared]:** هر ۹ کالای `available` صفر اختلاف دارند. هر ۵ اختلاف ≥۱۰٪ روی کالای `unavailable` دلاری است.

**تجمیع کل restore** [measured] `analyze2/3/5/6.sql`:

| گروه | ردیف | منطبق | متفاوت | میانهٔ اختلاف علامت‌دار |
|---|---|---|---|---|
| پایه · `cash_price` | 339 | 196 | 143 | +1.16% |
| پایه · `SPT-001` (سایت) | 260 | 198 | 62 | +0.98% |
| پایه · `SPT-002` | 218 | 193 | 25 | +0.49% |
| ترم · `cash_price` | 1,820 | 1,362 | 458 | +1.18% |
| ترم · `SPT-001` | 3,530 | 3,242 | 288 | +14.61% |
| ترم · `SPT-002` | 1,308 | 1,162 | 146 | +0.50% |

- علت اختلاف در قیمت نقدی پایه (۱۴۱ ردیف سالم): ۶۱ فقط نرخ ارز، ۷۹ فقط قانون قیمت/حمل، ۱ ردیف قیمت خرید. [measured]
- کالاهای موجود: `in-stock products compared: 106 rows 3286 differing rows 0` [measured]. از ۱۰۷ کالای موجود، ۱ کالا قیمت قابل محاسبه ندارد.

**سه کالا با قیمت خرید غلط‌وارد** [measured]. بازمحاسبه برای این‌ها عدد مضحک تولید می‌کند و همهٔ آن‌ها در صف هستند:

| کالا | ردیف فعال خرید | قیمت ذخیره | اگر بازمحاسبه شود | ردیف pending |
|---|---|---|---|---|
| دوقلو سامسونگ سیلور | usd 244,000,000 | 249,700,000 | **56,877,620,000,000** | 717 |
| یخچال ساید بای ساید سامسونگ مدل RH65 رنگ سیلور | toman 90 | 210,800,000 | 0 (history trigger `trg_validate_sale_price_positive` احتمالاً رد می‌کند — [assertion]) | 44 |
| کولر گازی ایوولی 36000 مدل گرند معمولی سرد و گرم | toman 1 | 25,200,000 | 300,000 | 54 |

### A3. چند کالای متمایز؟

[measured] روی dump:
```
pending_products | 376
products_total | active  →  422 | 422   (ستون is_active)
```

**۳۷۶ کالا از ۴۲۲.** توزیع وضعیت آن‌ها [measured]:

| status | stock_status | کالا | ردیف pending |
|---|---|---|---|
| active | unavailable | 239 | 63,350 |
| active | available | 105 | 49,517 |
| active | unknown | 8 | 244 |
| inactive | unavailable | 20 | 5,066 |
| inactive | available | 3 | 3 |
| active | limited | 1 | 74 |

- ۳۵ از این ۳۷۶ کالا در لحظهٔ dump قیمت خرید معتبر ندارند (۱٬۳۲۵ ردیف). پردازش این ردیف‌ها فقط `failed` تولید می‌کند.
- عدد تولیدِ ۱۴ سپتامبر اندازه‌گیری نشد (بخش ۷).

### A4. اثر نرخ ارز بر کالایی که از خرداد بازمحاسبه نشده

[measured] نرخ `usd` (تنها ارزی که در `currency_rates` هست؛ ۴۶۱ ردیف):

| ماه | min | max | تعداد |
|---|---|---|---|
| 2026-05 | 170,000 | 190,000 | 51 |
| 2026-06 | 153,900 | 181,000 | 121 |
| 2026-07 | 174,500 | 197,600 | 98 |
| 2026-08 | 184,300 | 211,500 | 133 |
| 2026-09 | 212,300 | 236,500 | 58 |

```
usd rate at dates | may24 171000 | aug16 186300 | now_ 230000
```

- از ۲۰۲۶-۰۵-۲۴ تا لحظهٔ dump: **+۳۴٫۵٪** [derived: 230000/171000−1].
- از ۲۰۲۶-۰۸-۱۶: **+۲۳٫۵٪** [derived].

چون `purchase_price_toman = price × rate` و سود درصدی هم روی همان حساب می‌شود، قیمت فروش کالای دلاری با سود درصدی تقریباً هم‌نسبت نرخ کهنه می‌شود.

**اندازهٔ واقعی** روی قیمت نقدی پایهٔ کالاهای دلاری، بر اساس ماهی که قیمت ذخیره نوشته شده [measured]:

| ماه آخرین نوشتن | ردیف | نسبت نرخ امروز/نرخ ذخیره | نسبت قیمت امروز/قیمت ذخیره |
|---|---|---|---|
| 2026-05 | 2 | 1.2822 | **1.1645** |
| 2026-07 | 21 | 1.1971 | **1.2069** |
| 2026-08 | 23 | 1.2187 | **1.2309** |
| 2026-09 | 55 | 1.0017 | 1.0017 |

(ردیف 2026-06 به‌خاطر کالای «دوقلو سامسونگ» با قیمت خرید غلط `min rate 1` معنادار نیست.)

**برای کالای موجود:** نرخ در شهریور به‌طور میانگین روزی ۴٫۵ بار دستی عوض شده و بزرگ‌ترین گام ۱٫۵۸٪ بوده [measured]. پس کالای موجودِ دلاری بین تغییر نرخ و انتشار بعدی حداکثر به اندازهٔ همان گام عقب است. [derived]

> **سؤال‌ها بعد از بخش A:** هیچ. تنها تعارض دستورها («E2: با و بدون index اندازه بگیر» در برابر «ساخت هر index در هر جا ممنوع») را با index فرضی (hypopg) و proxy اندازه‌گیری‌شده حل کردم (بخش E2). مسدود نبودم.

---

## B. چرا worker ایستاد

### B1. هیچ‌وقت زمان‌بندی‌شده نبود

- **پیدایش** [cited، git log --follow]: همهٔ فایل‌ها در ۲۰۲۶-۰۵-۱۱ توسط `gpt-engineer-app[bot]` ساخته شدند:
  - `c24e9b6a`/`bfee4423`: hook
  - `5e47f5e4`: processor
  - `060b3e0d`: server fn
  - `e6b8517e`/`6abfe9d6`: `pricing-worker-cron.example.sh`
  - `340df8f6`…`ac9c4ce1`: `docs/PRICING_RECOMPUTE_WORKER.md`
  - `b1292beb`: VALIDATION

  بعد از آن فقط commitهای format در ژوئن (`42235c7a`, `b9015211`, `41a20214`). منطق دست نخورده است.
- **طراحی** [quoted] `docs/PRICING_RECOMPUTE_WORKER.md` (بخش PRICE-RT.5):
  > «اگر cron/timer زیر روی سرور فعال نباشد، propagation قیمت **واقعاً realtime نیست** و اپراتور باید دستی trigger بزند.»
- **هیچ‌گاه نصب نشد:**
  - [cited] `deploy/lan/docker-compose.yml` در بلوک environment سرویس web `PRICING_WORKER_TOKEN` ندارد (`grep -n PRICING_WORKER_TOKEN deploy/lan/docker-compose.yml` → خروجی خالی [measured]). همسایه‌اش را دارد: `76: MARKETING_TASKS_WORKER_TOKEN: ${MARKETING_TASKS_WORKER_TOKEN:-}`.
  - [measured] env کانتینر وب تست: فقط `ISSABEL_IMPORT_WORKER_TOKEN=` و `MARKETING_TASKS_WORKER_TOKEN=` (فقط نام متغیرها چاپ شد).
  - [cited] `deploy/app/.env.production.example:63-70` (قالب لینوکسی که روی LAN نیست).
  - `git log origin/main -G 'cron\.schedule.*pricing'` → خالی.
  - `schtasks … 'pricing'` → ۰ ([cited] `docs/missions/prodprep/C2-cron-verdict.md:52`).
- **ثبت قبلی** [quoted] `PROGRESS.md:138` (ردیف 2026-08-15، commit `cf26b420`):
  > «صف `pricing_recompute_queue` روی تولید ۷۵٬۶۱۰ مورد pending دارد از ۳ خرداد و **هرگز یک بار هم پردازش نشده** (`PRICING_WORKER_TOKEN` تنظیم نیست، هیچ تسک زمان‌بندی‌شده‌ای صدایش نمی‌زند)»
- [quoted] `docs/missions/closeout/CONTRACTS.md:938-947`: «Neither has ever run in this environment» … «the host-cron pattern in this repo is aspirational».

### B2. ۲۰۲۶-۰۸-۱۶ — یک کلیک دستی، نه توقف یک worker

[measured] ردیف‌های غیر pending:
```
batches 08-16 | 2026-08-16 20:48:34.491491+00 | 25 | 20:48:35.047 | 20:48:45.605 | 11.1 s | 22 products | 0.44 s/row
batches 08-16 | 2026-08-16 20:49:17.605911+00 | 25 | 20:49:18.136 | 20:49:32.056 | 14.5 s | 19 products | 0.58 s/row
batches 08-16 | 2026-08-16 20:49:43.18977+00  | 25 | 20:49:43.710 | 20:49:57.878 | 14.7 s | 24 products | 0.59 s/row
```

- هر سه batch دقیقاً ۲۵ تایی‌اند و هر ۷۵ ردیف `enqueued_at = 2026-05-24 12:49:11Z` دارند. یعنی claim به ترتیب `priority, enqueued_at` قدیمی‌ترین‌ها را برداشته.
- **چه کسی:** [measured]
  ```
  queue-source pcp computed_by | queue_purchase_price_changed | has_user=t | 250
  computed_by role             | admin | 250
  ```
  hook `actingUserId` ندارد و `computed_by` را NULL می‌نویسد ([cited] `publish-prices.ts:70-78`؛ روی سرور `auth.getUser()` کاربری ندارد). دکمهٔ UI `actingUserId: userId` می‌فرستد ([cited] `process-queue.functions.ts:48-52`). **پس یک کاربر admin سه بار دکمهٔ «پردازش صف قیمت‌ها» را زده، ساعت ۰۰:۱۸ بامداد ۱۷ اوت به وقت تهران.**
- **git:** در ۲۰۲۶-۰۸-۱۶ و ۰۸-۱۷ هیچ commitای روی هیچ ref نیست. آخرین commit ۰۸-۱۵ `99f6bd58` (merge PR #294) است و ۰۸-۱۸ با کار ledger (migrationهای 336–349) شروع می‌شود. هیچ‌کدام به pricing worker، env یا token دست نزده. `PROGRESS.md` ردیف ۰۸-۱۶/۰۸-۱۷ ندارد (`grep -c '2026-08-1[67]' PROGRESS.md` = 0). [cited]
- **جمع‌بندی:** worker «نایستاد»؛ هیچ‌وقت نبود. ۰۸-۱۶ تنها اجرای دستی روی تولید بود. همان روز در `price_calculation_snapshots` ۶۲۲ snapshot برای ۱۸۳ کالا ثبت شد که بیشترش از مسیرهای دیگر است [measured].

### B3. آیا hook در دسترس است و امروز کار می‌کند؟ (صدا زده نشد)

- **مسیر و احراز هویت** [quoted] `src/routes/api/public/hooks/process-pricing-queue.ts:17-33`:
  ```ts
  const expected = process.env.PRICING_WORKER_TOKEN;
  if (!expected) {
    return new Response(
      JSON.stringify({ ok: false, error: "PRICING_WORKER_TOKEN is not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
  if (!token || token !== expected) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, … });
  }
  ```
- **در دسترس بودن:** [measured] Caddy کامپیوتر تست همه‌چیز را به وب می‌فرستد و هیچ قاعده‌ای برای `/api/public` ندارد:
  ```
  test.myafrakala.ir {
      reverse_proxy web:3000
  }
  ```
  یعنی از اینترنت هم reachable است. Caddy تولید اندازه‌گیری نشد.
- **امروز کار می‌کند؟**
  - روی تست: خیر. token در env کانتینر نیست [measured]، پس پاسخ 500 است. [quoted] `docs/research/m5b-anon-products.md:290`: `process-pricing-queue      HTTP 500  {"error":"PRICING_WORKER_TOKEN is not configured"}`
  - روی تولید: compose همان فایل است و token را پاس نمی‌دهد [cited]. پس حتی اگر در `.env.lan` تولید باشد، به کانتینر نمی‌رسد. خود env تولید اندازه‌گیری نشد.
  - اگر token تنظیم شود، مسیر کار می‌کند؛ `supabaseAdmin` همان service-role است و `claim` روی restore سالم اجرا شد (C1).
- **یادداشت امنیتی کوچک [assertion]:** مقایسهٔ `token !== expected` در زمان ثابت (constant-time) نیست. روی LAN ریسکش پایین است.

---

## C. هزینهٔ خالی‌کردن

### C1. اندازهٔ batch و زمان یک batch

- **batch:** پیش‌فرض ۲۵، سقف ۱۰۰. [quoted] processor: `Math.min(100, Math.max(1, Math.floor(opts.batchSize ?? 25)))` (`process-recompute-queue.server.ts:54`) و در SQL `IF _batch_size > 100 THEN _batch_size := 100`. دکمهٔ UI بدنه‌ای نمی‌فرستد، پس همیشه ۲۵ است.
- **claim روی restore** [measured] (در `BEGIN … ROLLBACK`):
  ```
  claim100 | 100   Time: 7.951 ms
  claim25  | 25    Time: 1.224 ms
  Index Scan using idx_prq_pending_pri_eq … Execution Time: 0.090 ms
  ```
  claim ارزان است. هزینه در `publishProductPrices` در Node است.
- **زمان batch:** اجرای Node worker روی restore ممکن نبود (بخش ۷). نزدیک‌ترین اندازهٔ واقعی، اجرای تولید در ۲۰۲۶-۰۸-۱۶ است: **۱۱٫۱ تا ۱۴٫۷ ثانیه برای ۲۵ ردیف = ۰٫۴۴ تا ۰٫۵۹ ثانیه برای هر ردیف** [measured].
- اما fan-out امروز بزرگ‌تر است:
  - [measured] بیشترین ردیف `product_computed_prices` که آن اجرا برای یک کالا نوشت: `14`. امروز: `69`.
  - snapshot برای هر ردیف صف در آن اجرا: `1.97`. امروز: ۳ نوع‌قیمت فعال.
  - برآورد برای هر ردیف امروز: **۲٫۲ تا ۲٫۹ ثانیه** [derived: 0.44–0.59 × 69/14]. یک batch ۲۵ تایی ≈ ۵۴ تا ۷۳ ثانیه؛ یک batch ۱۰۰ تایی ≈ ۳٫۶ تا ۴٫۹ دقیقه [derived].

### C2. کل ۱۱۹٬۷۷۹ ردیف

| سناریو | فرمول | زمان |
|---|---|---|
| ردیف‌به‌ردیف، fan-out ۰۸-۱۶ | 119,779 × 0.44–0.59 s | ۱۴٫۶ تا ۱۹٫۶ ساعت [derived] |
| ردیف‌به‌ردیف، fan-out امروز | 119,779 × 2.2–2.9 s | **۷۳ تا ۹۶ ساعت** [derived] |
| با دکمهٔ UI | 119,779 / 25 | **۴٬۷۹۲ کلیک** [derived] |
| cron هر ۳۰ ثانیه با batch ۱۰۰ | هر batch ۲۲۰–۲۹۰ s > ۳۰ s | اجراها روی هم می‌افتند؛ `SKIP LOCKED` مانع دوباره‌کاری است ولی موازی‌سازی بار را روی DB و Node جمع می‌کند [derived] |
| **یک بار برای هر کالا** | 376 × 2.2–2.9 s | **۱۴ تا ۱۸ دقیقه** [derived] |

- صف تا لحظهٔ خالی‌شدن هم رشد می‌کند: ۳۰ روز اخیر روزی ۷۴۰ تا ۷٬۰۳۵ ردیف (۰۹-۱۳: ۱٬۴۹۹) [measured].

### C3. نوشتن‌های هر ردیف و اثر بر کاربران هم‌زمان

**برای هر ردیف صف (امروز)** [cited: `publish-prices.ts`, `engine.ts`] + [measured: triggers]:
- ۶۹ upsert در `product_computed_prices`، هر کدام با trigger `sync_sale_list_items_from_computed`. این trigger فقط وقتی `current_price IS DISTINCT FROM` باشد `sale_list_items` را UPDATE می‌کند.
- ۳ insert در `price_calculation_snapshots` و **۳ insert در `audit_logs`** (trigger `audit_price_snapshots`)، **در هر تکرار**، حتی اگر قیمت عوض نشده باشد.
- ۰ تا ۳ insert در `product_sale_price_history`. هر کدام: `audit_logs` + `notification_queue` برای ۱ accountant + ارزیابی هشدار قیمت. فقط در اولین تکرارِ هر کالا که قیمت واقعاً عوض شود، چون تکرارهای بعدی همان عدد را می‌دهند [derived از منطق `engine.ts:370-390`].
- حدود ۶۹ × ۵ خواندن REST (product، purchase، rate، rules ≤۵۰۰، shipping ≤۵۰۰) [derived از `engine.ts:86-206`].

**حجم تجمعی خالی‌کردن ردیف‌به‌ردیف** [derived]:
- 119,779 × 3 ≈ **۳۵۹ هزار snapshot**. میانگین فعلی ۴۰ MB / ۲۳٬۲۹۵ ردیف ≈ ۱٫۷ KB، پس ≈ ۶۰۰ MB.
- **≈ ۳۵۹ هزار ردیف audit_logs**، یعنی ۳٫۱ برابر کل جدول فعلی. این همان جدولی است که یافتهٔ ۲ کندی‌اش را اندازه گرفت.
- ≈ ۸٫۳ میلیون upsert.

**قفل‌ها:**
- claim فقط ردیف‌های صف را با `FOR UPDATE SKIP LOCKED` قفل می‌کند و در تراکنش خودِ RPC آزاد می‌کند [quoted A1].
- بقیه، فراخوان‌های مستقل PostgREST با autocommit هستند: قفل سطر کوتاه روی `product_computed_prices`، بدون `LOCK TABLE` و بدون DDL [cited: کد مسیر].
- تداخل ممکن با کاربر [assertion]: ذخیرهٔ workbench روی همان سطر `product_computed_prices` لحظه‌ای منتظر می‌ماند.
- اثر روی Node [assertion]: کانتینر وب همان پروسه‌ای است که به کاربران پاسخ می‌دهد و این حلقه در آن اجرا می‌شود.
- اثر ملموس اندازه‌گیری نشد (بخش ۷).
- Realtime: [measured] `pg_publication_tables` برای `product_computed_prices`، `pricing_recompute_queue`، `product_sale_price_history` و `sale_list_items` → `(0 rows)`. پس هیچ پخش Realtime‌ای به مرورگرها نمی‌رود.

### C4. تحلیل تکرار — عددی که برنامه را تعیین می‌کند

[measured]:
```
C4 | pending 118254 | products 376 | superseded 117878 | superseded_pct 99.68 | rows_per_product 314.5
C4 per-product distribution (p50, p90, p99, max) | {96,901,1037,1071}
```

**چرا «superseded» درست است، نه فرض:** processor از ردیف صف فقط `product_id` و `reason` را می‌خواند. `reason` فقط برچسب `source` است ([quoted] `process-recompute-queue.server.ts:96-102`: `publishProductPrices({ productId: job.product_id, source: reasonToSource(job.reason), … })`). `publishProductPrices` همیشه **وضعیت فعلی** قیمت خرید، نرخ و قوانین را می‌خواند ([cited] `publish-prices.ts:81`، `engine.ts:116,138,148,198`). پس دو ردیف برای یک کالا دقیقاً یک نتیجه می‌دهند. `source_id` و `sale_price_type_id` در محاسبه استفاده نمی‌شوند.

**۱۱۸٬۲۵۴ ردیف = ۳۷۶ کار واقعی.** ۹۹٫۶۸٪ تکراری است.

سهم هر reason [measured]:

| reason | ردیف | ٪ |
|---|---|---|
| currency_rate_activated | 44,544 | 37.7 |
| currency_rate_changed | 44,544 | 37.7 |
| pricing_rule_changed | 13,948 | 11.8 |
| purchase_price_activated | 7,208 | 6.1 |
| purchase_price_deactivated | 6,609 | 5.6 |
| shipping_rule_changed | 816 | 0.7 |
| purchase_price_changed | 585 | 0.5 |

دلیل ۷۵٪ سهم نرخ ارز: ویرایش سریع نرخ دو نوشتن می‌کند، UPDATE `is_active=false` روی نرخ قبلی و INSERT نرخ جدید ([quoted] `effective-currencies.ts:117-138`). trigger برای هر دو، برای هر ۱۱۷ کالای دلاری ردیف می‌سازد (`currency_rate_changed` و `currency_rate_activated`، هر کدام با `count(distinct source_id) = 426`).

---

## D. کوئری سایدبار

### D1. چرا شمارش به RLS نیاز دارد و view چه نشان می‌دهد

[quoted] `supabase/migrations/20260511162928_dead5682-…sql:357-371`:
```sql
CREATE OR REPLACE VIEW public.v_pricing_recompute_queue_summary AS
SELECT
  count(*) FILTER (WHERE status = 'pending')    AS pending_count,
  count(*) FILTER (WHERE status = 'processing') AS processing_count,
  count(*) FILTER (WHERE status = 'failed')     AS failed_count,
  count(*) FILTER (WHERE status = 'done')       AS done_count,
  min(enqueued_at) FILTER (WHERE status = 'pending') AS oldest_pending_at,
  (SELECT error FROM public.pricing_recompute_queue
    WHERE status = 'failed' AND error IS NOT NULL
    ORDER BY processed_at DESC NULLS LAST LIMIT 1) AS latest_error
FROM public.pricing_recompute_queue;
```

- view چهار شمارنده، یک timestamp و متن آخرین خطا را نشان می‌دهد. آخرین خطا [measured]: «برای این محصول قیمت خرید معتبر ثبت نشده است…»، پیام عمومی بدون دادهٔ مشتری.
- RLS به‌خاطر خود شمارش لازم نشد. از ۲۰۲۶-۰۶-۱۵ view به `security_invoker=true` تغییر کرد ([cited] `20260615065224_…sql:2`) تا anon از راه view مالک‌محور به جدول نرسد. نتیجهٔ جانبی: RLS جدول برای **هر ردیف شمرده‌شده** اجرا می‌شود.
- انتظار از RLS: کاربر غیرمجاز صفر ببیند. [quoted] `docs/research/production-audit-2026-09-07.md:180`: `{pending_count:0, …}` برای anon.

### D3. آیا روی هر بارگذاری برای هر کاربر اجرا می‌شود؟

**خیر، برای همه نیست.** [quoted] `src/components/layout/AppSidebar.tsx:91-95, 201-217`:
```tsx
const canSeePricingQueue = isAdmin || isManager || isAccountant;
…
useQuery({
  queryKey: ["sidebar-pricing-queue-summary"],
  enabled: canSeePricingQueue,
  queryFn: async () => { … .from("v_pricing_recompute_queue_summary").select("pending_count, failed_count, oldest_pending_at").maybeSingle(); … },
});
```

- `refetchInterval` ندارد و `staleTime` پیش‌فرض ۳۰ ثانیه است ([cited] `src/routes/__root.tsx:378-380`).
- `AppSidebar` در `AppShell` ([cited] `AppShell.tsx:21-23`) داخل layout `_app` ([cited] `_app.tsx:204-218`) mount می‌شود. پس برای ۲۶ کاربر admin/manager/accountant [measured] **در هر بارگذاری کامل صفحه یا ورود** یک بار اجرا می‌شود، نه در هر navigation داخلی.
- صفحهٔ `/pricing/recompute-prices` جدا از این، **هر ۶۰ ثانیه** همان view را با کلید دیگری می‌خواند و `enabled` ندارد ([quoted] `_app.pricing.recompute-prices.tsx:74-95`).

### D2. گزینه‌ها — همه روی restore، با بدنه‌های 542، در تراکنش rollback‌شده [measured]

```
=== PRE-542 superuser view                         Execution Time: 17.453 ms
=== PRE-542 authenticated admin: view              Execution Time: 3898.182 ms
=== 542 admin: view                                Execution Time: 6198.146 ms
=== 542 + initplan-wrapped policies: view          Execution Time: 30.152 ms
```

| گزینه | اثر اندازه‌گیری‌شده/برآورد | هزینه | ریسک |
|---|---|---|---|
| **(الف) index** | **بی‌اثر.** plan همین حالا `Seq Scan … rows=118329` است و superuser با همان plan ۱۷ms می‌گیرد. ۶٫۲ ثانیه هزینهٔ اجرای ۲×۱۱۸ هزار تابع SECURITY DEFINER است، نه I/O [measured] | — | — |
| **(ب) بستن فراخوان policy در `(SELECT …)`** (initplan؛ یک بار برای هر statement) | **۶٬۱۹۸ → ۳۰ ms** [measured] | یک migration با ۲ `ALTER POLICY` روی این جدول | معنای policy برای یک statement عوض نمی‌شود (`uid()` در یک statement ثابت است). همان الگو که 542 خودش پیشنهاد داده ([quoted] `542:272-273`: «wrap hot policy calls as (SELECT has_role(auth.uid(), ...)) so they run once per statement»). باید با شبیه‌سازی JWT برای anon، viewer و کاربر غیرفعال اثبات شود |
| (ج) تابع SECURITY DEFINER با role check که فقط شمارنده برمی‌گرداند | ≈ همان ۱۷ms superuser [derived] | تابع جدید + grant + تغییر کد frontend در ۲ جا | پروژه در 525 و 542 سطح definer را بست؛ یک definer تازه دقیقاً همان جنس سطحی است که بسته شد |
| (د) materialized summary | ms [assertion] | MV + job refresh (pg_cron) + grant | کهنه بودن شمارنده؛ یک job دیگر که ممکن است مثل worker بی‌صاحب بماند |
| (هـ) حذف از سایدبار | ۰ms | یک خط | badge هشدار صف از بین می‌رود — همان هشداری که قرار بود این مشکل را خبر دهد (هرچند هیچ‌کس به آن عمل نکرد) |
| (و) خالی/جمع کردن صف | هزینه برای هر ردیف ≈ 6198/118329 = ۵۲µs → ۳۷۶ ردیف ≈ ۲۰ms [derived] | عملیات دادهٔ تولید با تأیید مالک | بدون worker زمان‌بندی‌شده صف دوباره رشد می‌کند (~۱٬۵۰۰/روز) و طی حدود ۲٫۵ ماه به همین ۵ ثانیه برمی‌گردد [derived] |

**پیشنهاد: (ب).** با یک الگوی بی‌تغییر معنایی، هم D (۶٫۲s→۳۰ms) و هم E (۵٫۹s→۳۳ms، پایین‌تر) درست می‌شود و به وضعیت صف وابسته نیست.
**آنچه از دست می‌دهم:** یک migration روی policyها. طبق قاعدهٔ پروژه، تغییر policy حساس است و تست rollback با JWT و تأیید مالک می‌خواهد. (و) هم جداگانه لازم است، ولی برای قیمت‌ها، نه برای سرعت.

---

## E. audit_logs

### E1. index پیشنهادی (ساخته نشد)

```sql
-- پیشنهاد، اجرا نشده
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_created_at_desc
  ON public.audit_logs (created_at DESC);
```

- **اندازه:** [measured] با index فرضی `hypopg` (در تراکنش rollback‌شده، روی دیتابیس دورریختنی): `hypo index | <13558>btree_audit_logs_created_at | 2368 kB`. برای مقایسه، `audit_logs_pkey` (bigint، همان تعداد ردیف) = `2576 kB`.
- **هزینهٔ نوشتن:** یک insert btree دیگر برای هر ردیف audit (از ۵ index به ۶). کلید تقریباً صعودی است و insertها به صفحهٔ سمت راست می‌روند. با نرخ ۱٬۷۷۸ ردیف در روز [measured E3] ناچیز است [assertion؛ throughput insert اندازه‌گیری نشد].
- **planner از آن استفاده می‌کند** [measured, hypopg EXPLAIN]:
  ```
  Limit  (cost=0.04..51.00 rows=200 width=160)
    ->  Index Scan using "<13558>btree_audit_logs_created_at" on audit_logs
  Limit  (cost=0.04..193.46 rows=50 width=160)
    ->  Index Scan using "<13558>btree_audit_logs_created_at" on audit_logs
          Index Cond: ((created_at >= '2026-09-01 …') AND (created_at <= '2026-09-13 23:59:59 …'))
  ```

### E2. با و بدون index

ساخت index حتی روی restore ممنوع بود. برای «با index»، proxy اجراشدنی گرفتم: `ORDER BY id DESC` با `audit_logs_pkey`. `id` از `bigserial` است و ترتیبش تقریباً همان `created_at` است (`id vs created_at order violations | 286` از ۱۱۶٬۰۹۵ [measured]). پس الگوی دسترسی (index scan backward + LIMIT + RLS فقط روی ردیف‌های لازم) همان است که index `created_at` می‌داد.

[measured] به‌عنوان admin فعال، بدنه‌های 542، `EXPLAIN (ANALYZE, TIMING OFF)`:

| کوئری (همان که صفحه می‌فرستد) | بدون index | proxy با index | فقط initplan (ب) |
|---|---|---|---|
| `/audit-logs`: `order by created_at desc limit 200` | **5,884.7 ms** (`Seq Scan … rows=116095` + `top-N heapsort`) | **17.3 ms** (`Index Scan Backward using audit_logs_pkey … rows=200`) | 33.0 ms |
| `/admin/audit` صفحهٔ ۰: `limit 50` | 5,700.0 ms | ≤17.3 ms [derived: زیرمجموعهٔ ردیف بالا] | — |
| `/admin/audit` صفحهٔ ۲۱: `offset 1000 limit 50` | 6,475.0 ms | 54.0 ms (`rows=1050`) | — |
| `/admin/audit` با `entity_type='penalty'` و بازهٔ تاریخ | 0.549 ms (`audit_logs_entity_idx`) | — | — |
| `count(*)` (هیچ صفحه‌ای `count: "exact"` نمی‌فرستد [cited `_app.audit-logs.tsx:46-53`, `_app.admin.audit.tsx:87-130`]) | 5,884.0 ms | index کمکی نمی‌کند | 22.6 ms |

**نتیجه:** index به‌تنها هر دو صفحه را زیر ۶۰ms می‌آورد. (ب) به‌تنها هم همین کار را می‌کند و `count(*)` را هم درست می‌کند. هر دو با هم بیشترین حاشیه را می‌دهند.

### E3. رشد و retention

[measured]:
```
E3 summary | min 2026-05-24 12:44:21 | max 2026-09-13 15:38:06 | last30 53353 | per_day_avg 1778 | last90 101050
E3 by month | 2026-05 3471 | 2026-06 22841 | 2026-07 15936 | 2026-08 48888 | 2026-09 (13 روز) 24959
E3 avg row bytes | 585
```

- روزانه در ۳۰ روز اخیر: از ۱ (۰۸-۲۱) تا ۸٬۲۷۴ (۰۹-۰۱).
- **سهم قیمت‌گذاری:** `price_calculated_snapshot_created` ۱۶٬۳۷۹ + `sale_price_history_created` ۹٬۷۱۶ = **۴۹٪** از ۵۳٬۳۵۳ ردیف ۳۰ روز اخیر [measured].
- **retention:** وجود ندارد.
  - [measured] `E3 cron retention? | 0` (هیچ تابعی `delete from … audit_logs` ندارد).
  - [cited] `src/lib/audit/index.ts:299-317`: `archiveOldAuditLogs` فقط می‌شمارد (`// For now, just count`) و فراخوان ندارد.
  - در migrations و deploy هیچ purge یا cron‌ای برای audit_logs نیست.
- **یک سال بعد** [derived]: 116,095 + 1,778 × 365 ≈ **۷۶۵ هزار ردیف**، ≈ ۴۲۰ MB با ۵۸۵ بایت برای هر ردیف. اگر صف ردیف‌به‌ردیف خالی شود، ۳۵۹ هزار ردیف دیگر هم در یک روز اضافه می‌شود (C3).
- بدون index، هزینهٔ صفحه با تعداد ردیف خطی رشد می‌کند: حدود ۶٫۶ برابر ≈ ۳۹ ثانیه [derived: 5.9 s × 765k/116k].

---

## F. دو صفحهٔ خراب

### F1. `/accounting/receipts/$receiptId`

**کد** [quoted] `src/routes/_app.accounting.receipts.$receiptId.tsx:244-255`:
```tsx
const { data: linkedInvoices = [] } = useQuery<LinkedInvoice[]>({
  queryKey: ["payment-receipt-links", receiptId],
  enabled: !!receipt,
  queryFn: async () => {
    const { data, error } = await supabase
      .from("payment_receipt_links")
      .select("id, amount, invoice:invoices(id, number, total_amount, status)")
      .eq("receipt_id", receiptId);
    if (error) throw error;
    return (data ?? []) as unknown as LinkedInvoice[];
  },
});
```

**چه می‌خواهد نشان دهد** [quoted] همان فایل `:609-651`: بخش «پیش‌فاکتورهای متصل» با شماره، «مبلغ کل» و وضعیت «پرداخت‌شده/پرداخت جزئی» هر سند متصل، و مبلغ تخصیص‌یافته. فقط برای `receipt_type === "invoice_payment"` نمایش داده می‌شود ([cited] `src/lib/receipts/receipt-types.ts:43-45`).

**داده جای دیگر هست؟** بله، در `sales_quotes`:
- [quoted] `20260724080000_148_receipt_links_to_quotes_write_path.sql:9-11`: «This business issues no invoices, so quote links are the only links it will ever have.»
- ستون `quote_id → sales_quotes(id)` در همان migration اضافه شد (`:31-39`).
- FK `invoice_id` در 329 برداشته شد (`:69`) و جدول `invoices` در 332 حذف شد ([quoted] `20260808220000_332_drop_invoices_table.sql:498`: `DROP TABLE public.invoices;`).
- نویسنده‌ها فقط `quote_id` می‌نویسند ([cited] `20260818181000_349_create_receipt.sql:429`: `INSERT INTO public.payment_receipt_links (receipt_id, quote_id, amount)`).
- صفحهٔ فهرست رسیدها همین حالا درست embed می‌کند ([quoted] `src/routes/_app.accounting.receipts.tsx:188-194`: `quote:sales_quotes(quote_number, items:sales_quote_items(…))`).

**حکم:** قابلیت **زنده** است که به **جدول اشتباه** اشاره می‌کند، نه مرده.
- از فهرست رسیدها لینک می‌شود ([cited] `_app.accounting.receipts.tsx:540`).
- embed بعد از 332 به‌روز نشد (آخرین commit مرتبط با فایل: `d70643a3` در ۲۰۲۶-۰۸-۲۴ که به embed دست نزد).

### F2. `/pricing/amin-hozoor-board`

**کد** [quoted] `src/lib/pricing/board-access.ts:68-90`:
```ts
let q = supabase
  .from("pricing_board_access_requests")
  .select("*, profile:profiles!pricing_board_access_requests_user_id_fkey(id, full_name, phone)")
  .eq("board_key", boardKey)
  .order("requested_at", { ascending: false })
  .limit(100);
…
if (error) {
  // در صورت نبود FK explicit، بدون join تلاش کن
  const fallback = await supabase.from("pricing_board_access_requests").select("*") … .limit(100);
  …
  return enrichWithProfiles(filtered);
}
```

- جدول هیچ FK ندارد ([quoted] `20260430180123_632b4c07-…sql:6-23`: `user_id uuid NOT NULL,` بدون `REFERENCES`). نام `pricing_board_access_requests_user_id_fkey` در هیچ migrationی نیست.
- **چه کسی از تابلو استفاده می‌کند:**
  - route با `requirePermission("pricing", "view")` محافظت می‌شود ([quoted] `_app.pricing.amin-hozoor-board.tsx`).
  - کاربری که مدیر نیست بدون ردیف تأییدشده فقط «در انتظار تأیید» می‌بیند و درخواست خودکار ثبت می‌شود ([cited] `usePricingBoardAccess.ts:33-46`).
  - مدیر (admin/manager/accountant) همیشه approved است ([cited] `:19-20, :51`).
  - در sidebar با برچسب «تابلو قیمت زنده» هست ([cited] `registry.ts:213-220`).
- **فهرست درخواست‌های pending چه می‌کند:** کارت `BoardAccessRequestsCard` برای دارندگان `pricing.update` هر ۴۵ ثانیه این کوئری را می‌زند ([cited] `BoardAccessRequestsCard.tsx:19-24`). تأیید یا رد مستقیم `UPDATE` روی جدول است، سپس `audit_logs.insert` و `notification_events.insert` ([cited] `board-access.ts:139-203`)، بدون تراکنش مشترک.
- **حکم:** قابلیت **زنده و کارا** است. embed به FKای اشاره می‌کند که هیچ‌وقت ساخته نشده. fallback کار را درست انجام می‌دهد، ولی با یک درخواست ناموفق و دو کوئری اضافه در هر بار.

### F3. آیا امروز کسی مسدود است؟

[measured] روی dump تولید:
```
F3 payment_receipt_links | 0 | invoice_id 0 | quote_id 0 | max(created_at) NULL
F3 receipts by type      | invoice_payment | 6 | 2026-09-13 12:06:41
F3 receipts by type      | debt_payment    | 1 | 2026-08-11 14:21:09
F3 receipt audit last30  | receipt_created | 6
F3 board requests        | amin_hozoor_sales_board | approved | 6 | 2026-05-26 … 2026-08-01 | reviewed 2026-08-01 11:20
F3 board audit           | pricing_board_access_approved | 6 | 2026-08-01 11:20
board sessions           | 401 | 15 users | 2026-05-24 … 2026-09-13 10:01
board sessions per week  | 2026-07-13:10/1 · 07-20:37/3 · 07-27:30/5 · 08-03:22/2 · 08-10:22/4 · 08-17:38/6 · 08-24:28/4 · 08-31:22/4 · 09-07:26/1
```

| صفحه | کسی مسدود است؟ | شاهد |
|---|---|---|
| رسید | **نه.** هیچ پیوندی در کل تولید نیست، پس پیام «متصل نیست» با داده یکی است. قابلیت استفاده می‌شود (۶ رسید `invoice_payment`) ولی بخش «متصل» تهی است. | [measured] |
| تابلو قیمت | **نه.** fallback کار می‌کند؛ ۱۵ کاربر هر هفته از آن استفاده می‌کنند؛ صف pending خالی است. | [measured] |

---

## ۵. گزینه‌ها، هزینه، ریسک و پیشنهاد

### مسئلهٔ ۱ — صف و قیمت کهنه

| گزینه | هزینه | ریسک | پیشنهاد |
|---|---|---|---|
| 1a. روشن کردن هوک با cron و خالی‌کردن ردیف‌به‌ردیف | token در compose + scheduler روی Windows؛ ۷۳ تا ۹۶ ساعت کار | ۳۵۹ هزار audit + ۶۰۰ MB snapshot؛ انتشار قیمت ۵۶٬۸۷۷ میلیارد تومانی؛ بار Node در ساعت کاری | ✗ |
| 1b. **جمع کردن صف به یک ردیف برای هر کالا** (وضعیت `cancelled` که در check constraint مجاز است [measured `\d+`]) و پردازش ۳۷۶ ردیف باقی | عملیات دادهٔ تولید با تأیید مالک؛ ۱۴ تا ۱۸ دقیقه؛ ≈۱٬۱۳۰ audit | باید اول سه قیمت خرید غلط اصلاح شود؛ ۳۵ کالای بدون قیمت خرید `failed` می‌شوند؛ باید روی restore تمرین شود | ✓ کوتاه‌مدت |
| 1c. پردازش جمع‌شده در خود enqueue: تغییر `enqueue_pricing_recompute` تا اگر برای کالا pending هست ردیف تازه نسازد | یک migration (`CREATE OR REPLACE` پس از خواندن تعریف زنده) | معنای «یک کار برای هر کالا» درست است (C4)؛ `source_id` دیگر برای ردیابی علت هر ردیف نمی‌ماند | ✓ میان‌مدت، همراه 1d |
| 1d. scheduler واقعی (pg_cron → تابع؛ یا Windows Task → hook) | token + job + پایش | همان سرنوشت worker قبلی اگر صاحب و هشدار نداشته باشد | ✓ بعد از 1b و 1c |
| 1e. گسترش «انتشار دسته‌ای» به کالاهای ناموجود، یا بازمحاسبه هنگام `stock_status → available` | کد + trigger | کالای ناموجودِ زیاد → زمان انتشار دسته‌ای بیشتر | ✓ جایگزین ارزان‌تر 1d برای کالای برگشتی |

**پیشنهاد:** ترتیب 1b → 1c → 1d. تا آن زمان هیچ خالی‌کردن ردیف‌به‌ردیفی انجام نشود.

### مسئلهٔ ۲ — سایدبار

پیشنهاد: **(ب) wrap policy** (جدول D2). جزئیات هزینه و ریسک بالاتر.

### مسئلهٔ ۳ — audit_logs

| گزینه | اثر | هزینه | ریسک |
|---|---|---|---|
| index `created_at DESC` (E1) | ۵٫۹s → ۱۷ms (proxy) | ۲٫۴ MB، یک insert btree | `CONCURRENTLY` باید خارج از `--single-transaction` اجرا شود، که با قاعدهٔ ۲ پروژه تعارض دارد؛ روش اجرا باید با مالک توافق شود |
| wrap policy (ب) | ۵٫۹s → ۳۳ms؛ count ۵٫۹s → ۲۳ms | همان migrationِ D | همان ریسک D |
| retention (مثلاً آرشیو ردیف‌های `price_calculated_snapshot_created` قدیمی‌تر از N ماه) | رشد را نصف می‌کند (۴۹٪) | تصمیم کسب‌وکار + job | حذف داده ممنوع است (قاعدهٔ ۳)؛ فقط با تأیید مالک |

**پیشنهاد:** (ب) و index، هر دو. retention بعد از تصمیم مالک.

### مسئلهٔ ۴ — دو صفحه

- **F1:** embed به `quote:sales_quotes(quote_number, …)` از راه `quote_id` تغییر کند، مثل `_app.accounting.receipts.tsx:192`. کم‌ریسک است ولی امروز هیچ دادهٔ قابل نمایشی نیست.
- **F2:** یا select بدون embed + `enrichWithProfiles` (همان fallback) مستقیم شود، یا FK ساخته شود. FK به `profiles` باید قاعدهٔ ۹ را رعایت کند، چون `profiles` همان persons نیست و نیاز به بررسی دارد [assertion].

**پیشنهاد:** حذف embed. تغییر فقط در frontend، بدون migration.

---

## ۶. اگر یک ساعت داشتم، اول چه می‌کردم

1. **۱۰ دقیقه — بدون هیچ نوشتنی:** فهرست سه کالای با قیمت خرید غلط را به مالک یا کارشناس خرید بدهم تا از UI اصلاح شوند: «دوقلو سامسونگ سیلور» usd 244,000,000، «RH65» toman 90، «ایوولی 36000 گرند» toman 1. تا این اصلاح نشده، هر مسیر بازمحاسبه‌ای (صف، دکمه، انتشار دسته‌ای وقتی کالا موجود شود) قیمت مضحک منتشر می‌کند.
2. **۵۰ دقیقه — روی دیتابیس دورریختنی، نه تولید:** پیش‌نویس یک migration که فقط `(SELECT …)` را دور فراخوان‌های policy در `pricing_recompute_queue` و `audit_logs` می‌پیچد، به‌همراه تست `BEGIN … ROLLBACK` با JWT برای admin فعال، admin غیرفعال، viewer و anon. نتیجه: اثبات «پاسخ یکسان، ۶٫۲s→۳۰ms». سپس ارائه به مالک برای تأیید.

   چرا این و نه صف: کندی برای ۲۶ کاربر در هر بارگذاری است. قیمت کالاهای موجود در لحظهٔ dump درست بود. جمع کردن صف عملیات روی دادهٔ تولید است که تأیید مالک می‌خواهد و تنها پیش‌نیازش همان اصلاح سه قیمت خرید است.

---

## ۷. آنچه نتوانستم اندازه بگیرم

1. **وضعیت امروز تولید (۱۴ سپتامبر).** همهٔ اعداد قیمت و صف از dump `2026-09-13 18:38:51Z` هستند. اگر بعد از آن نرخ یا قانون عوض شده و «انتشار دسته‌ای» نخورده، کالای موجود هم ممکن است عقب باشد. کوئری روی تولید اجرا نکردم؛ restore برای پاسخ کافی بود و تنها تفاوت، یک روز رشد است.
2. **زمان batch با کد واقعی Node روی restore.** اجرای worker به PostgREST وصل به restore نیاز داشت، یعنی `docker run`، که ممنوع است. عدد C1 از اجرای واقعی تولید در ۰۸-۱۶ است و ضریب fan-out امروز (×۴٫۹) [derived] است.
3. **اثر خالی‌کردن بر کاربران هم‌زمان** (latency صفحهٔ فروش، CPU کانتینر وب). هیچ اجرای موازی قابل مشاهده‌ای نبود.
4. **قیمتی که هنگام صدور ۱۵ پیش‌فاکتورِ روی کالاهای کهنه دیده شد.** `product_computed_prices` با upsert بازنویسی می‌شود و تاریخچهٔ لحظه‌ای ندارد. `unit_price` پیش‌فاکتورها اغلب بالاتر از قیمت کهنهٔ امروز است، که با «کالا آن روز موجود و تازه بود» سازگار است، ولی اثبات نشد.
5. **مدت واقعی عقب‌ماندگی کالای موجود بین تغییر نرخ و انتشار بعدی.** فقط گام‌های نرخ (بیشینه ۱٫۵۸٪) و روزهای انتشار (۲۷ روز از ۳۵ روز از ۰۸-۱۰) اندازه شد، نه قیمت در هر لحظه.
6. **env و Caddy تولید.** نبودن `PRICING_WORKER_TOKEN` در تولید از `PROGRESS.md:138` و compose نقل شده؛ خود کانتینر تولید را بازرسی نکردم.
7. **`cron.job` روی restore.** `pg_cron` در دیتابیس غیر `postgres` ساخته نمی‌شود (خطای restore: `can only create extension in database postgres`).
8. **خطای دقیق PostgREST برای دو embed شکسته** (کد `PGRST200` یا مشابه). بدون JWT معتبر روی Kong تست، درخواست را نزدم.
9. **throughput نوشتن با index جدید روی audit_logs.** index واقعی ساخته نشد؛ فقط اندازه (hypopg) و plan.
10. **مسیر ممیزی «ویرایش سریع نرخ»** [measured، یافتهٔ جانبی]: `currency_rate_quick_update` آخرین ردیفش `2026-08-11 08:40:59Z` است، در حالی که ۱۴۳ نرخ با `source_name='ویرایش دستی سریع'` از ۰۸-۱۵ تا ۰۹-۱۳ ثبت شده. triggerهای `currency_rate_created`/`updated` تا ۰۹-۱۳ ادامه دارند، پس پوشش ممیزی قطع نشده. علت توقف insert در کد بررسی نشد.

### یافته‌های جانبی (خارج از سؤال‌ها، ثبت‌شده)

- `/admin/audit` برای manager باز است ([cited] `_app.admin.audit.tsx:30-33`)، اما تنها policy خواندن `audit_logs` فقط admin است ([cited] `20260424144837_…sql:106-109`). manager فهرست خالی می‌بیند.
- `PROGRESS.md` به‌روزرسانی نشد، چون خروجی مأموریت «یک سند» تعیین شده بود.

---

## پیوست الف — بازنویسی SQL موتور قیمت (`recalc.sql`)

فقط TEMP table در نشست دیتابیس دورریختنی ساخت. md5 تحویل به کانتینر: `ee434cbd51efac071db7a56b89a7d893` روی هر دو طرف [measured].

```sql
SET client_encoding='UTF8';
CREATE TEMP TABLE k AS SELECT timestamptz '2026-09-13 18:38:51+00' AS now_ts;

CREATE TEMP TABLE calc AS
WITH spt AS (SELECT id, code, title FROM sale_price_types WHERE is_active),
sett AS (SELECT NULL::uuid AS id UNION ALL SELECT id FROM settlement_types WHERE is_active),
pp AS (
  SELECT DISTINCT ON (product_id) product_id, id, purchase_price, currency::text AS currency, effective_at
  FROM purchase_prices, k
  WHERE is_active AND effective_at <= k.now_ts AND (expires_at IS NULL OR expires_at > k.now_ts)
  ORDER BY product_id, effective_at DESC
),
base AS (
  SELECT p.id AS product_id, p.name, p.sku, p.product_type, p.category_id, p.brand_id,
         pp.id AS purchase_price_id, pp.purchase_price, pp.currency,
         CASE WHEN pp.currency = 'toman' THEN 1
              ELSE (SELECT cr.rate_to_toman FROM currency_rates cr, k
                    WHERE cr.currency = pp.currency AND cr.is_active AND cr.effective_at <= k.now_ts
                    ORDER BY cr.effective_at DESC LIMIT 1) END AS rate
  FROM products p JOIN pp ON pp.product_id = p.id
),
b2 AS (SELECT *, round(purchase_price * rate) AS ptoman FROM base WHERE rate IS NOT NULL)
SELECT b2.product_id, b2.name, b2.sku, spt.id AS spt_id, spt.code AS spt_code, sett.id AS sett_id,
       b2.purchase_price_id, b2.purchase_price, b2.currency, b2.rate, b2.ptoman,
       r.id AS rule_id, r.margin_type::text AS margin_type, r.margin_value, r.fixed_margin_value,
       s.id AS ship_id, s.cost_type::text AS cost_type, s.cost_value, s.cost_currency
FROM b2 CROSS JOIN spt CROSS JOIN sett
LEFT JOIN LATERAL (
  SELECT * FROM pricing_rules r
  WHERE r.is_active
    AND (r.sale_price_type_id IS NULL OR r.sale_price_type_id = spt.id)
    AND (sett.id IS NULL OR r.settlement_type_id IS NULL OR r.settlement_type_id = sett.id)
    AND (r.product_type IS NULL OR r.product_type = b2.product_type)
    AND (r.category_id IS NULL OR r.category_id = b2.category_id)
    AND (r.brand_id IS NULL OR r.brand_id = b2.brand_id)
    AND (r.min_purchase_price_toman IS NULL OR b2.ptoman >= r.min_purchase_price_toman)
    AND (r.max_purchase_price_toman IS NULL OR b2.ptoman <= r.max_purchase_price_toman)
    AND r.margin_type IS NOT NULL AND r.margin_value IS NOT NULL
  ORDER BY r.priority ASC, r.created_at DESC LIMIT 1
) r ON true
LEFT JOIN LATERAL (
  SELECT * FROM shipping_cost_rules s
  WHERE s.is_active
    AND (s.product_id IS NULL OR s.product_id = b2.product_id)
    AND (s.category_id IS NULL OR s.category_id = b2.category_id)
    AND (s.brand_id IS NULL OR s.brand_id = b2.brand_id)
    AND (s.product_type IS NULL OR s.product_type = b2.product_type)
    AND (s.min_purchase_price IS NULL OR b2.ptoman >= s.min_purchase_price)
    AND (s.max_purchase_price IS NULL OR b2.ptoman <= s.max_purchase_price)
  ORDER BY (CASE WHEN s.product_id IS NOT NULL THEN 1000 ELSE 0 END + CASE WHEN s.brand_id IS NOT NULL THEN 100 ELSE 0 END
          + CASE WHEN s.category_id IS NOT NULL THEN 10 ELSE 0 END + CASE WHEN s.product_type IS NOT NULL THEN 1 ELSE 0 END) DESC,
           s.sort_order ASC, s.priority ASC
  LIMIT 1
) s ON true;

ALTER TABLE calc ADD COLUMN ship numeric, ADD COLUMN margin numeric, ADD COLUMN final numeric, ADD COLUMN rounded numeric;
UPDATE calc SET ship = CASE
    WHEN ship_id IS NULL THEN 0
    WHEN cost_type = 'percent' THEN round(ptoman * cost_value / 100)
    WHEN cost_type = 'currency' THEN round(cost_value * (SELECT rate_to_toman FROM currency_rates WHERE currency = lower(cost_currency) AND is_active ORDER BY effective_at DESC LIMIT 1))
    ELSE round(cost_value) END,
  margin = CASE margin_type WHEN 'fixed' THEN round(margin_value)
    WHEN 'percent' THEN round(ptoman * margin_value / 100)
    ELSE round(ptoman * margin_value / 100 + coalesce(fixed_margin_value, 0)) END;
UPDATE calc SET final = ptoman + ship + margin WHERE rule_id IS NOT NULL;
UPDATE calc SET rounded = CASE WHEN final IS NULL OR final <= 0 THEN 0
  WHEN final >= 10000000 THEN round(final / 100000) * 100000
  WHEN final >= 1000000 THEN round(final / 50000) * 50000
  ELSE round(final / 10000) * 10000 END;

CREATE TEMP TABLE cmp AS
SELECT c.*, pcp.rounded_sale_price AS stored, pcp.computed_at, pcp.source, pcp.currency_rate AS stored_rate,
       pcp.purchase_price_id AS stored_pp, pcp.input_purchase_price AS stored_input
FROM calc c
LEFT JOIN product_computed_prices pcp
  ON pcp.product_id = c.product_id AND pcp.sale_price_type_id = c.spt_id
 AND pcp.settlement_type_id IS NOT DISTINCT FROM c.sett_id;
```

**تفاوت‌های شناخته‌شده با JS** [assertion]:
- `Math.round` در JS و `round` در Postgres برای اعداد مثبت یکسان‌اند.
- وقتی دو قیمت خرید `effective_at` یکسان دارند، ترتیب JS نامعین است و `DISTINCT ON` هم همین‌طور.
- ترتیب قانون حمل با `sort_order, priority` برابر، در JS به ترتیب برگشتی DB بستگی دارد.

کالیبراسیون ۵٬۹۸۳/۵٬۹۸۳ نشان می‌دهد هیچ‌کدام در این داده اثر نداشته.

## پیوست ب — کارهایی که روی دیتابیس دورریختنی انجام شد (همه rollback یا TEMP)

- `CREATE DATABASE pricing_research_20260914` + `pg_restore`. ۲۱ خطا، همه `pg_cron`/`cron` یا vault تکراری [measured `grep -c "error:"` = 21].
- TEMP tableها برای `calc`/`cmp`.
- در `BEGIN … ROLLBACK`:
  - `claim_pricing_recompute_jobs(100,3)` و `(25,3)`
  - `CREATE OR REPLACE FUNCTION has_role/has_any_role` با بدنهٔ 542
  - `ALTER POLICY` (نسخهٔ initplan)
  - `CREATE EXTENSION hypopg` + `hypopg_create_index`
- هیچ‌کدام از این‌ها روی `afrakala` یا تولید اجرا نشد.
