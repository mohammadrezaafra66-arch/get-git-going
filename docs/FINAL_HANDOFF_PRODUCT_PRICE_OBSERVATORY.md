# تحویل نهایی رصدخانه قیمت محصولات افراکالا

سند عملیاتی نهایی برای handoff کامل رصدخانه قیمت محصولات افراکالا.
این سند صرفاً documentation است و هیچ تغییری در کد/migration/schema/UI/API ایجاد نکرده است.

---

## ۱. خلاصه اجرایی

«رصدخانه قیمت محصولات افراکالا» یک Dynamic Table اختصاصی است که:

- برای **هر محصول فعال افراکالا یک ردیف** نگه می‌دارد (sync با جدول `products`).
- **داده خام بازار** (ترب، پورچیستا، ...) را از طریق Bot API دریافت می‌کند.
- **محاسبات read-time** انجام می‌دهد: میانگین بازار، وضعیت رقابتی، امتیاز فرصت فروش، پیام پیشنهادی فروشنده.
- به **جستجوی سریع فروش** فقط یک snippet کنترل‌شده داخلی می‌دهد.
- به **PDF مشتری** فقط یک خروجی امن می‌دهد: عبارت «قیمت رقابتی» در صورت داشتن مزیت واقعی.
- **داده خام بازار، score، status خام، پیام داخلی فروشنده، و manager_note هرگز در PDF مشتری افشا نمی‌شوند.**

مرز امنیتی: ربات فقط می‌نویسد، سیستم محاسبه می‌کند، PDF فقط نتیجه امن می‌بیند.

---

## ۲. وضعیت فازهای انجام‌شده

| فاز | هدف | خروجی اصلی | وضعیت | هشدار |
|---|---|---|---|---|
| DT.7A | طراحی schema رصدخانه | تعریف ستون‌ها و انواع | PASS | — |
| DT.7B | ساخت Dynamic Table | جدول با slug `afrakala-product-price-observatory` | PASS | — |
| DT.7C | ستون‌های ربات | ۹ ستون بازار قابل نوشتن | PASS | — |
| DT.7D | ستون‌های مدیریتی | flags و یادداشت‌های داخلی | PASS | — |
| DT.7E | sync با products | تابع `sync_product_price_observatory_rows` idempotent | PASS | نیاز به اجرای دوره‌ای |
| DT.7F | محاسبات read-time | `_obs_compute_row_values` | PASS | — |
| DT.7G | competitive_price_status | وضعیت رقابتی محاسبه‌شده | PASS | — |
| DT.7H | sales_opportunity_score | امتیاز فرصت فروش | PASS | — |
| DT.7I | suggested_sales_message | پیام داخلی فروشنده | PASS | — |
| DT.7J | snippet جستجوی سریع فروش | `get_observatory_snippets_for_products` | PASS | فقط call site داخلی |
| DT.7K | PDF hint امن | `get_observatory_pdf_hints_for_products` (فقط boolean) | PASS | — |
| DT.7L | تست RPC PDF | RPC امن کار می‌کند | PASS WITH WARNINGS | تست بصری PDF با session انجام نشد |
| BOT-HANDOFF | سند قرارداد ربات | `docs/BOT_HANDOFF_PRODUCT_PRICE_OBSERVATORY.md` | PASS | — |
| BOT-HANDOFF-VERIFY | تأیید نهایی سند | اصلاحات مستندسازی | PASS WITH DOC FIXES | — |
| DT.7M | تست عملیاتی Bot API | upsert/idempotency/forbidden columns | PASS WITH WARNINGS | `invalid_unique_by` دقیق نیست |
| DT.7M-FIX | بستن هشدارهای DT.7M | بررسی validation order | PASS WITH WARNINGS | اصلاح به DT.7P موکول شد |
| DT.7N | Security/Performance/Self-Host Audit | بدون blocker | PASS WITH WARNINGS | BOT-MATCHING blocker تولید واقعی |

---

## ۳. جدول‌ها و slugهای مهم

- **نام جدول (فارسی):** رصدخانه قیمت محصولات افراکالا
- **slug:** `afrakala-product-price-observatory`
- **unique_by:** `["afrakala_product_id"]`

---

## ۴. ستون‌های مهم رصدخانه

### ۴.۱ ستون‌های سیستمی
- `id`, `table_id`, `is_active`, `created_at`, `updated_at`
- `afrakala_product_id` (کلید پیوند به `products.id` — فقط برای `unique_by`)

### ۴.۲ ستون‌های قابل نوشتن توسط ربات (۹ ستون مجاز)
ربات **فقط و فقط** اجازه نوشتن این ۹ ستون را دارد:

1. `torob_avg_price_toman`
2. `torob_min_price_toman`
3. `torob_max_price_toman`
4. `torob_seller_count`
5. `torob_last_seen_at`
6. `purchista_avg_price_toman`
7. `purchista_min_price_toman`
8. `purchista_max_price_toman`
9. `purchista_last_seen_at`

### ۴.۳ ستون‌های محاسباتی / read-time
- `market_avg_price_toman`
- `competitive_price_status`
- `sales_opportunity_score`
- `suggested_sales_message`
- `has_price_advantage`

