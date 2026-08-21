# 00-PROGRESS — programme level

The single place to look to answer "where are we". Updated by the Lead Orchestrator at every phase
boundary. Per-task detail lives in `phase-<N>-PROGRESS.md`.

## HANDOFF STATE

```
Programme:            AfraKala Live Ledger
Current phase:        6 COMPLETE (wizard UI); 6.7 BLOCKED by OG-4
                      ACTIVE SIDE-MISSION 2026-08-21: PV-remediation, Phase 0 COMPLETE.
                      Next: Phase 1 (Decision & Design), documents only.
                      Resume point for that mission is its row in the Phase status table.
Current task:         none — do not start phase 7 (OG-5 HTTPS)
Branch:               feature/phase6-wizard  (PV-remediation: feature/close-legacy-payment-voucher-path)
Last commit SHA:      see git log on staging after this PR merges
Live APP_GIT_SHA:     pending deploy
Typecheck:            70 / 70 baseline (D14) — phase 6
Migrations applied:   32 (336-367) — phase 6 added 0
Open Owner-Gates:     OG-4, OG-8, OG-11, OG-12, OG-15, OG-17, OG-23
                      (OG-10, OG-13, OG-14, OG-16, OG-18, OG-19, OG-20, OG-21, OG-22 CLOSED).
BLOCKING BEFORE PHASE 6: reverse_document CLOSED (363–365).
BINDING ON PHASE 5:   T14 honoured. T15 (2026-08-19): bank automatic; cash/cheque/reversal
                      manual — both legs of a reversed pair and every cheque document are
                      absent from the journal export (367). Fourth menu
                      `پرداخت‌های خرید و تسویه` for purchase_payment + settlement.
Owner decisions:      T9-T15 in ledger-decisions.md. T15 recorded 2026-08-19. D8 and D17
                      amended the same day.
Blocked tasks:        none. Phase 3 is COMPLETE and honoured all four T13 constraints - proved,
                      not asserted (phase-3-PROGRESS.md, task 3.3/3.4 and the T13-c3 proof).
                      T9 itself must still be RESOLVED BEFORE PHASE 5.
Gate A defects:       OG-14 reverse_document Gate A: **PASS** then remediated — M2/M3/m2 closed
                      (365); M1 deferred to phase 5 as required input; m1 recorded for phase 8;
                      OG-23 raised. Report: `og14-reverse-document-GATE-A.md`.
                      Phase 4 Gate A: **PASS** — 0 BLOCKER, 1 MAJOR, 3 MINOR (`phase-4-GATE-A.md`).
                      Phase 4 M1 (`361-down` gate) already closed. Remaining from that review:
                      **m1** (reader-table), **m2** (root `PROGRESS.md` SHA), **m3** (INSERT policy
                      / D12 → phase 6).
                      Phase 2 Gate A: 16 raised, 12 closed, 1 with the owner (OG-17), 3 deferred
                      (m1, m7 -> phase 6; m3 -> phase 5). M4 + M5 CLOSED 2026-08-18.
                      Phase 5 Gate A: **PASS** 0 BLOCKER / 4 MAJOR / 3 MINOR then remediated
                      (367). M1–M4 and m1–m3 CLOSED. Report: `phase-5-GATE-A.md`.
                      Progress: `phase-5-remediation-PROGRESS.md`.
                      **Do not import the old concatenated sample xlsx into Asan.** Trial from
                      `/admin/asan-export`. OG-23 still open (source-row freeze).
Production touched:   NO - and the T9 production-count question was CLOSED BY OWNER DECISION
                      without contacting it (T13). CLAUDE.md rule 10 stands unweakened.
```

**T9 research complete; phase 3 is unblocked, subject to four constraints.** This entry previously
read "T9 blocks the next dispatch … scope is unmeasured". The research was run
(`docs/research/T9-one-person-one-balance-RESEARCH.md`, merged as `bc0ddafc`) and recommended **(b)**
— *phase 3 may proceed, but must be written so it does not deepen the split*. **The owner adopted (b)
as T13 on 2026-08-19.**

