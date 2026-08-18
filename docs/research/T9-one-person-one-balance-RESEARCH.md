# T9 research — how far does "one person, one balance" reach?

**Read-only measurement mission, 2026-08-18.** Test database `afrakala` on `afrakala-lan-db` only.
Production (`192.168.170.10`) was not contacted — not a query, not a ping.

No migration, no schema change, no function edit, no data change. Every object below was read from
the live catalogue (`pg_proc.prosrc` / `pg_get_functiondef` / `pg_get_viewdef` / `pg_policies` /
`pg_trigger` / `information_schema`), never from repo files and never from `schema_full_export.sql`.
The one function invoked (`person_settlement_position`) was invoked for real under a simulated admin
JWT inside `BEGIN … ROLLBACK`.

**Recommendation: (b), and it is a near miss from (a).** The reasoning is in Question 5.

## The one-paragraph summary

T9's three-way account split is real, but **it has accumulated almost nothing**: the ledger holds
**1 entry and 2 lines** and has ever used **2 of its 9 account kinds**. Exactly **one** person is on
both sides, and that person is a **real business record** (13,000,000,000 Toman of received
purchases) whose contradiction is **latent, not realised** — no journal line exists on either side of
them. The blast radius for the account-kind split is **10 functions, 0 views, 1 trigger**, of which
**4 post**. Meanwhile the identity layer T9 needs is **already built**: 29 persons-referencing foreign
keys, all registered, and every document table already carries its own `person_id`.
`external_parties.person_id` exists and is `NOT NULL`, so the gap T9 anticipated **is not there**.
The larger finding is a different one: **no balance readable in the UI comes from the ledger at all**,
so T9 is a decision about a structure that is not yet load-bearing.

---

# Question 1 — is this a problem today, or only tomorrow?

**Answer: only tomorrow, but the record it will bite is real, not test residue.**

## How many persons are on both sides

```sql
SELECT count(*) FROM (
  SELECT c.person_id FROM public.customers c
  INTERSECT
  SELECT s.person_id FROM public.suppliers s) x;
```

```
              chk              | v
-------------------------------+----
 both_sides                    | 1
 customers_total               | 23
 suppliers_total               | 15
 persons_total                 | 80
 external_parties_total        | 1
 distinct_person_ids_customers | 23
 distinct_person_ids_suppliers | 15
```

**Exactly one.** Also worth recording: `customers` has 23 rows and 23 distinct `person_id`s, and
`suppliers` has 15 and 15 — so **no person holds two customer files or two supplier files**. That
matters, because `person_settlement_position` raises rather than guessing when it finds duplicates
(see Question 3); today it never has to.

## Who they are, and do the figures contradict

Person `23b44c71-8cfc-4329-bebb-a04170969664` (`شخص آزمایشی 4`), customer
`2b67455e-7215-4c77-a278-eea814f35da5`, supplier `bbb456fa-d6a5-42dd-aba1-0304db277dea`.

**Both role rows carry the same `accounting_code`, `601702`**, and the person has one
`asan_person_code` identifier with that value:

```
       kind       |  value_raw  | value_normalized |   status    | is_primary
------------------+-------------+------------------+-------------+------------
 asan_person_code | 601702      | 601702           | provisional | f
 mobile_e164      | 09127249678 | +989127249678    | provisional | t
```

One Asan code shared by both role rows is the strongest available evidence that these are one
real-world party deliberately linked, not two parties coincidentally sharing a `person_id`.

**The real invocation** — `person_settlement_position`, admin JWT, inside `BEGIN … ROLLBACK`:

```
              person_id               | display_name  | customer_id | supplier_id | receivable | payable | net | direction
--------------------------------------+---------------+-------------+-------------+------------+---------+-----+-----------
 23b44c71-8cfc-4329-bebb-a04170969664 | شخص آزمایشی 4 | 2b67455e-…  | bbb456fa-…  |          0 |       0 |   0 | balanced
```

**It reports `balanced` — for a party with 13 billion Toman of received purchases.** That is the
contradiction, and it is not the contradiction T9 predicted. The two sides do not disagree with each
other; **both sides are empty**, because the ledger is empty. The disagreement is between the ledger
and the document tables:

