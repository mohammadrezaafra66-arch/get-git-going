# بریف تحقیق — سه اشکال: عکس محصول، خطای محاسبهٔ قیمت، ویرایش/رسید فضای خرید

> **مأموریت فقط‌خواندنی.** هیچ کد/migration/نوشتن DB، هیچ build، هیچ تغییر کانتینر. فقط تشخیص و گزارش.
> **نحوهٔ استفاده:**
> ```powershell
> cd D:\AfraKalaTest\app
> claude
> ```
> ```
> Read AfraKala-three-bugs-research.md completely and execute it. Read-only — no code, no migrations, no DB writes, no builds. Write the report to docs/research/three-bugs-diagnosis.md.
> ```

---

## بخش ۰ — قواعد
- فقط خواندن: `rg`، خواندن فایل، `SELECT`/introspection، `pg_get_functiondef`. هیچ نوشتنی.
- برنچ: `feature/navigation-modernization`. دیتابیس: `afrakala`.
- الگوی اتصال:
  ```powershell
  $pw = (docker exec afrakala-lan-db printenv POSTGRES_PASSWORD).Trim()
  @"
  SET client_encoding='UTF8';
  <SQL>
  "@ | docker exec -i -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala -A -F '|'
  ```
- هیچ کلید/رمز چاپ نشود. هر ادعا با شاهد (فایل:خط / تابع / خروجی SQL).
- **محصول نمونهٔ کاربر:** `2b1b6385-d3b9-4c46-ad54-c6be5d560058` — از این برای بررسی داده استفاده کن.

---

## مورد ۱ — عکس محصول ذخیره می‌شود ولی نمایش داده نمی‌شود

**واقعیت‌های تأییدشده توسط کاربر:** آپلود کار می‌کند و عکس در `product_images` ذخیره می‌شود؛ ولی در `/sales/search` (و جاهای دیگر نمایش محصول) عکس دیده نمی‌شود. **پس باگ در خواندن/نمایش است، نه آپلود.**
**خواستهٔ کاربر:** تا ۱۵ عکس برای هر محصول؛ یک عکس **اصلی/شاخص** که همه‌جا نمایش داده شود، بقیه گالری.

بررسی کن:

**۱.۱ — داده واقعاً ذخیره شده؟**
```sql
SET client_encoding='UTF8';
SELECT id, product_id, image_url, storage_path, is_primary, sort_order, created_at
FROM public.product_images
WHERE product_id = '2b1b6385-d3b9-4c46-ad54-c6be5d560058'
ORDER BY sort_order;
SELECT count(*) AS total_images FROM public.product_images;
```
- تأیید کن عکس این محصول هست. ساختار کامل جدول را هم بگیر:
```sql
SELECT column_name, data_type FROM information_schema.columns WHERE table_name='product_images' ORDER BY ordinal_position;
```
- **کلیدی:** آیا ستونی مثل `is_primary`/`is_main`/`is_cover` برای «عکس اصلی» وجود دارد؟ اگر نه، این بخشی از کاری است که باید ساخته شود.

**۱.۲ — آپلود چطور کار می‌کند (تا الگویش را بفهمیم)؟**
```powershell
rg -n "product_images|product-images|is_primary|uploadImage|storage" src --type tsx | rg -i "product|image"
```
- کامپوننت آپلود (`ProductForm.tsx` حدود خط ۹۵۲) را بخوان: عکس در کدام bucket و با چه ساختار URL ذخیره می‌شود؟ آیا محدودیت تعداد (مثلاً حداکثر) دارد؟ آیا مفهوم «عکس اصلی» در UI هست؟

