# Which Asan export actually works — 2026-08-17

**Code HEAD:** `99f6bd58` (working tree exactly `origin/staging`, 0 ahead / 0 behind — no `git pull` run, per Section 2)
**Live `APP_GIT_SHA`:** `bfcc723a` · **Branch:** `staging` · **git status:** 11 lines, all untracked and pre-existing
**Date range used:** `2026-07-25` .. `2026-08-10`
Derived from the data, not hardcoded: `LEAST(min(journal_entries.entry_date), min(payment_receipts.payment_date))` .. `GREATEST(max(...), max(...))` — query `M0`/`M0b`. `journal_entries.entry_date` spans 2026-07-25..2026-07-25 (1 row); `payment_receipts.payment_date` spans 2026-07-25..2026-08-10 (7 rows). The range covers every row in both tables.

**Method: the function bodies were REPLICATED, not invoked.** Both `asan_list_journal_export` and `asan_list_bank_deposit_export` are `SECURITY DEFINER` and open with `has_any_role(auth.uid(), …)`; `auth.uid()` is NULL in `psql`, so calling them raises `42501`. Each body was read with `pg_get_functiondef`, the role guard and the date-range guard stripped, and the identical `RETURN QUERY` block run as a plain read-only `SELECT` over the derived range. The counts below are therefore exactly what each function would have returned for an authorised caller.

One deliberate simplification, stated so it can be checked: `asan_list_journal_export` applies `_filter` only in its final `WHERE _filter = 'all' OR k.dkind = _filter`. So the replication was run **once** and grouped by `k.dkind`. Rows for `_filter='receipt'` are exactly the rows where `dkind='receipt'`, and so on. This is equivalent to four separate invocations, not an approximation.

Persian `blocked_reason` strings were never printed; the replication emits ASCII cause codes derived from the same `CASE` branches, and all output was routed to a file inside the container with `\o`.

---

## 1. VERDICT TABLE

| # | Export option (Persian label) | Function + filter | Rows | Distinct docs | Exportable | Blocked | Usable today? |
|---|---|---|---|---|---|---|---|
| 3 | دریافت‌ها و واریزها | `asan_list_journal_export(_filter='receipt')` | **2** | **1** | **0** | **1** | **NO** — the one document is blocked |
| 4 | پرداخت‌ها و برداشت‌ها | `asan_list_journal_export(_filter='payment')` | **0** | **0** | **0** | **0** | **NO** — returns nothing at all |
| 5 | اسناد شخص ثالث (دوبل) | `asan_list_journal_export(_filter='third_party')` | **0** | **0** | **0** | **0** | **NO** — returns nothing at all |
| 6 | واریزی‌های بانکی (مسیر جایگزین) | `asan_list_bank_deposit_export` | **1** | **1** | **0** | **1** | **NO** — the one row is blocked |

(`_filter='settlement'` and `dkind='unclassified'` also return **0 rows**; neither is offered on the page.)

**All four exports produce zero exportable rows on this database today.** That is a stronger and more uncomfortable result than the mission's hypothesis, which expected the fourth to work. It does not — but it fails for a **different kind of reason** than the other three, and that distinction is the whole finding:

- **Options 4 and 5 return 0 rows for a structural reason.** There is no ledger entry of those kinds, and nothing in the system has ever written one.
- **Options 3 and 6 each return exactly 1 document, and both are blocked by the same data-quality condition** — a missing `asan_person_code` for one customer. Neither is blocked by anything structural.

---

## 2. LEDGER POPULATION

| Table | Rows |
|---|---|
| `journal_entries` | **1** |
| `journal_lines` | **2** |

`journal_entries` by `status` (`M1b`): `posted` = **1**. No `draft`, no `void`.
`journal_entries` by `source_type` (`M1c`): `payment_receipt` = **1**. Nothing else.
Crosstab (`M1d`): `payment_receipt` / `posted` = **1**. That is the entire table.

**This is the ceiling on what the three accounting-document exports can ever return.** One entry, two lines, one source type.

---

## 3. BLOCKED REASONS, WITH COUNTS AND CAUSES

### Option 3 — `asan_list_journal_export(_filter='receipt')` (`M2b`)

