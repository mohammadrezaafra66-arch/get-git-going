# سه شکاف — گزارش ادغام‌شده

**تاریخ:** ۲۰۲۶-۰۹-۰۵ · **نوع:** پژوهش read-only · **وضعیت:** `COMPLETE`

سه پژوهش مستقل، هم‌زمان، روی سه پرسش بی‌ارتباط. هیچ‌چیز نوشته نشد جز چهار فایل یافته.
هیچ migration، هیچ تغییر کد، هیچ نصب، هیچ restart، هیچ تغییر داده، هیچ تغییر وضعیت git.

| عامل | پرسش | فایل تفصیلی | وضعیت |
|---|---|---|---|
| A | شکاف تلفن — چه چیزی `call_logs` را پر می‌کند؟ | `docs/research/phone-gap-20260905.md` | `COMPLETE` |
| B | شکاف OCR — چه هست، چه نیست، کجا اجرا می‌شود؟ | `docs/research/ocr-gap-20260905.md` | `COMPLETE` |
| C | توابع باز به `authenticated` | `docs/research/authenticated-open-functions-20260905.md` | `COMPLETE` |

برچسب‌ها: **[E]** اندازه‌گیری‌شده اینجا · **[P]** prior art با ارجاع · **[U]** گفتهٔ مالک · **[?]** نامعلوم
**[V]** = ارکستریتور مستقلاً بازاجرا کرد.

---

## Preflight / Postflight — درخت مشترک

هر دو بار، عیناً:

```
git rev-parse HEAD    → f1512219d15d43c82df76cb06edfed9171e5ac68
git branch --show-current → staging
git worktree list     → 18 worktree (main + 17)
secdef count public   → 416
```

**Preflight** `git status --porcelain`:
```
?? docs/missions/
?? docs/research/scoring-engine-zero-parameters-20260905.md
```

**Postflight** `git status --porcelain`:
```
?? docs/missions/
?? docs/research/authenticated-open-functions-20260905.md
?? docs/research/ocr-gap-20260905.md
?? docs/research/phone-gap-20260905.md
?? docs/research/scoring-engine-zero-parameters-20260905.md
```

تفاوت **دقیقاً و فقط** سه فایل یافتهٔ همین مأموریت است. SHA، شاخه، تعداد worktree و
شمارش secdef تغییر نکرد. موج build (migrationهای ۴۵۴–۴۶۰) در worktreeهای جداگانه کار می‌کرد و
با این مأموریت برخوردی نداشت.

> **نکتهٔ صداقت:** عامل A و عامل C هر دو گزارش کردند فایل‌های ناشناسِ `ocr-gap-*` و `phone-gap-*`
> وسط اجرایشان ظاهر شد. آن‌ها فایل‌های همدیگر بودند. هیچ‌کدام آن‌ها را باز یا حذف نکرد.
> این drift توضیح داده شد، نه پنهان.

---

## راستی‌آزمایی مستقل ارکستریتور

ارکستریتور شمارش هیچ عاملی را نپذیرفت. برای هر عامل دست‌کم یک کوئری بازاجرا شد.

### عامل A — همه تأیید شد

| ادعا | عامل A | بازاجرای مستقل | نتیجه |
|---|---|---|---|
| ردیف‌های `call_logs` | ۰ | `0` | ✅ |
| آیا `compute_employee_score` از `call_logs` می‌خواند؟ | نه، فقط کامنت | `call_logs` **تنها در خط ۷۵ و داخل کامنت**؛ هر ۸ `FROM` واقعی `staff_daily_performance_metrics` | ✅ |
| `pg_cron` | نصب نیست | `NOT-INSTALLED` | ✅ |
| `proacl` تابع `recompute_all_employee_scores` | `{supabase_admin, service_role, postgres}` | عیناً همان — نه `authenticated`، نه `anon` | ✅ |
| کلیدواژه‌های سیستم تلفن | ۰ واقعی | ۰ فایل برای هر ۱۲ کلیدواژه | ✅ |
| واژگان فارسی تلفن | ۰ | `مرکز تماس` / `سانترال` / `ویپ` → بدون تطابق | ✅ |
| ارجاع `call_logs` در کد برنامه | ۱ (types تولیدشده) | فقط `src/integrations/supabase/types.ts:1045` | ✅ |

