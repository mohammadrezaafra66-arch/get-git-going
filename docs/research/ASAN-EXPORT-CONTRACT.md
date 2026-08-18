# Asan export contract — 2026-08-17

**Code HEAD:** `99f6bd58` (working tree exactly `origin/staging`, 0 ahead / 0 behind)
**Live `APP_GIT_SHA`:** `bfcc723a` — 3 commits behind, diff is `PROGRESS.md` only, so no code difference
**Branch:** `staging` · **git status:** 8 lines before this mission, all untracked and pre-existing

**Purpose.** `docs/research/RECEIPTS-CREATE-MAP.md` measured which receipt fields reach `journal_entries` and found 8 of 33. It said so accurately but stated the conclusion too broadly — "23 fields land in a column and stop there" is true of the *ledger* and false of the *business*. The real consumer is a set of Excel exports imported into Asan. This document is the contract: which fields those exports depend on, and what breaks if the rebuild removes or renames them.

**Method.** Two sub-agents over disjoint areas — D owned `src/` (`docs/research/_d_export_code.md`), E owned the live DB catalog (`docs/research/_e_export_sql.md`). The cross-reference below is the lead's, because it needs both. **No export was executed.** All SQL facts come from live `pg_proc` / `pg_get_functiondef` / `pg_policies` / `pg_trigger` output against `afrakala-lan-db`, database `afrakala`; `supabase/schema_full_export.sql` was not consulted.

> **Read this before trusting any row count below.** Every number here comes from the **test** database, which holds 7 receipts, 1 journal entry and 2 journal lines. Production is a different machine (`C:\afrakala`, database `postgres`) and was not touched. These counts prove the plumbing runs; they say **nothing** about production volumes or which export the business actually uses.

---

## 1. EXPORT FEATURES FOUND

Ten export features exist in `src/`, in two families, plus nine unrelated ones (products, price lists, CSVs, PDFs, chart PNGs) that contain no receipt data and were enumerated but not analysed.

### Family A — the Asan bridge (`src/lib/asan/`, 19 files)

One shared shell renders all six types; it knows nothing about layouts and simply writes what the definition in `ASAN_EXPORTS` builds (`src/routes/_app.admin.asan-export.tsx:70-91`, registry `src/lib/asan/export-registry.ts:22-40`).

| # | Key | Persian label | Layout | Cols | Source RPC | Touches receipts? |
|---|---|---|---|---|---|---|
| A1 | `sales` | فاکتورهای فروش | 1 | 18 | `asan_list_sales_export` | **YES — indirectly, via `payment_receipt_links`** (found by E; D had classed this "No") |
| A2 | `purchase` | فاکتورهای خرید | 2 | 18 | `asan_list_purchase_export` | No — reads `payment_receipts` 0 times |
| A3 | `receipts` | دریافت‌ها و واریزها | 3 | 6 | `asan_list_journal_export(_filter='receipt')` | **YES — via the posted ledger** |
| A4 | `payments` | پرداخت‌ها و برداشت‌ها | 3 | 6 | same RPC, `_filter='payment'` | No (payment vouchers) |
| A5 | `third_party` | اسناد شخص ثالث (دوبل) | 3 | 6 | same RPC, `_filter='third_party'` | **YES — every mode-2 receipt lands here, not in A3** |
| A6 | `bank_deposits` | واریزیهای بانکی (مسیر جایگزین) | 4 | 6 | `asan_list_bank_deposit_export` | **YES — reads `payment_receipts` directly** |
| A7 | single-quote export | — | 1 | 18 | `asan_list_sales_export` | Same indirect path as A1 (`src/lib/asan/export-single-quote.ts:74-91`, called `_app.sales.quotes.$quoteId.tsx:641`) |

A3/A4/A5 are deliberately one builder with three filters (`src/lib/asan/export-journal.ts:1-12`, `:48-67`).

**Route and gates (A1–A6):** `/admin/asan-export`, `beforeLoad: requireAnyRole(["admin","accountant"])` (`_app.admin.asan-export.tsx:94-96`), a second UI role check (`:126-127`), and a third gate inside every RPC body — `has_any_role(auth.uid(), ARRAY['admin','accountant'])` raising `42501`. Three layers, as CLAUDE.md rule 7 requires. **`manager` can read the ledger tables but cannot run any export.**

**Parameters:** export type · از تاریخ / تا تاریخ (`PersianDatePicker`, default = Tehran today − 90 days .. today) · per-document tick boxes · page size. **File name:** `asan-${definition.key}-${fromIso}_to_${toIso}-selected-${n}.xlsx`, ISO Gregorian dates, sheet always `"Asan"` (`:252-256`). Delivered as a Blob via a synthetic `<a download>`; **nothing is stored server-side** (`write-xlsx.ts:36-51`).

