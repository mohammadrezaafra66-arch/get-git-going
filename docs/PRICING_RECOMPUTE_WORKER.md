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
---

## PRICE-RT.4 — Manual UI trigger (admin/operator)

In addition to the cron-driven public webhook, an authorized operator can
manually drain the queue from the UI:

- Page: `/pricing/recompute-prices` → "پردازش صف قیمت‌ها" button in the queue
  health card.
- Server function: `triggerPricingRecomputeQueue` in
  `src/lib/pricing/process-queue.functions.ts`.
- Auth: requires a valid Supabase session (`requireSupabaseAuth` middleware).
- Authorization: caller must hold `admin`, `manager`, or `accountant` in
  `public.user_roles`. Other users cannot trigger the worker.
- Token safety: the UI **never** receives `PRICING_WORKER_TOKEN`. The token
  remains a server-only secret used solely by the public cron webhook.
- Sidebar badge: admin/manager/accountant see a small red badge on the
  recompute menu item when `failed_count > 0`, or a warning badge when the
  pending backlog is unusually high (>100 or oldest pending older than 10
  minutes). Normal users do not see any badge.

**Automatic cron remains the preferred path.** The manual UI trigger exists
only for emergency, retry after failures, post-maintenance, or when the
scheduled job is delayed.

---

## PRICE-RT.5 — Self-host scheduler (نهایی)

> ⚠️ دکمهٔ "پردازش صف قیمت‌ها" در UI (PRICE-RT.4) **حالت عادی کار نیست**.
> اگر cron/timer زیر روی سرور فعال نباشد، propagation قیمت **واقعاً realtime
> نیست** و اپراتور باید دستی trigger بزند. cron/timer را در production
> حتماً فعال کنید.

### گزینهٔ اصلی (Preferred): host cron / systemd timer

پیشنهاد قطعی برای self-host افراکالا:

- اجرای host cron یا systemd timer روی همان سرور self-host
- صدا زدن endpoint عمومی token-protected:
  `POST https://app.afrakala.ir/api/public/hooks/process-pricing-queue`
  با هدر `Authorization: Bearer $PRICING_WORKER_TOKEN`

دلایل:
- مستقل از Lovable Cloud کار می‌کند
- service-role هرگز اکسپوز نمی‌شود
- توکن فقط در `/etc/afrakala/app.env` (chmod 600) قرار دارد و در Git نمی‌رود
- لاگ‌ها روی فایل local قابل rotate و monitoring هستند

### تواتر و batch توصیه‌شده

| محیط | فاصله | batch_size |
|---|---|---|
| staging/تست | هر ۳۰ ثانیه | 25 |
| production کم‌بار | هر ۶۰ ثانیه | 50 |
| production پربار | هر ۳۰ ثانیه | 50 (سقف ۱۰۰) |

`batch_size` در body تعیین می‌شود (`{"batch_size": 50}`) و در سرور به بازهٔ
۱..۱۰۰ کلامپ می‌شود.

### الگوی امن host cron

اسکریپت آماده در `deploy/app/scripts/pricing-worker-cron.example.sh` قرار دارد
و موارد زیر را رعایت می‌کند:

- توکن از `/etc/afrakala/app.env` (chmod 600) خوانده می‌شود — هرگز در crontab
  ظاهر نمی‌شود
- خطاهای curl با `--max-time 20` محدود می‌شوند
- هر اجرا در `/var/log/afrakala/pricing-worker.log` با timestamp ثبت می‌شود
- توکن از طریق فایل header موقت پاس می‌شود تا روی command line دیده نشود
- اگر env یا token موجود نباشد با کد ۱ خارج می‌شود و دلیل را لاگ می‌کند

نصب:

