# M2 — RESEARCH (READ-ONLY)

Read `docs/execution/ASAN_MISSION_CONTROL.md` first and obey every rule in it, including
section 1 on execution pace.

**This mission is strictly read-only.** Write no migration. Change no application code.
Apply nothing to the database. The only files you create are the research documents named
below.

Output: `docs/asan/research-asan-bridge.md`

Everything M3, M4 and M5 build depends on the accuracy of this document. A guess recorded
here becomes a bug there. Where you cannot determine something, write **UNKNOWN** and say
what evidence would settle it. Do not fill gaps with plausible-sounding assumptions.

Work through R1 to R8 in order, one at a time, writing each section before starting the next.

---

## Context you need before starting

I use an accounting program called **Asan** (آسان). It is the authoritative financial system;
AfraKala's ledger is only a mirror. Today my accountant re-types everything by hand. The goal
of this program is: AfraKala produces Excel files that Asan imports directly.

Direction of flow:
- **AfraKala → Asan**: finalized pre-invoices (sales), purchase invoices, receipts
  (دریافت / واریز), payments (پرداخت / برداشت), and third-party account documents (دوبل).
- **Asan → AfraKala**: persons and products.

Asan's exact import layouts are in the appendix of this file. Read them before answering R7.

Two reference exports from Asan live at `docs/asan/reference/`:
- `اشخاص.xlsx` — 489 rows (488 accounts), 29 columns. Column **AB = "کد حساب"** is the Asan
  person code, **Z = "نام حساب"**, **I = mobile**, **Y = landline**, **E = national id**,
  **X = address**.
- `کالا.xlsx` — 7257 rows (7256 products), 23 columns. Column **V = "کد کالا"** is the Asan
  product code, **S = "شرح کالا"**, **T = barcode**, **U = serial**, **Q = unit**.

These files are RTL: column A is the rightmost/last field. **Read by header text, never by
column position.** Mobile numbers appear without a leading zero (`9123740712`). Some product
descriptions are visually scrambled (`')LIFETT(W)لباسشویی دووسفید('`) — expected; import
verbatim, a human corrects later.

It has already been confirmed that `customers.accounting_code` **is** the Asan person code
(خان محمدی = `102012` in both). Verify this still holds and measure coverage.

---

## R1 — Product coding in AfraKala

Highest-value item. Answer each with evidence: a query result, a function definition, or a
file path and line number.

1. When a product is created, does the system generate a code automatically? If yes: which
   column, which function or trigger, what format? I have seen `AFK-2026-00402` style SKUs
   and there is a `product_sku_counters` table — establish the real mechanism.
2. Enumerate every identifier column on `products`: `sku`, `barcode`, `easy_code`, anything
   else. For each give type, uniqueness, nullability, and current fill rate.
3. Project history mentions an `easy_code` column populated from `accounting_code` during
   "phase F". Determine whether it exists on `products`, what it contains, and whether it is
   already the Asan product code or something else. **This matters**: if it already is the
   Asan code, M3 must extend it rather than adding a duplicate field.
4. Is there any existing field intended to hold an external accounting product code? If not,
   confirm adding one is safe — check for name collisions and for any `SELECT *` consumer
   that would break.
5. How many of the 7256 products in `کالا.xlsx` match existing AfraKala products, and by
   what? Test three strategies and report the hit rate of each: barcode, exact name,
   normalized name (strip spaces, unify Arabic/Persian ye and kaf, remove punctuation).
   Report overlaps and conflicts in both directions.

Also record total product count and how many are active.

---

## R2 — Person codes and phone normalization

1. Confirm `customers.accounting_code` is the Asan person code. Report how many customers
   have it, how many do not, and whether duplicates exist.
2. The identity model was unified into `persons` (migrations through 245). Determine where an
   Asan person code should live: on `customers`, on `persons`, or on `person_identifiers`.
   Recommend with reasoning. Consider that one person may simultaneously be a customer, a
   supplier and an external party — the Asan code is a property of the **person**, not of the
   role.
3. Enumerate every column in the database storing a phone number. Search
   `information_schema.columns` for likely names, confirm by sampling. For each report table,
   column, row count, and a frequency table of the formats actually present (leading `0`, no
   leading `0`, `+98`, `0098`, spaces, dashes, Persian digits).
