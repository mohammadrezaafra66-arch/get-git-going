# راهنمای اجرای مهاجرت پروداکشن — ۲۰۲۶-۰۹-۰۸

> ## 🔴 برای اجرای ۲۰۲۶-۰۹-۱۲ این سند را **تنها منبع** نگیرید
>
> این سند **مرجعِ دلیل‌ها** است و معتبر می‌ماند. ولی سه چیز در آن کهنه شده و در
> **`production-migration-20260908-BLOCKS.md`** اصلاح شده — **مجری از آن سند اجرا می‌کند،
> نه از این:**
>
> 1. **فاصله ۷۷ است، نه ۷۴** (۵۲۰، ۵۲۱، ۵۲۲ با PR #435 آمدند). `MIGRATIONS-74.md` کهنه است.
> 2. **پشتیبان `prod-20260912.dump` است**، نه dumpِ ۰۹-۰۸.
> 3. **بلوکِ فاز ۳ (قدم ۱.۴) ناقص است** — فقط `anon` را می‌بندد و `anon` باز هم از راه
>    `PUBLIC` به هر تابع تازه می‌رسد. دو دستور سراسریِ
>    `REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` لازم است.
>
> همچنین دو پیش‌بینی عوض شده‌اند: **۴۷۵ و ۵۰۷ روی پروداکشن می‌گذرند** (اندازه‌گیری‌شده)،
> در حالی که این سند هر دو را شکست ثبت کرده است.

> **این سند را مالک اجرا می‌کند.** هیچ ایجنتی به `192.168.170.10` دست نزده و نخواهد زد.
> همهٔ اعداد این سند یا روی **پایگاه تمرینی** `prod_rehearsal_20260908` (روی هاست تست
> `192.168.170.8`) اندازه‌گیری شده‌اند، یا از فایل‌های مخزن نقل شده‌اند، یا صریحاً
> `⚠️ UNREHEARSED` علامت خورده‌اند.

---

## ۰ · چطور این سند را بخوانید

### ۰.۱ · برچسب‌ها

| برچسب | معنی |
|---|---|
| **✅ تمرین‌شده** | دقیقاً همین قدم روی پایگاه تمرینی اجرا شد و خروجی‌اش ثبت است |
| **⚠️ UNREHEARSED** | این قدم اجرا **نشده** است. خروجی مورد انتظارش استنتاج است، نه مشاهده |
| **🔴 OWNER DECISION** | اینجا باید تصمیم بگیرید؛ پیش‌فرض ندارد |

قاعدهٔ حاکم بر کل سند: **هر قدمی که روی تمرین اجرا نشده باشد، همان‌جا که هست
`⚠️ UNREHEARSED` علامت خورده است.** اگر برچسبی ندیدید، یعنی اجرا شده است.

### ۰.۲ · نام پایگاه‌داده — اولین چیزی که اشتباه می‌شود

روی پروداکشن نام پایگاه‌داده **`postgres`** است، نه `afrakala`
(`CLAUDE.md`، جدول «Working environments»). هر دستوری در این سند که `-d postgres` دارد
**فقط روی لپ‌تاپ پروداکشن** معنی دارد. اگر `psql -d afrakala` روی پروداکشن خطای
`database "afrakala" does not exist` داد، یعنی دستور را از جای اشتباهی کپی کرده‌اید.

نام کانتینرها روی هر دو ماشین یکی است: `afrakala-lan-db` و `afrakala-lan-web`
(`CLAUDE.md`، همان جدول). پس **نام کانتینر شما را از اشتباه نجات نمی‌دهد؛ فقط نام پایگاه‌داده.**

### ۰.۳ · قواعدی که در هر قدم رعایت شده و شما هم باید رعایت کنید

1. **هر اجرا با `--single-transaction -v ON_ERROR_STOP=1`** — تا یک شکست جزئی به‌جای نیم‌کاره
   ماندن، کامل rollback شود (`CLAUDE.md` قاعدهٔ ۲؛ `CONTRACTS.md` §«Rules that bit this
   project» بند ۷). روی تمرین هر ۱۴ شکست **کامل** برگشتند و هیچ‌چیز نیم‌کاره نماند
   (`R4-R5-results.md` §Housekeeping: «The 14 failures each rolled back whole»).
2. **SQL فارسی فقط با فایل** — هرگز از طریق pipe به `psql`. یک pipe در ۲۰۲۶-۰۷-۱۱ متن فارسی
   ۴۴ تابع را نابود کرد (`CLAUDE.md` §«Safety rules for database work» بند ۱).
   روی تمرین هر ۷۴ فایل با **md5 روی هر دو سمت** تأیید شد و فارسی سالم رسید — مثلاً
   NOTICE مهاجرت ۵۰۸: `D-55: allocation_rows قبل=0 ، حذف‌شده=0` (`R4-R5-results.md` §1).
3. **اعمال، سپس ثبت ردیف لجر، سپس اثبات اینکه ردیف مال خودتان است** — `ON CONFLICT DO NOTHING`
   روی برخورد **exit 0** می‌دهد و سکوت می‌کند (`ledger-reconcile.sh:32-38`). این دقیقاً همان
   چیزی است که در ۲۰۲۶-۰۹-۰۷ نزدیک بود مهاجرت ۵۱۷ را ثبت‌نشده رها کند.

### ۰.۴ · فهرست تصمیم‌های شما — قبل از شروع بدانید چند تا هستند

**هشت تصمیم** در راه است. اینجا فقط فهرست‌اند؛ هرکدام سرِ جای خودش با گزینه‌ها و
مبادله‌اش دوباره می‌آید.

| کد | کجا | موضوع | اگر تصمیم نگیرید چه می‌شود |
|---|---|---|---|
| **OD-1** | فاز ۱، قدم ۱.۱ | ماژول ۳۳۶–۳۷۰ روی پروداکشن نیست → اجرا را شروع نکنید یا اول آن را نصب کنید | اجرا در قدم ۳۸ از ۷۴ می‌ایستد، روی داده‌های واقعی شرکت |
| **OD-2** | فاز ۱، قدم ۱.۲ | مهاجرت ۴۰۸ (`hold_credit_for_quote`) ممکن است نباشد | اجرا در قدم ۲۷ از ۷۴ می‌ایستد |
| **OD-3** | فاز ۱، قدم ۱.۴ | بستن `ALTER DEFAULT PRIVILEGES … TO anon` **قبل از** ۷۴تا | اجرا ۲۶ تابع anon-اجراپذیر می‌سازد، از جمله `pay_purchase_with_voucher` |
| **OD-4** | فاز ۳، قدم ۳.۲ | اسکریپت آشتیِ لجر نام `postgres` را **رد می‌کند** | آشتی لجر انجام نمی‌شود |
| **OD-5** | فاز ۴، گروه ۲ | مهاجرت‌های ۴۴۹ / ۴۵۰ / ۴۵۲ عدد ثابتِ پایگاه تست را assert می‌کنند | اجرا در قدم ۱۵ از ۷۴ می‌ایستد |
| **OD-6** | فاز ۴، گروه ۳ | مهاجرت ۴۶۰ روی پروداکشن **قطعاً** abort می‌کند | اجرا در قدم ۲۵ از ۷۴ می‌ایستد |
| **OD-7** | فاز ۴، گروه ۵ | مهاجرت ۵۰۷ بدون `FROM anon` روی پروداکشن رد می‌شود | اجرا در قدم ۶۲ از ۷۴ می‌ایستد |
| **OD-8** | فاز ۶، قدم ۶.۳ | زمان دیپلوی بیلد جدید نسبت به مهاجرت‌ها | ۱۵ گیت `admin` تا دیپلوی وجود ندارند |

**تصمیم‌های قبلی که همین‌طور می‌مانند و بازگشایی نمی‌شوند** (`CONTRACTS.md` §«Owner decisions —
carry, do not relitigate»): **D-59** ۲۳ نفر از ۴۲ کاربر نقش `admin` دارند و فعلاً می‌مانند؛
**D-24** صفحهٔ عمومی فهرست فروش برای بازدیدکنندهٔ ناشناس بسته می‌ماند؛ **D-56** خواندن عمومی
`product_images` عمدی است.

### ۰.۵ · یک عدد که باید اصلاح شود: فاصله **۷۴** است، نه ۶۲

ممیزی (`docs/research/production-audit-2026-09-07.md:331`) عدد **۶۲** را می‌دهد و **در زمان
نوشتنش درست بود**. بعد از آن، مهاجرت‌های **۵۰۸ تا ۵۱۹** در ۲۰۲۶-۰۹-۰۷ روی `staging` نشستند
(PRهای #432 و #434). اندازه‌گیری‌شده (`CONTRACTS.md` §«CORRECTION TO THE AUDIT»):

```
audit list rows                     : 62
disk candidates (>424, plus 420/421): 74
in audit but missing from disk      : NONE
on disk but absent from the audit   : 508 509 510 511 512 513 514 515 516 517 518 519
TRUE GAP                            : 74
```

**اگر فقط ۶۲تا را اجرا کنید، پروداکشن ۱۲ مهاجرت عقب می‌ماند**، و چهارتای آن‌ها کار امنیتی
همان روز هستند: **۵۱۱** (گارد کف اعتبار دستی)، **۵۱۵** و **۵۱۹** (گاردهای `SECURITY DEFINER`
گزارش‌های سلامت سیستم)، **۵۱۸** (همان گارد، گسترش‌یافته به `INSERT`).

### ۰.۶ · ترتیب اجرا، ترتیبِ **نام فایل** است، نه ترتیبِ شماره

شماره‌ها درهم‌اند. `446` قبل از `443` می‌آید؛ `518` قبل از `517`؛ `512` قبل از `510`
(`MIGRATIONS-74.md`، جدول). جدول کامل در **پیوست ب** است. **از بالا به پایین اجرا کنید و
شماره‌ها را مرتب نکنید.**

### ۰.۷ · «بدون تغییر» گاهی یعنی موفقیت — این را قبل از شروع بدانید

دو شیء روی پروداکشن **از قبل** در وضعیت مطلوب‌اند، چون شما در ۲۰۲۶-۰۹-۰۷ دستی درستشان کردید
(`CONTRACTS.md` §«Two production objects are ALREADY in the desired state»):

1. `receipt_ocr.vision` → `ollama`، fallback خاموش، `gpt.is_active=f`
2. `anon` روی `v_promotion_suggestions` و `vw_account_balances` revoke شده

**برای شیء دوم، «بدون تغییر» واقعاً یعنی موفقیت** و روی تمرین دو بار مشاهده شد
(`R4-R5-results.md` §5.2 — پاس دوم byte-identical با پاس اول، exit 0).

**برای شیء اول این حرف غلط از آب درآمد.** مهاجرت ۴۶۰ روی وضعیت مطلوب **abort می‌کند**، نه
«بدون تغییر». جزئیات در **OD-6**. ممیزی در سطر ۴۰۹ خودش انتظار `UPDATE 0` داشت؛ آن انتظار
با اجرای واقعی رد شد.

---

## فاز ۱ · PREFLIGHT — قبل از پشتیبان، قبل از هر چیز

> این فاز **فقط خواندنی** است، به‌جز قدم ۱.۴ که یک تصمیم دارد.
> کل فاز شاید ده دقیقه طول بکشد. هیچ‌کدام از این قدم‌ها را جا نیندازید.

### قدم ۱.۱ — 🔴 PREFLIGHT #1 · آیا ماژول ۳۳۶–۳۷۰ روی پروداکشن هست؟

**⚠️ UNREHEARSED به‌عنوان یک کوئری پروداکشن** — هیچ ایجنتی پروداکشن را نخوانده. ولی *یافته‌ای*
که این کوئری را لازم کرده، روی تمرین اندازه‌گیری شده است (`R1-R3-results.md` §5).

**چرا این اولین قدم است، در دو جمله:** ۷۴ مهاجرت فرض می‌کنند ماژول اسناد دفتری /
سند دوگانه / برگشت سند (مهاجرت‌های ۳۳۶ تا ۳۷۰) روی پروداکشن نصب است، و **چهار تای آن‌ها
اگر نباشد قطعاً abort می‌کنند**. اگر بدون این بررسی شروع کنید، حالت شکست «امتناع تمیز»
نیست — **اعمال نیمه‌کاره روی سوابق واقعی شرکت** است، چون تا قدم ۳۸ چند ده تغییر دیگر
commit شده‌اند.

```sql
-- روی پروداکشن، فقط خواندنی، قبل از هر چیز دیگر
SELECT to_regclass('public.document_numbers')      AS document_numbers,
       to_regclass('public.dual_documents')        AS dual_documents,
       to_regclass('public.document_attachments')  AS document_attachments;
```

**دستور کامل:**

```powershell
$pw = (docker exec afrakala-lan-db printenv POSTGRES_PASSWORD).Trim()
docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d postgres -c `
"SELECT to_regclass('public.document_numbers') AS document_numbers,
        to_regclass('public.dual_documents') AS dual_documents,
        to_regclass('public.document_attachments') AS document_attachments;"
```

**چه چیزی باید ببینید — حالت خوب:**

```
    document_numbers     |   dual_documents   |    document_attachments
-------------------------+--------------------+----------------------------
 public.document_numbers | public.dual_documents | public.document_attachments
(1 row)
```

**چه چیزی نباید ببینید — حالت توقف:**

```
 document_numbers | dual_documents | document_attachments
------------------+----------------+----------------------
                  |                |
(1 row)
```

سه ستون خالی یعنی `NULL`.

> ### 🔴 OWNER DECISION — OD-1
>
> **اگر حتی یکی از سه ستون `NULL` بود، اجرای مهاجرت را شروع نکنید.** دو گزینه دارید:
>
> - **(الف) توقف تمیز.** امشب چیزی اجرا نکنید. ماژول ۳۳۶–۳۷۰ باید اول نصب شود و آن یک
>   مأموریت جداست، نه یک قدم از این سند.
>   *مبادله:* هیچ ریسکی، ولی امشب هیچ مهاجرتی هم نمی‌نشیند.
> - **(ب) اول ۳۳۶–۳۷۰ را نصب کنید، بعد این سند را ادامه دهید.**
>   *مبادله:* ۲۹ مهاجرت اضافه روی داده‌های واقعی، و آن ۲۹تا **مشکلات خودشان را دارند** که
>   در `docs/migration/prod-clone-dryrun-20260831.md` ثبت شده و **در این سند حل نشده‌اند** —
>   از جمله دو blocker: چهارده مهاجرت مخزن شرط `current_database() <> 'afrakala'` دارند و
>   روی پروداکشن که نامش `postgres` است abort می‌کنند
>   (`prod-clone-dryrun-20260831.md` §6 BLOCKER 1)، و مهاجرت ۳۹۱ تابعی را حذف می‌کند که
>   روی پروداکشن یک تریگر زنده از آن استفاده می‌کند
>   (`prod-clone-dryrun-20260831.md` §6 BLOCKER 2). **توصیهٔ این سند گزینهٔ الف است.**

**یک خبر خوب که باید همین‌جا گفته شود:** آن چهارده مهاجرتِ دارای گارد نام پایگاه‌داده
**هیچ‌کدام در ۷۴ تای این سند نیستند.** اندازه‌گیری‌شده — E3، دستور و خروجی:

```bash
$ cd supabase/migrations && grep -l "current_database()" *.sql | wc -l
14
$ # همان جست‌وجو، محدود به فهرست ۷۴تایی:
$ for f in <the 74 filenames>; do grep -n "current_database()" "$f"; done
(no output)
```

هر چهارده تا در بازهٔ `336`–`392` هستند (`20260818150000_336_…` تا
`20260826090000_392_…`). **پس اگر ماژول سرِ جایش باشد، گارد نام پایگاه‌داده به ۷۴ تای
شما ربطی ندارد.** اگر نباشد و گزینهٔ (ب) را انتخاب کنید، این blocker مستقیماً به شما
برمی‌گردد.

### قدم ۱.۲ — 🔴 PREFLIGHT #1، نیمهٔ دوم · مهاجرت ۴۰۸

**⚠️ UNREHEARSED به‌عنوان کوئری پروداکشن.** یافته روی تمرین اندازه‌گیری شده
(`R4-R5-results.md` §4.2).

کوئری قدم ۱.۱ **کافی نیست**، و این را در تمرین کشف کردیم، نه از روی حدس. مهاجرت **۴۰۸**
هم روی پایگاه تمرینی غایب است، ولی **بالای** بازهٔ ۳۳۶–۳۷۰ می‌نشیند (`20260827100000`)،
پس آن سه شیء می‌توانند هر سه موجود باشند و ۴۰۸ باز هم نباشد.

```sql
-- به PREFLIGHT #1 اضافه کنید. روی پروداکشن، فقط خواندنی.
SELECT to_regprocedure('public.hold_credit_for_quote(uuid,uuid)') AS m408_hold_credit_for_quote;
```

**چه چیزی باید ببینید:**

```
      m408_hold_credit_for_quote
---------------------------------------
 public.hold_credit_for_quote(uuid,uuid)
(1 row)
```

**اگر خالی (`NULL`) بود:** مهاجرت ۴۰۸ اجرا نشده و **مهاجرت ۴۶۲ در قدم ۲۷ از ۷۴ abort
می‌کند** با پیام `function public.hold_credit_for_quote(uuid, uuid) does not exist`
(`R4-R5-results.md` §4.2، خروجی verbatim).

> ### 🔴 OWNER DECISION — OD-2
>
> اگر `NULL` بود:
> - **(الف) مهاجرت ۴۰۸ را اول اجرا کنید** (`supabase/migrations/20260827100000_408_quote_reserves_ceiling_and_stale_holds_expire.sql`).
>   *مبادله:* برگشت‌پذیر نیست بدون بازگردانی پشتیبان، و روی پروداکشن تمرین نشده؛ ولی ۴۶۲
>   بعدش می‌گذرد.
> - **(ب) مهاجرت ۴۶۲ را رد کنید** و ردیف لجرش را ثبت **نکنید**، و آن را به‌عنوان یک بدهی
>   ثبت‌شده بگذارید.
>   *مبادله:* ۴۶۲ گاردهای DEFINER ردهٔ پولی را نصب می‌کند؛ رد کردنش یعنی آن گاردها روی
>   پروداکشن نمی‌نشینند.

### قدم ۱.۳ — 🔴 لجر در **هر دو جهت** دروغ می‌گوید

این مهم‌ترین جمله‌ای است که باید قبل از شروع باور کنید:

> **`supabase_migrations.schema_migrations` روی پروداکشن یک منبع معتبر نیست.
> نه برای «چه چیزی اجرا شده» و نه برای «چه چیزی اجرا نشده».**

شواهد، هر دو جهت:

- **کم‌گویی:** لجر روی **۵۶۹ ردیف** با بیشینهٔ `20260827120000` (= مهاجرت ۴۱۰) ایستاده،
  در حالی که اسکیمای پروداکشن تا **۴۲۴** جلو رفته (`CONTRACTS.md` §Ground truth؛ ممیزی
  سطر ۴۷۵–۴۷۸). یعنی حداقل ۱۰ مهاجرت اجرا شده و ثبت نشده — روی تمرین دقیقاً همان ۱۰تا
  دوباره کشف شدند (`R1-R3-results.md` §7، خروجی `gap_rows 10`).
- **بیش‌گویی:** لجر ردیف `20260827100000` (مهاجرت ۴۰۸) را **دارد**، در حالی که خودِ تابعِ
  ۴۰۸ روی پایگاه غایب است (`R4-R5-results.md` §4.2، هر دو کوئری با خروجی).

**نتیجهٔ عملی، و این همان تلهٔ اصلی است:** هرکس از روی لجر تصمیم بگیرد چه چیزی اجرا نشده،
مهاجرت‌های ۴۱۰ تا ۴۲۴ را **دوباره** اجرا می‌کند. چند تای آن‌ها idempotent نیستند
(`CLAUDE.md` قاعدهٔ ۲b: «۴۰۲ ستون drop می‌کند، ۴۰۴ تابع را drop و بازسازی می‌کند،
۴۰۹ یک signature را drop می‌کند»). **آشتیِ لجر در فاز ۳ فقط ردیف ثبت می‌کند و
هیچ مهاجرتی را دوباره اجرا نمی‌کند.**

### قدم ۱.۴ — 🔴 بستن `ALTER DEFAULT PRIVILEGES … TO anon` — **این قدم قبل از ۷۴تا می‌آید**

> **⚠️ UNREHEARSED — این اصلاح روی تمرین اجرا نشد.**
> `R4-R5-results.md` §6.9 صریح است: «The `ALTER DEFAULT PRIVILEGES` closure was **not**
> executed — §4.3 measures its consequences but does not rehearse the fix». *پیامدهایش*
> اندازه‌گیری شده؛ *خودِ اصلاح* نه.

**این قدم در قرارداد اولیه جزو «سه کار بعد از مهاجرت» بود. جایش اینجاست، و دلیلش
اندازه‌گیری شده است.** پروداکشن **۹ ورودی `anon` در `pg_default_acl`** دارد؛ ماشین تست
**صفر** (`R4-R5-results.md` §4.3، هر دو کوئری). یعنی روی پروداکشن هر `CREATE FUNCTION`
به‌طور خودکار به `anon` مجوز `EXECUTE` می‌دهد **بدون اینکه هیچ `GRANT`ی جایی نوشته شود**.

پیامد اندازه‌گیری‌شده: از **۸۰** تابعی که ۶۰ مهاجرت موفق ساختند یا جایگزین کردند،
**۲۶ تا** روی پایگاه پروداکشن anon-اجراپذیر متولد می‌شوند — از جمله
`pay_purchase_with_voucher`، `review_credit_request`، `create_sales_quote_with_items`،
`reverse_document`، `calculate_customer_realtime_credit`، `asan_commit_person_batch`
(`R4-R5-results.md` §4.3، فهرست کامل).

و همین باعث می‌شود **مهاجرت ۵۰۷ در قدم ۶۲ abort کند**:
`ERROR: 507: anon must not reach either function` — چون `roll_employee_daily_streaks`
یک گرنت **صریح** `anon=X` از default ACL گرفته و `REVOKE … FROM PUBLIC` آن را برنمی‌دارد.

**اول بخوانید — فقط خواندنی:**

```powershell
$pw = (docker exec afrakala-lan-db printenv POSTGRES_PASSWORD).Trim()
docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d postgres -c `
"SELECT n.nspname AS schema, d.defaclobjtype AS objtype, d.defaclacl
   FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
  WHERE d.defaclacl::text LIKE '%anon%';"
```

**چه چیزی انتظار می‌رود** (بر پایهٔ dump ۲۰۲۶-۰۸-۳۱، `R4-R5-results.md` §4.3):
**۹ ردیف**، با `objtype` های `r` (جدول)، `f` (تابع) و `S` (sequence) در schema `public`
و چند ردیف در `storage`. اگر **صفر ردیف** دیدید، این حفره روی پروداکشن امروز بسته است و
می‌توانید از این قدم رد شوید — ولی **آن را ثبت کنید**، چون کل استدلال بالا بر پایهٔ ۹
ردیف است.

> ### 🔴 OWNER DECISION — OD-3
>
> - **(الف) قبل از ۷۴تا ببندید — توصیهٔ این سند.**
>   *مبادله:* یک تغییر مجوز روی پروداکشن که تمرین نشده است؛ در عوض اجرای ۷۴تا ۲۶ تابع
>   anon-اجراپذیر **نمی‌سازد** و ۵۰۷ شانس گذشتن پیدا می‌کند.
> - **(ب) بعد از ۷۴تا ببندید.**
>   *مبادله:* ساده‌تر، ولی بستنِ default ACL فقط جلوی اشیای *آینده* را می‌گیرد؛ آن ۲۶ تابع
>   که همان شب متولد شده‌اند anon-اجراپذیر **می‌مانند** و هیچ مهاجرتی بعداً آن‌ها را
>   revoke نمی‌کند (`R4-R5-results.md` §7 بند ۶؛ مهاجرت‌های ۴۷۶ و ۴۷۷ فهرستِ اشیای زمان
>   *نوشته‌شدنِ خودشان* را دارند، نه اشیایی که اجرا می‌سازد).
> - **(ج) اصلاً نبندید.** ثبت‌شده به‌عنوان بدهی؛ ۵۰۷ آنگاه قطعاً abort می‌کند (OD-7).

**اگر (الف) را انتخاب کردید — دستور. ⚠️ UNREHEARSED:**

الگو از مهاجرت ۳۹۳ گرفته شده که همین کار را برای توابع می‌کند
(`supabase/migrations/20260826140000_393_close_function_default_privilege_and_assert_viewer_guard.sql:142-143`):

```sql
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
```

ولی حفرهٔ پروداکشن سه نوع شیء را می‌گیرد (`r`, `f`, `S`)، پس هر سه باید بسته شوند.
**`ALTER DEFAULT PRIVILEGES` فقط ورودی‌هایی را برمی‌دارد که با همان نقشِ سازنده و همان
schema ثبت شده‌اند** — به همین دلیل باید ستون `defaclrole` را از کوئری بالا بخوانید و
دستور را با همان نقش صادر کنید. کوئری خواندن را با `defaclrole::regrole` تکرار کنید:

```powershell
docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d postgres -c `
"SELECT d.defaclrole::regrole AS grantor, n.nspname AS schema,
        d.defaclobjtype AS objtype, d.defaclacl
   FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
  WHERE d.defaclacl::text LIKE '%anon%';"
```

سپس برای **هر ردیف** یک دستور، با `<grantor>` و `<schema>` از همان ردیف:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE <grantor> IN SCHEMA <schema> REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE <grantor> IN SCHEMA <schema> REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE <grantor> IN SCHEMA <schema> REVOKE ALL ON SEQUENCES FROM anon;
```

**راستی‌آزمایی — و این تنها چیزی است که ثابت می‌کند کار شده:**

```powershell
docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d postgres -tAc `
"SELECT count(*) FROM pg_default_acl WHERE defaclacl::text LIKE '%anon%';"
```

**باید `0` برگردد.** هر عدد دیگری یعنی حداقل یک ترکیب grantor/schema/objtype جا مانده —
دوباره کوئری خواندن را اجرا کنید و ببینید کدام ردیف مانده. **صفر شرط موفقیت است، نه
پیام دستور.** (این همان درسی است که §5.2 تمرین داد: `REVOKE` روی مجوزی که وجود ندارد
هم `REVOKE` چاپ می‌کند و exit 0 می‌دهد — پس **tag دستور هیچ چیزی ثابت نمی‌کند؛ خواندنِ
بعد از آن ثابت می‌کند.**)

### قدم ۱.۵ — وضعیت زندهٔ `ai_providers` را بخوانید (ورودی OD-6)

**⚠️ UNREHEARSED به‌عنوان کوئری پروداکشن.**

مهاجرت ۴۶۰ سطرهایش را با **UUID ثابت** آدرس می‌دهد و آن UUIDها مالِ پایگاه **تست**‌اند
(`R4-R5-results.md` §5.1). قبل از رسیدن به قدم ۲۵ باید بدانید پروداکشن چه UUIDهایی دارد.

```powershell
docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d postgres -c `
"SELECT id, name, kind, is_active, capabilities FROM public.ai_providers ORDER BY name;"
```

**چه چیزی انتظار می‌رود** (از dump ۲۰۲۶-۰۸-۳۱، به‌علاوهٔ اصلاح دستی شما در ۲۰۲۶-۰۹-۰۷):

```
                  id                  |  name  |       kind        | is_active |    capabilities
--------------------------------------+--------+-------------------+-----------+---------------------
 f6a5bc04-9c89-42a1-9bfe-dd3258313a0b | gpt    | openai_compatible | f         | {vision}
 e07894ce-e804-443c-9873-040c312c48d5 | ollama | ollama            | t         | {chat,embeddings}
```

**آنچه مهاجرت ۴۶۰ می‌خواهد ببیند و نخواهد دید:**
`0fbe576a-9ef3-475b-92e7-fabd981a7d5d` و `d30816a9-8ff0-4d0e-8f25-0661f8cbea61`.
**اگر هیچ‌کدام از این دو UUID در خروجی شما نبود، مهاجرت ۴۶۰ قطعاً abort می‌کند.**
تصمیمش در OD-6 است؛ همین حالا خروجی این کوئری را جایی یادداشت کنید.

### قدم ۱.۶ — 🔴 آیا کانتینرها بعد از یک reboot خودشان برمی‌گردند؟ **UNKNOWN**

**این یک پرسش است، نه یک قدم.** روی ماشین تست اندازه‌گیری شد
(`CONTRACTS.md` §Addendum بند ۳): سرویس `com.docker.service` روی **Stopped/Manual** است،
Docker Desktop از یک کلید `HKCU\…\Run` در **SessionId 1** بالا می‌آید، و `AutoAdminLogon`
خالی است. **یعنی کانتینرها فقط وقتی برمی‌گردند که آن session کاربر برگردد، و مکانیزمش
UNKNOWN است.**

**روی پروداکشن این اندازه‌گیری نشده و نباید بشود.** ولی اگر همان چیدمان آنجا هم برقرار
باشد، **یک reboot ناخواسته وسط مهاجرت ممکن است پایگاه‌داده را خودش برنگرداند.**

قبل از شروع، این را دربارهٔ لپ‌تاپ خودتان جواب دهید:

- آیا Windows Update روی آن لپ‌تاپ می‌تواند امشب restart کند؟ اگر بله، **موکولش کنید.**
- اگر لپ‌تاپ ری‌استارت شد، آیا شما کنار آن هستید که login کنید؟
- اگر جواب «نمی‌دانم» است، **مهاجرت را وقتی شروع کنید که کنارش هستید**، نه به‌صورت
  بدون‌مراقبت.

**نکتهٔ مربوط:** `CLAUDE.md` §OG-68 هشدار می‌دهد `docker restart afrakala-lan-db` روی
ماشین **تست** خطرناک بوده (bind mountهای مرده). آن حادثه در ۲۰۲۶-۰۸-۲۶ **بسته شد**
(`docs/execution/00-progress.md:388` — «CLOSED, environment repaired by `wsl --shutdown`»).
وضعیتش روی **پروداکشن هرگز اندازه‌گیری نشده — UNKNOWN.** پس در این سند هیچ‌جا
`docker restart afrakala-lan-db` تجویز نمی‌شود.

---

## فاز ۲ · پشتیبان — مهم‌ترین قدم این سند

> اگر فقط یک قدم از این سند را کامل انجام دهید، این است.
> **پشتیبانی که کسی بازگردانی‌اش را نیازموده، پشتیبان نیست؛ امید است**
> (`docs/deployment/rollback-plan.md:107`).

### قدم ۲.۱ — فضای لازم

**✅ اندازه‌گیری‌شده روی تمرین** — E3، دستور و خروجی:

```
$ docker exec afrakala-lan-db pg_dump -U supabase_admin -d prod_rehearsal_20260908 -Fc -f /tmp/p2_timing.dump
pg_dump: warning: there are circular foreign-key constraints on this table:
pg_dump: hint: You might not be able to restore the dump without using --disable-triggers ...
EXIT=0
ELAPSED_MS=2767
-rw-r--r-- 1 root root 29403276 /tmp/p2_timing.dump
md5 = eda9a3d5a5da075020e9a96dfbdaff23
```

| چیز | عدد | مبنا |
|---|---|---|
| اندازهٔ خودِ پایگاه تمرینی | **۲۹۵ MB** | `pg_size_pretty(pg_database_size(current_database()))` روی `prod_rehearsal_20260908` |
| اندازهٔ dump فشردهٔ `-Fc` | **۲۹٬۴۰۳٬۲۷۶ بایت ≈ ۲۸٫۰ MB** | همان دستور بالا |
| مدت `pg_dump` | **۲٬۷۶۷ میلی‌ثانیه ≈ ۲٫۸ ثانیه** | همان دستور بالا |
| dump واقعی پروداکشن، ۲۰۲۶-۰۸-۳۱ | **۲۹٬۷۲۵٬۰۸۹ بایت ≈ ۲۸٫۳ MB** | `docs/migration/prod-clone-dryrun-20260831.md` §2 |

**دو عدد آخر همدیگر را تأیید می‌کنند** — dump واقعی پروداکشن و dump تمرینی تقریباً هم‌اندازه‌اند.

**چقدر فضا رزرو کنید: حداقل ۱ گیگابایت آزاد.** حساب: ۲۸ MB داخل کانتینر `/tmp` + ۲۸ MB
کپی روی هاست + حاشیه برای اینکه دادهٔ امروزِ پروداکشن از dump ۳۱ اوت بیشتر است
(`persons` ۴٬۸۵۱ در برابر ۸۳۲؛ `audit_logs` ۱۰۷٬۷۱۳ در برابر ۹۱٬۵۴۸ —
`R1-R3-results.md` §6.1). یک گیگابایت خیلی بیش از کافی است و همان حاشیه‌ای است که
نمی‌خواهید سرِ ساعت ۲ بامداد نداشته باشید.

**⚠️ UNREHEARSED — مدت زمان روی سخت‌افزار پروداکشن.** ۲٫۸ ثانیه روی ماشین تست اندازه‌گیری
شده. آن را یک **کف** بدانید، نه یک برآورد. حتی اگر لپ‌تاپ پروداکشن پنج برابر کندتر باشد،
هنوز زیر ۱۵ ثانیه است — این قدم گلوگاه شب نیست.

### قدم ۲.۲ — پشتیبان بگیرید

**⚠️ UNREHEARSED روی پروداکشن** (نام پایگاه `postgres` است، نه `prod_rehearsal_…`)؛
**✅ خودِ الگوی دستور روی تمرین اجرا شد** و خروجی‌اش بالاست.

```powershell
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$pw = (docker exec afrakala-lan-db printenv POSTGRES_PASSWORD).Trim()
docker exec -e PGPASSWORD=$pw afrakala-lan-db `
  pg_dump -U supabase_admin -d postgres -Fc -f "/tmp/prod-pre-migration-$stamp.dump"
docker exec afrakala-lan-db ls -l "/tmp/prod-pre-migration-$stamp.dump"
docker exec afrakala-lan-db md5sum "/tmp/prod-pre-migration-$stamp.dump"
```

**چه چیزی باید ببینید:**

```
pg_dump: warning: there are circular foreign-key constraints on this table:
pg_dump: detail: key
pg_dump: hint: You might not be able to restore the dump without using --disable-triggers ...
-rw-r--r-- 1 root root 30xxxxxx  /tmp/prod-pre-migration-20260908-0230.dump
a1b2c3...  /tmp/prod-pre-migration-20260908-0230.dump
```

**آن سه خط `warning`/`hint` طبیعی‌اند و شکست نیستند.** روی تمرین هم دقیقاً همان‌ها
چاپ شدند و `EXIT=0` بود. **ولی جدی‌شان بگیرید:** یعنی هنگام بازگردانی
**`--disable-triggers` لازم است**. همین در ۲۰۲۶-۰۹-۰۱ روی clone پروداکشن هم صادق بود
(`prod-clone-dryrun-20260831.md` §3: «the `--disable-triggers` advice about the circular
FK was correct and prevented them»).

> **نکتهٔ PowerShell که یک بار در این پروژه خسارت زده:** `pg_dump` را با `>` در PowerShell
> ری‌دایرکت **نکنید** — PowerShell خروجی را UTF-16 می‌کند و فایل باینری خراب می‌شود
> (`docs/execution/AfraKala-continuation-after-audit.md:168`). به همین دلیل دستور بالا از
> سوئیچ `-f` خودِ `pg_dump` استفاده می‌کند، نه از ری‌دایرکت.

### قدم ۲.۳ — پشتیبان را از کانتینر بیرون بیاورید

فایل داخل `/tmp` کانتینر است. اگر کانتینر برود، پشتیبان هم می‌رود.

```powershell
docker cp "afrakala-lan-db:/tmp/prod-pre-migration-$stamp.dump" "C:\AfraKalaBackups\prod-pre-migration-$stamp.dump"
```

**اگر `docker cp` خطا داد** با پیامی شبیه
`error while creating mount source path '/run/desktop/mnt/host/...': mkdir ...: file exists`،
این همان نقص لایهٔ mount دسکتاپ داکر است که روی ماشین تست دیده شد
(`CLAUDE.md` §Safety rules بند ۱). **از Git Bash این مسیر جایگزین را بروید** — از لایهٔ
mount عبور نمی‌کند:

```bash
docker exec afrakala-lan-db cat "/tmp/prod-pre-migration-$stamp.dump" > "/c/AfraKalaBackups/prod-pre-migration-$stamp.dump"
```

**فقط از Git Bash، نه PowerShell** — به همان دلیل UTF-16 بالا.

**راستی‌آزمایی — md5 روی هر دو سمت باید یکی باشد:**

```bash
docker exec afrakala-lan-db md5sum "/tmp/prod-pre-migration-$stamp.dump"
md5sum "/c/AfraKalaBackups/prod-pre-migration-$stamp.dump"
```

**دو رشتهٔ md5 باید حرف‌به‌حرف یکی باشند.** اگر نبودند، فایل در راه خراب شده؛ دوباره
کپی کنید. **این تنها اثبات تحویل است — پیام موفقیت `docker cp` اثبات نیست:** در
۲۰۲۶-۰۸-۲۶ `docker cp` سه بار «Successfully copied» چاپ کرد در حالی که فایل هرگز نرسید
(`docs/execution/00-progress.md:388`).

> **پشتیبان را بیرون از هر پوشهٔ git بگذارید.** یک dump دادهٔ واقعی مشتریان را دارد و
> نباید با یک `git add` اشتباهی وارد تاریخچه شود. این یک بار در همین پروژه اتفاق افتاده
> (`docs/deployment/rollback-plan.md:30-32`). به همین دلیل مسیر پیشنهادی
> `C:\AfraKalaBackups\` است، نه `C:\afrakala\`.

### قدم ۲.۴ — ثابت کنید dump قابل بازگردانی است

**دو سطح راستی‌آزمایی. سطح اول ارزان است، سطح دوم واقعی.**

**سطح ۱ — خواندن فهرست dump (فقط خواندنی، روی پروداکشن بی‌خطر). ✅ الگویش روی تمرین اجرا شد:**

```powershell
docker exec afrakala-lan-db pg_restore --list "/tmp/prod-pre-migration-$stamp.dump" | Select-Object -First 12
```

**چه چیزی باید ببینید** (روی تمرین این خروجی واقعاً گرفته شد، `PG_RESTORE_LIST_EXIT=0`،
۵٬۰۷۳ خط، ۵٬۰۶۲ TOC entry):

```
;
; Archive created at 2026-09-08 ...
;     dbname: postgres
;     TOC Entries: 5xxx
;     Compression: -1
;     Format: CUSTOM
;     Dumped from database version: 15.6
;     Dumped by pg_dump version: 15.6
;
```

**`dbname: postgres` را ببینید و مطمئن شوید** — این تأیید می‌کند پشتیبان از پروداکشن است
و نه از جایی دیگر. اگر `TOC Entries` خیلی کمتر از ۵۰۰۰ بود، dump ناقص است.

> **سطح ۱ کافی نیست.** `pg_restore --list` فقط سرآیند فایل را می‌خواند. یک فایل می‌تواند
> فهرستِ سالم داشته باشد و دادهٔ خراب.

**سطح ۲ — بازگردانی واقعی. این تنها اثبات است.**

> ### 🔴 OWNER DECISION — کجا drill بازگردانی را بزنید
>
> - **(الف) روی ماشین تست — توصیهٔ این سند.** فایل dump را به `192.168.170.8` ببرید و
>   در یک پایگاه‌دادهٔ scratch بازگردانی کنید. **صفر ریسک برای پروداکشن.**
>   *مبادله:* انتقال یک فایل ۲۸ مگابایتی حاوی دادهٔ واقعی مشتریان به ماشین دیگر.
> - **(ب) روی خود لپ‌تاپ پروداکشن، در یک پایگاه‌دادهٔ scratch.**
>   *مبادله:* داده جابه‌جا نمی‌شود، ولی یک `CREATE DATABASE` روی کلاستر پروداکشن می‌زنید.
>   دادهٔ پروداکشن دست نمی‌خورد، ولی این یک نوشتن روی کلاستر است.
> - **(ج) drill را نزنید.** *مبادله:* هیچ. **این یعنی پشتیبان ندارید، امید دارید.**

**دستور drill (گزینهٔ الف، روی ماشین تست). ⚠️ UNREHEARSED برای این dump مشخص:**

```bash
docker exec afrakala-lan-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d afrakala -c "CREATE DATABASE restore_drill_20260908;"'
cat prod-pre-migration-<stamp>.dump | docker exec -i afrakala-lan-db sh -c 'cat > /tmp/drill.dump'
docker exec afrakala-lan-db md5sum /tmp/drill.dump          # باید با md5 مبدأ یکی باشد
docker exec afrakala-lan-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore -U supabase_admin -d restore_drill_20260908 --no-owner --disable-triggers /tmp/drill.dump'
```

**چه چیزی باید ببینید:** `pg_restore` با **exit 1 و حدود ۲۱ خطا** تمام می‌شود و
**این طبیعی است**. در ۲۰۲۶-۰۹-۰۱ دقیقاً همین اتفاق افتاد و همهٔ ۲۱ خطا بی‌ضرر بودند:
۱۹ تا مربوط به `pg_cron` (این extension فقط در پایگاهی به نام `postgres` می‌تواند زندگی
کند و پایگاه drill نامش این نیست) و ۲ تا اشیای vault که از قبل در کانتینر هستند.
**هیچ خطای بارگذاری داده نبود** (`prod-clone-dryrun-20260831.md` §3).

**اثبات نهایی — بشمارید:**

```bash
docker exec afrakala-lan-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d restore_drill_20260908 -tAc "
SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema=''public'') AS tables,
       (SELECT count(*) FROM information_schema.views  WHERE table_schema=''public'') AS views,
       (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=''public'') AS functions,
       (SELECT count(*) FROM pg_policies WHERE schemaname=''public'') AS policies,
       (SELECT count(*) FROM public.persons) AS persons;"'
```

**چه چیزی باید ببینید:** اعدادی نزدیک به `221 | 20 | 823 | 622` — ارقام پروداکشن در
۲۰۲۶-۰۸-۳۱ (`prod-clone-dryrun-20260831.md` §3، جدولی که هر چهار عدد را دقیقاً منطبق نشان
داد). امروز اندکی بالاتر خواهند بود چون از آن تاریخ چیزهایی اضافه شده. `persons` باید
**حدود ۴٬۸۵۱** باشد (`R1-R3-results.md` §6.1، ستون «prod today»).

**اگر `persons` صفر یا خیلی کمتر بود، dump شما داده ندارد و پشتیبان نیست. متوقف شوید.**

**بعد از drill، پایگاه scratch را حذف کنید** تا فضا و سردرگمی نماند:

```bash
docker exec afrakala-lan-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d afrakala -c "DROP DATABASE restore_drill_20260908;"'
```

### قدم ۲.۵ — مسیر پشتیبان را یادداشت کنید

مسیر کامل فایل و md5 آن را جایی بنویسید که سرِ ساعت ۳ بامداد پیدایش کنید.
**پشتیبانی که کسی نمی‌تواند پیدایش کند، پشتیبان نیست**
(`docs/deployment/rollback-plan.md:34`).

---

## فاز ۳ · آشتی‌دادن لجر — ثبت می‌کند، اجرا نمی‌کند

> **این فاز هیچ مهاجرتی را اجرا نمی‌کند.** فقط ردیف در
> `supabase_migrations.schema_migrations` می‌نویسد و به هیچ‌چیز دیگری دست نمی‌زند
> (`ledger-reconcile.sh:2-3`).

**✅ تمرین‌شده، دو بار، به‌علاوهٔ یک تست منفی** (`R1-R3-results.md` §7).

### قدم ۳.۱ — چرا این کار لازم است

لجر روی ۵۶۹ ردیف ایستاده و اسکیما تا ۴۲۴ رفته (قدم ۱.۳). اگر آشتی ندهید، هر کسی — از
جمله خودتان فردا — از روی لجر نتیجه می‌گیرد ۴۱۰ تا ۴۲۴ اجرا نشده‌اند و **دوباره
اجرایشان می‌کند**. چند تای آن‌ها idempotent نیستند.

**هرگز برای «درست کردن شمارش» یک مهاجرت را دوباره اجرا نکنید. ردیف را ثبت کنید.**
این عیناً همان قاعدهٔ `CLAUDE.md` بند ۲b است: «If you find a migration already applied
but unrecorded, RECORD THE ROW — never re-run the migration to make the ledger right».

### قدم ۳.۲ — 🔴 اسکریپت آشتی، نام `postgres` را **رد می‌کند**

**این را قبل از اینکه به آن بربخورید بدانید.** `ledger-reconcile.sh` عمداً نام پایگاهِ
پروداکشن را رد می‌کند — E2، نقل‌قول از `ledger-reconcile.sh:49-51`:

```bash
case "$DB" in
  postgres) echo "REFUSED: '$DB' is production's database name. Wrong machine."; exit 2;;
