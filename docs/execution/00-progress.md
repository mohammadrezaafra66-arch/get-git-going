# 00-PROGRESS — programme level

The single place to look to answer "where are we". Updated by the Lead Orchestrator at every phase
boundary. Per-task detail lives in `phase-<N>-PROGRESS.md`.

## HANDOFF STATE

```
Programme:            AfraKala Live Ledger
Current phase:        2 COMPLETE — Gate A remediation applied; phase 3 not started (separate dispatch)
Current task:         3.1 (not started)
Branch:               staging (PRs #300, #301, #303 merged; Gate A remediation 350-353 merged)
Last commit SHA:      Gate A remediation (350-353) — see the migration ledger below
Live APP_GIT_SHA:     87c1a921   Match: NO — 2 commits behind, both docs+SQL only. See note below
Typecheck:            70 / 70 baseline
Migrations applied:   18 (336-353)
Open Owner-Gates:     OG-8, OG-11, OG-12, OG-14, OG-15, OG-17 (OG-10, OG-13, OG-16 CLOSED).
                      OG-14 must close before phase 9. OG-17 stays open with a CHANGED question -
                      the owner confirmed the intended credit model, but the hold/release symmetry
                      it depends on is unmeasured. See ledger-decisions.md Part 4.
Owner decisions:      T9-T12 recorded 2026-08-18 in ledger-decisions.md. T9 (one person, one file,
                      one balance) and T10 contradict what the schema assumes today.
BLOCKING:             T9 needs a READ-ONLY RESEARCH MISSION to size the change BEFORE phase 3 or
                      phase 4 is dispatched. Scope is unmeasured and must not be guessed.
Blocked tasks:        none
Gate A defects:       16 raised, 12 closed, 1 with the owner (OG-17), 3 deferred (m1, m7 -> phase 6;
                      m3 -> phase 5). M4 + M5 CLOSED 2026-08-18: the owner ran the cleanup script by
                      hand, verifier 14/14 PASS, independently re-measured. The Asan bank-deposit
                      export is clean (0 rows for the contaminated 2026-08-18, 1 genuine row overall)
                      and the warning to the team is lifted. Detail and real output in
                      docs/execution/phase-2-REMEDIATION-PROGRESS.md § 3
Production touched:   NO
```

**T9 blocks the next dispatch.** Owner decision **T9** — one person, one file, one balance — was
recorded on 2026-08-18 and its **scope is unmeasured**. A **read-only research mission must size the
change before phase 3 or phase 4 is dispatched**: the ledger keeps three balances per person
(`customer_credit` → `customers`, `supplier_payable` → `suppliers`, `external_party` →
`external_parties`) where the owner keeps one, so a person who is both a customer and a supplier has
no single correct figure today. Dispatching phase 3 on an assumed answer builds the payment RPC to
the model T9 replaces. Do not estimate that scope here and do not guess it —
`ledger-decisions.md` § T9 lists the readers the research must account for.

**APP_GIT_SHA note — corrected 2026-08-18.** This entry previously read `bfcc723a`, "which
predates the phase-1 merge". That is no longer true: the `afrakala-lan-web` container now reports
**`87c1a921`**, so the image was rebuilt at some point after phase 2 merged. It is now exactly two
commits behind `staging` (`9b837306`), and `git diff --name-only 87c1a921 9b837306` is **entirely
`docs/` and `supabase/migrations/`** — not one file that reaches the built web bundle. A rebuild
would move the SHA stamp and change nothing else. PostgREST was restarted after the migrations,
which is what actually makes new database objects reachable.

**The deploy was attempted and deliberately not forced.** `deploy/lan/build.ps1` refuses to build a
tree that is not clean, because `docker-compose` builds from the working tree, so anything
uncommitted ships into the image while `APP_GIT_SHA` still reports the last commit. This shared
checkout currently holds **8 untracked files belonging to other missions** (`audit/`,
`docs/audits/7-eg-checklist-mission.md`, `docs/execution/production-gap-analysis-mission.md`,
`docs/research/_a…_e`). Building with `-Force` would stamp `9b837306` onto an image that also
contains eight uncommitted files — reintroducing exactly the "state does not match the recorded
commit" drift that this remediation existed to close (§ 0 of
`phase-2-REMEDIATION-PROGRESS.md`). The guard was left to do its job.

**Remaining manual step for a human.** Once the other missions have committed their files and
`git status --porcelain` is empty, on the **test computer**:

```powershell
git switch staging; git pull --ff-only origin staging
powershell -ExecutionPolicy Bypass -File deploy\lan\build.ps1 web
docker compose -f deploy\lan\docker-compose.yml --env-file deploy\lan\.env.lan up -d web
docker inspect afrakala-lan-web --format "{{range .Config.Env}}{{println .}}{{end}}" | Select-String "APP_GIT_SHA"
```

`APP_GIT_SHA` must then equal `git rev-parse --short HEAD`. Nothing in phase 2 or in this
remediation needs that rebuild to function — it closes a reporting discrepancy, not a defect.

## Phase status

| Phase | Status | Started | Finished | Tests | Notes |
|---|---|---|---|---|---|
| 0 Ground and decisions | complete | | 2026-08-18 | n/a | OG-1 confirmed |
| 1 Shared foundations | **complete** | 2026-08-18 | 2026-08-18 | Gate B PASS, Gate A FAIL then remediated | 12 migrations; OG-10 closed, 1 risk open (OG-14) |
| 2 Receipts post | **complete** | 2026-08-18 | 2026-08-18 | 8/8 accept PASS; stress PASS; Gate A FAIL then remediated; cleanup verifier 14/14 PASS | migrations 348-349 + remediation 350-353; OG-16 and OG-17 raised; OG-13 fully closed. 12 of 16 Gate A defects closed, 1 with the owner (OG-17), 3 deferred — `phase-2-REMEDIATION-PROGRESS.md` |
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
| OG-13 should manager get can_view on ledger-documents? | 2026-08-18 | **2026-08-18** | **ANSWERED — option (a). CLOSED.** The boundary stands as migration 346 applied it: create = `admin`, `accountant`, `manager`; read the numbering ledger = `admin`, `accountant`. No migration needed. `create_receipt` uses `has_any_role(_uid, ARRAY['admin','accountant','manager'])`, matching `assign_document_number`. Proved end to end in task 2.8: manager creates successfully through gate → numbering → receipt → links → entry → credit → audit, which is what Gate A's M3 said would break. **Correction 2026-08-18 (Gate A M3):** this row was premature — two of OG-13's four surfaces still carried the old answer when it was written. Migration **352** applied answer (a) to both: `document_numbers_select_finance` now admits `manager`, and `role_permissions('ledger-documents','manager')` is `can_view=t, can_create=t`. Both verified in the live catalogue. OG-13 is closed on all four surfaces. |
| OG-14 build reverse_document, or an audited escape hatch? | 2026-08-18 | | Gate A M5 - MUST close before phase 9 |
| OG-15 add viewer_restricted to the two new tables? | 2026-08-18 | | Gate A m7 - changes task 1.5 acceptance count |
| OG-16 what does a receipt from a non-customer credit? | 2026-08-18 | **2026-08-18** | **ANSWERED — CLOSED. Superseded by owner decision T10.** The gate offered three options (a) `external_party`, (b) a new `person_credit` kind, (c) require promotion to a customer first. T10 replaces all three: **a person has one file and one balance (T9), and the sign of that balance decides the direction.** If they owe us, a receipt reduces what they owe; if we owe them, it increases what we owe. The user is never asked what the money is for. A friend or relative lending money is not a special case — they become a creditor under the same rule. **Consequence recorded, not patched:** `create_receipt` takes `p_customer_id` and always credits `customer_credit`, which is now known to be too narrow. The fix belongs to the T9 research, not to a patch on the RPC — a second narrow path is worse than one. Full text in `ledger-decisions.md` § T10. |
| OG-17 is the credit hold/release symmetry actually maintained? | 2026-08-18 | | **STILL OPEN — the question has CHANGED.** Originally "a receipt allocated to a proforma is counted twice" (Gate A **M1**). **The owner has confirmed the intended model and the behaviour is correct:** credit in AfraKala is a **revolving limit, not a wallet**. A proforma can only be finalised if the customer has paid or has credit available; finalising **consumes** the limit (200,000,000 becomes 150,000,000 when 50,000,000 is committed) and paying **restores** it. So a receipt raising available credit is **releasing a consumed limit, not creating money**. The reviewer was not wrong to raise it — the model was simply not written down; it now is, in `ledger-decisions.md` **Part 4**. **What remains open is the caveat, and it must not be closed quietly:** the model is correct only if the symmetry holds — every finalised proforma must consume limit, and every payment must release exactly what was consumed. **Gate A measured the release half only** (0 → 1,000,000 available, `hold_credit(1,000,000)` succeeded). The **hold half is unmeasured**, and Gate A's census found `customer_credit_ledger` holds only `payment` rows — nothing has ever held, released or consumed credit, so the mechanism that makes the model correct has never been exercised. **The symmetry must be verified before OG-17 closes.** Revised question: not "is this behaviour wrong" but "is the hold/release symmetry actually maintained". |

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
| 350 | 20260819090000_350_bank_deposit_export_excludes_cash_cheque.sql | 2 Gate A (B1) | 2026-08-18 | docs/verification/350-down.sql | yes |
| 351 | 20260819091000_351_create_receipt_cash_account_and_date_bounds.sql | 2 Gate A (B1, M6) | 2026-08-18 | docs/verification/351-down.sql | yes |
| 352 | 20260819092000_352_og13_remaining_surfaces.sql | 2 Gate A (M3, m2) | 2026-08-18 | docs/verification/352-down.sql | yes |
| 353 | 20260819093000_353_block_receipt_delete_when_posted.sql | 2 Gate A (M8 stopgap) | 2026-08-18 | docs/verification/353-down.sql | yes |

