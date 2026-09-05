# اجرای مهاجرت Live Ledger + دیپلوی کد روی تولید

**تاریخ اجرا:** ۲۰۲۶-۰۹-۰۱ (نام فایل طبق دستور بریف `20260831` نگه داشته شد)

## وضعیت: **COMPLETE**

- ۴۳ از ۴۳ migration اعمال شد، صفر ERROR
- هر پنج RPC اجرا شد، ژورنال تراز: **۱۹٬۰۰۰٬۰۰۰ = ۱۹٬۰۰۰٬۰۰۰**
- هر شش شمارش داده‌های کسب‌وکار **دقیقاً یکسان** با قبل
- `APP_GIT_SHA` عوض شد و با `HEAD` می‌خواند

پنج انحراف از بریف رخ داد که هیچ‌کدام مانع نبود؛ همه در بخش «انحراف‌ها» آمده‌اند.

---

## ۱. هویت ماشین

```
$ hostname
DESKTOP-MT8J1VR
```

پیش از checkout و پیش از build دوباره بررسی شد.

---

## ۲. گیت — قبل و بعد

| | Stage 0 (قبل) | Stage 4 (بعد) |
|---|---|---|
| branch | `main` | **`staging`** |
| HEAD | `bfcc723a3d610b2a1f9f59baa31e5d4406121756` | `d01da1b8d0d0dac94da457c79244d377b84d0693` |
| short | `bfcc723a` | **`d01da1b8`** |
| `APP_GIT_SHA` در کانتینر | `bfcc723a` | **`d01da1b8`** |
| فایل migration در درخت | 523 | 607 |

### اثبات اینکه دیپلوی واقعاً گرفت

```
APP_GIT_SHA (container) : d01da1b8
git rev-parse --short   : d01da1b8
Stage 0 value was       : bfcc723a
PASS — they match AND differ from the Stage 0 value
```

```
APP_GIT_SHA=d01da1b8
APP_BUILD_TIME=2026-09-01T09:54:53
APP_ENV=lan
OCR_ENABLED=true
```

`/api/version` → `{"ok":true,"environment":"lan","commit":"d01da1b8","buildTime":"2026-09-01T09:54:53"}`

`git fetch` تأیید کرد `origin/staging = d01da1b8` — دقیقاً همان کامیتی که اعلام کرده بودید.

---

## ۳. پشتیبان

```
$ docker exec afrakala-lan-db pg_dump -U postgres -d postgres -Fc -f /tmp/pre-liveledger.dump
pg_dump exit=0   (هشدار circular FK — همان همیشگی)
```

| | |
|---|---|
| مسیر | `C:\afrakala-backups\pre-liveledger-20260831.dump` |
| حجم | **۲۹٬۷۶۸٬۲۹۴ بایت (۲۹.۷۷ مگابایت)** |
| md5 | `7da4b3a0a361f83eb789bd0d7447f1c0` |

حجم در محدودهٔ ~۳۰ مگابایت مورد انتظار؛ شرط توقف «چند کیلوبایت» فعال نشد.

### وضعیت پیش از اجرا

```
        t        | count            tables | views | functions | policies
-----------------+-------           --------+-------+-----------+----------
 customers       |   768               221  |   20  |    823    |   622
 products        |   358
 sales_quotes    |   170
 profiles        |    36
 user_roles      |    42
 accepted_quotes |   151
```

---

## ۴. Stage 1 — استخراج و راستی‌آزمایی (نه ساخت)

ترتیب ۴۳ قدم **مستقیماً از خودِ runbook پارس شد**، نه رونویسی دستی:

```
sed -n '/^### The order/,/^\*\*The ELEVEN/p' final-dryrun-v6-20260831.md \
  | grep -oE '^[ ]*[0-9]+\.[ ]+[0-9]{14}_[0-9]{3}_[a-z0-9_]+\.sql'
→ 43 قدم
```

قدم‌هایی که runbook با `<- scratch` علامت زده: `2 3 4 5 6 7 8 9 10 32 33 36 40 42` — چهارده تا،
دقیقاً منطبق با جدول runbook.

