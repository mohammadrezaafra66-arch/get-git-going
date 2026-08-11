# M4 — BUILD EXPORT (AfraKala → Asan)

Read `docs/execution/ASAN_MISSION_CONTROL.md` first and obey every rule in it, including
section 1 on execution pace.

Read `docs/asan/research-asan-bridge.md` and `docs/asan/asan-layouts.md`.

This is the mission the whole program exists for. My accountant currently re-types every
transaction into Asan by hand. When this works she selects a date range, unticks anything she
does not want, and imports the file directly.

Eight phases. One at a time. Commit after each.

---

## The five exports and their layouts

| # | Export | Asan layout | Status |
|---|--------|-------------|--------|
| 1 | Sales invoices (فروش) | Sales tab, 18 columns | VERIFIED |
| 2 | Purchase invoices (خرید) | Purchase tab, 18 columns | VERIFIED |
| 3 | Receipts / deposits (دریافت · واریز) | Accounting document, 6 columns | VERIFIED |
| 4 | Payments / withdrawals (پرداخت · برداشت) | Accounting document, 6 columns | VERIFIED |
| 5 | Third-party documents (دوبل) | Accounting document, 6 columns | VERIFIED |

Exports 3, 4 and 5 share one layout. **Build the row-builder once and call it three times.**
They differ only in which side of the ledger each line falls on and which accounts appear.
Writing three separate mappers for the same six columns would be exactly the kind of parallel
implementation this project keeps suffering from.

A sixth, secondary export exists: bank deposits in the `واریزیهای بانکی` layout (Latin
headers). Build it in Phase 4.7 as an alternative path, but the accounting document is the
default for deposits.

---

## Phase 4.1 — Stable Asan document numbering

### Requirement
Exported document numbers start at **1** and increment, because I am starting Asan from 1. A
document exported once **keeps its number forever**. Re-exporting produces the same number.
Numbers are never reused, never renumbered, never reordered.

### Design
A mapping table: one row per (document type, internal document id) → Asan number. Assign at
**first export**, not at document creation — only exported documents consume Asan numbers.

Sequences are **per document type**. Sales invoices have their own 1..N, purchase invoices
their own, accounting documents their own. Each mirrors a separate Asan register.

Database-level constraints that must exist:
- unique on (document type, internal id) — one number per document
- unique on (document type, asan number) — no two documents share a number
- assignment via a function that takes the next value **atomically under concurrency**. Two
  simultaneous exports must not both receive number 7.

Per rule 2.5, put assignment in a trigger or SECURITY DEFINER function, not in application
code, so a direct API call cannot bypass it.

### Gap policy
If a document is exported and later deleted or cancelled, its number is **burned**, not
recycled. Gaps are correct; renumbering is not. Record burned numbers so the final report can
explain any gap to me.

### Phase test
- Export a document twice; same number both times.
- Export three documents; they receive 1, 2, 3.
- Concurrency: fire two assignment calls in parallel; assert two distinct numbers.
- Insert a duplicate number directly; assert rejection.
- Clean up test rows.

**Commit before continuing.**

---

## Phase 4.2 — Shared export shell

Every export uses the same interface. Build it **once**, reuse it. If R4 found an existing
export UI, extend that rather than creating a second one.

### Required behaviour, exactly as I specified

1. **Date range.** The user picks what to export and from which date to which date. Jalali
   dates in `YYYY/MM/DD`, matching Asan's `1405/05/12`. Use the existing `PersianDatePicker`
   per R8.

2. **Checkboxes on the right side of each row.** The user reviews what the system proposes
   and unticks rows they do not want.

3. **Every row ticked by default.** The default state is "export everything in range".

4. **Select-all for the current page** — a control that ticks or unticks every row on the
   page currently displayed.

5. **Configurable page size.** The user sets how many rows appear per page.

A distinction that has bitten this project before: "select all on this page" selects only the
visible page. If the result set spans pages, also provide "select all N matching rows" as a
**separate, clearly-labelled** control. Do not conflate them.

6. **Preview before download.** The user sees the actual rows that will be written, in the
   actual Asan column order, before the file is produced.

### Additional shell requirements
- Show assigned Asan numbers in the preview so the accountant can cross-check.
- Show "N rows selected of M in range".
- If a row cannot be exported because required data is missing — no Asan person code, no Asan
  product code, no bank accounting code, unbalanced document — show it in the preview
  **marked as blocked**, with the specific reason in Persian, and exclude it from the file.
  Do not silently drop it and do not fail the whole export. The accountant needs to see what
  is missing so she can fix it.
- For anything listed in `docs/asan/UNVERIFIED-LAYOUTS.md`, show a warning before download.
  Still produce the file. Do not block.

### Access
`admin` and `accountant`. Seed `role_permissions` explicitly for every role.

### Phase test
- Default state is all-ticked.
- Changing page size re-paginates and preserves the tick state of off-screen rows.
- "Select all on page" affects only the page; "select all matching" affects all.
- A blocked row appears in preview with a reason and is absent from the file.
- `sales` and `viewer` JWTs get 403.

