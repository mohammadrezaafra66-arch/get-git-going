# OG-14 Gate A remediation — PROGRESS

Remediation of `docs/execution/og14-reverse-document-GATE-A.md` (merged as `3a36b065`, PR #319):
**PASS with 0 BLOCKER, 3 MAJOR, 2 MINOR.** Phase 5 was not started. `asan_list_journal_export`
was **not** modified.

## HANDOFF STATE

```
Mission:              OG-14 Gate A remediation
Status:               complete
Branch:               feature/og14-remediation
Base:                 staging @ 3a36b065
Defects closed:       M2, M3, m2
Deferred with reason: M1 → phase 5 required input (function not touched)
Recorded not deleted: m1 leftover OG14-CONC → phase 8
With the owner:       OG-23 (source-row freeze)
Migrations applied:   365
REST restarted after: yes
Backup taken:         D:\AfraKalaBackups\pre-og14-remediation-20260819-164005.dump (16,947,315 bytes)
Typecheck:            70 / 70 baseline (D14)
Test data created:    NONE that persists
Census:               identical to Gate A baseline except the intended REPLACE of reverse_document
                      (public_functions still 841)
```

## Pre-flight

- [x] `git fetch origin && git switch staging && git pull --ff-only` — `3a36b065`
- [x] `git switch -c feature/og14-remediation`
- [x] Backup taken and path recorded above
- [x] Rollback file written **before** the forward migration (`365-down.sql`)
- [x] `docker restart afrakala-lan-rest` after 365

---

## M2 wider question — measured BEFORE any freeze

Live `pg_policies`: every UPDATE policy has **no column list**.

| Table | Policy | Who | Columns |
|---|---|---|---|
| `payment_receipts` | `pr_update_admin_accountant` | admin, accountant | **all** (`qual`/`with_check` = `has_any_role` only) |
| `payment_vouchers` | `payment_vouchers_update_finance` | admin, accountant | **all** |
| `dual_documents` | `dual_documents_update_finance` | admin, accountant | **all** |

No `BEFORE UPDATE` freeze trigger exists. Delete guards (353/357/360) fire on DELETE only.
`reverse_document` itself UPDATEs reversal metadata columns on the source row.

### Party / amount / bank columns a posted entry depends on

**`payment_receipts`:** `customer_id`, `amount`, `destination_bank_account_id`,
`source_bank_account_id`, `document_channel`, cheque fields. `customer_person_id` is derived
(`UPDATE OF customer_id`).

**`payment_vouchers`:** `amount`, `payee_type`, `payee_supplier_id`, `payee_customer_id`,
`payee_party_id`, `source_bank_account_id`, `document_channel`, `endorsed_receipt_id`.

**`dual_documents`:** `amount`, `payer_*`, `beneficiary_*`.

### What else reads them (would disagree with the ledger if they moved)

| Reader | Columns | If they move |
|---|---|---|
| `reverse_document` credit (pre-365) | `payment_receipts.customer_id` | Gate A M2 |
| `vw_account_balances` / `get_account_ledger` | amount + bank account id, `reversed_at IS NULL` | cash view follows the source row, journal does not |
| `asan_list_bank_deposit_export` | same as bank-deposit 350 | export follows source |
| `asan_list_journal_export` | **journal_lines**, not source party | journal stays; filter still M1 |
| `person_settlement_position` | journal_lines | agrees with journal, not the mutated source |
| OCR apply (`PaymentReceiptDocuments.tsx`) | `amount`, `tracking_number`, `document_channel`, … | can PATCH a posted receipt; auto-apply skips `posting_status=posted`, **manual apply does not** |
| Approve/reject (`receipts.$receiptId.tsx`) | `status` | legacy pending_review path |

Measured: accountant JWT (`90c0479f-…`, `{accountant}` only) + `SET LOCAL ROLE authenticated`
updated `customer_id` on a posted receipt: `NOTICE: ACCT_UPD_CUSTOMER rows=1`.

### Choice

**Do not freeze in this mission.** OCR apply of amount, tracking, and channel on a receipt that
already has a journal is a flow the current UI still offers. Approve/reject still UPDATEs `status`.
`reverse_document` must UPDATE reversal metadata. Whether party/amount may be edited after posting
is a business question → **OG-23**. Credit unwind is fixed independently so M2 cannot recur even
while the column stays mutable.

---

## M2 — credit unwind — **CLOSED** (365)

Credit is taken from the posted `customer_credit` line's `account_ref_id` after the original
entry is locked. Source `customer_id` is no longer read for the wallet.

Gate A's sequence, real RPCs, admin JWT, `BEGIN … ROLLBACK`:

```
PRE         credit_a=50000.00  credit_b=50000.00
AFTER_UPD   customer_id = B
REV_MOVED   (uuid)
POST_MOVED  credit_a=0.00      credit_b=50000.00
```

Gate A had `POST A=50000 B=0`. A's credit returns to the pre-receipt value; B is untouched.

Happy path (no UPDATE): `HAPPY_MID 777000.00` → `HAPPY_POST 0.00`.

**Reviewers**
- *Observer:* PASS — one function replaced from the 364 body; two edits (gate + customer source).
- *Software Engineer:* PASS — journal unwind and credit unwind now share `account_ref_id`. The
  three-way amount check against the source `amount` still refuses if the amount column drifted.
- *Security Engineer:* PASS — `REVOKE PUBLIC, anon` re-issued; `prosecdef=t`; `search_path=public`;
  `::app_role[]` kept; no English identifier in Persian RAISES.
- *Lead:* accepted.

---

## M3 / OG-22 — role gate — **CLOSED** (365)

Array is `admin, accountant`. Manager excluded. **Interim** pending the access-control phase
(header of 365; `ledger-decisions.md`).

Single-role users, real RPC:

```
MANAGER_REV sqlstate=42501   e534b94d-…  {manager} only
SALES_REV   sqlstate=42501   00ebe9d3-…  {sales} only     (Gate A "could not verify" — now verified)
ACCT_REV    success          90c0479f-…  {accountant} only
ADMIN_REV   success          4084224a-…  {admin} only
```

`1a15e8c6-…` holds five roles and was not used as a role-gate subject.

**Reviewers:** Observer / Software Engineer / Security Engineer PASS. Lead accepted.

---

## M1 — journal export — **NOT FIXED** (required input to phase 5)

`asan_list_journal_export` was not opened. Evidence copied into `00-progress.md`,
`MASTER-CHECKLIST.md` task 5.1, and the top of `phase-5-PROGRESS.md`:

`EXPORT_RECEIPT_FILTER n=2`, `EXPORT_RECEIPT_REVERSAL n=0`, `EXPORT_PAYMENT_REVERSAL n=2`.

**`_filter='receipt'` must not be shipped as "deposits that still stand"** until 5.1 reads stored
`doc_kind`.

---

## m2 — accept file — **CLOSED**

`docs/verification/og14-accept.sql` now calls reverse with `''` and `'   '` (expect `22023`)
and wraps manager reverse as a `42501` probe. Re-run:

```
EMPTY_REASON sqlstate=22023
WS_REASON    sqlstate=22023
MGR_REV      sqlstate=42501
SALES        sqlstate=42501
DOUBLE_REV   sqlstate=P0001
IMMUTABLE    sqlstate=P0001
```

---

## m1 — leftover — **RECORDED** (not deleted)

`tracking_number='OG14-CONC'`, `description='OG14_CONC_do_not_keep'`. Census: `journal_entries=3`,
`conc=1`. Written at the top of `phase-8-PROGRESS.md`. Phase 8 row-count baselines must allow +2.

---

## 364-down signature after 365

```
SIG_364_DOWN  drop_target_exists=t
live_args     p_doc_kind text, p_source_id uuid, p_reason text
```

Same identity arguments. `364-down` is not stale. `365-down` restores the 364 body without
dropping the RPC. Dry-run (`rollback-dryrun.sql`): public_functions **841 → 841**, `still_in_txn=t`,
after ROLLBACK 841. Honest order: 365-down → 364-down → 363-down.

No `session_replication_role` / `DISABLE TRIGGER` in 365.

---

## Task log

### 365 — reverse_document body (M2 + M3)
```
Scope:      supabase/migrations/20260819160000_365_reverse_document_gate_a.sql
            docs/verification/365-down.sql
Effort:     M
Backup:     D:\AfraKalaBackups\pre-og14-remediation-20260819-164005.dump

Acceptance: Gate A M2 sequence + role probes (this file)
Expected:   POST A=0 B=50000; manager 42501; accountant/admin success
Actual:     POST_MOVED 0.00 / 50000.00; MANAGER_REV 42501; ACCT_REV success; ADMIN_REV success
Verdict:    PASS

Reviewers:  Observer PASS; Software Engineer PASS; Security Engineer PASS
Lead:       accepted
```

---

## Phase test

```
Command:   npm run typecheck
Expected:  70 errors (D14)
Actual:    70
```

---

## Owner-Gate

**OG-22** — answered 2026-08-19, closed by 365. Interim pending access-control phase.

**OG-23** — 2026-08-19 — OPEN. Freeze party/amount once a journal exists? Not decided. Credit
unwind no longer depends on the mutable party. Continue.

---

## Census

```
BEFORE (this review / Gate A):
dual_documents|0  journal_entries|3  journal_lines|6  payment_receipts|8
payment_vouchers|0 payment_receipt_links|3  document_numbers|155  numbers_live|2
audit_logs|43485  public_functions|841  credit_ledger|3  OG14-CONC|1

AFTER last ROLLBACK:
identical
```

---

## Exit criteria

- [x] Every in-scope defect closed or deferred with a named owner
- [x] Typecheck 70
- [x] No migration applied-but-uncommitted (committed with this PR)
- [ ] PR merged — fill after `gh pr merge`
- [x] `00-progress.md` updated
- [x] Phase 5 not started; journal export not touched
