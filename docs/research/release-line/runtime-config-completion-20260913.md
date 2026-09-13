# خط release — پیکربندی زمان اجرا: گزارش تکمیل

شاخه: `fix/release-line-runtime-config` · پایه: `origin/main` = `9bc8d554`
تاریخ: ۲۰۲۶-۰۹-۱۳ · هیچ استقراری انجام نشد · `192.168.170.10` لمس نشد

سطوح شاهد: `measured` (دستور + خروجی + exit code) · `quoted` · `cited` · `compared`.

---

## ۱. مبنا (فاز ۰)

```
origin/main     = 9bc8d554        ← شاخه از اینجا گرفته شد
main (local)    = 3bc526c4        ← کهنه
staging (local) = d60232f5        ← کهنه
typecheck       = 70 error / 6 file   (rc=2)  ← منطبق بر ground truth
```

## ۲. طبقه‌بندی وابسته‌به‌میزبان (فاز ۱)

معیار: آیا مقدارِ **درست** بین `192.168.170.8` و `192.168.170.10` فرق می‌کند؟

| وابسته به میزبان — منتقل شد به runtime | مستقل از میزبان — دست نخورد |
|---|---|
| `VITE_SUPABASE_URL` (`.8:9000` / `.10:8000`) | `VITE_BUILD_ID` (هویت build، نه میزبان) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` (کلید تست ≠ production) | `VITE_SUPABASE_PROJECT_ID` (برچسب MCP؛ MCP در build غیرفعال است) |
| `VITE_APP_ENV` (`test` / `production`) | `VITE_APP_NAME`، `VITE_APP_URL` (در `src/` خوانده نمی‌شوند) |
| `VITE_TRUSTED_HOSTS` (`""` / `192.168.170.10,localhost`) | `VITE_FEATURE_QUOTE_*` (پرچم قابلیت) |

مکانیزم تحویل: `shellComponent: RootShell` در `src/routes/__root.tsx` — همان‌جا که HTML
سرو‌شده تولید می‌شود. یک `<script>` در `<head>` **پیش از** `<HeadContent />` و پیش از هر
chunk ماژول Vite می‌نشیند، دقیقاً مثل polyfill موجودِ `crypto.randomUUID`.

## ۳. آرتیفکت — قبل و بعد (`compared`)

| needle | image حادثه `296eb4b4899f` client / SSR | image اصلاح‌شده `rc-banner` client / SSR |
|---|---|---|
| `192.168.170.10` | 0 / 0 | 0 / 0 |
| `192.168.170.8` | 3 / 5 | 1 / 3 |
| `:8000` | 0 / 0 | 0 / 0 |
| `:9000` | **2 / 2** | **0 / 0** |
| JWT پخته‌شده (یکتا) | **1 / 1** | **0 / 0** |
| `__APP_RUNTIME_CONFIG__` | 0 | حاضر در هر دو |

تنها رشتهٔ `192.168.*` باقی‌مانده در bundle کلاینت، **متن راهنمای UI** در
`src/routes/_app.admin.ai-providers.tsx:95` است که به کاربر نشان می‌دهد آدرس Ollama چه شکلی
است. نمایش داده می‌شود، هرگز fetch نمی‌شود. در probe به‌صورت صریح allowlist شده.

### یک image، دو رفتار (`compared`)

```
SUPABASE_URL=http://192.168.170.10:8000 -> window.__APP_RUNTIME_CONFIG__={"supabaseUrl":"http://192.168.170.10:8000"}
SUPABASE_URL=http://192.168.170.8:9000  -> window.__APP_RUNTIME_CONFIG__={"supabaseUrl":"http://192.168.170.8:9000"}
```

کلید هم همین‌طور (فقط hash، بدون چاپ مقدار): `f1bb` در برابر `7309`.

### بنر (فاز ۳.۵، `compared` روی markup سرو‌شده)

| مقادیر زمان اجرا | resolved | `bg-red-600` | `bg-amber-100` |
|---|---|---|---|
| production + میزبان مورد اعتماد | `"appEnv":"production"`, `"trustedHosts":"192.168.170.10,localhost"` | **0** | **0** |
| test (شاهدِ کنترل) | `"appEnv":"test"` | 0 | **1** |

بازوی test کنترل است: نشان می‌دهد probe **می‌تواند** بنر را ببیند، پس صفرهای بالا نتیجهٔ
منفیِ واقعی‌اند نه probeِ خراب.

## ۴. نقص‌ها — یک خط برای هرکدام

| id | وضعیت |
|---|---|
| **D1** | **اصلاح شد — و شرحش در بریف دقیق نبود.** assertionِ sha از قبل وجود داشت (`emit-blocks.ps1:595`) ولی در بلوکِ **پس از استقرار**. «Block 0 — checkout state» اضافه شد، پیش از اولین `Expect:`، با دو بند: HEAD = build sha و درخت تمیز؛ و وجودِ **هر** فایل migration مجموعه، با **نام‌بردن** آنچه غایب است. |
| **D2** | **اصلاح شد.** تگ rollback حالا **پیش از** جابه‌جایی `:lan` روی image در حال اجرا بسته می‌شود، و خطِ بعدیِ `docker tag :lan :lan-rollback` کاملاً **حذف** شد. |
| **D3** | **اصلاح شد.** runbook هر دو id را می‌خواند و روی تساوی `exit 1` می‌دهد. |
| **D4** | **اصلاح شد — و فایلش در بریف اشتباه بود.** در `release/build.ps1:83`/`:116` است، نه `deploy/lan/build.ps1`. tarball حالا با تگِ `<sha>` ذخیره می‌شود تا خطِ `docker tag afrakala-app:<sha> ...` در runbook روی تگی که وجود دارد اجرا شود. |
| **D6** | **اضافه شد.** بلوک probe آرتیفکت: (i) صفر literal میزبان در bundle کلاینت، (ii) حضور `__APP_RUNTIME_CONFIG__`، (iii) اجرای یک‌بارمصرفِ image با محیطِ مقصد و الزام به نام‌بردن همان مقصد. |
| **D7** | **اصلاح شد — و در بریف «غایب» توصیف شده بود، ولی یک سطح پایین‌تر از قبل بود.** `deploy/lan/build.ps1:80-86` از قبل رد می‌کرد؛ آنچه نبود، بررسی در **نقطهٔ ورودِ** release بود. اضافه شد. |
| **N1** | **اصلاح شد.** کلید anon هاردکد از `vite.config.ts` حذف شد و با هیچ literal دیگری جایگزین **نشد**. صفر JWT در source. **چرخاندنِ کلید هنوز لازم است و تصمیم مالک است** — حذف از کد، آن را از تاریخچهٔ گیت پاک نمی‌کند. |
| **N2** | **اصلاح شد.** صفر JWT پخته‌شده در هر دو bundle (از ۱ و ۱). |

### نقص تازه‌ای که پیدا شد و **اصلاح نشد** (خارج از فهرست مأموریت)

**D8 — بررسیِ `VERDICT: PASS` زیررشته‌ای است.** `release/emit-blocks.ps1:45` می‌نویسد
`if ($report -notmatch "## VERDICT: PASS")`. این روی کلِ سند تطابق می‌گیرد، پس گزارشی که
حکمِ **نهایی**اش FAIL است ولی جایی رشتهٔ PASS دارد هم پذیرفته می‌شود.
اندازه‌گیری: `rehearsal-e4b.md:878` = `## VERDICT: FAIL (replay stopped early)` و
`:2047` = `## VERDICT: PASS`. برای همین سند حکمِ نهایی واقعاً PASS است، پس پذیرشش درست بود —
ولی این یک checkی است که می‌تواند **بدون درست‌بودن پاس شود**، دقیقاً همان کلاسی که این خط
release برای بستنش وجود دارد. اصلاح نشد چون در فهرست D1..D7 نبود و مأموریت دربارهٔ
scope creep صریح است.

