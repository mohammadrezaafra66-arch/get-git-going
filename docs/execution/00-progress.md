# 00-PROGRESS — programme level

The single place to look to answer "where are we". Updated by the Lead Orchestrator at every phase
boundary. Per-task detail lives in `phase-<N>-PROGRESS.md`.

## HANDOFF STATE

```
Programme:            AfraKala Live Ledger
Current phase:        1 — Shared foundations (tasks done, gates running)
Current task:         phase 1 exit gates
Branch:               feature/backend-phase-1
Last commit SHA:      f9bb12f0
Live APP_GIT_SHA:     <fill>   Match: <yes/no>
Typecheck:            70 / 70 baseline
Migrations applied:   9 (336-344)
Open Owner-Gates:     OG-8..OG-13 raised in phase 1 (none blocking)
Blocked tasks:        none
Production touched:   NO
```

## Phase status

| Phase | Status | Started | Finished | Tests | Notes |
|---|---|---|---|---|---|
| 0 Ground and decisions | complete | | 2026-08-18 | n/a | OG-1 confirmed |
| 1 Shared foundations | tasks 7/7 done | 2026-08-18 | | Gate B PASS | 9 migrations; Gate A running |
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
| OG-1 A1–A4 confirmed | | 2026-08-18 | CONFIRMED — ledger-decisions.md |
| OG-2 delete dead posting path | | 2026-08-18 | CONFIRMED — owner authorised the drop |
| OG-3 `invoice_ar` Asan code | | 2026-08-18 | ANSWERED — asan_control_accounts.invoice_ar = 989 (verified live) |
| OG-4 canonical phone format | | | |
| OG-5 HTTPS live | | | |
| OG-6 production authorised | | | |
| OG-8 drop orphaned trg_post_receipt_on_approve? | 2026-08-18 | | raised in task 1.1 |
| OG-9 should the document serial reset each Jalali year? | 2026-08-18 | | raised in task 1.2 |
| OG-10 can an own cheque be issued to an external party? | 2026-08-18 | | raised in task 1.4 |
| OG-11 post_receipt_accounting back-fill vs immutability | 2026-08-18 | | raised in task 1.6 |
| OG-12 is 'ledger-documents' the right module string? | 2026-08-18 | | raised in task 1.7 |
| OG-13 should manager get can_view on ledger-documents? | 2026-08-18 | | raised in task 1.7 |

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
| 336 | 20260818150000_336_drop_dead_receipt_posting_path.sql | 1 | 2026-08-18 | docs/verification/336-down.sql | yes |
| 337 | 20260818151000_337_jalali_year_helper.sql | 1 | 2026-08-18 | docs/verification/337-down.sql | yes |
| 338 | 20260818152000_338_document_numbers.sql | 1 | 2026-08-18 | docs/verification/338-down.sql | yes |
| 339 | 20260818153000_339_lock_down_burn_document_number.sql | 1 | 2026-08-18 | docs/verification/339-down.sql | yes |
| 340 | 20260818154000_340_require_asan_code.sql | 1 | 2026-08-18 | docs/verification/340-down.sql | yes |
| 341 | 20260818155000_341_cheque_kinds_and_doc_kind.sql | 1 | 2026-08-18 | docs/verification/341-down.sql | yes |
| 342 | 20260818156000_342_document_attachments.sql | 1 | 2026-08-18 | docs/verification/342-down.sql | yes |
| 343 | 20260818157000_343_posted_entry_immutability.sql | 1 | 2026-08-18 | docs/verification/343-down.sql | yes |
| 344 | 20260818158000_344_seed_ledger_documents_module.sql | 1 | 2026-08-18 | docs/verification/344-down.sql | yes |