دستور بازاجراشده برای کلیدواژه‌ها:
```bash
for w in voip asterisk freepbx issabel twilio softphone dialer 3cx yeastar elastix vicidial "sip:"; do
  git grep -I -i -l -F -- "$w" HEAD -- src server automation scripts supabase docs deploy e2e openapi | wc -l
done
# همه: 0
```

### عامل B — همه تأیید شد

| ادعا | عامل B | بازاجرای مستقل | نتیجه |
|---|---|---|---|
| `to_regclass('public.ocr_receipts')` | `NULL` | `NULL` | ✅ |
| مسیرهای با `provider_id` غیر NULL | ۰ از ۸ | ۰ از ۸ — همه `provider=(NULL)` | ✅ |
| ارائه‌دهندگان vision به ترتیب اولویت | OpenAI اولویت ۱، ollama اولویت ۱۰ | `for ocr\|openai_compatible\|https://api.openai.com/v1\|prio=1` سپس `ollama\|prio=10` | ✅ |
| خط علّی `client.server.ts:110` | pin قبل از خواندن fallback دور زده می‌شود | `if (!route.provider_id) return providers;` در خط ۱۱۰؛ `fallback_enabled` تازه در ۱۱۳–۱۱۴ خوانده می‌شود | ✅ |
| `getUserMedia` فقط صوتی | ۵ خط / ۲ فایل | ۴ خط / ۲ فایل با الگوی باریک‌تر؛ **هر دو فراخوان واقعی `{ audio: true }`** | ✅ ماهیت تأیید شد، اختلاف جزئی شمارش از regex پهن‌تر |

### عامل C — عدد و سه بدنهٔ تصادفی، همه تأیید شد

کوئری کلاس عیناً بازاجرا شد:
```
class_total|also_anon|auth_only|acl_null
63|15|48|0
```
**بازتولید دقیق.** ۶۳ = ۶۳، ۱۵ = ۱۵، ۴۸ = ۴۸، `proacl IS NULL` = ۰.

سه تابع به‌صورت تصادفی انتخاب شدند (`ORDER BY md5(proname||'orch-seed-20260905') LIMIT 3`)
و بدنه‌هایشان مستقلاً خوانده و با ردیف جدول عامل C مقایسه شد:

| تابع | آنچه ارکستریتور در بدنه دید | ردیف جدول عامل C | نتیجه |
|---|---|---|---|
| `check_and_update_mission_progress_for_employee` | `SECURITY DEFINER`؛ `INSERT employee_mission_progress` (۷۷)، `UPDATE` (۹۰، ۱۰۶)، `INSERT employee_score_events` (۱۰۹)، `INSERT audit_logs` (۱۲۵)؛ بدون `has_role`؛ `authenticated=X` | «`INSERT/UPDATE employee_mission_progress` + `employee_score_events` + `audit_logs`» | ✅ مطابق |
| `next_sales_quote_number` | `SECURITY DEFINER`؛ `INSERT sales_quote_counters` (۱۰)؛ بدون `has_role`؛ `authenticated=X` | «`INSERT sales_quote_counters` + `UPDATE … SET`» | ✅ مطابق |
| `expire_stale_credit_holds` | `SECURITY DEFINER`؛ دو `RAISE EXCEPTION` که **هر دو اعتبارسنجی آرگومان‌اند**؛ `INSERT audit_logs` (۳۵)؛ بدون `has_role`؛ `authenticated=X` | «`INSERT audit_logs` + delegated `release_credit`» | ✅ مطابق — و شاهد زندهٔ نکتهٔ روشیِ ۲ |

`expire_stale_credit_holds` تصادفاً بهترین شاهد ادعای روشی عامل C شد: `RAISE EXCEPTION`های آن
پیام‌های اعتبارسنجی‌اند («بازهٔ انقضای رزرو باید حداقل یک روز باشد»)، نه مجوز. فیلتر `RAISE` که در
og61 هست، **دقیقاً همین تابعِ ردهٔ پول را پنهان می‌کرد.** فهرست برنگشت.

---

## خلاصهٔ متقاطع — سه شکاف در یک نگاه

هر سه پرسش یک الگوی واحد را نشان دادند، ولی الگو آن چیزی نبود که بریف فرض کرده بود.
**در هر سه مورد، وضعیت واقعی از آنچه prior art ثبت کرده بود متفاوت است — و در دو مورد از سه مورد،
شکاف جای دیگری است.**

