# Phase 2 — Receipts post — PROGRESS

Copied from `phase-TEMPLATE-PROGRESS.md` at phase start. Filled as the phase ran, not at the end.

## HANDOFF STATE

```
Phase:                2 - Receipts post
Status:               in progress
Branch:               feature/phase-2-rpc-contract (2.1), feature/phase-2-create-receipt (2.2-2.8)
Base:                 staging @ f916a4ef
Tasks:                0 of 8
Current task:         2.1
Blocked by:           nothing (OG-16 raised, does not block the customer path)
Migrations applied:   (none yet; 348, 349 planned)
REST restarted after: (pending)
Backup taken:         D:\AfraKalaBackups\pre-phase2-20260818-192441.dump  (16,799,660 bytes)
Typecheck:            not run yet / 70 baseline
Last commit:          <pending>
PR:                   <pending>
```

## Pre-flight

- [x] `git fetch origin && git switch staging && git pull` — staging @ `f916a4ef`
- [x] `git switch -c feature/phase-2-rpc-contract`
- [x] Backup taken and path recorded above
- [x] `ground-truth.md` re-verified for the facts this phase depends on — see below
- [x] Rollback file written for every planned migration, **before** any is applied

### Ground-truth re-verification (only the facts phase 2 depends on)

| ground-truth claim | Re-run result | Verdict |
|---|---|---|
| §1 `journal_entries` holds 1 row, `journal_lines` 2 | 1 / 2 | holds |
| §1 the only entry is `source_type='payment_receipt'` | `payment_receipt \| posted \| receipt \| 1` | holds (`doc_kind` now backfilled by 341) |
| §2 `post_receipt_accounting` is `SECURITY DEFINER`, `search_path=public` | `prosecdef=t`, `{search_path=public}` | holds |
| §2 its debit branch is bank-or-external-party, credit always `customer_credit` | live body read in full (`pg_get_functiondef`) | holds |
| §5 `payment_receipts.tracking_number` NOT NULL, no default | `is_nullable=NO`, no default | holds |
| §5 `payment_receipts.payment_time` required, no default | `is_nullable=NO`, no default | holds |
| §5 `journal_entries UNIQUE (source_type, source_id)` | `journal_entries_source_unique UNIQUE (source_type, source_id)` | holds |
| §5 `journal_lines_one_side` CHECK | present, unchanged | holds |
| §5 `account_kind` CHECK now includes the two cheque kinds | 9 values incl. `cheque_receivable`, `cheque_payable` | holds (341) |
| §8 numbering is `max+1` under an advisory lock | live `assign_document_number` body read | holds |
| §9 `has_any_role` has two overloads | `(uuid, text[])` and `(uuid, app_role[])` | holds |
| §12 13 of 23 customers have no Asan code | customers with and without a code both sampled and found | holds |
| OG-13 boundary: `assign_document_number` admits admin/accountant/manager | live body: `ARRAY['admin','accountant','manager']::app_role[]` | holds (346) |
| OG-10: `validate_journal_line_ref` accepts `external_parties` for both cheque kinds | live body `WHEN 'cheque_receivable' THEN ARRAY['customers','external_parties']` | holds (347) |
| 2.3 note: `require_asan_code` is `SECURITY INVOKER` since 346 | `prosecdef=f`, `STABLE`, `search_path=public` | holds |

### G-question — what already depends on what this phase changes

Asked before writing migration 348, per the mission's section G. `create_receipt` is a **new** object,
so the only real exposure is the one **existing** object phase 2 alters: the
`payment_receipts_receiver_exclusive_chk` CHECK constraint (see C4).

Enumerated from the live catalogue, not from the repo:

| Depends on `payment_receipts` | How | Affected by 348/349? |
|---|---|---|
| `post_receipt_accounting` | reads a receipt, refuses unless `status='approved'`, posts | **No.** It carries its own independent "exactly one of bank / external party" guard (live body lines 42-45), so relaxing the table CHECK does not relax that function. New receipts arrive with `posting_status='posted'`, so it short-circuits on `already_posted` instead of double-posting. |
| `enforce_payment_receipt_link_limits` (BEFORE INSERT/UPDATE on `payment_receipt_links`) | caps allocations at the receipt amount and at the proforma's remaining balance, counting **only** receipts with `status='approved'` | **Yes, decisively** — this is why C3 resolves to `status='approved'`. A `status='posted'` receipt would be invisible to this cap and a proforma could be over-allocated silently. |
| `enforce_receipt_approval_allocation_limits` (BEFORE UPDATE OF status) | re-checks the same cap on transition to `approved` | Not fired on INSERT. The per-link trigger above covers the create path. |
| `recompute_employee_scores_on_receipt`, `compute_employee_score`, `calculate_credit_score` | read `payment_receipts.status` | Unaffected by the CHECK change; and they see `approved`, the value they already understand. |
| `asan_list_bank_deposit_export`, `get_account_ledger`, `get_receivable_detail` | read `payment_receipts` | Unaffected by the CHECK change. |
| views `vw_account_balances`, `vw_customer_receivables` | read `payment_receipts` | Unaffected. |
| `person_merge`, `person_fk_drift_report` | read the persons FKs on `payment_receipts` | Unaffected — no FK to `persons` is added or removed by this phase, so the migration-328 registry gate is not engaged. |
| triggers `trg_payment_receipts_derive_person`, `trg_normalize_phone`, `trg_burn_receipt_document_number`, `trg_cleanup_receipt_attachments` | fire on the new INSERT too | Relied upon, not changed. `derive_person` supplies `customer_person_id` (NOT NULL) for us. |
| `PaymentReceiptForm.tsx` (legacy create path, D12) | four PostgREST inserts, `status='pending_review'` | Unaffected. The relaxed CHECK is strictly weaker, so nothing it writes today can start failing. |

