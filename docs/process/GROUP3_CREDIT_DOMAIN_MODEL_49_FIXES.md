# AfraKala 49 Fixes — Group 3 Credit Domain Model Contract

Title: از 12.4 به 12.6 — علی طالبی‌زاده — انجام گروه ۳ بسته ۴۹ اصلاحاتی — Credit Domain Model

Status: Draft for Review
Group: 3
Phase: 3.3
Owner: Ali Talebizadeh
Reviewer: Mohammadreza
Source of Truth: GitHub
Target Branch: staging
Branch: docs/AFK-G3-003-credit-domain-contract

---

## 1. Purpose

This document locks the planning contract for the Group 3 credit domain before any implementation.

This is not an implementation PR.

No source code, UI, migration, RLS/RBAC, endpoint, worker, or business logic is changed by this document.

---

## 2. Scope

This contract covers only these Group 3 backlog items:

- 4 — trusted customer visibility
- 11 — customer settlement speed
- 12 — overdue state / credit lock
- 42 — editable credit rules
- 43 — credit rule weights and manual override

This contract does not cover:

- Group 2 bug fixes
- customer/person creation
- customer relation fixes
- preinvoice submit bug fixes
- dynamic permissions fixes
- pricing fallback fixes
- product/search/label fixes
- OCR/accounting extraction
- UI implementation
- database migration

---

## 3. Source Evidence Used

The repository already contains the Group 3 task packet file. It locks Group 3 to the sales, credit, settlement, overdue, preinvoice, and handoff domain, and explicitly keeps Group 2 bug fixes out of scope.

Existing inventory also shows the following relevant facts:

- `customer_credit_profile`, `customer_credit_balance`, and `customer_credit_ledger` exist.
- `get_customer_credit` exists.
- invoices have `customer_id`.
- `sales_quotes` still have text customer fields according to inventory docs.
- waybills still have text sender/receiver fields according to inventory docs.
- the credit area is marked partial in the repo inventory.
- invoices and accounting paths are risky and must be plan-first.

This contract therefore treats the credit domain as partially implemented and contract-incomplete.

---

## 4. Existing Data Sources

### 4.1 `customer_credit_profile`

Observed purpose:

- customer-level credit profile
- current fields include credit limit, credit score, total purchases, total paid, outstanding balance, late payments count, active flag, and last purchase date

Current role in this contract:

- source for credit profile summary
- candidate source for trusted customer visibility
- candidate source for credit rule scoring inputs

Do not change this table in this phase.

### 4.2 `customer_credit_balance`

Observed purpose:

- available credit
- held credit
- last transaction time

Current role in this contract:

- source for available/held credit snapshot
- candidate source for credit availability display

Do not change this table in this phase.

### 4.3 `customer_credit_ledger`

Observed purpose:

- credit transaction history
- amount, transaction type, balance before/after, reference type/id, description, actor, created time

Current role in this contract:

- audit-like source for credit movement evidence
- candidate source for future credit history display

Do not change this table in this phase.

### 4.4 `get_customer_credit(p_customer_id)`

Observed return fields:

- available_credit
- held_credit
- outstanding_balance
- total_purchases

Current role in this contract:

- existing read contract for current customer credit snapshot
- may be used as read-only dependency for future UI

Limitation:

- it does not expose trusted status, settlement speed, overdue lock state, manual override, rule weights, or calculation explanation.

Do not change this RPC in this phase.

### 4.5 Accounting and overdue sources

Observed signals:

- receivables/payables have overdue-related fields and filters
- invoice-related code references overdue blocking/logging
- accounting receipts can affect customer credit and balances

Current role in this contract:

- possible source for overdue state and settlement behavior

Limitation:

- the final business rule for overdue lock is not yet formally locked.

Do not change accounting logic in this phase.

---

## 5. Group 2 Conflict Boundaries

The following areas are high-risk Group 2 overlap and must not be changed by Group 3:

| Conflict Area | Why It Is Dangerous | Group 3 Decision |
|---|---|---|
| customer/person creation | Group 2 owns customer/person bugs | stop and report |
| customer relation | touches persons/customers linkage | stop and report |
| sales_quotes customer relation | currently text-based according to inventory | contract only; no fix |
| preinvoice submit flow | Group 2 owns submit bug/integrity | stop and report |
| dynamic permissions | Group 2 owns propagation/fix | document needs only |
| pricing fallback | outside Group 3 | out of scope |
| product/search/label | outside Group 3 | out of scope |

