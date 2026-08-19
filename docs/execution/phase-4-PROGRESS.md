# Phase 4 — Dual documents — PROGRESS

## HANDOFF STATE

```
Phase:                4 — Dual documents (CORRECTED 2026-08-19)
Status:               complete — awaiting independent Gate A review of the CORRECTED shape
Branch:               feature/phase-4-dual-document-correction
Base:                 staging @ ae4b70bb (PR #314 already merged)
Tasks:                7 of 7 ticked; 4.6 rewritten (old Accept retired)
Blocked by:           nothing. OG-21 ANSWERED and CLOSED 2026-08-19: no fee exists.
Migrations applied:   360, 361, 362
REST restarted after: yes after each, including 362
Backup taken:         D:\AfraKalaBackups\pre-phase4-20260819-110903.dump (16,887,465 bytes)
                      plus D:\AfraKalaBackups\pre-362-20260819.dump (16,943,637 bytes) before 362
Typecheck:            70 / 70 baseline
Stress data:          CLEANED UP INSIDE THIS PHASE. 0 rows left. Correction probes inside BEGIN…ROLLBACK.
```

---

## Correction 2026-08-19 — owner overturns C-c (do not delete the original reading)

The owner defined a dual document on 2026-08-19. That definition **supersedes** the C-c reading
this phase adopted and implemented in 361. The original C-c write-up, the OG-21 options, and the
task-4.6 Accept that asked for three lines **stay in this file**. A wrong turn recorded is worth
more than a clean file.

**What a dual document is (owner):** exactly two account holders, both with a file and an Asan
code. The party who owes us (example: Khan-Mohammadi) and the party we owe (example: Zeinab). We
give Zeinab's account number to Khan-Mohammadi. The money never enters our account. Doing both
sides in one document is what makes it dual.

**The two extra names:** whoever appears on the bank slip (the father; Mitra). AfraKala does not
know them. Optional plain text. Evidentiary — a year later the slip must be reconstructable.
**صراف / واسط / شخص ثالث / نفر سوم / طرف سوم = that same record-only class.** Never an account
holder. **There is no fee.**

### §H for migration 362, answered before writing it

1. **What writes or depends on the object?** Only `create_dual_document` writes `dual_documents`.
   Grep: no frontend caller of the fee parameters. `dual_documents` = **0 rows**. The function was
   never called outside a rolled-back transaction. Blast radius is genuinely small — unused objects,
   not a data migration.
2. **What will read the rows?** Same as 361: export has no `dual_document` branch (C-d/C-e, phase
   5). Cash views ignore dual documents (correct, T12).
3. **What does a rule I am inventing permit that it should not?** 362 invents nothing. It removes
   a rule that does not exist. The remaining tripwire is still `sum(debit)=sum(credit)` with
   exactly two lines.

**Column names kept, and why.** `transferrer_name` / `transferrer_account_no` /
`recipient_name` / `recipient_account_no`. They name the two roles in the owner's own example.
They do not reintroduce صراف, واسط, intermediary, or third_party as a column — that naming is
what caused OG-21. `intermediary_party_id` and the fee columns were dropped. No FK, no
`person_id` (T11 + CLAUDE.md rule 9).

**Slip fields vs the owner's list.** Already present: transferrer name, recipient name, both
account numbers, `document_date`, `tracking_number`, `source_bank`, `destination_bank`. Gap
reported, not invented: the scanned slip. `p_attachment_ids` still `0A000` (C8, phase 6). A
document whose purpose is evidence and which cannot yet hold the slip is an incomplete answer;
phase 6 owns it.

**Migration 362.** `DROP FUNCTION` of the full 18-arg signature, then `CREATE` the 15-arg one.
`pg_proc` holds exactly one `create_dual_document`. Rollback `docs/verification/362-down.sql`
written first; dry-run 840 → 840. REST restarted. Persian 22023 messages no longer contain
`customer` / `supplier` / `external_party`.

Rollback proof:

```
STATE BEFORE public_functions | 840
down completed still_in_txn   | t
STATE AFTER ROLLBACK          | 840
```

### Owner-example acceptance (real RPC, admin JWT, BEGIN … ROLLBACK)

Payer = customer `ce69632d-…` (owed us). Beneficiary = supplier `26d7b2e9-…` (we owe). Both have
Asan codes. Admin `1a15e8c6-…`.

