# قرارداد تحویل ربات رصدخانه قیمت محصولات افراکالا

> این سند رسمی برای تحویل به مسئول کدنویسی ربات است. هرگونه انحراف از این قرارداد ممنوع است.
> فقط documentation است — هیچ کد/migration/schema/UI تغییر نکرده است.

---

## ۱) هدف ربات

ربات افراکالا وظیفه دارد:

- قیمت محصولات افراکالا را در سایت‌های بازار (ترب، پورچیستا) رصد کند.
- داده **خام** بازار را به جدول «رصدخانه قیمت محصولات افراکالا» ارسال کند.
- **هیچ‌گونه** تحلیل، امتیازدهی، پیام فروشنده، تصمیم نمایش در جستجو/PDF، یا قیمت‌گذاری نهایی انجام **ندهد**.
- فقط ۹ ستون مجاز (بخش ۴) را بنویسد.

تمام محاسبات تحلیلی (`market_avg_price_toman`، `competitive_price_status`، `sales_opportunity_score`، `suggested_sales_message`، رتبه فروش، پیام فروشنده، مزیت قیمت PDF) به‌صورت **read-time** توسط سیستم افراکالا انجام می‌شود.

---

## ۲) جدول هدف

| مورد | مقدار |
|---|---|
| نام فارسی | رصدخانه قیمت محصولات افراکالا |
| slug | `afrakala-product-price-observatory` |
| واحد سطر | یک محصول داخلی افراکالا |

- ربات **حق ساخت ردیف جدید برای محصول ندارد**؛ ردیف‌ها بر اساس محصولات فعال افراکالا از قبل seed شده‌اند (مرجع: `docs/DT.7A_FIX_OBSERVATORY_COLUMN_CONTRACT.md`).
- ربات فقط ردیف موجود را با `afrakala_product_id` پیدا و به‌روزرسانی می‌کند.
- اگر ردیفی موجود نباشد، API خطا برمی‌گرداند؛ ربات نباید با تلاش مجدد ردیف بسازد.

---

## ۳) کلید یکتای اتصال

```json
"unique_by": ["afrakala_product_id"]
```

- `afrakala_product_id` همان UUID محصول داخلی افراکالا (`products.id` به‌صورت متن) است.
- ربات **باید قبل از ارسال هر payload، mapping محصول بازار → afrakala_product_id را داشته باشد**.
- اگر `afrakala_product_id` معتبر نیست یا نامشخص است → **ارسال انجام نشود**. هرگز payload کور یا حدسی ارسال نشود.
- matching محصول بازار به محصول داخلی **خارج از scope این API** است (بخش ۱۰).

---

## ۴) ستون‌های مجاز برای ربات (دقیقاً ۹ ستون)

| column_key | label فارسی | نوع داده | منبع | مثال | توضیح |
|---|---|---|---|---|---|
| `torob_avg_price_toman` | میانگین قیمت ترب | number (تومان) | ترب | `70000000` | میانگین قیمت‌های مشاهده‌شده در آخرین batch ترب |
| `torob_min_price_toman` | کمترین قیمت ترب | number (تومان) | ترب | `68000000` | حداقل قیمت بین فروشندگان ترب |
| `torob_max_price_toman` | بیشترین قیمت ترب | number (تومان) | ترب | `73500000` | حداکثر قیمت بین فروشندگان ترب |
| `torob_seller_count` | تعداد فروشنده ترب | number (integer) | ترب | `12` | تعداد فروشندگان فعال در ترب |
| `torob_last_seen_at` | آخرین رصد ترب | datetime (ISO-8601 UTC) | ترب | `"2026-05-16T12:00:00Z"` | زمان آخرین استخراج موفق از ترب |
| `purchista_avg_price_toman` | میانگین قیمت پورچیستا | number (تومان) | پورچیستا | `70500000` | میانگین قیمت در آخرین batch پورچیستا |
| `purchista_min_price_toman` | کمترین قیمت پورچیستا | number (تومان) | پورچیستا | `69000000` | حداقل قیمت در پورچیستا |
| `purchista_max_price_toman` | بیشترین قیمت پورچیستا | number (تومان) | پورچیستا | `74000000` | حداکثر قیمت در پورچیستا |
| `purchista_last_seen_at` | آخرین رصد پورچیستا | datetime (ISO-8601 UTC) | پورچیستا | `"2026-05-16T12:03:00Z"` | زمان آخرین استخراج موفق از پورچیستا |

