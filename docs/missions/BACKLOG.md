# BACKLOG — کارهای باز AfraKala · ۲۲ شهریور ۱۴۰۵ (2026-09-13)

**این فایل جای «یادم می‌ماند» است.** هر موردش حداقل یک بار خواسته یا پیدا شده و بعد گم شده. هیچ‌چیز از اینجا حذف نمی‌شود — فقط تیک می‌خورد یا با شاهد رد می‌شود.

> ⚠️ **قاعدهٔ مصرف این فایل:** بندهای بخش ۲ تا ۵ از ۱۲ و ۱۳ شهریورند و **تأیید نشده‌اند که هنوز باز باشند**. در مأموریت convergence نصف فهرست نقص‌های frontend یا از قبل رفع شده بود یا هرگز وجود نداشت (F-1..F-4، F-10). پس هیچ‌کدام از این‌ها بدون اندازه‌گیری تازه اجرا نمی‌شود. پرامپت اندازه‌گیری در بخش ۸ است و **اولین کاری است که بعد از انتقال اجرا می‌شود.**

**وضعیت:** `staging = main = ad0138df` + شاخهٔ `feature/conv-integration` در دروازه · production `d60232f5`، لجر ۶۸۱
**منابع:** چت‌های «ثبت سند ۴» و «ثبت سند ۵» · `STATE.md` و `RESUME.md` مأموریت convergence · گزارش‌های `docs/research/convergence/`

---

## ۱ · در جریان — مأموریت convergence

| # | چه | کی | وضعیت |
|---|---|---|---|
| 1.1 | حکم `dev-devils-advocate` روی دروازه | agent | در حال اجرا |
| 1.2 | **مهاجرت ۵۳۹** — هفت شیء SECURITY DEFINER از ۵۲۶/۵۳۵ که REVOKE خودشان را ندارند (قاعدهٔ ۵۰۷). هر دو بازبین مستقل پیدایش کردند | agent تازه | 🔴 **گیت release** |
| 1.3 | **گارد `CREATE EXTENSION http` در ۵۳۳ خط ۱۲۹** — بیرون از هر گارد؛ نیمهٔ `pg_cron` گارد دارد، نیمهٔ `http` ندارد. روی production و `afrakala` نیست، روی gate هست | agent تازه | 🔴 **گیت release** · نیاز به خط `OWNER DECISION` در بلوک |
| 1.4 | رفع یک‌خطی F-1 — `get-public-sale-list.ts:50` بعد از ۵۳۸ بی‌صدا `42501` می‌گیرد | agent تازه | 🟡 نهفته — **هیچ لیست فروشی منتشر نشود تا این برود** (۱۹ لیست، همه draft) |
| 1.5 | ادغام → `staging` → `main` → tag `release/2026-09-13` | ارکستراتور | |
| 1.6 | **push شاخهٔ `feature/conv-orchestrator-state` به `staging`** | ارکستراتور | ✅ **DONE — با ancestry اثبات شد، نه با نام فایل.** `feature/conv-orchestrator-state` داخل `feature/conv-integration` subsume شده است؛ در `wt-conv-int` **۱۶ فایل tracked، صفر untracked**. هشت کپی سرگردان در `D:\AfraKalaTest\app` نسخه‌های کهنهٔ پیش از compaction روی `staging @ d60232f5` هستند — نویز، و بعد از merge پاک می‌شوند |
| 1.7 | **E-4** — خط انتقال، ۹ قدم کوتاه (`-RestoreOnly` و `-From`/`-To` باید ساخته شوند؛ نبودشان علت دو بار گیر کردن بود) | agent | |
| 1.8 | `RELEASE-20260913.md` + انتقال به production | **مالک** | |

---

## ۲ · 🔴 پل آسان — نیمه‌کاره و بی‌صاحب

