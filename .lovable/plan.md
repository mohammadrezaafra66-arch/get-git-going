## DT.1 — Upgrade Dynamic Tables for Torob/Purchista extracted data

این plan ماژول موجود `dynamic_tables` و `Bot API` را گسترش می‌دهد. هیچ ماژول، grid، یا auth موازی ساخته نمی‌شود. تمام محاسبات قیمت server-side و از داده‌های موجود (`purchase_prices`, `product_computed_prices`) خوانده می‌شود.

### آنچه از قبل وجود دارد و دست نخواهد خورد
- جداول: `dynamic_tables`, `dynamic_table_columns`, `dynamic_table_rows`, `dynamic_table_cells`, `bot_api_keys`, `bot_api_usage_logs`.
- توابع: `query_dynamic_table_rows`, `create_dynamic_table_row`, `update_dynamic_table_cell`, `bot_query_table_rows`, `bot_create_table_row`, `bot_update_table_row`.
- مسیرها: `_app.data-tables.{index,new,$tableId}.tsx`, دو route فعلی Bot API برای rows.
- توابع قیمت: `purchase_prices` (آخرین رکورد فعال per product برای قیمت خرید تومان)، `product_computed_prices` (`rounded_sale_price` per `sale_price_type_id` برای min فروش).

---

### بخش ۱ — Migration ها

#### 1A. متادیتای ستون‌های computed (backward compatible)
به `dynamic_table_columns` اضافه می‌شود:
```
is_computed boolean NOT NULL DEFAULT false
formula_key text NULL
formula_config jsonb NOT NULL DEFAULT '{}'
```
CHECK constraint: `formula_key` فقط از whitelist زیر:
`latest_purchase_price_toman`, `min_sale_price`, `latest_batch_average_price`, `price_gap_to_market_avg`, `price_gap_percent_to_market_avg`.

ستون‌های موجود تأثیر نمی‌گیرند (`is_computed=false` پیش‌فرض).

#### 1B. Seed idempotent جدول Torob/Purchista
در یک DO block:
- اگر `slug='torob-purchista-extracted-data'` نبود، `INSERT` شود (نام: «دیتای استخراج شده ترب - پورچیستا»).
- برای هر یک از ۲۰ ستون (۱۵ معمولی + ۵ computed) با `INSERT ... ON CONFLICT (table_id, column_key) DO NOTHING`.
- ستون‌های ۱–۱۵ همان `data_type` و فلگ‌های مشخص‌شده در درخواست.
- ستون‌های ۱۶–۲۰ از نوع `number` با `is_computed=true`, `is_editable_by_bot=false`, `formula_key` متناظر.

#### 1C. Indexes برای performance computed/upsert
- partial UNIQUE برای کلید یکتایی upsert روی cells:
  چون cells کلید/مقدار است، unique جداگانه نیست. به جایش UNIQUE expression روی یک view مادی نمی‌سازیم — به جایش index کمکی روی `value_text` تطابق با `column_id` برای lookup سریع `external_product_id` / `extraction_batch_id` / `match_key` / `afrakala_product_id`:
  ```
  CREATE INDEX IF NOT EXISTS idx_cells_text_lookup
    ON dynamic_table_cells (column_id, value_text)
    WHERE value_text IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_cells_datetime
    ON dynamic_table_cells (column_id, value_datetime DESC)
    WHERE value_datetime IS NOT NULL;
  ```