```
 chk         | what                           | n
-------------+--------------------------------+----
 activity    | receipts_as_customer           | 0
 activity    | quotes_as_customer             | 0
 activity    | purchases_as_supplier          | 2
 activity    | journal_lines_customer_credit  | 0
 activity    | journal_lines_supplier_payable | 0
 activity    | credit_balance_row             | 0
 activity    | same_accounting_code_on_both   | true
```

Against that, `get_payables_summary()` under the same admin JWT reports
**`total_outstanding = 50,530,370,424.94` across 101 items**. So one reader says this business owes
50.5 billion and the ledger-based reader says every person is balanced.

## Is it a real business record, or test residue?

**Real.** Judged against `ground-truth.md` §12's own criteria, not by name:

| Criterion from §12 | This record |
|---|---|
| Test residue is identified by notes containing `E2E_`, `PROBE_do_not_keep`, `C3_CONCURRENCY_PROBE` | `notes` is `NULL` on **both** the customer and the supplier row |
| Test residue sits at "trivial amounts" | Two purchases, **12,000,000,000** and **1,000,000,000** Toman, both `status='received'` |
| Names are synthetic — "anonymised 2026-08-14: names and phone numbers are synthetic; counts, amounts and structure are real" | So `شخص آزمایشی 4` proves **nothing** either way. The name is the anonymisation, not a test marker. |

The supplier row was created **2026-05-06**, the customer row **2026-08-02** — nearly three months
apart, which is the shape of a genuine supplier who was later also registered as a customer, not of a
fixture created by one script run.

**Conclusion for Question 1.** The count is 1, it is real, and its exposure is **latent**: no journal
line references either role row, so no wrong number is being shown about this person today. It
becomes wrong the moment either side posts.

---

# Question 2 — how wide is the blast radius?

**Answer: narrower than expected for the account-kind split, and the split is not where the damage
is.**

## The measurement had to be made precise first

A naive `prosrc LIKE '%customer_credit%'` returns **31 functions**, but that conflates two unrelated
things: the `account_kind` **value** `'customer_credit'` on `journal_lines`, and the **tables**
`customer_credit_balance` / `customer_credit_ledger`. Separating them by matching the quoted literal
changes the picture completely:

| Group | Count |
|---|---|
| **A.** Functions using an `account_kind` **value** (`'customer_credit'` / `'supplier_payable'` / `'external_party'`) | **10** |
| **B.** Functions using only the credit **tables**, not the kind values | 9 |
| **C.** Views referencing either the kind values or the credit tables | **0** |
| Loose-match total (the misleading number) | 31 |

Similarly, `get_payables_summary` / `get_payables_list` / `get_payable_detail` /
`compute_daily_capital` match `%supplier_payable%` only because they read the **view**
`vw_supplier_payables`. They do not use the account kind at all:

```
proname               | reads_view | reads_ledger | uses_kind_value | reads_purchases
compute_daily_capital | t          | f            | f               | f
get_payable_detail    | t          | f            | f               | t
get_payables_list     | t          | f            | f               | f
get_payables_summary  | t          | f            | f               | f
```

## Group A — the actual blast radius

| Function | Kinds (C=customer_credit, S=supplier_payable, E=external_party) | Role | On the path of |
|---|---|---|---|
| `create_receipt` | `C--` | **POSTS** | **phase 3 sibling, phase 6 wires it** |
| `post_receipt_accounting` | `C-E` | **POSTS** | retiring at task 6.9 (D12) |
| `pay_purchase_with_voucher` | `-SE` | **POSTS** | **phase 3 — this is the precedent `create_payment` replaces** |
| `post_mutual_settlement` | `CS-` | **POSTS** | phase 5 / 6 |
| `validate_journal_line_ref` | `CSE` | reads (trigger) | **every phase — it is the gate** |
| `asan_list_journal_export` | `CSE` | reads | **phase 5** |
| `person_settlement_position` | `CS-` | reads | phase 5 / 6 |
| `list_mutual_settlement_candidates` | `CS-` | reads | phase 5 / 6 |
| `polymorphic_ref_orphan_report` | `CSE` | reads (diagnostic) | none |
| `is_valid_audit_entity_type` | `--E` | reads (audit guard) | none |

**4 post, 6 read. Of the 6 readers, 2 are diagnostics or guards with no phase dependency.**

## Group B — credit tables only

