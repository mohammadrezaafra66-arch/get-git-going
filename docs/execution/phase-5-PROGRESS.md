# Phase 5 — Asan exports live — PROGRESS

> **REQUIRED INPUT 5.1 — CLOSED by migration 366.**
> Classifier now reads `journal_entries.doc_kind`. `_filter='receipt'` is stored receipts
> (including reversal pairs). It is **not** "deposits that still stand": both legs of a
> reversed bank receipt appear. T14: no ledger-derived figure is labelled a party's total
> balance or total debt. Dual documents filter as `third_party`.

Copied from `phase-TEMPLATE-PROGRESS.md`. Filled as the phase ran.

## HANDOFF STATE

```
Phase:                5 — Asan exports live
Status:               complete
Branch:               feature/phase-5-asan-exports
Base:                 staging @ 42dd7f4c
Tasks:                5 of 5
Current task:         none — stop; Gate A follows; phase 6 not started
Blocked by:           nothing
Migrations applied:   366
REST restarted after: yes
Backup taken:         D:\AfraKalaBackups\pre-phase5-20260819-170903.dump (16,948,071 bytes)
Typecheck:            70 / 70 baseline
Last commit:          (this PR)
PR:                   (fill after merge)
Test data created:    NONE that persists
Census:               dual=0 je=3 jl=6 receipts=8 vouchers=0 functions=841 conc=1
```

## Pre-flight

- [x] `git fetch origin && git switch staging && git pull --ff-only` — `42dd7f4c`
- [x] `git switch -c feature/phase-5-asan-exports`
- [x] Backup taken
- [x] ground-truth re-verified (contradictions table)
- [x] `366-down.sql` written before 366; dry-run 841→841

### Ground-truth facts this phase depends on

| Claim | Re-run | Verdict |
|---|---|---|
| `journal_entries` 1 row | **3** (seed + OG14-CONC pair) | contradiction 1 — leftover recorded for phase 8 |
| Export exists, `(date,date,text)` | live identity arguments match | holds |
| `invoice_ar` = 989 | `989` | holds — 5.4 already satisfied |
| `journal_lines_one_side` | count=1 | holds |

### §F — what writes, what reads, what the accountant concludes

**Writes this function:** nothing. Read-only.

**Depends on / read by:** `src/lib/asan/export-journal.ts` → registry → `/admin/asan-export`.
No other SQL function calls it.

**Accountant:** imports the Excel into Asan. A balanced wrong classification becomes a real book
error. After 366, a reversed bank receipt is two `receipt` documents (original debit bank /
credit customer; reversal the swap). Importing **both** is the D11 trail. Importing only the
receipt filter and treating it as "cash that still sits in the bank" is **false** — the pair nets.
T14: totals in the file are movement amounts, not a party's debt.

Cheque: the document is listed; cheque lines are omitted; the leftover party line is also omitted
so Asan does not receive a one-sided voucher. Blocked reason is the cheque-skip sentence, not
«کد حساب آسان برای … ثبت نشده است».

## Baseline (before 366)

Fixed range `2026-07-01` .. `2026-08-31`, admin JWT, `BEGIN…ROLLBACK`.
File: `docs/verification/phase-5-export-baseline.txt`.

| Filter | Result |
|---|---|
| `all` | 3 docs / 6 lines. Reversal `51e00e30` **payment**. Original `2c972cd3` **receipt**. Seed blocked. |
| `receipt` | 4 lines (seed + original). Reversal **absent**. M1. |
| `payment` | n=2 (the reversal) |
| `third_party` | 0 |

## After 366

File: `docs/verification/phase-5-export-after.txt`.

| Filter | Result |
|---|---|
| `all` | same 3 docs. Reversal **receipt**. Heuristic gone (`bank_net`/`has_external` absent from `prosrc`). |
| `receipt` | **6 lines / 3 docs** including the reversal |
| `payment` | **0** on the live database |
| `third_party` | **0** on the live database |

Every live row that changed kind: **`51e00e30` payment → receipt**. No other row changed shape.

---

## Task 5.1 — classifier reads stored `doc_kind` — **PASS**

```
Scope:      supabase/migrations/20260819170000_366_asan_journal_export_doc_kind.sql
            docs/verification/366-down.sql
Effort:     M

Acceptance: each filter returns ≥1 exportable document
Live DB:    receipt docs=3; payment=0; third_party=0
Inside BEGIN…ROLLBACK after create_payment + create_dual_document:
            FILTER_GE1 receipt=4 payment=1 third_party=1 all=6
Verdict:    PASS (live emptiness is real data, not a classifier miss)

Reviewers:
  Observer: PASS — old heuristic not left beside the new CASE.
  Software Engineer: PASS — stored_kind maps dual→third_party; reversal keeps receipt.
  Security Engineer: PASS — ACL re-granted; 294 chk in the same migration; no ASCII ?.
Lead: accepted.

Reversals: emit both under the original stored kind (D11 audit trail). Asan research has no
reversal type. Not netted, not hidden. Receipt filter is therefore not "what still stands".
```