| | بریف فرض می‌کرد | آنچه اندازه‌گیری شد |
|---|---|---|
| **A** | scoring از `call_logs` می‌خواند و خالی می‌یابد | scoring **اصلاً از آن نمی‌خواند** — پر کردنش امروز هیچ امتیازی را تغییر نمی‌دهد |
| **B** | یک سرویس Python/FastAPI مستقر نشده | **هیچ ردی از Python/FastAPI نیست** — موتور OCR ساخته شده و داخل همین اپ Node کار می‌کند |
| **C** | ۵۸ تابع باز به `authenticated` | **۶۳** بازتولید شد؛ ولی ۲۷ تای آن‌ها گاردِ غیرنقشی دارند — **۳۶** واقعاً بی‌گاردند |

### فوری‌ترین یافته — و در هیچ‌کدام از سه پرسش نبود

**[E][V] مسیر OCR امروز به OpenAI می‌رود، نه به Ollama محلی.**

`receipt_ocr.vision` در `ai_usage_routes` مقدار `provider_id = NULL` دارد و `fallback_enabled = false`.
چون `applyUsageRoute` در `src/lib/ai/client.server.ts:110` با شرط `if (!route.provider_id) return providers;`
زودتر برمی‌گردد، `fallback_enabled` **هرگز خوانده نمی‌شود**. نتیجه: کل فهرست ارائه‌دهندگان vision به
ترتیب اولویت برمی‌گردد و برندهٔ آن این است:

```
PROVIDER|for ocr|openai_compatible|https://api.openai.com/v1|active=true|prio=1|caps=vision
PROVIDER|ollama|ollama|http://192.168.170.8:11434|active=true|prio=10|caps=chat,embeddings,vision
```

یعنی pinِ محلیِ migration 397 عملاً آزاد شده و **تصویر رسیدها از شبکه خارج می‌شود** — دقیقاً همان
نتیجه‌ای که ۳۹۷ برای جلوگیری از آن نوشته شده بود. این یافته از خودِ شکاف OCR مهم‌تر است، چون
شکاف یعنی «کار نمی‌کند» ولی این یعنی «کار می‌کند، اشتباه».

**سؤال باز برای مالک:** آیا ارائه‌دهندهٔ `for ocr` کلید فعال دارد؟ اگر ندارد، خروج داده رخ نمی‌دهد و
این یک نقص پیکربندی است؛ اگر دارد، مسئلهٔ محرمانگی است. ارکستریتور کلید را بررسی نکرد
(خارج از حیطهٔ read-only مورد توافق) — `[?]`.

---

## پرسش A — شکاف تلفن

### Verdict

`call_logs` یک جدول کاملاً ساخته‌شده و کاملاً بلااستفاده است: **[E]** ۱۱ ستون، PK، یک `CHECK` روی
`direction`، ۳ ایندکس، RLS روشن با ۴ policy، و یک trigger امتیازدهی — و **۰ ردیف، ۰ نویسنده،
۰ خوانندهٔ واقعیِ داده**. ولی یافتهٔ بزرگ‌تر این است که **پر کردن آن امروز هیچ امتیازی را عوض نمی‌کند**:
**[E][V]** تابع زندهٔ `compute_employee_score` دیگر `call_logs` را نمی‌خواند — تنها بازماندهٔ آن نام در
بدنه یک **کامنت** است (خط ۷۵: `-- (call_logs has no data and no automatic source exists)`) و هر سه
KPI تماس از `staff_daily_performance_metrics` می‌خوانند. تنها خوانندهٔ زنده،
`recompute_all_employee_scores`، از آن فقط به‌عنوان **منبع id** در یک `UNION` استفاده می‌کند، نه منبع
مقدار — و خودش هم دست‌نیافتنی است: migration 436 امروز EXECUTE را از `authenticated`/`anon` گرفت،
و **`pg_cron` نصب نیست**، پس job هر ۵ دقیقه هرگز ساخته نشد.

**بزرگ‌ترین شکاف در repo است، نه در دیتابیس:** **[E][V]** در تمام فایل‌های git-tracked **هیچ ردی از
هیچ سیستم تلفنی نیست** — نه `voip`، نه `asterisk`، نه `freepbx`، نه `issabel`، نه `twilio`، نه `sip`،
نه `softphone`، نه «مرکز تماس»، نه «سانترال»، نه «ویپ». شکاف، کدِ نوشته‌نشده نیست؛
**مالک هنوز نگفته چه سیستم تلفنی وجود دارد.**

### سه تعریف ناسازگار از «تماس»

