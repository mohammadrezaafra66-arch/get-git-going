# Phase 0 — final report

**Purpose.** Consolidate everything the read-only investigations established, so no later phase
re-derives a settled fact and no agent needs access to the conversation that produced them.

**Status:** research complete, documents written, awaiting **OG-1**.

---

## 1. Investigations completed

| # | Question | Answer | Report |
|---|---|---|---|
| 1A | What does the receipt create page do, front to back? | Four plain PostgREST inserts, no RPC, no journal entry | `RECEIPTS-CREATE-MAP.md` |
| 1B | What does the Asan export depend on? | Nine of 33 fields are untouchable; ledger reach ≠ export reach | `ASAN-EXPORT-CONTRACT.md` |
| 1C | Which export actually works? | None produce exportable rows; three are structurally empty | `ASAN-EXPORT-REALITY.md` |
| 1D | How were exports produced historically? | Abandoned — answered from project history: only ~3 test documents ever exported | — |
| 1E | What data is missing? | 13/23 customers lack an Asan code; supplier-less purchases are test residue | `DATA-GAP-WORKLIST.md` |

All were read-only. No writes, no container restarts, production never contacted.

---

## 2. The five findings that shaped the roadmap

1. **The ledger is empty and nothing fills it.** One `journal_entries` row. The receipt page calls no
   RPC; `createPaymentVoucher` is a bare insert. Party balances are not real.
2. **The owner imports the ledger-backed Asan layout** (Persian headers, بدهکار / بستانکار).
   Therefore the ledger is a hard prerequisite, not a later phase. This single fact reordered the
   whole programme.
3. **Ledger reach and export reach are different questions**, and neither contains the other. Three
   fields reach an export file without touching the ledger; two touch the ledger without reaching any
   file. `description` was nearly deleted as "stored only" — it is in fact the only free-form context
   an accountant sees inside an Asan document.
4. **Most of the code exists; the wiring does not.** `post_receipt_accounting` works.
   `payment_vouchers` already has the columns and the XOR constraint. `pay_purchase_with_voucher`
   already posts. Phase 3 is wiring, not building.
5. **A dual document cannot classify under the current export.** The classifier infers kind from
   line shapes; a dual document has no bank line and lands in `unclassified`, appearing under no menu
   option. This is why A1 adds an explicit `doc_kind`.

---

## 3. Defects found and where they are fixed

| Defect | Fixed in |
|---|---|
| Rollback calls DELETE on a table with no DELETE policy → guaranteed orphan | Phase 2 (single RPC) |
| Confirmed security warnings discarded on one dialog path | Phase 2 (fields removed by T4) |
| Journal preview materially false and its caption doubly wrong | Phase 6 (server-side or removed) |
| `beneficiary_accounting_code` dead — its only reader neutered | Phase 1.1 + moved to the dual branch |
| `trg_payment_receipts_post_journal` fires and does nothing | Phase 1.1 |
| `supplier_payable` summed as `credit − debit` while only ever debited | Phase 3 |
| `tracking_number` NOT NULL but cash has none | Phase 2.5 |
| A customer's mirror `accounting_code` disagrees with `person_identifiers` | Phase 1.3 (identifier only) |

---

## 4. Decisions locked

Owner: T1–T8 in `ledger-decisions.md`. Architecture: A1–A4, pending OG-1.
Safe defaults: D1–D18 in `decisions.md`. Out of scope: `deferred.md`.

---

## 5. Readiness for phase 1

| Check | State |
|---|---|
| Ground truth recorded with evidence | Done |
| Architecture decisions written with rationale | Done, pending OG-1 |
| Safe defaults recorded | Done |
| Task list with scope, effort and acceptance | Done — 69 tasks |
| RPC contracts specified | Done |
| Rollback plan per phase | Done |
| Audit and immutability spec | Done |
| Owner-Gates enumerated | Done — 6 + OG-7 |
| **OG-1 answered** | **Open — the only blocker** |

---

## 6. Risks carried into phase 1

| Risk | Mitigation |
|---|---|
| Task 1.1 deletes a function that turns out to matter | Capture `pg_get_functiondef` for both objects into the progress file **before** dropping; OG-2 |
| `doc_kind` backfill misclassifies the existing entry | One row only; verify by hand |
| Widening the `account_kind` CHECK breaks `validate_journal_line_ref` | Task 1.4 updates both together |
| A new module left unseeded in `role_permissions` is open to all roles | Task 1.7, with a gate asserting every role has a row |
| Test data too thin to exercise a path | Accepted by the owner; phase 8 seeds what tests need |

---

## 7. What phase 0 deliberately did not do

No code, no schema change, no data repair, no production contact. Phase 0 produced understanding and
documents only — which is the point of separating research from execution.