**۱.۳ — 🔴 چرا جستجوی فروش عکس نشان نمی‌دهد (قلب باگ):**
- تابع/کوئری‌ای که `/sales/search` استفاده می‌کند را پیدا کن (احتمالاً RPC `get_sales_search_products` یا مشابه):
```powershell
rg -n "get_sales_search_products|sales.search|searchProducts" src --type tsx
```
```sql
SELECT pg_get_functiondef('public.get_sales_search_products'::regproc);
```
- **بررسی قطعی:** آیا این تابع اصلاً `image_url`/عکس اصلی را در خروجی برمی‌گرداند؟ اگر نه ⟹ ریشهٔ باگ همین است: داده هست ولی کوئری جستجو آن را select نمی‌کند.
- سپس کامپوننت نمایش نتایج جستجو را بخوان: آیا اصلاً جایی برای رندر عکس دارد (`<img>`)، یا حتی اگر داده بیاید نمایش‌اش نمی‌دهد؟

**۱.۴ — سایر صفحات نمایش محصول:**
```powershell
rg -n "image_url|product_images|<img|Image" src/routes/_app.products.tsx src/components/products
```
- فهرست کن کدام صفحه‌های نمایش محصول (فهرست محصولات، پیش‌فاکتور، تابلوی قیمت، ...) عکس را نشان می‌دهند و کدام نه — تا دامنهٔ کاری که باید ساخته شود مشخص شود.

**خروجی مورد ۱:** آیا مشکل فقط «تابع جستجو عکس را select نمی‌کند»، یا «مفهوم عکس اصلی اصلاً وجود ندارد»، یا «هیچ صفحه‌ای عکس را رندر نمی‌کند»؟ و برای رسیدن به خواستهٔ کاربر (۱۵ عکس + عکس اصلی همه‌جا) دقیقاً چه چیزهایی کم است.

---

## مورد ۲ — خطای `operator does not exist: text = app_role` هنگام «محاسبه و انتشار قیمت‌ها»

**واقعیت‌های تأییدشده:** دکمهٔ «محاسبه و انتشار قیمت‌ها» در صفحهٔ ویرایش محصول، برای **همهٔ** محصولات، این خطا را برای هر سه نوع تسویه (نقدی/چک/همکاری) می‌دهد. تسویه‌ها و نرخ ارز درست تعریف شده‌اند. **پس این یک باگ سراسری در تابع محاسبهٔ قیمت است، نه مشکل تنظیمات.**

بررسی کن:

**۲.۱ — کدام تابع فراخوانده می‌شود:**
```powershell
rg -n "محاسبه و انتشار|recompute|recomputePrices|calculate.*price|publish.*price" src --type tsx | rg -i "price|recompute"
rg -n "\.rpc\(" src --type tsx | rg -i "price|recompute|calculate|publish"
```
- نام دقیق RPC/تابعی که این دکمه صدا می‌زند را پیدا کن.

**۲.۲ — 🔴 پیدا کردن مقایسهٔ معیوب `text = app_role`:**
```sql
-- توابعی که در بدنه‌شان app_role و مقایسه دارند
SELECT proname FROM pg_proc
WHERE prosrc ILIKE '%app_role%'
ORDER BY 1;
```
- برای تابع(های) مربوط به قیمت‌گذاری، `pg_get_functiondef` بگیر و **خط دقیقی که یک `text` را با `app_role` مقایسه می‌کند بدون cast پیدا کن**. مثلاً چیزی شبیه `WHERE some_text_column = 'admin'` که `some_text_column` نوعش `app_role` است، یا برعکس.
```sql
SELECT pg_get_functiondef('public.<price_function_name>'::regproc);
```
- **این همان الگوی باگی است که در فاز ۱ برای `role_permissions` دیدیم** (`purchasing_expert` vs enum). این‌بار در تابع قیمت است. خط معیوب را عیناً نقل کن + بگو کدام سمت `text` است و کدام `app_role`.

**۲.۳ — زنجیرهٔ توابع:**
- تابع قیمت احتمالاً چند تابع دیگر را صدا می‌زند (مثلاً چک دسترسی، یا خواندن قوانین قیمت). دنبال کن کدام تابع در زنجیره به `app_role` می‌خورد — ممکن است در خودِ تابع اصلی نباشد بلکه در یک تابع کمکی (permission check) باشد که صدا می‌زند.
```powershell
rg -n "has_role|has_any_role|has_dynamic_permission|app_role" supabase/migrations | rg -i "price|recompute|role"
```

