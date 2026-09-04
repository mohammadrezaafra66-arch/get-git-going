# Document pages and Asan export — integrated research report

**Date:** 2026-09-03 · **Type:** read-only research, five agents reconciled by an integrator
**Questions answered:** Q1 (is there a unified document listing?), Q2 (Excel export per document type), Q3 (does the Asan export work?)

---

## 1. Environment and validity caveats

| Item | Value |
|---|---|
| `hostname` | **VIRA-SERVICE** — the test server. Gate passed. **Production was never contacted.** |
| Database | `afrakala` on container `afrakala-lan-db` |
| Working-tree branch | **`feature/quote-customer-picker-readonly`** — *not* `staging` |
| Divergence | 15 commits **ahead** of `origin/staging`, **0 behind** |

### Why the branch does not invalidate the findings

The working tree is not on `staging`, so every code claim below was read from a branch that
`staging` does not yet contain. The 11 differing files are all sales/quotes work:
`_app.sales.quotes.*`, `lib/sales/quotes.ts`, `lib/accounting/functions.ts`,
`lib/invoices/functions.ts`, `lib/audit/index.ts`, `lib/feature-flags.ts`,
`QuoteCreationBlockDialog.tsx`, and migrations 420 and 421 (guest quotes).

**None of the 11 touches routes, the navigation registry, any export path, or the Asan module.**
The findings are therefore valid for `staging` as well. This was verified by the mission lead and
is recorded here as given.

