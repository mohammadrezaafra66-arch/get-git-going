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

---

# پیوست ۳ — بستنِ چهار بازدارندهٔ بازبینی (۲۰۲۶-۰۹-۱۴)

مبنا: `REVIEW-20260913.md` (commit `88887140`) — حکم REJECT. شاخه روی `88887140`، پایه
`origin/main` @ `9bc8d554`، باکس `D:\AfraKalaTest\app`. فقط همین چهار مورد لمس شد؛ تنها فایلِ
کد که تغییر کرد `release/emit-blocks.ps1` است. این پیوست حکم نمی‌دهد — بازبین حکم می‌دهد.

روشِ اندازه‌گیری: هر بلوک از یک سندِ RELEASE که **emitterِ commit‌شده** تولید کرد، عیناً
بیرون کشیده شد (فقط de-indent و جایگزینیِ صریحِ نامِ image/تگِ خصوصی، که هر جایگزینی چاپ شد)،
با `powershell.exe -File` (Windows PowerShell 5.1) اجرا شد، و exit code **جدا از هر pipe**
خوانده شد. فاز ۳ روی `608c3f4d` اجرا شد (blob emitter = `df83cd7d`، درختِ تمیز).

## ۰. پیش از اصلاح — هر سه بازدارنده بازتولید شد

| id | ورودی | خروجیِ emitterِ `88887140` | exit |
|---|---|---|---|
| B1 | image با `http://kong:8000` کاشته در `index-Bvgj7gd2.js` | `OK D6(i)` | بلوک بعداً در D9 به دلیلِ دیگری افتاد |
| B1 | image با `https://kwwkppkcihrbeurwudjh.supabase.co` کاشته | `OK D6(i)` | همان |
| B1 | image ناموجود | `OK D6(i)` (D6(ii) گرفت) | `1` |
| B2 | e4b + `## VERDICT: FAIL` + نثرِ ستون-۰ `VERDICT: PASS is the outcome…` | `Written: RELEASE-…md` | `0` |
| B3 | خطوطِ D2 عیناً (تگِ مقصد در فضای‌نامِ `afrakala-b3`) | rollback = `296eb4b4899f`، running = `0c3106602cc9` | `0` |

## ۱. B1 — D6 probeِ شکسته بود

**آنچه واقعاً غلط بود.** (i) فقط `https?://IPv4:port` را می‌دید. به‌علاوه — **یافتهٔ تازه، در
بازبینی ثبت نشده بود** — زیر Windows PowerShell 5.1 آرگومانِ `sh -c` در D6(iii) شاملِ `"`
بود؛ 5.1 آن را escape نمی‌کند، `sh` رشتهٔ بریده گرفت (`sh: syntax error: unterminated quoted
string`)، `$served` برابر `$null` شد، و `$null -notmatch 'x'` برابر `False` است — پس
`OK D6(iii): served config = ` روی **هیچ** چاپ شد. بلوک فقط چون D9 نتوانست میزبان را parse
کند exit 1 می‌داد؛ یعنی روی production همیشه قرمز می‌شد، به دلیلِ غلط. (pwsh 7.6 همان خط را
درست اجرا می‌کند؛ اندازه‌گیری شد.) بازبین D9 را روی رشتهٔ سرو‌شده‌ای که خودش گرفته بود سنجید،
نه از راهِ این خطِ docker.

**چه عوض شد.**
- (0) اگر `docker images -q $img` خالی باشد → FAIL. (i) اگر docker run exit≠0 یا صفر فایل js
  خوانده شد → FAIL. خالی‌گذری بسته شد.
- (i) **default-deny**: هر literalِ `http/https/ws/wss://host` در `/app/.output/public`
  (و هر `<ref>.supabase.co|in` بدون scheme) یا روی فهرستِ بازبینی‌شده است یا FAIL.
- **تمایزِ endpointِ کارکردی از متنِ توضیحی:** در bundleِ minify‌شده این دو از نظرِ واژگانی قابل
  تشخیص نیستند — هر دو string literal‌اند — پس probe نیت را حدس نمی‌زند. به‌جایش:
  (الف) هر literalی که **شکلِ backend** دارد — IP، پورتِ صریح، نامِ بی‌نقطه (`kong`، `localhost`)،
  پسوندِ خصوصی، میزبانِ Supabase — **همیشه** FAIL است و فهرستِ میزبان نمی‌تواند نجاتش دهد؛
  (ب) متنِ توضیحی با این شکل فقط به‌صورتِ **literalِ دقیق** و حداکثر به **تعدادِ اندازه‌گیری‌شده**
  مجاز است (`http://192.168.170.8:11434` = ۱ بار، `_app.admin.ai-providers.tsx:95`)؛ اگر همان
  رشته جای دیگری به‌عنوانِ endpoint تکرار شود، شمارش بالا می‌رود و FAIL می‌شود؛
  (ج) هر میزبانِ دیگر باید شخصِ ثالثِ عمومیِ بازبینی‌شده باشد (لینک، placeholder، شناسهٔ
  namespace). فهرست از **موجودیِ اندازه‌گیری‌شدهٔ** bundleِ فعلی ساخته شد (۳۱ میزبان + ۴ literalِ
  دقیق: help text، `GOTRUE_URL` در `@supabase/auth-js`، fallbackِ origin در router،
  namespaceِ xlsx).
- **هزینه، صریح:** میزبانِ شخصِ ثالثِ تازه (مثلاً یک لینکِ جدید در UI) probe را با **نامِ همان
  میزبان** قرمز می‌کند؛ اصلاح یک خطِ بازبینی‌شده در emitter است. پرصدا، نه خاموش.
- (iii) آرگومانِ `sh -c` دیگر هیچ `"` ندارد (خروجی هم‌شکلِ قبل: `"supabaseUrl":"…"`)؛
  `$served` خالی → FAIL. منطقِ D9 دست نخورد.

**اثباتِ دوجهته** (Windows PowerShell 5.1):

| ورودی | باید | نتیجه | exit |
|---|---|---|---|
| image حادثه `296eb4b4899f` | FAIL | `http://192.168.170.8:9000  (explicit port, IP literal)` — تنها موردِ نام‌برده | `1` |
| کاشتهٔ `http://kong:8000` | FAIL | `http://kong:8000  (explicit port, bare name with no dot)` | `1` |
| کاشتهٔ `.supabase.co` | FAIL | `https://kwwkppkcihrbeurwudjh.supabase.co  (Supabase host)` + شکلِ بی‌scheme | `1` |
| image ناموجود | FAIL | `FAIL D6(0): … does not exist on this machine. Nothing was measured.` | `1` |
| help text دو بار | FAIL | `http://192.168.170.8:11434  (allowed 1x as illustrative text, found 2x)` | `1` |
| image بدونِ server | FAIL | `FAIL D6(iii): the image served no supabaseUrl at all.` | `1` |
| bundleِ فعلی (`review-ae47de4a`)، help text حاضر ۱× | PASS | `OK D6(i) (475 js files read, 176 URL literal(s) classified)` … `OK D9` | `0` (5.1 **و** pwsh 7.6) |

commit: `beece1ff`.

## ۲. B2 — D8 probeِ شکسته بود

**آنچه واقعاً غلط بود.** `^\s*#*\s*VERDICT:` — `#` اختیاری بود، پس نثرِ ستون-۰ «حکم» شمرده شد.

**چه عوض شد.** حکم فقط همان شکلی است که `release/lib/rehearse-engine.sh` می‌نویسد
(`echo "## VERDICT: PASS"` در `:1245`، و `## VERDICT: FAIL[ (reason)]` در
`:559,804,1155,1163,1227,1234,1240`): خطِ دقیقِ `^## VERDICT: (PASS|FAIL)( \(.*\))?$`، حساس به
حروف، **بیرون از code fence**. سرتیترِ شبهِ‌حکم در هر شکلِ دیگر رد می‌شود (fail-closed).

**اثباتِ دوجهته:**

