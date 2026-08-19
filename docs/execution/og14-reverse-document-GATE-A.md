# GATE A — reverse_document (OG-14) — independent supervising engineer review

**Reviewed:** 2026-08-19, against `staging @ 0accfe21` (PR #318 merged). The brief named `0accfe23`;
the merge commit on `origin/staging` is `0accfe21`.
**Scope:** migrations **363** and **364**, rollback files, `og14-accept.sql`, leftover concurrency
rows. Phase 5 was not started. `asan_list_journal_export` was not modified by the mission; it was
**invoked**, not edited.
**Method:** every object read from the live catalogue (`pg_get_functiondef`, `pg_get_constraintdef`,
`pg_policies`, `pg_trigger`, `pg_indexes`). Every behavioural claim tested by **invoking the real
function** under a simulated JWT inside `BEGIN … ROLLBACK` — never by replicating a body.
Production (`192.168.170.10`) was not contacted, not queried, not pinged. Persian output was
written with `\o` and read from a file.

**Database left as found for this review.** Census at first connection and after the last probe
connection closed is identical. The leftover described in section E was already on the database
when this review started (committed by the mission's concurrency test). This review added nothing:

```
dual_documents|0          journal_entries|3        journal_lines|6
payment_receipts|8        payment_vouchers|0       payment_receipt_links|3
document_numbers|155      numbers_live|2           audit_logs|43485
public_functions|841      credit_ledger|3          OG14-CONC|1 (reversed)
=== DIFF baseline vs now ===
IDENTICAL — this review left the database as found
```

I did not write a migration. I did not remediate. I did not start phase 5.

---

## Verdict

# PASS — 0 BLOCKER, 3 MAJOR, 2 MINOR

On the path the function is for — reverse the document that was posted, without first editing the
source row — I could not make a **quiet wrong ledger**. Journal lines net. `customer_credit_balance`
returns to the pre-receipt value. Bank cash views and the bank-deposit export ignore the reversed
source row. One cheque is live at a time: reverse → re-endorse → reverse → re-endorse works;
two live endorsements of the same cheque raise `P0001`. 343 still fires on the original.

That is not the same as "nothing is wrong." Three MAJORs sit next to a correct RPC:

1. **`asan_list_journal_export` does not read stored `doc_kind`.** A reversed *bank* receipt stays
   classified as `receipt`; its reversal is classified as `payment`. `_filter='receipt'` therefore
   still publishes the undone document. Phase 5 inherits this as a measured fact. The mission was
   forbidden to retouch that function; the hole is still a hole.
2. **Credit unwind keys `payment_receipts.customer_id`, which is still UPDATEable.** Journal unwind
   copies immutable `journal_lines`. After an UPDATE of `customer_id`, reverse subtracted the other
   customer's credit and left the original customer's credit standing against a net-zero journal.
3. **OG-22:** the owner has answered **accountant and admin only**. Live `has_any_role` still admits
   `manager`. I reversed as manager `e534b94d-…` successfully. Do not implement the narrowing in
   this review; it is pending remediation.

It does not fail the way phases 1–3 failed. There is no live writer I could break, no second live
endorsement of one cheque, no disabled 343. The leftover is one reversed 10,000 receipt, not fifty
live bank-export rows.

---

## Defects found

| # | Severity | Location | Description | Evidence | Recommendation |
|---|---|---|---|---|---|
| **M1** | MAJOR | live `asan_list_journal_export` × reversing a **bank** receipt | **The live journal export classifies by bank-line sign, not by stored `doc_kind`.** Stored pair is `receipt`/`receipt`. Inferred: original `receipt` (`bank_net > 0`), reversal `payment` (`bank_net < 0`). `_filter='receipt'` still contains the original; the reversal is **absent** from that filter (`EXPORT_RECEIPT_REVERSAL n=0`) and **present** under `_filter='payment'` (`n=2` line rows). A reader that lists the original and ignores the reversal is phase-2 B1's shape, on the Asan journal file. The mission correctly did not edit this function (phase 5 / C-d). The fact still has to be inherited: today the function is reachable from `src/lib/asan/export-journal.ts`. | Inside `BEGIN…ROLLBACK`, bank receipt `GA-R1` / `RCP-1405-000054` then `reverse_document`. `STORED_KINDS` → `receipt,f` and `receipt,t`. `EXPORT_RECEIPT_FILTER n=2` (original's two lines). `EXPORT_RECEIPT_REVERSAL n=0`. `EXPORT_PAYMENT_REVERSAL n=2`. Leftover conc pair on the live DB: `CONC_JOURNAL_ALL` → original `receipt` / reversal `payment`. | Phase 5 task 5.1 must either classify from stored `doc_kind` (so the pair stays together as receipts) or net/hide reversal pairs. Do not ship `_filter='receipt'` as "deposits that still stand." |
| **M2** | MAJOR | live `reverse_document` credit branch × `payment_receipts.customer_id` | **Credit is unwound from the source row's current `customer_id`; the journal is unwound from posted lines.** `pr_update_admin_accountant` allows UPDATE with no column list. After `UPDATE … SET customer_id = B` on A's receipt, `reverse_document` left **A's credit at 50,000** (journal for A had been netted to zero) and **B's credit at 0** (B was never on those journal lines). Silent wrong wallet. Requires a prior UPDATE; it is not the happy path. The UPDATE in this probe ran as `supabase_admin` (table owner). The policy is wide enough that an accountant JWT would be allowed the same column change; I did not repeat the probe under `SET LOCAL ROLE authenticated`. | `PRE A=50000 B=50000` → UPDATE `GA-A` to B → reverse → `POST A=50000 B=0`. Original lines: `customer_credit` / `ce69632d-…` (A). Reversal copied the same `account_ref_id`. | Unwind credit from the posted `customer_credit` line's `account_ref_id`, not from `payment_receipts.customer_id`. Optionally freeze party columns once a journal exists. |
| **M3** | MAJOR | live `reverse_document` role gate | **OG-22 is answered: accountant and admin only; manager excluded.** The live gate is still `ARRAY['admin','accountant','manager']`. A manager can reverse. That is not a wrong balance; it is the wrong person. The mission raised OG-22 and continued on the wide gate, which was correct *until* the owner answered. The answer is now pending remediation. **This review does not implement it.** | `NOTICE: MANAGER_REV success` as user `e534b94d-a1a5-4614-991f-f4803eace751` (`{manager}` only). Contract §4 still documents the wide gate and names OG-22 open. | Follow-up migration: drop `manager` from the array. Re-test manager → `42501`; accountant and admin individually still succeed. |
| **m1** | MINOR | leftover `OG14-CONC` (mission concurrency) | **One reversed 10,000 bank receipt and two posted journal entries remain.** Identifiable (`tracking_number='OG14-CONC'`, `description='OG14_CONC_do_not_keep'`). **Not** in `asan_list_bank_deposit_export` (`CONC_BANK_EXPORT=0`). **Is** in `asan_list_journal_export` as a `receipt` plus a `payment` reversal (M1). `numbers_live=2`. Credit for that customer `0.00`. Same *class* as phase-2 M4 (committed test documents 343 cannot delete) at **much smaller scale**, and unlike phase 2 they are excluded from the bank-deposit export. They will move a phase-8 journal-export baseline if that baseline is a row count rather than a net. | Census: `journal_entries=3` (seed + pair), `payment_receipts=8`, `credit_ledger=3`. | Leave them, or owner-run a documented exception list for phase 8. Do not DELETE posted journals. |
| **m2** | MINOR | `og14-accept.sql` | **The mission's accept file never called reverse with `''` or whitespace.** The live function does refuse (`22023`); I measured it. The claim in the progress file was true and untested by its own script. | `NOTICE: EMPTY_REASON sqlstate=22023`; `NOTICE: WS_REASON sqlstate=22023`. | Add those two calls to the accept file in a later docs PR. |

**Count: 0 BLOCKER, 3 MAJOR, 2 MINOR.**

---

## A — does the reversal undo exactly what the original did?

Enumerated from **live `create_*` bodies**, then tested.

### Receipt (`create_receipt`)

| Original effect | Reversal |
|---|---|
| Posted `journal_entries` + two `journal_lines` (`bank`/`cheque_receivable` debit, `customer_credit` credit) | New posted entry; lines copied with debit/credit swapped; same `account_kind`/`account_ref_id`. Original untouched. **Measured.** |
| `increase_credit` → `customer_credit_balance` + ledger `payment` + `credit_payment` audit | Subtracts `payment_receipts.amount` under `FOR UPDATE`; ledger `adjustment`. Does **not** delete the `credit_payment` audit (correct: that row is history). Balance restored on the happy path: `0 → 777000 → 0`. **Fails if `customer_id` was updated — M2.** |
| `payment_receipt_links` | `DELETE` for that `receipt_id`. Mission accept: `0 → 1000000 → 0`. Not re-probed here (same function path). |
| `assign_document_number` | Original number **left** (`NUMBERS live_rcp=1`, `burned_at` null). Reversal mints a new `source_id` / `RCP-` number. |
| `audit_logs` `receipt_created` | Additional `document_reversed` in the same transaction. Keys measured: `amount`, `reason`, `counterparty_id`, `document_number`, `journal_entry_id`, `counterparty_kind`, `original_*`. No Asan / phone / national id keys. |
| `trg_payment_receipts_recompute_employee_score` on INSERT | Does **not** fire on `reversed_at` (trigger is `INSERT OR DELETE OR UPDATE OF status`). Live body comments that receipt-status scoring is **inert**. Not a live balance. |
| `trg_normalize_phone` / `set_updated_at_now` | `updated_at` will bump on the metadata UPDATE. No balance. |

### Payment (`create_payment`)

| Original effect | Reversal |
|---|---|
| Posted entry + two lines | Swap, as above. |
| `endorsed_receipt_id` + unique index | `reversed_at` set; `endorsed_receipt_id` **kept**. Index predicate is `endorsed_receipt_id IS NOT NULL AND reversed_at IS NULL` (live `pg_indexes`). `create_payment` EXISTS uses the same `reversed_at IS NULL`. **That is what freed the cheque** — both look at `reversed_at`. The mission's wording "if neither looks at `reversed_at`" is a hypothetical they did not ship. |
| Bank / cash views | `vw_account_balances` / `get_account_ledger` exclude `reversed_at IS NOT NULL`. Cheque channel already excluded (359). |
| Payables UI | `get_payables_summary` reads `vw_supplier_payables` → `purchases`, **not** the journal. T14: a payment reversal is a money movement undone; it does not un-pay a purchase row. Correct under T14. |

### Dual (`create_dual_document`)

Live branch: mark `dual_documents.reversed_at`; swap the two lines; no credit; no bank view (T12). I **did not re-invoke** dual in this review (0 dual rows on the database). See "What I could not verify."

---

## B — what reads a reversal pair?

| Reader | Original | Reversal | Pair |
|---|---|---|---|
| `person_settlement_position` | posted `journal_lines` `customer_credit` / `supplier_payable` | same, swapped | **Nets.** `PSP_MID` receivable `-777000` → `PSP_AFTER` `0 / balanced`. |
| `vw_account_balances` | source row if approved, non-cheque, `reversed_at IS NULL` | journal not read | **Ignores reversed original.** `BANK_IN_BEFORE = BANK_IN_AFTER = 10100000000.00`. |
| `get_account_ledger` | same source-table predicates + `reversed_at IS NULL` (live 364 body) | not a journal reader | Same as the view. |
| `asan_list_bank_deposit_export` | approved bank (non-cash/cheque) receipts, `reversed_at IS NULL` | no | **`BANK_EXPORT_GA=0`, `CONC_BANK_EXPORT=0`.** |
| `asan_list_journal_export` | every `status='posted'` entry; **inferred** `doc_kind` | included, inferred separately | **M1.** Stored `doc_kind` is unused. Dual / endorsement (no bank, no `external_party`) stay `unclassified` — phase 4 C-d, confirmed not re-opened. |
| `get_payables_summary` | purchases | no | Unaffected (T14). |
| `validate_journal_entry_balance` | sums one entry | sums the new entry | Each balanced; does not net the pair. Correct. |
| `src/` | no `reverse_document` / `reversed_at` matches | — | Front end does not know reversals exist yet (phase 6). |

---

## C — B1, harder

Live index:

```
payment_vouchers_endorsed_receipt_unique_idx
  ON (endorsed_receipt_id)
  WHERE endorsed_receipt_id IS NOT NULL AND reversed_at IS NULL
```

Mechanism: the first voucher **keeps** `endorsed_receipt_id`. It drops out of the unique index when `reversed_at` is set. A second voucher with the same cheque can insert. `create_payment`'s EXISTS matches the index, so the user gets Persian `P0001` rather than `23505`.

Probes (one transaction, rolled back):

- Reverse endorsement 1, endorse to a **different** supplier → `END2` succeeded. `LIVE_ENDS=1`. `KEPT_ID=2` (reversed + live).
- Reverse 2, endorse again (`END3`) → succeeded. No drift of the cheque id.
- Third **live** endorsement while `END3` stands → `DOUBLE_LIVE sqlstate=P0001`.

Owner option (a) still holds: **one live endorsement per cheque.** The escape hatch is reversal, not reject-status.

---

## D — reversal-of-a-reversal

- Second reverse of the same source: mission `DOUBLE_REV P0001`; same path in the live body (`reversed_at` and `reverses_entry_id` unique).
- Reverse using the reversing journal's `source_id` (numbering uuid, not a receipt): `REV_OF_REV sqlstate=P0001` (`سندی برای برگشت یافت نشد` — no source row).
- Direct `INSERT` into `journal_entries` as accountant under `SET LOCAL ROLE authenticated`: `DIRECT_JE_AUTH sqlstate=42501`. No INSERT policy (only `journal_entries_select_finance`). The DEFINER RPC remains the writer.
- Concurrency: not re-run (would commit more leftovers). Mission evidence: one session `51e00e30-…` succeeded, the other `P0001`. I treat that as already on the database (section E), not re-measured.

---

## E — leftover data

Already present at review start; this review did not add rows.

| Item | Value |
|---|---|
| Receipt | `OG14-CONC`, amount 10,000, `reversed_at` set, description `OG14_CONC_do_not_keep` |
| Journals | seed (1) + original conc + reversal = **3**; lines **6** |
| Bank-deposit export | **0** rows for that tracking |
| Journal export today | original as `receipt`, reversal as `payment` (M1) |
| Credit | `0.00` for that customer |
| Identifiable? | **Yes** (tracking + description) |
| Same as phase-2 M4? | Same class (343-undeletable test documents). Different: scale 1, excluded from the bank-deposit export, marked. Phase 8 E2E that counts posted journal rows will see +2. |

---

## Also verified

| Check | Result |
|---|---|
| 343 not weakened | No `session_replication_role` / `DISABLE TRIGGER` in 363 or 364. After reverse, `UPDATE` original entry → `IMMUTABLE sqlstate=P0001`. |
| T13 constraint 1 | Live `validate_journal_line_ref` still six `WHEN` mappings: `customer_credit`, `bank`, `external_party`, `supplier_payable`, `cheque_receivable`, `cheque_payable`. Probe `T13 when_count=6`. Reversal copies kinds; adds none. |
| T14 | Payables view still purchases-only. Reversal does not invent purchase/sales posting. |
| Stored `doc_kind` | Pair is `receipt`/`receipt`, never `other`. CHECK unchanged. Phase 5's **live** export currently **ignores** this (M1). |
| Security | `prosecdef=t`, `search_path=public`, `::app_role[]`, `proacl` has no `PUBLIC`/`anon`; `authenticated=X`. `sales` was `42501` in the mission accept file; not re-run here. Manager **succeeds** (M3). |
| Audit | `document_reversed` with reason in `diff`. Empty/whitespace reason `22023`. |
| Persian RAISES in `reverse_document` | `22023` / `42501` / `P0001`. No English identifier inside those sentences. `counterparty_kind` values `customer`/`payee`/`dual` live in jsonb, not in the user message. |
| Rollback | `363-down` has a 361-class gate while `reverse_document` exists (I did not re-apply it). `364-down` `DROP FUNCTION IF EXISTS public.reverse_document(text, uuid, text)` **matches the live signature**. Nothing later has replaced 364, so 364-down is not stale today and does not yet need a pre-flight. Order is 364-down then 363-down, documented. |
| Rule 13 | `git diff --name-only b25072b6 0accfe21` is exactly the ten mission paths (migrations 363/364, four verification files, progress, `00-progress`, `rpc-contracts` §4). No `src/`, no `PROGRESS.md`, no other agents' untracked files. |

---

## Contract contradictions — verdicts

| # | Mission decision | This review |
|---|---|---|
| R1 | Implement `(text,uuid,text) RETURNS uuid` | **Holds.** Live identity arguments match. Returns the new entry id (`REV` uuid). |
| R2 | `reverses_entry_id` on the new row | **Holds.** Unique partial index live. Original row has `reverses_entry_id` null. |
| R3 | Side effects table | **Holds on the happy path.** Incomplete if `customer_id` moves (M2). Journal export not in their table (M1). |
| R4 | Same `doc_kind` as original, never `other` | **Holds in the catalogue.** Export inference disagrees (M1). |
| R5 | Numbers use `receipt\|payment\|dual` | **Holds.** |
| R6 | Second call is a refusal, not a replay | **Holds** (`P0001`). |

---

## OG-22

The mission implemented the wide OG-13 gate and asked. **The owner has since answered: accountant and admin only; manager excluded.**

That answer makes the live gate **wrong**. Severity **MAJOR (M3)** — a manager can reverse a posted document today. It is not a BLOCKER: the reversal they produce is a correct reversal, by the wrong role.

**Pending remediation. Not implemented in this review.**

---

## Can a reversal produce a wrong balance?

**On the intended path: no, not in the ledger or the cash views I could reach.** Journal pair nets (`person_settlement_position` returned to `balanced`). Credit returned to 0. Bank `total_in` unchanged. Cheque: one live endorsement.

**Yes, in two neighbouring systems:**

1. **Asan journal export** still emits the undone bank receipt as a `receipt` (M1).
2. **Credit** if someone UPDATEs `customer_id` on the source row before reversing (M2).

Assume nothing is right because it balances: the party-change case balanced B's credit to 0 and A's journal to 0 while A's credit stayed 50,000. That is internally pretty and factually false.

---

## What I could not verify

- **Dual reverse** invoked live in this review. The branch is in `pg_get_functiondef`; the mission accept file recorded `D1_LINES n=2 balanced=t`. I did not repeat it.
- **Concurrency** re-run (would commit more 343-permanent rows). Existing leftover is the evidence that a race was attempted.
- **Party-change under `SET LOCAL ROLE authenticated`.** Policy shape says an accountant may UPDATE; the wrong-credit measurement used the table owner.
- **`sales` 42501** re-run. Mission accept recorded it; live gate still requires admin/accountant/manager.
- **`get_account_ledger` numeric totals** around a reverse (body matches the view's `reversed_at` predicate; I measured the view).
- **Production.** Not contacted.
- Typecheck. Not re-run; D14 is 70.

---

## Stop

No remediation. No phase 5. `asan_list_journal_export` was not modified.
