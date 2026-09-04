# Export and import surfaces — دفتر اسناد, person import, and every Excel export

**Date:** 2026-09-03 (report filename per the brief: `…-20260904`) · **Type:** read-only research
**Questions:** Q2 (دفتر اسناد vs خروجی برای آسان) · Q3 (every person-import-from-Excel route) ·
Q5 (every Excel export, per document family × channel)

---

## 0. Environment and validity

| Item | Value |
|---|---|
| `hostname` | **VIRA-SERVICE** — the test computer. Gate passed. **Production was never contacted.** |
| Database | `afrakala` on container `afrakala-lan-db`, PostgreSQL 15.6 |
| Access used | `SELECT` and `pg_get_functiondef` / `pg_get_viewdef` only. No write, no migration, no deploy. |
| Working-tree branch | `feature/quote-customer-picker-readonly` (HEAD `a7e14017`) |
| Nothing was checked out | The tree was left untouched (CLAUDE.md: parallel agents share one tree). |

### ⚠️ The branch matters for Q2, and this is the first finding

**«دفتر اسناد» does not exist on the working-tree branch.** `/accounting/documents`,
the file `src/routes/_app.accounting.documents.tsx`, and the string `دفتر اسناد` are all
absent from `HEAD`. They live on **`origin/staging`**, added by commit

```
33bc6704  feat(accounting): دفتر اسناد — dual documents, a type filter, and an Excel export (422)
          Thu Sep 3 16:06:04 2026 — 8 files, +750 lines
```

`git merge-base --is-ancestor 33bc6704 origin/staging` → **YES**;
`… HEAD` → **NO**. Every Q2 claim about دفتر اسناد below was therefore read with
`git show origin/staging:<path>`, and line numbers refer to the file **as it exists on
`origin/staging`**. Everything about the Asan export was read from the working tree, where
`git diff --name-only HEAD origin/staging` shows no Asan file differs.

### ⚠️ Incidental finding — migration 422 is applied but **unrecorded in the ledger**

Not part of the brief; reporting it because CLAUDE.md rule 2b makes it a deploy hazard.

```
SELECT doc_type, count(*) FROM public.v_documents_unified GROUP BY 1;
  dual | 7 · payment | 12 · receipt | 28          -- the view exists and is populated
reloptions security_invoker                        -- v_documents_unified | true
SELECT version FROM supabase_migrations.schema_migrations WHERE version='20260903160000';
  (0 rows)                                         -- <-- NOT RECORDED
```

The file is `supabase/migrations/20260903160000_422_document_register_view.sql`. Anyone
reading the ledger to decide what to run on production would conclude 422 is outstanding.
422 is a `CREATE OR REPLACE VIEW`, so a re-run is not destructive — but the correct fix is
still rule 2b's: **record the row, do not re-run the migration.** Not done here; this
mission is read-only.

---

## Q2 — «دفتر اسناد» (`/accounting/documents`) versus «خروجی برای آسان» (`/admin/asan-export`)