```bash
sudo install -d -m 0750 /etc/afrakala
sudo install -d -m 0755 /var/log/afrakala
# سپس مقدار واقعی PRICING_WORKER_TOKEN را در /etc/afrakala/app.env قرار دهید
sudo chmod 600 /etc/afrakala/app.env

sudo install -m 0755 deploy/app/scripts/pricing-worker-cron.example.sh \
  /usr/local/bin/afrakala-pricing-worker.sh

# crontab سیستم (هر ~۳۰ ثانیه)
sudo crontab -e
# دو خط زیر را اضافه کنید:
#   * * * * * /usr/local/bin/afrakala-pricing-worker.sh
#   * * * * * sleep 30 ; /usr/local/bin/afrakala-pricing-worker.sh
```

cron استاندارد resolution کمتر از یک دقیقه ندارد؛ `sleep 30` ساده‌ترین راه
رسیدن به فاصلهٔ ۳۰ ثانیه است.

### گزینهٔ بهتر: systemd timer (در صورت وجود systemd)

سرویس‌فایل و timer-file در
`deploy/app/scripts/install-pricing-worker-cron.example.sh` (به‌صورت کامنت)
آمده. خلاصه:

- `afrakala-pricing-worker.service` نوع `oneshot` با
  `EnvironmentFile=/etc/afrakala/app.env` و `ExecStart` به اسکریپت بالا.
  hardening با `ProtectSystem=strict`, `ProtectHome=true`, `PrivateTmp=true`,
  `NoNewPrivileges=true`, `ReadWritePaths=/var/log/afrakala`.
- `afrakala-pricing-worker.timer` با `OnUnitActiveSec=30s` و `AccuracySec=5s`.

مزیت‌ها:
- پشتیبانی sub-minute بدون ترفند `sleep`
- لاگ از طریق `journalctl -u afrakala-pricing-worker`
- توکن فقط از طریق `EnvironmentFile` به فرایند می‌رسد و در `ps` دیده نمی‌شود

### گزینهٔ ۳ (اختیاری): pg_cron + pg_net

فقط اگر اپراتور به دلیل خاصی نمی‌خواهد cron/timer روی host بزند:

- محدودیت رسمی pg_cron: حداقل فاصلهٔ زمان‌بندی **یک دقیقه** است (sub-minute
  ممکن نیست؛ برای ۳۰s باید چند job با offset ثبت شود — پیچیدگی غیرضروری).
- SQL را **مستقیماً روی سرور DB** اجرا کنید، نه در migration کامیت‌شده در git،
  تا توکن واقعی هرگز در repo نیاید.
- مدیریت rotate توکن سخت‌تر است (نیاز به `cron.alter_job` یا unschedule/reschedule).

به همین دلیل برای افراکالا host cron / systemd timer **ترجیح قطعی** دارد.

### Monitoring و Alerting

پایش روزانه (اپراتور):

```bash
# آخرین اجراها
sudo tail -n 50 /var/log/afrakala/pricing-worker.log
sudo journalctl -u afrakala-pricing-worker.service -n 100 --no-pager

# سلامت صف از طریق DB (یا UI: /pricing/recompute-prices)
psql -h <host> -U postgres -c "
  select pending_count, processing_count, failed_count, oldest_pending_at, latest_error
  from public.v_pricing_recompute_queue_summary;
"
```

شرایط هشدار (alert manual یا dashboard):

| شرط | معنا | اقدام |
|---|---|---|
| `failed_count > 0` | یک یا چند job ناموفق | بررسی `latest_error`؛ rerun از UI یا reset دستی |
| `pending_count > 100` | backlog غیرعادی | بررسی فعال بودن cron؛ احتمالاً worker متوقف شده |
| `oldest_pending_at` قدیمی‌تر از ۱۰ دقیقه | scheduler متوقف یا کند است | چک `systemctl status` یا cron log |
| تکرار خطا در `pricing-worker.log` | endpoint ناموفق یا توکن نامعتبر | چک `PRICING_WORKER_TOKEN`، healthz، شبکه |

سایدبار افراکالا (PRICE-RT.4) هم برای admin/manager/accountant badge می‌زند:
قرمز برای `failed_count > 0`، زرد برای backlog یا oldest pending قدیمی.

