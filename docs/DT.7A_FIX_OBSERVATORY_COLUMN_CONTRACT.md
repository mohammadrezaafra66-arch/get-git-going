# DT.7A-FIX — قرارداد نهایی ستون‌های «رصدخانه قیمت محصولات افراکالا»

- **نام جدول:** رصدخانه قیمت محصولات افراکالا
- **slug:** `afrakala-product-price-observatory`
- **هدف این سند:** قفل کردن قرارداد ستون‌ها قبل از شروع DT.7B. هیچ کد/migration/UI در این فاز تغییر نمی‌کند.

---

## ۱) نتیجه بررسی DT.7A

طراحی DT.7A درست بود (۴ گروه ستون: داخلی، بازار، فرمولی، مدیریتی) و زیرساخت Dynamic Tables + Bot API (DT.6C/DT.6D) برای میزبانی این جدول آماده است. تنها ایراد، ناسازگاری عددی بین «Acceptance Criteria» (۳۲ ستون) و فهرست واقعی (۳۵ ستون) بود.

## ۲) آیا تناقض تعداد ستون‌ها وجود دارد؟

بله. متن AC گفته «۳۲ ستون»، ولی شمارش گروه‌ها ۱۱ + ۹ + ۱۰ + ۵ = **۳۵** است.

## ۳) تعداد واقعی ستون‌ها

**۳۵ ستون.**

## ۴) تصمیم نهایی

**۳۵ ستون تأیید می‌شود.** هیچ ستونی حذف یا موکول نمی‌شود. دلایل:

- هر ۴ گروه معنای عملیاتی مستقل دارند؛ حذف هر کدام، یا قابلیت bot ingestion را می‌شکند، یا تحلیل قیمت‌گذاری را ناقص می‌کند، یا کنترل مدیریتی را از بین می‌برد.
- ستون‌های Bot-filled (۹ ستون) از قبل در `torob-purchista-extracted-data` وجود دارند و حذفشان یعنی این جدول دیگر «رصدخانه» نیست.
- ستون‌های Computed (۱۰ ستون) صرفاً مشتق از داده‌های موجودند و هزینه seed تقریباً صفر دارند (فقط ستون تعریف می‌شود، مقدار توسط engine محاسبه می‌شود).
- ستون‌های User-editable (۵ ستون) سبک هستند و حذفشان UX را ضعیف می‌کند.
- عدد «۳۲» در AC قبلی صرفاً یک اشتباه شمارشی بود، نه یک محدودیت معماری.

اشتباه قبلی: AC از ۳۲ به **۳۵** اصلاح می‌شود (بخش ۹).

## ۵) — موضوعیت ندارد (۳۵ ستون انتخاب شد)
## ۶) — موضوعیت ندارد (هیچ ستونی حذف/موکول نمی‌شود)

## ۷) جدول نهایی ستون‌ها

| # | column_key | label فارسی | data_type | گروه | is_computed | is_editable_by_bot | user_editable | توضیح |
|---|---|---|---|---|---|---|---|---|
| 1 | `afrakala_product_id` | شناسه محصول افراکالا | uuid | system | false | false | false | FK به `products.id` |
| 2 | `product_name` | نام محصول | text | system | false | false | false | snapshot از `products.display_name` |
| 3 | `sku` | SKU | text | system | false | false | false | از `products.sku` |
| 4 | `brand_name` | برند | text | system | false | false | false | از category attrs |
| 5 | `category_name` | دسته‌بندی | text | system | false | false | false | از `categories.name` |
| 6 | `model` | مدل | text | system | false | false | false | از category attrs |
| 7 | `color` | رنگ | text | system | false | false | false | از category attrs |
| 8 | `capacity` | ظرفیت / حافظه | text | system | false | false | false | از category attrs |
| 9 | `stock_status` | وضعیت موجودی | text | system | false | false | false | in_stock / out_of_stock / low |
| 10 | `product_labels` | برچسب‌ها | text[] | system | false | false | false | از `product_labels` |
| 11 | `internal_price_updated_at` | آخرین به‌روزرسانی قیمت داخلی | timestamptz | system | false | false | false | از pricing engine |
| 12 | `torob_avg_price_toman` | میانگین قیمت ترب | number | bot | false | true | false | تومان |
| 13 | `torob_min_price_toman` | حداقل قیمت ترب | number | bot | false | true | false | تومان |
| 14 | `torob_max_price_toman` | حداکثر قیمت ترب | number | bot | false | true | false | تومان |
| 15 | `torob_seller_count` | تعداد فروشنده ترب | number | bot | false | true | false | عدد صحیح |
| 16 | `torob_last_seen_at` | آخرین مشاهده ترب | timestamptz | bot | false | true | false | زمان آخرین extraction |
| 17 | `purchista_avg_price_toman` | میانگین قیمت پرشیستا | number | bot | false | true | false | تومان |
| 18 | `purchista_min_price_toman` | حداقل قیمت پرشیستا | number | bot | false | true | false | تومان |
| 19 | `purchista_max_price_toman` | حداکثر قیمت پرشیستا | number | bot | false | true | false | تومان |
| 20 | `purchista_last_seen_at` | آخرین مشاهده پرشیستا | timestamptz | bot | false | true | false | زمان آخرین extraction |
| 21 | `afrakala_purchase_price_toman` | قیمت خرید افراکالا | number | computed | true | false | false | از pricing engine |
| 22 | `afrakala_min_sale_price` | حداقل قیمت فروش افراکالا | number | computed | true | false | false | از pricing engine |
| 23 | `market_avg_price_toman` | میانگین قیمت بازار | number | computed | true | false | false | میانگین وزنی torob+purchista |
| 24 | `price_gap_to_market_avg` | اختلاف با میانگین بازار | number | computed | true | false | false | تومان |
| 25 | `price_gap_percent_to_market_avg` | اختلاف درصدی با میانگین بازار | number | computed | true | false | false | درصد |
| 26 | `price_gap_to_market_min` | اختلاف با حداقل بازار | number | computed | true | false | false | تومان |
| 27 | `competitive_price_status` | وضعیت رقابتی | text | computed | true | false | false | below / at / above market |
| 28 | `sales_opportunity_score` | امتیاز فرصت فروش | number | computed | true | false | false | 0..100 |
| 29 | `sales_priority_rank` | رتبه اولویت فروش | number | computed | true | false | false | dense rank بر اساس score |
| 30 | `suggested_sales_message` | پیام پیشنهادی فروش | text | computed | true | false | false | placeholder، تولید AI در فاز بعد |
| 31 | `manager_note` | یادداشت مدیر | text | user | false | false | true | حداکثر ۱۰۰۰ کاراکتر |
| 32 | `sales_priority_override` | اولویت دستی فروش | number | user | false | false | true | اگر تنظیم شود، بر rank محاسباتی غلبه می‌کند |
| 33 | `show_in_quick_sales_search` | نمایش در جستجوی سریع فروش | boolean | user | false | false | true | پیش‌فرض true |
| 34 | `show_in_pdf` | نمایش در PDF | boolean | user | false | false | true | پیش‌فرض true |
| 35 | `is_watch_active` | پایش فعال | boolean | user | false | false | true | پیش‌فرض true؛ غیرفعال = نادیده در alert |