**Phase 3 must respect all four of T13's constraints:** (1) no new `account_kind` → table mapping —
`validate_journal_line_ref` has 6 and needs 0 more; (2) resolve the party to a `person_id` at the
boundary and store it in `payment_vouchers.payee_person_id`, which already exists and is already in
the person-FK registry; (3) **do not copy `pay_purchase_with_voucher`'s unconditional supplier
keying** — it posts `('supplier_payable', _purchase.supplier_id)` even when the payee is an
`external_party`, which is the exact failure T10 forbids; (4) **T9 must be resolved before phase 5**,
because `asan_list_journal_export` and `person_settlement_position` both read all three kinds and
phase 5 is where they become the accountant's numbers.

**The production-count question is closed without contacting production.** The research flagged,
correctly, that its confidence in (b) over (c) rested on how many persons on production are both a
customer and a supplier. The owner answered the model instead of the number: being both is **part of
this business's model, not an anomaly** — the count is low today and will grow. That is a stronger
answer than a count, and the practical decision is identical either way, because `journal_entries`
holds 1 row and `journal_lines` 2, so the contradiction stays **latent at any count**. Production
(`192.168.170.10`) was **not queried, not pinged, not contacted**. Full reasoning in
`ledger-decisions.md` § T13.

**Two corrections the research forced, recorded in `ledger-decisions.md`:** T9's assumption that
`external_parties` might lack a `person_id` was **wrong** — it exists, is `NOT NULL`, all three role
tables carry one, and 29 of 29 persons-referencing FKs are registered `ok`; and T9's claim that the
split is the root cause of `person_settlement_position`'s misleading numbers was **also wrong** — the
cause is that nothing ever debits `customer_credit`, and resolving T9 would not fix it.

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
| 3 Payments post | **complete** | 2026-08-19 | 2026-08-19 | 9/9 accept PASS; stress PASS; Gate A FAIL then remediated | migrations 354-355 + remediation 356-358. Gate A: 1 BLOCKER, 2 MAJOR, 3 MINOR -> 4 closed (B1, M2, m1, OG-20), 1 with the owner (M1 -> OG-18), 2 deferred to phase 6 (m2, m3). `phase-3-GATE-A.md`, `phase-3-REMEDIATION-PROGRESS.md` |
| 4 Dual documents | **complete — corrected; Gate A PASS** | 2026-08-19 | 2026-08-19 | 7/7 accept PASS then owner correction accept PASS; stress PASS; cleanup proved clean; Gate A 0 BLOCKER / 1 MAJOR / 3 MINOR | migrations 360-361 plus **362** (no fee). Gate A M1 **closed** (`361-down` gate). New `dual_documents` table (task 4.2). T11 four roles. C-c / OG-21 **overturned by the owner 2026-08-19: no fee exists.** Always exactly two journal lines. Phase 5 not started. `phase-4-PROGRESS.md`, `phase-4-GATE-A.md` |
| **reverse_document** | **complete (OG-14) + Gate A remediated** | 2026-08-19 | 2026-08-19 | accept + Gate A re-probes PASS | 363–364 plus **365** (M2 credit from journal line; M3 admin+accountant only, interim). M1 deferred to phase 5 as required input. m1 leftover recorded for phase 8. OG-22 closed. OG-23 raised (source-row freeze). `asan_list_journal_export` not touched. |
| 5 Asan exports live | **complete** | 2026-08-19 | 2026-08-19 | 5/5 Accept; typecheck 70 | migration **366**. Classifier reads stored `doc_kind`. M1/C-d/C-e/C10/C7 closed. Cheque skip (D8). invoice_ar already 989. Samples in `docs/verification/asan/phase-5-asan-*.xlsx`. Owner must open one in Asan before phase 9. Phase 6 not started. |
| 6 Wizard front end | **complete except 6.7** | 2026-08-19 | 2026-08-19 | RPC accept 3/3; typecheck 70 | No migration. Dual fee step removed from spec. `PaymentReceiptForm` deleted. OG-4 still open. Do not start phase 7. |
| 7 OCR | not started | | | | Needs OG-5 (HTTPS) |
| 8 Integrated verification | not started | | | | |
| 9 Production | not started | | | | Needs OG-6 |
| **PV-remediation** — close legacy payment-voucher write path | **Phase 0 complete** | 2026-08-21 | | Phase 0 is read-only; no tests yet | Separate REMEDIATE mission, not a programme phase. `createPaymentVoucher` inserts with no journal; `vw_account_balances` / `get_account_ledger` never read `journal_lines`. Ground truth in `ground-truth.md` §13; evidence in `payment-voucher-remediation-PROGRESS.md`. **T-0.2 measured 0 legacy rows** — Owner-Gate 8 does not trigger. |

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
| OG-14 build reverse_document, or an audited escape hatch? | 2026-08-18 | **2026-08-19** | **ANSWERED — option (b), and CLOSED 2026-08-19 by migrations 363 and 364** (Gate A remediations in **365**). Opposite posted entry; original immutable. Role gate narrowed by OG-22 / 365. |
| OG-15 add viewer_restricted to the two new tables? | 2026-08-18 | | Gate A m7 - changes task 1.5 acceptance count |
| OG-16 what does a receipt from a non-customer credit? | 2026-08-18 | **2026-08-18** | **ANSWERED — CLOSED. Superseded by owner decision T10.** The gate offered three options (a) `external_party`, (b) a new `person_credit` kind, (c) require promotion to a customer first. T10 replaces all three: **a person has one file and one balance (T9), and the sign of that balance decides the direction.** If they owe us, a receipt reduces what they owe; if we owe them, it increases what we owe. The user is never asked what the money is for. A friend or relative lending money is not a special case — they become a creditor under the same rule. **Consequence recorded, not patched:** `create_receipt` takes `p_customer_id` and always credits `customer_credit`, which is now known to be too narrow. The fix belongs to the T9 research, not to a patch on the RPC — a second narrow path is worse than one. Full text in `ledger-decisions.md` § T10. |
| OG-17 the credit hold half was never built - should it be? | 2026-08-18 | | **STILL OPEN. Question restated a SECOND time on 2026-08-19, now from measurement.** It began as "a receipt allocated to a proforma is counted twice" (Gate A **M1**), became "is the hold/release symmetry actually maintained" once the owner confirmed the model, and is now: **given that the hold half was never built - should it be built, and if so, in which phase?** **The owner's model stands and the behaviour is correct:** credit is a **revolving limit, not a wallet** - finalising a proforma consumes the limit and paying restores it, so a receipt raising available credit is releasing a consumed limit, not creating money (`ledger-decisions.md` **Part 4**). **What the T9 research measured (`bc0ddafc`) is that one side of the symmetry does not exist.** CHECK: built and running - `create_sales_quote_with_items` reads `get_customer_dynamic_credit`, and `audit_logs` holds **6** `credit_limit_blocked` rows. **HOLD: never built** - `hold_credit` has **zero** SQL callers and appears in `src/` only in generated `types.ts`; all **11** `customer_credit_balance` rows have `held_credit = 0.00` with **0** rows holding anything; **none of the 9 `sales_quotes` triggers touches credit**; `create_sales_quote_with_items` writes a jsonb snapshot but never calls `hold_credit`, never writes `held_credit`, never writes `customer_credit_ledger`. RELEASE: built and running - `increase_credit`. So the system **checks the limit, never reserves against it, then releases against it on payment**. That is why `available_credit` behaves as a monotonically increasing total of receipts, and why M1's measurement looked like a double count. **Not a defect to fix - a decision about what the limit should do.** Deliberately NOT answered. |
| OG-18 does a cheque payment reduce the bank balance on the day it is written? | 2026-08-19 | **2026-08-19** | **ANSWERED — option (a). CLOSED by migration 359.** A cheque does not move the bank balance until it clears. `vw_account_balances` and `get_account_ledger` now exclude `document_channel = 'cheque'`, the direct mirror of what migration 350 did on the receipt side of the Asan export. The LEDGER was always correct — `create_payment` credits `cheque_payable`/`cheque_receivable` and `create_receipt` debits `cheque_receivable`, never `bank` — so 359 aligns the two views WITH the ledger and changes no posting. **Fixed symmetrically:** the identical defect existed on the receipt side (a cheque receipt RAISED the displayed balance), and leaving it would have recreated exactly the asymmetry Gate A objected to over OG-20. **Cash is deliberately NOT excluded** — a cash box is a `bank_accounts` row (D2) and a cash payment really does move it. Verified both directions: cheque payment `total_out` 0 -> 0 (Gate A measured 900,000 here), bank payment 0 -> 250,000; cheque receipt `total_in` unchanged, bank receipt +111,000. |
| OG-19 nothing posts the OTHER side of supplier_payable or customer_credit | 2026-08-19 | **2026-08-19** | **ANSWERED — option (b): THE LEDGER RECORDS MONEY MOVEMENTS ONLY. Purchases and sales do NOT post.** Recorded as owner decision **T14** in `ledger-decisions.md`. The owner will complete the purchase and sales side later, **separately from this programme**. So `supplier_payable` accumulating debits with no credits, and `customer_credit` credits with no debits, is **by design — not an absent counter-posting, and not to be "fixed"**. It follows that `person_settlement_position` and every ledger-derived balance shows **money moved, not the party's full position**: the party with 13,000,000,000 Toman of received purchases reads `balanced` because the purchase was never a ledger event. **This confirms two earlier judgements:** phase 3's contradiction **C5** and its **refusal to invert the sign convention** were both correct — the convention was never inverted and the one-sided accumulation is intended. **BINDING ON PHASE 5:** no phase-5 export or report may present a ledger-derived figure as a party's total balance or total debt; a task needing a full position must raise an Owner-Gate rather than sum the ledger. **STILL OPEN AND UNASSIGNED:** where the complete figure comes from (T9 says one balance; T14 says the ledger holds only part of it) is deferred with the purchase/sales work — no phase owns it. |
| OG-20 payment_vouchers has no delete guard while payment_receipts does | 2026-08-19 | **2026-08-19** | **ANSWERED - CLOSED. Built, not deferred.** Phase 3 deferred this to OG-14 on the grounds that a second stopgap is not the cure; phase-3 Gate A pushed back - it is migration 353's trigger with two identifiers changed, and phase 3 opened the path that made the failure reachable. The owner agreed with Gate A. **Migration 357** adds `trg_payment_vouchers_block_delete_when_posted`, mirroring 353 exactly. Verified with the same M8 probe used on the receipt side: `DELETE REFUSED sqlstate=P0001`, orphaned voucher entries **0**, and `phase-3-stress-cleanup.sql`'s entries-before-vouchers ordering re-proved to still work. This does not pre-empt **OG-14** - `reverse_document` remains the cure for both sides; it stops one more orphan being creatable in the meantime. |
| OG-21 is a صراف who is paid a fee an account holder? | 2026-08-19 | **2026-08-19** | **ANSWERED and CLOSED, 2026-08-19: there is no fee at all.** AfraKala does not charge or record one. The question as asked does not arise. Phase 4's C-c reading (a paid صراف is a third account holder, third journal line on `('external_party', intermediary_id)`) is **overturned**, not because the implementation was faulty but because the business rule it implemented does not exist. صراف / واسط / شخص ثالث / نفر سوم / طرف سوم are the same **record-only** class as the transferrer and recipient. Migration **362** dropped the fee columns, the fee parameters, and the third line. The original C-c write-up is kept in `phase-4-PROGRESS.md`. |
| OG-22 may a manager reverse a posted document? | 2026-08-19 | **2026-08-19** | **ANSWERED and CLOSED by migration 365: accountant and admin only; manager excluded (`42501`).** Create stays OG-13's wider set. **Interim, not final:** the owner said access control will be built in a dedicated phase where every module's permissions are set by role. Recorded in `ledger-decisions.md` so that phase revisits this array. |
| OG-23 freeze party/amount on a posted source row? | 2026-08-19 | | **OPEN.** Migration 343 made the journal immutable; UPDATE policies on `payment_receipts`, `payment_vouchers` and `dual_documents` have **no column list**. Accountants still UPDATE posted receipts (OCR apply of amount; approve/reject `status`; `reverse_document` metadata). Credit unwind no longer reads the mutable party (365). Freezing is a business question — continue; do not idle. |

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
| 354 | 20260819100000_354_payment_voucher_endorsed_cheque_ref.sql | 3 (task 3.8) | 2026-08-19 | docs/verification/354-down.sql | yes |
| 355 | 20260819101000_355_create_payment.sql | 3 (tasks 3.3-3.7, 3.9) | 2026-08-19 | docs/verification/355-down.sql | yes |
| 356 | 20260819110000_356_endorsement_consumed_once.sql | 3 Gate A (B1) | 2026-08-19 | docs/verification/356-down.sql | yes |
| 357 | 20260819111000_357_block_voucher_delete_when_posted.sql | 3 Gate A (OG-20) | 2026-08-19 | docs/verification/357-down.sql | yes |
| 358 | 20260819112000_358_persian_labels_for_control_kinds.sql | 3 Gate A (M2) | 2026-08-19 | docs/verification/358-down.sql | yes |
| 359 | 20260819120000_359_cheque_does_not_move_bank_balance.sql | OG-18 (owner (a)) | 2026-08-19 | docs/verification/359-down.sql | yes |
| 360 | 20260819130000_360_dual_documents_table.sql | 4 (task 4.2) | 2026-08-19 | docs/verification/360-down.sql | yes |
| 361 | 20260819131000_361_create_dual_document.sql | 4 (tasks 4.3-4.7) | 2026-08-19 | docs/verification/361-down.sql | yes |
| 362 | 20260819140000_362_dual_document_no_fee.sql | 4 correction (OG-21) | 2026-08-19 | docs/verification/362-down.sql | yes |
| 363 | 20260819150000_363_reverse_document_schema.sql | OG-14 | 2026-08-19 | docs/verification/363-down.sql | yes |
| 364 | 20260819151000_364_reverse_document.sql | OG-14 | 2026-08-19 | docs/verification/364-down.sql | yes |
| 365 | 20260819160000_365_reverse_document_gate_a.sql | OG-14 Gate A (M2, M3) | 2026-08-19 | docs/verification/365-down.sql | yes |
| 366 | 20260819170000_366_asan_journal_export_doc_kind.sql | 5 (5.1, 5.2) | 2026-08-19 | docs/verification/366-down.sql | yes |

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