**Commit before continuing.**

---

## Phase 4.3 — Export 1: Sales invoices (فروش)

### Source
**Finalized pre-invoices from `sales_quotes`.** Not `invoices` — zero rows, dead design
(rule 2.2). Determine from research which status means finalized (`accepted` and/or a
finalization marker) and export only those.

One Excel **row per invoice line**, not per invoice. The invoice number repeats across its
lines — that is how the layout works, since columns D–H are per item.

### Columns — VERIFIED, reproduce exactly

| Col | Header | Source |
|-----|--------|--------|
| A | شماره فاکتور | Asan number from 4.1 |
| B | تاریخ | quote date, Jalali `YYYY/MM/DD` |
| C | کدشخص | person's Asan code |
| D | کد کالا | product's Asan code |
| E | نام کالا | product name |
| F | تعداد | quantity |
| G | مبلغ ق | unit price |
| H | مبلغ کل | line total |
| I | دریافت نقد | cash received |
| J | واریز به بانک | bank deposit |
| K | *(leave empty — unverified)* | — |
| L | تخفیف | discount |
| M | عوارض | duties / tax |
| N | نام حساب | account name |
| O | گروه حساب/کد۲ | account group |
| P | سریال کد کالا | product serial |
| Q | بارکد کالا | barcode |
| R | تلفن/کد۳ | phone |

A–H are mandatory (highlighted in the Asan dialog). I–R are optional.

Column K appeared blank in my screenshot while purchase has `پرداخت چک` in that position.
Do not guess. Leave it empty and keep it in `docs/asan/UNVERIFIED-LAYOUTS.md`.

### Mapping rules
- **Amounts**: numeric cells, not text. No thousands separators, no currency symbol. Use the
  unit R8 determined. If R8 returned UNKNOWN for Asan's expected unit, make it an explicit
  setting with a visible label in the export UI showing which unit is being written — never a
  silent assumption. A factor-of-ten error here is the worst outcome this program can produce.
- **Dates**: Jalali, Latin digits, zero-padded.
- **Cash vs bank (I and J)**: derive from receipts linked to that quote via
  `payment_receipt_links`. A quote with no payment leaves both empty.
- **Blocked conditions**: no Asan person code, or any line whose product has no Asan product
  code.

### Phase test
- Export a known range; open the file with openpyxl; assert the header row matches the spec
  character for character.
- One row per line item, invoice number repeating.
- `sum(H)` per invoice equals the quote's `final_amount`, accounting for discount and duties.
  **This is the assertion that catches unit errors** — make it strict.
- Dates are valid Jalali strings in the exact format.
- A quote whose customer lacks an Asan code is blocked, not silently dropped.
- Export twice with the same selection; assert byte-identical output — proving numbering and
  ordering are stable.

**Commit before continuing.**

---

## Phase 4.4 — Export 2: Purchase invoices (خرید)

Identical structure to 4.3, sourced from purchase documents (per R7, determine the real
table — likely `purchase_items` and its parent).

Column differences, VERIFIED:

| Col | Header |
|-----|--------|
| I | پرداخت نقد |
| J | پرداخت از بانک |
| K | پرداخت چک |

Everything else matches sales.

Purchase invoices use their **own** Asan number sequence, independent of sales.

### Phase test
Same assertions as 4.3, plus: the purchase sequence is independent — the first purchase
export is number 1 even though sales already reached N.

**Commit before continuing.**

---

## Phase 4.5 — The shared accounting-document row builder

This phase builds the engine that exports 3, 4 and 5 all use. Build it before building them.

### VERIFIED layout

| Col | Header | Meaning |
|-----|--------|---------|
| A | کد حساب | account code |
| B | کد کالا | product code — usually empty for a financial line |
| C | شرح | description |
| D | تعداد | quantity — usually empty |
| E | بدهکار | debit |
| F | بستانکار | credit |

The dialog also carries `شماره سند` (one document number covering many lines),
`بدون مبلغ حذف شود` (rows with no amount are dropped), `کد دلخواه`, and
`بدهکاران` / `بستانکاران` checkboxes.

### Source
`journal_entries` and `journal_lines`. `account_kind` is constrained to
`customer_credit, bank, external_party, invoice_ar, clearing, other`.

### Account code resolution
Map each line's account to its Asan `کد حساب` by `account_kind`, using the fields M3 created:
- `customer_credit` → the customer's Asan person code
- `bank` → the bank account's `accounting_code`
- `external_party` → the external party's Asan code
- `invoice_ar`, `clearing`, `other` → per R5's findings

If a line's account code cannot be resolved, the **whole document** is blocked, not just that
line. A partial accounting document is worse than none — it would enter Asan unbalanced.

