# RELEASE-READY-20260914 — بستهٔ انتشارِ image-only از main

> **هشدار — کدِ جدید بدون بازبینیِ مستقل.** حالتِ `-ImageOnly` در `release/emit-blocks.ps1` امروز
> (۲۰۲۶-۰۹-۱۴) در همین مأموریت نوشته شد و **هیچ بازبینیِ مستقلی نداشته است.** چهار بازبینیِ قبلی روی
> همین release line نُه probe شکسته پیدا کردند در کدی که درست به نظر می‌رسید؛ این کد صفر بازبینی دارد.
> خودِ نویسنده آن را falsify کرده (بخش ۶)، و این جای بازبینی را نمی‌گیرد. قسمت‌هایی از runbookِ
> منتشرشده که **از این کدِ بازبینی‌نشده** آمده‌اند، دقیقاً:
>
> 1. سرآیندِ سند (خطوط 3–23) و بخشِ «What this release delivers» (خطوط 25–42، متن از `release/config/staff-notes-20260914.fa.md`)
> 2. **Block 0**: عنوان، نثرِ PREREQUISITE، و ناحیهٔ `& { # checkout pull }` با **GATE PULL** (خطوط 46–119) و دو خط `Expect:` در 154–155. خودِ **GATE D1a** (127–152) کدِ بازبینی‌شده است، بدون تغییر.
> 3. **Block 1** کامل: **GATE L1** (خطوط 159–202). جایگزینِ Block 1ِ قبلی و کلِ Phase 3/Phase 4.
> 4. **Block 2**: نثر و ناحیهٔ **GATE TAR** (212–255)، و بدنهٔ ناحیهٔ `:lan retag` با **GATE LOAD** (326–355؛ خطوطِ 320–325 همان guardِ بازبینی‌شدهٔ C4 است). **GATE D2** (257–318) و **GATE D3** (357–375) بازبینی‌شده‌اند، بدون تغییر.
> 5. **Block 5**: پاراگرافِ `[image-only] D10 IS EXPECTED TO FAIL…` (خطوط 694–701). خودِ **GATE D10** بازبینی‌شده است.
> 6. **Block 6** (rollback) و **Block 7** (sign-off) کامل (746–795).
> 7. شماره‌گذاریِ پیوستهٔ blockها (حالتِ عادی یک شماره را جا می‌اندازد و یکی را تکرار می‌کند؛ نقص g).
> 8. منطقِ امتناعِ خودِ generator (بخش ۶.۱) و فایل‌های `release/config/withheld-migrations.txt` و `release/config/ledger-evidence-postgres-192.168.170.10-20260914.txt`.
>
> هر چیزِ دیگری در runbook (D1a، D2، D3، D6، D9، deploy، verify، D10) خروجیِ بدون‌تغییرِ کدِ بازبینی‌شدهٔ main است — و برابریِ بایت‌به‌بایتِ مسیرِ عادی در بخش ۶.۲ اثبات شده است.

**وضعیت: READY** — با شرط‌های بخش ۸. هر فاز خروجیِ خود را در سطحِ شاهدِ خواسته‌شده داد، و gateِ D6 روی دو bundleِ بد **FAIL** دیده شد (imageِ حادثه و یک literalِ کاشته‌شده).

---

## ۱. خلاصه

- **فقط image**: پایگاه دادهٔ production از قبل همهٔ migrationهای این انتشار را دارد (ledger ۶۹۷، بالاترین `20260914130000`). runbook **صفر** `mig_apply`، **صفر** INSERT و فقط یک `SELECT` دارد.
- **پیکربندیِ زمانِ اجرا**: یک image که روی هر میزبان درست است؛ آدرس Supabase، محیط و trusted hosts از env کانتینر می‌آید.
- **صفحهٔ «پخش حساب»** در مرکز مالی، و **مطالبات به تفکیکِ کارشناس فروش** — هر دو در کدِ main هستند؛ اما در `d60232f5` هم بودند (بخش ۸).
- **اعداد فارسی**: ۱۱۵ خطِ افزوده در **۴۳ فایل** بین `d60232f5` و main (اندازه‌گیری‌شده؛ برآوردِ «~۱۱۰ در ۴۳» تأیید شد).
- **542** که از امروز در پایگاه داده زنده است، اکنون در UI هم دیده می‌شود.
- **OCR فیش بانکی هنوز کار نمی‌کند.** **سقف‌های اعتباری تغییر نکرده‌اند** تا snapshotِ بعدیِ `daily_capital_settings`.
- پیش‌نیاز: runbook اول checkout را به `a935be0b` می‌آورد (Block 0)، و فقط بعد از آن `up` می‌کند.

## ۲. شناسه‌ها

| | مقدار |
|---|---|
| build sha | `a935be0b` (`a935be0bb7e51c4abfd3ed8086c57f54f820766d`) = `origin/main` |
| image id | `b67d27106ce4` (`sha256:b67d27106ce4a308097031a459a87e38733fc6afee9ee259aaa7bad73aab27f4`، digestِ manifest list در containerd store؛ config digest `b2aa561880bc`) |
| image env | `APP_GIT_SHA=a935be0b`، `APP_BUILD_TIME=2026-09-14T11:18:55Z` |
| tarball | `afrakala-app-a935be0b.tar.gz`، **251207762** بایت |
| tarball sha256 | `f9e6af1eaa61f4062249f220a49f848f8e6d517fef39201067f63ac64d4a7d73` |
| مسیر بسته | `\\192.168.170.8\dumps\release-20260914\` |
| runbook | `RELEASE-20260914.md`، sha256 `d89f8289f07f3bd0c388b3d7ce9d5d449c4edd9ea41cfe15cab468d268922376` |

**فهرستِ کاملِ پوشهٔ بسته (۵.۴):**

```
Name                                   Length LastWriteTime
afrakala-app-a935be0b.tar.gz        251207762 9/14/2026 4:21:26 PM
afrakala-app-a935be0b.tar.gz.sha256        95 9/14/2026 4:46:47 PM
build-a935be0b.json                       166 9/14/2026 4:21:14 PM
RELEASE-20260914.md                     54188 9/14/2026 4:40:54 PM
```

**هش‌ها — مبدأ و کپی (۵.۲)، `Get-FileHash` SHA256:**

```
afrakala-app-a935be0b.tar.gz         source=F9E6AF1EAA61F4062249F220A49F848F8E6D517FEF39201067F63AC64D4A7D73
                                     copy  =F9E6AF1EAA61F4062249F220A49F848F8E6D517FEF39201067F63AC64D4A7D73  MATCH=True
afrakala-app-a935be0b.tar.gz.sha256  source=802066A183A5994437AFC6D130685B0FB4059A35B547319B63899467B421014F
                                     copy  =802066A183A5994437AFC6D130685B0FB4059A35B547319B63899467B421014F  MATCH=True
build-a935be0b.json                  source=F47B32708061933F3D09F304A3DA121198B390F6B8DCD795322516936D68EE59
                                     copy  =F47B32708061933F3D09F304A3DA121198B390F6B8DCD795322516936D68EE59  MATCH=True
RELEASE-20260914.md                  source=D89F8289F07F3BD0C388B3D7CE9D5D449C4EDD9EA41CFE15CAB468D268922376
                                     copy  =D89F8289F07F3BD0C388B3D7CE9D5D449C4EDD9EA41CFE15CAB468D268922376  MATCH=True
ALL_MATCH=True        runbooks in folder: 1 -> RELEASE-20260914.md
```

### Phase 0 و Phase 1 — آنچه دقیقاً رخ داد

- `git fetch --all --prune` → `origin/main=a935be0bb7e51c4abfd3ed8086c57f54f820766d`. worktree: `D:/AfraKalaTest/wt-release-20260914`، HEAD `a935be0b`.
- `.env.lan` کپی شد؛ `Get-FileHash` مبدأ و مقصد برابر (`identical=True`)، مقدار چاپ نشد. `node_modules` یک junction به `D:\AfraKalaTest\app\node_modules` است (package.json/lockfile بین staging و main یکسان).
- `npm run typecheck` یک بار: **exit 2، ۷۰ خطا در ۶ فایل** = baseline.
- **انحراف ۱ — detached HEAD.** `git worktree add … origin/main` یک HEADِ جدا می‌سازد و guardِ `release/build.ps1:40-45` می‌خواهد `rev-parse --abbrev-ref HEAD` برابر `main` باشد. با تأیید مالک: `git switch -C main` در worktree (ref محلیِ `main` از `3bc526c4` به `a935be0b` fast-forward شد؛ هیچ push).
- **انحراف ۲ — build.ps1 زیرِ PowerShell 5.1 crash می‌کند** (نقص h). اجرای اول:
  ```
  CMD: powershell.exe -NoProfile -ExecutionPolicy Bypass -File D:\AfraKalaTest\wt-release-20260914\release\build.ps1
  BUILD_EXIT=1
  git.exe : From https://github.com/mohammadrezaafra66-arch/get-git-going
  At D:\AfraKalaTest\wt-release-20260914\release\build.ps1:54 char:1
  + & git -C $repoRoot fetch origin main 2>$null | Out-Null
      + FullyQualifiedErrorId : NativeCommandError
  ```
  این «refusal» نیست؛ crash است. build روی این باکس اجرا می‌شود نه production، پس اسکریپتِ **بدون تغییر** با pwsh 7.6.4 اجرا شد (همان میزبانی که همهٔ اجراهای قبلیِ release line استفاده کردند):
  ```
  CMD: pwsh -NoProfile -File D:\AfraKalaTest\wt-release-20260914\release\build.ps1
  exit file: 0
  ```
- **D4** (از خروجی): `docker save afrakala-app:a935be0b | gzip -6 > D:\AfraKalaTest\wt-release-20260914\release\out\afrakala-app-a935be0b.tar.gz`
- **D7**: روی موفقیت **هیچ خطی چاپ نمی‌کند** (`release/build.ps1:72-79` فقط روی رد چاپ می‌کند) — پس «خطِ D7» وجود ندارد. شاهدِ اجرای آن ترتیب است: `Building afrakala-app:lan from main @ a935be0b ...` قبل از check چاپ می‌شود و `Stamping image with:` از `deploy/lan/build.ps1` است که فقط **بعد** از گذشتن از D7 (`build.ps1:87`) صدا زده می‌شود. هر دو خط در خروجی هستند.
- **انحراف ۳ — `:lan` جابه‌جا شد و برگردانده شد** (با تأیید مالک). `deploy/lan/docker-compose.yml:43` نامِ `image: afrakala-app:lan` را ثابت دارد؛ build.ps1 راهی برای تغییرش ندارد.
  ```
  :lan BEFORE                    = sha256:296eb4b4899ff75d059f26eef2bdd9ebc5d0f6bb917c8103bfe2ea93ab4e9899
  :lan AFTER BUILD (pre-restore) = sha256:b67d27106ce4a308097031a459a87e38733fc6afee9ee259aaa7bad73aab27f4
  docker tag sha256:296eb4b4…9899 afrakala-app:lan   -> restore tag exit=0
  :lan AFTER RESTORE             = sha256:296eb4b4899ff75d059f26eef2bdd9ebc5d0f6bb917c8103bfe2ea93ab4e9899
  web = sha256:0c3106602cc9… StartedAt 2026-09-12T17:46:06.169711504Z restarts=0 healthy  (قبل و بعد یکسان)
  ```
  `:lan` حدود ۱۰ دقیقه (build + save) به imageِ جدید اشاره می‌کرد. هیچ کانتینری restart نشد. `296eb4b4899f` در آن فاصله tagِ `afrakala-app:3bc526c4` را داشت و قابل حذف نبود.

## ۳. جدولِ Phase 2 — artifact

**۲.۱ — شمارش در bundleها** (استخراج با `docker run --rm --entrypoint sh <img> -c 'tar -C /app/.output -cf - public server' | tar -x`؛ ۴۷۵ فایل js در client، ۵۳۹ فایل در SSR):

| needle | new client | new SSR | incident client | incident SSR |
|---|---:|---:|---:|---:|
| `192.168.170.10` | 0 | 0 | 0 | 0 |
| `192.168.170.8` | 1 | 3 | 3 | 5 |
| `:8000` | 0 | 1 | 0 | 0 |
| `:9000` | 0 | 0 | 2 | 2 |
| `kong:` | 0 | 1 | 0 | 0 |
| `localhost` | 9 | 27 | 9 | 27 |
| JWT-shaped (`eyJ….eyJ….…`) | **0** | **0** | 2 | 2 |

طبقه‌بندیِ هر برخوردِ imageِ جدید:
- client `192.168.170.8` ×1 = `192.168.170.8:11434` در متنِ راهنمای فارسیِ `_app.admin.ai-providers.tsx` — **غیرعملکردی** (در allowlistِ D6).
- client `localhost` ×9 = مقایسه‌ها (`e==="localhost"`)، پیش‌فرضِ `http://localhost:9999`ِ auth-js، fallbackِ router، و سه متنِ راهنمای فارسی — **غیرعملکردی**.
- ⇒ **صفر host literalِ عملکردی در client bundle؛ صفر JWT در هر دو.**
- SSR `:8000` و `kong:` ×1 = کامنتِ فارسیِ `runtime-config.ts` («استقرار `http://kong:8000` است») — غیرعملکردی.
- SSR `192.168.170.8` ×2 = **`process.env.WHATSAPP_PLATFORM_BASE_URL ?? "http://192.168.170.8:8002"`** در `src/lib/management/whatsapp-top-products.functions.ts:15` و `deploy/lan/docker-compose.yml:68` — **عملکردی، سمتِ سرور، عمدی، و از قبل در `d60232f5` هم بود.** gate نیست؛ بخش ۶ مورد ۲.