| ASCII cause | Documents | What produced it |
|---|---|---|
| `NO_ASAN_CODE_customer_credit` | **1** | The `customer_credit` line's `account_ref_id` resolves to a customer whose person has **no `asan_person_code` row** in `person_identifiers`. The `CASE jl.account_kind WHEN 'customer_credit'` arm returns NULL, `agg.bad_kind` picks it up, and the document is blocked with «کد حساب آسان برای «…» ثبت نشده است» |

No document was blocked for `NO_LINES`, `FRACTIONAL_AMOUNT`, or `UNBALANCED`. The single entry is balanced (10,100,000,000.00 on both sides) and both amounts are whole.

### Option 6 — `asan_list_bank_deposit_export` (`M3`)

| ASCII cause | Rows | What produced it |
|---|---|---|
| `BLOCKED_no_person_code` | **1** | `pcode` resolved NULL — the sub-select on `person_identifiers` for `COALESCE(customer_person_id, customers.person_id)` with `kind='asan_person_code'` found no row. First branch of the `blocked_reason` `CASE` |

The bank code was **not** the problem: the destination bank account has a non-blank `accounting_code`. The amount is positive and whole. Only the person code is missing.

### The two blocks are the same underlying fact

Both exports fail on the **same customer** missing the **same identifier**, reached by two different paths — option 3 via `journal_lines.account_ref_id → customers`, option 6 via `payment_receipts.customer_person_id`. Confirmed at receipt level (`M9b`): the one approved receipt `fd8194a5-…` has `has_customer_person = t` but `has_asan_code = f`.

Meanwhile `person_identifiers` holds **11 rows** of `kind='asan_person_code'` across **11 distinct persons** (`M9`). So the identifier mechanism is populated in general — it is absent for this one customer specifically.

`asan_control_accounts` (`M8`) holds exactly **1 row**: `invoice_ar = 989`. `clearing` and `other` have no row, so those account kinds would always block — but no line of either kind exists, so this did not contribute to any block measured here.

---

## 4. RECEIPTS THAT APPEAR IN NO EXPORT

`M5`:

| Metric | Count |
|---|---|
| `payment_receipts` total | **7** |
| `status = 'approved'` | **1** |
| approved **and** `destination_bank_account_id IS NOT NULL` | **1** |
| approved **and** `destination_bank_account_id IS NULL` | **0** |
| not approved | **6** |

**Receipts appearing in no export at all: 6** — all of them because `status <> 'approved'`, which is the filter on every receipt-reading export.

Breakdown by shape (`M5b`):

| status | has dest bank | has receiver party | n |
|---|---|---|---|
| `approved` | yes | no | **1** |
| `pending_review` | no | **yes** | **5** |
| `pending_review` | yes | no | **1** |

**Five of the seven receipts are mode-2 (external party).** If any of them were approved, it would be excluded from option 6 outright — `destination_bank_account_id IS NOT NULL` — and would route to option 5 (`third_party`), not option 3. None is approved, so this is latent rather than active.

---

## 5. PAYMENT VOUCHERS AND THEIR LEDGER COVERAGE

`M6`:

| Metric | Count |
|---|---|
| `payment_vouchers` total | **0** |
| of those, from a purchase | **0** |
| `journal_entries` with `source_type='payment_voucher'` | **0** |

`M6b`:

| Metric | Count |
|---|---|
| `mutual_settlements` total | **0** |
| `journal_entries` with `source_type='mutual_settlement'` | **0** |

**Option 4 («پرداخت‌ها و برداشت‌ها») has no possible source today.** Its only feeders are payment vouchers and settlements, and both tables are empty. The same is true for the settlement filter, which the page does not offer.

---

## 6. ASAN EXPORT NUMBERS — evidence of real-world use

`M7` — the full table, 2 rows:

| doc_type | source_id | asan_number | assigned_at (UTC) | burned |
|---|---|---|---|---|
| `accounting_document` | `6d6b1896-…` (the one journal entry) | 1 | **2026-08-05 21:18:38** | no |
| `sales_invoice` | `bcbe3ce6-…` | 1 | **2026-08-08 01:09:48** | no |

