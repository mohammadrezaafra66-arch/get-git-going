## هدف
فعال‌سازی واقعی استخراج خودکار نرخ بازار و تأیید ثبت داده‌ها در دیتابیس.

## وضعیت فعلی (تأیید شده)
- ✅ Endpoint `/api/public/hooks/ingest-market-rates` روی production در دسترس است (publish موفق).
- ❌ `MARKET_RATES_AUTO_INGEST_ENABLED` با مقدار صحیح ست نشده — endpoint `disabled` پاسخ می‌دهد.
- ⚠️ Cron job (هر ۱۵ دقیقه) به URL `-dev` اشاره می‌کند نه production.
- ❌ هیچ ردیفی در `market_rate_ticks` و `market_rate_ingestion_runs` نیست.

## مراحل اجرا

**۱. به‌روزرسانی ۴ flag به مقدار `true`**
درخواست فرم امن برای ست مجدد این چهار secret با مقدار دقیقاً `true` (حروف کوچک):
- `MARKET_RATES_AUTO_INGEST_ENABLED`
- `MARKET_RATES_EXTERNAL_ENABLED`
- `BRSAPI_PUBLIC_ENABLED`
- `TGJU_PUBLIC_ENABLED`

**۲. سویچ URL در cron job به production**
به‌روزرسانی job `mr-auto-ingest-market-rates` تا به آدرس `https://project--6906e01f-9a81-48a3-a856-35cbd0c22eb2.lovable.app/api/public/hooks/ingest-market-rates` صدا بزند (بدون `-dev`).

**۳. تست دستی**
صدا زدن endpoint production با curl و بررسی پاسخ:
- باید `status: "completed"` یا `"failed"` (در صورت geo-block) باشد، نه `"disabled"`.
- باید `sources` شامل `BRSAPI_PUBLIC` و در صورت نیاز `TGJU_PUBLIC` باشد.

**۴. تأیید ثبت در دیتابیس**
```sql
SELECT count(*) FROM market_rate_ingestion_runs;
SELECT count(*) FROM market_rate_ticks;
SELECT * FROM market_rate_ingestion_runs ORDER BY started_at DESC LIMIT 5;
```

**۵. گزارش نتیجه به کاربر**
- اگر `inserted_count > 0`: داده‌ها در صفحه `/pricing/market-rates-workshop` قابل مشاهده‌اند، Realtime به‌روزرسانی می‌کند.
- اگر `inserted_count = 0` ولی `fetched_count > 0`: نگاشت سمبل‌ها (`market_rate_source_mappings`) ناقص است — نیاز به تنظیم mapping در UI.
- اگر `failed`: احتمالاً Cloudflare Worker از منابع ایرانی geo-block شده. در این صورت باید روی self-host با pg_cron از سرور خودت اجرا شود (فاز بعدی).

## تغییرات کد
هیچ تغییر کدی لازم نیست — فقط secret update + cron URL update.

## ریسک‌ها
- اگر `MARKET_RATES_NAVASAN_ENABLED` به‌اشتباه `true` شد، تلاش برای صدا زدن Navasan انجام می‌شود (نیاز به API key — احتمالاً fail می‌شود ولی core سالم می‌ماند).
- BrsApi/TGJU احتمالاً از Cloudflare Worker (خارج ایران) قابل دسترسی نباشند → پاسخ `failed` با reason صریح، اپ سالم.