**۲.۲ – ۲.۶:**

| مرحله | ورودی | نتیجه | exit |
|---|---|---|---:|
| 2.2 D6+D9 (ناحیهٔ emitشده، PS 5.1، target `192.0.2.10`) | `afrakala-app:a935be0b` | `OK D6(i) … (475 js files read, 176 URL literal(s), 0 scheme-less host:port literal(s) and 4 quoted port-less IPv4 literal(s) classified)` · `OK D6(ii)` · `OK D6(iii): served config = "supabaseUrl":"http://192.0.2.10:8000"` · **GATE D6 PASS** · **GATE D9 PASS** | 0 |
| 2.3a همان ناحیه | imageِ حادثه `afrakala-app:3bc526c4` (= `296eb4b4899f`) | `http://192.168.170.8:9000  (explicit port, IP literal)` · **GATE D6 FAIL** | 1 |
| 2.3b همان ناحیه | `release-d6plant:falsify` = `a935be0b` + `;var __plant="http://"+"192.168.170.10"+":8000";` در `_app.sales.promotion-nominations-bByuLblk.js` | `192.168.170.10  (quoted IPv4 literal with no port, IP literal)` · **GATE D6 FAIL** | 1 |
| 2.4 production-shaped | `SUPABASE_URL=APP_SUPABASE_PUBLIC_URL=http://192.0.2.10:8000`، `VITE_APP_ENV=production`، `VITE_TRUSTED_HOSTS=192.168.170.10`، کلیدِ placeholder؛ پورت `127.0.0.1:39311` | یک assignment؛ `{"supabaseUrl":"http://192.0.2.10:8000","supabaseAnonKey":"placeholder-prod-shaped-key","appEnv":"production","trustedHosts":"192.168.170.10"}` — هر چهار فیلد `equal=True` | — |
| 2.4 کنترلِ test | `http://192.168.170.8:9000`، `test`، `192.168.170.8`؛ پورت `39312` | `{"supabaseUrl":"http://192.168.170.8:9000",…,"appEnv":"test","trustedHosts":"192.168.170.8"}` — هر چهار `equal=True`؛ **هر چهار فیلد با production-shaped متفاوت** | — |
| 2.5 بنر در markupِ production-shaped | `role="alert"` 0 · `data-environment=` 0 · `bg-amber-100` 0 · متنِ «محیط تست» 0 · `bg-red-600` 0 · متنِ «هشدار ایمنی» 0 | **هیچ بنری** | — |
| 2.5 همان شمارش در کنترلِ test | `role="alert"` 1 · `data-environment` 1 · `bg-amber-100` 1 · «محیط تست» 1 | آشکارساز بنر را **می‌بیند** | — |
| 2.6 پاک‌سازی | `docker stop release-verify-prod release-verify-test` (با `--rm`)، `docker rmi release-d6plant:falsify` | `docker ps -a` هیچ کانتینرِ `release-verify`/`d6plant`/`a935be0b`/`3bc526c4` نشان نداد؛ پورت‌های 39311/39312 گوش نمی‌دهند؛ `:lan`=`296eb4b4899f`؛ web دست‌نخورده | 0 |

**روشِ ۲.۵.** بنرِ کهربایی (`src/routes/__root.tsx:337-351`) فقط به `appEnv` بستگی دارد و در SSR رندر می‌شود، پس غیابش از markupِ سرو‌شده مستقیم قابل خواندن است — و کنترلِ test نشان داد وقتی هست دیده می‌شود. بنرِ قرمز (`:352-354`) به `window.location.hostname` بستگی دارد که فقط در `useEffect` مقدار می‌گیرد، پس **SSR هرگز آن را رندر نمی‌کند** و markup به‌تنها نمی‌تواند غیابش را ثابت کند. برای آن، predicateِ دقیقِ `suspiciousProductionRuntime` روی config سرو‌شده با `hostname=192.168.170.10` ارزیابی شد: **false**؛ کنترل با `192.168.170.99` (خارج از trusted list): **true**. رندرِ واقعیِ مرورگر روی hostname `192.168.170.10` سنجیده نشد (بخش ۸).

هیچ کانتینری `SUPABASE_URL` به `.10` نداشت؛ هیچ مرورگری صفحه‌ها را باز نکرد؛ فقط `curl` به `127.0.0.1`.

## ۴. runbook — شمارش و اعتبارسنجی

```
CMD: powershell.exe -NoProfile -ExecutionPolicy Bypass -File release\validate-blocks.ps1 -Path release\out\RELEASE-20260914.md
Validated: release\out\RELEASE-20260914.md
  mig_apply lines found : 0
  unique versions       : 0
  blocks found          : 8
  blocks missing Expect : 0

PASSED — no problems found.
VALIDATE_EXIT=0
```

- **Block count: 8** · **`Expect:` lines: 40** · ناحیه‌های paste: 10 (۷ gate + checkout pull + `:lan retag` + deploy)؛ هر ده با parserِ **PowerShell 5.1.26100.9278** بدون خطا و هر کدام دقیقاً یک statementِ سطح‌بالا.
- **۳.۲**: `mig_apply` 0 · `ledger_insert` 0 · `INSERT` (هر حالت) 0 · افعالِ نوشتنِ SQL (`UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE`) 0 · تنها SQL: `SELECT concat_ws(chr(124), pg_is_in_recovery(), count(*), max(version)) FROM supabase_migrations.schema_migrations;`
- **ترتیب (۳.۳)**: pull (59) → D1a (127) → اولین `Expect:` (151) → L1 (170) → TAR (216) → **D2 (257) قبل از `:lan retag` (320)** → D3 (357) → D6+D9 (425) → **deploy/`up` (654)** → verify → **D10 (703)** → rollback (746). متنِ کامل در پیوست.
- **۳.۶ — یک فرمانِ emitشده که واقعاً اجرا شد.** ناحیه‌های `checkout pull` و `GATE D1a` **عیناً** (md5 `824B9A61…` و `7EE8B66D…`) در یک session PS 5.1 روی کلونِ scratch با HEAD `9bc8d554`:
  ```
  HEAD_before=9bc8d554
  Updating 9bc8d554..a935be0b
  Fast-forward
   ... 24 files changed, 5747 insertions(+), 60 deletions(-)
  OK PULL: HEAD = a935be0bb7e51c4abfd3ed8086c57f54f820766d; compose passes VITE_APP_ENV at runtime (line 55)
  GATE PULL PASS
  OK D1a: HEAD = a935be0b, tree clean
  GATE D1a PASS
  EXIT_36=0
  ```
  همچنین GATE L1 روی این باکس: عیناً → `GATE L1 FAIL could not read the ledger of database postgres (psql exit 3, got '')` (exit 1)؛ با `$db='afrakala'` → `GATE L1 FAIL ledger is 701 rows / top 20260914130000, this document was emitted against 697 rows / top 20260914130000` (exit 1)؛ با `afrakala`+`701` → `GATE L1 PASS` (exit 0). و GATE TAR روی **بستهٔ واقعی** روی share (فقط `$local` به scratch): `GATE TAR PASS` (exit 0)؛ با `$expect` غلط: `GATE TAR FAIL the .sha256 on the share says f9e6…, this document says 0000…` (exit 1). `docker load -i` روی tarballِ کپی‌شده: `Loaded image: afrakala-app:a935be0b`، exit 0، `:lan` قبل و بعد `296eb4b4899f`.
- **۳.۷**: عبارتِ D10 در خودِ Block 5، درست بالای ناحیهٔ D10 (خطوط 694–701): «D10 IS EXPECTED TO FAIL IF IT RUNS BEFORE THE DEPLOY BLOCK ABOVE, AND THAT IS CORRECT … AFTER the deploy, a D10 FAIL is real».

## ۵. rollback — آمادهٔ paste

**تصویر (image) از قبل مجاز است. پایگاه داده هرگز.** (عیناً در Block 6.) از `C:\afrakala`، یک خط:

```powershell
docker tag afrakala-app:lan-rollback afrakala-app:lan; docker compose --env-file deploy/lan/.env.lan -f deploy/lan/docker-compose.yml up -d --no-deps --no-build web
```

تأیید (فقط‌خواندنی):

