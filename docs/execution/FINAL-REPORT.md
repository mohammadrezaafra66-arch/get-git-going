# FINAL REPORT — AfraKala Live Ledger Programme

Template. Completed by the Lead Orchestrator at the end of phase 9.
**Written from recorded evidence in the phase progress files, not from memory.**

---

## 1. Verdict

```
Programme:              AfraKala Live Ledger
Started:                <date>          Finished:  <date>
Phases complete:        <n> of 10
Tasks complete:         <n> of 69
Final commit (main):    <sha>
Production APP_GIT_SHA: <sha>           Match: <yes/no>
Definition of done met: <yes/no/partial>
```

One paragraph: does creating a receipt, a payment or a dual document now post a balanced immutable
entry and move the party balance, and do all three Asan exports return real files? **State partial
results as partial.** A programme reported complete that is not is worse than one reported honestly
incomplete.

---

## 2. What was built

| Phase | Delivered | Verified by |
|---|---|---|
| 1 | Document numbers, mandatory Asan code, new account kinds, `doc_kind`, attachments, immutability | |
| 2 | `create_receipt` — posts and moves the customer balance | |
| 3 | `create_payment` — posts and moves the supplier balance | |
| 4 | `create_dual_document` — one document, two parties | |
| 5 | Three Asan exports returning real rows | |
| 6 | Three-branch wizard | |
| 7 | OCR on all three branches | |
| 8 | End-to-end verification | |
| 9 | Production | |

---

## 3. Definition of done — item by item

| # | Criterion | Met | Evidence |
|---|---|---|---|
| 1 | One balanced, posted, immutable entry per document, in one transaction | | |
| 2 | No document creatable for a party without an Asan code | | |
| 3 | Every document has a stable human-readable number | | |
| 4 | All three Asan exports return exportable rows | | |
| 5 | Wizard covers all three branches with OCR | | |
| 6 | Every phase progress file shows its tests with real output | | |

---

## 4. Test results

| Level | Run | Passed | Failed |
|---|---|---|---|
| Task acceptance | | | |
| Phase tests | | | |
| Stress (phases 1–4) | | | |
| E2E (phase 8) | | | |
| Negative tests | | | |

Typecheck: `<n>` against the 70 baseline. Above 70 is a real regression and must be explained.

---

## 5. Owner-Gates

| Gate | Asked | Answered | Answer | Delay caused |
|---|---|---|---|---|
| OG-1 … OG-7 | | | | |

---

## 6. Contradictions found against ground truth

Everything measured that disagreed with `ground-truth.md`, and what was done about it. **An empty
table here is suspicious**, not reassuring — a programme this size that found nothing unexpected
probably did not look.

| # | Expected | Found | Impact | Resolution |
|---|---|---|---|---|

---

## 7. Reviewer escalations

| Task | Reviewer | Objection | Lead's decision | Right in hindsight? |
|---|---|---|---|---|

---

## 8. What was deferred

From `deferred.md`, plus anything newly deferred during execution. The largest known gap:
**accrual accounting for sales and purchases**. Until it is built, party balances reflect payments
only, not what is owed, and Asan remains the source of truth for receivables.

| Item | Why | Where it belongs |
|---|---|---|

---

## 9. Known defects at handover

Anything shipped with a known flaw. **Better named here than discovered later.**

| Defect | Severity | Workaround | Ticket |
|---|---|---|---|

---

## 10. Migrations applied

| # | File | Phase | Applied | Rollback | REST restarted |
|---|---|---|---|---|---|

---

## 11. Operating notes for whoever comes next

1. The three RPCs are the only supported way to create these documents. A direct PostgREST insert
   into `journal_entries` is impossible by construction — there is no INSERT policy.
2. Posted entries are immutable. Correct by reversal, never by edit.
3. An Asan code is mandatory. A party without one cannot have a document recorded — by design.
4. Amounts are Toman everywhere in SQL. The ×10 to Rial happens once, in `src/lib/asan/amounts.ts`.
5. After any migration, restart `afrakala-lan-rest` or PostgREST serves a stale schema.
6. The 70 typecheck errors are baseline, not regression.
7. Asan cannot be verified from here. Before trusting a new export shape, **open the file in Asan**.

---

## 12. Recommended next programme

In priority order, with the reason each matters:

1. **Accrual for sales and purchases** — without it, balances are payment-only and Asan stays the
   source of truth. The single largest gap.
2. **Cheque lifecycle** — clearing, bouncing, portfolio, due-date alerts.
3. **Production data repair** — supplier links and Asan codes; owner work.
4. **Drop the columns hidden in this programme** — `receipt_type` and the security-warning fields,
   once phase 8 has proven nothing reads them.
