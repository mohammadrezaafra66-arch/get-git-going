# Phase 3 — Payments post — PROGRESS

## HANDOFF STATE

```
Phase:                3 — Payments post
Status:               complete — awaiting independent Gate A review
Branch:               feature/phase-3-payments-post
Base:                 staging @ 95dea629
Tasks:                9 of 9
Current task:         —
Blocked by:           nothing. OG-18, OG-19, OG-20 raised; none blocks phase 3.
Migrations applied:   354, 355
REST restarted after: yes after 354, yes after 355
Backup taken:         D:\AfraKalaBackups\pre-phase3-20260819-002402.dump (16,841,820 bytes)
Typecheck:            70 / 70 baseline — unchanged
Stress data:          CLEANED UP INSIDE THIS PHASE. 0 rows left, proved below.
Last commit:          see 00-progress.md migration ledger
PR:                   see below
```

## Pre-flight

- [x] `git fetch origin && git switch staging && git pull` — `staging @ 95dea629`
- [x] `git switch -c feature/phase-3-payments-post`
- [x] Backup taken and path recorded above
- [x] `ground-truth.md` re-verified for the facts this phase depends on (§5 constraints, §6
      "wiring not building", §12 test-residue conventions) — every one re-measured from the live
      catalogue, not read from the file. §6 held; §5 held; two of its claims needed extending, see
      *Contradictions found*.
- [x] Rollback file written for every migration **before** it was applied, and each proved with
      `docs/verification/rollback-dryrun.sql`

---

## The two questions, answered before each migration (README-EXECUTION §H)

Phase 1 verified what it built and not what depended on what it changed. Phase 2 swept what
depended on what it changed and not what would **read** what it created. Both halves are answered
here and in full in each migration's header.

### What writes or depends on the objects I am about to change?

| Object | Writers | Dependents |
|---|---|---|
| `payment_vouchers` | `pay_purchase_with_voucher` (SQL, named column list), `createPaymentVoucher` (`src/lib/treasury/queries.ts`, named columns) | 5 triggers, 4 policies, 6 SQL readers, 1 view. None does `SELECT *`; none is positional. `ADD COLUMN` with no default is metadata-only and the table holds 0 rows. |
| `validate_journal_line_ref` | **not changed** — T13 constraint 1 | — |
| `person_settlement_position` | **not changed** — see OG-19 | — |
| everything else | 355 creates one new function and alters nothing | nothing calls `create_payment` yet |

### What will read the rows I am about to start creating?

Measured from the live catalogue **before** writing the function.

| Reader | Reads | Consequence for the rows this phase creates |
|---|---|---|
| `vw_account_balances` | `payment_vouchers` where `status='approved'`, **no channel filter** | A **cheque** voucher is counted as money leaving the bank. **OG-18.** |
| `get_account_ledger` | same shape, shows `voucher_number` as the document number | Same. Also confirms the `PAY-…` number displays correctly. |
| `asan_list_journal_export` | `journal_entries` where `source_type='payment_voucher'` | Classifies by **bank-sign heuristic, not `doc_kind`** — an `external_party` payment reads as `third_party`, a cheque payment as `unclassified`. **P3-C10.** |
| `person_settlement_position`, `list_mutual_settlement_candidates` | `supplier_payable` / `customer_credit` lines per person | A payment lowers what we owe — correct under the recorded convention. **OG-19** covers why the absolute number still reads negative. |
| `person_merge`, `person_fk_drift_report`, `validate_document_attachment_ref` | structural | none |

---

## Task log

### Task 3.1 — `rpc-contracts.md` entry for `create_payment`
```
Scope:      docs/api/          Effort: S      Verdict: PASS

Method:  §2 read against the live catalogue before trusting a word of it, exactly as task 2.1's
         experience predicted.

Actual:  TEN statements contradicted. All ten recorded as P3-C1..C10 in the contract and in
         "Contradictions found" below. §2 rewritten in place; the "wiring, not building" claim
         held — zero new tables, zero new account_kinds, zero new account_kind -> table mappings.

Reviewers:
  Observer:           PASS — corrections marked in place with IDs, matching phase 2's C-marker style.
  Software Engineer:  PASS — the contract now states the debit-kind selection, which is the
                      behaviour a caller cannot infer from the signature.
  Security Engineer:  PASS — role gate and grants documented and match the migration.
  Lead decision:      accepted.
```