| ورودی | باید | نتیجه | exit | سند نوشته شد؟ |
|---|---|---|---|---|
| نثرِ `VERDICT: PASS` پس از `## VERDICT: FAIL` | REJECT | `final : :2049 ## VERDICT: FAIL` | `1` | خیر |
| آخرین FAIL پس از PASSِ قبلی | REJECT | `final : :2049 ## VERDICT: FAIL (planted…)` | `1` | خیر |
| `## VERDICT: PASS` فقط داخلِ fence پس از FAIL | REJECT | `final : :2049 ## VERDICT: FAIL` | `1` | خیر |
| `## verdict: pass` | REJECT | `verdict-like heading(s) the rehearsal engine never writes: :2050` | `1` | خیر |
| `rehearsal-e4b.md` | ACCEPT | آخرین سرتیترِ واقعی `:2047 ## VERDICT: PASS` (`:878` FAIL پیش از آن) | `0` | بله |
| e4b + خطِ نثرِ حاویِ `VERDICT: FAIL` | ACCEPT | نثر حکم نیست | `0` | بله |

commit: `5d4df9e1`.

## ۳. B3 — D2 بسته نشده بود

**آنچه واقعاً غلط بود.** `docker tag afrakala-app:lan afrakala-app:lan-rollback` تگی را فریز
می‌کرد که در حالِ جایگزینی است، نه image در حال اجرا؛ بدونِ assertion، با دو چاپ در دو قالب.

**چه عوض شد.** بلوک `.Image`ِ کانتینرِ `afrakala-lan-web` را (sha256 کامل) می‌خواند، **همان id**
را به‌عنوانِ rollback تگ می‌کند، تگ را دوباره می‌خواند و id کامل را با id کامل مقایسه می‌کند؛ هر
شکست → `FAIL D2` و `exit 1`. از یک snippet در هر دو شاخهٔ emitter (با/بی manifest).

**یافتهٔ اندازه‌گیری‌شده — با انتظارِ ۳.۱۱ مأموریت نمی‌خواند.** imageِ در حال اجرای این باکس،
`sha256:0c3106602cc9…`، **در image store نیست**: `docker image inspect` با id کامل و کوتاه →
`No such image`؛ `docker tag` → exit 1. کنترل: `docker tag` با sha256 کاملِ imageِ حاضر
(`296eb4b4899f`) → exit 0. و `.Image`ِ کانتینر با `.Id`ِ image روی چهار کانتینرِ دیگر
(`afrakala-lan-kong`، `afrakala-lan-caddy`، `afrakala-lan-db`، `hanieh-backend-1`) **دقیقاً
برابر** است — پس قالب‌ها یکی‌اند و مقایسه معتبر است. این همان «ریسکِ ایستا»ی بندِ ۸ پیوستِ ۲
است؛ بازبین آن را «تأییدنشده» گذاشته بود (بخش ۹ بند ۹). پس روی stackِ زنده **نتیجهٔ درستِ D2
همان FAIL است** — نقطهٔ بازگشتی برای گرفتن وجود ندارد — و D2 همین را می‌گوید. انتظارِ «تگ کن و
موفقیت را assert کن» روی این باکس **دست‌یافتنی نیست**؛ جهتِ PASS روی یک کانتینرِ یک‌بارمصرف
اثبات شد.

**اثباتِ دوجهته** (تگ‌ها در فضای‌نامِ خصوصی؛ `:lan` هرگز جابه‌جا نشد):

| ورودی | باید | نتیجه | exit |
|---|---|---|---|
| زنده: `afrakala-lan-web` (`0c3106602cc9`، غایب از store)، `:lan`=`296eb4b4899f` | FAIL | `cannot tag the running image … NO rollback point was taken. Stop.` | `1` |
| کانتینرِ یک‌بارمصرف (`alpine:3.20.3`، بدونِ env برنامه) | PASS | `OK D2: … = running image sha256:1e42bbe2…`؛ بازخوانی: برابر | `0` |
| mutant: بازگرداندنِ منبعِ قدیمی `afrakala-app:lan` | FAIL | `rollback tag is 'sha256:296eb4b4…' but the running image is sha256:1e42bbe2…` | `1` |
| کانتینرِ ناموجود / نامِ تگِ نامعتبر | FAIL | `could not read …` / `cannot tag …` | `1` / `1` |

commit: `dac904e7`.

## ۴. B4 — هیچ‌چیز D1/D2/D3/D6/D9 را اجرا نمی‌کند

**تعیین از روی کد — گزینهٔ (b).**
- `release/apply-release.ps1:3-5`: «executes the Preflight + Phase 4 (migration) blocks … and
  STOPS before Phase 5 (image/deploy) -- deploy is always a human step, never this script's.»
- `release/lib/apply-release-engine.sh:5-13`: همان دامنه، به‌عنوانِ تصمیمِ عمدی.
- `release/lib/apply-release-engine.sh:60,136,145`: engine فقط preflight SQLِ خودش و خطوطِ
  مطابقِ `mig_apply` / `ledger_insert_only` را اجرا می‌کند؛ هیچ مسیری برای اجرای بلوکِ
  PowerShell ندارد.
- قاطع: `Block 0` (D1) **پیش از** `# Phase 5` است و باز هم اجرا نمی‌شود. پس engine «زود
  نمی‌ایستد» — یک اجراکنندهٔ migration است، by design. (a) رد شد. بلوک‌های gate را انسان اجرا
  می‌کند، همان‌طور که ۲۰۲۶-۰۹-۱۳ شد؛ نقصِ واقعی این است که شکستِ دستی می‌توانست دیده نشود.

**چه عوض شد.** هر gate — D1a، D1b، D2، D3 (هر دو شاخه)، D6، D9 — به‌عنوانِ **آخرین خروجی** یک
خطِ واحد چاپ می‌کند: `GATE <id> PASS` یا `GATE <id> FAIL <reason>` و سپس `exit 1`؛ و یک
`Expect:` که همان خط را نام می‌برد. منطقِ هیچ check عوض نشد؛ فقط خطِ خروجی اضافه شد.
`validate-blocks.ps1` روی سندِ emit‌شده: `PASSED`، `exit 0`.

**اثباتِ دوجهته** (آخرین خطِ غیرخالیِ خروجی و exit):

| gate | PASS | FAIL |
|---|---|---|
| D1a | worktreeِ تمیز روی HEAD → `GATE D1a PASS`, `0` | sha اشتباه → `GATE D1a FAIL HEAD … is not the build sha deadbeef`, `1`؛ درختِ کثیف → `… not clean (1 path(s))`, `1` |
| D1b | ۱۵ از ۱۵ → `GATE D1b PASS`, `0` | `GATE D1b FAIL 1 migration file(s) missing: 20260913101000_533_pg_cron_http_scheduler.sql`, `1` |
| D2 | کانتینرِ یک‌بارمصرف → `GATE D2 PASS`, `0` | زنده → `GATE D2 FAIL docker tag of the running image failed, no rollback point taken`, `1` |
| D3 | دو image → `GATE D3 PASS`, `0` | یک image → `GATE D3 FAIL :lan and :lan-rollback are the same image (92c554df96cc)`, `1` |
| D6 | bundleِ فعلی → `GATE D6 PASS` | حادثه → `GATE D6 FAIL host literal(s) in the client bundle: http://192.168.170.8:9000`, `1` |
| D9 | `10.99.99.99` → `GATE D9 PASS` (آخرین خطِ بلوک), `0` | `kong` → `GATE D9 FAIL served host 'kong' is a bare name with no dot`, `1` |

commit: `608c3f4d`.

## ۵. فاز ۳ — ابطالِ کلِ مجموعه روی `608c3f4d`

۲۴ ردیف (همهٔ ورودی‌های بازبینی + کنترل‌های مثبت + mutantها). `BROKEN_PROBES=0`،
`OVER_REJECT=0`. ردیف‌های مأموریت:
۳.۱ FAIL/1 · ۳.۲ FAIL/1 · ۳.۳ FAIL/1 · ۳.۴ PASS/0 · ۳.۵ FAIL/1 · ۳.۶ REJECT/1 · ۳.۷ REJECT/1 ·
۳.۸ ACCEPT/0 · ۳.۹ FAIL/1 (کنترل PASS/0) · ۳.۱۰ FAIL/1 با نامِ فایل (کنترل‌ها PASS/0) ·
۳.۱۱ زنده FAIL/1 — **درست، ولی نه مطابقِ انتظارِ مأموریت** (بخش ۳)؛ یک‌بارمصرف PASS/0؛ mutant FAIL/1.

