# UNIFY Program Progress

> **این فایل بعد از هر فاز به‌روز می‌شود.** اگر بخش Status با تاریخچهٔ گیت نمی‌خواند،
> گیت درست است و این فایل کهنه — همان اشتباهی که تا ۲۰۲۶-۰۸-۰۷ باعث سردرگمی شد.

## Status — ۲۰۲۶-۰۸-۰۷

| | |
|---|---|
| برنچ کاری | `feature/navigation-modernization` — **تنها برنچ**؛ `feat/phase-5-evolution-adapter` که تصادفی ساخته شده بود حذف شد |
| HEAD | `80cf3b9d` |
| مأموریت جاری | **P2** (کد آسان تأمین‌کننده) |
| فاز جاری | **مأموریت P2 کامل** — همهٔ فازها و gate |
| مهاجرت‌های اعمال‌شده در این برنامه | ۳۰۳ تا ۳۱۰ |
| typecheck | **۷۰** (خط پایه) |
| آخرین e2e کامل | ۲۰۲۶-۰۸-۰۷ روی build تأییدشدهٔ `a60e46d2` — **۴۹۴ سبز / ۱۲ قرمز / ۷ skip** (۳۱٫۶ دقیقه). این **اولین مبنای معتبر** این برنامه است |
| پشتیبان دیتابیس | `D:\backups\test-server-2026-08-07.dump` — ۱۵٬۹۶۳٬۸۲۲ بایت |

**طرح مرجع:** `docs/execution/unify-plan-corrected.md` — فایل‌های اصلی `P1_*` تا `P5_*`
خطاهای واقعی دارند و نباید بدون آن سند خوانده شوند.

## Completed

- [x] **P0.1** Delete unambiguous test-marker persons. Migration
      `supabase/migrations/20260807010000_303_p0_1_delete_test_persons.sql`
      **applied 2026-08-07** via `psql --single-transaction -v ON_ERROR_STOP=1`, exit 0.
      Per-table deletes matched the census exactly (merge_candidates 1, context_links 2,
      suppliers 2, persons 2; all other child tables 0). `afrakala-lan-rest` restarted.
      Post-state verified live: **persons 79→77, suppliers 15→13, targets_left 0,
      6 e2e harness accounts intact, E2E264 fixture intact.**
      Down script: `docs/verification/303-down.sql`.
- [x] **P0.4** Full test-server DB backup — `D:\backups\test-server-2026-08-07.dump`,
      15.2 MB, verified readable via `pg_restore -l` (5004 TOC entries).
      Taken *before* any deletion, ahead of its nominal position in the mission order.
- [x] **P0.6** Phone-collision detection defect report —
      `docs/asan/collision-detection-defect.md`. Five defects identified, not fixed
      (P0.6 says diagnose only). Live definition snapshotted to
      `docs/verification/pre-P0.6/detect_phone_collisions.live.sql`.
- [x] **`api` provenance investigation** (owner-requested follow-up to the P0.1 flag) —
      `docs/asan/api-person-investigation.md`. Verdict: **test residue, recommend delete.**
      See "Findings" below.

- [x] **P0.3** Delete the e2e purchase residue. Migration
      `20260807030000_304_p0_3_delete_e2e_purchase_residue.sql` **applied 2026-08-07**,
      exit 0. **322** e2e purchases + 322 `purchase_items` + 320 `purchase_idempotency`
      + 158 `purchase_request_fulfillments` + **322 `stock_movements`** deleted.
      Verified live: purchases 334→**12**, e2e remaining **0**, stock_movements 335→**13**,
      and `journal_entries` (1), `payment_receipts` (6), `sales_quotes` (50) **untouched**.
      Backup `docs/verification/P0.3-purchase-cleanup-backup.sql` (598,438 bytes);
      down script `docs/verification/304-down.sql`.
      **The mission's numbers were wrong — see Findings.**

- [!] **P0.2** Delete the 4 duplicate persons — **HELD, nothing deleted.** The phase's own
      step 3 stop condition is met. See Findings.

- [x] **P0.5** — **not needed.** The file it targets is in zero commits. No history rewrite
      and no force-push were performed.