Two agents (A, C, and D's code reading) worked against this branch. Two earlier agents cite
branch `staging` HEAD `99f6bd58` for parts of their code reading; the divergence does not touch
the files in question.

**Database caveat carried from the lead:** production has near-zero documents; the test database
has more. Any "the export returns nothing on production" observation is explained by data volume
before any code explanation is needed. See Q3.

### ⚠️ Incidental finding — `docs/research/_b_database.md` is corrupted

Not part of this mission, but the owner should know. While looking for prior material, the
integrator opened the five files `docs/research/_a_frontend.md` … `_e_export_sql.md` (dated
2026-08-16/17, branch `staging` HEAD `99f6bd58`). They belong to a **different, earlier mission**
about `/accounting/receipts/create` and were correctly **not** used as input here.

However, **`docs/research/_b_database.md` does not contain research prose at all.** It contains
Python source code from an unrelated project — a `backfill_warm_daily_metric` script referencing a
`whatsapp_sender` database:

```python
"""One-shot backfill of warm_daily_metric from inbox_messages.
Default is --dry-run. Refuses the live whatsapp_sender database unless --force-live is passed.
```

Whatever Agent B of the August mission wrote has been overwritten by content from another
repository. Given CLAUDE.md's warning that parallel agents share one working tree and that
"uncommitted work gets destroyed", this looks like cross-mission clobbering. The file is untracked,
so there is likely no git copy to recover. **Recommend checking whether other `docs/research/`
artefacts were affected, and whether any secret-bearing content from that other project landed in
this repo** — the snippet above names a live database. Not investigated further; out of scope.

---

## 2. Q1 verdict — a unified document listing

# ❌ DOES NOT EXIST

There is no page on which an accountant can list **دریافت + پرداخت + سند دوبل** together, with a
date filter and a document-type selector. What exists instead:

| Document type | List page | Date filter | Type filter |
|---|---|---|---|
| دریافت | `/accounting/receipts` (`src/routes/_app.accounting.receipts.tsx`) | ✅ range on `payment_date` (:295-296, UI :455-473 `JalaliDateInput`) | ❌ — the «نوع» column is `receipt_type`, a receipt sub-type |
| پرداخت | `/accounting/payment-vouchers` (`src/routes/_app.accounting.payment-vouchers.tsx`) | ✅ range on `payment_date` (`src/lib/treasury/queries.ts:149-150`, UI :50-51, :78-85) | ❌ — the «نوع» column is `payee_type` (:125, :142-144) |
| **سند دوبل** | **none — no list page exists at all** | — | — |

### Supporting evidence

- **`dual_documents` is read by zero routes and zero list queries in `src/`.**
  `grep -rn 'from("payment_receipts")\|from("payment_vouchers")\|from("dual_documents")' src/`
  returned 11 hits for `payment_receipts`, 1 for `payment_vouchers`, and **zero** for
  `dual_documents`. The literal string `dual_documents` appears nowhere in `src/`, including
  `src/integrations/supabase/types.ts`. Only the RPC *name* `create_dual_document` appears, on the
  write path (`features/ledger-wizard/rpc.ts:3`, `DocumentWizard.tsx:403`, and a comment at
  `PaymentReceiptDocuments.tsx:429`).
- **The pages that sound right are the wrong module.** `/documents`, `/admin/documents`, and
  `/operations/receipts` all read the `documents` table via the `get_documents` RPC
  (`useDocuments.ts:35, :100-113`) — uploaded files and scans. `/documents` has type and status
  filters but **no date filter** (:44-52); its header reads `title="اسناد"`,
  `description="بیجک، فاکتور و حواله"` (:56).
- **`/accounting/treasury` is the closest but on the wrong axis.** It calls
  `get_account_ledger(p_account_id, p_from_date, p_to_date)` (:73-78) — per-account and
  journal-line-based, requiring one selected account (`enabled: !!selectedAccount`, :75). Its
  «نوع حساب» is cash/bank, not document type. Verified live:

  ```
   doc_kind | entries | bank_lines
   dual     |       7 |          0
   payment  |      12 |         10
   receipt  |      24 |         20
  ```

  `get_account_ledger` selects `WHERE jl.account_kind='bank' AND jl.account_ref_id=p_account_id`
  (verbatim from `pg_get_functiondef`), so with 0 bank lines **a dual document can never appear
  there.**
- **`/admin/asan-export` is the only screen on which a dual document is visible at all** — and it
  is an export tool, not a register. It shows one type at a time («نوع خروجی», :316-329) with **no
  «همه» option**, is gated to admin + accountant only (:95), returns one row *per journal line*
  rather than per document, and excludes every unposted, reversed, or cheque document. See Q2/Q3.

### Is anything in the database already unioning the three?

No. All 21 public views were listed; none touches these tables, and there are no materialized
views. The functions that read both `payment_receipts` and `payment_vouchers` are
`asan_list_bank_deposit_export`, `asan_list_journal_export`, `create_payment` (writer),
`get_account_ledger`, `person_fk_drift_report`, `person_merge` (writer), and `reverse_document`
(writer). **Only one read function also mentions a dual document: `asan_list_journal_export`.**
It is the sole existing union, and it is line-level, posted-only, reversal-suppressed,
cheque-excluding, and admin/accountant-gated.

### The natural spine already exists and nothing reads it

`document_numbers` carries a CHECK of exactly `doc_type IN ('receipt','payment','dual')`, is
unique on `(doc_type, source_id)`, and has a `burned_at` tombstone:

```
 dual    | 58 rows | 51 burned
 payment | 63      | 51
 receipt | 74      | 51
```

Live (non-burned) counts 7 / 12 / 23 line up with the source tables. `grep 'document_numbers' src/`
returns **only comments** (`lib/asan/export-numbers.ts:8`, `export-single-quote.ts:14`).

A union over the three source tables, each `LEFT JOIN document_numbers` on
`(doc_type, source_id, burned_at IS NULL)`, was **executed read-only** and returns a coherent
register — 38 rows for 2026-08-20 … 2026-09-03, first rows:

```
 dual    | DUAL-1405-000058 | 2026-08-31 | مشتری آزمایشی 6 | 117500000   | approved | reversed f
 payment | PAY-1405-000063  | 2026-08-31 | مشتری آزمایشی 6 |   3698700   | approved | f
 receipt | RCP-1405-000074  | 2026-08-31 | علی             | 36000000.00 | approved | f
 receipt | RCP-1405-000056  | 2026-08-26 | مشتری آزمایشی 1 |     1000.00 | approved | t
```

Settled common columns: `doc_type / id / document_number / doc_date` (`payment_date`,
`payment_date`, `document_date`) `/ party / amount / status / reversed / created_at`.
`document_channel` exists on receipts and vouchers but is **absent on `dual_documents`** — render
it optionally, do not make it a shared filter.

### Do not use `journal_entries` as the register — integrator cross-check

Agent B flagged `journal_entries` as an incomplete day register (24 receipt entries vs 28
`payment_receipts` rows) without explaining the gap. Agent E's independent numbers explain it
exactly:

- E: `payment_receipt|receipt|posted` = **24**; `payment_receipts.status` = approved **22**,
  pending_review **6** (28 total); journal funnel `total 45 → reverses_entry_id IS NULL 43`
  (2 reversal legs).
- **Inference (arithmetic on E's and B's reported numbers, not separately queried):**
  24 = 22 posted originals + 2 reversal legs, and the 6 `pending_review` receipts never post at
  all. `payment_voucher` 12 = approved 12 ✅, `dual_document` 7 = approved 7 ✅.

So `journal_entries` is structurally incapable of showing a pending receipt. This *strengthens*
B's design conclusion: the register must union the three source tables, not read the ledger.

### The design B recommends (not built — recorded for the follow-up task)

A **new** route `/accounting/documents` («دفتر اسناد»), not a filter bolted onto an existing page,
because: `/accounting/receipts` is `ReceiptsLayout` + `ReceiptsListPage` (:94-104) with an
`Outlet` for `/create` and `/$receiptId`, carries a receipts-specific Excel exporter (:127-260)
hard-wired to `payment_receipts` and `buildStandardReceiptRows`, and has a status filter whose
values (`pending_review/approved/rejected`) **do not exist** on `dual_documents`
(`draft/approved/rejected`) — rewriting it collides with CLAUDE.md rule 15;
`/accounting/payment-vouchers` is deliberately frozen read-only (its own header comment, :31-38);
`/admin/asan-export` is admin+accountant and hides cheque and unposted documents.

- **Option A — client-only, no migration (smallest).** Three PostgREST queries merged in TS in a
  new `src/lib/accounting/document-register.ts`. RLS already permits exactly the right audience:
  `pr_select_privileged`, `payment_vouchers_select_finance`, and `dual_documents_select_finance`
  are all `has_any_role(uid(), ['admin','manager','accountant'])`. Union pagination is awkward
  client-side but fine at 28/12/7 rows. **Effort: small** (~250-line route + ~120-line merge
  helper + 2 registry entries + 1 FinanceHub link; about half a day).
- **Option B — one SECURITY DEFINER RPC (recommended).** New migration **422** (highest on disk is
  421, `20260903140000_421_guest_refusal_message_tells_the_truth.sql`) adding
  `public.list_document_register(_from date, _to date, _types text[], _limit int, _offset int)`
  returning `(doc_type, doc_id, document_number, doc_date, party_name, amount, status, reversed,
  document_channel, created_at, total_count)`; body = the verified union, guarded by
  `has_any_role(auth.uid(), ['admin','manager','accountant'])` mirroring `get_account_ledger`.
  Existing indexes cover it (`idx_payment_vouchers_date(payment_date DESC)`,
  `dual_documents_document_date_idx(document_date)`,
  `document_numbers_one_per_document(doc_type, source_id)`); **`payment_receipts` has no index on
  `payment_date`** — worth adding in the same migration (additive, safe). No new FK to `persons`,
  so the migration-328 gate is not engaged. No audit-log impact. **Effort: medium** (~one day).

UI reuses `PageHeader`, `Card`, `Table`, `Badge`, `JalaliDateInput`, `formatNumber`,
`formatDateFa`, `toFaDigits`. Filters «از تاریخ» / «تا تاریخ» (default both = today), a type
control «همه / دریافت / پرداخت / سند دوبل», and one «امروز» shortcut.

---

### 🔴 SEPARATE FINDING — the two lists that DO exist are not on any menu

**`/accounting/receipts` and `/accounting/payment-vouchers` both exist, are both in the navigation
registry, and neither renders as a sidebar link.** The sidebar's finance path list contains
exactly one entry (`primary-modules.ts:148`). See §5 and contradiction C-1. So even the partial
answer to Q1 that *does* exist is, for an admin or manager, reachable only by global search,
pinning, a hub card, or a typed URL.

**And a further one:** after the wizard creates a dual document it navigates to
`/accounting/receipts` — a list that reads `payment_receipts` and therefore **cannot contain it**.

```ts
// DocumentWizard.tsx:437-441
if (branch === "payment") { await navigate({ to: "/accounting/payment-vouchers" }); }
else { await navigate({ to: "/accounting/receipts" }); }
```

`FinanceHub.tsx:73-82` offers «سند دوبل» as a create operation, and its reference column
(:97-180) has **no** "recorded documents" destination. A user creates a dual document and is
dropped on a page that structurally cannot show it.

---

## 3. Q2 verdict — Excel export per document type

**Exactly four places in `src/` write an `.xlsx`. Only two touch accounting documents.**

`grep -rn "XLSX.writeFile|XLSX.write(|downloadAsanWorkbook" src`:
`src/lib/asan/export-single-quote.ts:87`, `src/lib/asan/write-xlsx.ts:33`,
`src/lib/export/product-catalog-excel.ts:77`, `src/lib/export/sale-price-list-excel.ts:101`,
`src/routes/_app.accounting.receipts.tsx:241`, `src/routes/_app.admin.asan-export.tsx:253`.
Every other `xlsx` hit in `src/` is an **import** (`CustomerImportForm.tsx:90`,
`PersonImportForm.tsx:128`, `_app.admin.asan-import.tsx:268`, `AsanProductImport.tsx:200`) or a
MIME allow-list (`PaymentReceiptDocuments.tsx:85`, `lib/messenger/attachment-rules.ts:59`).

### دریافت (receipts) — ✅ has a general export

| | |
|---|---|
| Page | `/accounting/receipts` (`src/routes/_app.accounting.receipts.tsx`, `createFileRoute` :71) |
| Page title | «فیش‌های واریزی» (:310) |
| Button label | **«خروجی اکسل»** (:352), handler `handleExportExcel` (:127) |
| Roles | admin / manager / accountant (:73-77) |
| Data source | direct PostgREST read of `payment_receipts` `.limit(5000)` (:132-144), joined to `customers`, `bank_accounts`, `external_parties`; creator names from `profiles` (:167-175). Honours the page filters: status, customer, `payment_date` from/to (:146-149) |
| File | `payment-receipts-<YYYY-MM-DD>.xlsx`, sheet «فیش‌ها» (:237) |
| With line detail | `payment-receipts-lines-<YYYY-MM-DD>.xlsx` (:241-244); additionally reads `payment_receipt_links → sales_quotes → sales_quote_items` (:187-196) |

Headers (`lib/export/receipt-export-rows.ts:80-107`): تاریخ ثبت (شمسی), تاریخ فیش (شمسی), ساعت فیش,
ثبت‌کننده (کاربر), مشتری مرتبط, تلفن مشتری, کد آسان مشتری, واریزکننده (نام), واریزکننده (تلفن),
واریزکننده (کد آسان), بانک مبدأ, گیرنده, گیرنده (نام روی فیش), گیرنده (تلفن), گیرنده (کد آسان),
بانک مقصد, مبلغ (تومان), شماره پیگیری, نوع فیش, رسید اسکرین‌شات همراه بانک, وضعیت, وضعیت ثبت سند,
تاریخ ثبت سند (شمسی), علت رد, توضیحات, شناسه فیش. With line detail six more
(`receipt-export-rows.ts:145-160`): شماره پیش‌فاکتور, کد کالا, نام کالا, تعداد, مبلغ فی, مبلغ کل ردیف.

Two extra controls sit beside the button (:320-338): a `Select` with `aria-label="حالت خروجی"`
offering «خروجی معمولی» / «خروجی آسان» (labels at `lib/export/export-modes.ts:38-41`), and a
checkbox `aria-label="جزئیات ردیف کالا"` labelled «جزئیات ردیف کالا» (:331-338).

> ⚠️ **«خروجی آسان» on this page deliberately produces nothing.** It throws
> `AsanLayoutNotConfiguredError` (`_app.accounting.receipts.tsx:180-182`; class at
> `export-modes.ts:66-76`) and shows a Persian toast saying the layout is not configured. Only
> «خروجی معمولی» yields a file. A user who picks the Asan mode here gets a dead end.

Types covered: receipts only. `payment_receipts.receipt_type ∈ invoice_payment | debt_payment |
prepayment | positive_credit` (`lib/receipts/receipt-types.ts:10-15`) — all four are receipt
sub-types, not other document kinds.

### پرداخت (payments) — ❌ no general export, Asan only

`src/routes/_app.accounting.payment-vouchers.tsx` is 173 lines total. Page title «اسناد پرداخت
(خروج پول)» (:72). `grep -n "خروجی|Export|FileSpreadsheet|Download"` over the file returns **only
the `createFileRoute` line**. It has date filters and a table (شماره سند / تاریخ / دریافت‌کننده /
نوع / کانال / از حساب / مبلغ / چک) and **no export button of any kind**. It is also capped at
`.limit(200)` with no pagination (`lib/treasury/queries.ts:129-171`).

The only export path is `/admin/asan-export` with «نوع خروجی» = **«پرداخت‌ها و برداشت‌ها»**.

### سند دوبل (dual) — ❌ no list page, therefore no general export, Asan only

`create_dual_document` writes `public.dual_documents` (migration 361:402; table in 360). Nothing in
`src/` reads it. The only export path is `/admin/asan-export` with «نوع خروجی» =
**«اسناد شخص ثالث (دوبل)»**.

### The one page that covers all three: `/admin/asan-export`

| | |
|---|---|
| Page title | «خروجی برای آسان» (:97, :298) |
| Roles | **admin, accountant only** (`registry.ts:1250`; route guard :94-96) |
| Type selector | `<Label>نوع خروجی</Label>` (:316) over `ASAN_EXPORT_ORDER` (`export-registry.ts:35-43`) |
| Button label | **«دانلود خروجی انتخاب‌شده‌ها»** (:376), sr-only alias «دریافت فایل اکسل» (:379) |
| The three relevant types | receipts → «دریافت‌ها و واریزها» (`export-journal.ts:79-84`); payments → «پرداخت‌ها و برداشت‌ها» (:87-92); third_party → «اسناد شخص ثالث (دوبل)» (:95-102) — same builder, different `doc_kind` filter, all from `asan_list_journal_export(_from,_to,_filter)` (:39-43) |
| File | `asan-<key>-<fromIso>_to_<toIso>-selected-<n>.xlsx`, sheet «Asan» (:250-256, `lib/asan/write-xlsx.ts:27-46`) |
| Headers (journal layout) | کد حساب, کد کالا, شرح, تعداد, بدهکار, بستانکار (`lib/asan/layouts.ts:64-71`) |

Two hard constraints a reader must know:

1. **One file = one document.** `oneDocumentPerFile: true` (`export-journal.ts:66`). Selecting more
   than one refuses with «این قالب «شماره سند» را روی صفحهٔ آسان می‌گیرد، پس هر فایل فقط یک سند
   دارد…» (:221-226).
2. **Downloading is not read-only.** It assigns permanent Asan document numbers via
   `asan_assign_document_numbers` (:231-243).

### Click paths

- **دریافت — two paths.** (1) `/accounting/receipts` → filters → dropdown left at «خروجی معمولی» →
  «خروجی اکسل» → `payment-receipts-<date>.xlsx`. **Note:** Agent C recorded the entry to this page
  as «منوی کناری > مالی و حسابداری > فیش‌های واریزی»; **that sidebar link does not render** — see
  contradiction C-1. The working entries are the accountant quick-access tile
  (`AppSidebar.tsx:52-57`), the mobile bottom nav «فیش‌ها» (`MobileBottomNav.tsx:33`), global
  search, pinning, or a typed URL. (2) The Asan path.
- **پرداخت — one path only:** منوی کناری > مدیریت سیستم > ابزارها و یکپارچه‌سازی > خروجی برای آسان →
  «نوع خروجی» = «پرداخت‌ها و برداشت‌ها» → بازه → «اعمال بازه» → tick **one** document →
  «دانلود خروجی انتخاب‌شده‌ها».
- **سند دوبل — one path only:** same page → «اسناد شخص ثالث (دوبل)».

### Q2 summary and the role gap

| Type | General (non-Asan) Excel | Asan Excel | Who can export at all |
|---|---|---|---|
| دریافت | ✅ «خروجی اکسل» | ✅ | admin, manager, accountant (general); admin, accountant (Asan) |
| پرداخت | ❌ none | ✅ one doc per file | **admin, accountant only** |
| سند دوبل | ❌ none (no list page) | ✅ one doc per file | **admin, accountant only** |

**A manager can read all three tables but cannot export payments or dual documents at all** — the
only path runs through an admin/accountant-gated page. Creation is unified in one wizard
(`/accounting/receipts/create` with `?branch=receipt|payment|dual`); **export is not.**

The other two `.xlsx` writers are unrelated to accounting documents: `_app.products.index.tsx:456`
(button «خروجی اکسل» :512 → `products-<date>.xlsx`, sheet «محصولات») and
`_app.pricing.sale-lists_.$listId.tsx:767` / `_new.tsx:302` (→ `sale-price-list-<date>.xlsx`).
A seventh, single-document exporter exists at `_app.sales.quotes.$quoteId.tsx:731` — button
«خروجی اکسل آسان» → `asan-sales-<quoteNumber>.xlsx`.

---

## 4. Q3 verdict — does the Asan export work?

# ⚠️ PARTIAL

**It works for four of the seven types and is data-blocked for two; one is permanently empty, and
one small class of documents is unreachable by design.** No SQL predicate is inverted or
unsatisfiable; nothing on the client drops rows. Both agents who executed the functions reached
this independently.

### Per type, measured live

| «نوع خروجی» | key | docs | exportable | Verdict |
|---|---|---|---|---|
| فاکتورهای فروش | `sales` | 9 | **0** | ⛔ 100 % data-blocked |
| فاکتورهای خرید | `purchase` | 303 | **3** | ⛔ 99 % data-blocked |
| دریافت‌ها و واریزها | `receipts` | 16 | **15** | ✅ works |
| پرداخت‌ها و برداشت‌ها | `payments` | 10 | **10** | ✅ works |
| اسناد شخص ثالث (دوبل) | `third_party` | 7 | **7** | ✅ works |
| پرداخت‌های خرید و تسویه | `purchase_settlement` | 0 | 0 | ⭕ permanently empty |
| واریزیهای بانکی | `bank_deposits` | 17 | **16** | ✅ works |

Measured under a simulated admin JWT inside `BEGIN … ROLLBACK`:
`SET LOCAL "request.jwt.claims" = '{"sub":"4084224a-cd34-4632-9cbc-3b5f3581cf6e","role":"authenticated"}'; SET LOCAL ROLE authenticated;`
`uid_ok t, role_ok t`. There are **seven** options, not six (`export-registry.ts:35-43`).

### The date window is ruled out — and D and E agree exactly

Agent D used the page's **default 90-day window** (`DEFAULT_RANGE_DAYS = 90`, :102, :130-131 →
2026-06-05 … 2026-09-03). Agent E used a **wide 2020-01-01 … 2030-12-31 window**. The numbers are
identical on every single function:

| Function / filter | D (default 90d) raw / docs / eligible | E (wide 11y) raw / docs / eligible |
|---|---|---|
| `sales` | 9 / 9 / 0 | 9 / 9 / 0 |
| `purchase` | 303 / 303 / 3 | 303 / 303 / 3 |
| `bank_deposit` | 17 / 17 / 16 | 17 / 17 / 16 |
| `journal` `all` | 70 / 35 / 33 | 70 / 35 / 33 |
| `journal` `receipt` | 32 / 16 / 15 | 32 / — / — |
| `journal` `payment` | 20 / 10 / 10 | 20 / — / — |
| `journal` `third_party` | 14 / 7 / 7 | 14 / — / — |
| `journal` `settlement` | 0 | 0 |
| `journal` `purchase_and_settlement` | 0 | 0 |

**That identity is itself the finding: the default window hides nothing.** Corroborated by direct
counts — `sq_accepted_last90 = 9 = sq_accepted total`; `purch_received_last90 = 303 = total`;
`je_posted_last90 = 45 = total`. Every table's newest qualifying record is 2026-08-31, inside the
default window. Widening the range adds **zero** rows.

The date plumbing is also correct: `Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Tehran"})`
(:105-123) emits Gregorian `YYYY-MM-DD`, and `PersianDatePicker` also emits Gregorian ISO
(`PersianDatePicker.tsx:6, :40-42`). **There is no Jalali-string bug.**