| | **دفتر اسناد** | **خروجی برای آسان** |
|---|---|---|
| **Purpose** | A **register**: see everything recorded in a date range, on one screen. The route file says so in its own words: "the one place an accountant can see everything recorded on a day … This page is a REGISTER, not a second home for those lists" (`_app.accounting.documents.tsx:38-46`, staging) | A **file factory for a foreign system**: «بازهٔ تاریخ را انتخاب کنید، سندهای ناخواسته را بردارید و فایل اکسل آسان را بگیرید» (`_app.admin.asan-export.tsx:95`). Each export declares the **Asan screen** it is fed into — `targetScreen`, rendered under the selector at `:331` |
| **Who it is for** | The accountant reviewing her own books. Header: «همهٔ اسناد ثبت‌شده — دریافت، پرداخت و سند دوبل — در یک فهرست، با فیلتر تاریخ و نوع» (`:112-113`) | The accountant feeding Asan. Numbers are **consumed** on download — `asan_assign_document_numbers` is called inside `download()`, not on preview (`:234-245`), behind an `AlertDialog` confirm |
| **Data source** | View **`public.v_documents_unified`** (migration 422), read straight over PostgREST — `supabase.from("v_documents_unified")` (`src/lib/accounting/document-register.ts:95`). `security_invoker = true` (422:92), so each `UNION ALL` branch is filtered by its own table's RLS | Four **`SECURITY DEFINER` RPCs**, one per layout: `asan_list_sales_export`, `asan_list_purchase_export`, `asan_list_journal_export(_filter)`, `asan_list_bank_deposit_export`. Each opens with its own role check and raises `42501` in Persian if it fails (e.g. `asan_list_journal_export` lines 9-11) |
| **Document types covered** | **All three, together.** `receipt` (payment_receipts), `payment` (payment_vouchers), `dual` (dual_documents) — 422 lines 94-207. **`dual` is the point of the page**: before it, `dual_documents` had zero read sites in `src/` | **Seven exports, one at a time, no «همه» option** (`ASAN_EXPORT_ORDER`, `export-registry.ts:35-43`): فاکتورهای فروش · فاکتورهای خرید · دریافت‌ها و واریزها · پرداخت‌ها و برداشت‌ها · اسناد شخص ثالث (دوبل) · پرداخت‌های خرید و تسویه · واریزیهای بانکی (مسیر جایگزین) |
| **Filters** | از تاریخ / تا تاریخ (Jalali, `JalaliDateInput` `:120,:124`) and نوع سند = همه/دریافت/پرداخت/سند دوبل (`:130-141`). Both are **pushed down** — `.gte/.lte("doc_date")` and `.eq("doc_type")` (`document-register.ts:104-106`); `docType` is in the react-query key (`:69`). Cap 5000 rows with an on-screen warning at the limit (`document-register.ts:87`, route `:177-182`) | نوع خروجی + از/تا تاریخ (`PersianDatePicker`, default last 90 days, `:101-131`). Then **per-document unticking**: eligible ticked by default, blocked shown-but-unticked, «این صفحه» and «همهٔ نتایج قابل خروجی» deliberately separate controls (`:78-90`) |
| **What the export produces** | **11 Persian columns**, `DOCUMENT_EXPORT_HEADERS` (`document-register.ts:125-137`): شماره سند · تاریخ · نوع سند · کانال · طرف حساب · کد آسان · **مبلغ (ریال)** · حساب بانکی / صندوق · شماره پیگیری · شرح · وضعیت. `json_to_sheet`, sheet «اسناد» (route `:93-98`). **Toman → rial (×10) at the edge** (`:155`); amounts are numbers so Excel can sum. Filename `اسناد_<from>_<to>.xlsx`, Jalali with Latin digits, collapsing to `اسناد_<date>.xlsx` for one day (`:177-185`). Exports **the same array the table renders** — no second query (route `:83-85`) | **A fixed Asan template**, `aoa_to_sheet` not `json_to_sheet`, because the sales layout has a **deliberately blank column K** that a JSON keying would collapse (`write-xlsx.ts:3-8`). Four layouts (`layouts.ts`): sales 18 cols A–R, purchase 18 cols, journal 6 cols (کد حساب/کد کالا/شرح/تعداد/بدهکار/بستانکار), bank_deposit **15 cols with Latin, deliberately misspelled headers** `Name_Moshtare`, `Shopmare_Peygeri` — measured from the owner's real template and explicitly *not* to be corrected (`layouts.ts:59-90`). Filename `asan-<key>-<from>_to_<to>-selected-<n>.xlsx` (`:252-256`). Journal exports are `oneDocumentPerFile: true` — Asan takes شماره سند on-screen, so two documents in one file would merge (`export-journal.ts:9-11`, enforced at route `:221-227`) |
| **Route guard (roles)** | `requireAnyRole(["admin","manager","accountant"])` + a matching `staticData.gate` for the SSR/loading window (`:53-56`). The DB agrees: 422's three source policies are all admin/manager/accountant (422:41-47), and `roles.ts:233` gives `accounting.view` the same three | `requireAnyRole(["admin","accountant"])` (`:95`), re-checked in the component (`:127`, `:291`), and re-checked **again in every RPC** (`has_any_role(auth.uid(), ARRAY['admin','accountant'])`). **Manager is deliberately excluded** — noted at `_app.sales.quotes.$quoteId.tsx:121-124`: "the Asan export set is admin + accountant, deliberately NOT `isManagerial`" |
| **In the menu** | **Not in the sidebar.** `primary-modules.ts:132-148` reduces the whole مالی section to one path, `/accounting/receipts/create`. Reachable via the **FinanceHub card grid** — مرکز مالی → column «پرونده‌ها» → «دفتر اسناد» (`FinanceHub.tsx:100-105`, staging). The registry seed exists (`registry.ts:431-437`, `module: "accounting"`, `group: "finance"`) so the hub's `isNavigationEntryPermitted` filter has something to read | **In the sidebar, under «مدیریت»** — `primary-modules.ts:192-193` lists `/admin/asan-import` and `/admin/asan-export` in the admin module. Registry seed `registry.ts:806-811`, `module: "asan-export"`; `ROUTE_ROLES["/admin/asan-export"] = ["admin","accountant"]` (`:1250`) |