یافتهٔ جانبی که قبلاً گزارش نشده بود — «تماس» سه بار و ناسازگار تعریف شده:
1. جدول `call_logs` (به‌ازای هر تماس، ۰ ردیف)
2. ستون‌های جمع روزانه در `staff_daily_performance_metrics` (۱۱ ردیف از ۸ کارمند — **تنها چیزی که کار می‌کند**)
3. قواعد XP فعال `outbound_call`=۵ و `inbound_call`=۳ در `gamification_kpi_rules`، که به‌عنوان فیلتر UI در
   `src/lib/operations/gamification-analytics.ts:3-13` نمایش داده می‌شوند و **هرگز یک بار هم شلیک نکرده‌اند**.

### آنچه هست و می‌شود دوباره استفاده کرد
- `/gamification/admin/manual-metrics` — **صفحهٔ دستیِ کارآمد که همین حالا در استفاده است** (۱۱ ردیف، ۸ کارمند)
- `staff_daily_performance_metrics` — مسیر دادهٔ واقعیِ امتیازدهی
- `call_logs` — schema کامل و آمادهٔ per-call، اگر روزی منبعی پیدا شود

---

## پرسش B — شکاف OCR

### Verdict

OCR **ساخته شده، کار می‌کند، و به صفی که مالک می‌بیند وصل نیست.** پروژه یک خط لولهٔ کامل دارد —
دو تابع سمت سرور، یک prompt سخت‌گیرانه، یک parser ساختاریافته با ۱۹ تست واحد، مسیریابی
ارائه‌دهنده از دیتابیس، و مدل vision محلی `qwen3.6:latest` روی همین host — ولی همهٔ آن روی
`payment_receipt_documents` نشسته است. **[E][V]** `/operations/receipts` (۳۹۱ خط) به جدول کاملاً
دیگری نگاه می‌کند، `ocr_receipts`، که **هیچ migrationی آن را نمی‌سازد** و امروز در دیتابیس وجود
ندارد (`to_regclass` → `NULL`).

**[E]** ادعای «سرویس Python/FastAPI» **راستی‌آزمایی نشد**: تنها منبع آن در کل repo یک رشتهٔ فارسیِ UI
در `_app.operations.receipts.tsx:161-162` است. هیچ Python، هیچ Dockerfile، هیچ compose، هیچ
`requirements.txt`. قطعهٔ گمشده یک **سرویس** نیست؛ یک **جدول و یک مسیر ingest** است.

### شکاف HTTPS — پاسخ قطعی

**[E][V] فقط آپلود. OCR پشت دروازهٔ HTTPS (OG-5) قفل نیست.**
هر پنج برخورد `getUserMedia` مربوط به `{audio: true}` است (ضبط‌کنندهٔ messenger و feedback).
تنها `capture=` در repo صفت HTML در `CameraCaptureButton.tsx:85` است و هیچ‌کدام از ۵ مصرف‌کنندهٔ
آن مسیر OCR نیست. هر دو مصرف‌کنندهٔ OCR از `ReceiptDocumentPicker` استفاده می‌کنند
(`PaymentReceiptDocuments.tsx:561`، یک `type="file"` سادهٔ بدون صفت) با `FileReader.readAsDataURL`
و صفر استفاده از `crypto.*`.

**پیامد:** OCR می‌تواند روی همین استقرار HTTP جلو برود. وابستگی به OG-5 وجود ندارد.

### آنچه هست و می‌شود دوباره استفاده کرد
- دو تابع سرور `receipt-ocr*.functions.ts` — موتور، ساخته و آماده
- `src/lib/accounting/receipt-ocr-structured.test.ts` — ۱۹ تست در ۹ `describe`
- `payment_receipt_documents` — ۱۲ ستون، ۵ policy، مسیر زندهٔ OCR
- `qwen3.6:latest` روی `192.168.170.8:11434` — مدل vision، موجود

---

## پرسش C — توابع باز به `authenticated`

### Verdict

**عدد ۵۸ بازتولید نمی‌شود.** با همان آشکارسازی که ۶۳ هات‌فیکس را تولید کرد (تا رقم آخر بازتولید شد)،
**[E][V] ۶۳** تابع `SECURITY DEFINER` در `public` وجود دارد که می‌نویسند (مستقیم یا با واگذاری)،
هیچ توکن بررسی نقش ندارند، و `EXECUTE` به `authenticated` می‌دهند — پس یک نشست `viewer` یا
`sales` از طریق PostgREST به آن‌ها می‌رسد. **۱۵** تا `anon` هم می‌رسد (همان‌ها که ۴۳۶ خواند و بست)؛
**۴۸** فقط-`authenticated` است.

