# گیت ۱ — دستورالعمل اجرای دو مایگریشن روی سامانهٔ اصلی

> **کاغذ است، نه دستور اجرا. هیچ بخشی اجرا نشده و نباید بشود مگر با «برو»ی صریح مالک، و فقط پس از
> رسیدن خروجی پیش‌پرواز و تأیید پشتیبان.**

تدوین ۲۰۲۶-۰۹-۰۳ · زمان‌ها و md5ها روی استیجینگ اندازه‌گیری شده‌اند.

## پیش‌شرط‌ها — هر پنج باید سبز باشند

| # | شرط | از کجا |
|---|---|---|
| ۱ | خروجی `production-preflight.ps1` رسیده و همهٔ آستانه‌ها پاس‌اند | کار ۲ |
| ۲ | **md5 تعریف تابع سامانهٔ اصلی = `2cd11b81bfab0c6ba795e405ee539098`** | بند ج۱ پیش‌پرواز |
| ۳ | محدودیت روی سامانهٔ اصلی هنوز **سه‌مقداری** است | بند الف۱ |
| ۴ | دفترچه روی `20260831210000` (مایگریشن ۴۱۹) | بند الف۶ |
| ۵ | پشتیبان تازه + بازیابی آزمایشی تأییدشده | کار ۳ |

> **شرط ۲ مسدودکننده است.** اگر md5 فرق داشت، تعریف سامانهٔ اصلی با آنچه آزموده شد یکی نیست و
> فایل‌های بازگشت این مخزن **روی سامانهٔ اصلی معتبر نیستند**. متوقف شوید و خروجی بند ج۴ را به‌عنوان
> دستور بازگشت واقعی نگه دارید.

## md5های مرجع — هر دو جهت

| چیز | md5 |
|---|---|
| فایل مایگریشن ۴۲۰ | `525f65f2755cbc8e200da71e8fb6a0fd` |
| فایل مایگریشن ۴۲۱ | `9ca95c27ec7cd0472b78c21a0cd9a5c2` |
| تعریف تابع **پیش از** ۴۲۰ (= فایل بازگشت ۴۲۰) | `f73e5177c99b75cecfe313fd8f772d0c` |
| تعریف تابع **بین** ۴۲۰ و ۴۲۱ (= فایل بازگشت ۴۲۱) | `c01224ec6d15940ba68d6bc631f920e3` |
| تعریف تابع **پس از** ۴۲۱ (حالت هدف) | `2cd11b81bfab0c6ba795e405ee539098` |

## ترتیب دقیق دستورها

هر مایگریشن سه گام دارد: **تحویل با md5 دوطرفه → اعمال در تراکنش واحد → ثبت دفترچه در همان نفس.**

```powershell
$env:PGPASSWORD = (Select-String -Path "deploy\lan\.env.lan" -Pattern '^POSTGRES_PASSWORD=(.*)$').Matches.Groups[1].Value
$DB = "postgres"     # روی سامانهٔ اصلی نام دیتابیس این است، نه afrakala
```

### قدم ۰ — مبنای «قبل» (فقط خواندن)

```powershell
docker exec -e PGPASSWORD=$env:PGPASSWORD afrakala-lan-db psql -U supabase_admin -d $DB -A -t -c @"
SELECT 'exception: acct='||count(*) FILTER (WHERE quote_exception_type='accounting_approval')
     ||' shortfall='||count(*) FILTER (WHERE quote_exception_type='credit_shortfall_salesperson_commitment')
     ||' guest='||count(*) FILTER (WHERE quote_exception_type='guest_no_link')
     ||' null='||count(*) FILTER (WHERE quote_exception_type IS NULL)
     ||' rows='||count(*) FROM public.sales_quotes;
"@
docker exec -e PGPASSWORD=$env:PGPASSWORD afrakala-lan-db psql -U supabase_admin -d $DB -A -t -c `
  "SELECT md5(pg_get_functiondef(oid)) FROM pg_proc WHERE proname='create_sales_quote_with_items';"