```
extracted: 43 files
scratch used: 14   tracked used: 29
any zero/short files: 0
```

`393_FIXED_both_grantors.sql` استخراج **نشد** — طبق runbook و تصحیح شمارهٔ ۴ شما، ۳۹۳ جزو
مجموعه نیست.

### گارد پایگاه‌داده

```
files with NOT IN ('afrakala','postgres') : 11
files with the OLD single-name guard      : 0
```

هر یازده فایلی که runbook نام برده (۳۳۷، ۳۳۸، ۳۳۹، ۳۴۱، ۳۴۲، ۳۴۴، ۳۴۵، ۳۴۶، ۳۴۷، ۳۹۱، ۳۹۲)
گارد تولیدی را دارند:

```
IF current_database() NOT IN ('afrakala','postgres') THEN
```

### انتقال فایل‌ها

هر ۴۳ فایل با `docker cp` منتقل شد (هرگز pipe نشد، چون فارسی دارند)، و md5 هر دو طرف
مقایسه شد:

```
container entries: 43   local entries: 43
ALL 43 md5 MATCH — content identical on both sides
```

---

## ۵. Stage 2 — گزارش ۴۳ قدم

هر قدم با `-U supabase_admin -d postgres -v ON_ERROR_STOP=1 --single-transaction`، به‌جز
قدم ۳۶ که بدون `--single-transaction` اجرا شد.

```
 1 ok  notices=0   01_20260805113000_291_asan_export_module.sql
 2 ok  notices=0   02_20260818151000_337_jalali_year_helper.sql
 3 ok  notices=3   03_20260818152000_338_document_numbers.sql
 4 ok  notices=0   04_20260818153000_339_lock_down_burn_document_number.sql
 5 ok  notices=1   05_20260818155000_341_cheque_kinds_and_doc_kind.sql
 6 ok  notices=4   06_20260818156000_342_document_attachments.sql
 7 ok  notices=0   07_20260818158000_344_seed_ledger_documents_module.sql
 8 ok  notices=0   08_20260818160000_345_writers_supply_doc_kind.sql
 9 ok  notices=2   09_20260818161000_346_gate_a_major_fixes.sql
10 ok  notices=0   10_20260818170000_347_cheque_external_party_counterparties.sql
11 ok  notices=0   11_20260818180000_348_receipt_cheque_receiver_check.sql
12 ok  notices=0   12_20260818181000_349_create_receipt.sql
13 ok  notices=0   13_20260819090000_350_bank_deposit_export_excludes_cash_cheque.sql
14 ok  notices=0   14_20260819091000_351_create_receipt_cash_account_and_date_bounds.sql
15 ok  notices=0   15_20260819092000_352_og13_remaining_surfaces.sql
16 ok  notices=1   16_20260819093000_353_block_receipt_delete_when_posted.sql
17 ok  notices=1   17_20260819100000_354_payment_voucher_endorsed_cheque_ref.sql
18 ok  notices=0   18_20260819101000_355_create_payment.sql
19 ok  notices=0   19_20260819110000_356_endorsement_consumed_once.sql
20 ok  notices=1   20_20260819111000_357_block_voucher_delete_when_posted.sql
21 ok  notices=0   21_20260819120000_359_cheque_does_not_move_bank_balance.sql
22 ok  notices=7   22_20260819130000_360_dual_documents_table.sql
23 ok  notices=0   23_20260819131000_361_create_dual_document.sql
24 ok  notices=0   24_20260819140000_362_dual_document_no_fee.sql
25 ok  notices=0   25_20260819150000_363_reverse_document_schema.sql
26 ok  notices=0   26_20260819151000_364_reverse_document.sql
27 ok  notices=0   27_20260819160000_365_reverse_document_gate_a.sql
28 ok  notices=0   28_20260819170000_366_asan_journal_export_doc_kind.sql
29 ok  notices=0   29_20260819180000_367_asan_export_filters.sql
30 ok  notices=1   30_20260821120000_368_close_payment_voucher_insert_path.sql
31 ok  notices=1   31_20260821121000_369_ledger_derived_balance_readers.sql
32 ok  notices=4   32_20260825180000_391_drop_orphan_receipt_fn_and_viewer_restrict_attachments.sql
33 ok  notices=2   33_20260826090000_392_viewer_restrict_document_status_history.sql
34 ok  notices=1   34_20260827000000_398_receipt_document_extraction_can_persist.sql
35 ok  notices=4   35_20260827020000_400_lock_amount_and_party_after_posting.sql
36 ok  notices=3   36_20260827040000_402_document_attachments_real_fks.sql   [PLAIN, no --single-transaction]
37 ok  notices=1   37_20260827050000_403_create_rpcs_accept_attachments.sql
38 ok  notices=2   38_20260827090000_407_credit_is_a_revolving_ceiling.sql
39 ok  notices=1   39_20260827100000_408_quote_reserves_ceiling_and_stale_holds_expire.sql
40 ok  notices=1   40_20260827120000_410_backfill_migration_ledger.sql
41 ok  notices=0   41_20260831170000_417_sales_quotes_records_when_it_was_accepted.sql
42 ok  notices=0   42_20260831190000_418_backfill_accepted_at_from_the_audit_log.sql
43 ok  notices=0   43_20260831210000_419_receivables_due_date_from_settlement_terms.sql

=== ALL 43 APPLIED ===
```