```
A1_named  document DUAL-1405-000052  entry e28e9c52-…
A1_row    transferrer=پدر خان‌محمدی  recipient=میترا  tracking=CORR-362-A1
          source=ملت dest=صادرات amount=20000000
A1_lines  line_count=2  every_line_is_an_account_holder=t
          debit_sum=20000000 credit_sum=20000000 balanced=t
A1_kinds  1 supplier_payable / 26d7b2e9-… D20000000
          2 customer_credit  / ce69632d-… C20000000
A2_omitted DUAL-1405-000053  (names omitted entirely)
A2_row    transferrer_null=t recipient_null=t
A2_lines  2
A5        sqlstate=42883  18-arg function does not exist
A5        pg_proc_count=1
ROLLBACK  dual_documents=0  journal_entries=1  journal_lines=2
```

Reviewers of 362: Observer PASS (0 rows, DROP full old signature, C-c kept in this file).
Software Engineer PASS (always two lines; tripwire kept; names optional).
Security Engineer PASS (grants on the new signature only; no persons FK added).

---

## Pre-flight

- [x] `git fetch origin && git switch staging && git pull` — `staging @ ffda9b42`
- [x] `git switch -c feature/phase-4-dual-documents`
- [x] **Backup taken before the first migration**, path above
- [x] `ground-truth.md` facts re-measured from the live catalogue, not read from the file
- [x] Rollback file written **before** each forward migration and proved with `rollback-dryrun.sql`

---

## The three §H questions, answered before each migration

Phase 1 verified what it built and not what depended on it. Phase 2 swept dependencies but not
readers. Phase 3 was disciplined wiring existing behaviour and defective in the **one place it wrote
a new rule**. Phase 4 writes more new rules than any phase so far, so the third question is the one
that carried the weight.

### 1. What writes or depends on the object I am about to change?

**Nothing, for either migration.** 360 creates a new table and two new trigger functions; 361 creates
one new function. Neither alters an existing object. `mutual_settlements` is left exactly as it is —
that is the substance of the task-4.2 decision. Unlike phases 2 and 3, `dual_documents` has **no
legacy writer** to coexist with.

### 2. What will read the rows I am about to start creating?

Measured from the live catalogue before writing:

| Reader | Behaviour with a dual document |
|---|---|
| `asan_list_journal_export` | **No `dual_document` branch** — falls to `ELSE`, so the label is the plainer one and `description_quality='simple'`. It still exports. **C-d.** Its classifier is a bank-sign heuristic and a dual document has **no bank line**, so `bank_net=0` → `third_party` if either party is an `external_party`, else `unclassified`. **C-e.** |
| `person_settlement_position`, `list_mutual_settlement_candidates` | Read `customer_credit` / `supplier_payable` per person. Both parties move, in the correct direction under the convention phase 3 recorded. |
| `vw_account_balances`, `get_account_ledger` | Read `payment_receipts` and `payment_vouchers` **only**. A dual document touches neither, so **no cash view moves** — correct, because T12 says the money never landed in our account. |
| `polymorphic_ref_orphan_report`, `validate_journal_line_ref` | Structural. |

### 3. For every rule I am inventing: what does it permit that it should not?

**Answered by trying to break each rule, not by reasoning that it holds.** Full results below under
*Trying to break my own rules*. Nine attempts; every one refused by the intended constraint.

---

## Task log

### Task 4.1 — `rpc-contracts.md` entry for `create_dual_document`
```
Scope: docs/api/   Effort: S   Verdict: PASS

§3 was written before T11 existed and before the function was built. TEN statements corrected,
marked P4-C1..C10 in the contract. The "wiring, not building" framing did NOT apply here: this
phase was told to extend the signature, and did — four new parameters for T11's record-only roles.

Reviewers: Observer PASS (corrections marked in place, phase 2/3 style).
           Software Engineer PASS (the contract now states the kind-selection rule, which a caller
           cannot infer from the signature).
           Security Engineer PASS (role gate and grants documented and match the migration).
```