### The intent, verified rather than restated

The brief's stated intent holds, and the code says why in three independent places:

1. **دفتر اسناد never names Asan.** Its export headers are the accountant's own vocabulary
   (شرح، وضعیت، حساب بانکی / صندوق) and one column — «کد آسان» — is merely *carried through*
   from `person_identifiers`. It has no `targetScreen`, no layout constant, no number register.
2. **Asan export never shows a register.** `ASAN_EXPORT_ORDER` has **no «همه» option**; the
   shell resets `docs`, `selection` and `listed` on every change of type or range (`:158-166`)
   precisely because "a different export or a different range is a different result set".
   It returns **one row per journal line**, not per document.
3. **They disagree about what counts as a document, on purpose.** دفتر اسناد shows reversed
   documents with a «ابطال‌شده» badge (`:239-241`); the Asan journal export **removes both legs
   of a reversed pair from the file** (`asan_list_journal_export`, lines 32-40) and excludes
   cheque entirely (lines 41-57). A register that hid reversals would be lying; a file that
   posted them into live accounting software would double-post.

### خلاصهٔ فارسی — حسابدار کِی از کدام استفاده می‌کند

«دفتر اسناد» دفترِ خودِ حسابدار است: می‌خواهد بداند امروز چه ثبت شده، پس بازهٔ تاریخ و نوع سند
را می‌گذارد و هر سه نوع — دریافت، پرداخت و سند دوبل — را کنارِ هم می‌بیند، از جمله اسناد
ابطال‌شده که با نشانِ «ابطال‌شده» می‌آیند. خروجی اکسلِ آن دقیقاً همان چیزی است که روی صفحه است،
با سرستون‌های فارسیِ خودِ افراکالا، و برای بایگانی، مغایرت‌گیری یا فرستادن به مدیر است — نه برای
هیچ نرم‌افزار دیگری. مدیر هم به آن دسترسی دارد.

«خروجی برای آسان» کارِ دیگری می‌کند: یک فایل با **قالب ثابتِ آسان** می‌سازد تا در نرم‌افزار آسان
**وارد** شود. حسابدار هر بار فقط **یک نوع** خروجی و یک بازه انتخاب می‌کند، اسنادی را که نمی‌خواهد
برمی‌دارد، و پس از تأییدِ صریح فایل را می‌گیرد — و در همان لحظه شمارهٔ سند آسان مصرف می‌شود. چون
این فایل به دفاترِ واقعیِ شرکت وارد می‌شود، سخت‌گیرتر است: هر دو طرفِ یک سندِ ابطال‌شده حذف
می‌شوند، اسناد چکی اصلاً نمی‌آیند، و سندی که کد حساب آسانش نامعلوم باشد با دلیلِ فارسی مسدود
می‌شود به‌جای آنکه حدس زده شود. دسترسی آن هم تنگ‌تر است: فقط admin و accountant — مدیر عمداً کنار
گذاشته شده.

به‌بیانِ کوتاه: **برای دیدن و بایگانی کردن → دفتر اسناد. برای وارد کردن در آسان → خروجی برای آسان.**

---

## Q3 — every route that imports PERSONS from an Excel file

Sweep method: `grep -rln "xlsx|XLSX|sheet_to_json|papaparse" src/` intersected with
`grep -rln 'from("persons")|from("customers")|from("suppliers")|from("person_identifiers")' src/`,
plus every RPC in the live catalogue matching `asan\_%`, `%import%batch%`, `person\_import%`
(15 functions found; the person-writing ones are the three below).

**Four surfaces exist. Three are reachable UI; one is an orphan endpoint.**

### 1. Asan import workbench — tab «اشخاص»

`src/routes/_app.admin.asan-import.tsx` + `src/lib/asan/parse-persons.ts`

| | |
|---|---|
| **URL** | `/admin/asan-import` (`:122`) |
| **Menu** | **Sidebar → مدیریت** (`primary-modules.ts:192`; registry `:796-801`) |
| **Roles** | `requireAnyRole(["admin","accountant"])` (`:124`), re-checked in the component (`:131`), and re-checked in both RPCs (`has_any_role(auth.uid(), ARRAY['admin','accountant'])`) |
| **Header validation** | **Parsed by header TEXT, never by column index** — "column order is not guaranteed stable … reading `کد حساب` by name costs nothing and removes a whole class of silent, catastrophic misalignment" (`parse-persons.ts:3-8`). Canonical headers (`:21-28`): `کد حساب` · `نام حساب` · `موبایل` · `تلفن` · `کد ملی` · `آدرس`. Nothing is hard-required; a missing `کد حساب` yields the warning **«بدون ستون «کد حساب» امکان تطبیق مطمئن وجود ندارد»** (`:79-81`), and rows without `نام حساب` are counted into a warning (`:104-105`) |

