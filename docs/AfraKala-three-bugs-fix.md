# پرامپت اجرایی — رفع سه اشکال (عکس محصول، خطای قیمت، فضای خرید)

> بر پایهٔ گزارش `docs/research/three-bugs-diagnosis.md`. همهٔ ریشه‌ها قطعی و بازتولید شده‌اند.
> **این پرامپت کد و migration می‌سازد.** بعد از اتمام، یک rebuild لازم است تا روی سرور بیاید.
>
> **نحوهٔ استفاده:**
> ```powershell
> cd D:\AfraKalaTest\app
> claude
> ```
> ```
> Read AfraKala-three-bugs-fix.md completely and execute all parts (A, B, C). Follow the UTF-8-safe migration method. Do NOT rebuild or restart the stack — I will do that at the end.
> ```

---

## بخش ۰ — قواعد اجرا

- **برنچ:** `feature/navigation-modernization` (تأیید کن). **دیتابیس:** `afrakala`.
- **روش اجرای migration = UTF-8-safe** (حتی اگر متن فارسی نداشته باشد، برای امنیت):
  ```powershell
  $pw = (docker exec afrakala-lan-db printenv POSTGRES_PASSWORD).Trim()
  docker cp "D:\AfraKalaTest\app\supabase\migrations\<FILE>.sql" afrakala-lan-db:/tmp/mig.sql
  docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala -v ON_ERROR_STOP=1 -f /tmp/mig.sql
  ```
  (اولین خط داخل هر فایل migration: `SET client_encoding='UTF8';`)
- **هرگز متن فارسی را از pipe در PowerShell عبور نده.** فقط `docker cp` + `-f`.
- **migration اتمیک + idempotent:** هر کدام در `BEGIN; ... COMMIT;` و با `CREATE OR REPLACE` / `IF NOT EXISTS` تا حد ممکن.
- **فایل‌های migration قدیمی را دست نزن** — برای هر رفع DB یک migration **جدید** بساز.
- **نام‌گذاری:** `20260728<HHMMSS>_2<NN>_<name>.sql` — شماره را از آخرین migration ادامه بده (محتوای پوشه را چک کن تا تکراری نشود).
- **rebuild/restart نکن** — کاربر خودش در پایان با `.\deploy\lan\build.ps1` + `up.ps1` انجام می‌دهد.
- **دادهٔ موجود مقدس است:** هیچ `DROP`/`TRUNCATE` روی جدول دارای داده.
- هیچ کلید/رمز چاپ نشود.

---

## بخش A — رفع خطای محاسبهٔ قیمت (مورد ۲) + دلاری (مورد ۵)

**ریشه (قطعی از تحقیق):** در `supabase/migrations/...126_notify_accountants_sale_price_change.sql:66`، تابع تریگرِ `notify_accountants_on_sale_price_change` این خط را دارد:
```sql
WHERE ur.role = 'accountant'::app_role
```
ولی `user_roles.role` نوعش `text` است، نه `app_role` → خطای `operator does not exist: text = app_role`. این تریگر روی درج `product_sale_price_history` اجرا می‌شود، پس در انتهای زنجیرهٔ «محاسبه و انتشار قیمت» برای **همهٔ** محصولات می‌شکند.

**مورد ۵ (دلاری) معلول همین است** — چون قیمت هیچ‌وقت محاسبه نمی‌شود، `toUsd(null)` چیزی نشان نمی‌دهد. رفع A هر دو را حل می‌کند.

**گام‌ها:**

1. **اول تعریف فعلی تابع را بگیر و خط دقیق را ببین** (تأیید قبل از تغییر):
   ```sql
   SELECT pg_get_functiondef('public.notify_accountants_on_sale_price_change'::regproc);
   ```
   و نوع ستون را تأیید کن:
   ```sql
   SELECT data_type FROM information_schema.columns WHERE table_name='user_roles' AND column_name='role';
   ```
   - انتظار: `role` نوعش `text` (یا `character varying`) است، نه `app_role`.

2. **یک migration جدید بساز** که تابع را با `CREATE OR REPLACE FUNCTION` بازتعریف کند، با **همان بدنهٔ فعلی** ولی خط ۶۶ اصلاح‌شده. دو راه درست (هرکدام که با نوع واقعی سازگارتر است):
   - **راه ترجیحی:** literal را به `text` تبدیل کن تا با ستون `text` بخواند:
     ```sql
     WHERE ur.role = 'accountant'
     ```
   - یا اگر جای دیگری در تابع به `app_role` نیاز است، ستون را cast کن:
     ```sql
     WHERE ur.role::text = 'accountant'
     ```
   - **مهم:** کل بدنهٔ تابع را از `pg_get_functiondef` کپی کن و فقط همان خط را عوض کن — چیز دیگری را تغییر نده (near-miss را جلوگیری کن).

