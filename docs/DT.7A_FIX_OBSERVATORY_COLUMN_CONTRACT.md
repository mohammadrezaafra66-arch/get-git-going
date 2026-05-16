# DT.7A-FIX2 — قرارداد نهایی اصلاح‌شده ستون‌های رصدخانه قیمت محصولات افراکالا

- **نام جدول:** رصدخانه قیمت محصولات افراکالا
- **slug:** `afrakala-product-price-observatory`
- **این سند فقط مستندات است.** هیچ migration / schema / UI / API / Docker / deploy تغییر نمی‌کند.

---

## ۱) ایرادهای سند قبلی (DT.7A-FIX)

1. `data_type`ها شامل `uuid`، `text[]`، `timestamptz` بودند که در `DYNAMIC_COLUMN_DATA_TYPES` (`src/lib/data-tables/constants.ts`) پشتیبانی نمی‌شوند.
2. چند label نیمه‌لاتین بودند (SKU، Torob/Purchista در توضیح‌ها).
3. املای «پرشیستا» در همه‌جا اشتباه بود — درست: **پورچیستا**.
4. منبع `brand_name` اشتباه به «category attrs» نسبت داده شده بود.
5. منبع `model/color/capacity` مبهم بود.
6. شرط محصول فعال صرفاً `is_active=true` نوشته شده بود، در حالی که schema هم `is_active` و هم `status` دارد.
7. ۱۰ ستون به‌صورت `is_computed=true` اعلام شده بودند، در حالی که `ALLOWED_FORMULA_KEYS` فعلی فقط ۵ کلید معتبر دارد.

## ۲) اصلاحات انجام‌شده

- همه `data_type`ها به انواع مجاز Dynamic Tables نگاشت شدند: `uuid → text`، `text[] → tag`، `timestamptz → datetime`.
- همه labelها فارسی شدند (SKU → «کد کالا»، ترب، پورچیستا).
- املای پورچیستا یکدست شد.
- `brand_name` از `brands.name` (رابطه brand محصول) گرفته می‌شود، نه category attrs.
- `model/color/capacity` از فیلدهای موجود `products` خوانده می‌شوند؛ توسعه به dynamic attributes موکول به فازهای بعدی است.
- شرط فعال‌بودن محصول دقیق نوشته شد (بخش ۹، بند ۶).
- فقط ۴ ستون که با `ALLOWED_FORMULA_KEYS` فعلی نگاشت‌پذیرند `is_computed=true` ماندند. بقیه ستون‌های تحلیلی در DT.7B به‌صورت **read-only placeholder** ساخته می‌شوند (هیچ `formula_key` جدیدی در DT.7B تعریف نمی‌شود).

## ۳) سازگاری data_type ها با Dynamic Tables

بله. مرجع: `DYNAMIC_COLUMN_DATA_TYPES = ["text","number","boolean","date","datetime","phone","tag","status"]`. تمام ۳۵ ستون فقط از همین مجموعه استفاده می‌کنند.

## ۴) فارسی‌سازی labelها

بله — همه ۳۵ label فارسی است. اصطلاحات فنی فقط داخل پرانتز در ستون «توضیح» آمده‌اند (مثلاً «کد کالا (معادل فنی: SKU)»).

## ۵) یکدست‌سازی املای پورچیستا

بله — همه ارجاع‌ها به «پورچیستا» تغییر کرد. هیچ «پرشیستا» در سند باقی نماند.

## ۶) وضعیت ستون‌های computed / placeholder در DT.7B

- **computed واقعی (با formula_key معتبر موجود):** ۴ ستون
  - `afrakala_purchase_price_toman` → `latest_purchase_price_toman`
  - `afrakala_min_sale_price` → `min_sale_price`
  - `price_gap_to_market_avg` → `price_gap_to_market_avg`
  - `price_gap_percent_to_market_avg` → `price_gap_percent_to_market_avg`
- **placeholder (read-only، بدون formula_key، در DT.7C/DT.7E به computed تبدیل می‌شوند):** ۶ ستون
  - `market_avg_price_toman`، `price_gap_to_market_min`، `competitive_price_status`، `sales_opportunity_score`، `sales_priority_rank`، `suggested_sales_message`
  - این ۶ ستون در DT.7B با `is_computed=false`، `is_editable_by_bot=false`، `user_editable=false` seed می‌شوند.

## ۷) جدول نهایی ستون‌ها (۳۵ ستون)

