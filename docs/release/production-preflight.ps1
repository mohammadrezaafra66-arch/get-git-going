# =====================================================================================
#  پیش‌پرواز انتشار مسیر مهمان — روی لپ‌تاپ پروداکشن اجرا شود
#  ساخته ۲۰۲۶-۰۹-۰۳ · نسخهٔ هدف e4c06914 · مایگریشن‌های ۴۲۰ و ۴۲۱
#
#  ── اجبار فقط‌خواندنی ─────────────────────────────────────────────────────────────
#  هر اتصال با PGOPTIONS='-c default_transaction_read_only=on' باز می‌شود. این را خودِ
#  پستگرس اعمال می‌کند، نه ادب نویسنده: بند «۰-۲» زیر با CREATE و UPDATE امتحانش می‌کند و
#  اگر رد نشدند، اسکریپت همان‌جا متوقف می‌شود. روی استیجینگ سنجیده شد:
#      CREATE TEMP TABLE → ERROR: cannot execute CREATE TABLE in a read-only transaction
#      UPDATE            → ERROR: cannot execute UPDATE in a read-only transaction
#      SELECT            → کار می‌کند
#
#  ── دربارهٔ docker ─────────────────────────────────────────────────────────────────
#  مالک خواست هیچ فرمان docker نباشد. سرویس db در deploy/lan/docker-compose.yml هیچ پورتی
#  منتشر نمی‌کند (بلوک ports کامنت است) و psql روی هاست نصب نیست، پس `docker exec` تنها
#  راه رسیدن به پستگرس است. آنچه اینجا هست فقط و فقط `docker exec ... psql` است:
#  هیچ restart، هیچ compose، هیچ rm، هیچ docker ps. اگر مالک ترجیح می‌دهد docker اصلاً
#  نباشد، باید یا خط ports را باز کند یا psql روی هاست نصب شود — تصمیم اوست، نه من.
#
#  ── دیگر قیدها ────────────────────────────────────────────────────────────────────
#  هیچ نوشتنی روی دیسک. هیچ نام، شماره تماس، آدرس یا کد ملی در خروجی — هر چیزی که
#  می‌توانست، شمرده یا فقط به‌صورت نامِ ستون آمده.
#
#  اجرا:  cd C:\afrakala ;  .\docs\release\production-preflight.ps1
#  خروجی را کامل کپی کنید و بفرستید. هیچ قدمی از انتشار را انجام نمی‌دهد.
# =====================================================================================

$ErrorActionPreference = "Continue"
$DB    = "postgres"          # روی پروداکشن نام دیتابیس این است، نه afrakala
$CT    = "afrakala-lan-db"
$PGOPT = "-c default_transaction_read_only=on"
$pw    = (Select-String -Path "deploy\lan\.env.lan" -Pattern '^POSTGRES_PASSWORD=(.*)$').Matches.Groups[1].Value

function RO($sql) {
  docker exec -e PGPASSWORD=$pw -e PGOPTIONS=$PGOPT $CT psql -U supabase_admin -d $DB -A -F' | ' -t -c $sql 2>&1
}
function Q($label, $sql, $pass) {
  Write-Host "`n--- $label" -ForegroundColor Cyan
  Write-Host "    قبولی: $pass" -ForegroundColor DarkGray
  RO $sql
}

Write-Host "===== ۰. هویت ماشین، شاخه، و اثبات فقط‌خواندنی =====" -ForegroundColor Yellow
Write-Host "hostname : $(hostname)"
Write-Host "cwd      : $(Get-Location)"
# می‌سنجد: اسکریپت دیپلوی `git pull --ff-only origin <همین شاخه>` می‌زند (update-lan.ps1:41-47).
# قبولی: نام شاخه با آنچه merge می‌شود یکی باشد. detached بود ⇒ انتشار متوقف.
Write-Host "branch   : $(git rev-parse --abbrev-ref HEAD)"
Write-Host "HEAD     : $(git rev-parse --short HEAD)"
Write-Host "دیتابیس  : $DB"

