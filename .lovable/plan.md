## پاسخ: بله، خروجی درست است ✅

پاسخ `/api/public/products` مطابق قرارداد امنیتی است:

- ✅ فقط فیلدهای امن: `id`, `name`, `model`, `capacity`, `stock_status`, `is_active`, `price` — بدون `purchase_price` یا هر ستون حساس دیگر.
- ✅ فقط `is_active = true` برمی‌گردد.
- ✅ فیلتر `stock_status <> 'unavailable'` رعایت شده (مقدار `unknown` مجاز است).
- ℹ️ فیلدهای `model` و `capacity` برای این محصول واقعاً `null` هستند — باگ API نیست، مقدار خام دیتابیس است.

## چرا فقط یک محصول برمی‌گردد؟
فقط یک ردیف در `products` با `is_active = true` وجود دارد. اگر انتظار محصولات بیشتری دارید، باید در صفحه‌ی `/products` بقیه را فعال کنید.

## نتیجه
هیچ تغییری لازم نیست — endpoint سالم است.