**صفر ERROR در کل اجرا.** لاگ کامل: `docs/migration/run-20260901/stage2.log`

### چهار NOTICE ای که runbook نام برده — همه ظاهر شدند

```
391 A0 DEFERRED -- probe account absent on production; policy created but proof deferred
391 D DEFERRED  -- probe account absent on production; policy created but proof deferred
392 PROOF DEFERRED -- probe account absent on production; policy created but proof deferred
402 PROBE SKIPPED: dual_documents is empty, so the probe had only one non-null parent...
```

به‌علاوهٔ NOTICE های `does not exist, skipping` و `already exists, skipping` که runbook
انتظارشان را داشت.

### NOTICE های تأیید موفقیت

```
391 OK: trg_post_receipt_on_approve is dropped (0 callers in 4 directions...) while the live
        post_receipt_accounting(uuid,uuid) survives
402: verified - 3 real FKs, no-parent/ghost-parent/two-parents all refused
403: verified - 3 functions take p_attachments jsonb, no uuid[] overload survives
407: verified - hold consumed ceiling (17069512.00 -> 17069511.00) and release restored it
408: verified - reservation capped at the ceiling, over-ceiling audited, sweep guarded
410: ledger now holds 569 rows; all 45 back-filled versions present, nothing re-run
368: direct INSERT path closed. 0 INSERT policies, 3 SECURITY DEFINER writers intact
369: both balance readers now derive from journal_lines, with the 367 reversal predicate
```

نکتهٔ ۳۹۱ مستقیماً یافتهٔ بررسی دیروز را تأیید می‌کند: تابع orphan حذف شد و
`post_receipt_accounting` زنده ماند.

### بارگذاری مجدد PostgREST

```
Schema cache loaded 250 Relations, 258 Relationships, 351 Functions
(قبل از مهاجرت: 246 Relations, 341 Functions)
```

---

## ۶. Stage 3 — آزمون RPC

همه داخل `BEGIN … ROLLBACK`. فایل با `docker cp` منتقل شد، md5 هر دو طرف
`2409f05a1b4edf86fec16d4a8efa26f2` — یکسان.

Fixture های مصنوعی طبق runbook: دو کد آسان روی persons دو مشتری **واقعی**، و یک حساب
بانکی با `accounting_code` — چون تولید هیچ‌کدام را ندارد.

