# پزشکی‌قانونیِ پیکربندیِ build — حادثهٔ ۲۰۲۶-۰۹-۱۳

سند پژوهشی، **فقط‌خواندنی**. هیچ فایلی جز همین سند تغییر نکرد، هیچ image ساخته یا بارگذاری
نشد، و هیچ چیزی روی `192.168.170.10` لمس نشد.

سطوح شاهد: `measured` (دستور + خروجی + exit code) · `quoted` (نقل عین با محل) ·
`cited` (مسیر:خط) · `compared` (یک probe روی دو چیز) · `assertion` (بدون شاهد — صریح برچسب خورده).

---

## ۱. خلاصهٔ مدیریتی

۱. علت حادثه **هیچ commitی در بازهٔ `d60232f5..3bc526c4` نیست**. فایل‌های مسیر آدرس —
   `vite.config.ts`، `src/integrations/supabase/client.ts`، `Dockerfile`،
   `deploy/lan/docker-compose.yml` — در آن بازه **اصلاً تغییر نکردند** (`measured`).
۲. مکانیزم baking از `1adbfbc9` (۲۰۲۶-۰۵-۰۱، `gpt-engineer-app[bot]`، Lovable) می‌آید —
   چهار ماه پیش از حادثه. `vite.config.ts` با `define` مقدار
   `import.meta.env.VITE_SUPABASE_URL` را به یک **literal** تبدیل می‌کند (`quoted`).
۳. پس تفاوت image درست و غلط فقط **محیطِ ماشینِ سازنده** بود: `release/build.ps1` صفر
   `--build-arg` و صفر `VITE_` دارد و کار را به `deploy/lan/build.ps1` می‌سپارد که
   `docker compose --env-file <.env.lan همین ماشین> build` می‌زند (`measured`).
۴. image `296eb4b4899f`: رشتهٔ `192.168.170.10` **صفر بار** در کل bundle، و
   `http://192.168.170.8:9000` دو بار در client و دو بار در SSR (`measured`).
۵. **یافتهٔ امنیتی:** کلید `anon` تستی داخل **هر دو** bundle همان image است و با کلید
   `.env.lan` تست **یکسان** است (مقایسهٔ hash، بدون چاپ هیچ مقداری).
۶. **`[D-1]` آن‌طور که نوشته شده کاملاً درست نیست** — runbook یک assertion روی sha دارد،
   ولی **بعد از** deploy و در block «verify». جزء دوم آن (وجود فایل migration) تأیید شد.
۷. **Option B «بازگرداندنِ runtime config» نیست** — چنین مکانیزمی **هرگز در این source
   وجود نداشته**. `window.__` در bundle، `window.__TSS_START_OPTIONS__` مربوط به
   TanStack Start است، نه پیکربندی Supabase (`measured`).
۸. دو ناسازگاری با ground truth ثبت شد (ref‌ها، و مکانیزم `window.__`) — بازنویسی نشدند.
۹. image قدیمی `8b04c479e022` روی این ماشین **نیست**؛ مقایسهٔ آرتیفکتیِ دو image
   انجام **نشد** و در «انجام‌نشده» آمده.
۱۰. یک نشتِ ناخواسته توسط خودِ من رخ داد و در بخش ۸ صریح ثبت شده است.

---

## ۲. جدول Phase 1 — با شمارش‌ها

### شمارش‌های پایه (`measured`)

