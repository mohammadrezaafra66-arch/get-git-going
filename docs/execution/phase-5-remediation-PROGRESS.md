# Phase 5 remediation — PROGRESS

Copied from `phase-TEMPLATE-PROGRESS.md`. Gate A of phase 5 (`phase-5-GATE-A.md`) **PASS** with
0 BLOCKER, 4 MAJOR, 3 MINOR. This mission closes M1–M4 and m1–m3. Phase 6 not started.

## HANDOFF STATE

```
Phase:                5 remediation — Asan export filters (T15)
Status:               complete
Branch:               feature/phase5-remediation
Base:                 staging @ 8eef6f45
Tasks:                4 of 4 (M1–M4 + three MINORs)
Current task:         none — stop; independent Gate A of this remediation follows
Blocked by:           nothing
Migrations applied:   367
REST restarted after: yes (afrakala-lan-rest)
Backup taken:         D:\AfraKalaBackups\pre-phase5-remediation-20260819-194458.dump (16,947,411 bytes)
Typecheck:            70 / 70 baseline
Last commit:          (this PR)
PR:                   (fill after merge)
Test data created:    NONE that persists
Census:               dual=0 je=3 jl=6 receipts=8 vouchers=0 functions=841 conc=1
                      IDENTICAL before probes and after
```

## Pre-flight

- [x] `staging` at `8eef6f45`; branch `feature/phase5-remediation` already existed
- [x] Backup taken
- [x] `367-down.sql` written before 367 (366 body). Signature `(date, date, text)` unchanged.
      `366-down` still valid but restores the *heuristic* body — roll `367-down` first.
- [x] `rollback-dryrun.sql` on 367-down: functions 841→841, still_in_txn=t, ROLLBACK restores 367

## Owner answers (2026-08-19)

1. Cheques and reversals are **excluded entirely** (manual Asan path, like cash). T15. D8 amended.
2. Fourth menu for `purchase_payment` + `settlement`.
3. Samples: one document per file, driven by the live RPC.

**Both legs of a reversed pair leave the file.** Measured: original `2c972cd3` has
`reverses_entry_id` NULL; reversal `51e00e30` points at it and has a *new* `source_id` that is
**not** a `payment_receipts` row. Source `reversed_at` marks the original receipt only. Predicate:
`je.reverses_entry_id IS NULL AND NOT EXISTS (SELECT 1 FROM journal_entries r WHERE r.reverses_entry_id = je.id AND r.status='posted')`.
M1 needs no labelling — the reversal never reaches the file.

A document already imported into Asan *before* reverse is not undone by a later file. Manual path.

**Cheque predicate:** `journal_lines` has no `document_channel`. Source tables do.
`create_receipt` / `create_payment` are exclusive channel — mixed bank+cheque lines cannot occur
on those RPCs. 367 drops the whole entry if any `cheque_receivable`/`cheque_payable` line exists
**or** the source `document_channel='cheque'`. If mixed ever appeared, the whole document is
omitted (never a partial row).

**`other`** stays `unclassified`, blocked, not a menu. Correct: no Asan code.

**`_filter='all'`:** after 367 it is every remaining posted entry, including unclassified `other`
(blocked). It is not a page menu. purchase_payment and settlement appear under `all` and under
`purchase_and_settlement`.

**Do not import the old concatenated `phase-5-asan-receipts.xlsx` into Asan.** Trial from
`/admin/asan-export`.

## Task log

### M1+M3 — exclude reversals (both legs) and cheques
```
Scope:      supabase/migrations/20260819180000_367_asan_export_filters.sql
            docs/verification/367-down.sql
Effort:     M
Acceptance: receipt 2026-07-01..2026-08-31 → 1 document; OG14 pair n=0;
            cheque create → 0 under every filter; seed bank still n=2 lines

BEFORE (366, JWT): BEFORE_RECEIPT_N docs=3 n=6
AFTER  (367, JWT): A1_RECEIPT_DOCS docs=1 n=2; A1_OG14 n=0
A2 reverse pair in ROLLBACK: A2_LEGS 0 rows (neither leg under any filter)
A3 cheque: A3_CHQ_N 0 rows; A3_BANK_STILL n=2 (seed)
367-down inside txn: DOWN_RCPT docs=3 (old behaviour returns); ROLLBACK leaves 367

Verdict:    PASS

Reviewers:
  Observer:            PASS — both legs gone; 0-toman empty cheque gone
  Software Engineer:   PASS — predicate measured, not assumed
  Security Engineer:   PASS — DEFINER, search_path, no anon
  Lead:                accepted
```

### M2 — fourth menu
```
Scope:      367 classifier; src/lib/asan/export-registry.ts, export-journal.ts, export-types.ts
            e2e/asan/export-shell.spec.ts (order length 7)
Effort:     S
Persian label: پرداخت‌های خرید و تسویه
Filter:     purchase_and_settlement
Accept:     replica purchase_payment + settlement in ROLLBACK
            A4_PP all=2 purchase_and_settlement=2 (absent from receipt/payment/third_party)
            A4_SETL same; kinds purchase_payment / settlement
            A5 other: all only, unclassified, «سایر»

Verdict:    PASS
Reviewers:  all PASS
```

### M4 + m1 — samples
```
Scope:      docs/verification/asan/gen-phase-5-samples.mjs
Actual:     node … → exportable_documents 0 rpc_rows 2 blocked_or_empty_skipped 2
Honest:     live range has no unblocked journal document after 367 (seed blocked;
            OG14-CONC excluded). Payment and dual branches are **unproven on this
            database**, not evidenced by headers-only files. Generator calls the real RPC.
```

### m2 m3
```
m2: blocked_reason A5_OTHER_BR = نوع حساب «سایر» هنوز تعریف نشده است و کد آسان ندارد
m3: CONTROL_ACCOUNT_NOTE no longer names invoice_ar; 989 remains live
```

## Phase test

```
Command:   npm run typecheck
Expected:  70
Actual:    70 (tsc exit 2; 70× error TS; none in export-*.ts)
```

294 $chk$: CHK_OK. Bank deposit: A7_BANK n=1 seed; A7_CONC n=0.

ACL: prosecdef=t search_path=public; no anon, no PUBLIC.

## Contradictions found

| Expected | Found | Impact |
|---|---|---|
| Generator emits one xlsx per document | 0 unblocked documents in range | Honest; do not fake payment/dual files |
| D8 skip cheque lines | Owner supersedes | D8 amended; T15 recorded |

## Owner-Gate

None raised. OG-23 still open (out of scope).

## Deploy verification

```
docker restart afrakala-lan-rest:         done
git status:                               programme files only; other missions' untracked left alone
```

## Exit criteria

- [x] Every defect re-verified with the probe that proved it
- [x] Phase test 70
- [x] No committed test data
- [ ] PR merged (fill)
- [x] `00-progress.md` updated
- [x] T15 + D8/D17 recorded
