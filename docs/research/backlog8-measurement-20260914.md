# اندازه‌گیری BACKLOG §8 — ۲۴ شهریور ۱۴۰۵ (2026-09-14)

فقط خواندن: worktree جدا (`D:\AfraKalaTest\wt-backlog8` روی `origin/main @ 9bc8d554`)، بدون هیچ کار روی image یا compose،
پایگاه `afrakala` فقط با `default_transaction_read_only=on`، هیچ‌چیز روی `192.168.170.10`.

دامنه همان است که پرامپت §8 خودش تعیین می‌کند: بخش‌های ۲، ۳، ۴ و ۵ از `docs/missions/BACKLOG.md` — **۱۷ بند**.

---

## ۰ · منبع داده و روش

### کدام پایگاه «production» است

§8 می‌خواهد بندهای پایگاه‌داده روی «restore تازهٔ جدیدترین dump production» سنجیده شوند. restore کار docker است و
در این مأموریت ممنوع بود. به‌جایش **خودِ فایل dump بدون restore خوانده شد**: فایل از stdin به `pg_restore -f -` داده شد
(بدون اتصال به هیچ پایگاه، بدون نوشتن فایل در کانتینر) و خروجی متنی در scratchpad تجزیه شد.

| | |
|---|---|
| فایل | `D:\AfraKalaTest\dumps\afrakala-db-20260913-post-release-696.dump` · 36 302 396 B |
| md5 | `b4e43d31e055ea23ab860608e9a7adfc` |
| سربرگ archive (خوانده با Python از بایت‌های فایل) | dbname **`postgres`** · pg 15.6 · TOC **5227** · ساخته‌شده 2026-09-13 18:38:51 |
| **لجر، پیش از هر کوئری دیگر** | **696 ردیف · top `20260913111000`** — مطابق زمینهٔ اعلام‌شدهٔ release |
| مقایسه | `prod-20260913.dump` (md5 `6ccd2dbb…`، 2026-09-12، TOC 5220، لجر 681) برای دو بند به‌عنوان نقطهٔ زمانی دوم |

**اصالت dump — cited، نه استنتاج:** commit `ca125597` (روی `main` نیست) در `docs/research/production-migration-run-20260913.md:547-603` ثبت کرده که همین فایل روی `192.168.170.10` با `pg_dump -U postgres -d postgres -Fc` در 2026-09-13 18:38:51 UTC از پایگاهی با لجر 696 / `20260913111000` گرفته شد، با `md5(container) = b4e43d31e055ea23ab860608e9a7adfc` و «TOC Entries: 5227» — هر دو با اندازه‌گیری من یکی‌اند. شاهد مستقل: پایگاه `postgres` روی کانتینر تست جدول لجر ندارد (`to_regclass('supabase_migrations.schema_migrations') is not null` → `f`).

**پایگاه `afrakala` روی تست production-shape نیست:** `count=686, max=20260908034500` — پیش از release. پس فقط برای
مقایسه استفاده شد، نه برای حکم‌های production.

### فرمان‌های پایه (همه با exit code جدا)

```bash
# لجر و جدول‌ها از dump — بدون اتصال به پایگاه
MSYS_NO_PATHCONV=1 docker exec -i afrakala-lan-db pg_restore -f - -a -n supabase_migrations -t schema_migrations < $D > d_ledger.sql; echo "exit=$?"   # exit=0
MSYS_NO_PATHCONV=1 docker exec -i afrakala-lan-db pg_restore -f - -a -n public -t settlement_types -t gamification_kpis -t profiles -t bank_accounts -t user_roles -t role_permissions -t sale_lists < $D > d_pub.sql; echo "exit=$?"   # exit=0
MSYS_NO_PATHCONV=1 docker exec -i afrakala-lan-db pg_restore -f - -a -n public -t customers -t person_identifiers -t persons -t sales_quotes -t suppliers -t person_roles < $D > d_people.sql; echo "exit=$?"   # exit=0
MSYS_NO_PATHCONV=1 docker exec -i afrakala-lan-db pg_restore -f - -s < $D > d_schema.sql; echo "exit=$?"   # exit=0, 71 565 خط

# afrakala (تست) — فقط‌خواندنی
docker exec -e PGOPTIONS='-c default_transaction_read_only=on' afrakala-lan-db \
  sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -X -h 127.0.0.1 -U supabase_admin -d afrakala -v ON_ERROR_STOP=1 -c "$1"' sh "<sql>"
# show default_transaction_read_only → on
```