Write-Host "`n--- ۰-۲ اثبات اینکه اتصال واقعاً فقط‌خواندنی است" -ForegroundColor Cyan
$roOk  = (RO "SELECT 1;") -match '^\s*1\s*$'
$noDdl = (RO "CREATE TEMP TABLE preflight_probe(x int);") -match 'read-only transaction'
$noUpd = (RO "UPDATE public.sales_quotes SET customer_note = customer_note WHERE false;") -match 'read-only transaction'
Write-Host "    SELECT کار می‌کند      : $(if ($roOk)  {'بله ✓'} else {'خیر ✗'})"
Write-Host "    CREATE رد می‌شود       : $(if ($noDdl) {'بله ✓'} else {'خیر ✗'})"
Write-Host "    UPDATE رد می‌شود       : $(if ($noUpd) {'بله ✓'} else {'خیر ✗'})"
if (-not ($roOk -and $noDdl -and $noUpd)) {
  Write-Host "`n✗ اجبار فقط‌خواندنی برقرار نشد. اسکریپت متوقف شد — هیچ کوئری دیگری اجرا نمی‌شود." -ForegroundColor Red
  exit 1
}

Write-Host "`n===== الف. مقایسهٔ اسکیما با استیجینگ =====" -ForegroundColor Yellow

Q "الف۱ — مقادیر مجاز quote_exception_type" @"
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid='public.sales_quotes'::regclass AND conname='sales_quotes_exception_type_check';
"@ "باید دقیقاً سه مقدار باشد: overdue_salesperson_commitment, credit_shortfall_salesperson_commitment, accounting_approval. اگر guest_no_link هست، ۴۲۰ قبلاً رفته — متوقف شوید."

Q "الف۲ — ستون‌های audit_logs" @"
SELECT string_agg(column_name||':'||is_nullable, ', ' ORDER BY ordinal_position)
FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs';
"@ "باید باشد: id:NO, actor_id:YES, entity_type:NO, entity_id:NO, action:NO, diff:YES, created_at:NO — مثل استیجینگ. هر ستون اضافه یا کم ⇒ متوقف."

Q "الف۳ — تریگرهای sales_quotes" @"
SELECT string_agg(t.tgname||'->'||p.proname, ', ' ORDER BY t.tgname)
FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
WHERE t.tgrelid='public.sales_quotes'::regclass AND NOT t.tgisinternal;
"@ "باید trg_audit_sales_quotes->audit_sales_quotes را داشته باشد. دست نمی‌زنیم؛ فقط وجودش را می‌سنجیم."

Q "الف۴ — NOT NULL بودن شماره تماس" @"
SELECT string_agg(column_name||' nullable='||is_nullable, ', ' ORDER BY column_name)
FROM information_schema.columns WHERE table_name='sales_quotes'
  AND column_name IN ('customer_phone','customer_name','customer_id');
"@ "customer_name و customer_phone باید NO و customer_id باید YES باشد. شل‌کردن اجباری بودن شماره ممنوع است."

Q "الف۵ — ستون‌های استثنا و commitment" @"
SELECT string_agg(column_name, ', ' ORDER BY column_name) FROM information_schema.columns
WHERE table_name='sales_quotes'
  AND (column_name LIKE 'quote_exception%' OR column_name='commitment_confirmed');
"@ "باید هر هفت ستون quote_exception_* به‌علاوهٔ commitment_confirmed را داشته باشد."

Q "الف۶ — دفترچهٔ مایگریشن" @"
SELECT 'max='||max(version)||'  count='||count(*) FROM supabase_migrations.schema_migrations;
"@ "max باید 20260831210000 (مایگریشن ۴۱۹) باشد. کمتر ⇒ ۴۲۰ زودرس است، متوقف."

Write-Host "`n===== ب. اعداد پروداکشن =====" -ForegroundColor Yellow

Q "ب۱ — پیش‌فاکتورها: کل، مهمان، توزیع استثنا" @"
SELECT 'کل='||count(*)
     ||'  مهمان='||count(*) FILTER (WHERE customer_id IS NULL)
     ||'  accounting_approval='||count(*) FILTER (WHERE quote_exception_type='accounting_approval')
     ||'  credit_shortfall='||count(*) FILTER (WHERE quote_exception_type='credit_shortfall_salesperson_commitment')
     ||'  overdue='||count(*) FILTER (WHERE quote_exception_type='overdue_salesperson_commitment')
     ||'  guest_no_link='||count(*) FILTER (WHERE quote_exception_type='guest_no_link')
     ||'  NULL='||count(*) FILTER (WHERE quote_exception_type IS NULL)
     ||'  commitment_confirmed=true='||count(*) FILTER (WHERE commitment_confirmed)
FROM public.sales_quotes;
"@ "مبنای «قبل». guest_no_link باید صفر باشد. پس از مایگریشن باید همین اعداد بمانند — مایگریشن‌ها داده نمی‌نویسند."