```powershell
docker inspect afrakala-lan-web --format "{{.Image}}"
docker image inspect afrakala-app:lan-rollback --format "{{.Id}}"
curl.exe -s -o NUL -w "%{http_code}`n" http://192.168.170.10:3000/login
```

دو id باید **یکسان** باشند؛ `/login` = 200. `:lan-rollback` را **GATE D2** قبل از جابه‌جاییِ `:lan` از روی imageِ **در حالِ اجرای کانتینر** می‌گیرد (نه از `:lan`)، و **GATE D3** سپس متفاوت‌بودنِ `:lan` و `:lan-rollback` را assert می‌کند. Phase 4 — هر چهار مورد در متنِ emitشده حاضر است؛ نقل در پیوست.

اگر تا D2 نرسیده‌اید، rollback لازم نیست: هیچ‌چیز تغییر نکرده جز checkout (Block 0).

## ۶. نتایجِ Phase 6 و سه راهِ خرابی

### ۶.۱ — شرطِ ۲ مالک: falsifyِ امتناع‌های حالتِ جدید

هر مورد یک ورودی را عوض می‌کند، `-Date` جدا دارد، exit روی خطِ خودش خوانده شد، و نباید فایلی بنویسد.

| # | ورودیِ غلط | پیامِ امتناع (عیناً) | exit | فایل |
|---|---|---|---:|---|
| R1 | `-ExpectLedgerRows 698` | `ledger evidence has 697 rows but the target's recorded ledger has 698 -- the evidence does not describe the target` | 1 | no |
| R2 | `-ExpectLedgerMax 20260913111000` | `ledger evidence tops out at '20260914130000' but the target's recorded top version is 20260913111000 -- …` | 1 | no |
| R2b | evidence بدون `20260914130000` | `ledger evidence has 696 rows but the target's recorded ledger has 697 -- …` | 1 | no |
| R3 | همان، با 696/`20260913111000` | `1 migration file(s) have no ledger row on postgres@192.168.170.10 and no recorded disposition: 20260914130000_542_close_definer_views_shop_secret_inactive_profiles.sql` | 1 | no |
| R3b | `withheld` بدون 533 | `… no recorded disposition: 20260913101000_533_pg_cron_http_scheduler.sql` | 1 | no |
| R3c | `withheld` با target `afrakala@192.168.170.8` | `2 migration file(s) … no recorded disposition: 20260913101000_533_pg_cron_http_scheduler.sql, 20260913102000_534_cron_run_log.sql` | 1 | no |
| R4 | orphan row (**آزمونِ غلط‌ساخته**، پایین) | امتناعِ R3 به‌جای orphan | 1 | no |
| R4b | evidence + `20990101000000`، با 698/`20990101000000` | `1 ledger row(s) on postgres@192.168.170.10 have no migration file on disk: 20990101000000` | 1 | no |
| R5 | evidence + `20260905171000` (SKIP) | `20260905171000_449_retire_daily_capital_functions.sql has a ledger row on the target, but release\config\decided-migrations.txt records it SKIP (OG-J) -- a row for a never-run migration` | 1 | no |
| R6 | evidence بدون `20260822210000` (LEDGER_ONLY) | `20260822210000_373_close_anon_default_privileges.sql has NO ledger row on the target, but release\config\decided-migrations.txt records it LEDGER_ONLY (OG-C) -- that row must exist` | 1 | no |
| R7 | خطِ تکراری | `… lists version 20260914130000 twice (line 712)` | 1 | no |
| R8 | `2026091413` | `… line 712 is not a 14-digit version: '2026091413'` | 1 | no |
| R9 | `-RehearsalReport` هم داده شد | `-RehearsalReport was also given; an image-only release has no rehearsal, pick one mode` | 1 | no |
| R10 | بدون `-Withheld` | `-Withheld is required and must exist (got '')` | 1 | no |
| R11 | `-TarballSha256 F9E6` | `-TarballSha256 must be 64 lower-case hex characters (got 'F9E6')` | 1 | no |
| A1 | ورودی‌های درست | exit 0؛ ۷ خطِ `ACCEPTED`، هر کدام با فایلِ ثبت‌کننده: 336/343 → `release\config\known-shape-tolerant-migrations.txt`؛ 449/450/452 → `release\config\decided-migrations.txt` (OG-J)؛ 533/534 → `release\config\withheld-migrations.txt` (منبع `edd55fb9:docs/runbooks/gap-close-afrakala-20260914.md:35` و `:36`) | 0 | yes |

**اجرای اول `BROKEN_REFUSALS=1` چاپ کرد.** علت: آزمونِ R4 را خودم غلط ساختم — برای ثابت‌ماندنِ ۶۹۷ ردیف، 542 را حذف کرده بودم، پس مولد **درست** زودتر روی 542 امتناع کرد و امتناعِ orphan هرگز دیده نشد. R4b فقط orphan را غلط می‌کند؛ پیامِ «no recorded disposition» در آن غایب بود و امتناعِ orphan دیده شد. **با R4b به‌جای R4: `BROKEN_REFUSALS=0`.**

### ۶.۲ — شرطِ ۱ مالک: مسیرِ عادی بایت‌به‌بایت یکسان

هر جفت با همان ورودی‌ها، یک بار با emitterِ main (blob `b348c3f2`، checkout CRLF با md5 `E7C422A4…`) و یک بار با emitterِ تغییریافته، هر دو با pwsh:

| جفت | ورودی | sha256 قبل = بعد | `diff` |
|---|---|---|---|
| A | `rehearsal-e4b.md` + manifest + decided | `A73B9874…F010` (79928 بایت) | خالی، exit 0 |
| B | همان + `-D6TargetHost 192.0.2.10` | `E23C5C1E…C185` (79909) | خالی، exit 0 |
| C | فقط `rehearsal-e4b.md` (شاخهٔ بدون manifest) | `F24B9266…F318` (79165) | خالی، exit 0 |

پس از آخرین ویرایشِ emitter هر سه دوباره تولید و مقایسه شدند: `IDENTICAL=True` ×3. مسیرِ عادی بدون rehearsal هنوز `FATAL: rehearsal report not found:` و exit 1 می‌دهد.
**تلاشِ اولِ C شکست خورد** (78498 در برابر 79165 بایت). علت اندازه‌گیری شد: نسخهٔ «قبل» را از blobِ git (LF، `CR=0`) ساخته بودم، در حالی که checkoutِ worktree با `core.autocrlf=true` فایل CRLF است و here-stringها پایانِ خطِ فایلِ منبع را به خروجی می‌برند. `diff` با نادیده‌گرفتنِ CR خالی بود؛ سپس «قبل» از کپیِ CRLF با همان md5 ِ `E7C422A4…` دوباره ساخته شد و `diff` خام خالی شد.

### ۶.۳ — falsifyِ gateهای runbook

| probe | ورودی | نتیجه | exit |
|---|---|---|---:|
| 6.1 D3 | دو id **یکسان** (`b67d27106ce4` هر دو؛ یک تابعِ `docker` در session فقط همان دو خواندن را پاسخ داد — tagِ `:lan-rollback` روی این باکس ساخته نشد) | `FAIL D3: :lan and :lan-rollback are the same image (b67d27106ce4).` · `GATE D3 FAIL` | 1 |
| 6.1 کنترل | `b67d27106ce4` / `8b04c479e022` | `GATE D3 PASS` | 0 |
| 6.1 مشاهده | rollback id **خالی** (tag غایب) | `OK D3: lan=b67d27106ce4 rollback=` · **`GATE D3 PASS`** ← نقص j | 0 |
| 6.2 D1a | کلونِ scratch با HEADِ واقعیِ `9bc8d554` (git واقعی، بدون جایگزین) | `FAIL D1a: HEAD is 9bc8d554 but this release was built from a935be0b` · `GATE D1a FAIL` | 1 |

### ۶.۴ — سه راهی که production هنوز می‌تواند خراب شود و هیچ gateی در runbook نمی‌گیرد

1. **Reboot از درختِ دیگر.** runbookِ 2026-09-12 ثبت کرده بود که scheduled task «AfraKala LAN Auto Start» روی boot `C:\AfraKalaServer\get-git-going01lan\deploy\lan\start-afrakala-lan.ps1` را از **checkoutِ دیگری** اجرا می‌کند (compose قدیمی، بدون `--no-deps`؛ `release/emit-blocks.ps1:378-383` روی main). commitِ `9bc8d554` اسکریپت‌ها را به repo آورد، ولی اینکه task به `C:\afrakala` برگردانده شده باشد **از اینجا دیده نمی‌شود**. اگر نه، اولین reboot کانتینرِ web را از composeِ build-argی می‌سازد: همین image بنرِ کهربایی و trusted-hostِ غلط نشان می‌دهد، یا با `db-role-fix` کلِ app می‌خوابد (OG-68). این runbook scheduled task را نمی‌خواند؛ D10 فقط همان لحظهٔ deploy را می‌سنجد.
2. **SSR ِ production برای WhatsApp به کامپیوترِ تست زنگ می‌زند.** `WHATSAPP_PLATFORM_BASE_URL` پیش‌فرضِ `http://192.168.170.8:8002` دارد (`deploy/lan/docker-compose.yml:68`، `src/lib/management/whatsapp-top-products.functions.ts:15`). اگر `.env.lan`ِ production آن را override نکرده باشد، گزارشِ «محصولاتِ پرتقاضای واتس‌اپ» روی production دادهٔ پلتفرمِ روی باکسِ تست را نشان می‌دهد، یا با خاموش‌شدنِ `.8` خطا می‌دهد. D6 فقط client bundle را اسکن می‌کند و D10 فقط `supabaseUrl`. (پیش‌از این انتشار هم وجود داشت؛ این انتشار آن را حفظ می‌کند.)
3. **D10 فقط یک فیلد از چهار فیلدِ runtime config را می‌سنجد.** `supabaseAnonKey` (از `SUPABASE_PUBLISHABLE_KEY` — تا امروز build arg به نامِ `VITE_SUPABASE_PUBLISHABLE_KEY` بود)، `appEnv` و `trustedHosts` هیچ gateی ندارند. اگر `.env.lan`ِ production فقط `VITE_SUPABASE_PUBLISHABLE_KEY` را داشته باشد و `SUPABASE_PUBLISHABLE_KEY` نه، یا `VITE_TRUSTED_HOSTS` خالی باشد، **همهٔ gateها PASS می‌شوند** و خرابی (ورودِ ناموفق، یا بنرِ قرمزِ «هشدار ایمنی» که فقط در مرورگر رندر می‌شود) اولین بار در مرورگرِ کارمندان دیده می‌شود — sign-offِ دستیِ Block 7 آن را می‌بیند، ولی بعد از اینکه production زنده شده است.

### ۶.۵ — نقص‌های release line (برای دورِ بعد؛ همه روی main در `a935be0b`)

