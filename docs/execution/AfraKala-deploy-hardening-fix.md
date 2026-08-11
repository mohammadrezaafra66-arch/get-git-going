# پرامپت اصلاح — سخت‌کردن deploy محیط LAN (رفع دو مین عملیاتی)

> بر پایهٔ گزارش `docs/research/infra-map.md`.
> **هدف:** بستن دو باگ عملیاتی تکرارشونده که دو بار اپ را از کار انداختند و یک بار نزدیک بود محیط توسعه را به تولید وصل کنند.
> **این پرامپت فقط فایل‌های اسکریپت/README را می‌سازد/ویرایش می‌کند.** هیچ تغییری روی stack در حال اجرا، دیتابیس، یا کد اپلیکیشن.
>
> **نحوهٔ استفاده:**
> ```powershell
> cd D:\AfraKalaTest\app
> claude
> ```
> ```
> Read docs/execution/AfraKala-deploy-hardening-fix.md completely and execute Parts A and B. Do NOT run init-lan.ps1, do NOT rebuild/restart/stop the stack, do NOT touch the database.
> ```

---

## بخش ۰ — قواعد

- **stack در حال اجرا را دست نزن:** هیچ `docker restart/stop/rm`, هیچ `docker compose up/down/build`. اپ الان بالا و سالم است؛ همان‌طور بماند.
- **`init-lan.ps1` را اجرا نکن** — اجرایش فایل `.env.lan` فعلی (که درست به `.8` اشاره می‌کند) را بازتولید می‌کند. فقط **دیفالت داخل اسکریپت** را ویرایش کن، نه خود `.env.lan`.
- **دیتابیس را دست نزن.** هیچ نوشتنی.
- **`.env.lan` را commit نکن** (gitignored است و باید بماند). فقط اسکریپت‌ها و README را commit کن.
- برنچ کاری: `feature/navigation-modernization`. تأیید کن قبل از شروع.
- **هیچ کلید/رمز را در اسکریپت hardcode نکن** — اسکریپت‌ها فقط به فایل `.env.lan` ارجاع می‌دهند.

---

## بخش A — رفع مین ۱: دستور deploy شکننده (env-file فراموش‌شده)

**مشکل (از گزارش):** دستور `docker compose -f deploy/lan/docker-compose.yml up -d` **بدون** `--env-file deploy/lan/.env.lan` بی‌سروصدا خراب می‌کند: متغیرهای interpolation خالی می‌مانند (`APP_PORT` به ۳۰۰۰ می‌افتد، `SUPABASE_URL` خالی می‌شود، SHA به fallback می‌رود)، `db-role-fix` می‌شکند و بقیهٔ سرویس‌ها start نمی‌شوند. این **دو بار** رخ داده.

**راه‌حل:** wrapper scriptهایی که همهٔ flagهای درست را در خود دارند، تا دیگر نشود دستور خام را غلط زد.

**گام‌ها:**

1. **اول بررسی کن** آیا راه تمیزتری از wrapper وجود دارد (مثلاً آیا می‌شود Compose را وادار کرد فایل env را خودکار بخواند؟):
   ```powershell
   Get-Content deploy/lan/docker-compose.yml | Select-String "env_file|APP_PORT|APP_GIT_SHA|SUPABASE_URL|\$\{"
   Get-ChildItem deploy/lan/ -File
   ```
   - اگر مکانیزم تمیزتری (مثل `COMPOSE_ENV_FILES` در یک فایل، یا تغییر نام env به شکلی که Compose خودکار بخواند بدون شکستن چیز دیگر) امن و ساده بود، آن را ترجیح بده و در گزارش توضیح بده. **در غیر این صورت** wrapper scriptها را بساز (راه مطمئن و صریح).