esac
```

آن گارد برای محافظت از **ایجنت‌ها** نوشته شده، نه از شما. ولی نتیجه‌اش این است که
**اسکریپت همان‌طور که هست روی پروداکشن اجرا نمی‌شود.**

> ### 🔴 OWNER DECISION — OD-4
>
> - **(الف) SQL را دستی اجرا کنید — توصیهٔ این سند.** بدنهٔ SQL اسکریپت در
>   `ledger-reconcile.sh:74-137` است و در قدم ۳.۳ عیناً آورده شده. اسکریپت را دست نزنید.
>   *مبادله:* چند قدم دستی بیشتر؛ در عوض گاردِ ضدِ‌اشتباهِ ایجنت‌ها دست‌نخورده می‌ماند.
> - **(ب) یک کپی از اسکریپت بسازید و گارد را از کپی بردارید.**
>   *مبادله:* راحت‌تر، ولی حالا یک اسکریپت روی دیسک دارید که گاردِ «ماشین اشتباه» ندارد.
>   **فایل اصلی را ویرایش نکنید.**

### قدم ۳.۳ — گزارش بگیرید (بدون نوشتن)

**⚠️ UNREHEARSED روی پروداکشن؛ ✅ روی تمرین دو بار اجرا شد.**

اول باید فهرست «مهاجرت‌هایی که زیر سقف‌اند ولی اجرا نشده‌اند» را بسازید. نسخهٔ تمرینی در
`docs/missions/prodprep/not-applied-rehearsal.txt` است.

> **⚠️ فایل تمرینی را عیناً روی پروداکشن استفاده نکنید.**
> `R1-R3-results.md` §7 صریح است: بند B آن (۴۱۸ و ۴۲۲) توصیف می‌کند *تمرین* چه چیزی را
> نتوانست اعمال کند؛ روی پروداکشن ۴۱۸ احتمالاً اجرا شده. بند A (۲۹تای ۳۳۶–۳۷۰) و بند C
> (۴۲۰، ۴۲۱) منتقل می‌شوند — **بند A فقط اگر کوئری قدم ۱.۱ صفر ردیف داده باشد.**

**فایل پروداکشن را این‌طور بسازید** (یک نسخهٔ ۱۴رقمی در هر خط):

| اگر قدم ۱.۱ … | فایل شما باید داشته باشد |
|---|---|
| سه شیء را **موجود** نشان داد | فقط بند C: `20260903100000` و `20260903140000` |
| سه شیء را **NULL** نشان داد | ⛔ اصلاً به اینجا نرسیده‌اید — OD-1 گفت متوقف شوید |

**اگر قدم ۱.۲ برای ۴۰۸ `NULL` داد**، `20260827100000` را هم اضافه کنید — چون ۴۰۸ اجرا
نشده و نباید در لجر بماند. **ولی این یک مورد خاص است: ردیفش از قبل در لجر هست**
(قدم ۱.۳)، پس اضافه کردنش به این فایل باعث می‌شود در بخش `3b · RECORDED BUT NOT A
CANDIDATE` ظاهر شود — که **دقیقاً همان چیزی است که باید ببینید**، و اسکریپت هرگز آن
ردیف را حذف نمی‌کند.

**دستور، حالت گزارش:**

```bash
export MSYS_NO_PATHCONV=1
# فهرست نامزدها را بسازید: هر مهاجرت با timestamp <= 20260904150000، منهای فایل بالا
ls supabase/migrations/*.sql | xargs -n1 basename | sed 's/_.*//' \
  | awk '$1 <= "20260904150000"' | sort -u > /tmp/all.txt