بزرگ‌ترین خوشهٔ فراموش‌شده. هدف کل پروژه جایگزینی آسان است (D-25) و این‌ها آخرین سیم‌های وصل‌نشده‌اند.

| # | چه | جزئیات | منبع |
|---|---|---|---|
| 2.1 | **ستون `Bank_cod` خالی می‌رود** | خروجی بانکی آسان باید بگوید پول به کدام حساب شرکت نشست. هیچ ستونی این مقدار را ندارد — نه روی `bank_accounts`، نه `person_identifiers` (عمداً رد شد: حساب شرکت شخص نیست)، نه `payment_receipts`. **۲۰ حساب بانکی + صندوق کد ۹۸۶** باید کد بگیرند. ابهام باز: کد ۸ که قبلاً گفتی، یکی از آن ۲۰تاست یا کد کلی بانک؟ | ثبت سند ۴ |
| 2.2 | **PR #383 فقط spec داشت** | شاخهٔ `hotfix/asan-bank-export-headers` ساخته شد ولی PR **رفع واقعی هدر را نداشت** — فقط یک فایل spec | ثبت سند ۴ |
| 2.3 | **قالب خالی خرید/فروش آسان گرفته نشده** | ممیزی layout از ۱۳ شهریور blocked است. layout واقعی **۱۸ ستون A..R** است نه ۱۷؛ ستون R («تلفن/کد۳») در عکس مالک نبود. مقصد: `docs/asan/templates/` — نیاز به force-add چون `.gitignore:122-125` فایل xlsx را می‌بندد | ثبت سند ۵ |
| 2.4 | **خروجی اکسل پیش‌فاکتور وجود ندارد** | کل سیستم دو خروجی اکسل دارد: فیش‌های پرداخت و لیست قیمت فروش. پیش‌فاکتور هیچ‌کدام | ثبت سند ۴ |
| 2.5 | **خروجی اکسل `/documents`** | **سه بار خواسته شده، ساخته نشده.** ده ستونش تعیین شد (شماره، تاریخ شمسی، نوع، کانال، طرف حساب + کد آسان، مبلغ، حساب/صندوق، پیگیری، شرح، وضعیت). عمداً بدون جزئیات دفتر — هدف مرور روزانهٔ حانیه است نه حسابرسی | ثبت سند ۲ و ۴ |
| 2.6 | **D-8: یک‌سند‌در‌فایل** | محدودیت فقط یک خط frontend است (`_app.admin.asan-export.tsx:221-227`)؛ دیتابیس هیچ سقفی ندارد. **ریسک تأییدنشده:** آیا آسان چند سند در یک شیت را ادغام می‌کند؟ کدبیس در پنج جا ادغام را فرض کرده و **هر پنج نثر خودمان است، نه اندازه‌گیری**. فقط ایمپورت یک فایل دوسندی در آسان جواب می‌دهد | ثبت سند ۵ |

---

## ۳ · 🟡 دادهٔ production که هرگز وارد نشد

هیچ‌کدام کار فنی نیست — همه ورود داده یا تصمیم است.

| # | چه | جزئیات |
|---|---|---|
| 3.1 | `settlement_types` **صفر ردیف** روی production | سه نوع فعال روی تست: پیش واریز (۰ روز) · نقدی ۱ روزه · تسویه ۵ روزه. گزارش مطالبات از آن می‌خواند |
| 3.2 | **کد آسان از UI قابل ورود نیست** | ۲ مشتری بدون کد؛ فرم کاربر این فیلد را ندارد. راه فعلی: `/admin/persons-cleanup` |
| 3.3 | `gamification_kpis.deals_registered.label_fa = «??????»` | بازماندهٔ حادثهٔ ۱۱ تیر ۱۴۰۵. متن درست فارسی را مالک باید بدهد |
| 3.4 | دو profile با شمارهٔ منطبق و نام متفاوت | «ستایسا سعادت مبارکی» ⇒ «12» · «حانیه ماهرو» ⇒ «محمدزین‌الدین». تأیید مالک لازم |
| 3.5 | migration نقش `viewer` | تصمیمش گرفته شد (نام و آمار آری؛ تلفن، کد ملی، شبا نه) — **اجرا نشد** |
| 3.6 | **۵۰ مشتری و ۲۰ تأمین‌کنندهٔ واقعی** | کار حسابدار. تا نیاید، «۳۱۷ خرید پرداخت‌نشده» و مانند آن دادهٔ تستی‌اند (D-23) |