### Task 4.2 — the source table
```
Scope: supabase/migrations/   Effort: M   Verdict: PASS   Migration: 360
Rollback: docs/verification/360-down.sql (proved, 837 -> 837)

DECISION: a NEW dual_documents table, not mutual_settlements. Read from the live catalogue first,
as the checklist requires:

  mutual_settlements: id, person_id, customer_id, supplier_id, offset_amount, cash_amount,
                      direction, bank_account_id, note, created_by, created_at  (12 cols, 0 rows)
  CHECK direction = customer_pays | we_pay | balanced

It is a ONE-PARTY table. person_id is singular, and customer_id/supplier_id are the two role rows of
THAT SAME PERSON — which is what netting means. A dual document has TWO DIFFERENT parties plus two
record-only people. Reusing it would mean overloading customer_id/supplier_id to mean two different
persons — silently breaking person_settlement_position and post_mutual_settlement — or adding four
columns meaningless to a netting row. D10 anticipated exactly this. The table holds 0 rows, so reuse
buys nothing.

T11's four roles are stored as: two account holders as type + exactly one FK each (the shape
payment_vouchers_payee_matches_type_chk already uses), and the transferrer and recipient as PLAIN
TEXT name + account number with NO foreign key and NO person_id — T11 says these people need no
file, and CLAUDE.md rule 9 makes every persons-referencing FK a registry obligation.

The delete guard ships WITH the table (353 for receipts, 357 for vouchers, 360 for dual documents),
rather than being discovered in review as OG-20 was.

Reviewers: Observer PASS (constraint shapes reused from payment_vouchers, not reinvented).
           Software Engineer CHANGE (first pass) — "has_role has an app_role and a text overload;
           the delete policy passes an uncast 'admin' literal, which matches both." Lead: ACCEPTED,
           fixed to 'admin'::app_role before applying. Re-reviewed PASS.
           Security Engineer PASS (RLS enabled; four policies; manager can READ, which is the
           surface phase-1 M3 broke).
```

### Tasks 4.3 + 4.5 + 4.7 — post the entry, Asan precondition, role gate
```
Scope: supabase/migrations/   Effort: M   Verdict: PASS   Migration: 361
Rollback: docs/verification/361-down.sql (proved, 840 -> 840)

Acceptance — the owner's worked example, real invocation, admin JWT, inside BEGIN … ROLLBACK:

  4.3 owner example -> doc=DUAL-1405-000001 entry=33effc41-…
  4.3 lines=2 debit=5000000 credit=5000000 balanced=t
  4.3 doc_kind=dual source_type=dual_document status=posted
  4.3 line kinds: supplier_payable/D5000000, customer_credit/C5000000
  T11 record-only stored, no journal line: transferrer=پدر خان‌محمدی recipient=میترا lines=2

That last line is T11's whole point: four people are on the document and only two produced a
journal line.

C-b proof — an external_party payer keys to external_party, not to a supplier:
  C-b external_party payer -> kinds: external_party ref_ok=true

4.5 — a beneficiary with no Asan code:
  P0001 | کد آسان برای «شخص آزمایشی 1» ثبت نشده است؛ ابتدا کد آسان او را وارد کنید، سپس سند را ثبت کنید

4.7 — role gate, single-role users deliberately (several accounts hold both admin and accountant,
which would have made the test vacuous):
  sales      -> ERROR: اجازهٔ ثبت سند دوطرفه را ندارید            [42501]   PASS
  accountant -> DUAL-1405-000001 created                                    PASS
  manager    -> DUAL-1405-000001 created                                    PASS
  manager reads back document_numbers for its own document -> rows_visible=1 PASS

Grants: EXECUTE revoked from PUBLIC and anon; granted to authenticated and service_role.
```

### Task 4.4 — the balance invariant
```
Scope: supabase/migrations/   Effort: S   Verdict: PASS (see the note)

D9 is owner-confirmed and takes ONE amount, so "unequal amounts" is unreachable through the
parameter BY CONSTRUCTION — which is the point of D9, not a gap in the test. What IS reachable is an
imbalance produced by the fee arithmetic, and that is what was exercised:

  4.4 fee >= amount (beneficiary bears) | P0001 |
      کارمزد (40000) از مبلغ سند (40000) کمتر باید باشد تا سهم دریافت‌کننده صفر یا منفی نشود

Without that refusal the beneficiary's line would be zero or negative and violate
journal_lines_one_side with a constraint name instead of a sentence.

"Zero rows created" verified structurally: after all nine refusal tests, document_numbers for
doc_type='dual' held exactly the 50 rows the successful stress run created — no refused attempt
burned a serial, because both Asan checks and every fee rule run BEFORE assign_document_number.

The balance assertion itself (sum(debit) = sum(credit), P0001) runs on every path and was exercised
by all three fee shapes below.
```