### Task 3.2 — Read `pay_purchase_with_voucher` and record its posting shape
```
Scope:      none (read-only)   Effort: S      Verdict: PASS

Posting shape, read from the live catalogue (185 lines):
  entry:  doc_kind='purchase_payment', source_type='payment_voucher', status='posted',
          payer_accounting_code = source bank account, receiver_accounting_code = payee
  line 1: ('supplier_payable', _purchase.supplier_id, _amt, 0)
  line 2: ('bank',             _source_bank_account_id, 0, _amt)
  idempotency: SELECT on journal_entries (source_type, source_id) before inserting
  balance assertion after the insert, raising 23514
  audit row: entity_type='payment_vouchers', action='purchase_payment_posted'

WHAT TO COPY:
  * The (source_type, source_id) idempotency check — it is the UNIQUE constraint's partner.
  * The balance assertion. Cheap, and it turns a silent accounting bug into a refused transaction.
  * Filling the payee columns in the shape payment_vouchers_payee_matches_type_chk already
    requires, rather than replacing the constraint (ground-truth §5).
  * Leaving payee_person_id to trg_payment_vouchers_derive_person.
  * The _party_name plain-text variable: PL/pgSQL resolves record fields at plan time, so touching
    _party.full_name inside a CASE fails with "record is not assigned yet" even in a branch that
    never runs. The comment in the live function records that its dry-run caught exactly that.

WHAT NOT TO COPY  (T13 constraint 3 — read as a warning, not a template):
  * The debit line is keyed to _purchase.supplier_id UNCONDITIONALLY. When _payee_type is
    'external_party' the money is recorded against a supplier who did not receive it; when it is
    'other', _purchase.supplier_id is NULL, and validate_journal_line_ref returns early on a NULL
    ref, so NOTHING checks it. T10 forbids this. create_payment selects the debit kind from
    payee_type instead — proved below.
  * doc_kind='purchase_payment'. create_payment uses 'payment' (task 3.4), which keeps the two
    paths distinguishable for phase 5.
  * The role gate ARRAY['admin','accountant']::text[] — narrower than OG-13 answer (a) and missing
    manager.
```

### Tasks 3.3 + 3.4 — `create_payment`: validate, mint, insert, audit; post the entry
```
Scope:      supabase/migrations/   Effort: M      Verdict: PASS
Migration:  355   Rollback: docs/verification/355-down.sql (proved, 836 -> 836)

Acceptance command (real invocation, admin JWT, inside BEGIN … ROLLBACK):
  SELECT * FROM public.create_payment(
    p_channel := 'bank', p_payee_type := 'supplier', p_payee_id := '26d7b2e9-…',
    p_amount := 500000, p_payment_date := current_date,
    p_source_account_id := '32a4c282-…', p_tracking_number := 'P3-ACCEPT-1');

Actual:
  voucher_id                           | document_number | journal_entry_id  | new_balance
  5f257042-212e-4a95-8eb1-e15970bc116c | PAY-1405-000001 | b18349a5-…        |     -500000

  voucher | PAY-1405-000001 | supplier | other | P3-ACCEPT-1 | approved | person_filled=t | supplier_set=t
  entry   | doc_kind=payment | source_type=payment_voucher | status=posted
          | payer_accounting_code=8 | receiver_accounting_code=90019001
  lines   | 1 | supplier_payable | 500000 |      0
          | 2 | bank             |      0 | 500000
  balanced| d=500000 c=500000 ok=t
  audit   | payment_voucher | payment_created | dk=supplier_payable | ck=bank
  doc_num | payment | PAY-1405-000001

Verdict:    PASS — balanced, posted, correct doc_kind (3.4's Accept), number minted, audit written,
            payee_person_id populated (T13 constraint 2, asserted inside the function).
            new_balance is NEGATIVE. That is the OG-19 symptom, not a defect in this function —
            see the sign-convention section.

Reviewers:
  Observer:           PASS — reuses require_asan_code, assign_document_number, has_any_role and the
                      existing CHECK rather than reimplementing any of them. No dead branch.
  Software Engineer:  CHANGE (first pass) — "a boolean is being read into a text variable in the
                      external_party branch and compared to the strings 'true'/'t'; and
                      require_asan_code is called twice, once inside a COALESCE where it may be
                      skipped when the role row carries an accounting_code mirror — which would
                      make T3 conditional." Lead: ACCEPTED and fixed before applying. _is_active
                      boolean added; require_asan_code now called unconditionally exactly once and
                      its result preferred over the mirror (ground-truth §12 records a customer
                      whose mirror is set while person_identifiers has no row, and the export reads
                      the identifier). Re-reviewed: PASS.
  Security Engineer:  PASS — SECURITY DEFINER + SET search_path TO 'public'; role gate with an
                      explicit ::app_role[] cast; EXECUTE revoked from PUBLIC and anon; no identifier
                      or key in any error message.
  Lead decision:      accepted after the Software Engineer's change was applied.
```

