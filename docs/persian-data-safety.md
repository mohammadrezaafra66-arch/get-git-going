# راهنمای ایمنی داده فارسی

## چه اتفاقی افتاد

در چند اجرای بارگذاری داده — متمرکز در ۲۰۲۶-۰۷-۱۱ بین ساعت ۱۶:۵۶ تا ۱۹:۳۹، به
همراه یک اجرای زودتر در ۲۰۲۶-۰۵-۲۴ و یکی دیگر در ۲۰۲۶-۰۷-۱۹ روی پایگاه دادهٔ
`postgres` — متن فارسی از مسیر کنسول پیش‌فرض ویندوز عبور کرد. کنسول متن را به
کدپیج ANSI/OEM تبدیل کرد و هر کاراکتری که در آن کدپیج معادل نداشت به `?` تبدیل
شد. این اتفاق **پیش از رسیدن بایت‌ها به پستگرس** رخ داد؛ یعنی پایگاه داده مقصر
نیست: `server_encoding` و `client_encoding` هر دو UTF8 هستند و داده‌های اصلی
سالم مانده‌اند (`products.name` ۳۵۴ از ۳۵۴، `customers.name` ۶ از ۶).

نتیجه: ۷۰۶ مقدار در ۲۲ جدول از بین رفت. این خرابی **بازگشت‌ناپذیر** است؛ وقتی
کاراکتری به `?` تبدیل شد، بایت اصلی دیگر وجود ندارد.

## تنظیم کنسول که جلوی تکرارش را می‌گیرد

پیش از هر کاری که متن فارسی را از PowerShell عبور می‌دهد:

```powershell
chcp 65001
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding            = [System.Text.Encoding]::UTF8
```

هر سه خط لازم است: `chcp` کدپیج کنسول را عوض می‌کند، `[Console]::OutputEncoding`
خروجی را، و `$OutputEncoding` چیزی را که PowerShell به برنامه‌های بیرونی
می‌فرستد.

## چرا `-f file.sql` امن‌تر از لوله (pipe) است

وقتی SQL را با `|` به `psql` می‌دهید، متن از لایهٔ کدگذاری کنسول رد می‌شود و
همان‌جا خراب می‌شود. با `-f` فایل مستقیم توسط `psql` خوانده می‌شود و کنسول اصلاً
در مسیر نیست.

```powershell
# نادرست — فارسی از لوله رد می‌شود
Get-Content -Raw fix.sql | docker exec -i afrakala-lan-db psql -U supabase_admin -d afrakala

# درست — فایل کپی و مستقیم خوانده می‌شود
docker cp fix.sql afrakala-lan-db:/tmp/fix.sql
docker exec -e PGCLIENTENCODING=UTF8 afrakala-lan-db psql -v ON_ERROR_STOP=1 -U supabase_admin -d afrakala -f /tmp/fix.sql
```

هنگام ساختن فایل SQL هم حتماً `-Encoding utf8` بدهید؛ `Set-Content` به‌صورت
پیش‌فرض کدپیج ANSI سیستم را می‌نویسد:

```powershell
Set-Content -Path fix.sql -Encoding utf8 -Value $sql
```

## بررسی پس از هر درج گروهی

بعد از هر بارگذاری، روی جدولی که نوشته‌اید این را اجرا کنید. باید صفر برگرداند:

```sql
SELECT count(*) FROM public.<table> WHERE <column> ~ '\?{3,}';
```

اگر صفر نبود: تغییر را برگردانید و مسیر را درست کنید. **دوباره اجرا کردن مشکل را
حل نمی‌کند** و فقط ردیف‌های خراب بیشتری می‌سازد.

## نکتهٔ `pg_dump`

در PowerShell، تغییر مسیر با `>` خروجی را UTF-16 می‌نویسد و فایل نتیجه برای
`psql` غیرقابل استفاده می‌شود. همیشه از سوئیچ `-f` خود `pg_dump` استفاده کنید:

```powershell
# نادرست در PowerShell
pg_dump -U postgres -d afrakala > dump.sql

# درست
pg_dump -U postgres -d afrakala -f dump.sql
```

## وضعیت اسکریپت‌های مخزن

بررسی شد:

- `deploy/lan/scripts/import-products-staged.ps1` و
  `import-purchase-prices-staged.ps1` از الگوی امن استفاده می‌کنند: مسیر فایل را
  به‌صورت متغیر `psql` پاس می‌دهند و با `-f` اجرا می‌کنند، نه لوله. سالم ماندن
  `products.name` با همین می‌خواند. **نیازی به تغییر ندارند.**
- `deploy/backups/scripts/backup-postgres.sh` از `pg_dump -Fc ... > file`
  استفاده می‌کند، اما این اسکریپت **bash** است و داخل لینوکس اجرا می‌شود؛
  تغییر مسیر در bash بایت‌به‌بایت است و مشکل UTF-16 پاورشل را ندارد. ضمناً
  `-Fc` قالب باینری است. **نیازی به تغییر ندارد.**
- الگوی ناامن فقط در **مستندات** دیده شد، نه در اسکریپت‌های اجرایی:
  `docs/AfraKala-fix-weight-validity.md` خطوط ۳۳ و ۲۵۲، و
  `docs/baseline/TPC_I_003_...APPLY_CHECKLIST_2026_06_08.md` خط ۶۰،
  که همگی `Get-Content ... | docker exec -i ... psql` را توصیه می‌کنند. این
  فایل‌ها سند تاریخی‌اند و در این مرحله ویرایش نشدند؛ اگر دوباره از آن‌ها
  دستورالعمل برداشته شود، باید به شکل `-f` بازنویسی شوند.