**قوانین مقادیر:**
- تاریخ‌ها ISO-8601 UTC با `Z`.
- قیمت‌ها عدد صحیح **تومان**؛ ریال یا formattedString ممنوع.
- اگر یک منبع داده ندارد، ستون‌های همان منبع را ارسال **نکن** (یا `null`). **هرگز** `0` یا مقدار ساختگی ارسال نشود — `0` به‌معنای قیمت معتبر تلقی می‌شود.
- ارسال جزئی مجاز است (مثلاً فقط ترب بدون پورچیستا)؛ ولی همیشه `afrakala_product_id` در `values` باشد.

---

## ۵) ستون‌های ممنوع برای ربات

ربات **حق نوشتن یا تغییر هیچ‌یک از این ستون‌ها را ندارد**. تلاش برای نوشتن باعث خطای `column_not_allowed` (HTTP 403) می‌شود.

**سیستمی (سیستم پر می‌کند):**
`afrakala_product_id`*، `product_name`، `sku`، `brand_name`، `category_name`، `model`، `color`، `capacity`، `stock_status`، `product_labels`، `internal_price_updated_at`

\* `afrakala_product_id` فقط به‌عنوان مقدار `unique_by` در payload می‌آید، نه به‌عنوان ستون قابل تغییر.

**Computed / read-time (سیستم محاسبه می‌کند):**
`afrakala_purchase_price_toman`، `afrakala_min_sale_price`، `market_avg_price_toman`، `price_gap_to_market_avg`، `price_gap_percent_to_market_avg`، `price_gap_to_market_min`، `competitive_price_status`، `sales_opportunity_score`، `sales_priority_rank`، `suggested_sales_message`

**مدیریتی (فقط کاربر مجاز/مدیر):**
`manager_note`، `sales_priority_override`، `show_in_quick_sales_search`، `show_in_pdf`، `is_watch_active`

ربات هرگز برای فعال‌سازی یا غیرفعال‌سازی نمایش در جستجو/PDF تصمیم نمی‌گیرد.

---

## ۶) نمونه payload صحیح

```json
{
  "unique_by": ["afrakala_product_id"],
  "values": {
    "afrakala_product_id": "00000000-0000-0000-0000-000000000000",
    "torob_avg_price_toman": 70000000,
    "torob_min_price_toman": 68000000,
    "torob_max_price_toman": 73500000,
    "torob_seller_count": 12,
    "torob_last_seen_at": "2026-05-16T12:00:00Z",
    "purchista_avg_price_toman": 70500000,
    "purchista_min_price_toman": 69000000,
    "purchista_max_price_toman": 74000000,
    "purchista_last_seen_at": "2026-05-16T12:03:00Z"
  }
}
```

> توجه: `table_slug` در body ارسال نمی‌شود؛ جدول از طریق `tableId` در URL مشخص می‌شود (بخش ۷).

---

## ۷) Endpoint و نمونه curl

Endpointهای واقعی موجود در پروژه (`src/routes/api.public.bot.*`):

| نام | متد | مسیر |
|---|---|---|
| Resolve slug → tableId | `GET` | `/api/public/bot/dynamic-tables/by-slug/{slug}` |
| Upsert row | `POST` | `/api/public/bot/dynamic-tables/{tableId}/rows/upsert` |

**Authentication:** header `Authorization: Bearer <BOT_API_KEY>`