Permissions are ruled out too: `proacl` grants `authenticated=X` on all four functions, and a
permission failure would surface as a red toast (:200), not an empty list.

### What is actually going wrong, in order of size

**1. Missing `asan_person_code` on the counterparty — the dominant cause.**
Coverage across the whole database: persons **86**, of which `person_identifiers` of kind
`asan_person_code` = **16**; customers **86** of which **16** coded; suppliers **15** of which
**2** coded; bank accounts **2 of 2** coded.

Blocked-reason distribution (distinct documents):

| Export | Exportable | Blocked, and why |
|---|---|---|
| `bank_deposit` | 16 | 1 — «کد آسان برای «پرداخت‌کنندهٔ آزمایشی 7» ثبت نشده است» |
| `sales` | **0** | 8 — no asan code, across 6 distinct customers; 1 — «موجودی این پیش‌فاکتور کسر نشده است…» |
| `purchase` | 3 | 287 — no asan code for «؟» (`supplier_id` NULL); 13 — named test suppliers with no code |
| `journal` (all) | 33 | 1 — «سند تراز نیست: بدهکار 1000 و بستانکار 400»; 1 — «کد حساب آسان برای «مشتری آزمایشی 17» ثبت نشده است» |

Named blocked customers on `sales`: «شخص آزمایشی 20» ×3, «محمدرضا تست 2», «شخص آزمایشی 1»,
«مشتری آزمایشی 42», «مشتری آزمایشی 5», «مشتری آزمایشی 18».

**The asan-code block masks everything else on sales.** Of the same 9 accepted quotes, taken
condition by condition independently: has line items **9/9**, has asan code **1/9**,
`accounting_registered_at` not null **7/9**, stock movement exists **6/9**. So once asan codes are
entered, most of the 9 become exportable immediately — only the one stock-movement failure
survives.

**2. 287 purchases have no supplier at all.** `supplier_id IS NULL AND supplier_person_id IS NULL`
— the `«؟»` party in the blocked reason is a `LEFT JOIN suppliers` that found nothing. Entering
asan codes cannot fix these; the purchases must first be linked to a supplier. This is a larger
and different data problem from (1).

**3. `purchase_settlement` is permanently empty — but correctly so.** Stored kinds are
`receipt|payment_receipt` 24, `payment|payment_voucher` 12, `dual|dual_document` 7,
`other|manual` 2. No posted entry has `doc_kind` `'purchase_payment'` or `'settlement'`, and
`mutual_settlements` has **0 rows**, so `dkind IN ('purchase_payment','settlement')` is never
satisfied. Agent D framed this as "structurally empty"; Agent E as "correct, not a bug — the data
does not exist". **E's framing is the precise one:** the predicate is satisfiable in principle;
the upstream features simply write no such rows today. The user sees
«در این بازهٔ تاریخی سندی پیدا نشد.» on this tab always.

**4. A genuine small wiring defect — `unclassified` is unreachable.** The two
`doc_kind='other'` / `source_type='manual'` entries map to `dkind='unclassified'`, and **no
`_filter` value the page can send matches it.** They are reachable only via `_filter='all'` —
which the RPC accepts and the TS type includes (`export-journal.ts:28-34`), but **no export
definition uses**: the four `makeJournalExport` calls pass `'receipt'`, `'payment'`,
`'third_party'`, `'purchase_and_settlement'` (:80-110), and the UI has no «همه» option. Both D and
E found this independently. **Two posted documents are invisible on every tab of the page.**

**5. The UX amplifier that makes "works" read as "broken".** Nothing on the client drops rows —
`groupInvoiceRows` (`export-invoice-rows.ts:128-156`), `groupJournalRows`
(`export-journal-rows.ts:95-127`), and `groupBankDepositRows` (`export-bank-deposit-rows.ts:84-97`)
only group, and blocked documents are kept with a `blockedReason`. But the buttons disable on
`selectedEligibleCount === 0` (:361, :369). **So an all-blocked result renders a full table above a
dead download button** — which a user reasonably reports as "the export gives me nothing". On
`sales` that is exactly what happens: 9 rows, 0 downloadable.

### The funnels reconcile exactly (this is why the verdict is not BROKEN)

- **`payment_receipts` → bank deposit:** 28 → approved 22 → `destination_bank_account_id` NOT NULL
  18 → channel NULL or NOT IN (cash, cheque) 13 → `reversed_at IS NULL` 11 → in range **11**.
- **`payment_vouchers` → bank deposit:** 12 → approved 12 → channel NOT IN (cash, cheque) 6 →
  `reversed_at IS NULL` 6 → in range **6**.
- **11 + 6 = 17 = the function's exact row count.** ✅
- **`journal_entries` → journal export:** 45 → posted 45 → in range 45 → `reverses_entry_id IS
  NULL` 43 → not reversed by a posted entry 41 → no cheque line 35 → source doc not cheque-channel
  **35 distinct docs → 70 line rows, 66 exportable**. `doc_kind` is non-null on all 45, so it never
  drops anything. Attrition = 2 reversal legs + 2 reversed originals + 6 cheque-line entries.
- **`dual_documents`: 7 → approved 7 → has a posted journal entry 7 → survives every export filter
  7. ZERO ATTRITION.** All 7 dual documents reach the export as `third_party`.

### One real asymmetry in `asan_list_bank_deposit_export`

The receipt branch excludes a row unless `destination_bank_account_id IS NOT NULL`. The voucher
branch has **no** equivalent requirement on `source_bank_account_id`. So a voucher with a NULL
source bank account is **included and then blocked** («کد آسان حساب بانکی مبدأ/مقصد ثبت نشده
است»), whereas a receipt with a NULL destination is **excluded and never seen**. The receipt branch
also keeps `document_channel IS NULL` deliberately (the function's own comment cites migration 350
/ Gate A B1); the voucher branch has no `IS NULL` disjunct because the column is NOT NULL there.
The asymmetry is real but is a reporting-consistency issue, not a cause of emptiness.

### Function facts, for the record

All four are `LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'`, gated by
`has_any_role(['admin','accountant'])`. Identity arguments: `bank_deposit(_from date, _to date)`;
`journal(_from date, _to date, _filter text)`; `purchase(_from date, _to date)`;
`sales(_from date, _to date)`. Valid `_filter`:
`'all','receipt','payment','third_party','settlement','purchase_and_settlement'` (anything else
raises 22023).

**`document_numbers` is not a gate.** None of the four list functions reference `document_numbers`
or `asan_export_numbers` — confirmed by reading all four live bodies via `pg_get_functiondef`.
Numbering is assigned downstream by `asan_assign_document_number(s)`, called only on download
(:234-237). `existing AsanNumbers` (`export-numbers.ts:20-24`) does **not** filter the list.

