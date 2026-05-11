# Pricing Recompute Worker (PRICE-RT.2)

Worker که صف `pricing_recompute_queue` را به‌صورت خودکار خالی می‌کند و قیمت‌های
فروش محصولات را با استفاده از مسیر موجود `publishProductPrices` بازمحاسبه و
منتشر می‌کند. فرمول‌های قیمت‌گذاری تغییر نکرده‌اند. دکمه‌های دستی recompute
همچنان برای maintenance / import / recovery باقی هستند.

## Endpoint

- Path: `/api/public/hooks/process-pricing-queue`
- Method: `POST`
- Auth: `Authorization: Bearer ${PRICING_WORKER_TOKEN}`
- Body (اختیاری):
  ```json
  { "batch_size": 25, "max_attempts": 3 }
  ```
  - `batch_size`: ۱..۱۰۰ (پیش‌فرض ۲۵)
  - `max_attempts`: ۱..۱۰ (پیش‌فرض ۳)

پاسخ:
```json
{
  "ok": true,
  "picked": 12,
  "succeeded": 11,
  "failed": 1,
  "remaining_pending": 47,
  "duration_ms": 1834,
  "sample_errors": ["..."]
}
```

## امنیت

- توکن `PRICING_WORKER_TOKEN` فقط در محیط سرور (env) قرار دارد و **هرگز** prefix
  `VITE_` نمی‌گیرد و در bundle frontend نمی‌رود.
- بدون header صحیح، endpoint با ۴۰۱ پاسخ می‌دهد.
- claim ردیف‌ها از طریق تابع `claim_pricing_recompute_jobs` با
  `FOR UPDATE SKIP LOCKED` انجام می‌شود تا workerهای موازی یک ردیف را دوبار
  پردازش نکنند.
- این تابع `SECURITY DEFINER` است و اجرای آن از anon/authenticated revoke شده؛
  فقط service-role (داخل route) می‌تواند آن را صدا بزند.

## اجرای دستی توسط ادمین

```bash
curl -X POST https://app.afrakala.ir/api/public/hooks/process-pricing-queue \
  -H "Authorization: Bearer $PRICING_WORKER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"batch_size": 50}'
```

## زمان‌بندی (Scheduler)

### گزینه ۱ — host cron روی سرور self-host (پیشنهاد اصلی)

در crontab کاربر app روی سرور:

```cron
# هر ۳۰ ثانیه: صف بازمحاسبه قیمت را پردازش کن
* * * * * curl -fsS -X POST https://app.afrakala.ir/api/public/hooks/process-pricing-queue -H "Authorization: Bearer $PRICING_WORKER_TOKEN" >> /var/log/afrakala/pricing-worker.log 2>&1
* * * * * sleep 30 ; curl -fsS -X POST https://app.afrakala.ir/api/public/hooks/process-pricing-queue -H "Authorization: Bearer $PRICING_WORKER_TOKEN" >> /var/log/afrakala/pricing-worker.log 2>&1
```

`PRICING_WORKER_TOKEN` را از فایل env سرور (`/etc/afrakala/app.env`) export کنید
یا مستقیماً جایگزین `$PRICING_WORKER_TOKEN` در crontab کنید (فقط روی سرور،
نه در git).

### گزینه ۲ — pg_cron + pg_net در Supabase

اگر `pg_cron` و `pg_net` فعال هستند، این SQL را **مستقیماً روی DB سرور**
(نه در migration commit شده در git) اجرا کنید تا توکن واقعی هرگز در repo نیاید:

```sql
SELECT cron.schedule(
  'afrakala-pricing-worker-30s',
  '*/1 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://app.afrakala.ir/api/public/hooks/process-pricing-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer REPLACE_WITH_PRICING_WORKER_TOKEN'
    ),
    body := '{"batch_size": 50}'::jsonb
  );
  $$
);
```

برای تواتر زیر یک دقیقه، چند job با offset مختلف ثبت کنید یا از host cron
(گزینه ۱) استفاده کنید.

## Retry policy

- هر job در هر بار claim، `attempts` افزایش می‌یابد.
- پیش‌فرض `max_attempts = 3`؛ jobهایی با `attempts >= max_attempts` دیگر
  claim نمی‌شوند و در وضعیت `failed` می‌مانند.
- پیغام خطا در فیلد `error` ذخیره می‌شود.
- اپراتور می‌تواند با reset دستی (UPDATE روی `pricing_recompute_queue`)
  job را دوباره pending کند یا از مسیر دستی recompute در UI استفاده کند.

## Observability

لاگ‌های worker در stdout سرور:
```
[pricing-worker] run complete { picked, succeeded, failed, remaining_pending, duration_ms, sample_errors }
[pricing-worker] job failed { job_id, product_id, reason } <error>
```

هیچ secret یا داده‌ی خصوصی مشتری در لاگ نوشته نمی‌شود.