## ۵. ابطال‌پذیری (فاز ۷)

```
7.1  D3 با دو id یکسان      -> FAIL D3 ... Rolling back would change nothing   (رد کرد)
7.2  D1a با HEAD نامنطبق    -> FAIL D1a: HEAD is deadbeef but ... 9bc8d554     (رد کرد)
7.2b D1a با درخت کثیف       -> FAIL D1a: working tree is not clean + فهرست     (رد کرد)
7.3  D1b با یک فایل غایب    -> FAIL D1b: 1 of 3 ... MISSING 0999_...sql        (رد کرد و نام برد)
     کنترل: مجموعهٔ کامل     -> OK D1b: all 2 migration files present
BROKEN_PROBES=0
```

### ۷.۴ — آن که اهمیت دارد

probe روی **خودِ image حادثه** اجرا شد. هیچ literalی کاشته نشد؛ لازم نبود.

```
--- against THE ACTUAL INCIDENT IMAGE (3bc526c4) (296eb4b4899f) ---
  FAIL D6(i): host literal(s) baked into the client bundle:
      http://192.168.170.8:9000
  FAIL D6(ii): __APP_RUNTIME_CONFIG__ absent from client bundle
  block verdict: FAIL

--- against the fixed image (afrakala-app:rc-banner) ---
  OK D6(i) / OK D6(ii) -> block verdict: PASS
```