4. Report how many collisions would occur if all phones normalized to `09XXXXXXXXX`. A
   collision is two different person records reducing to the same number. List them with
   enough context to judge whether they are the same human. **Do not merge anything** — my
   decision is that collisions are flagged for my review, never merged automatically.
5. Check whether Persian/Arabic-Indic digits (`۰۱۲۳۴۵۶۷۸۹` / `٠١٢٣٤٥٦٧٨٩`) appear in any
   phone column. If so they must be part of normalization.
6. Report how many of the 488 persons in `اشخاص.xlsx` match existing AfraKala persons — by
   Asan code, by normalized mobile, by name. Report conflicts.

---

## R3 — Existing import machinery

Before M3 builds an importer, find what already exists. Remember: the capability may already
be built and simply unwired.

1. Does the codebase parse Excel anywhere? Search for `xlsx`, `SheetJS`, `openpyxl`,
   `exceljs`, `papaparse`. Report every hit with path and purpose.
2. Is there an existing bulk-import route, server function, or admin page? Check
   `didar_import_log` and the Didar integration — built as an importer, may have a reusable
   shape.
3. What is the current file-upload path? Which buckets exist, what are their size and MIME
   limits, which suits an Excel upload? Note `payment-receipt-documents` was set to 20 MB and
   15 MIME types in migration 267.
4. Is there an existing "staging then approve" pattern for reviewing imported data before
   committing? If yes, describe it — M3 reuses it.

---

## R4 — Existing export machinery

1. The project has exactly two Excel exports today: payment receipts and the sale price list.
   Locate both. Report paths, library, client-or-server generation, and delivery mechanism.
2. `src/lib/export/export-modes.ts` and `src/lib/export/receipt-export-rows.ts` exist from a
   previous mission, along with `AsanLayoutNotConfiguredError`. Read them and report their
   exact shape and what "normal" versus "Asan" mode does today. M4 extends this — it must not
   create a parallel export system.
3. Is there any export for pre-invoices? I believe none. Confirm.
4. Describe the current row-selection UI, if any: does any export let the user pick rows, set
   a date range, or choose page size? Report what exists so M4 extends it.

---

## R5 — Bank accounts, account codes, and the double case

1. `bank_accounts.accounting_code` was added previously. Report the table's full structure,
   every row, and each row's `accounting_code`. One account ("12", Bank Mellat, id
   `32a4c282-85a3-485c-bbb4-dae3bb4febd6`) holds the placeholder `TEMP-CHANGE-ME`.
2. Asan's accounting-document import expects `کد حساب` (account code) per line. Determine
   what AfraKala supplies for each `account_kind`:
   - `customer_credit` → the customer's Asan person code
   - `bank` → the bank account's `accounting_code`
   - `external_party` → the external party's Asan code — **does this field exist?** If not,
     say so clearly; M3 must add it.
   - `invoice_ar`, `clearing`, `other` → what?
   Report which of these can be resolved today and which cannot.
3. Look at `اشخاص.xlsx` for rows representing bank accounts. Asan may model banks as persons
   with account codes. Report the evidence — this determines whether the bank code and the
   person code come from the same namespace.
4. **The double case (دوبل).** Sometimes I owe person A, and A tells me to pay into person
   B's bank account. And I give a customer's bank account to someone who owes me. Determine
   what AfraKala already supports: examine `external_parties`, `payment_receipts`,
   `payment_receipt_links`, `journal_entries`, `journal_lines`, and the `account_kind` CHECK
   (`customer_credit, bank, external_party, invoice_ar, clearing, other`). Report whether
   "pay to a third party's account" is representable today, and if not, precisely what is
   missing.
5. Report how many `journal_entries` exist, how many balance, and how many do not. An
   unbalanced entry cannot be exported — I need to know the size of that problem now.

---

## R6 — Product video chain

Desired flow: a TV is sold → a video is required → a task is created → someone uploads it →
the salesperson is informed → it is sent → it is recorded. Upload target is the existing
**`delivery-receipts`** bucket.

1. Migration 276 created `mandatory_category_services` and attaches mandatory services to
   products in `categories.slug='tv'` (16 products). Read it; report exactly what it does
   today and what a "service" row looks like.
2. What does the `tasks` table support? Columns, statuses, `assigned_queue` values (marketing
   added in 276), and how tasks are created today (`generate_marketing_tasks`,
   `complete_marketing_task`). Report whether a task can be linked to a specific sales quote
   line.
