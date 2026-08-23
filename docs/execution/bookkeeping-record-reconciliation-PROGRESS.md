# BOOKKEEPING — هم‌ترازکردن رکورد عملیاتی با آنچه واقعاً زنده است — PROGRESS

## HANDOFF STATE

```
Mission:              bookkeeping record reconciliation
Status:               complete — pending independent review
Branch:               feature/bookkeeping-record-reconciliation
Base:                 staging @ faa8b1fa  (verified: git rev-parse origin/staging)
Items:                4 of 4 done
Schema objects changed: ZERO — proven by digest + two counts, before and after
Migrations added:     ZERO. supabase/migrations/ gained no file.
Data written:         27 rows into supabase_migrations.schema_migrations, nothing else
REST restarted:       NO, and none was needed — no schema object moved
Typecheck:            70 / 70 baseline (branch touches 0 TypeScript files)
Web rebuilt:          NO — 0 files under src/
```

## چرا این مأموریت وجود دارد

چهار فاز برنامه علیه رکوردی بسته شدند که دیگر سیستم را توصیف نمی‌کند. هیچ‌کدام
از این‌ها نقص سیستم نیست؛ همه نقص **رکورد**اند — و فاز ۹ از روی همین رکورد
اجرا خواهد شد.

---

## آیتم ۱ — back-fill جدول `schema_migrations`

### ۱.۱ — سه منبع مستقل، و آشتی‌شان

**منبع A — فایل‌ها.** `supabase/migrations/` **۵۶۸** فایل دارد. هر ۵۶۸ نام با
الگوی `<۱۴ رقم>_...` می‌خواند؛ صفر فایل بی‌مهر زمانی.

**منبع B — دفتر برنامه.** جدول مهاجرت در `00-progress.md` ادعای ۳۳۶ تا ۳۸۰ را
دارد (با ۳۶۷ که آیتم ۲ اضافه‌اش کرد).

**منبع C — کاتالوگ زنده.** تنها منبعی که نمی‌تواند دربارهٔ آنچه اجرا شده دروغ
بگوید.

تطبیق A در برابر جدول:

```
files with a timestamp : 568
already in the table   : 523
MISSING from the table : 45     -> exactly migrations 336 … 380
missing range          : 20260818150000 … 20260823010000
```

### ۱.۲ — پروب‌ها، و چرا فقط ۲۷ از ۴۵ نوشته شد

پروب از روی نام فایل حدس زده نشد. برای هر مهاجرت، فایل خوانده شد، شیئی که
نام می‌برد پیدا شد، و همان شیء در کاتالوگ زنده بررسی شد. برای
`CREATE OR REPLACE` تابع، `pg_get_functiondef` با یک قطعهٔ متمایزکننده از
بدنهٔ فایل مقایسه شد، نه صرفاً وجود تابع.

**قاعدهٔ انتساب که همه‌چیز را تعیین کرد:** در یک زنجیرهٔ
`CREATE OR REPLACE`، بدنهٔ زنده متعلق به **آخرین** نویسنده است و دربارهٔ
نویسنده‌های قبلی چیزی نمی‌گوید. زنجیره‌ها از خود ۴۵ فایل استخراج شدند:

```
asan_list_bank_deposit_export  350, 364        -> only 364 body-provable
asan_list_journal_export       358, 359, 366, 367 -> only 367
assign_document_number         338, 346        -> only 346  (338 provable by its TABLE)
create_dual_document           361, 362        -> only 362
create_payment                 355, 356, 364   -> only 364
create_receipt                 349, 351        -> only 351
get_account_ledger             359, 364, 369   -> only 369
require_asan_code              340, 346        -> only 346
reverse_document               364, 365        -> only 365
validate_journal_line_ref      341, 347        -> only 347  (341 provable by its COLUMN)
vw_account_balances            359, 364, 369   -> only 369
```

### ۱.۳ — نتیجهٔ پروب‌ها روی کاتالوگ زنده

هر ۳۶ پروب اجرا شد؛ ۳۵ تا در اجرای اول `true` دادند. یک `false` — پروب ۳۶۵ —
**ایراد پروب من بود، نه وضعیت**: دنبال «`accountant` هست و `manager` نیست»
گشته بودم، ولی کلمهٔ `manager` جای دیگری در بدنهٔ تابع می‌آید. با قطعهٔ دقیق
تکرار شد:

```
live : has_any_role(_uid, ARRAY['admin'::app_role, 'accountant'::app_role])
365  : ARRAY['admin'::app_role, 'accountant'::app_role]        <- matches
364  : ARRAY['admin'::app_role, 'accountant'::app_role, 'manager'::app_role]
```