`http://192.168.170.8:9000` همان رشته‌ای است که مرورگر کارمندان را به دیتابیس تست برد.
probe آن را **نام می‌برد**.

### ۷.۵ — سه راه برای رعایتِ حرفِ مأموریت و تکرارپذیر ماندنِ حادثه

۱. **probe محدود به میزبانِ Supabase به‌جای «هر میزبان».** آن‌وقت imageی که هم `.10` و هم
   `.8` دارد پاس می‌شد. آنچه ساخته شد صفر را الزام می‌کند، نه «درستی حاضر است».
۲. **مکانیزم runtime حاضر ولی خوانده‌نشده.** bundle می‌توانست `__APP_RUNTIME_CONFIG__` را
   به‌عنوان کد مرده داشته باشد و باز هم URL بپزد. بند (iii) image را با محیط مقصد اجرا
   می‌کند و الزام می‌کند نتیجهٔ سرو‌شده همان مقصد را نام ببرد.
۳. **اصلاح bundle ولی رهاکردن تگ rollback.** حادثهٔ بعدی وقتی rollback می‌خواست، هیچ
   نمی‌شد. D2 ترتیب را عوض کرد و D3 روی تساوی `exit 1` می‌دهد (در ۷.۱ دیده شد که رد می‌کند).

## ۶. typecheck

```
فاز ۰ : 70 error / 6 file   (rc=2)
پایان : 70 error / 6 file   (rc=2)   — مجموعهٔ فایل‌ها یکسان، صفر خطا در فایل‌های دست‌خورده
```

## ۷. فاز ۶ — emit و validate، بدون استقرار

```
emit rc=0   -> release/out/RELEASE-20260913-d6test.md
blocks  : 35
Expect: : 112
validate-blocks.ps1 rc=0 -> PASSED - no problems found (blocks missing Expect: 0)
```

یک خطِ psql از همان سند **عیناً** روی یک دیتابیس scratch اجرا شد:

```
SELECT pg_is_in_recovery() || '|' || pg_size_pretty(pg_database_size(current_database())) || '|' ||
       (SELECT count(*) FROM pg_default_acl WHERE defaclacl::text LIKE '%anon%');
-> false|7469 kB|0        rc=0
```

دیتابیس scratch ساخته و دوباره حذف شد؛ `afrakala` لمس نشد.

**یافتهٔ جانبی:** آن خط **بدون** `PGPASSWORD` اجرا نمی‌شود
(`fe_sendauth: no password supplied`, rc=2). سند فرض می‌کند اپراتور احراز هویت را از پیش
دارد. parse شدن و اجرا شدن یکی نیستند — همان چیزی که فاز ۶.۴ برای دیدنش بود.

---

## ۸. تأیید نشده — به‌روزشده پس از آزمونِ مرورگر