`_ensure_credit_balance`, `get_customer_credit`, `get_customer_dynamic_credit`, `hold_credit`,
`increase_credit`, `list_trusted_credit_customers`, `person_fk_drift_report`, `person_merge`,
`release_credit`. These are keyed to `customers.id` plus a denormalised `customer_person_id`, and are
**not** part of the `account_kind` split.

## Triggers and policies

Only **one** trigger implements the split: `trg_validate_journal_line_ref` on `journal_lines`
→ `validate_journal_line_ref`. The other 18 triggers on the six relevant tables are numbering, audit,
`updated_at`, phone normalisation, Asan-code mirroring, person derivation, stock-out and immutability
— none of them kind-aware.

**23 policies** across `customers`, `suppliers`, `external_parties`, `customer_credit_balance`,
`customer_credit_ledger`, `journal_lines`. **None of them references an `account_kind` value** — they
gate by role, so a change to the kind mapping does not touch RLS. `journal_lines` carries exactly two:
`journal_lines_select_finance` and `viewer_restricted`.

## `validate_journal_line_ref`'s full `CASE` — the mapping as it actually is

```sql
_targets := CASE NEW.account_kind
  WHEN 'customer_credit'   THEN ARRAY['customers']
  WHEN 'bank'              THEN ARRAY['bank_accounts']
  WHEN 'external_party'    THEN ARRAY['external_parties']
  WHEN 'supplier_payable'  THEN ARRAY['suppliers']
  WHEN 'cheque_receivable' THEN ARRAY['customers', 'external_parties']  -- 347 (OG-10)
  WHEN 'cheque_payable'    THEN ARRAY['suppliers', 'external_parties']  -- 347 (OG-10)
  ELSE NULL          -- invoice_ar / clearing / other: control accounts, nothing to check
END;
```

Two observations worth carrying forward. First, migration 347 already established the **precedent that
one account kind may resolve to more than one table** — the cheque kinds accept two each. Second, the
`ELSE NULL` branch means three kinds (`invoice_ar`, `clearing`, `other`) are unvalidated control
accounts today.

## The front end

| Search over `src/` | Files |
|---|---|
| `customer_credit` | 3 — of which 2 are the credit **tables** and 1 is generated `types.ts` |
| `supplier_payable` | 1 — `types.ts`, and it is the **view** name `vw_supplier_payables` |
| `external_party` | 7 — but as a **payee type** in `src/lib/treasury/queries.ts` (`PayeeType`) and audit `entity_type`, not as a journal `account_kind` |

**No front-end file writes or branches on a journal `account_kind`.** The relevant real call sites are
five RPCs: `person_settlement_position` and `post_mutual_settlement` and
`list_mutual_settlement_candidates` (`src/lib/accounting/mutual-settlement.ts`),
`get_customer_credit` (`_app.accounting.receipts.$receiptId.tsx:258`) and
`get_customer_dynamic_credit` (`_app.sales.quotes.new.tsx:180`).

## The finding that matters more than the count

**Not one balance a user can see is computed from the ledger.**

| Reader | Actually reads | Reads `journal_lines`? |
|---|---|---|
| `vw_account_balances` | `payment_receipts` + `payment_vouchers` + `bank_accounts` | **no** |
| `vw_customer_receivables` | `sales_quotes` + `payment_receipt_links` | **no** |
| `vw_supplier_payables` | `purchases` | **no** |
| `get_payables_summary` / `_list` / `_detail` | `vw_supplier_payables` | **no** |
| `customer_credit_balance` / `_ledger` | their own tables | **no** |
| `person_settlement_position` | `journal_lines` | **yes — the only one** |

```
 chk         | t                                | count
-------------+----------------------------------+-------
 ledger_size | journal_entries                  | 1
 ledger_size | journal_lines                    | 2
 ledger_size | distinct account_kinds ever used | 2
 doc_tables  | purchases                        | 101
 doc_tables  | payment_receipts                 | 7
 doc_tables  | payment_vouchers                 | 0
 doc_tables  | sales_quotes                     | 57
```

The ledger has ever used **2 of 9** account kinds (`bank`, `customer_credit`). `payment_vouchers` is
empty, so `pay_purchase_with_voucher` — the one function that posts `supplier_payable` — **has never
run**. The three-account split is therefore a **design-time** commitment with essentially no
accumulated data behind it.

---

# Question 3 — how much of "one file" already exists?