Both phase-2 rollback files were written **before** their forward migration and then executed
(349-down then 348-down, one `BEGIN … ROLLBACK`, exit 0). `348-down` restores a CHECK that is
*stricter* than the one 348 installs, so it fails loudly rather than running once cheque
receipts exist — the file carries a pre-flight gate saying so. Phase 1 shipped a rollback file
that would not have run; these two were proved.

**Migrations 350-353 (Gate A remediation).** All four were applied to the test database on
2026-08-18 and then, because the authoring session was cut off by an API error, sat **applied but
uncommitted** until they were recovered. Nothing was re-applied: each was verified against the live
object (`pg_get_functiondef`, `pg_policies`, `pg_get_triggerdef`, `role_permissions`) rather than
against the file on disk, and only then committed. The full verification table is in
`phase-2-REMEDIATION-PROGRESS.md` § 0. **The commit is part of applying a migration, not a step that
follows it** — a database ahead of `staging` is what phase 9 replays against nothing.

The `REST restarted` column for these four rows rests on one observation rather than four: the
`afrakala-lan-rest` container reports `StartedAt = 2026-08-18T16:16:26Z`, which is 13 seconds after
migration 353 was written (21:16:13 local, UTC+5) and after all four had been applied. One restart
after the last migration reloads the schema cache for all of them, so every new object is reachable
through PostgREST. Individual restarts between 350 and 353 were not witnessed and are not claimed.

**Rollback-file rule, from 350 onward (Gate A M7).** A `docs/verification/*-down.sql` file contains
**statements only** — no `BEGIN`, no `COMMIT`, no `ROLLBACK`. The caller owns the transaction. An
embedded `COMMIT` commits the *outer* transaction, which is why phase 2's recorded rollback proof
could not have happened as written. `docs/verification/rollback-dryrun.sql` applies a file inside a
transaction it owns, asserts, and discards; if a down file ever carries its own `COMMIT` again, the
"after ROLLBACK" marker is what catches it.

**`supabase_migrations.schema_migrations` is stale and should not be trusted.** Its newest row is
`20260811180000`; nothing from 336 onward is recorded there. The table above is the real ledger. This
predates phase 1 and is flagged here because a phase-9 replay tool that trusts that table would skip
eighteen migrations.

**Test-data cleanup, 2026-08-18 (Gate A M4 + M5) — not a migration.** The 50
`PHASE2_STRESS_do_not_keep` receipts and the orphaned number `RCP-1405-000051` were removed by
`docs/verification/phase-2-remediation-testdata-cleanup.sql`, run **by hand by the owner** on the test
computer. It is deliberately not in `supabase/migrations/` and must never be moved there: it holds a
`DELETE` over business tables, and phase 9 replays that directory against production. Verifier
returned 14 of 14 PASS and the result was independently re-measured — 0 stress receipts,
`journal_entries` back to 1, all 51 receipt serials burned and none live, credit back to 0.00, and all
three triggers (both immutability guards and 353's delete guard) armed at `tgenabled='O'`. `audit_logs`
was left intact on purpose. Real output in `phase-2-REMEDIATION-PROGRESS.md` § 3.