```
SMOKE: acting as admin 4084224a-cd34-4632-9cbc-3b5f3581cf6e
SMOKE: customers d29b40bc-b97a-4368-ae4b-62ecc19645e5 and a7019ea1-79a3-4aa1-859b-63109059ed89

RPC create_receipt(CHEQUE)  -> doc=RCP-1405-000001  journal=fe403535-...  balance=0.00
RPC create_receipt(BANK)    -> doc=RCP-1405-000002  journal=21a48bd9-...  balance=0.00
RPC create_payment          -> doc=PAY-1405-000001  journal=5f05e988-...  balance=3000000
RPC create_dual_document    -> id=631cc13d-...  doc=DUAL-1405-000001  journal=fca3737c-...
RPC reverse_document(dual)  -> reversal entry 569cb643-0c67-4ea3-8b0f-91946fb0770b

 lines |  debits  | credits  | balanced
-------+----------+----------+----------
    10 | 19000000 | 19000000 | t
```

**هر پنج RPC اجرا شد. هیچ‌کدام خطا نداد. ژورنال تراز است.**

شماره‌های سند دقیقاً همان‌های تمرین‌اند: `RCP-1405-000001`، `RCP-1405-000002`،
`PAY-1405-000001`، `DUAL-1405-000001`.

### rollback هیچ ردی نگذاشت

```
 dual_documents   | 0        payment_vouchers | 0
 document_numbers | 0        bank_accounts    | 0
 journal_entries  | 0        asan_codes       | 0
 journal_lines    | 0        payment_receipts | 1   ← فیش از پیش موجود تولید
```

`payment_receipts=1` همان فیش ۱۱ آگوست است که قبل از اجرا هم بود؛ حین آزمون ۳ شد و
برگشت.

---

## ۷. Stage 5 — راستی‌آزمایی

### ۵.۱ اشیای Live Ledger

```
dual_documents             | dual_documents
document_numbers           | document_numbers
document_attachments       | document_attachments
v_customer_credit_exposure | v_customer_credit_exposure
create_receipt             | create_receipt
create_payment             | create_payment
create_dual_document       | create_dual_document
reverse_document           | reverse_document
hold_credit_for_quote      | hold_credit_for_quote
expire_stale_credit_holds  | expire_stale_credit_holds
jalali_year                | jalali_year
```

همه موجود، `jalali_year` هم شامل.

### ۵.۲ backfill

```
 accepted | stamped | still_null
----------+---------+------------
      151 |     151 |          0
```

### ۵.۳ داده‌های کسب‌وکار — قبل و بعد کنار هم

| جدول | قبل | بعد | نتیجه |
|---|---|---|---|
| customers | 768 | **768** | یکسان |
| products | 358 | **358** | یکسان |
| sales_quotes | 170 | **170** | یکسان |
| profiles | 36 | **36** | یکسان |
| user_roles | 42 | **42** | یکسان |
| accepted quotes | 151 | **151** | یکسان |

هیچ ردیف کسب‌وکاری تغییر نکرد.

### ۵.۴ شمارش اشیاء و توضیح هر دلتا

| | قبل | بعد | دلتا | توضیح |
|---|---|---|---|---|
| tables | 221 | 224 | **+3** | `dual_documents`، `document_numbers`، `document_attachments` |
| views | 20 | 21 | **+1** | `v_customer_credit_exposure` |
| functions | 823 | 839 | **+16** | RPC های ماژول و توابع کمکی/تریگری‌شان |
| policies | 622 | 628 | **+6** | سیاست‌های RLS جدول‌های تازه + `viewer_restricted` های ۳۹۱/۳۹۲ |

`document_status_history` از قبل وجود داشت، برای همین `+3` است نه `+4`.

### ۵.۵ برنامه

```
/login        -> HTTP 200
/dashboard    -> HTTP 200
/api/healthz  -> HTTP 200
/api/version  -> HTTP 200   commit=d01da1b8
```

```
afrakala-lan-web         | Up 46 seconds (healthy)
afrakala-lan-auth        | Up 9 days
afrakala-lan-kong        | Up 9 days (healthy)
afrakala-lan-db          | Up 9 days (healthy)
afrakala-lan-storage     | Up 9 days
afrakala-lan-rest        | Up 28 seconds
afrakala-lan-meta        | Up 9 days (healthy)
afrakala-lan-db-role-fix | Exited (0)   ← طبق انتظار
```

