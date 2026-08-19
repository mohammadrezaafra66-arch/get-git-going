# Phase 4 — Gate A — independent supervising engineer review

**Reviewed:** 2026-08-19, against `staging @ ebbaafb8` (PR #315 merged; PR #314 / `ae4b70bb` is the
uncorrected shape and is **not** the object under review).
**Scope:** phase 4 as **corrected** — tasks 4.1–4.7, migrations 360, 361, **362**. The fee / third
line / OG-21 reading is reviewed as residue, not as a live rule.
**Method:** every object read from the live catalogue (`pg_get_functiondef`, `pg_get_constraintdef`,
`pg_policies`, `pg_trigger`, `pg_attribute`, `information_schema`). Every behavioural claim tested
by **invoking the real function** under a simulated JWT inside `BEGIN … ROLLBACK` — never by
replicating a body. Production (`192.168.170.10`) was not contacted, not queried, not pinged.
Persian output was written with `\o` and read from a file.

**Database left byte-for-byte as found.** Census taken before the first probe and after the last
connection closed; the two are identical:

```
dual_documents|0          dual_entries|0           journal_entries|1
journal_lines|2           payment_receipts|7       payment_vouchers|0
document_numbers|153      numbers_live|0           dual_numbers|51 (all burned)
dual_numbers_live|0       audit_logs|43482         audit dual_document_created|50
public_functions|840      customer_credit_ledger|1 person_identifiers|42
=== DIFF baseline vs now ===
IDENTICAL — database left as found
```

---

## Verdict

# PASS — 0 BLOCKER, 1 MAJOR, 3 MINOR

The corrected shape matches the owner's 2026-08-19 definition. I could not make a record-only name
produce a journal line. A dual document moves neither cash view. The fee construct is **gone from
the live objects**: one 15-argument function, zero fee columns, zero fee CHECKs, zero fee branches
in the body, `PUBLIC`/`anon` absent from the ACL.

It does not fail the way phases 1–3 failed. There is no live writer broken, no double-count I could
reach, no cash receipt leaking into a bank export. The one MAJOR is the thing this gate was told to
look for in a removal: **residue**. `361-down.sql` still names the 18-argument signature that 362
destroyed. Running it on today's database is a silent no-op and leaves `create_dual_document` in
place.

C-d / C-e are **confirmed**, not newly discovered: a dual document exports under `_filter='all'` as
`unclassified` and is **invisible** under `receipt`, `payment` and `third_party`. That is phase 5's
surface. It is not a reason to reopen OG-21.

---

## Defects found

