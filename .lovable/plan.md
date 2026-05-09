## هدف
رفع ساختاری ریشه مشکل «قیمت فروش صفر در PDF» با دو محافظ در سطح دیتابیس.

## تغییرات

### ۱. پاکسازی داده‌های تکراری (پیش‌نیاز)
دو رکورد `sale_price_types` با عنوان یکسان «پیش واریز» وجود دارد:
- نوع قدیمی `111c2fdf-...` (دارای قیمت‌های واقعی)
- نوع جدید `4860300a-...` (لیست فعلی به آن متصل است)

**اقدام:** انتقال (merge) رکوردهای `product_sale_price_history` از نوع قدیمی به نوع جدید برای محصولاتی که فقط روی قدیمی قیمت دارند، سپس غیرفعال کردن نوع قدیمی (`is_active = false`) — حذف نمی‌کنیم تا تاریخچه حفظ شود.

### ۲. Unique constraint روی عنوان نوع قیمت
```sql
CREATE UNIQUE INDEX sale_price_types_title_unique_active
ON public.sale_price_types (lower(trim(title)))
WHERE is_active = true;
```
- فقط روی ردیف‌های فعال — تا رکوردهای غیرفعال تاریخی مزاحم نشوند.
- `lower(trim(...))` تا تفاوت فاصله/حروف هم گرفته شود.
- **نتیجه:** دیگر امکان ایجاد دو نوع قیمت فعال هم‌نام وجود ندارد.

### ۳. Validation trigger روی قیمت تاریخچه
```sql
CREATE TRIGGER trg_validate_sale_price_positive
BEFORE INSERT OR UPDATE ON public.product_sale_price_history
FOR EACH ROW EXECUTE FUNCTION public.validate_sale_price_positive();
```
تابع: اگر `new_sale_price IS NULL OR new_sale_price <= 0` خطا برگرداند.
- از CHECK constraint استفاده نمی‌کنیم (طبق قانون پروژه).
- **نتیجه:** دیگر هیچ کاربری نمی‌تواند قیمت صفر ثبت کند (مثل `AFK-2026-00169`).

### ۴. اصلاح داده موجود
- رکورد قیمت صفر `AFK-2026-00169` با تأیید: یا حذف یا اصلاح به مقدار واقعی (نیاز به تأیید شما — فعلاً فقط شناسایی می‌شود، تغییر داده اعمال نمی‌شود مگر اعلام مقدار صحیح).

## آنچه شامل این پلن **نیست**
- ۳ محصول بدون قیمت (`AFK-2026-00029/30/20`) → نیاز به ورود قیمت دستی توسط کاربر، migration نمی‌خواهد.
- تغییر UI افزودن محصول به لیست (Option 3) — فعلاً انجام نمی‌شود.
- تغییر منطق PDF (قبلاً در SH-RA.2C اصلاح شد).

## فایل‌های تغییریافته
- یک migration جدید در `supabase/migrations/` شامل: merge داده‌های تکراری + unique index + trigger.

## ریسک و rollback
- migration کاملاً reversible: `DROP INDEX`، `DROP TRIGGER`، `DROP FUNCTION`.
- قبل از اجرا، کوئری بررسی می‌کند هیچ tile تکراری فعال باقی نماند تا unique index موفق ساخته شود.
- داده‌های تاریخی `product_sale_price_history` از نوع قدیمی **پاک نمی‌شود** — فقط برای محصولاتی که روی نوع جدید قیمت ندارند، یک رکورد آینه‌ای روی نوع جدید اضافه می‌شود.

## گزارش پایان (طبق قانون مادر)
بعد از migration، Self-Host Acceptance Check کامل گزارش می‌شود.

## سؤال قبل از اجرا
آیا با merge خودکار قیمت‌های نوع قدیمی «پیش واریز» به نوع جدید موافقید، یا ترجیح می‌دهید فقط constraint و trigger اضافه شود و merge را خودتان دستی انجام دهید؟