3. **بازتولید تأییدی قبل و بعد** (در تراکنش موقت، بدون تغییر داده):
   - قبل از رفع، تحقیق نشان داد این خطا با یک درج آزمایشی در `product_sale_price_history` بازتولید می‌شود. بعد از اعمال migration، همان درج آزمایشی را در یک `BEGIN; ... ROLLBACK;` اجرا کن تا تأیید شود دیگر خطا نمی‌دهد.

**تست A:**
```sql
-- تابع دیگر app_role مقایسه‌نشده ندارد
SELECT pg_get_functiondef('public.notify_accountants_on_sale_price_change'::regproc) LIKE '%''accountant''::app_role%' AS still_broken;
```
- انتظار: `still_broken = f`.
- **تست زندهٔ گزارش‌شده (بعد از rebuild توسط کاربر):** در `/products/<id>` دکمهٔ «محاسبه و انتشار قیمت‌ها» برای محصول نمونه `2b1b6385-...` دیگر خطا ندهد و قیمت محاسبه شود؛ سپس در `/sales/search` هم قیمت تومانی هم معادل دلاری دیده شود.

---

## بخش B — بستهٔ کامل عکس محصول (مورد ۱)

**ریشهٔ نمایش (قطعی):** باکت `product-images` تنها باکت پروژه است که سیاست **SELECT** روی `storage.objects` ندارد (INSERT/DELETE دارد). چون باکت private است، بدون SELECT، URL امضاشده ساخته نمی‌شود → همه‌جا کادر خالی. (تابع جستجو و `is_primary` و badge «اصلی» درست‌اند و دست نمی‌خورند.)

خواستهٔ کاربر: **کل بسته** — تا ۱۵ عکس، یک عکس اصلی که همه‌جا نمایش داده شود، بقیه گالری.

**گام B1 — رفع نمایش (سیاست SELECT):**

1. اول سیاست‌های موجود یک باکت سالم (مثل `purchase-receipts`) را ببین تا الگو را کپی کنی:
   ```sql
   SELECT policyname, cmd, qual::text FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects' AND qual::text ILIKE '%purchase-receipts%';
   -- و همهٔ سیاست‌های product-images:
   SELECT policyname, cmd, qual::text FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects' AND qual::text ILIKE '%product-images%';
   ```
2. یک migration جدید بساز که یک سیاست **SELECT** روی `storage.objects` برای `bucket_id = 'product-images'` اضافه کند، **دقیقاً هم‌سطح با الگوی باکت‌های دیگر** (همان نقش‌ها/شرط‌هایی که بقیه دارند — احتمالاً `authenticated`). با `IF NOT EXISTS` یا `DROP POLICY IF EXISTS` + `CREATE POLICY` تا idempotent باشد.

**گام B2 — رفع حذفِ بی‌چک (فایل یتیم):**

- در `src/components/products/ProductImagesSection.tsx` حدود خط ۶۵، فراخوانی `storage.remove()` نتیجه‌اش چک نمی‌شود و فایل یتیم جا می‌گذارد. اصلاح کن: نتیجه را بگیر، اگر `error` بود toast خطا بده و ردیف DB را حذف نکن (تا داده و storage همگام بمانند). ترتیب درست: اول حذف موفق از storage، بعد حذف ردیف `product_images`.

**گام B3 — سقف ۱۵ عکس:**

- در همان کامپوننت آپلود، قبل از آپلود چک کن تعداد عکس فعلی محصول `< 15` باشد؛ اگر ۱۵ شده، دکمهٔ آپلود غیرفعال + پیام فارسی «حداکثر ۱۵ عکس».
- (اختیاری، محافظ سمت DB) اگر خواستی محکم‌تر شود، یک تریگر `BEFORE INSERT` روی `product_images` که اگر تعداد ردیف‌های آن `product_id` به ۱۵ رسیده باشد خطا دهد. **اول چک کن این محافظ ارزش پیچیدگی‌اش را دارد؛ اگر UI کافی است، فقط UI.**

**گام B4 — تغییر عکس اصلی:**