**Refusals before a file exists:** not available · nothing selected · more than 1000 documents (`ASAN_EXPORT_BATCH_LIMIT`) · `oneDocumentPerFile` and more than one selected (`:206-227`). A6 skips the numbering-confirm dialog entirely because its `docType` is `null` (`export-bank-deposit.ts:44`).

### Family B — the receipts-list Excel (not an Asan layout)

| # | Feature | Where | Notes |
|---|---|---|---|
| B1 | «خروجی اکسل» standard | `_app.accounting.receipts.tsx:124-249`; mapping `src/lib/export/receipt-export-rows.ts:73-112` | 26 Persian columns, reads `payment_receipts` directly, `.limit(5000)` |
| B2 | same + «جزئیات ردیف کالا» | `receipt-export-rows.ts:128-167` | the same 26 + 6 product columns |
| B3 | same, mode = «خروجی آسان» | `_app.accounting.receipts.tsx:177-179` | **produces NO FILE** — throws `AsanLayoutNotConfiguredError`; all five adapters are `isConfigured: false` (`export-modes.ts:122-128`) |

Route `/accounting/receipts`, `requireAnyRole(["admin","manager","accountant"])` — **wider than the Asan page; `manager` can run this one.** No RPC and no role check in the export path itself; only RLS on `payment_receipts`. File `payment-receipts-<ISO date>.xlsx`, sheet `"فیش‌ها"`, via `XLSX.writeFile`.

**B3 is a stale seam.** Its doc comment (dated 2026-08-04) states no verified Asan layout exists — true then, false now: `src/lib/asan/` was built afterwards and ships four verified layouts. The two modules do not reference each other. Anyone reading only the receipts page would conclude no Asan export exists. `UNCERTAIN` whether the owner knows.

### Structural finding

**All four Asan export objects are `SECURITY DEFINER` plpgsql FUNCTIONS. There is no view and no materialised view named or bodied around asan/export anywhere in the database** — E searched every non-system schema, 0 rows twice. Nothing can be `SELECT`ed; everything goes through an RPC.

```
asan_list_bank_deposit_export(_from date, _to date)             2613 chars
asan_list_journal_export(_from date, _to date, _filter text)   10262 chars
asan_list_purchase_export(_from date, _to date)                 3982 chars
asan_list_sales_export(_from date, _to date)                    5026 chars
```

All four are `STABLE SECURITY DEFINER`, `SET search_path TO 'public'`, open with `#variable_conflict use_column`, and begin with the same two guards (role → `42501`, date range → `22023`).

**D's live-vs-git uncertainty is resolved: the live definitions match the migration files** for every receipt-relevant condition — `status='approved'`, `destination_bank_account_id IS NOT NULL`, the date `BETWEEN`, the 10-column return type of A6, and the `doc_kind` classifier of A3/A5.

---

## 2. THE OUTPUT FILE, COLUMN BY COLUMN

### A6 `bank_deposits` — Layout 4, 6 columns, one row per receipt

Headers verbatim from `src/lib/asan/layouts.ts:74-81`. Latin, as the Asan screen writes them — not translated, not spell-corrected.

| Col | Header | Filled by | Transform | Evidence |
|---|---|---|---|---|
| A | `Date` | `isoToJalaliAsan(r.doc_date)` | **Jalali conversion, client-side.** ISO → `YYYY/MM/DD`, four-digit year, **Latin digits** (`1405/05/12`). Deliberately not `isoToJalaliDisplay`, which emits Persian digits. **No Jalali conversion exists in SQL** — the RPC returns a raw `date` | `export-bank-deposit-rows.ts:37`; `dates.ts:28-34`; E3 |
| B | `Code_M` | `r.person_code ?? ""` | **Two-step lookup, entirely server-side:** `person_identifiers.value_normalized` where `kind='asan_person_code'`, person = `COALESCE(pr.customer_person_id, (SELECT c.person_id FROM customers c WHERE c.id = pr.customer_id))`, `LIMIT 1` with no `ORDER BY` | `:38`; E3/E5.1 |
| C | `Name_Moshtari` | `r.party_name ?? ""` | **Direct**, `COALESCE(NULLIF(btrim(pr.payer_name),''),'')` — empty string, never NULL | `:39`; E3 |
| D | `Shomare_Peygiri` | `r.tracking_number ?? ""` | **Direct**, `NULLIF(btrim(pr.tracking_number),'')` | `:40`; E3 |
| E | `Mablagh` | `tomanStringToRial(r.amount)` | **Toman × 10, client-side.** Written as a real number, never a formatted string. **Throws `AmountConversionError` on a non-integer rather than rounding.** No multiplication in SQL | `:41`; `amounts.ts:45-61`; E3 |
| F | `Bank_cod` | `r.bank_code ?? ""` | **Lookup:** `NULLIF(btrim(ba.accounting_code),'')` for `ba.id = pr.destination_bank_account_id` | `:42`; E3 |

