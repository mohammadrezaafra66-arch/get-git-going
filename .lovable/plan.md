# برنامه: endpoint عمومی JSON برای محصولات

## رویکرد

طبق قوانین پروژه (TanStack Start) از **server route** استفاده می‌کنیم، نه Supabase Edge Function. مسیر `/api/public/*` روی سایت publish شده بدون احراز هویت قابل دسترسی است.

## فایل جدید

`**src/routes/api/public/products.ts**` — server route با handler های `GET` و `OPTIONS`:

- استفاده از server publishable client (نه `supabaseAdmin`) — یعنی از `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY` با auth غیرفعال.
- کوئری روی `products` با JOIN به view `product_computed_prices_public` (فیلترها: `is_active=true`, `stock_status<>'unavailable'`، ordered by name).
- projection فقط ستون‌های امن: `id, name, model, capacity, stock_status, is_active, price`.
- CORS headers: `Access-Control-Allow-Origin: *`, `Allow-Methods: GET, OPTIONS`, `Allow-Headers: Content-Type`.
- Response: `Content-Type: application/json`.

## RLS / دسترسی

برای اینکه با کلید publishable خوانده شود، به policy `TO anon SELECT` نیاز است:

- بررسی سریع لازم: آیا `products` الان policy `anon SELECT` دارد؟ و آیا view `product_computed_prices_public` روی `GRANT SELECT ... TO anon` تنظیم است؟
- اگر نه → **یک migration جداگانه** با محتوای زیر (فقط بعد از تأیید):
  ```sql
  GRANT SELECT ON public.product_computed_prices_public TO anon;
  CREATE POLICY "public_products_read_active"
    ON public.products FOR SELECT TO anon
    USING (is_active = true AND stock_status <> 'unavailable');
  ```
  این policy فقط ردیف‌های active و in-stock را برای anon باز می‌کند — با فیلتر endpoint هم‌راستا است.

## URL نهایی

بعد از publish:

- Production: `https://project--6906e01f-9a81-48a3-a856-35cbd0c22eb2.lovable.app/api/public/products`
- Custom domain (بعد از publish): `https://get-git-going.lovable.app/api/public/products`
- Preview (dev): `https://project--6906e01f-9a81-48a3-a856-35cbd0c22eb2-dev.lovable.app/api/public/products`

**نکته:** تغییرات backend خودکار deploy می‌شوند اما URL production فقط بعد از کلیک روی **Publish/Update** فعال می‌شود. Preview URL بلافاصله در دسترس است.

## چرا edge function نه؟

- قانون پروژه: منطق داخلی اپ روی TanStack (`createServerFn` یا server route)، نه Edge Function. Edge Functions فقط برای webhook از سرویس‌های خارجی که باید داخل شبکه Supabase بنشینند.
- server route همان مزیت public URL + JSON را می‌دهد، با هم‌پوشانی کامل با محیط اپ.

## سؤالات قبل از build

۱. آیا policy `anon SELECT` روی `products` را با migration اضافه کنم (نیاز است تا کلید publishable بتواند بخواند)؟
۲. آیا نیاز به rate-limiting یا API key اختیاری دارید، یا کاملاً باز باشد؟
۳. آیا فیلد اضافی دیگری (مثل `brand`, `category`, `image_url`) هم برگردانده شود، یا دقیقاً همان ۷ ستون فوق؟

## ریسک‌ها

- بدون policy anon → endpoint هیچ ردیفی برنمی‌گرداند (کلید publishable با RLS مواجه می‌شود).
- اگر بعداً ستون حساسی به `products` اضافه شود، projection صریح از نشت جلوگیری می‌کند.
- خود-میزبانی: کاملاً سازگار — بدون CDN، بدون secret جدید.  
  
  
Yes, proceed with all three:
  1. Add the anon SELECT policy migration for products table
  2. Keep it completely open, no rate limiting or API key needed
  3. Return exactly these 7 fields: id, name, model, capacity, stock_status, is_active, price
  Build the server route and run the migration. Then tell me the exact working URL of the endpoint and show me a sample JSON response.