Neither is burned (`burned_at` empty on both).

**This is the strongest available evidence of which export was actually used.** Numbers are minted only on download, never on preview. So:

- **A journal export (`accounting_document`) was downloaded at least once, on 2026-08-05**, for the single receipt-sourced entry that exists.
- **A sales export was downloaded at least once, on 2026-08-08.**
- **No `purchase_invoice` number was ever assigned.**

**Critical asymmetry — read before drawing a conclusion from this table.** Option 6 (`bank_deposits`) has `docType: null` (`src/lib/asan/export-bank-deposit.ts:45`) and **never mints a number at all**. Its absence from `asan_export_numbers` is therefore **not evidence that it was never used**. This table can only ever show usage of the journal, sales and purchase exports. It cannot answer the owner's question about the bank-deposit path.

**A sequencing observation, offered as a hypothesis and explicitly not as a finding.** The `accounting_document` number was assigned 2026-08-05; the mission states the test database was anonymised 2026-08-14; the customer's `asan_person_code` is now missing. Those three facts are consistent with the journal export having worked on 2026-08-05 and being blocked *afterwards* by anonymisation. **`UNCERTAIN` — I did not verify what anonymisation touched, and nothing measured here establishes the causal link.**

---

## 7. FRONT-END OPTION → FUNCTION MAPPING

Confirmed by reading the code. The dropdown is rendered from `ASAN_EXPORT_ORDER` (`src/lib/asan/export-registry.ts:33-40`) over `ASAN_EXPORTS` (`:22-30`).

| # | Persian label | Registry key | Calls | Filter | Evidence |
|---|---|---|---|---|---|
| 1 | فاکتورهای فروش | `sales` | `asan_list_sales_export` | — | `export-sales.ts:29`, label `:44` |
| 2 | فاکتورهای خرید | `purchase` | `asan_list_purchase_export` | — | `export-purchase.ts:34`, label `:49` |
| 3 | دریافت‌ها و واریزها | `receipts` | **`asan_list_journal_export`** | **`'receipt'`** | `export-journal.ts:34` via `makeJournalExport("receipts", "دریافت‌ها و واریزها", "receipt", …)` `:74-79` |
| 4 | پرداخت‌ها و برداشت‌ها | `payments` | **`asan_list_journal_export`** | **`'payment'`** | same call site `:34`; `makeJournalExport(… "payment" …)` `:82-87` |
| 5 | اسناد شخص ثالث (دوبل) | `third_party` | **`asan_list_journal_export`** | **`'third_party'`** | same call site `:34`; `makeJournalExport(… "third_party" …)` `:90-96` |
| 6 | واریزیهای بانکی (مسیر جایگزین) | `bank_deposits` | **`asan_list_bank_deposit_export`** | — | `export-bank-deposit.ts:32`, label `:42` |

**Certainty on the two points the mission asked to confirm:**
- The option labelled «واریزیهای بانکی (مسیر جایگزین)» **is** the one calling `asan_list_bank_deposit_export` (`export-bank-deposit.ts:32` inside `listBankDeposits`, wired as `list:` at `:51`).
- Options 3, 4 and 5 **all** call `asan_list_journal_export` with the three filters, through a single factory `makeJournalExport(key, label, filter)` (`export-journal.ts:48-67`), whose `list:` is `(range) => listJournalDocuments(range, filter)` (`:64`).

Note the exact label string in code is «واریزیهای بانکی (مسیر جایگزین)» — without the ZWNJ the mission text uses in «واریزی‌های». Cosmetic; the mapping is unambiguous.

Options 3–5 carry `docType: "accounting_document"` and `oneDocumentPerFile: true` (`export-journal.ts:59-61`). Option 6 carries `docType: null` and `oneDocumentPerFile: false` (`export-bank-deposit.ts:45-46`).

The code's own words on option 6 (`export-bank-deposit.ts:48-50`): «این مسیرِ جایگزین است؛ مسیر پیش‌فرض برای دریافت‌ها «سند حسابداری» است.» — the developer's stated default for receipts is the accounting-document path, i.e. option 3.

---

## 8. WHAT THIS MEANS FOR THE REBUILD

