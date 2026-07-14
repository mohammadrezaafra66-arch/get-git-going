# AfraKala — LAN Pilot Deployment

اجرای آزمایشی AfraKala روی یک لپ‌تاپ داخل شبکه شرکت، بدون Caddy، بدون SSL و بدون دامنه. مخصوص تست ۱ تا ۲ ماهه داخلی.

> ⚠️ نکته Encoding: برای جلوگیری از خطای parser در Windows PowerShell 5.1، خروجی فایل‌های `*.ps1` انگلیسی و ASCII-only نوشته شده‌اند. راهنمای فارسی فقط در همین README می‌ماند.

> ⚠️ نکته Registry: اگر `docker compose build` با خطای **HTTP 403** از آدرس‌هایی مثل `europe-west1-npm.pkg.dev` یا `lovable-core-prod/sandbox-npm-cache` متوقف شد، یعنی build در حال تلاش برای استفاده از کش خصوصی Lovable است که برای self-host قابل دسترسی نیست. Dockerfile پروژه برای LAN/self-host عمداً registry را روی `https://registry.npmjs.org/` ثابت می‌کند و `bun.lock` را داخل image کپی نمی‌کند تا resolve از npm عمومی انجام شود. اگر این خطا برگشت، مطمئن شوید آخرین تغییرات repo را `git pull` کرده‌اید و سپس:
>
> ```powershell
> docker compose -f deploy\lan\docker-compose.yml build --no-cache app
> ```

## ۱. هدف LAN Pilot

- اجرای کامل اپ و Supabase موردنیاز روی یک لپ‌تاپ با Docker.
- دسترسی همکاران داخل شبکه شرکت با مرورگر از طریق IP لپ‌تاپ.
- چرخه سریع update از Lovable → GitHub → لپ‌تاپ.
- این فاز **production نیست**.

## ۱.۵ اجرای واقعی روی لپ‌تاپ شرکت — مسیر پیشنهادی

مسیر سریع و قابل تکرار برای راه‌اندازی روی لپ‌تاپ داخل شرکت (IP پیش‌فرض `192.168.170.10`):

