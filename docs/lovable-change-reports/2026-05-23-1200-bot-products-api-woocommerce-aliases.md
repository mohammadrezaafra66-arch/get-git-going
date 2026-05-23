# Bot Products API — WooCommerce-friendly aliases (code-only)

## 1. Summary

افزودن alias‌های سازگار با WooCommerce و سایر بات‌های خارجی روی endpoint موجود `/api/public/bot/products` بدون هیچ تغییر در دیتابیس، schema، RLS، storage یا auth.

تغییرات:
- پذیرش هدر `x-bot-api-key: bk_...` در کنار `Authorization: Bearer bk_...` فعلی.
- پذیرش query param `updated_after` در کنار `updated_since` فعلی.
- افزودن فیلد `has_more` به بخش `pagination` پاسخ.
- هماهنگ‌سازی endpoint تک‌محصول با header جدید.

منطق احراز هویت، ACL برچسب، rate limit، usage logging و فیلدهای خروجی تغییر نکرده‌اند.

## 2. Changed Files

- `src/server/bot-api.ts` — افزودن تابع `extractBotKey(request)`.
- `src/routes/api.public.bot.products.ts` — استفاده از `extractBotKey`، خواندن `updated_after`، افزودن `has_more`.
- `src/routes/api.public.bot.products.$productId.ts` — استفاده از `extractBotKey`.

## 3. New Files

- `docs/lovable-change-reports/2026-05-23-1200-bot-products-api-woocommerce-aliases.md`

## 4. Deleted Files

هیچ.

## 5. Environment Variables

هیچ env جدیدی لازم نیست. هیچ secret اضافه یا تغییر نکرده است.

## 6. Database Changes

هیچ.

## 7. Schema Changes

هیچ. هیچ table/column/enum/index/constraint/function/trigger/RLS/policy تغییر نکرده است.

## 8. Storage Changes

هیچ.

## 9. Migration Required

خیر. هیچ migration جدیدی اضافه نشده و هیچ migration لازم نیست.

## 10. Local Update Steps

نوع آپدیت طبق `docs/LOCAL_UPDATE_PROTOCOL.md`: نوع A — فقط کد.

1. روی سرور Local کد جدید از `main` بعد از merge دریافت شود.
2. image وب دوباره build شود.
3. فقط سرویس web recreate شود.
4. migration اجرا نشود.
5. storage/auth/data export لازم نیست.

نمونه کلی:

```powershell
git pull
# rebuild web image with existing LAN build args
# recreate only web service
```

## 11. Backup Required

خیر. این تغییر فقط کد است. با این حال اگر طبق سیاست داخلی قبل از هر آپدیت Local بکاپ عمومی می‌گیرید، مانعی ندارد.

## 12. Export Required

خیر. هیچ export از Lovable، دیتابیس یا storage لازم نیست.

## 13. Risk Level

LOW

دلایل:
- تغییرات additive و backward-compatible هستند.
- header قدیمی `Authorization: Bearer` همچنان کار می‌کند.
- پارامتر قدیمی `updated_since` همچنان کار می‌کند.
- فیلد `has_more` فقط به پاسخ اضافه شده و ساختار قبلی را نمی‌شکند.
- هیچ دسترسی جدید دیتابیسی، RLS، policy، function یا migration اضافه نشده است.

## 14. Rollback Plan

برگرداندن سرویس web به image قبلی کافی است. هیچ rollback دیتابیسی لازم نیست.

## 15. Post-Update Tests

روی Lovable/GitHub branch و سپس Local تست شود:

```bash
# header قدیمی
curl -i -H "Authorization: Bearer bk_..." \
  "https://<host>/api/public/bot/products?page=1&page_size=2"

# header جدید
curl -i -H "x-bot-api-key: bk_..." \
  "https://<host>/api/public/bot/products?page=1&page_size=2"

# incremental sync جدید
curl -i -H "x-bot-api-key: bk_..." \
  "https://<host>/api/public/bot/products?updated_after=2026-05-01T00:00:00Z"

# endpoint تک‌محصول
curl -i -H "x-bot-api-key: bk_..." \
  "https://<host>/api/public/bot/products/<uuid>"
```

موارد مورد انتظار:
- `pagination.has_more` در پاسخ لیست وجود داشته باشد.
- بدون کلید: 401 `missing_key`.
- کلید بدون دسترسی برچسب: 403.
- rate limit فعلی بدون تغییر باقی بماند.
- رکورد usage log برای درخواست‌ها ثبت شود.

## بخش‌های فقط کد vs نیازمند انتقال

فقط کد:
- هر سه فایل source بالا.

نیازمند انتقال به Local:
- فقط کد بعد از merge به `main`، سپس rebuild/recreate سرویس web.

منتقل‌نشده:
- هیچ موردی باقی نمانده است.

Migration روی Local:
- لازم نیست.

Export از Lovable:
- لازم نیست.

Storage transfer:
- لازم نیست.

## Notes

این تغییر عمداً rate limit را از ۱۲۰ به ۶۰ کاهش نمی‌دهد، چون آن کار نیازمند تغییر تابع دیتابیس و migration جداگانه است.

این تغییر scope جدید `read_products` اضافه نمی‌کند و مدل موجود label-ACL را حفظ می‌کند.