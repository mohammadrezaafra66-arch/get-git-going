# =====================================================================================
#  پیش‌پرواز انتشار مسیر مهمان — روی لپ‌تاپ پروداکشن اجرا شود
#  ساخته ۲۰۲۶-۰۹-۰۳ · نسخهٔ هدف: e4c06914 · مایگریشن‌های ۴۲۰ و ۴۲۱
#
#  فقط خواندن. هیچ INSERT/UPDATE/DELETE/DDL و هیچ نوشتنی روی دیسک ندارد.
#  خروجی هیچ نام، شماره تماس، آدرس یا کد ملی ندارد — هر چیزی که می‌توانست، شمرده یا ماسک شده.
#
#  اجرا:  cd C:\afrakala ;  .\docs\release\production-preflight.ps1
#  خروجی را کامل کپی کنید و بفرستید. هیچ قدمی از انتشار را خودکار انجام نمی‌دهد.
# =====================================================================================

$ErrorActionPreference = "Continue"
$DB   = "postgres"          # روی پروداکشن نام دیتابیس این است، نه afrakala
$CT   = "afrakala-lan-db"
$pw   = (Select-String -Path "deploy\lan\.env.lan" -Pattern '^POSTGRES_PASSWORD=(.*)$').Matches.Groups[1].Value

function Q($label, $sql, $pass) {
  Write-Host "`n--- $label" -ForegroundColor Cyan
  Write-Host "    قبولی: $pass" -ForegroundColor DarkGray
  docker exec -e PGPASSWORD=$pw $CT psql -U supabase_admin -d $DB -A -F' | ' -c $sql
}

Write-Host "===== ۰. هویت ماشین و شاخه =====" -ForegroundColor Yellow
Write-Host "hostname : $(hostname)"
Write-Host "cwd      : $(Get-Location)"
# می‌سنجد: اسکریپت دیپلوی `git pull --ff-only origin <همین شاخه>` می‌زند (update-lan.ps1:41-47).
# قبولی: نام شاخه با آنچه قرار است merge شود یکی باشد. اگر detached بود، انتشار متوقف.
Write-Host "branch   : $(git rev-parse --abbrev-ref HEAD)"
Write-Host "HEAD     : $(git rev-parse --short HEAD)"
Write-Host "دیتابیس  : $DB   (اگر خطای 'database afrakala does not exist' دیدید، این خط را بررسی کنید)"

Write-Host "`n===== الف. مقایسهٔ اسکیما با استیجینگ =====" -ForegroundColor Yellow

Q "الف۱ — مقادیر مجاز quote_exception_type" @"
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid='public.sales_quotes'::regclass AND conname='sales_quotes_exception_type_check';
"@ "باید دقیقاً سه مقدار باشد: overdue_salesperson_commitment, credit_shortfall_salesperson_commitment, accounting_approval. اگر guest_no_link هست، ۴۲۰ قبلاً رفته — متوقف شوید."

Q "الف۲ — ستون‌های audit_logs" @"
SELECT string_agg(column_name||':'||is_nullable, ', ' ORDER BY ordinal_position)
FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs';
"@ "باید باشد: id:NO, actor_id:YES, entity_type:NO, entity_id:NO, action:NO, diff:YES, created_at:NO — مثل استیجینگ. هر ستون اضافه یا کم، متوقف."

Q "الف۳ — تریگر audit روی sales_quotes" @"
SELECT t.tgname||' -> '||p.proname FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
WHERE t.tgrelid='public.sales_quotes'::regclass AND NOT t.tgisinternal ORDER BY 1;
"@ "باید trg_audit_sales_quotes -> audit_sales_quotes را داشته باشد. دست به آن نمی‌زنیم؛ فقط وجودش را می‌سنجیم."

Q "الف۴ — NOT NULL بودن شماره تماس" @"
SELECT column_name||' nullable='||is_nullable FROM information_schema.columns
WHERE table_name='sales_quotes' AND column_name IN ('customer_phone','customer_name','customer_id')
ORDER BY column_name;
"@ "customer_phone و customer_name باید NO باشند و customer_id باید YES. شل‌کردن اجباری بودن شماره ممنوع است."

Q "الف۵ — ستون‌های استثنا و commitment" @"
SELECT string_agg(column_name, ', ' ORDER BY column_name) FROM information_schema.columns
WHERE table_name='sales_quotes'
  AND (column_name LIKE 'quote_exception%' OR column_name='commitment_confirmed');
"@ "باید هر هفت ستون quote_exception_* به‌علاوهٔ commitment_confirmed را داشته باشد."

Q "الف۶ — دفترچهٔ مایگریشن" @"
SELECT 'max='||max(version)||'  count='||count(*) FROM supabase_migrations.schema_migrations;
"@ "max باید 20260831210000 (مایگریشن ۴۱۹) باشد. اگر کمتر است، ۴۲۰ زودرس است — متوقف."

Write-Host "`n===== ب. اعداد پروداکشن =====" -ForegroundColor Yellow

