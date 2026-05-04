## هدف
محافظت از ثبت پیش‌فاکتور با قیمت‌های نامعتبر، طبق سه قانون کسب‌وکار:

1. **کف مطلق:** قیمت واحد هر ردیف نباید کمتر از **کمترین قیمت فروش** ثبت‌شده برای آن محصول (روی همه‌ی `sale_price_types` فعال) باشد.
2. **کف نوع قیمت انتخاب‌شده:** قیمت واحد نباید کمتر از آخرین قیمت فروش محصول برای **همان `sale_price_type_id` انتخاب‌شده در پیش‌فاکتور** باشد (مثلاً «تسویه ۲ روزه»).
3. **سقف ۵٪:** قیمت واحد نباید بیش از **۱.۰۵ × بیشترین قیمت فروش** ثبت‌شده برای آن محصول (روی همه‌ی `sale_price_types` فعال) باشد.

این قوانین برای همه‌ی کاربران بدون استثنا اعمال می‌شوند (طبق درخواست: «هیچ کاربری»).

## منبع داده
آخرین قیمت فروش هر محصول به ازای هر `sale_price_type` در `product_sale_price_history` نگه‌داری می‌شود. «کمترین/بیشترین» = `MIN/MAX` از آخرین رکورد هر `sale_price_type` فعال برای آن محصول.

## تغییرات

### ۱) RPC جدید در دیتابیس (migration)
ساخت `public.get_product_price_bounds(_product_id uuid, _sale_price_type_id uuid)`:
- محاسبه‌ی per-type latest price با `DISTINCT ON (sale_price_type_id)` روی `product_sale_price_history` محدود به `sale_price_types.is_active = true`.
- بازگرداندن یک ردیف:
  - `min_price` (کف مطلق)
  - `max_price` (سقف مطلق)
  - `cap_price` = `round(max_price * 1.05)`
  - `selected_price` (آخرین قیمت برای `_sale_price_type_id`)
  - `has_any` (boolean)
- `SECURITY DEFINER`, `STABLE`, `search_path=public`, `GRANT EXECUTE ... TO authenticated`.

### ۲) اعتبارسنجی client-side در `InvoiceForm.tsx`
در `ItemRow`:
- یک `useQuery` جدید با کلید `["price-bounds", productId, salePriceTypeId]` که RPC بالا را صدا می‌زند (وقتی هردو انتخاب شدند).
- زیر فیلد «قیمت واحد» نمایش راهنما: «کف: X — کف نوع قیمت انتخابی: Y — سقف مجاز (۱.۰۵×): Z».
- اگر `unit_price` خارج از بازه باشد، خطای فارسی و رنگ destructive نمایش داده و submit بلاک شود.

در `mutationFn` (قبل از insert):
- برای هر آیتم، RPC را دوباره صدا بزن (race-safe، چون قیمت ممکن است تغییر کرده باشد).
- در صورت تخلف، `throw new Error("...")` با پیام دقیق فارسی شامل نام محصول و مقدار مجاز.
- اگر `has_any = false` (محصول هیچ قیمت ثبت‌شده‌ای ندارد): اجازه ندهد و پیام «برای این محصول هنوز قیمت فروشی ثبت نشده است» بدهد — این یک رفتار محافظه‌کارانه و سازگار با سه قانون است.

### ۳) Defense-in-depth در دیتابیس (migration)
چون regulation تجاری حساس است و فقط client-side کافی نیست، یک تریگر `BEFORE INSERT/UPDATE` روی `invoice_items`:
- فقط برای فاکتورهایی با `invoices.type = 'pre_invoice'` فعال شود.
- `sale_price_type_id` را از جدول `invoices` بخواند.
- همان bounds را محاسبه و در صورت تخلف `RAISE EXCEPTION` با کد `P0001` و پیام فارسی بیاندازد.
- این تضمین می‌کند هیچ مسیر دیگری (API, future quote→invoice, bulk insert) نتواند قانون را دور بزند.

### ۴) Audit log
در صورت بلاک‌شدن سمت سرور، تریگر یک ردیف در `audit_logs` با `action='invoice_price_blocked'` و جزئیات (product_id, attempted_price, min/max/cap) می‌نویسد.

## پیام‌های خطای پیشنهادی (فارسی)
- زیر کف مطلق: «قیمت ردیف «{نام محصول}» ({X}) از کمترین قیمت فروش ثبت‌شده ({MIN}) کمتر است.»
- زیر کف نوع قیمت: «قیمت ردیف «{نام محصول}» ({X}) از قیمت قانون «{نوع قیمت}» ({SELECTED}) کمتر است.»
- بالای سقف ۵٪: «قیمت ردیف «{نام محصول}» ({X}) بیش از سقف مجاز ({CAP} = ۱.۰۵×بالاترین قیمت) است.»
- بدون قیمت: «برای محصول «{نام}» هیچ قیمت فروشی ثبت نشده — ابتدا قیمت‌گذاری کنید.»

## نکات سازگاری با AFRAKALA_ACCEPTANCE_CRITERIA
- migration جدید با timestamp تازه در `supabase/migrations/`.
- استفاده از validation trigger به‌جای CHECK constraint (به دلیل وابستگی به جداول دیگر).
- پایبند به RLS — RPC با `SECURITY DEFINER` و `search_path=public`.
- بدون CDN/asset خارجی، بدون secret سمت client.
- audit log برای رویدادهای بلاک‌شده.
- متن کاملاً فارسی، RTL، mobile-first (راهنمای زیر فیلد قیمت).

## فایل‌های تحت تغییر
- `supabase/migrations/<timestamp>_invoice_price_bounds.sql` (جدید)
- `src/shared/components/InvoiceForm.tsx` (اعتبارسنجی + UI bounds)

## خارج از scope (در صورت تأیید جداگانه قابل افزودن)
- اعمال همین قواعد روی `quotes` (پیش‌نمایش قیمت).
- اعمال روی `invoice_items.UPDATE` در ماژول‌های آینده — تریگر این را خودکار پوشش می‌دهد.
- نقش‌های استثنا (مثلاً admin override) — طبق درخواست شما «هیچ کاربری» اجازه ندارد، پس استثنا گذاشته نشد.