**۲.۴ — 🔴 رابطهٔ مورد ۲ با مورد ۵ (قیمت دلاری در جستجو):**
- کاربر می‌گوید قیمت دلاری در جستجو نشان داده نمی‌شود. **فرضیه: چون تابع قیمت با این خطا می‌شکند، قیمت فروش هیچ‌وقت محاسبه/منتشر نمی‌شود، پس نمایش تبدیل ارز هم کار نمی‌کند.**
- بررسی کن: آیا محصول نمونه (`2b1b...`) اصلاً قیمت فروش محاسبه‌شده دارد؟
```sql
SET client_encoding='UTF8';
SELECT id, name, base_currency FROM public.products WHERE id='2b1b6385-d3b9-4c46-ad54-c6be5d560058';
-- قیمت خرید ثبت‌شده
SELECT * FROM public.purchase_prices WHERE product_id='2b1b6385-d3b9-4c46-ad54-c6be5d560058';
-- قیمت فروش محاسبه‌شده (نام جدول را از کد پیدا کن: calculated_prices / sale_prices / ...)
```
- **حکم لازم:** آیا مورد ۵ یک باگ **جدا** است (تابع جستجو تبدیل ارز را نمایش نمی‌دهد حتی وقتی قیمت محاسبه شده)، یا **معلول** مورد ۲ است (قیمت اصلاً محاسبه نشده چون تابع می‌شکند)؟ این تعیین می‌کند یک رفع کافی است یا دو رفع.

**۲.۵ — مسیر نمایش دلاری در جستجو:**
- در تابع `get_sales_search_products` و کامپوننت نتایج جستجو، منطق نمایش معادل دلاری را پیدا کن. آیا اصلاً کدی برای «نمایش قیمت دلاری کنار تومانی» هست؟ چه شرطی دارد (فقط وقتی `base_currency='usd'`؟)؟ آیا به قیمت محاسبه‌شده وابسته است؟

**خروجی مورد ۲:** خط دقیق باگ `text = app_role` + تابع(های) درگیر + حکم قطعی دربارهٔ اینکه مورد ۵ جدا است یا معلول ۲.

---

## مورد ۳ — فضای خرید: نبودِ ویرایش و آپلود رسید

**واقعیت‌های تأییدشده:** در `/purchase`، بعد از ثبت درخواست خرید، **هیچ دکمهٔ ویرایشی نیست**، و **آپلود رسید برای درخواست‌های خریداری‌شده هم کار نمی‌کند/نیست**. کاربر می‌گوید: «یا اصلاً ساخته نشده، یا ساخته شده و نمایش داده نمی‌شود، یا ساخته شده و مشکل دارد.»
**خواستهٔ کاربر:** ۱) ویرایش درخواست خرید **قبل از تأیید**. ۲) آپلود رسید برای درخواست‌های خریداری‌شده.

بررسی کن:

**۳.۱ — صفحهٔ فضای خرید و کامپوننت‌هایش:**
```powershell
Get-ChildItem src/routes -Filter "*purchase*" -Recurse | Where-Object { $_.Name -notmatch "purchases" }
rg -n "purchase_requests|PurchaseRequest|فضای خرید" src --type tsx
```
- فایل route `/purchase` (مفرد) و کامپوننت کارت درخواست (`PurchaseRequestCard` یا مشابه) را پیدا و بخوان.

**۳.۲ — ویرایش: هست، نیمه، یا نیست؟**
- در کامپوننت درخواست خرید، بگرد دنبال دکمه/منطق ویرایش (`edit|ویرایش|update|EditDialog`).
- **سه حالت را تفکیک کن (قانون ضدخوش‌بینی):**
  - اگر هیچ کد ویرایشی نیست ⟹ «ساخته نشده».
  - اگر کامپوننت/دیالوگ ویرایش هست ولی هیچ‌جا mount/رندر نمی‌شود ⟹ «ساخته شده ولی نمایش داده نمی‌شود».
  - اگر هست و رندر می‌شود ولی خطا می‌دهد ⟹ «ساخته شده ولی مشکل دارد».
