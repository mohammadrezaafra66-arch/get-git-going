# Deep audit 2 — independent verification of the programme, and of its audit

**Date:** 2026-08-20
**Scope:** everything `PROGRAMME-AUDIT.md` (PR #326) said it could not check, plus phase 6, which no Gate A ever reviewed.
**Method:** live catalogue only (`pg_proc`, `pg_policies`, `pg_constraint`, `pg_indexes`, `pg_trigger`, `information_schema`). Every behavioural claim comes from invoking the real function under a simulated JWT inside `BEGIN … ROLLBACK`. No repo `.sql` file was used as evidence of what is live.
**Production (`192.168.170.10`):** not contacted. Not a query, not a ping.
**Census before and after:** `journal_entries=7`, `journal_lines=14`, `payment_receipts=10`, `payment_vouchers=1`, `dual_documents=1`, `document_numbers=159`, `document_attachments=0`, `audit_logs=43509`, `payment_receipt_links=3` — **identical**. One non-transactional side effect is disclosed in §13.

---

## 1. The one-paragraph honest summary

The ledger's writers and its guards are real, and I proved it rather than read it: of the twelve things the previous audit listed as unverified, I ran eleven and **all eleven passed** — the Asan-code refusal, both date bounds, allocation atomicity, the delete guard on a posted receipt, the reversal that unwinds credit from the posted line and not from a mutated column, the reject-then-re-endorse blocker, migration 294's own gate re-run against today's function body, `361-down`'s pre-flight refusal, and concurrent numbering under two real sessions. Two of the previous audit's conclusions are **wrong**, and both matter: `normalize_identifier` exists and three-format mobile lookup **works today** (task 6.7 is built and recorded as blocked), and the endorsement index is not "unconditional" but correctly conditional on reversal. The most serious thing neither audit had found is this: **`vw_account_balances` does not read the ledger at all.** It reads `payment_receipts` and `payment_vouchers` directly. So the treasury page's bare insert — still reachable from the main menu — **does move the bank balance a user sees while writing no journal entry**, which is the opposite of "invisible", and is worse. The written record remains the least trustworthy artefact in the programme: phases 1 and 3 are 0-of-7 and 0-of-9 ticked while every one of their objects is live, `schema_migrations` still ends at `20260811180000` and omits all 32 ledger migrations, and 96% of the document-number space (153 of 159) is burned test residue, not the single phantom previously reported. **Nothing here is a new money defect in the writers. Everything here is about what the numbers mean, and whether the record can be trusted to say so.**

---

## 2. Where I agree, where I disagree, and what it missed

### Agree — confirmed independently, not copied

| Claim | How I proved it |
|---|---|
| Phases 1 and 3 fully unticked while live | Counted ticks: phase 1 = **0 done / 7 open**, phase 3 = **0 done / 9 open**; then censused every named object — all present |
| `schema_migrations` frozen | **523 rows, max `20260811180000`**; all 32 ledger migrations carry later versions |
| `00-progress.md` table stops at 366 | Highest number in the table is **366**; 367 appears in prose only |
| 8 down files still carry inner `BEGIN;`/`COMMIT;` | 336, 338, 341, 342, 343, 346, 348, 349 — exactly the eight named |
| `reverse_document` has no UI | **0** occurrences in `src/` |
| `createPaymentVoucher` still a bare insert | Read the function; it is `.from("payment_vouchers").insert(...)` with `status:'approved'` |
| `stepper-spec.md` contradicts the live contract | `stepper-spec.md:167` says treat `23505` as success; `rpc-contracts.md:19` says it is a real error |
| Only one bank account, no صندوق | `bank_accounts` has exactly one row, `account_type='bank'` |
| `trg_post_receipt_on_approve` orphan | Function exists (1), triggers firing it (**0**) |

### Disagree — two corrections that change decisions

**1. `normalize_identifier` exists, and three-format lookup works.** The previous audit lists it under "asked for, missing or hollow" and states you cannot "look up one mobile in three formats." Both are wrong. The function exists in the catalogue. `person_find_by_identifiers` calls it. Identifiers are stored `value_raw = 09…` and `value_normalized = +98…` (34 of 34 rows differ). The wizard's lookup chain tries exact match on `value_raw` first, then falls through to the **normalising** RPC. I fed one person's mobile in all three shapes:

```
"09…"   → person 747aa03c…   matched_on mobile_e164
"+98…"  → person 747aa03c…   matched_on mobile_e164
"98…"   → person 747aa03c…   matched_on mobile_e164
```

Task **6.7 is functionally delivered**. What is genuinely open is OG-4 — the *decision* about which form is canonical — and the code honestly refuses to *claim* the capability until you answer it. That is a record defect pointing the opposite way from the usual one: capability built, recorded as blocked.

**2. The endorsement index is not unconditional.** The audit describes 356's "unconditional unique" as the live state. Live, it is:

```
UNIQUE (endorsed_receipt_id) WHERE endorsed_receipt_id IS NOT NULL AND reversed_at IS NULL
```

356 made it unconditional; **363 narrowed it again** so that a reversed endorsement frees the cheque. That is correct — I verified the reversal genuinely inverts each line (`SELECT … jl.credit, jl.debit …` into `(debit, credit)`, then re-checks balance) — but the audit's description of the live object is one migration stale, and its stated worry that "endorsement uniqueness still has a `rejected` hole" is **disproved** in §4.

### Missed — four things neither review had

1. **`vw_account_balances` bypasses the ledger entirely** (§5). The single most consequential finding here.
2. **The parallel payment path is visually distinguishable, but only by a number prefix nobody explains** (§5).
3. **153 of 159 document numbers are burned**, not one (§8).
4. **Three more real documents were committed to the shared test database on 2026-08-20**, after the audit was written (§8). Its census line is already out of date.

---

## 3. Phase 6, reviewed — the phase nobody reviewed

`PaymentReceiptForm` is gone from `src/` entirely. The wizard is `src/features/ledger-wizard/` (8 files, ~1,250 lines). Checklist: **9 of 10 ticked**, 6.7 open.

### Error handling — the wizard implements the correct contract

The mission asked which document the wizard follows. **It follows `rpc-contracts.md`; `stepper-spec.md` is the stale one.**

| Code | Wizard behaviour | Verdict |
|---|---|---|
| `42501` | Persian: «شما مجوز ثبت این سند را ندارید.» | correct |
| `0A000` | Persian: attachments not enabled, submit without a file | correct |
| `23505` | **Treated as an error**, document not created | correct — contradicts `stepper-spec.md:167` |
| `P0001` / `22023` | Passes the database's own Persian message straight through | correct; those messages are written for users |
| timeout / network | `unknownOutcome: true` + "do not resubmit; check the list first" | better than the contract requires |

### Branch coverage against the live signatures

| RPC | Params | Sent by wizard | Gap |
|---|---|---|---|
| `create_receipt` | 14 | 13 | `p_attachment_ids` deliberately omitted (would raise `0A000`) |
| `create_payment` | 14 | 12 | `p_attachment_ids` deliberate — **and `p_purchase_id` is unreachable from the UI** |
| `create_dual_document` | 15 | 14 | `p_attachment_ids` deliberate |

**`p_purchase_id` is the one RPC parameter with no UI path.** A payment cannot be tied to a purchase through the wizard; that linkage still lives only in the older `pay_purchase_with_voucher`. No UI field is sent nowhere.

The cash branch is reachable in the UI and refused by the database — the account picker can only offer the one bank account, so a cash receipt raises `P0001` naming the missing صندوق. That is a correct refusal, not a wizard defect, but the user meets it only after filling the form.

### 6.7 and OG-4 — is the wizard honest?

**The code is honest; the interface is not.** `lookup.ts` carries an explicit comment that three-format canonicalisation "is NOT claimed until OG-4 is answered." But the only thing a user ever sees when a lookup fails is:

> «شخصی با این کد یا شماره پیدا نشد.»

That message cannot distinguish "this person is not registered" from "you typed the number in a shape we do not match." Since the normalising fallback in fact does match all three shapes, the practical risk today is small — but that is the wrong message to be shipping on the day OG-4 is answered and the rule changes.

**One latent defect.** The wizard's identifier reads use `.maybeSingle()`, and `person_identifiers` has **no unique constraint on `(kind, value_raw)`** — only a primary key on `id`. There are zero duplicates today. The day two persons share a mobile, the lookup throws a PostgREST multiple-rows error and the wizard renders it as «جستجو ناموفق بود» rather than "this number belongs to two people." Failure scenario: import two contact records for one person, then try to create any document for them.

---

## 4. What works end to end, measured

Every row below is a real RPC call under a real JWT, rolled back.

| Probe | Result |
|---|---|
| **2.3** receipt for a customer with no Asan code | `P0001` «کد آسان برای «پیرایش» ثبت نشده است…» — refuses, names the person |
| **351** future date (+400d) | `22023` «تاریخ دریافت نمی‌تواند در آینده باشد…» |
| **351** date in 1397 | `22023` «تاریخ دریافت به سال 1397 برمی‌گردد؛ فقط سال جاری (1405) و سال پیش از آن…» |
| **351** previous Jalali year (−200d, jy 1404) | **Accepted** — the boundary is where it is documented to be |
| **2.7** allocation to a non-existent proforma | `22023`; `payment_receipts` **before = 11, after = 11**. Zero orphan |
| **353** delete a posted receipt | `P0001` «این فیش سند حسابداری ثبت‌شده دارد و حذف نمی‌شود…» |
| **365** mutate `customer_id` on a posted receipt, then reverse | Credit unwound from the **original** customer (5,000,000 → 0); the mutated customer moved **0** |
| **356 / P3 B1** second endorsement | `P0001` «این چک قبلاً ظهرنویسی شده است…» |
| **356 / P3 B1** re-endorse after `status='rejected'` | **`P0001` — still refused.** The blocker is genuinely closed |
| **363** re-endorse after `reverse_document` | **Allowed** — correct; the reversal inverted the lines first |
| **294** `DO $chk$` gate re-run on today's body | **PASSES** (after 366 and 367 rewrote the function) |
| **361-down** pre-flight gate, executed | **Refuses** with `P0001`, prints the live 15-argument signature and the correct order 362→361→360 |
| **Concurrent numbering**, two sessions, same `source_id` | Session B **blocked 3,005 ms** — exactly the remainder of A's lock — then minted. Advisory lock, plus `UNIQUE (doc_type, serial)` and `UNIQUE (doc_type, source_id)` as backstops |
| **`person_settlement_position`** arithmetic | Ledger sums debit 101,000,000 − credit 5,000,000 = **96,000,000**; the function returns `receivable = 96,000,000`. Arithmetic exact |
| **`asan_list_bank_deposit_export`**, invoked | 3 rows. Cash does **not** leak. The 10.1bn seed is **listed with a Persian `blocked_reason`**, not silently dropped |

**Impossible by design vs broken — unchanged and correct:** cash documents (no صندوق row exists), attachments (`0A000`), purchases and sales in the ledger (T14). None of these is a defect.

**One thing the previous audit inferred and I can now state as measured:** the seed receipt is blocked in *both* Asan exports for a missing Asan code, and blocked *visibly* — the row appears with a reason a human can read, rather than vanishing.

### The origin of `RCP-1405-000054` — established

The previous audit named this its weakest evidence. It is settled.

- `audit_logs` holds a **`receipt_created`** row for it at exactly its creation timestamp, actor «کاربر آزمایشی 26». That action is written in one place only: inside `create_receipt`.
- It carries a `document_number`, which only `assign_document_number` mints, which only the create RPCs call.
- The legacy form path mints no number, writes no such audit row, and leaves `posting_status='unposted'`.

It came through `create_receipt`. **Its empty `document_channel` is correct, not a defect.** The function body says so in its own comment (C6) and the CHECK constraint proves it: allowed values are `card_to_card, paya, pol, satna, cash, cheque, other` — **there is no `bank`**. `create_receipt` writes `'cash'` for cash, `'cheque'` for cheque, and `NULL` for bank rather than record a false sub-channel. The previous audit's hypothesis that this indicated a wizard defect or a gap in 367's cheque predicate is wrong.

A real consequence does follow, though: `create_receipt` has **no parameter** for the bank sub-channel, so the wizard cannot collect one. The C6 comment promises "the wizard collects the real one in phase 6." It does not, because there is nowhere to put it. Gate A's P3 m2 stays open.

---

## 5. The parallel paths and the missing reversal — what a user experiences today

### The finding that matters most

`vw_account_balances` — the view behind every "bank balance" a user sees — **does not read `journal_lines`.** Its live definition sums `payment_receipts` and `payment_vouchers` directly:

```
… FROM payment_receipts  WHERE status='approved' AND document_channel IS DISTINCT FROM 'cheque' AND reversed_at IS NULL
… FROM payment_vouchers  WHERE status='approved' AND document_channel IS DISTINCT FROM 'cheque' AND reversed_at IS NULL
current_balance = opening_balance + total_in − total_out
```

Three consequences, in order of severity:

1. **A payment created on `/accounting/payment-vouchers` reduces the bank balance and creates no journal entry.** I ran exactly the insert that page sends. It **succeeded**, produced **zero** journal entries, and the resulting row satisfies the view's `WHERE` clause. So the answer to "would it be invisible to every balance reader?" is **no — it is invisible to the ledger and the Asan exports, and fully visible in the bank balance.** The two numbers then disagree permanently and nothing reconciles them.
2. **`current_balance` includes `opening_balance`** (100,000,000), a static column no journal entry backs. Ledger net and view balance differ by exactly that amount today.
3. Cheque exclusion (359) and reversal exclusion both work here — the view correctly nets out the reversed OG14-CONC pair. That part is right.

### How a user tells the two payment paths apart

There **is** a tell, and nothing explains it:

| | Wizard / `create_payment` | Treasury page / `createPaymentVoucher` |
|---|---|---|
| Number | `PAY-1405-000052` (Jalali, ledger series) | `PV-2026-00031` (Gregorian, old sequence) |
| Journal entry | yes | **no** |
| Row in `document_numbers` | yes | **no** |
| Status shown | `approved` | `approved` |
| Appears in the treasury list | yes | yes |
| Moves the bank balance | yes | **yes** |
| Appears in the Asan export | yes | **no** |

A trigger assigns `PV-YYYY-#####` from a sequence whenever `voucher_number` is left null, so the parallel document is never *unnumbered* — it is *differently* numbered. **No screen, label, or tooltip tells anyone that `PAY-` means posted and `PV-` means not posted.** That is the entire difference, carried by a two-letter prefix.

The route is reachable: `src/lib/navigation/registry.ts:481` and `src/components/layout/primary-modules.ts:142`, open to admin, manager and accountant.

The receipt detail page still calls `post_receipt_accounting` (`_app.accounting.receipts.$receiptId.tsx:335`) — the legacy post button, OG-11, untouched.

### What a user does today when they post a wrong document

`reverse_document` works, refuses managers correctly, and has **zero callers in `src/`**. Every path a user could try:

| They try | What happens |
|---|---|
| Delete the receipt | `P0001` — «سند ثبت‌شده فقط با سند برگشتی اصلاح می‌شود». Refused, and the message names the remedy they cannot reach |
| Edit the amount on the posted journal | `P0001` (343 immutability) |
| Edit the receipt's customer | **Succeeds.** OG-23 is open. The list then shows a different party from the one the ledger credited |
| Create an offsetting document by hand | Possible, and it puts two documents in the books where a reversing pair belongs |
| Ask an accountant to reverse it | Only via direct SQL |

The third row is the sharp one: **the one edit that is not blocked is the one that makes the screen disagree with the books.** My probe changed a posted receipt's `customer_id`, the UPDATE was accepted, and the reversal then correctly credited the *original* party. Ledger right, screen wrong.

---

## 6. The money figures — which are publishable

Measured today on account «12» (بانک ملت):

| Figure | Value | What it includes | What it excludes | Publishable? |
|---|---|---|---|---|
| `vw_account_balances.current_balance` | **10,289,000,000** | opening balance, approved receipts and vouchers from the **source tables**, cheque-excluded, reversal-excluded | the journal; anything not `status='approved'` | **No.** Dominated by a 10.1bn seed, includes a non-ledger opening balance, and counts unposted vouchers |
| Journal net for `bank` | 10,189,000,000 | posted journal lines only | opening balance | Internally consistent, but it is money-moved, not a bank statement |
| `asan_list_bank_deposit_export` | 3 rows | posted bank receipts | cash, cheque, reversed | **Yes, provided `blocked_reason` is honoured** — the seed carries one |
| `asan_list_journal_export('receipt')` | 6 lines / 3 documents | posted receipt documents | the reversed pair, cheque documents (T15/367) | **Yes, same caveat** |
| `asan_list_journal_export` other filters | payment 2, third_party 2, purchase_and_settlement 0 | as classified on stored `doc_kind` | reversals, cheques | Yes, same caveat |
| `person_settlement_position` | `receivable = 96,000,000` | posted `customer_credit` and `supplier_payable` lines | purchases, sales (T14) | **No — see below** |
| `customer_credit_balance` | per customer | credit movements | anything not posted through the RPCs | Internal only |

**T14 check, and it fails on labelling.** The mission asked whether anything labels a ledger figure as a total balance or total debt. It does. `person_settlement_position` returns columns named **`receivable`**, **`payable`**, **`net`**, and a **`direction`** of `customer_pays`. For the person I measured, that 96,000,000 is the net of money we paid *out* to them minus what they paid *in*; it contains no sales and no purchases, by design. A human reading «مشتری می‌پردازد ۹۶٬۰۰۰٬۰۰۰» will read a debt. Under T14 that figure is not a debt and cannot become one until purchases and sales post. **The arithmetic is exactly right; the words on it are wrong.**

**Two numbers that disagree — both halves confirmed.** The 10.1bn July seed is fully counted in the bank balance and **blocked** in both Asan exports for a missing Asan code. Nothing reconciles them, and nothing warns anyone.

---

## 7. The record versus reality

| Artefact | Says | Reality | Verdict |
|---|---|---|---|
| `MASTER-CHECKLIST.md` phase 1 | 0 of 7 done | every object live | **record defect** |
| phase 3 | 0 of 9 done | every object live | **record defect** |
| phase 0.5 | open | OG-1 confirmed 2026-08-18 | stale box |
| phase 6 | 9 of 10 done | matches, except 6.7 | ticks understate |
| **6.7** | open | **works in all three formats** | **record understates a delivered capability** |
| phases 2, 4, 5 | 8/8, 7/7, 5/5 | objects live | consistent |
| `00-progress.md` migration table | ends at 366 | 367 live; prose mentions it | **record defect** |
| `schema_migrations` | 523 rows, max `20260811180000` | 32 ledger migrations applied, none recorded | **record defect** |

### What a phase-9 replay driven by `schema_migrations` would do

All 32 files carry versions **after** the recorded maximum, so any tool treating this table as the applied-list sees 32 unapplied migrations.

- **On production (never had them):** it applies all 32 in order — the correct outcome, provided each file's own gate passes against production's catalogue, which nobody has measured.
- **On this test database:** it **re-applies all 32 to a database that already has them.** I checked the DDL-bearing files: 338, 342 and 360 use `CREATE TABLE IF NOT EXISTS`; 354, 356 and 363 `DROP INDEX IF EXISTS` before creating. Those survive a re-run. I did **not** prove the other 26 are re-runnable, and I did not execute a replay. Treat "re-apply is safe" as unproven.

The safe instruction stands: replay from `supabase/migrations/` files 336–367 with a human checklist, and prove each object after apply.

### Rollback files

All 32 exist. **Eight still carry inner `BEGIN;`/`COMMIT;`** — 336, 338, 341, 342, 343, 346, 348, 349 — so an operator running them inside one outer transaction has that transaction committed underneath them. Gate A M7, still open.

I executed **`361-down`'s pre-flight gate** and it behaves exactly as designed: it refuses, prints the live 15-argument signature, and names the correct order. P4 M1 is closed by execution, not by reading. **I did not run the full 367→336 chain**, and whether each file *parses* remains a different question from whether it *reverses today's reality*.

### Contradictions between documents and the catalogue

| Where | Conflict |
|---|---|
| `stepper-spec.md:167` vs `rpc-contracts.md:19` | `23505` success vs error. The wizard implements the contract; the spec is stale and dangerous |
| `decisions.md` D8 vs live 367 | skip cheque *lines* vs exclude cheque *documents* |
| **`create_receipt`'s own comment** | still says the export "skips those lines rather than blocking the document (D8, task 5.2)" — describes behaviour 367 replaced. **The stale record is now inside the catalogue itself** |
| Dual UI `CONTROL_ACCOUNT_NOTE` | still speaks of «شخص واسط» after OG-21 removed the fee construct |

---

## 8. Committed test data and its effect on phase 8

| Residue | What it is | Identifiable? | Removable? | Effect on phase-8 baselines |
|---|---|---|---|---|
| Seed receipt 10,100,000,000 (`fd8194a5`) | July bank receipt, posted, payer has no Asan code | yes — unique amount | **No** — posted journal, 343 | Dominates every bank figure |
| OG14-CONC 10,000 + its reversal | `RCP-1405-000052` and the reversing entry | yes — tracking `OG14-CONC` | **No** | Two extra journals; already excluded from standing exports |
| `RCP-1405-000054`, 120,000,000, tracking `12364` | Real `create_receipt` call, 2026-08-19 | yes | **No** | Exportable and unblocked — appears in any receipt baseline |
| **`RCP-1405-000055`, 5,000,000, tracking `65656565`** | **new, 2026-08-20** | yes | **No** | Post-dates the previous audit's census |
| **`PAY-1405-000052`, 36,000,000** | **new, 2026-08-20**, a payment to a *customer* | yes | **No** | First real payment; moves the bank view |
| **`DUAL-1405-000052`, 65,000,000** | **new, 2026-08-20** | yes | **No** | First real dual |
| **153 burned document numbers** | receipt 1–51, payment 1–51, dual 1–51 | yes — `burned_at` plus a Persian reason on each | already burned | **The big one — see below** |
| 6 legacy `pending_review` receipts | pre-programme form rows, unposted | yes | yes (not posted) | Excluded from balances by `status` |
| `audit_logs` 43,509 rows | includes 53 `receipt_created`, 51 `payment_created`, 51 `dual_document_created`, 1 `document_reversed` | — | no | Counts include stress runs |

**The numbering finding.** The previous audit reported "a burned phantom serial 51". Reality: **153 of 159 rows are burned** — 50 per document type from bulk stress cleanup (burned in three timestamped batches on 18–19 August), plus one concurrency-test phantom per type. Live documents therefore start at serial **52** for all three types. That is the design working correctly — numbers were burned rather than reused — but it means the company's first genuine receipt, payment and dual document are numbered 52, and phase 8 will have to say so before someone asks where the first fifty-one went.

**Three of the rows above were created after the previous audit was written.** Its census line («journal_entries=4 … payment_vouchers=0 … dual_documents=0») no longer describes this database. The test database is in active daily use, so any phase-8 baseline must be **captured and frozen**, not inferred.

---

## 9. Every open Owner-Gate, what it blocks, who owes an answer

| Gate | State | Owes | Blocks | Changed by this audit? |
|---|---|---|---|---|
| **OG-4** phone canonical form | **OPEN** | Owner | The *claim* for 6.7 — **not the capability**, which works | **Yes — re-scope: decide the rule, then let the code claim it** |
| **OG-5** HTTPS | OPEN | Infra | Phase 7 entirely | no |
| **OG-6** production authorised | OPEN | Owner | Phase 9 | no |
| **OG-8** drop `trg_post_receipt_on_approve` | OPEN | Owner | Nothing today (0 triggers); a loaded gun if re-attached | confirmed |
| **OG-9** serial reset per Jalali year | OPEN | Owner | Numbering policy — sharper now that live serials start at 52 | sharpened |
| **OG-11** `post_receipt_accounting` | OPEN | Owner | The legacy post button on receipt detail | confirmed live |
| **OG-12** module string | OPEN | Owner | Naming only | no |
| **OG-15** `viewer_restricted` on new tables | OPEN | Owner | Defence in depth | not re-probed |
| **OG-17** `hold_credit` | OPEN | Owner | Credit-vs-allocation model | not probed |
| **OG-23** freeze posted source columns | **OPEN** | Owner | **Proved live:** a posted receipt's `customer_id` can still be changed, after which the screen and the ledger name different people | **Yes — measured, no longer theoretical** |
| OG-1, 2, 3, 10, 13, 14, 16, 18, 19, 20, 21, 22 | CLOSED | — | — | OG-14 closed in SQL, still unreachable in the UI |

**A new decision the owner now owns, on no previous list:** the treasury page's insert path. Options and trade-offs, no recommendation taken:

- **(a) Remove the page from navigation.** Cheapest and immediate; loses whatever workflow it serves today.
- **(b) Point `createPaymentVoucher` at `create_payment`.** The correct end-state; requires the page to collect what the RPC demands (payee Asan code, source account) and it will start refusing entries it accepts today.
- **(c) Leave it and label it.** Cheapest to ship, but two truths about the same money survive, and a label is the only thing standing between a user and a wrong bank balance.
- **(d) Make `vw_account_balances` read the journal.** Fixes the divergence at its root and immediately drops unposted vouchers out of the bank balance — which is either the correction you want or a number moving under the accountant's feet, depending on when you do it.

---

## 10. What must happen before phases 7, 8 and 9

**Before phase 7:** OG-5 (HTTPS). Nothing in this audit adds to that.

**Before phase 8:**
1. **Freeze a baseline snapshot; do not infer one.** The database gained three documents during the window between the last audit and this one.
2. Decide the exception list: the 10.1bn seed, the OG14-CONC pair, `RCP-1405-000054/55`, `PAY-1405-000052`, `DUAL-1405-000052`, and the 153 burned numbers.
3. State explicitly that live serials begin at 52.
4. Create a صندوق or declare cash out of scope — cash cannot be tested until one exists.
5. Drive every test through the RPCs or the wizard. A test that touches `/accounting/payment-vouchers` is testing the unposted path.
6. **Add one reconciliation assertion:** bank balance minus opening balance must equal the journal's bank net. Today it does; nothing enforces it (§11).
7. Answer or waive OG-17; fix or waive OG-23 if any test mutates posted rows.
8. Tick phases 1, 3 and 6.7 to match the catalogue *first*, so phase 8 does not "discover" them as undone.

**Before phase 9:**
1. OG-6.
2. Replay 336–367 from files, never from `schema_migrations`; prove each object after apply.
3. Wrap any `*-down.sql` in your own transaction — eight still commit on their own.
4. Re-verify the B1-class writers on production. Production's catalogue has never been measured by anyone.
5. Owner opens one real Asan file. The 5.5 sample workbooks cannot be in git (`*.xlsx` is gitignored).

---

## 11. The pattern — and a sixth failure mode

**The audit's proposed fifth mode holds, and is broader than stated.** "The operator record does not track the catalogue" is confirmed in both directions: phases 1 and 3 recorded as never started while complete, and 6.7 recorded as blocked while working. It also reaches *inside* the catalogue — `create_receipt`'s own comment still describes the D8 line-skipping rule that 367 replaced. The record is neither pessimistic nor optimistic. It is **decoupled**, and drifts whichever way the last edit left it.

**A sixth mode, which I believe is real and unnamed: two readers of the same money, built at different times over different sources, with no test that compares them.**

The evidence is not one incident but a shape:

- `vw_account_balances` reads source tables; `asan_list_journal_export` and `person_settlement_position` read journal lines. Nobody compares them, and today they differ by exactly the opening balance.
- The 10.1bn seed is counted by the balance view and blocked by the Asan export. Two readers, opposite answers, no alarm.
- `createPaymentVoucher` writes a row one reader honours and another cannot see.
- The endorsement rule lives in an index 356 widened and 363 narrowed, while the document describing it still quotes 356.

Every failure mode named so far is about a **writer** — one that did not run, was never wired, wrote the wrong channel, or wrote twice. Gate A is built to catch writers. It has no instrument that asks *"do two independent computations of the same number agree?"* — and that is exactly the question the seed receipt, the treasury insert, and the opening balance each fail in a different way.

If you adopt one structural change from this audit, the cheapest high-value one is a standing invariant test that reconciles the balance view against the journal and fails loudly when they diverge.

---

## 12. Self-examination

**1. What did I not check.** The wizard in a real browser — every claim in §3 is static analysis, not clicking. The full 367→336 down chain (I executed only 361-down's gate). Whether the other 26 ledger migrations are re-runnable. OCR / phase 7 entirely. `hold_credit` / OG-17. OG-15 `viewer_restricted` coverage on the new tables. The `other` doc_kind export hole. The three Asan sample workbooks. `asan_list_sales_export` and `asan_list_purchase_export`. Production — deliberately, by instruction. Whether Asan the Windows application accepts any file this programme emits. The typecheck baseline.

**2. Where I accepted a claim without verifying.** That `create_dual_document` produces exactly two lines and no fee construct — I confirmed the 15-argument signature and read one live dual's two lines, but did not construct a dual through the RPC myself. That the six legacy `pending_review` receipts are excluded from every reader — I verified the balance view's `status='approved'` filter and inferred the rest. That the 26 non-DDL migrations would or would not survive a re-run — I tested neither, and said so rather than implying safety. That `PROGRAMME-AUDIT.md` was merged as PR #326 — I confirmed the file is in `origin/staging` but did not read the PR.

**3. The weakest evidence in this report.** §5's claim that a treasury-page payment reaches `vw_account_balances`. I proved the insert succeeds, writes no journal, and that the view's `WHERE` clause matches such a row — but I did not `SELECT` from the view with that row present inside the transaction and watch `total_out` move. The inference is one step long and I am confident in it, but it is an inference, not a measurement. If one thing in this report is wrong, look here first.

**4. If I am wrong about something, what is it most likely to be.** (a) That §5 step above. (b) My claim that task 6.7 works: I proved `person_find_by_identifiers` resolves three formats and that the wizard's chain calls it, but I never watched the wizard itself resolve a party — a `.maybeSingle()` throw in an earlier link of that chain would abort the lookup before the normalising fallback is reached, and I did not test that interaction. (c) That the burned-number batches were stress cleanup rather than something more deliberate; I read the Persian reasons and the timestamps and inferred the rest.

**5. Did I find what I expected, or what is there.** I expected to confirm the previous audit and add detail. Instead I found two of its conclusions wrong in the direction of *understating* what is built, and one finding it missed that is worse than anything it reported. My findings do **not** match it closely, which is itself some evidence that I verified rather than read. The two claims I proved independently, chosen before I knew the answers: **(i)** `assign_document_number` idempotency and concurrency — I ran two real sessions and measured a 3,005 ms block rather than repeating the audit's single-transaction test; **(ii)** the phantom serial 51 — where I found not one burned number but 153, which is how I know I was looking at the catalogue and not at the report.

**6. Where I disagree with `PROGRAMME-AUDIT.md`.** Three places, all in §2: `normalize_identifier` and 6.7; the endorsement index's live shape; and the characterisation of the treasury path as producing something "invisible to every balance reader" when it is visible in the one reader a user looks at most. I also think its §8 understates the numbering residue by two orders of magnitude. Everywhere else I checked, it was right — and it was right about the things that were hardest to be right about, including that the writers genuinely work.

---

## 13. What I could not verify — explicit and complete

- **Production.** Not contacted. Every statement about production in this programme remains unmeasured by anyone.
- **The wizard in a browser.** All phase-6 findings are static analysis of `src/features/ledger-wizard/`.
- **Whether Asan accepts any emitted file.** Untested, and untestable from here.
- **The full down chain** 367→336 in reverse order, and whether each file reverses today's reality.
- **Re-runnability of 26 of the 32 ledger migrations.**
- **Phase 7 / OCR**, `hold_credit` / OG-17, OG-15 coverage, the `other` doc_kind hole, and the sales and purchase Asan exports.
- **Cash anything** — no `account_type='cash'` row exists, so every cash path is refused before it can be measured.
- **`APP_GIT_SHA` on the LAN box at the moment you read this.** Not checked this session.

**One disclosure about my own footprint.** Every probe ran inside `BEGIN … ROLLBACK`, and the before/after census is identical on all nine tables. But sequences are not transactional: the `payment_vouchers` bare-insert probe consumed one value from `payment_voucher_number_seq`, which now reads **31**. No row exists for it. The next voucher created through the treasury page will be numbered `PV-2026-00032` rather than `00031`. That is the only permanent trace of this audit, and there is no way to run that probe without it.

---

*End of audit. No application file, migration, or database object was created or changed. This file is the only artefact.*