Q "ب۲ — حجم جدول" @"
SELECT 'rows='||count(*) FROM public.sales_quotes;
"@ "۴۲۰ محدودیت را DROP و ADD می‌کند و ADD کل جدول را اعتبارسنجی می‌کند. زیر ۱۰۰ هزار ردیف کسری از ثانیه است؛ خیلی بزرگ‌تر ⇒ پنجرهٔ بلندتر بگیرید."

Q "ب۳ — مشتریان فعال بدون شماره و فعالیت ۹۰ روزه" @"
WITH nophone AS (SELECT id FROM public.customers WHERE is_active AND COALESCE(phone,'')='')
SELECT 'مشتری_فعال='||(SELECT count(*) FROM public.customers WHERE is_active)
     ||'  بدون_شماره='||(SELECT count(*) FROM nophone)
     ||'  از_آن‌ها_معامله_۹۰روز='||(
         SELECT count(DISTINCT q.customer_id) FROM public.sales_quotes q
         WHERE q.customer_id IN (SELECT id FROM nophone)
           AND q.created_at >= now() - interval '90 days');
"@ "روی استیجینگ ۸۶ / ۵۱ / ۰ بود. اگر روی پروداکشن «بدون شماره» بالا باشد و معاملهٔ ۹۰روزه هم داشته باشند، دکمهٔ «افزودن شماره» از روز اول بار سنگینی می‌گیرد و تیم فروش باید از پیش بداند."

Q "ب۴ — ساعت فعالیت (برای پنجرهٔ انتشار)" @"
SELECT string_agg(h||'h='||c, '  ' ORDER BY h) FROM (
  SELECT extract(hour FROM created_at AT TIME ZONE 'Asia/Tehran')::int AS h, count(*) AS c
  FROM public.sales_quotes WHERE created_at >= now() - interval '90 days' GROUP BY 1
) t;
"@ "پنجرهٔ انتشار باید بیرون ساعت‌های پرترافیک باشد."

Write-Host "`n===== ج. تعریف تابع پروداکشن — دستور بازگشت =====" -ForegroundColor Yellow
# می‌سنجد: تعریف زندهٔ پروداکشن ممکن است با استیجینگ یکی نباشد (قاعدهٔ ۴ فایل CLAUDE.md).
Q "ج۱ — md5 تعریف تابع" @"
SELECT md5(pg_get_functiondef(oid)) FROM pg_proc WHERE proname='create_sales_quote_with_items';
"@ "با md5 استیجینگ مقایسه کنید. اگر فرق داشت، بازگشتِ استیجینگ روی پروداکشن معتبر نیست و باید خروجی ج۴ به‌عنوان دستور بازگشت پروداکشن نگه داشته شود."

Q "ج۲ — امضا، owner، SECURITY DEFINER، search_path" @"
SELECT pronargs||' | '||pg_get_userbyid(proowner)||' | '||prosecdef||' | '||proconfig::text
     ||' | '||md5(pg_get_function_identity_arguments(oid))
FROM pg_proc WHERE proname='create_sales_quote_with_items';
"@ "باید 19 | supabase_admin | t | {search_path=public} باشد — همان استیجینگ. هر اختلاف ⇒ متوقف."

Q "ج۳ — GRANTها" @"
SELECT string_agg(grantee||':'||privilege_type, ', ' ORDER BY grantee)
FROM information_schema.routine_privileges WHERE routine_name='create_sales_quote_with_items';
"@ "مبنای مقایسهٔ پس از مایگریشن. باید بدون تغییر بماند."

Q "ج۴ — متن کامل تعریف (دستور بازگشت پروداکشن)" @"
SELECT pg_get_functiondef(oid)||';' FROM pg_proc WHERE proname='create_sales_quote_with_items';
"@ "این خروجی را دستی در docs/release/420-rollback-PRODUCTION.sql ذخیره کنید. اسکریپت عمداً چیزی روی دیسک نمی‌نویسد."