### Task 3.5 — Asan-code precondition for the payee
```
Scope:      supabase/migrations/   Effort: S      Verdict: PASS

Verified rather than assumed (the task says so explicitly): require_asan_code has NO SECURITY
clause in its live definition, so it is SECURITY INVOKER by default. Inside create_payment
(SECURITY DEFINER, owner supabase_admin) it therefore runs as the owner and sees every
person_identifiers row, while a direct caller of require_asan_code still gets only what that
table's RLS grants them. That is the property phase-1 Gate A M1 asked for and it holds.

Acceptance: a supplier whose person has no asan_person_code.
Actual:
  ERROR:  کد آسان برای «شخص آزمایشی 26» ثبت نشده است؛ ابتدا کد آسان او را وارد کنید، سپس سند را ثبت کنید
  CONTEXT: PL/pgSQL function require_asan_code(uuid) line 29 at RAISE
           PL/pgSQL function create_payment(...) line 210 at assignment
Verdict:  PASS — P0001, Persian, names the party.
```

### Task 3.6 — Cash branch
```
Scope:      supabase/migrations/   Effort: S      Verdict: PASS

Decision recorded (the task asks for it either way): the payment side DOES get the same
account_type guard migration 351 added to the receipt side. The mirror argument is exact — a cash
payment credited to a real bank account understates that account in vw_account_balances and
get_account_ledger, which is 351's B1 in the opposite direction.

Consequence recorded, not hidden: this database has ONE bank_accounts row and it is
account_type='bank', so EVERY cash payment is refused until the owner creates the صندوق — the same
state cash receipts have been in since 351. Intended behaviour of the guard, not a defect.

Acceptance: cash payment from the bank-type account.
Actual:   ERROR (P0001) — پرداخت نقدی باید از صندوق انجام شود؛ حساب «…» از نوع صندوق نیست
Verdict:  PASS

Internal number: tracking_number is NULLABLE on payment_vouchers (unlike payment_receipts, where
NOT NULL forced the INT- mint). A caller-supplied value is honoured on every channel; 'INT-<doc>'
is minted only when a non-bank channel supplies none — Gate A m5's lesson applied on this side.
```

### Task 3.7 — Own cheque credits `cheque_payable`
```
Scope:      supabase/migrations/   Effort: S      Verdict: PASS

Actual (admin JWT, BEGIN … ROLLBACK):
  lines | 1 | supplier_payable | 250000 |      0
        | 2 | cheque_payable   |      0 | 250000
Verdict:  PASS

Sub-case recorded: migration 347 (OG-10) widened cheque_payable's targets to
ARRAY['suppliers','external_parties'] — customers is NOT among them, and T13 constraint 1 forbids
adding it. An own cheque to a CUSTOMER payee is therefore REFUSED with a Persian P0001 rather than
mis-keyed. Proved:
  ERROR: صدور چک در وجه مشتری از این مسیر پشتیبانی نمی‌شود؛ برای پرداخت به مشتری از روش بانکی استفاده کنید
```