Residual risk accepted and recorded: after 348 a *legacy* cheque receipt could be moved to
`approved` with neither a bank account nor an external party. `post_receipt_accounting` then refuses
it with a Persian message rather than posting a wrong entry — loud, not silent.

## Task log

One block per task. **A test not run is recorded as not run, never as passed.**

### Task 2.1 — `rpc-contracts.md` entry for `create_receipt`
```
Scope:      docs/api/
Effort:     S
Started:    2026-08-18 19:20
Finished:   2026-08-18 19:40
Commit:     <filled below>

What was done:
  The contract already existed and was already fully specified, so this task was
  reconciliation, not authorship. Four statements in section 1 were contradicted by the
  live schema and are corrected in place, each marked with its contradiction id:
    C1  cheque debit account_ref_id: "the cheque register row" -> p_customer_id
    C3  source row status: 'posted' -> 'approved' + posting_status='posted'
    C5  p_destination_bank_account_id required for 'cash' as well as 'bank'
    C6  document_channel storage: cash->'cash', cheque->'cheque', bank->NULL
  Three clarifications were added that are not corrections: the explicit OG-13 role gate,
  the audit-row column mapping (audit_logs has no journal_entry_id column, so the spec's
  required fields go into diff jsonb), and a note that allocation caps are enforced by the
  existing trg_payment_receipt_links_enforce_limits trigger and must not be re-implemented.
  One ambiguity was closed: retrying the whole RPC creates a new receipt; UNIQUE
  (source_type, source_id) is a one-entry-per-receipt guarantee, not a request idempotency key.

Acceptance command:
  Docs-only task; MASTER-CHECKLIST gives no Accept command for 2.1. Verified instead that
  every statement left in section 1 matches the live catalogue, by re-reading
  validate_journal_line_ref, assign_document_number, require_asan_code,
  enforce_payment_receipt_link_limits and the payment_receipts / journal_* constraint sets
  with pg_get_functiondef and pg_get_constraintdef.

Actual:
  git diff --stat -> docs/api/rpc-contracts.md | 74 +++++++++++++++++++++++++++++-------
  (no other file touched)

Verdict:    PASS

Reviewers:
  Observer:            PASS - corrections are marked in place rather than duplicated into a
                       second "as built" section, so there is one contract, not two.
  Software Engineer:   PASS - step 7 now points at the existing trigger instead of
                       specifying a second cap inside the RPC. Flagged that step 6's
                       posting_status='posted' is what keeps the legacy button idempotent;
                       recorded in the G-question table.
  Security Engineer:   PASS - step 1 now names the exact gate and cast, and step 10 forbids
                       putting the Asan code into the audit payload (spec section 2).
  Lead decision:       accepted, no changes.
```

## Contradictions found

Recorded per `ground-truth.md`'s preamble and the mission's section C. **Nothing here was silently
adapted**; each row states the decision and the reason.