## ۶. typecheck

`npm run typecheck` یک بار: **70 خطا در 6 فایل** — همان شش فایل و همان شمارشِ هر فایل که
بازبینی ثبت کرد. اختلاف: `TYPECHECK_EXIT=2` اندازه‌گیری شد؛ بازبینی `TYPECHECK_EXIT=0` نوشته
بود. `tsc` با وجودِ خطا غیرصفر برمی‌گرداند — ثبت می‌شود، بازنویسی نمی‌شود. تنها فایلِ لمس‌شده
پس از بازبینی `release/emit-blocks.ps1` است (TypeScript نیست).

## ۷. پاک‌سازی و سلامتِ stack

```
docker rmi afrakala-b1:{planted-kong,planted-supa,ollama-twice,no-server}  -> exit 0
docker rmi afrakala-app:review-ae47de4a (92c554df96cc, 1.32GB)            -> exit 0
فضای‌نام‌های خصوصیِ afrakala-b1/b3/b4/p3: خالی؛ کانتینرهای آزمایشی: صفر؛ worktreeهای خودم: حذف
afrakala-app:lan -> 296eb4b4899f   (بدون تغییر)
afrakala-lan-web StartedAt=2026-09-12T17:46:06.169711504Z  restarts=0  health=healthy
```
هیچ ارتباطی با `192.168.170.10`، هیچ deploy/restart/compose build، هیچ `docker commit`/`pause`،
هیچ کانتینری با `SUPABASE_URL` به سمتِ `.10` (D6(iii) با `-D6TargetHost 10.99.99.99` تولید شد).

## ۸. یادداشتِ دائمی — اختلافِ ۸ در برابر ۱۳ وظیفه **توضیح داده شد**

«۸» شمارشِ `overall`ِ `get_task_kpi_report(30)` است که به پنجرهٔ ۳۰ روزه محدود است؛ «۱۳» کلِ
جدولِ `tasks`. `8 (درونِ ۳۰ روز) + 5 (قدیمی‌تر) = 13`. فرضیهٔ RLS را بازبین رد کرد (برای ادمین
RLS ۱۳ یا ۰ می‌دهد، هرگز ۸). خوش‌خیم و بی‌ربط به این شاخه.

## ۹. تأیید نشده

۱. **رفتارِ `exit 1` در کنسولِ تعاملی آزموده نشد.** اگر مالک بلوک را در یک پنجرهٔ PowerShell
   paste کند، `exit` خودِ پنجره را می‌بندد و خطِ `GATE … FAIL` با آن ناپدید می‌شود — شکست دیده
   می‌شود (پنجره بسته شد) ولی **دلیلش** نه. همهٔ اثبات‌ها با `powershell -File` بود.
۲. **PASSِ D2 روی stackِ واقعی** اندازه‌گیری نشد و روی این باکس ممکن نیست (بخش ۳). روی
   `192.168.170.10` هم آزموده نشد.
۳. **پایداریِ فهرستِ میزبان‌های D6** در طولِ زمان — امروز روی bundleِ فعلی پاس است؛ یک ارتقای
   وابستگی یا لینکِ تازه آن را پرصدا قرمز می‌کند.
۴. **D6 فقط `http/https/ws/wss` و `<20char>.supabase.co|in` را می‌بیند**؛ literalِ میزبان بدونِ
   scheme (مثلاً `"kong:8000"` خام) دیده نمی‌شود.
۵. **D6(iii) و D9 روی production** اجرا نشد؛ روی این باکس فقط با هدفِ ساختگیِ `10.99.99.99`.
۶. نکاتِ بازبین که عمداً دست نخوردند (خارج از چهار بازدارنده): شمارهٔ تکراریِ `Block 30`،
   پیش‌فرضِ `D6TargetHost=192.168.170.10`، خالی‌گذریِ D1b با مجموعهٔ تهی، aliasِ نقطه‌دارِ D9،
   `appEnv`ِ غلط‌تایپ‌شده، و جملهٔ سرِ سندِ emit‌شده («apply-release.ps1 stops at the FIRST block
   whose live output disagrees») که با دامنهٔ واقعیِ engine (بخش ۴) نمی‌خواند.

---

# پیوست ۴ — بستنِ شش بازدارندهٔ بازبینیِ دوم (۲۰۲۶-۰۹-۱۴)

مبنا: `REVIEW-2-20260913.md` (commit `f46c0e20`) — حکم REJECT. شاخه `fix/release-line-runtime-config`
روی `f46c0e20` (کدِ بازبینی‌شده `88997bd6`)، پایه `origin/main` @ `9bc8d554`، باکسِ تست
`D:\AfraKalaTest\app` (`192.168.170.8`). فقط همین شش مورد لمس شد؛ فایل‌های تغییرکرده:
`release/emit-blocks.ps1`، `release/lib/apply-release-engine.sh`، `release/apply-release.ps1`.
**این پیوست حکم نمی‌دهد و شاخه را تأییدشده اعلام نمی‌کند** — بازبین حکم می‌دهد.

روش (همان قراردادِ بازبینی): هر بلوک از سندی که **emitterِ همان commit** تولید کرد عیناً بیرون
کشیده شد (de-indent + جایگزینیِ صریحِ نام‌ها به فضای‌نامِ `c6fix-*`، هر جایگزینی چاپ شد)؛ با
`powershell.exe -File` (Windows PowerShell **5.1.26100.9278**، مرجع) و `pwsh.exe -File` (7.6.4،
ثانوی) اجرا شد؛ exit code با `> file 2>&1` و سپس `$LASTEXITCODE` در دستورِ جدا خوانده شد، نه از
pipe. paste = نوشتنِ key eventها با `AttachConsole` + `WriteConsoleInputW` در input bufferِ
**همان** پنجرهٔ تست (conhost یا Windows Terminal)، بعد خواندنِ screen buffer، transcriptِ خودِ shell،
و یک فرمانِ پیگیری (`Write-Host ("ALIVE-PROMPT-" + $PID)`) برای اثباتِ زنده‌بودنِ همان shell.
تولیدِ production روی `.10` = Windows PowerShell 5.1.26100.9444 (به گفتهٔ مالک، اندازه‌گیری‌شده) —
هیچ gateی `&&`، `||`، ternary یا `??` ندارد؛ `$LASTEXITCODE` صریح خوانده می‌شود؛ هیچ `"` داخلِ
آرگومانِ `sh -c` نیست.

imageهای آزمایشی (از `git archive f46c0e20`، `docker build`، هرگز compose): `c6fix-afrakala:clean`
= `909189f7d233`؛ `c6fix-afrakala:evasion` = `f4aa0b98432b` — کاشت در **source**
(`src/routes/__root.tsx`) تا از Vite بگذرد؛ bundleِ واقعی، شمارشِ مستقل: `const Bz="192.168.170.8:9000"`،
`__r2e="http://"+Bz`، `__r2a="HTTP://192.168.170.8:9000"`، `__r2b="//kong:8000"`، `__r2c="kong:8000"`
(همان شکلِ imageِ `evasion`ِ بازبین)؛ `c6fix-afrakala:fakeserver` (FROM clean، سروری که env را
نادیده می‌گیرد و `supabaseUrl` ثابت سرو می‌کند). هیچ کانتینری `SUPABASE_URL` به `.10` نداشت.

## ۰. پیش از اصلاح — هر شش بازدارنده بازتولید شد (`measured`)

