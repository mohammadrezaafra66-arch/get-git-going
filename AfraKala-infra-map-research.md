# بریف تحقیق — نقشهٔ کامل زیرساخت و محیط‌های افراکالا

> **این یک مأموریت تحقیق است، نه اجرا.** فقط‌خواندنی: هیچ کد، migration، نوشتن روی دیتابیس، و **هیچ تغییری روی هیچ کانتینر/سرویس** (نه restart، نه rebuild، نه down/up).
> هدف: نقشهٔ دقیق و قطعی اینکه «دستیار هوشمند افراکالا» **کجاها و چطور** در حال اجراست، کدام سرویس به کدام پورت و کدام دیتابیس وصل است، و آیا محیط‌ها تمیز و جدا هستند یا در هم رفته‌اند.
>
> **نحوهٔ استفاده:**
> ```powershell
> cd D:\AfraKalaTest\app
> claude
> ```
> ```
> Read AfraKala-infra-map-research.md completely and execute it. Read-only — no code, no migrations, no DB writes, and do NOT restart/rebuild/stop any container or service. Write the report to docs/research/infra-map.md.
> ```

---

## بخش ۰ — قواعد و زمینه

### ۰.۱ ممنوعیت‌های مطلق
- **فقط‌خواندنی.** هیچ `INSERT/UPDATE/DELETE/CREATE/ALTER/DROP` روی DB.
- **هیچ تغییری روی زیرساخت:** `docker restart`, `docker stop`, `docker rm`, `docker compose up/down/build`, `npm run dev/build` — **هیچ‌کدام**. فقط دستورات بازرسی (`docker ps`, `docker inspect`, `netstat`, `Get-Process`, خواندن فایل).
- **هیچ کلید/رمز/توکن را چاپ نکن.** برای `.env`‌ها فقط بنویس «مقدار X = <host:port>» یا «تنظیم شده»؛ هرگز مقدار کلید/پسورد را در گزارش نگذار.
- برنچ را عوض نکن، چیزی commit نکن. تنها فایل مجاز: `docs/research/infra-map.md`.

### ۰.۲ زمینهٔ مهم (از کاربر)
دو محیط وجود دارد:
- **محیط ۱ — «سرور اصلی» (تولید، دست نزن):** روی یک لپ‌تاپ جدا، در شبکه با IP `192.168.170.10`، آدرس `http://192.168.170.10:3000/dashboard`. **کاربران واقعی از این استفاده می‌کنند. هیچ کاری به آن نداریم.**
- **محیط ۲ — «توسعه/تست» (اینجا کار می‌کنیم):** روی ماشین `192.168.170.8`. کاربر می‌گوید «مسیر توسعه `192.168.170.8:1818` است ولی همیشه در `http://192.168.170.8:3100/sales/search` باز می‌شود».

**تناقض کلیدی که باید حل شود:** کانتینر `afrakala-lan-web` مقدار `APP_GIT_SHA=35216bb0` دارد (کد قدیمی، قبل از کارهای اخیر) و ۲۸ ساعت است بدون rebuild بالاست — **ولی** کاربر در `192.168.170.8:3100` فیچرهای جدیدِ commit‌شدهٔ اخیر (مثل دکمهٔ کپی گروهی، صفحهٔ انبار) را می‌بیند. یعنی چیزی که در `:3100` سرو می‌شود احتمالاً **آن کانتینر نیست**. این تحقیق باید قطعی کند چه چیزی `:3100` را سرو می‌کند.

> **محدودیت صادقانه:** Claude Code روی ماشین `192.168.170.8` اجرا می‌شود. ماشین `192.168.170.10` (لپ‌تاپ تولید) یک ماشین جداست و احتمالاً قابل بازرسی مستقیم نیست. برای آن فقط می‌توانی «در دسترس بودن شبکه» و «ارجاعات در config» را چک کنی، نه کانتینرها/پردازه‌هایش. این را در گزارش شفاف بگو.