Q "ب۱ — پیش‌فاکتورها: کل، مهمان، و توزیع استثنا" @"
SELECT 'کل='||count(*)
     ||'  مهمان(customer_id IS NULL)='||count(*) FILTER (WHERE customer_id IS NULL)
     ||'  accounting_approval='||count(*) FILTER (WHERE quote_exception_type='accounting_approval')
     ||'  credit_shortfall='||count(*) FILTER (WHERE quote_exception_type='credit_shortfall_salesperson_commitment')
     ||'  overdue='||count(*) FILTER (WHERE quote_exception_type='overdue_salesperson_commitment')
     ||'  guest_no_link='||count(*) FILTER (WHERE quote_exception_type='guest_no_link')
     ||'  NULL='||count(*) FILTER (WHERE quote_exception_type IS NULL)
     ||'  commitment_confirmed=true='||count(*) FILTER (WHERE commitment_confirmed)
FROM public.sales_quotes;
"@ "مبنای «قبل». guest_no_link باید صفر باشد. این عدد پس از مایگریشن باید بدون تغییر بماند — مایگریشن‌ها داده نمی‌نویسند."

Q "ب۲ — حجم جدول (زمان اعتبارسنجی مجدد محدودیت)" @"
SELECT 'rows='||count(*) FROM public.sales_quotes;
"@ "۴۲۰ محدودیت را DROP و دوباره ADD می‌کند و ADD کل جدول را اعتبارسنجی می‌کند. زیر ۱۰۰ هزار ردیف، کسری از ثانیه. اگر خیلی بزرگ بود، پنجرهٔ انتشار را بلندتر بگیرید."

Q "ب۳ — مشتریان فعال بدون شماره، و فعالیت ۹۰ روزهٔ آن‌ها" @"
WITH nophone AS (
  SELECT id FROM public.customers WHERE is_active AND COALESCE(phone,'')=''
)
SELECT 'مشتری_فعال='||(SELECT count(*) FROM public.customers WHERE is_active)
     ||'  بدون_شماره='||(SELECT count(*) FROM nophone)
     ||'  از_آن‌ها_معامله_در_۹۰روز='||(
         SELECT count(DISTINCT q.customer_id) FROM public.sales_quotes q
         WHERE q.customer_id IN (SELECT id FROM nophone)
           AND q.created_at >= now() - interval '90 days');
"@ "روی استیجینگ: ۸۶ / ۵۱ / ۰. اگر روی پروداکشن سهمِ «بدون شماره» بالا باشد و معاملهٔ ۹۰روزه هم داشته باشند، دکمهٔ «افزودن شماره» از روز اول بار سنگینی می‌گیرد و تیم فروش باید از پیش بداند."

Q "ب۴ — ساعت و روز فعالیت (برای پنجرهٔ انتشار)" @"
SELECT extract(hour FROM created_at AT TIME ZONE 'Asia/Tehran')::int||'h = '||count(*)
FROM public.sales_quotes WHERE created_at >= now() - interval '90 days'
GROUP BY 1 ORDER BY 1;
"@ "پنجرهٔ انتشار باید بیرون ساعت‌های پرترافیک باشد."

Write-Host "`n===== ج. تعریف تابع پروداکشن — دستور بازگشت =====" -ForegroundColor Yellow
# می‌سنجد: تعریف زندهٔ پروداکشن ممکن است با استیجینگ یکی نباشد (قاعدهٔ ۴ فایل CLAUDE.md).
# قبولی: md5 را با استیجینگ مقایسه کنید. اگر فرق داشت، بازگشتِ استیجینگ روی پروداکشن معتبر نیست
#         و باید همین خروجی به‌عنوان دستور بازگشت پروداکشن نگه داشته شود.
Write-Host "--- ج۱ md5 تعریف تابع (استیجینگ برای مقایسه: در گزارش گیت ۰ آمده)" -ForegroundColor Cyan
docker exec -e PGPASSWORD=$pw $CT psql -U supabase_admin -d $DB -A -t -c @"
SELECT md5(pg_get_functiondef(oid)) FROM pg_proc WHERE proname='create_sales_quote_with_items';
"@
Write-Host "--- ج۲ امضا، owner، SECURITY DEFINER، search_path" -ForegroundColor Cyan
docker exec -e PGPASSWORD=$pw $CT psql -U supabase_admin -d $DB -A -F' | ' -c @"
SELECT pronargs, pg_get_userbyid(proowner), prosecdef, proconfig::text,
       md5(pg_get_function_identity_arguments(oid))
FROM pg_proc WHERE proname='create_sales_quote_with_items';
"@
Write-Host "    قبولی: 19 | supabase_admin | t | {search_path=public} — همان استیجینگ. هر اختلاف = متوقف." -ForegroundColor DarkGray
Write-Host "--- ج۳ GRANTها" -ForegroundColor Cyan
docker exec -e PGPASSWORD=$pw $CT psql -U supabase_admin -d $DB -A -t -c @"
SELECT string_agg(grantee||':'||privilege_type, ', ' ORDER BY grantee)
FROM information_schema.routine_privileges WHERE routine_name='create_sales_quote_with_items';
"@
Write-Host "--- ج۴ متن کامل تعریف (این را در فایل بازگشت پروداکشن نگه دارید)" -ForegroundColor Cyan
Write-Host "    خروجی زیر را دستی در docs/release/420-rollback-PRODUCTION.sql ذخیره کنید." -ForegroundColor DarkGray
docker exec -e PGPASSWORD=$pw $CT psql -U supabase_admin -d $DB -A -t -c @"
SELECT pg_get_functiondef(oid)||';' FROM pg_proc WHERE proname='create_sales_quote_with_items';
"@

