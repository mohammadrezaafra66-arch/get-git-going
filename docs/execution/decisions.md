# Safe defaults — decisions taken without the owner

`ledger-decisions.md` carries the binding decisions. This file records every **ambiguity resolved by
the executing architect** so no task stalls waiting for an answer. Each has a default, a reason, and
what would overturn it.

**These are reversible.** If the owner disagrees with any one, say so and it changes.

---

## D1 — `receipt_type` is kept in the schema, removed from the UI
The column is `NOT NULL` with a default. The RPC sends the fixed default so existing rows and any
remaining reader keep working. **Dropping a column is irreversible; hiding a field is not.**
*Overturned by:* the owner asking for a clean schema, in which case it drops after phase 8.

## D2 — Cash uses `account_kind='bank'`
A cash box is already a `bank_accounts` row with `account_type='cash'`. Introducing a `cash` account
kind would mean a new CHECK value, a new `validate_journal_line_ref` branch, and a new Asan
resolution path — for a distinction the data already makes.
*Overturned by:* Asan requiring a different account code shape for cash.

## D3 — Document number format `<PREFIX>-<jalali year>-<6 digits>`
`RCP-1405-000042`, `PAY-1405-000007`, `DUAL-1405-000003`. A separate series per type, mirroring
Asan's separate registers. Jalali year because the accountant reads it.
*Overturned by:* an Asan constraint on number format.

## D4 — `max+1` under an advisory lock, never a sequence
A sequence burns a value on any rolled-back transaction, producing gaps nobody can explain.
`max+1` under a lock leaves no trace when it rolls back. This mirrors `asan_assign_document_number`,
which already works.
*Overturned by:* nothing. Contention at this volume is negligible.

## D5 — Fractional amounts rejected at creation
The Asan export blocks fractional Toman, so a fractional document would be created and then silently
withheld. Better to refuse at the door with a readable message.
*Overturned by:* nothing.

## D6 — `require_asan_code` reads only `person_identifiers`
It never falls back to `customers.accounting_code`. That mirror can disagree — one test customer has
a mirror value and no identifier row — and the export reads the identifier. Two sources of truth for
an account code is how they drift. Migration 295 already carries an explicit gate to this effect.
*Overturned by:* nothing.

## D7 — A cheque posts on receipt, to `cheque_receivable`
Answers open question Q3. Receiving a cheque changes what the customer owes us the moment we accept
it, so it posts then. Clearing and bouncing are lifecycle events for a later programme — see
`deferred.md`.
*Overturned by:* the accountant preferring cheques off-ledger until cleared, which would mean cheque
branches record without posting.

## D8 — Cheque lines are **skipped** by the Asan export, not blocked
`cheque_receivable` / `cheque_payable` have no Asan account code yet. The export must ignore those
lines rather than withhold the document. Blocking would silently hide every cheque document.
*Overturned by:* the owner supplying Asan codes for cheque accounts, after which they resolve
normally.

## D9 — `create_dual_document` takes one amount, not two
The two sides must be equal or the entry does not balance, and an unbalanced document is dropped
from the export entirely. The UI may show two fields; the contract takes one.
*Confirmed by the owner 2026-08-18:* the two sides of a dual document are always equal. If 100 is owed
and only 60 goes to the creditor while 40 comes to us, that is **two documents** — one dual document
for 60 and one ordinary receipt for 40 — never one dual document with unequal sides.
*Overturned by:* a real case of an unequal dual document, which would be a different document type.

## D10 — The dual document gets its own source table if `mutual_settlements` does not fit
Task 4.2 reads `mutual_settlements` first and decides. It was built for netting a customer against a
supplier, which is a related but distinct operation. **Read before deciding, and record the choice.**
*Overturned by:* the shapes turning out identical, in which case reuse it.

## D11 — Reversal, not editing
Posted entries are immutable, so correction creates a reversing entry. Simpler than partial-edit
rules and leaves an audit trail an accountant can follow.
*Overturned by:* nothing.

## D12 — The old create path survives until task 6.9
Phases 2–5 add RPCs without removing the existing form, so a failure in a new RPC does not stop the
business. Removal happens once the wizard replaces it.
*Overturned by:* nothing.

## D13 — Both halves of the Asan-code rule are required
Form and database. A form-only check is bypassed by a direct PostgREST call; a database-only check
gives the user a raw error. Both, always.
*Overturned by:* nothing.

## D14 — 70 typecheck errors remain the baseline
Documented, across 6 files, caused by the Supabase CLI not being installed. New columns are worked
around with casts. **Not a regression — do not "fix" them.** A count above 70 is a real failure.
*Overturned by:* installing the CLI and regenerating types, which is out of scope.

## D15 — Stress tests use 50 concurrent operations
Enough to expose an advisory-lock or transaction-boundary defect; small enough to run in seconds on
the test machine.
*Overturned by:* a real concurrency defect appearing at higher volume.

## D16 — Persian error messages are part of the API contract
`P0001` messages surface directly in the UI. They are written for the user, not the developer, and
are covered by acceptance tests.
*Overturned by:* nothing.

## D17 — `_filter` values stay `all|receipt|payment|third_party`
Task 5.1 changes what the filter means internally (`third_party` → `doc_kind='dual'`) but keeps the
external values so the front end and any other caller keep working.
*Overturned by:* nothing.

## D18 — Test data is not repaired as part of this programme
13 of 23 customers lack an Asan code. That is data entry on production data (phase 9.6), not
infrastructure. Phase 8 seeds only the few complete records the tests need.
*Overturned by:* nothing — the owner has confirmed incomplete test data is acceptable.