#### 1D. توابع server-side محاسبه فرمول
یک تابع کمکی `_dyn_compute_row_values(p_table_id, p_row_id, p_base jsonb) RETURNS jsonb` که برای هر ستون با `is_computed=true` بر اساس `formula_key` و مقادیر base محاسبه و در jsonb درج می‌کند:
- `latest_purchase_price_toman`: `SELECT purchase_price FROM purchase_prices WHERE product_id = afrakala_product_id::uuid AND is_active ORDER BY effective_at DESC LIMIT 1` (currency toman).
- `min_sale_price`: `SELECT MIN(rounded_sale_price) FROM product_computed_prices WHERE product_id = afrakala_product_id::uuid`.
- `latest_batch_average_price`: زیرپرس‌و‌جو روی همین جدول dynamic — برای rowهای فعال هم‌گروه (group by `afrakala_product_id` اگر set است؛ وگرنه `match_key`)، آخرین `extraction_batch_id` از روی بیشینه `extracted_at`، سپس `AVG(extracted_price_toman)` با حذف null/۰.
- `price_gap_to_market_avg` و `price_gap_percent_to_market_avg`: روی دو مقدار قبلی.

#### 1E. RPC جدید: `query_dynamic_table_rows_v2`
نسخه موازی (بدون تغییر در v1) که خروجی `out_values` را با `_dyn_compute_row_values` تکمیل می‌کند. در فاز فعلی فقط جدول Torob/Purchista از v2 استفاده می‌کند (UI با شرط `slug` تشخیص می‌دهد). امضای فعلی v1 دست‌نخورده می‌ماند تا صفحه عمومی data-tables نشکند.

#### 1F. RPC جدید: `bot_upsert_table_row(p_key_id, p_table_id, p_unique_by text[], p_values jsonb) RETURNS (mode text, row_id uuid, row_number bigint, values jsonb)`
- همان gateهای امنیتی `bot_create_table_row`: `SECURITY DEFINER`, `SET search_path=public`, `REVOKE FROM PUBLIC`, `GRANT EXECUTE TO service_role`.
- بررسی `is_editable_by_bot` برای هر کلید در `p_values` و رد ستون‌های computed.
- پیدا کردن سطر موجود: برای هر کلید در `p_unique_by` که مقدارش در `p_values` آمده، EXISTS با `dynamic_table_cells.value_text = ...` (نوع text بهترین گزینه برای source/batch/external_id/match_key است). فقط ستون‌های موجود و text-compatible مجاز برای unique_by.
- اگر سطر هست → فراخوانی منطق update مشابه `bot_update_table_row` و `mode='updated'`. وگرنه → فراخوانی منطق create مشابه `bot_create_table_row` و `mode='created'`.
- خطاهای فارسی mapping در `mapBotError`: `unknown_column`, `column_not_allowed`, `required_column_missing`, `invalid_unique_by`, `duplicate_match`.

---

### بخش ۲ — Bot API

#### 2A. Route جدید: `src/routes/api.public.bot.dynamic-tables.$tableId.rows.upsert.ts`
- متد فقط `POST`. body همان شکل درخواست (`unique_by` + `values`).
- استفاده از همان helperهای موجود: `authenticateBot`, `checkBotRateLimit`, `logBotUsage`, `isUuid`, `extractBearer`, `MAX_BODY_BYTES=64KB`, `mapBotError`.
- فراخوانی `bot_upsert_table_row` و بازگشت `{ mode, row_id, row_number, values }` با `201` در حالت created و `200` در updated.

#### 2B. Route جدید (اختیاری اما توصیه شده): `src/routes/api.public.bot.dynamic-tables.by-slug.$slug.ts`
- `GET` که `slug` را به `tableId` تبدیل کرده و metadata کوچک (id, name, columns: key/label/data_type/is_editable_by_bot/is_computed) برمی‌گرداند.
- ربات بدون دانستن UUID می‌تواند tableId را resolve کند، سپس از endpoint های موجود استفاده کند.

#### 2C. هیچ تغییری در `rows.ts` و `rows.$rowId.ts` نیست
GET/POST/PATCH فعلی دست‌نخورده می‌ماند.

---

### بخش ۳ — Frontend

#### 3A. `src/lib/data-tables/constants.ts`
- اضافه شدن:
  ```
  export const ALLOWED_FORMULA_KEYS = [
    "latest_purchase_price_toman","min_sale_price",
    "latest_batch_average_price","price_gap_to_market_avg",
    "price_gap_percent_to_market_avg",
  ] as const;
  export const FORMULA_LABELS: Record<...,string>;
  export const TOROB_PURCHISTA_SLUG = "torob-purchista-extracted-data";
  ```