The RPC also returns `bank_title` and `blocked_reason`, which are **not columns** — they feed the preview table and the blocking gate (`export-bank-deposit-rows.ts:47-59`).

**Blocking is not filtering.** A blocked row is listed with a Persian reason and excluded from the file. Live `CASE` (E3): no person code · no bank `accounting_code` · `amount <= 0` · `amount <> trunc(amount)`.

### A3 / A5 — Layout 3 «سند حسابداری», 6 columns, one row per journal line

Headers from `layouts.ts:64-71`.

| Col | Header | Filled by | Transform |
|---|---|---|---|
| A | `کد حساب` | `r.account_code ?? ""` | **Lookup branching on `journal_lines.account_kind`** — see §4 |
| B | `کد کالا` | `r.product_code ?? ""` | **Hardcoded empty** — the RPC selects `NULL::text`; a financial line carries no product |
| C | `شرح` | `r.line_description ?? ""` | **Computed, staged concatenation — the load-bearing column.** See below |
| D | `تعداد` | `num(r.quantity)` | **Hardcoded empty** — `NULL::numeric` |
| E | `بدهکار` | `amountCell(r.debit)` | `journal_lines.debit` × 10. **A zero is written as an empty cell, not `0`**, because Asan's «بدون مبلغ حذف شود» is ticked by default and drops zero-amount rows |
| F | `بستانکار` | `amountCell(r.credit)` | same, × 10 |

`export-journal-rows.ts:85-90`, `:60-63`. **`شماره سند` is not a column** — Asan takes it on screen, which is why each file holds exactly one document (`:79-80`, enforced `_app.admin.asan-export.tsx:221-227`).

**Column C for a `payment_receipt` document** — this is how three receipt columns reach Asan:

```sql
SELECT concat_ws(' — ',
         'واریز از «' || COALESCE(NULLIF(btrim(pr.payer_name), ''), '؟') || '»',
         NULLIF('پیگیری ' || btrim(COALESCE(pr.tracking_number, '')), 'پیگیری '),
         NULLIF(btrim(COALESCE(pr.description, '')), ''))
  FROM public.payment_receipts pr WHERE pr.id = e.source_id
```

wrapped in a five-stage fallback that can never produce an empty cell (`…320….sql:249-256`). Each fragment is individually guarded, so a blank `description` contributes nothing rather than a dangling separator.

> **Discrepancy, recorded not resolved.** The migration's own WHY block advertises the example «واریز از «رضا احمدی» — پیگیری 12345 — بابت پیش‌فاکتور ۱۲», implying an invoice reference. The shipped SQL has **only three fragments** and the third is `pr.description`, free text. Nothing joins `payment_receipt_links` or `sales_quotes`. So «بابت پیش‌فاکتور …» appears only if a human typed it into `description`. `UNCERTAIN` whether the comment is aspirational or the implementation incomplete — either way it makes `description` **more** load-bearing, not less.

### A1 / A7 `sales` — Layout 1, 18 columns

Not a receipt export, but **receipt data enters two of its columns**. `asan_list_sales_export` splits each accepted quote's payments into cash vs bank:

```sql
FROM public.payment_receipt_links l
JOIN public.payment_receipts r ON r.id = l.receipt_id
WHERE l.quote_id IS NOT NULL AND r.status = 'approved'
GROUP BY l.quote_id
--   cash := SUM(l.amount) FILTER (WHERE r.destination_bank_account_id IS NULL)
--   bank := SUM(l.amount) FILTER (WHERE r.destination_bank_account_id IS NOT NULL)
```

It uses `payment_receipt_links.amount` — the amount **allocated to that quote** — never `payment_receipts.amount`. The body carries an explicit warning that summing the receipt total would inflate the deposit ~100× on live data (receipt `fd8194a5`). (E6.)

### B1 — receipts-list Excel, 26 columns

Not an Asan layout, but tracked here because its file name is explicitly preserved "so an existing routine keeps working" (`_app.accounting.receipts.tsx:236-237`) and the mapping is frozen: "a VERBATIM move of the mapping that shipped before this phase … must not be 'improved'" (`receipt-export-rows.ts:10-14`). Emitted in object-literal order via `json_to_sheet`, so key order **is** column order.

