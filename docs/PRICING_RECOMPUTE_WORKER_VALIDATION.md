# Pricing Recompute Worker — End-to-End Validation (PRICE-RT.6)

این سند چک‌لیست تأیید realtime pricing از تغییر نرخ ارز / قیمت خرید تا
به‌روزرسانی قیمت فروش، board زنده، sale list و PDF را برای **اپراتور
staging** مستند می‌کند. هیچ تغییر فرمول قیمت‌گذاری در این فاز انجام
نشده است. این فاز فقط validation + monitoring hardening است.

> ⚠️ این سناریوها فقط روی **staging** اجرا شوند. اجرا روی production
> فقط با backup تازه و در پنجرهٔ تعمیر مجاز است.

## 0. پیش‌نیازها

- worker scheduler (cron یا systemd timer) طبق `PRICING_RECOMPUTE_WORKER.md`
  روی staging فعال است، **یا** اپراتور قصد دارد دستی trigger کند.
- `PRICING_WORKER_TOKEN` در `/etc/afrakala/app.env` (chmod 600) ست شده.
- دسترسی psql به DB staging (read-only برای بررسی، نه کاربر سرویس).
- یک محصول تست (`product_id = :pid`) شناسایی شده که در حداقل یک
  sale list فعال هم هست.

## 1. سناریو A — تغییر قیمت خرید

هدف: تأیید این‌که UPDATE روی `purchase_prices` به‌صورت خودکار صف،
`product_computed_prices`، `product_sale_price_history`، board زنده و
sale_list_items را بدون فشردن دکمهٔ recompute به‌روز می‌کند.

1. ثبت قیمت قدیم:
   ```sql
   select sale_price_type, sale_price, computed_at
   from public.product_computed_prices
   where product_id = :pid
   order by sale_price_type;
   ```
2. تغییر قیمت خرید فعال:
   ```sql
   update public.purchase_prices
      set unit_price = unit_price * 1.05
    where product_id = :pid and is_active = true;
   ```
3. صف باید پر شود (انتظار ≤ ۲ ثانیه پس از UPDATE):
   ```sql
   select id, status, attempts, reason, enqueued_at
   from public.pricing_recompute_queue
   where product_id = :pid
   order by enqueued_at desc
   limit 5;
   ```
   انتظار: حداقل یک ردیف `status = 'pending'`.
4. اجرای worker (اگر cron منتظر است یا برای فوریت):
   ```bash
   sudo /usr/local/bin/afrakala-pricing-worker.sh
   sudo tail -n 20 /var/log/afrakala/pricing-worker.log
   ```
   یا از UI: `/pricing/recompute-prices` → دکمهٔ «پردازش صف قیمت‌ها»
   (فقط admin/manager/accountant).
5. صف باید `done` شود:
   ```sql
   select status, processed_at, error
   from public.pricing_recompute_queue
   where product_id = :pid
   order by enqueued_at desc
   limit 5;
   ```
6. قیمت محاسبه‌شده باید تغییر کرده باشد:
   ```sql
   select sale_price_type, sale_price, computed_at
   from public.product_computed_prices
   where product_id = :pid;
   ```
   مقایسه با گام ۱.
7. اگر قیمت تغییر کرده، تاریخچه باید نوشته شود:
   ```sql
   select sale_price_type, sale_price, recorded_at
   from public.product_sale_price_history
   where product_id = :pid
   order by recorded_at desc
   limit 5;
   ```
8. board زنده (`/pricing/aminhozoor-board` یا داشبورد) باید بدون refresh
   قیمت جدید را نشان دهد (subscription روی `product_computed_prices`
   از طریق `useComputedPricesRealtime`).
9. sale_list_items مرتبط باید sync شده باشد (trigger
   `trg_sync_sale_list_items_from_computed`):
   ```sql
   select sli.sale_list_id, sli.unit_price, sli.updated_at
   from public.sale_list_items sli
   where sli.product_id = :pid;
   ```
10. PDF تازه (preview/download از `/pricing/sale-lists/<listId>`) باید
    قیمت جدید را نشان دهد (PDF در سمت مشتری از داده‌های فعلی DOM/query
    تولید می‌شود — هیچ snapshot استاتیکی روی Storage ذخیره نمی‌شود).

## 2. سناریو B — تغییر نرخ ارز

هدف: تأیید این‌که UPDATE روی `currency_rates` تمام محصولاتی را که
آخرین قیمت خرید فعالشان به آن ارز است enqueue می‌کند.

1. ثبت snapshot قبلی برای ۲–۳ محصول نمونه (مشابه گام ۱ سناریو A).
2. تغییر نرخ ارز:
   ```sql
   update public.currency_rates
      set rate = rate * 1.02
    where currency_code = 'USD' and is_active = true;
   ```
3. بررسی صف:
   ```sql
   select count(*) filter (where status = 'pending') as pending,
          min(enqueued_at) as oldest
   from public.pricing_recompute_queue;
   ```
   انتظار: pending > 0 و شامل محصولات نمونه.
4. اجرای worker در چند batch (در صورت backlog بزرگ):
   ```bash
   for i in 1 2 3 4; do sudo /usr/local/bin/afrakala-pricing-worker.sh; done
   sudo tail -n 30 /var/log/afrakala/pricing-worker.log
   ```
5. تأیید تغییر `product_computed_prices` و انتشار realtime در board.
6. تأیید sale_list_items / PDF مشابه گام‌های ۹–۱۰ سناریو A.

## 3. سناریو C — تغییر pricing rule / shipping rule