### The balance invariant
**Every exported document must balance: sum of debits equals sum of credits.** Not a warning,
a hard block. If a document does not balance it is excluded with a Persian explanation naming
the imbalance amount. An unbalanced document entering Asan is exactly the silent corruption
Mission Control section 5.2 forbids.

Since `بدون مبلغ حذف شود` is checked by default in Asan, a zero-amount line will be dropped
on their side. Verify that dropping zero-amount lines does not break the balance on ours —
if it would, exclude those lines on our side too so both sides agree.

### Document number
`شماره سند` is per document, not per line. It comes from the 4.1 sequence for the accounting
document type. All lines of one journal entry carry the same number.

Decide and record: should one Excel file contain one document or many? R7 asks this. If Asan
accepts many documents in one file distinguished by `شماره سند`, do that. If it accepts only
one at a time, produce one file per document or a zip — and say which in the final report.

### Phase test
- Export a known journal entry; row count equals its line count.
- `sum(E) == sum(F)` for every document in the file.
- Construct an unbalanced entry inside a transaction; assert it is blocked; roll back.
- An entry with one unresolvable account code blocks the whole document, not just the line.
- Account codes resolve correctly for each `account_kind`, including at least one
  `external_party` row.

**Commit before continuing.**

---

## Phase 4.6 — Exports 3, 4 and 5

Three thin layers over the 4.5 builder. Each is a different filter and a different label; the
row construction is shared.

### Export 3 — Receipts / deposits (دریافت · واریز)
Money coming in. Source: approved `payment_receipts` and their `payment_receipt_links`, and
the journal entries they produced. Debit the receiving account (our bank, or cash), credit
the payer.

### Export 4 — Payments / withdrawals (پرداخت · برداشت)
Money going out. The mirror: debit the payee, credit the source account.

### Export 5 — Third-party documents (دوبل)
The case where someone I owe tells me to pay into a different person's account, or I give a
customer's account to someone who owes me. These are journal entries involving an
`external_party` line.

Per R5, if the current model cannot fully represent this case, build what is representable
and write the gap into `docs/asan/UNVERIFIED-LAYOUTS.md` under `## MODEL GAPS`, describing
exactly what data would need capturing. **Do not invent a data model for it in this mission.**

### Phase test
- Each export produces the six-column layout with identical headers.
- Receipts contain only approved receipts; amounts match source.
- Payments mirror correctly — debit and credit on the expected sides.
- Third-party export contains only entries with an `external_party` line.
- All three balance.
- Assert the three exports share one row-builder: changing the builder changes all three.
  Prove this with a test that would fail if someone later forked the logic.

**Commit before continuing.**

---

## Phase 4.7 — Secondary export: bank deposits (واریزیهای بانکی)

An alternative path for bank deposits, using the Latin-header layout.

| Col | Header | Source |
|-----|--------|--------|
| A | Date | receipt date, Jalali |
| B | Code_M | payer's Asan person code |
| C | Name_Moshtari | payer name |
| D | Shomare_Peygiri | receipt tracking / reference number |
| E | Mablagh | amount |
| F | Bank_cod | receiving bank's Asan code, per R5 |

Reproduce the Latin transliterations **exactly** as written. Do not translate them to Persian
and do not normalize the spelling.

Present it in the UI as a secondary option alongside the accounting-document export for
deposits, clearly labelled so the accountant knows which one Asan screen it targets.

### Phase test
- Header row matches the Latin transliterations exactly.
- Amounts numeric, matching source receipts.
- Only approved receipts appear.
- The same receipt exported through both paths shows the same amount and payer.

**Commit before continuing.**

---

## Phase 4.8 — Pre-invoice Excel export

A single-document export from a pre-invoice detail page. Per my answer, it is **for importing
into Asan**, so it follows the sales layout from 4.3, not a customer-facing format.

Reuse the 4.3 row-builder. Do not write a second mapping — one source of truth for the sales
layout, called from two places.

### Phase test
From a single quote, export and assert the output is byte-identical to that quote's rows in a
range export covering the same quote. Identical logic must produce identical bytes.

---

## MISSION GATE

1. `npm run typecheck` → exactly 70.
2. `docs/asan/UNVERIFIED-LAYOUTS.md` complete and current.
3. Every export module has explicit `role_permissions` rows — prove with a query.
4. Everything committed. Tree clean.
5. Build, deploy, verify three signals. `docker restart afrakala-lan-rest`.
6. Full e2e against baseline.
7. New specs registered in `playwright.config.ts`:
   - `e2e/asan/export-numbering.spec.ts`
   - `e2e/asan/export-shell.spec.ts`
   - `e2e/asan/export-sales.spec.ts`
   - `e2e/asan/export-purchase.spec.ts`
   - `e2e/asan/export-journal.spec.ts`
   - `e2e/asan/export-receipts-payments.spec.ts`
   - `e2e/asan/export-preinvoice.spec.ts`
8. Update `docs/execution/asan-progress.md`.
9. **Immediately proceed to `docs/execution/M5_VIDEO_AND_FINAL.md`.** Do not wait for me.