| # | ورودی | خروجی (emitterِ `f46c0e20`) | exit 5.1 / 7 |
|---|---|---|---|
| C1 | کانتینرِ `clean` با `SUPABASE_URL=http://kong:8000`، `APP_SUPABASE_PUBLIC_URL=` روی `127.0.0.1:38431` | `/login` سرو کرد `window.__APP_RUNTIME_CONFIG__={"supabaseUrl":"http://kong:8000"}`؛ بلوکِ D6+D9 روی **همان image** → `GATE D6 PASS` · `GATE D9 PASS`؛ خطوطِ پس از بلوکِ deploy که config سرو‌شده را بخوانند: **۰** | `0` / `0` |
| C2 | mutant M1 (`$runningId` از `docker image inspect c6fix-d2:lan`) روی کانتینرِ `c6fix-d2-web` (alpine `28bd5fe8`) و `:lan` فریب (`cd17e2ac`) | `OK D2: … = running image sha256:cd17e2ac…` · `GATE D2 PASS`؛ oracle: rollback=`cd17e2ac` ≠ container=`28bd5fe8` | `0` / `0` |
| C3 | سندِ صفر-migration (e4b با FINALِ خالی، build sha `deadbeef`) روی `postgres:16` یک‌بارمصرف (`c6fix-pg`/`c6fix_apply_probe`) | `=== VERDICT: PASSED (all preflight + migration blocks matched…` · `PASSED. Log: …`؛ همان سند: `GATE D1a FAIL HEAD f46c0e20 is not the build sha deadbeef` (exit 1)؛ `afrakala-app:deadbeef` → `No such image` | `0` |
| C4 | D1a با sha اشتباه، paste در conhost 5.1 و Windows Terminal 5.1 | conhost: `shell_alive=False window_exists=False` (transcript: `GATE D1a FAIL …` چاپ شد، سپس پنجره رفت)؛ WT: `alive=False`، پنجره ماند با `[process exited with code 1 (0x00000001)]` | — |
| C5 | e4b + `` ``` `` + متن + `## VERDICT: FAIL …` (fenceِ باز) و e4b + `` ``` `` / `~~~` / `` ``` `` / `## VERDICT: FAIL …` | هر دو: `Written: …RELEASE-….md` | `0` / `0` |
| C6 | imageِ `evasion`؛ و `fakeserver` (سرو `10.99.99.99`) با `$target='10.99.99.9'` | هر دو: `GATE D6 PASS` · `GATE D9 PASS` (کنترلِ `clean`: همان، `176 URL literal(s)`) | `0` / `0` |

## ۱. C1 — D9 استقرارِ واقعی را هرگز نمی‌دید (`90a754c1`)

**آنچه واقعاً غلط بود.** D6(iii) و D9 کانتینرِ **خودشان** را با `-e SUPABASE_URL="http://${target}:8000"`
بالا می‌آورند و همان را می‌سنجند — probe از خودش می‌پرسد. مقدارِ سرو‌شده را محیطِ **استقرار** تعیین
می‌کند (`src/lib/runtime-config.ts`: `APP_SUPABASE_PUBLIC_URL`، بعد `VITE_SUPABASE_URL`، بعد
`SUPABASE_URL`) و هیچ gateی پس از deploy آن را نمی‌خواند؛ بلوکِ verify فقط کدِ HTTP می‌گرفت.

**چه عوض شد.** gateِ تازهٔ **D10** داخلِ بلوکِ verify (پس از deploy؛ شمارهٔ بلوک‌ها و ارجاعِ
rollback تغییری نکرد). بدونِ هیچ کانتینرِ خودی: `curl.exe -s --max-time 20 "$site/login"`
(exit code صریح)، دقیقاً **یک** انتسابِ `window.__APP_RUNTIME_CONFIG__` در صفحه، parse با
`ConvertFrom-Json`، و `supabaseUrl -cne $expected` → FAIL. پارامترهای تازهٔ emitter:
`-LiveSiteUrl` (پیش‌فرض `http://192.168.170.10:3000`) و `-ExpectedSupabaseUrl` (پیش‌فرض
`http://<D6TargetHost>:8000`)؛ emitter آدرسِ انتظاریِ بی‌نقطه یا loopback را رد می‌کند
(`kong`، `localhost`، `127.0.0.1`، `0.0.0.0`، بی‌scheme → `FATAL`، exit 1، سندی نوشته نشد — اندازه‌گیری
شد؛ نسخهٔ اولِ همین بررسی `127.0.0.1` را می‌پذیرفت چون `-notmatch` دومی `$Matches` را بازنویسی
کرد؛ پیش از commit گرفته و اصلاح شد). probeهای پیش از deploy (D6/D9) دست نخوردند.

**اثبات، دو جهت** — «استقرار» = کانتینرهای یک‌بارمصرف روی `127.0.0.1:3843x`؛ oracleِ مستقل (curl +
regex، نه gate) پیش از اجرا مقدارِ سرو‌شدهٔ هرکدام را چاپ کرد:

| استقرار (`127.0.0.1:…`) | oracle: `supabaseUrl` سرو‌شده | باید | `-File` 5.1 / 7 | paste conhost 5.1 / 7 |
|---|---|---|---|---|
| `:38431` clean، `SUPABASE_URL=http://kong:8000`، `APP_SUPABASE_PUBLIC_URL=` (شکلِ compose) | `http://kong:8000` | FAIL | `GATE D10 FAIL live supabaseUrl is 'http://kong:8000', not exactly 'http://10.99.99.99:8000'` · `1` / `1` | FAIL / FAIL |
| `:38433` clean، `APP_SUPABASE_PUBLIC_URL=http://192.168.170.8:9000` (نتیجهٔ حادثه) | `http://192.168.170.8:9000` | FAIL | `… is 'http://192.168.170.8:9000' …` · `1` / `1` | FAIL / FAIL |
| `:38436` fakeserver | `http://10.99.99.99:8000.attacker.example` | FAIL | `… is 'http://10.99.99.99:8000.attacker.example', not exactly …` · `1` / `1` | FAIL / FAIL |
| `:38435` fakeserver، دو انتسابِ config | `10.99.99.99:8000` ‖ `kong:8000` | FAIL | `GATE D10 FAIL the live /login carries 2 runtime config assignment(s), parseable=True` · `1` / `1` | FAIL / FAIL |
| `:38434` fakeserver | `http://10.99.99.99:8000/` | FAIL | `… is 'http://10.99.99.99:8000/', not exactly …` · `1` / `1` (فقط `-File`، commit) | — |
| `:38437` هیچ‌چیز گوش نمی‌دهد | — | FAIL | `GATE D10 FAIL could not read http://127.0.0.1:38437/login (curl exit 7)` · `1` / `1` (فقط `-File`، commit) | — |
| `:38432` clean، `APP_SUPABASE_PUBLIC_URL=http://10.99.99.99:8000` | `http://10.99.99.99:8000` | **PASS** | `OK D10: … serves supabaseUrl 'http://10.99.99.99:8000' -- exactly the expected public address` · `GATE D10 PASS` · `0` / `0` | PASS / PASS |

و کلاسی که D10 برایش ساخته شد، هنوز زنده در probeهای پیش از deploy (عمداً دست نخورد): بلوکِ D6+D9 روی
**همان** image ِ `clean` → `GATE D6 PASS` · `GATE D9 PASS`، `0` / `0`.

## ۲. C2 — D2 می‌توانست بی‌آنکه درست باشد PASS بدهد (`47054bce`)

**آنچه واقعاً غلط بود.** «حقیقت» (`$runningId`) و «موضوع» (`$rbId`) هر دو از **یک** خواندن
می‌آمدند؛ مقایسهٔ `$rbId -ne $runningId` نمی‌توانست غلط‌بودنِ همان یک خواندن را ببیند.

**چه عوض شد.** پس از `docker tag`، کانتینر **دوباره** خوانده می‌شود
(`docker inspect afrakala-lan-web --format "{{.Image}}"`، `$LASTEXITCODE` صریح، شکلِ
`sha256:<64 hex>` الزامی) و `$rbId -cne $containerNow` → FAIL. هیچ مقداری که از قبل در متغیر است
مبنای مقایسه نیست.

**اثبات، دو جهت** (کانتینرِ `c6fix-d2-web` روی alpine `28bd5fe8`، فریبِ `c6fix-d2:lan` = `cd17e2ac`):