**بسته شد (حالا اندازه‌گیری‌شده، نه استنتاج):**
- رفتارِ مرورگرِ واقعی: config، شمارشِ شبکه (۲۷ به Kong تست و **۰** به production)، console.
- **hydration روی مسیرِ احرازشده**: هیچ هشدارِ mismatch. این همان ریسکِ تزریق در `<head>` بود.
- مسیرِ واقعیِ compose build (`--env-file`، همان compose، همان Dockerfile) با تگِ خصوصی:
  `rc=0`، و imageِ حاصل کلِ probe را پاس کرد.

**باز:**
۱. **هیچ‌چیز روی `192.168.170.10` آزموده نشد** و نخواهد شد تا خودِ release. **باز.**
۲. **بازوی مرورگر با مقادیرِ Supabase تست اجرا شد، با هویتِ production.** یعنی مقادیرِ
   واقعیِ زمان‌اجرای production (`http://192.168.170.10:8000`) **اندازه‌گیری نشده‌اند** و تا
   خودِ release نخواهند شد. **این معاملهٔ درستی بود:** نشاندنِ آدرس production در یک مرورگر
   یعنی فرستادنِ ترافیکِ واقعی به production، که صریحاً ممنوع است. پس هویتِ production
   (بنر، trusted hosts) روی مسیرِ داده‌ایِ تست سنجیده شد و مسیرِ دادهٔ production نسنجیده ماند.
۳. **image قدیمیِ `8b04c479e022` مقایسه نشد** — روی این باکس نیست. **باز.**
۴. **`release/build.ps1` end-to-end اجرا نشد** — از شاخهٔ feature عمداً رد می‌کند (`rc=1`).
   فقط از `main` قابل اجراست. **باز.**
۵. **`apply-release.ps1` اجرا نشد.** **باز.**
۶. **اختلافِ شمارشِ `/operations/tasks`** (UI 8 و DB 13) حل نشد؛ RLS توضیحِ محتمل است ولی
   اثبات نشد. **باز.**
۷. **چرخاندنِ کلید anonِ حذف‌شده** انجام نشد و تصمیم مالک است. **باز.**
۸. **`VITE_SUPABASE_PROJECT_ID` هنوز build-time است** — قضاوت، نه اندازه‌گیری. **باز.**
۹. **پایداریِ allowlistِ probe** بررسی نشد. **باز.**
۱۰. **stack تست نقطهٔ بازگشت ندارد** (پیوست ۲ بند ۸). **باز — ریسکِ ایستا.**

## حکم

**PARTIAL.**

همهٔ بندهای D1..D7 و N1/N2 اصلاح شدند و probeِ D6 در ۷.۴ **در حال شکست‌خوردن روی خودِ
image حادثه دیده شد** — که شرطِ نوشتنِ PASSED بود. ولی بندهای ۱، ۳ و ۴ بخش «تأیید نشده»
اندازه‌گیری نشده‌اند: هیچ‌چیز روی میزبان مقصد آزموده نشد، رفتار مرورگر آزموده نشد، و مسیر
واقعیِ `deploy/lan/build.ps1` end-to-end اجرا نشد. تا وقتی آن سه انجام نشوند، «کار می‌کند»
برای production یک استنتاج است، نه یک اندازه‌گیری.


---

# پیوست — تلاش برای بستنِ سه بندِ استنتاجی (۲۰۲۶-۰۹-۱۳، همان روز)

هدف: اثباتِ کلِ زنجیره روی **stack تست** تا سه بندِ «استنتاج‌شده» در بخش ۸ اندازه‌گیری شوند.
**نتیجه: استقرار انجام نشد.** تصمیمِ مالک، پس از یک یافتهٔ بازدارنده. سه بند همچنان استنتاجی‌اند.

## ۰. تصحیحِ یک نکتهٔ ثبت‌شده — خطای STEP 0b

