## سه مشکل مستقل، هر سه بدون تغییر معماری

### ۱) خطای `Cannot read properties of undefined (reading 'digest')` هنگام ساخت کلید API
- علت: در `/api-keys` تابع `sha256Hex` از `window.crypto.subtle.digest` استفاده می‌کند. `crypto.subtle` روی origin غیرِ Secure (self-host روی HTTP LAN) اصلاً تعریف نشده — این چیزی نیست که مرورگر برای HTTP فراهم کند.
- راه‌حل: یک SHA-256 خالص در JS اضافه کنیم و از آن استفاده کنیم؛ اگر `crypto.subtle` موجود بود از native استفاده شود، در غیر این‌صورت fallback. مقدار hash کاملاً یکسان (32 بایت hex) خواهد بود.
- فایل‌ها:
  - افزودن `src/lib/utils/sha256.ts` — یک SHA-256 استاندارد pure-JS (بدون وابستگی) با API `sha256Hex(input: string): Promise<string>`.
  - در `src/routes/_app.api-keys.tsx` تابع محلی `sha256Hex` حذف و از util جدید import شود.
- هیچ تغییری در schema/RLS/audit ندارد. سایر جای‌ها که subtle استفاده نمی‌کنند دست‌نخورده می‌مانند.

### ۲) دکمه «ورود/خروج» (ClockInOutButton) در هدر داشبورد نیست
- علت: کامپوننت `ClockInOutButton` موجود و درست است، ولی در `src/components/dashboard/DashboardHeader.tsx` رندر نمی‌شود.
- Heartbeat مربوط به `profiles.last_seen_at` از قبل در `AuthProvider` وجود دارد (خط ۶۱–۶۸) — پس آن بخش OK است.
- «اتصال زنده قطع است» صرفاً یک نمایشگر status realtime channel است. اگر self-host realtime پیکربندی نشده باشد پیام قطع می‌دهد؛ منطق درست است و مربوط به این تسک نیست. فقط دکمه ورود/خروج را اضافه می‌کنیم.
- فایل تغییر:
  - `src/components/dashboard/DashboardHeader.tsx` — import و رندر `<ClockInOutButton />` در کنار badge وضعیت. کامپوننت خودش برای admin چیزی رندر نمی‌کند، پس گاردی لازم نیست.

### ۳) `/api/public/products` → `{"error":"Internal server error"}` (در واقع `Failed to fetch prices`)
- علت واقعی (با curl مستقیم دیده شد): endpoint از Supabase publishable-key client استفاده می‌کند که به‌عنوان نقش `anon` روی جدول `products` و ویو `product_computed_prices_public` می‌خواند. Policy انان روی هر دو تعریف شده، ولی **GRANT SELECT برای `anon`/`authenticated`/`service_role` وجود ندارد** — PostgREST برمی‌گرداند permission denied.
- خودِ کد endpoint امن است: فقط ستون‌های غیرحساس (id/name/model/capacity/stock_status/is_active/price) برمی‌گرداند؛ قیمت خرید و هیچ اطلاعات حساسی خارج نمی‌شود؛ فقط محصولات `is_active=true AND stock_status<>'unavailable'`؛ بدون احراز هویت هم کار می‌کند.
- راه‌حل: migration که GRANTهای مربوط به Data-API را روی این دو object اضافه کند. مطابق راهنمای data-api-permission-denied، roles با policy موجود همخوانی دارد:
  - `GRANT SELECT ON public.products TO anon, authenticated;`
  - `GRANT SELECT ON public.product_computed_prices_public TO anon, authenticated;`
  - `GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;` (چون از قبل policyهای authenticated وجود دارد)
  - `GRANT ALL ON public.products TO service_role;`
  - `GRANT ALL ON public.product_computed_prices_public TO service_role;`
- فایل: یک migration جدید. بدون تغییر RLS، بدون تغییر کد endpoint.

## فایل‌های تغییر
- `src/lib/utils/sha256.ts` (جدید)
- `src/routes/_app.api-keys.tsx` (import جایگزین)
- `src/components/dashboard/DashboardHeader.tsx` (افزودن دکمه)
- migration جدید در `supabase/migrations/` برای GRANTها

## کجاها تست کن
1. **API Keys** — روی self-host HTTP (یا حتی preview): `/api-keys` → «کلید جدید» → نام بده → ذخیره → کلید ساخته شود و مقدار خام یک‌بار نمایش داده شود؛ در جدول ردیف با prefix ظاهر شود. صفحه‌ی `/api-keys` قسمت «تاریخچه رویدادها» → action=create ثبت شده باشد. غیرفعال/فعال کردن و حذف هم بدون خطا کار کند.
2. **Dashboard header** — `/dashboard` با کاربر غیرِ admin → دکمه‌ی «ورود» در هدر دیده شود؛ کلیک → toast «ورود ثبت شد»؛ دکمه به «خروج (از HH:MM)» تغییر کند؛ در `presence_logs` ردیف باز باشد. برای admin دکمه‌ای نیست (طبق طراحی). Heartbeat `profiles.last_seen_at` توسط `AuthProvider` هر مدت به‌روز می‌شود — با یک SQL کوچک قابل بررسی است.
3. **Public API** — از هر جا (بدون login):
   - `curl http://localhost:8080/api/public/products` → باید JSON با آرایه‌ی `products` برگردد.
   - روی deploy: `https://<published>/api/public/products` → همان.
   - بررسی امنیتی خروجی: فقط id/name/model/capacity/stock_status/is_active/price — بدون قیمت خرید یا فیلد حساس دیگر.
   - محصولی که `is_active=false` یا `stock_status='unavailable'` است در خروجی نباشد.

## Self-Host Acceptance
- بدون وابستگی خارجی جدید (SHA-256 pure-JS داخلی).
- migration فقط GRANT اضافه می‌کند؛ reversible و idempotent (GRANT چندبار هم بی‌ضرر است).
- بدون secret جدید، بدون تغییر RLS، بدون تغییر schema.
- سازگار با HTTP LAN.