
## هدف

در فرم «محصول جدید» و «ویرایش محصول»:
- لیست‌های کشویی **مدل، برند، دسته** به Combobox سرچ‌پذیر تبدیل شوند.
- هر مدل به یک **دسته** متصل باشد و فقط مدل‌های همان دسته نمایش داده شوند.
- ساخت مدل تکراری در هر دسته مسدود شود.
- داده‌های موجود (مدل‌ها و محصولات) **هرگز پاک یا تغییر داده نمی‌شوند**.

## تغییرات دیتابیس (migration جدید، non-destructive)

1. افزودن ستون `category_id uuid NULL` به `public.product_attributes` با FK به `categories(id) ON DELETE SET NULL`.
2. ایندکس روی `(type, category_id, name)`.
3. **Unique partial index** برای جلوگیری از مدل تکراری در یک دسته:
   - `UNIQUE (type, category_id, lower(btrim(name))) WHERE type='model' AND category_id IS NOT NULL`.
   - رکوردهای فعلی بدون `category_id` تحت تاثیر قرار نمی‌گیرند (هیچ داده‌ای پاک/تغییر نمی‌شود).
4. RLS موجود `product_attributes` حفظ می‌شود؛ فقط ستون اضافه می‌شود.
5. RPC کمکی (اختیاری) `find_or_create_model(p_name text, p_category_id uuid)` که در صورت وجود همان نام در همان دسته، رکورد موجود را برمی‌گرداند، در غیر این‌صورت می‌سازد. این RPC با `security definer` و چک permission مناسب پیاده می‌شود.

> تذکر: مدل‌های فعلی که `category_id = NULL` دارند، طبق توافق در همه دسته‌ها قابل انتخاب باقی می‌مانند تا ادمین به‌مرور دسته‌شان را تعیین کند. هیچ DELETE یا UPDATE اجباری روی داده‌های موجود انجام نمی‌شود.

## تغییرات UI

### کامپوننت مشترک
- استفاده از `Command` + `Popover` shadcn (موجود در پروژه) برای یک کامپوننت `SearchableSelect` فارسی/RTL با:
  - باکس سرچ بالای لیست
  - پیام خالی («موردی یافت نشد»)
  - دکمه «ساخت مورد جدید: …» وقتی متن سرچ با هیچ آیتمی دقیقاً مطابقت ندارد (فقط برای مدل)
  - virtualized نبودن (لیست‌ها معمولاً <۱۰۰۰ آیتم، با debounce سرچ کافی است)

### فرم محصول (`src/components/products/ProductForm.tsx`)
- **برند**: تبدیل `<Select>` فعلی به `SearchableSelect` بدون تغییر منطق ذخیره.
- **دسته**: همان تبدیل.
- **مدل**:
  - کوئری `product_attributes` با فیلتر `type='model'` و `(category_id = values.category_id OR category_id IS NULL)`.
  - اگر `category_id` خالی باشد، فیلد مدل **غیرفعال** شود با راهنما: «ابتدا دسته را انتخاب کنید».
  - هنگام تایپ نامی که در لیست نیست، گزینه «افزودن مدل جدید در این دسته» نمایش داده شود؛ کلیک → فراخوانی `find_or_create_model` → set مقدار.
  - اگر کاربر متنی تایپ کند که با یک مدل موجود (case/space-insensitive) یکی است، همان انتخاب شود (جلوگیری از تکرار).

### مدیریت ویژگی‌ها (`src/routes/_app.products.attributes.tsx`)
- در فرم ساخت/ویرایش attribute از نوع `model`، یک فیلد انتخاب دسته اضافه شود (Searchable). برای انواع `color`/`capacity` بدون تغییر.
- در لیست، ستون «دسته» نمایش داده شود.

## حفاظت از داده

- migration فقط `ADD COLUMN` و `CREATE INDEX` و `CREATE FUNCTION` دارد. هیچ DROP/DELETE/UPDATE روی `product_attributes` یا `products`.
- unique index به‌صورت `WHERE category_id IS NOT NULL` تعریف می‌شود تا با رکوردهای قدیمی برخورد نکند.
- در صورت بروز تداخل اسامی هنگام اختصاص دسته به مدل قدیمی، خطای واضح نمایش داده می‌شود؛ هیچ رکوردی به‌صورت خودکار حذف یا ادغام نمی‌شود.

## چک‌لیست self-host

- بدون CDN/فونت خارجی.
- migration idempotent (با `IF NOT EXISTS`) و reversible (drop column/index در پایین مستند).
- RLS موجود حفظ.
- بدون secret جدید.
- queryها با limit/فیلتر و سرچ debounce شده.
- RTL/mobile-first حفظ می‌شود.

## فایل‌های متاثر

- `supabase/migrations/<timestamp>_product_attributes_category.sql` (جدید)
- `src/components/ui/searchable-select.tsx` (جدید، wrapper روی Command/Popover)
- `src/components/products/ProductForm.tsx`
- `src/routes/_app.products.attributes.tsx`
- (در صورت نیاز) `src/lib/products/attributes.ts` برای helper مدل‌ها