در گزارش قبلی نوشته شد «اشتباه من بود». مالک تصحیح کرد: **فرض در بریف بود، نه در اجرا.**
بریف گفته بود آن دو فایل «کارِ خارج از گیت» دارند؛ اندازه‌گیری نشان داد نسخهٔ tracked
حدود ۳٫۵ ساعت **تازه‌تر** و ۳۱۸ خط بلندتر است. رفتار درست همان بود که انجام شد:
اندازه‌گیری پیش از اعتماد به فرض، و سپس `git revert`. این برای دفعهٔ بعد ثبت می‌شود:
**فرضِ بریف هم یک ادعاست و سطح شاهد لازم دارد.**

## ۱. مسیر واقعی release — `release/build.ps1`

```
$ pwsh -NoProfile -Command '$env:DISABLE_LOVABLE_MCP="1"; & "release/build.ps1"'
exit code: 1
REFUSED: current branch is 'fix/release-line-runtime-config', not 'main'.
A release image is built only from main -- checkout main first.
```

**این رفتارِ درستِ اسکریپت است، نه نقص.** ولی پیامد دارد: خطِ release عمداً به `main`
گره خورده، پس **از یک شاخهٔ feature قابلِ اجرای end-to-end نیست** مگر با push به `main`
(ممنوع) یا دست‌بردن در همان guard (یعنی تغییرِ چیزی که زیر آزمون است).

یافتهٔ جانبی از همین اجرا: بررسیِ D7 که اضافه شد **بعد از** guardهای branch/origin می‌نشیند،
پس روی یک شاخهٔ غیر-main هرگز به آن نمی‌رسیم. برای جریانِ واقعی (روی `main`) درست است،
ولی اگر کسی بخواهد D7 را مستقل بیازماید، باید روی `main` باشد.

## ۲. یافتهٔ بازدارنده — image در حال اجرا دیگر وجود ندارد

پیش از هر استقراری، وضعیت rollback ثبت شد:

```
:lan tag id             : 296eb4b4899f      (image حادثه)
running container image : 0c3106602cc9      (APP_GIT_SHA=c0804142)
container status        : Up 24 hours (healthy)
```

تلاش برای تگ‌کردنِ image در حال اجرا به‌عنوان rollback شکست خورد:

```
$ docker tag sha256:0c3106602cc9... afrakala-app:lan-rollback-20260913-rc
Error response from daemon: No such image: sha256:0c3106602cc9...

$ docker images -a | grep 0c310660
  (NOT PRESENT)

$ docker commit afrakala-lan-web afrakala-app:lan-rollback-20260913-rc
Error response from daemon: NotFound: content digest sha256:d9d866e6d13b... : not found
```

**یعنی image‌ای که stack تست همین حالا رویش می‌چرخد، در image store وجود ندارد** — نه با تگ،
نه بدون تگ، و محتوایش هم ناقص است پس `docker commit` هم نمی‌تواند بازسازی‌اش کند.

این دقیقاً همان کلاسِ خرابیِ `[D-2]`/`[D-3]` است، در شکلِ کامل‌ترش: تگ `:lan` از روی آن
image جابه‌جا شد، و بعد imageِ بی‌تگ prune شد. نتیجه: **stack تست همین الان هیچ نقطهٔ
بازگشتی ندارد** و هر restart — چه توسط ما، چه یک crash — آن نسخه را برای همیشه می‌برد.

## ۳. اشتباهی که خودم مرتکب شدم و باید ثبت شود

`docker commit` به‌صورت پیش‌فرض کانتینر را **pause** می‌کند. تلاشِ ناموفقِ بالا باعث شد
وضعیت سلامتِ کانتینر از `healthy` به `unhealthy` برود. این یک تغییر در stack در حال اجرا بود
که قصدش را نداشتم.

بازیابی، اندازه‌گیری‌شده:

```
Status=running  Paused=false  Running=true  Health=unhealthy   -> بلافاصله پس از تلاش
/api/healthz از داخل کانتینر: {"ok":true,"status":"healthy",...}  rc=0
t+20s : health=healthy
StartedAt=2026-09-12T17:46:06Z   (بدون تغییر -> کانتینر restart نشد، فقط pause شد)
هر هشت سرویس afrakala-lan-* بالا
```