Headers, in order: `تاریخ ثبت (شمسی)` · `تاریخ فیش (شمسی)` · `ساعت فیش` · `ثبت‌کننده (کاربر)` · `مشتری مرتبط` · `تلفن مشتری` · `کد آسان مشتری` · `واریزکننده (نام)` · `واریزکننده (تلفن)` · `واریزکننده (کد آسان)` · `بانک مبدأ` · `گیرنده` · `گیرنده (نام روی فیش)` · `گیرنده (تلفن)` · `گیرنده (کد آسان)` · `بانک مقصد` · `مبلغ (تومان)` · `شماره پیگیری` · `نوع فیش` · `رسید اسکرین‌شات همراه بانک` · `وضعیت` · `وضعیت ثبت سند` · `تاریخ ثبت سند (شمسی)` · `علت رد` · `توضیحات` · `شناسه فیش` (`receipt-export-rows.ts:84-109`).

Three worth calling out: `مبلغ (تومان)` is **un-multiplied**, unlike every Asan layout (`:100`). Column 13's header says «نام روی فیش» but the value is `receiver_name`, **not** `receiver_name_on_receipt`, which no export emits (`:96`). `گیرنده` is a hardcoded Persian prefix concatenated onto a joined value, priority `destination_bank_account_id` → `receiver_party_id` → `receiver_name` (`:78-82`). `receipt_time` is selected and typed but **appears in no column** (`:28`).

---

## 3. THE DATA SOURCE

| Export | Reads | Filters (verbatim) | Order | Limit |
|---|---|---|---|---|
| **A6** | `payment_receipts` (driving) + `person_identifiers`, `customers`, `bank_accounts` | `pr.status = 'approved'` · `pr.destination_bank_account_id IS NOT NULL` · `pr.payment_date BETWEEN _from AND _to` | `r.pdate, r.id` | **none in SQL**; client cap 1000 documents |
| **A3/A5** | `journal_entries` + `journal_lines`; `payment_receipts` **only** via the enrichment sub-query | `je.status = 'posted'` · `je.entry_date BETWEEN _from AND _to` · `_filter='all' OR k.dkind=_filter` | `e.edate, e.id, l.lno` | none in SQL; one document per file |
| **A1/A7** | `sales_quotes` + `payment_receipt_links` + `payment_receipts` | `sq.status='accepted'` · `(sq.created_at AT TIME ZONE 'Asia/Tehran')::date BETWEEN _from AND _to` · join filtered `r.status='approved'` | — | none in SQL |
| **B1/B2** | `payment_receipts` directly, 3 embedded joins | all optional, from the page filter bar: `.eq(status)` unless "all" · `.eq(customer_id)` · `.gte/.lte(payment_date)` | `created_at desc` | **`.limit(5000)`, silent** |

**A6 does not filter on `posting_status`.** It keys off `status='approved'` only. **B1 has no default status filter at all** — a `pending_review` or `rejected` receipt *is* exported there.

**`doc_kind` classification (A3/A4/A5) — decisive for which file a receipt lands in** (E6, verbatim):

```sql
CASE
  WHEN e.source_type = 'mutual_settlement' THEN 'settlement'
  WHEN COALESCE(a.has_external, false)     THEN 'third_party'
  WHEN COALESCE(a.bank_net, 0) > 0         THEN 'receipt'
  WHEN COALESCE(a.bank_net, 0) < 0         THEN 'payment'
  ELSE 'unclassified'
END
```

`'unclassified'` is reachable but is **not an accepted `_filter` value**, so such entries surface only under `_filter='all'` — which the admin page never passes.

**Asan numbering.** `asan_export_numbers` is read on listing and written only on download, via `asan_assign_document_numbers` (`_app.admin.asan-export.tsx:234-237`) — never on preview. Valid `_doc_type` values are `sales_invoice`, `purchase_invoice`, `accounting_document`. **There is no receipt document type and no burn trigger on `payment_receipts`** — receipts are not themselves an Asan-numbered document.

---

## 4. ACCOUNTING-CODE RESOLUTION USED BY THE EXPORT

**The export never reads `payer_accounting_code` or `receiver_accounting_code`. It re-derives every Asan code from the entity.**

| | `post_receipt_accounting` (posting) | `asan_list_bank_deposit_export` (A6) | `asan_list_journal_export` (A3/A5) |
|---|---|---|---|
| payer / person code | `payment_receipts.payer_accounting_code`, verbatim, no fallback | `person_identifiers.value_normalized` via `COALESCE(customer_person_id, customers.person_id)`, `kind='asan_person_code'`, `LIMIT 1` | `person_identifiers.value_normalized` via `customers.person_id` from the line's `account_ref_id` |
| receiver code | `receiver_accounting_code` → `external_parties` → `bank_accounts` (**raises `23514`** if blank) | `bank_accounts.accounting_code` **only** | per `account_kind` (below) |
| external-party receiver | supported (2nd arm) | **excluded by the `WHERE` clause** | supported (`external_party` arm) |
| `journal_entries.payer_accounting_code` / `receiver_accounting_code` | written | — | **never read** |