| # | column_key | label فارسی | data_type | گروه | is_computed | is_editable_by_bot | user_editable | توضیح |
|---|---|---|---|---|---|---|---|---|
| 1 | `afrakala_product_id` | شناسه محصول افراکالا | text | system | false | false | false | مقدار `products.id` به‌صورت متن ذخیره می‌شود (UUID به text تبدیل می‌شود). |
| 2 | `product_name` | نام محصول | text | system | false | false | false | snapshot از `products.display_name` (یا `products.name`). |
| 3 | `sku` | کد کالا | text | system | false | false | false | معادل فنی: SKU. از `products.sku`. |
| 4 | `brand_name` | برند | text | system | false | false | false | از `brands.name` بر اساس رابطه brand محصول. |
| 5 | `category_name` | دسته‌بندی | text | system | false | false | false | از `categories.name`. |
| 6 | `model` | مدل | text | system | false | false | false | از `products.model` در صورت وجود؛ توسعه به dynamic attrs در فاز بعد. |
| 7 | `color` | رنگ | text | system | false | false | false | از `products.color` در صورت وجود. |
| 8 | `capacity` | ظرفیت / حافظه | text | system | false | false | false | از `products.capacity` در صورت وجود. |
| 9 | `stock_status` | وضعیت موجودی | status | system | false | false | false | مقادیر: available / unavailable / limited / unknown. |
| 10 | `product_labels` | برچسب‌های محصول | tag | system | false | false | false | از ماژول `product_labels`. |
| 11 | `internal_price_updated_at` | آخرین به‌روزرسانی قیمت داخلی | datetime | system | false | false | false | از pricing engine. |
| 12 | `torob_avg_price_toman` | میانگین قیمت ترب | number | bot | false | true | false | تومان. |
| 13 | `torob_min_price_toman` | کمترین قیمت ترب | number | bot | false | true | false | تومان. |
| 14 | `torob_max_price_toman` | بیشترین قیمت ترب | number | bot | false | true | false | تومان. |
| 15 | `torob_seller_count` | تعداد فروشنده ترب | number | bot | false | true | false | عدد صحیح. |
| 16 | `torob_last_seen_at` | آخرین رصد ترب | datetime | bot | false | true | false | زمان آخرین استخراج. |
| 17 | `purchista_avg_price_toman` | میانگین قیمت پورچیستا | number | bot | false | true | false | تومان. |
| 18 | `purchista_min_price_toman` | کمترین قیمت پورچیستا | number | bot | false | true | false | تومان. |
| 19 | `purchista_max_price_toman` | بیشترین قیمت پورچیستا | number | bot | false | true | false | تومان. |
| 20 | `purchista_last_seen_at` | آخرین رصد پورچیستا | datetime | bot | false | true | false | زمان آخرین استخراج. |
| 21 | `afrakala_purchase_price_toman` | قیمت خرید افراکالا | number | computed | true | false | false | `formula_key=latest_purchase_price_toman`. |
| 22 | `afrakala_min_sale_price` | حداقل قیمت فروش افراکالا | number | computed | true | false | false | `formula_key=min_sale_price`. |
| 23 | `market_avg_price_toman` | میانگین قیمت بازار | number | placeholder | false | false | false | میانگین وزنی ترب+پورچیستا. در DT.7C/DT.7E به computed واقعی تبدیل می‌شود. |
| 24 | `price_gap_to_market_avg` | اختلاف با میانگین بازار | number | computed | true | false | false | `formula_key=price_gap_to_market_avg`. |
| 25 | `price_gap_percent_to_market_avg` | اختلاف درصدی با میانگین بازار | number | computed | true | false | false | `formula_key=price_gap_percent_to_market_avg`. |
| 26 | `price_gap_to_market_min` | اختلاف با کمترین قیمت بازار | number | placeholder | false | false | false | placeholder تا تعریف formula در فاز بعد. |
| 27 | `competitive_price_status` | وضعیت رقابتی قیمت | status | placeholder | false | false | false | placeholder؛ مقادیر آینده: below / at / above. |
| 28 | `sales_opportunity_score` | امتیاز فرصت فروش | number | placeholder | false | false | false | 0..100. در DT.7C/DT.7E توسط engine محاسبه می‌شود. |
| 29 | `sales_priority_rank` | رتبه اولویت فروش | number | placeholder | false | false | false | dense rank بر اساس score؛ placeholder تا فاز بعد. |
| 30 | `suggested_sales_message` | پیام پیشنهادی برای فروشنده | text | placeholder | false | false | false | placeholder؛ تولید AI در فاز بعد. |
| 31 | `manager_note` | یادداشت مدیر | text | user | false | false | true | حداکثر ۱۰۰۰ کاراکتر. |
| 32 | `sales_priority_override` | اولویت دستی فروش | number | user | false | false | true | اگر تنظیم شود، بر rank محاسباتی غلبه می‌کند. |
| 33 | `show_in_quick_sales_search` | نمایش در جستجوی سریع فروش | boolean | user | false | false | true | پیش‌فرض true. |
| 34 | `show_in_pdf` | نمایش در PDF لیست فروش | boolean | user | false | false | true | پیش‌فرض true. |
| 35 | `is_watch_active` | پایش فعال | boolean | user | false | false | true | پیش‌فرض true؛ غیرفعال = نادیده در alertها. |

> **توجه:** «گروه» در ستون بالا فقط برای دسته‌بندی مفهومی است. در `dynamic_table_columns` این سه فلگ تعیین‌کننده‌اند: `is_computed`, `is_editable_by_bot`, و عدم وجود هیچ‌کدام (user-editable).