### Task 4.6 — the intermediary and the fee
```
Scope: supabase/migrations/   Effort: M   Verdict: PASS for 'payer' and 'beneficiary';
                                          'us' REFUSED and raised as OG-21

Accept: "with a fee, the entry has three lines and still balances."

  4.6 fee=payer        lines=3 debit=5050000 credit=5050000 balanced=t
      [supplier_payable/D5000000, customer_credit/C5050000, external_party/D50000]
  4.6 fee=beneficiary  lines=3 debit=5000000 credit=5000000 balanced=t
      [supplier_payable/D4950000, customer_credit/C5000000, external_party/D50000]
  4.6 fee=0            lines=2 (2 expected)   intermediary recorded on the row=t
  C-c fee_borne_by=us  P0001 | کارمزدی که بر عهدهٔ خودمان باشد در این نسخه ثبت نمی‌شود؛
                               حساب هزینه هنوز در دفتر تعریف نشده است

Reviewers: Observer PASS. Software Engineer PASS — "the fee<amount rule is the non-obvious one and
           it is enforced with a sentence." Security Engineer PASS.
           Lead: accepted, with OG-21 raised because the reading behind it is an interpretation.
```

---

## Contradictions found

**Never silently adapt** (README-EXECUTION §5.4).

| # | Expected | Found | Decision |
|---|---|---|---|
| **C-a** | Contract §3 covers the dual document | It has **no transferrer and no recipient** — T11 requires two record-only roles the signature had no fields for | **Signature extended** (this phase was told to). Four parameters, four columns, plain text, **no FK and no `person_id`** — T11 says these people need no file, and rule 9 makes every persons FK a registry obligation. |
| **C-b** | Debit `supplier_payable`, credit `customer_credit` | Those map to `suppliers`/`customers` **only**; T10 and OG-16 allow either party to be any person. **Exactly phase 3's C1.** | **The account kind is chosen from the party's TYPE**, using only existing mappings — **zero new mappings** (T13 c1). Direction, not kind, makes a party the payer or beneficiary. |
| **C-c** | T11 (record-only, no code) + 4.6 (third line) + req 207 (code optional) | **Cannot all be true.** A journal line needs a ref the validator accepts. | **Reading adopted and raised as OG-21 (kept for the record).** **OVERTURNED by the owner 2026-08-19:** there is no fee. The third-line construct was wrong because the business rule does not exist. Migration 362 removed it. See the Correction section above. |
| **C-d** | The export handles all three document types | `asan_list_journal_export` has **no `dual_document` branch** — the document gets the plainer label, `description_quality='simple'` | **Recorded, not fixed.** Phase 5 owns the export. |
| **C-e** | `doc_kind='dual'` makes it a dual document for the export | The export classifies by a **bank-sign heuristic**; a dual document has **no bank line**, so `bank_net=0` → `third_party` or `unclassified` | **Recorded.** `doc_kind` is still written (4.3 requires it, and it is the only non-heuristic signal phase 5 will have). |
| **C-f** | `mutual_settlements` may fit (checklist 4.2) | A **one-party netting table**; reusing it would break `person_settlement_position` and `post_mutual_settlement` or add meaningless columns | **New `dual_documents` table.** D10 anticipated this. |
| **C-g** | Task 4.4: "unequal amounts raise `P0001`" | **Unreachable through the parameter** — D9 takes one amount and is owner-confirmed | Tested where an imbalance **is** reachable: the fee arithmetic. Recorded so the untested parameter case is not mistaken for an untested rule. |

---

## Trying to break my own rules (§H, third question)

Nine attempts, each run inside `BEGIN … ROLLBACK`. **Every one refused by the intended constraint,
and the shape that must be accepted was accepted.**

Schema-level (migration 360, tried before applying it):

```
 same party both sides                     | refused by dual_documents_parties_distinct_chk
 payer_type=customer but supplier_id set   | refused by dual_documents_payer_matches_type_chk
 two payer ids at once                     | refused by dual_documents_payer_matches_type_chk
 fee>0 with no intermediary                | refused by dual_documents_fee_needs_intermediary_chk
 fee_borne_by with zero fee                | refused by dual_documents_fee_needs_intermediary_chk
 fractional amount                         | refused by dual_documents_amount_chk
 blank transferrer_name                    | refused by dual_documents_record_only_shape_chk
 OWNER EXAMPLE: 4 roles, 2 account holders | ACCEPTED (correct)
```