این ستون‌ها `is_computed=true` هستند و ربات حق نوشتن آن‌ها را ندارد.

### ۴.۴ ستون‌های مدیریتی (فقط ادمین/UI)
- `is_watch_active`
- `show_in_pdf`
- `show_in_quick_sales_search`
- `manager_note`
- `sales_priority_rank` (فعلاً null؛ فاز DT.7R)

---

## ۵. قرارداد Bot API

**گام ۱ — Resolve slug به tableId:**
```
GET /api/public/bot/dynamic-tables/by-slug/afrakala-product-price-observatory
Header: x-bot-api-key: <BOT_API_KEY>
```

**گام ۲ — Upsert ردیف بازار:**
```
POST /api/public/bot/dynamic-tables/{tableId}/rows/upsert
Header: x-bot-api-key: <BOT_API_KEY>
Content-Type: application/json

{
  "unique_by": ["afrakala_product_id"],
  "values": {
    "afrakala_product_id": "PRODUCT_UUID_HERE",
    "torob_avg_price_toman": 70000000
  }
}
```

قواعد سخت‌گیرانه:
- `table_slug` در body **نباید** ارسال شود (slug فقط در URL گام ۱).
- `afrakala_product_id` فقط در `unique_by` و در `values` به‌عنوان کلید matching است؛ **نباید** در `allowed_update_columns` باشد.
- اگر روی API Key مجوز `can_create` وجود دارد، باید **`false`** باشد. ربات حق ساخت ردیف جدید ندارد.
- ارسال هر ستون خارج از ۹ ستون مجاز ⇒ خطای `column_not_allowed`.
- ارسال ستون با `is_computed=true` ⇒ خطای `column_not_allowed`.

جزئیات کامل در: `docs/BOT_HANDOFF_PRODUCT_PRICE_OBSERVATORY.md`

---

## ۶. رفتار بعد از ارسال داده توسط ربات

- ربات فقط داده **خام بازار** را می‌نویسد.
- سیستم خودش `market_avg_price_toman` را محاسبه می‌کند.
- سیستم خودش `competitive_price_status` را محاسبه می‌کند.
- سیستم خودش `sales_opportunity_score` را محاسبه می‌کند.
- سیستم خودش `suggested_sales_message` را تولید می‌کند.
- ربات حق تصمیم برای `show_in_pdf` یا `show_in_quick_sales_search` یا `is_watch_active` ندارد — این flagها فقط دست ادمین است.

---

## ۷. اتصال به جستجوی سریع فروش

- snippet فقط زمانی برمی‌گردد که **هر دو** شرط برقرار باشد: `show_in_quick_sales_search=true` **و** `is_watch_active=true`.
- خروجی فقط برای **استفاده داخلی فروشنده** است.
- داده خام بازار (torob/purchista raw) **هرگز در جستجوی سریع فروش افشا نمی‌شود**.
- snippet شامل فیلدهای کنترل‌شده داخلی است: `competitive_price_status`, `sales_opportunity_score`, `suggested_sales_message`.
- این فیلدها صرفاً در call site داخلی (فروشنده لاگین‌شده) قابل استفاده‌اند.

---

## ۸. اتصال به PDF

- فقط زمانی `has_price_advantage=true` به PDF می‌رسد که **هر سه** شرط برقرار باشد:
  1. `show_in_pdf=true`
  2. `is_watch_active=true`
  3. محصول مزیت قیمت واقعی نسبت به بازار داشته باشد.
- **تنها متن مجاز در PDF مشتری:** «قیمت رقابتی»
- **ممنوع در PDF (هرگز نباید افشا شود):**
  - قیمت خام بازار (torob/purchista values)
  - `sales_opportunity_score`
  - `competitive_price_status` خام
  - `suggested_sales_message`
  - `manager_note`
  - هر پیام مذاکره/تخفیف داخلی

---

## ۹. وضعیت self-host و LAN

طبق DT.7N:

- نیاز به **هیچ سرویس خارجی** ندارد.
- بدون **AI خارجی** کار می‌کند.
- بدون **CDN خارجی** کار می‌کند.
- Bot API با **Base URL قابل تنظیم** (LAN / دامنه self-host) کار می‌کند.
- **Backup باید شامل:** جداول `dynamic_tables`, `dynamic_table_columns`, `dynamic_table_rows`, `dynamic_table_cells`, `bot_api_keys`, `bot_api_key_table_access` باشد.
- `sync_product_price_observatory_rows` **بهتر است در آینده** به‌صورت job/cron (pg_cron یا route `/api/public/cron/*`) دوره‌ای اجرا شود تا محصولات جدید خودکار ردیف بگیرند.

---

## ۱۰. هشدارهای شناخته‌شده (Known Warnings)