One quirk worth flagging for the sales export: it filters on
`(sq.created_at AT TIME ZONE 'Asia/Tehran')::date BETWEEN _from AND _to` — **`created_at`, not a
quote date**. And it reads `sq.customer_person_id` only, with **no fallback** through
`customers.person_id` and ignoring `customers.accounting_code` — unlike the purchase and
bank-deposit functions, which use `COALESCE(pu.supplier_person_id, s.person_id)`. A customer coded
only through the `customers` row will still block on sales.

### Answering "production shows nothing"

Production has near-zero documents (established by the lead). Every mechanism above is
data-driven, so on production the same code returns nothing simply because the source tables are
near-empty. **No production-specific code defect is implied by an empty export there**, and none
was looked for — production was never contacted.

---

## 5. Every route, and whether it is actually on a menu

Agent A's central proof: **a registry seed alone does not put a link on screen.** The sidebar
renders `itemsForModule(activeModule, visible)` (`src/components/layout/AppSidebar.tsx:102-105`),
and `itemsForModule` **intersects** role-visible registry entries with a hand-maintained path list
at `src/components/layout/primary-modules.ts:245-257`. The match is **exact, not by prefix**
(:41, :253-256). So "IN MENU" requires two independent facts, and the table preserves both.

**Registry** = a seed exists in `registry.ts`. **Sidebar** = the path is *also* in
`PRIMARY_MODULES.paths`. **Hub** = linked from a `FinanceHub` card.

| Route file | Path | Purpose | Roles | Registry | Sidebar | Other entry | IN MENU |
|---|---|---|---|---|---|---|---|
| `_app.accounting.receipts.create.tsx` | `/accounting/receipts/create` (`?branch=receipt\|payment\|dual`) | FinanceHub with no branch; `DocumentWizard` with a branch (:109-127) | `requireAnyRole(["admin","accountant","manager"])` :41-43 | ✅ :477 | ✅ `primary-modules.ts:148` — **the only finance path** | — | ✅ **YES** |
| `_app.accounting.receipts.tsx` | `/accounting/receipts` | Deposit-receipt list + filters + export-mode select (:307-330) | admin/manager/accountant :75-77 | ✅ :431 | ❌ | accountant quick access `AppSidebar.tsx:52-57`; mobile bottom nav `MobileBottomNav.tsx:33` | ❌ **NO** |
| `_app.accounting.receipts.$receiptId.tsx` | `/accounting/receipts/$receiptId` | «جزئیات فیش واریزی» (:434) | admin/manager/accountant :61-63 | — | — | dynamic detail | ❌ (expected) |
| `_app.accounting.receipts_.training.tsx` | `/accounting/receipts/training` | `PaymentReceiptGuide` (:14) | admin/manager/accountant :10-13 | ✅ :438 | ❌ | none | ❌ **NO** |
| `_app.accounting.treasury.tsx` | `/accounting/treasury` | «خزانه» balances (:104) | admin/manager/accountant :46-48 | ✅ :484 | ❌ | hub `FinanceHub.tsx:105` | ❌ (hub only) |
| `_app.accounting.payment-vouchers.tsx` | `/accounting/payment-vouchers` | «اسناد پرداخت (خروج پول)» list (:72) | admin/manager/accountant :43-45 | ✅ :491 | ❌ | a button on `/accounting/treasury:108` | ❌ **NO** |
| `_app.accounting.receivables.tsx` | `/accounting/receivables` | «مطالبات مشتریان» (:300) | :50-52 | ✅ :445 | ❌ | hub :171 | ❌ (hub only) |
| `_app.accounting.payables.tsx` | `/accounting/payables` | «بدهی‌های تأمین‌کنندگان» (:257) | :51-53 | ✅ :452 | ❌ | hub :176 | ❌ (hub only) |
| `_app.accounting.purchase-payments.tsx` | `/accounting/purchase-payments` | «ثبت پرداخت خریدها» (:270) | :67-69 | ✅ :459 | ❌ | hub :110 | ❌ (hub only) |
| `_app.accounting.bank-accounts.tsx` | `/accounting/bank-accounts` | «حساب‌های بانکی» (:123) | :33-35 | ✅ :466 | ❌ | hub :152 | ❌ (hub only) |
| `_app.accounting.external-parties.tsx` | `/accounting/external-parties` | «طرف‌های حساب / گیرندگان وجه» (:98) | :26-28 | ✅ :498 | ❌ | person-profile deep link only (`src/lib/persons/profile-deep-links.ts:62`) | ❌ **NO** |
| `_app.accounting.dynamic-capital.tsx` | `/accounting/dynamic-capital` | «تخصیص سرمایه روزانه» (:263) | admin/accountant :62-64 | ✅ :509 | ❌ | hub :131 | ❌ (hub only) |
| `_app.accounting.salesperson-scoring.tsx` | `/accounting/salesperson-scoring` | «امتیازدهی کارشناسان فروش» (:46) | admin/accountant :23-27 | ✅ :519 | ❌ | hub :126 | ❌ (hub only) |
| `_app.accounting.mutual-settlement.tsx` | `/accounting/mutual-settlement` | «تسویهٔ متقابل» (:167) | admin/accountant :55-60 | ✅ :532 | ❌ | hub :159 | ❌ (hub only) |
| `_app.accounting.daily-capital.tsx` | `/accounting/daily-capital` | redirect → dynamic-capital (:13-15) | n/a | ❌ intentional (`registry.ts:504-507`) | ❌ | — | ❌ (intentional) |
| `_app.accounting.customer-capital-allocations.tsx` | — | redirect (:11-13) | n/a | ❌ intentional | ❌ | — | ❌ (intentional) |
| `_app.accounting.salesperson-capital-allocations.tsx` | — | redirect (:11-13) | n/a | ❌ intentional | ❌ | — | ❌ (intentional) |
| `_app.admin.asan-export.tsx` | `/admin/asan-export` | «خروجی برای آسان» workbench (:298) | `requireAnyRole(["admin","accountant"])` :94-96 | ✅ :807 (allowlist :1250) | ✅ `primary-modules.ts:193` | — | ✅ **YES** |
| `_app.admin.asan-import.tsx` | `/admin/asan-import` | «ورود اطلاعات از آسان» (:140) | admin/accountant :123-125 | ✅ :796 | ✅ :192 | — | ✅ **YES** |
| `_app.admin.documents.tsx` | `/admin/documents` | «مدیریت اسناد» بیجک/فاکتور/حواله (:95) | admin/manager :59-61 | ✅ :824 (adminOnly :830) | ✅ :195 | — | ✅ **YES** |
| `_app.admin.delivery-receipts.tsx` | `/admin/delivery-receipts` | «مدیریت رسیدهای تحویل» (:96) | admin/manager :59-61 | ✅ :833 | ✅ :196 | — | ✅ **YES** |
| `_app.admin.payment-terms.tsx` | `/admin/payment-terms` | «زمان‌های تسویه» (:201) | `requireAdmin()` :355-357 → **admin only** (`route-guards.ts:61`) | ✅ :879 adminOnly :885 | ✅ | — | ✅ YES — **⚠️ menu shows it to manager too (MISMATCH)** |
| `_app.admin.receipt-fields.tsx` | `/admin/receipt-fields` | «فیلدهای سفارشی فیش واریزی» (:233) | **no `beforeLoad` at all** (:40-42); in-component only :77 `admin\|\|accountant`, :108 `Navigate` to `/unauthorized` | ✅ :905 adminOnly :911 | ✅ :183 | — | ✅ YES — **⚠️ menu admin/manager vs page admin/accountant (MISMATCH); no route guard** |
| `_app.documents.tsx` | `/documents` | «اسناد» my documents + upload + pending panel (:56) | `requireAnyRole(ALL_ROLES)` :27-29 | ❌ **absent** (`grep -F '"/documents"'` → no match) | ❌ | collaboration hub card `_app.collaboration.tsx:85` | ❌ **NO** |
| `_app.delivery-receipts.tsx` | `/delivery-receipts` | «رسیدهای تحویل» (:62) | ALL_ROLES :30-32 | ❌ **absent** | ❌ | `_app.collaboration.tsx:76` | ❌ **NO** |
| `_app.operations.receipts.tsx` | `/operations/receipts` | «مرور فیش‌های OCR» (:100) | admin/manager :33-35 | ❌ **absent** | ❌ **absent** | **none — `grep -rn '"/operations/receipts"' src/` matches nothing outside the file itself** | ❌ **TYPED URL ONLY** |
| `_app.knowledge_.$documentId.tsx` | `/knowledge/$documentId` | KB viewer | `requirePermission("knowledge","view")` :24-26 | — | — | dynamic detail | ❌ (expected) |