فقط روی staging:

1. تغییر یک قانون قیمت‌گذاری یا shipping rule از UI.
2. تأیید enqueue conservative محصولات متاثر در `pricing_recompute_queue`.
3. اجرای worker با batchهای ۲۵–۵۰. مانیتور `picked/succeeded/failed` در
   `/var/log/afrakala/pricing-worker.log`.
4. در صورت باقی ماندن `failed_count > 0`، از داشبورد
   `/pricing/recompute-prices` بررسی `latest_error` و در صورت لزوم از
   مسیر **Manual recompute** برای repair استفاده شود (همچنان موجود است).

## 4. PDF / Sale-list freshness — تحلیل فعلی

| مسیر | منبع داده | Realtime؟ | تازه‌سازی پس از worker |
|---|---|---|---|
| board زنده (`useComputedPricesRealtime`) | subscription روی `product_computed_prices` | بله | خودکار |
| ویرایشگر داخلی sale list (`_app.pricing.sale-lists_.$listId`) | کوئری `sale_list_items` + sync trigger | بله (از طریق invalidation و sync trigger) | خودکار |
| صفحهٔ عمومی sale list (`public.sale-lists.$listId`) | snapshot `sale_list_items` (read-only) | خیر — هر navigation/refresh تازه می‌خواند | با reload صفحه |
| PDF لیست فروش (`src/lib/pdf/sale-list-pdf.ts`) | داده‌های فعلی صفحه/کوئری در client | لحظه‌ای تولید می‌شود | بله (هر بار تازه) |
| PDF پیش‌فاکتور (`src/lib/sales/quote-pdf.ts`) | داده‌های فعلی client | لحظه‌ای | بله |

- هیچ PDF به‌صورت فایل استاتیک روی Storage نگهداری نمی‌شود؛ همگی در
  لحظهٔ کلیک از داده‌های فعلی client تولید می‌شوند.
- صفحهٔ عمومی sale list realtime نیست (read-only برای مشتری). این
  رفتار عمدی است و در این فاز تغییری نمی‌کند: هر refresh/navigation
  جدید قیمت تازه را می‌آورد. در صورت نیاز به push realtime در نسخهٔ
  عمومی، در فاز بعدی پیشنهاد شود.
- trigger `trg_sync_sale_list_items_from_computed` هر AFTER INSERT/UPDATE
  روی `product_computed_prices` به‌صورت خودکار `sale_list_items` را
  به‌روز می‌کند، پس PDF و ویرایشگر همیشه از مقدار جدید استفاده می‌کنند.

## 5. Monitoring & Alerting hardening

### Logrotate

الگو در `deploy/app/scripts/logrotate-pricing-worker.example`:

- daily
- rotate 14 (دو هفته)
- compress (با delaycompress)
- missingok, notifempty, copytruncate

نصب:

```bash
sudo install -m 0644 deploy/app/scripts/logrotate-pricing-worker.example \
     /etc/logrotate.d/afrakala-pricing-worker
sudo logrotate --debug /etc/logrotate.d/afrakala-pricing-worker
```

### Alerting (manual یا uptime-kuma / cron-checker)

در داشبورد یا اسکریپت پایش:

| سیگنال | منبع | شرط alert |
|---|---|---|
| `failed_count > 0` | `v_pricing_recompute_queue_summary` | هر مقدار غیرصفر |
| `pending_count > 100` | همان view | backlog غیرعادی |
| `oldest_pending_at` | همان view | قدیمی‌تر از ۱۰ دقیقه |
| تکرار HTTP غیر-200 | `/var/log/afrakala/pricing-worker.log` | ≥ ۳ بار در ۵ دقیقه |
| نبود اجرای موفق | همان log | هیچ خط `succeeded` در ۵ دقیقهٔ اخیر |

اسکریپت ساده برای check آخرین اجرا:

```bash
if ! grep -q "$(date -u +%Y-%m-%dT%H:%M)" /var/log/afrakala/pricing-worker.log; then
  echo "[ALERT] no pricing-worker entry in current minute"
fi
```

## 6. چک‌لیست کپی-پیست staging

```text
[ ] محصول تست شناسایی شد (product_id, sale_list_id)
[ ] قیمت قبلی product_computed_prices ثبت شد
[ ] purchase_prices به‌روز شد
[ ] pricing_recompute_queue ردیف pending ساخت
[ ] worker اجرا شد (cron یا UI button یا اسکریپت)
[ ] queue ردیف done شد، error خالی است
[ ] product_computed_prices تغییر کرد
[ ] product_sale_price_history ردیف جدید گرفت
[ ] board زنده بدون refresh قیمت جدید را نشان داد
[ ] sale_list_items.unit_price برای محصول تست به‌روز شد
[ ] PDF لیست فروش قیمت جدید را نشان داد
[ ] لاگ /var/log/afrakala/pricing-worker.log سالم است (HTTP 200)
[ ] failed_count = 0 و pending_count = 0
[ ] تغییرات تست در staging rollback/cleanup شد
```

## 7. خروج از validation

- اگر هر مرحله شکست خورد: اجرا را متوقف کن، state صف و آخرین خطا را
  در incident note ثبت کن، فاز بعدی (PRICE-RT.7) را برای تحلیل علت
  باز کن. تغییر فرمول `calculateSalePrice` یا `publishProductPrices`
  در این فاز ممنوع است.
- manual recompute همچنان به‌عنوان مسیر تعمیر باقی است و **حذف
  نمی‌شود**.