- [x] **اصلاح `detect_phone_collisions`** — مهاجرت **۳۰۵**. اتحاد ساده ۲۸ گروه می‌سازد که
      ۲۷ تای آن یک شخص در جدول‌های نقش خودش است؛ منطق اصلاح‌شده فقط `09122270261` را
      می‌دهد. اجرای دوباره بی‌اثر است.

- [x] **P0.3b** — مهاجرت **۳۰۶**. ۳۰۴ نیمه‌کاره بود: fulfillment‌ها را حذف کرد ولی
      `purchase_requests` والد را نگه داشت، پس **۱۲۱ درخواست** وضعیتی ادعا می‌کردند که هیچ
      پشتوانه‌ای نداشت. هر ۱۲۱ نشان `E2E%` داشتند. اکنون صفر.

- [x] **`/updates` خودکار** — مهاجرت **۳۰۷** (`auto_publish_release`، فقط `service_role`،
      idempotent روی `git_sha`) + مولد یادداشت از تاریخچهٔ گیت + انتشار در `up.ps1`.
      نسخهٔ ۱۴ در آزمون واقعی منتشر شد. قانون تریلر `Release-note-fa:` در `AGENTS.md`.

- [x] **طرح تصحیح‌شده** — `docs/execution/unify-plan-corrected.md`. نُه خطای واقعی در
      فایل‌های P1–P5 پیدا شد؛ سه‌تا بنیادی.

- [x] **P2.1** Add `suppliers.accounting_code`. Migration **۳۰۸** applied 2026-08-07.
      ستون nullable + CHECK `^[A-Za-z0-9_-]{1,30}$` + ایندکس یکتای جزئی، همه آینهٔ
      `customers`. تریگر تکثیر از `person_identifiers` ساخته شد (وجود نداشت — فایل مأموریت
      اشتباه فرض کرده بود P1.5 آن را ساخته). آینه **`value_raw`** می‌گیرد نه
      `value_normalized`، چون نرمال‌ساز عمداً صفر ابتدایی را حذف می‌کند و `002` به `2`
      تبدیل می‌شد. backfill صفر ردیف، طبق پیش‌بینی. پنج آزمون رفتاری سبز.
      Down: `docs/verification/308-down.sql`.

- [x] **P2.1b** مهاجرت **۳۰۹**. نقص ۳۰۸: تکثیر فقط یک‌طرفه بود و وقتی ردیف آینه هنوز
      ساخته نشده بود کاری نمی‌کرد — دقیقاً ترتیبی که `person_create_inline` دارد
      (شناسه اول، ردیف تأمین‌کننده بعد). تریگر `BEFORE INSERT` روی هر دو جدول آینه
      اضافه شد. چهار حالت آزموده و سبز.

- [x] **P2.2** فیلد «کد آسان» در `SupplierForm`. **بند ۳ و ۴ فایل مأموریت با هم
      تناقض داشتند**؛ `asan_list_purchase_export` تصمیم را قطعی کرد: خروجی از
      `person_identifiers.value_normalized` می‌خواند نه ستون آینه. پس فرم شناسه را
      می‌نویسد و تریگرها آینه را هم‌گام نگه می‌دارند. عدم‌تقارن RLS مدیریت شد:
      accountant می‌تواند هنگام ساخت کد بگذارد ولی نمی‌تواند تغییر دهد (UPDATE فقط
      admin/manager) — فیلد در آن حالت غیرفعال با توضیح فارسی. typecheck ۷۰،
      eslint پاک.

- [x] **P2.3** بنر «بدون کد آسان» روی `/suppliers` + چک‌لیست
      `docs/asan/supplier-asan-codes-to-fill.md`. شمارش **زنده** با `head:true`؛ هیچ عددی
      ثابت نیست — نه ۱۵ فایل مأموریت، نه ۱۳ امروز. آزموده: ۱۳ → با ثبت یک کد ۱۲ → با
      کددارشدن همه صفر و بنر ناپدید. از `toFaDigits` موجود استفاده شد نه تابع چهارم
      (سه پیاده‌سازی `toPersianDigits` از قبل در مخزن هست). typecheck ۷۰، eslint پاک.