ولی «بدون `has_role`» مساوی «بدون مجوز» نیست: با خواندن هر ۶۳ بدنه، **۲۷** تا گاردِ غیرنقشی دارند
(عضویت گروه، `WHERE user_id = auth.uid()`، دامنهٔ کلید بات، مالکیت ردیف) و **۳۶** تا هیچ‌چیز جز
اعتبارسنجی آرگومان ندارند.

**بزرگ‌ترین شکاف، پول است.** `hold_credit(p_customer_id, p_amount, p_invoice_id, p_user_id)` و
`release_credit(...)` روی `customer_credit_ledger` و `customer_credit_balance` می‌نویسند، **هر چهار
آرگومان را از فراخوان‌کننده می‌گیرند از جمله `p_user_id`** که همان چیزی است که به‌عنوان عامل در
`audit_logs` می‌نشیند — و هیچ‌کدام هیچ فراخوانی در `src/` یا `server/` ندارند. یک `viewer` می‌تواند
سقف اعتبار هر مشتری را جابه‌جا کند و ردِ حسابرسی را به نام شخص دیگری امضا کند.
`increase_credit` همان شکل wrapperِ تک-`PERFORM` است که هات‌فیکس هشدار داد هر آشکارسازی
از دستش می‌دهد؛ کوئریِ دنبال‌کنندهٔ واگذاری آن را گرفت.

### رده‌بندی

| رده | تعداد | معیار |
|---|---:|---|
| money / credit | ۱۲ | ledger، رسید، سند، مانده‌های اعتباری، تخصیص سرمایه |
| identity / role | ۷ | `user_roles`، `profiles`، `persons`، مجوزها |
| catalogue / price | ۱۷ | محصولات، قیمت‌ها، تأمین‌کنندگان، موجودی |
| housekeeping | ۲۷ | لاگ، snapshot، cache، اعلان |
| **جمع** | **۶۳** | هر ۶۳ ردیف جدول دارد؛ صفر ردیف `UNKNOWN` |

**۲۳ تابع پیشنهاد شده که `authenticated` را کامل از دست بدهند** (۶ تای آن‌ها هیچ فراخوانی در هیچ‌کجا
ندارند — نه `src`، نه DB، نه trigger).

جدول کامل رتبه‌بندی‌شده — تابع · رده · چه می‌نویسد · فراخوانِ مشروع و نقش · گارد پیشنهادی ·
`authenticated` بماند؟ — در `docs/research/authenticated-open-functions-20260905.md` است و
**ورودی مستقیم migration اصلاحی بعدی است.**

### سه تلهٔ نام‌برده — هر سه راستی‌آزمایی شد

1. **[E] `has_dynamic_permission` باز شکست می‌خورد.** وقتی هیچ ردیف `role_permissions` برای یک ماژول
   نیست، `_exists` نادرست می‌شود و به «ماتریس ایستای legacy» می‌افتد:
   برای `view` → `RETURN public.has_any_role(_user_id, ARRAY['admin','manager','accountant','sales','viewer']::text[])`
   — **هر پنج نقش**. افزودن یک ماژول بدون قواعد مجوز، آن را باز می‌کند نه بسته.
2. **[E] `user_roles.role` از نوع TEXT است** (`information_schema`)، و هر دو helper هم روی `app_role` و
   هم روی `text` overload شده‌اند — یک آرایهٔ بدون cast مبهم است. هر گارد پیشنهادی `::text[]` دارد.
3. **[E] بازسازی، grantها را برمی‌گرداند — و اینجا اندازه‌گیری شد چه چیزی برمی‌گردد.**
   `pg_default_acl` زندهٔ `supabase_admin` در `public` برابر است با `{postgres=X, authenticated=X, service_role=X}`
   به‌علاوهٔ یک ردیف GLOBAL که `acldefault()` را بی‌اثر می‌کند. پس ۳۹۳ نیمهٔ anon/PUBLIC را بست، ولی
   **`authenticated=X` هنوز برمی‌گردد** روی هر DROP+CREATE یا replaceی که امضا را عوض کند.
   **هر پیشنهاد گارد باید `REVOKE` را بعد از هر `CREATE OR REPLACE` تکرار کند.**

### آشکارساز og61 — گزینه‌ها، بدون نوشتن spec