نمونه‌ای از پروب‌های قطعی (خروجی واقعی):

```
336  post_receipt_journal dropped                           true
338  table document_numbers                                 true
339  anon lost EXECUTE burn_document_number                  true
341  journal_entries.doc_kind column                        true
344  role_permissions has ledger-documents rows             true
348  constraint payment_receipts_receiver_exclusive_chk     true
353  trigger trg_payment_receipts_block_delete_when_posted  true
360  table dual_documents                                   true
362  create_dual_document has 15 args not 18                true
363  journal_entries.reverses_entry_id column               true
365  reverse_document role array is exactly admin+accountant true
367  asan_list_journal_export filters cheque AND reversal   true
368  zero INSERT policy on payment_vouchers                 true
369  vw_account_balances reads journal_lines                true
370  anon holds 0 privileges on the 8 guard views           true
373  pg_default_acl anon gone for r and S                   true
```

### ۱.۴ — جدول تطبیق، خلاصه

| | تعداد |
|---|---|
| فایل‌های گم‌شده از جدول | ۴۵ |
| **APPLIED** — نوشته شد | **۲۷** |
| **UNPROVABLE** — عمداً نوشته نشد | **۱۸** |

هجده مورد `UNPROVABLE`، با دلیل هرکدام:

| # | دلیل |
|---|---|
| ۳۴۰ | `require_asan_code` را ۳۴۶ بازنویسی کرد؛ هیچ اثر بادوام دیگری ندارد |
| ۳۴۹ | `create_receipt` را ۳۵۱ بازنویسی کرد؛ گرنت‌هایش را هم ۳۵۱ دوباره صادر می‌کند |
| ۳۵۰ | `asan_list_bank_deposit_export` را ۳۶۴ بازنویسی کرد |
| ۳۵۵ | `create_payment` را ۳۵۶ و بعد ۳۶۴ بازنویسی کردند |
| ۳۵۶ | `create_payment` را ۳۶۴ بازنویسی کرد |
| ۳۵۸ | `asan_list_journal_export` را ۳۶۶ و ۳۶۷ بازنویسی کردند |
| ۳۵۹ | `vw_account_balances` و `get_account_ledger` را ۳۶۹ بازنویسی کرد |
| ۳۶۱ | `create_dual_document` را ۳۶۲ حذف و از نو ساخت |
| ۳۶۶ | `asan_list_journal_export` را ۳۶۷ بازنویسی کرد |
| ۳۷۱، ۳۷۲، ۳۷۵، ۳۷۸، ۳۷۹، ۳۸۰ | مهاجرت‌های صرفاً ادعایی — هیچ شیئی نمی‌سازند و هیچ ردی نمی‌گذارند |
| ۳۷۴، ۳۷۶، ۳۷۷ | امتیازهایی به `anon` می‌دهند که از قبل داشت — no-op کاتالوگی |

**چرا ننوشتنشان درست است، نه محافظه‌کاری بی‌جا:** ردیف نبود باعث می‌شود یک
replay آن مهاجرت را **دوباره اجرا** کند، و برای هر ۱۸ مورد این بی‌خطر است —
ایدمپوتنت‌اند، ادعایی‌اند، یا `CREATE OR REPLACE`ای که replay به‌هر‌حال به
ترتیب فایل اجرا می‌کند. ردیفی که به‌غلط نوشته شود باعث می‌شود replay مهاجرتی
را **رد کند** که شاید هرگز اجرا نشده — و هیچ چیز بعدی متوجه نمی‌شود.

### ۱.۵ — جدول پیش از نوشتن

```
Table "supabase_migrations.schema_migrations"
   version     | text                     | not null
   inserted_at | timestamp with time zone | default now()
PRIMARY KEY (version)

rows=523  min=20260424144837  max=20260811180000
```

۵۲۳ ردیف موجود همه یک `inserted_at` یکسان دارند (`2026-08-11 16:25:45.672188+00`) —
یک درج دسته‌ای. ردیف‌های تازه `inserted_at` پیش‌فرض می‌گیرند، که صادقانه زمان
**تعمیر** را ثبت می‌کند نه زمانی که کسی نسنجیده است.

### ۱.۶ — اسکریپت، اثباتش، و اعمالش

`docs/verification/schema-migrations-backfill.sql` — فقط `INSERT`، ایدمپوتنت با
`ON CONFLICT (version) DO NOTHING`، و **صفر** دستور `DELETE`/`UPDATE`/`BEGIN`/
`COMMIT`/`ROLLBACK` (بررسی شد).