**Answer: nearly all of the identity layer. The gap is one column on `journal_lines`, not a missing
`person_id`.**

## Can every `journal_lines.account_ref_id` be resolved to a `person_id`?

Attempted for every row in existence, joining through whichever table each `account_kind` implies:

```
      chk      |  account_kind   | has_ref |           resolved_person
---------------+-----------------+---------+--------------------------------------
 jl_resolution | bank            | t       | (control account - no person)
 jl_resolution | customer_credit | t       | a089aa60-42e2-409d-b328-f888e9dde17f
```

**2 of 2 rows resolve** — one to a person, one correctly to "no person" because `bank` is an account
of ours, not a party. The join works; there is simply almost nothing to join. This measurement proves
the mapping is sound and proves nothing about scale.

## Does `external_parties` have a `person_id`?

**Yes — and it is `NOT NULL`.** This corrects the expectation T9 was recorded with.

```
 column_name     | data_type                | is_nullable
-----------------+--------------------------+-------------
 id              | uuid                     | NO
 full_name       | text                     | NO
 national_id     | text                     | YES
 phone           | text                     | YES
 accounting_code | text                     | YES
 notes           | text                     | YES
 is_active       | boolean                  | NO
 created_at      | timestamp with time zone | NO
 updated_at      | timestamp with time zone | NO
 person_id       | uuid                     | NO
```

**All three role tables carry a `NOT NULL person_id`.** Every one of the three account kinds can
already be resolved to a person in one join. There is no missing link.

## And it goes considerably further than three tables

`person_fk_registry_report()` returns **29** persons-referencing foreign keys, **every one**
`exists_as_fk = t`, `in_registry = t`, `verdict = ok`:

```
asan_import_person_rows.matched_person_id      credit_requests.customer_person_id
credit_score_snapshots.customer_person_id      customer_capital_allocations_dynamic.customer_person_id
customer_credit_balance.customer_person_id     customer_credit_ledger.customer_person_id
customer_credit_profile.customer_person_id     customers.person_id
delivery_receipts.customer_person_id           didar_activities.customer_person_id
external_parties.person_id                     mutual_settlements.person_id
payment_receipts.customer_person_id            payment_receipts.receiver_party_person_id
payment_vouchers.payee_person_id               person_aliases.person_id
person_context_links.person_id                 person_field_values.person_id
person_identifiers.person_id                   person_merge_candidates.person_id_a
person_merge_candidates.person_id_b            person_merge_log.loser_id
person_merge_log.winner_id                     product_suppliers.supplier_person_id
profiles.person_id                             purchase_prices.supplier_person_id
purchases.supplier_person_id                   sales_quotes.customer_person_id
suppliers.person_id
```

**Every document table already carries a denormalised `person_id`** — `purchases`,
`payment_receipts` (twice), `payment_vouchers`, `sales_quotes`, `delivery_receipts`, and both credit
tables. The "one file" idea is not merely possible; it is **already how every source document is
keyed**. `journal_lines.account_ref_id`, which points at the *role* row rather than the person, is the
outlier — it is the **only** place in the measured surface where a person is reached through a role
instead of directly.

## `person_settlement_position` — the mechanism, not the symptom

The body, read from the catalogue:

```sql
SELECT COALESCE(SUM(jl.debit - jl.credit), 0) INTO _r      -- receivable
  FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_entry_id
 WHERE je.status = 'posted' AND jl.account_kind = 'customer_credit' AND jl.account_ref_id = _c;

SELECT COALESCE(SUM(jl.credit - jl.debit), 0) INTO _p      -- payable
  FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_entry_id
 WHERE je.status = 'posted' AND jl.account_kind = 'supplier_payable' AND jl.account_ref_id = _s;
```

**The sign convention is correct. The mechanism of the misleading numbers is that only half the
postings exist.**

A receipt **credits** `customer_credit` (money arrived from the customer). Under
`SUM(debit − credit)` that drives `receivable` **negative**. The offsetting **debit** to
`customer_credit` would come from posting a sale or an invoice — and **no sales posting exists**
(`ground-truth.md` §1, "the ledger is empty and nothing fills it"; `invoice_ar` is a control account
with no writer). So a customer who has only ever paid reads as a party **we** owe. That is exactly
Gate A's check 14: `receivable=-8827000 payable=0 net=-8827000 direction=we_pay`.