فایل spec خوانده شد، اجرا نشد. هزینهٔ واقعی گسترش نه ۵۸ است نه یک عدد:
- با شکل خودِ spec (فیلتر `RAISE` دارد)، `'anon'`→`'authenticated'`: **۳۲ نام، ۲۸ خارج از allowlist**
- بدون فیلتر `RAISE` (تا ردهٔ پول دیده شود): **۶۳ نام، ۵۹ خارج از allowlist**

فرم ۲۸ ارزان‌تر است ولی **دقیقاً نسبت به ۹ تابع پولی کور است.** سه گزینه توصیف شد
(allowlist دوم دسته‌بندی‌شده / rollout پلکانی با `test.fixme` / spec جداگانه با آستانهٔ نزولی)، با این
ارزیابی که ترکیب allowlist + پلکانی تنها جفتی است که هم تنگ‌شدن و هم تابع بازِ جدید را می‌گیرد.

---

## تناقض‌ها با prior art — هر دو طرف نقل شده

| # | prior art | اندازه‌گیری امروز | داوری |
|---|---|---|---|
| ۱ | `anon-role-grant-hotfix-20260905.md`: «۵۸ تابع باز به `authenticated` باقی می‌ماند» | **۶۳** با همان آشکارساز، بازتولیدشده و توسط ارکستریتور مستقلاً تأیید‌شده | prior art **بازتولید نشد**. عدد ۶۳ با کوئری قابل بازاجرا پشتیبانی می‌شود؛ ۵۸ بدون کوئری آمده بود. |
| ۲ | `unwired-inventory-20260905.md:292`: نقش‌های F2 = `anon` + `authenticated` | `proacl` زنده = `{supabase_admin, service_role, postgres}` — **هیچ‌کدام** | prior art **هنگام نوشتن درست بود، حالا غلط است.** علت پیدا و نقل شد: `20260905100000_436_close_anon_role_grant_escalation.sql:109-111` امروز هر سه را revoke کرد. |
| ۳ | `unwired-inventory-20260905.md:731-736`: منبع سه KPI تماس، `call_logs` است | در سطح **کاتالوگ** درست (`gamification_kpis.source`)، در سطح **کد** غلط — هیچ‌چیز آن ستون را نمی‌خواند؛ `compute_employee_score` بی‌قید‌و‌شرط از `staff_daily_performance_metrics` می‌خواند | هر دو درست‌اند در سطح خودشان. `B-manual-metrics.md:76` این را از قبل درست داشت. |
| ۴ | `unwired-inventory-20260905.md:763`: «یک سرویس Python/FastAPI» | صفر Python، صفر Dockerfile، صفر compose، صفر requirements. تنها منبع: رشتهٔ UI در `_app.operations.receipts.tsx:161-162` | prior art از یک رشتهٔ رابط کاربری استنتاج کرده بود. **راستی‌آزمایی نشد.** |
| ۵ | `docs/ocr/requirements.md:20-27`: ۳۹۷ OCR را به Ollama محلی pin می‌کند با fallback خاموش | زنده: `provider_id=NULL`, `updated=2026-08-28 06:37:41+00`. طبق `client.server.ts:110` pin قبل از خوانده‌شدن `fallback_enabled` دور زده می‌شود | **مستند درست است دربارهٔ نیت ۳۹۷، غلط است دربارهٔ وضعیت امروز.** |
| ۶ | کامنت‌های کد در هر دو `receipt-ocr*.functions.ts`: Ollama لن «عمداً vision اعلام نمی‌کند» | migration 401 آن را افزود و رفتاری اثبات کرد؛ DB زنده: `caps=chat,embeddings,vision` | **کامنت‌ها کهنه‌اند.** ریسک مرتبط ثبت شد: ۴۰۱ بار سرد ~۷۷ ثانیه را در برابر حداقل timeout ۱۵۰۰۰ms اندازه گرفت. |

---

## سؤال‌های مالک — تجمیع‌شده، به زبان کسب‌وکار