```

**معیار توقف:** `guest` باید صفر باشد و md5 باید `2cd11b81…` **نباشد** (چون هنوز ۴۲۰ نرفته). اگر
md5 برابر `2cd11b81…` بود، مایگریشن‌ها قبلاً رفته‌اند — متوقف شوید.

### قدم ۱ — مایگریشن ۴۲۰

```powershell
$M = "supabase\migrations\20260903100000_420_guest_quotes_get_their_own_reason.sql"
(Get-FileHash $M -Algorithm MD5).Hash.ToLower()      # باید 525f65f2755cbc8e200da71e8fb6a0fd باشد
Get-Content $M -Raw -Encoding UTF8 | Out-Null        # فقط برای اطمینان از خوانا بودن

# تحویل از stdin — docker cp روی این ماشین‌ها شکسته است (OG-68)
cmd /c "type $M | docker exec -i afrakala-lan-db sh -c ""cat > /tmp/m420.sql"""
docker exec afrakala-lan-db md5sum /tmp/m420.sql     # باید همان hash بالا باشد
```

**معیار توقف:** اگر دو md5 یکی نبودند، **متوقف شوید**. این همان قاعده‌ای است که فاجعهٔ
۲۰۲۶-۰۷-۱۱ (نابودی متن فارسی ۴۴ تابع) را می‌گرفت.

```powershell
docker exec -e PGPASSWORD=$env:PGPASSWORD afrakala-lan-db psql -U supabase_admin -d $DB `
  -v ON_ERROR_STOP=1 --single-transaction -f /tmp/m420.sql
docker exec -e PGPASSWORD=$env:PGPASSWORD afrakala-lan-db psql -U supabase_admin -d $DB -c `
  "INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20260903100000') ON CONFLICT DO NOTHING;"
```

**زمان تخمینی:** روی استیجینگ با **۶۶ ردیف**، `448ms`. سنگین‌ترین بخش، اعتبارسنجی دوبارهٔ محدودیت
است که خطی با تعداد ردیف رشد می‌کند. برآورد محافظه‌کارانه: **زیر ۵ ثانیه تا ۱۰۰ هزار ردیف**.
عدد واقعی سامانهٔ اصلی از بند ب۲ پیش‌پرواز می‌آید؛ تا نیامده این یک برآورد است نه یک وعده.

**معیار توقف:** هر خروجی‌ای جز `ALTER TABLE / ALTER TABLE / CREATE FUNCTION / COMMENT`.
`--single-transaction` یعنی شکست، خودبه‌خود برمی‌گردد.

### قدم ۲ — تأیید ۴۲۰ (فقط خواندن)

```powershell
docker exec -e PGPASSWORD=$env:PGPASSWORD afrakala-lan-db psql -U supabase_admin -d $DB -A -t -c @"
SELECT md5(pg_get_functiondef(oid))||' | '||pronargs||' | '||pg_get_userbyid(proowner)
     ||' | '||prosecdef||' | '||proconfig::text