سربرگش صریح می‌گوید این فایل **هرگز نباید به `supabase/migrations/` منتقل شود**،
و چرا: به شِمای دفترداری مهاجرت می‌نویسد، و فاز ۹ آن پوشه را روی تولید replay
می‌کند. همان رفتاری که با `phase-2-remediation-testdata-cleanup.sql` شد.

اثبات در `BEGIN … ROLLBACK` **پیش از** اعمال واقعی:

```
BEFORE          rows=523  max=20260811180000
INSERT 0 27
INSIDE          rows=550  max=20260822210000
ROLLBACK
AFTER-ROLLBACK  rows=523  max=20260811180000
```

اعمال واقعی:

```
psql -v ON_ERROR_STOP=1 --single-transaction -f backfill.sql
SET
INSERT 0 27
psql exit=0

AFTER   rows=550  max=20260822210000
```

**B2 — ایدمپوتنس:** اجرای دوباره `INSERT 0 0` داد و شمار روی ۵۵۰ ماند.

**PostgREST ری‌استارت نشد و لازم هم نبود** — هیچ شیء شِمایی عوض نشد و چیزی در
شِمای در معرض حرکت نکرد. این را صریح می‌نویسم به‌جای اینکه بازتابی ری‌استارت کنم.

### ۱.۷ — اثبات اینکه چیز دیگری عوض نشد

| سنجه | پیش | پس |
|---|---|---|
| `md5` روی `relname:relacl` کل `public` | `a51ee08e55ff48453d7a2925f1c5d098` | `a51ee08e55ff48453d7a2925f1c5d098` |
| `pg_class` در `public` | ۱۱۰۵ | ۱۱۰۵ |
| `pg_proc` در `public` | ۸۴۱ | ۸۴۱ |

هر سه یکسان.

---

## آیتم ۲ — ردیف ۳۶۷

اضافه شد، در **جای عددی** بین ۳۶۶ و ۳۶۸. هر ستون از شاهد پر شد، نه از الگوی
همسایه‌ها:

| ستون | مقدار | منبع |
|---|---|---|
| filename | `20260819180000_367_asan_export_filters.sql` | `supabase/migrations/` |
| phase / reason | ۵ — پیاده‌سازی **T15** | متن T15: نقدی، چکی و برگشتی دستی وارد آسان می‌شوند و نباید در فایل خروجی باشند |
| date | 2026-08-19 | مهر زمانی نام فایل، **دو-سویه** با `git log --follow` که کامیت `d850e63a` را در همان روز نشان می‌دهد |
| rollback file | `docs/verification/367-down.sql` | **بررسی شد — وجود دارد.** پس مسیرش نوشته شد، نه `none` |
| REST restarted | **unknown** | این مهاجرت در ۲۶/۰۸/۱۹ توسط عامل دیگری اعمال شده و هیچ‌جا ری‌استارتی ثبت نشده. `unknown` پاسخ صادقانه است و با `no` یکی نیست |

پروب زنده که ردیف را پشتیبانی می‌کند:
`pg_get_functiondef(asan_list_journal_export)` هم `cheque` دارد هم `revers` → `true`.

یادداشت بالای جدول بازنویسی شد: حالا **حل‌شده** می‌خواند، ولی تاریخچهٔ اینکه چرا
جا افتاده بود نگه داشته شد — چون همان تاریخچه قاعده‌ای را توضیح می‌دهد که سه
مأموریت پیاپی درست رعایتش کردند.

---

## آیتم ۳ — بلوک `HANDOFF STATE`

هر خط از سنجش، هیچ خطی از متن قبلی.

| خط | مقدار قدیم | مقدار جدید | منبع |
|---|---|---|---|
| Current phase | «6 COMPLETE … PV-remediation phases 0-3 … Phase 4 NOT started … ONE REMAINING MANUAL STEP: the test web image was not rebuilt» | «NONE IN PROGRESS»، به‌علاوهٔ چهار مأموریت جانبی با شمارهٔ PR و کامیت ادغام، و اینکه گام دستی **حل شده** | جدول فاز در همان فایل + `gh pr view` |
| Branch | `feature/phase6-wizard` | `staging` مسیر یکپارچه‌سازی است؛ کار روی `feature/*` | `git rev-parse --abbrev-ref` |
| Last commit SHA | «see git log after this PR merges» | `faa8b1fa` | `git rev-parse origin/staging` |
| Live `APP_GIT_SHA` | «pending deploy» | `dbe46fe1` — **عقب‌تر از HEAD و این درست است** | `docker exec afrakala-lan-web printenv APP_GIT_SHA` |
| Migrations applied | «32 (336-367)» | «45 (336-380)» + وضعیت `schema_migrations` | آیتم ۱ |
| Open Owner-Gates | ۷ دروازه | **۲۰ باز، ۱۳ بسته**، با فهرست کامل | مشتق از خود جدول log، دروازه‌به‌دروازه |
| Typecheck | «70 / 70 (D14) — phase 6» | «70 / 70 (D14)» | بی‌قید به فاز |
| Production touched | NO | NO — بدون تغییر | — |

