# فهرست‌برداری، اثر گارد ۴۱۵، و ترتیب نهایی اعمال

۲۰۲۶-۰۹-۰۳ · انتشار جمعه **لغو** شد. هیچ چیزی روی سامانهٔ اصلی اجرا نشد.

---

## کار ۱ — فهرست‌برداری کامل از کاتالوگ

دفترچه قابل اتکا نیست (**۶۰۷ فایل / ۵۶۹ ردیف**)، پس وضعیت از خودِ کاتالوگ خوانده می‌شود. خروجی
متنی، مرتب، و خط‌به‌خط قابل `diff` است. **هیچ فایلی روی دیسک ساخته نمی‌شود.**

### روی تست اجرا شد — اثرانگشت مبنا

| بخش | تست (اندازه‌گیری‌شده ۲۰۲۶-۰۹-۰۳) |
|---|---|
| توابع schema عمومی | **۸۳۶** |
| جدول‌ها | **۲۲۴** |
| ستون‌ها | **۲۶۵۴** |
| محدودیت‌ها | **۹۹۳** |
| تریگرها | **۲۶۱** |
| سیاست‌های RLS | **۶۱۸** |
| ایندکس‌ها | **۸۵۷** |

اعداد با همان بلوک زیر و روی همین دیتابیس گرفته شده‌اند. روی سامانهٔ اصلی تکرار و **خط‌به‌خط**
`diff` شوند — عدد کلی فقط برای تشخیص سریع اختلاف بزرگ است؛ تفاوت واقعی از INV-2 تا INV-7 درمی‌آید.

---

## کار ۲ — اثر گارد ۴۱۵ 🔴 دو پیش‌شرط که باید پیش از اعمال سنجیده شوند

**۴۱۵ چه می‌کند:** تنها یک `CREATE OR REPLACE FUNCTION` به‌علاوهٔ یک بلوک تأیید. **هیچ
`ALTER TABLE`، هیچ ایندکس، هیچ داده‌ای نمی‌نویسد** (خودِ فایل خط ۲۰-۲۱ همین را می‌گوید).

گارد تازه، خطوط **۱۴۴-۱۵۰**:

```sql
IF _src IN ('manual','quick_price') THEN
  RAISE EXCEPTION 'این کالا در سیستم تعریف نشده است. …' USING ERRCODE = '22023';
END IF;
IF _src <> 'product_price' THEN
  RAISE EXCEPTION 'منبع آیتم نامعتبر است: %', COALESCE(_src,'(null)') USING ERRCODE = '22023';
END IF;
```

**الزام تازه:** هر خط پیش‌فاکتور باید `source = 'product_price'` و `product_id` ناتهی داشته باشد.
دو مقدار از سه مقدار enum — `manual` و `quick_price` — ممنوع می‌شوند.

**🟢 گذشته‌نگر نیست.** `RAISE` داخل بدنهٔ تابع است، نه `CHECK` و نه تریگر. پس **هیچ ردیف موجودی
اعتبارسنجی، بازنویسی یا حذف نمی‌شود** — فقط نوشتن‌های آینده از مسیر RPC.

**۴۱۷:** یک `ALTER TABLE ... ADD COLUMN accepted_at`، یک `CREATE OR REPLACE FUNCTION` و یک
`COMMENT`. ستون تازه `NULL` می‌ماند؛ backfill کار ۴۱۸ است.

### 🔴 پیش‌شرط الف — بلوک تأیید ۴۱۵ به یک ردیف داده وابسته است

خطوط ۳۸۳-۳۸۵ فایل:

```sql
IF NOT EXISTS (SELECT 1 FROM public.sales_quote_items WHERE product_id IS NULL) THEN
  RAISE EXCEPTION '415: the historical free item vanished; it was meant to be left alone';
END IF;
```

روی تست دقیقاً **یک** چنین ردیفی هست (`manual`, از ۲۰۲۶-۰۷-۱۹). **اگر سامانهٔ اصلی صفر ردیف
بدون `product_id` داشته باشد، ۴۱۵ با خطا می‌افتد و زیر `--single-transaction` کاملاً برمی‌گردد** —
یعنی هیچ چیز نصب نمی‌شود.

**اگر آنجا صفر بود:** ۴۱۵ را **ویرایش نکنید** (قاعدهٔ ۶). یک مایگریشن تازه لازم است که همان تابع را
بدون آن assertion نصب کند — و آن، تصمیم مالک است.

### 🔴 پیش‌شرط ب — آیا گارد ثبت‌های امروزیِ تیم فروش را رد می‌کند؟

اگر تیم فروش امروز از تب‌های «محاسبهٔ سریع» یا «دستی» استفاده می‌کند، **پس از ۴۱۵ آن مسیر بسته
می‌شود**. این را باید **پیش از** اعمال سنجید. کوئری‌هایش در بلوک زیر (۱۹ تا ۲۲).