---

## بخش ۱ — 🔴 چه چیزی پورت `:3100` را سرو می‌کند؟ (مهم‌ترین سؤال)

**۱.۱ — چه پردازه‌ای روی `:3100` گوش می‌دهد:**
```powershell
netstat -ano | Select-String ":3100\s" | Select-String "LISTENING"
```
- PID را بردار، بعد ماهیتش را پیدا کن:
```powershell
$pid3100 = (netstat -ano | Select-String ":3100\s" | Select-String "LISTENING" | ForEach-Object { ($_ -split '\s+')[-1] } | Select-Object -First 1)
Get-Process -Id $pid3100 | Select-Object Id, ProcessName, Path
Get-CimInstance Win32_Process -Filter "ProcessId=$pid3100" | Select-Object -ExpandProperty CommandLine
```
- **تفسیر قطعی:**
  - اگر ProcessName مثل `node` است و CommandLine حاوی `vite`/`dev`/`tsx`/`start` ⟹ `:3100` یک **dev server زنده** است که کد working tree را سرو می‌کند (فیچرهای جدید بدون rebuild دیده می‌شوند). این تناقض SHA را توضیح می‌دهد.
  - اگر PID متعلق به `com.docker.backend`/`vpnkit`/Docker است ⟹ `:3100` به یک **کانتینر** map شده. آنگاه بخش ۲ می‌گوید کدام کانتینر و با چه SHA.

**۱.۲ — همین کار را برای پورت `:1818` انجام بده** (کاربر گفت مسیر توسعه این است):
```powershell
netstat -ano | Select-String ":1818\s" | Select-String "LISTENING"
```
- PID و CommandLine‌اش را مثل بالا دربیاور. مشخص کن `:1818` چیست و چه فرقی با `:3100` دارد. (شاید یکی dev server و دیگری preview/کانتینر باشد.)

**۱.۳ — پورت‌های کلیدی دیگر را هم اسکن کن:**
```powershell
foreach ($p in 3000,3100,1818,9000,5173,4173,54321,54323,8000) {
  $line = netstat -ano | Select-String (":" + $p + "\s") | Select-String "LISTENING" | Select-Object -First 1
  if ($line) { "PORT $p -> $line" }
}
```
- برای هر پورتِ فعال، اگر مشکوک بود PID→CommandLine را دربیاور. (3000=معمولاً prod، 5173/4173=پیش‌فرض Vite dev/preview، 9000=Kong، 54321=Supabase.)

---

## بخش ۲ — فهرست کامل کانتینرهای Docker