| # | فایل:خط | نقص | در این انتشار |
|---|---|---|---|
| **a** | `release/emit-blocks.ps1:23`، `:55-59` | `-RehearsalReport` اجباری و بدون rehearsal با `FATAL` خارج می‌شود؛ انتشارِ image-only (پایگاه‌دادهٔ از-قبل-به‌روز) راهِ درستی ندارد. | دور زده شد با `-ImageOnly` (بازبینی‌نشده) |
| **b** | `release/emit-blocks.ps1:374-509` | «Phase 3 - autostart» همیشه emit می‌شود: `git commit`/`git push` روی لپ‌تاپِ production (`:410-411`، `:464-465`)، `Set-ScheduledTask` (`:435`)، ویرایشِ `.env.lan`، و **`up -d --no-deps web` در `:501` — قبل از اینکه D2 (`:693` به بعد) tagِ rollback را بگیرد.** وضعیتش از 2026-09-12 است. | در `-ImageOnly` emit نمی‌شود |
| **c** | `release/emit-blocks.ps1:293-316`، `:1153-1156` | هیچ بلوکِ `git pull`ی نیست؛ D1a می‌خواهد HEAD = build sha ولی هیچ‌چیز قبلش checkout را به آنجا نمی‌آورد، و deploy با composeِ همان checkout `up` می‌کند. | Block 0 / GATE PULL |
| **d** | `release/emit-blocks.ps1:354-356`، `:363-364` (و `:590`، `:620`، `:661`) | Block 1 با ادامهٔ خطِ bashیِ `\` در سندی که در PowerShell paste می‌شود؛ و `psql -U supabase_admin` بدون رمز روی این stack رد می‌شود — اندازه‌گیری‌شده: `fe_sendauth: no password supplied`. | GATE L1 (stdin + `$POSTGRES_PASSWORD` داخلِ کانتینر) |
| e | `release/emit-blocks.ps1:767`، `:803` | `gunzip -c … \| docker load`: در PS 5.1 pipeِ بینِ دو برنامهٔ native متن حمل می‌کند و جریانِ باینری را خراب می‌کند؛ `gunzip` هم روی PATHِ ویندوز نیست. | `docker load -i` |
| f | `release/emit-blocks.ps1:1242-1243` | rollback دو خط است نه یک، `--no-build` ندارد، و نمی‌گوید image از قبل مجاز و DB هرگز. | Block 6 |
| g | `release/emit-blocks.ps1:825`+`:829`، `:1109` | شماره‌گذاری: یک شماره جا می‌افتد و «artifact probe (D6)» و «rollback tag» هر دو یک شماره می‌گیرند — در خروجیِ main: `Block 28` → `Block 30` → `Block 30`. | پیوسته |
| h | `release/build.ps1:3`، `:54` | ادعای «PowerShell 5.1 compatible» ولی زیرِ 5.1 روی `git fetch` با `NativeCommandError` crash می‌کند (`$ErrorActionPreference="Stop"` + stderrِ git). | با pwsh 7 اجرا شد |
| i | `deploy/lan/docker-compose.yml:43` + `release/build.ps1:87`؛ `:72-79` | build همیشه `afrakala-app:lan`ِ ماشینِ build را جابه‌جا می‌کند (نامِ ثابت)؛ D7 روی موفقیت هیچ خطی چاپ نمی‌کند، پس اجرایش از خروجی قابل نقل نیست. | `:lan` برگردانده شد |
| j | `release/emit-blocks.ps1:778-790` | D3 فقط `$lanId -eq $rbId` را می‌سنجد؛ اگر `:lan-rollback` وجود نداشته باشد (id خالی) **PASS** می‌دهد (۶.۳). D2 قبلش این حالت را می‌گیرد، پس اثرِ عملی محدود است. | بدون تغییر (کدِ بازبینی‌شده) |
| k | `release/emit-blocks.ps1:772` | `Expect: loaded image ID = <manifest.image_id>`: روی containerd store این digestِ manifest list است (`b67d27106ce4`)؛ روی classic store همان image id دیگری نشان می‌دهد. | LOAD با `APP_GIT_SHA` می‌سنجد |
| l | `release/emit-blocks.ps1:298-300` | D1a رشتهٔ `git rev-parse --short HEAD` را با sha ِ ۸ نویسه‌ای مقایسه می‌کند؛ طولِ abbreviation به repo بستگی دارد → FAILِ کاذب (جهتِ امن). | بدون تغییر |

## ۷. پیام برای کارکنان — آمادهٔ ارسال

(همان متنِ `release/config/staff-notes-20260914.fa.md` که در runbook هم آمده است.)

---

**برای همکاران — نسخهٔ جدید سامانهٔ افراکالا (۲۳ شهریور ۱۴۰۵)**

در این نسخه:

- **یک نسخه، درست روی هر سرور.** آدرس سرور دیگر داخل خود برنامه ثابت نشده است؛ برنامه آن را هنگام اجرا از تنظیمات همان سرور می‌خواند. نتیجه برای شما: نوار هشدار «محیط تست» نباید روی سرور اصلی دیده شود.
- **صفحهٔ «پخش حساب» در مرکز مالی** در دسترس است.
- **گزارش مطالبات به تفکیک کارشناس فروش** در صفحهٔ مطالبات در دسترس است.
- **اعداد فارسی:** در حدود ۱۱۰ جای مختلف (۴۳ بخش برنامه) اعدادی که لاتین نمایش داده می‌شدند اکنون فارسی نمایش داده می‌شوند.
- **دسترسی‌ها سخت‌تر شد:** حساب‌های غیرفعال یا بدون نقش دیگر مانده‌های بانکی و مانده‌های سرمایه را نمی‌بینند، و کارشناسان فروش دیگر کلید اتصال دیدار را نمی‌بینند. این تغییر از قبل روی پایگاه داده فعال بود؛ اکنون در صفحه‌ها هم دیده می‌شود.

آنچه در این نسخه **کار نمی‌کند** یا **تغییر نکرده** است:

- **خواندن خودکار فیش بانکی (OCR) هنوز کار نمی‌کند.** فیش‌ها را مثل قبل دستی ثبت کنید.
- **سقف اعتبار مشتریان امروز تغییر نکرده است** و تا ثبت روزانهٔ بعدی تنظیمات سرمایه (daily_capital_settings) هم تغییر نمی‌کند. اگر سقفی عجیب به نظر رسید، آن را به این نسخه نسبت ندهید.

اگر پس از به‌روزرسانی نوار هشدار زرد یا قرمز بالای صفحه دیدید، یا ورود کار نکرد، لطفاً فوراً به مدیر سامانه خبر دهید.

---

متن عمداً «در دسترس است» می‌گوید نه «جدید»: بخش ۸ مورد ۲.

## ۸. آنچه تأیید نشد

1. **هیچ‌چیز روی `192.168.170.10` سنجیده نشد** — نه ledger، نه `.env.lan`، نه scheduled task، نه دسترسیِ آن به share. ledger ِ ۶۹۷ از dumpِ `afrakala-db-20260913-post-release-696.dump` (۶۹۶ ردیف، برابر با preflightِ زندهٔ r542: `ledger_rows=696|ledger_max=20260913111000`) به‌اضافهٔ ردیفِ ثبت‌شدهٔ 542 (`r542-run-20260914.md:146,150`) ساخته شد. GATE L1 آن را پیش از هر تغییری روی production دوباره می‌خواند.
2. **آنچه production واقعاً اجرا می‌کند.** `APP_GIT_SHA=d60232f5` برچسب است؛ CLAUDE.md مستند کرده که این برچسب می‌تواند کهنه باشد. «پخش حساب» (`FinanceHub.tsx`، `allocation-workbench`) و ستونِ «کارشناس فروش» در `_app.accounting.receivables.tsx` (diffِ صفر بین `d60232f5` و main) **در `d60232f5` هم بودند.** یا این دو برای کارکنان جدید نیستند، یا برچسب دروغ می‌گوید. از اینجا قابل تشخیص نیست. فقط «اعداد فارسی» (`9268cd9d`، #446) بعد از `d60232f5` است.
3. **شمارِ commitها — اصلاح.** `git rev-list --count 9bc8d554..a935be0b` = **38**؛ `--no-merges` = **35**؛ `--first-parent` = 3. عددِ ۳۵ِ مأموریت شمارِ بدون merge بود و درست است؛ ۳۸ شمارِ کل. از `d60232f5` تا main: ۴۴ کل، ۴۱ بدون merge.
4. **بنرِ قرمز در مرورگرِ واقعی** روی hostname `192.168.170.10` رندر نشد؛ فقط predicateِ کد روی config سرو‌شده ارزیابی شد.
5. **D10 هرگز روی استقرارِ واقعیِ این image اجرا نشد.** GATE D2، ناحیهٔ `:lan retag`/GATE LOAD و deploy روی این باکس اجرا نشدند (tag یا کانتینرِ زنده را جابه‌جا می‌کردند)؛ `docker load -i` و GATE D3 جداگانه سنجیده شدند.
6. **rollback زیرِ composeِ pull‌شده** (imageِ قبلی + دو env ِ اضافه) آزموده نشد.
7. نوعِ image store ِ production (containerd یا classic) نامعلوم است — فقط روی idِ نمایش‌داده اثر دارد، نه روی gateها.
8. **GATE PULL روی production**: اگر `C:\afrakala` فایلِ untracked داشته باشد، PULL و D1a (در جهتِ امن) FAIL می‌شوند؛ `git fetch` از GitHub روی آن ماشین هم سنجیده نشد.
9. **533 و 534** روی production اعمال نشده‌اند و در این انتشار هم نیستند؛ grep نشان داد کدِ main هیچ ارجاعی به `cron_run_log` یا `generate_birthday_notifications_worker` ندارد و `generate_birthday_notifications` از migration 220 وجود دارد — این یک جست‌وجوی متنی است، نه اجرای صفحه‌ها روی production.
10. «OCR کار نمی‌کند» و «سقف‌ها تا snapshotِ بعدی تغییر نمی‌کنند» از مأموریت آمده‌اند و در این جلسه اندازه‌گیری نشدند؛ «542 در UI دیده می‌شود» در مرورگر سنجیده نشد.
11. tests: پروژه script ِ test ندارد؛ هیچ testی اجرا نشد. `npm run build` بیرون از Docker اجرا نشد. typecheck فقط baseline (۷۰/۶).
12. `afrakala-lan-rest` در این جلسه «Up 30 minutes» نشان داد؛ من آن را restart نکردم.
13. **کدِ `-ImageOnly` بازبینیِ مستقل ندارد** (سرِ سند).

---

## پیوست — نقل‌های کاملِ ۳.۳ و Phase 4 از `RELEASE-20260914.md`

خطوط عیناً از runbookِ منتشرشده (sha256 `d89f8289…2376`) استخراج شده‌اند؛ شمارهٔ خط در ابتدای هر بخش.

### 3.3 · D1 checkout-state block (Block 0: pull region, then GATE D1a) — before any Expect: — runbook lines 46–155

```text
### Block 0 - checkout: bring C:\afrakala to the build sha a935be0b, then prove it (D1)  [pull region: image-only]