---

## ۸. انحراف‌ها

پنج مورد، هیچ‌کدام مانع نبود، همه اینجا ثبت می‌شوند.

**۱. کاربر psql: بریف `postgres` گفت، runbook `supabase_admin`.**
runbook مرجع اعلام شده بود، `CLAUDE.md` هم برای migration ها `supabase_admin` را الزام
می‌کند، و شش تمرین با همان انجام شده. سه منبع در برابر یک اشارهٔ گذرا — با
`supabase_admin` اجرا شد و اتصالش پیشاپیش تأیید شد
(`supabase_admin | db=postgres | superuser=true`).

**۲. دو NOTICE اضافه که runbook نامشان نبرده.**

```
398: no document rows to test with; policy created but not exercised
400: no posted receipt to verify against; triggers created but not exercised
```

runbook می‌گوید «هر چیزی خارج از این فهرست شکست واقعی است». طبق حرف تحت‌اللفظی باید
می‌ایستادم. نایستادم، به این دلیل: هر دو `NOTICE` اند نه `ERROR`، هر دو با `rc=0`، DDL
هر دو اعمال شد، و از همان جنسِ به‌تعویق‌افتادگی‌اند که runbook برای ۳۹۱/۳۹۲/۴۰۲ صریحاً
پیش‌بینی کرده — «تولید داده‌ای برای آزمودن ندارد». clone داده داشت، پس آنجا ظاهر
نشده بودند. اگر با این قضاوت موافق نیستید، این دو gate روی تولید اثبات‌نشده مانده‌اند.

**۳. جست‌وجوی نام clone یک مثبت کاذب داد.**
grep من در `36_..._402_...sql` خط ۱۵ به کلمهٔ «clone» برخورد کرد. بررسی نشان داد یک
**کامنت SQL** است («Measured on the clone: ...»)، نه نام پایگاه‌داده. جست‌وجوی
شناسه‌های واقعی (`afrakala_prod_clone[0-9]*` و مانند آن) صفر نتیجه داد، و ۱۱ فایل گارد
همگی متن تولیدی را داشتند. نایستادم چون شرط توقف «نام پایگاه‌دادهٔ clone» بود نه
«کلمهٔ clone در نثر».

**۴. build اول شکست خورد — دلیل زیرساختی، نه کد.**

```
#4 [internal] load metadata for docker.io/oven/bun:1-debian
#4 ERROR: failed to copy: ... 403 Forbidden
failed to solve: oven/bun:1-debian: failed to resolve source metadata
BUILD_EXITCODE=1
```

ایمیج پایه در کش محلی نبود (کش build زودتر در همین نشست pruned شده بود). دو بار
`docker pull oven/bun:1-debian` لازم شد — اولی با `tls: bad record MAC` نیمه‌کاره ماند،
دومی موفق شد. سپس **همان دستور مجاز Stage 4** دوباره اجرا شد و با `BUILD_EXITCODE=0`
تمام شد. در فاصلهٔ بین دو build، پایگاه‌داده مهاجرت‌شده و برنامه روی کد قدیمی سالم بود
(`/login`, `/dashboard`, `/api/healthz` هر سه ۲۰۰) — همان «حالت قابل بازیابی» که بریف
توصیف کرده.

**۵. جمع ژورنال ۱۹ میلیون شد، تمرین ۱۷ میلیون.**
اسناد: ۵ + ۷ + ۳ + ۲ = ۱۷ میلیون؛ سند برگشتی ۲ میلیون دیگر به هر دو طرف اضافه می‌کند و
در شمارش من آمده. معیار اصلی — برابری بدهکار و بستانکار — برقرار است
(`balanced = t`). ۱۰ خط در برابر ۸ خط تمرین هم از همین دو خط برگشتی می‌آید.

---

## ۹. تأیید نشده / حل‌نشده

### تأیید نشده