| مجموعه | دستور | COUNT |
|---|---|---|
| ۱.۱ `import.meta.env` در `src/` | `grep -rn 'import\.meta\.env' src/ --include=*.ts --include=*.tsx --include=*.js --include=*.jsx` | **18** |
| ۱.۲ نام‌های یکتای `VITE_*` در repo | `grep -rhoE 'VITE_[A-Z0-9_]+' . --exclude-dir=node_modules --exclude-dir=.git \| sort -u` | **14** |
| ۱.۳ `VITE_*` به‌عنوان build arg در compose | `grep -nE 'VITE_' deploy/lan/docker-compose.yml` | **8 خط** (۵ arg واقعی) |
| ۱.۳ `ARG VITE_*` در `Dockerfile` | `grep -nE '^\s*(ARG\|ENV)\b\|VITE_' Dockerfile` | **۵ ARG** |
| ۱.۴ نام‌های `VITE_*` در `.env.lan` تست | `grep -oE '^[[:space:]]*VITE_[A-Z0-9_]+' deploy/lan/.env.lan \| sort -u` | **6** (مقادیر چاپ نشد) |
| ۱.۵ `--build-arg` در `release/build.ps1` | `git show 3bc526c4:release/build.ps1 \| grep -cE '\-\-build-arg'` | **0** |
| ۱.۵ `VITE_` در `release/build.ps1` | همان فایل، `grep -c 'VITE_'` | **0** |

### جدول اصلی — یک سطر به ازای هر نام `VITE_*`

«baked» از خودِ bundle اندازه‌گیری شده (`measured`)؛ «✗» یعنی حاضر نیست.

| name | read where (file:line) | in compose args? | passed by release/build.ps1? | in .env.lan? | baked into 296eb4b4899f |
|---|---|---|---|---|---|
| `VITE_SUPABASE_URL` | `src/integrations/supabase/client.ts:8` · `src/lib/storage/upload-with-progress.ts:68` | ✓ `:33` | **✗** | ✓ | `http://192.168.170.8:9000` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `client.ts:10` · `upload-with-progress.ts:69` | ✓ `:34` | **✗** | ✓ | کلید `anon` تستی (hash `a0bf…`) |
| `VITE_SUPABASE_PROJECT_ID` | `src/lib/mcp/index.ts:8` | ✓ `:35` | **✗** | ✓ | مقدار از `.env.lan` تست |
| `VITE_APP_ENV` | `src/routes/__root.tsx:316` | ✓ `:38` | **✗** | ✓ | `"test"` |
| `VITE_TRUSTED_HOSTS` | `src/routes/__root.tsx:295` | ✓ `:39` | **✗** | **✗** | `""` (خالی) |
| `VITE_ENVIRONMENT_NAME` | `src/routes/__root.tsx:316` | ✗ | **✗** | ✗ | تعریف‌نشده |
| `VITE_SHOW_ENVIRONMENT_BANNER` | `src/routes/__root.tsx:319` | ✗ | **✗** | ✗ | `undefined` |
| `VITE_ENVIRONMENT_BANNER_TEXT` | `src/routes/__root.tsx:320` | ✗ | **✗** | ✗ | `""` |
| `VITE_BUILD_ID` | `src/lib/pwa/build-version.ts:52` | ✗ (از `GIT_SHA`/`BUILD_TIME`) | **✗** | ✗ | از `buildId` ساخته می‌شود |
| `VITE_SUPABASE_ANON_KEY` | فقط در `vite.config.ts:18` به‌عنوان fallback | ✗ | **✗** | ✗ | — |
| `VITE_APP_NAME` | — (فقط در مستندات/نمونه) | ✗ | **✗** | ✗ | — |
| `VITE_APP_URL` | — | ✗ | **✗** | ✗ | — |
| `VITE_FEATURE_QUOTE_CUSTOMER_PICKER` | — | ✗ | **✗** | ✓ | — |
| `VITE_FEATURE_QUOTE_GUEST_COMMITMENT` | — | ✗ | **✗** | ✓ | — |

**سطرهای نقص** (در `src/` خوانده می‌شود ولی `release/build.ps1` پاسش نمی‌دهد):
`VITE_SUPABASE_URL` · `VITE_SUPABASE_PUBLISHABLE_KEY` · `VITE_SUPABASE_PROJECT_ID` ·
`VITE_APP_ENV` · `VITE_TRUSTED_HOSTS` · `VITE_ENVIRONMENT_NAME` ·
`VITE_SHOW_ENVIRONMENT_BANNER` · `VITE_ENVIRONMENT_BANNER_TEXT` · `VITE_BUILD_ID`