- الان `is_primary` فقط برای اولین آپلود ست می‌شود. در UI یک دکمه/آیکون «تعیین به‌عنوان عکس اصلی» روی هر عکس اضافه کن.
- منطق: با کلیک، `is_primary` آن عکس `true` و بقیهٔ عکس‌های همان محصول `false` شوند (در یک عملیات اتمیک — یا یک RPC کوچک `set_primary_product_image(image_id)` که این کار را در تراکنش انجام دهد، یا دو UPDATE پشت‌سرهم با اطمینان از اتمیک بودن).
- **RLS:** مطمئن شو نقش مجاز (`products.update`: admin/manager/accountant) اجازهٔ این UPDATE را دارد.

**گام B5 — جانشینی عکس اصلی هنگام حذف:**

- وقتی عکسی که `is_primary=true` است حذف می‌شود، یکی از عکس‌های باقی‌مانده (مثلاً کم‌ترین `sort_order`) خودکار `is_primary=true` شود — تا محصول بی‌عکسِ اصلی نماند.
- بهترین جا برای این منطق: یک تریگر `AFTER DELETE` روی `product_images` که اگر عکس حذف‌شده primary بوده و هنوز عکسی برای آن محصول مانده، اولی را primary کند. (idempotent و مستقل از UI.)

**گام B6 — پاک‌سازی ۱۳ فایل یتیم فعلی (اختیاری):**

- تحقیق گفت ۱۳ فایل یتیم در باکت `product-images` مانده‌اند (از حذف‌های قبلی، بدون ردیف DB). **این حذف داده است، پس فقط اگر کاربر تأیید کند انجام بده.** در گزارش فهرست کن چند فایل و کدام‌ها، ولی **حذفشان را به تأیید کاربر موکول کن** (در پرامپت اجرا نکن مگر صریح گفته شود).
  > تصمیم پیش‌فرض: **این گام را اجرا نکن.** فقط در گزارش بنویس که این فایل‌ها وجود دارند و چطور می‌شود بعداً پاکشان کرد.

**تست B:**
```sql
-- سیاست SELECT اضافه شد
SELECT policyname, cmd FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND qual::text ILIKE '%product-images%' AND cmd='SELECT';
```
- build فرانت سبز.
- **تست زندهٔ گزارش‌شده (بعد از rebuild):**
  1. در `/products/<id>` چند عکس آپلود کن (بیش از ۱۵ نشود).
  2. عکس‌ها در فرم دیده شوند؛ در `/sales/search` عکس اصلی محصول نمایش داده شود.
  3. یک عکس دیگر را «اصلی» کن → همان در جستجو نشان داده شود.
  4. عکس اصلی را حذف کن → یکی دیگر خودکار اصلی شود.
  5. تلاش برای آپلود شانزدهم → پیام حداکثر.

---

## بخش C — فضای خرید: ویرایش + رسید (مورد ۳)

### C1 — آپلود رسید (رفع ارزان: mount کردن کامپوننت موجود)

**ریشه (قطعی):** `PurchaseStatusActions` که تغییر وضعیت و دکمهٔ رسید را دارد، فقط در `/admin/purchase` (adminOnly) mount شده، نه در `/purchase` («فضای خرید»). پس درخواست از فضای خرید هیچ‌وقت به `purchased` نمی‌رسد و دکمهٔ رسید ظاهر نمی‌شود. خودِ کامپوننت با `isManager || isAssignee` محافظت می‌شود، پس mount کردنش در `/purchase` امن است.

**گام:**
- در route/کامپوننت `/purchase` (فایل `_app.purchase.tsx` یا `PurchaseRequestCard`)، کامپوننت `PurchaseStatusActions` را render کن — همان‌طور که در `/admin/purchase` هست.
- مطمئن شو props لازم (درخواست، نقش کاربر، ...) درست پاس داده می‌شوند.
- **چون این کامپوننت خودش گارد دارد**، کاربر عادی فقط اگر assignee باشد اکشن می‌بیند؛ نشتی دسترسی ایجاد نمی‌شود.

### C2 — ویرایش درخواست خرید (قبل از تأیید، فقط درخواست‌کننده)

**ریشه (قطعی):** هیچ UI ویرایشی وجود ندارد، و سیاست UPDATE فعلی درخواست‌کننده را جا انداخته (`assigned_to = auth.uid() OR manager OR admin`).

**تصمیم قطعی کاربر:** فقط **درخواست‌کننده** بتواند ویرایش کند، فقط در وضعیت **`pending`**.

**گام C2-الف — اصلاح سیاست RLS:**

1. اول سیاست UPDATE فعلی را ببین:
   ```sql
   SELECT policyname, cmd, qual::text, with_check::text FROM pg_policies WHERE tablename='purchase_requests' AND cmd='UPDATE';
   ```