## Phase 4 Gate A PASS + M1 closed (2026-08-19)

Independent review: `docs/execution/phase-4-GATE-A.md`. Verdict **PASS** (0 BLOCKER, 1 MAJOR, 3 MINOR).
Phase 5 was not started. `npm run typecheck` was **not run** (this mission has no TypeScript).

**M1 (MAJOR) closed here, not by rewriting the 18-arg DROP.** After 362, live
`create_dual_document` is the 15-arg form
`create_dual_document(text,uuid,text,uuid,numeric,date,text,text,text,text,text,text,text,text,uuid[])`.
`DROP FUNCTION IF EXISTS` of the 18-arg list was a silent no-op. The file now **refuses**
(`P0001`) while identity arguments lack `p_intermediary_fee`, then keeps the original 18-arg DROP
so a dry-run that has already run `362-down` in the same transaction can still complete.

Honest reverse order: `362-down` → `361-down` → `360-down`. `360-down.sql` was not changed.

### Proof (every write inside `BEGIN … ROLLBACK`; DB left as found)

Census before and after: `dual_documents=0`, `journal_entries=1`, `journal_lines=2`,
`public_functions=840`, one 15-arg `create_dual_document`.

1. **Current state (362 live).** `\i 361-down` → `ERROR` `P0001` (captured `sqlstate=P0001`), not
   `NOTICE: does not exist, skipping`. `pg_proc` still one 15-arg function. Harness
   `rollback-dryrun.sql` against **361-down** aborts (`ON_ERROR_STOP`, exit 3) — expected.