- [x] **P2.1c** مهاجرت **۳۱۰** — رگرسیونی که gate گرفت و **مال خودم بود**.
      ۳۰۸ نوشته بود «DELETE عمداً مدیریت نشده، چون شناسه‌ها revoke می‌شوند نه حذف» —
      ولی هلپرهای e2e حذفشان می‌کنند. نتیجه: کد آزمایشی `99900001` روی تأمین‌کنندهٔ
      **واقعی** «صباح روشناس» ماند، و بعد تراکنش یک spec بی‌ربط را با نقض ایندکس یکتا
      از کار انداخت. حالا DELETE آینه را پاک می‌کند و تکثیر هرگز خطا نمی‌دهد (اگر کد
      جای دیگری باشد فقط رد می‌شود). ردیف آلوده پاک شد.

## Not started

**P2.2** (فیلد کد آسان در `SupplierForm`) · **P2.3** (چک‌لیست + بنر) · **P2 gate**
سپس: P1 · P3 · P4 · P5

**معلق در انتظار تصمیم مالک:** P0.2 · دو فایل xlsx مرجع آسان · شش تصمیم فهرست‌شده در
`unify-plan-corrected.md`

---

## Findings that change the mission as written

### P0.1 — the premise did not survive contact with the database

The mission file says *"The 9 test person rows from previous investigations are garbage.
Delete."* A live census of all 79 persons shows the 9 rows matching test markers are **not**
garbage, and are not one homogeneous set:

| rows | what they actually are | disposition |
|--:|---|---|
| 6 | `test.{admin,manager,sales,sales2,accountant,viewer}@afrakala.local` — live e2e harness accounts, each with an `auth.users` row, a `profiles` row, a `user_roles` row and a `staff_link` context | **keep** — this program's own gates (P3.2 per-role visibility, P5.4 RLS pass with real JWTs) require them |
| 2 | `test232` (afrakalatest@gmail.com), `test 12` (chista@gmail.com) — real Google signups, status `rejected`, `test 12` holds mobile `+989921680268` | **keep** — real auth identities, not investigation residue |
| 1 | `E2E264 …` id `eeeeeeee-0000-4000-8000-0000000e2e64` | **keep** — permanent fixture that `e2e/security/persons-rls-ownership.spec.ts:93` upserts by design every run, specifically so the row count stays at 1 forever. Deleting it just makes the next run recreate it |

Separately, four *other* test-marker persons carry real transactions, which is exactly the
stop-and-report condition P0.1 step 3 defines:

| person | transactions |
|---|---|
| `bf3dc235` تست 2.1 | 9 sales_quotes |
| `c3fd037c` تست ماهرو | 1 sales_quote + asan code 1125623 |
| `38dbcaad` kjbjhvjhvbkl'p; | 4 payment_receipts |
| `dc76b4a6` 12 | 1 purchase + supplier row + profile |

**What migration 303 actually deletes — the two rows that are unambiguously test garbage
with zero dependents on either FK path:**

