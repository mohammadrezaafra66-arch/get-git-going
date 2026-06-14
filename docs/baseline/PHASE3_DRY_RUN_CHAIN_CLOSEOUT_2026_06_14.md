# بستن زنجیره Dry-Run فاز ۳ — 2026-06-14

## 1. هدف

هدف این سند ثبت بسته‌شدن زنجیره‌ی dry-run فاز ۳ در وضعیت کنترل‌شده، غیرزنده و worker-only است.

این closeout فقط وضعیت مستندشده‌ی زنجیره‌ی فعلی را تثبیت می‌کند و هیچ مجوزی برای اجرای live، درج واقعی در دیتابیس، scheduler، cron، daemon، writeback تجاری یا تماس شبکه‌ای صادر نمی‌کند.

## 2. وضعیت فعلی Baseline

Baseline فعلی برای فاز ۳ در وضعیت زیر پذیرفته می‌شود:

- `zero-network`
- `non-live`
- `worker-only`
- `dry-run summary only`
- `no scheduler`
- `no real database write`
- `no business writeback`

این وضعیت یعنی خروجی قابل قبول فقط summary شواهد dry-run است و هیچ داده‌ای نباید به جدول‌های محصول، قیمت، مشتری، تامین‌کننده، sales-list، CRM یا هر جدول تجاری دیگر نوشته شود.

## 3. زنجیره فعلی

زنجیره‌ی فعلی به شکل زیر بسته می‌شود:

```text
JobRunner
→ readonly pipeline
→ persisted_output
→ bridge boundary
→ evidence dry-run summary
```

این زنجیره فقط مسیر خواندنی، ذخیره‌ی خروجی کنترل‌شده و مرز bridge را برای تولید evidence dry-run summary پوشش می‌دهد.

## 4. این Closeout چه چیزی را پوشش می‌دهد؟

این closeout موارد زیر را پوشش می‌دهد:

- ثبت اینکه JobRunner می‌تواند زنجیره‌ی readonly را تا summary شواهد dry-run دنبال کند.
- تثبیت مرز `persisted_output` به عنوان خروجی کنترل‌شده‌ی worker.
- تثبیت `bridge boundary` به عنوان مرز غیرزنده و بدون درج واقعی.
- ثبت اینکه evidence تولیدشده فقط dry-run summary است.
- ثبت اینکه مسیر فعلی بدون network، بدون browser automation، بدون scheduler و بدون writeback تجاری باقی می‌ماند.

## 5. چه چیزهایی همچنان قفل می‌مانند؟

موارد زیر همچنان قفل هستند و این closeout آن‌ها را آزاد نمی‌کند:

- درج واقعی در دیتابیس.
- هر نوع write به جدول‌های تجاری.
- نوشتن در جدول‌های محصول، قیمت، مشتری، تامین‌کننده، sales-list، CRM یا داده‌های مشابه.
- scheduler، cron، daemon یا اجرای پس‌زمینه‌ی دائمی.
- تماس شبکه‌ای یا اتصال به منبع خارجی.
- browser automation.
- migration جدید یا تغییر schema.
- API route جدید.
- تغییر UI یا مسیر runtime.
- استفاده از secret، token، cookie، credential یا مقدار runtime واقعی.

## 6. دستورات Verification

دستورات verification مجاز برای این baseline:

```bash
cd automation/worker-runtime
python -m pytest -q tests/test_evidence_db_bridge.py
python -m pytest -q tests/test_evidence_store_path.py
python -m pytest -q tests/test_phase3_readonly_chain.py
```

این دستورات فقط مسیر تست local/worker را بررسی می‌کنند و نباید به اجرای live یا نوشتن واقعی در دیتابیس تبدیل شوند.

## 7. معیارهای پذیرش

این closeout فقط زمانی پذیرفته است که همه‌ی معیارهای زیر برقرار باشند:

- PR فقط شامل مستندات باشد.
- هیچ runtime code تغییر نکرده باشد.
- هیچ migration اضافه نشده باشد.
- هیچ UI، API route، scheduler، cron یا daemon اضافه نشده باشد.
- هیچ real database insert انجام نشده باشد.
- هیچ business writeback انجام نشده باشد.
- هیچ تماس شبکه‌ای یا browser automation اضافه نشده باشد.
- خروجی زنجیره فقط evidence dry-run summary باشد.
- وضعیت پذیرفته‌شده‌ی `zero-network`، `non-live`، `worker-only` و `dry-run summary only` حفظ شده باشد.

## 8. قدم مجاز بعدی

قدم مجاز بعدی:

```text
TPC-3-002 — Controlled Local DB Insert Bridge Packet
```

این قدم فقط می‌تواند به صورت packet کنترل‌شده، مستند، review شده و جداگانه مطرح شود.

## 9. شرایط توقف

کار باید متوقف شود اگر هرکدام از موارد زیر لازم یا مشاهده شود:

- نیاز به secret، token، credential، cookie یا مقدار runtime واقعی.
- نیاز به تماس شبکه‌ای یا منبع خارجی.
- نیاز به scheduler، cron، daemon یا اجرای دائمی.
- نیاز به migration یا تغییر schema.
- نیاز به نوشتن واقعی در دیتابیس.
- نیاز به writeback در جدول‌های تجاری.
- ابهام درباره‌ی RLS/RBAC، audit log یا مرزهای self-host.
- تبدیل dry-run summary به اجرای live یا درج واقعی.

در این شرایط، ادامه‌ی کار باید فقط از طریق سند/packet بعدی و review جداگانه انجام شود.

## 10. تصمیم نهایی

این closeout زنجیره‌ی dry-run فاز ۳ را در وضعیت غیرزنده و worker-only می‌بندد.

این closeout مجوز درج واقعی در دیتابیس را آزاد نمی‌کند.

درج واقعی در دیتابیس تا زمانی که `TPC-3-002 — Controlled Local DB Insert Bridge Packet` نوشته، review، تایید و merge نشده باشد، همچنان قفل می‌ماند.