**Yes — the internal ledger is a prerequisite for the three accounting-document exports, unambiguously.** Options 3, 4 and 5 read `journal_entries`, which holds exactly **1 row** (`M1a`), of exactly one `source_type` (`payment_receipt`, `M1c`). Options 4 and 5 return **0 rows** because payment vouchers and settlements have never written a ledger entry — `payment_vouchers` = 0 rows and `journal_entries` with `source_type='payment_voucher'` = 0 rows (`M6`). Since the receipt-creation page writes no journal entry, every future document those three exports could carry has to be put into the ledger by something that does not exist yet or is not being used. **Option 6 is the one export that does not depend on the ledger at all** — it reads `payment_receipts` directly — and its single row today is blocked by a missing `asan_person_code`, a data condition, not a structural one. So: if the owner's working export is option 6, the rebuild can proceed without ledger work; if it is option 3, 4 or 5, ledger posting is a prerequisite and not a later phase.

---

## 9. LIMITS OF THIS MEASUREMENT

**This is the test database.** Per the mission statement it was anonymised on 2026-08-14 and it holds very few rows: 7 receipts, 1 journal entry, 2 journal lines, 0 payment vouchers, 0 settlements, 2 assigned Asan numbers. Production is a different machine (`192.168.170.10`, `C:\afrakala`, database `postgres`) and **was not touched by this mission**.

What these numbers **can** prove:

- The four export functions execute and their filters behave as their bodies say.
- On *this* database, options 4 and 5 have no source rows whatsoever, and that is structural — the feeder tables are empty, not merely unposted.
- A journal export and a sales export were each downloaded at least once, on 2026-08-05 and 2026-08-08.
- The block conditions are real and reachable; two different exports hit the same missing-identifier condition.

What these numbers **cannot** prove:

- **Anything about production volumes, or which export the owner actually imports.** A test database with one journal entry says nothing about how many entries production holds.
- **Whether option 6 has ever been used.** It mints no document number, so no trace of its use exists anywhere in the schema. Its absence from `asan_export_numbers` is a property of its design, not evidence.
- **Whether the missing `asan_person_code` reflects production reality or is an artefact of the 2026-08-14 anonymisation.** 11 persons do have the identifier; this one customer does not. `UNCERTAIN`.
- **Whether production's `journal_entries` is equally empty.** If production has been posting receipts through the detail page for months, its ledger could be well populated and options 3–5 could work there. Nothing here rules that in or out.

**The one measurement that would settle the owner's question is a read-only count of `journal_entries` and `asan_export_numbers` on the production database.** That is outside this mission's scope, which is explicitly test-only, and it would need the owner's authorisation. Recorded here as the obvious next step, not performed.

---

## BLOCKED

Nothing was blocked by the read-only constraint.

Deliberate non-actions, per the mission rules:

- **Neither export function was invoked.** Both bodies were read with `pg_get_functiondef` and replicated as plain `SELECT`s with the role guard stripped. Every count in §1 and §3 comes from a replication.
- **No `git pull`** — the tree was already exactly `origin/staging`, so it would have been a no-op merge.
- **Production was not contacted** in any form.
- Temp SQL was written to the session scratchpad (`C:\afrakala-backups\` does not exist on this host), `docker cp`'d in as `/tmp/phase1c.sql` and `/tmp/dump-bodies.sql`. Host copies deleted; container `/tmp` copies left in place, since deleting them would be a container write.

One departure from the letter of the brief, stated so it can be judged: Section 3 asked for the journal export to be run three times, once per filter. It was run **once** and grouped by `dkind`, because `_filter` is applied only in the function's final `WHERE` clause. The per-filter numbers in §1 are exact, not derived or estimated.

---

```
=== HANDOFF STATE ===
Exports measured:        4 of 4 yes
Ledger a prerequisite:   yes — for options 3, 4 and 5 (journal). NO for option 6 (bank deposits)
Functions invoked:       NO — bodies replicated only
Writes performed:        NONE
Container restarted:     NO
Production touched:      NO
Files produced:          docs/research/ASAN-EXPORT-REALITY.md
Next phase:              human review.
```