grep -oE '^[0-9]{14}' not-applied-production.txt | sort -u > /tmp/skip.txt
comm -23 /tmp/all.txt /tmp/skip.txt > /tmp/candidates.txt
wc -l /tmp/all.txt /tmp/skip.txt /tmp/candidates.txt

cat /tmp/candidates.txt | docker exec -i afrakala-lan-db sh -c 'cat > /tmp/reconcile_candidates.txt'
md5sum /tmp/candidates.txt
docker exec afrakala-lan-db md5sum /tmp/reconcile_candidates.txt
```

**دو md5 باید یکی باشند.** اگر نبودند، متوقف شوید — فهرست در راه خراب شده.

سپس فایل SQL گزارش را بسازید و اجرا کنید:

```sql
-- /tmp/reconcile_report.sql
\set ON_ERROR_STOP on
CREATE TEMP TABLE _candidates(version text PRIMARY KEY);
\copy _candidates FROM '/tmp/reconcile_candidates.txt'

CREATE TEMP TABLE _gap AS
  SELECT version FROM _candidates
  EXCEPT SELECT version FROM supabase_migrations.schema_migrations;
CREATE TEMP TABLE _orphan AS
  SELECT version FROM supabase_migrations.schema_migrations
  EXCEPT SELECT version FROM _candidates;

\echo '--- ledger claims -------------------------------------------------'
SELECT count(*) AS ledger_rows, min(version) AS ledger_min, max(version) AS ledger_max
  FROM supabase_migrations.schema_migrations;
\echo '--- schema says applied (candidates) ------------------------------'
SELECT count(*) AS candidate_rows, max(version) AS candidate_max FROM _candidates;
\echo '--- 3a · APPLIED BUT UNRECORDED (this is what gets inserted) ------'
SELECT count(*) AS gap_rows FROM _gap;
SELECT version FROM _gap ORDER BY 1;
\echo '--- 3b · RECORDED BUT NOT A CANDIDATE (never inserted; investigate)'
SELECT count(*) AS orphan_rows FROM _orphan;
SELECT version FROM _orphan ORDER BY 1;
```

```bash
cat /tmp/reconcile_report.sql | docker exec -i afrakala-lan-db sh -c 'cat > /tmp/rr.sql'
docker exec afrakala-lan-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin \
  -d postgres -v ON_ERROR_STOP=1 --single-transaction -f /tmp/rr.sql'
```

**چه چیزی باید ببینید** — این خروجی **واقعی تمرین** است، با اعداد تمرین
(`R1-R3-results.md` §7). اعداد شما فرق می‌کنند؛ **شکلش باید یکی باشد**:

```
--- ledger claims -------------------------------------------------
 ledger_rows |  ledger_min    |   ledger_max
-------------+----------------+----------------
         569 | 20260424144837 | 20260827120000
--- schema says applied (candidates) ------------------------------
 candidate_rows | candidate_max
----------------+----------------
            579 | 20260904150000
--- 3a · APPLIED BUT UNRECORDED (this is what gets inserted) ------
 gap_rows
----------
       10
 20260828000000
 20260828010000
 ...
--- 3b · RECORDED BUT NOT A CANDIDATE (never inserted; investigate)
 orphan_rows
-------------
           0