## ۸) Help tooltipهای نهایی

- **`afrakala_product_id`** — شناسه یکتای محصول در سامانه افراکالا. کلید اتصال این ردیف به جدول محصولات اصلی است و قابل ویرایش نیست.
- **`product_labels`** — برچسب‌های مدیریتی محصول (مثلاً «پرفروش»، «راکد»، «ویترین»). از ماژول برچسب‌های محصول گرفته می‌شود.
- **`torob_avg_price_toman`** — میانگین قیمت مشاهده‌شده برای این محصول در ترب در آخرین batch استخراج. توسط ربات پر می‌شود.
- **`market_avg_price_toman`** — میانگین وزنی قیمت ترب و پرشیستا. مرجع اصلی برای مقایسه قیمت رقابتی است.
- **`price_gap_percent_to_market_avg`** — اختلاف درصدی قیمت حداقل فروش افراکالا با میانگین بازار. مقدار منفی یعنی ارزان‌تر از بازار، مثبت یعنی گران‌تر.
- **`sales_opportunity_score`** — امتیاز ۰ تا ۱۰۰ بر اساس فاصله قیمت با بازار، موجودی و برچسب‌ها. هرچه بالاتر، فرصت فروش بهتر.
- **`suggested_sales_message`** — پیام کوتاه پیشنهادی برای تیم فروش. در فاز اول placeholder است؛ تولید AI در فاز بعدی فعال می‌شود.
- **`show_in_quick_sales_search`** — اگر خاموش شود، این محصول در جستجوی سریع فروش و PDF فروش ظاهر نمی‌شود (مفید برای محصولات منسوخ یا تستی).

## ۹) Acceptance Criteria نهایی برای DT.7B

1. جدول Dynamic Table با `slug = afrakala-product-price-observatory` و نام فارسی «رصدخانه قیمت محصولات افراکالا» ایجاد شود.
2. **دقیقاً ۳۵ ستون** با همان `column_key`، `data_type`، `is_computed`، `is_editable_by_bot` جدول بخش ۷ seed شود.
3. ردیف‌ها = محصولات فعال افراکالا (`products.is_active = true`)، با کلید یکتای `afrakala_product_id`.
4. هیچ ردیف تکراری نباید ایجاد شود؛ sync باید idempotent باشد.
5. Bot upsert با `unique_by = ["afrakala_product_id"]` کار کند و نوشتن روی ستون‌های computed/system باید با خطای `column_not_allowed` (403) رد شود (مطابق DT.6D).
6. RLS و RBAC جدول طبق الگوی موجود `dynamic_tables` فعال باشد.
7. هیچ تغییری در `torob-purchista-extracted-data`، `products`، pricing engine، Docker، Caddy، LAN یا migrationهای موجود اعمال نشود.
8. هیچ secret یا API key جدید لازم نیست؛ ingestion از طریق Bot API موجود انجام می‌شود.
9. ستون‌های computed در فاز DT.7B می‌توانند به‌عنوان placeholder ثبت شوند و مقدارشان در DT.7C توسط engine پر شود — اما `formula_key` آن‌ها باید همین حالا تعریف شود.

## ۱۰) آیا DT.7B آماده اجراست؟

بله. قرارداد ستون‌ها قفل شد، زیرساخت Dynamic Tables و Bot API آماده است، و هیچ وابستگی بیرونی جدید لازم نیست.

## ۱۱) Final status

**PASS** — قرارداد ۳۵ ستونی قفل شد. DT.7B می‌تواند بر اساس همین سند آغاز شود.

---

### Self-Host Acceptance Check

- بدون migration، بدون تغییر schema، بدون تغییر کد اجرایی.
- بدون secret جدید، بدون CDN خارجی، بدون dependency جدید.
- بدون تغییر در Docker/Caddy/LAN/SSL.
- فقط افزودن یک فایل مستندات فارسی در `docs/`. سازگار با self-host.