PREREQUISITE, BEFORE ANY BUILD OR UP: the checkout must be pulled to main's build sha first.
Production's checkout 9bc8d554 carries a compose file that passes VITE_APP_ENV and
VITE_TRUSTED_HOSTS only as BUILD args (deploy/lan/docker-compose.yml:38-39 at 9bc8d554). Main's
compose passes them at RUNTIME (deploy/lan/docker-compose.yml:55-56 at a935be0b). This release never
builds on production: it loads a pre-built image. A container created from the OLD compose file
therefore receives neither value, and even the correct image renders the amber test banner and
the wrong trusted-host list. The pull is what makes the correct image behave correctly.

The pull below is a fast-forward to exactly a935be0b, not to whatever main is by the time you run
it: if main has moved on, the checkout still stops at the commit this image was built from.

    & {   # checkout pull -- paste from this line to the matching closing brace
    if ($global:AFRAKALA_FAILED_GATES -is [hashtable] -and $global:AFRAKALA_FAILED_GATES.Count -gt 0) {
      $failedNow = @($global:AFRAKALA_FAILED_GATES.GetEnumerator() | ForEach-Object { "GATE $($_.Key) FAIL $($_.Value)" }) -join ' | '
      Write-Host "NOT RUN: gate(s) FAILED earlier in this shell and have not printed PASS since: $failedNow"
      throw "NOT RUN -- nothing in this region ran. Failed earlier in this shell: $failedNow"
    }
    if ($global:AFRAKALA_FAILED_GATES -isnot [hashtable]) { $global:AFRAKALA_FAILED_GATES = @{} }
    $buildSha = 'a935be0b'
    if (-not (Test-Path 'deploy\lan\docker-compose.yml') -or -not (Test-Path '.git')) {
      $gateWhy = "not in the repository root (expected C:\afrakala, got $((Get-Location).Path))"
      Write-Host "GATE PULL FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['PULL'] = $gateWhy; throw "STOPPED at gate PULL: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    $branch = (git rev-parse --abbrev-ref HEAD)
    $branchExit = $LASTEXITCODE
    if ($branchExit -ne 0 -or $branch -ne 'main') {
      $gateWhy = "checkout is on '$branch' (git exit $branchExit), not main"
      Write-Host "GATE PULL FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['PULL'] = $gateWhy; throw "STOPPED at gate PULL: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    $dirty = (git status --porcelain)
    if ($dirty) {
      $dirty | ForEach-Object { Write-Host "    $_" }
      $gateWhy = "working tree is not clean ($(@($dirty).Count) path(s)) -- nothing was pulled"
      Write-Host "GATE PULL FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['PULL'] = $gateWhy; throw "STOPPED at gate PULL: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    git fetch origin main
    $fetchExit = $LASTEXITCODE
    if ($fetchExit -ne 0) {
      $gateWhy = "git fetch origin main failed (exit $fetchExit)"
      Write-Host "GATE PULL FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['PULL'] = $gateWhy; throw "STOPPED at gate PULL: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    git merge --ff-only $buildSha
    $mergeExit = $LASTEXITCODE
    if ($mergeExit -ne 0) {
      $gateWhy = "git merge --ff-only $buildSha failed (exit $mergeExit) -- the checkout is not an ancestor of the build sha"
      Write-Host "GATE PULL FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['PULL'] = $gateWhy; throw "STOPPED at gate PULL: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    $full = [string](git rev-parse HEAD)
    $revExit = $LASTEXITCODE
    if ($revExit -ne 0 -or -not $full.StartsWith($buildSha)) {
      $gateWhy = "after the pull HEAD is '$full' (git exit $revExit), not $buildSha"
      Write-Host "GATE PULL FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['PULL'] = $gateWhy; throw "STOPPED at gate PULL: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    # the compose file must now pass VITE_APP_ENV at RUNTIME: 6-space indent = web.environment,
    # 8-space indent = web.build.args (the old place).
    $runtimeLine = @(Select-String -Path 'deploy\lan\docker-compose.yml' -Pattern '^      VITE_APP_ENV:' -CaseSensitive)
    $buildArgLine = @(Select-String -Path 'deploy\lan\docker-compose.yml' -Pattern '^        VITE_APP_ENV:' -CaseSensitive)
    if ($runtimeLine.Count -ne 1 -or $buildArgLine.Count -ne 0) {
      $gateWhy = "compose passes VITE_APP_ENV at runtime $($runtimeLine.Count) time(s) and as a build arg $($buildArgLine.Count) time(s); expected 1 and 0"
      Write-Host "GATE PULL FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['PULL'] = $gateWhy; throw "STOPPED at gate PULL: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    Write-Host "OK PULL: HEAD = $full; compose passes VITE_APP_ENV at runtime (line $($runtimeLine[0].LineNumber))"
    $global:AFRAKALA_FAILED_GATES.Remove('PULL')
    Write-Host "GATE PULL PASS"
    }   # end checkout pull

D1. On 2026-09-13 a release run reached Block 6 before anyone noticed that eleven of the
fourteen migration files in its set were not on disk, and nothing had asserted that the
checkout was even the commit the image was built from. Both facts are provable in one
second and neither was proved. This block proves them, and it is deliberately placed
before the first Expect: in the document so nothing else can run first.

    & {   # GATE D1a -- paste from this line to the matching closing brace
    if ($global:AFRAKALA_FAILED_GATES -isnot [hashtable]) { $global:AFRAKALA_FAILED_GATES = @{} }
    # D1(a) -- the checkout must BE the commit this release was built from.
    $buildSha = 'a935be0b'
    $headSha  = (git rev-parse --short HEAD)
    $dirty    = (git status --porcelain)
    if ($headSha -ne $buildSha) {
      Write-Host "FAIL D1a: HEAD is $headSha but this release was built from $buildSha"
      $gateWhy = "HEAD $headSha is not the build sha $buildSha"
      Write-Host "GATE D1a FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['D1a'] = $gateWhy; throw "STOPPED at gate D1a: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    if ($dirty) {
      Write-Host "FAIL D1a: working tree is not clean:"
      $dirty | ForEach-Object { Write-Host "    $_" }
      $gateWhy = "working tree is not clean ($(@($dirty).Count) path(s))"
      Write-Host "GATE D1a FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['D1a'] = $gateWhy; throw "STOPPED at gate D1a: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    Write-Host "OK D1a: HEAD = $headSha, tree clean"
    $global:AFRAKALA_FAILED_GATES.Remove('D1a')
    Write-Host "GATE D1a PASS"
    }   # end GATE D1a

Expect: OK D1a, HEAD equal to the build sha a935be0b, working tree clean
Expect: the last line printed is GATE D1a PASS

Expect: GATE PULL PASS printed by the pull region above, BEFORE GATE D1a ran
Expect: (D1b is not emitted: this release names no migration file, so there is nothing for it to find)
```

### 3.3 · the git pull block before any up — the only up in the document (Block 4 deploy) — runbook lines 652–669

```text
### Block 4 - deploy

    & {   # deploy -- paste from this line to the matching closing brace
    if ($global:AFRAKALA_FAILED_GATES -is [hashtable] -and $global:AFRAKALA_FAILED_GATES.Count -gt 0) {
      $failedNow = @($global:AFRAKALA_FAILED_GATES.GetEnumerator() | ForEach-Object { "GATE $($_.Key) FAIL $($_.Value)" }) -join ' | '
      Write-Host "NOT RUN: gate(s) FAILED earlier in this shell and have not printed PASS since: $failedNow"
      throw "NOT RUN -- nothing in this region ran. Failed earlier in this shell: $failedNow"
    }
    $env:GIT_SHA = (git rev-parse --short HEAD)
    $env:BUILD_TIME = (Get-Date -Format o)
    docker compose --env-file deploy/lan/.env.lan -f deploy/lan/docker-compose.yml `
      up -d --no-deps --no-build web
    docker restart afrakala-lan-rest
    }   # end deploy

Expect: --no-deps present (its absence takes the whole app down, CLAUDE.md OG-68)
Expect: GIT_SHA set on the command line (its absence silently mislabels the running image)
Expect: afrakala-lan-rest   Up X seconds
```

### 3.3 / Phase 4 · rollback-tag-first ordering (D2), then :lan retag (LOAD), then the different-ids assertion (D3) — runbook lines 255–375

```text
GATE D2 below freezes the image production is RUNNING under the rollback name, BEFORE :lan moves.

    & {   # GATE D2 -- paste from this line to the matching closing brace
    if ($global:AFRAKALA_FAILED_GATES -isnot [hashtable]) { $global:AFRAKALA_FAILED_GATES = @{} }
    # D2 -- freeze the CURRENTLY RUNNING image under the rollback name FIRST, before
    # :lan is repointed. The previous order tagged :lan to the incoming image and only
    # afterwards ran `docker tag :lan :lan-rollback`, which moved the rollback name onto
    # the NEW image and left the running-good image with no tag at all. That is a
    # rollback that rolls forward.
    # B3, 2026-09-14: the tag is taken from the RUNNING CONTAINER's image id, never from
    # afrakala-app:lan -- :lan is the name being replaced and need not be what is running.
    # Measured on the test box: :lan = 296eb4b4899f while afrakala-lan-web ran 0c3106602cc9,
    # which no tag pointed at. Both ids below are full sha256, so the comparison is exact.
    $rollbackTag = 'afrakala-app:lan-rollback'
    $runningId = [string](docker inspect afrakala-lan-web --format "{{.Image}}")
    if ($LASTEXITCODE -ne 0 -or $runningId -notmatch '^sha256:[0-9a-f]{64}$') {
      Write-Host "FAIL D2: could not read the image afrakala-lan-web is running (got '$runningId')."
      $gateWhy = "cannot read the image afrakala-lan-web is running"
      Write-Host "GATE D2 FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['D2'] = $gateWhy; throw "STOPPED at gate D2: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    docker tag $runningId $rollbackTag
    $tagExit = $LASTEXITCODE
    if ($tagExit -ne 0) {
      Write-Host "FAIL D2: cannot tag the running image $runningId (docker tag exit $tagExit)."
      Write-Host "         The image is not in this machine's image store, or the tag name is invalid."
      Write-Host "         Either way NO rollback point was taken. Stop."
      $gateWhy = "docker tag of the running image failed, no rollback point taken"
      Write-Host "GATE D2 FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['D2'] = $gateWhy; throw "STOPPED at gate D2: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    $rbId = [string](docker image inspect $rollbackTag --format "{{.Id}}")
    if ($tagExit -ne 0 -or $rbId -ne $runningId) {
      Write-Host "FAIL D2: $rollbackTag is '$rbId' but the running image is $runningId (docker tag exit $tagExit)."
      $gateWhy = "rollback tag is '$rbId' but the running image is $runningId"
      Write-Host "GATE D2 FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['D2'] = $gateWhy; throw "STOPPED at gate D2: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    # C2, 2026-09-14. The comparison above checks the tag against $runningId, the SAME value the
    # tag was made from, so it cannot notice if that one read was wrong: REVIEW-2 mutant M1 reads
    # :lan into $runningId and this gate printed PASS while the tag was not the container's image.
    # So the CONTAINER is asked again, now, after tagging -- nothing held in a variable is trusted.
    $containerNow = [string](docker inspect afrakala-lan-web --format "{{.Image}}")
    $containerExit = $LASTEXITCODE
    if ($containerExit -ne 0 -or $containerNow -notmatch '^sha256:[0-9a-f]{64}$') {
      Write-Host "FAIL D2: could not re-read the image afrakala-lan-web is running after tagging (exit $containerExit, got '$containerNow')."
      $gateWhy = "cannot re-read the image afrakala-lan-web is running after tagging"
      Write-Host "GATE D2 FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['D2'] = $gateWhy; throw "STOPPED at gate D2: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    if ($rbId -cne $containerNow) {
      Write-Host "FAIL D2: $rollbackTag is '$rbId' but afrakala-lan-web, re-read after tagging, runs $containerNow."
      $gateWhy = "rollback tag is '$rbId' but afrakala-lan-web is running $containerNow"
      Write-Host "GATE D2 FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['D2'] = $gateWhy; throw "STOPPED at gate D2: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    Write-Host "OK D2: $rollbackTag = running image $runningId"
    $global:AFRAKALA_FAILED_GATES.Remove('D2')
    Write-Host "GATE D2 PASS"
    }   # end GATE D2

Expect: OK D2, afrakala-app:lan-rollback equal to the running container's full sha256 image id,
Expect: as re-read from the container AFTER the tag was taken
Expect: the last line printed is GATE D2 PASS

    & {   # :lan retag -- paste from this line to the matching closing brace
    if ($global:AFRAKALA_FAILED_GATES -is [hashtable] -and $global:AFRAKALA_FAILED_GATES.Count -gt 0) {
      $failedNow = @($global:AFRAKALA_FAILED_GATES.GetEnumerator() | ForEach-Object { "GATE $($_.Key) FAIL $($_.Value)" }) -join ' | '
      Write-Host "NOT RUN: gate(s) FAILED earlier in this shell and have not printed PASS since: $failedNow"
      throw "NOT RUN -- nothing in this region ran. Failed earlier in this shell: $failedNow"
    }
    if ($global:AFRAKALA_FAILED_GATES -isnot [hashtable]) { $global:AFRAKALA_FAILED_GATES = @{} }
    # [image-only] docker load -i reads the .tar.gz itself. No gunzip, and no PowerShell pipe, which
    # in Windows PowerShell 5.1 carries text between native programs and corrupts a binary stream.
    $sha = 'a935be0b'
    docker load -i "C:\afrakala-release\20260914\afrakala-app-$sha.tar.gz"
    $loadExit = $LASTEXITCODE
    $envLines = docker image inspect "afrakala-app:$sha" --format "{{range .Config.Env}}{{println .}}{{end}}"
    $inspectExit = $LASTEXITCODE
    $stamp = @(@($envLines) | Where-Object { ([string]$_).Trim() -ceq "APP_GIT_SHA=$sha" })
    if ($loadExit -ne 0 -or $inspectExit -ne 0 -or $stamp.Count -ne 1) {
      $gateWhy = "docker load exit $loadExit, inspect exit $inspectExit, APP_GIT_SHA=$sha found $($stamp.Count) time(s) -- :lan NOT moved"
      Write-Host "GATE LOAD FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['LOAD'] = $gateWhy; throw "STOPPED at gate LOAD: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    docker tag "afrakala-app:$sha" afrakala-app:lan
    $tagExit = $LASTEXITCODE
    if ($tagExit -ne 0) {
      $gateWhy = "docker tag afrakala-app:$sha afrakala-app:lan failed (exit $tagExit)"
      Write-Host "GATE LOAD FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['LOAD'] = $gateWhy; throw "STOPPED at gate LOAD: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    Write-Host "OK LOAD: afrakala-app:$sha carries APP_GIT_SHA=$sha and is now afrakala-app:lan"
    docker images afrakala-app:lan --format "{{.ID}}"
    $global:AFRAKALA_FAILED_GATES.Remove('LOAD')
    Write-Host "GATE LOAD PASS"
    }   # end :lan retag

Expect: OK LOAD, afrakala-app:a935be0b carries APP_GIT_SHA=a935be0b, then GATE LOAD PASS
Expect: the id printed is b67d27106ce4 on a containerd image store (the build machine's); a classic image store prints
Expect: a different 12-character id for the same image. The APP_GIT_SHA check above is what proves the content.

    & {   # GATE D3 -- paste from this line to the matching closing brace
    if ($global:AFRAKALA_FAILED_GATES -isnot [hashtable]) { $global:AFRAKALA_FAILED_GATES = @{} }
    # D3 -- the two names MUST now resolve to DIFFERENT images.
    $lanId = (docker images afrakala-app:lan --format "{{.ID}}")
    $rbId  = (docker images afrakala-app:lan-rollback --format "{{.ID}}")
    if ($lanId -eq $rbId) {
      Write-Host "FAIL D3: :lan and :lan-rollback are the same image ($lanId)."
      Write-Host "         Rolling back would change nothing. Stop here."
      $gateWhy = ":lan and :lan-rollback are the same image ($lanId)"
      Write-Host "GATE D3 FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['D3'] = $gateWhy; throw "STOPPED at gate D3: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    Write-Host "OK D3: lan=$lanId rollback=$rbId"
    $global:AFRAKALA_FAILED_GATES.Remove('D3')
    Write-Host "GATE D3 PASS"
    }   # end GATE D3

Expect: OK D3, printing two DIFFERENT ids. A match is a hard failure.
Expect: the last line printed is GATE D3 PASS
```

### 3.3 · D6+D9 artifact probe before deploy (Block 3) — runbook lines 379–648

```text
### Block 3 - artifact probe (D6)

D6. On 2026-09-13 the env file on production was CORRECT for the whole incident. The artifact
was not. Every VITE_* value was a build arg, the deploy used --no-build, so the correct env file
never applied and nothing ever looked at what was actually inside the image. This block looks at
the served bundle and nothing else. An env-file check would have passed that day.

Under runtime configuration the client bundle must contain NO host literal: the address arrives
at runtime from the container environment. So the probe is not "does it contain the right host"
-- it is "does it contain ANY host", which is a stronger and simpler property.

B1, 2026-09-14. The first version of (i) matched only http(s)://IPv4:port, so a bundle carrying
http://kong:8000 or https://<ref>.supabase.co passed. (i) is now DEFAULT-DENY: every URL literal
in the client bundle is either on a reviewed list or a failure. A minified bundle cannot tell a
fetch base from help text -- both are string literals -- so the probe does not guess intent:
  - an IP literal, an explicit port, a dotless name (kong, localhost), a private suffix
  (.local/.lan/.internal/...) or a Supabase host ALWAYS fails, whatever list a host is on;
  - illustrative text of that shape is allowed only as that EXACT literal and only up to the
  number of times it was measured in the bundle, so reusing it as a real endpoint fails;
  - any other host must be a reviewed public third party (links, placeholders, schema ids).
A new third-party host fails loudly and by name; the fix is one reviewed line in this emitter.

C6, 2026-09-14. REVIEW-2 built an image whose bundle held `Bz="192.168.170.8:9000"` and
`"http://"+Bz` -- the incident's own host:port, joined to its scheme at runtime -- plus
`HTTP://192.168.170.8:9000` and `"//kong:8000"`, and D6 and D9 both passed it: (i) only saw
lower-case `scheme://` literals. (i) now also reads the scheme case-insensitively, and reads every
SCHEME-LESS host:port literal (a full IPv4:port anywhere; a name:port inside quotes or after //)
under the same default-deny rules -- it always has an explicit port, so it always fails unless it
is on the exact-literal list. Digits-only pairs ("18:52", a time) are not addresses. Every host
comparison here is exact: (iii) requires the served supabaseUrl to EQUAL http://<target>:8000,
where it used to accept any value merely containing the target (.10 inside .100).

C7, 2026-09-14. REVIEW-3 built an image whose bundle held `const $w="192.168.170.8"` and
`"http://"+$w+":9000"` -- the incident's host with NO port, joined to scheme and port at runtime --
and D6 and D9 both passed it: every read above needed a scheme or a port. (i) now also reads every
QUOTED IPv4 literal, with or without a port: a dotted quad that opens a string literal and ends it
(or is followed by : or /). It is default-deny like the rest, so it fails unless it is on the exact
list below, measured in the clean bundle. What (i) does NOT read, named so nobody assumes it does:
an IPv4 in the middle of a longer string, a dotless name with no port, an IPv6 literal outside a
scheme:// URL, and any other spelling of an address (decimal 3232279048, hex 0xC0A8AA08).

F1, 2026-09-14. REVIEW-4 showed `"//192.168.170.8"` with the port joined at runtime passing D6 and
D9: the character before the quad was /, not a quote. (i) now also accepts / there, and names the
literal as /192.168.170.8 so it never borrows the quoted comparisons' allowance. Measured on the
clean bundle, the only /-prefixed quad is /192.168.170.8:11434, which has a port.

    & {   # GATE D6 + D9 -- paste from this line to the matching closing brace
    if ($global:AFRAKALA_FAILED_GATES -isnot [hashtable]) { $global:AFRAKALA_FAILED_GATES = @{} }
    $img    = 'afrakala-app:a935be0b'
    $target = '192.168.170.10'
    # (0) the image must exist, or every check below measures nothing and passes.
    if (-not (docker images -q $img)) {
      Write-Host "FAIL D6(0): image $img does not exist on this machine. Nothing was measured."
      $gateWhy = "image $img does not exist on this machine"
      Write-Host "GATE D6 FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['D6'] = $gateWhy; throw "STOPPED at gate D6: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }

    # (i) no host literal in the CLIENT bundle
    $scan = docker run --rm --entrypoint sh $img -c "find /app/.output/public -type f -name '*.js' | wc -l | sed 's/^/SCANNED /'; grep -rhoiE '(https?|wss?):(//|\\/\\/)[][:alnum:]._~%:@-]*' /app/.output/public; grep -rhoE '[a-z0-9]{20}\.supabase\.(co|in)' /app/.output/public; grep -rhoE '.?(//|\\/\\/)?[A-Za-z0-9][A-Za-z0-9._-]*:[0-9]{1,5}.?' /app/.output/public | sed 's/^/BARE /'; grep -rhoE '.?[0-9]{1,3}([.][0-9]{1,3}){3}(:[0-9]{1,5})?.?' /app/.output/public | sed 's/^/IP4 /'; true"
    $scanExit = $LASTEXITCODE
    $scanned = 0
    $hits = @()
    $bareRaw = @()
    $ip4Raw = @()
    foreach ($l in @($scan)) {
      $s = ([string]$l).Trim()
      if ($s -match '^SCANNED\s+(\d+)$') { $scanned = [int]$Matches[1] }
      elseif (([string]$l).StartsWith('BARE ')) { $bareRaw += ([string]$l).Substring(5) }
      elseif (([string]$l).StartsWith('IP4 ')) { $ip4Raw += ([string]$l).Substring(4) }
      elseif ($s) { $hits += ($s -replace '\\/', '/') }
    }
    # C6 -- scheme-less host:port. Each raw candidate carries one character of context either side.
    $quoteChars = [string][char]34 + [char]39 + [char]96
    $bareLits = @()
    foreach ($c in $bareRaw) {
      if ($c -cnotmatch '^(?<pre>[^A-Za-z0-9._-]?)(?<sl>//|\\/\\/)?(?<hn>[A-Za-z0-9][A-Za-z0-9._-]*):(?<port>[0-9]{1,5})(?<post>.?)$') { continue }
      $pre = $Matches['pre']; $sl = $Matches['sl']; $hn = $Matches['hn']; $port = $Matches['port']; $post = $Matches['post']
      if ($post -match '[A-Za-z0-9_:]') { continue }           # runs on ("T23:59:59", "valueformat:1:text"): not host:port
      if ($sl -and $pre -eq ':') { continue }                   # scheme://host:port -- the URL scan above classifies it
      $isIp = $hn -match '^\d{1,3}(\.\d{1,3}){3}$'
      if (-not $isIp -and -not $sl) {
        # A NAME without // counts only as a whole string literal: "kong:8000" or "kong:8000/rest".
        # Measured on the clean bundle, everything else of that shape is CSS or a time:
        # {box-shadow:0 0 5px ...}, ;font-weight:700;, "2026-04-26T10:00:00Z".
        if ($hn -cnotmatch '[A-Za-z]') { continue }
        if (-not ($pre -ne '' -and $quoteChars.Contains($pre) -and ($post -eq '/' -or ($post -ne '' -and $quoteChars.Contains($post))))) { continue }
      }
      $bareLits += $(if ($sl) { '//' } else { '' }) + "$hn`:$port"
    }
    # C7 -- a QUOTED IPv4 literal with no port: const h="192.168.170.8"; "http://"+h+":9000".
    # IPv4:port is already read above, anywhere; this adds the port-less form, but only as a whole
    # string literal (a quote before it; a quote, : or / after it). Measured on the clean bundle,
    # every other dotted quad has no quote before it: SVG numbers (" 19.148.924.383") and versions.
    $ip4Lits = @()
    foreach ($c in $ip4Raw) {
      if ($c -cnotmatch '^(?<pre>.?)(?<ip>[0-9]{1,3}(\.[0-9]{1,3}){3})(?<port>:[0-9]{1,5})?(?<post>.?)$') { continue }
      if ($Matches['port']) { continue }                        # IPv4:port -- the scheme-less scan above reads it
      $pre = $Matches['pre']; $post = $Matches['post']; $ip = $Matches['ip']
      # F1: "//192.168.170.8" (protocol-relative, port joined at runtime) has / before the quad, not a
      # quote. Kept as '/'+ip so it never borrows the quoted comparisons' allowance below.
      if (-not ($pre -ne '' -and ($quoteChars.Contains($pre) -or $pre -eq '/'))) { continue }
      if ($post -ne '' -and -not ($quoteChars.Contains($post) -or $post -eq ':' -or $post -eq '/')) { continue }
      $ip4Lits += $(if ($pre -eq '/') { '/' } else { '' }) + $ip
    }
    if ($scanExit -ne 0 -or $scanned -lt 1) {
      Write-Host "FAIL D6(i): the scan measured nothing (docker exit $scanExit, $scanned js file(s) read)."
      $gateWhy = "the client bundle scan measured nothing"
      Write-Host "GATE D6 FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['D6'] = $gateWhy; throw "STOPPED at gate D6: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    # Backend-SHAPED literals that are not endpoints: exact string -> most occurrences allowed.
    $allowExact = @{
      'http://192.168.170.8:11434' = 1  # src/routes/_app.admin.ai-providers.tsx:95 -- help text shown to an operator
      'http://localhost:9999'      = 1  # @supabase/auth-js GOTRUE_URL -- default used only when no url is given
      'http://localhost'           = 1  # router origin fallback when window.origin is "null"
      'http://macVmlSchemaUri'     = 1  # xlsx XML namespace identifier, never fetched
    }
    # Reviewed public third-party hosts (links, input placeholders, XML/JSON-schema ids).
    $allowHosts = @('www.w3.org', 'schemas.openxmlformats.org', 'sheetjs.openxmlformats.org',
      'schemas.microsoft.com', 'purl.org', 'purl.oclc.org', 'openoffice.org', 'docs.oasis-open.org',
      'json-schema.org', 'schema.org', 'jspdf.default.namespaceuri', 'github.com', 'shahabyazdi.github.io',
      'momentjs.com', 'react.dev', 'fb.me', 'cdnjs.cloudflare.com', 'example.com', 'api.example.com',
      'api.openai.com', 'ai.gateway.lovable.dev', 'get-git-going.lovable.app',
      'pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev', 'myafrakala.ir', 'torob.com', 'app.didar.me',
      'wa.me', 'chat.whatsapp.com', 'eitaa.com', 'rubika.ir', 'ble.ir')
    $bad = @()
    # Exact, case-sensitive comparisons only: a PowerShell hashtable key lookup, -contains and
    # Group-Object all ignore case by default, so 'HTTP://LOCALHOST:9999' would have borrowed the
    # allowance of 'http://localhost:9999'. Sorted, because Group-Object orders groups differently in
    # Windows PowerShell 5.1 and pwsh 7 and the GATE line must read the same in both.
    foreach ($g in @($bareLits | Group-Object -CaseSensitive | Sort-Object -Property Name -CaseSensitive)) {
      $lit = $g.Name
      if (@($allowExact.Keys) -ccontains $lit) {
        if ($g.Count -gt $allowExact[$lit]) { $bad += "$lit  (allowed $($allowExact[$lit])x as illustrative text, found $($g.Count)x)" }
        continue
      }
      $name = ($lit -replace '^//', '') -replace ':[0-9]+$', ''
      $why = @('scheme-less host:port', 'explicit port')
      if ($name -match '^\d{1,3}(\.\d{1,3}){3}$') { $why += 'IP literal' } elseif ($name -notmatch '\.') { $why += 'bare name with no dot' }
      if ($name -match '\.(local|localdomain|lan|internal|intranet|home|corp|test|arpa)$') { $why += 'private suffix' }
      if ($name -match '(^|\.)supabase\.(co|in)$') { $why += 'Supabase host' }
      $bad += "$lit  ($($why -join ', '))"
    }
    foreach ($g in @($hits | Group-Object -CaseSensitive | Sort-Object -Property Name -CaseSensitive)) {
      $lit = $g.Name
      if ($lit -notmatch '://') { $bad += "$lit  (Supabase project host)"; continue }
      $auth = ($lit -split '://', 2)[1] -replace '^[^@]*@', ''
      if ($auth -notmatch '[A-Za-z0-9]') { continue }   # "https://" prefix tests, "https://..." prose
      if (@($allowExact.Keys) -ccontains $lit) {
        if ($g.Count -gt $allowExact[$lit]) { $bad += "$lit  (allowed $($allowExact[$lit])x as illustrative text, found $($g.Count)x)" }
        continue
      }
      $name = $auth; $port = ''
      if ($auth -match '^(\[[^\]]*\]?)(:.*)?$' -or $auth -match '^([^:]*)(:.*)?$') { $name = $Matches[1]; $port = $Matches[2] }
      $why = @()
      if ($port) { $why += 'explicit port' }
      if ($name -match '^\[' -or $name -match '^\d{1,3}(\.\d{1,3}){3}$') { $why += 'IP literal' }
      elseif ($name -notmatch '\.') { $why += 'bare name with no dot' }
      if ($name -match '\.(local|localdomain|lan|internal|intranet|home|corp|test|arpa)$') { $why += 'private suffix' }
      if ($name -match '(^|\.)supabase\.(co|in)$') { $why += 'Supabase host' }
      if ($why.Count -eq 0 -and $allowHosts -ccontains $name) { continue }
      if ($why.Count -eq 0) { $why += 'host not on the reviewed list' }
      $bad += "$lit  ($($why -join ', '))"
    }
    # Port-less quoted IPv4 literals that are comparisons, not endpoints -- exact string -> most
    # occurrences allowed, measured 2026-09-14 on a clean build of this branch. Do not raise a count
    # to get a green gate: find what put the new occurrence in the bundle first.
    $allowIp4 = @{
      '127.0.0.1' = 3  # html2canvas-pro esm:10193 SSRF check; @supabase/supabase-js index.mjs:243 target list; src/routes/__root.tsx:324
      '0.0.0.0'   = 1  # src/routes/__root.tsx:325 -- isLocalOrTestHost comparison
    }
    foreach ($g in @($ip4Lits | Group-Object -CaseSensitive | Sort-Object -Property Name -CaseSensitive)) {
      $lit = $g.Name
      if (@($allowIp4.Keys) -ccontains $lit) {
        if ($g.Count -gt $allowIp4[$lit]) { $bad += "$lit  (allowed $($allowIp4[$lit])x as a comparison, found $($g.Count)x)" }
        continue
      }
      if ($lit.StartsWith('/')) { $bad += "$lit  (IPv4 literal after / with no port, IP literal)"; continue }
      $bad += "$lit  (quoted IPv4 literal with no port, IP literal)"
    }
    if ($bad.Count -gt 0) {
      Write-Host "FAIL D6(i): host literal(s) baked into the client bundle ($scanned js files read):"
      $bad | ForEach-Object { Write-Host "    $_" }
      Write-Host "    A host literal here means the image is tied to the machine that built it."
      $gateWhy = "host literal(s) in the client bundle: $(@($bad | ForEach-Object { ($_ -split '  ', 2)[0] }) -join ', ')"
      Write-Host "GATE D6 FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['D6'] = $gateWhy; throw "STOPPED at gate D6: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    Write-Host "OK D6(i): no baked host literal in the client bundle ($scanned js files read, $($hits.Count) URL literal(s), $($bareLits.Count) scheme-less host:port literal(s) and $($ip4Lits.Count) quoted port-less IPv4 literal(s) classified)"

    # (ii) the runtime mechanism must actually be present in the bundle
    $hasCfg = docker run --rm --entrypoint sh $img -c "grep -rl __APP_RUNTIME_CONFIG__ /app/.output/public 2>/dev/null | head -1"
    if (-not $hasCfg) {
      Write-Host "FAIL D6(ii): __APP_RUNTIME_CONFIG__ is absent from the client bundle."
      Write-Host "    Without it the client has no address at all. Do not deploy this image."
      $gateWhy = "__APP_RUNTIME_CONFIG__ is absent from the client bundle"
      Write-Host "GATE D6 FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['D6'] = $gateWhy; throw "STOPPED at gate D6: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    Write-Host "OK D6(ii): runtime config mechanism present"

    # (iii) this image, given THIS target's environment, must serve THIS target's address.
    # No double quote inside the sh -c argument: Windows PowerShell 5.1 does not escape an embedded
    # " when calling a native exe, so sh received a cut string, $served came back $null, and
    # `$null -notmatch` is False -- this check printed OK having measured nothing (B1, 2026-09-14).
    $served = docker run --rm --entrypoint sh -e SUPABASE_URL="http://${target}:8000" $img -c 'node .output/server/index.mjs >/dev/null 2>&1 & for i in $(seq 1 45); do wget -qO- http://127.0.0.1:3000/login >/dev/null 2>&1 && break; sleep 1; done; wget -qO- http://127.0.0.1:3000/login 2>/dev/null | grep -oE ''.supabaseUrl.:.[^,}]*'' | head -1'
    $served = ([string]$served).Trim()
    if (-not $served) {
      Write-Host "FAIL D6(iii): the image served no supabaseUrl at all. Nothing was measured."
      $gateWhy = "the image served no supabaseUrl"
      Write-Host "GATE D6 FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['D6'] = $gateWhy; throw "STOPPED at gate D6: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    # C6: EXACT equality with the value this probe injected, never a substring (.10 is inside .100).
    $servedUrl = ''
    if ($served -cmatch '^"supabaseUrl":"([^"]*)"$') { $servedUrl = $Matches[1] }
    $expectedServed = "http://${target}:8000"
    if ($servedUrl -cne $expectedServed) {
      Write-Host "FAIL D6(iii): served supabaseUrl is not exactly $expectedServed. Got: $served"
      $gateWhy = "served supabaseUrl '$servedUrl' is not exactly $expectedServed"
      Write-Host "GATE D6 FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['D6'] = $gateWhy; throw "STOPPED at gate D6: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    Write-Host "OK D6(iii): served config = $served"
    $global:AFRAKALA_FAILED_GATES.Remove('D6')
    Write-Host "GATE D6 PASS"

    # D9 -- the served host must be reachable FROM A BROWSER.
    # D6(i)-(iii) all passed on an image whose injected config was
    # {"supabaseUrl":"http://kong:8000"} -- the compose-internal service name. The bundle was
    # clean, the mechanism was present, and one image still served two different values. SSR
    # resolves "kong"; a browser never can. The artifact probe structurally cannot see this,
    # because the value is correct-looking and only arrives at runtime.
    $servedHost = ""
    if ($served -match '"supabaseUrl":"https?://([^/:"]+)') { $servedHost = $Matches[1] }
    if ($servedHost -eq "") {
      Write-Host "FAIL D9: could not parse a host out of the served config: $served"
      $gateWhy = "no host could be parsed from the served config"
      Write-Host "GATE D9 FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['D9'] = $gateWhy; throw "STOPPED at gate D9: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    $isIPv4     = $servedHost -match '^\d{1,3}(\.\d{1,3}){3}$'
    $isDottedFqdn = $servedHost -match '^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$'
    $isLoopback = $servedHost -in @("localhost", "127.0.0.1", "0.0.0.0", "::1")
    if ($isLoopback) {
      Write-Host "FAIL D9: served host '$servedHost' is loopback. Correct inside the container,"
      Write-Host "         unreachable for every browser except one on the server itself."
      $gateWhy = "served host '$servedHost' is loopback"
      Write-Host "GATE D9 FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['D9'] = $gateWhy; throw "STOPPED at gate D9: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    if (-not ($isIPv4 -or $isDottedFqdn)) {
      Write-Host "FAIL D9: served host '$servedHost' is a bare name with no dot -- a"
      Write-Host "         compose service name or container alias. SSR resolves it; a browser"
      Write-Host "         cannot. Set APP_SUPABASE_PUBLIC_URL to the address staff type."
      $gateWhy = "served host '$servedHost' is a bare name with no dot"
      Write-Host "GATE D9 FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['D9'] = $gateWhy; throw "STOPPED at gate D9: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    Write-Host "OK D9: served host '$servedHost' is browser-reachable"
    $global:AFRAKALA_FAILED_GATES.Remove('D9')
    Write-Host "GATE D9 PASS"
    }   # end GATE D6 + D9

Expect: OK D6(i), no baked host literal in the client bundle
Expect: OK D6(ii), runtime config mechanism present
Expect: OK D6(iii), served supabaseUrl exactly http://192.168.170.10:8000
Expect: OK D9, served host browser-reachable (not a compose service name, not loopback)
Expect: GATE D6 PASS, then GATE D9 PASS as the last line printed
```

### 3.3 / 3.7 · D10 live-site check after deploy, with the expected-FAIL wording (Block 5) — runbook lines 671–740

```text
### Block 5 - verify

    docker inspect afrakala-lan-web --format "{{range .Config.Env}}{{println .}}{{end}}" | Select-String APP_GIT_SHA
    git rev-parse --short HEAD
    docker ps --filter name=afrakala-lan --format "{{.Names}}`t{{.Status}}"
    curl.exe -s -o NUL -w "%{http_code} %{time_total}`n" http://192.168.170.10:3000/login
    curl.exe -s -w "`n%{http_code}`n" http://192.168.170.10:3000/api/healthz

Expect: APP_GIT_SHA equals git rev-parse --short HEAD
Expect: afrakala-lan-db-role-fix = Exited (0); every other afrakala-lan-* = Up
Expect: /login = 200 under 1 second
Expect: /api/healthz = 200

D10. What the DEPLOYED site hands to browsers, read from the live site and nothing else.
D6(iii) and D9 above start their OWN container with SUPABASE_URL set by the probe and check what
that container serves -- the probe asking itself. REVIEW-2 served http://kong:8000 from a clean
image with a compose-shaped environment (SUPABASE_URL=http://kong:8000, APP_SUPABASE_PUBLIC_URL
empty) and that block still printed GATE D9 PASS. The deployment's own environment decides the
value (src/lib/runtime-config.ts: APP_SUPABASE_PUBLIC_URL, then VITE_SUPABASE_URL, then
SUPABASE_URL), so it can only be measured AFTER deploy, on the running site. D10 starts no
container: it reads /login from the live site and requires window.__APP_RUNTIME_CONFIG__.supabaseUrl
to EQUAL the expected public address -- not contain it, not resemble it.

[image-only] D10 IS EXPECTED TO FAIL IF IT RUNS BEFORE THE DEPLOY BLOCK ABOVE, AND THAT IS CORRECT.
The container running before this release was created from the old compose file, and compose freezes
a container's environment when the container is created: APP_SUPABASE_PUBLIC_URL was added to
.env.lan on 2026-09-14, but that container still has it empty, and its image carries no runtime
config at all. So D10 against the old container prints GATE D10 FAIL. That red gate is doing its
job, not reporting a broken release. D10 can only PASS after the deploy block has RECREATED
afrakala-lan-web from the pulled compose file with the new image.
AFTER the deploy, a D10 FAIL is real: browsers are being sent somewhere wrong -> run the rollback line.

    & {   # GATE D10 -- paste from this line to the matching closing brace
    if ($global:AFRAKALA_FAILED_GATES -isnot [hashtable]) { $global:AFRAKALA_FAILED_GATES = @{} }
    $site     = 'http://192.168.170.10:3000'
    $expected = 'http://192.168.170.10:8000'
    $page = curl.exe -s --max-time 20 "$site/login"
    $curlExit = $LASTEXITCODE
    $html = (@($page) | ForEach-Object { [string]$_ }) -join "`n"
    if ($curlExit -ne 0 -or -not $html) {
      Write-Host "FAIL D10: could not read $site/login from the live site (curl exit $curlExit). Nothing was measured."
      $gateWhy = "could not read $site/login (curl exit $curlExit)"
      Write-Host "GATE D10 FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['D10'] = $gateWhy; throw "STOPPED at gate D10: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    $assignments = [regex]::Matches($html, 'window\.__APP_RUNTIME_CONFIG__\s*=').Count
    $cfgMatch = [regex]::Match($html, 'window\.__APP_RUNTIME_CONFIG__\s*=\s*(\{[^<]*?\})\s*;?\s*</script>')
    if ($assignments -ne 1 -or -not $cfgMatch.Success) {
      Write-Host "FAIL D10: $site/login must carry exactly ONE parseable window.__APP_RUNTIME_CONFIG__; found $assignments assignment(s), parseable=$($cfgMatch.Success)."
      $gateWhy = "the live /login carries $assignments runtime config assignment(s), parseable=$($cfgMatch.Success)"
      Write-Host "GATE D10 FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['D10'] = $gateWhy; throw "STOPPED at gate D10: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    $got = $null
    try { $got = ($cfgMatch.Groups[1].Value | ConvertFrom-Json).supabaseUrl } catch { $got = $null }
    if ($got -isnot [string] -or $got -cne $expected) {
      Write-Host "FAIL D10: the LIVE site serves supabaseUrl '$got'; browsers must get exactly '$expected'."
      Write-Host "          Every staff browser loading $site is being pointed at '$got' right now."
      $gateWhy = "live supabaseUrl is '$got', not exactly '$expected'"
      Write-Host "GATE D10 FAIL $gateWhy"
      $global:AFRAKALA_FAILED_GATES['D10'] = $gateWhy; throw "STOPPED at gate D10: $gateWhy -- nothing after it in this region ran; this shell is still open"
    }
    Write-Host "OK D10: $site/login serves supabaseUrl '$got' -- exactly the expected public address"
    $global:AFRAKALA_FAILED_GATES.Remove('D10')
    Write-Host "GATE D10 PASS"
    }   # end GATE D10

Expect: OK D10, the live http://192.168.170.10:3000/login serves supabaseUrl exactly http://192.168.170.10:8000
Expect: the last line printed is GATE D10 PASS
Expect: GATE D10 FAIL means browsers are being sent somewhere else NOW -- run the rollback block below
```

### Phase 4 · one-line rollback, image pre-authorised, database never (Block 6) — runbook lines 746–771

```text
### Block 6 - rollback  [image-only]

IMAGE ROLLBACK IS PRE-AUTHORISED. DATABASE ROLLBACK NEVER IS.

- Image rollback: you may run the one line below WITHOUT asking anyone, at any moment after GATE D2
  printed PASS -- in particular if the verify block, GATE D10, or a smoke check below fails.
- Database rollback is NEVER pre-authorised. This release changed no database object and wrote no
  ledger row, so there is nothing in the database to roll back. If anyone proposes a restore, a
  migration, or a ledger edit "to undo this release", STOP: that needs the owner's explicit approval.

The rollback line -- ONE line, paste it whole, from C:\afrakala:

    docker tag afrakala-app:lan-rollback afrakala-app:lan; docker compose --env-file deploy/lan/.env.lan -f deploy/lan/docker-compose.yml up -d --no-deps --no-build web

Then confirm (read-only):

    docker inspect afrakala-lan-web --format "{{.Image}}"
    docker image inspect afrakala-app:lan-rollback --format "{{.Id}}"
    curl.exe -s -o NUL -w "%{http_code}`n" http://192.168.170.10:3000/login

Expect: the two sha256 ids printed are IDENTICAL (the container runs the rollback image)
Expect: /login = 200
Expect: the checkout stays at the pulled commit. The rollback runs the previous image under the pulled
Expect: compose file, which adds only VITE_APP_ENV and VITE_TRUSTED_HOSTS to the container environment.
Expect: That combination was not rehearsed. If anything looks wrong after rollback, report it; do not
Expect: edit files on the laptop.
```