2. **بساز `deploy/lan/up.ps1`:**
   - مسیرها را نسبت به محل خود اسکریپت resolve کن (`$PSScriptRoot`) تا مستقل از دایرکتوری جاری کار کند.
   - همیشه با `--env-file <script_dir>/.env.lan` و `-f <script_dir>/docker-compose.yml` اجرا کند.
   - اگر `.env.lan` وجود نداشت، با پیام واضح خطا بدهد و متوقف شود (نه اینکه ادامه دهد و خراب کند).
   - آرگومان‌های اضافی را pass-through کند (مثل `up.ps1 --build`).
   - قبل از اجرا، دستور کاملی که می‌زند را echo کند (شفافیت).
   - ساختار پیشنهادی:
     ```powershell
     $ErrorActionPreference = 'Stop'
     $envFile = Join-Path $PSScriptRoot '.env.lan'
     $compose = Join-Path $PSScriptRoot 'docker-compose.yml'
     if (-not (Test-Path $envFile)) {
       Write-Error "Missing $envFile — run init to create it (dev host = 192.168.170.8)."
       exit 1
     }
     Write-Host "docker compose --env-file `"$envFile`" -f `"$compose`" up -d $args"
     docker compose --env-file $envFile -f $compose up -d @args
     ```

3. **بساز `deploy/lan/down.ps1`** با همان الگو ولی `down` (بدون `-v` تا حجم داده حذف نشود — مگر آرگومان صریح بدهند).

4. **README را به‌روز کن:** هر جا دستور خام `docker compose ... up` نوشته شده، جایش را با `.\deploy\lan\up.ps1` بگذار و یک هشدار کوتاه اضافه کن: «همیشه از این اسکریپت استفاده کن؛ دستور خام بدون `--env-file` باعث خرابی stack می‌شود.»

**تست بخش A (غیرمخرب):**
- `up.ps1` را با یک بازرسی امتحان کن. چون `up -d` idempotent است و stack **الان بالاست**، اجرای `up.ps1` باید بی‌خطر باشد و stack را سالم نگه دارد (یا تمیز recreate کند). اجرا کن و تأیید کن:
  ```powershell
  .\deploy\lan\up.ps1
  docker ps --filter "name=afrakala-lan" --format "{{.Names}}`t{{.Status}}"
  ```
  - انتظار: echo دستور شامل `--env-file ...\.env.lan` باشد؛ همهٔ سرویس‌ها `Up (healthy)` بمانند.
- **`down.ps1` را اجرا نکن** (نمی‌خواهیم stack پایین بیاید). فقط syntax آن را با خواندن فایل تأیید کن.

---

## بخش B — رفع مین ۲: دیفالت خطرناک به تولید در `init-lan.ps1`

**مشکل (از گزارش):** `deploy/lan/scripts/init-lan.ps1` خط ۲۸ دیفالتش `192.168.170.10` (IP لپ‌تاپ **تولید**) است و README می‌گوید «فقط Enter بزن». اجرای دوبارهٔ این اسکریپت روی ماشین توسعه، `.env.lan` را به تولید نشانه می‌رود — یعنی محیط تست به دیتابیس واقعی کاربران وصل می‌شود. **یک کلید فاصله با فاجعه.**

**گام‌ها:**

1. **فایل را بخوان تا ساختار دقیق را بفهمی** (خط ۲۸ و نحوهٔ گرفتن IP):
   ```powershell
   Get-Content deploy/lan/scripts/init-lan.ps1 | Select-Object -First 60
   ```

2. **دیفالت را امن کن.** دو تغییر:
   - **دیفالت را از `192.168.170.10` به `192.168.170.8` تغییر بده** (ماشین توسعه). حالا اگر کسی Enter بزند، محیط توسعه می‌ماند نه تولید.
   - **یک گارد اضافه کن:** اگر IP واردشده `192.168.170.10` بود (یا هر IP که به‌عنوان تولید شناخته می‌شود)، یک هشدار برجسته چاپ کند و **تأیید صریح** بخواهد (تایپ‌کردن عبارت یا خود IP، نه فقط Enter). مثلاً:
     ```powershell
     if ($hostIp -eq '192.168.170.10') {
       Write-Warning "192.168.170.10 is the PRODUCTION laptop. Pointing this dev env at it can write to live data."
       $confirm = Read-Host "Type EXACTLY 'I-KNOW-THIS-IS-PRODUCTION' to continue, or anything else to abort"
       if ($confirm -ne 'I-KNOW-THIS-IS-PRODUCTION') { Write-Host "Aborted."; exit 1 }
     }
     ```

3. **README را به‌روز کن:** جملهٔ «فقط Enter بزن» را اصلاح کن به چیزی مثل «Enter = محیط توسعه (192.168.170.8). برای تولید باید IP را صریح وارد و تأیید کنی.»

**تست بخش B (بدون اجرای اسکریپت):**
- **`init-lan.ps1` را اجرا نکن.** فقط با خواندن فایل تأیید کن:
  ```powershell
  Get-Content deploy/lan/scripts/init-lan.ps1 | Select-String "192.168.170.8|192.168.170.10|I-KNOW-THIS-IS-PRODUCTION"
  ```
  - انتظار: دیفالت حالا `.8`؛ گارد تولید موجود.
- تأیید کن `.env.lan` فعلی **دست‌نخورده** مانده و هنوز به `.8` اشاره می‌کند:
  ```powershell
  rg -n "170\.8|170\.10" deploy/lan/.env.lan
  ```
  - انتظار: هنوز `.8`، هیچ `.10`.

---

## بخش C — (اختیاری) رفع مین ۳: برچسب SHA خراب

> این را فقط اگر خواستی اجرا کن. مربوط به همان دو مورد است (بهداشت deploy) ولی خواستهٔ اصلی نبود. اثرش فقط در **build بعدی** ظاهر می‌شود.

**مشکل:** `APP_GIT_SHA` مقدار `local-unknown` نشان می‌دهد نه SHA واقعی؛ پس به‌عنوان نشانگر «چه کدی در حال اجراست» بی‌فایده است.

**گام‌ها:**

1. **بفهم SHA کجا ست می‌شود** — build-arg (زمان build) یا runtime env:
   ```powershell
   Get-Content deploy/lan/Dockerfile* 2>$null | Select-String "APP_GIT_SHA|ARG|ENV"
   rg -n "APP_GIT_SHA" deploy .
   ```

2. اگر build-arg است: **یک `deploy/lan/build.ps1` بساز** که هنگام build، SHA واقعی را از git بگیرد و پاس دهد:
   ```powershell
   $sha = (git rev-parse --short HEAD).Trim()
   docker compose --env-file (Join-Path $PSScriptRoot '.env.lan') -f (Join-Path $PSScriptRoot 'docker-compose.yml') build --build-arg APP_GIT_SHA=$sha @args
   ```
   - README را به‌روز کن که rebuild همیشه از `.\deploy\lan\build.ps1` انجام شود (تا SHA همیشه درست مهر شود).

3. **build نزن.** فقط اسکریپت را بساز و syntax را تأیید کن. (rebuild تصمیم بعدی کاربر است.)

---

## بخش D — گزارش و commit

1. خلاصه‌ای از فایل‌های ساخته/ویرایش‌شده (`up.ps1`, `down.ps1`, `init-lan.ps1`, README, و در صورت اجرای C، `build.ps1`).
2. نتیجهٔ تست‌های غیرمخرب (echo دستور wrapper شامل env-file؛ دیفالت init به `.8`؛ `.env.lan` دست‌نخورده).
3. تأیید اینکه **هیچ کانتینری restart/rebuild/stop نشد، هیچ نوشتنی روی DB نشد، `.env.lan` تغییر نکرد.**
4. `git status --short` (باید فقط اسکریپت‌ها و README) + commit با پیام واضح مثل:
   `chore(deploy): add env-file wrappers and guard init-lan against production default`

---

## بخش E — یادآوری‌های حیاتی
- stack در حال اجرا مقدس است — دست نزن.
- `init-lan.ps1` را **اجرا نکن**؛ فقط ویرایشش کن.
- `.env.lan` را نه commit کن نه تغییر بده.
- DB را دست نزن.
- اسکریپت‌ها فقط به env-file ارجاع می‌دهند؛ هیچ کلید/رمز داخلشان نباشد.
- گزارش: فارسی، مستقیم، با شواهد.