---

## 6. Proposed Read Model: `CustomerCreditSnapshot`

This is a contract-level read model. It is not a new table.

```yaml
CustomerCreditSnapshot:
  customer_id: uuid
  credit_profile:
    credit_limit: number
    credit_score: number
    total_purchases: number
    total_paid: number
    outstanding_balance: number
    late_payments_count: number
    last_purchase_date: date | null
    is_active: boolean
  credit_balance:
    available_credit: number
    held_credit: number
    last_transaction_at: datetime | null
  trusted_status:
    value: trusted | candidate | watch | blocked | unknown
    reason_codes: string[]
    explanation: string
  settlement_speed:
    band: fast | normal | slow | unknown
    score: number | null
    explanation: string
  overdue_lock:
    state: none | warning | soft_lock | hard_lock | unknown
    overdue_amount: number | null
    overdue_count: number | null
    explanation: string
  manual_override:
    has_override: boolean
    override_state: none | trusted | blocked | limit_adjusted | unknown
    reason: string | null
    approved_by: uuid | null
    approved_at: datetime | null
  evidence:
    data_sources: string[]
    calculated_at: datetime
    stale: boolean
```

Rules:

- This read model may be assembled from existing tables/RPCs.
- It must not guess missing values.
- Unknown values must be returned as `unknown` or `null`, not fabricated.
- Any future API or RPC must be contract-first.

---

## 7. Trusted Customer Status

### 7.1 Status Values

| Status | Meaning | UI Meaning Later | Hard Business Effect Now |
|---|---|---|---|
| `trusted` | customer is acceptable for credit-based handling | show trusted indicator | none in this document |
| `candidate` | customer may be acceptable but lacks full evidence | show neutral indicator | none |
| `watch` | customer requires attention | show warning | none |
| `blocked` | customer should not continue credit flow without review | show danger state later | contract only |
| `unknown` | insufficient or unavailable evidence | show unknown/empty state | none |

### 7.2 Inputs

Candidate inputs from existing state:

- credit score
- credit limit
- available credit
- outstanding balance
- late payments count
- total purchases
- total paid
- overdue signals
- manual override, if later approved

### 7.3 Not Yet Approved

The following thresholds are intentionally not guessed:

- minimum score for trusted
- maximum late payment count
- exact overdue amount threshold
- minimum purchase history
- settlement speed score weights
- manual override authority

These require business approval before implementation.

---

## 8. Settlement Speed Model

### 8.1 Proposed Bands

| Band | Meaning |
|---|---|
| `fast` | customer usually settles earlier or on time |
| `normal` | customer settles within acceptable expected range |
| `slow` | customer often delays or requires follow-up |
| `unknown` | insufficient payment history |

### 8.2 Required Inputs

Likely inputs:

- invoice issue date
- expected due/settlement date
- actual payment/receipt confirmation date
- unpaid balance
- late payment count
- overdue receivables

### 8.3 Calculation Rule

No numeric formula is approved yet.

Before implementation, Group 3 must define:

- measurement window
- whether canceled invoices count
- whether partial payments count
- whether payment receipt approval date or upload date is authoritative
- how to treat cash/prepay invoices
- how to treat missing due dates

---

## 9. Overdue Lock Model

### 9.1 Lock States

| State | Meaning | Enforcement Recommendation |
|---|---|---|
| `none` | no overdue problem detected | no block |
| `warning` | minor or informational overdue signal | UI warning only later |
| `soft_lock` | sale/credit should require confirmation | requires approval workflow later |
| `hard_lock` | credit flow should be blocked until review | server-side enforcement later |
| `unknown` | no reliable evidence | no automatic block |

### 9.2 Important Rule

A hard lock must not be implemented only in UI.

If hard lock is approved later, enforcement must be server/data-layer reviewed and evidence-backed.

### 9.3 Not Yet Approved

- overdue amount threshold
- overdue count threshold
- grace period
- who can override a lock
- whether cash/prepay can bypass lock
- whether override expires

---

## 10. Editable Credit Rules

Editable credit rules must be separated into three categories.