**On a duplicate — a three-tier classifier, then a human decision.**
`asan_classify_person_batch` (read live via `pg_get_functiondef`):

1. **Asan code** match → `update`, or `unchanged` if name *and* mobile already agree (lines 25-49).
   Comment: "the strongest key, and the only one that means 'same account'".
2. **Mobile** match → `update`, **but `conflict`** if that person already holds a *different*
   Asan code — reason «این شخص از قبل کد حساب آسان دیگری دارد» (lines 51-71).
3. **Name** match → **always `conflict`**, never a silent update — reason
   «تطابق فقط بر اساس نام؛ کد حساب و موبایل مطابقت ندارند» (lines 73-90).
4. Otherwise `new` (lines 92-96).

A `conflict` row **can never be committed**: `asan_commit_person_batch` loops only
`classification IN ('new','update') AND decision = 'accept'` (lines 27-32), and a trigger on
`asan_import_person_rows` refuses a direct PostgREST PATCH too (`_app.admin.asan-import.tsx:43-45`).
On commit, **an existing non-empty AfraKala value is never overwritten** — "the owner's data is
often more current than Asan's. Only a NULL/blank field is filled in" (lines 50-54). Identifiers
are additive and idempotent (`WHERE NOT EXISTS`, lines 70-104), and a real Asan file **promotes**
a `provisional` code to `confirmed` (lines 77-79). Since migration 414 it also creates the
`customers` row when none exists (lines 58-67). Writes `audit_logs` action
`asan_persons_imported` (lines 120-122).

### 2. ایمپورت اشخاص از اکسل

`src/routes/_app.persons_.import.tsx` + `src/components/persons/PersonImportForm.tsx`

| | |
|---|---|
| **URL** | `/persons/import` (`:15`) |
| **Menu** | **Sidebar → اشخاص** (`primary-modules.ts:118`; registry `:385`, `ROUTE_ROLES:1277 = ["admin","manager"]`), **and** a button on `/persons` (`_app.persons.tsx:255`) |
| **Roles** | `requireAnyRole(["admin","manager"])` (`:17`) + a client re-gate for the roles-loading window (`:23-31`) |
| **Header validation** | **None — the user maps columns by hand.** Mappable fields (`FIELD_LABELS`, `PersonImportForm.tsx:49-58`): `نام نمایشی *` · `نام حقوقی` · `نوع (حقیقی/حقوقی)` · `توضیحات` · `موبایل` · `کد ملی` · `شناسه/کد اقتصادی` · `ایمیل`. Only `display_name` is required: **«نگاشت ستون «نام نمایشی» الزامی است»** (`:186`). Headers are merely *guessed* by regex — `/(display\|name\|نام نمایشی\|نام)/i`, `/(mobile\|phone\|موبایل\|همراه\|تلفن)/i` (`:154-166`). Per-row: name non-empty and ≤255 (`:215-220`), notes ≤2000. Cap `MAX_ROWS = 1000` (`:35`) |

**On a duplicate — ⚠️ NOTHING.** This form calls `createPerson` **once per row** and then
`createPersonIdentifier` per identifier (`:233-272`). There is no match step, no
`person_import_batch`, no phone or Asan-code lookup anywhere in the file. **Re-running the same
file creates a second person.** The only dedupe that can fire is a unique constraint on
`person_identifiers`, and it fires as a per-identifier *warning* that is deliberately swallowed
so that "a bad phone number must not discard the person row that was already created"
(`:252-253`) — i.e. the duplicate person survives, just without its identifier. Writes
`audit_logs` action `persons_imported` (`:281-295`).

### 3. ورود مشتریان از اکسل

`src/routes/_app.sales.customers_.import.tsx` + `src/shared/components/CustomerImportForm.tsx`