**This is not caused by the three-way split.** It is caused by the missing debit side. Resolving T9
would not fix it; posting sales would. Recording that distinction is the single most important thing
in this section, because the two problems have been discussed as one.

## Is there any existing object that already treats a person as a single balance?

**Yes — `person_settlement_position` is exactly that, and it is the only attempt.** It:

* takes a `_person_id`, not a customer id or a supplier id;
* resolves **both** role rows from that one person (`customer_id`, `supplier_id` are both in its
  return type);
* computes `net = receivable − payable` — **one figure per person, across two account kinds**;
* returns a `direction` of `customer_pays` / `we_pay` / `balanced`.

It also **already refuses to guess** when the one-file assumption is violated, which is T9's rule
enforced in code today:

```sql
IF _n > 1 THEN
  RAISE EXCEPTION 'این شخص % پروندهٔ مشتری دارد؛ تا وقتی یکی نشده‌اند تسویهٔ متقابل ممکن نیست.', _n
    USING ERRCODE = '22023';
END IF;
```

`post_mutual_settlement` and `list_mutual_settlement_candidates` sit on the same person-centred
model. So T9 is **not a new direction for this codebase** — it is the generalisation of a pattern
three functions already implement.

**Counter-observation, recorded because it cuts the other way.** `pay_purchase_with_voucher` posts
its debit line as `('supplier_payable', _purchase.supplier_id)` **unconditionally**, even when
`_payee_type = 'external_party'`. It branches on payee type for the voucher's own metadata but not
for the journal line. So the existing payment precedent already collapses the payee to the supplier
row — which means phase 3 inheriting this shape would deepen the split, not merely preserve it.

---

# Question 4 — the Part 4 caveat, measured

**Answer: it is not "verify the symmetry". The holding half was never built.**

## Distinct entry kinds in `customer_credit_ledger`

The column is `transaction_type` (not `entry_type`).

```
     chk     | transaction_type | n |     total
-------------+------------------+---+----------------
 ccl_by_type | payment          | 1 | 10100000000.00

    chk    | count
-----------+-------
 ccl_total | 1

    chk    | rows | sum_available  | sum_held | rows_with_hold
-----------+------+----------------+----------+----------------
 ccb_state | 11   | 10100000000.00 | 0.00     | 0
```

**One row, type `payment`.** Across 11 balance rows, `held_credit` sums to **0.00** and **zero rows
have any hold at all**. (The previous mission's census reported 51 rows; 50 were the
`PHASE2_STRESS_do_not_keep` receipts removed by the M4 cleanup. 1 is the correct post-cleanup figure.)

## Does `hold_credit` exist, and is it called?

**It exists. It has no caller anywhere.**

SQL callers of the four credit-movement functions, from `prosrc`:

```
 sql_callers | increase_credit | create_receipt
 sql_callers | increase_credit | post_receipt_accounting
```

That is the complete list. **`hold_credit`, `release_credit` and `hold_capital_allocation` have zero
SQL callers.** In `src/`, all three appear **only** in the generated
`src/integrations/supabase/types.ts` — there is no real call site:

```
src/integrations/supabase/types.ts:11735:      hold_capital_allocation: {
src/integrations/supabase/types.ts:11744:      hold_credit: {
src/integrations/supabase/types.ts:12313:      release_credit: {
```

`held_credit` is written only by `hold_credit`, `release_credit`, `increase_credit` and
`_ensure_credit_balance` — and the two that would decrement it are unreachable.

## Is there a code path where finalising a proforma consumes credit?

**No. There is a path that *checks* credit and a path that *records a snapshot*, but nothing
consumes.**

`create_sales_quote_with_items` is the only quote-creating function that touches credit, and precisely
how it touches it:

```
     chk     | calls_hold_credit | writes_held_credit | reads_available_credit | writes_ledger
-------------+-------------------+--------------------+------------------------+---------------
 csqwi_match | f                 | f                  | t                      | f
```

It calls `get_customer_dynamic_credit(p_customer_id)`, compares `available_credit` against
`_sum_final`, and writes a `_credit_snapshot jsonb` with modes `credit_ok`,
`no_credit_accounting_approval` and `guest_accounting_approval`. **It never calls `hold_credit`, never
writes `held_credit`, never writes `customer_credit_ledger`.**

