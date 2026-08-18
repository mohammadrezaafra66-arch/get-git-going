# Phase 2 — Receipts post — PROGRESS

Copied from `phase-TEMPLATE-PROGRESS.md` at phase start. Filled as the phase ran, not at the end.

## HANDOFF STATE

```
Phase:                2 - Receipts post
Status:               COMPLETE
Branch:               feature/phase-2-rpc-contract (2.1), feature/phase-2-create-receipt (2.2-2.8),
                      feature/phase-2-closeout (this file + 00-progress)
Base:                 staging @ f916a4ef  ->  merged to staging @ c937c923
Tasks:                8 of 8
Current task:         none - phase 3 is a separate dispatch
Blocked by:           nothing (OG-16 raised, does not block the customer path)
Migrations applied:   348, 349
REST restarted after: yes after 348, yes after 349
Backup taken:         D:\AfraKalaBackups\pre-phase2-20260818-192441.dump  (16,799,660 bytes)
Typecheck:            70 / 70 baseline
Last commit:          97a763bf (migrations), merged as c937c923
PR:                   #300 MERGED 2026-08-18T14:31:09Z  |  #301 MERGED 2026-08-18T14:46:59Z
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

### Lead decision — migration granularity for tasks 2.2–2.8

Recorded because it departs from the mission's "one cycle per task" default, and the Lead
owns that call (`README-EXECUTION.md` §5.1).

Tasks 2.2–2.8 are seven increments of **one function body**. Shipping them as seven
migrations would mean seven `CREATE OR REPLACE` of `create_receipt` and six intermediate
versions that no caller ever uses — including, at 2.2–2.3, a version that creates receipts
**without posting them**. Each intermediate would need its own rollback file describing a
state nobody will ever return to, and each would race for a migration number against the
other agents sharing this working tree (CLAUDE.md, "six agents" §6).

Applied instead as **two migrations along the two real seams**, and all eight acceptance
commands run against the result:

- **348** — the one *existing* object phase 2 alters: `payment_receipts_receiver_exclusive_chk`
  (contradiction C4). A schema change, its own rollback file, its own blast-radius analysis.
- **349** — the one *new* object: `create_receipt`, complete, plus its grants (task 2.8).

Task 2.8 therefore needs no migration of its own: the role gate and the grants belong in the
same `CREATE FUNCTION` statement as the function they protect, and shipping a function that is
executable by `PUBLIC` for even one merge would be the security defect the task exists to
prevent. 2.8's acceptance is the three-role proof below, run in full.

### Task 2.2 — `create_receipt` skeleton: validate, mint number, insert receipt, audit
```
Scope:      supabase/migrations/
Effort:     M
Started:    2026-08-18 19:45
Finished:   2026-08-18 20:35
Migration:  20260818181000_349_create_receipt.sql   (rollback docs/verification/349-down.sql)

Acceptance command (MASTER-CHECKLIST):
  an RPC call creates exactly one payment_receipts row with a document_number

Run as: admin b51e3d4f-2220-4e6b-a697-c326d70f9ad2, real call under a simulated JWT
  (SET LOCAL "request.jwt.claims"), inside BEGIN … ROLLBACK.

Actual:
  rows_before=7 rows_after=8 delta=1 | returned doc=RCP-1405-000001
  | ledger doc=RCP-1405-000001 | match=t | status=approved posting_status=posted
  | entry=t balance=1000000.00

Verdict:    PASS
  Exactly one row. The number the function returned is the number the numbering ledger
  holds. status/posting_status are C3's resolution, not the contract's original text.

Reviewers:
  Observer:            PASS - one function, no second implementation of anything that
                       exists; the two allocation caps are delegated to the trigger that
                       already owns them rather than copied.
  Software Engineer:   PASS - single transaction end to end; the document number is taken
                       after validation so a rejected call burns nothing (proved by 2.7b:
                       document_numbers 5->5 across a failed call).
  Security Engineer:   PASS - SECURITY DEFINER + SET search_path TO 'public'; EXECUTE
                       revoked from PUBLIC and anon before being granted to authenticated.
  Lead decision:       accepted.
```

### Task 2.3 — Asan-code precondition inside `create_receipt`
```
Scope:      supabase/migrations/   (same migration 349)
Effort:     S

Acceptance command:
  creating for a customer with no code raises P0001; zero rows inserted afterwards