بلوک‌های `COPY` با یک تابع کوچک Python (`split('\t')` روی خطوط بین `COPY …` و `\.`) شمرده شدند. هیچ شماره تلفن یا
کد ملی در این سند نیامده.

---

## ۱ · خلاصه

| حکم | تعداد | بندها |
|---|---|---|
| **STILL TRUE** | **۵** | 2.3 · 3.4 · 3.5 · 5.1 · 5.2 |
| **ALREADY FIXED** | **۷** | 2.5 · 2.6 · 2.7 · 3.2 · 3.3 · 4.1 · 4.2 |
| **NEVER TRUE** | **۴** | 2.1 · 2.2 · 2.4 · 3.1 |
| **CANNOT MEASURE** | **۱** | 3.6 |
| جمع | ۱۷ | |

باز هم همان الگو: **از ۱۷ بند فقط ۵ تا هنوز درست‌اند.** ۱۱ تا یا پیش از ثبت‌شدنشان رفع شده بودند یا هیچ‌وقت درست نبودند.

### ⚠️ یافتهٔ بیرون از فهرست — مهم‌تر از هر ۱۷ بند

**ردیف لجر ۵۲۶ روی production دروغ است.** زمینهٔ این مأموریت می‌گفت «ردیف لجر ۴۰۴ دروغ بود و ۵۲۶ ترمیمش کرد». روی
dump پس از release، **هیچ‌کدام از نُه اثری که ۵۲۶ باید بگذارد وجود ندارد**، در حالی که لجر ردیف `20260913090000` را دارد:

- `RELEASE-20260913b.md:273-282` (بلوک ۱۹): «Catalogue evidence in the rehearsal showed this migration's effect is
  already PRESENT … The SQL is NOT re-run. Only the ledger row is written. `ledger_insert_only 20260913090000`»
- لجر dump: `20260913090000	2026-09-13 13:47:08.206266+00`

| بخش ۵۲۶ | نشانه در dump پس از release | حکم |
|---|---|---|
| 386a | `d_schema.sql:39506` `CREATE VIEW public.product_computed_prices_public AS` — بدون `WITH (security_invoker='true')` | اثر غایب |
| 386b | `d_schema.sql:10330` `CREATE VIEW public.v_promotion_suggestions AS` — بدون `security_invoker` | اثر غایب |
| 386c | `vw_account_balances` فقط `WHERE (NOT public.is_viewer_only(auth.uid()))` دارد، نه گارد `uid() IS NOT NULL` | اثر غایب |
| 394 | `create_purchase`، خط ۱۶۸ بدنه: `IF p_purchase_date > CURRENT_DATE THEN` | اثر غایب |
| 396a | `get_payables_list`: `v.due_date = CURRENT_DATE` | اثر غایب |
| 396b | `upsert_staff_daily_performance_metric` بدون `tehran_today` | اثر غایب |
| 396c | `sdpm_insert_privileged` اصلاً وجود ندارد | شیء غایب |
| 404 | `d_schema.sql:3533` — `RETURNS TABLE(… bank_code text, bank_title text, blocked_reason text)`، ۱۰ ستون، بدون `direction`، بدون `payment_vouchers` | اثر غایب |
| 409 | `d_schema.sql:14647` `expire_stale_credit_holds(p_days integer DEFAULT 60)` — overload تک‌آرگومانی هنوز هست | اثر غایب |

نتیجهٔ عملی: خروجی بانکی آسان روی production هنوز پرداخت‌ها را ندارد (همان drift که
`asan-bridge-state-20260913.md` 1c ثبت کرده بود)، و مقایسه‌های تاریخ هنوز UTC‌اند. این دقیقاً قاعدهٔ ۲ بخش ۹ BACKLOG است
(«دفتر مهاجرت در هر دو جهت دروغ می‌گوید»)، این بار ساخته‌شده توسط خود release. **درمان تصمیم مالک است** — اجرای SQL ۵۲۶
روی production (بدنه‌اش با `\if` گارد دارد و روی shape درست no-op می‌شود) و پیدا کردن اینکه طبقه‌بند rehearsal چرا
«PRESENT» گفت. اندازه: **medium**.

