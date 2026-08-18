# 00-PROGRESS — programme level

The single place to look to answer "where are we". Updated by the Lead Orchestrator at every phase
boundary. Per-task detail lives in `phase-<N>-PROGRESS.md`.

## HANDOFF STATE

```
Programme:            AfraKala Live Ledger
Current phase:        2 COMPLETE — phase 3 not started (separate dispatch)
Current task:         3.1 (not started)
Branch:               staging @ c937c923 (PRs #300, #301 merged)
Last commit SHA:      97a763bf (phase-2 migrations), merged as c937c923
Live APP_GIT_SHA:     bfcc723a   Match: NO — pre-existing drift, see note below
Typecheck:            70 / 70 baseline
Migrations applied:   14 (336-349)
Open Owner-Gates:     OG-8, OG-11, OG-12, OG-14, OG-15, OG-16 (OG-10 and OG-13 CLOSED).
                      OG-14 must close before phase 9
Blocked tasks:        none
Production touched:   NO
```

**APP_GIT_SHA note.** The `afrakala-lan-web` container reports `bfcc723a`, which predates the
phase-1 merge — the drift was already there when phase 2 started and phase 2 did not cause it.
Phases 1 and 2 changed **only** SQL, so a web rebuild would move the SHA and nothing else;
PostgREST was restarted after every migration, which is what actually makes new database objects
reachable. **Remaining manual step for a human:** run the deploy block in `README-EXECUTION.md`
§3 on the test computer to bring `APP_GIT_SHA` up to `HEAD`. Not done here because a rebuild is a
deploy, and nothing in phase 2 needs one.

## Phase status

| Phase | Status | Started | Finished | Tests | Notes |
|---|---|---|---|---|---|
| 0 Ground and decisions | complete | | 2026-08-18 | n/a | OG-1 confirmed |
| 1 Shared foundations | **complete** | 2026-08-18 | 2026-08-18 | Gate B PASS, Gate A FAIL then remediated | 12 migrations; OG-10 closed, 1 risk open (OG-14) |
| 2 Receipts post | **complete** | 2026-08-18 | 2026-08-18 | 8/8 accept PASS; stress PASS | migrations 348-349; OG-16 raised; Gate A m2 closed |
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
| OG-2 delete dead posting path | | 2026-08-18 | CONFIRMED — owner authorised the drop |
| OG-3 `invoice_ar` Asan code | | 2026-08-18 | ANSWERED — asan_control_accounts.invoice_ar = 989 (verified live) |
| OG-4 canonical phone format | | | |
| OG-5 HTTPS live | | | |
| OG-6 production authorised | | | |
| OG-8 drop orphaned trg_post_receipt_on_approve? | 2026-08-18 | | raised in task 1.1 |
| OG-9 should the document serial reset each Jalali year? | 2026-08-18 | | raised in task 1.2 |
| OG-10 cheque counterparty may be an external party? | 2026-08-18 | **2026-08-18** | **ANSWERED: YES, both directions.** A cheque received may come from a non-customer; a cheque issued may go to a non-supplier. Implemented in migration **347**: `validate_journal_line_ref` accepts `external_parties` for both `cheque_receivable` and `cheque_payable`. **Closes Gate A M6** (the receipt-side mirror) by the same migration. Design choice (a) - existence in any allowed table - recorded with reasons in phase-1-PROGRESS.md. |
| OG-11 post_receipt_accounting back-fill vs immutability | 2026-08-18 | | raised in task 1.6 |
| OG-12 is 'ledger-documents' the right module string? | 2026-08-18 | | raised in task 1.7 |
| OG-13 should manager get can_view on ledger-documents? | 2026-08-18 | **2026-08-18** | **ANSWERED — option (a). CLOSED.** The boundary stands as migration 346 applied it: create = `admin`, `accountant`, `manager`; read the numbering ledger = `admin`, `accountant`. No migration needed. `create_receipt` uses `has_any_role(_uid, ARRAY['admin','accountant','manager'])`, matching `assign_document_number`. Proved end to end in task 2.8: manager creates successfully through gate → numbering → receipt → links → entry → credit → audit, which is what Gate A's M3 said would break. |
| OG-14 build reverse_document, or an audited escape hatch? | 2026-08-18 | | Gate A M5 - MUST close before phase 9 |
| OG-15 add viewer_restricted to the two new tables? | 2026-08-18 | | Gate A m7 - changes task 1.5 acceptance count |
| OG-16 what does a receipt from a non-customer credit? | 2026-08-18 | | Raised in task 2.1 (contradiction C2). `create_receipt` takes `p_customer_id` and always credits `customer_credit`, which resolves only through `customers.person_id`. OG-10 confirmed a cheque may arrive from a non-customer, and T7 searches `persons`. Options (a) `external_party`, (b) a new `person_credit` kind, (c) require promotion to a customer first. **Blocks nothing** — phase 2 built the customer path exactly as the contract specifies. Full text in `phase-2-PROGRESS.md` § OWNER-GATE. |

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
| 8 | Phase 2, C1–C9 | Nine contradictions between `rpc-contracts.md` §1 and the live schema, each recorded with its decision | `phase-2-PROGRESS.md` § Contradictions found | C1/C3/C5/C6 corrected the contract in place (task 2.1); C2 → OG-16; C4 → migration 348; C7 → phase 5; C8 → phase 6; C9 → the audit spec's row count needs amending in phase 4 |

**Resolutions 2026-08-18:** rows 1-2 superseded — the mission document was re-issued directly by the owner and now defines Gate A / Gate B. Row 3 resolved — OG-2 written to `ledger-decisions.md`. Row 4 resolved — `MASTER-CHECKLIST.md` task 1.1 corrected to `post_receipt_journal(_receipt_id uuid)`. Row 5 resolved — OG-3 answered (989).

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
| 345 | 20260818160000_345_writers_supply_doc_kind.sql | 1 | 2026-08-18 | docs/verification/345-down.sql | yes |
| 346 | 20260818161000_346_gate_a_major_fixes.sql | 1 | 2026-08-18 | docs/verification/346-down.sql | yes |
| 347 | 20260818170000_347_cheque_external_party_counterparties.sql | 1 (OG-10) | 2026-08-18 | docs/verification/347-down.sql | yes |
| 348 | 20260818180000_348_receipt_cheque_receiver_check.sql | 2 | 2026-08-18 | docs/verification/348-down.sql | yes |
| 349 | 20260818181000_349_create_receipt.sql | 2 | 2026-08-18 | docs/verification/349-down.sql | yes |

Both phase-2 rollback files were written **before** their forward migration and then executed
(349-down then 348-down, one `BEGIN … ROLLBACK`, exit 0). `348-down` restores a CHECK that is
*stricter* than the one 348 installs, so it fails loudly rather than running once cheque
receipts exist — the file carries a pre-flight gate saying so. Phase 1 shipped a rollback file
that would not have run; these two were proved.