FROM pg_proc WHERE proname='create_sales_quote_with_items';
"@
```

**معیار قبولی:** md5 = `c01224ec6d15940ba68d6bc631f920e3` · `19 | supabase_admin | t | {search_path=public}`.
**هر اختلاف در چهار مورد آخر یعنی تغییر امنیتی — بی‌درنگ متوقف شوید و برگردید.**

### قدم ۳ — مایگریشن ۴۲۱

عیناً مثل قدم ۱، با `20260903140000_421_guest_refusal_message_tells_the_truth.sql`،
md5 مرجع `9ca95c27ec7cd0472b78c21a0cd9a5c2`، و نسخهٔ دفترچه `20260903140000`.

**زمان تخمینی:** `439ms` روی استیجینگ. این یکی فقط تابع را عوض می‌کند و به حجم جدول **وابسته
نیست** — روی هر حجمی زیر یک ثانیه.

**معیار قبولی:** خروجی `SET / CREATE FUNCTION`، و پس از آن md5 = `2cd11b81bfab0c6ba795e405ee539098`.

### قدم ۴ — تأیید نهایی (فقط خواندن)

```powershell
docker exec -e PGPASSWORD=$env:PGPASSWORD afrakala-lan-db psql -U supabase_admin -d $DB -A -t -c @"
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid='public.sales_quotes'::regclass AND conname='sales_quotes_exception_type_check';
"@
```
سپس شمارش قدم ۰ را دوباره بگیرید.

**معیار قبولی:** محدودیت حالا **چهار** مقدار دارد، و **همهٔ شمارش‌ها دقیقاً مثل قدم ۰**اند.
مایگریشن‌ها داده نمی‌نویسند؛ هر تفاوتی یعنی چیز دیگری اتفاق افتاده — متوقف شوید.

---

## runbook بازگشت — متن نهایی

### پیش‌بررسی اجباری، پیش از هر تلاشی برای باریک‌کردن محدودیت

```sql
-- فقط خواندن. اگر خروجی ناصفر بود، همین‌جا متوقف شوید و محدودیت را باریک نکنید.
SELECT count(*) AS guest_rows FROM public.sales_quotes WHERE quote_exception_type = 'guest_no_link';
```

**چرا:** به‌محض وجود یک سند `guest_no_link`، بازگرداندن محدودیت به سه مقدار با `23514` می‌افتد.
روی استیجینگ واقعاً رخ داد:

```
ERROR:  check constraint "sales_quotes_exception_type_check" of relation "sales_quotes"
        is violated by some row
```

### بازگشت درست: فقط تابع، محدودیت گشاد بماند

**تابع دروازه است، نه محدودیت.** تابعِ برگردانده‌شده `guest_no_link` را در فهرست سفید خودش رد
می‌کند (`22023 نوع تعهد یا تأیید انتخاب‌شده معتبر نیست`)، پس هیچ سند تازه‌ای با آن مقدار نوشته
نمی‌شود؛ و محدودیتی که از تابع گشادتر است هیچ دری باز نمی‌کند.

| بازگشت از | فایل | md5 هدف پس از اجرا | زمان اندازه‌گیری‌شده |
|---|---|---|---|
| ۴۲۱ | `docs/release/421-rollback-create_sales_quote_with_items.sql` | `c01224ec6d15940ba68d6bc631f920e3` | ۹۵۱ms |
| ۴۲۰ | `docs/release/420-rollback-create_sales_quote_with_items.sql` | `f73e5177c99b75cecfe313fd8f772d0c` | ۱۲۷۶ms |

> **اگر شرط ۲ پیش‌شرط‌ها پاس نشد** (md5 سامانهٔ اصلی با استیجینگ فرق داشت)، این دو فایل معتبر
> نیستند و باید از خروجی بند ج۴ پیش‌پرواز استفاده شود.

### ممنوعیت صریح

**بازنویسی یا حذف ردیف‌های `guest_no_link` ممنوع است.** بازنویسی، جعل رکورد حسابرسی است؛ حذف،
حذف داده. هر دو با قواعد `CLAUDE.md` در تضادند و مسئله را هم حل نمی‌کنند — محدودیتِ گشاد بی‌ضرر
است.

### ترتیب بازگشت کامل

```
۱. فلگ را در .env خاموش کن  →  rebuild  →  استقرار
۲. سپس بازگشت ۴۲۱
۳. سپس بازگشت ۴۲۰
```

**ترتیب معکوس خطرناک است:** کدی که `guest_no_link` می‌فرستد به تابعِ برگردانده‌شده، رد می‌شود و
فروش حضوری بن‌بست می‌خورد. و خاموش‌کردن فلگ **بدون rebuild اثری ندارد** — Vite مقدار را در زمان
build جاسازی می‌کند.