> **تعداد سطرهای نقص: ۹** — و چون `release/build.ps1` **هیچ** `--build-arg` ندارد،
> عملاً **هر** نامی که در `src/` خوانده می‌شود یک سطر نقص است.

---

## ۳. یافته‌های Phase 2 — دو image کنار هم

### جدول IP (`measured`)

| needle | 296eb4b4899f — client | 296eb4b4899f — SSR | 8b04c479e022 — client | 8b04c479e022 — SSR |
|---|---|---|---|---|
| `192.168.170.10` | **0** | **0** | اندازه‌گیری نشد | اندازه‌گیری نشد |
| `192.168.170.8` | **3** | **5** | اندازه‌گیری نشد | اندازه‌گیری نشد |
| `:8000` | **0** | **0** | اندازه‌گیری نشد | اندازه‌گیری نشد |
| `:9000` | **2** | **2** | اندازه‌گیری نشد | اندازه‌گیری نشد |

**چرا ستون‌های image قدیمی خالی است:** `8b04c479e022` روی این ماشین وجود ندارد
(`measured`: `docker image inspect` → `No such image`؛ صفر image با شناسهٔ `8b04c4`؛
هیچ tarballی در `release/out/` یا روی `D:`؛ صفر dangling منطبق). تنها نسخهٔ آن روی
`192.168.170.10` است که **دامنهٔ ممنوع** است. این در «انجام‌نشده» ثبت شده.

### آدرس‌های یکتا در image جدید (`measured`)

```
client: 2× http://192.168.170.8:9000 · 1× http://192.168.170.8:11434
ssr   : 2× http://192.168.170.8:9000 · 2× http://192.168.170.8:8002 · 1× http://192.168.170.8:11434
```

فایل‌های حامل در client: `assets/index-DHg13tWP.js` ·
`assets/upload-with-progress-BZ3iDSYu.js` · `assets/_app.admin.ai-providers-BRQ02j5k.js`

شکل باکِ‌شده در client (`quoted`، کلید حذف‌شده):

```
function D2(){return $2("http://192.168.170.8:9000","<JWT-REDACTED>"
```

یعنی **هم آدرس و هم کلید** به‌صورت آرگومان literal در `createClient` نشسته‌اند.

### ۲.۴ — مکانیزم runtime-injection: **وجود ندارد**

ground truth می‌گوید client قدیمی «آدرس را در زمان اجرا از `window.__` می‌گیرد».
این با شاهد **تأیید نشد**:

- `grep -rnE 'window\.__|globalThis\.__|__ENV|__APP_CONFIG|__RUNTIME' src/` → **COUNT=0** (`measured`)
- در bundle جدید `window.__` دو بار هست و هر دو `window.__TSS_START_OPTIONS__` است —
  داخلیِ TanStack Start (`quoted`)
- `src/integrations/supabase/client.ts` در `d60232f5` و `3bc526c4` **بایت‌به‌بایت یکسان** است
  (`compared`: هر سه hash = `52ab42837a69e82a`)

مکانیزمِ واقعی، baking در زمان build است (`quoted`, `vite.config.ts:56-60`):

```ts
define: {
  "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(cloudUrl),
  "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(cloudPublishableKey),
  ...
}
```

و `cloudUrl` از **محیطِ ماشینِ سازنده** می‌آید (`quoted`, `vite.config.ts:10-13`):

```ts
const cloudUrl =
  process.env.VITE_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  "https://kwwkppkcihrbeurwudjh.supabase.co";
```

### ۲.۵ — یافتهٔ امنیتی

- در `client` و در `SSR` هر کدام **یک** توکن JWT یکتا، با claim `"role":"anon"`،
  طول ۱۶۹، `sha256` با پیشوند `a0bf` (`measured`).
- کلید `VITE_SUPABASE_PUBLISHABLE_KEY` در `.env.lan` **تست**: `sha256` پیشوند `a0bf`.
- **نتیجه: identical.** کلید `anon` محیط **تست** داخل image‌ای است که روی **production**
  مستقر شد.
- fallback هاردکدشده در `vite.config.ts:20`: `sha256` پیشوند `599f` → **different**،
  یعنی آن fallback استفاده نشده.