Write-Host "`n===== د. وضعیت پشتیبان =====" -ForegroundColor Yellow
# می‌سنجد: پشتیبان تازه‌ای هست و مسیر بازگردانی‌اش آزموده شده.
# قبولی: آخرین پشتیبان کمتر از ۲۴ ساعت پیش، اندازهٔ غیرصفر، و تاریخ آخرین بازیابی آزمایشی معلوم.
$backupDirs = @("C:\afrakala\backups", "C:\afrakala\deploy\lan\backups", "D:\backups")
foreach ($d in $backupDirs) {
  if (Test-Path $d) {
    Write-Host "--- $d" -ForegroundColor Cyan
    Get-ChildItem $d -File -Recurse -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending | Select-Object -First 5 |
      Format-Table Name, @{N='MB';E={[math]::Round($_.Length/1MB,1)}}, LastWriteTime -AutoSize
  }
}
Write-Host "  ⚠ تاریخ آخرین بازیابی آزمایشی را مالک باید دستی تأیید کند — از فایل قابل استنتاج نیست." -ForegroundColor Yellow

Write-Host "`n===== ه. زنجیرهٔ پرچم روی همین ماشین =====" -ForegroundColor Yellow
# می‌سنجد: فایل .env واقعی که compose می‌خواند روی هاست است و ممکن است دستی ویرایش شده باشد؛
#          اصلاح مخزن به‌تنهایی تضمینش نمی‌کند. نبودِ newline پایانی ریشهٔ خرابی قبلی بود.
$envFile = "deploy\lan\.env.lan"
if (Test-Path $envFile) {
  $raw   = Get-Content $envFile -Raw
  $lines = Get-Content $envFile
  Write-Host "فایل            : $envFile  ($($lines.Count) خط)"
  Write-Host "newline پایانی  : $(if ($raw -match "(`r`n|`n)$") { 'دارد ✓' } else { 'ندارد ✗  — ریشهٔ خرابی قبلی. متوقف شوید.' })"
  $bad = $lines | Where-Object { $_ -match '^[A-Z_]+=.*VITE_' }
  Write-Host "مقدارِ آلوده    : $(if ($bad) { "✗ $($bad.Count) خط — مقدار یک متغیر نام متغیر دیگری را در خود دارد. متوقف شوید." } else { 'ندارد ✓' })"
  $flag = $lines | Where-Object { $_ -match '^VITE_FEATURE_QUOTE_CUSTOMER_PICKER=' }
  Write-Host "کلید پرچم      : $(if ($flag) { "هست — مقدار: $(($flag -split '=',2)[1])" } else { 'نیست (پیش از build باید افزوده شود)' })"
  $flag2 = $lines | Where-Object { $_ -match '^VITE_FEATURE_QUOTE_IDENTITY_FROM_RECORD=' }
  Write-Host "پرچم دوم       : $(if ($flag2) { "هست — مقدار: $(($flag2 -split '=',2)[1])  (باید خالی یا غیر-true باشد)" } else { 'نیست ✓ (خاموش)' })"
} else {
  Write-Host "✗ $envFile پیدا نشد — مسیر واقعی را بررسی کنید." -ForegroundColor Red
}
Write-Host "--- زنجیره در فایل‌های مخزن روی همین checkout" -ForegroundColor Cyan
Write-Host "compose args : $(if (Select-String -Path 'deploy\lan\docker-compose.yml' -Pattern 'VITE_FEATURE_QUOTE_CUSTOMER_PICKER:' -Quiet) { 'دارد ✓' } else { 'ندارد ✗ — merge هنوز نرسیده' })"
Write-Host "Dockerfile ARG: $(if (Select-String -Path 'Dockerfile' -Pattern '^ARG VITE_FEATURE_QUOTE_CUSTOMER_PICKER$' -Quiet) { 'دارد ✓' } else { 'ندارد ✗' })"
Write-Host "Dockerfile ENV: $(if (Select-String -Path 'Dockerfile' -Pattern 'VITE_FEATURE_QUOTE_CUSTOMER_PICKER=\$VITE_FEATURE_QUOTE_CUSTOMER_PICKER' -Quiet) { 'دارد ✓' } else { 'ندارد ✗' })"

Write-Host "`n===== و. سلامت کانتینرها =====" -ForegroundColor Yellow
docker ps -a --filter "name=afrakala-lan-" --format "{{.Names}} | {{.Status}}"
Write-Host "    قبولی: همهٔ سرویس‌ها Up؛ afrakala-lan-db-role-fix روی Exited (0) طبیعی است." -ForegroundColor DarkGray

Write-Host "`n===== پایان. هیچ چیزی نوشته نشد. =====" -ForegroundColor Green