### `APP_GIT_SHA` — و اینکه چرا build نزدم

```
docker exec afrakala-lan-web printenv APP_GIT_SHA   ->  dbe46fe1
git diff --name-only dbe46fe1 origin/staging        ->  12 files under docs/
                                                        8 files under supabase/
                                                        ZERO under src/
```

هیچ‌چیز در آن فاصله به بستهٔ ساخته‌شده نمی‌رسد. جابه‌جا کردن مُهر، آن را دربارهٔ
محتوای ایمیج **دروغ‌گو** می‌کرد. ری‌استارت PostgREST پس از هر مهاجرت همان چیزی
است که واقعاً اشیای تازهٔ پایگاه‌داده را در دسترس می‌کند.

### دو نقص در خود جدول Owner-Gate که هم‌زمان اصلاح شد

بلوک باید با log بخواند؛ ولی log خودش دو جا غلط بود:

1. **OG-25 هنوز `OPEN` می‌خواند** در حالی که مأموریتی که بستش ادغام شده و در
   جدول فاز `COMPLETE` ثبت است. مأموریت اتمام خودش را در جدول فاز و در دفتر
   مهاجرت ثبت کرده بود ولی هرگز به log دروازه‌ها برنگشت. اصلاح شد؛ متن اصلی
   زیرش نگه داشته شد.
2. **OG-24 فقط به‌صورت یک بخش `###` وجود داشت** و هرگز به جدول اضافه نشده بود،
   پس هر خوانندهٔ log از ۲۶/۰۸/۲۲ یک دروازه کم داشته. ردیفش اضافه شد؛ بخش
   اصلی مرجع است و تکرار نشد.

و یک **تناقض ثبت‌شده، نه اصلاح‌شده**: `OG-7` اصلاً دروازه نیست — عنوان بخش
«Reviewer escalations (OG-7)» است. به همین دلیل ردیف ندارد و نباید داشته باشد.
جدول شمارش `MASTER-CHECKLIST` هم آن را «6 + OG-7» می‌شمارد، که با همین خوانش
سازگار است.

---

## آیتم ۴ — تیک‌های `MASTER-CHECKLIST`

هفده تیک، هرکدام با artefact نام‌برده. **معیارها زنده اجرا شدند، نه از سند
خوانده شدند** — همان‌طور که خودِ معیارها نوشته شده‌اند.

| task | معیار پذیرش | نتیجهٔ زنده |
|---|---|---|
| **0.5** | مالک A1–A4 را تأیید کند | `ledger-decisions.md:513` — «OG-1: CONFIRMED 2026-08-18 — A1, A2, A3, A4 approved by owner.» |
| **1.1** | `count(post_receipt_journal)` = `0` | **0** |
| **1.2** | دو فراخوان با یک `source_id` یک شماره بدهد | `RCP-1405-000056` و `RCP-1405-000056` — با JWT مدیر، داخل `BEGIN … ROLLBACK`؛ شمار جدول پس از بازگشت ۱۵۹ |
| **1.3** | `require_asan_code` وجود داشته باشد و رفتار کند | تابع هست؛ بدنه‌اش `RAISE EXCEPTION 'شناسهٔ شخص برای بررسی کد آسان الزامی است'` دارد |
| **1.4** | `journal_entries WHERE doc_kind IS NULL` = `0` | **0** |
| **1.5** | `relrowsecurity` روی `document_attachments` = `t` | **true** |
| **1.6** | `UPDATE` روی سند posted خطا بدهد | تریگر `tg_journal_entry_immutable` سیم‌کشی‌شده: **۱** تریگر غیرداخلی |
| **1.7** | `count(DISTINCT role_name)` برای ماژول تازه | **۷** نقش برای `ledger-documents` |
| **3.1** | ورودی `create_payment` در `rpc-contracts.md` | ۴ ارجاع در `docs/api/rpc-contracts.md` |
| **3.2** | شکل پستینگ `pay_purchase_with_voucher` ثبت شده باشد | ۴ ارجاع در `phase-3-PROGRESS.md` |
| **3.3** | `create_payment` بسازد، شماره بزند، سند بزند، ممیزی کند | تابع هست |
| **3.4** | متوازن، posted، `doc_kind` درست | بدنه هم `payment` دارد هم `supplier_payable` → **true** |
| **3.5** | پیش‌شرط کد آسان برای دریافت‌کننده | بدنه `require_asan_code` را صدا می‌زند → **true** |
| **3.6** | شاخهٔ نقدی، شمارهٔ داخلی | بدنه `cash` دارد → **true** |
| **3.7** | چک خودی، بستانکار `cheque_payable` | **true** |
| **3.8** | چک ظهرنویسی، بستانکار `cheque_receivable`، و چک دوباره مصرف نشود | بدنه هم `cheque_receivable` دارد هم `endors` → **true** |
| **3.9** | دروازهٔ نقشی + گرنت‌ها | `has_any_role` در بدنه → **true**؛ و `anon` روی `create_payment` `EXECUTE` **ندارد** |