### The two classes of orphan

**Class 1 — not in the registry at all (3 routes):** `/operations/receipts` (worst case: zero
inbound links anywhere in `src/`), `/documents` (only via `/collaboration`), `/delivery-receipts`
(only via `/collaboration`).

**Class 2 — in the registry but on no menu (the larger class).** `primary-modules.ts:148` reads
`paths: ["/accounting/receipts/create"]` and that is the **entire** finance path list, so **all
twelve other `/accounting/*` registry entries are absent from the sidebar.** Eight are recovered by
the FinanceHub card grid. **Four are recovered nowhere:** `/accounting/receipts`,
`/accounting/receipts/training`, `/accounting/payment-vouchers`, `/accounting/external-parties`.
They remain findable only through global search and pinning (`selectors.ts:55-65`).

Quick access includes `/accounting/receipts` for an **accountant** (`AppSidebar.tsx:52-57`), but
quick access for **admin and manager contains no accounting path at all** (`AppSidebar.tsx:35-50`).
**So for the owner signed in as admin, the whole finance module is one button («مرکز مالی») plus
the hub grid.**

### What it costs to wire one route

A seed is six fields, four mandatory. Verbatim, `registry.ts:483-489`:

```ts
{
  to: "/accounting/treasury",
  label: "خزانه و ماندهٔ صندوق",
  icon: Wallet,
  module: "accounting",
  group: "finance",
},
```