> **اگر سهم ۹۰ روزهٔ `manual`/`quick_price` ناصفر باشد، ۴۱۵ مسدودکنندهٔ انتشار است** تا وقتی مالک
> تصمیم بگیرد آن مسیر بسته شود یا نه. این تصمیم کسب‌وکار است، نه فنی.

---

## کار ۳ — ترتیب نهایی، مشروط به سبز شدن کارهای ۱ و ۲

### وضعیت ۴۱۱ تا ۴۱۹

| # | برای این انتشار | چرا |
|---|---|---|
| ۴۱۱ | **بی‌ربط — و خطرناک** | دامنهٔ امتیاز اعتبار را گشاد می‌کند و **سقف اعتبار مشتریان واقعی را بازمی‌نویسد** (قاعدهٔ ۱۰). به ۴۲۰ ربطی ندارد. جدا و با تأیید مالک. |
| ۴۱۲ | بی‌ربط | فقط `input_hint` را با دامنهٔ ۴۱۱ هم‌راست می‌کند. |
| ۴۱۳ | **بی‌ربط — و خطرناک** | همان الگوی ۴۱۱ برای امتیاز فروشندگان. |
| ۴۱۴ | بی‌ربط | «هر شخص یک مشتری است» — صریحاً از دامنهٔ ما بیرون. |
| ۴۱۵ | **لازم** | ۴۲۰ بدنهٔ پس از ۴۱۵ را می‌نویسد. بدون آن، ۴۲۰ گارد محصول را بی‌صدا حمل می‌کند. |
| ۴۱۶ | بی‌ربط | `settlement_types` — انتشار جداگانه‌ای بود. |
| ۴۱۷ | **لازم** | تابع را عوض می‌کند و پس از ۴۱۵ می‌آید؛ ۴۲۰ بدنهٔ پس از ۴۱۷ را می‌نویسد. |
| ۴۱۸ | **لازم نیست ولی احتمالاً اعمال شده** | backfill `accepted_at`. تابع را دست نمی‌زند. |
| ۴۱۹ | بی‌ربط | سررسید مطالبات؛ مالک آن را به پس از انتشار موکول کرده. |

**ترتیب وابستگی:** ۴۱۵ → ۴۱۷ → ۴۲۰ → ۴۲۱. هر چهار تابع را عوض می‌کنند و ترتیبشان اجباری است.

### ترتیب اعمال، با md5 و معیار توقف

| قدم | md5 پیش | md5 پس | معیار توقف | برگشت‌پذیر؟ |
|---|---|---|---|---|
| **۰** پیش‌سنجی | — | — | ردیف بدون `product_id` باید **≥۱** باشد؛ سهم ۹۰ روزهٔ `manual`/`quick_price` باید **۰** باشد | — |
| **۱** ۴۱۵ | `0fd814aa…` | (بسنجید و ثبت کنید) | هر خروجی جز `CREATE FUNCTION`؛ یا شکست بلوک تأیید | **بله** — فقط تابع |
| **۲** ۴۱۷ | خروجی قدم ۱ | `c1bc8e81…` | همان | **نه کاملاً** — `ADD COLUMN accepted_at` می‌ماند (بی‌ضرر، `NULL`) |
| **۳** ۴۲۰ | `c1bc8e81…` | `c01224ec…` | `ALTER/ALTER/CREATE FUNCTION/COMMENT` | **بله** — تابع؛ محدودیت گشاد بماند |
| **۴** ۴۲۱ | `c01224ec…` | `2cd11b81…` | `SET/CREATE FUNCTION` | **بله** |

> **قدم ۲ تنها قدم برگشت‌ناپذیر است** و برگشت‌ناپذیریش بی‌ضرر است: یک ستون `NULL` که هیچ کدی
> اجباری‌اش نمی‌کند. `DROP COLUMN` ممنوع است.

**بازگشت هر قدم:** فایل `pg_get_functiondef` گرفته‌شده **پیش از همان قدم**. برای ۴۱۵ و ۴۱۷ این
فایل‌ها هنوز وجود ندارند — باید در قدم ۰ روی خودِ سامانهٔ اصلی گرفته شوند.

---

## بلوک آمادهٔ کپی — کارهای ۱، ۲ و ۱۸ کوئری قبلی، یک‌جا

```powershell
# =====================================================================================
#  فهرست‌برداری + وابستگی‌ها + اثر ۴۱۵ — روی لپ‌تاپ سامانهٔ اصلی
#  فقط خواندن. اجبار فقط‌خواندنی توسط خودِ پستگرس. هیچ فایلی ساخته نمی‌شود.
# =====================================================================================
$RO = "-c default_transaction_read_only=on"
function Q($n, $sql, $pass) {
  Write-Host "`n--- $n" -ForegroundColor Cyan
  Write-Host "    قبولی: $pass" -ForegroundColor DarkGray
  docker exec -e PGOPTIONS=$RO afrakala-lan-db psql -U postgres -d postgres -A -t -c $sql
}