| # | Severity | Location | Description | Evidence | Recommendation |
|---|---|---|---|---|---|
| **M1** | MAJOR | `docs/verification/361-down.sql:38-57` × live `pg_proc` after 362 | **`361-down` no longer reverses reality.** It `DROP FUNCTION IF EXISTS` the **18-argument** signature (`… uuid, numeric, text, uuid[]`). After 362 the only live function is the **15-argument** one (`… text, text, text, text, uuid[]`). `DROP FUNCTION IF EXISTS` on the old list is a no-op: it prints `does not exist, skipping` and leaves the RPC standing. A rollback file that is trusted and does nothing is worse than none — the operator will believe `create_dual_document` is gone. `362-down` *does* restore the 18-arg body; the two files now disagree about which signature exists. `360-down` is still valid (it drops the table, and the table still exists, 0 rows). | Inside `BEGIN … ROLLBACK`: `before_drop = 1`; `DROP FUNCTION IF EXISTS create_dual_document(text,uuid,text,uuid,numeric,date,text,text,text,text,text,text,text,text,uuid,numeric,text,uuid[])` → `NOTICE: function … does not exist, skipping`; `after_18arg_drop = 1` remaining signature `create_dual_document(text,uuid,text,uuid,numeric,date,text,text,text,text,text,text,text,text,uuid[])`. | Rewrite `361-down` to drop the **live** 15-arg signature, or add a header gate that refuses to run after 362 and points at `362-down` first. Do not leave both files looking equally current. |
| **m1** | MINOR | `phase-4-PROGRESS.md` §H reader table | **The reader sweep is presented as complete and is not.** Functions whose live `prosrc` matches `journal_lines` also include `validate_journal_entry_balance` and `polymorphic_ref_orphan_report` (the latter was listed; the balance helper was not). Both are benign on a dual-shaped entry — I called the helper. Same habit phase 3 was graded m1 for. `src/` has **zero** matches for `create_dual_document` / `dual_documents` / `dual_document`. | `SELECT proname FROM pg_proc WHERE prosrc ~ 'journal_lines'` → 11 names, including `validate_journal_entry_balance`. Live: `validate_journal_entry_balance(<dual entry>)` → `total_debit=20000000 total_credit=20000000 is_balanced=t`. `grep` over `src/` → no matches. Views matching `dual_document`: **0**. | State the enumeration query in the progress file. Harmless today. |
| **m2** | MINOR | root `PROGRESS.md` (PR #315, out of scope) | **PR #315 edited the shared history table**, which the mission did not list as a deliverable. The new row is additive and does not collide with the other agent's untracked files (`audit/`, `docs/research/_a…_e`, …). The commit cell is the placeholder `(this PR)` rather than `ebbaafb8` / `41c0e534`. | `git diff ae4b70bb ebbaafb8 -- PROGRESS.md` → one inserted history row dated 2026-08-19, commit column `(this PR)`. | Fill the SHA. Not a ledger defect. |
| **m3** | MINOR | `dual_documents_insert_finance` × `create_dual_document` DEFINER | **An accountant can INSERT a `dual_documents` row directly through PostgREST without posting an entry, without an Asan check, and without a number.** The INSERT policy is `admin`+`accountant` only (manager is excluded, while the RPC admits manager). The RPC is `SECURITY DEFINER`, so a manager create still works. The bypass row has no journal line, so it does not reach Asan and does not move `person_settlement_position`. Same class as phase-2 Gate A m1 on `payment_receipts`. Not exercised as a write in this review (no INSERT was committed); read from `pg_policy`. | `pg_policy dual_documents_insert_finance` `polcmd=a` `with_check=has_any_role(… ARRAY['admin','accountant'])`. RPC gate: `ARRAY['admin','accountant','manager']`. `relrowsecurity=t`. | Phase 6 should treat the RPC as the only writer (D12). Dropping the INSERT policy, as 346 did for `journal_entries`, is the structural close. |

**Count: 0 BLOCKER, 1 MAJOR, 3 MINOR.**

---

## D1 — what the fee removal left behind

| Check | Live result |
|---|---|
| Overloads | **Exactly one.** `n=1`, signature `create_dual_document(text,uuid,text,uuid,numeric,date,text,text,text,text,text,text,text,text,uuid[])`. |
| Fee columns | **0.** `attname ILIKE '%fee%' OR '%intermed%'` → empty. 24 columns remain; the four record-only fields are still `text`, `atttypmod=-1` (no silent truncation). |
| Fee CHECKs | **Gone.** 18 constraints remain; none mention fee / intermediary. `dual_documents_record_only_shape_chk` still rejects `''` while allowing NULL. |
| Body residue | `has_intermediary=f has_fee_borne=f has_intermediary_fee=f has_p_fee=f`. Two `_line_no := _line_no + 1` inserts. Balance assertion present: `SELECT coalesce(sum(jl.debit), 0), coalesce(sum(jl.credit), 0)` then `P0001` if unequal. |
| Comments | Table comment states **No fee** and names 362. Function comment: *two-line journal entry … Owner 2026-08-19: no fee*. Column comments on `transferrer_name` / `recipient_name` name the evidentiary purpose and refuse the words intermediary / صراف as column names. |
| ACL after drop-and-recreate | `proacl={postgres=X/supabase_admin,supabase_admin=X/supabase_admin,authenticated=X/supabase_admin,service_role=X/supabase_admin}`. `public_granted=f` `anon_granted=f` `authenticated_granted=t`. `prosecdef=t` `search_path=public`. **REVOKE survived.** |
| `360-down` | Still describes the table + three triggers. Pre-flight refuses while rows exist. Usable today (0 rows). |
| `361-down` | **Stale — M1.** |
| `362-down` | Restores the three columns and the 18-arg body. Dry-run was recorded by the phase as 840→840; I did not re-apply it (that would rewrite the live function inside a transaction I would roll back; I already proved the 18-arg drop is a no-op the other way). |

**Fee-removal verdict: complete in the live catalogue. Residue remaining in `361-down.sql` only.**

---

## D2 — what reads what this phase creates

Writers of `dual_documents`: **only** `create_dual_document` (plus the three table triggers).
`src/`: no caller.

| Reader | What a dual-shaped row does |
|---|---|
| `asan_list_journal_export` | **Exports under `all`.** Two lines, `doc_kind=unclassified`, `blocked_reason` NULL, real Asan codes `90019001` / `1125623`, label `سند 2026-08-19 — <entry-uuid-prefix>` (no `dual_document` branch — C-d). **`receipt` 0, `payment` 0, `third_party` 0.** A dual document is invisible to the filter phase 5 will map to `doc_kind='dual'`. Confirmed C-e: no bank line, heuristic does not yield `third_party` when both parties are customer+supplier. |
| `person_settlement_position` | **Both parties move, in the posting convention phase 3 recorded.** After 20,000,000 + 20,000,000 + 111 + 1 (four documents in one transaction): payer `receivable=-40000112` direction `we_pay`; beneficiary `payable=-40000112` direction `customer_pays`. **What that number means:** money moved, not the party's full position (T14). Starting from 0, crediting `customer_credit` makes receivable negative and labels it `we_pay` even though the owner-example payer is someone who owed *us*. The **posting** is the right direction (credit payer, debit beneficiary). The **label** is the inherited one-sided ledger, not a dual-document sign bug. |
| `list_mutual_settlement_candidates` | **0 rows** for either person after the dual. The candidate list is one-person netting (`mutual_settlements`). Two different people moving does not mint a candidate. Correct. |
| `vw_account_balances` | **Does not move.** `BEFORE tin=10100000000.00 tout=0` / `AFTER` identical. View reads `payment_receipts` and `payment_vouchers` only (`dual=f journal=f`). |
| `get_account_ledger` | **Does not move.** Bank `32a4c282-…` `LEDGER_BEFORE n=0` / `LEDGER_AFTER n=0`. Function `reads_receipts=t reads_vouchers=t reads_dual=f reads_journal=f`. |
| `validate_journal_entry_balance` | Balanced. Not in the phase's table (m1). |
| `polymorphic_ref_orphan_report` | Structural; listed by the phase. 0 orphan dual entries live. |
| `validate_journal_line_ref` | Still **6** `WHEN … THEN ARRAY` mappings: `customer_credit→customers`, `bank→bank_accounts`, `external_party→external_parties`, `supplier_payable→suppliers`, `cheque_receivable→customers+external_parties`, `cheque_payable→suppliers+external_parties`. Zero new mappings (T13 c1). |

Not a phase-3-M1 class defect: cash views ignore dual documents on purpose (T12).

---

## Verified correct — the coverage this review establishes

| # | Check | Real output |
|---|---|---|
| 1 | Owner four-person example, real RPC, admin JWT | `DUAL-1405-000052`. `transferrer_name=پدر خان‌محمدی` `recipient_name=میترا` accounts `111`/`222` banks `ملت`/`صادرات` date `2026-08-19` amount `20000000`. **2 lines.** `only_holders=t`. Kinds: `supplier_payable` debit beneficiary, `customer_credit` credit payer. |
| 2 | Names omitted | `DUAL-1405-000053` `t_null=t r_null=t`. Succeeds. |
| 3 | T11 adversarial: UUID stuffed into `p_transferrer_name` | Stored as **text** `ce69632d-…`. Still **2** lines. No third ref. A same-name collision cannot become a journal line because the columns are not FKs. |
| 4 | 5,000-character transferrer name | `stored_len=5000`. `text` / `atttypmod=-1`. Not truncated. |
| 5 | Blank name `'   '` | Accepted; `NULLIF(btrim(…))` stores NULL. Matches optional slips. |
| 6 | Same party both sides | `P0001 پرداخت‌کننده و دریافت‌کننده نمی‌توانند یک نفر باشند`. |
| 7 | Missing Asan code (task 4.5) | `P0001 کد آسان برای «شخص آزمایشی 70» ثبت نشده است…`. `nums_before=56 nums_after=56 burned_serial=f` (inside the transaction that had already minted five dual numbers). Refusal runs **before** `assign_document_number`. |
| 8 | Attachments | `0A000 پیوست فایل در این نسخه هنوز پشتیبانی نمی‌شود…`. Evidentiary purpose is **incomplete** until phase 6: the slip names/numbers/banks/date/tracking are recordable; the scanned slip is not. Recorded as P4-C13 / C8. Not a new defect. |
| 9 | Delete guard (360) | `P0001 این سند دوطرفه سند حسابداری ثبت‌شده دارد و حذف نمی‌شود؛ سند ثبت‌شده فقط با سند برگشتی اصلاح می‌شود`. Trigger `tgenabled=O`. Stress cleanup's entries-before-documents order is still **required**. `reverse_document` still does not exist (OG-14). |
| 10 | D9 / balance tripwire | Single `p_amount`. Both sides set to that amount. Assertion still in the body. Unequal amounts remain unreachable by parameter; with the fee gone, **nothing in this function can unbalance the entry except a future edit of the body**. The tripwire is doing the work phase 3's Lead described. |
| 11 | T13 c1 / C-b kind from type | `_payer_kind := 'customer_credit' \| 'supplier_payable' \| 'external_party'` from `_payer_type`. Owner example posted those two kinds, not a hard-wired pair independent of type. 6 mappings unchanged. |
| 12 | English identifiers in Persian RAISE | Live body: `یکی از مشتری، تأمین‌کننده یا طرف بیرونی`. **No** `customer / supplier / external_party` in a user message. 362 closed the defect 361 shipped. SQLSTATEs: `42501` role, `22023` args/dates, `P0001` same-party / Asan / imbalance / delete, `0A000` attachments. |
| 13 | Stress leftover | `dual_documents=0` `dual_entries=0` `orphan dual entries=0` `journal_entries=1` `journal_lines=2` `dual_numbers=51` all burned `live=0`. `audit_dual=50` kept on purpose. Immutability + both delete guards + dual delete guard all `O`. Cleanup is real. |
| 14 | Grants / role gate | ACL as D1. I did not re-run sales→42501; the live `RAISE` is still the first statement in the body. |
| 15 | `src/` | No dual-document call site. Phase 6 is still the first user of this RPC. |

---

## Verdict on the recorded contradictions

| # | Decision | Verdict |
|---|---|---|
| **C-a** | Signature extended with transferrer/recipient, plain text, no FK | **RIGHT.** Live columns match. Adversarial UUID-in-name stayed text. |
| **C-b** | Kind chosen from party type; zero new mappings | **RIGHT** on the customer/supplier path I posted. **Could not verify** the `external_party` posting path on this database: `SELECT … external_parties JOIN person_identifiers kind=asan_person_code` → **0 rows**, so T3 blocks every EP dual document here. The mapping exists in the body; a live EP with a code was not available. |
| **C-c** | Adopted reading: paid صراف is a third account holder (OG-21) | **OVERTURNED by the owner, and the correction landed in the live objects.** Body, columns, CHECKs, ACL, comments: no fee. Residue: `361-down` (M1) and the original C-c write-up, which the progress file correctly kept. |
| **C-d** | Export has no `dual_document` branch | **RIGHT, confirmed.** `mentions_dual_document=f`. Label is the plainer `سند <date> — <uuid-prefix>`. Still exports under `all`. |
| **C-e** | Bank-sign heuristic → `unclassified` / not `third_party` | **RIGHT, confirmed.** `doc_kind=unclassified`. `third_party` filter returns **0** rows for the document. Phase 5 owns the fix (checklist 5.1 already says `third_party → doc_kind='dual'`). |
| **C-f** | New `dual_documents` table, not `mutual_settlements` | **RIGHT.** Candidate RPC returned 0 for both parties after a dual. Netting is the wrong shape. |
| **C-g** | Unequal amounts unreachable by parameter (D9) | **RIGHT, and stronger after 362.** The fee was the only arithmetic that could have unequalled the two sides. It is gone. The assertion remains. |

---

## Verdict on OG-21

**CLOSED, and it should stay closed.** The owner's answer ("there is no fee") is implemented. Reopening it would be inventing the rule again.

**No new Owner-Gate from this review.** OG-14 (`reverse_document`) remains required before phase 6 — the delete guard's own message names a document that does not exist. That is scheduled, not new.

---

## Specifics the phase's tests were load-bearing on

**Evidentiary purpose.** Recordable from the slip, measured: transferrer name, recipient name, both account numbers, date, tracking number, source bank, destination bank. None truncated. Optional names succeed when omitted. The scanned slip still raises `0A000`. A year later the *typed* slip can be reconstructed; the *image* cannot, until phase 6. That is an incomplete answer to the owner's reason, and the contract now says so (P4-C13).

**Documents vs live objects.** `rpc-contracts.md` §3 15-arg signature, always two lines, P4-C11/C12/C13, matches `pg_proc` and the body. Checklist 4.6 rewritten; old Accept retired; 4.1–4.7 ticked. T11 amendment 2026-08-19 matches the columns. Progress file keeps C-c and records the overturn. **Consistent with the live function.** `361-down` is the outlier (M1).

**Numbering.** Refused missing-Asan does not increment `document_numbers` in-transaction. Stress left 51 burned dual numbers, 0 live — including the race serial the cleanup burned rather than deleted.

---

## What I could not verify

- **An `external_party` as payer or beneficiary on this database.** Zero `external_parties` rows have `asan_person_code`. C-b's EP branch exists in the body; I did not post it.
- **Sales → `42501` end-to-end in this session.** Body still raises it first; I did not mint a sales JWT call.
- **`361-down` / `362-down` dry-run re-applied.** I measured the 18-arg drop (M1) instead of re-running the harness.
- **Genuine concurrency** on `assign_document_number('dual', same source_id)`. Requires a commit.
- **Typecheck 70.** I did not run `tsc`. No TypeScript was in PR #315 except none; D14 should be unchanged.
- **Browser / PostgREST** path. No `src/` caller exists.
- **Production.** Not contacted.
- **Direct PostgREST INSERT** as accountant (m3). Read from policies, not invoked, so that I would not need an extra rollback of a half-row.

---

## Stop

No remediation. Phase 5 not started. `reverse_document` not built. Owner decides whether M1 is a docs-only follow-up before Gate A is treated as closed.
