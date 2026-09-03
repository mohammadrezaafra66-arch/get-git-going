# کوئری‌های تأیید وابستگی — روی لپ‌تاپ سامانهٔ اصلی اجرا شود

> **فقط خواندن. من اجرا نکردم و به آن ماشین وصل نشدم.**
> چرا لازم است: دفتر مایگریشن آن ماشین قابل اتکا نیست — **۶۰۷ فایل روی دیسک، ۵۶۹ ردیف ثبت‌شده**، و
> ۴۱۸ اعمال‌شده ولی ثبت‌نشده. پس وضعیت باید از خودِ ساختار دیتابیس تأیید شود، نه از دفترچه.

الگوی اتصال (فقط‌خواندنی، اجباری):

```
docker exec -e PGOPTIONS="-c default_transaction_read_only=on" afrakala-lan-db psql -U postgres -d postgres -A -t -c "<کوئری>"
```

---

## ۴۲۰ و ۴۲۱ به چه چیزهایی وابسته‌اند

| # | وابستگی | چرا |
|---|---|---|
| ۱ | جدول `public.sales_quotes` با ستون `quote_exception_type` از نوع `text` | ۴۲۰ محدودیت آن را بازمی‌سازد |
| ۲ | محدودیت `sales_quotes_exception_type_check` با **همان نام** | ۴۲۰ آن را `DROP` و دوباره `ADD` می‌کند؛ نام دیگر ⇒ `DROP` می‌افتد |
| ۳ | ستون `commitment_confirmed` | ۴۲۰ `COMMENT ON` رویش می‌گذارد |
| ۴ | تابع `create_sales_quote_with_items` با **همان ۱۹ پارامتر** | هر دو `CREATE OR REPLACE` می‌کنند؛ امضای متفاوت ⇒ overload |
| ۵ | **md5 تعریف تابع = پیش از ۴۱۵** | بدنه‌ای که ۴۲۰ می‌نویسد از نسخهٔ **پس از ۴۱۵** ساخته شده |
| ۶ | مالک `supabase_admin`, `prosecdef=true`, `search_path=public` | باید دست‌نخورده بمانند |
| ۷ | schema `supabase_migrations` و جدول `schema_migrations` | ثبت دفترچه |
| ۸ | جدول `audit_logs` با ستون‌های `entity_type/entity_id/diff` | کد این انتشار رویشان می‌نویسد |
| ۹ | سیاست‌های RLS جدول `customers` | دکمهٔ افزودن شماره به آن‌ها وابسته است |

---

## بلوک آمادهٔ کپی