3. What is the current delivery-receipt flow? Which roles upload, which approve, what the
   `delivery-receipts` bucket policy allows, and whether video MIME types are permitted
   (migration 263 addressed a video rejection bug — confirm current state, including the
   size limit).
4. **Who should upload the video?** Determine from data who does the physical work: examine
   existing delivery receipt uploads and see which roles produce them. Report the evidence
   and recommend. If genuinely ambiguous, recommend the role that already owns delivery
   receipts and say so.
5. Should the requirement apply only to `slug='tv'` or to any category with a mandatory
   service? Report what `mandatory_category_services` currently allows and recommend the
   design that will not need reopening.
6. How does a salesperson get notified today? Report the existing mechanisms
   (`notification_queue`, `notification_events`, `dashboard_ticker_events`, the messenger)
   and which one M5 should reuse.

---

## R7 — Document numbering for Asan

I need AfraKala's exported invoice numbers to start at **1** and increment, because I am
starting Asan from 1. This must be stable: a document exported once keeps its number forever,
and re-exporting must never renumber it.

1. How are `sales_quotes` numbered today (`SQ-2026-000005` format)? Find the sequence or
   function. Same for purchase documents.
2. Is there an existing table mapping an internal document to an external system's
   identifier? (`didar_import_log` does something like this — report its shape.)
3. Report counts and date ranges for what would be in scope for a first export: finalized or
   accepted `sales_quotes`, purchase invoices, approved `payment_receipts`, payments, and
   `journal_entries`. I need to know the size of the first batch.
4. The sales/purchase import screen has a `شماره فاکتور اتوماتیک` checkbox and
   `گروه کدهای کالای جدید` / `گروه کدهای حسابهای جدید` fields defaulting to `101`. The
   accounting-document screen has a `شماره سند` field. Report your reading of what each does
   and whether our export should supply numbers explicitly or let Asan assign them.
   Recommend explicit numbering starting at 1 unless you find evidence against it.
5. For the accounting document: one `شماره سند` covers a whole document (many lines). Report
   how AfraKala's `journal_entries` → `journal_lines` structure maps onto that, and whether
   one Excel file should contain one document or many.

---

## R8 — Persian calendar dates and number formats

Asan uses Jalali dates in `1405/05/12` form — four digits, slash, two digits, slash, two
digits, Latin digits, zero-padded.

1. Report every existing Jalali conversion utility in the codebase. There is a
   `PersianDatePicker` and `src/lib/marketing/tehran-date.ts` — find all of them.
2. Report whether any can format to exactly `YYYY/MM/DD` with Latin digits and zero-padding,
   or whether M4 needs a new formatter.
3. Confirm the timezone approach: server is UTC, `public.tehran_today()` exists. Report how a
   database timestamp becomes the correct Tehran calendar day.
4. **Currency unit.** Report whether amounts in `sales_quotes`, `purchase_items`,
   `payment_receipts` and `journal_lines` are stored in Toman or Rial, with evidence (sample
   values against a known real-world amount). Report what unit Asan expects if you can
   determine it from `اشخاص.xlsx` or any other artefact. Getting this wrong by a factor of
   ten is exactly the silent financial error that matters most — if you cannot determine
   Asan's side, say UNKNOWN and M4 will make it explicit and configurable.

---

## Output format

`docs/asan/research-asan-bridge.md`, one section per item:

```markdown
## R<N> — <title>

### Findings
<numbered answers, each with evidence: query + result, or file:line>

### UNKNOWN
<what you could not determine, and what would settle it>

### Implications for build
<what M3/M4/M5 must do differently because of these findings>
```

Final section:

```markdown
## Blocking issues for the build missions
<anything that would make M3/M4/M5 impossible or unsafe as currently specified>
```

---

## MISSION GATE

1. `docs/asan/research-asan-bridge.md` covers R1 through R8.
2. No migration created. No application code changed. Nothing applied to the database.
   Verify with `git status` — only new documentation should appear.
3. Typecheck still exactly 70. Commit the research document.
4. Update `docs/execution/asan-progress.md`.
5. **Immediately proceed to `docs/execution/M3_BUILD_FOUNDATION.md`.** Do not wait for me.

---

