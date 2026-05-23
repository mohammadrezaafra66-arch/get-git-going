
# Plan — Secure Product Export API برای WooCommerce

## یافته‌های مرحله بررسی (پاسخ به ۱۰ سؤال شما)

1. **`bot_api_keys` موجود است؟** بله. شامل `id, name, key_hash, key_prefix, is_active, allowed_table_ids, expires_at`.
2. **کلیدها hash شده‌اند؟** بله. فقط `key_hash` ذخیره می‌شود؛ raw key از مسیر RPC `bot_authenticate_key` با hash مقایسه می‌شود.
3. **Middleware برای کلید `bk_` موجود است؟** بله. `src/server/bot-api.ts` شامل `authenticateBot()`, `extractBearer()`, `checkBotRateLimit()`, `logBotUsage()`, `mapBotError()`.
4. **سیستم scope/permission موجود است؟** بله، اما **نه به‌صورت enum `read_products`**. دسترسی محصولات از طریق **ACL مبتنی بر برچسب (label)** اعمال می‌شود: جدول `bot_api_key_label_access` + RPC `bot_list_products_for_key` خود مجوز را بررسی می‌کند (خطاهای `forbidden_no_labels`, `forbidden_label`, `forbidden_product`).
5. **`bot_api_usage_logs` موجود است؟** بله، با ایندکس‌های لازم روی `api_key_id`, `ip`, `status_code`, `created_at`.
6. **`read_products` پشتیبانی می‌شود؟** عملاً بله، از طریق ACL برچسب (هر کلیدی که برچسب مجاز روی محصولات داشته باشد می‌تواند بخواند). یک scope جداگانه با نام `read_products` وجود ندارد.
7. **Endpoint مورد نظر موجود است؟** **بله، از قبل پیاده‌سازی شده** در `src/routes/api.public.bot.products.ts` (لیست) و `src/routes/api.public.bot.products.$productId.ts` (تک محصول). فیلدهای امن: `id, name, sku, status, stock_status, brand, category, model, color, capacity, updated_at` و قیمت‌ها از RPC برمی‌گردد.
8. **آیا فقط با کد قابل پیاده‌سازی است؟** بله، تغییرات درخواستی شما بدون migration ممکن است.
9. **آیا schema/RLS/storage/auth تغییر می‌کند؟** خیر در پلن پیشنهادی (همه چیز code-only). فقط اگر تصمیم بگیریم rate limit از ۱۲۰ به ۶۰ کاهش یابد یا scope enum مجزا اضافه شود، migration لازم می‌شود — که در پلن **پیشنهاد نمی‌کنم**.
10. **آیا برای Local نیاز به backup/export است؟** **خیر** در پلن پیشنهادی.

## شکاف بین درخواست شما و وضعیت فعلی

| نیاز | وضعیت فعلی | اقدام پیشنهادی |
|---|---|---|
| Endpoint `/api/public/bot/products` | ✅ موجود | بدون تغییر مسیر |
| Auth با bot key (hash شده) | ✅ موجود | بدون تغییر |
| هدر `x-bot-api-key: bk_xxx` | ❌ فقط `Authorization: Bearer` | **افزودن alias** در `extractBearer` |
| فیلدهای امن محصول | ✅ موجود (RPC) | بدون تغییر |
| Pagination | ✅ `page, page_size, total, total_pages` | **افزودن فیلد `has_more`** به پاسخ |
| Incremental sync `updated_after` | فعلاً `updated_since` | **افزودن alias `updated_after`** |
| Rate limit per key | ✅ ۱۲۰/دقیقه + ۵۰۰۰/روز (سرور) | **پیشنهاد: حفظ ۱۲۰**. تغییر به ۶۰ نیازمند migration روی تابع `bot_check_rate_limit` است. |
| Usage logging | ✅ موجود | بدون تغییر |
| عدم افشای service_role | ✅ `supabaseAdmin` فقط server-side | بدون تغییر |
| عدم افشای `/rest/v1/products` | ✅ Wooo فقط با bot key به این endpoint می‌زند | مستندسازی در گزارش |
| scope `read_products` | ACL برچسب | **حفظ مدل برچسب**. افزودن enum scope مجزا = migration که توصیه نمی‌کنم. |

## تغییرات پیشنهادی (Code-only — بدون migration)

### فایل‌های تغییر:

