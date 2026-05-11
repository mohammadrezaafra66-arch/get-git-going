## هدف

بدون نیاز به هیچ کلید API، نرخ شاخص‌ها روی Lovable به‌صورت خودکار هر ۱۵ دقیقه ثبت شوند و در UI «کارگاه نرخ‌های بازار» به‌صورت لحظه‌ای (Realtime) نمایش داده شوند.

## واقعیت‌هایی که باید بدانید (صادقانه)

- منابع ایرانی (BrsApi.ir و TGJU) معمولاً از روی Cloudflare Workers (که Lovable روی آن اجرا می‌شود) به دلیل geo-block پاسخ نمی‌دهند. اولین اجرای واقعی این را قطعی روشن می‌کند.
- اگر منبع پاسخ ندهد، endpoint با `status:"failed"` بازمی‌گردد، هیچ‌چیز crash نمی‌کند، اما نرخ‌ها هم به‌روز نمی‌شوند.
- اگر هر دو منبع از Lovable در دسترس نباشند، تنها مسیر واقع‌بینانه برای «خودکار»، اجرای cron از self-host (لپ‌تاپ ایران) است که در فاز بعدی انجام می‌شود.
- این فاز با وجود این ریسک پیش می‌رود تا واقعیت دسترسی‌پذیری از Lovable را شفاف اندازه بگیریم.

## تغییرات کد (فقط server-side)

### ۱) افزودن fetcher بدون‌کلید برای دو منبع جدید

فایل: `src/lib/market-rates-providers.server.ts` (جدید)
- `fetchBrsApi()` → GET به endpoint عمومی BrsApi (بدون کلید)، با `AbortController` و timeout از `EXTERNAL_API_TIMEOUT_MS` (کف ۱۵s، سقف ۶۰s).
- `fetchTgjuPublic()` → GET به endpoint عمومی JSON TGJU، همان timeout.
- نرمال‌سازی هر دو به یک شکل میانی: `{ symbol → { value, reportedAt, raw } }` تا با `market_rate_source_mappings.source_symbol` موجود سازگار باشد.
- خروجی همیشه typed: موفق یا `{ ok:false, reason }` بدون throw به بیرون.

### ۲) افزودن دو منبع جدید به جدول‌های مرجع (migration کوچک)

migration در `supabase/migrations/`:
- درج (idempotent با `ON CONFLICT (code) DO NOTHING`) دو ردیف در `market_rate_sources`:
  - `BRSAPI_PUBLIC` (label فارسی: «BrsApi رایگان»)
  - `TGJU_PUBLIC` (label فارسی: «TGJU عمومی»)
- بدون تغییر RLS، بدون تغییر ستون، بدون drop. کاملاً reversible.
- mapping symbolها به indicators از طریق UI موجود «نگاشت‌ها» انجام می‌شود (دستی، یک‌بار). در migration درج پیش‌فرض نمی‌کنیم تا انتخاب نمادها با شما باشد.

### ۳) به‌روزرسانی endpoint زمان‌بندی برای پشتیبانی چندمنبعی

فایل موجود: `src/routes/api/public/hooks/ingest-market-rates.ts`
- منطق فعلی Navasan دست‌نخورده می‌ماند.
- اضافه‌شدن دو شاخهٔ جدید برای `BRSAPI_PUBLIC` و `TGJU_PUBLIC`.
- ترتیب اجرا: BrsApi → اگر `inserted=0`، TGJU به‌عنوان fallback صدا زده می‌شود.
- هر دو منبع پشت همین secret هدر `Authorization: Bearer ${MARKET_RATES_CRON_SECRET}` می‌مانند.
- پاسخ typed با `sources: [{source, status, fetched, inserted, suspect, reason}]` تا بتوان دید کدام منبع موفق بود.
- هیچ کلیدی برای BrsApi/TGJU لازم نیست؛ بنابراین پرچم‌های `BRSAPI_PUBLIC_ENABLED` و `TGJU_PUBLIC_ENABLED` (پیش‌فرض `false`) اضافه می‌شوند تا به‌صورت سرور قابل خاموش‌کردن باشند.

### ۴) راه‌اندازی scheduler داخل Lovable Cloud (pg_cron)