Optional: `subgroup`, `adminOnly`, `allowedRoles`, `hiddenFromMenu` (`types.ts:49-64`). Derived by
`toNavigationEntry` (`registry.ts:1310-1336`); `ROLE_ALLOWLIST_BY_ROUTE` at :1224-1294. Three
steps: (1) a ~6-line seed in `NAVIGATION_SEEDS`; (2) if the route guard is narrower than the module
permission, a `ROLE_ALLOWLIST_BY_ROUTE` line (per the file's own comment, :1218-1223); (3) **add the
path to `PRIMARY_MODULES.paths` in `primary-modules.ts` or the link still will not render.**
Optionally a `HubItem` in `FinanceHub.tsx:97-182`.

---

## 6. Contradictions between agents, and how they were resolved

### C-1 — Is `/accounting/receipts` on the sidebar menu? → **Resolved in Agent A's favour: NO**

- **Agent C wrote:** "Menu entry `registry.ts:431-436` `to:"/accounting/receipts"`
  `label:"فیش‌های واریزی"` `group:"finance"` → sidebar group label «مالی و حسابداری»
  (`nav-items.ts:38`)", and built a click path beginning
  «منوی کناری > مالی و حسابداری > فیش‌های واریزی».
- **Agent A proved** the sidebar renders `itemsForModule(activeModule, visible)`
  (`AppSidebar.tsx:102-105`), which **intersects** the role-visible registry with a
  hand-maintained path list (`primary-modules.ts:245-257`), matching **exactly, not by prefix**
  (:41, :253-256). The finance module's path list is `["/accounting/receipts/create"]` — one entry
  (`primary-modules.ts:148`).
- **Resolution: A wins. A read `primary-modules.ts`; C did not.** Both of C's cited facts are true
  — the seed exists at `registry.ts:431` and the group is labelled «مالی و حسابداری» — but they
  are the *first* of two required layers. C inferred a rendered link from a registry seed alone.
  **A registry seed is necessary but not sufficient.**
- **Why C got `/admin/asan-export` right and `/accounting/receipts` wrong:** C never checked the
  second layer either time. `/admin/asan-export` happens to *also* be in the admin path list
  (`primary-modules.ts:193`), so C's conclusion was accidentally correct there. The one-layer method
  produces a right answer only by luck.
- **What changes because of this:** the answer to "is it reachable from the menu" flips for
  `/accounting/receipts` and, by the same mechanism, for eleven other `/accounting/*` routes. C's
  receipts click path in Q2 has been corrected above. **This is the single most consequential
  correction in this report.**
- **Preserved from C, not contradicted by A:** the mobile bottom nav entry «فیش‌ها» at
  `MobileBottomNav.tsx:33` is a *third* rendering surface. A did not examine `MobileBottomNav.tsx`,
  so this remains on C's evidence alone and has not been cross-checked.

### C-2 — Was `asan_list_journal_export` ever executed? → **B's "not verified" is superseded**

- **Agent B could not run it.** It is `SECURITY DEFINER` and raises **42501** when `auth.uid()` is
  NULL, which is the case under `psql -U supabase_admin`. B therefore quoted the function's
  behaviour from `pg_get_functiondef` and correctly filed it under "Not verified".
- **Agents D and E both ran it**, using a simulated admin JWT inside `BEGIN … ROLLBACK`:
  `SET LOCAL "request.jwt.claims" = '{"sub":"4084224a-cd34-4632-9cbc-3b5f3581cf6e","role":"authenticated"}'`
  followed by `SET LOCAL ROLE authenticated`. Both reported `uid_ok t, role_ok t`.
- **Resolution:** the technique difference is the whole explanation — `psql -U supabase_admin`
  alone cannot satisfy a `SECURITY DEFINER` function that reads `auth.uid()`. **B's item is
  superseded and removed from §7.**
- **Important nuance: B's static reading was confirmed correct.** D's and E's live runs reproduced
  exactly what B predicted from the function body — posted-only, both legs of a reversed pair
  excluded, every cheque document excluded, one row per journal line. **Only B's verification
  status changed; none of B's conclusions did.** The same applies to C's open question "whether
  `asan_list_journal_export` actually returns dual documents at runtime": **it does — 7 of 7, with
  zero attrition** (E's funnel).

### C-3 — Do D's and E's numbers agree? → **Yes, exactly, on every function**

D measured with the page's **default 90-day window**; E measured with a **wide 2020-2030 window**.
Every raw-row, document, and eligible-document count matches (full table in §4). Independent
corroboration from direct counts: `sq_accepted_last90 = 9 = total`, `purch_received_last90 = 303 =
total`, `je_posted_last90 = 45 = total`; every table's newest qualifying record is 2026-08-31.

**The agreement is itself a finding: the default date window is not hiding anything.** Two agents
using different methods, different windows, and different query sets produced identical numbers —
which both rules out the most popular hypothesis ("the 90-day default is too narrow") and raises
confidence in the shared PARTIAL verdict.

> **Corroboration.** Raw `psql` output from the session survives in the run scratchpad
> (`asan_counts.txt`, `run.txt`, `reasons.txt`, `acl.txt`, `e/out.txt`, timestamped 2026-09-03
> 13:30–13:34) and matches the reported numbers — `run.txt` shows the `BEGIN … ROLLBACK` block, the
> `window | 2026-06-05 | 2026-09-03` row, and `sales 9/9/0`, `purchase 303/303/3`,
> `bank_deposits 17/17/16`, `journal all 70/35/33`, `payment 20/10/10`, `receipt 32/16/15`,
> `third_party 14/7/7`; `asan_counts.txt` shows `asan_person_codes | 16` and
> `je_doc_kind_distinct | dual,other,payment,receipt`. **The agents' reports remain the evidence of
> record**; these files are only a consistency check, and they are temporary session artefacts that
> will not persist.

### C-4 — Is `purchase_settlement` "structurally empty" or "correctly empty"? → **E's framing**

D called it "structurally empty — no `doc_kind` in the DB can ever satisfy its filter"; E called it
"CORRECT not a bug — `mutual_settlements` has 0 rows and no `doc_kind='purchase_payment'` exists".
Same measurement, different framing. **E is the precise one:** the predicate is satisfiable in
principle; the upstream features simply write no such rows today. This matters for the
recommendations — it is not a code fix.

### C-5 — Does the frontend hide blocked rows? → **E's open question, answered by D**

E filed "whether the frontend filters out blocked rows before rendering" as unverified. D answered
it from the code: **it does not.** `groupInvoiceRows`, `groupJournalRows`, and
`groupBankDepositRows` only group; blocked documents are kept with a `blockedReason`. What changes
is the **button**, which disables on `selectedEligibleCount === 0` (:361, :369). **Removed from
§7.**

### C-6 — `journal_entries` as an incomplete register → **reconciled, not contradicted**

B observed 24 receipt journal entries against 28 `payment_receipts` rows and called the ledger an
incomplete day register without explaining the gap. E's independent counts explain it exactly
(arithmetic shown in §2). The two agents do not disagree; the integration supplies the missing
step and **strengthens** B's design conclusion.

### Minor, non-substantive

Agent A cites the payment-vouchers seed at `registry.ts:491`; Agent C cites `registry.ts:495-501`
for the same seed's label. A cites the seed start, C a line within it — **not a contradiction.**
D's "there are SEVEN options, not six" is consistent with B's independent enumeration of
`ASAN_EXPORT_ORDER` (`export-registry.ts:35-43`).

---

## 7. Not verified — merged across all five agents, deduplicated

Superseded items (B's un-run RPC, C's dual-at-runtime question, E's frontend-filtering question)
have been removed per §6 and are **not** repeated here.

**Runtime / browser — nothing below was confirmed in a running app.**
- No agent ran the application, started a dev server, or clicked anything. No `bun run build`, no
  `npx tsc --noEmit`, no `npm run lint`. There is no test script in this project.
- Runtime visibility of any menu entry **per role** is unconfirmed. `role_permissions` rows
  override the static matrix at runtime; the registry's own comment (:1227-1229) says the
  accounting module has zero `role_permissions` rows today, and **that was not confirmed against
  the database.**
- Whether the owner's browser session actually held `admin` or `accountant` when the Asan export
  appeared empty.

**Code not fully read.**
- `search.ts`, `metadata.ts`, `needs-action.ts` were not read in full.
- Dashboard-widget and notification deep links were not audited — a route marked "no inbound link"
  here could still be linked from one of those.
- `MobileBottomNav.tsx` was cited by C but not cross-checked by A (see C-1).
- Rows 470-694 of `_app.admin.asan-export.tsx` were not read line by line (nothing in 1-470 filters
  documents, and the grouping helpers do not).
- Whether any export path exists **outside `src/`**.

**Asan export — untested paths.**
- **The download path was never exercised**: `asan_assign_document_numbers` and
  `downloadAsanWorkbook` were inspected only for whether they gate *listing* (they do not). No
  workbook was generated and no Asan document number was assigned.
- Whether PostgREST `db-max-rows` truncates the 303-row purchase response. (It cannot cause
  emptiness, only truncation.)
- Why the two `doc_kind='other'` / `source_type='manual'` journal entries were created that way.

**Data semantics / product decisions.**
- Whether an accountant *wants* unposted or draft documents in a unified register — a product
  decision, not a technical one.
- Whether `document_channel = NULL` on 14 receipts is intentional long-term.
- Cheque-channel dual documents, and whether `dual_documents` should carry a channel column at all.
- Where a dual document's **detail** page should live (none exists).
- Whether `payment_receipts` rows are also written by `create_payment` / `create_dual_document` as
  a side effect.
- `sales_quotes.status` and `purchases.status` have **no CHECK constraint**, so their value sets
  are observed-only and could contain values not seen today.

**Production.** Deliberately never contacted. Every count in this report is from the test database.

---

## 8. کارهای پیشنهادی

مرتب‌شده بر اساس ارزش. برای هر مورد: نوع کار (ورود اطلاعات / اصلاح اتصال / ساخت) و اندازهٔ کار.

> نکتهٔ اصلی: **گران‌ترین مشکل این ماژول کد نیست، داده است.** چهار تا از هفت نوع خروجی همین امروز
> درست کار می‌کنند؛ دو تای دیگر فقط به این دلیل خالی‌اند که «کد آسان» طرف حساب ثبت نشده است.

---

**۱. ثبت «کد آسان» برای مشتریان و تأمین‌کنندگان**
**نوع: ورود اطلاعات (DATA ENTRY) · اندازه: متوسط (medium)**

پوشش فعلی: از ۸۶ شخص فقط **۱۶** کد آسان دارند؛ از ۱۵ تأمین‌کننده فقط **۲**؛ حساب‌های بانکی ۲ از ۲
کامل‌اند.

اثر مستقیم: از ۹ پیش‌فاکتور «فروش»، **۸ تا فقط به همین دلیل** خروجی نمی‌گیرند. چون ۷ تا از همان ۹ تا
«ثبت شد در حسابداری» خورده‌اند و ۶ تا هم موجودی‌شان کسر شده، به‌محض ثبت کد آسان بیشترشان بلافاصله
قابل خروجی می‌شوند. یک سند «دریافت» («مشتری آزمایشی 17») و یک «واریزی بانکی»
(«پرداخت‌کنندهٔ آزمایشی 7») هم با همین کار آزاد می‌شوند.

مشتریان مسدودشدهٔ شناسایی‌شده: «شخص آزمایشی 20»، «محمدرضا تست 2»، «شخص آزمایشی 1»،
«مشتری آزمایشی 42»، «مشتری آزمایشی 5»، «مشتری آزمایشی 18».

**بالاترین نسبت «اثر به تلاش» در کل این گزارش. هیچ خط کدی لازم ندارد.**

---

**۲. وصل کردن ۲۸۷ سند خرید به تأمین‌کننده**
**نوع: ورود اطلاعات (DATA ENTRY) · اندازه: بزرگ (large)**

۲۸۷ سند از ۳۰۳ سند خرید، هم `supplier_id` و هم `supplier_person_id` آن‌ها خالی است — به همین دلیل
در فهرست خروجی با طرف حساب «؟» و پیام «کد آسان برای تأمین‌کننده «…» ثبت نشده است» مسدود می‌شوند.

این مشکل با کار شمارهٔ ۱ حل **نمی‌شود**: اول باید سند به یک تأمین‌کننده وصل شود، بعد آن تأمین‌کننده کد
آسان بگیرد. کار بزرگی است و احتمالاً به یک تصمیم کاری نیاز دارد (آیا این ۲۸۷ سند اصلاً داده‌ی
واقعی‌اند یا دادهٔ آزمایشی).

---

**۳. گذاشتن محافظ مسیر روی `/admin/receipt-fields`**
**نوع: اصلاح اتصال (WIRING FIX) · اندازه: کوچک (small)**

این مسیر **هیچ `beforeLoad` ندارد** (`_app.admin.receipt-fields.tsx:40-42`) و کنترل دسترسی فقط
داخل کامپوننت انجام می‌شود (:77 و :108). این با قاعده‌های ۶ و ۷ فایل `CLAUDE.md` مغایر است
(«اجازه‌دهی فقط در سمت رابط کاربری قابل قبول نیست»).

ضمناً دو ناسازگاری نقش وجود دارد که باید هم‌زمان دیده شود:
- `/admin/receipt-fields`: منو آن را به admin/manager نشان می‌دهد، صفحه admin/accountant را
  می‌پذیرد.
- `/admin/payment-terms`: صفحه `requireAdmin()` است (`route-guards.ts:61`) ولی منو آن را به manager
  هم نشان می‌دهد.

---

**۴. افزودن مسیرهای مالی به فهرست کناری**
**نوع: اصلاح اتصال (WIRING FIX) · اندازه: کوچک (small)**

در `primary-modules.ts:148` فهرست مسیرهای ماژول مالی فقط **یک** عضو دارد
(`/accounting/receipts/create`). به همین دلیل دوازده مسیر `/accounting/*` دیگر — با اینکه در
`registry.ts` ثبت شده‌اند — در فهرست کناری دیده نمی‌شوند.

هشت‌تای آن‌ها با کارت‌های «مرکز مالی» جبران می‌شوند، ولی **چهار مسیر هیچ راه ورودی ندارند**:
`/accounting/receipts`، `/accounting/receipts/training`، `/accounting/payment-vouchers`،
`/accounting/external-parties`.

مهم‌ترینشان `/accounting/receipts` و `/accounting/payment-vouchers` هستند: تنها فهرست‌های موجود برای
اسناد «دریافت» و «پرداخت». برای مالکی که با نقش admin وارد می‌شود، دسترسی سریع هیچ مسیر مالی ندارد
(`AppSidebar.tsx:35-50`) و کل ماژول مالی یک دکمه («مرکز مالی») است.

⚠️ فقط افزودن seed به `registry.ts` کافی **نیست** — مسیر باید به `PRIMARY_MODULES.paths` هم اضافه شود،
وگرنه لینک اصلاً رندر نمی‌شود.

---

**۵. اصلاح مقصد اشتباه پس از ثبت «سند دوبل»**
**نوع: اصلاح اتصال (WIRING FIX — یک ایراد واقعی) · اندازه: کوچک (small)**

در `DocumentWizard.tsx:437-441` فقط شاخهٔ `payment` به `/accounting/payment-vouchers` می‌رود و بقیه
— از جمله «سند دوبل» — به `/accounting/receipts` هدایت می‌شوند. آن صفحه از جدول `payment_receipts`
می‌خواند، پس سندی که تازه ساخته شده **اصلاً نمی‌تواند آنجا دیده شود**. کاربر سند را ثبت می‌کند و روی
صفحه‌ای می‌افتد که سندش در آن نیست.

راه‌حل کامل، مقصد گرفتن «دفتر اسناد» (کار شمارهٔ ۶) است.

---

**۶. ساخت صفحهٔ «دفتر اسناد» در مسیر `/accounting/documents`**
**نوع: ساخت (BUILD) · اندازه: کوچک (گزینهٔ A) تا متوسط (گزینهٔ B)**

تنها پاسخ واقعی به پرسش اول: صفحه‌ای که «دریافت» و «پرداخت» و «سند دوبل» را با هم، با فیلتر تاریخ و
انتخاب‌گر نوع سند نشان بدهد. امروز چنین صفحه‌ای وجود ندارد و «سند دوبل» اصلاً هیچ فهرستی ندارد.

کوئری اتحاد (UNION) آن **آزمایش و تأیید شده** و دسترسی‌های RLS از قبل دقیقاً همان مخاطب درست را
اجازه می‌دهند (admin/manager/accountant). فیلترها: «از تاریخ» / «تا تاریخ» و انتخاب‌گر
«همه / دریافت / پرداخت / سند دوبل» به‌همراه میان‌بر «امروز».

- گزینهٔ **A** (بدون مهاجرت، سمت کلاینت): کوچک، حدود نصف روز.
- گزینهٔ **B** (یک RPC با `SECURITY DEFINER`، مهاجرت ۴۲۲): متوسط، حدود یک روز — **پیشنهاد می‌شود**.
  در همان مهاجرت، ایندکس نبودهٔ `payment_receipts(payment_date)` هم اضافه شود.

این صفحه نباید روی صفحات موجود سوار شود (تعارض با قاعدهٔ ۱۵ فایل `CLAUDE.md`؛ دلایل کامل در بخش ۲).

---

**۷. افزودن گزینهٔ «همه» به «نوع خروجی» در صفحهٔ خروجی آسان**
**نوع: اصلاح اتصال (WIRING FIX) · اندازه: کوچک (small)**

دو سند ثبت‌شده (`doc_kind='other'`) در هیچ‌کدام از تب‌های صفحه دیده نمی‌شوند، چون به
`dkind='unclassified'` نگاشت می‌شوند و هیچ `_filter`ی که صفحه می‌فرستد با آن نمی‌خورد.

خودِ تابع دیتابیس `_filter='all'` را می‌پذیرد و نوع TypeScript هم آن را دارد
(`export-journal.ts:28-34`)، ولی هیچ تعریف خروجی‌ای از آن استفاده نمی‌کند. یعنی امکانش ساخته شده و
وصل نشده است.

---

**۸. دکمهٔ «خروجی اکسل» برای اسناد پرداخت**
**نوع: ساخت (BUILD) · اندازه: کوچک (small)**

صفحهٔ `/accounting/payment-vouchers` هیچ دکمهٔ خروجی ندارد. تنها راه گرفتن خروجی از اسناد پرداخت،
صفحهٔ آسان است که (الف) فقط برای admin و accountant باز است و (ب) هر فایل فقط یک سند دارد.

**نتیجه: کاربری با نقش manager با اینکه هر سه جدول را می‌تواند بخواند، هیچ راهی برای گرفتن خروجی از
اسناد پرداخت و اسناد دوبل ندارد.**

اگر «دفتر اسناد» (کار ۶) ساخته شود، منطقی‌تر است دکمهٔ خروجی روی همان صفحه و برای هر سه نوع سند
گذاشته شود.

---

**۹. تعیین تکلیف گزینهٔ «خروجی آسان» در صفحهٔ فیش‌های واریزی**
**نوع: اصلاح اتصال (WIRING FIX) · اندازه: کوچک (small)**

در `/accounting/receipts` انتخاب‌گر «حالت خروجی» دو گزینه دارد: «خروجی معمولی» و «خروجی آسان». گزینهٔ
دوم **عمداً هیچ فایلی تولید نمی‌کند** و خطای `AsanLayoutNotConfiguredError` می‌دهد
(`_app.accounting.receipts.tsx:180-182`). یا باید قالبش تعریف شود یا گزینه از فهرست برداشته شود؛
گزینه‌ای که همیشه شکست می‌خورد بدترین حالت است.

---

**۱۰. تعیین تکلیف `/operations/receipts`**
**نوع: اصلاح اتصال (WIRING FIX) · اندازه: کوچک (small)**

«مرور فیش‌های OCR» — نه در `registry.ts` است، نه در `primary-modules.ts`، و **هیچ لینکی در کل `src/`
به آن نمی‌رسد**. فقط با تایپ مستقیم آدرس باز می‌شود. یا باید به منو وصل شود یا بازنشسته شود.
(مسیرهای `/documents` و `/delivery-receipts` هم در `registry.ts` نیستند و تنها ورودی‌شان کارت‌های
صفحهٔ `/collaboration` است — وضعیتشان بهتر ولی هنوز شکننده است.)

---

**نکته دربارهٔ اولویت‌ها:** هیچ‌کدام از موارد بالا ساختن چیزی که از قبل وجود دارد نیست. فهرست
«دریافت» و فهرست «پرداخت» ساخته شده‌اند و فقط به منو وصل نیستند (کار ۴)؛ آنچه واقعاً وجود ندارد
فهرست «سند دوبل» و صفحهٔ یکپارچهٔ اسناد است (کار ۶).

---

## Status

All three questions have a verdict backed by evidence:

- **Q1 — DOES NOT EXIST** (no unified register; `dual_documents` has no list page at all; the
  existing partial lists are not on any menu).
- **Q2 — receipts have a general Excel export; payments and dual documents have Asan-only, one
  document per file, admin/accountant only.**
- **Q3 — PARTIAL** (4 of 7 types work; sales and purchase are data-blocked on missing
  `asan_person_code`; `purchase_settlement` is correctly empty; 2 documents are unreachable via any
  `_filter` the page sends).

This report is COMPLETE.