### Task 3.8 — Endorsed customer cheque credits `cheque_receivable`
```
Scope:      supabase/migrations/   Effort: M      Verdict: PASS
Migration:  354   Rollback: docs/verification/354-down.sql (proved, 835 -> 835)

"THE SAME CHEQUE" — established before writing the guard, as the task requires:
  There is NO cheque register. Measured:
    SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_name ~ 'cheque';   -> 0 rows
  A2 defers the lifecycle, so none was built. A cheque we hold IS a payment_receipts row with
  document_channel='cheque' — the only place a received cheque exists in this schema. Its drawer is
  the receipt's customer, which is why the credit line keys to cheque_receivable -> customers and
  satisfies validate_journal_line_ref with no new mapping.
  "The same cheque" therefore = the same payment_receipts.id.

Migration 354 adds payment_vouchers.endorsed_receipt_id (FK -> payment_receipts, ON DELETE
RESTRICT), a partial UNIQUE index excluding only status='rejected', and a CHECK that only a cheque
voucher may carry one. The persons-FK gate (328) does not fire — this FK is not to persons;
verified by applying the whole migration inside BEGIN … ROLLBACK and confirming
person_fk_registry_report() still returns 29 rows, 0 drifted.

Acceptance: create a real received cheque with create_receipt, endorse it, then endorse it again.
Actual:
  create_receipt -> RCP-1405-000052, cheque received
  endorse        -> lines | 1 | supplier_payable  | 300000 |      0
                          | 2 | cheque_receivable |      0 | 300000
  endorse again  -> ERROR: این چک قبلاً ظهرنویسی شده است و دوباره قابل استفاده نیست
Verdict:  PASS — the second endorsement raises, which is 3.8's Accept.

Two guards, deliberately: the EXISTS check produces a Persian sentence; the partial UNIQUE index is
the real guarantee, because it holds against a concurrent second endorsement the EXISTS would not
see. The amount must equal the cheque's amount — a partial endorsement would leave a remainder
nothing tracks.
```

### Task 3.9 — Role gate + grants
```
Scope:      supabase/migrations/   Effort: S      Verdict: PASS

Single-role test users used deliberately: several accounts hold both admin and accountant, which
would have made this test vacuous.

Actual:
  sales      (2023b5c0-…) -> ERROR: اجازهٔ ثبت سند پرداخت را ندارید            [42501]  PASS
  accountant (90c0479f-…) -> PAY-1405-000001 created                                    PASS
  manager    (e534b94d-…) -> PAY-1405-000001 created                                    PASS
  manager reads back document_numbers for its own voucher -> rows_visible = 1           PASS

The last line is the one phase 1's M3 broke: a role admitted at one gate and refused at the next.
Migration 352 widened document_numbers_select_finance to include manager, and this proves it end to
end on the payment path.

Grants: EXECUTE revoked from PUBLIC and anon; granted to authenticated and service_role.
```

---

## Phase test

```
Command:   npx tsc --noEmit 2>&1 | grep -cE "error TS"
Expected:  70 (D14 documented baseline)
Actual:    70
Verdict:   PASS — unchanged. No TypeScript was touched by this phase.

Command:   npm run build / npm run lint
Actual:    NOT RUN. No application code changed; every file this phase touched is .sql or .md.
           Recorded as not run, not as passed.

Tests:     There is no test script in this project. Behaviour was verified by invoking the real
           objects from psql under simulated JWTs inside BEGIN … ROLLBACK, per CLAUDE.md rule 7 —
           never by replicating a function body, which is the anti-pattern that let phase 1's
           blocker through three reviewers.
```

## Stress test