**Base URL — TODO:** Base URL محیط production/preview باید توسط ادمین افراکالا تأیید شود (مثلاً `https://project--6906e01f-9a81-48a3-a856-35cbd0c22eb2.lovable.app` برای preview یا دامنه self-host واقعی). در ربات از متغیر محیطی `AFRAKALA_API_BASE_URL` استفاده شود؛ مقدار آن **در سند یا repo ربات commit نشود**.

### مرحله ۱ — گرفتن tableId از slug

```bash
curl -X GET \
  "https://YOUR_API_DOMAIN/api/public/bot/dynamic-tables/by-slug/afrakala-product-price-observatory" \
  -H "Authorization: Bearer BOT_API_KEY_HERE"
```

پاسخ شامل `id` جدول است. این مقدار را cache کنید (تغییر نمی‌کند).

### مرحله ۲ — upsert ردیف

```bash
curl -X POST \
  "https://YOUR_API_DOMAIN/api/public/bot/dynamic-tables/TABLE_ID_HERE/rows/upsert" \
  -H "Authorization: Bearer BOT_API_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "unique_by": ["afrakala_product_id"],
    "values": {
      "afrakala_product_id": "PRODUCT_UUID_HERE",
      "torob_avg_price_toman": 70000000,
      "torob_min_price_toman": 68000000,
      "torob_max_price_toman": 73500000,
      "torob_seller_count": 12,
      "torob_last_seen_at": "2026-05-16T12:00:00Z"
    }
  }'
```

---

## ۸) خطاهای مورد انتظار

| error_code | HTTP | معنی | علت رایج | اقدام ربات |
|---|---|---|---|---|
| `invalid_payload` | 400 | بدنه نامعتبر یا JSON خراب | عدم ارسال `values` یا JSON ناقص | بررسی serialization؛ retry بی‌فایده |
| `invalid_unique_by` | 400 | `unique_by` آرایه نیست یا اشتباه است | مقدار غیر از `["afrakala_product_id"]` | اصلاح payload |
| `inactive_key` | 401/403 | کلید API غیرفعال/منقضی | revoke شده یا اشتباه | تماس با ادمین برای کلید جدید |
| `column_not_allowed` | 403 | تلاش برای نوشتن ستون ممنوع | ارسال یکی از ستون‌های بخش ۵ | حذف ستون ممنوع از `values` |
| `table_not_found` | 404 | slug/tableId اشتباه | typo در slug یا cache stale | بازخوانی tableId از endpoint by-slug |
| `row_not_found` | 404 | محصول هدف در رصدخانه seed نشده | `afrakala_product_id` معتبر ولی محصول غیرفعال/حذف‌شده | log به‌عنوان review؛ retry نکن |
| `duplicate_match` | 409 | چند ردیف با همان `unique_by` پیدا شد | داده تاریخی ناسازگار | گزارش به ادمین؛ ربات نباید تلاش به اصلاح کند |
| `permission_denied` | 403 | کلید به این جدول/ستون دسترسی ندارد | scope کلید محدود است | درخواست کلید با scope مناسب |
| `server_error` | 500 | خطای سمت سرور | موقتی | exponential backoff retry (حداکثر ۳ بار) |

---

## ۹) قوانین امنیتی API Key

- API Key ربات **هرگز** در frontend، client bundle، یا برنامه‌های کاربر نهایی نباشد.
- API Key **هرگز** در Git commit نشود (نه در `.env`، نه در config، نه در docs).
- نگهداری فقط در backend/worker/server ربات (secret manager، vault، یا env file خارج از repo).
- برای هر منبع (ترب، پورچیستا) یا هر نمونه ربات، کلید **مجزا** ساخته شود تا revoke انتخابی ممکن باشد.
- کلید فقط باید scope «نوشتن روی ۹ ستون مجاز جدول رصدخانه» داشته باشد — نه بیشتر.
- در صورت لو رفتن → فوراً **revoke** و **rotate** از پنل افراکالا.
- لاگ ربات **هرگز** کلید کامل را چاپ نکند؛ حداکثر ۴ کاراکتر اول/آخر برای debug.

