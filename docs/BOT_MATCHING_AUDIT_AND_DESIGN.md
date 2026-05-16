# Audit و طراحی لایه Matching محصول بازار به محصول افراکالا

سند طراحی برای فاز **BOT-MATCHING**. این سند صرفاً audit و طراحی است؛ هیچ کد، migration، schema، API، scraper یا crawler در این فاز ساخته نشده است.

---

## ۱. خلاصه مسئله

ربات رصدخانه قیمت برای آپدیت جدول `afrakala-product-price-observatory` باید `afrakala_product_id` معتبر بفرستد. اما داده‌ای که ربات از ترب/پورچیستا می‌خرد، یک «آیتم بازار» است (URL، عنوان خام، برند خام، قیمت فروشنده) — نه یک محصول داخلی افراکالا.

پل بین این دو دنیا = **Matching**. بدون این پل:
- ربات یا باید با fuzzy name matching حدس بزند (ممنوع: ریسک بالای آلودگی داده).
- یا اصلاً ننویسد (سیستم بی‌اثر می‌ماند).

---

## ۲. چرا matching برای production blocker است

طبق `docs/FINAL_HANDOFF_PRODUCT_PRICE_OBSERVATORY.md` (Known Warning #5، severity High):

> «بدون mapping معتبر بین محصول بازار و محصول داخلی افراکالا، ربات نباید داده بازار را روی afrakala_product_id حدسی بنویسد.»

ریسک‌های نبود matching معتبر:
- آپدیت ردیف **اشتباه** در رصدخانه → محاسبه نادرست `market_avg_price_toman` → `competitive_price_status` غلط → پیام غلط در «جستجوی سریع فروش» داخلی → در نهایت سیگنال غلط به PDF («قیمت رقابتی» برای محصولی که نیست).
- آلودگی تاریخی داده torob/purchista → بازگرداندنش دستی پرهزینه است.
- ضرر اعتمادی فروشنده به سیستم.

پس production ربات **مشروط به وجود لایه matching تأییدشده** است.

---

## ۳. داده‌های موجود در `products`

تعداد رکورد فعال: **۱۶۸**

پوشش فیلدها (محاسبه‌شده از DB):

| فیلد | تعداد non-null | نسبت |
|---|---|---|
| `sku` | 168 | ۱۰۰٪ |
| `name` | 168 | ۱۰۰٪ |
| `brand_id` (FK → `brands`) | 165 | ۹۸٪ |
| `category_id` (FK → `categories`) | 160 | ۹۵٪ |
| `model` | 135 | ۸۰٪ |
| `color` | 102 | ۶۱٪ |
| `capacity` | 85 | ۵۱٪ |

ابزارهای موجود مفید برای matching:
- `dedup_key` = `brand_id | category_id | normalize_fa(model) | normalize_fa(color) | normalize_fa(capacity)` (generated column) — برای auto-candidate قوی استفاده می‌شود.
- ایندکس‌های `gin_trgm_ops` روی `name`, `sku`, `model`, `color`, `capacity` — برای similarity search سریع.
- تابع `normalize_fa(text)` — برای normalization عنوان فارسی (ی/ک، نیم‌فاصله، اعداد).

**نتیجه:** داده داخلی برای matching **به‌اندازه کافی غنی است**، به‌خصوص اگر model + brand هم‌زمان موجود باشند (۸۰٪ موارد).

---

## ۴. داده‌های موجود از sourceهای بازار

جدول داینامیک موجود: **`torob-purchista-extracted-data`** (slug). فیلدهای فعلی ربات:

- `source` (status: torob / purchista / ...)
- `extraction_batch_id` (text)
- `extracted_at` (datetime)
- `external_product_id` (text) ✅
- `product_url` (text) ✅
- `product_title_raw` (text)
- `brand_raw` (text)
- `model_raw` (text)
- `seller_name` (text)
- `extracted_price_toman` (number)
- `stock_status_raw` (status)
- `match_key` (text) — embryonic
- `afrakala_product_id` (text) — embryonic، **بدون FK**
- `match_confidence` (number) — embryonic
- `bot_notes` (text)
- ستون‌های computed قیمت

**نکته مهم:** ربات الان فیلدهایی **شبیه** matching دارد ولی:
- بدون FK واقعی به `products(id)`
- بدون status workflow (pending/approved/rejected)
- بدون reviewer / audit
- بدون قاعده «فقط approved اجازه آپدیت رصدخانه دارد»

---

## ۵. شکاف‌های فعلی

| شکاف | شدت | توضیح |
|---|---|---|
| نبود جدول اختصاصی `market_product_matches` | **High** | تنها فیلدهای پراکنده در جدول داینامیک ترب وجود دارد |
| `afrakala_product_id` در جدول ترب فقط text است، بدون FK | High | اجازه می‌دهد UUID نامعتبر ذخیره شود |
| نبود `match_status` با workflow | High | هیچ تفاوتی بین «حدس ربات» و «تأیید انسان» نیست |
| نبود `confidence_score` با threshold الزامی | Medium | الان عددی هست ولی هیچ‌کجا اعمال نمی‌شود |
| نبود FK یکتایی (source, source_product_id) | Medium | یک URL می‌تواند چندبار ثبت شود |
| نبود محافظت در برابر «یک URL → چند `afrakala_product_id`» | High | بدون unique constraint قابل وقوع است |
| نبود review queue UI | Medium | بدون UI، تأیید انسانی عملاً غیرممکن است |
| نبود audit log برای تغییر match | Medium | تغییر approved → rejected ردیابی نمی‌شود |
| نبود ارتباط مستقیم Bot API ⇄ لایه match | **High** | الان Bot API چک نمی‌کند که `afrakala_product_id` ارسالی واقعاً approved است |

---

## ۶. پیشنهاد ساختار `Market Product Match`

**نام پیشنهادی جدول:** `market_product_matches`

**فیلدهای پیشنهادی:**

| فیلد | نوع | توضیح |
|---|---|---|
| `id` | uuid PK | gen_random_uuid() |
| `source_name` | enum (`torob`, `purchista`, `other`) | منبع بازار |
| `source_product_url` | text NOT NULL | لینک کانونیکال محصول در منبع |
| `source_product_id` | text NULL | شناسه داخلی در منبع (اگر استخراج شد) |
| `source_title` | text NOT NULL | عنوان خام |
| `normalized_source_title` | text | محاسبه‌شده با `normalize_fa()` برای جستجوی سریع |
| `source_brand_raw` | text NULL | برند خام |
| `source_model_raw` | text NULL | مدل خام |
| `afrakala_product_id` | uuid NULL FK→`products(id)` ON DELETE RESTRICT | کاندید/تأییدشده |
| `afrakala_product_name_snapshot` | text NULL | snapshot برای ردیابی تاریخی |
| `match_status` | enum (`pending`, `needs_review`, `approved`, `rejected`) NOT NULL DEFAULT `pending` | |
| `confidence_score` | numeric(5,2) NULL CHECK 0..100 | امتیاز محاسباتی |
| `matched_by` | enum (`system`, `human`, `imported`) NOT NULL | |
| `reviewed_by` | uuid NULL FK→`auth.users(id)` | |
| `reviewed_at` | timestamptz NULL | |
| `reject_reason` | text NULL | الزامی وقتی `match_status='rejected'` (trigger) |
| `notes` | text NULL | یادداشت داخلی reviewer |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |
| `updated_at` | timestamptz NOT NULL DEFAULT now() | |
| `last_seen_at` | timestamptz NULL | آخرین باری که ربات این source را دید |

**ایندکس‌ها و قیود پیشنهادی:**
- `UNIQUE (source_name, source_product_url)` — هر URL در هر منبع فقط یک match.
- `UNIQUE (source_name, source_product_id) WHERE source_product_id IS NOT NULL`
- ایندکس مرکب `(match_status, source_name)` برای صف review.
- ایندکس `(afrakala_product_id) WHERE match_status='approved'` برای lookup سریع از Bot API.
- ایندکس trigram روی `normalized_source_title`.

**RLS و RBAC (طراحی):**
- SELECT: admin, manager, sales (داخلی)
- INSERT: فقط Bot API key (پراساس `bot_api_key_table_access` معادل)
- UPDATE status: فقط admin, manager (با audit log)
- DELETE: ممنوع — `match_status='rejected'` به جای حذف

**Audit log جداگانه:** `market_product_match_events` — `event_type`, `from_status`, `to_status`, `actor_id`, `reason`, `created_at`.

---

## ۷. statusها و workflow

```
                        ┌─────────────┐
   ربات داده فرستاد ───▶│   pending   │
                        └──────┬──────┘
                               │ system rules
                ┌──────────────┼──────────────┐
                ▼              ▼              ▼
        ┌────────────┐  ┌─────────────┐  ┌──────────┐
        │  approved  │  │ needs_review│  │ rejected │
        │ (auto-low  │  │  (human)    │  │ (system) │
        │  risk)     │  │             │  │          │
        └─────┬──────┘  └──────┬──────┘  └──────────┘
              │                │ human action
              │         ┌──────┼──────┐
              │         ▼      ▼
              │   approved   rejected
              ▼
     فقط این match اجازه دارد
     `afrakala_product_id` را در
     Bot API رصدخانه استفاده کند.
```

---

## ۸. قوانین auto-candidate و human-review

**Auto-approved (فقط در شرایط بسیار محدود):**

- `source_product_id` قبلاً برای همان `(source_name, source_product_id)` با `match_status='approved'` ثبت شده → re-seen، آپدیت `last_seen_at`، بدون تغییر mapping. ✅
- **هیچ match جدید system نباید مستقیماً به `approved` برسد در v1.** همه به `pending` یا `needs_review` می‌روند. (v2 می‌تواند اگر brand + model + sku دقیقاً منطبق شد، auto-approve کند.)

**Strong-candidate → `needs_review`:**

- brand normalize شده == brand محصول AND model normalize شده == model محصول AND (capacity مطرح نباشد یا یکی باشد) → `confidence_score ≥ 80`.

**Weak-candidate → `needs_review`:**

- similarity(normalized_source_title, product.name) > 0.45 + brand یکی → `confidence_score 40..79`.

**Hard rejected (system):**

- brand یکی نیست AND مشخص است (هر دو غیرnull) → reject با `reject_reason='brand_mismatch'`.
- capacity مهم متفاوت → reject با `reject_reason='capacity_mismatch'`.
- چند کاندید قوی همزمان (>۱) → reject همه و یک رکورد `needs_review` با `afrakala_product_id=NULL` و notes شامل لیست کاندیدها.

**Confidence threshold الزامی:** بدون `confidence_score ≥ THRESHOLD_APPROVE` (پیشنهاد 90) هیچ auto-approve مجاز نیست. در v1، THRESHOLD_APPROVE=∞ (یعنی همیشه human).

---

## ۹. قوانین ممنوعیت update رصدخانه

**ربات production فقط در این صورت مجاز به upsert رصدخانه است:**

1. آیتم بازار توسط `source_name + source_product_url` در `market_product_matches` resolve شود.
2. آن رکورد `match_status='approved'` و `afrakala_product_id IS NOT NULL` داشته باشد.
3. `confidence_score ≥ THRESHOLD_APPROVE` (یا توسط انسان تأیید شده باشد).

**اگر هیچ‌کدام برقرار نیست:**
- ربات **حق ندارد** Bot API رصدخانه را call کند.
- باید فقط در `market_product_matches` یک `pending`/`needs_review` ثبت کند.
- یا اگر رکورد موجود `rejected` است، صرفاً `last_seen_at` آپدیت شود و item نادیده گرفته شود.

**Fuzzy name matching به‌تنهایی برای آپدیت رصدخانه ممنوع است.** صراحتاً — هر pipeline که از similarity صرف برای resolve کردن `afrakala_product_id` استفاده کند و مستقیم به Bot API رصدخانه بنویسد، نقض contract محسوب می‌شود.

---

## ۱۰. نحوه اتصال به Bot API رصدخانه

**Pipeline مجاز ربات production:**

```
1. ربات scrape می‌کند → آیتم بازار (URL, title, price, ...)
2. POST /api/public/bot/market-matches/upsert
     { source_name, source_product_url, source_title, ... }
   → سرور system-rules را اجرا می‌کند، رکورد را با
     status=pending/needs_review/rejected ذخیره می‌کند.
3. سرور پاسخ می‌دهد:
     - approved   → resolved_afrakala_product_id را برمی‌گرداند
     - other      → null + status + reason
4. اگر approved:
     ربات GET /api/public/bot/dynamic-tables/by-slug/afrakala-product-price-observatory
     سپس POST /api/public/bot/dynamic-tables/{tableId}/rows/upsert
        with values.afrakala_product_id = resolved_id
        + ۹ ستون مجاز بازار
5. اگر approved نبود:
     ربات هیچ‌چیز در رصدخانه ننویسد.
     فقط در review queue باقی بماند.
```

**Bot API key permissions جدید لازم در فاز اجرایی:**

- جدول `market_product_matches`: `can_create=true`, `can_update_status=false`، `allowed_update_columns = [last_seen_at, source_title, source_brand_raw, source_model_raw]` (نه `match_status`, نه `afrakala_product_id`).
- جدول رصدخانه: بدون تغییر، طبق BOT_HANDOFF موجود.

---

## ۱۱. نیازهای UI برای review انسانی

صفحه پیشنهادی: `/market-matches/review`

- لیست `match_status IN ('pending', 'needs_review')`
- برای هر ردیف:
  - عنوان منبع + لینک منبع + برند خام + مدل خام
  - لیست کاندیدهای محصول افراکالا (top 5 by trigram similarity روی `name` + همخوانی brand)
  - دکمه‌های Approve / Reject (با reason) / Edit candidate (انتخاب دستی)
  - نمایش `confidence_score`
- فیلتر بر `source_name`، تاریخ `created_at`، brand
- بعد از Approve → اگر این source_url قبلاً به محصول دیگری approved بود → باید الزاماً تغییر را در audit log ثبت کند و حداقل یک هشدار modal بدهد.

دسترسی: admin, manager (نه sales).

---

## ۱۲. نیازهای audit / log

جدول `market_product_match_events`:
- `match_id` FK
- `event_type`: `created`, `auto_classified`, `human_approved`, `human_rejected`, `remapped`, `seen_again`
- `from_status`, `to_status`
- `from_afrakala_product_id`, `to_afrakala_product_id`
- `actor_id` (user_id یا bot_api_key_id)
- `reason`, `notes`
- `created_at`

Trigger روی `market_product_matches` AFTER INSERT/UPDATE → ثبت خودکار event.

---

## ۱۳. ریسک‌ها

| ریسک | احتمال | شدت | تخفیف |
|---|---|---|---|
| فروشنده ترب همان لینک را به محصول دیگری مپ کند | متوسط | بالا | unique (source_name, source_product_url) + هشدار remap |
| لینک ترب redirect یا تغییر URL canonical | بالا | متوسط | normalize URL (strip query، lowercase) قبل از insert |
| سیلاب pending در صف review | بالا (در ابتدا) | متوسط | بَچ‌سازی، فیلترها، prioritize بر اساس فروش/قیمت |
| reviewer سهواً approve اشتباه کند | متوسط | بالا | audit log + امکان remap با ثبت reason |
| ربات production قبل از کامل شدن matching فعال شود | متوسط | **بحرانی** | enforcement سمت سرور: Bot API رصدخانه باید چک کند `afrakala_product_id` در `market_product_matches` با `approved` ثبت شده باشد |
| اضافه شدن source سوم (مثلاً ایمالز) | پایین | پایین | enum extensible؛ طراحی source-aware |

---

## ۱۴. فاز اجرایی پیشنهادی بعدی

**نام فاز:** `BOT-MATCHING-SCHEMA`

**هدف:** اجرای schema و RLS و enum مطابق این طراحی، بدون UI و بدون اتصال ربات.

**خروجی‌ها:**
- migration: enum `market_match_source`, `market_match_status`, `market_match_actor`
- migration: جدول `market_product_matches` با همه قیود، ایندکس‌ها، RLS
- migration: جدول `market_product_match_events` + trigger
- RPC: `resolve_market_match(source_name, source_product_url) RETURNS market_product_matches` (security definer)
- بدون تغییر Bot API موجود رصدخانه
- بدون UI

**فازهای بعدی پیشنهادی پس از آن:**
1. `BOT-MATCHING-API` — endpointهای `/api/public/bot/market-matches/*` با verify-and-classify سمت سرور
2. `BOT-MATCHING-UI` — صفحه `/market-matches/review`
3. `BOT-MATCHING-ENFORCEMENT` — اعمال در Bot API رصدخانه: rejection upsert اگر `afrakala_product_id` در matches با approved موجود نباشد
4. `BOT-MATCHING-PRODUCTION` — go-live ربات واقعی

---

## ۱۵. Acceptance criteria برای فاز بعد (BOT-MATCHING-SCHEMA)

- [ ] جدول `market_product_matches` ساخته شود با تمام فیلدها، enumها، indexها، قیود unique
- [ ] FK `afrakala_product_id → products(id)` با `ON DELETE RESTRICT`
- [ ] RLS فعال:
  - SELECT برای admin/manager (نه ربات؛ ربات از Bot API می‌خواند)
  - INSERT/UPDATE فقط از طریق RPC/Bot API
  - بدون DELETE
- [ ] Trigger الزام `reject_reason` وقتی `match_status='rejected'`
- [ ] Trigger به‌روزرسانی `updated_at`
- [ ] جدول `market_product_match_events` + trigger event-capture
- [ ] migration reversible و idempotent
- [ ] هیچ تأثیر روی Bot API رصدخانه، PDF، جستجوی سریع فروش، pricing engine
- [ ] هیچ scraper، crawler، یا اتصال خارجی
- [ ] گزارش پایان شامل: row count صفر در جدول match، تأیید RLS، تأیید سازگاری self-host

---

## جمع‌بندی

**صراحتاً:**
- **production bot بدون approved match مجاز به update رصدخانه نیست.**
- **fuzzy name matching به‌تنهایی برای resolve کردن `afrakala_product_id` ممنوع است.**
- فاز اجرایی بعدی: **BOT-MATCHING-SCHEMA** (فقط schema + RLS، بدون UI و بدون اتصال ربات).


---

## Schema Implementation Status (BOT-MATCHING-SCHEMA)

تاریخ: 2026-05-16

### انجام‌شده
- migration پایه ساخته شد (enumها، جداول، triggerها، RPCها).
- `public.market_match_source`, `public.market_match_status`, `public.market_match_actor` ایجاد شدند.
- جدول `public.market_product_matches` با constraintهای کلیدی:
  - `mpm_source_ref_present`: حداقل یکی از url/id لازم است.
  - `mpm_confidence_range`: 0..100.
  - `mpm_approved_requires_afrakala`: approved بدون product داخلی ممکن نیست.
  - FK به products با `ON DELETE RESTRICT`.
- جدول `public.market_product_match_events` برای audit log.
- triggerهای `set_updated_at` و `log_market_product_match_event` (created / status_changed).
- RPC `resolve_market_product_match` — فقط approved، read-only، SECURITY DEFINER، GRANT فقط به service_role.
- RPC `upsert_market_product_match_candidate` — همیشه `pending` می‌سازد، هرگز approved نمی‌سازد، هرگز afrakala_product_id را auto-set نمی‌کند، GRANT فقط به service_role.
- RLS روی هر دو جدول فعال است؛ هیچ policy عمومی اضافه نشد (deny by default).
- indexهای unique partial و btree و gin_trgm روی normalized_source_title.

### انجام‌نشده (عمداً)
- UI بازبین (review queue) ساخته نشده.
- enforcement روی Bot API رصدخانه اعمال نشده. فعلاً Bot API همچنان مستقل کار می‌کند.
- هیچ scraper / crawler / اتصال به ترب یا پورچیستا ساخته نشده.
- هیچ ادغام AI/OpenAI/Perplexity.
- هیچ match واقعی production ساخته نشد.
- هیچ ردیف رصدخانه update نشد.
- هیچ auto-approve منطق فعال نیست.
- policy RLS برای admin/reviewer در فاز بعدی (BOT-MATCHING-UI) اضافه می‌شود.

### فاز بعدی پیشنهادی
**BOT-MATCHING-API** — افزودن endpointهای `/api/public/bot/market-matches/...` که از RPCهای بالا استفاده کنند، با signature verification.
سپس **BOT-MATCHING-UI** برای صف بازبینی، سپس **BOT-MATCHING-ENFORCEMENT** برای الزام approved match قبل از upsert رصدخانه.

---

## API Implementation Status (BOT-MATCHING-API)

تاریخ: 2026-05-16

### Endpointهای ساخته‌شده

#### 1) POST `/api/public/bot/market-matches/candidates/upsert`
- Auth: `Authorization: Bearer <BOT_API_KEY>` (همان سیستم Bot API موجود)
- Rate limit: همان `bot_check_rate_limit`
- Body (JSON):
```json
{
  "source_name": "torob",
  "source_product_url": "https://example.com/p/123",
  "source_product_id": "torob-123",
  "source_title": "...",
  "normalized_source_title": "...",   // optional
  "confidence_score": 72.5,              // optional, 0..100
  "notes": "..."                          // optional
}
```
- Response (201 created / 200 updated):
```json
{ "match_id": "uuid", "match_status": "pending", "created_or_updated": "created" }
```
- **هرگز `afrakala_product_id` برنمی‌گرداند.**
- **هرگز match را approved نمی‌کند.**
- RPC: `public.upsert_market_product_match_candidate(...)`

#### 2) POST `/api/public/bot/market-matches/resolve`
- Auth: همان Bot API key
- Body:
```json
{ "source_name": "torob", "source_product_url": "...", "source_product_id": "..." }
```
- Response (approved match یافت شد):
```json
{ "resolved": true, "match_id": "uuid", "afrakala_product_id": "uuid",
  "match_status": "approved", "confidence_score": 95 }
```
- Response (هیچ approved match نیست):
```json
{ "resolved": false, "reason": "approved_match_not_found" }
```
- **فقط برای match با status=approved مقدار `afrakala_product_id` برمی‌گرداند.**
- RPC: `public.resolve_market_product_match(...)`

### Error codes
`invalid_payload`, `invalid_source_name`, `missing_source_reference`,
`invalid_confidence_score`, `body_too_large`, `body_read_failed`,
`missing_key`, `invalid_key`, `inactive_key`, `expired_key`,
`rate_limit_per_minute`, `rate_limit_per_day`, `rate_limit_ip_failures`,
`approved_match_not_found`, `server_error`.

### قوانین امنیتی الزامی برای ربات
1. اگر `resolve` خروجی `resolved=false` داد، ربات **نباید** Bot API رصدخانه (`/api/public/bot/dynamic-tables/.../rows/upsert`) را صدا بزند.
2. ربات هرگز نباید سعی کند `afrakala_product_id` را خودش حدس بزند یا از روی نام محصول کشف کند.
3. ربات فقط مجاز است:
   - candidate جدید را به صف `pending` بفرستد،
   - یا `resolve` کند و در صورت approved، رصدخانه را با همان id update کند.

### چیزهایی که هنوز ساخته نشده‌اند
- UI صف بازبینی (BOT-MATCHING-UI).
- enforcement سرور-طرف روی Bot API رصدخانه (BOT-MATCHING-ENFORCEMENT) — فعلاً enforcement فقط در سطح protocol/قرارداد است و توسط ربات باید رعایت شود.
- اتصال واقعی به ترب/پورچیستا، scraper، crawler.
- auto-approve بر اساس re-seen / brand+model heuristics.