### دربارهٔ تلفن (بلوکه‌کنندهٔ کل مسیر A)
1. **چه سیستم تلفنی در شرکت کار می‌کند؟** نام و مدلش. هیچ نشانه‌ای از آن در نرم‌افزار نیست.
2. **آیا آن سیستم گزارش تماس می‌دهد؟** به چه شکل — فایل اکسل، صفحهٔ گزارش، یا اتصال خودکار؟
3. **چه کسی آن را اداره می‌کند؟** برای گرفتن دسترسی به گزارش‌ها با چه کسی باید صحبت کرد؟
4. **واحد امتیازدهی، جمع روزانه است یا تک‌تک تماس‌ها؟** امروز فقط جمع روزانه کار می‌کند.
5. **آیا «نتیجهٔ تماس» باید ثبت شود؟** (هیچ ستونی برایش وجود ندارد.)
6. **آیا تماس‌ها باید به مشتری وصل شوند؟**
7. **اگر هیچ سیستم قابل‌اتصالی نیست، آیا ورود دستی قابل قبول است؟** صفحهٔ دستی از قبل هست و کار می‌کند.

### دربارهٔ OCR
8. **آیا ارائه‌دهندهٔ `for ocr` (OpenAI) کلید فعال دارد؟** — این تعیین می‌کند تصویر رسیدها امروز از
   شبکه خارج می‌شود یا نه. **فوری‌ترین سؤال این گزارش.**
9. **آیا خواندن رسید باید روی سرور خودمان بماند؟** اگر بله، مسیرِ ارائه‌دهنده باید دوباره به Ollama pin شود.
10. **صف `/operations/receipts` قرار است چه چیزی را نشان دهد** که صفحهٔ اسناد رسید پرداخت نشان نمی‌دهد؟
    اگر پاسخ «چیزی» است، شاید صفحه باید حذف شود نه ساخته.

### دربارهٔ توابع باز
11. **آیا `hold_credit` / `release_credit` قرار است از رابط کاربری صدا زده شوند؟** امروز هیچ فراخوانی ندارند.
    اگر نه، `authenticated` باید کامل برداشته شود.
12. **کدام نقش‌ها مجاز به جابه‌جایی سقف اعتبار مشتری‌اند؟** گارد بدون این پاسخ نوشتنی نیست.
13. **آیا پذیرفته است که آشکارساز og61 پلکانی سبز شود** (رده به رده) به‌جای اینکه یک‌باره ۵۹ شکست بدهد؟

---

## Numbers — تجمیع‌شده

| کمیت | مقدار | منبع |
|---|---:|---|
| secdef در `public` (قبل و بعد) | ۴۱۶ | `[E][V]` ارکستریتور |
| کلاس مشتق‌شده — باز به `authenticated` | **۶۳** | `[E][V]` بازتولید دقیق |
| ↳ `anon` هم می‌رسد | ۱۵ | `[E][V]` |
| ↳ فقط `authenticated` | ۴۸ | `[E][V]` |
| ↳ `proacl IS NULL` | ۰ | `[E][V]` |
| ↳ واقعاً بی‌گارد (پس از خواندن ۶۳ بدنه) | ۳۶ | `[E]` عامل C |
| ↳ گاردِ غیرنقشی دارند | ۲۷ | `[E]` عامل C |
| ادعای prior art | ۵۸ | `[P]` **بازتولید نشد** |
| DDLِ ماندگار در بدنهٔ توابع `public` | ۰ | `[E]` هر ۸ برخورد یا TEMP یا داخل کامنت |
| ردیف‌های `call_logs` | ۰ | `[E][V]` |
| نویسندگان `call_logs` | ۰ | `[E]` |
| ارجاع `call_logs` در کد برنامه | ۱ (types تولیدشده) | `[E][V]` |
| رد سیستم تلفن در repo | ۰ | `[E][V]` ۱۲ کلیدواژه + ۳ واژهٔ فارسی |
| `staff_daily_performance_metrics` | ۱۱ ردیف / ۸ کارمند | `[E]` |
| رویدادهای `inbound_call`/`outbound_call` | ۰ | `[E]` |
| `pg_cron` | نصب نیست | `[E][V]` |
| `to_regclass('public.ocr_receipts')` | `NULL` | `[E][V]` |
| migrationهای سازندهٔ `ocr_receipts` | ۰ | `[E]` |
| مسیرهای AI با `provider_id` غیر NULL | ۰ از ۸ | `[E][V]` |
| ارائه‌دهندگان vision فعال | ۲ (OpenAI prio ۱، ollama prio ۱۰) | `[E][V]` |
| تست‌های `it(` در parser رسید | ۱۹ در ۹ `describe` | `[E]` |
| فایل‌های Dockerfile/compose/requirements برای OCR | ۰ | `[E]` |
| فراخوان `getUserMedia` در مسیر رسید | ۰ (همه صوتی) | `[E][V]` |
| کل migrationهای اعمال‌شده | ۶۳۲ (max `20260905231500`) | `[E]` |