Write-Host "`n===== د. وضعیت پشتیبان =====" -ForegroundColor Yellow
# می‌سنجد: پشتیبان تازه‌ای هست. فقط فهرست‌کردن فایل، بدون خواندن محتوا و بدون نوشتن.
# قبولی: آخرین پشتیبان کمتر از ۲۴ ساعت پیش و اندازهٔ غیرصفر.
foreach ($d in @("C:\afrakala\backups", "C:\afrakala\deploy\lan\backups", "D:\backups")) {
  if (Test-Path $d) {
    Write-Host "--- $d" -ForegroundColor Cyan
    Get-ChildItem $d -File -Recurse -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending | Select-Object -First 5 |
      Format-Table Name, @{N='MB';E={[math]::Round($_.Length/1MB,1)}}, LastWriteTime -AutoSize
  }
}
Write-Host "  ⚠ تاریخ آخرین بازیابی آزمایشی از فایل قابل استنتاج نیست — مالک باید دستی تأیید کند." -ForegroundColor Yellow

Write-Host "`n===== ه. زنجیرهٔ پرچم روی همین ماشین =====" -ForegroundColor Yellow
# می‌سنجد: فایل .env واقعی روی هاست است و ممکن است دستی ویرایش شده باشد؛ اصلاح مخزن
#          به‌تنهایی تضمینش نمی‌کند. نبودِ newline پایانی ریشهٔ خرابی ۲۰۲۶-۰۹-۰۲ بود.
$envFile = "deploy\lan\.env.lan"
if (Test-Path $envFile) {
  $raw   = Get-Content $envFile -Raw
  $lines = Get-Content $envFile
  Write-Host "فایل           : $envFile  ($($lines.Count) خط)"
  Write-Host "newline پایانی : $(if ($raw -match "(`r`n|`n)$") { 'دارد ✓' } else { 'ندارد ✗ — ریشهٔ خرابی قبلی. متوقف شوید.' })"
  $bad = $lines | Where-Object { $_ -match '^[A-Z_]+=.*VITE_' }
  Write-Host "مقدارِ آلوده   : $(if ($bad) { "✗ $($bad.Count) خط — مقدار یک متغیر نام متغیر دیگری را در خود دارد. متوقف شوید." } else { 'ندارد ✓' })"
  $f1 = $lines | Where-Object { $_ -match '^VITE_FEATURE_QUOTE_CUSTOMER_PICKER=' }
  Write-Host "پرچم اصلی      : $(if ($f1) { "هست — مقدار: $(($f1 -split '=',2)[1])" } else { 'نیست (پیش از build باید افزوده شود)' })"
  $f2 = $lines | Where-Object { $_ -match '^VITE_FEATURE_QUOTE_IDENTITY_FROM_RECORD=' }
  Write-Host "پرچم دوم       : $(if ($f2) { "هست — مقدار: $(($f2 -split '=',2)[1])  (باید خالی یا غیر-true باشد)" } else { 'نیست ✓ (خاموش)' })"
} else {
  Write-Host "✗ $envFile پیدا نشد — مسیر واقعی را بررسی کنید." -ForegroundColor Red
}
Write-Host "--- زنجیره در فایل‌های مخزن روی همین checkout" -ForegroundColor Cyan
Write-Host "compose args  : $(if (Select-String -Path 'deploy\lan\docker-compose.yml' -Pattern 'VITE_FEATURE_QUOTE_CUSTOMER_PICKER:' -Quiet) { 'دارد ✓' } else { 'ندارد ✗ — merge هنوز نرسیده' })"
Write-Host "Dockerfile ARG: $(if (Select-String -Path 'Dockerfile' -Pattern '^ARG VITE_FEATURE_QUOTE_CUSTOMER_PICKER$' -Quiet) { 'دارد ✓' } else { 'ندارد ✗' })"
Write-Host "Dockerfile ENV: $(if (Select-String -Path 'Dockerfile' -Pattern 'VITE_FEATURE_QUOTE_CUSTOMER_PICKER=\$VITE_FEATURE_QUOTE_CUSTOMER_PICKER' -Quiet) { 'دارد ✓' } else { 'ندارد ✗' })"

Write-Host "`n===== و. سلامت دیتابیس (از راه همان اتصال فقط‌خواندنی) =====" -ForegroundColor Yellow
Q "و۱ — دیتابیس پاسخ می‌دهد و نسخه" @"
SELECT current_database()||' | '||substring(version() from 'PostgreSQL [0-9.]+');
"@ "نام دیتابیس باید postgres باشد. سلامت کانتینرها عمداً سنجیده نمی‌شود — نیاز به docker ps دارد و این اسکریپت هیچ فرمان docker جز خواندن با psql ندارد."

Write-Host "`n===== پایان. هیچ چیزی نوشته نشد. =====" -ForegroundColor Green
