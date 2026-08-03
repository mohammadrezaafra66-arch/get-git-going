# بریف تحقیق — خرابی encoding در «زمان تسویه» (علامت سؤال به‌جای فارسی)

> **این یک مأموریت تحقیق است، نه اجرا.** فقط‌خواندنی: هیچ کد، migration، یا نوشتنی روی دیتابیس.
> هدف: قطعی‌کردن اینکه چرا در صفحهٔ `/purchases/create`، فیلد «زمان تسویه» به‌جای متن فارسی `???? ????????` نشان می‌دهد — و اینکه ریشه، **دادهٔ خراب در دیتابیس** است یا **مشکل رندر/encoding در مسیر**.
>
> **نحوهٔ استفاده:**
> ```powershell
> cd D:\AfraKalaTest\app
> claude
> ```
> ```
> Read AfraKala-settlement-encoding-research.md completely and execute it. Research only — no code, no migrations, no DB writes. Write the report to docs/research/settlement-encoding-diagnosis.md.
> ```

---

## بخش ۰ — قواعد

- **فقط‌خواندنی.** هیچ `INSERT/UPDATE/DELETE/CREATE/ALTER/DROP`. هیچ کد/migration. فقط `SELECT`, `\d`, `pg_get_functiondef`, `information_schema`, و `rg`/خواندن فایل.
- **دادهٔ خراب را «تعمیر» نکن** — فقط تشخیص بده و گزارش کن.
- برنچ را عوض نکن، چیزی commit نکن. تنها فایل مجاز برای نوشتن: `docs/research/settlement-encoding-diagnosis.md`.
- تأیید محیط:
  ```powershell
  cd D:\AfraKalaTest\app
  git branch --show-current      # feature/navigation-modernization
  git status --short
  ```
- الگوی اتصال دیتابیس (مهم — `client_encoding` را صریح UTF8 بگذار تا خودِ ابزار تشخیص، منبع خطای جدید نشود):
  ```powershell
  $pw = (docker exec afrakala-lan-db printenv POSTGRES_PASSWORD).Trim()
  @"
  SET client_encoding = 'UTF8';
  <SQL>
  "@ | docker exec -i -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala -A -F '|'
  ```

---

## بخش ۱ — پیداکردن منبع دادهٔ این dropdown

**۱.۱ — صفحه/کامپوننت `/purchases/create` را پیدا کن:**
```powershell
Get-ChildItem src/routes -Filter "*purchases*create*" -Recurse
rg -n "createFileRoute" src/routes | rg -i "purchase"
```
- مسیر فایل route و هر `PurchaseForm`/کامپوننت فرم خرید را ثبت کن.

**۱.۲ — فیلد «زمان تسویه» را در کد پیدا کن:**
```powershell
rg -n "زمان تسویه|settlement|payment_term|paymentTerm|روز " src --type tsx | rg -i "purchase|settlement|term"
```
- ثبت کن: این فیلد از کدام جدول/کوئری/hook داده می‌گیرد؟ نام دقیق جدول را بیرون بکش (`payment_terms`؟ `settlement_types`؟ چیز دیگر؟).

**۱.۳ — نحوهٔ ساخت برچسب گزینه (حیاتی برای فهم چرا نصفش درست است):**
- کاربر `???? ???????? (روز 30)` می‌بیند: بخش `(روز 30)` درست فارسی است ولی بخش اولش `????` است.
- در کد پیدا کن برچسب چطور ساخته می‌شود:
  - آیا `label = row.name + " (روز " + row.days + ")"` است؟ (یعنی `name` از DB خراب، ولی `(روز N)` در کد ساخته می‌شود ⟹ این توضیح می‌دهد چرا فقط بخش `name` خراب است.)
  - یا کل برچسب از یک ستون DB می‌آید؟
- خط دقیق کد که برچسب را می‌سازد نقل کن.

---

## بخش ۲ — 🔴 تشخیص قطعی: دادهٔ خراب یا مشکل رندر؟

این مهم‌ترین بخش است. با دیدن **بایت‌های خام** یک‌بار برای همیشه قطعی می‌شود.