---

## ۴ · 🟡 دو مورد کوچک با علت معلوم

| # | چه | درمان |
|---|---|---|
| 4.1 | ۵۰۳ روی `is_user_online` و `profiles?status=pending` | علت: `pgrst.db_pool = 0`. یک restart PostgREST |
| 4.2 | فایل‌های سرگردان untracked روی تست | `test-schema-20260831.sql` · `test-objects.txt` · `pw.session.config.ts` |

---

## ۵ · ❓ دو تحقیق که پرامپتشان داده شد و هرگز اجرا نشد

| # | چه |
|---|---|
| 5.1 | **«پیش‌فاکتور اصحابی وصل نیست»** — پرامپتش نوشته شد، به هیچ agent داده نشد |
| 5.2 | **راه رفتن ویزارد با شخص تأمین‌کننده** — D-1 و D-3 merge و deploy شدند ولی **صفر شواهد مرورگری** دارند |

---

## ۶ · کارهای مالک — بعد از انتقال

| # | چه | مسدود به |
|---|---|---|
| 6.1 | نگاشت داخلی → کارمند (۴۰۱–۴۱۳، ۴۴۵–۴۵۰؛ **نه** ۶۰۰۱/۶۰۰۲/۶۰۰۳ که صف‌اند؛ ۲۰۱/۴۰۶/۴۴۹/۴۵۰ اصلاً ردیف ندارند) | `call_logs` صفر ردیف است چون توکن هرگز به کانتینر نرسید — با بند ۱.۸ باز می‌شود |
| 6.2 | `GRANT` فقط‌خواندنی MySQL برای `192.168.170.10` روی PBX | مالک |
| 6.3 | تست OCR با فیش واقعی در `/accounting/receipts/create` | بعد از رسیدن کلیدهای `OLLAMA_*` |
| 6.4 | تصمیم OG-A پای کیبورد، با جدول سه مشتری جلوی چشم | بلوک release |
| 6.5 | **پاک کردن پنج کپی اسرار و payloadهای رمز متن‌ساده** در `C:\AfraKalaServer\get-git-going01lan` | فقط مالک — هیچ agent حق خواندن، کپی یا چاپشان را ندارد |
| 6.6 | Docker Desktop روی `.10` بدون نشست تعاملی بالا بیاید | تصمیم ops |
| 6.7 | چرخش `JWT_SECRET` (مشترک تست/production) و کاهش ۲۳ ادمین از ۳۷ | پنجرهٔ عملیاتی جدا |
| 6.8 | **`cleanupPeriodDays: 365`** در `C:\Users\AFRA\.claude\settings.json` | classifier ویرایشش را رد کرد؛ الان ۳۰ روز است و transcriptهای قدیمی‌تر حذف می‌شوند |

---

## ۷ · مأموریت‌های جدا — تصمیم لازم، نه کار