**۲.۱ — همهٔ کانتینرها (بالا و پایین):**
```powershell
docker ps -a --format "table {{.Names}}`t{{.Status}}`t{{.Ports}}`t{{.Image}}"
```
- دسته‌بندی کن: کدام‌ها `afrakala-lan-*`، کدام‌ها `afrakala-local-*`، کدام‌ها supabase/kong/db مشترک.
- برای هر کدام: بالا/پایین، مدت uptime، پورت‌های map‌شده.

**۲.۲ — SHA هر سرویس وب:**
```powershell
foreach ($c in @('afrakala-lan-web','afrakala-local-web')) {
  $sha = docker inspect $c --format "{{range .Config.Env}}{{println .}}{{end}}" 2>$null | Select-String "APP_GIT_SHA"
  "$c -> $sha"
}
```
- اگر کانتینر وب دیگری هم هست، SHA آن را هم بگیر.

**۲.۳ — کدام compose فایل هر stack را تعریف می‌کند:**
```powershell
Get-ChildItem -Recurse -Filter "docker-compose*.yml" -File | Where-Object { $_.FullName -notmatch "node_modules" } | Select-Object FullName
rg -n "container_name|afrakala-lan|afrakala-local|3100:|1818:|3000:" deploy 2>$null
```
- مشخص کن `deploy/lan/`، `deploy/local/` یا هر جای دیگر، کدام سرویس‌ها و کدام port mapping را تعریف می‌کنند. مخصوصاً دنبال جایی بگرد که `3100` یا `1818` map شده باشد.

---

## بخش ۳ — dev server در برابر کانتینر (حل نهایی تناقض)

**۳.۱ — اسکریپت‌های اجرا:**
```powershell
Get-Content package.json | Select-String '"dev"|"build"|"preview"|"start"|"serve"'
```
- پورت پیش‌فرض هر اسکریپت را استخراج کن.

**۳.۲ — تنظیم پورت dev server:**
```powershell
rg -n "port|3100|1818|server" vite.config.ts app.config.ts 2>$null
Get-ChildItem -Filter "*.config.ts" | Select-Object Name
```
- ببین آیا Vite/TanStack Start طوری تنظیم شده که روی `3100` یا `1818` گوش دهد.

**۳.۳ — آیا الان پردازهٔ dev/preview در حال اجراست؟**
```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Select-Object ProcessId, CommandLine | Where-Object { $_.CommandLine -match "vite|dev|preview|start|tsx|node" }
```
- فهرست همهٔ پردازه‌های node و دستورشان. مشخص کن کدام‌یک اپ افراکالا را سرو می‌کند و روی چه پورتی.

**۳.۴ — حکم:** بر اساس ۱ تا ۳، یک جملهٔ قطعی بنویس: «`192.168.170.8:3100` توسط X سرو می‌شود» — که X یا «dev server زنده از working tree (کد لحظه‌ای)» است یا «کانتینر Y با SHA Z (نیازمند rebuild برای دیدن تغییرات)».

---

## بخش ۴ — 🔴 انسجام دیتابیس (بزرگ‌ترین ریسک «قاطی‌پاتی»)

این بخش تعیین می‌کند آیا UI که تست می‌کنیم و migration‌هایی که زدیم روی **یک** دیتابیس‌اند یا نه.

**۴.۱ — کانتینرهای دیتابیس:**
```powershell
docker ps -a --filter "name=db" --format "table {{.Names}}`t{{.Status}}`t{{.Ports}}"
```
- فهرست همهٔ کانتینرهای DB: `afrakala-lan-db`، `afrakala-local-db`، و هر چیز دیگر. پورت map‌شدهٔ هرکدام.

**۴.۲ — dev server به کدام Supabase/DB وصل است؟**
```powershell
Get-ChildItem -Recurse -Filter ".env*" -File | Where-Object { $_.FullName -notmatch "node_modules" } | Select-Object FullName
```
- فایل‌های `.env` را که فرانت استفاده می‌کند پیدا کن (`.env`, `.env.local`, `.env.development`). فقط **host/port** این متغیرها را گزارش کن (نه کلید):
  - `VITE_SUPABASE_URL` یا معادلش — به چه host:port اشاره می‌کند؟ (`localhost:9000`؟ `192.168.170.8:9000`؟ چیز دیگر؟)
```powershell
rg -n "SUPABASE_URL|SUPABASE_ANON|API_URL|VITE_" .env .env.local .env.development 2>$null | rg -iv "key|secret|password|anon_key|service"
```

**۴.۳ — کانتینر LAN به کدام DB وصل است؟**
```powershell
docker inspect afrakala-lan-web --format "{{range .Config.Env}}{{println .}}{{end}}" 2>$null | rg -i "SUPABASE_URL|API_URL|DB_HOST|DATABASE" | rg -iv "key|secret|password"
```
- مشخص کن کانتینر LAN به کدام Kong/DB اشاره می‌کند.

**۴.۴ — کدام DB واقعاً migration‌های اخیر را دارد؟** (اثبات اینکه کارمان کجا رفته)
```powershell
$pw = (docker exec afrakala-lan-db printenv POSTGRES_PASSWORD).Trim()
@"
SET client_encoding='UTF8';
SELECT 'afrakala-lan-db' AS container, current_database();
SELECT count(*) AS payment_terms_rows FROM public.payment_terms;
SELECT count(*) AS warehouses_table_exists FROM information_schema.tables WHERE table_name='warehouses';
SELECT count(*) AS payment_vouchers_exists FROM information_schema.tables WHERE table_name='payment_vouchers';
"@ | docker exec -i -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala -A -F '|'
```
- اگر کانتینر `afrakala-local-db` هم وجود دارد و بالاست، **همین چک را روی آن هم بزن** (با نام کانتینر آن) تا ببینی جداول جدید (`warehouses`, `payment_vouchers`) آنجا هم هستند یا نه:
```powershell
$pw2 = (docker exec afrakala-local-db printenv POSTGRES_PASSWORD 2>$null).Trim()
# اگر کانتینر وجود داشت، همان سه کوئری را روی آن اجرا کن (اسم DB را هم چک کن)
```
- **حکم انسجام:**
  - اگر dev server (که کاربر رویش تست می‌کند) به همان DB‌ای وصل است که `warehouses`/`payment_vouchers` را دارد ⟹ همه‌چیز منسجم است. ✅
  - اگر dev server به DB‌ای وصل است که این جداول را **ندارد** (مثلاً `afrakala-local-db` خالی از migration‌های اخیر) در حالی که migration‌ها به `afrakala-lan-db` رفته ⟹ **ناسازگاری جدی**: UI را روی یک DB تست می‌کنیم و کار روی DB دیگری رفته. این «قاطی‌پاتی» است و باید پرچم قرمز بخورد.

**۴.۵ — دیتابیس‌های کهنه:**
```powershell
$pw = (docker exec afrakala-lan-db printenv POSTGRES_PASSWORD).Trim()
@"
SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY 1;
"@ | docker exec -i -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -A
```
- فهرست همهٔ دیتابیس‌ها در کانتینر LAN. آیا `postgres` کهنه (که قبلاً مشکل‌ساز بود) هنوز هست؟ آیا چند کپی از `afrakala` هست؟

---

## بخش ۵ — آیا جای دیگری هم بالاست؟ و ارجاعات به `.10`

**۵.۱ — هر پردازه/کانتینر دیگری که ممکن است اپ را سرو کند:**
```powershell
# همهٔ پورت‌های LISTENING و پردازه‌شان (برای دیدن نمونه‌های ناشناخته)
netstat -ano | Select-String "LISTENING" | Select-String ":3\d\d\d|:1818|:8\d\d\d|:5173|:4173"
# همهٔ کانتینرهای وب/اپ
docker ps -a --format "{{.Names}} {{.Image}} {{.Ports}}" | Select-String "web|app|frontend|node"
```
- هر نمونهٔ اضافه (تب dev قدیمی، کانتینر orphan، preview فراموش‌شده) را فهرست کن.

**۵.۲ — در دسترس بودن و ارجاعات ماشین تولید `.10`:**
```powershell
Test-NetConnection 192.168.170.10 -Port 3000 -InformationLevel Quiet
rg -n "192\.168\.170\.10|192\.168\.170\.8" . --glob "!node_modules/**" --glob "!*.lock"
```
- آیا `.10` از این ماشین در دسترس است؟ آیا در config جایی به `.10` اشاره شده (که نشان دهد این محیط تصادفاً به تولید وصل نشده باشد)؟
- **چک ایمنی حیاتی:** تأیید کن هیچ `.env` یا config محیط توسعه به‌اشتباه به دیتابیس/سرویس `.10` (تولید) اشاره نمی‌کند. اگر چنین چیزی بود، **پرچم قرمز فوری** (ریسک نوشتن روی تولید).

---

## بخش ۶ — بررسی انسجام کلی («قاطی‌پاتی نیست؟»)

جمع‌بندی کن:
- چند stack همزمان بالاست؟ (`afrakala-lan-*`, `afrakala-local-*`, ...) آیا هر دو لازم‌اند یا یکی orphan است؟
- آیا کانتینرهای متوقف/orphan هست که فقط سردرگمی می‌سازند؟
- آیا **یک** منبع حقیقت واضح برای محیط توسعه هست، یا چند چیز موازی؟
- آیا `git status` تمیز است و working tree با آنچه سرو می‌شود هم‌خوان است؟
```powershell
git branch --show-current
git status --short
git log --oneline -3
```

---

## بخش ۷ — قالب گزارش (پاسخ صریح به ۵ سؤال کاربر)

فایل `docs/research/infra-map.md` با این ساختار:

### ۷.۱ — نقشهٔ محیط‌ها (جدول)
| آدرس | ماشین | چه چیزی سرو می‌کند (dev server/کانتینر/SHA) | به کدام DB وصل است | وضعیت |
|---|---|---|---|---|
| 192.168.170.8:3100 | .8 | ... | ... | ... |
| 192.168.170.8:1818 | .8 | ... | ... | ... |
| 192.168.170.10:3000 | .10 (تولید) | خارج از دسترس بازرسی | ? | دست‌نخورده |

### ۷.۲ — حل تناقض SHA
یک بند صریح: چرا کاربر فیچرهای جدید را در `:3100` می‌بیند در حالی که کانتینر SHA قدیمی دارد. (احتمالاً: `:3100` = dev server زنده.)

### ۷.۳ — پاسخ به ۵ سؤال کاربر، شماره‌به‌شماره:
1. **آیا دستیار جای دیگری هم بالاست؟** (فهرست همهٔ نمونه‌های یافت‌شده روی `.8` + وضعیت دسترسی `.10`)
2. **آیا مشکل خاص دیگری داریم؟** (هر ناسازگاری DB، کانتینر orphan، ارجاع خطرناک به تولید، دیتابیس کهنه)
3. **چه کارهایی باید بکنیم؟** (فهرست پیشنهادی — فقط توصیف، بدون اجرا: مثلاً «کانتینر LAN را rebuild کن اگر می‌خواهی برای کاربران دیگر هم به‌روز باشد»، «فلان stack orphan را پاک کن»، ...)
4. **آیا همه‌چیز درست و متمرکز است؟** (حکم صریح: بله/خیر + دلیل)
5. **آیا پروژه قاطی‌پاتی شده؟** (حکم صریح با شواهد، مخصوصاً انسجام DB از بخش ۴)

### ۷.۴ — انسجام دیتابیس
حکم قطعی: dev server و migration‌های ما روی **یک** DB هستند یا نه. با خروجی کوئری‌های بخش ۴ به‌عنوان شاهد.

### ۷.۵ — مسیر انتقال به تولید (`.8` → `.10`)
بر اساس آنچه دیدی، توصیف کن انتقال از محیط توسعه به لپ‌تاپ تولید چطور کار می‌کند (چه چیزی باید کپی/build/migrate شود). فقط توصیف، بدون اجرا. (این برای مرحلهٔ بعدی کاربر لازم است.)

### ۷.۶ — تأیید سلامت
`git status --short` (باید فقط فایل گزارش) + تأیید اینکه هیچ کانتینر/سرویس دست نخورده و هیچ نوشتنی روی DB نشده.

---

## بخش ۸ — یادآوری‌های حیاتی
- **فقط بازرسی.** هیچ restart/rebuild/down/up، هیچ نوشتن DB، هیچ تغییر کد.
- **هیچ کلید/رمز را چاپ نکن** — فقط host:port.
- **`-d afrakala` صریح** در اتصال‌ها؛ مراقب دیتابیس کهنهٔ `postgres`.
- **محدودیت `.10` را صادقانه بگو** — قابل بازرسی مستقیم نیست.
- گزارش: فارسی، مستقیم، جدول‌محور، با شواهد (خروجی دستور).
- اگر جایی ارجاع محیط توسعه به تولید (`.10`) دیدی، **فوراً و برجسته** پرچم بزن.