| | |
|---|---|
| **URL** | `/sales/customers/import` (`:9`) |
| **Menu** | **NOT in the menu.** Absent from `registry.ts` and from `primary-modules.ts`. Reachable **only** from the «ورود از اکسل» button on `/sales/customers` (`_app.sales_.customers.tsx:213`) |
| **Roles** | `requireAnyRole(["admin","accountant"])` (`:11`) — a **different pair** from surface 2 |
| **Header validation** | Hand-mapped again, no fixed headers. Fields (`FIELD_LABELS:37-43`): `نام مشتری *` · `شماره تماس` · `شهر` · `کد حسابداری` · `توضیحات`. Per-cell rules in `buildPayload` (`:141-172`): name required and **2–100 chars** («طول نام باید بین ۲ تا ۱۰۰ کاراکتر باشد»); phone stripped to digits and matched against **`PHONE_REGEX = /^09\d{9}$/`** (`:32`) else «شماره تماس نامعتبر: …»; `accounting_code` against **`CODE_REGEX = /^[A-Za-z0-9_-]{1,30}$/`** (`:33`); notes ≤500. Cap 1000 rows, batched 50 (`:30-31`) |

**On a duplicate — real matching, done in the database.** Each row goes through
**`person_import_batch`** with `context_kind: "customer"` and the phone as a `mobile_e164`
identifier (`:216-232`). That RPC calls `person_find_by_identifiers`:

- a **multi-person hit is a rejection**, not a merge — «این ردیف به بیش از یک شخص موجود اشاره
  می‌کند؛ ادغام دستی لازم است» (`person_import_batch` lines 49-52);
- a **single hit reuses the person** and only ensures a legacy row exists for *this* context,
  "otherwise importing an existing customer as a supplier would silently produce no supplier at
  all" (lines 83-95);
- **no hit** creates person + legacy row together via `person_create_inline` (lines 56-81).

Per-row outcome is `created` / `linked` / `rejected`, reported per row rather than failing the
whole call (`:238-246`). A duplicate `accounting_code` surfaces as
«کد حسابداری تکراری یا قالب نامعتبر» (`:237-238`).

The comment at `:205-207` records the history: this used to `INSERT` straight into `customers`,
"creating rows with no person behind them and its own ad-hoc duplicate rules."

### 4. `POST /api/persons/import` — server endpoint, no page

`src/routes/api.persons.import.ts:63`

Builds a **user-scoped** Supabase client from the caller's bearer token, deliberately not
service-role, because `person_import_batch` is SECURITY INVOKER and "using `supabaseAdmin` here
would silently let any authenticated user import as though they were an administrator"
(`:18-26`). Takes **already-parsed JSON rows, not a file** (`:27-29`). Zod schema (`:37-54`):
`display_name` 1–255 required, `context_kind` required from `PERSON_CONTEXT_KINDS`, optional
`kind` / `identifiers[≤10]` / `city` / `notes` / `accounting_code`; body capped at **500 rows**.
Duplicate behaviour is `person_import_batch`'s, as in surface 3.

### The two findings inside Q3

**Finding 1 — `/api/persons/import` has no caller.** Its own header calls it "the single import
entry point (item 230)" that "replaces the per-entity import paths" (`:10-16`), but
`grep -rn "api/persons/import" src/` returns **only the route's own definition and that comment**.
`CustomerImportForm` reaches `person_import_batch` directly over PostgREST
(`CustomerImportForm.tsx:216`), and `PersonImportForm` uses neither. The endpoint is dead code
today; the consolidation it describes happened only for surface 3.

**Finding 2 — the two generic importers disagree on duplicates, and the weaker one is the one in
the menu.** `/persons/import` (sidebar, admin+manager) has **no matching at all**;
`/sales/customers/import` (**not** in the sidebar, admin+accountant) has the full
`person_import_batch` matching. An operator who follows the menu gets the importer that
duplicates.

### Which one is the intended path for a first-time bulk import from Asan — and is it wired?

**`/admin/asan-import`, tab «اشخاص». Yes — it is wired and reachable.**

It is the intended path for four reasons that are in the code, not inferred:

- It is the only importer that **reads the Asan file's own headers** (`کد حساب` / `نام حساب`),
  so the owner's exported `اشخاص.xlsx` needs no column mapping and no renaming.
- It is the only one that **matches on the Asan account code** — the strongest key, and the only
  one that means "same account" (`asan_classify_person_batch:25`).
- It is the only one that is **staged and reversible**: upload → preview → stage → classify →
  confirm. Nothing is written until «ثبت در جدول موقت», nothing applied until an explicit commit
  (`_app.admin.asan-import.tsx:40-56`).
- It is the only one that **refuses to guess**: a name-only match is always a `conflict` for a
  human, and a conflict is uncommittable at the database level.

Reachability, verified on the working-tree branch:

```
registry.ts:796-801      to: "/admin/asan-import", module: "asan-import"
registry.ts:1251         ROUTE_ROLES["/admin/asan-import"] = ["admin","accountant"]
primary-modules.ts:192   admin module paths include "/admin/asan-import"
routes/_app.admin.asan-import.tsx:122  createFileRoute("/_app/admin/asan-import")
```

Sidebar → **مدیریت** → «ورود اطلاعات از آسان» → tab «اشخاص». An `admin` or `accountant` sees it;
a `manager` does not (contrast `/persons/import`, which is admin+manager).

### خلاصهٔ فارسی — Q3

چهار مسیر برای ورود اشخاص از اکسل وجود دارد. مسیرِ درست برای **اولین ورود انبوه از آسان**،
`/admin/asan-import` است (سربرگ «اشخاص»)، در منو زیرِ «مدیریت»، برای admin و accountant. تنها
مسیری است که سرستون‌های خودِ فایل آسان را می‌شناسد، بر اساس **کد حساب** تطبیق می‌دهد، مرحلهٔ
پیش‌نمایش و تأیید دارد، و ردیف‌های مشکوک را به‌جای حدس زدن «تعارض» علامت می‌زند که اصلاً قابل ثبت
نیست.

دو نکتهٔ هشداردهنده: مسیر `/persons/import` که در منوی «اشخاص» هست **هیچ تطبیق و هیچ تشخیص
تکراری ندارد** و اجرای دوبارهٔ یک فایل، اشخاص تکراری می‌سازد؛ و مسیر `/sales/customers/import` که
تطبیق درست دارد، **در منو نیست** و فقط از دکمهٔ صفحهٔ مشتریان دیده می‌شود.

---

## Q5 — every Excel export, per document family × channel

Sweep method: every file in `src/` matching `xlsx|XLSX|json_to_sheet|aoa_to_sheet|writeFile|download`
(21 files; the ones that only *accept* `.xlsx` uploads — `PaymentReceiptDocuments.tsx`,
`attachment-rules.ts` — are MIME allow-lists, not producers), plus the four `asan_list_*_export`
RPCs read from the live catalogue, plus the new دفتر اسناد export on `origin/staging`.

**Channel vocabulary** (`payment_receipts_document_channel_check`, live): `card_to_card`, `paya`,
`pol`, `satna`, `cash`, `cheque`, `other`, plus NULL on receipts (vouchers are NOT NULL).
"bank" below means *any channel that is not cash and not cheque*.