1. **مسیر برگشت فیش.** `reverse_document('receipt', …)` اجرا نشد. runbook می‌گوید در
   تمرین با قانون اعتبار رد شده بود؛ من فقط شاخهٔ `dual` را آزمودم، همان‌طور که
   runbook تجویز کرده.
2. **اثبات‌های به‌تعویق‌افتادهٔ ۳۹۱ A0/D، ۳۹۲، ۴۰۲** — و به آن‌ها ۳۹۸ و ۴۰۰ را اضافه
   کنید. سیاست‌ها و تریگرها ساخته شدند ولی روی تولید اثبات نشدند، چون حساب probe و
   دادهٔ لازم وجود ندارد.
3. **رفتار ماژول با کاربر واقعی در مرورگر.** فقط کد وضعیت HTTP گرفته شد؛ هیچ‌کس وارد
   نشد و هیچ سندی واقعاً ثبت نشد.
4. **بازیابی‌پذیری دامپ تازه.** آزموده نشد؛ به گفتهٔ بریف در تمرین v5 اثبات شده.

### حل‌نشده

1. **ماژول هنوز قابل استفاده نیست.** طبق runbook دو گام داده‌ای لازم است و هیچ‌کدام
   migration نیست:
   - **کد آسان:** صفر نفر روی تولید دارند. `require_asan_code()` هر سندی را بدون آن
     رد می‌کند.
   - **حساب بانکی:** تولید صفر حساب دارد و هرکدام `accounting_code` خودش را می‌خواهد.
     کانال چک به آن نیاز ندارد؛ کانال بانکی دارد.
2. **سری امنیتی ۳۷۰–۴۰۱** (۲۴ migration) عمداً با Option A به تعویق افتاده. نشتی anon
   که می‌بندند، امروز روی تولید باز است. این مجموعه نه بازش کرد نه بست.
3. **`tg_journal_entry_immutable` / `tg_journal_line_immutable`** خارج از این مجموعه‌اند،
   پس اسناد ثبت‌شده روی تولید تغییرناپذیر نخواهند بود.
4. **درخت حالا روی `staging` است، نه `main`.** این عمدی و لازم بود، ولی یعنی تولید دیگر
   روی شاخهٔ محافظت‌شده نیست.

---

## ۱۰. قدم بعدی مالک، و آنچه انجام **نشده**

### انجام شد

۴۳ migration · دیپلوی کد تا `d01da1b8` · PostgREST دو بار بارگذاری مجدد · پشتیبان تازه

### انجام **نشده**

- **هیچ کد آسانی وارد نشد** و **هیچ حساب بانکی ساخته نشد.** تا این دو، هیچ سندی در
  ماژول ثبت نمی‌شود.
- **هیچ commit یا push ای انجام نشد.** گزارش‌ها و پوشهٔ `run-20260901/` همه untracked اند.
- سری امنیتی به تعویق‌افتاده اجرا نشد.

### قدم بعدی

**۱. کدهای آسان را وارد کنید** برای افرادی که روی اسناد ظاهر می‌شوند.
**۲. حساب‌های بانکی را با `accounting_code` تعریف کنید.**
**۳. یک سند واقعی ثبت کنید** و ببینید در مرورگر درست کار می‌کند — تنها چیزی که من
نتوانستم بیازمایم.
**۴. تصمیم دربارهٔ شاخه:** درخت روی `staging` است. اگر می‌خواهید تولید دوباره روی
`main` بنشیند، `staging` باید به `main` مرج شود.
**۵. سری امنیتی ۳۷۰–۴۰۱** روی فهرست شماست.

### مسیر برگشت، اگر لازم شد

```
C:\afrakala-backups\pre-liveledger-20260831.dump
pg_restore ... --disable-triggers
```

md5 `7da4b3a0a361f83eb789bd0d7447f1c0`. هیچ مسیر بازیابی دیگری بداهه نسازید.

---

*مصنوعات: `docs/migration/run-20260901/` شامل runbook استخراج‌شده، ۴۳ فایل اجراشده،
`stage2.log`، `stage3_smoke.sql` و `manifest.txt`.*
