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

## ۸. تأیید نشده

۱. **هیچ‌چیز روی `192.168.170.10` آزموده نشد.** درست‌شدنِ production از این استدلال می‌آید
   که `.env.lan` آن میزبان از قبل `VITE_APP_ENV=production` و
   `VITE_TRUSTED_HOSTS=192.168.170.10,localhost` را دارد و compose حالا آن‌ها را در زمان
   اجرا پاس می‌دهد. **این اندازه‌گیری نشده**، چون آن میزبان خارج از دامنه است.
۲. **image قدیمیِ `8b04c479e022` مقایسه نشد** — روی این باکس نیست.
۳. **رفتار مرورگر واقعی آزموده نشد.** همهٔ اثبات‌ها روی markup سرو‌شده و محتوای bundle است.
   اینکه React پس از hydration همان مقدار را نگه می‌دارد، از یکی‌بودنِ منبع استنتاج شده
   (`getRuntimeConfig()` در هر دو سمت) — نه از یک مرورگر.
۴. **`docker compose build` اجرا نشد.** همهٔ buildها با `docker build` و تگِ اختصاصی انجام
   شد تا تگِ `:lan` که stack در حال اجرا به آن ارجاع دارد جابه‌جا نشود. پس مسیرِ واقعیِ
   `deploy/lan/build.ps1` با تغییرات جدید **end-to-end اجرا نشده**.
۵. **`apply-release.ps1` اجرا نشد** — اجرای واقعیِ runbook استقرار است.
۶. **D8 اصلاح نشد** (بالا).
۷. **چرخاندنِ کلید anonِ حذف‌شده انجام نشد** و تصمیم مالک است. کلید هنوز در تاریخچهٔ گیت است.
۸. **`VITE_SUPABASE_PROJECT_ID` هنوز build-time است.** وابسته به میزبان قضاوت نشد
   (برچسب MCP، و MCP در build غیرفعال است)، ولی این یک قضاوت است نه اندازه‌گیری.
۹. **پایداریِ allowlistِ probe** بررسی نشد: اگر کسی متن راهنمای Ollama را عوض کند،
   D6(i) قرمز می‌شود و allowlist باید به‌روز شود. این یک هزینهٔ نگهداری است که پذیرفته شد.

---

## حکم

**PARTIAL.**

همهٔ بندهای D1..D7 و N1/N2 اصلاح شدند و probeِ D6 در ۷.۴ **در حال شکست‌خوردن روی خودِ
image حادثه دیده شد** — که شرطِ نوشتنِ PASSED بود. ولی بندهای ۱، ۳ و ۴ بخش «تأیید نشده»
اندازه‌گیری نشده‌اند: هیچ‌چیز روی میزبان مقصد آزموده نشد، رفتار مرورگر آزموده نشد، و مسیر
واقعیِ `deploy/lan/build.ps1` end-to-end اجرا نشد. تا وقتی آن سه انجام نشوند، «کار می‌کند»
برای production یک استنتاج است، نه یک اندازه‌گیری.