## ۸) Help tooltipهای نهایی (فارسی یکدست)

- **شناسه محصول افراکالا** — شناسه یکتای محصول در سامانه افراکالا (`products.id` به‌صورت متن). کلید اتصال این ردیف به جدول محصولات و قابل ویرایش نیست.
- **برچسب‌های محصول** — برچسب‌های مدیریتی محصول (مثلاً «پرفروش»، «راکد»، «ویترین») از ماژول برچسب‌های محصول.
- **میانگین قیمت ترب** — میانگین قیمت مشاهده‌شده برای این محصول در ترب در آخرین batch استخراج (توسط ربات پر می‌شود).
- **میانگین قیمت بازار** — میانگین وزنی قیمت ترب و پورچیستا. مرجع اصلی مقایسه قیمت رقابتی است (در DT.7B placeholder، در فاز بعد محاسبه می‌شود).
- **اختلاف درصدی با میانگین بازار** — اختلاف درصدی حداقل قیمت فروش افراکالا با میانگین بازار. منفی = ارزان‌تر از بازار، مثبت = گران‌تر.
- **امتیاز فرصت فروش** — امتیاز ۰ تا ۱۰۰ بر اساس فاصله قیمت با بازار، موجودی و برچسب‌ها. هرچه بالاتر، فرصت فروش بهتر.
- **پیام پیشنهادی برای فروشنده** — پیام کوتاه پیشنهادی برای تیم فروش. در DT.7B placeholder است؛ تولید AI در فاز بعد فعال می‌شود.
- **نمایش در جستجوی سریع فروش** — اگر خاموش شود، این محصول در جستجوی سریع فروش و PDF لیست فروش ظاهر نمی‌شود (مفید برای محصولات منسوخ یا تستی).

## ۹) Acceptance Criteria نهایی برای DT.7B

1. جدول Dynamic Table با `slug = afrakala-product-price-observatory` و نام فارسی «رصدخانه قیمت محصولات افراکالا» ایجاد شود.
2. **دقیقاً ۳۵ ستون** با `column_key`/`data_type`/فلگ‌های مشخص‌شده در بخش ۷ seed شود.
3. همه `data_type`ها فقط از مجموعه مجاز `DYNAMIC_COLUMN_DATA_TYPES` باشند (`text`, `number`, `boolean`, `date`, `datetime`, `phone`, `tag`, `status`).
4. همه labelها فارسی باشند. همه `column_key`ها انگلیسی، پایدار و مطابق `COLUMN_KEY_REGEX` باشند.
5. ستون‌های computed فقط با `formula_key`های موجود در `ALLOWED_FORMULA_KEYS` ساخته شوند. هیچ `formula_key` جدید در DT.7B تعریف نشود. شش ستون placeholder (سطرهای ۲۳، ۲۶–۳۰ بخش ۷) باید با `is_computed=false`, `is_editable_by_bot=false`, و بدون `formula_key` seed شوند.
6. ردیف‌ها = محصولات فعال افراکالا، با کلید یکتای `afrakala_product_id`. شرط «فعال بودن» باید با inspect واقعی schema تعیین شود؛ در کد فعلی هم `products.is_active` (بولین) و هم `products.status` (`active`/`inactive`/`discontinued`) دیده می‌شوند. Lovable باید در DT.7B هر دو را در نظر بگیرد و فقط محصولاتی را seed کند که هم `is_active = true` و هم `status = 'active'` باشند (در صورت وجود هر دو فیلد). اگر فقط یکی موجود بود، همان معیار استفاده شود.
7. هیچ ردیف تکراری ساخته نشود؛ sync باید idempotent باشد و قابل اجرای مجدد بدون duplicate. Bot upsert با `unique_by=["afrakala_product_id"]` کار کند و نوشتن روی ستون‌های `is_computed=true` یا غیر `is_editable_by_bot` با خطای `column_not_allowed` (403) رد شود (مطابق DT.6D).
8. RLS و RBAC طبق الگوی موجود `dynamic_tables` فعال باشد.
9. هیچ تغییری در `torob-purchista-extracted-data`، `products`، pricing engine، Bot API، Docker، Caddy، LAN یا migrationهای موجود اعمال نشود.
10. migration DT.7B باید reversible/idempotent باشد و با backup/restore سازگار بماند.

## ۱۰) آیا DT.7B آماده اجراست؟

بله. قرارداد ستون‌ها با schema واقعی Dynamic Tables، `ALLOWED_FORMULA_KEYS` و `products` هماهنگ شد.

## ۱۱) Final status

**PASS** — قرارداد ۳۵ ستونی اصلاح‌شده قفل شد.

---

### Self-Host Acceptance Check

- بدون migration، بدون تغییر schema، بدون تغییر کد اجرایی، بدون تغییر UI/API.
- بدون secret جدید، بدون CDN خارجی، بدون dependency جدید.
- بدون تغییر در Docker/Caddy/LAN/SSL.
- فقط بازنویسی یک فایل مستندات فارسی در `docs/`. کاملاً سازگار با self-host.