| ورودی | باید | خروجی (5.1 و 7 یکسان) | exit 5.1 / 7 | paste 5.1 / 7 | oracle (`docker image inspect` تگ ↔ `docker inspect` کانتینر) |
|---|---|---|---|---|---|
| gateِ درست | PASS | `OK D2: c6fix-d2:lan-rollback = running image sha256:28bd5fe8…` · `GATE D2 PASS` | `0` / `0` | PASS / PASS | rollback=`28bd5fe8b56d` = container=`28bd5fe8b56d` ✔ |
| **M1** — `$runningId` از `docker image inspect c6fix-d2:lan` (پیش از اصلاح: PASS) | FAIL | `FAIL D2: … is 'sha256:cd17e2ac…' but c6fix-d2-web, re-read after tagging, runs sha256:28bd5fe8….` · `GATE D2 FAIL rollback tag is 'sha256:cd17e2ac…' but c6fix-d2-web is running sha256:28bd5fe8…` | `1` / `1` | FAIL / FAIL | rollback=`cd17e2ac9824` ≠ container=`28bd5fe8b56d` |
| **M2** — `docker tag c6fix-d2:lan $rollbackTag` | FAIL | `GATE D2 FAIL rollback tag is 'sha256:cd17e2ac…' but the running image is sha256:28bd5fe8…` | `1` / `1` | FAIL / FAIL | rollback=`cd17e2ac9824` ≠ container |
| کانتینرِ ناموجود | FAIL | `GATE D2 FAIL cannot read the image c6fix-d2-nonexistent is running` | `1` / `1` | FAIL / FAIL | — |

## ۳. C3 — `apply-release.ps1` با gateهای FAIL می‌گفت PASSED (`a9b58b71`)

**آنچه واقعاً غلط بود.** engine فقط `pg_is_in_recovery()` و خطوطِ `mig_apply`/`ledger_insert_only`
پیش از `# Phase 5` را اجرا می‌کند؛ Block 0 و هیچ بلوکِ `GATE` را نه. برای releaseِ صفر-migration
(همین release) یعنی `PASSED` بی هیچ gateی پشتش؛ و سرِ سند ادعای خلاف داشت.

**چه عوض شد.** حکمِ engine: `=== VERDICT: MIGRATION PHASE PASSED -- RELEASE NOT VERIFIED: BLOCK 0 AND ALL GATES NOT RUN ===`
و فهرستِ gateهایی که **از خودِ سند** استخراج می‌شود: `NOT EXECUTED, NOT MEASURED: D1a D1b D2 D3 D6 D9 D10`؛
خطِ پایانیِ wrapper هم همان را می‌گوید (زرد، نه سبز). exit codeها دست نخوردند (`0` migration سالم،
`1` STOP). جملهٔ سرِ سندِ emit‌شده جایگزین شد: validate فقط **شکل** را می‌سنجد و چیزی اجرا نمی‌کند؛
apply-release فقط همان خطوطِ migration را؛ Block 0 و هر gate را **انسان** اجرا می‌کند و هیچ
اسکریپتی آن‌ها را نمی‌سنجد.

**اثبات، دو جهت** (سناریوی بازبین: سندِ صفر-migration، D1aِ Block 0 = FAIL، imageِ probe ناموجود):

| سند | باید | خروجی | exit 5.1 / 7 | خطوطِ `PASSED`ِ بی‌قید |
|---|---|---|---|---|
| صفر-migration، D1a=FAIL، image ناموجود | حکمِ مقید، نه PASSED | `=== VERDICT: MIGRATION PHASE PASSED -- RELEASE NOT VERIFIED: BLOCK 0 AND ALL GATES NOT RUN ===` · `… NOT EXECUTED, NOT MEASURED: D1a D1b D2 D3 D6 D9 D10` · `MIGRATION PHASE PASSED -- release NOT verified: Block 0 and every GATE block were NOT run by this script. Log: …` | `0` / `0` | **۰** / **۰** (پیش از اصلاح: ۲) |
| همان سند، Block 0 به دستِ انسان | FAIL | `GATE D1a FAIL HEAD f46c0e20 is not the build sha deadbeef`؛ `docker image inspect afrakala-app:deadbeef` → exit `1` | `1` / `1` | — |
| سندِ e4b (۱۵ `mig_apply`) روی DBِ خالی — جهتِ دیگر | STOP | `FATAL: block for 20260828000000 (…411….sql) did not match its Expect: line. STOP.` · `executed: 1 of 15` · `=== VERDICT: STOP (a migration block failed its Expect:) ===` | `1` / `1` | ۰ / ۰ |

## ۴. C4 — `exit 1` دلیل را در پنجرهٔ تعاملی نابود می‌کرد (`27659650`)

**آنچه واقعاً غلط بود.** `exit` در shellِ تعاملی خودِ shell را می‌بندد: conhost پنجره و دلیل را با
هم برد؛ WT دلیل را نگه داشت ولی session مرد.

**چه عوض شد.** هر gate یک ناحیهٔ `& { … }` است که به‌جای `exit 1` با `throw` تمام می‌شود:
باقیِ ناحیه اجرا نمی‌شود، shell زنده می‌ماند، خطِ `GATE <id> FAIL <reason>` روی صفحه می‌ماند و
**دلیل در متنِ خطا تکرار می‌شود** (`STOPPED at gate D1a: HEAD … -- nothing after it in this region ran; this shell is still open`)
تا در 5.1 که خطا چند خط است، دلیل از دید خارج نشود؛ `powershell -File` همچنان exit `1` می‌دهد
(`-Command` هم `1`، اندازه‌گیری شد). **پیامدِ زنده‌ماندنِ shell که باید بسته می‌شد:** paste ِ بعدی
حالا اجرا می‌شود (اندازه‌گیری شد: فرمانی بعد از `}` در همان paste اجرا شد)؛ `exit` این را با کشتنِ
shell جلوگیری می‌کرد. پس هر FAIL در `$global:AFRAKALA_FAILED_GATES` ثبت می‌شود و سه ناحیهٔ
تغییردهندهٔ حالت (retagِ `:lan`، prune ِ تگ‌های rollback، deploy) با guard شروع می‌شوند:
`NOT RUN: gate(s) FAILED earlier in this shell …: GATE D1a FAIL HEAD …` + throw؛ PASS ِ همان gate
آن را پاک می‌کند. بلوکِ rollback عمداً guard ندارد. سرِ سند نحوهٔ paste را توضیح می‌دهد.

**اثبات، دو جهت** — D1a (sha اشتباه / درست) در یک cloneِ خصوصی، به‌علاوهٔ ناحیهٔ guardِ deploy
(سرِ آن عیناً از سند، بدنه با `Write-Host "STATE-CHANGE-REGION-RAN …"` جایگزین شد — فرمان‌های
واقعیِ deploy هرگز paste نشد):

| سناریو (`-File`) | باید | خروجی | exit 5.1 / 7 |
|---|---|---|---|
| D1a، sha اشتباه | FAIL | `GATE D1a FAIL HEAD f46c0e20 is not the build sha deadbeef` · خطا: `STOPPED at gate D1a: HEAD f46c0e20 is not the build sha deadbeef -- nothing after it in this region ran; this shell is still open` | `1` / `1` |
| D1a، sha درست، درختِ تمیز | PASS | `OK D1a: HEAD = f46c0e20, tree clean` · `GATE D1a PASS` | `0` / `0` |

paste — ۱۲ اجرا، هرکدام پنجرهٔ تازه؛ «ترتیب» از transcriptِ خودِ shell؛ «پیگیری» = `ALIVE-PROMPT-<PID همان shell>` چاپ شد؛ «دلیل روی صفحه» = متنِ `GATE D1a FAIL HEAD …` در سطرهای **داخلِ پنجرهٔ دیده‌شده** (سطرهای wrap‌شده به هم پیوسته):