درس: `docker commit` روی یک کانتینر زنده یک عملیاتِ read-only نیست. اگر لازم شد،
`--pause=false` باید صریح داده شود — و حتی آن‌وقت هم روی یک stack که کسی به آن متکی است
باید اول اجازه گرفت.

## ۴. تصمیم

با توجه به اینکه `c0804142` غیرقابل‌بازیابی است و استقرار آن را برای همیشه می‌بُرد،
موضوع به مالک واگذار شد. **تصمیم: استقرار انجام نشود.** stack تست دست‌نخورده ماند.

هیچ‌کدام از این‌ها انجام نشد: build از مسیر `deploy/lan/build.ps1`، جابه‌جاییِ تگ `:lan`،
`docker compose up -d --no-deps web`، `docker restart afrakala-lan-rest`، و آزمونِ مرورگر.

## ۵. آنچه از این تلاش **به دست آمد**

- رفتارِ guardِ `release/build.ps1` روی شاخهٔ feature: **اندازه‌گیری‌شده** (`rc=1`).
- ترتیبِ بررسیِ D7 نسبت به guardهای branch: **اندازه‌گیری‌شده**.
- نبودِ نقطهٔ بازگشت برای stack تست: **اندازه‌گیری‌شده، و یک ریسکِ عملیاتیِ باز**.
- اینکه `docker commit` کانتینر را pause می‌کند: **اندازه‌گیری‌شده، به قیمتِ یک وقفهٔ کوتاه**.

## ۶. imageهای آزمایشی که روی این باکس باقی ماندند

`afrakala-app:rc-pilot` · `afrakala-app:rc-key` · `afrakala-app:rc-banner` — شواهدِ فازهای
۳ تا ۷. حذف نشدند چون شاهدِ اثباتِ probe در ۷.۴ به آن‌ها ارجاع می‌دهد. هیچ‌کدام تگِ `:lan`
را جابه‌جا نکردند.


---

# پیوست ۲ — آزمونِ مرورگرِ واقعی، D8، D9 و مسیرِ واقعیِ build

روش: **کانتینرِ یک‌بارمصرف در کنارِ stack**، نه جایگزینِ آن. `--rm`، پورت آزادِ بالا
(۳۹۲۰۰ و ۳۹۲۰۱)، هرگز ۳۱۰۰ و هرگز ۳۰۰۰. stack در حال اجرا در تمام مدت دست‌نخورده ماند.

## ۱. باگی که فقط مرورگر می‌توانست بگیرد

اولین بارگذاری در Chrome نشان داد config تزریق‌شده این است:

```
window.__APP_RUNTIME_CONFIG__={"supabaseUrl":"http://kong:8000", ...}
```

`kong` نامِ سرویس در شبکهٔ داخلیِ compose است. SSR حلش می‌کند؛ **مرورگر هرگز نمی‌تواند**.

علت: ترتیبِ خواندن در `readServerRuntimeConfig` با `SUPABASE_URL` شروع می‌شد، که روی این
استقرار `http://kong:8000` است. مقادیرِ واقعی روی این باکس:

```
SUPABASE_URL            = http://kong:8000            داخلیِ compose
APP_SUPABASE_PUBLIC_URL = http://192.168.170.8:9000   رو‌به‌مرورگر (compose:67)
VITE_SUPABASE_URL       = http://192.168.170.8:9000   (build arg سابق)
```

**هیچ‌یک از بررسی‌های آرتیفکتی این را نمی‌دید:** bundle صفر literal داشت، مکانیزم حاضر بود،
و یک image هنوز دو مقدار متفاوت سرو می‌کرد. مکانیزم درست بود و **مقدار** غلط.

اصلاح (`763dddc0`): ترتیب شد `APP_SUPABASE_PUBLIC_URL` سپس `VITE_SUPABASE_URL` سپس
`SUPABASE_URL`. فایل `src/routes/api.version.ts:18` از قبل همین نام را می‌خواند، پس قرارداد
تازه‌ای اختراع نشد.