```
Scenario:  50 concurrent create_payment calls (50 parallel psql sessions), committed.
Expected:  50 distinct document numbers, 0 duplicates, 0 unbalanced entries, 0 orphans.
Actual:
  vouchers_created               | 50
  distinct_doc_numbers           | 50
  distinct_document_numbers_rows | 50
  journal_entries                | 50
  unbalanced_entries             | 0
  orphan_entries                 | 0
  vouchers_without_entry         | 0
  serial_gaps                    | 0
  payee_person_id_filled         | 50
  number range                   | PAY-1405-000001 .. PAY-1405-000050
  errors from the 50 sessions    | 0
Verdict:   PASS

Scenario:  same-source_id race — 10 concurrent assign_document_number('payment', <one uuid>).
Expected:  one number, one row.
Actual:    all 10 racers returned PAY-1405-000051; document_numbers holds 1 row for that source_id.
Verdict:   PASS
```

### Stress data cleanup — done inside this phase, not left for the owner

Phase 2 committed 50 stress receipts and left them; they became 50 of the 53 rows the accountant's
Asan bank-deposit export returned, and needed a hand-run by the owner days later. Phase 3 does not
repeat that.

`docs/verification/phase-3-stress-cleanup.sql` was written **with** the stress test, dry-run through
the M7 harness (836 → 836), then run for real. It also burns `PAY-1405-000051`, the orphan the race
probe minted — the exact artefact phase 2 left behind as defect M5.

```
Real run:  SELECT 50 / SELECT 50 / DO / DELETE 100 / DELETE 50 / DELETE 50 / burn_document_number
           exit 0

Proof of clean, measured after:
  stress_vouchers_left          | 0   | expected 0
  payment_vouchers_total        | 0   | expected 0
  journal_entries_total         | 1   | expected 1
  journal_lines_total           | 2   | expected 2
  orphan_voucher_entries        | 0   | expected 0
  payment_numbers_total         | 51  | expected 51   (none deleted — all burned)
  payment_numbers_live          | 0   | expected 0
  PAY51_burned                  | true| expected true
  asan_bank_deposit_export_rows | 1   | expected 1    (the one genuine 2026-07-25 receipt)
  vw_account_balances out_count | 0   | expected 0
  audit_payment_created_kept    | 50  | kept ON PURPOSE — see below
  triggers_rearmed              | OOO | expected OOO
```

`audit_logs` is deliberately untouched: the stress test really did happen, and an audit trail edited
to hide activity is worse than one referencing a deleted document. The three triggers
(`trg_journal_entry_immutable`, `trg_journal_line_immutable`,
`trg_payment_receipts_block_delete_when_posted`) are all back at `tgenabled='O'`.

---

## Contradictions found

**Never silently adapt** (README-EXECUTION §5.4). Each was recorded and decided; none was adapted
around quietly.