| میزبان | shell | paste | shell زنده | پنجره | پیگیری | دلیل روی صفحه | ترتیبِ خروجی (transcript) |
|---|---|---|---|---|---|---|---|
| conhost | 5.1 | D1a-FAIL + ناحیهٔ guard | True | True | True | True | `FAIL D1a` › `GATE D1a FAIL` › `NOT RUN: gate(s)` (بدنهٔ guard اجرا نشد) |
| conhost | 5.1 | D1a-PASS + guard | True | True | True | — | `OK D1a` › `GATE D1a PASS` › `STATE-CHANGE-REGION-RAN` |
| conhost | 5.1 | FAIL + guard + PASS + guard | True | True | True | — | `FAIL D1a` › `GATE D1a FAIL` › `NOT RUN` › `OK D1a` › `GATE D1a PASS` › `STATE-CHANGE-REGION-RAN` |
| conhost | 7 | همان سه | True | True | True | True (FAIL) | همان سه ترتیب |
| Windows Terminal | 5.1 | همان سه | True | True | True | True (FAIL) | همان سه ترتیب |
| Windows Terminal | 7 | همان سه | True | True | True | True (FAIL) | همان سه ترتیب |

پیش از اصلاح (همان روش): conhost 5.1 → `alive=False window=False`؛ WT 5.1 → `alive=False`، `[process exited with code 1 (0x00000001)]`.
یک اجرای paste (conhost/7/recover) نامعتبر بود: یک کاراکترِ فارسی (`ز`، چیدمانِ کیبوردِ `fa` روی باکس) پیش از `& {` تزریق شد و ناحیهٔ اول اصلاً gate نبود؛ با بررسیِ اعتبارِ transcript گرفته شد، harness یک Enterِ گرم‌کننده گرفت، و آن اجرا تکرار شد (معتبر، ترتیبِ درست). در فاز ۳ هر ۴۸ paste `injection_valid=True`.

## ۵. C5 — D8 گزارشی با حکمِ نهاییِ FAIL را می‌پذیرفت (`271b044f`)

**آنچه واقعاً غلط بود.** هر خطِ `` ``` `` یا `~~~` وضعیتِ fence را **toggle** می‌کرد: fenceِ باز تا
پایانِ فایل همه‌چیز را می‌بلعید، و `~~~` داخلِ `` ``` `` پاریته را برمی‌گرداند.

**چه عوض شد.** fence فقط با خطی از **همان کاراکتر**، دست‌کم به طولِ بازکننده، و بی هیچ متنِ دیگر بسته
می‌شود (CommonMark)؛ fenceِ باز در پایانِ فایل → `FATAL: rehearsal report ends inside a code fence opened at :N … never closed`، exit 1.

**اثبات، دو جهت** (emitter با `-File` زیرِ 5.1 و 7؛ «نوشته شد؟» با `Test-Path`):

| ورودی | باید | خروجی (5.1 و 7 یکسان) | exit 5.1 / 7 | نوشته شد؟ |
|---|---|---|---|---|
| e4b + `` ``` `` + متن + `## VERDICT: FAIL (replay stopped early)` (fenceِ باز) | REJECT | `FATAL: rehearsal report ends inside a code fence opened at :2048 ('```') that is never closed.` | `1` / `1` | خیر |
| e4b + `` ``` `` / `~~~` / `` ``` `` / `## VERDICT: FAIL …` | REJECT | `FATAL: the FINAL verdict … is not PASS.` · `final  : :2051  ## VERDICT: FAIL (replay stopped early)` | `1` / `1` | خیر |
| `rehearsal-e4b.md` بدونِ تغییر | ACCEPT | `Written: …` (حکم‌ها همچنان `:878 FAIL`، `:2047 PASS`) | `0` / `0` | بله |
| e4b + `~~~` / `` ``` `` / `## VERDICT: FAIL …` / `~~~` (CommonMark: FAIL داخلِ fence) | ACCEPT | `Written: …` | `0` / `0` | بله |
| e4b + ` ````text ` / `` ``` `` / `## VERDICT: FAIL …` / ` ```` ` | ACCEPT | `Written: …` | `0` / `0` | بله |

## ۶. C6 — D6 میزبانِ ساخته‌شده با الحاق را نمی‌دید و مقایسه substring بود (`d3a5ea65`)

**آنچه واقعاً غلط بود.** (i) فقط literalهای `scheme://` با schemeِ کوچک را می‌خواند؛ `host:port`ِ
بی‌scheme — خودِ `192.168.170.8:9000`ِ حادثه وقتی کد `"http://"+host` می‌نویسد — دیده نمی‌شد.
(iii) `$served -notmatch [regex]::Escape($target)` بود (`.10` داخلِ `.100`). و — یافتهٔ تازه در
همین کار — مقایسه‌های allowlist هم دقیق نبودند: کلیدِ hashtable، `-contains` و `Group-Object` در
PowerShell پیش‌فرض case-insensitive‌اند، پس `HTTP://LOCALHOST:9999` سهمیهٔ `http://localhost:9999` را
قرض می‌گرفت.

**چه عوض شد.** scheme با `grep -i`؛ grep سوم هر نامزدِ `host:port` را با یک کاراکتر زمینه در هر طرف
برمی‌گرداند و PowerShell طبقه‌بندی می‌کند: IPv4:port هر جا (مگر پس از `scheme://` که مالِ scanِ URL
است)؛ `//name:port`؛ و نام فقط وقتی **کلِ** string literal باشد (`"kong:8000"`، `"kong:8000/…"`) —
با همان قاعدهٔ default-deny (پورتِ صریح ⇒ FAIL مگر literalِ دقیق روی فهرست). جفتِ فقط‌رقمی (زمان/نسبت)
آدرس نیست. **نسخهٔ اولِ استخراج over-reject کرد و نگه داشته نشد:** روی bundleِ تمیز
`"2026-04-26T10:00:00Z"`، `T23:59:59`، `font-weight:700;`، `box-shadow:0 0 5px`، `"valueformat:1:text-wiki"`
را host:port خواند (`GATE D6 FAIL`، ۱۵ literal) — زمینهٔ واقعیِ هرکدام اندازه گرفته شد و قاعدهٔ مرز
(پس از پورت نه `:`/حرف/رقم؛ نام فقط بینِ دو quote یا quote و `/`) از آن استخراج شد، و پیش از ویرایشِ
emitter روی سه bundle آفلاین آزموده شد (clean: `[]`، evasion: دقیقاً سه کاشتِ بی‌scheme، incident: `[]`).
همهٔ مقایسه‌ها case-sensitive: `@($allowExact.Keys) -ccontains`، `-ccontains`، `Group-Object -CaseSensitive`؛
(iii): `supabaseUrl` باید **برابرِ** `http://<target>:8000` باشد. یافته‌ها مرتب می‌شوند چون
`Group-Object` در 5.1 و 7 ترتیبِ متفاوت می‌دهد (اندازه‌گیری شد: خطِ `GATE D6 FAIL` در دو shell ترتیبِ
متفاوت داشت؛ پس از مرتب‌سازی خطوطِ خروجیِ gate در دو shell بایت‌به‌بایت یکسان‌اند).

**اثبات، دو جهت:**

| ورودی | باید | خروجی (5.1 و 7 یکسان) | exit 5.1 / 7 | paste 5.1 / 7 |
|---|---|---|---|---|
| imageِ `evasion` | FAIL | `192.168.170.8:9000  (scheme-less host:port, explicit port, IP literal)` · `//kong:8000  (… bare name with no dot)` · `kong:8000  (…)` · `HTTP://192.168.170.8:9000  (explicit port, IP literal)` · `GATE D6 FAIL host literal(s) in the client bundle: //kong:8000, 192.168.170.8:9000, kong:8000, HTTP://192.168.170.8:9000` | `1` / `1` | FAIL / FAIL |
| `fakeserver` (سرو `10.99.99.99`) با `$target='10.99.99.9'` | FAIL | `GATE D6 FAIL served supabaseUrl 'http://10.99.99.99:8000' is not exactly http://10.99.99.9:8000` | `1` / `1` | FAIL / FAIL |
| imageِ حادثه `afrakala-app:3bc526c4` (= `296eb4b4899f`) | FAIL | `GATE D6 FAIL host literal(s) in the client bundle: http://192.168.170.8:9000` | `1` / `1` | FAIL / FAIL |
| **bundleِ مشروعِ فعلی** (`clean`) | **PASS** | `OK D6(i): … (475 js files read, 176 URL literal(s) and 0 scheme-less host:port literal(s) classified)` · `OK D6(ii)` · `OK D6(iii): served config = "supabaseUrl":"http://10.99.99.99:8000"` · `GATE D6 PASS` · `GATE D9 PASS` — همان ۱۷۶ پیش از اصلاح، یعنی `grep -i` چیزِ تازه‌ای در bundleِ تمیز نیافت | `0` / `0` | PASS / PASS |
| `fakeserver` با `$target='10.99.99.99'` (برابرِ دقیق) | PASS | `GATE D6 PASS` · `GATE D9 PASS` (commit) | `0` / `0` | — |