A3/A5 resolve per journal line (E5.2, verbatim `CASE`): `customer_credit` → `person_identifiers` joined `customers`; `bank` → `bank_accounts.accounting_code`; `external_party` → `external_parties.accounting_code`; `supplier_payable` → `COALESCE(suppliers.accounting_code, person_identifiers)`; **`ELSE` → `asan_control_accounts` by `account_kind`.**

`asan_control_accounts` holds exactly **one row**: `invoice_ar = 989`. `clearing` and `other` have no row, so those kinds always resolve to NULL and **always block the whole document** — which the body says is deliberate.

### The consequence that matters most

`post_receipt_accounting` copies the two typed text codes onto the `journal_entries` row, and **no export object ever reads them again.** So:

- **A typo in `payer_accounting_code` cannot corrupt the Asan file.**
- **A correct value typed there cannot rescue a person who has no `asan_person_code` identifier** — the deposit blocks regardless.

Those two columns are still load-bearing, but for a different reason: `post_receipt_accounting` refuses to post when a `validation_rules` row (`scope='journal_entry'`, `enabled`, `severity='blocking'`, `rule_type='required'`) exists for them and the value is blank. They gate *posting*, not *exporting*.

**A second hazard:** the export reads `person_identifiers.value_normalized`, while the `customers` / `suppliers` `accounting_code` mirror is populated from `value_raw` (`trg_person_identifiers_propagate_asan_code`). **Two different strings can be in play for the same person** — the receipts-list Excel column `کد آسان مشتری` shows the mirror, the Asan file ships the normalised form.

---

## 5. THE UNTOUCHABLE LIST ← the most important section

**9 of the 33 input fields are load-bearing for the Asan export.** Numbering follows `RECEIPTS-CREATE-MAP.md` §1.

| # | Persian label | form key | How the export uses it | What breaks if removed or renamed |
|---|---|---|---|---|
| **1** | مشتری | `customer_id` | **Indirect, and the only steering wheel for the person code.** A6 `Code_M` resolves `COALESCE(customer_person_id, customers.person_id)` → `person_identifiers`. A3 `کد حساب` on the `customer_credit` line resolves the same way from `account_ref_id` | The Asan person code goes NULL ⇒ **the deposit is blocked, not silently wrong**. `customer_person_id` is overwritten by `trg_payment_receipts_derive_person` on every insert, so the UI cannot set it directly — `customer_id` is the only lever |
| **3** | اتصال به پیش‌فاکتورها | `allocations` → `payment_receipt_links` | **Indirect, into the SALES Asan file.** `asan_list_sales_export` sums `payment_receipt_links.amount` per quote, split cash vs bank by `r.destination_bank_account_id IS NULL` | The sales invoice's paid-amount columns lose their receipt contribution. **Found by E; D had marked this absent from Asan** |
| **5** | نام و نام‌خانوادگی (واریزکننده) | `payer_name` | **Direct, twice.** A6 `Name_Moshtari`; A3/A5 `شرح` as «واریز از «…»» | The Asan customer-name column empties, and the only human-readable identification inside an Asan accounting document degrades to «؟» |
| **9** | حالت ۱: حساب بانکی خودِ ما | `destination_bank_account_id` | **Indirect, and a hard gate in three places.** A6 `Bank_cod` via `bank_accounts.accounting_code`, **and** the `IS NOT NULL` filter that admits the receipt at all; A3 `کد حساب` on the `bank` line; A1 splits sales payments cash-vs-bank on it | Without it a receipt **never enters A6 at all — silently, with no `blocked_reason`**. In A1 the payment reclassifies from bank to cash |
| **10** | حالت ۲: شخص/طرف حساب خارجی | `receiver_party_id` | **Indirect via the ledger, and it routes the document.** No export reads the column directly, but `post_receipt_accounting` writes it into `journal_lines.account_ref_id` with `account_kind='external_party'`, which A3/A5 resolve to `external_parties.accounting_code` — **and its presence flips `doc_kind` from `receipt` to `third_party`** | The receipt moves between two different export files. The accountant must pick a different dropdown item, and **nothing in the receipt form says so**. Also guarantees exclusion from A6 |
| **15** | مبلغ (تومان) | `amount` | **Direct.** A6 `Mablagh` (× 10 → Rial, client-side); A3 `بدهکار`/`بستانکار` (× 10) | **Must stay a positive whole-Toman integer.** `tomanToRial` **throws** on a fraction rather than rounding (`amounts.ts:45-51`) and the RPC blocks the row (`amount <> trunc(amount)`). A rebuilt form permitting decimals breaks the export |
| **16** | شماره پیگیری | `tracking_number` | **Direct.** A6 `Shomare_Peygiri`; A3/A5 `شرح` as «پیگیری …»; also the text of `journal_entries.description` written at posting | The bank reference the accountant reconciles against disappears from the Asan file |
| **17** | تاریخ روی فیش | `payment_date` | **Direct, and the range filter.** A6 `Date` (Jalali, Latin digits) **and** `BETWEEN _from AND _to`; A3 via `journal_entries.entry_date`, which is set from `payment_date` | A receipt dated outside the accountant's chosen window is **invisible to both Asan exports**. Must stay a real `date` — no Jalali conversion exists in SQL |
| **19** | توضیحات | `description` | **Indirect, load-bearing. The single biggest correction to the prior map.** Third fragment of the A3/A5 `شرح` column | Free text that ships to Asan. Restructuring or dropping it degrades the only free-form context the accountant sees inside the accounting document |

