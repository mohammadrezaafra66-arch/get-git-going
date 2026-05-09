# پاسخ سوالات + پلن ربات اپدیت محصولات WordPress

## ۱) پایگاه داده کجاست؟ SQL یا Supabase؟

دیتابیس **PostgreSQL داخل Supabase** است (Lovable Cloud). SQL جداگانه‌ای نداریم. همه چیز در همین Postgres با RLS است.

## ۲) ساختار محصولات و «تگ‌ها»

محصولات در جدول `public.products` ذخیره می‌شوند. ستون‌های اصلی:
`id, sku, name, description, unit, category (text قدیمی), category_id, brand_id, product_type, base_currency, stock_status, status, color, capacity, model, primary_spec, technical_notes, is_active, dedup_key, created_at, updated_at`

«تگ/برچسب» در سامانه = **Label** (نه tag). جداول مرتبط:
- `product_labels` → `id, title, color, description, is_active, weight, visibility`
- `product_label_links` → `product_id, label_id` (رابطه many-to-many)
- `brands` (برند)، `categories` (دسته با naming_template و attributeهای داینامیک)
- قیمت محاسبه‌شده در `product_computed_prices` (per sale_price_type)

پس برای ربات ووردپرس، «برچسب مشخص» = یک `product_labels.title` معین؛ ربات باید محصولاتی که این label به آن‌ها لینک شده را بگیرد.

## ۳) آیا قبلاً چیزی ساخته‌ایم؟ بله

یک زیرساخت کامل **Bot API Keys** از قبل وجود دارد:

- صفحات UI:
  - `src/routes/_app.bot-api-keys.index.tsx` (مدیریت کلیدها)
  - `src/routes/_app.bot-api-keys.docs.tsx` (مستندات)
  - `src/routes/_app.bot-api-keys.playground.tsx` (تست)
  - `src/routes/_app.bot-api-keys.usage.tsx` (لاگ مصرف)
- جداول DB: `bot_api_keys`, `bot_api_key_table_access`, `bot_api_usage_logs`
- helper سرور: `src/server/bot-api.ts` (auth با Bearer، rate-limit per key/IP، نگاشت خطا به فارسی، usage log، RPCهای `bot_authenticate_key`, `bot_check_rate_limit`)
- endpoint عمومی موجود (فقط برای Dynamic Tables):
  - `GET /api/public/bot/dynamic-tables/:tableId/rows`
  - `PATCH /api/public/bot/dynamic-tables/:tableId/rows/:rowId`

**نکته مهم:** این endpointها فقط روی «جدول‌های داینامیک» کار می‌کنند، نه مستقیم روی `products`. پس برای ربات ووردپرس باید endpoint اختصاصی محصول اضافه شود — اما زیرساخت auth/rate-limit/log را دوباره نمی‌سازیم و از همین `bot-api.ts` استفاده می‌کنیم.

## پلن پیشنهادی (بدون دوباره‌کاری)

### فاز ۱ — endpointهای read-only محصولات (برای ربات WP)
دو route عمومی جدید زیر `src/routes/api.public.bot.products.*` با همان pattern موجود:

1. `GET /api/public/bot/products`
   - query: `label` (title یا id)، `label_in[]`, `category_id`, `brand_id`, `status`, `stock_status`, `updated_since` (ISO)، `page`, `page_size` (max 100)
   - response: `id, sku, name, brand, category, status, stock_status, labels[], price (rounded از product_computed_prices)، updated_at`
   - استفاده از `supabaseAdmin` + همان `authenticateBot` + `checkBotRateLimit` + `logBotUsage`

2. `GET /api/public/bot/products/:id`
   - جزئیات کامل + همه قیمت‌های محاسبه‌شده + لیبل‌ها + attributes داینامیک

### فاز ۲ — کنترل دسترسی
- یک رکورد سیستمی در `bot_api_key_table_access` با `table_id = special UUID 'products'` (یا یک ستون جدید `scope text`) برای هر کلید مشخص کند آیا اجازه دسترسی به products را دارد.
- **ترجیحاً ساده:** یک ستون boolean `can_read_products` به `bot_api_keys` اضافه شود (migration کوچک، RLS امن، reversible).

### فاز ۳ — صفحه «دسترسی محصولات» در UI
- در `_app.bot-api-keys.index.tsx` toggle «دسترسی به محصولات» اضافه شود.
- در `_app.bot-api-keys.docs.tsx` نمونه فراخوانی برای ربات WP اضافه شود (curl + سناریوی sync با label).

### فاز ۴ (اختیاری بعداً) — write-back
اگر ربات بخواهد چیزی را از سمت ووردپرس برگرداند (مثلاً sync_status)، `PATCH /api/public/bot/products/:id` با ستون‌های whitelist محدود.

## آنچه دست نمی‌خورد
- فرم/route ساخت محصول (`_app.products.new.tsx`، `ProductForm.tsx`) **هیچ تغییری** نمی‌کند.
- داده‌های موجود محصولات، مدل‌ها، لیبل‌ها، کلیدهای ربات حفظ می‌شوند.
- Auth / RLS / rate-limit موجود بدون تغییر بازاستفاده می‌شوند.

## سوالات قبل از کدنویسی
1. **فیلتر اصلی ربات ووردپرس روی چه چیزی است؟** فقط label، یا ترکیب label + category؟
2. **قیمت برگشتی** کدام `sale_price_type` باشد؟ (مثلاً «خرده‌فروشی نقدی») یا همه را برگردانیم و ربات خودش انتخاب کند؟
3. **کنترل دسترسی** ساده (یک toggle `can_read_products` روی هر کلید) کافی است یا می‌خواهی per-label هم محدود کنیم؟
4. **مرحله بعد write-back** را الان هم پیاده کنیم یا فعلاً فقط read؟