## ۲. نتایج مرورگر (پس از اصلاح، با session واردشده)

| بررسی | نتیجه |
|---|---|
| `window.__APP_RUNTIME_CONFIG__.supabaseUrl` | `http://192.168.170.8:9000` (Kong تست) |
| `appEnv` و `trustedHosts` | `production` و `192.168.170.8,localhost` |
| درخواست به `192.168.170.8:9000` | **۲۷** |
| درخواست به `192.168.170.10:8000` | **۰** |
| هر ارجاعی به `192.168.170.10` | **۰** |
| `kong:8000` یا `localhost` در شبکه | **۰** |
| میزبان‌های دیده‌شده (کل) | فقط `…8:39200` (۱۶۶) و `…8:9000` (۲۷) |
| console روی مسیرِ **احرازشده** | فقط یک پیام از یک افزونهٔ نامربوط Chrome |
| **هشدار hydration mismatch** | **هیچ** — روی `/products` با بارگذاریِ تازه و session فعال |
| `PGRST203` و `42501` و `42883` | هیچ |

بنر، دو بازو از **همان image**:

| بازو | `appEnv` | بنر قرمز | بنر کهربایی |
|---|---|---|---|
| هویتِ production + میزبان مورد اعتماد (۳۹۲۰۰) | `production` | ۰ | ۰ |
| کنترل (۳۹۲۰۱) | `test` | ۰ | **۱** — «محیط تست myafrakala.ir — اطلاعات این بخش واقعی نیست» |

**تصحیحِ روشِ خودم:** ابتدا بنر را با کلاس `.bg-amber-100` می‌شمردم. روی `/users` عدد ۲ داد،
ولی هر دو **نشانِ وضعیتِ «در انتظار»** بودند، نه بنر. سنجهٔ درست متنِ بنر است
(`محیط تست` یا `هشدار ایمنی`)، نه رنگ. بعد از آن همه‌جا از متن استفاده شد.

## ۳. چهار صفحهٔ داده‌سنگین در برابر دیتابیس

| صفحه | UI | دیتابیس (`supabase_admin`) | حکم |
|---|---|---|---|
| `/products` | مجموع **۳۵۶** | `count(*) products` = **356** | **دقیقاً برابر** |
| سایدبار «کاربران در انتظار تأیید» | **۴** | `profiles WHERE status='pending'` = **4** | **دقیقاً برابر** |
| `/users` | ۳ صفحهٔ ۲۰تایی | `count(*) profiles` = **41** | سازگار (۲۰+۲۰+۱) |
| `/operations/tasks` | بخش بازاریابی: کل **۸**، منقضی **۷** | کل **13**، منقضی **11**، انجام‌شده 1 | **اختلاف — حل نشد** |

دربارهٔ اختلافِ چهارم: توضیحِ محتمل **RLS** است — صفحه با نقشِ کاربرِ واردشده کوئری می‌زند و
RLS اعمال می‌شود، در حالی که شمارشِ من با `supabase_admin` از RLS عبور می‌کند. **این را
اثبات نکردم.** ربطی به تغییرِ این شاخه ندارد (همان مسیر داده، و آدرس حالا درست است)، ولی
به‌عنوان یک اختلافِ حل‌نشده ثبت می‌شود نه به‌عنوان تطابق.

## ۴. D8 — بررسیِ verdict دیگر زیررشته‌ای نیست

پیش از این `emit-blocks.ps1:45` می‌نوشت `$report -notmatch "## VERDICT: PASS"` — تطابق روی
کلِ سند. حالا **آخرین** خطِ `VERDICT:` تصمیم می‌گیرد و همهٔ خطوطِ verdict به‌ترتیب چاپ می‌شوند.
سند `rehearsal-e4b.md` هنوز پذیرفته می‌شود، ولی حالا **به این دلیل که آخرینش PASS است**، نه
به این دلیل که رشته جایی در فایل پیدا شد.

## ۵. D9 — probe باید میزبانِ قابل‌دسترسِ مرورگر را الزام کند