```

**فهرست `3a` را بخوانید قبل از رفتن به قدم بعد.** آن‌ها ردیف‌هایی هستند که ثبت خواهند شد.
اگر عددی خیلی بزرگ‌تر از ۱۰–۱۵ دیدید، **متوقف شوید و بپرسید چرا** — یعنی فرض شما دربارهٔ
سقف اسکیما یا فایل not-applied غلط است.

`3b` (`orphan_rows`) هرگز چیزی حذف نمی‌کند. اگر غیرصفر بود، فقط یادداشتش کنید. **اگر
`20260827100000` آنجا بود، آن مهاجرت ۴۰۸ است و انتظارش را داشتید** (قدم ۱.۲).

### قدم ۳.۴ — ثبت کنید

**فقط اگر خروجی قدم ۳.۳ منطقی بود.** همان فایل SQL، با این بلاک اضافه‌شده به انتها
(عیناً از `ledger-reconcile.sh:104-131`):

```sql
\echo '--- 4+5 · insert exactly the gap, then assert the count -----------'
DO $reconcile$
DECLARE
  v_gap bigint; v_ins bigint; v_before bigint; v_after bigint;
BEGIN
  SELECT count(*) INTO v_gap    FROM _gap;
  SELECT count(*) INTO v_before FROM supabase_migrations.schema_migrations;

  -- NO `ON CONFLICT`: a collision must raise, not be swallowed.
  INSERT INTO supabase_migrations.schema_migrations (version)
  SELECT version FROM _gap;
  GET DIAGNOSTICS v_ins = ROW_COUNT;

  IF v_ins <> v_gap THEN
    RAISE EXCEPTION 'ledger-reconcile: inserted % rows but the gap was % -- refusing to commit',
      v_ins, v_gap;
  END IF;

  SELECT count(*) INTO v_after FROM supabase_migrations.schema_migrations;
  IF v_after <> v_before + v_gap THEN
    RAISE EXCEPTION 'ledger-reconcile: ledger went % -> %, expected % -- refusing to commit',
      v_before, v_after, v_before + v_gap;
  END IF;

  RAISE NOTICE 'ledger-reconcile: gap=% inserted=% ledger %->% (asserted)',
    v_gap, v_ins, v_before, v_after;
END
$reconcile$;
```

**چه چیزی باید ببینید:**

```
NOTICE:  ledger-reconcile: gap=10 inserted=10 ledger 569->579 (asserted)
```

و exit code صفر.

**چرا `ON CONFLICT DO NOTHING` اینجا نیست، و چرا این مهم است:** `ON CONFLICT` روی برخورد
`INSERT 0 0` چاپ می‌کند و **exit 0** می‌دهد — یعنی نمی‌شود «قبلاً ثبت شده» را از «کس دیگری
مالک این نسخه است» تشخیص داد. این تله روی تمرین **جداگانه آزموده شد** و هر دو نیمه‌اش
مشاهده شد (`R1-R3-results.md` §7، تست منفی):

```
=== A · ON CONFLICT DO NOTHING on a version that is ALREADY THERE (the trap) ===
INSERT 0 0                          <-- no error. This is how 517 nearly went unrecorded.

=== B · the reconcile code path, with a version someone else already owns ===
ERROR:  duplicate key value violates unique constraint "schema_migrations_pkey"
DETAIL:  Key (version)=(20260904150000) already exists.
```

**اگر خطای `duplicate key` دیدید، متوقف شوید.** یعنی نسخه‌ای که می‌خواستید ثبت کنید از
قبل آنجاست و فهرست نامزدهای شما غلط است. تراکنش کامل rollback شده و لجر دست‌نخورده مانده.

### قدم ۳.۵ — دوباره اجرا کنید (اثبات idempotency)

**✅ تمرین‌شده.** بلافاصله همان دستور را دوباره بزنید:

```
NOTICE:  ledger-reconcile: gap=0 inserted=0 ledger 579->579 (asserted)
```

**`gap=0` یعنی کار تمام است.** اگر باز هم عدد غیرصفر داد، چیزی بین دو اجرا عوض شده —
متوقف شوید.

---

## فاز ۴ · ۷۴ مهاجرت

> **⚠️ این فاز مهم‌ترین پیام سند را دارد: به احتمال زیاد تا انتها نمی‌رسید،
> و این طبیعی است.** روی تمرین از ۷۴ تا، **۶۰ تا نشستند و ۱۴ تا رد شدند**
> (`R4-R5-results.md` §2، جدول کامل و totals).

### ۴.۰ · نحوهٔ اجرا — الگویی که هر ۷۴ بار روی تمرین کار کرد

**✅ تمرین‌شده — هر ۷۴ فایل، md5 روی هر دو سمت تأیید شد، صفر عدم‌تطابق**
(`R4-R5-results.md` §1).

برای **هر** مهاجرت، سه دستور. `<file>` مسیر فایل روی هاست، `<n>` شمارهٔ ترتیب از پیوست ب:

```bash
export MSYS_NO_PATHCONV=1
# ۱) تحویل با stdin — هرگز pipe به psql
cat "supabase/migrations/<file>" | docker exec -i afrakala-lan-db sh -c "cat > /tmp/m_<n>.sql"

# ۲) md5 روی هر دو سمت، قبل از اینکه psql فایل را ببیند
md5sum "supabase/migrations/<file>"
docker exec afrakala-lan-db md5sum "/tmp/m_<n>.sql"

# ۳) اعمال
docker exec afrakala-lan-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin \
  -d postgres --no-psqlrc -v ON_ERROR_STOP=1 --single-transaction -f /tmp/m_<n>.sql'
echo "EXIT=$?"
```

**اگر دو md5 یکی نبودند، `psql` را اجرا نکنید.** فایل خراب رسیده. دوباره تحویل دهید.

**بعد از هر اعمال موفق، ردیف لجر را ثبت کنید** — نسخه، همان ۱۴ رقم اول نام فایل است:

```bash
docker exec afrakala-lan-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin \
  -d postgres -v ON_ERROR_STOP=1 --single-transaction -c "
DO \$r\$
DECLARE v_before bigint; v_after bigint;
BEGIN
  SELECT count(*) INTO v_before FROM supabase_migrations.schema_migrations;
  INSERT INTO supabase_migrations.schema_migrations (version) VALUES (''<14-digit>'');
  SELECT count(*) INTO v_after FROM supabase_migrations.schema_migrations;
  IF v_after <> v_before + 1 THEN
    RAISE EXCEPTION ''ledger did not move by exactly one: % -> %'', v_before, v_after;
  END IF;
END \$r\$;"'
```

**بدون `ON CONFLICT`، عمداً.** روی تمرین همهٔ ۶۰ ثبت با همین الگو انجام شد و هر کدام
`ROW_COUNT = 1` را assert کرد؛ لجر ۵۷۹ → ۶۳۹ رفت (`R4-R5-results.md` §1).

### ۴.۰.۱ · دو چیزی که خواهید دید و **خرابی نیستند**

1. **`WARNING: there is already a transaction in progress`** و بعدش
   `WARNING: there is no transaction in progress`. شش مهاجرت `BEGIN;`/`COMMIT;` خودشان
   را دارند — ترتیب‌های ۳۱ (۴۶۶)، ۶۵ (۵۱۲)، ۶۷ (۵۱۳)، ۷۰ (۵۱۴)، ۷۱ (۵۱۶)، ۷۳ (۵۱۷).
   زیر `--single-transaction` این هشدارها بی‌ضررند (`R4-R5-results.md` §6.6).
   **ولی بدانید چه معنایی دارند:** پوشش اتمی برای این شش تا مالِ خودِ فایل است، نه psql،
   و `COMMIT;` فایل تراکنش بیرونی را زودتر می‌بندد. برای این شش تا چیزی بعد از `COMMIT;`
   نیست، پس تفاوتی نمی‌کند.
2. **NOTICEهای فارسی.** روی تمرین شش مهاجرت NOTICE فارسی چاپ کردند و همه سالم رسیدند،
   مثل `D-52: هر چهار assert برقرار است.` و `D-55: allocation_rows قبل=0 ، حذف‌شده=0`
   (`R4-R5-results.md` §1، §3). **اگر به‌جای فارسی `?????` دیدید، فوراً متوقف شوید** —
   یعنی فایل از یک pipe رد شده و متن نابود شده است.

### ۴.۰.۲ · دو دستهٔ شکست — این تقسیم‌بندی مفیدترین چیز این فصل است

روی تمرین ۱۴ شکست ثبت شد و **در دو دستهٔ کاملاً متفاوت** طبقه‌بندی شدند
(`R4-R5-results.md` §4):

| دسته | تعداد | معنی برای شما |
|---|---|---|
| **(الف) نقص واقعی** | **۶** (۴۴۹، ۴۵۰، ۴۵۲، ۴۶۰، ۵۰۷ + ۴۷۵ به‌عنوان cascade ۴۶۰) | **روی پروداکشن هم رد می‌شوند، هر چه پیش‌آمد.** |
| **(ب) حفرهٔ ۳۳۶–۳۷۰** | **۷** (۴۷۶، ۴۷۷، ۴۷۸، ۴۸۷ + ۴۹۷ ← ۵۱۴ ← ۵۱۶) | **اگر قدم ۱.۱ سه شیء را موجود نشان داده، این هفت‌تا کلاً ناپدید می‌شوند.** |
| **(ب′) حفرهٔ ۴۰۸** | **۱** (۴۶۲) | بستگی به قدم ۱.۲ دارد |

**این تفکیک را جدی بگیرید:** اگر preflightهای شما تمیز بودند، انتظار **شش** شکست را
داشته باشید، نه چهارده. و آن شش، شش نقص واقعی‌اند که باید برایشان تصمیم بگیرید.

### ۴.۰.۳ · یک تفاوت بزرگ بین تمرین و پروداکشن

**روی تمرین، اجرا بعد از هر شکست ادامه پیدا کرد** — عمداً، تا cascadeها دیده شوند.
**روی پروداکشن این‌طور نیست:** با `-v ON_ERROR_STOP=1`، **اولین شکست اجرا را تمام
می‌کند** (`R4-R5-results.md` §6.5). یعنی اگر ۴۴۹ در قدم ۱۵ رد شود، قدم‌های ۱۶ تا ۷۴
اصلاً اجرا نمی‌شوند.

**نتیجهٔ عملی: هر شکست بعد از اولی، برای شما فرضی است.** جدول پیوست ب همهٔ ۱۴ را نشان
می‌دهد چون تمرین ادامه داد؛ شب اجرای شما در اولین شکست می‌ایستد.

### ۴.۰.۴ · زمان‌بندی

**✅ اندازه‌گیری‌شده:** کل ۷۴ اعمال روی تمرین **۳۱٫۸ ثانیه** طول کشید (۳۱٬۸۴۸ میلی‌ثانیه)،
میانگین حدود ۴۳۰ میلی‌ثانیه هرکدام (`R4-R5-results.md` §2، totals).

**⚠️ این یک کف است، نه یک برآورد.** دادهٔ تمرین یک هفته کهنه و کوچک‌تر است:
`journal_entries` روی تمرین **صفر** ردیف دارد و روی پروداکشن **۱۵**؛ `audit_logs`
۹۱٬۵۴۸ در برابر ۱۰۷٬۷۱۳ (`R4-R5-results.md` §6.3). مهاجرت‌های ۴۸۷/۴۸۸/۴۸۹/۴۹۱ مسیر
حسابداری تعهدی را روی تمرین **تقریباً اصلاً تمرین نکردند**، چون رکوردی نبود.
**زمان کل اجرا را چند دقیقه در نظر بگیرید، نه ۳۲ ثانیه.**

---

### گروه ۱ · ترتیب‌های ۱ تا ۱۴ — بازنشستگی و پاک‌سازی

**۴۲۰، ۴۲۱، ۴۲۵، ۴۳۰، ۴۳۱، ۴۳۲، ۴۳۵، ۴۳۶، ۴۴۶، ۴۴۳، ۴۴۵، ۴۳۷، ۴۴۷، ۴۴۸**

**✅ هر ۱۴ تا روی تمرین موفق. صفر شکست.** (`R4-R5-results.md` §2، ردیف‌های ۱–۱۴)

**نکته‌ای که سرِ ترتیب ۱ و ۲ باید بدانید:** ۴۲۰ و ۴۲۱ اول صف‌اند ولی تاریخشان
(`20260903`) از سقف پروداکشن (`20260904150000`) **قدیمی‌تر** است. این خطا نیست — پروداکشن
این دو فایل را اصلاً در checkout خودش ندارد (`469fe0a9`، ۶۱۰ فایل، تأییدشده با
`git ls-tree` — `R1-R3-results.md` §2). ولی یعنی اجرا از *پیش از* سقف فعلی شروع می‌شود
و ممیزی هم همین را هشدار داده (سطر ۴۱۶).

**مهاجرت‌های `[schema+data]` این گروه** — «چه داده‌ای جابه‌جا می‌کند» از ممیزی
(`production-audit-2026-09-07.md:338-348`)، «چند ردیف روی تمرین» از R-4:

| # | چه داده‌ای | ردیف روی تمرین (ins/upd/del) | برگشت‌پذیر؟ |
|---|---|---|---|
| ۴۲۰ | دلیل ردِ پیش‌فاکتور مهمان | 9/3/8 | **فقط با بازگردانی پشتیبان** — فایل down ندارد |
| ۴۲۱ | متن پیام ردِ مهمان | 5/1/5 | **فقط با بازگردانی پشتیبان** |
| ۴۳۰ | الزام کد و موبایل در import آسان | 12/2/7 | **فقط با بازگردانی پشتیبان** |
| ۴۳۲ | provenance و revert دسته‌های import آسان | 35/6/7 | **فقط با بازگردانی پشتیبان** |
| ۴۳۵ | حذف شخص وقتی سابقه ندارد | 21/6/6 | **فقط با بازگردانی پشتیبان** |
| ۴۳۶ | بستن تشدید گرنت نقش `anon` | 12/21/12 | **فقط با بازگردانی پشتیبان** |
| ۴۳۷ | ثبت شناسهٔ آسان در ساخت درجا | 4/2/4 | ✅ `docs/verification/437-down.sql` موجود — **⚠️ UNREHEARSED، هرگز اجرا نشده** |

> **🔴 عدد `ins/upd/del` را درست بخوانید.** این **دلتای tuple کل پایگاه‌داده** است
> (`pg_stat_database`، بلافاصله قبل و بعد از هر اعمال) و **شامل تغییرات کاتالوگ سیستم
> هم هست**. یک مهاجرت کاملاً DDL که فقط یک تابع می‌سازد هم `9/3/8` نشان می‌دهد
> (`R4-R5-results.md` §1). **این شمارش ردیفِ کسب‌وکار نیست.**
>
> چرا جایگزین بهتری نبود: command tag سطح بالای psql برای **۷۰ تا از ۷۴** صفر است، چون
> تقریباً همهٔ DML این فایل‌ها داخل بلاک `DO $$ … $$` است و بلاک `DO` هیچ tag نمی‌دهد.
> **شمارش ردیفِ کسب‌وکارِ هر مهاجرت اندازه‌گیری نشده** و برای همین در این سند نیامده.
> شش عددِ قابل‌اعتماد آن‌هایی هستند که خودِ مهاجرت NOTICE کرده و در §۴.۹ آمده‌اند.

**اگر مهاجرتی از این گروه رد شد، «اشتباه» یعنی چه:** این گروه روی تمرین ۱۴ از ۱۴ گذشت،
پس **هر شکستی اینجا غیرمنتظره است.** متوقف شوید و پیام خطا را بخوانید. اگر پیام نام یک
شیء غایب را می‌برد، احتمالاً حفره‌ای در پایگاه شماست که preflight نگرفته.

**🛑 نقطهٔ توقف ۱ — بعد از ترتیب ۱۴.** خروجی هر ۱۴ را نگاه کنید. اگر همه exit 0 داده‌اند،
ادامه دهید.

---

### گروه ۲ · ترتیب‌های ۱۵ تا ۲۴ — بازنشستگی جدول‌ها و گزارش‌های مالی

**۴۴۹، ۴۵۰، ۴۵۱، ۴۵۲، ۴۵۳، ۴۵۴، ۴۵۵، ۴۵۷، ۴۵۸، ۴۵۹**

**⛔ اجرای شما به‌احتمال قوی در همان ترتیب ۱۵ می‌ایستد.**

**✅ تمرین‌شده — سه شکست دستهٔ (الف)**، خروجی verbatim (`R4-R5-results.md` §4.1):

```
[15] ERROR:  449: daily_capital_snapshots expected 10 rows, found 0
     CONTEXT:  PL/pgSQL function inline_code_block line 12 at RAISE
[16] ERROR:  450: backup_142 expected 18 rows, found 16
     CONTEXT:  PL/pgSQL function inline_code_block line 11 at RAISE
[18] ERROR:  452: rows were lost in the rename (142=16, 0722=16)
     CONTEXT:  PL/pgSQL function inline_code_block line 20 at RAISE