**۲.۱ — بایت‌های خام ستون برچسب را ببین** (نام جدول/ستون را از بخش ۱ جایگذاری کن؛ مثال با `payment_terms.name`):
```sql
SET client_encoding = 'UTF8';
SELECT id,
       name,
       char_length(name)  AS chars,
       octet_length(name)  AS bytes,
       encode(name::bytea, 'hex') AS hex_bytes
FROM public.payment_terms
ORDER BY id;
```

**تفسیر قطعی:**
- اگر `hex_bytes` روی بخش خراب `3f3f3f3f...` باشد (`3f` = کد ASCII کاراکتر `?`) ⟹ **دادهٔ واقعاً خراب است.** بایت‌های فارسی اصلی از بین رفته و با «?» جایگزین شده. از خود DB قابل بازیابی نیست؛ مقدار درست باید دوباره تأمین شود.
- اگر `hex_bytes` بایت‌های معتبر UTF-8 فارسی داشته باشد (مثل `d8xx`, `d9xx`) ولی در نمایش `????` دیده شود ⟹ **داده سالم است، مشکل در مسیر رندر/کلاینت است** (client_encoding کوئری، یا لایهٔ API، یا فونت). آنگاه سراغ بخش ۴ برو.

**۲.۲ — مقایسه با دادهٔ فارسیِ سالم در همان دیتابیس** (تا ثابت شود مشکل عمومی نیست، خاص همین جدول است):
```sql
SET client_encoding = 'UTF8';
SELECT 'customers' AS src, name, encode(name::bytea,'hex') AS hex FROM public.customers WHERE name ~ '[ا-ی]' LIMIT 3;
SELECT 'products' AS src, name, encode(name::bytea,'hex') AS hex FROM public.products WHERE name ~ '[ا-ی]' LIMIT 3;
```
- اگر این‌ها بایت `d8/d9` سالم دارند ولی جدول تسویه `3f3f3f` دارد ⟹ تأیید نهایی: خرابی خاص همان جدول تسویه است، نه کل سیستم.

**۲.۳ — encoding سرور و اتصال:**
```sql
SHOW server_encoding;
SHOW client_encoding;
```
- `server_encoding` باید `UTF8` باشد. اگر نبود، یافتهٔ بحرانی است.

---

## بخش ۳ — دامنه و منشأ خرابی

**۳.۱ — چند ردیف و کدام‌ها خراب‌اند؟**
```sql
SET client_encoding = 'UTF8';
-- ردیف‌هایی که حاوی کاراکتر «?» هستند (نشانهٔ خرابی)
SELECT id, name, days /* یا ستون معادل */ FROM public.payment_terms WHERE name LIKE '%?%' ORDER BY id;
-- کل ردیف‌ها برای دید کامل
SELECT id, name, * FROM public.payment_terms ORDER BY id;
```
- ثبت کن: همهٔ ردیف‌ها خراب‌اند یا فقط بعضی؟ کدام id ها؟

**۳.۲ — منشأ: کدام migration/seed این ردیف‌ها را وارد کرده؟**
```powershell
rg -n "payment_terms|settlement_types" supabase/migrations | rg -i "insert|values|seed"
```
- migration مربوط به seed این جدول را پیدا کن. محتوایش را باز کن:
  - آیا فایل حاوی متن فارسی است که ممکن است هنگام اجرا روی ویندوز بدون UTF-8 خراب شده باشد؟
  - آیا خود فایل `.sql` سالم است (فارسی درست) ولی هنگام اجرا خراب شده، یا خود فایل هم `????` دارد؟
  ```powershell
  # نام فایل را از نتیجهٔ بالا بگذار:
  rg -n "payment_terms" supabase/migrations/<file>.sql
  Get-Content supabase/migrations/<file>.sql -Encoding UTF8 | Select-String "payment_terms" -Context 0,5
  ```