- مقایسه با کلید production انجام **نشد** (نیازمند خواندن از `.10`، ممنوع).

هیچ مقدار کلیدی در این سند چاپ نشده است.

---

## ۴. Phase 3 — commitی که runtime را build-time کرد

### ۳.۱ شناسه

```
sha    = 1adbfbc92c11675c7777c6ee7530f5622b4a3455
short  = 1adbfbc9
date   = Fri May 1 03:23:52 2026 +0000
author = gpt-engineer-app[bot] <159125892+gpt-engineer-app[bot]@users.noreply.github.com>
subject= Changes
```

### ۳.۲ hunk (`quoted`، کلید حذف‌شده)

```diff
-export default defineConfig();
+const cloudUrl =
+  process.env.VITE_SUPABASE_URL ??
+  process.env.SUPABASE_URL ??
+  "https://kwwkppkcihrbeurwudjh.supabase.co";
+
+const cloudPublishableKey =
+  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
+  ...
+  "<JWT-REDACTED>";
+
+export default defineConfig({
+  vite: {
+    define: {
+      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(cloudUrl),
+      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(cloudPublishableKey),
+      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(cloudProjectId),
+    },
+  },
+});
```

### ۳.۳ عمدی یا جانبی؟

**جانبی نسبت به این مدل استقرار.** شواهد:

- fallbackها همه به یک پروژهٔ **ابریِ Lovable** اشاره دارند
  (`kwwkppkcihrbeurwudjh.supabase.co`) — یعنی هدفِ این کد میزبانیِ ابری بود، نه یک LAN
  خودمیزبان (`cited`, `vite.config.ts:13,20,23`).
- پیام commit فقط `Changes` و نویسنده یک bot است؛ هیچ توضیحی دربارهٔ پیامدِ
  «یک image برای هر host» وجود ندارد (`quoted`).
- در همان commit هیچ تغییری در `Dockerfile` یا compose برای پاس‌دادنِ این مقادیر به
  build دیده نمی‌شود.

پس این تصمیم **برای LAN گرفته نشده**؛ پیامدِ host-specific شدنِ image رایگان به دست آمد.

### ۳.۴ از Lovable روی main، یا از یک شاخهٔ سرور؟

**از Lovable روی main.** نویسنده و committer هر دو `gpt-engineer-app[bot]`‌اند و commit
خطی است (`git rev-list --parents -n1` → ۲ توکن = یک parent) (`measured`).

### ۳.۵ نکتهٔ تعیین‌کننده

```
$ git log --oneline d60232f5..3bc526c4          -> 5 commits
$ git diff --name-only d60232f5..3bc526c4 | grep -E 'vite.config|supabase/client|Dockerfile|compose'
  (no output)
```

**در بازهٔ بین image درست و image غلط، هیچ‌یک از فایل‌های مسیر آدرس تغییر نکرده‌اند.**
تنها فایلِ مرتبطِ تغییریافته `release/build.ps1` است. علت حادثه تغییرِ کد نبود؛
تغییرِ **ماشینِ سازنده** بود.

---

## ۵. Phase 4 — جدول نقص‌ها

