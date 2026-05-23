# Bot Products API — WooCommerce-friendly aliases (code-only)

## 1. Summary

افزودن alias‌های سازگار با WooCommerce و سایر بات‌های خارجی روی endpoint موجود `/api/public/bot/products` بدون هیچ تغییر در دیتابیس، schema، RLS، storage یا auth. تغییرات کاملاً additive و backward-compatible هستند.

سه تغییر کوچک:
- پذیرش هدر `x-bot-api-key: bk_...` در کنار `Authorization: Bearer bk_...` فعلی.
- پذیرش query param `updated_after` در کنار `updated_since` فعلی.
- افزودن فیلد `has_more` به بخش `pagination` پاسخ.

منطق احراز هویت، ACL برچسب، rate limit، usage logging و فیلدهای خروجی **هیچ تغییری** نکرده‌اند.

## 2. Changed Files

- `src/server/bot-api.ts` — افزودن تابع کمکی `extractBotKey(request)` (هدر جدید را اول می‌خواند، سپس `Authorization: Bearer`).
- `src/routes/api.public.bot.products.ts` — استفاده از `extractBotKey`، خواندن `updated_after`، افزودن `has_more` به pagination.
- `src/routes/api.public.bot.products.$productId.ts` — استفاده از `extractBotKey` برای سازگاری هدر در endpoint تک‌محصول.

## 3. New Files

- `docs/lovable-change-reports/2026-05-23-1200-bot-products-api-woocommerce-aliases.md` (همین گزارش).

## 4. Deleted Files

هیچ.

## 5. Environment Variables

هیچ env جدیدی لازم نیست. هیچ secret اضافه یا تغییر نکرده. `SUPABASE_SERVICE_ROLE_KEY` مثل قبل فقط در سمت سرور (`supabaseAdmin`) استفاده می‌شود.

## 6. Database Changes

هیچ.

## 7. Schema Changes

هیچ. هیچ table/column/enum/index/constraint/function/trigger/RLS/policy تغییر نکرده است.

## 8. Storage Changes

هیچ.

## 9. Migration Required

**خیر.** هیچ فایل migration جدیدی اضافه نشده.

## 10. Local Update Steps

نوع آپدیت طبق `docs/LOCAL_UPDATE_PROTOCOL.md`: **نوع A — فقط کد**.

1. روی سرور Local: `git pull` (یا دریافت ZIP جدید از GitHub).
2. Build مجدد image وب:
   ```powershell
   cd C:\afrakala-source\get-git-going-main
   docker build -t afrakala-app:lan `
     --build-arg VITE_SUPABASE_URL=http://192.168.170.10:8000 `
     --build-arg VITE_SUPABASE_PUBLISHABLE_KEY="<ANON_KEY>" `
     --build-arg VITE_SUPABASE_PROJECT_ID=afrakala-lan .
   ```
3. Recreate سرویس web:
   ```powershell
   cd C:\afrakala-lan\afrakala-lan\get-git-going
   docker compose -f .\deploy\lan\docker-compose.yml --env-file .\deploy\lan\.env.lan up -d --force-recreate web
   ```
4. **بدون** اجرای migration، **بدون** backup اجباری، **بدون** export از Lovable.

## 11. Backup Required

**خیر** — توصیه‌شده ولی اجباری نیست. این تغییر فقط کد است.

## 12. Export Required

**خیر** — هیچ schema/data/storage export از Lovable لازم نیست.

## 13. Risk Level

**LOW**

دلایل:
- تغییرات additive و backward-compatible (هدر و پارامتر قدیمی همچنان کار می‌کنند).
- هیچ سطح دسترسی جدیدی باز نشده؛ همان مسیر RPC امن (`bot_authenticate_key`, `bot_list_products_for_key`, `bot_get_product_for_key`) با همان ACL برچسب استفاده می‌شود.
- service_role هرگز به کلاینت نمی‌رود.
- WooCommerce هرگز مستقیماً به `/rest/v1/products` Supabase نمی‌زند — فقط از این endpoint مدیریت‌شده استفاده می‌کند.

## 14. Rollback Plan

برگرداندن سرویس web به image قبلی:

```powershell
docker tag afrakala-app:lan-previous afrakala-app:lan
docker compose -f .\deploy\lan\docker-compose.yml --env-file .\deploy\lan\.env.lan up -d --force-recreate web
```

هیچ rollback دیتابیسی لازم نیست چون هیچ migration یا تغییر داده‌ای انجام نشده.

## 15. Post-Update Tests

روی Lovable (Preview/Published) و سپس روی Local انجام شود. `<host>` را با آدرس متناسب جایگزین کنید:

```bash
# 1. هدر قدیمی (Authorization Bearer) همچنان کار می‌کند
curl -i -H "Authorization: Bearer bk_..." \
  "https://<host>/api/public/bot/products?page=1&page_size=2"

# 2. هدر جدید WooCommerce-friendly
curl -i -H "x-bot-api-key: bk_..." \
  "https://<host>/api/public/bot/products?page=1&page_size=2"

# 3. Incremental sync با نام جدید
curl -s -H "x-bot-api-key: bk_..." \
  "https://<host>/api/public/bot/products?updated_after=2026-05-01T00:00:00Z" | jq '.pagination'

# 4. Incremental sync با نام قدیمی (سازگاری عقب‌رو)
curl -s -H "x-bot-api-key: bk_..." \
  "https://<host>/api/public/bot/products?updated_since=2026-05-01T00:00:00Z" | jq '.pagination'

# 5. حضور فیلد has_more در pagination — باید boolean باشد
# 6. کلید بدون برچسب → 403 forbidden_no_labels
# 7. بدون کلید → 401 missing_key
# 8. ۱۲۱+ درخواست در یک دقیقه → 429 با هدر Retry-After
# 9. ثبت رکورد در bot_api_usage_logs برای هر درخواست (موفق و ناموفق)
# 10. endpoint تک‌محصول هم هدر جدید را می‌پذیرد:
curl -i -H "x-bot-api-key: bk_..." \
  "https://<host>/api/public/bot/products/<uuid>"
```

## بخش‌های فقط کد vs نیازمند انتقال

- **فقط کد:** هر سه فایل source. تنها با build مجدد image و recreate سرویس web فعال می‌شوند.
- **نیازمند انتقال به Local:** فقط همین فایل‌های کد از طریق `git pull` + rebuild + recreate. هیچ migration، seed، storage یا auth config نیازی به انتقال ندارد.
- **منتقل‌نشده:** هیچ. این تغییر اقلام معلق برای Local ندارد.
- **migration روی Local:** خیر، لازم نیست.
- **export از Lovable:** خیر، لازم نیست.
- **انتقال storage:** خیر، لازم نیست.

## یادداشت تصمیمات معماری

1. **Rate limit ۱۲۰/دقیقه (نه ۶۰)**: تابع `bot_check_rate_limit` فعلی روی ۱۲۰/min و ۵۰۰۰/day تنظیم شده. کاهش به ۶۰ نیازمند migration روی این تابع DB است که در این تغییر انجام **نشد**. در صورت نیاز، در یک تغییر مجزا اعمال خواهد شد.

2. **عدم افزودن enum مجزای `read_products`**: مدل فعلی دسترسی محصولات از طریق ACL برچسب (`bot_api_key_label_access`) اعمال می‌شود که granularity بالاتر و انعطاف بیشتری از scope ساده می‌دهد. افزودن scope enum نیازمند migration + UI جدید است و به‌عمد در این تغییر انجام نشد.