**نقصِ تازه، که خودِ مرورگر ثابتش کرد:** D6(i) تا (iii) روی imageی که مقدار زمان اجرایش
`http://kong:8000` بود **پاس شدند**. probeِ آرتیفکتی ساختاراً نمی‌تواند این را ببیند.

بندِ D9 اضافه شد: میزبانِ داخلِ `window.__APP_RUNTIME_CONFIG__` سرو‌شده باید یک IPv4 یا یک
FQDN نقطه‌دار باشد — نه نامِ خالیِ بدون نقطه (نام سرویس compose)، نه loopback.

**اثباتِ شکست (`compared`):**

```
SUPABASE_URL=http://kong:8000, APP_SUPABASE_PUBLIC_URL unset
  served: "supabaseUrl":"http://kong:8000"   host: kong
  FAIL D9: bare name 'kong' with no dot -- a compose service name.   exit 1

APP_SUPABASE_PUBLIC_URL=http://localhost:9000
  served: "supabaseUrl":"http://localhost:9000"   host: localhost
  FAIL D9: loopback host 'localhost'   exit 1

APP_SUPABASE_PUBLIC_URL=http://192.168.170.8:9000
  served: "supabaseUrl":"http://192.168.170.8:9000"   host: 192.168.170.8
  OK D9: browser-reachable   exit 0
```

## ۶. Task 1 — مسیرِ واقعیِ build

```
$ pwsh -NoProfile -File release/build.ps1
exit code: 1
REFUSED: current branch is 'fix/release-line-runtime-config', not 'main'.
```

رفتارِ درستِ اسکریپت. یعنی مسیرِ کاملِ release فقط از `main` قابل اجراست و از یک شاخهٔ feature
**عمداً** بسته است. پیامد: بررسیِ D7 که بعد از این guard می‌نشیند، روی شاخهٔ feature هرگز
اجرا نمی‌شود.

مسیرِ زیرین — همان `docker compose --env-file deploy/lan/.env.lan` که `deploy/lan/build.ps1`
اجرا می‌کند — با یک override اجرا شد تا تگِ `:lan` **جابه‌جا نشود**:

```
$ docker compose --env-file deploy/lan/.env.lan -f deploy/lan/docker-compose.yml -f override.yml build web
compose build rc=0        Image afrakala-app:rc-realpath Built
:lan          -> 296eb4b4899f   (بدون تغییر)
:rc-realpath  -> 404ecc35ed29
```

و imageی که **همین مسیر واقعی** ساخت، کلِ مجموعهٔ probe را پاس کرد:

```
OK D6(i)  : no baked host literal in client bundle
OK D6(ii) : runtime mechanism present
baked JWTs in client: 0
served    : "supabaseUrl":"http://192.168.170.8:9000"
OK D9     : browser-reachable
```

## ۷. پاک‌سازی و سلامتِ stack

```
docker rm -f rc-verify-a rc-verify-b   -> rc=0، صفر کانتینر rc-verify باقی
پورت ۳۹۲۰۰ و ۳۹۲۰۱: LISTENING count 0
:lan -> 296eb4b4899f                    (بدون تغییر)
afrakala-lan-web StartedAt=2026-09-12T17:46:06.169711504Z  Health=healthy
هشت سرویس afrakala-lan-* بالا
```

## ۸. ریسکِ ایستا — ثبت می‌شود، اقدام نمی‌شود

**imageی که stack تست رویش می‌چرخد (`0c3106602cc9`، `APP_GIT_SHA=c0804142`) در image store
وجود ندارد و content digest ندارد.** دستورهای `docker tag` و `docker commit` هر دو با
`NotFound: content digest ... not found` شکست می‌خورند.

**پیامد:** اگر آن کانتینر هر زمان متوقف شود — با restart، با crash، با یک `compose up` —
آن build دیگر قابلِ اجرا نیست و برگشت‌ناپذیر از دست می‌رود. باکس تست یک container-stop با
از‌دست‌دادنِ نسخهٔ فعلی‌اش فاصله دارد.

چاره‌جویی یک تصمیمِ جداست و اینجا انجام نشد.