### فرمان‌های کپی-پیست برای اپراتور

```bash
# 1) آماده‌سازی فایل‌های سیستمی
sudo install -d -m 0750 /etc/afrakala
sudo install -d -m 0755 /var/log/afrakala
sudo touch /etc/afrakala/app.env
sudo chmod 600 /etc/afrakala/app.env
# سپس PRICING_WORKER_TOKEN=<long-random> را داخل /etc/afrakala/app.env قرار دهید

# 2) نصب اسکریپت worker
sudo install -m 0755 deploy/app/scripts/pricing-worker-cron.example.sh \
  /usr/local/bin/afrakala-pricing-worker.sh

# 3) تست دستی (یک‌بار)
sudo /usr/local/bin/afrakala-pricing-worker.sh
sudo tail -n 5 /var/log/afrakala/pricing-worker.log

# 4) فعال کردن host cron
sudo crontab -e
#   * * * * * /usr/local/bin/afrakala-pricing-worker.sh
#   * * * * * sleep 30 ; /usr/local/bin/afrakala-pricing-worker.sh

# یا (پیشنهاد): فعال کردن systemd timer
#   فایل‌های .service و .timer از install-pricing-worker-cron.example.sh کپی شوند
sudo systemctl daemon-reload
sudo systemctl enable --now afrakala-pricing-worker.timer
systemctl list-timers | grep afrakala

# 5) مشاهدهٔ لاگ
sudo tail -f /var/log/afrakala/pricing-worker.log
sudo journalctl -u afrakala-pricing-worker.service -f

# 6) غیرفعال‌سازی موقت (مثلاً حین migration)
sudo systemctl stop afrakala-pricing-worker.timer
# یا برای cron: کامنت کردن دو خط در crontab

# 7) فعال‌سازی مجدد
sudo systemctl enable --now afrakala-pricing-worker.timer
```

### Environment Matrix

`PRICING_WORKER_TOKEN`:

- scope: **server-only**
- required: **yes** برای فعال بودن cron worker endpoint
- secret: **yes**
- هرگز با پیشوند `VITE_` تعریف نشود
- هرگز در client bundle نرود
- هرگز در Git commit نشود (placeholder در `.env.production.example` خالی است)
- محل واقعی فقط: `/etc/afrakala/app.env` با chmod 600

---

## PRICE-RT.6 — Validation, freshness map, and monitoring hardening

- چک‌لیست end-to-end staging (purchase price, currency rate, rule change,
  PDF/sale-list freshness): `docs/PRICING_RECOMPUTE_WORKER_VALIDATION.md`
- Logrotate template: `deploy/app/scripts/logrotate-pricing-worker.example`
  (daily, rotate 14, compress, missingok, notifempty, copytruncate).
- خلاصه freshness:
  - board زنده → realtime از طریق `useComputedPricesRealtime`.
  - ویرایشگر داخلی sale list → realtime + sync trigger روی
    `sale_list_items` از `product_computed_prices`.
  - صفحهٔ عمومی sale list → snapshot read-only؛ refresh/navigation
    قیمت تازه را می‌آورد (realtime نیست؛ عمدی).
  - PDF لیست فروش و پیش‌فاکتور → در client از داده‌های فعلی تولید
    می‌شوند، هیچ فایل PDF استاتیکی روی Storage نگه‌داری نمی‌شود.
- شرایط alert (پایش manual یا dashboard):
  - `failed_count > 0`
  - `pending_count > 100`
  - `oldest_pending_at` قدیمی‌تر از ۱۰ دقیقه
  - تکرار HTTP غیر-200 در `pricing-worker.log` (≥ ۳ بار در ۵ دقیقه)
  - نبود اجرای موفق worker در ۵ دقیقهٔ اخیر
- manual recompute (UI و RPC) **حذف نمی‌شود**؛ مسیر تعمیر/import/recovery
  باقی می‌ماند. cron/timer مسیر اصلی است.