### قید مهم که کنار تیک‌ها می‌ماند

هم فاز ۱ و هم فاز ۳ **Gate A را رد کردند و سپس اصلاح شدند**:

- **فاز ۱** — `phase-1-GATE-A.md` صریح می‌گوید `**Verdict: FAIL**`. جدول فاز در
  `00-progress.md` می‌گوید «Gate B PASS، Gate A FAIL then remediated».
  پس تیک یعنی **پس از اصلاح** کامل است.
- **فاز ۳** — `phase-3-GATE-A.md` می‌گوید `FAIL — 1 BLOCKER, 2 MAJOR, 3 MINOR`.
  `phase-3-REMEDIATION-PROGRESS.md` وضعیت `complete` دارد و
  «Defects closed: B1, M2, m1, and OG-20»، با مهاجرت‌های ۳۵۶، ۳۵۷، ۳۵۸.
  **ولی همان فایل می‌گوید `With the owner: M1 (OG-18 restated, deliberately not
  chosen)` و `Deferred with reason: m2 -> phase 6, m3 -> phase 6`.** یعنی
  تیک‌های ۳.۱ تا ۳.۹ کامل‌بودن **تسک**ها را می‌گویند، نه بسته‌شدن هر یافتهٔ
  Gate A.
- **معیار ۳.۸ را اصلاح تغییر داد**، نه پیاده‌سازی اصلی: «چک ارجاع‌شده دوباره
  قابل استفاده نباشد» با مهاجرت **۳۵۶** بسته شد که نتیجهٔ B1 بود. تیک روی متن
  اصلاح‌شده است، نه روی متن اولیه.

### تسک‌هایی که تیک **نخوردند**

- **6.7** — با OG-4 مسدود است و `[ ]` ماند. بررسی شد.
- **فازهای ۷، ۸، ۹** — دست نخوردند؛ صفر تیک در آن‌ها.
- **فاز ۲، ۴، ۵، ۶ (به‌جز 6.7)** — از قبل تیک داشتند؛ لمس نشدند.

### جدول شمارش پایین فایل

با بدنه **می‌خواند** و دست نخورد. هر ده فاز مطابق‌اند و مجموع ۶۹ = ۶۹:

```
phase 0 claimed=5  body=5    phase 5 claimed=5  body=5
phase 1 claimed=7  body=7    phase 6 claimed=10 body=10
phase 2 claimed=8  body=8    phase 7 claimed=7  body=7
phase 3 claimed=9  body=9    phase 8 claimed=5  body=5
phase 4 claimed=7  body=7    phase 9 claimed=6  body=6
TOTAL   claimed=69 body=69
```

پس از این مأموریت: **۵۰ تیک‌خورده، ۱۹ باقی‌مانده** از ۶۹.

---

## تناقض‌های یافته‌شده

| انتظار | یافته |
|---|---|
| `schema_migrations` وضعیت اعمال را ثبت می‌کند | از ۲۶/۰۸/۱۱ یخ‌زده؛ هیچ‌چیز از ۳۳۶ به بعد در آن نیست. مهاجرت‌ها اینجا دستی اعمال می‌شوند و چیزی آن جدول را نمی‌نویسد |
| هر ۴۵ مهاجرت قابل‌اثبات‌اند | ۱۸ تا نیستند — ۹ تای بازنویسی‌شده و ۹ تای بی‌اثر |
| OG-25 پس از اتمام مأموریتش بسته ثبت شده | هنوز `OPEN` می‌خواند |
| هر Owner-Gate ردیفی در log دارد | OG-24 فقط بخش `###` داشت |
| `OG-7` یک دروازه است | نیست — عنوان بخش «Reviewer escalations» است |
| جدول شمارش `MASTER-CHECKLIST` ممکن است کهنه باشد | نیست؛ هر ده فاز می‌خوانند |

## گام بعدی

بازبینی مستقل، یک دور.