The nine triggers on `sales_quotes` are `trg_asan_burn_sales_quote_number`, `trg_audit_sales_quotes`,
`trg_normalize_phone`, `trg_product_video_chain_on_accept`, `trg_sales_quotes_assign_number`,
`trg_sales_quotes_derive_person`, `trg_sales_quotes_stock_out`, `trg_sales_quotes_updated_at`,
`trg_sales_quotes_validate_status`. **None touches credit.**

The check does run in anger — `audit_logs` holds **6** `credit_limit_blocked` rows. So the gate works;
there is simply nothing behind it that reserves the amount it approved.

## What this means for OG-17

The revised OG-17 question — *"is the hold/release symmetry actually maintained"* — has a measurable
answer, and it is **no, because only one side of the symmetry exists**:

| Half of the model | Built? | Evidence |
|---|---|---|
| Check: a proforma may only be finalised if credit is available | **yes** | `create_sales_quote_with_items` reads `get_customer_dynamic_credit`; 6 `credit_limit_blocked` audit rows |
| **Hold: finalising consumes the limit** | **no** | `hold_credit` has 0 callers in SQL and 0 in `src/`; `held_credit` = 0.00 on all 11 rows; no `sales_quotes` trigger touches credit |
| Release: paying restores the limit | **yes** | `increase_credit`, called by `create_receipt` and `post_receipt_accounting` |

The revolving-limit model the owner described is therefore **coherent but half-implemented**: the
system checks a limit, never reserves against it, and then releases against it on payment. Because
nothing is ever consumed, `available_credit` today behaves as `ground-truth`-consistent evidence
suggests — a monotonically increasing total of receipts.

**This changes OG-17's question again**, and the owner should see the new form rather than the one
recorded on 2026-08-18: not *"is the symmetry maintained"* but **"the hold half does not exist — should
it be built, and does the revolving-limit model depend on it?"** That is a decision, not a
measurement, so it is left here and not answered.

---

# Blast-radius table

| Surface | Count | Of which post | On phase 3/4/5's path | Notes |
|---|---|---|---|---|
| Functions using an `account_kind` value | **10** | **4** | 6 | The real split surface |
| Functions using only the credit tables | 9 | 0 | 2 (`increase_credit`, `get_customer_dynamic_credit`) | Keyed to `customers.id`, not the split |
| Views using either | **0** | — | — | No view reads the kinds |
| Triggers implementing the split | **1** | — | all phases | `trg_validate_journal_line_ref` |
| Policies referencing a kind value | **0** | — | — | RLS gates by role; unaffected |
| `src/` files branching on a journal `account_kind` | **0** | — | — | 5 real RPC call sites, none kind-aware |
| Persons-referencing FKs already registered | **29** | — | — | All `ok`; identity layer already built |
| `journal_lines` rows in existence | **2** | — | — | 2 of 9 kinds ever used |
| Persons on both sides | **1** | — | — | Real record, latent exposure |
| Balance readers that read the ledger | **1 of 6** | — | phase 5/6 | `person_settlement_position` only |

---

# What I could not verify

1. **Production.** Never contacted, by rule. Whether production has more persons on both sides — and
   it plausibly does, since it holds the company's real records rather than 80 anonymised persons — is
   **unknown and unknowable from here**. This is the single largest gap in this report, and it is the
   number that would move recommendation (b) toward (c). `ground-truth.md` Q5 already records the same
   limitation for ledger state generally.
2. **Whether the both-sides person is genuinely one real-world party.** The evidence is strong (one
   `person_id`, one Asan code `601702` on both role rows, three months apart, no test markers,
   13 billion of activity) but the 2026-08-14 anonymisation replaced names, so I cannot confirm
   against the pre-anonymisation source that these were not two distinct parties merged by the
   anonymiser.
3. **Whether `hold_credit` was ever called historically and later reverted.** `audit_logs` has no
   hold or release action, and the ledger has one row, but I cannot exclude activity that was never
   audited. The absence of any caller in the current code is solid; the historical claim is inference.
4. **The cost of changing `journal_lines.account_ref_id`'s meaning.** Counting the 10 dependent
   functions is not the same as estimating the work, and the mission forbids sizing it. What is
   measured is the surface; what is not measured is the effort.
5. **Whether `invoice_ar` / `clearing` / `other` will ever need person resolution.** They are
   unvalidated control accounts today (`ELSE NULL` in `validate_journal_line_ref`). If a future sales
   posting keys `invoice_ar` to a person, the split widens; `ground-truth.md` Q4 records that this is
   undecided.