1. نصب [Git for Windows](https://git-scm.com/download/win).
2. نصب [Docker Desktop](https://www.docker.com/products/docker-desktop) و یک بار اجرای آن.
3. clone کردن repo در یک مسیر بدون فاصله، مثلاً `C:\afrakala`:

   ```powershell
   git clone <repo-url> C:\afrakala
   cd C:\afrakala
   ```

4. اجازه موقت اجرای اسکریپت در همین session:

   ```powershell
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   ```

5. نمایش IPهای لپ‌تاپ و تأیید `192.168.170.10`:

   ```powershell
   powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\show-ip.ps1
   ```

6. آماده‌سازی `.env.lan` و kong و secretها (Enter بزنید تا IP پیش‌فرض `192.168.170.10` استفاده شود):

   ```powershell
   powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\init-lan.ps1
   ```

   این اسکریپت `POSTGRES_PASSWORD`، `JWT_SECRET`، `ANON_KEY` و `SERVICE_ROLE_KEY` را در صورت خالی بودن خودش تولید می‌کند. برای چرخاندن secretهای LAN بعد از leak یا تست خراب، همین اسکریپت را با `-RotateSecrets` اجرا کنید. مقادیر در console چاپ نمی‌شوند.

7. باز کردن پورت‌های Firewall فقط با **PowerShell Admin**:

   ```powershell
   powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\firewall-lan-admin.ps1
   ```

   بعد از موفقیت، این پنجره Admin را ببندید.

8. build و اجرای stack با PowerShell **عادی**:

   ```powershell
   powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\update-lan.ps1
   ```

9. بررسی سلامت:

   ```powershell
   powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\check-lan.ps1
   ```

10. اعلام آدرس به همکاران:

    ```
    http://192.168.170.10:3000
    ```

### آپدیت روزهای بعد

بعد از هر تغییر در Lovable و sync روی GitHub، روی لپ‌تاپ کافی است:

```powershell
powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\update-lan.ps1
```

### هشدارها

- این deployment فقط داخل شبکه شرکت است؛ روی اینترنت عمومی expose نشود.
- روی router هیچ port forwarding انجام نشود.
- بدون SSL است و برای production نهایی نیست (production از `deploy/supabase` + `deploy/proxy` استفاده می‌کند).
- فایل `deploy/lan/.env.lan` هرگز commit نشود.

## ۲. تفاوت با Production Self-host

| موضوع | LAN Pilot (این فاز) | Production (`deploy/supabase`, `deploy/proxy`) |
|---|---|---|
| Reverse proxy | ندارد | Caddy |
| SSL/TLS | ندارد، فقط HTTP | دارد، Let's Encrypt |
| دامنه | ندارد، فقط IP داخلی | دامنه عمومی |
| Publish پورت | `3000` و `8000` روی LAN | فقط `80/443` از طریق Caddy |
| دیتا | تست، migration واقعی ندارد | backup/restore واقعی |
| Studio | پیش‌فرض خاموش، فقط با profile | پشت Caddy basic_auth |
| هدف | تست داخلی شرکت | استقرار نهایی |

این stack جدا از `deploy/supabase` است و آن را تغییر نمی‌دهد. فقط فایل‌های init و `kong.yml` به‌صورت read-only از آن مشترک استفاده می‌شوند تا duplication نباشد.

## ۳. پیش‌نیازهای لپ‌تاپ

- Windows 10 یا 11
- [Docker Desktop](https://www.docker.com/products/docker-desktop) (با WSL2 توصیه می‌شود)
- Git for Windows
- اتصال کابل LAN یا Wi-Fi به شبکه شرکت
- یک **IP ثابت داخلی** برای لپ‌تاپ (ترجیحاً static lease روی روتر)

## ۴. پیدا کردن IP لپ‌تاپ

```powershell
powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\show-ip.ps1
```

IP اینترفیس متصل به شبکه شرکت را یادداشت کنید (مثلاً `192.168.1.50`).

## ۵. ساخت `.env.lan`

```powershell
Copy-Item deploy\lan\.env.lan.example deploy\lan\.env.lan
notepad deploy\lan\.env.lan
```

مقادیر زیر را پر کنید:

- `LAN_HOST_IP` = IP لپ‌تاپ (از مرحله ۴)
- `VITE_SUPABASE_URL` = `http://<LAN_HOST_IP>:8000`
- `SITE_URL` = `http://<LAN_HOST_IP>:3000`
- `API_EXTERNAL_URL` = `http://<LAN_HOST_IP>:8000`
- `ADDITIONAL_REDIRECT_URLS` = `http://<LAN_HOST_IP>:3000,http://localhost:3000`
- `POSTGRES_PASSWORD`، `JWT_SECRET`، `ANON_KEY`، `SERVICE_ROLE_KEY`، `VITE_SUPABASE_PUBLISHABLE_KEY`، `SUPABASE_PUBLISHABLE_KEY` با ابزار رسمی Supabase تولید کنید.

> ⚠️ `.env.lan` در `.gitignore` ignore شده است. هرگز آن را commit نکنید.

## ۶. تنظیم `LAN_HOST_IP`

مقدار `LAN_HOST_IP` باید با IP فعلی لپ‌تاپ روی شبکه شرکت یکی باشد. اگر IP عوض شد، باید `.env.lan` را به‌روزرسانی کرده و دوباره build کنید (چون `VITE_SUPABASE_URL` در زمان build داخل bundle قرار می‌گیرد).

> اگر `APP_PORT` یا `SUPABASE_API_PORT` را تغییر دادید، اسکریپت‌های `update-lan.ps1` و `check-lan.ps1` مقدارها را از `.env.lan` می‌خوانند و health check و آدرس‌های نمایش‌داده‌شده با همان portها تطبیق پیدا می‌کنند. در حالت پیش‌فرض آدرس کاربران `http://LAN_HOST_IP:3000` و API روی `http://LAN_HOST_IP:8000` است.

## ۷. اجرای اولیه

ابتدا `kong.yml` را از example بسازید (یک بار):

```powershell
New-Item -ItemType Directory -Force deploy\supabase\volumes\api | Out-Null
Copy-Item deploy\supabase\kong.yml.example deploy\supabase\volumes\api\kong.yml
```

سپس:

```powershell
docker compose -f deploy\lan\docker-compose.yml --env-file deploy\lan\.env.lan build
docker compose -f deploy\lan\docker-compose.yml --env-file deploy\lan\.env.lan up -d
```

یا کوتاه‌تر:

```powershell
powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\update-lan.ps1
```

## ۸. آپدیت بعد از تغییر در Lovable/GitHub

```powershell
powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\update-lan.ps1
```

این اسکریپت: `git pull` → `docker compose build` → `up -d` → health check.

## ۹. آدرس کاربران

همکاران داخل شبکه شرکت با مرورگر می‌توانند به آدرس زیر بروند:

```
http://<LAN_HOST_IP>:3000
```

> ⚠️ محدودیت مرورگر برای ضبط صدا: دسترسی به میکروفون روی آدرس‌های `http://192.168.x.x` یا هر IP داخلیِ بدون HTTPS توسط Chrome/Edge/Firefox مسدود می‌شود. برای تست پیام صوتی باید برنامه از یک **secure context** باز شود: یا روی خود لپ‌تاپ میزبان با `http://localhost:3000`، یا از طریق HTTPS داخلی/production. این محدودیت سمت مرورگر است و با تغییر کد یا policy دیتابیس دور زده نمی‌شود.

## ۱۰. پورت‌هایی که در Windows Firewall باید باز شوند

- TCP **3000** (اپ)
- TCP **8000** (Supabase API / Kong)

مثال (PowerShell Admin):

```powershell
New-NetFirewallRule -DisplayName "AfraKala LAN App"       -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private,Domain
New-NetFirewallRule -DisplayName "AfraKala LAN Supabase"  -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow -Profile Private,Domain
```

> فقط روی پروفایل `Private`/`Domain` باز کنید، نه `Public`.

## ۱۱. هشدارهای امنیتی ⚠️

- این deployment **فقط برای شبکه داخلی شرکت** است.
- بدون SSL است؛ ترافیک رمزنگاری نمی‌شود.
- **به اینترنت عمومی expose نکنید.** Port forwarding روی روتر انجام ندهید.
- IP عمومی به لپ‌تاپ ندهید.
- secret واقعی (`.env.lan`) را commit نکنید.
- Studio به‌صورت پیش‌فرض خاموش است. اگر روشن کردید (`--profile studio`)، فقط روی `127.0.0.1:3001` در دسترس است نه روی LAN.
- Postgres روی LAN publish نمی‌شود. برای debug می‌توانید خط `ports` در `docker-compose.yml` را uncomment کنید (`127.0.0.1:5432:5432`).

## ۱۲. خاموش کردن

```powershell
docker compose -f deploy\lan\docker-compose.yml --env-file deploy\lan\.env.lan down
```

برای پاک کردن دیتا (⚠️ غیرقابل بازگشت):

```powershell
docker compose -f deploy\lan\docker-compose.yml --env-file deploy\lan\.env.lan down -v
```

## ۱۳. دیدن log

```powershell
docker compose -f deploy\lan\docker-compose.yml --env-file deploy\lan\.env.lan logs -f
# یا فقط یک سرویس
docker compose -f deploy\lan\docker-compose.yml --env-file deploy\lan\.env.lan logs -f web
```

## ۱۴. Rebuild

```powershell
powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\update-lan.ps1
```

## ۱۵. بررسی وضعیت

```powershell
powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\check-lan.ps1
```

### ۱۵.۱ عیب‌یابی ماژول پیام‌رسان و رسیدهای تحویل (read-only)

ابزار تشخیصی `messenger-doctor.ps1` وضعیت runtime، envها، health endpointها، لاگ‌ها، schema، policyها، functionها و bucketهای مرتبط با `/messages` و رسیدهای تحویل را بررسی می‌کند. این ابزار **فقط خواندنی** است، هیچ داده‌ای تغییر نمی‌دهد و هیچ مقدار secretی چاپ نمی‌کند (فقط `SET` یا `MISSING`).

```powershell
powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\messenger-doctor.ps1
```

خروجی را کامل ذخیره کنید و برای گزارش باگ ضمیمه کنید. تا زمانی که خروجی این ابزار دیده نشود، هیچ migration جدیدی روی جداول messenger یا رسیدها نوشته/اجرا نخواهد شد.

## ۱۶. RBAC و کنترل دسترسی

کنترل دسترسی کاربران داخل اپ همان RBAC فعلی AfraKala است (جدول `user_roles` + `has_role()`). این deployment فقط مسیر شبکه را فراهم می‌کند و امنیت ورود و نقش‌ها از داخل اپ کنترل می‌شود. این مسیر نباید روی اینترنت عمومی expose شود.

## ۱۷. محدودیت‌ها

- تعداد کاربران همزمان روی یک لپ‌تاپ محدود است (مناسب چند کاربر داخل شرکت).
- بدون realtime/analytics گسترده، بدون edge functions، بدون imgproxy.
- OCR در LAN pilot غیرفعال است (`OCR_ENABLED=false`).
- migration واقعی، backup/restore production و انتقال دیتای واقعی جزو این فاز نیست.

## ۱۸. عیب‌یابی LAN

### `password authentication failed for user "supabase_auth_admin"` (و مشابه برای `authenticator`, `supabase_storage_admin`)

در LAN علاوه بر اسکریپت‌های init دیتابیس، سرویس one-shot به نام `db-role-fix` بعد از healthy شدن دیتابیس اجرا می‌شود و password رول‌های سرویس را با `POSTGRES_PASSWORD` فعلی هماهنگ می‌کند. این سرویس یک فایل واقعی و read-only را اجرا می‌کند: `deploy/lan/scripts/db-role-fix.sh`.

`db-role-fix` فقط roleهای LOGIN را repair می‌کند: `authenticator`، `supabase_auth_admin`، `supabase_storage_admin`، `supabase_admin` و `dashboard_user`. roleهای رزرو شده `anon`، `authenticated` و `service_role` فقط verify می‌شوند و بعد از bootstrap نباید `ALTER ROLE` شوند.

اگر log این خطا را نشان داد:

```text
ERROR: "anon" is a reserved role, only superusers can modify it
```

یعنی نسخه قدیمی fixer تلاش کرده role رزرو شده را تغییر دهد. آخرین کد را pull کنید، secretها را در صورت leak rotate کنید، و stack را با volume پاک‌شده دوباره بسازید.

اگر log این خطا را نشان داد:

```text
ERROR: "authenticator" is a reserved role, only superusers can modify it
```

یعنی `db-role-fix` به جای superuser واقعی Supabase با `-U postgres` وصل شده است. اسکریپت `deploy/lan/scripts/db-role-fix.sh` باید با `-U supabase_admin` و `PGPASSWORD=$POSTGRES_PASSWORD` وصل شود (Phase LAN.11). آخرین کد را pull کنید و stack را با volume پاک‌شده دوباره بالا بیاورید.

⚠️ اگر logهای `db-role-fix` شامل `BASH_EXECUTION_STRING=set` یا خود `POSTGRES_PASSWORD` بود، یعنی command داخل compose خراب اجرا شده و secret در Docker logs لو رفته است. در این حالت secretهای LAN را با سوییچ امن rotate کنید و سپس stack را با volume پاک‌شده از نو بالا بیاورید:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\lan\scripts\init-lan.ps1 -RotateSecrets
docker compose -f .\deploy\lan\docker-compose.yml --env-file .\deploy\lan\.env.lan down -v
docker compose -f .\deploy\lan\docker-compose.yml --env-file .\deploy\lan\.env.lan up -d
```

برای پاک کردن stack/volume و حذف logهای قدیمی کانتینرها:

```powershell
docker compose -f .\deploy\lan\docker-compose.yml --env-file .\deploy\lan\.env.lan down -v
```

اگر خروجی verify هنوز `has_password=false` نشان داد، fixer را دستی اجرا کنید و سپس سرویس‌های وابسته را restart کنید:

```powershell
docker compose -f deploy\lan\docker-compose.yml --env-file deploy\lan\.env.lan up -d db-role-fix
docker compose -f deploy\lan\docker-compose.yml --env-file deploy\lan\.env.lan logs --tail=80 db-role-fix
docker compose -f deploy\lan\docker-compose.yml --env-file deploy\lan\.env.lan restart auth rest storage
```

برای reset کامل تست LAN، volume دیتابیس را پاک و stack را از صفر بالا بیاورید؛ `db-role-fix` قبل از auth/rest/storage اجرا می‌شود:

```powershell
docker compose -f deploy\lan\docker-compose.yml --env-file deploy\lan\.env.lan down -v
docker compose -f deploy\lan\docker-compose.yml --env-file deploy\lan\.env.lan up -d
```

پس از `up -d` یا اجرای دستی fixer، وجود password برای roleهای سرویس را این‌طور verify کنید:

```powershell
docker exec afrakala-lan-db psql -U postgres -d postgres -c "select rolname, rolcanlogin, rolpassword is not null as has_password from pg_authid where rolname in ('authenticator','supabase_auth_admin','supabase_storage_admin','supabase_admin','dashboard_user') order by rolname;"
```

خروجی موردانتظار: برای هر ۵ role مقدار `has_password` باید `true` باشد و `db-role-fix` باید با status `Exited (0)` دیده شود. اسکریپت `check-lan.ps1` کانتینرهای exited را هم نمایش می‌دهد تا وضعیت این سرویس مشخص باشد.

⚠️ `down -v` تمام دیتای LAN را پاک می‌کند. در فاز LAN Pilot این قابل قبول است چون دیتای واقعی نیست.

مسیر کامل پیشنهادی بعد از pull روی Windows:

```powershell
cd C:\afrakala-lan\get-git-going
git pull origin main
Select-String -Path .\deploy\lan\scripts\*.sh,.\deploy\supabase\volumes\db\init\*.sh -Pattern "`r" -List
powershell -ExecutionPolicy Bypass -File .\deploy\lan\scripts\init-lan.ps1 -RotateSecrets
docker compose -f .\deploy\lan\docker-compose.yml --env-file .\deploy\lan\.env.lan down -v
docker compose -f .\deploy\lan\docker-compose.yml --env-file .\deploy\lan\.env.lan up -d
# wait 90 seconds manually
docker compose -f .\deploy\lan\docker-compose.yml --env-file .\deploy\lan\.env.lan ps
docker compose -f .\deploy\lan\docker-compose.yml --env-file .\deploy\lan\.env.lan logs --tail=80 db-role-fix
docker exec afrakala-lan-db psql -U postgres -d postgres -c "select rolname, rolcanlogin, rolpassword is not null as has_password from pg_authid where rolname in ('authenticator','supabase_auth_admin','supabase_storage_admin','supabase_admin','dashboard_user') order by rolname;"
powershell -ExecutionPolicy Bypass -File .\deploy\lan\scripts\check-lan.ps1
```

### `Cannot find module '/app/dist/server/index.js'` در سرویس `web`

`vite build` در حالت Node SSR خروجی را در `dist/server/server.js` می‌سازد، نه `dist/server/index.js`. فایل `server/node-entry.mjs` به‌روزرسانی شده و هر دو مسیر را بررسی می‌کند. اگر هنوز این خطا را دیدید، image را با `--no-cache` rebuild کنید:

```powershell
docker compose -f deploy\lan\docker-compose.yml --env-file deploy\lan\.env.lan build --no-cache web
docker compose -f deploy\lan\docker-compose.yml --env-file deploy\lan\.env.lan up -d web
```

### `/usr/bin/env: 'bash\r': No such file or directory` در logهای Postgres

این یعنی اسکریپت‌های init داخل `deploy/supabase/volumes/db/init/` با line ending ویندوزی (CRLF) چک‌اوت شده‌اند و کانتینر لینوکسی نمی‌تواند shebang را parse کند. در نتیجه رول‌های پایه Supabase ساخته نمی‌شوند و سرویس‌های auth/rest/storage با `role "authenticator" does not exist` کرش می‌کنند.

فایل `.gitattributes` در ریشهٔ ریپو این مسیرها را به LF قفل می‌کند. روی لپ‌تاپ LAN یک بار این کارها را انجام دهید:

```powershell
cd C:\afrakala-lan\get-git-going
git pull origin main
git rm --cached -r deploy/supabase/volumes/db/init
git reset --hard origin/main
docker compose -f .\deploy\lan\docker-compose.yml --env-file .\deploy\lan\.env.lan down -v
docker compose -f .\deploy\lan\docker-compose.yml --env-file .\deploy\lan\.env.lan up -d
```

بعد از این، `git status` نباید هیچ فایل `.sh` را به عنوان modified نشان دهد و logهای Postgres باید پیام `[afrakala/zz-10-roles] role bootstrap complete` را نمایش دهند.

**Verify (PowerShell):** بررسی اینکه هیچ CRLF در اسکریپت‌های init باقی نمانده:

```powershell
Select-String -Path .\deploy\supabase\volumes\db\init\*.sh -Pattern "`r" -List
```

خروجی موردانتظار: هیچ — هیچ فایلی نباید لیست شود.

### `role "supabase_auth_admin" does not exist` (یا `authenticator` / `supabase_storage_admin`)

در stack LAN، رول‌های پایه Supabase توسط اسکریپت `deploy/supabase/volumes/db/init/zz-10-afrakala-roles.sh` به‌صورت idempotent ساخته می‌شوند. این اسکریپت **فقط روی volume خالی** اجرا می‌شود. اگر دیتابیس قبلاً با نسخه قدیمی (که فرض می‌کرد رول‌ها از قبل وجود دارند) بالا آمده باشد، volume را پاک کرده و دوباره بالا بیاورید:

```powershell
docker compose -f deploy\lan\docker-compose.yml --env-file deploy\lan\.env.lan down -v
docker compose -f deploy\lan\docker-compose.yml --env-file deploy\lan\.env.lan up -d
```

### `Cannot find package 'h3-v2' imported from /app/dist/server/server.js`

SSR bundle خروجی Vite برخی dependencyهای runtime (مثل `h3-v2`) را inline نمی‌کند و به `node_modules` در runtime وابسته است. Dockerfile به‌روزرسانی شده تا `node_modules` را در stage نهایی هم کپی کند. image را با `--no-cache` rebuild کنید:

```powershell
docker compose -f deploy\lan\docker-compose.yml --env-file deploy\lan\.env.lan build --no-cache web
docker compose -f deploy\lan\docker-compose.yml --env-file deploy\lan\.env.lan up -d web
```