```

**چرا این‌ها دستهٔ (الف)اند و روی پروداکشن هم رد می‌شوند:** هیچ‌کدام نام شیئی از ماژول
۳۳۶–۳۷۰ را نمی‌برد. هر سه یک **عدد مطلق** را assert می‌کنند که موقع نوشتنِ مهاجرت از
پایگاه **تست** خوانده شده. پایگاه پروداکشن دادهٔ دیگری دارد. ۴۵۲ حقیقت را یک خط قبل از
abort خودش چاپ می‌کند: `452: backup_142=16 rows, backup_20260722=16 rows, live
dynamic_parameter_weights=16 rows` و بعد ۱۸ می‌خواهد.

**۱۸ (۴۵۲) cascade ۱۶ (۴۵۰) نیست** — هر دو مستقلاً همان ثابت را assert می‌کنند و ۴۵۲
جدول را rename می‌کند چه ۴۵۰ اجرا شده باشد چه نه.

**این پنجمین بار است که همین نقص در این پروژه دیده می‌شود** — قبلاً مهاجرت‌های ۴۱۰ و ۴۱۸
(`R1-R3-results.md` §3). ۴۱۸ روی تمرین abort کرد با `418: expected 9 accepted quotes,
found 151` در حالی که ۱۵۱ عدد **پروداکشن** است.

> ### 🔴 OWNER DECISION — OD-5
>
> برای هر سه (۴۴۹، ۴۵۰، ۴۵۲) — یک تصمیم مشترک:
>
> - **(الف) هر سه را رد کنید و ردیف لجرشان را ثبت نکنید.**
>   *مبادله:* برگشت‌پذیرترین گزینه — هیچ‌چیز روی پروداکشن تغییر نمی‌کند و بدهی ثبت‌شده
>   می‌ماند. ولی جدول‌های قدیمی (`daily_capital_snapshots`، `dynamic_parameter_weights_backup_*`)
>   بازنشسته نمی‌شوند. **توصیهٔ این سند برای امشب.**
> - **(ب) عدد ثابت را در فایل مهاجرت شل کنید** (مثلاً `<> 18` به `< 1`) و اجرا کنید.
>   *مبادله:* مهاجرت‌ها می‌نشینند، ولی **شما فایل مهاجرت را ویرایش کرده‌اید** — که
>   `CLAUDE.md` قاعدهٔ ۶ ممنوع می‌کند («Never edit an existing migration file. Add a new
>   one»). و **برگشت‌ناپذیر است**: ۴۵۰ جدول drop می‌کند و ۴۵۲ rename می‌کند، هیچ‌کدام
>   فایل down ندارند. بازگشت فقط با بازگردانی پشتیبان.
> - **(ج) بگذارید اجرا بایستد** و فردا با نویسندهٔ این سه مهاجرت حل کنید.
>   *مبادله:* ۵۹ مهاجرت باقی‌مانده امشب نمی‌نشینند.

**اگر (الف) را انتخاب کردید**، از ترتیب ۱۹ (۴۵۳) ادامه دهید. **ترتیب ۱۷ (۴۵۱) را جا
نیندازید** — روی تمرین موفق بود.

**مهاجرت‌های `[schema+data]` این گروه:** ممیزی هر ده تا را `[schema]` علامت زده
(`production-audit-2026-09-07.md:349-360`) — **هیچ‌کدام دادهٔ کسب‌وکار جابه‌جا نمی‌کند.**
۴۵۳ تنها یکی از این گروه است که فایل down دارد (`docs/verification/453-down.sql`،
**⚠️ UNREHEARSED**).

**🛑 نقطهٔ توقف ۲ — بعد از ترتیب ۲۴.** «اشتباه» اینجا یعنی: شکستی که پیامش **جدول یا
ستونی را نام می‌برد که انتظارش را ندارید** (به‌جای عدد ثابت). سه شکستِ بالا انتظاری‌اند؛
هر چیز دیگری نیست.

---

### گروه ۳ · ترتیب‌های ۲۵ تا ۴۰ — امنیت، گیت‌ها و مجوزها

**۴۶۰، ۴۶۱، ۴۶۲، ۴۶۳، ۴۶۴، ۴۶۵، ۴۶۶، ۴۶۷، ۴۶۸، ۴۶۹، ۴۷۰، ۴۷۱، ۴۷۵، ۴۷۶، ۴۷۷، ۴۷۸**

**پرحادثه‌ترین گروه.** روی تمرین شش شکست: ۴۶۰ (الف)، ۴۶۲ (ب′)، ۴۷۵ (الف، cascade ۴۶۰)،
۴۷۶ / ۴۷۷ / ۴۷۸ (ب).

#### ۴.۳.۱ — 🔴 ترتیب ۲۵ · مهاجرت ۴۶۰ · **abort می‌کند، «بدون تغییر» نمی‌دهد**

**این مهم‌ترین اصلاحِ این سند نسبت به ممیزی است.**

ممیزی در سطر ۴۰۹ نوشته انتظار `UPDATE 0` یا «بدون تغییر» را داشته باشید، چون شما در
۲۰۲۶-۰۹-۰۷ دستی درستش کردید. **آن انتظار روی تمرین آزموده شد و رد شد**
(`R4-R5-results.md` §5.1).

**علت ریشه‌ای:** ۴۶۰ سطرهایش را با **UUID ثابت** آدرس می‌دهد، و آن UUIDها مالِ پایگاه
**تست**‌اند. سرآیند خودِ مهاجرت می‌گوید این شناسه‌ها «measured 2026-09-06 on the
`afrakala` database». **روی پروداکشن وجود ندارند.**

| | پروداکشن (از dump ۳۱ اوت) | تست `afrakala` | آنچه ۴۶۰ hard-code کرده |
|---|---|---|---|
| provider ابری | `f6a5bc04-…` نام `gpt` | `0fbe576a-…` نام `for ocr` | `0fbe576a-9ef3-475b-92e7-fabd981a7d5d` |
| provider محلی | `e07894ce-…` نام `ollama` | `d30816a9-…` نام `ollama` | `d30816a9-8ff0-4d0e-8f25-0661f8cbea61` |

**اثبات — اصلاحِ دستی شما شبیه‌سازی شد، در مساعدترین شکل ممکن** (به ollama حتی قابلیت
`vision` که ندارد داده شد)، و ۴۶۰ باز هم raise کرد. تراکنش rollback شد:

```
=== 3. state AFTER the fix — this is what 460 lands on in production ===
 receipt_ocr.vision | ollama | e07894ce-… | is_enabled=t | fallback_enabled=f | gpt_is_active=f

=== 4. now run migration 460 against that already-correct state ===
psql:/tmp/r4_25.sql:172: ERROR:  460: the local ollama provider d30816a9-8ff0-4d0e-8f25-0661f8cbea61
                         is missing, inactive, does not declare vision, or has no vision_model;
                         refusing to leave receipt OCR pointed at a cloud provider
```

**آن `RAISE EXCEPTION` رفتار درستِ مهاجرت است** — دارد از شما در برابر رها کردنِ OCR روی
یک provider ابری محافظت می‌کند. مشکل این است که نمی‌تواند سطرهای پروداکشن را **بشناسد**،
چه اصلاح‌شده چه نشده.

> ### 🔴 OWNER DECISION — OD-6
>
> - **(الف) ۴۶۰ را رد کنید و ردیف لجرش را ثبت نکنید — توصیهٔ این سند.**
>   شیء از قبل در وضعیت مطلوب است (شما در ۲۰۲۶-۰۹-۰۷ درستش کردید)، پس **مهاجرت کاری برای
>   انجام دادن ندارد.**
>   *مبادله:* **کاملاً برگشت‌پذیر — هیچ‌چیز تغییر نمی‌کند.** ولی پینِ OCR در برابر یک
>   `UPDATE` یا ری‌دیپلوی بعدی محافظت‌نشده می‌ماند، دقیقاً همان‌طور که ممیزی در سطر ۴۱۴
>   هشدار داده. **و ۴۷۵ در ترتیب ۳۷ هم رد خواهد شد** (پایین‌تر).
> - **(ب) UUIDها را در فایل مهاجرت به UUIDهای پروداکشن ویرایش کنید** (از قدم ۱.۵)، بعد
>   اجرا کنید.
>   *مبادله:* پین دائمی می‌شود. ولی `CLAUDE.md` قاعدهٔ ۶ ویرایش فایل مهاجرت موجود را
>   ممنوع می‌کند، و **برگشت‌پذیر نیست** — دو `UPDATE` بدون‌شرط دارد. **و حتی با UUID درست
>   هم ممکن است رد شود:** روی پروداکشن `ollama` قابلیت `vision` را **ندارد**
>   (`capabilities={chat,embeddings}` — قدم ۱.۵)، و ۴۶۰ آن را الزام می‌کند.
> - **(ج) یک مهاجرت جدید بنویسید** که همان کار را با آدرس‌دهی بر اساس `(name, kind,
>   base_url)` انجام دهد، نه UUID.
>   *مبادله:* درست‌ترین راه، ولی امشب آماده نیست.

**نکته‌ای برای هر گزینه‌ای که انتخاب کنید:** دو `UPDATE` مهاجرت ۴۶۰ **بدون شرط**اند
(`SET provider_id = …, updated_at = now() WHERE service_key = 'receipt_ocr.vision'`).
یعنی حتی وقتی مقدار عوض نمی‌شود، **سطر فیزیکاً بازنویسی و `updated_at` جابه‌جا می‌شود**
(`R4-R5-results.md` §5.1). **پس یک `updated_at` تازه را نشانهٔ نویسندهٔ دوم نخوانید.**

#### ۴.۳.۲ — ترتیب ۲۷ · مهاجرت ۴۶۲ · دستهٔ (ب′)

اگر قدم ۱.۲ برای ۴۰۸ `NULL` داد، اینجا abort می‌کند:

```
[27] ERROR:  function public.hold_credit_for_quote(uuid, uuid) does not exist
```

تصمیمش OD-2 است و از قبل گرفته‌اید.

#### ۴.۳.۳ — ترتیب ۳۷ · مهاجرت ۴۷۵ · cascade ۴۶۰، و **پیامش گمراه‌کننده است**

```
[37] ERROR:  475 VERIFY: receipt_ocr.vision is no longer pinned, enabled and fallback-off
             against the LAN Ollama provider. 475 does not write to this table, so this means
             the state changed underneath it - stop and investigate before trusting the audit trail
```

**آن جملهٔ «the state changed underneath it — stop and investigate» روی پروداکشن دروغ
است.** هیچ‌چیز زیر پایش عوض نشده؛ فقط ۴۶۰ هرگز اجرا نشده
(`R4-R5-results.md` §4.5). **دنبال یک نویسندهٔ همزمان نگردید — وجود ندارد.**

اگر OD-6 گزینهٔ (الف) را انتخاب کردید، ۴۷۵ هم به همان دلیل رد می‌شود. رفتار یکسان: رد
کنید، ردیف لجرش را ثبت نکنید، به‌عنوان بدهی ثبت کنید.

#### ۴.۳.۴ — ترتیب‌های ۳۸، ۳۹، ۴۰ · دستهٔ (ب) — **اگر preflight تمیز بود، اتفاق نمی‌افتند**

```
[38] 476: ERROR:  function public.jalali_year(date) does not exist
[39] 477: ERROR:  relation "public.document_attachments" does not exist
[40] 478: ERROR:  column pv.reversed_at does not exist
```

هر سه شیئی را نام می‌برند که در بازهٔ ۳۳۶–۳۷۰ ساخته می‌شود
(`R4-R5-results.md` §4.4، جدول ردیابی به سازندهٔ هرکدام). **اگر قدم ۱.۱ سه شیء را موجود
نشان داد، هر سه می‌گذرند.**

> **یک ریسک نهفته در ۴۷۷ که باید بدانید، حتی اگر بگذرد.** ۴۷۷ یک پیمایش کاتالوگ‌محور
> **نیست**. یک فهرست **hard-coded از ۳۹۰ دستور `REVOKE`** است که از کاتالوگ پایگاه تست
> تولید شده؛ در ۶۳۱ خطش هیچ کوئری‌ای به `pg_class`، `pg_tables`، `information_schema`
> یا `relkind` نیست (`R4-R5-results.md` §4.4، `grep -c '^REVOKE'` → 390).
> **پس: جدولی که روی تست هست و روی پروداکشن نیست، کل مهاجرت را abort می‌کند** — دقیقاً
> همان کاری که `document_attachments` در خط ۲۹۸ کرد. **و جدولی که روی پروداکشن هست و
> روی تست نیست، بی‌سروصدا با گرنت `anon` رها می‌شود.** تمرین ۱۹۹ جدول anon-خوان دارد در
> برابر ۲۰۲ روی پروداکشن (`R1-R3-results.md` §6.9) — آن سه تا، هرچه باشند، بیرون فهرست
> ۴۷۷ می‌مانند.

**مهاجرت‌های `[schema+data]` این گروه** (`production-audit-2026-09-07.md:362-377`):

| # | چه داده‌ای | تمرین (ins/upd/del) | برگشت‌پذیر؟ |
|---|---|---|---|
| ۴۶۰ | پینِ مسیر OCR در `ai_usage_routes` + غیرفعال‌کردن provider ابری | **رد شد** — 0/0/0 | ندارد؛ دو `UPDATE` بدون‌شرط |
| ۴۶۱ | گیت `hold_credit`/`release_credit` | 8/8/7 | **فقط بازگردانی پشتیبان** |
| ۴۶۲ | گاردهای DEFINER ردهٔ پولی | **رد شد** — 5/11/2 | **فقط بازگردانی پشتیبان** |
| ۴۶۳ | گاردهای DEFINER ردهٔ هویت | 6/8/5 | **فقط بازگردانی پشتیبان** |
| ۴۶۴ | گاردهای DEFINER ردهٔ کاتالوگ | 3/14/3 | **فقط بازگردانی پشتیبان** |
| ۴۶۵ | گاردهای DEFINER ردهٔ housekeeping | 13/14/12 | **فقط بازگردانی پشتیبان** |
| ۴۶۸ | الزام کلید معتبر برای نویسنده‌های `bot_*` | 26/12/26 | **فقط بازگردانی پشتیبان** |
| ۴۶۹ | تست مثبت `service_role` در RPCهای نرخ بازار | 9/9/8 | **فقط بازگردانی پشتیبان** |
| ۴۷۵ | ثبت audit تغییرات مسیریابی هوش مصنوعی | **رد شد** — 12/0/0 | **فقط بازگردانی پشتیبان** |
| ۴۷۸ | پرداخت جزئی خرید | **رد شد** — 0/0/0 | ✅ `docs/verification/478-down.sql` — **⚠️ UNREHEARSED** |

**🛑 نقطهٔ توقف ۳ — بعد از ترتیب ۴۰.** «اشتباه» اینجا یعنی: شکستی که **نه** یکی از شش
موردِ بالا باشد. اگر مثلاً ۴۶۳ یا ۴۶۵ رد شد، متوقف شوید — آن‌ها روی تمرین گذشتند و
پیامشان چیزی دربارهٔ حالت واقعی پروداکشن می‌گوید که ما نمی‌دانیم.

---

### گروه ۴ · ترتیب‌های ۴۱ تا ۵۶ — تخصیص سرمایه و حسابداری تعهدی

**۴۸۱، ۴۸۲، ۴۸۳، ۴۸۴، ۴۸۵، ۴۸۶، ۴۸۷، ۴۸۸، ۴۸۹، ۴۹۰، ۴۹۱، ۴۹۲، ۴۹۳، ۴۹۴، ۴۹۵**

**✅ ۱۵ از ۱۶ روی تمرین موفق. یک شکست: ۴۸۷، دستهٔ (ب).**

```
[47] 487: ERROR:  column "doc_kind" does not exist
```

`journal_entries.doc_kind` را مهاجرت `20260818155000` می‌سازد — عضو بازهٔ ۳۳۶–۳۷۰.
**اگر preflight تمیز بود، این هم می‌گذرد.**

**سنگین‌ترین گروه از نظر دادهٔ واقعی.** سه جدول تازه اینجا ساخته می‌شود — **۴۸۱**
`allocation_rows` و **۴۸۶** `chart_of_accounts` (به‌علاوهٔ ۴۹۸ در گروه ۵). ممیزی
(سطر ۴۴۳–۴۴۵) هشدار می‌دهد: **بدون بستن `ALTER DEFAULT PRIVILEGES` (قدم ۱.۴)، این سه
جدول همان شب با گرنت `anon` متولد می‌شوند.**

**خبر خوب، اندازه‌گیری‌شده:** روی تمرین هر سه جدولِ ساخته‌شده (`allocation_rows`،
`call_log_extensions`، `chart_of_accounts`) به‌علاوهٔ view `vw_supplier_payables`
**هیچ گرنت `anon` نگرفتند** — چون مهاجرت‌های جدیدتر دستی revoke می‌کنند، مثلاً
`20260906170000_481_allocation_rows.sql:659` → `REVOKE ALL ON TABLE public.allocation_rows
FROM anon;` (`R4-R5-results.md` §4.3). **ولی توابع چنین عادتی ندارند** — و همان ۲۶ تابعی
که در قدم ۱.۴ آمد، از همین‌جا می‌آیند.

**مهاجرت‌های `[schema+data]` این گروه** (`production-audit-2026-09-07.md:378-395`):

| # | چه داده‌ای | تمرین (ins/upd/del) | برگشت‌پذیر؟ |
|---|---|---|---|
| ۴۸۱ | ساخت `allocation_rows` + ۳۱ FK به `persons` | 208/14/6 — بیشترین insert کل اجرا | ✅ `481-down.sql` — **⚠️ UNREHEARSED** |
| ۴۸۲ | RPCهای تخصیص | 23/12/0 | ✅ `482-down.sql` — **⚠️ UNREHEARSED** |
| ۴۸۳ | تریگرهای audit روی نوشتن `allocation_rows` | 21/7/6 | **فقط بازگردانی پشتیبان** |
| ۴۸۴ | بازنشستگی `capital_allocation_ledger` (**rename**) | 11/7/6 | **فقط بازگردانی پشتیبان** — rename برگشت‌ناپذیر |
| ۴۸۵ | پر کردن شکاف‌های `role_permissions` | 3/0/0 · خودش گفت: **`485: role_permissions now 189 rows, 0 gaps`** | **فقط بازگردانی پشتیبان** |
| ۴۸۶ | ساخت `chart_of_accounts` + seed | 103/12/0 | **فقط بازگردانی پشتیبان** |
| ۴۸۸ | ثبت تعهدی فروش | 18/5/7 | **فقط بازگردانی پشتیبان** |
| ۴۸۹ | ثبت تعهدی خرید | 9/3/0 | **فقط بازگردانی پشتیبان** |
| ۴۹۱ | مسیرهای لغو تعهدی | 16/5/7 | **فقط بازگردانی پشتیبان** |
| ۴۹۲ | اعلان روزانهٔ تعهدی | 3/3/0 | **فقط بازگردانی پشتیبان** |
| ۴۹۴ | clamp ماندهٔ پرداخت خرید | 5/1/4 | **فقط بازگردانی پشتیبان** |
| ۴۹۵ | پرداخت ضمنی به‌عنوان مانده | 5/1/5 | **فقط بازگردانی پشتیبان** |

> **⚠️ ۴۸۸، ۴۸۹، ۴۹۱ و ۴۹۲ روی تمرین تقریباً هیچ کاری نکردند** چون
> `journal_entries` روی تمرین **صفر** ردیف دارد و روی پروداکشن **۱۵**
> (`R4-R5-results.md` §6.3). **اعداد این چهار ردیف کمترین ارزش را دارند.**
> روی پروداکشن مسیر تعهدی واقعاً اجرا می‌شود.

**🛑 نقطهٔ توقف ۴ — بعد از ترتیب ۵۶ (۴۹۵).** «اشتباه» اینجا یعنی: هر شکستی به‌جز ۴۸۷،
**یا** موفقیتِ ۴۸۴ بدون NOTICE — ۴۸۴ یک جدول را rename می‌کند و اگر بی‌صدا بگذرد، قبل از
ادامه بررسی کنید که `capital_allocation_ledger` واقعاً به نام تازه رفته باشد.

---

### گروه ۵ · ترتیب‌های ۵۷ تا ۶۲ — تلفن و نویسنده‌های cron

**۴۹۷، ۴۹۸، ۵۰۴، ۵۰۵، ۵۰۶، ۵۰۷**

**دو شکست روی تمرین: ۴۹۷ (ب، cascade ۴۷۷) و ۵۰۷ (الف).**

#### ۴.۵.۱ — ترتیب ۵۷ · ۴۹۷ · cascade ۴۷۷

```
[57] ERROR:  497: anon holds SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on call_logs
```

۴۷۷ می‌بایست این گرنت‌ها را برمی‌داشت؛ `call_logs` گرنت `anon=arwdDxt` را از
default ACL دارد (`R4-R5-results.md` §4.5). **اگر ۴۷۷ گذشت، ۴۹۷ هم می‌گذرد.**
اگر ۴۹۷ رد شد، ۵۱۴ و ۵۱۶ در گروه ۶ هم پشت سرش رد می‌شوند.

#### ۴.۵.۲ — 🔴 ترتیب ۶۲ · ۵۰۷ · دستهٔ (الف) — **روی تست غیرقابل‌دیدن است**

```
[62] ERROR:  507: anon must not reach either function
     CONTEXT:  PL/pgSQL function inline_code_block line 19 at RAISE