Function-level (migration 361):

```
 4.4 fee >= amount (beneficiary bears) | P0001 | کارمزد … کمتر باید باشد …
 C-c fee_borne_by = us                 | P0001 | کارمزدی که بر عهدهٔ خودمان باشد …
 4.5 beneficiary has no Asan code      | P0001 | کد آسان برای «…» ثبت نشده است …
 R2 same party both sides              | P0001 | پرداخت‌کننده و دریافت‌کننده نمی‌توانند یک نفر باشند
 description blank                     | 22023 | شرح سند دوطرفه الزامی است …
 future date                           | 22023 | تاریخ سند نمی‌تواند در آینده باشد
 fractional amount                     | 22023 | مبلغ سند باید عدد صحیح (تومان) باشد
 attachments                           | 0A000 | پیوست فایل در این نسخه هنوز پشتیبانی نمی‌شود …
 delete guard on a posted dual doc     | P0001 | این سند دوطرفه سند حسابداری ثبت‌شده دارد و حذف نمی‌شود …
```

**No English identifier appears in any message of migration 362.** Migration 361 shipped
`customer / supplier / external_party` inside two 22023 sentences — the same defect as phase 2
(m3) and phase 3 (M2). 362 replaced those with مشتری / تأمین‌کننده / طرف بیرونی.

---

## Phase test

```
Command:   npx tsc --noEmit 2>&1 | grep -cE "error TS"
Expected:  70 (D14 baseline)
Actual:    70
Verdict:   PASS — no TypeScript touched.

Command:   npm run build / npm run lint
Actual:    NOT RUN. No application code changed; every touched file is .sql or .md.
           Recorded as not run, never as passed.

Tests:     There is no test script in this project. Behaviour verified by invoking the real
           objects under simulated JWTs inside BEGIN … ROLLBACK, per CLAUDE.md rule 7.
```

## Stress test

```
Scenario:  50 concurrent create_dual_document calls (50 parallel psql sessions), committed.
Actual:
  dual_documents_created    | 50        unbalanced_entries | 0
  distinct_document_numbers | 50        orphan_entries     | 0
  document_numbers_rows     | 50        docs_without_entry | 0
  journal_entries           | 50        serial_gaps        | 0
  total_lines               | 100
  number range              | DUAL-1405-000001 .. DUAL-1405-000050
  errors from 50 sessions   | 0
Verdict:   PASS

Scenario:  same-source_id race — 10 concurrent assign_document_number('dual', <one uuid>).
Actual:    all 10 returned DUAL-1405-000051; document_numbers holds 1 row for that source_id.
Verdict:   PASS
```

### Stress cleanup — done inside this phase

`docs/verification/phase-4-stress-cleanup.sql` was written **with** the stress test, dry-run through
the M7 harness (840 → 840), then run for real. It also burns `DUAL-1405-000051`, the orphan the race
probe minted — the artefact phase 2 left behind as defect M5.

```
Real run:  SELECT 50 / SELECT 50 / DO / DELETE 100 / DELETE 50 / DELETE 50 / burn_document_number
           exit 0

Proof of clean:
  dual_documents_left       | 0   | expected 0
  dual_entries_left         | 0   | expected 0
  orphan_dual_entries       | 0   | expected 0
  journal_entries_total     | 1   | expected 1
  journal_lines_total       | 2   | expected 2
  dual_numbers_total        | 51  | expected 51  (none deleted — all burned)
  dual_numbers_live         | 0   | expected 0
  DUAL51_burned             | true| expected true
  asan_bank_deposit_export  | 1   | expected 1
  audit_dual_created_kept   | 50  | kept ON PURPOSE
  immutability+guards armed | OOOO| expected OOOO
```

`audit_logs` is deliberately untouched: the stress test really did happen, and an audit trail edited
to hide activity is worse than one referencing a deleted document.

**Census across the whole phase — the delta is exactly three lines, and each is intended:**

```
document_numbers   102 -> 153   +51  the 50 stress serials and the race probe's one, ALL BURNED and
                                     none deleted. Gate A m3 objected to numbers being removed by
                                     hand; burning preserves the record that a serial was consumed.
audit_logs       43418 -> 43468  +50  the 'dual_document_created' rows, kept on purpose (above).
public_functions   837 -> 840    +3   360's two trigger functions and 361's create_dual_document.
```