| # | Family × channel | Export? | From which page | Which button | What it produces |
|---|---|---|---|---|---|
| 1 | **receipt — bank** | ✅ ×3 | `/accounting/receipts` · `/admin/asan-export` · `/accounting/documents` (staging) | «خروجی اکسل» (`:352`) · «دریافت فایل» with نوع خروجی = «دریافت‌ها و واریزها» **or** «واریزیهای بانکی (مسیر جایگزین)» · «خروجی اکسل» (`:171`) | List export: `payment-receipts-<date>.xlsx`, sheet «فیش‌ها»; or `payment-receipts-lines-<date>.xlsx` with product-line detail when the toggle is on (`_app.accounting.receipts.tsx:241-244`). Asan journal: 6-column layout 3, **one document per file**. Asan bank file: 15-column Latin layout 4. دفتر اسناد: the 11-column Persian register file |
| 2 | **receipt — cash** | ✅ ×3, with one deliberate hole | the same three pages | the same | In the list export (which filters only status, customer and date — `_app.accounting.receipts.tsx:131-150`, no channel predicate) and in دفتر اسناد. **Also present in the Asan *journal* export** — verified live: 5 posted cash receipts survive that function's own predicate. **Excluded by design from the Asan *bank-deposit* file** — `asan_list_bank_deposit_export:37-41`, decision T15 / migration 350: "receipt / payment, cash → MANUAL" |
| 3 | **receipt — cheque** | ✅ ×2 | `/accounting/receipts` · `/accounting/documents` | «خروجی اکسل» | In both list exports. **Excluded by design from *every* Asan export**: `asan_list_journal_export` drops any entry with a `cheque_receivable`/`cheque_payable` line *or* `document_channel = 'cheque'` (lines 41-57), and `asan_list_bank_deposit_export` excludes it at line 41. Migration 350:33-36 states this is not scope creep — "cheque is manual for exactly the same reason". Verified live: 4 cheque receipts, all filtered out |
| 4 | **payment — bank** | ✅ ×2 | `/admin/asan-export` · `/accounting/documents` (staging) | «دریافت فایل» with «پرداخت‌ها و برداشت‌ها» or «واریزیهای بانکی» · «خروجی اکسل» | Asan journal layout 3 (one doc/file); or Asan bank layout 4 with `direction = 'payment'` and the **source** bank account, the mirror of the receipt branch's destination (`asan_list_bank_deposit_export:61-66`); or دفتر اسناد's 11-column file. **`/accounting/payment-vouchers` itself has NO export** — see Finding 3 |
| 5 | **payment — cash** | ✅ ×2, same hole | `/admin/asan-export` (journal only) · `/accounting/documents` | the same | 4 posted cash payments survive the journal predicate (verified live). **Excluded by design from the bank-deposit file** — `asan_list_bank_deposit_export:73`, T15 |
| 6 | **payment — cheque** | ✅ ×1 | `/accounting/documents` (staging) **only** | «خروجی اکسل» | **Excluded by design from every Asan export** (the same two filters as row 3). Before migration 422 there was **no export of any kind** containing a cheque payment |
| 7 | **dual (سند دوبل)** | ✅ ×2 | `/admin/asan-export` · `/accounting/documents` (staging) | «دریافت فایل» with «اسناد شخص ثالث (دوبل)» · «خروجی اکسل» | Asan journal layout 3, one doc/file; `doc_kind 'dual'` maps to `_filter 'third_party'` (`asan_list_journal_export:47-48`), and T15 lists dual as **automatic**. دفتر اسناد renders the party as «payer به beneficiary» and leaves کانال and حساب بانکی **empty by design** — the money never lands in one of our accounts (422 decision 4, lines 80-82). Until 422, the Asan export was the **only** screen on which a dual document was visible at all |
| 8 | **purchase** | ✅ ×1 | `/admin/asan-export` | «دریافت فایل» with «فاکتورهای خرید» | 18-column layout 2 (`PURCHASE_HEADERS`), `docType: "purchase_invoice"` — its own number register — **many documents per file** (`export-purchase.ts:48-54`). Source: `public.purchases WHERE status = 'received'` (`asan_list_purchase_export:34-36`). **`/purchases` has no export button of its own.** A related export, «پرداخت‌های خرید و تسویه», rides the journal layout with `_filter = 'purchase_and_settlement'` (`export-journal.ts:104-110`) |
| 9 | **sale** | ✅ ×2 | `/admin/asan-export` · `/sales/quotes/$quoteId` | «دریافت فایل» with «فاکتورهای فروش» · «خروجی اکسل آسان» (`:731`) | 18-column layout 1 (`SALES_HEADERS`, **column K intentionally blank**), `docType: "sales_invoice"`, many docs per file. Source: `public.sales_quotes WHERE status = 'accepted'` **and** stock actually moved (`asan_list_sales_export:30-33`). The single-quote button is **byte-identical by construction**: it calls the *same* RPC with the quote's own date as both ends of the range and the *same* `buildInvoiceRows` — "there is nothing here that could disagree with the range export, because there is nothing here that maps anything" (`export-single-quote.ts:6-15`). Filename `asan-sales-<quote_number>.xlsx`. Gated to admin+accountant, not `isManagerial` (`:121-124`) |

### The findings inside Q5

**Finding 3 — `/accounting/payment-vouchers` has no export at all.** No `xlsx`, no `Download`,
no «خروجی» anywhere in `_app.accounting.payment-vouchers.tsx`. That is the asymmetry with
`/accounting/receipts`, which has had one for a long time. Until دفتر اسناد landed on
`origin/staging`, the **only** way to get a payment voucher into a spreadsheet was the Asan
export — admin+accountant only, one type at a time, cheques dropped. **A cheque payment (row 6)
had no export path whatsoever before migration 422.** The same is true of
`/accounting/mutual-settlement` and `/accounting/purchase-payments`: no export on either page.

**Finding 4 — "cash is manual" is true of the bank file, not of the journal file.** Migration
350's workflow table says `receipt / payment, cash → MANUAL`, and that is precisely and only
about `asan_list_bank_deposit_export`. The journal exports (3, 4, 5, 6) filter **cheque** and
reversals but **not cash**. Measured, not assumed — the function's own predicate replayed as a
`SELECT`:

```
 doc_kind | channel | survives_filter
 dual     | (none)  |  7        other    | (none)  |  2
 payment  | cash    |  4        payment  | other   |  6
 receipt  | cash    |  5        receipt  | (none)  | 11
-- cheque: 4 receipts + 2 payments, all removed.
```