```

**این نه cascade است و نه ساختگیِ تمرین.** هر دو تابعِ موضوعِ ۵۰۷ در همین اجرا با موفقیت
ساخته شدند (۴۹۲ در ترتیب ۵۲ و ۵۰۴ در ترتیب ۵۹). ۵۰۷ از `PUBLIC` و `authenticated`
revoke می‌کند و بعد assert می‌کند anon نمی‌رسد. اندازه‌گیری بلافاصله بعد
(`R4-R5-results.md` §4.3):

```
 notify_accountants_daily_accrual_summary | {postgres=X/…,authenticated=X/…,service_role=X/…} | anon_exec=f
 roll_employee_daily_streaks              | {postgres=X/…,anon=X/supabase_admin,…}            | anon_exec=t
```

`roll_employee_daily_streaks` یک گرنت **صریح** `anon=X` دارد که از default ACL آمده، و
`REVOKE … FROM PUBLIC` آن را برنمی‌دارد.

**چرا این روی ماشین تست هرگز دیده نمی‌شود:** تست صفر ورودی default ACL دارد، پروداکشن
نه. **این کلاسِ کامل از نقص‌ها روی تست ساختاراً نامرئی است.**

> ### 🔴 OWNER DECISION — OD-7
>
> - **(الف) اگر OD-3 گزینهٔ (الف) را انتخاب کرده بودید** (بستن default ACL قبل از ۷۴تا)،
>   **۵۰۷ ممکن است بگذرد** — چون تابع دیگر با گرنت `anon` متولد نمی‌شود.
>   **⚠️ UNREHEARSED:** این ترکیب روی تمرین آزموده نشد؛ اصلاحِ default ACL اصلاً اجرا نشد.
>   *مبادله:* محتمل‌ترین راه موفقیت، ولی اثباتش را نداریم.
> - **(ب) ۵۰۷ را رد کنید** و ردیف لجرش را ثبت نکنید.
>   *مبادله:* برگشت‌پذیر. ولی دو نویسندهٔ cron برای هر کاربر authenticated قابل‌فراخوان
>   می‌مانند — همان چیزی که ۵۰۷ می‌خواست ببندد.
> - **(ج) `FROM anon` را به دو `REVOKE` مهاجرت اضافه کنید.**
>   *مبادله:* اصلاح درست است (`R4-R5-results.md` §7 بند ۴)، ولی ویرایش فایل مهاجرت
>   موجود است — `CLAUDE.md` قاعدهٔ ۶.

**مهاجرت‌های `[schema+data]` این گروه** (`production-audit-2026-09-07.md:396-400`):

| # | چه داده‌ای | تمرین (ins/upd/del) | برگشت‌پذیر؟ |
|---|---|---|---|
| ۵۰۴ | streakهای روزانهٔ کارمندان | 9/3/3 | ✅ `504-down.sql` — **⚠️ UNREHEARSED** |
| ۵۰۵ | تأیید درخواست اعتبار | 27/7/11 | ✅ `505-down.sql` — **⚠️ UNREHEARSED** |
| ۵۰۶ | کف دستی سرمایه | 4/1/4 | ✅ `506-down.sql` — **⚠️ UNREHEARSED** |

۴۹۷ و ۴۹۸ در ممیزی `[schema]` علامت خورده‌اند و هر دو فایل down دارند
(`497-down.sql`، `498-down.sql` — **⚠️ UNREHEARSED**).

**🛑 نقطهٔ توقف ۵ — بعد از ترتیب ۶۲.** «اشتباه» یعنی: شکستی به‌جز ۴۹۷ و ۵۰۷.

---

### گروه ۶ · ترتیب‌های ۶۳ تا ۷۴ — کارِ پس از ممیزی (۵۰۸ تا ۵۱۹)

**۵۰۸، ۵۰۹، ۵۱۲، ۵۱۰، ۵۱۳، ۵۱۱، ۵۱۵، ۵۱۴، ۵۱۶، ۵۱۸، ۵۱۷، ۵۱۹**

**این همان ۱۲ تایی است که ممیزی نمی‌شناسد** (بعد از نوشته شدنش نشستند — بخش ۰.۵).
**پس ممیزی هیچ‌کدام را `[schema+data]` علامت نزده؛ هیچ برچسبی موجود نیست.**

**اندازه‌گیری خودم روی متن فایل‌ها — E3، شمارش خطوط DML** (این یک نشانگر است، نه شمارش
ردیف کسب‌وکار؛ بیشتر DML این فایل‌ها داخل بلاک `DO` است):

| # | INSERT | UPDATE | DELETE | تمرین (ins/upd/del) | فایل down؟ |
|---|---|---|---|---|---|
| ۵۰۸ | 0 | 0 | **1** | 0/0/0 — خودش گفت `D-55: allocation_rows قبل=0 ، حذف‌شده=0` | ندارد |
| ۵۰۹ | 1 | 0 | 0 | 9/8/6 | ندارد |
| ۵۱۲ | 2 | 0 | 0 | 12/5/0 | ندارد |
| ۵۱۰ | **7** | **5** | 0 | 8/3/8 | ندارد |
| ۵۱۳ | 1 | 0 | 0 | 4/4/0 | ندارد |
| ۵۱۱ | 2 | 1 | 0 | 9/5/2 | ندارد |
| ۵۱۵ | 0 | 0 | 0 | 6/9/3 | ندارد |
| ۵۱۴ | 0 | 0 | 0 | **رد شد** — 0/0/0 | ندارد |
| ۵۱۶ | 0 | 0 | 0 | **رد شد** — 0/0/0 | ندارد |
| ۵۱۸ | 0 | 0 | 0 | 6/3/6 | ندارد |
| ۵۱۷ | 1 | 1 | 0 | 4/7/0 | ندارد |
| ۵۱۹ | 0 | 0 | 0 | 6/9/6 | ندارد |

**هیچ‌کدام از این دوازده فایل down ندارد** (اندازه‌گیری‌شده: `ls docs/verification/*down*`
بالاتر از ۵۰۶ چیزی ندارد). **بازگشتشان فقط با بازگردانی پشتیبان است.**

**۵۰۸ روی پروداکشن احتمالاً هیچ کاری نمی‌کند:** ردیفی که هدف گرفته یک artefact پایگاه
تست است و روی baseline پروداکشن وجود ندارد (`R4-R5-results.md` §3، NOTICE خودِ مهاجرت).
**`حذف‌شده=0` اینجا موفقیت است، نه شکست.**

**دو شکست روی تمرین، هر دو دستهٔ (ب) و هر دو cascade:**

```
[70] 514: ERROR:  column "extension" does not exist          <- cascade 497 -> 477
[71] 516: ERROR:  relation "public.v_call_extension_hourly" does not exist  <- cascade 514
```

**اگر ۴۷۷ و ۴۹۷ گذشتند، این دو هم می‌گذرند.**

**چهار مهاجرت امنیتی این گروه را جا نیندازید** — همان‌هایی که در بخش ۰.۵ آمدند:
**۵۱۱** (گارد کف اعتبار دستی)، **۵۱۵** و **۵۱۹** (گاردهای DEFINER گزارش سلامت سیستم)،
**۵۱۸** (همان گارد برای `INSERT`). هر چهار روی تمرین **موفق** بودند.

**🛑 نقطهٔ توقف ۶ — پایان.** بروید به فاز ۵.

### ۴.۹ · شش عددی که واقعاً قابل‌اعتمادند

اینها را خودِ مهاجرت‌ها NOTICE کردند، پس شمارش کاتالوگ در آن‌ها نیست
(`R4-R5-results.md` §3):

| ترتیب | # | چه گفت |
|---|---|---|
| ۱۰ | ۴۴۳ | `role_permissions module roles -> 7 rows`؛ `module purchases -> 7 rows`؛ `module dashboard -> 7 rows` |
| ۱۸ | ۴۵۲ | `452: backup_142=16 rows, backup_20260722=16 rows, live dynamic_parameter_weights=16 rows` (و بعد ۱۸ خواست و abort کرد) |
| ۴۱ | ۴۸۱ | `481 OK: allocation_rows created; 31 person FKs, all registered; anon has nothing` |
| ۴۵ | ۴۸۵ | `485: role_permissions now 189 rows, 0 gaps` |
| ۵۶ | ۴۹۶ | `496 OK: per-row call_logs recompute retired (call_logs now carries 0 user trigger(s)); batch entry point installed; anon has nothing` |
| ۶۳ | ۵۰۸ | `D-55: allocation_rows قبل=0 ، حذف‌شده=0` |

---

## فاز ۵ · راستی‌آزمایی پس از مهاجرت

**⚠️ UNREHEARSED به‌عنوان یک مجموعهٔ راستی‌آزمایی روی پروداکشن.** هر کوئری زیر روی تمرین
یا در R-4/R-5 اجرا شده، ولی به‌عنوان یک «چک‌لیست پس از مهاجرت» هرگز پشت سر هم اجرا نشده.

### قدم ۵.۱ — لجر و اسکیما با هم بخوانند

```powershell
docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d postgres -tAc `
"SELECT count(*), max(version) FROM supabase_migrations.schema_migrations;"
```

**چه چیزی باید ببینید:** عددی برابر با «۵۶۹ + آنچه فاز ۳ ثبت کرد + تعداد مهاجرت‌های
موفق شما». `max(version)` باید `20260907170000` باشد **اگر** ۵۱۹ (ترتیب ۷۴) موفق بوده.
اگر اجرا وسط ایستاده، `max` نسخهٔ آخرین موفق است.

روی تمرین این عدد **۶۳۹ / `20260907170000`** شد، از ۵۷۹ (`R4-R5-results.md` §1).

### قدم ۵.۲ — هیچ تابعی anon-اجراپذیر نمانده باشد

**این مهم‌ترین چک این فاز است**، چون OD-3 اینجا اثرش را نشان می‌دهد:

```powershell
docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d postgres -c `
"SELECT p.proname
   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND has_function_privilege('anon', p.oid, 'EXECUTE')
    AND p.proname IN ('pay_purchase_with_voucher','review_credit_request',
                      'create_sales_quote_with_items','reverse_document',
                      'calculate_customer_realtime_credit','get_receivables_summary',
                      'get_payables_summary','asan_commit_person_batch','asan_revert_person_batch')
  ORDER BY 1;"
```

**چه چیزی باید ببینید:**

```
 proname
---------
(0 rows)
```

**هر نامی که اینجا ظاهر شود، یک تابع است که `anon` می‌تواند صدا بزند.** فهرست بالا
نُه‌تای بدترینِ ۲۶ تای اندازه‌گیری‌شده است (`R4-R5-results.md` §4.3).
**اگر ردیف برگشت، OD-3 را انجام نداده‌اید یا کامل انجام نداده‌اید.**

### قدم ۵.۳ — سه جدول تازه گرنت `anon` نگرفته باشند

```powershell
docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d postgres -c `
"SELECT c.relname, has_table_privilege('anon', c.oid, 'SELECT') AS anon_select
   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname='public'
    AND c.relname IN ('allocation_rows','chart_of_accounts','call_log_extensions')
  ORDER BY 1;"
```

**چه چیزی باید ببینید — هر سه `f`:**

```
      relname       | anon_select
--------------------+-------------
 allocation_rows    | f
 call_log_extensions| f
 chart_of_accounts  | f
```

روی تمرین هر سه `f` بودند (`R4-R5-results.md` §4.3).

### قدم ۵.۴ — `pg_default_acl` صفر مانده باشد

اگر OD-3 گزینهٔ (الف) را انتخاب کرده بودید، دوباره بشمارید:

```powershell
docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d postgres -tAc `
"SELECT count(*) FROM pg_default_acl WHERE defaclacl::text LIKE '%anon%';"
```

**باید هنوز `0` باشد.** اگر عدد برگشته، یکی از مهاجرت‌ها آن را دوباره باز کرده — بررسی کنید.

### قدم ۵.۵ — PostgREST را ری‌استارت کنید

**⚠️ UNREHEARSED روی پروداکشن.** امضای RPCها در حافظهٔ PostgREST کش شده و بعد از تغییر
تابع باید تازه شود (`prod-clone-dryrun-20260831.md` §«گام‌های دستی بین مهاجرت‌ها»).

```powershell
docker restart afrakala-lan-rest
docker ps --filter name=afrakala-lan-rest --format "{{.Names}}`t{{.Status}}"
```

**چه چیزی باید ببینید:** `afrakala-lan-rest   Up X seconds`.

> **`afrakala-lan-db` را ری‌استارت نکنید.** روی ماشین تست این خطرناک بوده
> (`CLAUDE.md` §OG-68) و روی پروداکشن **اندازه‌گیری نشده — UNKNOWN**. ری‌استارت
> `afrakala-lan-rest` بی‌خطر است چون هیچ bind به شکل VM ندارد.

### قدم ۵.۶ — اپلیکیشن بالا باشد

```powershell
curl.exe -s -o NUL -w "%{http_code} %{time_total}\n" http://192.168.170.10:3000/login
```

**چه چیزی باید ببینید:** `200` و زمانی زیر یک ثانیه. اگر `000` دیدید، اپلیکیشن پایین است.

---

## فاز ۶ · سه کاری که ۷۴ مهاجرت **نمی‌کنند**

> این سه کار هیچ‌کدام مهاجرت نیستند و هیچ‌کدام داخل ۷۴تا نیستند
> (`CONTRACTS.md` §«What the 74 do NOT cover»). اگر ۷۴تا را کامل اجرا کنید و اینها را
> نکنید، کار نیمه‌تمام است.

### قدم ۶.۱ — `REVOKE` روی خودِ ویوها · **✅ کامل تمرین‌شده، هر دو نیمه مشاهده شد**

**چرا اجرای هر ۷۴ مهاجرت کافی نیست، در یک خط:** مهاجرت ۴۷۷ فقط جدول‌ها را می‌گیرد
(`relkind = 'r'`) و **ویوها را اصلاً لمس نمی‌کند** (ممیزی، سطر ۴۲۳–۴۲۴).

شما این را در ۲۰۲۶-۰۹-۰۷ دستی انجام دادید. **این قدم آن را تأیید می‌کند، نه تکرار.**

```powershell
docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 --single-transaction -c `
"REVOKE ALL ON TABLE public.v_promotion_suggestions FROM anon;
 REVOKE ALL ON TABLE public.vw_account_balances     FROM anon;"
```

**چه چیزی باید ببینید:**

```
REVOKE
REVOKE
```

**و exit code صفر. «بدون تغییر» اینجا واقعاً موفقیت است.**

روی تمرین این **دو بار** اجرا شد — یک بار روی وضعیت باز و یک بار روی وضعیتِ از قبل بسته —
و **پاس دوم byte-identical با پاس اول بود**، همان `REVOKE` و همان exit 0
(`R4-R5-results.md` §5.2).

> **ولی همین یعنی `REVOKE` هیچ‌چیز ثابت نمی‌کند.** PostgreSQL روی مجوزی که وجود ندارد
> هم `REVOKE` چاپ می‌کند. **اثبات، خواندنِ بعد از آن است:**

```powershell
docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d postgres -c `
"SELECT c.relname, has_table_privilege('anon', c.oid, 'SELECT') AS anon_select
   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname='public' AND c.relname IN ('v_promotion_suggestions','vw_account_balances');"
```

**چه چیزی باید ببینید — هر دو `f`:**

```
         relname         | anon_select
-------------------------+-------------
 v_promotion_suggestions | f
 vw_account_balances     | f
```

**`f` شرط موفقیت است، چه `REVOKE` کاری کرده باشد چه نه.**

### قدم ۶.۲ — بستن `ALTER DEFAULT PRIVILEGES … TO anon`

**➡️ این قدم به فاز ۱، قدم ۱.۴ منتقل شده و باید **قبل از** ۷۴تا انجام شود.**

**چرا اجرای هر ۷۴ مهاجرت کافی نیست، در یک خط:** هیچ مهاجرتی این را نمی‌بندد
(`CONTRACTS.md` §«What the 74 do NOT cover» بند ۲)، و تا وقتی باز است هر رابطه یا تابع
تازه‌ای دوباره گرنت `anon` می‌گیرد **بدون اینکه هیچ `GRANT`ی جایی نوشته شود**.

**اگر از فاز ۱ رد شده‌اید و اینجا رسیده‌اید، برگردید به قدم ۱.۴** — انجام دادنش بعد از
۷۴تا آن ۲۶ تابعِ تازه‌متولدشده را نمی‌بندد.

### قدم ۶.۳ — دیپلوی بیلد جدید · **⚠️ UNREHEARSED**

**چرا اجرای هر ۷۴ مهاجرت کافی نیست، در یک خط:** ۱۵ گیت `admin` سمت کلاینت در کد
هستند نه در پایگاه‌داده، و پروداکشن **هیچ‌کدام** را ندارد تا بیلد جدید دیپلوی شود
(ممیزی، سطر ۴۶۲–۴۶۵). **این اصلاً مهاجرت نیست.**

**دستور، عیناً از `CLAUDE.md` §«Production is deploy-only»:**

```powershell
$env:GIT_SHA = (git rev-parse --short HEAD)
$env:BUILD_TIME = (Get-Date -Format o)
docker compose --env-file deploy/lan/.env.lan -f deploy/lan/docker-compose.yml `
  up -d --no-deps --build web
```

**دو چیز در این دستور حیاتی‌اند و اگر جا بیفتند دو نوع خرابی متفاوت می‌دهند:**

1. **`--no-deps` — بدون آن اپلیکیشن پایین می‌رود.** `web` به `kong` وابسته است و
   `auth`/`rest`/`storage`/`meta` همه `depends_on: db-role-fix` دارند، پس یک
   `up -d web` سادهٔ کانتینر یک‌بارمصرفِ `db-role-fix` را وارد گراف راه‌اندازی می‌کند.
   روی ماشین تست در ۲۰۲۶-۰۸-۲۶ همین اتفاق افتاد و `/login` چند دقیقه `000` برگرداند
   (`CLAUDE.md`، بلوک خروجی کامل). **بازیابی، اثبات‌شده:** `docker start afrakala-lan-web`.
2. **`GIT_SHA` باید روی خط فرمان باشد — بدون آن، بیلد درست است و برچسب دروغ می‌گوید.**
   فایل compose آن را به‌عنوان build arg می‌خواند و `--env-file deploy/lan/.env.lan` یک
   مقدارِ قدیمی می‌دهد. در ۲۰۲۶-۰۸-۲۶ اندازه‌گیری شد: بیلدِ کدِ روز، برچسب
   `APP_GIT_SHA=1ca72316` خورد — یک commit واقعی، ولی نه `HEAD`. **و همین برچسب تنها
   چیزی است که بررسی زیر را ممکن می‌کند**، پس یک برچسب کهنه بی‌سروصدا تنها چکِ شما را
   خاموش می‌کند.

**راستی‌آزمایی — اجباری:**

```powershell
docker inspect afrakala-lan-web --format "{{range .Config.Env}}{{println .}}{{end}}" | Select-String "APP_GIT_SHA"
git rev-parse --short HEAD
```

**دو مقدار باید یکی باشند.** اگر نبودند، دیپلوی کدی را که فکر می‌کنید اجرا نمی‌کند.
راه تشخیص، جست‌وجوی رشته‌ای که فقط در تغییر شماست:

```powershell
docker exec afrakala-lan-web sh -c "grep -rl '<your new symbol>' /app/.output"
```

**همچنین انتظار داشته باشید** `afrakala-lan-db-role-fix` وضعیت `Exited (0)` نشان دهد و
هر سرویس `afrakala-lan-*` دیگر `Up` باشد (`CLAUDE.md`).

> ### 🔴 OWNER DECISION — OD-8 · چه زمانی دیپلوی کنید
>
> - **(الف) بعد از مهاجرت‌ها.** *مبادله:* اگر مهاجرت‌ها وسط بایستند، کدِ قدیم با
>   اسکیمای نیمه‌جدید کار می‌کند — که همان چیزی است که تا امروز هم بوده.
> - **(ب) اصلاً امشب دیپلوی نکنید.** *مبادله:* ۱۵ گیت `admin` نمی‌آیند، ولی هیچ ریسک
>   جدیدی هم اضافه نمی‌شود. **اگر مهاجرت‌ها ناقص ماندند، این گزینه است.**
>
> **در هر صورت این را بدانید:** دیپلوی این صفحه‌ها را آن‌قدر که جدول گیت‌ها نشان می‌دهد
> امن **نمی‌کند** — چون ۲۳ نفر از ۴۲ کاربر نقش `admin` دارند، پس هر ۱۵ گیت برای نیمی از
> شرکت باز می‌ماند (ممیزی سطر ۴۵۸–۴۶۵؛ تصمیم **D-59** که همین‌طور می‌ماند).

**رول‌بک تصویر — قبل از دیپلوی تگ بگیرید:**

```powershell
docker tag afrakala-app:lan afrakala-app:lan-rollback
```

---

## فاز ۷ · بازگشت

> **صادقانه‌ترین بخش این سند.** برای بیشتر این کار، بازگشت یعنی **بازگردانی پشتیبان**،
> و این سند وانمود نمی‌کند غیر از این است.

### ۷.۰ — عدد اصلی: **۶۲ تا از ۷۴ مهاجرت هیچ فایل down ندارند**

**اندازه‌گیری‌شده — E3:**

```bash
$ ls docs/verification/*down* | wc -l
158
$ ls docs/verification/ | grep -E "^(4[2-9][0-9]|5[0-1][0-9])-down"
422-down.sql  437-down.sql  445-down.sql  453-down.sql  478-down.sql
481-down.sql  482-down.sql  496-down.sql  497-down.sql  498-down.sql
504-down.sql  505-down.sql  506-down.sql
```

از این ۱۳ تا، `422-down.sql` در ۷۴تای شما نیست. **می‌ماند ۱۲ فایل down برای ۷۴ مهاجرت:**
۴۳۷، ۴۴۵، ۴۵۳، ۴۷۸، ۴۸۱، ۴۸۲، ۴۹۶، ۴۹۷، ۴۹۸، ۵۰۴، ۵۰۵، ۵۰۶.

> **⚠️ UNREHEARSED — هیچ‌کدام از این دوازده فایل down هرگز اجرا نشده.**
> نه در این مأموریت و نه در هیچ گزارشی که خوانده‌ام. `docs/deployment/rollback-plan.md:151`
> خودش می‌گوید «An untested rollback is not a rollback». **پس این دوازده تا هم عملاً
> اثبات‌نشده‌اند** — با این تفاوت که حداقل **وجود دارند** و می‌شود قبل از اجرا خواندشان.

### ۷.۱ — بازگشت هر فاز

| فاز | چه چیزی برش می‌گرداند | سطح شاهد |
|---|---|---|
| **فاز ۱ · preflight** | قدم‌های ۱.۱، ۱.۲، ۱.۳، ۱.۵ فقط خواندنی‌اند — **چیزی برای برگرداندن نیست**. قدم ۱.۴ (default ACL) با `ALTER DEFAULT PRIVILEGES … GRANT ALL … TO anon` برمی‌گردد، ولی **هرگز این کار را نکنید** — آن حفره چیزی است که می‌بستید | ⚠️ UNREHEARSED |
| **فاز ۲ · پشتیبان** | چیزی برای برگرداندن نیست؛ فقط یک فایل ساخته می‌شود | ✅ |
| **فاز ۳ · لجر** | `DELETE FROM supabase_migrations.schema_migrations WHERE version > '20260827120000';` — **✅ روی تمرین اجرا و مستند شد** (`R1-R3-results.md` §11) با شمارش تأییدی بعدش. **ولی روی پروداکشن ⚠️ UNREHEARSED، و آستانهٔ `20260827120000` را باید با لجر خودتان تطبیق دهید** | ✅ روی تمرین / ⚠️ روی پروداکشن |
| **فاز ۴ · ۷۴ مهاجرت** | **۱۲ تا فایل down دارند (فهرست بالا) — همه ⚠️ UNREHEARSED.** **۶۲ تای دیگر: فقط بازگردانی پشتیبان.** | ⚠️ UNREHEARSED |
| **فاز ۵ · راستی‌آزمایی** | فقط خواندنی، به‌جز `docker restart afrakala-lan-rest` که خودش برگشت‌پذیر است | ✅ |
| **فاز ۶.۱ · REVOKE ویوها** | `GRANT SELECT ON … TO anon;` — **ولی این حفرهٔ امنیتی را باز می‌کند.** عملاً هرگز برنگردانید | ✅ خودِ REVOKE تمرین شد |
| **فاز ۶.۳ · دیپلوی** | `docker tag afrakala-app:lan-rollback afrakala-app:lan` و دوباره `up -d --no-deps web`. **دیپلوی فقط سرویس `web` را لمس می‌کند؛ پایگاه‌داده اصلاً درگیر نیست** (`docs/deployment/rollback-plan.md:113-117`) | ⚠️ UNREHEARSED |

### ۷.۲ — ترتیب بازگشت

**اسکیما اول، بعد کد** (`docs/deployment/rollback-plan.md:14-16`). کدی که ستونی را
انتظار دارد که دیگر نیست، با صدای بلند می‌شکند؛ ستونی که کدش رفته، بی‌ضرر است.

### ۷.۳ — بازگردانی کامل پشتیبان

**⚠️ UNREHEARSED برای dump شما؛ ✅ همین الگو در ۲۰۲۶-۰۹-۰۱ روی یک dump واقعی پروداکشن
اجرا شد** (`prod-clone-dryrun-20260831.md` §3: `pg_restore --no-owner --disable-triggers`،
exit 1 با ۲۱ خطای بی‌ضرر، صفر خطای بارگذاری داده، و هر چهار شمارش دقیقاً منطبق).

**ولی توجه: آن بازگردانی به یک پایگاه‌دادهٔ *دیگر* بود، نه روی `postgres` زنده.**
بازگردانی روی پایگاه‌دادهٔ زندهٔ پروداکشن هیچ‌جا تمرین نشده و **مستلزم حذف یا خالی کردن
اسکیمای فعلی است** — یعنی از دست دادن هر چیزی که از زمان پشتیبان نوشته شده.

**قبل از بازگردانی، اینها را بدانید:**

- **`--disable-triggers` لازم است** به‌خاطر کلیدهای خارجی حلقوی — همان هشداری که
  `pg_dump` در قدم ۲.۲ چاپ کرد.
- **هر معامله‌ای که از لحظهٔ پشتیبان تا حالا ثبت شده، از بین می‌رود.** بازگردانی یعنی
  برگشتن به لحظهٔ dump.
- **هرگز `docker compose down -v`** — آن `-v` volume پایگاه‌داده را نابود می‌کند
  (`CLAUDE.md`).

**اگر به اینجا رسیدید، بازگردانی یک عملیات پرخطر و برگشت‌ناپذیر است. توصیهٔ این سند:
قبل از اجرای آن روی پروداکشن، dump را روی ماشین تست بازگردانی کنید و مطمئن شوید سالم
است** — دقیقاً کاری که قدم ۲.۴ می‌گوید و به همین دلیل آنجاست، نه اینجا.

---

## پیوست الف · cron — از C-2

**این پیوست چیزی برای اجرای امشب نیست.** حکم C-2 دربارهٔ اینکه کارهای زمان‌بندی‌شده کجا
باید زندگی کنند است، و **بلوک نصبش composed شده ولی هرگز اجرا نشده**
(`C2-cron-verdict.md` §3: «These commands were **composed from measurements but not
executed** — the mission forbade installing»). **پس کل این پیوست ⚠️ UNREHEARSED است.**

### الف.۱ — یک چیزی که همین حالا باید بدانید

روی پروداکشن **شش job زمان‌بندی‌شده** هست و **یکی از آن‌ها هرگز، حتی یک بار، موفق نشده**
(`CONTRACTS.md` §Addendum بند ۱، اندازه‌گیری مستقل):

```
jobid 9  daily-birthday-notifications              ok=0   bad=56
jobid 20 afrakala-capture-score-snapshots-nightly  ok=2   bad=0
jobid 21 afrakala-refresh-sale-list-prices-nightly ok=2   bad=0
jobid 22 afrakala-sync-price-observatory-daily     ok=2   bad=0
jobid 23 afrakala-accrual-daily-notice             ok=2   bad=0
jobid 25 afrakala-employee-streaks-nightly         ok=2   bad=0
```

`daily-birthday-notifications` با `ERROR: authentication required` در خط ۱۷ تابع
`generate_birthday_notifications()` شکست می‌خورد — همان تلهٔ «cron هیچ `auth.uid()` ندارد»
که مهاجرت ۵۰۷ مستندش می‌کند. **۵۶ شکست پیاپی و هیچ‌کس خبردار نشده.**
**این امشب اصلاح نمی‌شود؛ فقط ثبت شده.**

### الف.۲ — حکم C-2

`pg_cron` روی پایگاه‌دادهٔ `postgres` برندهٔ مقایسهٔ چهارمحوره است **برای این ماشین
همان‌طور که امشب هست** (`C2-cron-verdict.md` §2). بلوک نصب کامل در همان فایل، §3،
شامل پیش‌پرواز فقط‌خواندنی، `CREATE EXTENSION http`، ذخیرهٔ توکن در vault، تابع درایور
و job ها است. **آن را از منبع بخوانید، نه از اینجا** — کپی کردن یک بلوک نصبِ اجرانشده
داخل یک runbook، ارزشی به آن اضافه نمی‌کند و فقط ریسک واگرایی می‌سازد.

**دو چیز از آن فایل که به این سند مربوط‌اند:**

1. **`cron.timezone` روی GMT است** و ایران UTC+3:30 بدون تغییر فصلی. هر زمان‌بندی باید
   با این حساب نوشته شود (`C2-cron-verdict.md` §4).
2. **یک `OWNER DECISION` آنجا هست که این سند حلش نمی‌کند:** توکن worker کجا زندگی کند —
   `supabase_vault` یا یک جدول تک‌ردیفی با `REVOKE ALL … FROM PUBLIC`
   (`C2-cron-verdict.md` §3 قدم ۲).

---

## پیوست ب · هر ۷۴ مهاجرت، به ترتیب اجرا

منبع ترتیب: `docs/missions/prodprep/MIGRATIONS-74.md`.
منبع ستون «نتیجه روی تمرین»: `docs/missions/prodprep/R4-R5-results.md` §2.
**همهٔ ۷۴ ردیف تمرین شده‌اند** — هیچ ردیفی `UNREHEARSED` نیست.

**`ms` = زمان روی تمرین. `ins/upd/del` = دلتای tuple کل پایگاه‌داده، شامل کاتالوگ سیستم —
شمارش ردیف کسب‌وکار نیست (بخش ۴.۱ را بخوانید).**

| ترتیب | # | فایل | نتیجه روی تمرین | ms | ins/upd/del | دسته |
|---|---|---|---|---|---|---|
| 1 | 420 | `20260903100000_420_guest_quotes_get_their_own_reason.sql` | ✅ | 389 | 9/3/8 | |
| 2 | 421 | `20260903140000_421_guest_refusal_message_tells_the_truth.sql` | ✅ | 346 | 5/1/5 | |
| 3 | 425 | `20260904160000_425_settlement_dead_predicates.sql` | ✅ | 342 | 4/6/4 | |
| 4 | 430 | `20260904190000_430_asan_import_requires_code_and_mobile.sql` | ✅ | 440 | 12/2/7 | |
| 5 | 431 | `20260904193000_431_retire_person_import_batch.sql` | ✅ | 345 | 0/0/6 | |
| 6 | 432 | `20260904200000_432_asan_import_batch_provenance_and_revert.sql` | ✅ | 472 | 35/6/7 | |
| 7 | 435 | `20260904210000_435_person_delete_when_there_is_no_history.sql` | ✅ | 390 | 21/6/6 | |
| 8 | 436 | `20260905100000_436_close_anon_role_grant_escalation.sql` | ✅ | 474 | 12/21/12 | |
| 9 | 446 | `20260905110000_446_attach_purchase_actor_active_trigger.sql` | ✅ | 399 | 6/0/0 | |
| 10 | 443 | `20260905130000_443_fix_ambiguous_outparams_and_assert_route_permissions.sql` | ✅ | 473 | 4/2/4 | |
| 11 | 445 | `20260905140000_445_scheduled_jobs_documentation.sql` | ✅ | 422 | 3/0/0 | |
| 12 | 437 | `20260905163000_437_inline_create_registers_asan_identifier.sql` | ✅ | 358 | 4/2/4 | |
| 13 | 447 | `20260905170000_447_retire_capital_allocation_tombstones.sql` | ✅ | 473 | 0/0/12 | |
| 14 | 448 | `20260905170500_448_retire_superseded_functions.sql` | ✅ | 475 | 0/0/11 | |
| **15** | **449** | `20260905171000_449_retire_daily_capital_functions.sql` | **❌ `449: daily_capital_snapshots expected 10 rows, found 0`** | 384 | 0/0/13 | **(الف)** |
| **16** | **450** | `20260905171500_450_retire_superseded_tables.sql` | **❌ `450: backup_142 expected 18 rows, found 16`** | 372 | 0/12/70 | **(الف)** |
| 17 | 451 | `20260905172000_451_retire_app_role_wrappers.sql` | ✅ | 426 | 0/0/8 | |
| **18** | **452** | `20260905180000_452_retire_parameter_weight_backups_by_rename.sql` | **❌ `452: rows were lost in the rename (142=16, 0722=16)`** | 371 | 2/6/0 | **(الف)** |
| 19 | 453 | `20260905183000_453_credit_customers_report_uncomputed_as_null.sql` | ✅ | 436 | 9/2/8 | |
| 20 | 454 | `20260905220000_454_wire_overdue_gate_to_receivables.sql` | ✅ | 555 | 8/7/6 | |
| 21 | 455 | `20260905221500_455_score_period_current_month_then_dated_fallback.sql` | ✅ | 455 | 10/6/5 | |
| 22 | 457 | `20260905224500_457_payables_debt_is_the_purchase_total.sql` | ✅ | 390 | 22/3/22 | |
| 23 | 458 | `20260905230000_458_receivables_summary_keeps_unknown_due_dates.sql` | ✅ | 404 | 4/4/3 | |
| 24 | 459 | `20260905231500_459_payables_names_an_unknown_due_date.sql` | ✅ | 427 | 28/7/24 | |
| **25** | **460** | `20260906090000_460_pin_receipt_ocr_to_local_vision.sql` | **❌ `460: the local ollama provider d30816a9-… is missing, inactive, does not declare vision…`** | 365 | 0/0/0 | **(الف)** |
| 26 | 461 | `20260906091500_461_gate_hold_and_release_credit.sql` | ✅ | 472 | 8/8/7 | |
| **27** | **462** | `20260906093000_462_gate_money_tier_definers.sql` | **❌ `function public.hold_credit_for_quote(uuid, uuid) does not exist`** | 387 | 5/11/2 | **(ب′)** |
| 28 | 463 | `20260906094500_463_gate_identity_tier_definers.sql` | ✅ | 346 | 6/8/5 | |
| 29 | 464 | `20260906100000_464_gate_catalogue_tier_definers.sql` | ✅ | 474 | 3/14/3 | |
| 30 | 465 | `20260906101500_465_gate_housekeeping_tier_definers.sql` | ✅ | 395 | 13/14/12 | |
| 31 | 466 | `20260906103000_466_receivables_carry_salesperson_and_ceiling.sql` | ✅ (BEGIN/COMMIT خودش) | 342 | 8/4/8 | |
| 32 | 467 | `20260906110000_467_scoring_tables_select_credit_audience.sql` | ✅ | 515 | 12/0/0 | |
| 33 | 468 | `20260906111500_468_bot_writers_require_a_valid_key.sql` | ✅ | 447 | 26/12/26 | |
| 34 | 469 | `20260906113000_469_market_rate_system_rpcs_test_for_service_role_positively.sql` | ✅ | 430 | 9/9/8 | |
| 35 | 470 | `20260906114500_470_expire_pending_documents_loses_its_direct_authenticated_grant.sql` | ✅ | 378 | 0/3/0 | |
| 36 | 471 | `20260906120000_471_ai_provider_key_and_bot_readers_require_a_caller.sql` | ✅ | 424 | 9/15/8 | |
| **37** | **475** | `20260906130000_475_audit_ai_routing_changes.sql` | **❌ `475 VERIFY: receipt_ocr.vision is no longer pinned…`** | 389 | 12/0/0 | **(الف)** cascade ۴۶۰ |
| **38** | **476** | `20260906140000_476_close_pre393_anon_execute_grants.sql` | **❌ `function public.jalali_year(date) does not exist`** | 428 | 48/146/48 | **(ب)** |
| **39** | **477** | `20260906150000_477_close_anon_table_grants.sql` | **❌ `relation "public.document_attachments" does not exist`** | 494 | 0/72/0 | **(ب)** |
| **40** | **478** | `20260906160000_478_partial_purchase_payment.sql` | **❌ `column pv.reversed_at does not exist`** | 461 | 0/0/0 | **(ب)** |
| 41 | 481 | `20260906170000_481_allocation_rows.sql` | ✅ | 469 | 208/14/6 | |
| 42 | 482 | `20260906171500_482_allocation_rpcs.sql` | ✅ | 419 | 23/12/0 | |
| 43 | 483 | `20260906180000_483_allocation_rows_audit_write_triggers.sql` | ✅ | 461 | 21/7/6 | |
| 44 | 484 | `20260906181000_484_retire_capital_allocation_ledger.sql` | ✅ | 518 | 11/7/6 | |
| 45 | 485 | `20260906182000_485_fill_role_permissions_gaps.sql` | ✅ | 470 | 3/0/0 | |
| 46 | 486 | `20260906190000_486_chart_of_accounts.sql` | ✅ | 415 | 103/12/0 | |
| **47** | **487** | `20260906190500_487_ledger_accrual_columns.sql` | **❌ `column "doc_kind" does not exist`** | 504 | 0/0/0 | **(ب)** |
| 48 | 488 | `20260906191000_488_sale_accrual_posting.sql` | ✅ | 446 | 18/5/7 | |
| 49 | 489 | `20260906191500_489_purchase_accrual_posting.sql` | ✅ | 362 | 9/3/0 | |
| 50 | 490 | `20260906192000_490_quote_status_cancelled_after_accept.sql` | ✅ | 307 | 1/0/0 | |
| 51 | 491 | `20260906192500_491_accrual_cancel_paths.sql` | ✅ | 464 | 16/5/7 | |
| 52 | 492 | `20260906193000_492_daily_accrual_notice.sql` | ✅ | 375 | 3/3/0 | |
| 53 | 493 | `20260906193500_493_notification_type_daily_accrual.sql` | ✅ | 525 | 4/2/3 | |
| 54 | 494 | `20260906194000_494_purchase_payment_outstanding_clamp.sql` | ✅ | 421 | 5/1/4 | |
| 55 | 495 | `20260906194500_495_implicit_payment_is_outstanding.sql` | ✅ | 404 | 5/1/5 | |
| 56 | 496 | `20260906200000_496_call_logs_batch_score_recompute.sql` | ✅ | 395 | 4/3/6 | |
| **57** | **497** | `20260906201000_497_call_logs_cdr_columns.sql` | **❌ `497: anon holds SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on call_logs`** | 412 | 21/6/8 | **(ب)** cascade ۴۷۷ |
| 58 | 498 | `20260906202000_498_call_log_extensions.sql` | ✅ | 388 | 100/9/0 | |
| 59 | 504 | `20260906210000_504_employee_streaks_daily.sql` | ✅ | 632 | 9/3/3 | |
| 60 | 505 | `20260906211000_505_credit_request_approval.sql` | ✅ | 647 | 27/7/11 | |
| 61 | 506 | `20260906212000_506_capital_manual_floor.sql` | ✅ | 488 | 4/1/4 | |
| **62** | **507** | `20260907060000_507_cron_definer_writers_are_not_authenticated_callable.sql` | **❌ `507: anon must not reach either function`** | 440 | 3/6/3 | **(الف)** |
| 63 | 508 | `20260907090000_508_delete_residue_allocation_row.sql` | ✅ no-op: `D-55: allocation_rows قبل=0 ، حذف‌شده=0` | 412 | 0/0/0 | |
| 64 | 509 | `20260907093000_509_allocation_tehran_today.sql` | ✅ | 405 | 9/8/6 | |
| 65 | 512 | `20260907100000_512_call_logs_issabel_import_foundation.sql` | ✅ (BEGIN/COMMIT خودش) | 376 | 12/5/0 | |
| 66 | 510 | `20260907103000_510_daily_allocation_honours_manual_floor.sql` | ✅ | 431 | 8/3/8 | |
| 67 | 513 | `20260907110000_513_call_import_worker_recompute.sql` | ✅ (BEGIN/COMMIT خودش) | 548 | 4/4/0 | |
| 68 | 511 | `20260907113000_511_manual_credit_floor_guard.sql` | ✅ | 351 | 9/5/2 | **امنیتی** |
| 69 | 515 | `20260907123000_515_system_health_reports_require_admin.sql` | ✅ | 534 | 6/9/3 | **امنیتی** |
| **70** | **514** | `20260907130000_514_call_extension_activity_views.sql` | **❌ `column "extension" does not exist`** | 343 | 0/0/0 | **(ب)** cascade ۴۹۷ |
| **71** | **516** | `20260907140000_516_call_extension_views_least_privilege.sql` | **❌ `relation "public.v_call_extension_hourly" does not exist`** | 331 | 0/0/0 | **(ب)** cascade ۵۱۴ |
| 72 | 518 | `20260907150000_518_manual_credit_floor_guard_covers_insert.sql` | ✅ | 480 | 6/3/6 | **امنیتی** |
| 73 | 517 | `20260907154500_517_derive_staff_call_metrics.sql` | ✅ (BEGIN/COMMIT خودش) | 445 | 4/7/0 | |
| 74 | 519 | `20260907170000_519_system_health_guard_targets_api_callers.sql` | ✅ | 465 | 6/9/6 | **امنیتی** |

**جمع:** ۶۰ موفق · ۱۴ ناموفق · ۰ «از قبل درست» · ۰ غیرقابل‌تمرین · **۳۱٫۸ ثانیه**.
لجر ۵۷۹ → ۶۳۹، هر ۶۰ ثبت با `ROW_COUNT = 1` تأیید شد.

**یک تصحیح که باید ثبت شود:** قرارداد اولیه انتظار داشت شش مهاجرت به‌خاطر نبودِ `pg_cron`
غیرقابل‌تمرین باشند. **اندازه‌گیری‌شده، این درست نبود** — هشت مهاجرت به cron اشاره
می‌کنند و **هر اشاره داخل یک کامنت `--` یا یک رشتهٔ `COMMENT ON` است**؛ صفر ارجاع اجرایی
`cron.` در کل ۷۴ فایل (`R4-R5-results.md` §2، خروجی grep). **پس نبودِ `pg_cron` روی تمرین
هیچ هزینه‌ای نداشت و هیچ ردیفی برچسب `UNREHEARSABLE` لازم ندارد.**

---

## پیوست ج · فهرست چیزهایی که تمرین نشد

خلاصهٔ هر چیزی که در این سند `⚠️ UNREHEARSED` علامت خورده، در یک جا:

| قدم | چرا تمرین نشد |
|---|---|
| **هر کوئری روی پروداکشن** (قدم‌های ۱.۱، ۱.۲، ۱.۵) | پروداکشن برای هر ایجنتی ممنوع بود — «not one packet» |
| **بستن `ALTER DEFAULT PRIVILEGES`** (قدم ۱.۴) | R-4 پیامدهایش را اندازه گرفت ولی خودِ اصلاح را اجرا نکرد؛ اجرایش وضعیتی را که بقیهٔ آن ردیف اندازه می‌گرفت خراب می‌کرد (`R4-R5-results.md` §6.9) |
| **`pg_dump` روی پایگاه‌دادهٔ `postgres`** (قدم ۲.۲) | الگو روی `prod_rehearsal_20260908` اجرا شد؛ روی نام `postgres` نه |
| **drill بازگردانی این dump مشخص** (قدم ۲.۴) | dump شما هنوز وجود ندارد. **الگویش در ۲۰۲۶-۰۹-۰۱ روی یک dump واقعی پروداکشن اجرا شد** |
| **آشتیِ لجر روی پروداکشن** (فاز ۳) | روی تمرین دو بار + یک تست منفی اجرا شد؛ روی `postgres` هرگز، و اسکریپت آن نام را رد می‌کند |
| **ترکیب OD-3(الف) + مهاجرت ۵۰۷** | این ترکیب اصلاً آزموده نشد |
| **مجموعهٔ راستی‌آزمایی فاز ۵ به‌عنوان یک چک‌لیست** | تک‌تک کوئری‌ها در R-4/R-5 اجرا شدند؛ به‌عنوان یک دنباله نه |
| **دیپلوی** (قدم ۶.۳) | «The deploy of the new build is likewise untouched» (`R4-R5-results.md` §6.9) |
| **هر ۱۲ فایل down** (فاز ۷) | هیچ‌کدام هرگز اجرا نشده‌اند |
| **بازگردانی روی پایگاه‌دادهٔ زندهٔ پروداکشن** (قدم ۷.۳) | فقط بازگردانی به یک پایگاه‌دادهٔ دیگر تمرین شده |
| **کل پیوست الف (cron)** | «composed from measurements but not executed» (`C2-cron-verdict.md` §3) |
| **رفتار کانتینرها بعد از reboot روی پروداکشن** (قدم ۱.۶) | UNKNOWN، و نباید اندازه‌گیری شود |

**علاوه بر اینها، سه چیز که تمرین اصلاً نمی‌توانست بگوید** (`R4-R5-results.md` §6):

1. **آیا پروداکشن امروز حفرهٔ ۳۳۶–۳۷۰ یا حفرهٔ ۴۰۸ را دارد.** همه‌چیز روی dump
   ۲۰۲۶-۰۸-۳۱ اندازه‌گیری شده. **۸ تا از ۱۴ شکست به این دو پرسش وابسته‌اند.**
2. **آیا سطرهای `ai_providers` پروداکشن هنوز مثل dump‌اند.** شما همان پیکربندی را در
   ۲۰۲۶-۰۹-۰۷ دستی عوض کردید و هیچ‌چیز اینجا نمی‌بیند چه چیزی جا گذاشت.
3. **دادهٔ تمرین یک هفته کهنه است.** `persons` ۸۳۲ در برابر ۴٬۸۵۱؛ `journal_entries`
   **صفر** در برابر ۱۵. **هر عدد زمانی در این سند یک کف است، نه یک برآورد.**

---

## پیوست د · تصمیم‌های بازِ ثبت‌شده — امشب اصلاح نمی‌شوند

اینها یافته‌های واقعی‌اند که در دامنهٔ این سند نیستند، ولی نباید گم شوند:

1. **`daily-birthday-notifications` ۵۶ بار پشت سر هم شکست خورده و هیچ‌کس خبر نشده**
   (پیوست الف.۱).
2. **پنج مهاجرت در این پروژه عدد مطلق ردیف را assert می‌کنند** — ۴۱۰، ۴۱۸، ۴۴۹، ۴۵۰،
   ۴۵۲. اصلاح درست، assert کردن یک *رابطه* است نه یک عدد (`R4-R5-results.md` §7 بند ۳).
3. **مهاجرت ۴۷۷ باید فهرست موضوعش را در زمان اجرا از کاتالوگ بگیرد**، نه ۳۹۰ `REVOKE`
   ثابتِ تولیدشده از پایگاه تست (`R4-R5-results.md` §7 بند ۷).
4. **پیام خطای ۴۷۵ نباید بگوید «the state changed underneath it»** وقتی علت واقعی این
   است که ۴۶۰ هرگز اجرا نشد (`R4-R5-results.md` §7 بند ۵).
5. **۲۶ تابع anon-اجراپذیر سرشماری خودشان را لازم دارند** بعد از بستن default ACL —
   بستن، جلوی اشیای آینده را می‌گیرد، نه چیزی که قبلاً گرنت شده
   (`R4-R5-results.md` §7 بند ۶).
6. **`og81-migration-ledger-matches-disk.spec.ts` مفهوم سقف ندارد** — با وجود یک
   مهاجرتِ به‌حق اجرانشده، فقط با ثبت یک دروغ سبز می‌شود
   (`R1-R3-results.md` §10 بند ۳).
7. **یک dump تازهٔ پروداکشن، پنج تفاوت تمرین را یک‌جا حذف می‌کند** و پرسش ۳۳۶–۳۷۰ را
   قطعی می‌کند (`R1-R3-results.md` §10 بند ۴).