Payee `«؟»` for `payee_customer_id`: **already fixed in 359**; join kept.

---

## Task 5.2 — cheque skipped, not blocked as unregistered — **PASS**

```
CHQ_EXPORT doc_kind=receipt
blocked_reason=ردیف چک در فایل آسان نیست چون کد حساب ندارد؛ بقیهٔ ردیف‌ها هم صادر نمی‌شوند تا سند در آسان ناتراز نشود
line_no NULL, account_code NULL
CHQ_RECEIPT_FILTER n=1
```

A two-line cheque receipt cannot omit only the cheque line without unbalancing Asan. The
accountant sees the document listed under receipt, **cannot download a one-sided file**, and is
told why. That is not the old English-identifier withhold.

Rolled back. No committed cheque.

---

## Task 5.3 — export gates — **PASS**

```
NOTICE: CHK_OK n_fn=1 one_side=1 no_ascii_q=t kinds=t balance=t
INVOICE_AR 989
HEURISTIC_GONE bank_net=f has_external=f stored_kind=t
```

---

## Task 5.4 — invoice_ar — **PASS, no migration**

Live `asan_control_accounts`: `invoice_ar | 989 | حساب کنترلی دریافتنی (جمع بدهکاران)`.
OG-3 already applied (297). Writing a no-op migration was refused.

---

## Task 5.5 — sample files — **PASS**

| File | Contents |
|---|---|
| `docs/verification/asan/phase-5-asan-receipts.xlsx` | 4 real unblocked lines: OG14-CONC original + reversal. Amounts in Rial (×10). Headers include بدهکار and بستانکار. Seed receipt omitted (blocked: customer Asan code). |
| `docs/verification/asan/phase-5-asan-payments.xlsx` | Headers only — live DB has no payment `doc_kind` rows. |
| `docs/verification/asan/phase-5-asan-third-party.xlsx` | Headers only — live DB has no dual rows. |

**Repo constraint:** `.gitignore` forbids `*.xlsx` (owner 2026-08-07: zero xlsx in git). The three
files exist on disk at those paths and can be rebuilt with
`node docs/verification/asan/gen-phase-5-samples.mjs`. The CSV of the receipt lines is committed.

---

## Inherited inputs (§B)

| Item | After 366 |
|---|---|
| OG-14 Gate A M1 | **CLOSED.** Reversal is `receipt`; receipt filter includes it. |
| Phase 4 C-d | **CLOSED.** `dual_document` label branch; filter `third_party`. |
| Phase 4 C-e | **CLOSED.** Stored `dual` does not need a bank line. |
| Phase 3 C10 | **CLOSED.** External-party payment is `payment`; cheque payment is `payment` (then 5.2 skip). |
| Phase 2 C7 | **CLOSED.** Same root cause. |
| Phase 3 «؟» customer payee | **Already closed in 359**; join retained. |

---

## Phase test

```
Command:   npm run typecheck
Expected:  70
Actual:    70
```

Stress test: n/a (phases 1–4 only).

---

## Contradictions found

| Expected | Found | Impact |
|---|---|---|
| ground-truth `journal_entries` = 1 | 3 | OG14-CONC leftover; accounted in samples and phase 8 |
| T13: T9 resolved before phase 5 | T9 still open; phase 5 dispatched anyway | Export does not present a party total (T14). Recorded, not patched. |
| 5.1 Accept ≥1 per filter on live DB | payment and third_party empty on live | Proved inside ROLLBACK by creating one of each; not committed |

---

## Owner-Gate

None new and blocking. Reversal emission follows D11 (both legs). OG-23 (source-row freeze) untouched. T14 purchase/sales posting not built.

---

## Deploy verification

```
docker restart afrakala-lan-rest: done after 366
APP_GIT_SHA: not rebuilt (docs+SQL; same as prior phases)
```

## Exit criteria

- [x] Every task PASS with real output
- [x] Phase test (typecheck) 70
- [x] Stress n/a
- [x] No migration applied-but-uncommitted (this PR)
- [ ] PR MERGED
- [ ] APP_GIT_SHA match not claimed
- [x] `00-progress.md` updated
- [x] Phase 6 not started
- [x] Asan acceptance not claimed
