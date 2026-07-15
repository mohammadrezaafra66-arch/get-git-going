## مشکل
در صفحه‌ی `/products` نسخه‌ی موبایل (کارت‌ها، `md:hidden`) thumbnail محصول را نشان نمی‌دهد. نسخه‌ی جدول (`hidden md:block`) از قبل thumbnail را نمایش می‌دهد. کاربر روی ویوپورت موبایل تست کرده و به همین دلیل هیچ تصویری نمی‌بیند.

## راه‌حل (کوچک، فقط UI)
در `src/routes/_app.products.index.tsx`، داخل کارت موبایل (حدود خطوط 449–464)، در کنار عنوان محصول یک thumbnail کوچک اضافه شود که از همان `thumbnailFor(p.id)` موجود استفاده می‌کند (بدون کوئری اضافه، بدون تغییر schema/RLS).

- اندازه: `h-12 w-12 rounded-md object-cover border`
- Fallback: همان آیکن `ImageIcon` که در جدول استفاده می‌شود.
- ساختار: `flex gap-2` — تصویر سمت راست، بلاک عنوان/badge سمت چپ.
- Link به صفحه‌ی محصول با کلیک روی thumbnail (اختیاری ولی متداول).

## فایل تغییر
- `src/routes/_app.products.index.tsx` — فقط بخش کارت موبایل.

## تست
- ویوپورت < 768px، مسیر `/products` → هر محصولی که تصویر دارد thumbnail کنار عنوانش دیده شود؛ محصولات بدون تصویر آیکن placeholder داشته باشند.
- ویوپورت ≥ 768px → جدول قبلی بدون تغییر باشد.

## Self-Host Acceptance
- بدون تغییر schema/RLS/RBAC/audit، بدون secret، بدون وابستگی خارجی.