## ۷. فاز ۳ — کلِ مجموعه روی `a9b58b71`، هر دو جهت، هر دو shell، `-File` و paste

همهٔ ردیف‌ها از **یک** سند (`emit-blocks.ps1` @ `a9b58b71`، `-D6TargetHost 10.99.99.99 -LiveSiteUrl http://127.0.0.1:38432 -ExpectedSupabaseUrl http://10.99.99.99:8000`)؛
هر ۹ ناحیهٔ `& { }` با parserِ 5.1 و 7 بی‌خطا parse شد؛ `validate-blocks.ps1` → `blocks found : 35` · `PASSED`، exit `0`.
«نتیجه» = (exit `0` و آخرین خطِ `GATE` = `GATE <id> PASS`) → PASS؛ (exit≠0 و آخرین خط `GATE … FAIL …`) → FAIL؛ هر ترکیبِ دیگر = ناسازگار (هیچ‌کدام رخ نداد).
paste = conhost، پنجرهٔ تازه برای هر اجرا، نتیجه از آخرین خطِ `GATE` در transcript؛ در هر ۴۸ paste: shell زنده + فرمانِ پیگیری اجرا شد + آن خط داخلِ پنجرهٔ دیده‌شده بود + تزریق معتبر.

| # | ردیف | مورد | باید | `-File` 5.1 | `-File` 7 | paste 5.1 | paste 7 | آخرین خطِ GATE (5.1، برابر با 7) |
|---|---|---|---|---|---|---|---|---|
| 1 | D1a sha اشتباه | verified | FAIL | FAIL `1` | FAIL `1` | FAIL | FAIL | `GATE D1a FAIL HEAD f46c0e20 is not the build sha deadbeef` |
| 2 | D1a فایلِ untracked | verified | FAIL | FAIL `1` | FAIL `1` | FAIL | FAIL | `GATE D1a FAIL working tree is not clean (1 path(s))` |
| 3 | D1a فایلِ tracked تغییرکرده | verified | FAIL | FAIL `1` | FAIL `1` | FAIL | FAIL | `GATE D1a FAIL working tree is not clean (1 path(s))` |
| 4 | D1a تمیز | verified / C4 | PASS | PASS `0` | PASS `0` | PASS | PASS | `GATE D1a PASS` |
| 5 | D1b، ۵۳۳ غایب | verified | FAIL | FAIL `1` | FAIL `1` | FAIL | FAIL | `GATE D1b FAIL 1 migration file(s) missing: 20260913101000_533_pg_cron_http_scheduler.sql` |
| 6 | D1b، هر ۱۵ | verified | PASS | PASS `0` | PASS `0` | PASS | PASS | `GATE D1b PASS` |
| 7 | D2 درست | C2 | PASS | PASS `0` | PASS `0` | PASS | PASS | `GATE D2 PASS` (oracle: `28bd5fe8b56d` = `28bd5fe8b56d`) |
| 8 | D2 M1 | C2 | FAIL | FAIL `1` | FAIL `1` | FAIL | FAIL | `GATE D2 FAIL rollback tag is 'sha256:cd17e2ac…' but c6fix-d2-web is running sha256:28bd5fe8…` |
| 9 | D2 M2 | C2 | FAIL | FAIL `1` | FAIL `1` | FAIL | FAIL | `GATE D2 FAIL rollback tag is 'sha256:cd17e2ac…' but the running image is sha256:28bd5fe8…` |
| 10 | D2 کانتینرِ ناموجود | C2 | FAIL | FAIL `1` | FAIL `1` | FAIL | FAIL | `GATE D2 FAIL cannot read the image c6fix-d2-nonexistent is running` |
| 11 | D3 یک image | verified | FAIL | FAIL `1` | FAIL `1` | FAIL | FAIL | `GATE D3 FAIL :lan and :lan-rollback are the same image (28bd5fe8b56d)` |
| 12 | D3 دو image | verified | PASS | PASS `0` | PASS `0` | PASS | PASS | `GATE D3 PASS` |
| 13 | D6 evasion | C6 | FAIL | FAIL `1` | FAIL `1` | FAIL | FAIL | `GATE D6 FAIL host literal(s) in the client bundle: //kong:8000, 192.168.170.8:9000, kong:8000, HTTP://192.168.170.8:9000` |
| 14 | D6 substring | C6 | FAIL | FAIL `1` | FAIL `1` | FAIL | FAIL | `GATE D6 FAIL served supabaseUrl 'http://10.99.99.99:8000' is not exactly http://10.99.99.9:8000` |
| 15 | D6 imageِ حادثه | verified | FAIL | FAIL `1` | FAIL `1` | FAIL | FAIL | `GATE D6 FAIL host literal(s) in the client bundle: http://192.168.170.8:9000` |
| 16 | D6 image ناموجود | verified | FAIL | FAIL `1` | FAIL `1` | FAIL | FAIL | `GATE D6 FAIL image c6fix-afrakala:does-not-exist does not exist on this machine` |
| 17 | D6+D9 bundleِ فعلی | C6 / verified | PASS | PASS `0` | PASS `0` | PASS | PASS | `GATE D9 PASS` |
| 18 | D9 `$target='kong'` | verified | FAIL | FAIL `1` | FAIL `1` | FAIL | FAIL | `GATE D9 FAIL served host 'kong' is a bare name with no dot` |
| 19 | D9 `$target='localhost'` | verified | FAIL | FAIL `1` | FAIL `1` | FAIL | FAIL | `GATE D9 FAIL served host 'localhost' is loopback` |
| 20 | D10 kong زنده | C1 | FAIL | FAIL `1` | FAIL `1` | FAIL | FAIL | `GATE D10 FAIL live supabaseUrl is 'http://kong:8000', not exactly 'http://10.99.99.99:8000'` |
| 21 | D10 شکلِ حادثه | C1 | FAIL | FAIL `1` | FAIL `1` | FAIL | FAIL | `GATE D10 FAIL live supabaseUrl is 'http://192.168.170.8:9000', not exactly …` |
| 22 | D10 superstring | C1 | FAIL | FAIL `1` | FAIL `1` | FAIL | FAIL | `GATE D10 FAIL live supabaseUrl is 'http://10.99.99.99:8000.attacker.example', not exactly …` |
| 23 | D10 دو config | C1 | FAIL | FAIL `1` | FAIL `1` | FAIL | FAIL | `GATE D10 FAIL the live /login carries 2 runtime config assignment(s), parseable=True` |
| 24 | D10 آدرسِ انتظاری | C1 | PASS | PASS `0` | PASS `0` | PASS | PASS | `GATE D10 PASS` |

D8 (emitter با `-File`؛ «پذیرفت» = exit `0` و سند نوشته شد، «رد» = exit `1` و نوشته نشد):