```powershell
$q = @(
  # ۱. ستون استثنا موجود و از نوع text است.  قبولی: quote_exception_type|text
  "SELECT column_name||'|'||data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='sales_quotes' AND column_name='quote_exception_type';",

  # ۲. محدودیت با همین نام هست و سه‌مقداری است.  قبولی: یک ردیف، بدون guest_no_link
  "SELECT conname||' :: '||pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.sales_quotes'::regclass AND conname='sales_quotes_exception_type_check';",

  # ۳. ستون تعهد موجود است.  قبولی: commitment_confirmed|boolean
  "SELECT column_name||'|'||data_type FROM information_schema.columns WHERE table_name='sales_quotes' AND column_name='commitment_confirmed';",

  # ۴. تابع یکتاست و ۱۹ پارامتر دارد.  قبولی: یک ردیف، عدد ۱۹
  "SELECT count(*)||' function(s), nargs='||max(pronargs) FROM pg_proc WHERE proname='create_sales_quote_with_items';",

  # ۵. md5 تعریف تابع.  قبولی: 0fd814aa4a8ef7852557842f5ca1b312 (= نسخهٔ پیش از ۴۱۵)
  #    هر مقدار دیگری یعنی نقطهٔ شروع آن چیزی نیست که ۴۲۰ برایش ساخته شده — متوقف شوید.
  "SELECT md5(pg_get_functiondef(oid)) FROM pg_proc WHERE proname='create_sales_quote_with_items';",

  # ۶. ناوردایی‌های امنیتی.  قبولی: 19|supabase_admin|t|{search_path=public}
  "SELECT pronargs||'|'||pg_get_userbyid(proowner)||'|'||prosecdef||'|'||proconfig::text FROM pg_proc WHERE proname='create_sales_quote_with_items';",

  # ۷. GRANTها — مبنای مقایسهٔ پس از مایگریشن.
  "SELECT string_agg(grantee||':'||privilege_type, ', ' ORDER BY grantee) FROM information_schema.routine_privileges WHERE routine_name='create_sales_quote_with_items';",

  # ۸. دفترچه هست و قابل نوشتن.  قبولی: یک ردیف با نام جدول
  "SELECT table_schema||'.'||table_name FROM information_schema.tables WHERE table_schema='supabase_migrations' AND table_name='schema_migrations';",

  # ۹. آیا ۴۲۰/۴۲۱ قبلاً ثبت شده‌اند؟  قبولی: صفر
  "SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version IN ('20260903100000','20260903140000');",

  # ۱۰. ستون‌های audit_logs.  قبولی: id:NO, actor_id:YES, entity_type:NO, entity_id:NO, action:NO, diff:YES, created_at:NO
  "SELECT string_agg(column_name||':'||is_nullable, ', ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs';",

  # ۱۱. شماره تماس اجباری بماند.  قبولی: customer_name=NO, customer_phone=NO, customer_id=YES
  "SELECT string_agg(column_name||'='||is_nullable, ', ' ORDER BY column_name) FROM information_schema.columns WHERE table_name='sales_quotes' AND column_name IN ('customer_id','customer_name','customer_phone');",

  # ۱۲. تریگرهای sales_quotes.  قبولی: شامل trg_audit_sales_quotes؛ روی تست ۹ عدد بود
  "SELECT count(*)||' :: '||string_agg(tgname, ', ' ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.sales_quotes'::regclass AND NOT tgisinternal;",

  # ۱۳. سیاست‌های RLS مشتریان — دکمهٔ افزودن شماره به این‌ها وابسته است.
  "SELECT string_agg(policyname||'/'||cmd, ' | ' ORDER BY policyname) FROM pg_policies WHERE tablename='customers';",

  # ۱۴. RLS روی customers فعال است.  قبولی: t
  "SELECT relrowsecurity FROM pg_class WHERE oid='public.customers'::regclass;",

  # ۱۵. توابع کمکی سیاست‌ها موجودند.  قبولی: has_role, has_any_role, is_viewer_only
  "SELECT string_agg(proname, ', ' ORDER BY proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND proname IN ('has_role','has_any_role','is_viewer_only');",

  # ۱۶. سهم مشتریانی که کارشناس فروش اصلاً نمی‌بیند.  فقط شمارش — بارِ واقعی دکمهٔ افزودن شماره
  "SELECT 'responsible_id NULL='||count(*) FILTER (WHERE responsible_id IS NULL)||'  set='||count(*) FILTER (WHERE responsible_id IS NOT NULL)||'  فعال='||count(*) FILTER (WHERE is_active) FROM public.customers;",

  # ۱۷. ایندکس یکتا روی شماره تماس؟  قبولی: خالی (یعنی ندارد — نقص شناخته‌شده)
  "SELECT COALESCE(string_agg(indexname, ', '),'(none)') FROM pg_indexes WHERE schemaname='public' AND tablename='customers' AND indexdef ILIKE '%unique%' AND indexdef ILIKE '%phone%';",

  # ۱۸. تریگر نرمال‌سازی شماره — بازنویسی مقدار.  قبولی: trg_normalize_phone
  "SELECT COALESCE(string_agg(tgname, ', '),'(none)') FROM pg_trigger WHERE tgrelid='public.customers'::regclass AND NOT tgisinternal;"
)

foreach ($i in 0..($q.Count-1)) {
  Write-Host "`n--- کوئری $($i+1)" -ForegroundColor Cyan
  docker exec -e PGOPTIONS="-c default_transaction_read_only=on" afrakala-lan-db psql -U postgres -d postgres -A -t -c $q[$i]
}
```

## نتیجهٔ نهایی که این بلوک باید بدهد

**یا** «هر چیزی که ۴۲۰ و ۴۲۱ نیاز دارند موجود است» — یعنی کوئری‌های ۱ تا ۴ و ۶ تا ۱۵ پاس، کوئری
۵ برابر `0fd814aa4a8ef7852557842f5ca1b312`، و کوئری ۹ برابر صفر.

**یا** فهرست دقیق چیزهای غایب. هر انحراف در کوئری ۵ یا ۶ **مسدودکننده** است.