# ---------- دروازهٔ اجباری ----------
Q "gate-1 SELECT" "SELECT 1;" "باید 1 برگرداند"
Q "gate-2 CREATE" "CREATE TEMP TABLE probe_ro(x int);" "باید read-only transaction بدهد"
Q "gate-3 UPDATE" "UPDATE public.sales_quotes SET id=id WHERE false;" "باید read-only transaction بدهد"
Write-Host "`n>>> اگر دو مورد آخر رد نشدند، همین‌جا متوقف شوید." -ForegroundColor Red

# ---------- کار ۱: فهرست‌برداری با اثرانگشت ----------
Q "INV-1 شمارش کلی" @"
SELECT 'functions='||(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f')
    ||'  tables='||(SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE')
    ||'  columns='||(SELECT count(*) FROM information_schema.columns WHERE table_schema='public')
    ||'  constraints='||(SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public')
    ||'  triggers='||(SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal)
    ||'  policies='||(SELECT count(*) FROM pg_policies WHERE schemaname='public')
    ||'  indexes='||(SELECT count(*) FROM pg_indexes WHERE schemaname='public');
"@ "تست بود: functions=836 tables=224 columns=2654 constraints=993 triggers=261 policies=618 indexes=857"

Q "INV-2 توابع با اثرانگشت" @"
SELECT p.proname||'('||pg_get_function_identity_arguments(p.oid)||') = '||md5(pg_get_functiondef(p.oid))
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prokind='f' ORDER BY 1;
"@ "خط‌به‌خط با خروجی تست diff شود"

Q "INV-3 ستون‌ها" @"
SELECT table_name||'.'||column_name||' '||data_type||' null='||is_nullable
FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position;
"@ "diff خط‌به‌خط"

Q "INV-4 محدودیت‌ها" @"
SELECT c.conrelid::regclass::text||' :: '||c.conname||' :: '||pg_get_constraintdef(c.oid)
FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public'
ORDER BY 1;
"@ "diff خط‌به‌خط"

Q "INV-5 تریگرها" @"
SELECT c.relname||' :: '||t.tgname||' :: '||p.proname
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY 1;
"@ "diff خط‌به‌خط"

Q "INV-6 سیاست‌ها" @"
SELECT tablename||' :: '||policyname||' :: '||cmd||' :: '||COALESCE(qual,'-')||' :: '||COALESCE(with_check,'-')
FROM pg_policies WHERE schemaname='public' ORDER BY 1;
"@ "diff خط‌به‌خط"

Q "INV-7 ایندکس‌ها" @"
SELECT tablename||' :: '||indexname||' :: '||indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY 1;
"@ "diff خط‌به‌خط"

# ---------- کار ۲: اثر گارد ۴۱۵ ----------
Q "415-A ردیف نگهبانِ بلوک تأیید" @"
SELECT count(*) FROM public.sales_quote_items WHERE product_id IS NULL;
"@ "باید >= 1 باشد. اگر 0 است، 415 با خطا برمی‌گردد و چیزی نصب نمی‌شود — متوقف شوید."

Q "415-B توزیع source روی همهٔ ردیف‌ها" @"
SELECT source::text||' = '||count(*)||' (بدون product_id: '||count(*) FILTER (WHERE product_id IS NULL)||')'
FROM public.sales_quote_items GROUP BY 1 ORDER BY 1;
"@ "فقط شناخت وضعیت — گارد گذشته‌نگر نیست و این ردیف‌ها دست نمی‌خورند"

Q "415-C فعالیت ۹۰ روزه که پس از ۴۱۵ رد می‌شود" @"
SELECT 'اقلام ۹۰روزه: کل='||count(*)
     ||'  manual='||count(*) FILTER (WHERE i.source::text='manual')
     ||'  quick_price='||count(*) FILTER (WHERE i.source::text='quick_price')
     ||'  بدون product_id='||count(*) FILTER (WHERE i.product_id IS NULL)
FROM public.sales_quote_items i JOIN public.sales_quotes q ON q.id=i.quote_id
WHERE q.created_at >= now() - interval '90 days';
"@ "manual و quick_price باید صفر باشند. ناصفر ⇒ 415 مسیر فعال تیم فروش را می‌بندد ⇒ مسدودکننده."

Q "415-D همان، ۳۰ روزه" @"
SELECT 'اقلام ۳۰روزه: کل='||count(*)
     ||'  manual+quick='||count(*) FILTER (WHERE i.source::text IN ('manual','quick_price'))
FROM public.sales_quote_items i JOIN public.sales_quotes q ON q.id=i.quote_id
WHERE q.created_at >= now() - interval '30 days';
"@ "همان معیار، بازهٔ کوتاه‌تر"

# ---------- ۱۸ کوئری وابستگی (از production-dependency-checks.md) ----------
Write-Host "`n>>> حالا بلوک ۱۸ کوئریِ production-dependency-checks.md را اجرا کنید." -ForegroundColor Yellow
```