- `19bb3abd` `تست تامین کننده` — literally "test supplier", the marker the mission names
- `6358926a` `تست دستی من` — "my manual test"; a dismissed `person_merge_candidates` row
  independently records *«رکورد آزمایشی «تست دستی من» است و شخص واقعی نیست»* ("is a test
  record and not a real person")

**Flagged, not deleted:** `6cd30201` `api`. **Investigated 2026-08-07 at the owner's
request — the earlier reading was wrong.** The note naming product `AFK-2026-00033` is
*prefilled text*, not a relationship: `SupplierReferralModal` never receives a product id
and never writes `product_suppliers` (0 rows on both sides, verified live). The row was
created by the owner's own account during feature testing, has no contact data and no
transactions, and has a twin — supplier `12` (person `dc76b4a6`), same modal, same product,
minutes apart, already a known test-marker person. **Verdict: test residue. Recommended for
deletion via a new migration 304** (303 is applied and must not be edited).
Full report: `docs/asan/api-person-investigation.md`.

**Owner decision 2026-08-07: KEEP.** Migration 304 was written and dry-run green
(77→76 persons, 13→12 suppliers, harness + fixture intact); the owner declined to apply it
and both 304 files were discarded. Database untouched, `api` remains. Because it is
`is_active=true`, it stays selectable in the purchase supplier picker — the side defect
below now has a live instance. **P0.1 is closed; there is no outstanding `api` action.**

### Side defect surfaced by that investigation — recorded, not fixed

Referral suppliers are created `status='pending'` (deliberately — "unvetted by definition")
but `is_active` defaults to **true**, and supplier pickers gate on two different columns:
`PurchaseForm.tsx:176` uses `is_active`, `ProductSupplierManager.tsx:326` uses `status`.
So a pending referral is selectable in the purchase form. This is how the twin row `12`
acquired the real purchase that saved it from P0.1. Out of P0 scope; triage in P1/P2.

### P0.2 — the source report does not exist, and 3 of the 4 pairs do not exist either

P0.2 says *"Identify each pair's exact person_ids from the report's evidence. Do not
re-derive."* **`dual-role-person-analysis.md` is not in the repository** — not under
`docs/`, not under any name. The instruction is unfollowable as written, so the four named
pairs were checked live instead:

| P0.2 claims | live `persons` |
|---|---|
| 2× «مصلحی» same phone | **does not exist** |
| 2× «ملیکا مصلحی» same phone | **does not exist** |
| 2× «ارسلان تاجیک» same phone | **does not exist** |
| 2× «مختار شاهمرادی» exact duplicate | exists — but **not an exact duplicate** |

The one real pair is not a duplicate at all:

| id | kind | suppliers | product links | purchases | purchase_prices |
|---|---|--:|--:|--:|--:|
| `23b44c71` | **organization** | 1 | 4 | **2** | **77** |
| `135ac0e1` | **individual** | 0 | 0 | 0 | 0 |

One organization row and one individual row with the same name is not garbage — it is
precisely the dual-role shape `P1_DUAL_ROLE.md` exists to model. Deleting "both sides of
each pair" as P0.2 instructs would destroy a live supplier carrying **2 purchases and 77
purchase-price records**, which is exactly the financial stop condition P0.2 step 3 defines.

**Held. Nothing deleted.** The actual duplicate-name groups in the database are a different
set entirely: «محمدرضا افرا» ×3, «محمدزین الدین» ×3, «۱» ×2, «زینب احمدی» ×2,
«مختارشاهمرادی» ×2, «ولی غلامی» ×2 — none of which the mission names. Owner decision needed
on which, if any, are actually garbage.

### P0.3 — both mission numbers were wrong, and the blocker does not exist

The mission says 84 residue purchases; a follow-up described them "sharing journal entries
with 93 real ones". Live:

- `purchases` total **334** → `notes LIKE 'E2E%'` = **322**, real = **12** (not 93)
- `journal_entries` holds **exactly one row** in the whole database, `source_type =
  'payment_receipt'`. Journal entries sourced from **any** purchase = **0**.

**There was no journal entanglement to split**, so the "hold P0.3 if they cannot be
separated" branch never applied. The financial carve-out was checked and not triggered:
`payment_vouchers` referencing the targets = 0, `journal_entries` = 0.

The real risk the mission does *not* mention: **`stock_movements` links to purchases through
a polymorphic `ref_type`/`ref_id` pair with no foreign key.** 322 of the 332 purchase-sourced
movements belong to the residue and would have been silently orphaned by a naive
`DELETE FROM purchases`. Migration 304 deletes them explicitly and asserts zero orphans.
Removing them lowers computed stock for the affected products — the intended correction,
since the e2e runs inflated it, but a visible change rather than a no-op.

### P0.5 — the file to purge is not in git history. No rewrite, no force-push.

P0.5 exists to purge `payment-receipts-lines-2026-08-04.xlsx` from history, citing leaked
customer PII, and authorises a force-push for it. Live check:

```
git log --all --full-history -- "*payment-receipts-lines-2026-08-04.xlsx"   ->  0 commits
```

**That filename has never existed in this repository.** There is nothing to rewrite, so the
history rewrite and the force-push are both unnecessary and were not performed. The riskiest
operation in P0 turns out not to be needed — good news, but it means P0.5's premise is the
third in this mission to fail against reality.

**If the underlying PII concern is real, these are the actual candidates** — all currently
tracked in `HEAD`, none matching the named file:

| path | why it might matter |
|---|---|
| `docs/asan/reference/اشخاص.xlsx` | "persons" — most likely to hold real customer records |
| `docs/verification/m5-export-samples/4-bank-deposits.xlsx` | bank deposit export sample |
| `docs/verification/m5-export-samples/{1-sales,2-purchase,3-accounting-document}.xlsx` | export samples |
| `docs/qa/AfraKala-UAT-14050428.xlsx` | UAT workbook |

`.gitignore:118` says the `docs/verification/` Asan samples are **deliberately** tracked, so
removing them is a decision, not a cleanup. **Not touched.** Owner should say whether any of
these actually contain real customer data; if so, that is a new, correctly-scoped purge task
against real filenames.

### Knock-on: supplier count is 13, not 15

Migration 303 removes two supplier rows, so `suppliers` goes 15 → 13. **P2.3 is written
around "the 15 real supplier Asan codes"; the real number is 13.** The banner and the
checklist file must be generated from a live count, not the literal 15.

### P0.6 — the defect is scope, not queuing

The mission file offers two hypotheses; neither is quite right. The queue is *not* stale —
`phone_collisions` holds exactly the 3 groups the function produces today. The defect is that
`detect_phone_collisions()` groups rows that share a phone without first resolving them to a
person. **2 of the 3 currently-queued collisions are already false positives** (one person
appearing in two of their own mirror tables).

**This directly threatens P1.** P1's purpose is to give one person both a `customers` and a
`suppliers` row, both carrying the same phone — which under the current logic is by
construction a new collision. Every dual-role person P1 creates becomes a false positive.
Full analysis in `docs/asan/collision-detection-defect.md`.

---

## Decisions made this session

1. **Did not delete the 6 e2e harness accounts, 2 rejected signups, or the E2E264 fixture,**
   despite the mission file classing all 9 test-marker rows as garbage.
   *Rejected alternative:* delete all 9 as instructed. *Why rejected:* decision-ranking rule 1
   ("do not lose or corrupt data") and the fact that deleting them breaks the e2e harness that
   every later mission gate in this same program depends on. The mission's own step 3 tells me
   to stop and report when the database contradicts the premise; it does.
2. **Did not delete `api`.** *Rejected alternative:* delete it as test residue. *Why rejected:*
   its note ties it to a real product (`AFK-2026-00033`); ambiguous provenance, and rule 4
   prefers the smallest change. Flagged for the owner instead.
3. **Took the P0.4 backup before P0.1's deletion** rather than in mission order.
   *Why:* a backup taken after the deletions it is meant to protect against is not a backup.
4. **Migration files carry no `BEGIN`/`COMMIT`.** Transaction control is the caller's
   (`psql --single-transaction`), per rule 2.4; an explicit `COMMIT` inside the file would
   commit the harness transaction early and defeat the guarantee.

---

## HANDOFF STATE

_آخرین به‌روزرسانی: ۲۰۲۶-۰۸-۰۷ پس از P2.1_

**اکنون کجاییم:** مأموریت **P2**، فاز **۲.۱ کامل**. HEAD = `7ee0c081` روی
`feature/navigation-modernization`. درخت تمیز، هم‌تراز با origin.

**مأموریت P2 بسته شد.** gate کامل:

| مورد | نتیجه |
|---|---|
| typecheck | ۷۰ (خط پایه) |
| eslint فایل‌های تغییریافته | پاک |
| build + deploy | `APP_GIT_SHA=a60e46d2` = HEAD، زمان ساخت مطابق، ایمیج تازه |
| `docker restart afrakala-lan-rest` | انجام شد |
| e2e کامل | **۴۹۴ سبز / ۱۲ قرمز / ۷ skip** |
| قرمزهای تازه پس از رفع | **صفر** |

**طبقه‌بندی هر ۱۲ قرمز:**

| spec | علت |
|---|---|
| `asan/export-purchase:408` | 🔴 **رگرسیون من** — با مهاجرت ۳۱۰ رفع شد، اجرای مجدد سبز |
| `purchase/c4-assignment` E2E-4 و E2E-13 | 🔴 **همان آلودگی** — با ۳۱۰ رفع شد، هر ۱۵ آزمون سبز |
| `business-flows/211-216` | 🟡 **flaky** — اجرای مجدد سبز |
| `business-flows/215` | 🟡 **flaky** — اجرای مجدد سبز |
| `persons/credit-uses-person` | ⚪ قرمز مستندِ از پیش موجود |
| `asan/export-numbering` · `final-verification` · `product-video-chain` | ⚪ ادعای «جدول باید خالی باشد» — باقی‌ماندهٔ اجراهای قبلی، روی جدول‌هایی که هیچ مهاجرتی لمس نکرده |
| `business-flows/212` · `213` · `214` | ⚪ از پیش موجود، بی‌ارتباط با P2 |

**اقدام بعدی: هیچ — منتظر مالک.** P1 شروع نشود تا تصمیم‌های
`unify-plan-corrected.md` گرفته شود؛ مهم‌ترینش مدل حسابداری P5
(`supplier_payable` و `mutual_settlement` در `journal_lines.account_kind` **وجود ندارند**)
و انتخاب مسیر الف/ب برای P1.2.

---

### نکاتی که فاز بعدی باید بداند

**۱ — آینه `value_raw` می‌گیرد، نه `value_normalized`.** نرمال‌ساز عمداً صفر ابتدایی را
حذف می‌کند (`ltrim(_v,'0')`) تا `0102012` و `102012` دو کد برای دو نفر نشوند. پس
`value_normalized` فرم یکتایی است و `value_raw` آنچه کاربر زده. شخص `190eeb0b` کد خام
`002` دارد که نرمال‌شده‌اش `2` است. P2.2 هم باید `value_raw` را نشان دهد و ذخیره کند.

**۲ — باطل‌کردن یک شناسه نیاز به برداشتن `is_primary` دارد.**
`validate_person_identifier()` اجازه نمی‌دهد ردیف `is_primary` باطل شود. در dry-run P2.1
پیدا شد. هر جریان UI که کد را حذف می‌کند باید این ترتیب را رعایت کند.

**۳ — هیچ تریگر تکثیری قبل از ۳۰۸ وجود نداشت.** `customers.accounting_code` را خودِ
`CustomerForm` می‌نویسد. حالا تریگر هر دو آینه را می‌نویسد، پس P2.2 نباید مستقیم روی
`suppliers.accounting_code` بنویسد — فقط `person_identifiers` را بنویسد و بگذارد تریگر
کارش را بکند.

**۴ — هیچ عددی ثابت نوشته نشود.** نه ۱۵، نه ۱۳. شمارش زنده:
`SELECT count(*) FROM public.suppliers WHERE accounting_code IS NULL;`

**۵ — e2e پایه معتبر نداریم.** اجرای ۲۰۲۶-۰۸-۰۷ (۴۸۲ سبز / ۲۴ قرمز) روی buildی بود که
`APP_GIT_SHA=84d263b2` می‌داد و آن commit **در این مخزن وجود ندارد**. بعد از rebuild،
`e2e/purchase` به ۶۷ سبز / ۲ قرمز رسید و آن دو هم با ۳۰۶ و اصلاح spec سبز شدند. gate این
مأموریت باید مبنای تازه بسازد.

**۶ — نشست e2e یک ساعت اعتبار دارد.** توکن ذخیره‌شده منقضی می‌شود؛ قبل از هر اجرا با
Auth Admin API تازه‌اش کنید. رمز مشترک حساب‌های LAN: در `e2e/persons/*` به‌صورت ثابت هست.

**۷ — دو حساب نقش `rejected` هستند.** `test.viewer` و `test.manager` وضعیت `rejected`
دارند، پس اپ آن‌ها را به `/login` می‌فرستد و اسپک‌های مربوط قرمز می‌شوند — بدون ارتباط با کد.

---

### معلق در انتظار تصمیم مالک

- **P0.2** — ۹ ردیف از ۱۴ پشت حساب‌های واقعی‌اند (از جمله حساب مالک)؛
  `profiles.person_id` روی `NO ACTION` است پس حذف خطا می‌دهد نه cascade.
- **دو فایل xlsx مرجع آسان** — ورودی تست e2e
  (`import-persons.spec.ts:23`, `import-products.spec.ts:28`).
- **شش تصمیم طرح تصحیح‌شده** — مهم‌ترینش مدل حسابداری P5:
  `mutual_settlement` و `supplier_payable` در `journal_lines.account_kind` **وجود ندارند**.