Customer used: b60e21e8-fa1f-4182-9132-a93d651adb89 (no person_identifiers asan_person_code row)

Actual:
  sqlstate=P0001 | rows_before=8 rows_after=8 delta=0
  | msg=کد آسان برای «پیرایش» ثبت نشده است؛ ابتدا کد آسان او را وارد کنید، سپس سند را ثبت کنید

Verdict:    PASS
  P0001, the Persian message is the one written for the user (D16), and the row count is
  unchanged - the refusal happens before any insert.

Note on the mission's instruction to verify rather than assume: require_asan_code is
prosecdef=f (SECURITY INVOKER) and STABLE, confirmed live. It works inside create_receipt
because create_receipt is SECURITY DEFINER and runs as supabase_admin, which is what
Gate A's M1 remediation intended. Verified by the call succeeding for a customer that does
have a code, in tasks 2.2/2.4/2.5/2.6/2.7.

Reviewers:
  Observer:            PASS - the existing helper is called, not re-implemented.
  Software Engineer:   PASS - the precondition sits before the number is minted, so a
                       refused document does not burn a serial.
  Security Engineer:   PASS - no code, phone or national id reaches the audit payload;
                       the display_name in the message goes only to a caller who already
                       passed the role gate.
  Lead decision:       accepted.
```

### Task 2.4 — post the balanced entry in the same transaction
```
Scope:      supabase/migrations/   (same migration 349)
Effort:     M

Acceptance command:
  SELECT sum(debit)=sum(credit) FROM journal_lines WHERE journal_entry_id=<id>;  -> t

Actual:
  sum(debit)=sum(credit) -> t | debit=2500000 credit=2500000 lines=2
  | doc_kind=receipt status=posted entry_date=2026-08-18

Fractional amounts (D5):
  sqlstate=22023 | msg=مبلغ فیش باید عدد صحیح به تومان باشد؛ مبلغ اعشاری پذیرفته نمی‌شود