---

## ۲ · جدول ۱۷ ردیفی

| id | ادعا، همان‌طور که نوشته شده | حکم | شاهد | اندازه |
|---|---|---|---|---|
| 2.1 | ستون `Bank_cod` خالی می‌رود؛ هیچ ستونی کد حساب شرکت را ندارد؛ ۲۰ حساب + صندوق ۹۸۶ باید کد بگیرند | **NEVER TRUE** (ادعای ستون) · باقی‌ماندهٔ داده درست است | **cited:** `supabase/migrations/20260724150000_155_bank_accounting_code.sql:28` `ADD COLUMN IF NOT EXISTS accounting_code text` (commit `5eb6048a`, 2026-07-24). `src/lib/asan/export-bank-deposit-rows.ts:73` `r.bank_code ?? "", // F Bank_cod`. **measured (dump):** بدنهٔ `asan_list_bank_deposit_export` روی production: `(SELECT NULLIF(btrim(ba.accounting_code), '') FROM public.bank_accounts ba WHERE ba.id = pr.destination_bank_account_id) AS bcode`. `COPY public.bank_accounts`: `ملت جاری افرا … accounting_code=8 … bank` و `صندوق … accounting_code=\N … cash` — **۲ ردیف، نه ۲۱**. UI ورود کد: `src/routes/_app.accounting.bank-accounts.tsx:180, 269` (`AsanCodeCell`) | باقی‌مانده: داده، small |
| 2.2 | PR #383 فقط spec داشت، رفع واقعی هدر را نداشت | **NEVER TRUE** (رفعی لازم نبود) | **measured:** `gh pr view 383 --json …` → `"state":"MERGED","mergedAt":"2026-09-03T22:20:46Z","files":["e2e/asan/og99-bank-export-matches-the-template.spec.ts"],"title":"test(asan): pin the bank export's header contract — no fix was needed"` (exit=0). رفع هدر پیش‌تر نشسته بود: `1da2a778` 2026-08-26 «fix(asan): correct the bank template headers…». **measured:** sharedStrings قالب `docs/asan/templates/bank-deposit-template.xlsx` → `['Date','Code_M','Name_Moshtare','Shopmare_Peygeri','Mablagh','Bank_cod']`، dimension `A1:O1`؛ **cited:** `src/lib/asan/layouts.ts:88-104` همان شش نام + ۹ خالی (۱۵ ستون). `1da2a778` جد `3bc526c4` است (`merge-base --is-ancestor` exit=0) | — |
| 2.3 | قالب خالی خرید/فروش آسان گرفته نشده؛ مقصد `docs/asan/templates/`؛ ۱۸ ستون A..R | **STILL TRUE** | **measured:** `git ls-tree -r --name-only HEAD docs/asan/templates/` → فقط `FAILED-platform-export-sample.xlsx`، `bank-deposit-template.xlsx`، `dual-document-template.xls`. **cited:** `.gitignore:122,125` (`# Owner instruction 2026-08-07: "my repo should contain zero xlsx files ever."` · `*.xlsx`). `layouts.ts:20` `SALES_HEADERS` = ۱۸ مدخل. فایل‌های `docs/verification/m5-export-samples/1-sales.xlsx`/`2-purchase.xlsx` خروجی خود پلتفرم‌اند، نه قالب آسان | small |
| 2.4 | خروجی اکسل پیش‌فاکتور وجود ندارد؛ کل سیستم دو خروجی اکسل دارد | **NEVER TRUE** (با یک ابهام) | **cited:** `src/lib/asan/export-single-quote.ts:1-2` «ASAN M4.8 — exporting one pre-invoice from its detail page»؛ `src/routes/_app.sales.quotes.$quoteId.tsx:43` import و `:697-705` دکمهٔ «خروجی اکسل آسان» برای admin/accountant (`:120`). اضافه‌شده در `ff0b942d` 2026-08-04، جد `3bc526c4`. «دو خروجی» هم غلط است: `asan-bridge-state-20260913.md` 2d شش نویسندهٔ xlsx شمرده. **ابهام:** خروجی *فهرستی* پیش‌فاکتورها (نه قالب آسان) وجود ندارد — `grep -ln "xlsx\|XLSX" src/routes/_app.sales.quotes*.tsx` فقط فایل جزئیات را می‌دهد | — |
| 2.5 | خروجی اکسل `/documents` سه بار خواسته شده، ساخته نشده؛ ده ستون تعیین شد | **ALREADY FIXED** | **cited:** `src/lib/accounting/document-register.ts:125-137` `DOCUMENT_EXPORT_HEADERS` = شماره سند، تاریخ، نوع سند، کانال، طرف حساب، کد آسان، مبلغ (ریال)، حساب بانکی / صندوق، شماره پیگیری، شرح، وضعیت (همان ده ستون، با کد آسان در ستون جدا). `src/routes/_app.accounting.documents.tsx:82, 99, 171` (`handleExport`، `XLSX.writeFile`، «خروجی اکسل»). commit `33bc6704` 2026-09-03 «feat(accounting): دفتر اسناد — … an Excel export (422)»، جد `3bc526c4`. صفحهٔ `/documents` (اسکن کاغذ) خروجی ندارد و قرار هم نبود | — |
| 2.6 | D-8: محدودیت یک‌سند‌در‌فایل فقط یک خط frontend است؛ ریسک ادغام آسان تأییدنشده | **ALREADY FIXED** (محدودیت) · ریسک: CANNOT MEASURE | **measured:** `grep -rn "oneDocumentPerFile\|one_document_per_file" src/` → بدون خروجی، exit=1. **cited:** `src/routes/_app.admin.asan-export.tsx:94-101` «A file may hold more than one document (2026-09-04) … The refusal, the flag and the orphan constant beside the layout were removed together»؛ `src/lib/asan/export-selection.ts:90` `ASAN_EXPORT_BATCH_LIMIT = 1000`. commit `61933ce8` 2026-09-04، جد `3bc526c4` | — |
| 2.7 | صفحهٔ عمومی لیست فروش برای anon باز نمی‌شود (D-24)؛ کار باقی: پیام فارسی به‌جای ۴۰۴ خالی | **ALREADY FIXED** | **measured (dump):** grantهای production روی `sale_lists`/`sale_list_items` فقط `postgres`، `authenticated`، `service_role` (`d_schema.sql:70933-70935, 70951-70953`) — `anon` هیچ. `sale_lists`: `{('draft'): 19}`. **cited:** `src/routes/public.sale-lists.$listId.tsx:93-104` `PublicNotFound` با «این لیست برای بازدیدکنندگان در دسترس نیست» و «برای دیدن این لیست فروش وارد حساب کاربری خود شوید.»؛ commit `dfcd581e` 2026-09-07 (#432)، جد `3bc526c4` | — |
| 3.1 | `settlement_types` روی production صفر ردیف | **NEVER TRUE** | **measured (dump پس از release):** `rows 27 active 22`، `created_at min 2026-05-17 11:14:42 max 2026-08-18 10:53:50`. **measured (dump 09-12):** `pg_restore … -t settlement_types < prod-20260913.dump \| awk … \| wc -l` → `27` (exit pg_restore=0). **measured (afrakala تست):** `total 12 active 3` — همان «سه نوع فعال روی تست» که بند نام برده؛ یعنی مقایسه درست بود، عدد production غلط | — |
| 3.2 | کد آسان از UI قابل ورود نیست؛ ۲ مشتری بدون کد؛ فرم کاربر این فیلد را ندارد | **ALREADY FIXED** · شمارش «۲» NEVER TRUE | **cited:** `src/shared/components/CustomerForm.tsx:365-373` فیلد «کد حسابداری (کد آسان)»، و `:207-208` `upsertAsanCode(personId, payload.accounting_code)` — identifier `asan_person_code` می‌نویسد (commit `7559774c` 2026-09-05، جد `3bc526c4`). پیش از آن هم فرم شناسه‌های شخص این نوع را داشت: `src/lib/persons/identifiers-normalize.ts:36`، `src/components/persons/PersonIdentifiersForm.tsx:48, 180-183` (`2a9f47c0` 2026-08-04). **measured (dump):** `customers 1753` · بدون identifier `asan_person_code`: **1713** · از آن‌ها با `accounting_code` قدیمی: 1664 · بدون هر دو: **49** | — |
| 3.3 | `gamification_kpis.deals_registered.label_fa = «??????»` | **ALREADY FIXED** (پیش از ثبت بند) | **measured (dump پس از release):** `{'key': 'deals_registered', 'label_fa': 'معاملات ثبت‌شده در CRM'}`، `with ? in label_fa 0` از ۱۳ ردیف، `any ?? in any field: []`، `updated_at 2026-08-11 12:11:14`. **measured (dump 09-12):** `deals_registered	معاملات ثبت‌شده در CRM`. **measured (afrakala):** همان متن، `updated_at 2026-08-03 22:47:24` | — |
| 3.4 | دو profile با شمارهٔ منطبق و نام متفاوت (مورد الف ⇒ person «12» · مورد ب — نام‌ها در BACKLOG.md:52) | **STILL TRUE** — ۱ از ۲ | **measured (هر دو dump):** تنها profile که person پیوند‌خورده یا person هم‌شماره‌اش نام دیگری دارد: مورد الف، `linked=12, phone-match=['12']` (املای نام کوچک در BACKLOG با داده فرق دارد). مورد ب در dump 09-12 و پس از release: person پیوند‌خورده و person هم‌شماره هر دو همان نام profile را دارند — دیگر ناهمخوان نیست. `profiles 36`، `phones shared by >1 profile 0` | small |
| 3.5 | migration نقش `viewer` (نام و آمار آری؛ تلفن، کد ملی، شبا نه) — اجرا نشد | **STILL TRUE** | **measured (dump):** `grep -c "CREATE POLICY viewer_restricted" d_schema.sql` → `93`؛ `d_schema.sql:59239` `CREATE POLICY viewer_restricted ON public.customers AS RESTRICTIVE TO authenticated USING ((NOT public.is_viewer_only(auth.uid())))` و همین روی `person_identifiers` (`:59442`) و `profiles` (`:59554`) — یعنی viewer تنها **هیچ** ردیفی از مشتری/شخص/profile نمی‌بیند، نه «نام آری». این مدل ۲۸۱ است (`20260805013000_281_restrict_viewer_role.sql:38-59`، لجر production 2026-08-11). هیچ migration بعدی دسترسی ستونی «نام آری، تلفن/کد ملی/شبا نه» نمی‌سازد: `grep -l viewer … \| xargs grep -l "iban\|national_id\|mask\|redact"` فقط فایل‌های ≤ `393` را می‌دهد. **assertion:** متن خود تصمیم در repo نیست (منبعش چت است) | medium–large |
| 3.6 | ۵۰ مشتری و ۲۰ تأمین‌کنندهٔ واقعی وارد نشده‌اند | **CANNOT MEASURE** | «واقعی» ویژگی پایگاه‌داده نیست. زمینه، **measured (dump):** `customers 1753 suppliers 64 sales_quotes 297`؛ ایجادشده از 2026-09-04 به بعد: مشتری **53**، تأمین‌کننده **48** | — |
| 4.1 | ۵۰۳ روی `is_user_online` و `profiles?status=pending`؛ علت `pgrst.db_pool = 0`؛ درمان restart PostgREST | **ALREADY FIXED** (روی تست) · production: CANNOT MEASURE | **measured:** `docker inspect afrakala-lan-rest` → `StartedAt=2026-09-09T15:04:59Z RestartCount=0`؛ هیچ متغیر `PGRST_DB_POOL*` یا `PGRST_LOG_LEVEL` (grep exit=1 ⇒ سطح لاگ پیش‌فرض، که فقط 5xx را لاگ می‌کند: کل لاگ `" 200 "`=0، `" 4xx "`=0، `" 5xx "`=59). ۵۰۳‌های `is_user_online` فقط `15/Aug/2026:05:22:18` و `16/Aug/2026:08:06:22`؛ `profiles?status=eq.pending`: صفر. آخرین ۵۰۳: `09/Sep/2026:15:05:12` (بارگذاری schema cache). `docker logs --since 2026-09-10T00:00:00 … \| grep -c '" 503 '` → `0`. **measured (afrakala):** `pg_roles.rolconfig` و `pg_db_role_setting` هیچ مقدار `pgrst.*` یا `pool` ندارند؛ `authenticator_backends 9`. علت تاریخی «db_pool=0» قابل بازسازی نیست | — |
| 4.2 | فایل‌های سرگردان untracked روی تست: `test-schema-20260831.sql` · `test-objects.txt` · `pw.session.config.ts` | **ALREADY FIXED** | **measured:** در `D:\AfraKalaTest\app`: `ABSENT test-schema-20260831.sql` · `ABSENT test-objects.txt` · `PRESENT pw.session.config.ts … tracked=yes`. دو فایل اول در `D:\AfraKalaTest\_parked\` (بیرون از repo). سومی commit شد: `b9fb5cb3` 2026-09-05 «chore: add ship automation script and session config» | — |
| 5.1 | تحقیق «پیش‌فاکتور اصحابی وصل نیست» — پرامپت نوشته شد، به هیچ agent داده نشد | **STILL TRUE** | **measured:** `grep -rln "اصحابی\|ashabi"` روی `docs src e2e supabase` این worktree و `docs/` همهٔ worktreeها و `dumps/research` — هیچ گزارش اختصاصی؛ فقط اشارهٔ جانبی در `docs/research/convergence/R-2-overdue-sensors.md:124` و جدول‌های مبلغ در `R-1`/`E-1`. **خود مسئله، measured (dump):** ۷ پیش‌فاکتور با نام اصحابی؛ **۴ تا `accepted` و بدون `customer_id` و `customer_person_id`**: `SQ-2026-000101`، `SQ-2026-000138` («محمد اصحابی»)، `SQ-2026-000174`، `SQ-2026-000178` («محمد اصحابی»). ۳ تا به یک مشتری/شخص موجود با همین نام وصل‌اند: `000181`، `000182`، `000297` (draft، 2026-09-13) | small |
| 5.2 | راه رفتن ویزارد با شخص تأمین‌کننده — D-1 و D-3 merge و deploy شدند ولی صفر شواهد مرورگری | **STILL TRUE** | **cited:** `docs/research/asan-bridge-build-20260904.md:44` (D-1) «**No browser evidence is obtainable** — every person lacking a `customers` row also lacks an Asan code»؛ `:46` (D-3) فقط «Red … Green: 13 passed» روی تابع خالص. **measured:** تنها spec پوشش‌دهنده `e2e/unit/ledger-wizard-party-pick.spec.ts` است (unit). specهای مرورگری ویزارد — `e2e/phase6/m6-r1-wizard-branches.spec.ts` (آخرین commit 2026-08-24) و `e2e/persons/wizard-name-lookup.spec.ts` (2026-08-26) — **پیش از** `4dc56b4a` (2026-09-04، «the wizard stops choosing a person's role for them») هستند و هیچ‌کدام `choose_role` ندارند؛ `m6-r1:172` فقط یک ذینفع تک‌نقشی تأمین‌کننده را lookup می‌کند. `git ls-tree -r HEAD docs/verification \| grep -i "wizard\|choose\|dual-role"` → خالی | small–medium |

---

## ۳ · برای هر بند STILL TRUE: بستنش چه می‌خواهد

| id | کار لازم | صاحب | اندازه |
|---|---|---|---|
| 2.3 | مالک از تب فروش و خرید آسان `ذخیره فایل Excel` بگیرد (قالب خالی). agent فایل‌ها را با `git add -f` در `docs/asan/templates/` می‌گذارد (استثنای صریح `.gitignore:122-125` که خود مالک باید تأیید کند) و sharedStrings/dimension را سلول‌به‌سلول با `SALES_HEADERS`/`PURCHASE_HEADERS` مقایسه می‌کند، همان‌طور که 2.2 برای قالب بانکی انجام شد | مالک → agent | small |
| 3.4 | مالک بگوید نام درست profile مورد الف و person «12» کدام است، و آیا اصلاً یک نفرند. سپس یک ویرایش داده روی production (`persons.display_name` یا پیوند `profiles.person_id`) با تأیید مالک و ردیف `audit_logs` | مالک | small |
| 3.5 | viewer امروز با policyهای RESTRICTIVE ۲۸۱ از کل ردیف‌ها بسته است؛ «نام و آمار آری، تلفن/کد ملی/شبا نه» یعنی **باز کردن ردیف و بستن ستون** — مثلاً یک view `security_invoker` بدون ستون‌های حساس یا grant ستونی، بازنویسی `viewer_restricted` روی `customers`/`persons`/`profiles`، به‌روزرسانی gate `393` (`assert_viewer_guard`) و specهای viewer، و بازبینی امنیتی مستقل. به §7.1 (امنیت ۳) گره خورده. متن دقیق تصمیم هم باید در `docs/` ثبت شود — الان فقط در BACKLOG است | agent + بازبین + مالک | medium–large |
| 5.1 | تحقیق واقعاً اجرا شود: چرا ۴ پیش‌فاکتور `accepted` اصحابی مهمان ثبت شدند در حالی که مشتری هم‌نام از قبل وجود داشت (مسیر فرم؟ ترتیب زمانی ایجاد مشتری؟). وصل کردن آن ۴ تا نوشتن روی دادهٔ production است و تأیید مالک می‌خواهد. به §7.2 (۸۹ هویت مهمان) مربوط است | agent (تحقیق) → مالک (وصل) | small |
| 5.2 | یک spec مرورگری روی پایگاه scratch (نه `afrakala` مشترک): یک شخص با فایل مشتری + تأمین‌کننده و کد آسان، شاخهٔ پرداخت/دوبل، assert که انتخاب نقش ظاهر می‌شود؛ و یک شخص فقط‌تأمین‌کننده روی شاخهٔ دریافت، assert متن ردِ جدید. مانع D-1 («هر شخص بدون فایل مشتری کد آسان هم ندارد») با fixture حل می‌شود | agent | small–medium |

---

## ۴ · آنچه نتوانستم اندازه بگیرم

| # | چه | چرا | چه چیزی حلش می‌کند |
|---|---|---|---|
| 1 | **3.6** — کدام مشتری و تأمین‌کننده «واقعی» است | «واقعی» ویژگی پایگاه‌داده نیست | فهرست حسابدار (نام + کد آسان) از ۵۰ مشتری و ۲۰ تأمین‌کننده، که با `persons`/`person_identifiers` همین dump تطبیق داده شود |
| 2 | **2.6، نیمهٔ ریسک** — آسان چند سند در یک شیت را ادغام، جدا یا رد می‌کند؟ | فقط ایمپورت در خود آسان جواب می‌دهد؛ هیچ artefactی در repo آن را ثبت نکرده | ایمپورت فایل دوسندیِ `docs/verification/asan/phase-5-asan-all-documents.xlsx` در شرکت آزمایشی آسان و عکس از شماره‌های سند حاصل |
| 3 | **4.1 روی production** | دست زدن به `192.168.170.10` ممنوع بود | روی production: `docker logs --since 2026-09-13T00:00:00 afrakala-lan-rest 2>&1 \| grep -c '" 503 '` و `docker inspect` برای `PGRST_DB_POOL*`. علت تاریخی «`db_pool = 0`» در هیچ لاگ، config یا سندی در repo نیست و قابل بازسازی نیست |
| 4 | **5.2، رفتار واقعی مرورگر** | راه رفتن ویزارد داده می‌نویسد و به stack در حال اجرا دست می‌زند | spec بند ۳ بالا روی پایگاه scratch |
| 5 | **2.7، رندر واقعی برای anon روی production** | فقط کد cite شد؛ خواندن production ممنوع بود | `curl -s http://192.168.170.10:3000/public/sale-lists/<id>` بدون کوکی و grep عنوان «این لیست برای بازدیدکنندگان در دسترس نیست» |
| 6 | **2.4، منظور مالک** | خروجی اکسل آسانِ تک‌پیش‌فاکتور هست؛ خروجی فهرستیِ غیرآسان نیست | یک جملهٔ مالک: کدام را خواسته بود |
| 7 | **3.5، متن تصمیم** | در repo ثبت نشده؛ فقط خلاصهٔ BACKLOG هست | ثبت تصمیم مالک در `docs/` با تاریخ |
| 8 | **یافتهٔ ۵۲۶، علت** | این‌که طبقه‌بند rehearsal چرا «PRESENT» گفت، بدون اجرای rehearsal قابل دیدن نیست | خواندن خروجی rehearsal `e4*`/`gate` برای بلوک ۱۹ و منطق `ledger_insert_only` در `release/` |