| ردیف | ورودی | باید | 5.1 | 7 |
|---|---|---|---|---|
| 1.9 | e4b + `## VERDICT: FAIL …` در انتها | رد | رد `1` | رد `1` |
| 1.10 | e4b + `## VERDICT: FAIL` + نثرِ ستون-۰ `VERDICT: PASS is the outcome…` | رد | رد `1` | رد `1` |
| 1.11 | خطِ `:2047` → `` ``` `` / `## VERDICT: PASS` / `` ``` `` | رد (`final : :878`) | رد `1` | رد `1` |
| 1.11b | همان با `~~~` | رد | رد `1` | رد `1` |
| 1.12 ×5 | `## verdict: pass` · `##VERDICT: PASS` · `### VERDICT: PASS` · `## VERDICT: Pass` · `## VERDICT:PASS` | رد | رد `1` ×5 | رد `1` ×5 |
| C5-a | fenceِ باز | رد | رد `1` | رد `1` |
| C5-b | `~~~` داخلِ `` ``` `` | رد | رد `1` | رد `1` |
| 1.13 | **`rehearsal-e4b.md` بدونِ تغییر** | پذیرفت | پذیرفت `0` | پذیرفت `0` |
| — | `~~~` دورِ `` ``` `` | پذیرفت | پذیرفت `0` | پذیرفت `0` |
| — | ` ```` ` دورِ `` ``` `` | پذیرفت | پذیرفت `0` | پذیرفت `0` |

سندِ emit‌شده از e4b زیرِ 5.1 و زیرِ 7 (به‌جز خطِ عنوان که `-Date` را دارد) بایت‌به‌بایت یکسان.
C3 (زیرِ 5.1 و 7): ردیف‌های جدولِ بخشِ ۳، هر دو shell یکسان.

```
BROKEN_PROBES   = 0   (۲۴ ردیفِ gate + ۱۴ ردیفِ D8 + ۲ ردیفِ C3؛ هر ردیف ×2 shell؛ gateها ×2 paste)
OVER_REJECTIONS = 0
اختلافِ رفتاری بینِ 5.1 و 7 = 0   (یافته و بسته‌شده در C6: ترتیبِ Group-Object در خطِ GATE D6 FAIL؛
                                  تنها اختلافِ باقی قالبِ نمایشِ خودِ خطای PowerShell است، نه خروجیِ gate)
```

## ۸. typecheck

```
npm run typecheck > typecheck.log 2>&1 ; $LASTEXITCODE   (یک بار، بدونِ pipe)
NPM_EXIT=2
error TS count : 70
distinct files : 6   (products.index 18 · sales-reminders 15 · accounting/functions 13 · invoices/functions 13 · audit/index 6 · admin.automation 5)
```
هیچ فایلِ TypeScript در این دور تغییر نکرد.

## ۹. پاک‌سازی و سلامتِ stack

```
docker rm -f c6fix-deploy-{kong,good,testkong,slash,twice,super} c6fix-pg c6fix-d2-web      -> exit 0
docker rmi c6fix-d2:lan c6fix-d3:lan c6fix-d3:lan-rollback                                 -> exit 0
docker rmi c6fix-afrakala:{fakeserver,evasion,clean}                                      -> exit 0
docker rmi afrakala-app:rc-{realpath,browser,banner,key,pilot}   (بازبین نام برده بود؛ هیچ کانتینری از آن‌ها استفاده نمی‌کرد) -> exit 0
image idها 909189f7d233 f4aa0b98432b bfe9c9d4a2d4 404ecc35ed29 ae5722e8bfc6 4da37c3a0591 b1d5d1b6adc0 d0a6f7c7da4c -> هیچ‌کدام حاضر نیست
release/runs: ۸ logِ اجرای apply-release خودم حذف شد (gitignored)
afrakala-app tags: 3bc526c4=296eb4b4899f, lan=296eb4b4899f, rollback-9c113aac=d953490abc5f, local=427aacd91600
afrakala-app:lan   sha256:296eb4b4899f…   (بدون تغییر)
afrakala-lan-web   Image=sha256:0c3106602cc9…  StartedAt=2026-09-12T17:46:06.169711504Z  Restarts=0  Health=healthy
afrakala-app:lan-rollback  ساخته نشد (D2 هرگز روی stackِ زنده اجرا نشد)
پنجره‌های آزمایشیِ C6FIX-*: همه بسته؛ shellِ باقی‌مانده: 0
```
هیچ خواندن یا نوشتنی روی `192.168.170.10`؛ هیچ deploy، restart یا `compose build`؛ هیچ `docker commit`/`pause`؛
هیچ کانتینری با `SUPABASE_URL` به `.10`؛ `:lan` جابه‌جا نشد؛ هیچ `npm run build` بیرون از Docker؛ هیچ فرمانِ واقعیِ
deploy یا retag در هیچ paste. push به main/staging: خیر. PR: خیر.

## ۱۰. commitها

`27659650` C4 · `47054bce` C2 · `271b044f` C5 · `d3a5ea65` C6 · `90a754c1` C1 · `a9b58b71` C3 · و همین پیوست.

## ۱۱. تأیید نشده

۱. **هیچ‌چیز روی `192.168.170.10`.** D10 روی production اجرا نشد. آدرسِ انتظاریِ پیش‌فرض
   `http://192.168.170.10:8000` استنتاج است (پیش‌فرضِ `D6TargetHost` + طولِ ۲۶ِ `VITE_SUPABASE_URL` در
   `env-parity-20260913.md`)، نه اندازه‌گیری. **پیامدِ مستقیم:** اگر یافتهٔ بازبین درست باشد (`.env.lan`ِ production
   کلیدِ `APP_SUPABASE_PUBLIC_URL` را ندارد و `SUPABASE_URL` = `http://kong:8000`)، D10 روی production پس از deploy
   **FAIL** می‌دهد و release آن‌طور که نوشته شده به بلوکِ rollback می‌رسد — gate کارش را می‌کند، ولی پیش‌شرطِ
   runbook («`APP_SUPABASE_PUBLIC_URL` در `.env.lan` هدف») در این دور اضافه نشد چون جزوِ شش مورد نبود.
۲. نسخهٔ 5.1 ِ اینجا `5.1.26100.9278` است؛ production `5.1.26100.9444` (به گفتهٔ مالک). آن build آزموده نشد.
۳. **paste واقعی با Ctrl+V یا کلیکِ راست** آزموده نشد — key eventها مستقیم در input bufferِ console نوشته شد (همان
   روشِ بازبین). مسیرِ bracketed paste ِ Windows Terminal اندازه‌گیری نشد. در فاز ۳ همهٔ gateها در **conhost** paste
   شدند؛ Windows Terminal فقط برای سناریوهای C4 (D1a + guard، ۶ اجرا در هر shell) و بازتولیدِ پیش از اصلاح.
۴. **حدودِ guardِ C4:** رکوردِ شکست فقط در همان shell است (پنجرهٔ تازه = بی‌حافظه). ناحیه‌ای که به دلیلی **غیر از gate**
   خطا بدهد (مثلاً paste ِ خراب — یک بار دیده شد) شکستی ثبت نمی‌کند و guard ناحیهٔ بعدی را متوقف نمی‌کند. فقط سه ناحیه
   guard دارند (retagِ `:lan`، prune، deploy)؛ بلوک‌های فاز ۳ ِ handoff و rollback ندارند (rollback عمداً).
۵. **حدودِ استخراجِ C6:** `name:port` داخلِ template literal (`` `${x}:8000` ``)، پس از کاراکتری غیر از quote، یا داخلِ
   رشتهٔ بلندتر (`"kong:8000;…"`) دیده نمی‌شود؛ IPv4:port هر جا دیده می‌شود. پایداریِ قاعده روی bundleهای آینده
   تضمینی ندارد — اگر روزی رشته‌ای دقیقاً به شکلِ `"name:NN"` در bundle بیاید، بلند FAIL می‌دهد (over-rejection پرصدا، نه عبورِ خاموش).
۶. imageِ `evasion` بازسازیِ من از توصیفِ بازبین است؛ imageِ خودِ بازبین پاک شده بود. شکلِ bundle با متنِ بازبینی می‌خواند.
۷. pwsh 7.0–7.2 آزموده نشد.
۸. یافته‌های غیرِبازدارندهٔ بازبین که عمداً دست نخوردند: شمارهٔ تکراریِ Block، D1b روی مجموعهٔ تهی، D3 بدونِ تگِ
   rollback، پیش‌فرضِ `D6TargetHost=192.168.170.10`، سقف‌نداشتنِ میزبان‌های allowlist (`get-git-going.lovable.app`)،
   `OK D6(i)` با grepِ شکسته، `bun install` بدونِ lockfile، و D2 روی stackِ زنده (imageِ در حال اجرا در store نیست — بخشِ ۴.۱ بازبینی؛ همچنان بازدارندهٔ **اجرای** release).
۹. guardِ `REFUSED: 'afrakala' is a real database` در engine و رفتارش روی نامِ دیتابیسِ production سنجیده نشد.