---

## Coverage

**بررسی‌شده:** کاتالوگ زندهٔ دیتابیس (`pg_proc`, `pg_get_functiondef`, `pg_policies`, `pg_default_acl`,
`information_schema`, `pg_extension`, `supabase_migrations`) · کل درخت git-tracked با `git grep` روی
`HEAD` · ۶۳ بدنهٔ تابع، تک‌تک خوانده‌شده · فایل spec og61 (خوانده، اجرا نشده) ·
`/api/tags` اولاما (فقط خواندن، بدون inference) · هر پنج فایل prior art.

**بررسی‌نشده و چرا:**
- **رفتار اجرایی هیچ تابعی** — قاعدهٔ probe. هیچ تابع برنامه‌ای صدا زده نشد.
- **`npm run test:receipt-ocr`** — خوانده شد، اجرا نشد (ممنوعیت بار روی host مشترک).
- **Playwright / e2e / مرورگر** — ممنوع در این مأموریت.
- **کلید API ارائه‌دهندهٔ `for ocr`** — خارج از حیطهٔ read-only توافق‌شده؛ به‌جایش سؤال مالک شمارهٔ ۸ شد.
- **production `192.168.170.10`** — هرگز تماس گرفته نشد، resolve نشد، ping نشد.
- **worktreeهای موج build** — خوانده نشدند؛ هیچ شاخه‌ای سوییچ نشد.

---

## UNVERIFIED / UNKNOWN

- **`[?]`** آیا ارائه‌دهندهٔ `for ocr` کلید فعال دارد — تعیین‌کنندهٔ اینکه خروج داده واقعی است یا فرضی.
- **`[?]`** migration 398 در header ادعا کرد «دست‌کم پنج» ردیف حسابرسیِ استخراج. امروز ۴۲ ردیف
  `receipt_document_extraction_completed` وجود دارد ولی **۰ سند با `extracted_data` پرشده**
  (از ۱ ردیف کل). با یک ردیف و بدون اجازهٔ probe رفتاری، این به «۳۹۸ خراب است» ارتقا داده **نشد**.
- **`[?]`** ریسک timeout: ۴۰۱ بار سرد ~۷۷ ثانیه را در برابر حداقل timeout ۱۵۰۰۰ms اندازه گرفت.
  اثر عملی‌اش اندازه‌گیری نشد (نیازمند inference که ممنوع بود).
- **`[?]`** هدف اصلی صفحهٔ `/operations/receipts` — آیا قرار بوده جایگزین صفحهٔ اسناد رسید باشد یا
  مکمل آن. هیچ سند طراحی‌ای پیدا نشد؛ سؤال مالک شمارهٔ ۱۰.
- **`[?]`** ۶ تابع از ۶۳ هیچ فراخوانی در هیچ‌کجا ندارند. اینکه مرده‌اند یا برای مصرف‌کنندهٔ آینده‌اند،
  از کد قابل تشخیص نیست.
- **`[P]` بازتولید نشدهٔ باقی‌مانده:** بخش قرنطینهٔ `domain-functions-sweep-20260904.md`
  (۱۶۳ سرنخ راستی‌آزمایی‌نشده، نرخ رد ۷۱٪) عمداً دست‌نخورده ماند. هیچ سرنخی از آن ارتقا داده نشد.

---

## وضعیت نهایی

**`COMPLETE`**

- هر ۵ زیربند A، هر ۵ زیربند B، و هر ۶ زیربند C حکم یا `UNKNOWN` صریح با دلیل دارند.
- ارکستریتور برای هر عامل دست‌کم یک عدد را مستقلاً بازشمرد؛ برای عامل C کوئری کلاس عیناً
  بازتولید شد (۶۳/۱۵/۴۸/۰) و سه تابع تصادفی بدنه‌خوانی و با جدول مقایسه شدند — هر سه مطابق.
- Preflight و postflight درخت مشترک یکسان‌اند؛ تفاوت `git status` دقیقاً و فقط سه فایل یافتهٔ این مأموریت است.
- هیچ فایلی پیاده‌سازی پیشنهاد نمی‌دهد. جدول رتبه‌بندی‌شدهٔ عامل C ورودی مستقیم migration بعدی است،
  که **پس از پاسخ مالک** نوشته می‌شود.