### Two server-side values with no form field that the export equally depends on

- **`status` must reach `'approved'`.** It is the filter on all three receipt-reading Asan exports. `posting_status` is irrelevant to the export — A6 never looks at it. So a receipt can be approved-but-unposted and still export.
- **`customer_person_id`** — derived by trigger from `customer_id`, unconditionally, on every INSERT/UPDATE. The export's whole person-code chain hangs off it.

### And one dependency outside the receipt entirely

**The person must have an `asan_person_code` identifier in `person_identifiers`.** No identifier ⇒ `Code_M` is NULL ⇒ the deposit is **blocked**. The receipt form never surfaces this, and there is no way to fix it from the receipt page.

---

## 6. THE SAFE-TO-DROP LIST

**"Safe for Asan" does not mean "safe overall."** Every field below is provably absent from every Asan export — but many are load-bearing elsewhere. **Cross-check `RECEIPTS-CREATE-MAP.md` §6 and the B1/B2 column before removing anything.**

| # | form key | Absent from Asan, but… |
|---|---|---|
| 2 | `receipt_type` | **In B1** (`نوع فیش`). Gates the entire allocation block client-side, and a CHECK constrains it |
| 4, 8 | search helpers | UI-only; they write #5/#6/#7 and #11/#12/#13 |
| 6 | `payer_phone` | **In B1** (`واریزکننده (تلفن)`). Rewritten by `trg_normalize_phone` |
| 7 | `payer_accounting_code` | **In B1.** **Gates posting** via `validation_rules`, and is written onto `journal_entries` — where nothing reads it |
| 11 | `receiver_name` | **In B1** twice, incl. the last fallback of `گیرنده`. **NOT NULL** |
| 12 | `receiver_phone` | **In B1.** Trigger-normalised |
| 13 | `receiver_accounting_code` | **In B1.** **Gates posting**, and wins outright over the entity lookup inside `post_receipt_accounting` |
| 14 | `beneficiary_accounting_code` | Absent everywhere — not even selected by B1. Confirms the prior map's dead-wire finding |
| 18 | `payment_time` | **In B1** (`ساعت فیش`). **NOT NULL with no default** — the form must always send it |
| 20 | `source_bank_account_id` | Absent everywhere, incl. B1 |
| 21 | `source_bank` | **In B1** (`بانک مبدأ`, first choice) |
| 22 | `destination_bank` | **In B1** (`بانک مقصد`) |
| 23 | `receipt_time` | Selected and typed by B1 but **emitted in no column** |
| 24 | `document_channel` | Absent everywhere. Governs the cheque CHECK |
| 25, 26 | `cheque_number`, `cheque_due_date` | Absent everywhere. Constrained by `payment_receipts_cheque_fields_chk` |
| 27 | `payer_name_on_receipt` | Absent everywhere |
| 28 | `receiver_name_on_receipt` | Absent everywhere — B1's column with that header actually shows `receiver_name` |
| 29, 30 | `has_perforation`, `is_typed_receipt` | Absent everywhere |
| 31 | `is_mobile_bank_screenshot` | **In B1** as «بله»/«خیر» — contradicts the prior map's "DEAD, PERMANENTLY" |
| 32 | `stagedFiles` | No export reads `payment_receipt_documents` |
| 33 | `customData` | `custom_data` is not selected by any export |

**Count: 24 of 33 are Asan-safe** (22 persisted fields + 2 UI helpers). Of those, **11 appear in the receipts-list Excel** and are therefore not free to remove. **Only 11 persisted fields are absent from every produced file anywhere**: #14, #20, #23, #24, #25, #26, #27, #28, #29, #30, #32/#33.

### Where this contradicts the prior map