1. **`src/server/bot-api.ts`**
   - تابع جدید `extractBotKey(request)`: ابتدا `x-bot-api-key` را می‌خواند، اگر نبود `Authorization: Bearer` را.
   - بدون تغییر در `extractBearer` (سازگاری عقب‌رو).

2. **`src/routes/api.public.bot.products.ts`**
   - استفاده از `extractBotKey` به جای `extractBearer`.
   - پذیرش هر دو پارامتر `updated_after` و `updated_since` (اولویت با `updated_after`).
   - افزودن `has_more: page < total_pages` به پاسخ pagination.
   - بدون تغییر در منطق ACL یا فیلدهای خروجی.

3. **`src/routes/api.public.bot.products.$productId.ts`**
   - استفاده از `extractBotKey` (هماهنگی هدرها).

4. **`docs/lovable-change-reports/2026-05-23-HHMM-bot-products-api-woocommerce-aliases.md`** (جدید)
   - گزارش کامل با ۱۵ بخش الزامی پروتکل.
   - **بدون** نشان `🚨 DATABASE_EXPORT_OR_BACKUP_REQUIRED 🚨` (چون فقط کد است).

### فایل‌هایی که **تغییر نمی‌کنند**:
- `supabase/migrations/*` — هیچ migration جدیدی.
- جداول، توابع RPC، RLS، policy، auth، storage — هیچ تغییری.
- `bot_check_rate_limit` (DB function) — حفظ ۱۲۰/دقیقه.

## ریسک

**LOW** — تغییرات کاملاً additive و backward-compatible.

- هدر قدیمی `Authorization: Bearer` همچنان کار می‌کند.
- پارامتر قدیمی `updated_since` همچنان کار می‌کند.
- `has_more` فقط فیلد جدید در پاسخ است (مصرف‌کننده‌های موجود نشکست).

## Local Update Steps

نوع آپدیت: **A (فقط کد)** طبق `LOCAL_UPDATE_PROTOCOL.md`.

1. `git pull` روی سرور Local.
2. Build مجدد image: `docker build -t afrakala-app:lan ...` (با همان build-args موجود).
3. `docker compose ... up -d --force-recreate web`.
4. بدون migration، بدون backup، بدون storage export.

## Rollback Plan

برگرداندن به image قبلی web. هیچ تغییر دیتابیسی برای rollback لازم نیست.

## Post-Update Tests

روی هر دو محیط Lovable و Local:

```
# 1. هدر قدیمی همچنان کار می‌کند
curl -H "Authorization: Bearer bk_..." \
  "https://<host>/api/public/bot/products?page=1&page_size=2"

# 2. هدر جدید WooCommerce-friendly
curl -H "x-bot-api-key: bk_..." \
  "https://<host>/api/public/bot/products?page=1&page_size=2"

# 3. Incremental sync با نام جدید
curl -H "x-bot-api-key: bk_..." \
  "https://<host>/api/public/bot/products?updated_after=2026-05-01T00:00:00Z"

# 4. has_more در پاسخ موجود باشد
# 5. کلید بدون برچسب → 403 forbidden_no_labels
# 6. بدون کلید → 401 missing_key
# 7. ۱۲۱ درخواست پشت‌سرهم → 429 با Retry-After
# 8. لاگ در bot_api_usage_logs ثبت شود
```

## نکات تصمیم‌گیری برای تأیید شما

قبل از build، لطفاً درباره این دو مورد تصمیم بگیرید:

1. **Rate limit ۶۰/دقیقه به جای ۱۲۰؟** اگر بله → نیازمند migration کوچک روی تابع `bot_check_rate_limit` (ریسک LOW، بدون نیاز به backup چون فقط منطق تابع). در غیر این صورت، ۱۲۰/دقیقه فعلی حفظ می‌شود.

2. **افزودن scope enum `read_products` مجزا؟** پیشنهاد من **خیر** است؛ مدل label-ACL فعلی هم همان نقش را با granularity بیشتر ایفا می‌کند و افزودن enum یعنی migration + UI جدید برای مدیریت scope. اگر اصرار دارید، در فاز جداگانه پیشنهاد می‌شود.

اگر هر دو را با پیش‌فرض من (حفظ ۱۲۰ و حفظ label-ACL) تأیید کنید، پلن **۱۰۰٪ code-only** و بدون نیاز به backup/export است.