| # | Expected | Found | Impact / decision |
|---|---|---|---|
| **C1** | `rpc-contracts.md` §2: debit `supplier_payable`, ref = the payee | `supplier_payable` maps to `suppliers` **only**. For an `external_party` or `customer` payee the line is refused (`23503`) or mis-keyed | **Decided:** the debit kind is chosen from `payee_type` using only existing mappings. Zero new mappings (T13 c1); no unconditional supplier keying (T13 c3). Contract corrected as P3-C1. |
| **C2** | `p_payee_type` admits `supplier｜external_party｜customer｜other` | `other` has no person by construction (`payment_vouchers_payee_person_requires_payee_chk`), so T3's Asan precondition cannot be met | **Decided:** `other` is refused with a Persian `P0001` telling the user to register the party first. The legacy path keeps its fallback. |
| **C3** | `p_source_account_id` — "money leaves an account of ours" | Required on every channel (`NOT NULL`), but for a cheque **no money moves** | **Decided:** required, and documented as "which account the cheque is drawn on". The ledger credits a cheque account, never `bank`. |
| **C4** | — | `vw_account_balances` and `get_account_ledger` count a **cheque** voucher as bank outflow — they filter on `status` with no channel predicate | **Raised as OG-18.** Pre-existing (`pay_purchase_with_voucher` can already write one). **Not fixed here** — those readers are phase 5's surface and fixing them is a design change, not this phase's scope. |
| **C5** | MASTER-CHECKLIST: "fix the `supplier_payable` sign convention" | The convention is **already correct and coherent** across `person_settlement_position`, `list_mutual_settlement_candidates` and `post_mutual_settlement` | **Raised as OG-19.** Not inverted — see below. |
| **C6** | T6: every document gets one automatic number | `payment_vouchers` already had `trg_payment_voucher_set_number` minting `PV-YYYY-NNNNN` from a sequence — a **second identity** | **Decided:** supply the `PAY-…` number as `voucher_number`; the legacy trigger only fills a `NULL`, so it is suppressed. `tg_burn_payment_document_number` already keys to `document_numbers`, so it stays correct. `src/` treats `voucher_number` as an opaque string. |
| **C7** | `p_channel` is `bank｜cash｜cheque` | `document_channel` is `NOT NULL` and its CHECK has **no `bank`** value | **Decided:** a bank payment stores `other` until the phase-6 wizard collects the real sub-channel. The mirror of phase 2's C6. |
| **C8** | — | `create_receipt` gained date bounds in 351 (M6); the payment contract had none | **Decided:** mirrored exactly. Consistency between sibling RPCs, not a widening — the same rationale applies unchanged. |
| **C9** | `p_endorsed_cheque_id` references "a cheque we hold" | **No cheque register exists** — 0 tables match `cheque` | **Decided:** a cheque we hold is a `payment_receipts` row with `document_channel='cheque'`. Migration 354 adds the reference and the uniqueness guarantee. |
| **C10** | `doc_kind='payment'` makes the document a payment for the export | `asan_list_journal_export` classifies by a **bank-sign heuristic**, not `doc_kind` | **Recorded.** `doc_kind` is still written (3.4 requires it, and phase 5 will need a non-heuristic signal), but an `external_party` payment reads as `third_party` and a cheque payment as `unclassified`. Phase 5 owns the export. |
| **C11** | ground-truth §5: `account_kind` CHECK is 7 values | Live CHECK has **9** — `cheque_receivable` and `cheque_payable` were added by task 1.4/341 | Ground-truth is stale on this row; the note "until task 1.4 widens it" anticipated it. No impact. |

---

## Sign convention — the decision this phase owns

MASTER-CHECKLIST's phase-3 exit asks phase 3 to fix the `supplier_payable` sign and record the
convention chosen. **Measured first; the premise did not hold.**

```
person_settlement_position          receivable = SUM(debit − credit) on customer_credit
                                    payable    = SUM(credit − debit) on supplier_payable
list_mutual_settlement_candidates   identical, both kinds
post_mutual_settlement              settles by DEBITing supplier_payable (payable falls)
                                    and CREDITing customer_credit (receivable falls)
```

All three agree, and for a two-sided party account the arithmetic is right: a liability rises on
credit and falls on debit. A payment debits `supplier_payable`, which under `credit − debit` lowers
what we owe — exactly the phase-3 exit criterion. **Inverting it would invert three functions** and
turn every future settlement the wrong way round, which is the outcome the contract's own warning
exists to prevent.