| Rule Category | Examples | Editability |
|---|---|---|
| scoring inputs | score weights, late payment weight, purchase history weight | editable only after approval |
| hard constraints | overdue hard lock, RLS/RBAC, data integrity | not UI-editable by default |
| presentation rules | labels, explanations, warning text | UI-editable later if contract allows |

No rule editor should be implemented before:

- field list is approved
- authority/role is approved
- audit behavior is approved
- rollback behavior is defined

---

## 11. Credit Rule Weights

### 11.1 Proposed Weight Structure

```yaml
CreditRuleWeight:
  rule_key: string
  label: string
  input_source: table | rpc | computed | manual
  weight: number
  min_value: number | null
  max_value: number | null
  enabled: boolean
  explanation_template: string
```

### 11.2 Required Rules Before Implementation

- total weights must be deterministic
- disabled rules must not affect score
- missing input must be handled explicitly
- calculation explanation must be visible in evidence
- weight changes must be audited

No migration is approved by this document.

---

## 12. Manual Override Model

### 12.1 Proposed Override States

| Override State | Meaning |
|---|---|
| `none` | no override exists |
| `trusted` | trusted manually despite score |
| `blocked` | blocked manually despite score |
| `limit_adjusted` | credit limit adjusted manually |
| `unknown` | override data incomplete or legacy |

### 12.2 Required Fields For Future Implementation

```yaml
ManualCreditOverride:
  customer_id: uuid
  override_state: none | trusted | blocked | limit_adjusted
  override_reason: string
  override_amount: number | null
  approved_by: uuid
  approved_at: datetime
  expires_at: datetime | null
  is_active: boolean
```

### 12.3 Mandatory Rules

- override reason is required
- actor is required
- timestamp is required
- override must be auditable
- override must not hide underlying calculated score
- override must not be possible from Lovable alone

No database change is approved by this document.

---

## 13. Future API / Contract Requirement

If implementation needs a new read endpoint/RPC, it must be contract-first.

Proposed future contract name:

```text
get_customer_credit_snapshot
```

Proposed input:

```yaml
customer_id: uuid
```

Proposed output:

```yaml
CustomerCreditSnapshot
```

Status:

- not implemented
- not approved for migration
- requires separate Task Packet and PR

---

## 14. UI Handoff Boundary

Lovable may later display only approved fields from the final contract.

Lovable may display:

- trusted status badge
- settlement speed band
- overdue warning/lock state
- credit limit
- available credit
- held credit
- outstanding balance
- explanation text
- empty/loading/error states

Lovable must not:

- calculate credit score
- define trusted logic
- define lock logic
- create/edit credit rules
- create migration
- change Supabase/RLS/RBAC
- invent endpoint
- change customer/person relation

---

## 15. Evidence Required Before Implementation

Every future implementation PR must include:

- file inventory evidence
- exact changed files
- current behavior examples
- desired behavior examples
- at least three credit calculation examples
- at least three settlement speed examples
- at least three overdue lock examples
- manual override examples if override is included
- rollback plan
- RLS/RBAC review if any permission path changes
- migration safety review if any schema path changes

---

## 16. Open Business Questions

These must be answered before implementation:

1. What score threshold makes a customer trusted?
2. Should trusted status depend on score only or also accounting approval?
3. How many late payments move a customer to watch/blocked?
4. What overdue amount triggers warning, soft lock, or hard lock?
5. Does cash/prepay bypass overdue lock?
6. Who can manually override customer credit status?
7. Does manual override expire?
8. Should override affect credit limit, trusted status, or both?
9. Which date is authoritative for settlement speed: receipt upload, accounting approval, or bank receipt date?
10. Should settlement speed use last N invoices or all-time history?

---

## 17. Recommended Next Step

Do not implement yet.

Recommended next step is a follow-up review packet:

```text
AFK-G3-003A-credit-business-rules-review
```

That review should answer the open business questions and approve/reject:

- trusted status thresholds
- settlement speed calculation
- overdue lock levels
- editable credit rule fields
- manual override authority

Only after that should Group 3 move to implementation planning.

---

## 18. Closure Criteria For Phase 3.3

Phase 3.3 can be considered complete when:

- this contract is reviewed
- no Group 2 scope was changed
- no migration was created
- no UI was changed
- no API was implemented
- open business questions are either answered or explicitly deferred
- next implementation packet is approved separately