---

## ۱۰) مسئولیت matching محصول

این قرارداد فرض می‌کند ربات از قبل می‌داند داده بازار به کدام `afrakala_product_id` تعلق دارد.

- **ممنوع:** update صرفاً بر اساس نام ظاهری کالا یا fuzzy match با confidence پایین.
- matching باید در یک ماژول/فاز **جدا** انجام شود با ترکیب این سیگنال‌ها:
  - برند، مدل، ظرفیت، رنگ، نوع کالا
  - کد کالا/SKU در صورت وجود
  - نام نرمال‌شده فارسی
  - لینک یا شناسه پایدار منبع بازار
  - بررسی انسانی برای matchهای مشکوک
- اگر confidence پایین است → ربات **نباید update کند** و مورد را در صف review قرار دهد.
- mappingهای تأییدشده در ربات ذخیره/cache شوند تا تماس مکرر لازم نباشد.

---

## ۱۱) رفتار سیستم پس از ارسال ربات

وقتی ربات ۹ ستون بازار را upsert می‌کند:

1. سطر در `dynamic_table_cells` به‌روز می‌شود.
2. هنگام **خواندن** (نه نوشتن)، سیستم به‌صورت read-time محاسبه می‌کند:
   - `market_avg_price_toman` (میانگین وزنی ترب/پورچیستا)
   - `price_gap_to_market_avg`، `price_gap_percent_to_market_avg`
   - `competitive_price_status` (`below_market` / `at_market` / `above_market`)
   - `sales_opportunity_score` (0..100)
   - `suggested_sales_message`
3. **جستجوی سریع فروش** فقط در صورتی snippet نشان می‌دهد که `show_in_quick_sales_search = true` و `is_watch_active = true` (RPC: `get_observatory_snippets_for_products`).
4. **PDF لیست فروش** فقط در صورتی متن «قیمت رقابتی» نشان می‌دهد که `show_in_pdf = true` و `is_watch_active = true` و وضعیت `below_market` و `sales_opportunity_score >= 60` باشد (RPC: `get_observatory_pdf_hints_for_products`). PDF هرگز قیمت خام بازار، score، یا پیام داخلی به مشتری نشان نمی‌دهد.
5. ربات در **هیچ‌یک** از این تصمیم‌های نمایشی دخالت نمی‌کند.

---

## ۱۲) چک‌لیست تست برای ربات‌نویس

- [ ] دریافت یک `afrakala_product_id` معتبر از ادمین افراکالا.
- [ ] resolve کردن slug → tableId از `GET /by-slug/afrakala-product-price-observatory` و دریافت 200.
- [ ] ارسال upsert با فقط ۹ ستون مجاز و دریافت پاسخ موفق.
- [ ] اجرای **دوباره** همان payload → بدون duplicate (idempotent بودن).
- [ ] تغییر یک قیمت و upsert مجدد → همان ردیف update شود (نه ردیف جدید).
- [ ] ارسال عمدی `product_name` در values → انتظار `column_not_allowed` (403).
- [ ] ارسال عمدی `"unique_by": ["sku"]` → انتظار `invalid_unique_by` (400).
- [ ] ارسال با کلید نامعتبر → انتظار `inactive_key`.
- [ ] ارسال با `afrakala_product_id` ناموجود → انتظار `row_not_found`.
- [ ] بررسی ردیف در UI «رصدخانه قیمت محصولات افراکالا» و مشاهده ۹ ستون.
- [ ] بررسی محاسبه read-time ستون‌های `market_avg_price_toman`، `competitive_price_status`، `sales_opportunity_score`.
- [ ] بررسی جستجوی سریع فروش (در صورت فعال بودن `show_in_quick_sales_search` و `is_watch_active`).
- [ ] بررسی PDF لیست فروش (در صورت فعال بودن `show_in_pdf` و `is_watch_active` و وجود مزیت قیمت).

