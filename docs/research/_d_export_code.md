# Sub-agent D — the export code path (`src/`)

**Scope:** every export feature reachable from `src/`, with emphasis on which ones carry
receipt data into the Asan file. Research only — nothing was executed, no export was run,
no dev server was started, no database was touched. Only this file was written.

**Code state:** branch `staging`, HEAD `99f6bd58`.

---

## HEADLINE FINDINGS (read these before the detail)

1. **There is no single "Asan file". There are four distinct Asan layouts and six export
   types**, all served by one admin page (`/admin/asan-export`), plus a seventh
   single-document Asan export on the quote detail page.
2. **Two of them carry receipt data, and they carry *different* fields:**
   * **`bank_deposits`** (Layout 4, 6 Latin columns) reads **`payment_receipts` directly**.
     It is the only export that touches the receipt table for Asan purposes.
   * **`receipts` / `third_party`** (Layout 3, 6 Persian columns) read **`journal_entries` /
     `journal_lines`** — the internal ledger — and reach receipt columns only through the
     description-enrichment sub-query added by migration 320.
3. **The prior conclusion that 23 fields "land in a column and stop there" is wrong for at
   least three fields.** `description` (#19), `payment_time` (#18) and
   `is_mobile_bank_screenshot` (#31) were all classed dead; all three reach a produced
   file. `description` reaches the **Asan** file. See D6.
4. **`payer_accounting_code` (#7) and `receiver_accounting_code` (#13) — which the prior map
   lists among the 8 "live" fields — do NOT appear in any Asan file.** They reach
   `journal_entries` header columns that no export function selects, and migration 295
   contains a hard gate that *forbids* `payer_accounting_code` from ever becoming the Asan
   person-code source. They are ledger-live and export-dead.
5. **`receiver_party_id` (#10) routes a receipt between two different export files**, because
   an `external_party` line flips the document's `doc_kind` from `receipt` to `third_party`.
6. **The "خروجی آسان" option on the receipts list page is a deliberate refusal.** It throws
   `AsanLayoutNotConfiguredError` and produces no file. Anyone reading only that page would
   conclude no Asan export exists. It does — on a different page, in a different module.

---

## D1 — EVERY EXPORT ENTRY POINT

### Family A — the Asan bridge (`src/lib/asan/`, 19 files)

One shared shell renders all six. The shell knows nothing about layouts; it takes a
definition out of `ASAN_EXPORTS` and writes what the definition builds
(`src/routes/_app.admin.asan-export.tsx:70-91`).

| # | Key | Persian label | Layout | Cols | Source | Receipt-related? |
|---|---|---|---|---|---|---|
| A1 | `sales` | فاکتورهای فروش | 1 (sales) | 18 | RPC `asan_list_sales_export` | No |
| A2 | `purchase` | فاکتورهای خرید | 2 (purchase) | 18 | RPC `asan_list_purchase_export` | No |
| A3 | `receipts` | دریافت‌ها و واریزها | 3 (journal) | 6 | RPC `asan_list_journal_export(_filter='receipt')` | **YES — indirect, via the posted ledger** |
| A4 | `payments` | پرداخت‌ها و برداشت‌ها | 3 (journal) | 6 | same RPC, `_filter='payment'` | No (payment vouchers) |
| A5 | `third_party` | اسناد شخص ثالث (دوبل) | 3 (journal) | 6 | same RPC, `_filter='third_party'` | **YES — a mode-2 receipt lands here, not in A3** |
| A6 | `bank_deposits` | واریزیهای بانکی (مسیر جایگزین) | 4 (bank deposit) | 6 | RPC `asan_list_bank_deposit_export` | **YES — reads `payment_receipts` directly** |

Registry: `src/lib/asan/export-registry.ts:22-40`. Definitions:
`export-sales.ts:42-55`, `export-purchase.ts`, `export-journal.ts:74-96`,
`export-bank-deposit.ts:40-53`.

A3, A4 and A5 are deliberately **one builder with three filters**, not three exports
(`src/lib/asan/export-journal.ts:1-12`, `:48-67`).

| # | Feature | Where | Receipt-related? |
|---|---|---|---|
| A7 | Single pre-invoice Asan export (`downloadSingleQuoteExport`) | `src/lib/asan/export-single-quote.ts:74-91`, invoked at `src/routes/_app.sales.quotes.$quoteId.tsx:641` | No — reuses Layout 1 and the same sales RPC |

### Family B — the receipts-list Excel export (NOT an Asan layout)

| # | Feature | Where | Receipt-related? |
|---|---|---|---|
| B1 | «خروجی اکسل» on `/accounting/receipts` — standard mode | handler `src/routes/_app.accounting.receipts.tsx:124-249`; row mapping `src/lib/export/receipt-export-rows.ts:73-112` | **YES — reads `payment_receipts` directly, 26 Persian columns** |
| B2 | Same button with «جزئیات ردیف کالا» ticked | `receipt-export-rows.ts:128-167`; line query `_app.accounting.receipts.tsx:184-223` | **YES — the same 26 columns + 6 product columns** |
| B3 | Same button with mode = «خروجی آسان» | `_app.accounting.receipts.tsx:177-179` | **Produces NO FILE.** Throws `AsanLayoutNotConfiguredError` (`src/lib/export/export-modes.ts:69-78`, `:107-119`). All five adapters in `ASAN_ADAPTERS` are `isConfigured: false` (`export-modes.ts:122-128`) |

B3 is a stale seam. Its doc comment (`export-modes.ts:88-105`, dated 2026-08-04) states that
no verified Asan layout exists — which was true then and is no longer true: `src/lib/asan/`
was built afterwards and ships four verified layouts. The two modules do not reference each
other. `UNCERTAIN` whether the owner knows the receipts page still offers a mode that
refuses.

### Family C — exports with no receipt content (listed for completeness, not analysed)

| Feature | File:line |
|---|---|
| Product catalog Excel | `src/lib/export/product-catalog-excel.ts:60-79` (`products-<stamp>.xlsx`) |
| Sale price-list Excel | `src/lib/export/sale-price-list-excel.ts:83-103` (`sale-price-list-<stamp>.xlsx`) |
| Dynamic data-table CSV | `src/lib/data-tables/csv-export.ts:73-77` (no receipt reference — grep for `receipt` returns 0 hits) |
| Pricing workbench CSV | `src/lib/pricing/workbench-csv.ts:23-27` |
| Owner-attention CSV | `src/routes/_app.pricing.owner-attention.tsx:101-105` |
| Customers CSV | `src/routes/_app.sales_.customers.tsx:156-161` |
| Price-history chart PNG | `src/hooks/pricing/useChartExport.ts:40-47`, `:72` |
| Quote PDF | `src/lib/sales/quote-pdf.ts:365-368` |
| Sale-list PDF / HTML | `src/lib/pdf/sale-list-pdf.ts:622-623`, `:736-739` |

`src/components/accounting/PaymentReceiptDocuments.tsx` matched the `xlsx` probe only because
`"xlsx"` is in its upload **allowlist** (`:85`, `:101`, `:145`). It is an import/attachment
path, not an export.

---

## D2 — EXACT OUTPUT SHAPE PER EXPORT

Headers are reproduced verbatim from the constants; those arrays **are** the contract
(`src/lib/asan/layouts.ts:1-17`).

### A6 — `bank_deposits`, Layout 4 «واریزیهای بانکی» — 6 columns, ONE ROW PER RECEIPT

Headers, in file order — `src/lib/asan/layouts.ts:74-81`. Latin, reproduced as the Asan
screen writes them, not translated and not spell-corrected.

| Col | Header (verbatim) | Filled by | Kind | file:line |
|---|---|---|---|---|
| A | `Date` | `isoToJalaliAsan(r.doc_date)` | **Jalali date conversion.** ISO → `YYYY/MM/DD`, four-digit year, zero-padded, **Latin digits** — `1405/05/12`. Deliberately *not* `isoToJalaliDisplay`, which emits Persian digits | `export-bank-deposit-rows.ts:37`; converter `dates.ts:28-34` |
| B | `Code_M` | `r.person_code ?? ""` | **Lookup, two-step.** `person_identifiers.value_normalized` where `kind='asan_person_code'`, person resolved as `COALESCE(pr.customer_person_id, (SELECT c.person_id FROM customers c WHERE c.id = pr.customer_id))` | `export-bank-deposit-rows.ts:38`; source `supabase/migrations/20260805153000_295_asan_bank_deposit_export_source.sql:74-80` |
| C | `Name_Moshtari` | `r.party_name ?? ""` | **Direct**, trimmed: `COALESCE(NULLIF(btrim(pr.payer_name), ''), '')` | `export-bank-deposit-rows.ts:39`; migration 295 `:71` |
| D | `Shomare_Peygiri` | `r.tracking_number ?? ""` | **Direct**, trimmed: `NULLIF(btrim(pr.tracking_number), '')` | `export-bank-deposit-rows.ts:40`; migration 295 `:72` |
| E | `Mablagh` | `tomanStringToRial(r.amount)` | **Computed — Toman × 10.** Written as a real number, never a formatted string. Throws `AmountConversionError` on a non-integer rather than rounding | `export-bank-deposit-rows.ts:41`; `amounts.ts:45-61` |
| F | `Bank_cod` | `r.bank_code ?? ""` | **Lookup.** `NULLIF(btrim(ba.accounting_code),'')` for `ba.id = pr.destination_bank_account_id` | `export-bank-deposit-rows.ts:42`; migration 295 `:81-82` |

`bank_title` and `blocked_reason` are returned by the RPC but **are not columns** — they feed
the preview table and the blocking gate only (`export-bank-deposit-rows.ts:47-59`).

### A3 / A4 / A5 — Layout 3 «سند حسابداری» — 6 columns, ONE ROW PER JOURNAL LINE

Headers — `src/lib/asan/layouts.ts:64-71`.

| Col | Header (verbatim) | Filled by | Kind | file:line |
|---|---|---|---|---|
| A | `کد حساب` | `r.account_code ?? ""` | **Lookup, branching on `journal_lines.account_kind`** — see the table below | `export-journal-rows.ts:85`; resolver `migrations/…320….sql:143-170` |
| B | `کد کالا` | `r.product_code ?? ""` | **Hardcoded empty.** The RPC selects `NULL::text` for this position — a financial line carries no product | `export-journal-rows.ts:86`; `320:247` |
| C | `شرح` | `r.line_description ?? ""` | **Computed, staged concatenation — the load-bearing column.** See below | `export-journal-rows.ts:87`; `320:249-256` |
| D | `تعداد` | `num(r.quantity)` | **Hardcoded empty.** RPC selects `NULL::numeric` | `export-journal-rows.ts:88`; `320:259` |
| E | `بدهکار` | `amountCell(r.debit)` | **Computed — `journal_lines.debit` × 10.** A zero is written as an **empty cell, not `0`**, because Asan's «بدون مبلغ حذف شود» is ticked by default and drops zero-amount rows | `export-journal-rows.ts:89`; `:60-63` |
| F | `بستانکار` | `amountCell(r.credit)` | Same, `journal_lines.credit` × 10 | `export-journal-rows.ts:90` |

**`شماره سند` is not a column** — Asan takes it on screen, which is why each file holds exactly
one document (`export-journal-rows.ts:79-80`, enforced at `_app.admin.asan-export.tsx:221-227`).

Column A resolution by `account_kind` (`320:143-170`):

| `account_kind` | Resolves to |
|---|---|
| `customer_credit` | `person_identifiers.value_normalized` (`kind='asan_person_code'`) joined `customers.person_id`, `customers.id = jl.account_ref_id` |
| `bank` | `bank_accounts.accounting_code` for `jl.account_ref_id` |
| `external_party` | `external_parties.accounting_code` |
| `supplier_payable` | `suppliers.accounting_code`, falling back to the person identifier |
| anything else | `asan_control_accounts.accounting_code` by `account_kind`; `clearing` and `other` have no row → NULL → **the whole document is blocked** |

Column C, for a document whose `source_type = 'payment_receipt'` (`320:103-108`):

```sql
SELECT concat_ws(' — ',
         'واریز از «' || COALESCE(NULLIF(btrim(pr.payer_name), ''), '؟') || '»',
         NULLIF('پیگیری ' || btrim(COALESCE(pr.tracking_number, '')), 'پیگیری '),
         NULLIF(btrim(COALESCE(pr.description, '')), ''))
  FROM public.payment_receipts pr WHERE pr.id = e.source_id
```

then wrapped in a five-stage fallback that can never produce an empty cell (`320:249-256`):

```sql
COALESCE(
  NULLIF(btrim(concat_ws(' — ',
    NULLIF(btrim(COALESCE(enr.rich, '')), ''),
    NULLIF(btrim(COALESCE(l.ldesc, '')), ''))), ''),
  NULLIF(btrim(COALESCE(l.ldesc,  '')), ''),
  NULLIF(btrim(COALESCE(e.edesc,  '')), ''),
  NULLIF(btrim(COALESCE(l.aname,  '')), ''),
  'سند حسابداری')
```

**This is the mechanism by which `payer_name`, `tracking_number` and `description` reach the
Asan file.** Each fragment is individually guarded, so a receipt with a blank `description`
contributes nothing rather than leaving a dangling separator.

> **Discrepancy, recorded not resolved.** The migration's own WHY block (`320:20`) advertises
> the example «واریز از «رضا احمدی» — پیگیری 12345 — بابت پیش‌فاکتور ۱۲», implying an invoice
> reference. The shipped SQL (`320:104-108`) has **only three fragments**, and the third is
> `pr.description` — free text. Nothing joins `payment_receipt_links` or `sales_quotes`. So
> «بابت پیش‌فاکتور …» only appears if a human typed it into `description`. `UNCERTAIN` whether
> the comment is aspirational or the implementation is incomplete; either way it makes
> `description` (#19) more load-bearing, not less.

`description_quality` (`rich` | `simple`, `320:257-258`) is **not a column** — it drives the
«شرح ساده» badge in the preview (`_app.admin.asan-export.tsx:509-517`).

### A1 / A2 / A7 — Layouts 1 & 2, 18 columns (not receipt-related; recorded for D5)

`layouts.ts:20-39` (sales) and `:42-61` (purchase). Identical except I, J, K. Mapping at
`export-invoice-rows.ts:99-125`. Column A is the **assigned Asan number**, not a source value.
Columns M, O, P are **hardcoded `null`** with stated reasons (`export-invoice-rows.ts:118-121`).
Sales column K is an **intentionally blank header string** that must keep its position
(`layouts.ts:31`, `write-xlsx.ts:4-9`).

### B1 — receipts-list standard Excel — 26 columns, ONE ROW PER RECEIPT

`src/lib/export/receipt-export-rows.ts:83-110`. Emitted in object-literal order via
`XLSX.utils.json_to_sheet` (`_app.accounting.receipts.tsx:229`), so key order **is** column
order. This file is explicitly frozen — "a VERBATIM move of the mapping that shipped before
this phase … must not be 'improved'" (`receipt-export-rows.ts:10-14`).

| # | Header (verbatim) | Source expression | Kind | file:line |
|---|---|---|---|---|
| 1 | `تاریخ ثبت (شمسی)` | `isoToJalaliDisplay(r.created_at?.slice(0,10))` | Jalali, **Persian digits** | `:84` |
| 2 | `تاریخ فیش (شمسی)` | `isoToJalaliDisplay(r.payment_date)` | Jalali, Persian digits | `:85` |
| 3 | `ساعت فیش` | `r.payment_time?.slice(0,5) ?? ""` | Truncation to `HH:MM` | `:86` |
| 4 | `ثبت‌کننده (کاربر)` | `(r.created_by && creatorMap.get(r.created_by)) \|\| "—"` | **Lookup** into a batched `profiles` query | `:87`; map built `_app.accounting.receipts.tsx:158-173` |
| 5 | `مشتری مرتبط` | `r.customer?.name ?? "—"` | **Join** `customers` | `:88` |
| 6 | `تلفن مشتری` | `r.customer?.phone ?? ""` | Join | `:89` |
| 7 | `کد آسان مشتری` | `r.customer?.accounting_code ?? ""` | Join | `:90` |
| 8 | `واریزکننده (نام)` | `r.payer_name` | Direct | `:91` |
| 9 | `واریزکننده (تلفن)` | `r.payer_phone ?? ""` | Direct (stored value is trigger-normalised) | `:92` |
| 10 | `واریزکننده (کد آسان)` | `r.payer_accounting_code ?? ""` | Direct | `:93` |
| 11 | `بانک مبدأ` | `r.source_bank ?? r.bank_name ?? ""` | **Two-level fallback** — this is the only output that reveals `bank_name` | `:94` |
| 12 | `گیرنده` | `receiverTarget` | **Three-way computed** (below) | `:95`; computed `:78-82` |
| 13 | `گیرنده (نام روی فیش)` | `r.receiver_name` | Direct. NB the header says «روی فیش» but the value is `receiver_name`, **not** `receiver_name_on_receipt` — that column is not exported at all | `:96` |
| 14 | `گیرنده (تلفن)` | `r.receiver_phone ?? ""` | Direct | `:97` |
| 15 | `گیرنده (کد آسان)` | `r.receiver_accounting_code ?? ""` | Direct | `:98` |
| 16 | `بانک مقصد` | `r.destination_bank ?? ""` | Direct | `:99` |
| 17 | `مبلغ (تومان)` | `Number(r.amount)` | Numeric coercion. **Toman — no ×10**, unlike every Asan layout | `:100` |
| 18 | `شماره پیگیری` | `r.tracking_number` | Direct | `:101` |
| 19 | `نوع فیش` | `receiptTypeLabel(r.receipt_type)` | **Lookup** in `RECEIPT_TYPE_FA`, falling through to the raw value | `:102`; `src/lib/receipts/receipt-types.ts:34-35` |
| 20 | `رسید اسکرین‌شات همراه بانک` | `r.is_mobile_bank_screenshot ? "بله" : "خیر"` | **Boolean → Persian literal** | `:103` |
| 21 | `وضعیت` | `RECEIPT_STATUS_FA[r.status] ?? r.status` | Lookup | `:104`; dict `:17-21` |
| 22 | `وضعیت ثبت سند` | `r.posting_status ?? ""` | Direct, **raw English enum, not translated** | `:105` |
| 23 | `تاریخ ثبت سند (شمسی)` | `r.posted_at ? isoToJalaliDisplay(r.posted_at.slice(0,10)) : ""` | Conditional Jalali | `:106` |
| 24 | `علت رد` | `r.rejection_reason ?? ""` | Direct | `:107` |
| 25 | `توضیحات` | `r.description ?? ""` | Direct | `:108` |
| 26 | `شناسه فیش` | `r.id` | Raw uuid | `:109` |

Column 12 `گیرنده`, verbatim (`receipt-export-rows.ts:78-82`):

```ts
const receiverTarget = r.destination_bank_account?.title
  ? `بانک ما: ${r.destination_bank_account.title}`
  : r.receiver_party?.full_name
    ? `طرف خارجی: ${r.receiver_party.full_name}`
    : r.receiver_name || "—";
```

A **hardcoded Persian prefix concatenated onto a joined value**, priority
`destination_bank_account_id` → `receiver_party_id` → `receiver_name`.

`receipt_time` is **selected and typed** (`receipt-export-rows.ts:28`, query
`_app.accounting.receipts.tsx:131`) but appears in **no output column**. Selected-but-unused.

### B2 — receipts-list line-detail Excel — 32 columns

The same 26, then six appended (`receipt-export-rows.ts:145-165`). A receipt with no linked
lines still emits exactly one row with the six left empty — deliberately, so totals reconcile
(`:122-127`).

| # | Header | Source | file:line |
|---|---|---|---|
| 27 | `شماره پیش‌فاکتور` | `l.quote_number ?? ""` ← `sales_quotes.quote_number` | `:159` |
| 28 | `کد کالا` | `l.product_code ?? ""` ← `sales_quote_items.sku_snapshot` | `:160`; `_app.accounting.receipts.tsx:216` |
| 29 | `نام کالا` | `l.product_name ?? ""` ← `it.title_snapshot ?? it.free_item_name` (**fallback**) | `:161`; `_app.accounting.receipts.tsx:217` |
| 30 | `تعداد` | `l.quantity ?? ""` | `:162` |
| 31 | `مبلغ فی` | `l.unit_price ?? ""` | `:163` |
| 32 | `مبلغ کل ردیف` | `l.line_total ?? ""` | `:164` |

---

## D3 — THE QUERY BEHIND EACH EXPORT

### A6 `bank_deposits`

* **Call:** `supabase.rpc("asan_list_bank_deposit_export", { _from, _to })` —
  `src/lib/asan/export-bank-deposit.ts:32-35`.
* **Definition:** `supabase/migrations/20260805153000_295_asan_bank_deposit_export_source.sql:40-114`.
  `LANGUAGE plpgsql STABLE SECURITY DEFINER`, `search_path = public`.
* **Base table:** `public.payment_receipts pr` (`:85`) — **direct**, not a view.
* **Sub-selects:** `person_identifiers` (`:74-80`), `customers` (`:78`), `bank_accounts` ×2
  (`:81-84`).
* **Filters (`:86-88`):**
  * `pr.status = 'approved'` — gated by a `DO $chk$` block that aborts the migration if the
    condition is ever removed (`:142-144`)
  * `pr.destination_bank_account_id IS NOT NULL` — likewise gated (`:148-150`)
  * `pr.payment_date BETWEEN _from AND _to`
* **In-function guards:** role check `has_any_role(auth.uid(), ARRAY['admin','accountant'])`
  raising `42501` (`:60-62`); range sanity raising `22023` (`:63-65`).
* **Ordering:** `ORDER BY r.pdate, r.id` (`:112`).
* **`.limit()`:** **none in SQL.** The only ceiling is the client-side
  `ASAN_EXPORT_BATCH_LIMIT = 1000` applied at download time
  (`export-selection.ts:88`, enforced `_app.admin.asan-export.tsx:215-220`, `:278-283`).
* **Amounts:** returned in **Toman**; ×10 happens client-side only (`295:34-35`).
* **Blocking (not filtering)** — a blocked row is listed with a reason and excluded from the
  file (`295:100-110`): missing person code, missing bank `accounting_code`, `amount <= 0`, or
  a non-integer amount.

### A3 / A4 / A5 journal exports

* **Call:** `supabase.rpc("asan_list_journal_export", { _from, _to, _filter })` —
  `src/lib/asan/export-journal.ts:34-38`. `_filter` ∈
  `"all" | "receipt" | "payment" | "third_party" | "settlement"` (`:28`); the shell only ever
  passes `receipt`, `payment`, `third_party` (`:74-96`).
* **Definition:** `supabase/migrations/20260808100000_320_journal_export_rich_description.sql:67-270`.
  16 output columns, asserted post-hoc (`:277-289`).
* **Base tables:** `public.journal_entries je` (`320:92`) and `public.journal_lines jl`
  (`:185`). **`payment_receipts` is reached only through the enrichment CTE** `enr`
  (`:103-108`).
* **Also read:** `payment_vouchers`, `suppliers`, `external_parties`, `mutual_settlements`,
  `persons`, `customers`, `person_identifiers`, `bank_accounts`, `asan_control_accounts`.
* **Filters:**
  * `je.status = 'posted'` (`:93`) — **an approved-but-unposted receipt is invisible here**
  * `je.entry_date BETWEEN _from AND _to` (`:94`). `entry_date` is set from the receipt's
    `payment_date`, per `RECEIPTS-CREATE-MAP.md` §6 row 17
  * `_filter = 'all' OR k.dkind = _filter` (`:267`)
* **`doc_kind` classification (`320:204-213`) — decisive for which file a receipt lands in:**
  1. `source_type = 'mutual_settlement'` → `settlement`
  2. **any `external_party` line** → `third_party`
  3. `bank_net > 0` → `receipt`
  4. `bank_net < 0` → `payment`
  5. else → `unclassified` — **appears in no filtered export at all**
* **Guards:** same role gate raising `42501` (`:79-81`); range and filter validation raising
  `22023` (`:82-87`).
* **Ordering:** `ORDER BY e.edate, e.id, l.lno` (`:268`).
* **`.limit()`:** **none in SQL.** In practice constrained by `oneDocumentPerFile: true` —
  the download refuses more than one document (`_app.admin.asan-export.tsx:221-227`).
* **Second query per listing:** `existingAsanNumbers("accounting_document", distinct doc_ids)`
  → `asan_export_numbers` `.select("source_id, asan_number").eq("doc_type",…).in("source_id",…)`
  (`export-journal.ts:41-44`; `export-numbers.ts:20-26`). Read-only; the table has no
  INSERT/UPDATE/DELETE policy (`export-numbers.ts:7-10`).
* **Third query, on download only:** `supabase.rpc("asan_assign_document_numbers", {_doc_type, _ids})`
  (`_app.admin.asan-export.tsx:234-237`). Numbers are minted **only** on download, never on
  preview (`:231`, `:90-91`).

### B1 / B2 receipts-list export

`_app.accounting.receipts.tsx:128-146`:

```ts
supabase.from("payment_receipts").select(
  `id, amount, payment_date, payment_time, receipt_time, tracking_number, status,
   receipt_type, posting_status, posted_at, description, rejection_reason, bank_name,
   source_bank, destination_bank, payer_name, payer_phone, payer_accounting_code,
   receiver_name, receiver_phone, receiver_accounting_code, is_mobile_bank_screenshot,
   created_at, created_by,
   customer:customers(id, name, phone, accounting_code),
   destination_bank_account:bank_accounts!payment_receipts_destination_bank_account_id_fkey(id, title),
   receiver_party:external_parties!payment_receipts_receiver_party_id_fkey(id, full_name)`
).order("created_at", { ascending: false }).limit(5000)
```

* **Table:** `payment_receipts` **directly**, with three embedded joins. No RPC, no view.
* **Filters, all optional and all from the page's own filter bar** (`:143-146`):
  `.eq("status", statusFilter)` unless `"all"` · `.eq("customer_id", customerId)` ·
  `.gte("payment_date", dateFrom)` · `.lte("payment_date", dateTo)`.
* **No status restriction by default** — unlike A6, a `pending_review` or `rejected` receipt
  **is** exported.
* **Order:** `created_at desc`. **Limit:** `5000`, silent — a 5001st receipt is dropped with
  no warning.
* **Second query:** `profiles.select("id, full_name").in("id", creatorIds)` (`:163-166`).
* **Third query, only when `includeLineDetail`** (`:185-196`): `payment_receipt_links` with
  nested `quote:sales_quotes(quote_number, items:sales_quote_items(...))`,
  `.in("receipt_id", …)`. **No `.limit()`**, and `receipt_id` can carry up to 5000 uuids.
* The comment at `:5-8` of `receipt-export-rows.ts` records that selecting `name` instead of
  `full_name` on `external_parties` once made the **whole export query fail**.

---

## D4 — TRIGGER CONDITIONS

### A1–A6 (the Asan admin page)

| | |
|---|---|
| **Route** | `/admin/asan-export` — `src/routes/_app.admin.asan-export.tsx:93-99` |
| **Route guard** | `beforeLoad: await requireAnyRole(["admin", "accountant"])` (`:94-96`) |
| **Second UI guard** | `roles.includes("admin") \|\| roles.includes("accountant")`; otherwise renders «دسترسی ندارید.» (`:126-127`, `:291-293`) |
| **Server guard** | Each RPC re-checks `has_any_role(auth.uid(), ARRAY['admin','accountant'])` and raises `42501` — migration `295:60-62`, `320:79-81`. Three-layer guard as CLAUDE.md rule 7 requires |
| **User parameters** | نوع خروجی (one of six, `:317-329`) · از تاریخ / تا تاریخ via `PersianDatePicker` (`:335-339`) · per-document tick boxes (`:483-490`) · page size 10/25/50/100/200 (`:451-462`) |
| **Date defaults** | `fromIso` = Tehran today − 90 days, `toIso` = Tehran today (`:102`, `:105-123`, `:130-131`) |
| **Flow** | «اعمال بازه» → `definition.list({fromIso,toIso})` → «پیش‌نمایش انتخاب‌شده‌ها» (optional, mints nothing) → «دانلود خروجی انتخاب‌شده‌ها» → confirm dialog **only when `docType` is non-null** (`:284-288`) → `download()` |
| **Confirm dialog** | «تأیید شماره‌گذاری آسان» (`:579-601`). **A6 `bank_deposits` skips it entirely** — `docType: null` (`export-bank-deposit.ts:44`), so its download is one click with no confirmation |
| **Refusals before a file is produced** | not `available` · nothing selected · > 1000 documents · `oneDocumentPerFile` and > 1 selected (`:206-227`) |

**File name** — `_app.admin.asan-export.tsx:252-256`, verbatim:

```ts
const stamp = `${fromIso}_to_${toIso}-selected-${split.exportable.length}`;
const count = await downloadAsanWorkbook(
  { headers, rows, sheetName: "Asan" },
  `asan-${definition.key}-${stamp}.xlsx`,
);
```

So: `asan-bank_deposits-2026-05-18_to_2026-08-16-selected-7.xlsx`. Dates are **ISO
Gregorian**, not Jalali. Sheet name is always `"Asan"`.

Delivery: `Blob` + `URL.createObjectURL` + a synthetic `<a download>` click, revoked
immediately (`write-xlsx.ts:37-51`). MIME
`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`. **Nothing is stored
server-side** (`:36`). Workbook built with `aoa_to_sheet`, deliberately not `json_to_sheet`,
so the blank sales column K keeps its position (`write-xlsx.ts:4-9`, `:26-34`).

### A7 (single quote)

Route `/sales/quotes/$quoteId`, called at `_app.sales.quotes.$quoteId.tsx:641`. File name
`asan-sales-${quoteNumber}.xlsx` — **no date stamp** (`export-single-quote.ts:87-90`).

### B1 / B2 (receipts list)

| | |
|---|---|
| **Route** | `/accounting/receipts` — `_app.accounting.receipts.tsx:71-76` |
| **Route guard** | `requireAnyRole(["admin", "manager", "accountant"])` (`:72-74`) — **wider than the Asan page: `manager` can run this one** |
| **UI guard on the button** | none beyond the route; disabled only while `exporting` (`:334`) |
| **Server guard** | RLS on `payment_receipts` only — no RPC, no role check in the export path |
| **User parameters** | حالت خروجی (معمولی / آسان, `:310-318`) · جزئیات ردیف کالا checkbox (`:322-328`) · and the page's filter bar: مشتری, وضعیت, از/تا تاریخ (`:105-111`) |
| **File name** | `_app.accounting.receipts.tsx:235-241` — `const ts = new Date().toISOString().slice(0,10);` then `includeLineDetail ? \`payment-receipts-lines-${ts}.xlsx\` : \`payment-receipts-${ts}.xlsx\``. The **standard name is deliberately unchanged** so an existing routine keeps working (`:236-237`) |
| **Sheet name** | `"فیش‌ها"` (`:234`) |
| **Delivery** | `XLSX.writeFile` — the library's own download path, not a manual Blob (`:238`) |

---

## D5 — IS THE EXPORT RECEIPT-ONLY?

**Answer: no, and the mixing is different in each direction.**

| Export | Contains receipts? | Contains anything else? |
|---|---|---|
| A6 `bank_deposits` | **Yes — exclusively.** Base table is `payment_receipts` | **No.** Nothing else can enter; this is the one truly receipt-only export |
| A3 `receipts` | Yes, but **only posted ones** | **Structurally yes.** The base table is `journal_entries` with *any* `source_type`. Today `payment_receipt` is the only source that has ever posted (`RECEIPTS-CREATE-MAP.md` §5e: `journal_entries` holds **1 row**). Migrations 313 and 319 added `payment_voucher` and `mutual_settlement` writers, so a purchase payment producing a positive `bank_net` would classify as `receipt` and land in this same file |
| A4 `payments` | Not normally | Payment vouchers |
| A5 `third_party` | **Yes** — any receipt whose entry carries an `external_party` line, i.e. every mode-2 receipt | Also third-party payment vouchers |
| A1 / A2 / A7 | No | Sales / purchase invoices, from `sales_quotes` |
| B1 / B2 | Yes | No — `payment_receipts` only. B2 additionally joins `sales_quotes` / `sales_quote_items` **content**, but every row is still anchored to a receipt |

**Separate files per source, not one mixed file** — the export type is a selector on the page
and each download writes one layout. But the *routing* is by ledger shape, not by source
table, so:

> **A receipt does not have a fixed destination file.** A mode-1 receipt (bank) goes to A3;
> the same receipt entered as mode-2 (external party) goes to A5. Both are journal exports;
> the accountant picks a different item in the dropdown. `receiver_party_id` (#10) is what
> decides, and nothing in the receipt form says so.

**Relevance to the rebuild:** A6 is the only export whose behaviour is entirely determined by
`payment_receipts` columns. A3/A5 are determined by what `post_receipt_accounting` writes into
the ledger, so changing the form changes them only through the posting function.

---

## D6 — CROSS-REFERENCE TO THE 33 INPUT FIELDS *(core deliverable)*

Numbering and Persian labels follow `RECEIPTS-CREATE-MAP.md` §1 exactly.

"Asan file" below means **A6 `bank_deposits` and/or A3/A5 journal** — the files actually
imported into Asan. The receipts-list Excel (B1/B2) is tracked in a separate column because it
is a different artefact with a different audience, and the mission's premise concerns Asan.

Legend: **D** = direct · **I** = indirect (via lookup/join/derived ledger row) · **—** = absent.

| # | Persian label | form key | In the Asan file? | Which Asan column | In B1/B2? | Evidence file:line |
|---|---|---|---|---|---|---|
| 1 | مشتری | `customer_id` | **I — indirect** | A6 `Code_M` (person code via `customer_person_id`/`customers.person_id` → `person_identifiers`); A3 `کد حساب` on the `customer_credit` line | Yes — `مشتری مرتبط`, `تلفن مشتری`, `کد آسان مشتری` | `migrations/…295….sql:74-80`; `…320….sql:144-147`; `receipt-export-rows.ts:88-90` |
| 2 | نوع فیش | `receipt_type` | **—** | — | Yes — `نوع فیش`, via `receiptTypeLabel()` | `receipt-export-rows.ts:102`; absent from both RPCs |
| 3 | اتصال به پیش‌فاکتورها | `allocations` | **—** | — | **Yes, opt-in only** — B2 cols 27–32 | `_app.accounting.receipts.tsx:184-223`; `receipt-export-rows.ts:157-165` |
| 4 | جستجو و تکمیل خودکار (واریزکننده) | *(helper)* | **—** | — | — | writes #5/#6/#7 only |
| 5 | نام و نام‌خانوادگی (واریزکننده) | `payer_name` | **D — direct, load-bearing** | A6 `Name_Moshtari`; A3 `شرح` («واریز از «…»») | Yes — `واریزکننده (نام)` | `export-bank-deposit-rows.ts:39` + `295:71`; `320:105`; `receipt-export-rows.ts:91` |
| 6 | شماره موبایل (واریزکننده) | `payer_phone` | **—** | — | Yes — `واریزکننده (تلفن)` | `receipt-export-rows.ts:92` |
| 7 | کد حسابداری (واریزکننده) | `payer_accounting_code` | **— NO.** Explicitly forbidden | — | Yes — `واریزکننده (کد آسان)` | Gate: `295:152-155` («payer_accounting_code is free text, not the identity store»); `295:30-32`; `receipt-export-rows.ts:93` |
| 8 | جستجو و تکمیل خودکار (گیرنده) | *(helper)* | **—** | — | — | writes #11/#12/#13 |
| 9 | حالت ۱: حساب بانکی خودِ ما | `destination_bank_account_id` | **I — indirect, and a hard gate** | A6 `Bank_cod` (`bank_accounts.accounting_code`); **also the `IS NOT NULL` filter — without it the receipt never enters A6 at all**. A3 `کد حساب` on the `bank` line | Yes — `گیرنده` prefixed «بانک ما: » | `295:81-82`, `:87`, `:148-150`; `320:148-150`; `receipt-export-rows.ts:78-79` |
| 10 | حالت ۲: شخص/طرف حساب خارجی | `receiver_party_id` | **I — indirect, and it routes the file** | A3/A5 `کد حساب` via `external_parties.accounting_code`; presence of the line flips `doc_kind` `receipt`→`third_party` | Yes — `گیرنده` prefixed «طرف خارجی: » | `320:151-153`, `:209`; `receipt-export-rows.ts:80-81` |
| 11 | نام گیرنده | `receiver_name` | **—** | — | Yes — `گیرنده (نام روی فیش)`, and the last fallback of `گیرنده` | `receipt-export-rows.ts:82`, `:96` |
| 12 | شماره موبایل (گیرنده) | `receiver_phone` | **—** | — | Yes — `گیرنده (تلفن)` | `receipt-export-rows.ts:97` |
| 13 | کد حسابداری (گیرنده) | `receiver_accounting_code` | **— NO.** Reaches `journal_entries` header; no export selects that column | — | Yes — `گیرنده (کد آسان)` | `320:216-261` selects no `*_accounting_code` from `journal_entries`; `receipt-export-rows.ts:98` |
| 14 | کد آسان ذینفع | `beneficiary_accounting_code` | **— NO** | — | **No** — not even selected | Absent from `320`, `295`, and from `_app.accounting.receipts.tsx:131-138`. Confirms §7 dead-wire finding |
| 15 | مبلغ (تومان) | `amount` | **D — direct, load-bearing** | A6 `Mablagh` (×10 → Rial); A3 `بدهکار` / `بستانکار` (×10) | Yes — `مبلغ (تومان)`, **un-multiplied** | `export-bank-deposit-rows.ts:41`; `amounts.ts:45-61`; `export-journal-rows.ts:89-90`; `receipt-export-rows.ts:100` |
| 16 | شماره پیگیری | `tracking_number` | **D — direct, load-bearing** | A6 `Shomare_Peygiri`; A3 `شرح` («پیگیری …») | Yes — `شماره پیگیری` | `export-bank-deposit-rows.ts:40` + `295:72`; `320:106`; `receipt-export-rows.ts:101` |
| 17 | تاریخ روی فیش | `payment_date` | **D — direct, load-bearing, and the range filter** | A6 `Date` (Jalali, Latin digits) **and** the `BETWEEN _from AND _to` filter; A3 via `journal_entries.entry_date` | Yes — `تاریخ فیش (شمسی)`, and the `.gte/.lte` filter | `export-bank-deposit-rows.ts:37`; `295:70`, `:88`; `320:94`; `receipt-export-rows.ts:85` |
| 18 | ساعت واریز | `payment_time` | **—** | — | **Yes — `ساعت فیش`.** Contradicts the "read by nothing" classification | `receipt-export-rows.ts:86`; selected `_app.accounting.receipts.tsx:131` |
| 19 | توضیحات | `description` | **I — INDIRECT, LOAD-BEARING. The biggest correction to the prior map.** Concatenated into the Asan `شرح` column | A3/A5 `شرح`, third fragment | Yes — `توضیحات` | `320:107`; `320:249-256`; `receipt-export-rows.ts:108` |
| 20 | حساب مبدأ ما | `source_bank_account_id` | **—** | — | **No** — not selected | Absent from `_app.accounting.receipts.tsx:131-138` and both RPCs |
| 21 | نام بانک مبدأ (متن) | `source_bank` | **—** | — | Yes — `بانک مبدأ`, first choice | `receipt-export-rows.ts:94` |
| 22 | نام بانک مقصد (متن) | `destination_bank` | **—** | — | Yes — `بانک مقصد` | `receipt-export-rows.ts:99` |
| 23 | ساعت روی فیش | `receipt_time` | **—** | — | **No** — selected and typed but never emitted | `receipt-export-rows.ts:28`; `_app.accounting.receipts.tsx:131`; no key in `:83-110` |
| 24 | روش انتقال | `document_channel` | **—** | — | **No** | Not selected; absent from both RPCs |
| 25 | شمارهٔ چک | `cheque_number` | **—** | — | **No** | Not selected. NB Layout 2 col K `پرداخت چک` is fed from purchase invoices, never from a receipt (`export-invoice-rows.ts:116`) |
| 26 | تاریخ سررسید چک | `cheque_due_date` | **—** | — | **No** | Not selected |
| 27 | نام واریزکننده روی فیش | `payer_name_on_receipt` | **—** | — | **No** | Not selected |
| 28 | نام گیرنده روی فیش | `receiver_name_on_receipt` | **—** | — | **No.** Column 13's header says «نام روی فیش» but the value is `receiver_name` | `receipt-export-rows.ts:96` |
| 29 | پرفراژ دارد؟ | `has_perforation` | **—** | — | **No** | Not selected |
| 30 | فیش تایپی است؟ | `is_typed_receipt` | **—** | — | **No** | Not selected |
| 31 | رسید اسکرین‌شات از همراه بانک است؟ | `is_mobile_bank_screenshot` | **—** | — | **Yes — `رسید اسکرین‌شات همراه بانک`, as «بله»/«خیر».** Contradicts "DEAD, PERMANENTLY" | `receipt-export-rows.ts:103`; selected `_app.accounting.receipts.tsx:134` |
| 32 | مستندات فیش (آپلود) | `stagedFiles` | **—** | — | **No** | No export reads `payment_receipt_documents` |
| 33 | اطلاعات تکمیلی | `customData` | **—** | — | **No** — `custom_data` is not selected | `_app.accounting.receipts.tsx:131-138` |

### Roll-up

* **Load-bearing for the Asan file: 8 of 33** — #1, #5, #9, #10, #15, #16, #17, #19.
  Direct: #5, #15, #16, #17. Indirect: #1, #9, #10, #19.
* **Load-bearing for the receipts-list Excel: 19 of 33** — #1, #2, #3, #5, #6, #7, #9, #10,
  #11, #12, #13, #15, #16, #17, #18, #19, #21, #22, #31.
* **Union — appear in some produced file: 20 of 33.**
* **Appear in no export anywhere: 13** — #4, #8 (helpers), #14, #20, #23, #24, #25, #26, #27,
  #28, #29, #30, #32, #33 (14 rows; #4 and #8 are UI helpers rather than persisted fields, so
  11 persisted fields are export-dead).

### Where this contradicts the prior map

| Field | Prior classification | Actual |
|---|---|---|
| #19 `description` | "Stored only" / dead | **Concatenated into the Asan `شرح` column.** Load-bearing for the Asan file |
| #18 `payment_time` | "Stored only, read by nothing" | Exported as `ساعت فیش` in B1/B2 |
| #31 `is_mobile_bank_screenshot` | "DEAD, PERMANENTLY … Nothing ever reads it" | Exported as `رسید اسکرین‌شات همراه بانک` in B1/B2 |
| #7 `payer_accounting_code` | Among the 8 "live" ledger fields | Ledger-live, **Asan-dead by explicit design gate** (`295:152-155`) |
| #13 `receiver_accounting_code` | Among the 8 "live" ledger fields | Ledger-live, **absent from every Asan file** |
| #10 `receiver_party_id` | "0 rows of production evidence" | Also silently **routes the document to a different export file** |

The prior map's method was sound; it measured reach into `journal_entries` and stopped there.
Three fields reach a file without ever reaching the ledger, and two reach the ledger without
ever reaching a file.

---

## RISKS FOR THE REBUILD

1. **`description` (#19) is not free text you can drop or restructure.** It is the third
   fragment of the Asan `شرح` column, the only human-readable identification the accountant
   gets inside Asan.
2. **`payment_date` (#17) is a range filter, not just a stored date.** A receipt dated outside
   the accountant's chosen window is invisible to both Asan exports.
3. **`destination_bank_account_id` (#9) is the entry ticket to A6.** A receipt without it can
   never appear in the bank-deposit file, by a migration-level gate.
4. **`payer_name` (#5) is `NOT NULL` and reaches Asan verbatim in two places.** Loosening it
   degrades the Asan file, not just the UI.
5. **`amount` (#15) must stay a whole Toman integer.** `tomanToRial` **throws** on a fraction
   rather than rounding (`amounts.ts:45-51`), and the RPC blocks the row (`295:107-108`).
   A rebuilt form that permits decimal amounts breaks the export.
6. **Field #1 depends on the person having an `asan_person_code` identifier.** No code ⇒
   `Code_M` is NULL ⇒ the deposit is **blocked**, not silently exported (`295:100-102`).
   The receipt form never surfaces this.
7. **B1's frozen mapping.** `receipt-export-rows.ts:10-14` states the standard file must be
   byte-identical for the same input. Any renamed or removed `payment_receipts` column named
   in `_app.accounting.receipts.tsx:131-138` breaks the whole query — and the file's own
   comment (`:54-56`) records that this has already happened once.
8. **The `limit(5000)` on B1 is silent** (`_app.accounting.receipts.tsx:141`), contrary to
   CLAUDE.md rule 11's intent. Not caused by the rebuild, but it lives in the code being touched.

---

## UNCERTAIN / NOT VERIFIED BY THIS AGENT

1. **Whether the live database matches these migration files.** Everything about the two RPCs
   comes from reading `supabase/migrations/*.sql` — no database access was permitted here.
   CLAUDE.md warns the live definition sometimes differs from git. **Sub-agent E owns this.**
   Specifically worth confirming live: `asan_list_journal_export` output column count (16),
   the `status='approved'` and `destination_bank_account_id IS NOT NULL` conditions in
   `asan_list_bank_deposit_export`, and whether any later migration replaced either function.
2. **Which export the business actually uses in practice** — A3 (accounting document) or A6
   (bank deposits). The code calls A6 «مسیر جایگزین» (the alternative) and A3 the default
   (`export-bank-deposit.ts:6-7`, `:49-50`), but that is the developer's statement, not
   observed usage. This matters a great deal: A6 carries `tracking_number` and `payer_name`
   as first-class columns, A3 buries them inside `شرح`.
3. **Whether the accountant also uses B1/B2** as an Asan input via manual copy-paste. B1's
   column set is far richer and its file name is explicitly preserved for "an existing routine"
   (`_app.accounting.receipts.tsx:236-237`) — which implies a routine exists, but nothing in
   `src/` says what it is.
4. **The `320:20` vs `320:104-108` discrepancy** about «بابت پیش‌فاکتور» (see D2).
5. **`asan_list_purchase_export` and `asan_list_sales_export` bodies** were not read — neither
   is receipt-related.
6. **`RECEIPTS-CREATE-MAP.md` §5e reports `journal_entries` holds 1 row.** If that is still
   true, exports A3/A4/A5 currently produce almost nothing, and A6 — which reads
   `payment_receipts` directly and needs only `status='approved'` — is the only Asan export
   with receipt data in it today. Worth confirming with sub-agent E, because it would make A6,
   not A3, the export the rebuild must not break.

---

## BLOCKED

Nothing. No step required a forbidden write. Files inspected: 19 files under
`src/lib/asan/`, `src/lib/export/` (4), `src/routes/_app.admin.asan-export.tsx`,
`src/routes/_app.accounting.receipts.tsx`, `src/lib/receipts/receipt-types.ts`, and two
migration files read from disk. No export was executed, no dev server started, no database
touched, no git operation performed. The only file written is this one.