| id | file:line | اکنون چه می‌کند (`quoted`) | چه باید بکند | آیا رفعش حادثهٔ ۰۹-۱۳ را می‌گرفت؟ |
|---|---|---|---|---|
| **D1-a** (checkout state) | `release/emit-blocks.ps1:573,590,595` | runbook دارد: `git rev-parse --short HEAD` و `Expect: APP_GIT_SHA equals git rev-parse --short HEAD` | همین assertion باید **پیش از** Block 1 و به‌عنوان **شرط ورود** اجرا شود، نه در block «verify» بعد از deploy | **نه** — sha درست بود؛ محیطِ build غلط بود |
| **D1-b** (migration files) | `release/emit-blocks.ps1:354` | `if (Test-Path $migPath) {` فقط برای تزئینِ block با OWNER DECISION؛ نبودِ فایل **رد نمی‌شود** | نبودِ هر فایلِ migrationِ مجموعه = **REFUSE** پیش از emit | **نه** (ولی حادثهٔ ۱۱‌از‌۱۴ را می‌گرفت) |
| **D2** | `release/emit-blocks.ps1:514` سپس `:558` | `docker tag afrakala-app:<sha> afrakala-app:lan` **قبل از** `docker tag afrakala-app:lan afrakala-app:lan-rollback` | ابتدا id فعلیِ `:lan` را در `:lan-rollback` تثبیت کن، **بعد** `:lan` را جابه‌جا کن | نه (ولی rollback را قابل‌اعتماد می‌کرد) |
| **D3** | `release/emit-blocks.ps1:564` | `Expect: afrakala-app:lan-rollback present` — فقط **حضور** | assert کند `:lan` و `:lan-rollback` به **دو id متفاوت** resolve شوند | نه |
| **D4** | `release/build.ps1:116` و runbook `:599` | `docker save '$Tag'` با `$Tag = "afrakala-app:lan"` (پیش‌فرض `:29`)، ولی runbook می‌گوید `docker tag afrakala-app:<sha> afrakala-app:lan` | tarball باید با تگِ `<sha>` ذخیره شود، یا runbook از `:lan` استفاده کند | نه |
| **D5** | `release/build.ps1` (صفر `--build-arg`) → `deploy/lan/build.ps1:148` → `docker-compose.yml:32-39` → `vite.config.ts:10-13,57` | `docker compose --env-file $envFile -f $composeFile build` — مقادیر از `.env.lan` **ماشینِ سازنده** | مقادیر باید از **host مقصد** بیایند و نتیجه روی آرتیفکت assert شود | **بله — این دقیقاً همان علت است** |

### تصحیح `[D-1]` آن‌طور که در بریف آمده بود

بریف می‌گوید runbook «هرگز assert نمی‌کند که HEAD برابر build sha است». این **دقیق نیست**:
چنین assertionی وجود دارد (`emit-blocks.ps1:595`, `Expect: APP_GIT_SHA equals git rev-parse
--short HEAD`). نقصِ واقعی **جای** آن است: در block «verify»، یعنی **بعد از** اینکه image
بالا آمده و ترافیک واقعی خورده. یک assertion که بعد از وقوع اجرا شود، دروازه نیست.
جزء دومِ `[D-1]` (وجود فایل‌های migration) **تأیید می‌شود**.

### نقص‌های تازه‌ای که پیدا شد

| id | file:line | چیست | شدت |
|---|---|---|---|
| **N1** | `vite.config.ts:13,20,23` | سه fallback هاردکدشده به یک پروژهٔ **ابری**؛ اگر هر دو متغیر محیطی خالی باشند، build **بی‌صدا** یک هدفِ سومِ اشتباه را bake می‌کند — و کلیدش در source است | **بالا** |
| **N2** | bundle `296eb4b4899f` | کلید `anon` تست در image مستقرشده روی production (بخش ۲.۵) | **بالا (امنیتی)** |
| **N3** | `src/integrations/supabase/client.ts:8` | `import.meta.env.VITE_SUPABASE_URL \|\| process.env.SUPABASE_URL` — به‌نظر fallbackِ runtime دارد ولی `define` سمت چپ را با literal جایگزین می‌کند، پس سمت راست **کدِ مرده** است | متوسط |
| **N4** | این ماشین، زنده | `:lan` → `296eb4b4899f` ولی کانتینرِ در حال اجرا روی `0c3106602cc9` (`APP_GIT_SHA=c0804142`) است؛ image سالمِ در حال اجرا دیگر هیچ tagی ندارد — D2/D3 به‌صورت زنده | متوسط |
| **N5** | `release/build.ps1:40-61` | build **درست** assert می‌کند (branch=main، درخت تمیز، HEAD=origin/main) ولی **هیچ** assertion محیطی ندارد؛ یعنی سخت‌گیریِ موجود روی چیزِ اشتباه متمرکز است | متوسط |

---

## ۶. Phase 5 — دو راه، تصمیم با مالک