---

## ۱۳) چک‌لیست تحویل عملیاتی

| مورد | مقدار |
|---|---|
| Base URL | **TODO** — توسط ادمین افراکالا تأیید شود (env: `AFRAKALA_API_BASE_URL`) |
| Endpoint resolve | `GET /api/public/bot/dynamic-tables/by-slug/afrakala-product-price-observatory` |
| Endpoint upsert | `POST /api/public/bot/dynamic-tables/{tableId}/rows/upsert` |
| Auth | `Authorization: Bearer <BOT_API_KEY>` |
| API Key | از پنل `/bot-api-keys` افراکالا (خارج از repo نگهداری شود) |
| Table slug | `afrakala-product-price-observatory` |
| unique_by | `["afrakala_product_id"]` |
| Allowed columns | ۹ ستون بخش ۴ |
| Sample payload | بخش ۶ |
| Sample curl | بخش ۷ |
| Expected errors | بخش ۸ |
| Test product IDs | از ادمین افراکالا درخواست شود (در staging) |
| Rollback plan | revoke کلید + توقف ربات؛ داده‌های ارسالی idempotent هستند و آسیب پایدار نمی‌زنند |
| Debug owner | تیم backend افراکالا |

---

## ۱۴) خارج از scope این قرارداد

- ساخت ربات scraping (پیاده‌سازی crawler، queue، retry، proxy).
- match خودکار محصول بازار به محصول افراکالا.
- حل CAPTCHA.
- bypass امنیت یا rate-limit سایت‌های مقصد.
- قیمت‌گذاری نهایی محصول.
- تغییر PDF لیست فروش.
- تغییر جستجوی سریع فروش.
- تغییر schema یا ستون‌های Dynamic Table.
- ساخت داشبورد مدیریتی برای ربات.
- AI matching یا LLM-based normalization.
- اتصال به Perplexity / OpenAI / هر LLM خارجی.

---

## ۱۵) هشدار حقوقی/اخلاقی

ربات باید **مطابق قوانین و شرایط استفاده سایت‌های مقصد** (ترب، پورچیستا) و سیاست‌های داخلی شرکت افراکالا اجرا شود. از فشار بیش از حد روی سرور مقصد، دور زدن سازوکارهای امنیتی، و جمع‌آوری داده غیرمجاز خودداری شود. rate-limit، User-Agent منصفانه، و respect به `robots.txt` رعایت شود.

---

## ۱۶) وضعیت فعلی پروژه (در زمان نگارش این سند)

- ✅ **DT.7K** پاس شده — ستون امن «مزیت قیمت» به PDF اضافه شده.
- ⚠️ **DT.7L** با وضعیت **PASS WITH WARNINGS** انجام شده:
  - RPC مستقیم `get_observatory_pdf_hints_for_products` تست شد و درست کار می‌کند.
  - **Preview/Download PDF در مرورگر بصری تست نشده** (به دلیل نبود session لاگین در محیط تست). **باید قبل از production توسط یک کاربر مدیر دستی تأیید شود.**
  - cleanup انجام شد و `show_in_pdf = false` برای داده‌های تستی ست شد.
- این قرارداد فرض می‌کند زیرساخت backend رصدخانه پایدار است و فقط در انتظار اتصال ربات است.

---

### Self-Host Acceptance Check

- بدون migration، بدون تغییر schema، بدون تغییر کد اجرایی، بدون تغییر UI/API.
- بدون secret واقعی در سند یا repo.
- بدون dependency جدید، بدون CDN خارجی، بدون تغییر Docker/Caddy/LAN/SSL.
- فقط یک فایل مستندات فارسی در `docs/`. کاملاً سازگار با self-host.