2. یک migration جدید بساز که سیاست UPDATE را طوری بازتعریف کند که **علاوه بر** assignee/manager/admin فعلی، این را هم اجازه دهد:
   ```
   (requester_column = auth.uid() AND status = 'pending')
   ```
   - نام دقیق ستون درخواست‌کننده را از schema پیدا کن (`requester_id`/`created_by`/`requested_by` — با `\d purchase_requests` تأیید کن).
   - **مهم:** منطق فعلی assignee/manager/admin را **حذف نکن** — فقط شرط درخواست‌کننده را اضافه کن (با `OR`). و شرط `status='pending'` **فقط** روی شاخهٔ درخواست‌کننده باشد، نه روی کل سیاست (تا اکشن‌های مدیر/assignee در وضعیت‌های دیگر نشکند).
   - هم `USING` هم `WITH CHECK` را پوشش بده.

**گام C2-ب — UI ویرایش:**

- در `PurchaseRequestCard` (یا صفحهٔ فضای خرید)، برای درخواست‌هایی که وضعیتشان `pending` است **و** کاربر فعلی درخواست‌کننده است، یک دکمهٔ «ویرایش» اضافه کن.
- دیالوگ ویرایش با فیلدهای قابل‌تغییر درخواست (محصول، تعداد، قیمت مورد انتظار، یادداشت — همان فیلدهایی که موقع ساخت پر می‌شوند).
- یک mutation که `UPDATE` روی `purchase_requests` بزند. بعد از موفقیت، فهرست refetch شود و toast تأیید.
- **گارد UI هم‌راستا با RLS:** دکمهٔ ویرایش فقط وقتی `status==='pending' && currentUser===requester` دیده شود — تا کاربر دکمه‌ای نبیند که بک‌اند ردش می‌کند.

**تست C:**
```sql
-- سیاست UPDATE حالا درخواست‌کننده در pending را پوشش می‌دهد
SELECT qual::text FROM pg_policies WHERE tablename='purchase_requests' AND cmd='UPDATE';
```
- build فرانت سبز.
- **تست زندهٔ گزارش‌شده (بعد از rebuild):**
  1. با یک کاربر، در `/purchase` یک درخواست خرید ثبت کن → دکمهٔ «ویرایش» باید دیده شود (چون `pending` و درخواست‌کننده‌ای).
  2. ویرایش کن (مثلاً تعداد) → ذخیره شود.
  3. درخواست را تأیید کن (وضعیت از `pending` خارج شود) → دکمهٔ ویرایش باید ناپدید شود.
  4. با کاربر دیگری همان درخواست را ببین → دکمهٔ ویرایش نباید باشد.
  5. برای یک درخواست، وضعیت را به `purchased` برسان → دکمهٔ آپلود رسید ظاهر شود و آپلود کار کند.

---

## بخش D — گزارش و پایان

1. خلاصهٔ migrationهای ساخته‌شده (شماره + یک‌خط) و فایل‌های فرانت تغییرکرده (per بخش).
2. نتیجهٔ تست‌های SQL هر بخش.
3. **جدول قبل/بعد:** هر سه مورد (+ مورد ۵) از «باگ» به «رفع‌شده».
4. تأیید عدم تخریب داده؛ `git status --short`.
5. **commit** با پیام واضح، مثلاً:
   `fix(pricing,products,purchase): cast app_role in price trigger, add product-image read policy + gallery management, enable purchase-request edit & receipt`
6. **یادآوری صریح در انتهای گزارش:** «برای اعمال روی سرور، rebuild لازم است: `.\deploy\lan\build.ps1` سپس `.\deploy\lan\up.ps1`.» (خودت این را اجرا نکن.)

---

## بخش E — یادآوری‌های حیاتی
- **migration جدید بساز، فایل قدیمی را دست نزن.** UTF-8-safe (`docker cp` + `-f`).
- **بخش A:** فقط همان یک خط `app_role` را عوض کن؛ بقیهٔ بدنهٔ تابع دست‌نخورده.
- **بخش B:** سیاست SELECT دقیقاً هم‌سطح باکت‌های دیگر؛ منطق حذف را همگام (storage اول، بعد DB).
- **بخش C:** سیاست UPDATE فعلی را نشکن — فقط شرط درخواست‌کننده در `pending` را با `OR` اضافه کن؛ گارد UI هم‌راستا با RLS.
- **فایل یتیم (B6):** بدون تأیید کاربر حذف نکن.
- **rebuild نکن** — کاربر خودش انجام می‌دهد.
- گزارش: فارسی، مستقیم، با شواهد (فایل:خط، شماره migration، خروجی تست).