- **این تمایز مهم است:**
  - اگر فایل migration فارسیِ سالم دارد ولی DB خراب است ⟹ خرابی هنگام **اجرا** رخ داده (client_encoding غلط در زمان اجرای migration روی ویندوز). این همان الگوی خرابی نام محصولات QA است.
  - اگر خود فایل هم `????` دارد ⟹ خرابی از **قبلِ** ذخیرهٔ فایل بوده (فایل با encoding غلط ذخیره شده).

**۳.۳ — آیا جای دیگری هم همین برچسب‌ها استفاده می‌شوند؟** (تا بدانیم رفع داده، همه‌جا را درست می‌کند یا نقطه‌ای)
```powershell
rg -n "payment_terms|settlement" src --type tsx | rg -i "select|option|label|map"
```
- فهرست کن این جدول در چند صفحه/dropdown استفاده می‌شود (خرید، پیش‌فاکتور، فروش...) تا اثر رفع مشخص باشد.

---

## بخش ۴ — اگر مشکل رندر بود (نه داده)

فقط اگر بخش ۲.۱ نشان داد داده سالم است ولی `????` رندر می‌شود، این‌ها را بررسی کن:
- آیا این برچسب از طریق یک RPC/تابع می‌آید که ممکن است encoding را حفظ نکند؟ (`pg_get_functiondef` آن تابع.)
- آیا لایهٔ Kong/PostgREST هدر `Content-Type; charset=utf-8` درست می‌دهد؟
- آیا فقط این فیلد خراب است یا همین `name` در صفحهٔ دیگری سالم دیده می‌شود؟ (اگر جایی سالم است ⟹ مشکل خاص همین مسیر رندر است، نه داده.)

---

## بخش ۵ — مقدار درست باید چه باشد؟

برای اینکه پرامپت اصلاحی بتواند مقدار درست را بازگرداند، حدس بزن هر ردیف خراب باید چه متن فارسی‌ای باشد:
- از روی ستون عددی (`days`) و context: مثلاً اگر `days=30`، برچسب احتمالاً «تسویه ۳۰ روزه» یا مشابه است.
- اگر جای دیگری در سیستم (یا در نسخهٔ سالم فایل migration) نام درست این نوع‌های تسویه پیدا شد، عیناً نقل کن.
- **فهرست پیشنهادی «id → مقدار درست»** را در گزارش بگذار (به‌عنوان پیشنهاد برای تأیید کاربر، نه اجرا).

---

## بخش ۶ — قالب گزارش

فایل `docs/research/settlement-encoding-diagnosis.md` با این ساختار:

1. **حکم نهایی (یک خط):** «دادهٔ خراب در DB» یا «مشکل رندر/encoding در مسیر» — با شاهد hex.
2. **منبع داده:** جدول/ستون دقیق + خط کد سازندهٔ برچسب.
3. **شاهد قطعی:** خروجی کوئری hex (بخش ۲.۱) + مقایسه با دادهٔ سالم (۲.۲).
4. **دامنه:** چند ردیف، کدام id ها، در چند صفحه استفاده می‌شود.
5. **منشأ:** کدام migration، و اینکه خرابی «هنگام اجرا» بوده یا «فایل از اول خراب».
6. **مقدار درست پیشنهادی:** جدول `id → متن فارسی درست`.
7. **مسیر رفع پیشنهادی (فقط توصیف، بدون کد):** اگر داده خراب است، رفع = بازنویسی مقادیر درست با UTF-8 صحیح + سخت‌کردن seed؛ اگر رندر است، رفع = نقطهٔ مشخص مسیر.
8. **تأیید سلامت:** `git status --short` (باید فقط فایل گزارش) + تأیید اینکه هیچ نوشتنی روی DB نشده.

---

## بخش ۷ — یادآوری
- **فقط تشخیص، بدون رفع.** پرامپت اصلاحی جدا و بعد از این گزارش نوشته می‌شود.
- **کوئری hex قلب تشخیص است** — بدون آن هیچ ادعایی نکن.
- `client_encoding='UTF8'` را در همهٔ اتصال‌ها بگذار تا خود ابزار تشخیص منبع خطای کاذب نشود.
- گزارش: فارسی، مستقیم، با شواهد.