| Field | Prior classification | Actual |
|---|---|---|
| #19 `description` | "Stored only" | **Concatenated into the Asan `شرح` column** — load-bearing for Asan |
| #3 `allocations` | "No ledger effect" | **Feeds the sales Asan export** via `payment_receipt_links.amount` |
| #18 `payment_time` | "Stored only, read by nothing" | Exported as `ساعت فیش` in B1/B2 |
| #31 `is_mobile_bank_screenshot` | "DEAD, PERMANENTLY … nothing ever reads it" | Exported as `رسید اسکرین‌شات همراه بانک` in B1/B2 |
| #7 `payer_accounting_code` | Among the 8 "live" ledger fields | Ledger-live, **Asan-dead**; the export re-derives the code from the entity |
| #13 `receiver_accounting_code` | Among the 8 "live" ledger fields | Ledger-live, **absent from every Asan file** |
| #10 `receiver_party_id` | "0 rows of production evidence" | Also **routes the document to a different export file** |

The prior map's method was sound — it measured reach into `journal_entries` and said so. But three fields reach a produced file without ever reaching the ledger, and two reach the ledger without ever reaching a file. **Ledger reach and export reach are different questions, and neither is a subset of the other.**

---

## 7. FIELDS THE EXPORT NEEDS THAT THE FORM DOES NOT COLLECT WELL

1. **The `asan_person_code` identifier is a hard export dependency with no presence in the form.** The receipt page lets an accountant pick any customer, save, and approve — and only much later, in the export preview, does the row appear as blocked with «کد آسان برای «…» ثبت نشده است». In the test database the single exportable receipt is blocked for exactly this reason. **A rebuilt form could surface it at selection time.**
2. **`amount` is unconstrained at the decimal level.** zod allows any positive number up to 1e12 and the column is `numeric(15,2)`, but a non-integer Toman value blocks the export and throws client-side in `tomanToRial`. Nothing warns the user at entry.
3. **`description` is optional, unvalidated free text that ships to Asan.** It is the only free-form context in the accounting document, has a silent `.max(1000)` with **no error paragraph rendered** (prior map §2), and is frequently blank.
4. **`payer_name` is `NOT NULL` but only `.min(2)`.** It goes verbatim into `Name_Moshtari` and into the Persian sentence. A two-character placeholder is accepted and exported.
5. **The mode-1/mode-2 choice silently changes the destination file**, and the form gives no indication. Worse, the DB CHECK permits **neither** receiver while `pending_review` (prior map §5a), so a receipt can be created that belongs to no export path at all and only fails later at approval.
6. **`tracking_number` is `NOT NULL`, non-unique, with no format CHECK.** It is a first-class Asan column and the live data already holds 7 rows with 3 distinct values.
7. **`payment_date` doubles as the export window key**, but the form validates only `<= today` and the read-only «تاریخ ثبت فیش» display is backed by a module-level `const today` that does not roll over at midnight (prior map §2).

---

## 8. RISKS TO THE REBUILD

Ordered by how silently they would fail.