**Why a paid supplier still reads negative:** nothing ever *credits* `supplier_payable`, because
purchases are never posted to the ledger. It is the exact mirror of what the T9 research measured
for `customer_credit` — nothing ever debits it because no sales posting exists. **The cause is an
absent counter-posting, not a sign.** Phase 3 does not build purchase posting, so phase 3 does not
fix it and does not claim to (the mission's §F says so in as many words).

**THE CONVENTION, recorded so phases 4 and 5 cannot invert it:**

| Kind | Outstanding |
|---|---|
| `supplier_payable`, `cheque_payable` (liability side) | `SUM(credit − debit)` |
| `customer_credit`, `cheque_receivable`, `external_party` (party-receivable side) | `SUM(debit − credit)` |

`create_payment` returns `new_balance` in this convention. On this database it comes back
**negative** for a supplier. That is reported honestly rather than clamped to zero, because a
clamped zero would hide OG-19 from the next reader.

---

## OWNER-GATE

### OG-18 — a cheque payment is counted as money leaving the bank
**Asked:** 2026-08-19. **Status:** OPEN. **Blocks:** nothing in phase 3.

`vw_account_balances` (outflow CTE) and `get_account_ledger` both sum `payment_vouchers.amount`
filtered on `status='approved'` with **no `document_channel` predicate**. A cheque payment therefore
reduces the displayed bank balance on the day it is written, though no money leaves until the cheque
clears. The **ledger** is correct — `create_payment` credits `cheque_payable` or `cheque_receivable`,
never `bank` — so this is a reporting defect in two views, not a mis-posting.

Pre-existing: `pay_purchase_with_voucher` can already write a cheque voucher. Phase 3 does not
deepen it beyond making cheque payments creatable through a supported path.

Options appear to be: (a) add `AND document_channel <> 'cheque'` to both readers, the direct mirror
of what migration 350 did for the receipt side; (b) treat a cheque as committed funds and leave it,
recording that the "balance" is available-minus-committed; (c) wait for the cheque lifecycle (A2)
and clear on settlement. **Not decided here** — (a) and (b) mean different things to an accountant.

### OG-19 — `supplier_payable` and `customer_credit` each have only one side posted
**Asked:** 2026-08-19. **Status:** OPEN. **Blocks:** nothing in phase 3; matters before phase 5.

The sign convention is correct (above). What is missing is the counter-posting: **no purchase is
ever posted to `supplier_payable`** and **no sale is ever posted to `customer_credit`**. So both
party accounts accumulate one direction only, and both read as the negative of the truth for anyone
who has only ever been paid or only ever paid us.

This is the same finding the T9 research recorded from the other side, and it is why
`person_settlement_position` reports `balanced` for a party carrying 13,000,000,000 Toman of
received purchases. **No phase currently owns building purchase or sales posting.** Recorded for the
owner to place; not assigned here.

### OG-20 — `payment_vouchers` has no delete guard, `payment_receipts` does
**Asked:** 2026-08-19. **Status:** OPEN. **Blocks:** nothing.

Migration 353 added `trg_payment_receipts_block_delete_when_posted` so a receipt with a posted entry
cannot be deleted and orphan it (Gate A M8). **There is no equivalent on `payment_vouchers`**, so a
posted payment voucher deletes freely and leaves an immutable orphaned entry — the same failure, on
the path this phase just opened. Noticed while writing the stress cleanup, which has to delete the
entries first precisely because of it.

Not fixed here: it is a new guard on a table this phase did not otherwise change, and the
symmetrical fix belongs with OG-14 (`reverse_document`), which is the real cure for both sides.

---

## Deploy verification

```
git rev-parse --short HEAD:                         see 00-progress.md
docker exec afrakala-lan-web printenv APP_GIT_SHA:  87c1a921 — 2+ commits behind
Match:                                              NO
docker restart afrakala-lan-rest:                   DONE after 354 and after 355
git status --short:                                 clean of programme files; only other missions'
                                                    untracked files remain (audit/, docs/research/_*,
                                                    docs/audits/, production-gap-analysis-mission.md)
```

The web image was **not** rebuilt. `deploy/lan/build.ps1` refuses a tree that is not clean, and this
shared checkout holds 8 untracked files belonging to other missions; forcing would stamp a SHA onto
an image containing uncommitted work — the drift the phase-2 remediation existed to close. Phase 3
changed **only** SQL and documentation, so no file in it reaches the built web bundle. What makes the
new function reachable is the PostgREST restart, which was done. Recorded as a remaining manual step.

---

## Exit criteria

- [x] Every task PASS with real output recorded
- [x] Phase test passed — typecheck 70/70; build and lint recorded as **not run**, with the reason
- [x] Stress test passed — 50 concurrent, 50 distinct numbers, 0 unbalanced, 0 orphans, 0 gaps;
      plus the same-`source_id` race
- [x] **Stress data cleaned up inside the phase and proved clean** (phase 3's own addition to the
      criteria, after phase 2's M4/M5)
- [x] No migration applied-but-uncommitted
- [ ] PR merged and verified — see 00-progress.md
- [ ] `APP_GIT_SHA` matches HEAD — **not done**, and why is recorded above
- [x] `00-progress.md` updated
- [x] Contradictions table filled (11 rows)
- [x] Owner-Gates raised: OG-18, OG-19, OG-20