## APPENDIX — Asan import layouts (from the owner's screenshots)

M3 Phase 3.0 formalizes these into `docs/asan/asan-layouts.md`. All four below are
**VERIFIED** — I captured each screen personally.

### Layout 1 and 2 — Screen "ارسال یا دریافت اطلاعات توسط Excel"
Tabs: `فروش` · `خرید` · `اطلاعات مشتریان` · `مرجوع خرید` · `مرجوع فروشی`
Header controls: `از تاریخ` / `تا تاریخ` (Jalali `1405/05/12`), `محدودیت تاریخ` checkbox,
`فقط تست شود ذخیره انجام نشود` checkbox, `شماره فاکتور اتوماتیک` checkbox,
`گروه کدهای کالای جدید` = 101, `گروه کدهای حسابهای جدید` = 101.

**Tab فروش** — columns A–H are highlighted in the dialog, meaning mandatory core:

| Col | Header |
|-----|--------|
| A | شماره فاکتور |
| B | تاریخ |
| C | کدشخص |
| D | کد کالا |
| E | نام کالا |
| F | تعداد |
| G | مبلغ ق |
| H | مبلغ کل |
| I | دریافت نقد |
| J | واریز به بانک |
| K | *(blank in the screenshot — VERIFY, see note)* |
| L | تخفیف |
| M | عوارض |
| N | نام حساب |
| O | گروه حساب/کد۲ |
| P | سریال کد کالا |
| Q | بارکد کالا |
| R | تلفن/کد۳ |

**Tab خرید** — identical except:

| Col | Header |
|-----|--------|
| I | پرداخت نقد |
| J | پرداخت از بانک |
| K | پرداخت چک |

Note on column K: on the purchase tab position K is `پرداخت چک`. On the sales tab it appeared
blank. It is plausible that sales has a cheque column too, but plausible is not verified.
Leave K empty in sales output and record it in `docs/asan/UNVERIFIED-LAYOUTS.md`.

### Layout 3 — Screen "ورود اطلاعات تولید یا سند از فایل Excel"
**This is the accounting-document layout, and the owner has confirmed it is the one used for
deposits and withdrawals (واریز و برداشت) as well as for third-party (دوبل) documents.**

Controls: `شماره سند` (numeric), `بدون مبلغ حذف شود` checkbox (checked by default),
`کد دلخواه` numeric, `بدهکاران` / `بستانکاران` checkboxes (both checked),
`کلیه مانده حسابها` button, `خواندن از سند` button, `Clear` button,
`انتقال اطلاعات` button, `ذخیره فایل Excel` button.

| Col | Header |
|-----|--------|
| A | کد حساب |
| B | کد کالا |
| C | شرح |
| D | تعداد |
| E | بدهکار |
| F | بستانکار |

This single layout therefore serves three of the five exports: receipts, payments, and
third-party documents. They differ only in which side of the ledger each line falls on.

### Layout 4 — Screen "ورود اطلاعات از Excel", option `واریزیهای بانکی`
Radio group `نوع اطلاعات`: `اسامی مشتریان` · `دریافتهای نقدی` (with a `فروش` dropdown) ·
`اسناد دریافتنی` · `پرداخت نقدی` · `واریزیهای بانکی` · `اسناد پرداختنی` · `اطلاعات فاکتور`.
Controls: `شروع کد از کد` = 101, `تعریف کد جدید` checkbox, `کدها عددی` checkbox.

**With `واریزیهای بانکی` selected** — note the headers here are Latin transliterations,
unlike every other screen:

| Col | Header |
|-----|--------|
| A | Date |
| B | Code_M |
| C | Name_Moshtari |
| D | Shomare_Peygiri |
| E | Mablagh |
| F | Bank_cod |

This is an **alternative** path for bank deposits specifically. The owner's primary route for
deposits and withdrawals is Layout 3. Treat Layout 4 as a secondary export: build it, but the
accounting-document layout is the default.

Column layouts for the other radio options (`دریافتهای نقدی`, `پرداخت نقدی`,
`اسناد دریافتنی`, `اسناد پرداختنی`, `اسامی مشتریان`) are **UNKNOWN** and, given that
Layout 3 covers the owner's actual need, are **out of scope** for this program. Do not build
them. Record them in `docs/asan/UNVERIFIED-LAYOUTS.md` as known-but-unbuilt.