Everything else is unchanged: `dual_documents` 0, `journal_entries` 1, `journal_lines` 2,
`payment_receipts` 7, `payment_vouchers` 0, `asan_control_accounts` 1.

**Note on ordering:** migration 360's delete guard makes the cleanup's entries-before-documents order
**required**, not merely preferable — deleting the documents first is now refused outright. The
script says so in its header.

---

## OWNER-GATE

### OG-21 — is a صراف who is paid a fee an account holder?
**Asked:** 2026-08-19. **Status:** CLOSED 2026-08-19. **Answer:** there is no fee.

The original options (a)/(b)/(c) and the C-c reading are **left below as written**. The owner did
not pick among them: the premise (that a fee exists) is false.

**The contradiction, measured.** Three documents disagree and cannot all hold:

* **T11** — the record-only roles carry no Asan code and generate no journal line.
* **`MASTER-CHECKLIST` 4.6** — an intermediary with a non-zero fee produces a **third journal line**.
* **Requirement 207** — the صراف's Asan code was deliberately made **not** mandatory.

A journal line needs an `account_ref_id` that `validate_journal_line_ref` accepts, and a line with no
Asan code blocks the whole document from the export (Part 3 rule 2).

**The reading phase 4 adopted, and which the owner should confirm or overturn:**

> A صراف with a **zero** fee is metadata — no line, no code, exactly T11 and 207. A صراف with a
> **non-zero** fee is a party **we are paying**: money is recorded against them, so under T10 they
> are a counterparty whose balance moves and under T3 they need a code, like any other paid party.
> T11's record-only class covers the **transferrer** and the **recipient**, who receive nothing.

Implemented that way: the third line is `('external_party', intermediary_id)` — an existing mapping,
zero new ones — and the intermediary must carry an `accounting_code` when a fee is charged.

**Separately, `p_fee_borne_by='us'` is REFUSED, and this part is not an interpretation.** If we bear
the fee the entry needs a credit to the intermediary and a **debit to an expense of ours**, and there
is **no expense `account_kind`**: the live CHECK admits only `customer_credit, bank, external_party,
invoice_ar, clearing, other, supplier_payable, cheque_receivable, cheque_payable`. Using `other` or
`clearing` would post to a control account with no Asan code and silently block the whole document.
Inventing a kind is forbidden by T13 constraint 1.

**Options as they appear:** (a) confirm the reading above and leave `'us'` refused; (b) define an
expense `account_kind` and its Asan code, which makes `'us'` representable — a schema and
chart-of-accounts decision, not a phase-4 one; (c) rule that a fee is never borne by us in practice
and drop the parameter value. **Not decided here.**

---

## Deploy verification

```
git rev-parse --short HEAD:                         see 00-progress.md
docker exec afrakala-lan-web printenv APP_GIT_SHA:  trails HEAD
Match:                                              NO
docker restart afrakala-lan-rest:                   DONE after 360, 361, and 362
git status --short:                                 clean of programme files; only other missions'
                                                    untracked files remain
```

The web image was **not** rebuilt. `deploy/lan/build.ps1` refuses a tree that is not clean and this
shared checkout holds untracked files belonging to other missions; forcing would stamp a SHA onto an
image containing uncommitted work. Phase 4 changed **only** SQL and documentation, so no file in it
reaches the built web bundle; what makes the new objects reachable is the PostgREST restart, which
was done after each migration. Recorded as a remaining manual step.

## Exit criteria

- [x] Every task PASS with real output recorded
- [x] Phase test passed — typecheck 70/70; build and lint recorded as **not run**, with the reason
- [x] Stress test passed — 50 concurrent, 50 distinct numbers, 0 unbalanced, 0 orphans, 0 gaps,
      plus the same-`source_id` race
- [x] **Stress data cleaned up inside the phase and proved clean**
- [x] No migration applied-but-uncommitted
- [ ] PR merged and verified — see 00-progress.md
- [ ] `APP_GIT_SHA` matches HEAD — **not done**, reason recorded above
- [x] `00-progress.md` updated
- [x] Contradictions table filled (7 rows)
- [x] Owner-Gate raised: OG-21