### Option A — baking بماند، ولی مقادیر از host مقصد بیایند

- **در عمل:** `release/build.ps1` یک پارامتر `-Target` یا یک فایل env مخصوص مقصد بگیرد و
  مقادیر را صریحاً `--build-arg` بدهد؛ یک image به ازای هر مقصد.
- **کجا تغییر کند:** `release/build.ps1` (الان صفر `--build-arg` دارد)؛ یا `deploy/lan/build.ps1`
  که `--env-file` را از مقصد بخواند. `vite.config.ts` و `Dockerfile` دست‌نخورده می‌مانند.
- **هزینه:** کم. زنجیره از قبل ARG→ENV→define را دارد؛ فقط منبعِ مقادیر عوض می‌شود.
- **ریسک:** یک image برای هر host یعنی tarballهای بیشتر و امکانِ استقرارِ image اشتباه روی
  host اشتباه — که دقیقاً همان کلاسِ خطای امروز است، فقط جابه‌جا شده به مرحلهٔ انتخابِ فایل.
- **چه چیزی را ناممکن می‌کند:** «یک image، چند مقصد» و promote کردنِ همان بایت از تست به production.

### Option B — پیکربندی در زمان اجرا

- **در عمل:** آدرس و کلید از محیطِ کانتینر در زمان start خوانده شوند؛ یک image برای همه.
- **کجا تغییر کند:** حذف `VITE_SUPABASE_URL`/`..._KEY` از `define` در `vite.config.ts:57-58`،
  و یک مسیرِ تزریقِ runtime برای client (SSR از قبل `process.env` را دارد —
  `client.server.ts:48`, `auth-middleware.ts:9`).
- **هزینه:** **بیشتر از آنچه «restore» نشان می‌دهد.** چنین مکانیزمی در این source
  **هرگز وجود نداشته** (`measured`: صفر `window.__`/`__ENV` در `src/`). این کارِ نو است،
  نه بازگرداندن.
- **ریسک:** یک درخواستِ اضافه یا یک اسکریپتِ تزریق پیش از hydration؛ اگر غایب باشد،
  app در مرورگر بدون آدرس بالا می‌آید.
- **چه چیزی را ناممکن می‌کند:** ثابت‌بودنِ کاملِ آرتیفکت — bundle دیگر خودکفا نیست.

### توصیه (پنج خط)

**Option B**، به این دلایلِ اندازه‌گیری‌شده: ۱) کلیدِ `anon` تست همین حالا داخل یک image
production است، و baking این را ساختاری می‌کند نه تصادفی؛ ۲) `192.168.170.10` صفر بار در
bundle ظاهر شد، یعنی خطا **غیرقابل‌تشخیص** بود تا لحظهٔ استفادهٔ کاربر؛ ۳) SSR از قبل
runtime است، پس نیمی از کار موجود است؛ ۴) Option A همان کلاسِ خطا را فقط یک مرحله
عقب‌تر می‌برد؛ ۵) ولی تصمیم مالک است — و اگر Option A انتخاب شود، probe بخش ۷ **الزامی**
است، چون تنها چیزی است که خطا را پیش از کاربر می‌گیرد.

---

## ۷. Phase 6 — probe دائمی

روی **آرتیفکتِ سرو‌شده** اندازه‌گیری می‌شود، نه روی فایل env — چون امروز فایل env
درست بود و آرتیفکت غلط.