| # | عنوان | شدت | اقدام / فاز آینده |
|---|---|---|---|
| 1 | `invalid_unique_by` دقیق نیست و ممکن است `column_not_allowed` بدهد | Low–Medium | فاز آینده: **DT.7P_ALLOWED_UNIQUE_COLUMNS** (ستون جدید `allowed_unique_columns`) |
| 2 | PDF visual test هنوز با session لاگین‌شده انجام نشده | Medium | **تست دستی قبل از production** |
| 3 | داده بازار تستی/نامشخص باقی مانده | Low | تصمیم owner برای cleanup (flagها off است → ریسک صفر) |
| 4 | `sales_priority_rank` فعلاً null است | Low | فاز آینده: **DT.7R_RANKING** |
| 5 | Matching بازار به محصول داخلی ساخته نشده | **High** | فاز **BOT-MATCHING** — **blocker تولید واقعی ربات** |
| 6 | snippet داده داخلی فروش برمی‌گرداند | Info | فقط در call site داخلی فروشنده استفاده شود |

---

## ۱۱. وضعیت آمادگی

| سناریو | وضعیت |
|---|---|
| Controlled bot test | ✅ READY |
| Handoff to bot developer | ⚠️ READY WITH WARNINGS |
| LAN / self-host test | ✅ READY |
| Limited production | ⚠️ READY WITH WARNINGS |
| Real production bot scraping | ❌ NOT READY — تا انجام **BOT-MATCHING** |

---

## ۱۲. فازهای پیشنهادی بعدی

1. **PDF-VISUAL-VERIFY** — هدف: تست بصری Preview/Download PDF با session ادمین واقعی. دستاورد: بستن هشدار ۲.
2. **BOT-MATCHING** — هدف: ساخت لایه نگاشت محصول بازار به `afrakala_product_id` داخلی (با تأیید انسانی). دستاورد: رفع blocker تولید واقعی.
3. **DT.7P_ALLOWED_UNIQUE_COLUMNS** — هدف: افزودن ستون `allowed_unique_columns` به `bot_api_key_table_access` + UI. دستاورد: خطای دقیق `invalid_unique_by`.
4. **DT.7R_RANKING** — هدف: پر کردن `sales_priority_rank` با منطق مشخص. دستاورد: اولویت‌بندی فرصت‌های فروش.
5. **OBSERVATORY-SCALE** — فقط اگر تعداد ردیف‌ها از مرز عملکرد فعلی عبور کرد. دستاورد: indexهای اضافه و کش read-time.

---

## ۱۳. چک‌لیست تحویل به مسئول ربات

- [ ] خواندن کامل `docs/BOT_HANDOFF_PRODUCT_PRICE_OBSERVATORY.md`
- [ ] گرفتن **Base URL** (LAN یا production) از owner
- [ ] گرفتن **Bot API Key** اختصاصی (production جدا از تستی)
- [ ] Resolve `tableId` با slug (گام ۱)
- [ ] Upsert فقط با ۹ ستون مجاز (گام ۲)
- [ ] **عدم ارسال** هیچ ستون سیستمی/مدیریتی/computed
- [ ] **عدم حدس** `afrakala_product_id` بدون نگاشت معتبر
- [ ] ثبت **log محلی** برای داده ناموجود یا محصول unknown
- [ ] تست **idempotency** (دو بار upsert ⇒ یک ردیف)
- [ ] تست **column_not_allowed** (ارسال ستون ممنوع ⇒ rejection)
- [ ] تست **product unknown** (`afrakala_product_id` نامعتبر ⇒ rejection، نه ردیف جدید)
- [ ] هماهنگی با owner برای فاز **BOT-MATCHING**

---

## ۱۴. چک‌لیست قبل از production

- [ ] PDF visual test با session ادمین واقعی انجام و تأیید شود
- [ ] فاز **BOT-MATCHING** کامل و تست شود
- [ ] داده تستی بازار cleanup یا توسط owner تأیید شود
- [ ] **API key production** جدید ساخته شود
- [ ] **API key تستی** حذف شود
- [ ] **backup/restore** کامل تست شود (جداول dynamic + bot)
- [ ] LAN/self-host با Docker Compose تست شود
- [ ] **تأیید نهایی owner** برای go-live

---

## ۱۵. جمع‌بندی نهایی

رصدخانه قیمت محصولات افراکالا از نظر **زیرساخت، امنیت، عملکرد، و self-host آماده است.**

- مرز امنیتی PDF (افشا نشدن داده خام بازار و پیام داخلی) رعایت شده است.
- قرارداد Bot API روشن، محدود به ۹ ستون، و آزمون‌شده است.
- بدون وابستگی به CDN/AI/سرویس خارجی، روی Linux + Docker + Supabase self-host قابل اجراست.

**اما برای production واقعی ربات، فاز BOT-MATCHING همچنان ضروری است.**
بدون mapping معتبر بین محصول بازار و محصول داخلی افراکالا، **ربات نباید داده بازار را روی `afrakala_product_id` حدسی بنویسد** — این کار باعث آلودگی داده، محاسبات اشتباه read-time، و در نهایت سیگنال غلط در جستجوی سریع فروش و PDF خواهد شد.

تا تکمیل BOT-MATCHING، سیستم فقط برای **controlled bot test** و **limited production با نظارت** مجاز است.