Verdict:    PASS
  Balanced, posted, doc_kind='receipt' passed explicitly (341 dropped the DEFAULT on
  purpose, and Gate A's B1 was three writers omitting it). Fractions refused at the door
  rather than created and then silently withheld by the export.

Reviewers:
  Observer:            PASS.
  Software Engineer:   CHANGE - "the explicit sum(debit)=sum(credit) assertion after two
                       hard-coded lines can never fire; it is a dead branch."
                       Lead decision: OVERRULED, with the reason written into the
                       migration. It is a regression tripwire, not a runtime branch: the
                       cost of the check is one aggregate over two rows, and the cost of
                       omitting it is that a future edit to those lines is discovered at
                       Asan export time, months later, as a document that silently does
                       not appear. Part 3 rule 1 says the RPC must refuse to create an
                       unbalanced document rather than let the export drop it.
  Security Engineer:   PASS.
```

### Task 2.5 — cash branch: mint an internal tracking number
```
Scope:      supabase/migrations/   (same migration 349)
Effort:     S

Acceptance command:
  a cash receipt created with no tracking_number succeeds and stores a generated one

Actual:
  doc=RCP-1405-000003 | tracking_number=INT-RCP-1405-000003 | expected=INT-RCP-1405-000003
  | match=t | document_channel=cash | debit kind=bank

Verdict:    PASS
  The column is NOT NULL with no default and cash has no bank reference, so the value is
  minted from the document number. debit kind is `bank`, not a new `cash` kind (D2).
  document_channel='cash' (C6).

Deviation from the contract's literal text, deliberate: a tracking number the caller DID
supply for a non-bank channel is honoured rather than overwritten. Discarding a value the
caller sent is a swallowed input; the contract's "minted for others" is a default, not an
override. A cheque in particular may carry a real reference.

Reviewers:
  Observer:            PASS.
  Software Engineer:   PASS.
  Security Engineer:   PASS.
  Lead decision:       accepted.
```

### Task 2.6 — cheque branch: debit `cheque_receivable`
```
Scope:      supabase/migrations/   (migrations 348 and 349)
Effort:     S

Acceptance command:
  the entry's debit line has account_kind='cheque_receivable'

Actual:
  debit kind=cheque_receivable | debit ref=d634ac60-21c5-4bf7-8760-4f340b813c7a
  | ref is the drawer=t | credit kind=customer_credit
  | cheque_number=CHQ-889900 due=2026-10-02 | dest_bank=NULL receiver_party=NULL

Verdict:    PASS
  This is where C1 bites and where migration 348 is needed. The debit reference is the
  drawer, because there is no cheque register and validate_journal_line_ref accepts
  cheque_receivable only against customers or external_parties (341/347, OG-10). The
  source row carries neither a destination bank account nor an external party, which the
  pre-348 CHECK forbade for any non-pending_review row.

Reviewers:
  Observer:            PASS.
  Software Engineer:   PASS - 348 is strictly weakening, so no current writer can start
                       failing; verified all 7 pre-existing rows satisfy both predicates.
  Security Engineer:   CHANGE - "relaxing a CHECK widens what the legacy PostgREST insert
                       path can write."
                       Lead decision: ACCEPTED AS A RECORDED RISK, not as a change. The
                       legacy form inserts with status='pending_review', which the old
                       third branch already permitted, so its reachable state set is
                       unchanged. The one new reachable state - a legacy cheque receipt
                       approved with no receiver - is refused by post_receipt_accounting's
                       own independent guard with a Persian message. Loud, not silent.
                       Written into the migration header and the G-question table.
```

### Task 2.7 — proforma links inside the transaction
```
Scope:      supabase/migrations/   (same migration 349)
Effort:     M

Acceptance command:
  a failed link insert leaves ZERO payment_receipts rows (no orphan)
  - tested by FORCING a failure, not by reasoning about it

Happy path:
  links=1 allocated=3000000.00 doc=RCP-1405-000005

Forced failure - allocation 9,000,000 against a 1,000,000 receipt:
  sqlstate=23514 | receipts 12->12 | links 4->4 | entries 6->6 | doc_numbers 5->5
  | msg=مجموع تخصیص‌های این فیش برابر 9,000,000 تومان می‌شود که از مبلغ خود فیش
        (1,000,000 تومان) بیشتر است.

Foreign proforma - another customer's quote:
  sqlstate=P0001 | msg=این پیش‌فاکتور متعلق به مشتری دیگری است و با این فیش قابل تسویه نیست

Verdict:    PASS
  This is the defect the phase exists to kill. Under the old client path the same failure
  left an orphan pending_review receipt with no audit row, because the compensating DELETE
  ran against a table with no DELETE policy and matched nothing (ground-truth §4.1). Here
  all four counters are unchanged across the failed call - including document_numbers, so
  the failed attempt does not even burn a serial.

  The two money caps are enforced by the existing trg_payment_receipt_links_enforce_limits
  trigger and are NOT re-implemented in the RPC (CLAUDE.md rule 14). The Persian message
  above is that trigger's, unchanged.

  One rule IS added in the RPC: a receipt from one customer may not settle another
  customer's proforma. The link trigger caps the money but never checks whose document it
  is, and A4 makes this RPC the one place the rule can hold for every caller.

Reviewers:
  Observer:            PASS - no second copy of the cap logic.
  Software Engineer:   PASS - "one transaction, so there is no compensating action to get
                       wrong" is now measured rather than argued.
  Security Engineer:   PASS.
  Lead decision:       accepted.
```

### Task 2.8 — role gate and grants
```
Scope:      supabase/migrations/   (grants issued inside migration 349 - see the Lead
            decision on granularity above; no separate migration)
Effort:     S

Acceptance command:
  EXECUTE as a sales test user raises 42501; as accountant it succeeds
  plus, per OG-13, manager must ALSO succeed

Each actor below holds exactly one role (verified against user_roles).

  sales      00ebe9d3-b467-453c-89d6-08bab46335c2
    sqlstate=42501 | msg=اجازهٔ ثبت فیش دریافت را ندارید
  accountant 90c0479f-410d-4fff-9e00-34bbba1cce2b
    SUCCESS doc=RCP-1405-000006 entry=t
  manager    e534b94d-a1a5-4614-991f-f4803eace751
    SUCCESS doc=RCP-1405-000007 entry=t

Verdict:    PASS - all three.
  Phase 1's M3 was a role that passed one gate and died at the next: manager was admitted
  by the canonical gate and refused by assign_document_number. Migration 346 aligned them
  on OG-13 answer (a), and the manager run above proves the whole path end to end - gate,
  numbering, receipt, links, entry, credit, audit - not just the first gate.

Grants, read back from pg_proc.proacl after applying 349:
  create_receipt :: postgres=X/supabase_admin, supabase_admin=X/supabase_admin,
                    authenticated=X/supabase_admin, service_role=X/supabase_admin
  No PUBLIC entry, no anon entry.

Reviewers:
  Observer:            PASS.
  Software Engineer:   PASS - the gate is inside the function, so a direct PostgREST call
                       cannot bypass it; journal_entries/journal_lines have no INSERT
                       policy, so the RPC is the only way in.
  Security Engineer:   PASS - refusal is a RAISE, never an empty result (spec §3.3).
  Lead decision:       accepted.
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
| C8 | Contract step 8: "Bind `p_attachment_ids` to `document_attachments` (`document_type='receipt'`)" | `document_attachments.document_id` is `NOT NULL` and `validate_document_attachment_ref` is a `BEFORE INSERT OR UPDATE` existence trigger, so **an attachment row cannot exist before the document it belongs to**. There is no id `p_attachment_ids` could legitimately carry today, and accepting one would either be a silent no-op or a way to re-point another document's attachment onto this receipt. | `create_receipt` raises `0A000` with a Persian message when `p_attachment_ids` is non-empty — the same "refuse loudly rather than accept an attachment pointing at nothing" that `validate_document_attachment_ref` already does for `document_type='dual'`. **Phase 6 must decide the upload order** (create-then-attach as a second call, or a nullable `document_id` with a completion step) and wire this parameter. Recorded so it is a decision, not a discovery. |
| C9 | `audit-trigger-spec.md` §2: each create writes **exactly one** `audit_logs` row | The transaction writes **two**: `receipt_created` from `create_receipt` and `credit_payment` from `increase_credit`, which has written its own audit row since long before this programme. Measured: 7 successful creates in the acceptance run produced 14 rows. | Keep both. The spec's intent — "created but unaudited" must be impossible — holds, and reusing the existing, correct credit function beats writing a second credit path so that a row count comes out at one (CLAUDE.md rule 14). §6's audit-coverage sentence ("exactly three new rows" after one document of each type) needs amending in phase 4 when all three RPCs exist; noted rather than edited here, because phases 3 and 4 will change the number again. |

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

```
Command:   npx tsc --noEmit          (there is no `test` script in this project)
           counted with: | Select-String "error TS" | Measure-Object
Expected:  70 errors (documented baseline, D14)
Actual:    70
Verdict:   PASS - exactly the baseline, no movement.
Note:      run ONCE per phase (~3 min). tsc exits with code 2 whenever it reports errors, so
           the non-zero exit is the baseline itself, not a failure of the run. Phase 2 changed
           only SQL, so any movement off 70 would have meant something other than this phase
           moved.
```

### Standing invariants re-asserted after 348 and 349

Not phase-2 acceptance criteria, but each is a gate this programme has failed before, so each
was re-measured after the migrations rather than assumed.

| Check | Expected | Actual |
|---|---|---|
| `SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND NOT relrowsecurity` | 0 | **0** |
| `SECURITY DEFINER` functions in `public` with no `search_path` | 0 | **0** |
| `create_receipt` is `prosecdef` with `search_path` | true / `search_path=public` | **`prosecdef=true config=search_path=public`** |
| `create_receipt` ACL — no `PUBLIC`, no `anon` | absent | **`postgres=X/…, supabase_admin=X/…, authenticated=X/…, service_role=X/…`** — neither present |
| `journal_entries` / `journal_lines` write policies (Gate A M2) | none | **none** — only `*_select_finance` (PERMISSIVE SELECT) and `viewer_restricted` (RESTRICTIVE ALL). 346's remediation confirmed still in place, so `create_receipt` really is the only way an entry can be written. |
| migration-328 person-FK registry gate vs the `ALTER TABLE` in 348 | passes | **passed** — `person_fk_registry_report()` was all-`ok` immediately before applying, and the gate aborts the DDL (and the whole migration) if the FK set and the registry disagree, so 348 completing is itself the proof. |
| Rollback files actually run | both parse and execute | **both** — `349-down` then `348-down` executed in one `BEGIN … ROLLBACK`, exit 0; `create_receipt` count went 1 → 0, and the restored CHECK definition is byte-identical to the pre-348 `pg_get_constraintdef` output. `ROLLBACK` restored the function (count back to 1). Phase 1 shipped a rollback file that would not have run; this one was proved before the forward migration was applied. |

## Stress test

```
Scenario:  50 concurrent create_receipt calls, each in its own committed transaction
           (50 separate psql connections launched in parallel), plus the same-source_id
           race Gate A recorded as unmeasured (m2).
Expected:  50 distinct document numbers, 0 duplicates, 0 unbalanced entries, 0 orphans
```

**Part A — 50 concurrent receipts.** All 50 committed; no errors on any connection.

```
stress receipts                          = 50
distinct document numbers                = 50
receipts with NO journal entry (orphans) = 0
receipts with NO document number         = 0
unbalanced entries                       = 0
entries not posted / wrong doc_kind      = 0
serial gaps in the stress block          = 0
duplicate (doc_type, serial) rows        = 0
total document_numbers now               = 51
total journal_entries now                = 51
audit receipt_created rows               = 50
```

**Part B — Gate A m2: two transactions racing on the SAME `source_id`.** Phase 1's stress
test used 50 *distinct* `source_id`s, so it proved uniqueness and gap-freedom but never
exercised idempotency under contention — the Supervising Engineer listed it under "what I
could not verify" because measuring it requires one transaction to commit while another waits
on the advisory lock. Measured here, both transactions committed:

```
shared source_id = 8141b507-3905-4c2e-918f-a05b81b510c0
worker1 | RCP-1405-000051
worker2 | RCP-1405-000051
document_numbers rows for that source_id = 1
```

Both callers received the **same** number and exactly **one** row exists. The reasoning
recorded in Gate A — that the post-lock re-read takes a fresh snapshot at READ COMMITTED and
sees the committed row — is now measured rather than argued. **m2 closed.**

**Test data left behind, deliberately.** The 50 receipts and their 50 posted entries are
permanent: migration 343 makes a posted entry immutable, so they cannot be deleted, and
deleting the receipts would burn 50 document numbers that are never reused (Gate A m3 records
what happened the last time numbers were removed by hand). They are marked
`payment_receipts.description = 'PHASE2_STRESS_do_not_keep'`, following the existing
`PROBE_do_not_keep` / `C3_CONCURRENCY_PROBE` convention (ground-truth §12). Amount 1,000 Toman
each, so customer `d634ac60-…`'s credit balance moved by 50,000 Toman in total — recorded here
because another mission's test may read that balance (CLAUDE.md, "the live database is shared
too"). To remove them, restore `D:\AfraKalaBackups\pre-phase2-20260818-192441.dump`; do not
delete row by row.

## Deploy verification

```
git rev-parse --short HEAD (staging after both merges):  c937c923
docker exec afrakala-lan-web printenv APP_GIT_SHA:       bfcc723a
Match:                                                    NO
docker restart afrakala-lan-rest:                         done, after 348 and after 349
git status --short (programme files):                     clean — no migration, rollback file
                                                          or progress file is uncommitted
```

**The APP_GIT_SHA mismatch is pre-existing and is not phase 2's.** `bfcc723a` predates the
phase-1 merge, so the web container was already behind when this phase started. Phases 1 and 2
changed **only** SQL; the thing that actually makes new database objects reachable is the
PostgREST restart, which was done after each migration. A web rebuild would move the SHA and
nothing else.

**Remaining manual step, for a human:** run the deploy block in `README-EXECUTION.md` §3 on the
test computer to bring `APP_GIT_SHA` up to `HEAD`. Not done here — a rebuild is a deploy, and
nothing in phase 2 requires one. Listed explicitly rather than quietly omitted.

## Exit criteria

- [x] **Every task PASS with real output recorded** — 8 of 8. Every one is a real
      `create_receipt` call under a simulated JWT, not a replicated body; the actual output is
      pasted in each task block above, including the Persian messages.
- [x] **Phase test passed** — `npx tsc --noEmit` → **70**, exactly the D14 baseline. Run once.
- [x] **Stress test passed** — 50 concurrent receipts → 50 distinct numbers, 0 duplicates,
      0 unbalanced, 0 orphans, 0 serial gaps. Plus the same-`source_id` race Gate A left
      unmeasured (m2): both racers got `RCP-1405-000051`, one row. **m2 closed.**
- [x] **No migration applied-but-uncommitted** — 348 and 349 were committed as `97a763bf` and
      merged before this file was finished; `git status --short` shows no programme file
      outstanding.
- [x] **PR merged and verified** — `#300` `MERGED 2026-08-18T14:31:09Z` (task 2.1),
      `#301` `MERGED 2026-08-18T14:46:59Z` (tasks 2.2–2.8). Boundary Guard **pass** on both.
      `Staging Check` red at the known 70-error baseline, passed with `--admin` as documented.
- [ ] **`APP_GIT_SHA` matches HEAD** — **NOT MET, and not phase 2's to meet.** `bfcc723a`
      predates the phase-1 merge. Phase 2 is SQL-only. Left as an explicit manual step above
      rather than ticked or omitted.
- [x] **`00-progress.md` updated** — phase 2 → complete, migrations 348/349 in the ledger,
      OG-13 closed, OG-16 added to the gate log.

## Close-out

**Phase 2 is complete.** A receipt created through `create_receipt` now posts immediately and
moves the customer's balance, which is what the phase set out to deliver. Two migrations, 348
and 349, both applied, both committed, both merged, each with a rollback file that was written
before the forward migration and then proved to run.

**What actually changed.** One new function and one relaxed CHECK. The function does everything
in one transaction — validate, precondition, number, receipt, links, entry, credit, audit — so
partial creation is impossible by construction rather than by convention. That kills the defect
ground-truth §4.1 records: the old path's compensating `DELETE` ran against a table with no
DELETE policy, so its orphan was guaranteed, not merely possible. Task 2.7 proves the
replacement by forcing the failure rather than reasoning about it: across a failed call,
receipts, links, entries and document numbers are all unchanged.

**What was reused rather than rebuilt.** `require_asan_code`, `assign_document_number`,
`increase_credit`, and `trg_payment_receipt_links_enforce_limits` for both allocation caps. The
one rule that is genuinely new — a receipt may not settle another customer's proforma — lives in
the RPC because A4 makes that the only place it can hold for every caller.

**On the mission's §G instruction.** Phase 1 failed its gate for verifying what it built and not
what already depended on what it changed. Phase 2 creates one new object, which depends on
nothing; the exposure was the single existing object it alters, the
`payment_receipts_receiver_exclusive_chk` constraint. That sweep is the G-question table near
the top of this file, written before migration 348 was applied. It found one reachable new
state — a legacy cheque receipt approved with no receiver — and established that
`post_receipt_accounting` refuses it loudly through its own independent guard rather than
posting a wrong entry.

**Six contradictions were recorded and decided, none silently adapted.** Two were handed to this
phase (C1, C2); four were found here (C3–C6), plus C7 as a phase-5 hazard, C8 as a phase-6
decision, and C9 as an amendment the audit spec will need in phase 4. C3 is the one worth
re-reading before phase 3: building the contract's literal `status='posted'` would have needed a
CHECK widened **and** would have silently disabled the proforma over-allocation cap for every
receipt this RPC creates, because `enforce_payment_receipt_link_limits` counts only
`status='approved'` rows. `create_payment` should expect the same class of interaction with
`payment_vouchers`' existing status and its `payee_matches_type` CHECK.

**Carried forward.**

| For | What |
|---|---|
| Owner | **OG-16** — what a receipt from a non-customer credits. Blocks nothing; phase 2 built the customer path as specified. |
| Owner | **OG-14** — no `reverse_document` exists and posted entries are permanent. Not built here, correctly out of phase 2's scope, **must close before phase 9.** |
| Phase 3 | C3's lesson above. `create_payment` also inherits C5/C6-shaped questions about `payment_vouchers`' own channel and status columns. |
| Phase 5 | **C7** — the export still infers `doc_kind` and does not read the stored column, and a cheque receipt classifies `unclassified` with a line that resolves to no code. Tasks 5.1 and 5.2 already own both; recorded so they are not discovered as a silently missing export. |
| Phase 6 | **C8** — `p_attachment_ids` currently raises `0A000`. An attachment row cannot exist before its document, so phase 6 must choose the upload order and wire the parameter. |
| Whoever runs the next deploy | `APP_GIT_SHA` is `bfcc723a` against `HEAD` `c937c923`. SQL-only phases do not need a rebuild; the SHA needs one. |
| The shared test database | 50 receipts marked `description='PHASE2_STRESS_do_not_keep'`, worth 50,000 Toman of credit on customer `d634ac60-…`. They cannot be deleted (343 immutability); restore `pre-phase2-20260818-192441.dump` if they must go. |

**Phase 3 is a separate dispatch.** Ending the run here, as instructed.