```powershell
$expected = "http://192.168.170.10:8000"   # origin مقصد
$img      = "afrakala-app:<sha>"
$out = docker run --rm --entrypoint sh $img -c @"
ok=`$(grep -roF '$expected' /app/.output/public /app/.output/server 2>/dev/null | wc -l)
bad=`$(grep -rhoE 'http://192\.168\.170\.[0-9]+:[0-9]+' /app/.output/public /app/.output/server 2>/dev/null | grep -vF '$expected' | sort -u | tr '\n' ',')
echo "ok=`$ok bad=[`$bad]"
"@
```

**شرط قبولی:** `ok >= 1` **و** `bad=[]` خالی.

روی image امروز نتیجه `ok=0` می‌شد و **block قبل از استقرار می‌ایستاد**
(`measured`: شمارش `192.168.170.10` در هر دو bundle برابر صفر است).

دو نکته: مقادیرِ `:11434` (Ollama) و `:8002` اگر مجازند باید در allowlist صریح بیایند،
وگرنه probe درست قرمز می‌دهد. و probe باید روی همان tarballی اجرا شود که منتقل می‌شود،
نه روی image محلی — وگرنه `[D-4]` آن را دور می‌زند.

---

## ۸. آنچه نتوانستم تعیین کنم

۱. **مقایسهٔ آرتیفکتیِ image قدیمی `8b04c479e022`.** روی این ماشین وجود ندارد
   (`measured`: `No such image`؛ صفر tarball؛ صفر dangling منطبق). تنها نسخه‌اش روی
   `.10` است که دامنهٔ ممنوع است. بنابراین ستون‌های Phase 2 برای image قدیمی **خالی**اند و
   ادعای ground truth دربارهٔ «`192.168.170.10:8000` در SSR قدیمی» **تأیید نشد و رد هم نشد**.
۲. **مکانیزمِ ادعاییِ `window.__` در client قدیمی.** در source هیچ ردی ندارد
   (`COUNT=0`) و `client.ts` در دو commit یکسان است. یا ground truth دقیق نیست، یا
   مکانیزم بیرون از `src/` بوده. **بدون image قدیمی قابل تعیین نیست.**
۳. **برابری کلید `anon` تست با production.** نیازمند خواندن از `.10` است. انجام نشد.
۴. **ناسازگاری ref‌ها با ground truth.** ground truth می‌گوید `main = staging = 9bc8d554`؛
   اندازه‌گیری: `main = 3bc526c4`، `staging = d60232f5`، `origin/staging` هنوز `3bc526c4`
   با `3bc526c4..9bc8d554` در انتظار fetch. دلیلِ این فاصله تعیین نشد.
۵. **مسیرِ `release/` در بریف** (`release/build.ps1` و…) در درختِ کاریِ فعلی وجود ندارد؛
   همه از `git show 3bc526c4:<path>` خوانده شدند. اینکه چرا checkout عقب است تعیین نشد.
۶. **آیا `192.168.170.8:8002` و `:11434` عمدی‌اند** (سرویس‌های جانبی) یا آن‌ها هم نشتِ
   محیطِ سازنده‌اند — بررسی نشد، بیرون از دامنه.
۷. **هیچ شاهدی از نوشتنِ stack تست روی دیتابیس production پیدا نشد** — ولی جست‌وجوی فعالِ
   آن هم انجام نشد، چون نیازمند لمسِ `.10` بود. این یعنی «ندیدم»، نه «نبود».

### نشتی که خودم مرتکب شدم — ثبت صریح

هنگام خواندن `vite.config.ts` با `sed -n '1,70p'`، خط ۲۰ که یک کلید `anon` هاردکدشده است
در لاگ این session چاپ شد. این نقض قاعدهٔ امنیتیِ مأموریت بود. از آن لحظه به بعد هر
دسترسی به کلید فقط با hash و با redaction انجام شد و در این سند هیچ مقدار کلیدی نیست.
کلیدِ افشاشده **همان fallback ابری** (`sha256` پیشوند `599f`) است، نه کلیدِ تست و نه
production — ولی همچنان باید **چرخانده شود**، و چون در source هاردکد است، چرخاندنش
نیازمند تغییر کد است. این خودش بخشی از نقص `N1` است.

---

## حکم

**PARTIAL.**

Phaseهای ۰، ۱، ۳، ۴، ۵ و ۶ خروجیِ لازم را در سطحِ شاهدِ خواسته‌شده تولید کردند.
Phase 2 **ناقص** است: نیمهٔ مربوط به image `8b04c479e022` اندازه‌گیری نشد چون آن image
روی این ماشین نیست و تنها نسخه‌اش در دامنهٔ ممنوع قرار دارد.
