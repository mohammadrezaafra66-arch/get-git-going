# Phase 3 — Gate A — independent supervising engineer review

**Reviewed:** 2026-08-19, against `staging @ e9608480` (PR #310 merged).
**Scope:** phase 3, tasks 3.1–3.9, migrations 354 and 355.
**Method:** every object read from the live catalogue (`pg_get_functiondef`, `pg_get_constraintdef`,
`pg_policies`, `pg_trigger`, `information_schema`). Every behavioural claim tested by **invoking the
real function** under a simulated JWT inside `BEGIN … ROLLBACK` — never by replicating a body.
Production was not contacted.

**Database left byte-for-byte as found.** Census taken before and after; `diff` is empty:

```
payment_vouchers|0        journal_entries|1        document_numbers|102
payment_receipts|7        journal_lines|2          document_numbers_live|0
audit_logs|43418          customer_credit_ledger|1 person_identifiers|42
public_functions|836      pv_seq_last_value|30
=== DIFF baseline vs now ===
IDENTICAL — database left as found
```

---

## Verdict

# FAIL — 1 BLOCKER, 2 MAJOR, 3 MINOR

The phase is materially better than phases 1 and 2. Its two structural obligations — T13 constraint
3 and the reader sweep — were genuinely met, and I could not break them. Its refusal to carry out
the checklist's sign-convention instruction was **correct**, and I endorse it.

It fails on one defect the phase built itself, in the one place it invented new behaviour rather
than wiring existing behaviour: **the endorsed-cheque uniqueness rule has a hole that the migration's
own header advertises as the correction workflow.** Using that workflow credits the same cheque
twice, permanently.

---

## Defects found

| # | Severity | Location | Description | Evidence | Recommendation |
|---|---|---|---|---|---|
| **B1** | **BLOCKER** | `354:payment_vouchers_endorsed_receipt_unique_idx` × `355` endorsed branch × `343` immutability | **Rejecting an endorsement frees the cheque but does not remove its posted journal entry, so the same cheque can be credited twice — permanently.** The partial UNIQUE index excludes `status <> 'rejected'`, and `create_payment`'s `EXISTS` guard uses the same predicate. Setting a voucher to `rejected` therefore releases the cheque, but the entry that voucher posted stays `status='posted'` and is immutable (343), and `reverse_document` does not exist (OG-14). Re-endorsing then posts a **second** entry crediting `cheque_receivable` for the same cheque. Migration 354's own header presents this as the reason for the exclusion: *"an operator who rejects a mistaken endorsement has to be able to endorse it correctly."* The documented correction path **is** the double-count. | Real invocations, admin JWT, inside `BEGIN … ROLLBACK`. One 300,000 cheque (`create_receipt`, `RCP-1405-000052`), endorsed to supplier A → `PAY-1405-000052`; `UPDATE payment_vouchers SET status='rejected'` → `UPDATE 1`; `rejected voucher entry still posted \| posted_entries = 1`; endorsed again to supplier B → `PAY-1405-000053` **succeeds**. Then: `POSTED entries against this ONE cheque \| n = 2 \| total_cheque_receivable_credited = 600000`. Two suppliers each had 300,000 debited to `supplier_payable` against a single 300,000 cheque. | Do **not** exclude `rejected` from the uniqueness rule while a rejected voucher's entry stays posted. Either (a) make the index unconditional so a cheque is consumed once until a real reversal exists, or (b) require the entry to be reversed before `status` may become `rejected`. (b) is the correct shape but depends on OG-14. Until then (a) is strictly safer: it refuses a correction rather than silently permitting a double credit. **Reachability, stated honestly:** there is no UI for rejecting a voucher today, but `payment_vouchers_update_finance` grants `UPDATE` to `admin` and `accountant`, so the path is open through PostgREST now, and phase 6 is where both the endorsement form and its correction flow get built. |
| **M1** | MAJOR | `vw_account_balances` outflow CTE, `get_account_ledger` × `355` cheque branches | **A cheque payment reduces the displayed bank balance although no money left the account, and the ledger disagrees with the view by construction.** Both readers sum `payment_vouchers.amount` filtered on `status='approved'` with **no `document_channel` predicate**. `create_payment` correctly credits `cheque_payable`/`cheque_receivable` and writes **no bank line** — so the ledger is right and the two cash views are wrong about the same document. The phase raised this itself as OG-18 and did not fix it; I confirm the diagnosis and the reproduction, and I agree it is not phase 3's to fix — but it is MAJOR rather than deferred-and-harmless because phase 6 renders these views. | `vw_account_balances` for the one bank account, inside `BEGIN … ROLLBACK`: `BEFORE \| out_count=0 \| total_out=0`; create a 900,000 own-cheque payment; `AFTER cheque \| out_count=1 \| total_out=900000`. The entry's lines in the same transaction: `supplier_payable 900000 / 0` and `cheque_payable 0 / 900000` — **no `bank` line exists**. | Mirror migration 350: add `AND document_channel <> 'cheque'` to both readers, or relabel the figure as available-minus-committed. The owner's answer to OG-18 decides which. Whichever is chosen, the two readers and the ledger must stop disagreeing before phase 6 renders either. |
| **M2** | MAJOR | `asan_list_journal_export` × `355` cheque branches | **A cheque payment is blocked from the Asan export with a raw English `account_kind` inside a Persian sentence, shown to the accountant.** Phase 2's defect m3 was exactly this for `cheque_receivable`; phase 3 has reproduced it on a **new surface it created**, for `cheque_payable`, and its own contradiction C10 records only that such documents classify as `unclassified` — not that they are also **blocked**, nor that the block message contains an English identifier. D16 makes Persian messages part of the contract. | `asan_list_journal_export(current_date, current_date, 'all')` for the cheque payment created above: `doc_kind = unclassified`, `blocked_reason = کد حساب آسان برای «cheque_payable» ثبت نشده است`. For contrast, the bank payment in the same test: `doc_kind = payment`, `blocked_reason` NULL, and it appears under the `payment` filter (2 line rows). | Seed `asan_control_accounts` with a `label_fa` for every `account_kind` in the CHECK, even where `accounting_code` stays NULL, so no English identifier can reach a user-facing message. This is phase 2's m3 recommendation, still open, now with a second instance. Amend C10 to record that cheque payments are blocked, not merely unclassified. |
| **m1** | MINOR | `phase-3-PROGRESS.md` § *What will read the rows…* | **The reader table is presented as complete and is not.** It lists five readers. The catalogue returns more: `validate_journal_entry_balance` (a helper function, not a trigger — 0 triggers reference it) reads `journal_lines`; `polymorphic_ref_orphan_report` reads `journal_lines`; `v_promotion_suggestions` is a view over `audit_logs`. All three are benign for rows shaped the way `create_payment` shapes them — I verified the balance helper returns `is_balanced = t` — so nothing breaks. The defect is the claim of completeness, which is the exact habit phase 2 was faulted for. | `SELECT … FROM pg_proc … WHERE prosrc ~ '\mjournal_lines\M'` returns `validate_journal_entry_balance` and `polymorphic_ref_orphan_report` alongside the listed ones; `pg_get_viewdef` over `audit_logs` returns `v_promotion_suggestions`. Live call: `validate_journal_entry_balance(<entry>)` → `total_debit=700000 \| total_credit=700000 \| is_balanced=t`. | State the enumeration query in the progress file rather than a hand-picked list, so the next phase's table is reproducible and its completeness checkable. |
| **m2** | MINOR | `355` (C7) × `src/lib/treasury/queries.ts:27` | **Every bank payment renders to the user as "سایر" (Other).** C7 records that `document_channel` has no `bank` value and that `other` is stored as a placeholder, but not that `CHANNEL_FA` maps `other → "سایر"`, so the treasury list and `get_account_ledger` both label a real bank transfer as "Other". A user reading the account ledger cannot tell a bank transfer from an unclassified one. | `document_channel` readers from the catalogue: `asan_list_bank_deposit_export`, `get_account_ledger`, `create_payment`, `create_receipt`, `pay_purchase_with_voucher`. Live: a bank payment stores `document_channel = other`. `src/lib/treasury/queries.ts` → `{ value: "other", label: "سایر" }`. | Either default a bank payment to a real sub-channel, or have the phase-6 wizard collect it as C7 anticipates and treat `other` as a temporary state the UI flags rather than silently labels. Record the UI consequence in C7. |
| **m3** | MINOR | `355` § 8, `new_balance` | **A negative balance is returned from a public RPC.** `new_balance` comes back `-500000` for a paid supplier. The phase argues, correctly, that clamping would hide OG-19. But the value is returned to callers, and phase 6 will render it; a user shown "-۵۰۰٬۰۰۰" for a supplier who has been paid will read it as an error in the software. | Every successful invocation in this review returned a negative `new_balance`: `-500000`, `-700000`, `-900000`, `-300000`, `-100000`. | Keep the value honest — do not clamp — but name the field for what it is (a ledger position in the recorded convention, which is negative while no purchase has ever been credited) and require phase 6 to suppress or annotate it until OG-19 is answered. Recording it in the contract is not enough; the contract is not what the user reads. |

---

## Verified correct — the coverage this review establishes

| # | Check | Real output |
|---|---|---|
| 1 | **T13 c1 — zero new `account_kind` → table mappings** | `validate_journal_line_ref` still contains exactly **6** `WHEN … THEN ARRAY` mappings. Unchanged by this phase. |
| 2 | **T13 c3 — no unconditional supplier keying** | An `external_party` payment posts `('external_party', e9b29dd2-…)`, `ref_is_the_party = t`. The precedent would have posted `supplier_payable` + a supplier id. **The single most important thing this phase had to get right, and it got it right.** |
| 3 | **T13 c2 — `payee_person_id` populated** | `person_ok = t` on every voucher created; the function asserts it and aborts if the derive trigger did not fire. Verified on 50 stress rows by the phase and on every voucher I created. |
| 4 | **The `PV-` sequence is genuinely suppressed** | `payment_voucher_number_seq.last_value` = **30 before and 30 after** creating a payment. Sequences are non-transactional, so a `nextval` would have persisted through my `ROLLBACK` and did not occur. `voucher_number = PAY-1405-000052`, `is_pay = t`, `is_pv = f`. |
| 5 | **Nothing in `src/` parses the `PV-` shape** | `grep -rn "PV-" src/` → no match outside generated types. `voucher_number` is rendered as an opaque string at `_app.accounting.payment-vouchers.tsx:294`. |
| 6 | **A bank payment classifies correctly in the export** | `doc_kind = payment`, `blocked_reason` NULL, and it appears under the `payment` filter. C10's concern is real only for the `external_party` and cheque cases. |
| 7 | **Endorsed-cheque amount equality** | 250,000 endorsement of a 300,000 cheque → `ERROR: مبلغ ظهرنویسی باید برابر مبلغ چک باشد؛ مبلغ چک 300000.00 است`. |
| 8 | **Error paths: 34 `RAISE`s, no identifier leak** | No `RAISE` interpolates `_asan_code`, `_receiver_code`, `_payer_code`, `value_normalized`, `national_id` or `phone`. SQLSTATEs: 21 × `22023`, 11 × `P0001`, 1 × `42501`, 1 × `0A000` — each matches its use. Messages are Persian and written for the user (D16). |
| 9 | **`payee_type='other'` refusal breaks nothing** | `create_payment` has **no call site in `src/`**. `createPaymentVoucher` inserts into `payment_vouchers` directly with its own column list and is untouched; `pay_purchase_with_voucher` is unchanged and keeps its `other` fallback. |
| 10 | **The stress cleanup is real** | Independent census: `payment_vouchers = 0`, `journal_entries = 1`, `journal_lines = 2`, **orphan voucher entries = 0**, `document_numbers = 102` with `document_numbers_live = 0` (all burned, none deleted), `audit_logs = 43418` (the 50 `payment_created` rows kept, as documented). All three triggers armed: `trg_journal_entry_immutable=O`, `trg_journal_line_immutable=O`, `trg_payment_receipts_block_delete_when_posted=O`. **Phase 3 did not repeat phase 2's M4/M5.** |
| 11 | **Rollback files are usable now** | `354-down` carries a pre-flight gate that refuses while any `endorsed_receipt_id` is set — 0 rows today, so it runs. `355-down` spells the full 14-argument signature (CLAUDE.md rule 5) and `NOTICE`s what it leaves behind rather than pretending a clean reversal. Both contain statements only, no transaction control (M7). |
| 12 | **The persons-FK gate was not disturbed** | `person_fk_registry_report()` → 29 rows, 0 drifted, before and after. 354's FK targets `payment_receipts`, not `persons`. |
| 13 | **Role gate and grants** | Re-confirmed from `pg_proc.proacl`: `EXECUTE` to `authenticated` and `service_role` only; `PUBLIC` and `anon` absent. Gate uses `::app_role[]` explicitly. |

---

## Verdict on the sign-convention refusal — **ENDORSED**

The checklist instructed phase 3 to fix an inverted convention. Phase 3 measured, concluded the
premise was false, refused, and raised OG-19. **I read all three functions from the live catalogue
myself and phase 3 is right.**

```
person_settlement_position          receivable = SUM(debit − credit) on customer_credit
                                    payable    = SUM(credit − debit) on supplier_payable
list_mutual_settlement_candidates   identical, both kinds
post_mutual_settlement              DEBITs supplier_payable (payable falls)
                                    CREDITs customer_credit (receivable falls)
```

All three agree, and for a two-sided party account the arithmetic is correct: a liability rises on
credit and falls on debit. `create_payment` debits `supplier_payable`, which lowers what we owe —
the phase-3 exit criterion, satisfied. Had phase 3 obeyed the instruction it would have inverted
three functions and turned every future settlement the wrong way round, which is precisely the
outcome the contract's own warning exists to prevent.

The negative reading has a different cause, and phase 3 named it correctly: **nothing ever credits
`supplier_payable`**, because purchases are never posted — the exact mirror of the T9 research's
finding that nothing debits `customer_credit`. That is OG-19 and it is not phase 3's to build.

**This is the right kind of failure to refuse.** It was measured before it was refused, the
measurement is reproducible, the reasoning is recorded in three places, and the convention is now
written down so phases 4 and 5 cannot invert it. A correct refusal of a wrong instruction is a good
outcome and I record it as such. My only reservation is m3: the honest negative number now escapes
to callers, and honesty in the contract does not protect the user who reads the screen.

---

## Verdict on the eleven recorded contradictions

| # | Decision | Verdict |
|---|---|---|
| **C1** | Debit kind chosen from `payee_type` instead of always `supplier_payable` | **RIGHT, and the most important decision in the phase.** Verified: zero new mappings, and the `external_party` case posts to the party. |
| **C2** | `payee_type='other'` refused | **RIGHT.** T3 needs a person; `payment_vouchers_payee_person_requires_payee_chk` forces `payee_person_id` NULL for `other` by construction, so admitting it would mean skipping T3. Breaks no existing caller (verified). |
| **C3** | `p_source_account_id` required on every channel, documented as "which account the cheque is drawn on" | **RIGHT given the `NOT NULL` column**, but incomplete: it is precisely this field that M1 turns into a false outflow. The decision is sound; its consequence was under-recorded. |
| **C4** | Cheque counted as bank outflow — raised as OG-18, not fixed | **RIGHT to raise, RIGHT not to fix here.** Fixing a reader phase 5 owns would have been scope creep. Graded MAJOR (M1) because it must not survive into phase 6. |
| **C5** | Sign convention not inverted | **RIGHT.** See above. |
| **C6** | `PAY-` number supplied to suppress the legacy `PV-` trigger | **RIGHT and verified working** — the sequence did not advance, and nothing parses the old shape. Good reuse rather than a second numbering system. |
| **C7** | Bank payment stores `document_channel='other'` | **RIGHT as a schema decision, incomplete as a record** — it renders to users as "سایر" (m2). |
| **C8** | Date bounds mirrored from 351 | **RIGHT.** Consistency between sibling RPCs, not a widening; the M6 rationale applies unchanged. |
| **C9** | A cheque we hold is a `payment_receipts` row with `document_channel='cheque'` | **RIGHT as an interpretation** — there genuinely is no cheque register (I confirmed 0 tables match `cheque`). But this is where B1 lives: the uniqueness rule built on it has a hole. |
| **C10** | `doc_kind` written although the export ignores it | **RIGHT to write it, INCOMPLETE as recorded.** It omits that cheque payments are additionally **blocked** with an English identifier in a Persian message (M2). |
| **C11** | `ground-truth.md` §5's `account_kind` list is stale (7 vs live 9) | **RIGHT.** Confirmed live: 9 values. Harmless; the note anticipated it. |

**Ten of eleven decisions correct; C3, C7 and C10 correct but under-recorded; C9 correct but load-bearing for B1.**

---

## Verdict on the three Owner-Gates the phase raised

| Gate | Correctly raised? | Correctly *not* fixed? | Comment |
|---|---|---|---|
| **OG-18** — cheque counted as bank outflow | **Yes**, and I reproduced it independently | **Yes** — those readers are phase 5's surface, and the two options mean different things to an accountant | Options as stated are the right two. Must be answered before phase 6 renders either view. |
| **OG-19** — nothing posts the other side of `supplier_payable` / `customer_credit` | **Yes**, and it is the more important of the three | **Yes** — building purchase or sales posting is a phase, not a fix | The gate correctly generalises the T9 research's finding to both party accounts. No phase owns it, which is the real risk. |
| **OG-20** — `payment_vouchers` has no delete guard while `payment_receipts` does | **Yes** | **Arguably not.** | This is the one I would push back on. Migration 353 was itself a one-trigger stopgap written in a day; the symmetrical guard on `payment_vouchers` is the same trigger with two identifiers changed, and phase 3 is the phase that opened the path that makes it reachable. Deferring to OG-14 is defensible reasoning, but the asymmetry — receipts guarded, vouchers not, on the same immutability model — is the kind of gap that reads as an oversight to whoever finds it next. **Recommend fixing it rather than waiting for `reverse_document`.** Not a defect in what was built; a judgement call I would have made differently. |

**A fourth gate is missing.** B1 needs one, or a fix. It is not covered by OG-14, OG-18, OG-19 or
OG-20: it is a specific hole in a rule this phase wrote.

---

## On the phase's central claim — did it really ask both halves?

**Yes, and the evidence supports it.** The first half (what depends on what I change) is genuinely
answered: 354 alters a table with one SQL writer and one front-end writer, both named-column, and
355 changes nothing that already exists. I could not find a dependency it missed.

The second half (what will read what I create) was asked, and asking it is what produced OG-18 —
which is exactly the phase-2 failure mode, caught this time **before** shipping rather than by a
reviewer afterwards. That is the improvement this gate exists to reward.

Where it fell short is completeness (m1) and follow-through (M2): the table was hand-picked rather
than enumerated, and having identified that cheque documents behave oddly in the export, the phase
recorded the classification but did not look at the `blocked_reason` string it would produce. One
more query would have found M2.

**The failure mode this phase did not repeat:** phase 2 left 50 committed stress documents on a live
page. Phase 3 wrote its cleanup script *with* its stress test, dry-ran it, ran it, and proved the
result. I verified that independently and it holds. That is the single biggest process improvement
across the three phases.

---

## What I could not verify

1. **Whether B1 is reachable through a UI.** There is no payment-voucher rejection control in `src/`
   today. I verified the *policy* permits it (`payment_vouchers_update_finance` → `admin`,
   `accountant`) and therefore that PostgREST exposes it, but I could not test a browser path
   because none exists yet. This tempers reachability, not consequence.
2. **Concurrency of the endorsed-cheque guard.** I confirmed the partial UNIQUE index exists and
   that the `EXISTS` check fires, but I did not run two simultaneous endorsements of the same cheque
   from parallel sessions. The index should hold; I did not prove it, and I will not commit writes
   to do so.
3. **The 50-payment stress run itself.** I verified its *outcome* (numbers burned, no orphans, clean
   census) but the run was phase 3's, not mine; I did not re-run 50 concurrent payments, because
   that would commit rows to a shared database I have no authority to write to.
4. **Whether `new_balance` is rendered anywhere.** Phase 6 does not exist. m3 is a forward-looking
   judgement, not a measured break.
5. **Production.** Not contacted, by rule. Whether any of these defects would behave differently
   against production data is unknown and out of scope until phase 9.
6. **`get_account_ledger`'s full output shape.** I confirmed *that* it reads `payment_vouchers` and
   `document_channel` and shows `voucher_number`, from its body. I did not invoke it end to end with
   a payment present, so M1's effect on that specific screen is inferred from the same `status`-only
   filter, not separately measured.

---

## Closing note

Phase 3 is the first phase in this programme whose own account of itself I could mostly confirm. Its
progress file made eleven claims of contradiction; ten were right and I found the eleventh
(`ground-truth` staleness) accurate too. It refused an instruction on measured grounds and the
refusal was correct. It cleaned up after itself. It honoured all four T13 constraints, and the one
that mattered — not repeating `pay_purchase_with_voucher`'s unconditional supplier keying — I
specifically tried to break and could not.

It fails this gate on one thing, and it is worth naming precisely: the phase was disciplined
wherever it was **wiring existing behaviour**, and defective in the one place it **invented a new
rule** — the endorsed-cheque uniqueness predicate. The `status <> 'rejected'` exclusion was written
to be helpful, was documented as the correction path, and is the hole. That is a familiar shape: the
convenience carve-out in a uniqueness rule is where double-spends live.

Fix B1 before phase 6 wires the endorsement form. Answer OG-18 before phase 6 renders either cash
view. Everything else can wait for the phase that owns it.