- آیا سمت بک‌اند، تابع/RPC/RLS برای `UPDATE` روی `purchase_requests` وجود دارد؟ آیا فقط در وضعیت `pending` مجاز است (که با خواستهٔ کاربر «قبل از تأیید» می‌خواند)؟
```sql
SELECT policyname, cmd, qual::text FROM pg_policies WHERE tablename='purchase_requests';
```

**۳.۳ — آپلود رسید: هست، نیمه، یا نیست؟**
- بگرد دنبال منطق آپلود رسید (`receipt|رسید|purchase-receipts|upload`).
```powershell
rg -n "purchase-receipts|purchase_request.*receipt|رسید" src --type tsx
```
- آیا باکت storage `purchase-receipts` تعریف شده؟ آیا ستونی روی `purchase_requests` برای مسیر رسید هست؟
```sql
SELECT column_name FROM information_schema.columns WHERE table_name='purchase_requests' AND column_name ILIKE '%receipt%';
```
- همان تفکیک سه‌حالته را اعمال کن.

**۳.۴ — وضعیت‌ها و گذارها:**
```sql
SET client_encoding='UTF8';
SELECT column_name, data_type FROM information_schema.columns WHERE table_name='purchase_requests' ORDER BY ordinal_position;
SELECT DISTINCT status FROM public.purchase_requests;
```
- وضعیت‌های ممکن (`pending/approved/purchased`) و اینکه ویرایش در کدام وضعیت منطقی است.

**خروجی مورد ۳:** برای هرکدام از «ویرایش» و «آپلود رسید» صریح بگو: ساخته نشده / ساخته شده ولی mount نشده / ساخته شده ولی باگ دارد — با شاهد. و برای رسیدن به خواستهٔ کاربر چه چیزی (کد فرانت، ستون DB، باکت، RLS) کم است.

---

## بخش ۴ — قالب گزارش

فایل `docs/research/three-bugs-diagnosis.md`:

### برای هر سه مورد:
1. **حکم کوتاه** (یک خط: ریشه کجاست).
2. **شواهد** (فایل:خط / تابع + خروجی `pg_get_functiondef` بخش مربوطه / خروجی SQL).
3. **دامنه** (فقط این محصول یا همه؟ فقط این صفحه یا همه؟).
4. **مسیر رفع پیشنهادی** (فقط توصیف، بدون کد).

### به‌علاوه:
5. **جدول رابطهٔ باگ‌ها:** آیا مورد ۵ (دلاری) معلول مورد ۲ است یا جدا؟ آیا رفع مورد ۲ به‌تنهایی مورد ۵ را حل می‌کند؟
6. **برای مورد ۱:** فهرست دقیق چیزهای لازم برای «۱۵ عکس + عکس اصلی همه‌جا» (ستون `is_primary` هست یا باید اضافه شود؟ کدام کوئری‌ها باید عکس را select کنند؟ کدام کامپوننت‌ها باید `<img>` اضافه کنند؟).
7. **برای مورد ۳:** جدول «ویرایش / آپلود رسید» × «ساخته نشده / mount نشده / باگ دارد».
8. **تأیید سلامت:** `git status --short` (فقط فایل گزارش) + تأیید عدم نوشتن DB و عدم build.

---

## بخش ۵ — یادآوری
- **فقط تشخیص، بدون رفع.** پرامپت اجرایی جدا بعد از این گزارش نوشته می‌شود.
- **مورد ۲:** خط دقیق `text = app_role` را پیدا کن — این کلید رفع است.
- **رابطهٔ ۲↔۵ را قطعی کن** — تعیین می‌کند یک رفع یا دو رفع.
- **قانون ضدخوش‌بینی** برای مورد ۳: «هست» یعنی واقعاً mount و کارکردنی، نه صرفِ وجود فایل.
- گزارش: فارسی، مستقیم، با شواهد.