
# رفع دائمی مشکل قیمت صفر در لیست‌های فروش

## ریشه ساختاری مشکل (یادآوری)

سه منبع قیمت در سیستم وجود دارد و sync نیستند:

1. `product_computed_prices` — کش محاسبه از نرخ ارز (نتیجه pricing engine)
2. `product_sale_price_history` — قیمت‌های منتشرشده رسمی
3. `sale_list_items.current_price` — **snapshot ثابت** هنگام ساخت/ذخیره لیست

PDF و صفحه عمومی از `sale_list_items.current_price` می‌خوانند. وقتی قیمت بعد از ساخت لیست تغییر کند یا محصول تازه اضافه شود، snapshot صفر می‌ماند.

---

## آنچه شما باید انجام دهید (تصمیم‌های انسانی)

این موارد نیاز به دانش کسب‌وکار دارند و قابل خودکارسازی نیستند:

1. **سه محصول بدون قیمت پایه** (`AFK-2026-00029` / `00030` / `00020`): قیمت خرید پایه را در محصول تنظیم کنید یا تایید کنید که قیمت محاسبه‌شده فعلی منتشر شود.
2. **محصول `AFK-2026-00169`**: قیمت خرید پایه `850 تومان` غیرواقعی است (احتمالاً واحد ارز اشتباه ثبت شده). واحد/مقدار صحیح را اصلاح کنید.
3. تایید کنید که نوع قیمت قدیمی «پیش واریز» (`111c2fdf-…`) دیگر استفاده نشود (در migration قبلی غیرفعال شد، اما اگر جایی به ID آن hard-code شده بازبینی شود).

## آنچه من (Lovable) باید انجام دهم — راه‌حل دائمی

برای اینکه این مشکل **هرگز تکرار نشود**، چهار لایه دفاعی اضافه می‌کنم:

### لایه ۱ — Trigger پایگاه‌داده برای sync خودکار snapshot
یک trigger روی `AFTER INSERT OR UPDATE` در `product_sale_price_history` که به‌صورت خودکار `sale_list_items.current_price` و `previous_price` و `change_*` را برای **همه لیست‌هایی که این محصول و این `sale_price_type_id` را دارند** به‌روزرسانی می‌کند.

نتیجه: هر بار قیمت جدید منتشر شود، تمام لیست‌های فعال خودکار sync می‌شوند. دیگر snapshot کهنه نخواهیم داشت.

### لایه ۲ — Backfill اولیه
یک‌بار، با همان منطق trigger، تمام `sale_list_items` فعلی که `current_price = 0` دارند ولی قیمت معتبر در history وجود دارد را از history پر کن. (هشت محصول دسته اول حل می‌شوند.)

### لایه ۳ — هشدار «محصولات بدون قیمت منتشرشده» در ویرایش لیست
در صفحه `/_app.pricing.sale-lists_.$listId.tsx` یک بخش هشدار اضافه می‌شود که محصولات لیست بدون رکورد در `product_sale_price_history` برای نوع قیمت انتخاب‌شده را نشان می‌دهد، با دکمه «انتشار قیمت محاسبه‌شده» که اگر `product_computed_prices` رکورد دارد، آن را در history منتشر می‌کند (با تایید کاربر). این مشکل دسته دوم (3 محصول با قیمت محاسباتی منتشرنشده) را حل می‌کند.

### لایه ۴ — همسویی نمایش UI با PDF
جدول داخلی صفحه لیست هم مثل PDF از قیمت زنده history (در صورت وجود) به‌جای snapshot استفاده کند، تا کاربر همان چیزی را ببیند که در PDF و صفحه عمومی منتشر می‌شود. (با وجود لایه ۱ این صرفاً defense-in-depth است.)

---

## ساختار تغییرات

```text
supabase/migrations/<timestamp>_sync_sale_list_snapshots.sql
  - function: public.sync_sale_list_items_from_history()  (security definer)
  - trigger : trg_sync_sale_list_items AFTER INSERT/UPDATE on product_sale_price_history
  - backfill: UPDATE sale_list_items SET current_price = ... FROM latest history
  - reversible: DROP TRIGGER / DROP FUNCTION

src/routes/_app.pricing.sale-lists_.$listId.tsx
  - بخش «محصولات بدون قیمت منتشرشده» با دکمه publish
  - استفاده از livePrices در جدول داخلی هم (نه فقط PDF)

src/lib/pricing/publish-prices.ts
  - تابع کمکی publishComputedToHistory(productId, salePriceTypeId) برای دکمه جدید
```

## ریسک‌ها و ملاحظات

- Trigger روی هر insert اجرا می‌شود؛ scope با `WHERE sale_price_type_id = NEW.sale_price_type_id` و index مناسب محدود می‌شود تا کند نشود.
- Backfill فقط رکوردهای `current_price = 0` را تغییر می‌دهد تا snapshotهای آگاهانه دست‌نخورده بماند.
- نسخه‌های قبلی لیست در `sale_list_versions` (snapshot تاریخی) دست‌نخورده می‌مانند — فقط لیست فعال sync می‌شود.
- migration کاملاً reversible و idempotent.
- بدون تغییر RLS، secret، CDN، Docker، یا frontend bundle.

## معیار موفقیت

- بعد از انتشار قیمت جدید، نیازی به ذخیره مجدد لیست نیست؛ PDF و صفحه عمومی فوراً قیمت تازه را نشان می‌دهند.
- هیچ محصول جدید اضافه‌شده به لیست با قیمت صفر نمی‌ماند مگر اینکه واقعاً قیمتی در history نداشته باشد — و در آن حالت در UI با هشدار قرمز و دکمه publish نمایش داده می‌شود.

## خارج از scope این پلن

- اصلاح دستی قیمت پایه `00169` و سه محصول بدون قیمت (تصمیم کسب‌وکار شماست).
- حذف فیزیکی نوع قیمت قدیمی غیرفعال (نگه داشته می‌شود برای رفرنس تاریخی).
