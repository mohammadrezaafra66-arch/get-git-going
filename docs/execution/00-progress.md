# 00-PROGRESS — programme level

The single place to look to answer "where are we". Updated by the Lead Orchestrator at every phase
boundary. Per-task detail lives in `phase-<N>-PROGRESS.md`.

## HANDOFF STATE

```
Programme:            AfraKala Live Ledger
Current phase:        0
Current task:         0.5 (OG-1, awaiting owner)
Branch:               staging
Last commit SHA:      <fill>
Live APP_GIT_SHA:     <fill>   Match: <yes/no>
Typecheck:            70 / 70 baseline
Migrations applied:   0 of ~20
Open Owner-Gates:     OG-1
Blocked tasks:        none
Production touched:   NO
```

## Phase status

| Phase | Status | Started | Finished | Tests | Notes |
|---|---|---|---|---|---|
| 0 Ground and decisions | in progress | | | n/a | Documents written; OG-1 open |
| 1 Shared foundations | not started | | | | Needs OG-1, OG-2 |
| 2 Receipts post | not started | | | | |
| 3 Payments post | not started | | | | |
| 4 Dual documents | not started | | | | |
| 5 Asan exports live | not started | | | | Needs OG-3 |
| 6 Wizard front end | not started | | | | Needs OG-4 + `normalize_identifier` |
| 7 OCR | not started | | | | Needs OG-5 (HTTPS) |
| 8 Integrated verification | not started | | | | |
| 9 Production | not started | | | | Needs OG-6 |

## Owner-Gate log

| Gate | Asked | Answered | Answer |
|---|---|---|---|
| OG-1 A1–A4 confirmed | | | |
| OG-2 delete dead posting path | | | |
| OG-3 `invoice_ar` Asan code | | | |
| OG-4 canonical phone format | | | |
| OG-5 HTTPS live | | | |
| OG-6 production authorised | | | |

## Contradictions found against ground-truth.md

Anything measured that disagrees with `ground-truth.md`. **Never silently adapt** — record here,
continue with the next independent task, and let the Lead decide.

| # | Expected | Found | Where | Impact |
|---|---|---|---|---|

## Reviewer escalations (OG-7)

| Task | Reviewer | Objection | Lead's decision |
|---|---|---|---|

## Migration ledger

Every migration applied, in order. The rollback column must be filled **before** the migration runs.

| # | File | Phase | Applied | Rollback file | REST restarted |
|---|---|---|---|---|---|