So a cash receipt **can** reach Asan through «دریافت‌ها و واریزها». Whether that is intended, or
is a second B1 waiting to happen, is a question for the owner rather than a code question —
migration 350 fixed the bank file and says nothing about the journal file. **Flagged, not
concluded.**

**Finding 5 — nothing outside these nine rows is a document export.** The other xlsx/CSV
producers in `src/` are catalogue and reference data:
`product-catalog-excel.ts` (`products-<stamp>.xlsx`, from `/products`, `:512`),
`sale-price-list-excel.ts` (`sale-price-list-<stamp>.xlsx`, from `/pricing/sale-lists/new` `:696`
and `/pricing/sale-lists/$listId` `:924`), a customers CSV
(`customers-<date>.csv`, `_app.sales_.customers.tsx:154-161`), a data-tables CSV
(`_app.data-tables.$tableId.tsx:521-528`), and two pricing health-report CSVs
(`HealthReportTab.tsx:160, :266`). Listed for completeness; none touches a receipt, payment,
dual, purchase or sale document.

### خلاصهٔ فارسی — Q5

از نه ترکیبِ (خانوادهٔ سند × کانال)، همه دستِ‌کم یک خروجی اکسل دارند — اما نه از یک جا و نه با یک
هدف. کانالِ بانکی هر سه مسیر را دارد. کانالِ نقدی از فایلِ بانکیِ آسان **عمداً کنار گذاشته شده**
(تصمیم T15، مهاجرت ۳۵۰: نقدی و چکی دستی وارد آسان می‌شوند) — ولی، که نکتهٔ مهمِ این گزارش است،
**در خروجی «دریافت‌ها و واریزها»ی آسان هنوز می‌آید**؛ این با اندازه‌گیری روی پایگاه‌داده تأیید شد
و باید از مالک پرسیده شود. کانالِ چکی از **همهٔ** خروجی‌های آسان کنار گذاشته شده و تا پیش از «دفتر
اسناد» هیچ خروجی‌ای نداشت.

مهم‌ترین کمبود: **صفحهٔ «اسناد پرداخت» هیچ دکمهٔ خروجی ندارد** — نه اکسل، نه CSV — و همین‌طور
صفحات «تسویهٔ متقابل» و «پرداخت‌های خرید». تنها راهِ گرفتنِ فهرستِ پرداخت‌ها به‌صورت فایل، یا آسان
است یا «دفتر اسناد» که هنوز روی شاخهٔ کاری نیست.

---

## Not verified

Everything below was **not** established by this mission and must not be read as verified.

1. **دفتر اسناد was never opened in a browser.** All Q2 claims about it are read from
   `origin/staging` source and from the live view; the page itself, its Jalali picker, its empty
   state, the actual downloaded `.xlsx`, and the FinanceHub card's visibility per role were not
   exercised. It is **not on the working-tree branch**, so it is not running on
   `192.168.170.8:3100` from this checkout.
2. **No export or import was actually executed.** No file was downloaded, no workbook opened, no
   row staged or committed. Column lists, filenames and sheet names are read from source, not
   from a produced file.
3. **The role claims are code-level.** Guards, `ROUTE_ROLES`, RLS policy names and the
   `has_any_role` checks inside each RPC were read; **no session was created for any role** and
   no RPC was called as a non-superuser. The 422 commit message reports gate G5
   (accountant 47 / manager 47 / sales 0); that is **its author's claim, reproduced here, not
   re-measured by me.**
4. **`asan_list_sales_export` and `asan_list_purchase_export` were read for source tables and
   role gate only.** Their blocking rules, column mapping, and the sales layout's blank column K
   were not exercised against data.
5. **Finding 4 is a question, not a defect.** That cash survives the journal export is measured;
   whether the owner intends cash to reach Asan through «دریافت‌ها و واریزها» is **unknown**.
   Migration 350 addresses only the bank-deposit file.
6. **`/api/persons/import` being uncalled** rests on a `grep` over `src/`. Nothing outside `src/`
   was searched, and an external caller (a script, a manual `curl`, another repo) would not
   appear in that sweep.
7. **The unrecorded ledger row for 422 was observed, not fixed.** No `INSERT` was run. Whether
   any *other* migration is likewise unrecorded was **not** checked —
   `e2e/security/og81-migration-ledger-matches-disk.spec.ts` exists for exactly that and was not
   run.
8. **No build, typecheck, lint or test was run.** This mission changed no application code, so
   the CLAUDE.md verification table does not apply; per its own rule that is stated rather than
   implied. This repository still has **no `test` script**.
9. **Production was never contacted**, and no data on the test database was modified.