| # | Expected | Found | Decision and why |
|---|---|---|---|
| C1 | `rpc-contracts.md` §1: the cheque debit's `account_ref_id` is "the cheque register row" | There is no cheque register. A2 defers the cheque lifecycle; migration 341 pointed `cheque_receivable` at `customers`, and 347 widened it to `customers` **or** `external_parties`. Live `validate_journal_line_ref` verified. | Use `account_ref_id = p_customer_id` (the drawer). It is what the validator accepts today and it is the party whose balance moves. **The contract text is stale on this point** and is corrected by task 2.1. |
| C2 | `create_receipt(p_customer_id uuid)` — every payer is a customer | OG-10 confirms a cheque we receive may come from a party who is not a customer; T7 says party search runs over `persons`. | Build the contract as written (the customer path). **Do not** widen the signature speculatively. Raised as **OG-16** below. |
| C3 | Contract step 6: insert `payment_receipts` with `status='posted'` (T1) | `payment_receipts_status_check` admits only `pending_review \| approved \| rejected`. Separately, `enforce_payment_receipt_link_limits` caps a proforma's remaining balance counting **only** `status='approved'` receipts. | Insert `status='approved'`, `posting_status='posted'`, `posted_at=now()`. T1 is about removing the approval **step**, and it is removed — the row is born approved and posted in one transaction and nobody approves anything. Writing a fourth status value would have meant widening a CHECK **and** silently disabling the proforma over-allocation cap for every new receipt. Contract corrected by task 2.1. |
| C4 | A receipt row can be inserted for any channel | `payment_receipts_receiver_exclusive_chk` requires exactly one of `destination_bank_account_id` / `receiver_party_id` unless `status='pending_review'`. A cheque receipt has neither: its debit is `cheque_receivable`, not a bank account, and the drawer is a customer, not an `external_parties` row. | Migration **348** widens the CHECK with a cheque branch. Strictly weakening, so all 7 existing rows still satisfy it and no current writer can start failing. Blast radius enumerated in the G-question table above. |
| C5 | `p_destination_bank_account_id` is "required when channel='bank'" | D2 makes a cash box a `bank_accounts` row with `account_type='cash'`, the contract's own journal table debits `bank` for **both** bank and cash, and C4's CHECK demands a receiver for both. | Required for `bank` **and** `cash`. Contract corrected by task 2.1. Related data gap: the test database currently has **no** `bank_accounts` row with `account_type='cash'` (1 bank account in total, `accounting_code='8'`). Not a blocker — D18; the cash branch is proven against the existing account. |
| C6 | `p_channel` is `'bank' \| 'cash' \| 'cheque'` and is stored | `payment_receipts_document_channel_check` admits `card_to_card \| paya \| pol \| satna \| cash \| cheque \| other` — there is **no** `'bank'`. | Store `cash` → `'cash'`, `cheque` → `'cheque'`, `bank` → `NULL` (the column is nullable and 2 of 7 existing rows are already NULL). Recording a *false* sub-channel (`paya`, `other`) would be worse than recording none; the wizard collects the real sub-channel in phase 6. |
| C7 | (phase-5 hazard, recorded here because phase 2 creates the documents phase 5 must export) | `asan_list_journal_export` still **infers** its `doc_kind` from line shapes and does not read the stored `journal_entries.doc_kind` column (Gate A m8). A cheque receipt has no `bank` line and no `external_party` line, so it infers `'unclassified'`; and `cheque_receivable` resolves through no code branch, so the document is blocked. | No phase-2 action. Both are already-scheduled phase-5 work: task 5.1 (read the stored column) and task 5.2 / D8 (skip cheque lines rather than block). Recorded so phase 5 does not discover it from a silently missing export. |

## OWNER-GATE

### OG-16 — what does a receipt from a non-customer credit?

**Asked:** 2026-08-18. **Status:** OPEN. **Blocks:** nothing in phase 2.

`create_receipt` takes `p_customer_id uuid` and always credits `account_kind='customer_credit'`
against it. `customer_credit` resolves to an Asan code through `customers.person_id` →
`person_identifiers(kind='asan_person_code')` — a path that exists only for a row in `customers`.

OG-10 has now confirmed that a cheque we receive may come from a party who is **not** a customer, and
T7 says party search runs over `persons`, not only `customers`. So a receipt can legitimately arrive
from a payer for whom `customer_credit` has nothing to point at.

**The question, precisely:** when the payer of a receipt is not a customer, what should the credit
side of the entry be?

- (a) `external_party` against an `external_parties` row, resolving to `external_parties.accounting_code`
  — mirrors what `post_receipt_accounting` already does on its *debit* side, but an
  `external_parties` code is a free-text mirror, not a `person_identifiers` code.
- (b) A new `person_credit` account kind resolving directly through `person_identifiers` — correct in
  principle, but it means a new `account_kind`, a new `validate_journal_line_ref` branch and a new
  Asan resolution path, i.e. exactly what A2 rejected for cheques.
- (c) Require the payer to be promoted to a `customers` row first — no schema change, but it turns
  every one-off payer into a permanent customer record.

**Continued in the meantime with:** the customer path, exactly as the contract specifies. Widening the
signature on a guess is the worse error (Gate A, OG-10 precedent). Nothing in tasks 2.1–2.8 depends on
the answer.

## Phase test

(filled at phase end)

## Stress test

(filled at phase end)

## Deploy verification

(filled at phase end)

## Exit criteria

- [ ] Every task PASS with real output recorded
- [ ] Phase test passed
- [ ] Stress test passed
- [ ] No migration applied-but-uncommitted
- [ ] PR merged and verified
- [ ] `APP_GIT_SHA` matches HEAD
- [ ] `00-progress.md` updated