| # | چه | تصمیمی که می‌خواهد |
|---|---|---|
| 7.1 | **امنیت ۳** | ۷۵ مسیر SSR fail-open · ۳۵ policy با `qual = true` روی ۳۴ جدول (فقط ۹ تا RESTRICTIVE partner دارند) · **`role_permissions` شامل `can_view_sensitive` برای هر کاربر لاگین‌کرده خواندنی است** · ۲۳ فایل `.ts` در routes · drift بین ۶۸ gate دستی و `role_permissions` زنده. **و یافتهٔ موج B:** `sales` با تایپ `/admin/automation` کل صفحه را می‌بیند در حالی که `/admin/call-extensions` منع می‌کند — چک نقش per-page بدون اعمال مشترک. **و اندازه‌گیری زندهٔ موج C روی `/admin` به‌طور مشخص:** ۳۰ مسیر، **۱۹ enforced**، **۹ مسیر برای نشست سرد `sales` کامل render می‌شوند** (`automation` · `purchase` · `sales-reminders` · `validation-rules` · `visitors` · `workflow-settings` · `marketing-channels` · `marketing-task-templates` · `workflow-stages`)، و ۲ مسیر gamification ارزیابی نشدند. **علت ریشه‌ای یک خط است:** `src/lib/rbac/route-guards.ts:185` وقتی auth قابل resolve نیست به‌جای منع، `{ user: null, roles: [] }` برمی‌گرداند — fail-open؛ و در ورود سرد به URL، SSR تنها pass‌ی است که `beforeLoad` را اجرا می‌کند در حالی که نشست Supabase در storage مرورگر است. **احتیاط، از خود همان اندازه‌گیری:** یک `throw` سادهٔ آن خط، در pass‌ی SSR **هر** مسیر را منع می‌کند — که باگ دیگری است. شکل درست احتمالاً «واگذاری به گیت سمت کلاینت» است، نه throw. سه مکانیزم محافظت وجود دارد و فقط دو تا کار می‌کنند: `staticData.gate` (کار می‌کند) · `<Navigate>`+`useAuth` (کار می‌کند) · `beforeLoad` (**کار نمی‌کند**) |
| 7.2 | **۸۹ هویت مهمان / ۲۴٫۴ میلیارد ریال** | در صفحهٔ مطالبات «معوق» دیده می‌شوند، از هر دو حسگر اعتبار ساختاراً نامرئی‌اند. **آیا اصلاً پیش‌فاکتور مهمان مجاز است؟** |
| 7.3 | **auto-resume** | ساخته و اثبات شده (S6 20/20، ده شرط رد پاک)، ولی `promote.py` ردش کرد با regression در دو agent که تغییر اصلاً لمسشان نکرده. **یک تصمیم است، نه یک ساخت** — و امشب چهار agent را از دست داد |
| 7.4 | **فهرست ۳۵ تابع یتیم · ۱۴ صفحهٔ بدون لینک · ۱۵ جدول بدون نویسنده** | خوشهٔ «اتوماسیون» (۷ جدول + پوشهٔ `automation/`، هیچ worker) هنوز دست‌نخورده است. زمان‌بندی با E-5 حل شد؛ تخصیص سرمایه در ۴۴۷ بازنشسته شد |
| 7.5 | **سوئیپ ارقام لاتین** | ~۴۵ نقطه، ۱۴ تا از یک خط (`src/lib/pricing/engine.ts:59` ارزان‌ترین برد). پیش‌موجود، خارج از دامنهٔ convergence |
| 7.6 | **ماژول‌های دست‌نخوردهٔ ماه‌ها** | پیام‌رسان (Whisper + Ollama) · آکادمی · دانش‌نامه + RAG · حال روزانه · بازخورد · Bot API (۹ مسیر عمومی) · جداول داده · کارت قرمز (**ثابت شد روی امتیاز کارمند اثر ندارد**) · دیدار CRM فاز B/C · SMS · تابلو قیمت عمومی · ربات تلگرام هشدار قیمت |
| 7.7 | **`market_rate_ticks` خالی، Navasan از خرداد offline** | کل ماژول قیمت‌گذاری روی نرخ ارزی کار می‌کند که به‌روز نمی‌شود |

---

## ۸ · پرامپت اندازه‌گیری — **اولین کار بعد از انتقال**

فهرست بالا حدس است تا وقتی اندازه‌گیری نشود. این را به `dev-orchestrator` روی تست بده:

```
BACKLOG VERIFICATION — read-only, zero writes, zero git operations.

Take docs/missions/BACKLOG.md sections 2, 3, 4 and 5 — 17 items in total, all
recorded between 12 and 13 Shahrivar. For EACH item return one of three
verdicts, with the command and its output as evidence:

  STILL OPEN   — reproduced today, on the current tree or the current database
  ALREADY DONE — name the commit or migration that closed it, and quote the line
  NEVER REAL   — the claim did not hold when measured; say what the truth is

Rules that make this worth running:
- Measure, never reason. "The code looks like it handles that" is not a verdict.
- Database items go against a fresh restore of the newest production dump, with
  the dump name, its md5 and the ledger top printed before any query.
- Code items are re-grepped at today's HEAD, never taken from this file's
  line numbers — they are three days old and the tree has moved.
- An item you cannot settle is UNKNOWN with the reason, never a guess. UNKNOWN
  is a real verdict here.
- Split the work across agents by section: 2 (Asan bridge) · 3 (production data)
  · 4+5 (small items and the two unrun researches). One agent per section, each
  in its own worktree, each writing its own report, none running git.

Why this matters more than it looks: in the convergence mission FIVE of NINE
recorded frontend defects turned out to be already fixed or never real. A
backlog that is trusted rather than measured sends agents to rebuild what
exists — which is this project's oldest failure mode, not a new one.

Write docs/missions/BACKLOG-VERIFIED-<date>.md: one table, 17 rows,
columns = id | item | verdict | evidence | who owns the next step.
Then rewrite BACKLOG.md sections 2–5 to hold only the STILL OPEN and UNKNOWN
rows, moving the rest to a "closed, with evidence" section at the end.
Do not commit; print the table when done.
```

---

## ۹ · قوانینی که این پروژه گران خریده — هرگز دوباره یاد نگیر

1. **`Up (healthy)` شاهدِ در دسترس بودن اپ نیست.** healthcheck مسیری را می‌زند که PostgREST هم جواب می‌دهد؛ چهار روز `:3100` سالم به نظر رسید در حالی که PostgREST سرو می‌کرد. چک deploy باید `text/html` و **نبودِ** هدر `Server:` را assert کند، نه فقط ۲۰۰. درمان: `docker restart <container>` — نه ریستارت Docker Desktop، که دو بار اصلاً اجرا نشد.
2. **دفتر مهاجرت در هر دو جهت دروغ می‌گوید.** «چه مانده» از **کاتالوگ** خوانده می‌شود، نه از لجر. همین ۴۷۷ را شکست و ۵۲۶ برای ترمیمش نوشته شد.
3. **مهاجرت باید روی shape غلط no-op کند، نه abort.** الگوی مرجع: ۵۳۱ بعد از سخت‌سازی E-2.
4. **checkpoint = commit محلی بعد از هر قدم اثبات‌شده؛ push فقط پایان فاز.** agent متوقف‌شده resume نمی‌شود؛ agent تمام‌شده می‌شود.
5. **تزریق دستور وسط اجرا ممنوع.** بریف فقط در لحظهٔ launch معتبر است — بدون استثنا، از جمله از ارکستراتور.
6. **یک ارجاع، شاهدِ وجودِ فایلِ ارجاع‌شده نیست.** دو بار گرفته شد.
7. **کسی که چیزی را ساخته نمی‌تواند دروازه‌بانش باشد.** چهار بار امشب پیش آمد و هر چهار به بازبین مستقل رفت.
8. **آنچه تقسیم می‌شود باید همان چیزی باشد که تصادم می‌کند.** پنج بار: worktree/دیتابیس · شماره/timestamp · شماره/نام شاخه · کاتالوگ تست/production · و امشب: پارتیشن درست بود، ولی **بقای context خود agent** تقسیم نشده بود.