6. **What phase 3's `create_payment` contract will actually be.** `rpc-contracts.md` §2 describes it,
   but the function does not exist, so I measured its nearest precedent
   (`pay_purchase_with_voucher`) instead and inferred from that.

---

# Question 5 — the recommendation

## **(b) — phase 3 can proceed, but it must be written so it does not deepen the split.**

## The evidence for proceeding

| Fact | Number |
|---|---|
| Persons affected today | **1**, with **0** journal lines on either side — exposure is latent |
| `journal_lines` rows the split has accumulated | **2**, using **2 of 9** kinds |
| Views that would have to change | **0** |
| RLS policies that would have to change | **0** |
| `src/` files branching on an `account_kind` | **0** |
| Triggers implementing the split | **1** |
| Persons-referencing FKs already in place | **29 of 29 `ok`** |
| Role tables with a `NOT NULL person_id` | **3 of 3** |

Nothing has accumulated in the structure T9 replaces, and the identity layer T9 needs is already
built. Blocking phase 3 to resolve T9 first would stall the programme against a structure that holds
two rows, and would do it on the strength of one latent record.

## The evidence against proceeding unchanged

Two findings stop this being recommendation (a).

**First, phase 3 is the phase that would make the split load-bearing.** Today `supplier_payable` has
**never been written** — `payment_vouchers` is empty, so `pay_purchase_with_voucher` has never run.
`create_payment` is precisely the function that starts writing it. The split is cheap to change now
*because* it is empty; phase 3 is what stops it being empty.

**Second, the existing precedent would deepen it if copied.** `pay_purchase_with_voucher` posts
`('supplier_payable', _purchase.supplier_id)` **unconditionally**, including when the payee is an
`external_party`. A `create_payment` modelled on it would key its debit to the supplier row even when
the party paid is not a supplier — which is the exact failure T10 describes, written fresh into the
one function A4 designates as the place the rule can hold for every caller.

## What (b) means concretely, stated as constraints rather than as a design

The mission forbids proposing a target model, so this is limited to what the measurements say phase 3
must avoid:

* **Do not add a new `account_kind` → table mapping.** `validate_journal_line_ref`'s `CASE` has 6
  mapped kinds; phase 3 should need 0 new ones.
* **Resolve the party to a `person_id` at the boundary and record it.** `payment_vouchers` already has
  `payee_person_id` and it is already in the FK registry — the column exists and is registered, so
  populating it costs nothing and makes the line re-keyable later.
* **Do not repeat `pay_purchase_with_voucher`'s unconditional supplier keying.** If the payee is not a
  supplier, the line should not claim it is.
* **Take the T9 research's answer before phase 5.** `asan_list_journal_export` and
  `person_settlement_position` both read all three kinds, and phase 5 is where they become the
  accountant's numbers.

## Two things the owner should see alongside this

**The T9 framing conflates two independent problems, and only one of them is T9.**
`person_settlement_position` returns misleading numbers because **nothing ever debits
`customer_credit`** — there is no sales posting — not because the split exists. Resolving T9 would
leave that untouched. Recorded here because the two have been discussed as one, and fixing the wrong
one would look like progress without being progress.

**Nothing a user can see comes from the ledger.** Five of the six balance readers go to the document
tables; the ledger holds 2 rows against 101 purchases, 57 quotes and 7 receipts. `get_payables_summary`
reports 50.5 billion Toman outstanding while the only ledger-based reader reports every person
balanced. Whatever is decided about T9, **that** is the gap between the ledger and the business, and
it is larger than the three-account split.

## Confidence, stated honestly

**(b) over (a): high confidence** — resting on measured counts (2 ledger rows, 0 views, 0 policies,
0 front-end branches, 1 trigger) and on the specific unconditional-keying line in
`pay_purchase_with_voucher`.

**(b) over (c): moderate confidence, and it depends on one number I could not measure.** The case for
(b) rests on "only 1 person is affected". That is the count on a test database of 80 anonymised
persons. **On production it is unknown**, and if production has many parties who are both customer and
supplier, the exposure is not latent and (c) becomes arguable. Establishing that count is a read-only
query that only the owner can authorise. **I would not close this question without it.**

The owner decides.
