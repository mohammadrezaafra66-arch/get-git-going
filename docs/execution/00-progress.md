# 00-PROGRESS — programme level

The single place to look to answer "where are we". Updated by the Lead Orchestrator at every phase
boundary. Per-task detail lives in `phase-<N>-PROGRESS.md`.

## HANDOFF STATE

```
Programme:            AfraKala Live Ledger
Current phase:        1 — Shared foundations (starting)
Current task:         1.1
Branch:               fix/og2-and-checklist-corrections (doc fixes), then feature/backend-phase-1
Last commit SHA:      <fill>
Live APP_GIT_SHA:     <fill>   Match: <yes/no>
Typecheck:            70 / 70 baseline
Migrations applied:   0 of ~20
Open Owner-Gates:     none for phases 1-5 (OG-1/2/3 all answered)
Blocked tasks:        none
Production touched:   NO
```

## Phase status

| Phase | Status | Started | Finished | Tests | Notes |
|---|---|---|---|---|---|
| 0 Ground and decisions | in progress | | | n/a | Documents written; OG-1 open |
| 1 Shared foundations | in progress | 2026-08-18 | | | OG-1 + OG-2 confirmed |
| 2 Receipts post | not started | | | | |
| 3 Payments post | not started | | | | |
| 4 Dual documents | not started | | | | |
| 5 Asan exports live | not started | | | | OG-3 answered (989) — 5.4 unblocked |
| 6 Wizard front end | not started | | | | Needs OG-4 + `normalize_identifier` |
| 7 OCR | not started | | | | Needs OG-5 (HTTPS) |
| 8 Integrated verification | not started | | | | |
| 9 Production | not started | | | | Needs OG-6 |

## Owner-Gate log

| Gate | Asked | Answered | Answer |
|---|---|---|---|
| OG-1 A1–A4 confirmed | | 2026-08-18 | CONFIRMED — ledger-decisions.md:155 |
| OG-2 delete dead posting path | | 2026-08-18 | CONFIRMED — ledger-decisions.md, owner authorised the drop |
| OG-3 `invoice_ar` Asan code | | 2026-08-18 | ANSWERED — already present: `asan_control_accounts.invoice_ar = 989` (verified live). Task 5.4 unblocked |
| OG-4 canonical phone format | | | |
| OG-5 HTTPS live | | | |
| OG-6 production authorised | | | |

## Contradictions found against ground-truth.md

Anything measured that disagrees with `ground-truth.md`. **Never silently adapt** — record here,
continue with the next independent task, and let the Lead decide.

| # | Expected | Found | Where | Impact |
|---|---|---|---|---|
| 1 | `docs/execution/BACKEND-EXECUTION-phases-1-5.md` dispatched as the mission | File does not exist on disk or anywhere in git history | `find` / `git log --all` | **Phases 1-5 cannot start.** Task list exists in MASTER-CHECKLIST but the dispatched procedure does not |
| 2 | Gate A (Supervising Engineer) and Gate B (E2E) run at every phase end | Neither defined anywhere in `docs/execution/` | `grep -rn "Gate A|Gate B|Supervising Engineer"` | The override's only safeguard cannot be honoured |
| 3 | OG-2 CONFIRMED (per dispatch) | No OG-2 confirmation line anywhere; Owner-Gate log row empty | `grep -rn OG-2 docs/execution/` | Task 1.1 is gated by OG-2 and drops a live trigger + function |
| 4 | `DROP FUNCTION public.post_receipt_journal();` | Live signature is `post_receipt_journal(_receipt_id uuid)` | live `pg_proc` | Task 1.1 as written would error |
| 5 | OG-3: `invoice_ar` Asan code unknown | `asan_control_accounts` already holds `invoice_ar = 989` | live query | OG-3 may already be answered |
| 6 | Task 1.1 drops 2 objects | The trigger fires `trg_post_receipt_on_approve()`, which is what calls `post_receipt_journal`. A **third** object is involved | live `pg_trigger` join | Dropping only the 2 named objects orphans `trg_post_receipt_on_approve()` — decided in task 1.1 |
| 7 | `asan_control_accounts` covers the unresolvable kinds | Only `invoice_ar` has a row; `clearing` and `other` have none | live query | Those two kinds always block the journal export — deliberate per the function comment, recorded for phase 5 |

**Resolutions 2026-08-18:** rows 1-2 superseded — the mission document was re-issued directly by the owner and now defines Gate A / Gate B. Row 3 resolved — OG-2 written to `ledger-decisions.md`. Row 4 resolved — `MASTER-CHECKLIST.md` task 1.1 corrected to `post_receipt_journal(_receipt_id uuid)`. Row 5 resolved — OG-3 answered (989).

## Reviewer escalations (OG-7)

| Task | Reviewer | Objection | Lead's decision |
|---|---|---|---|

## Migration ledger

Every migration applied, in order. The rollback column must be filled **before** the migration runs.

| # | File | Phase | Applied | Rollback file | REST restarted |
|---|---|---|---|---|---|