2. **Honest reverse in one txn.** `BEGIN;` `\i 362-down.sql;` `\i 361-down.sql;` →
   `count(*)=0` for `proname='create_dual_document'`; `ROLLBACK` restored the 15-arg function.
3. **Harness.** `rollback-dryrun.sql` against **362-down**: public functions **840 → 840**.

### Sweep: `docs/verification/*-down.sql` `DROP FUNCTION` vs live `pg_proc`

Compared named signatures to `oid::regprocedure` / `to_regprocedure` on the live catalogue.
**Signature-stale while a different arity of the same name is live** (the 361 class):

| File | Function | Down signature | Live | Class |
|---|---|---|---|---|
| `361-down.sql` | `create_dual_document` | 18-arg (`… uuid, numeric, text, uuid[]`) | 15-arg (`… text, uuid[]`) | **stale** — gated this mission (`P0001` while 362 live) |
| `362-down.sql` | `create_dual_document` | 15-arg | 15-arg | **match** (then the file recreates 18-arg) |
| `349-down.sql` / `351-down.sql` | `create_receipt` | 14-arg list | same 14-arg (`time without time zone` … `jsonb, uuid[]`) | **match**. 351 is `CREATE OR REPLACE`, not a new overload |
| `355-down.sql` | `create_payment` | 14-arg list | same 14-arg | **match**. 356 patches the body in place (no `DROP FUNCTION`) |
| `294-down.sql` / `320-down.sql` | `asan_list_journal_export` | `(date, date, text)` | `asan_list_journal_export(date,date,text)` | **match**. 358 is `CREATE OR REPLACE`, same signature |
| `360-down.sql` | dual trigger fns | `()` | `tg_dual_documents_*()` | **match** |
| `353-down.sql` / `357-down.sql` | posted-delete triggers | `()` | live `()` | **match** |
| `338`–`346` trigger / helper DROPs sampled | `jalali_year(date)`, `require_asan_code(uuid)`, `assign_document_number(text,uuid)`, `burn_document_number(text,uuid,text)`, attachment/immutability/cleanup triggers | as named | live `oid::regprocedure` agrees | **match** |
| `307-down.sql` | `auto_publish_release` | 7-arg including `timestamptz` | `auto_publish_release(text,timestamp with time zone,text,text,text,text,jsonb)` | **match** |
| `313-down.sql` | `pay_purchase_with_voucher` | 11-arg list | same 11-arg `oid::regprocedure` | **match** |
| `232-down.sql` | `person_create_inline` | 9-arg | `person_create_inline(text,text,text,jsonb,text,text,text,text,jsonb)` | **match** |
| `299-down.sql` | `search_visible_persons` | 7-arg + leftover 4-arg | live is the 7-arg only | 7-arg **match**; 4-arg **N/A (object gone)** |
| `229-down.sql` | `person_create_inline` | 8-arg (`text, text, text, jsonb, text, text, text, text`) | 9-arg (232 added a `jsonb`) | **stale — same class as 361**. Recorded, **not fixed** (out of scope) |
| `298-down.sql` | `search_visible_persons` | 4-arg and 3-arg | live 7-arg only | **stale DROPs of gone overloads**; running the file would not drop the live RPC. Recorded, **not fixed** |

Other `*-down.sql` `DROP FUNCTION` lines (person-FK registry, Asan batch, product video, marketing,
score, messenger, platform release, …) name objects that still exist under the listed 0-arg or
simple signatures, or they are older rollbacks whose objects were replaced later (**N/A — object
gone** for a dropped overload). None of those were a silent no-op against a **live** same-name
function except **361**, **229**, and **298**. Scope stops at recording 229 and 298.

**Not this defect class:** `349-down.sql` still contains `BEGIN;` / `COMMIT;` (phase-2 Gate A M7).
Left untouched.

### Root `PROGRESS.md` — looked, not edited (m2 deferred)

`git diff ae4b70bb ebbaafb8 -- PROGRESS.md` (PR #315): **one inserted history row** (2026-08-19,
Cursor, dual-document correction / migration 362 / OG-21 closed / typecheck 70 / phase 5 not
started). Commit cell is the placeholder `(this PR)`, not `ebbaafb8` / `41c0e534`. Harmless
additive; does not conflict with other agents' untracked files; does not duplicate this ledger.
Filling the SHA is a shared-file change — owner can do it by hand. That is **m2**, not this PR.