با استفاده از `pg_cron` و `pg_net` که در Lovable Cloud در دسترس‌اند:
- یک job به نام `mr-auto-ingest-market-rates` ثبت می‌شود که هر ۱۵ دقیقه به URL پایدار `https://project--6906e01f-9a81-48a3-a856-35cbd0c22eb2.lovable.app/api/public/hooks/ingest-market-rates` می‌زند با هدر `Authorization: Bearer <SECRET>`.
- این کار از طریق ابزار درج SQL در Lovable Cloud انجام می‌شود (نه به‌عنوان migration در repo، چون secret دارد).
- قبل از این، شما باید `MARKET_RATES_CRON_SECRET` را به‌عنوان secret سرور اضافه کنید (فرم امن باز می‌شود).

### ۵) Realtime push روی UI کارگاه نرخ‌ها

فایل: `src/routes/_app.pricing.market-rates-workshop.tsx` (یا کامپوننت جدول مربوطه)
- یک `useEffect` که با `supabase.channel(...).on('postgres_changes', { table: 'market_rate_ticks' })` گوش می‌دهد.
- روی هر INSERT جدید، `queryClient.invalidateQueries(['market-rates', ...])` صدا زده می‌شود تا UI بدون refresh تازه شود.
- enable کردن Realtime روی جدول `market_rate_ticks` در همان migration: `ALTER PUBLICATION supabase_realtime ADD TABLE public.market_rate_ticks;` (idempotent با guard).
- بدون تغییر طراحی/UI.

## Secret که باید شما اضافه کنید

فقط یکی:
- `MARKET_RATES_CRON_SECRET` — یک رشتهٔ تصادفی ≥۳۲ کاراکتر (مثلاً خروجی یک password generator). فرم امن Lovable باز می‌شود؛ هرگز در کد یا git ذخیره نمی‌شود.

پرچم‌های زیر هم به‌صورت سرور روی `true` ست می‌شوند تا منابع فعال شوند:
- `MARKET_RATES_AUTO_INGEST_ENABLED=true`
- `MARKET_RATES_EXTERNAL_ENABLED=true`
- `BRSAPI_PUBLIC_ENABLED=true`
- `TGJU_PUBLIC_ENABLED=true`
- `NAVASAN_ENABLED=false` (بدون تغییر)

## چه چیز تغییر نمی‌کند

- Navasan کاملاً دست‌نخورده باقی می‌ماند (off).
- ثبت دستی نرخ کار می‌کند مثل قبل.
- RLS، RBAC، auth، storage — هیچ‌کدام تغییر نمی‌کنند.
- هیچ کد client-side polling اضافه نمی‌شود.
- هیچ asset/font/CDN خارجی اضافه نمی‌شود.

## بعد از پیاده‌سازی چه می‌بینید

1. اولین اجرای cron حداکثر ۱۵ دقیقه بعد از فعال‌سازی.
2. اگر BrsApi/TGJU از Lovable در دسترس باشند → ردیف جدید در `market_rate_ticks` و UI کارگاه به‌صورت زنده آپدیت می‌شود.
3. اگر geo-block فعال باشد → ردیف `failed` در `market_rate_ingestion_runs` با `error_message` گویا. core سالم می‌ماند. سپس فاز بعدی self-host را راه می‌اندازیم تا قطعی کار کند.

## فازهای بعدی (خارج از این پلن)

- MR-AUTO.2 — اگر Lovable geo-block شد، wiring self-host pg_cron با همین endpoint.
- MR-AUTO.3 — UI ادمین برای فعال/غیرفعال کردن منابع و دیدن آخرین وضعیت اجرا (در حال حاضر از همان جدول `market_rate_ingestion_runs` قابل مشاهده است).

## ریسک‌ها

- **Geo-block (محتمل):** Lovable احتمالاً به منابع ایرانی نمی‌رسد. در این صورت endpoint failed برمی‌گردد و باید سراغ self-host برویم.
- **پایداری ساختار TGJU:** ساختار JSON عمومی TGJU گاهی تغییر می‌کند. اگر یک روز خراب شد، parser به `failed` می‌افتد، crash نمی‌کند، و در اجرای بعدی BrsApi جواب می‌دهد.
- **rate limit رایگان BrsApi:** هر ۱۵ دقیقه یک بار، خیلی پایین‌تر از سقف رایگان است.