#### 3B. `src/routes/_app.data-tables.$tableId.tsx`
- اگر `slug === TOROB_PURCHISTA_SLUG`: از `query_dynamic_table_rows_v2` استفاده شود و `refetchInterval: 7000`. در غیر این صورت رفتار فعلی بدون تغییر.
- اضافه شدن badge «فرمولی» (در کنار badge «ویرایش‌پذیر ربات» موجود) برای ستون‌هایی با `is_computed=true`.
- سلول‌های computed → read-only (در inline edit و keyboard nav رد می‌شود).
- پنل اطلاعات کوچک بالای جدول فقط برای این slug: «آخرین refresh: HH:mm:ss»، «تعداد ردیف‌ها»، «آخرین batch: ...»، توضیح فارسی برای computedها.
- CSV export، search، filters، virtualized grid، RBAC بدون تغییر.

#### 3C. `src/routes/_app.data-tables.new.tsx`
- بخش create column: گزینه «ستون فرمولی» فقط برای admin/manager (با `useUserRoles`).
- اگر فعال شد، `formula_key` از select با لیست `ALLOWED_FORMULA_KEYS`. مقادیر `data_type=number`, `is_editable_by_bot=false` بصورت forced.

#### 3D. Realtime/Polling
- در فاز فعلی فقط `refetchInterval` برای slug Torob/Purchista. در کد و mutation handlers `invalidateQueries(["dynamic-table-rows-v2", tableId])` ست می‌شود. در docs/inline comment کلمه «near-real-time» استفاده می‌شود نه «realtime».

---

### بخش ۴ — Docs

`src/routes/_app.bot-api-keys.docs.tsx`:
- اضافه شدن بخش «Upsert ردیف استخراج‌شده ترب/پورچیستا» با نمونه curl.
- نمونه‌های خطا: `invalid_unique_by`, `duplicate_match`, `column_not_allowed` برای ستون‌های computed.
- placeholder `Authorization: Bearer <BOT_API_KEY>` بدون مقدار واقعی.

---

### بخش ۵ — Acceptance & Rollback

**تست‌های دستی browser:**
1. صفحه `/data-tables` → جدول «دیتای استخراج شده ترب - پورچیستا» visible.
2. باز کردن جدول → ستون‌های computed با badge «فرمولی» و read-only.
3. curl upsert با `source=torob, extraction_batch_id, external_product_id, product_title_raw, extracted_price_toman` → 201.
4. تکرار همان curl با قیمت متفاوت → 200، همان `row_id`، بدون duplicate.
5. ست کردن `afrakala_product_id` معتبر → پس از ≤۱۰s، ۵ ستون قیمتی پر می‌شوند.
6. CSV export + search همچنان کار می‌کند.
7. یک جدول dynamic دیگر باز کنید → رفتار قبلی بدون تغییر.

**Rollback:**
- DROP FUNCTION `bot_upsert_table_row`, `query_dynamic_table_rows_v2`, `_dyn_compute_row_values`.
- DROP INDEXes جدید.
- `ALTER TABLE dynamic_table_columns DROP COLUMN is_computed, formula_key, formula_config`.
- حذف routeهای جدید TanStack.
- جدول/ستون‌های seed را می‌توان نگه داشت یا با `DELETE FROM dynamic_tables WHERE slug='torob-purchista-extracted-data'` پاک کرد (CASCADE).

**Self-host:**
- بدون CDN، بدون secret جدید، بدون edge function، بدون تغییر Caddy/SSL.
- همه چیز Postgres + TanStack server routes موجود.
- RLS فعلی روی dynamic_tables و bot_api_keys حفظ می‌شود؛ توابع جدید همگی `SECURITY DEFINER` با `search_path=public` و `REVOKE FROM PUBLIC`.