1. **Dropping or renaming `description` (#19).** No error anywhere; the Asan `شرح` column simply loses its third fragment and the five-stage fallback quietly fills in something less useful. Nobody notices until an accountant cannot identify a document inside Asan.
2. **Letting `amount` accept decimals.** The row is *blocked*, not exported. The accountant sees a shorter file and a Persian reason in a preview table they may not read.
3. **Changing how `customer_id` is chosen — or allowing a customer without a `person_id`.** The insert dies on `customer_person_id`'s NOT NULL with a raw `23502`; or, if the person exists but has no `asan_person_code`, the export blocks. Two different failures, both surfacing far from the form.
4. **Not back-filling `bank_name`.** No Asan impact, but it is the 4th column of the app-side duplicate probe, and the probe branches `.eq("bank_name", …)` vs `.is("bank_name", null)`. Duplicate detection changes silently (prior map §7).
5. **Renaming any column named in `_app.accounting.receipts.tsx:131-138`.** The whole B1 query fails — and `receipt-export-rows.ts:5-8` records that this has **already happened once**, when `name` was selected instead of `full_name` on `external_parties`.
6. **Treating `payer_accounting_code` / `receiver_accounting_code` as the Asan codes.** They are not, and have never been. Wiring the rebuild to "fix" them changes nothing in the export while possibly breaking the `validation_rules` posting gates that do depend on them.
7. **Assuming the create page can influence the export at all.** It cannot, directly: every Asan export filters `status='approved'` (or `je.status='posted'`), and the create page always writes `pending_review`. **The rebuild changes what is available to export, never what is exported.**
8. **`limit(5000)` on B1 is silent** (`_app.accounting.receipts.tsx:141`), contrary to CLAUDE.md rule 11's intent. Not caused by the rebuild, but it lives in the code being touched.
9. **`asan_list_journal_export` still carries the default `PUBLIC EXECUTE`** (`=X/supabase_admin`) while the other three had it revoked (E9a). The in-body role gate is the real guard, so this is not an open door — but it is an inconsistency worth a deliberate decision rather than a discovery later.

---

## 9. OPEN QUESTIONS for human review

1. **Which export does the business actually use — A3 (accounting document) or A6 (bank deposits)?** This is the most consequential open question in this report. The code calls A6 «مسیر جایگزین» (the alternative) and A3 the default, but that is a developer's label, not observed usage. It matters enormously: **A6 carries `tracking_number` and `payer_name` as first-class columns; A3 buries both inside `شرح`.** `UNCERTAIN` — cannot be resolved from code or from the test database.
2. **Is the receipts-list Excel (B1) also fed into Asan by hand?** Its file name is explicitly preserved for "an existing routine" (`:236-237`), which implies a routine exists — but nothing in `src/` says what it is. If accountants copy-paste from it, its 26 columns are part of the contract too, and the safe-to-drop list shrinks by 11 fields.
3. **Should the «خروجی آسان» mode on the receipts page be removed or wired to `src/lib/asan/`?** Today it refuses and produces nothing, while a working Asan bridge exists on another page.
4. **Should the form require an `asan_person_code` before allowing a receipt?** It is the single most common block reason available in this data, and it is invisible at entry.
5. **Was the «بابت پیش‌فاکتور …» fragment meant to ship?** Migration 320's comment advertises it; the SQL does not implement it. If intended, it needs a join to `payment_receipt_links` / `sales_quotes` and would make `allocations` (#3) load-bearing for A3 as well as A1.
6. **Should `clearing` and `other` remain permanently blocking?** `asan_control_accounts` holds one row (`invoice_ar = 989`). The body says the omission is deliberate; confirm that is still the intent.
7. **Should A6 report external-party receipts as blocked rather than omitting them?** Today a mode-2 receipt vanishes from the bank-deposit export **with no `blocked_reason`** — the one silent exclusion in an otherwise explicit design.
8. **Which `asan_person_code` wins when a person has more than one?** The lookup is `LIMIT 1` with no `ORDER BY`. Two unique indexes (`uq_person_identifiers_asan_code_active`, `uq_person_identifiers_asan_one_per_person`) suggest one-per-person makes it deterministic — `UNCERTAIN`, not verified.
9. **`value_normalized` vs `value_raw`** — the export ships the normalised code while the `customers.accounting_code` mirror shows the raw one. Is that intended, and does Asan accept the normalised form?
10. **Should `asan_list_journal_export`'s `PUBLIC EXECUTE` grant be revoked** for consistency with the other three?

---

## BLOCKED

Nothing. No forbidden write was required by either sub-agent or by the lead.

Deliberate non-actions, all per the mission rules:

- **No export function was executed.** All four `asan_list_*` are role-gated `SECURITY DEFINER`; `auth.uid()` is NULL in `psql` and they would raise `42501`. Bodies were read with `pg_get_functiondef`; the bank-deposit inner `SELECT` was **replicated by hand** against the base tables (range widened, Persian `blocked_reason` strings replaced by ASCII markers) rather than called.
- **No `git pull`** — the tree was already exactly `origin/staging`, so it would have been a no-op merge, and merges are forbidden here.
- **Temp SQL went to the session scratchpad**, not `C:\afrakala-backups\`, which does not exist on this host. Host copies deleted; container `/tmp` copies left in place, since deleting them would be a container write.

One limit on the evidence, stated plainly rather than buried: **the live-data section describes the test database only** — 7 receipts, 1 journal entry, 1 bank account, 1 external party, and a single exportable row that is blocked and is obvious test data (`bank_title='12'`). It proves the plumbing runs. It is not evidence about production.

---

```
=== HANDOFF STATE ===
Sub-agent D (export code): done — D1..D6 complete; 10 export features enumerated, 26-column B1 mapping captured
Sub-agent E (export SQL):  done — E1..E9 complete; 4 SQL batches, live definitions of all 4 export functions read
Export features found:     10 in src/ (7 Asan-layout + 3 receipts-list variants), backed by 4 SQL functions, 0 views
Untouchable fields:        9 of 33  (#1, #3, #5, #9, #10, #15, #16, #17, #19)
Safe-to-drop fields:       24 of 33 for Asan — but only 11 persisted fields are absent from EVERY produced file
Writes performed:          NONE
Container restarted:       NO
Export executed:           NO
Files produced:            docs/research/ASAN-EXPORT-CONTRACT.md (+ _d_export_code.md, _e_export_sql.md)
Next phase:                human review. Do not start a rebuild.
```
