# GATE A — phase 2 Supervising Engineer review — 2026-08-18

Reviewer: Supervising Engineer (مهندس ناظر)
Branch reviewed: `staging` @ `fe8f0400` (phase 2 merged as `c937c923`; migrations committed as `97a763bf`)
Database: `afrakala` on `afrakala-lan-db` (test computer). Production was never contacted.
Method: read-only. Every write shown below ran inside `BEGIN … ROLLBACK` and was verified reverted
(`payment_receipts` count returned to 57 and `journal_entries` to 51 after every probe). All objects
were read from the live catalogue (`pg_get_functiondef`, `pg_get_constraintdef`, `pg_policies`,
`pg_trigger`), never from `schema_full_export.sql`. Persian output was written to a file with `\o`
and read with a file reader; no Persian passed through a PowerShell pipe at any point.

**Verdict: FAIL**

Phase 2 is a better-engineered phase than phase 1. Both migrations are idempotent, both rollback
files run and restore the pre-348 state byte-for-byte, the function carries `SECURITY DEFINER` +
`search_path`, `PUBLIC` and `anon` are revoked, the role gate refuses `sales` with `42501` and a
Persian message, the forced-failure test in task 2.7 is real, and the phase found and recorded nine
genuine contradictions rather than adapting silently. Almost everything the phase claims about the
object it *built* is true, and I re-measured most of it.

It fails on the same axis phase 1 failed on, one layer out. The phase argued that a **new** object
has no dependency exposure beyond the one constraint it altered, and then swept only that constraint.
The mission asked the opposite question — *does a row shaped the way `create_receipt` shapes it
behave the way its existing readers expect?* — and the answer, measured, is **no** for at least three
readers the phase listed as "unaffected": `asan_list_bank_deposit_export`, `vw_account_balances`, and
the credit subsystem behind `get_customer_credit` / `hold_credit`.

One defect is graded BLOCKER: **a cash receipt created by this RPC is published by the live Asan
bank-deposit export as a bank deposit, carrying a synthetic `INT-…` value in the field that export
publishes as the bank tracking number, with `blocked_reason = NULL` so nothing warns.** Task 2.5
shipped and accepted the cash branch, so this is live the first time it is used.

Eight further defects are graded MAJOR. Two of them are in the phase's own record rather than its
code — a claim about the rollback files that cannot be true as written, and a contract section that
task 2.1 was assigned to reconcile and left contradicting itself.

---

## Defects found

| # | Severity | Where | Defect | How I verified | Required fix |
|---|---|---|---|---|---|
| **B1** | **BLOCKER** | `349:~270-300` (the `bank`/`cash` branch) × live `asan_list_bank_deposit_export`, wired at `src/lib/asan/export-registry.ts:13` → `/admin/asan-export` | **A cash receipt is exported to Asan as a bank deposit, with a fabricated bank reference.** `create_receipt` writes `document_channel='cash'` but `destination_bank_account_id` NOT NULL (C5) and `_debit_kind='bank'` (D2), and — because the column is `NOT NULL` and cash has no bank reference — mints `tracking_number := 'INT-' \|\| _doc_number`. `asan_list_bank_deposit_export` selects **purely** on `status='approved' AND destination_bank_account_id IS NOT NULL`; it never looks at `document_channel` or at `bank_accounts.account_type`. So the cash receipt lands in the bank-deposit export with `tracking_number = INT-RCP-1405-000054` in the column that export publishes as the transfer reference, and `blocked_reason` is `NULL`, so the export reports it as clean. The phase's §G table lists `asan_list_bank_deposit_export` as "Unaffected by the CHECK change" — true, and the wrong question. Compounding it, C5's own recorded data gap means there is **no `account_type='cash'` row on this database at all** (1 bank account, `account_type='bank'`), and `create_receipt` does not check the type, so today every cash receipt necessarily debits a real bank account and inflates its balance in `vw_account_balances`. | Real call, admin JWT, inside `BEGIN … ROLLBACK` (`t01_behaviour.sql`): `T3 cash receipt \| doc=RCP-1405-000054 channel=cash tracking=INT-RCP-1405-000054 dest_account_type=bank debit_kind=bank` then `T3 cash row inside the BANK-DEPOSIT export \| doc_label=واریز 2026-08-18 — شخص آزمایشی 23 tracking=INT-RCP-1405-000054 amount=777000.00 bank_code=8 blocked=<none>`. Export body read from the live catalogue: `WHERE pr.status = 'approved' AND pr.destination_bank_account_id IS NOT NULL AND pr.payment_date BETWEEN _from AND _to` — no channel or account-type predicate. | Two changes, and an owner question. (1) Decide whether a receipt into a cash box is an Asan *bank deposit* at all; if not, add `AND ba.account_type = 'bank'` to the export (phase 5 owns that function) or a `document_channel <> 'cash'` predicate. (2) Regardless of the answer, **stop minting `INT-…` into `tracking_number` for any row the bank export publishes** — put the synthetic value somewhere the export does not read, or leave the column's requirement to be satisfied by a real reference. (3) Have `create_receipt` require `bank_accounts.account_type='cash'` when `p_channel='cash'` and `'bank'` when `p_channel='bank'`, so channel and account can never disagree silently. |
| M1 | MAJOR | `349:§7` (`payment_receipt_links`) × `349:§9` (`increase_credit`) | **The same money settles a proforma *and* becomes spendable credit.** A receipt allocated to a proforma inserts a `payment_receipt_links` row — which `vw_customer_receivables` subtracts from that proforma's `outstanding_amount` — *and* calls `increase_credit`, which adds the **full receipt amount** to `customer_credit_balance.available_credit` with no regard to allocations. `hold_credit` then lets that same amount be committed to a different order. The mission's literal question — do the `customer_credit` journal line and `customer_credit_balance` get summed by one reader — is **no** (I enumerated every reader of each; none reads both). The realised double count is this different one, and the phase's answer to the question ("Reuses `increase_credit` … so there is one place that writes `customer_credit_balance`") answers *is there one writer*, not *is the money counted twice*. Inherited from `post_receipt_accounting`, which does the same; but A4 makes this RPC "the one place the rule can hold for every caller", and the phase invoked A4 to add the foreign-proforma rule in the same function. | `t02_doublecount.sql`, admin JWT, `BEGIN … ROLLBACK`: `BEFORE \| available_credit=0.00 \| proforma outstanding=62200000` → one 1,000,000 receipt fully allocated → `AFTER \| available_credit=1000000.00 \| proforma outstanding=61200000.00` → `HOLD \| hold_credit(1,000,000) SUCCEEDED — the settled money was spent a second time` → `AFTER HOLD \| available=0.00 held=1000000.00`. Live census: `customer_credit_ledger` holds **only** `payment` rows (51, 10,100,050,000) — nothing has ever held, released or consumed credit, so `available_credit` is a monotonically increasing lifetime total of receipts, displayed to the user at `src/routes/_app.accounting.receipts.$receiptId.tsx:258`. | Decide what `customer_credit_balance.available_credit` means. If it is prepayment credit, `create_receipt` must add only the **unallocated** remainder (`p_amount − sum(allocations)`). If it is "total ever received", it must not be the number `hold_credit` spends and must not be labelled اعتبار قابل استفاده in the UI. Not graded BLOCKER only because `hold_credit` has no call site in `src/` today and the defect predates phase 2 — but it must be answered **before phase 6 wires this RPC**, not before phase 9. |
| M2 | MAJOR | `docs/api/rpc-contracts.md:19, 26-28, 296` — task 2.1's deliverable | **The contract tells the front end that retrying is safe; the implementation makes a retry a second permanent document.** §1 was corrected ("A retry … does **not** deduplicate — every call is a new receipt with a new `source_id`"), but the two places a front-end developer actually reads were not: the Conventions table still says `23505` = "Idempotent replay … Treat as success; return the existing document", and §5 *What the front end must handle* item 5 still says "**Retry is safe.** On timeout, retry the same call rather than creating a second document." One document now states both. Task 2.1's own log claims this ambiguity was "closed"; it was closed in the progress file, not in the contract. The consequence is not recoverable: the duplicate is a posted, immutable journal entry (343) with its own document number and its own credit increase, and `reverse_document` does not exist. | Read of the file, lines 19 / 26-28 / 141-145 / 296. Then measured (`t06_final.sql`): two identical calls → `B7 identical call submitted twice \| doc1=RCP-1405-000054 doc2=RCP-1405-000055 receipts_with_that_tracking_number=2 -> two immutable posted documents, two credit increases`. And `B1 reverse_document exists \| 0`. | Correct §Conventions and §5 to match §1 and the code: for `create_receipt` a retry is **not** safe, `23505` is not a success path (it can never be raised as a replay because each call mints a fresh `source_id`), and the front end must prevent double submission client-side. If retry safety is wanted, it needs a caller-supplied idempotency key — a design decision, not a doc edit. |
| M3 | MAJOR | `document_numbers` SELECT policy; `role_permissions` seed for `ledger-documents` | **OG-13 is recorded as closed; two of its four surfaces still carry the old answer.** Gate A M3 asked for one boundary applied to all four surfaces. Answer (a) = `admin, accountant, manager` was adopted and 346 aligned `assign_document_number`. But `document_numbers_select_finance` is still `has_any_role(uid(), ARRAY['admin','accountant'])` — a manager who successfully creates a receipt cannot read back the numbering row for it — and `role_permissions` for module `ledger-documents` has `manager: can_view=f, can_create=f`, i.e. the programme's own RBAC table says a manager may not create a ledger document while `create_receipt` admits them. `00-progress.md` records OG-13 closed. | `pg_policies` on `document_numbers` → one policy, `has_any_role(uid(), ARRAY['admin'::app_role, 'accountant'::app_role])`. `SELECT role_name, can_view, can_create FROM role_permissions WHERE module='ledger-documents'` → `manager \| f \| f` (admin `t\|t`, accountant `t\|t`, all others `f\|f`). Measured end to end (`t09_og13.sql`): `E3 manager create_receipt \| SUCCESS doc=RCP-1405-000052`, then as `authenticated` under the manager's JWT, `E4 manager SELECT on document_numbers for their own receipt \| rows visible to the manager = 0`. | Apply answer (a) to the remaining two surfaces in one migration: add `manager` to `document_numbers_select_finance`, and seed `ledger-documents` `manager: can_view=t, can_create=t`. Then re-tick OG-13. Phase 6's wizard will gate on one of these; whichever it picks is currently wrong for managers. |
| M4 | MAJOR | live data — 50 rows in `payment_receipts` marked `description='PHASE2_STRESS_do_not_keep'` | **The stress test's 50 receipts are not inert test noise; they are exportable accounting documents on a live, user-reachable page.** They are `status='approved'`, `destination_bank_account_id` = the only bank account, `payment_date=2026-08-18`, with a real customer's real Asan code — so they are 50 of the 53 rows the Asan bank-deposit export returns for that day, each with `blocked_reason = NULL`. They add 50,000 Toman to that account's `total_in` in `vw_account_balances` and 50 permanent posted entries to `journal_entries` (which went from 1 to 51 in this phase). Separately, the progress file's stated reason they cannot be removed — "migration 343 makes a posted entry immutable, so they cannot be deleted" — is **wrong**: the receipts delete cleanly; it is the *journal entries* that survive, orphaned and undeletable. | `T3 stress rows inside that export \| 50` (`t01_behaviour.sql`), against `T3 asan_list_bank_deposit_export today \| rows=53 total=4327000.00`. `vw_account_balances` recomputation: `total_in_recomputed=10100050000.00 in_count_recomputed=51 in_count_from_stress=50 total_in_from_stress=50000.00`. Deletion measured in `t07_delete.sql` — see M8. | Restore `D:\AfraKalaBackups\pre-phase2-20260818-192441.dump` before phase 8 takes an E2E baseline, or accept the contamination explicitly and record the exact 50 ids so phase 5 and phase 8 can exclude them. Do **not** delete them row by row (M8 explains why). For future stress runs: use a `payment_date` far outside any export window, or a dedicated customer with no Asan code so every row is blocked. |
| M5 | MAJOR | `document_numbers`, serial 51 | **The Part-B race test left a committed, unburned document number with no document behind it.** `RCP-1405-000051` is assigned to `source_id = 8141b507-3905-4c2e-918f-a05b81b510c0`, for which no `payment_receipts` row exists and never did; `burned_at` is `NULL`, so it reads as a live issued number. It is the only orphan in the table. The progress file records the test's success ("document_numbers rows for that source_id = 1") and does not record that the row was left committed — this is Gate A m3's mirror image: m3 was numbers removed by hand, this is a number issued to a phantom, and the numbering ledger's whole purpose is that a number identifies a document. | `SELECT … FROM document_numbers dn WHERE NOT EXISTS (SELECT 1 FROM payment_receipts pr WHERE pr.id = dn.source_id)` → exactly one row: `receipt \| 51 \| 8141b507-3905-4c2e-918f-a05b81b510c0 \| receipt_exists = f`. Total 51, orphans 1. Then `D2 … number=RCP-1405-000051 serial=51 burned_at=<NULL> assigned_by=b51e3d4f-… receipt_exists=f` (`t08_burn.sql`). | At minimum call `burn_document_number('receipt','8141b507-…','آزمون هم‌زمانی فاز ۲')` so the ledger says the number was consumed by a test rather than pointing at a document. Record it in `phase-2-PROGRESS.md`. And add to the phase-3/4 stress procedure: a concurrency probe that commits must burn what it mints. |
| M6 | MAJOR | `349:§8` — `entry_date = p_payment_date`, unbounded | **`create_receipt` accepts any `p_payment_date` and posts an immutable entry on it.** A receipt dated 2019-01-01 is accepted and posts an entry with `entry_date=2019-01-01`, while its document number is `RCP-1405-000052` — the number's Jalali year comes from `tehran_today()`, so number and entry date can disagree by years. A date 400 days in the future is equally accepted. Because `asan_list_journal_export` and `asan_list_bank_deposit_export` both select on a date range, a backdated document silently joins a period that may already have been submitted, and because 343 makes the entry immutable and `reverse_document` does not exist, it cannot be moved or withdrawn. Nothing in the phase's task log, the contract, or the decisions record considers a period boundary. | `t06_final.sql`: `B5 backdated 2019 receipt \| ACCEPTED doc=RCP-1405-000052 entry_date=2019-01-01 (document number year = current Jalali year)`; `B6 future-dated (+400d) receipt \| ACCEPTED doc=RCP-1405-000053`. | Add bounds to `create_receipt` (and mirror them in `create_payment`/`create_dual_document`): refuse a future `p_payment_date` outright, and refuse a date before a configured period-open date — or, if backdating must be allowed for data entry, raise it as an owner gate and record who may do it. Also decide whether the document number's year should follow `p_payment_date` rather than today. |
| M7 | MAJOR | `docs/verification/348-down.sql:38,50`, `349-down.sql:33,50`, and `phase-2-PROGRESS.md` § *Standing invariants* | **The recorded proof that the rollback files run cannot have happened the way it is written.** Both files contain their own `BEGIN;` … `COMMIT;`. Running such a file with `\i` inside an outer `BEGIN … ROLLBACK` does not stay inside the outer transaction: the inner `COMMIT` commits everything and the final `ROLLBACK` is a no-op. The progress file records "`349-down` then `348-down` executed in one `BEGIN … ROLLBACK`, exit 0; `create_receipt` count went 1 → 0 … `ROLLBACK` restored the function (count back to 1)". Under that method the `DROP FUNCTION` would have been committed and the `ROLLBACK` would have restored nothing. Either the files were edited before the run (not recorded) or the function was restored some other way (not recorded). Separately this is a real defect in the files themselves: a rollback file that carries its own `COMMIT` cannot be dry-run, and it silently defeats the `--single-transaction` guarantee CLAUDE.md rule 2 requires when several files are chained — which matters precisely here, because the documented order is "349-down first, then 348-down", and 348-down is documented to fail. | Mechanism measured directly (`t05_nested.sql`): outer `BEGIN`, temp marker created, then `\i` a file containing `BEGIN; CREATE TEMP TABLE …; COMMIT;`, then `ROLLBACK` → `outer_survived = t, inner_survived = t`, with `WARNING: there is already a transaction in progress` and `WARNING: there is no transaction in progress`. I did **not** re-run the real down files in that mode, because doing so would have dropped `create_receipt` on a shared database for real. With the `BEGIN`/`COMMIT` lines stripped, both files do run and restore correctly — see check 5. | Remove `BEGIN;`/`COMMIT;` from both down files and let the operator supply `--single-transaction` (the project's standard, CLAUDE.md rule 2). Correct the Standing-invariants row to state the method actually used. Apply the same rule to every future `docs/verification/*-down.sql`. |
| M8 | MAJOR | `payment_receipts` DELETE path × 343 immutability × `increase_credit` | **Deleting a receipt created by this RPC leaves an orphaned immutable posted entry and a permanently inflated customer balance.** As `supabase_admin`, `DELETE FROM payment_receipts` succeeds. The document number is correctly burned (`tg_burn_receipt_document_number` works). But the journal entry and its two lines survive with a `source_id` that no longer resolves, cannot be deleted (`P0001`, "سند ثبت‌شده قابل تغییر نیست؛ برای اصلاح، سند برگشتی بزنید" — a reversal document that does not exist), and the `customer_credit_ledger` row and the `available_credit` increase both survive untouched. Gate A M5 identified this mechanism when `journal_entries` held **one** row; phase 2 raised that to **51**, so the exposure grew fifty-fold in the phase that also documented (wrongly, M4) that these rows cannot be deleted. | `t07_delete.sql`, `BEGIN … ROLLBACK`: `C2 credit after create \| 1284000.00` → `C3 DELETE payment_receipts as supabase_admin \| SUCCEEDED` → `C4 after the delete \| journal_entries=1 journal_lines=2 document_numbers=1 credit_ledger_rows=1 available_credit=1284000.00` → `C5 … source row no longer exists: t` → `C6 delete the orphaned entry \| sqlstate=P0001 msg=سند ثبت‌شده قابل تغییر نیست؛ برای اصلاح، سند برگشتی بزنید`. Burn confirmed separately: `D1 … burned_at=2026-08-18 15:26:00 reason=فیش دریافت حذف شد`. | This is OG-14 with a measured cost. Build `reverse_document` before phase 6 wires the RPC, not before phase 9 — T1 names reversal as *the* mitigation for removing the four-eyes control, and that mitigation currently does not exist. Until then, add an `AFTER DELETE` guard on `payment_receipts` that refuses when a posted entry references the row, so the orphan cannot be created at all. |
| m1 | MINOR | `348` × `pr_insert_admin_accountant` policy | The Security Engineer's raised risk is real and the Lead's stated reason for accepting it is wrong on the facts. The Lead wrote that the legacy path "inserts with `status='pending_review'`, which the old third branch already permitted, so its reachable state set is unchanged". The reachable state set is defined by the **policy**, not by the form: `payment_receipts` still carries a permissive `INSERT` policy for admin/accountant, so any accountant can write an `approved` cheque receipt with no receiver directly through PostgREST — a state that did not exist before 348. Practical impact is small (the row has no journal entry, no document number, and is invisible to both exports because `destination_bank_account_id` is NULL), which is why this is MINOR rather than MAJOR — but the *decision* was accepted on a reason that does not hold. | As accountant `90c0479f-…` under `SET LOCAL ROLE authenticated` (`t06_final.sql`): `B4 accountant direct table INSERT (bypassing create_receipt) \| SUCCEEDED - approved cheque receipt, no receiver, no Asan-code check, no document number, no journal entry`. | Re-record the risk with the correct reason. Note that this same policy is what lets a direct insert bypass T3's Asan-code precondition entirely — acceptable under D12 only until task 6.9, at which point both policies should go the way `journal_entries`' write policies went in 346. |
| m2 | MINOR | `post_receipt_accounting` role gate vs OG-13 | A manager may create a receipt through the RPC but is refused by `post_receipt_accounting` with `P0001 دسترسی غیرمجاز برای ثبت سند حسابداری فیش` rather than the `already_posted` short-circuit the phase's §G table promises. Not reachable through the UI today — `_app.accounting.receipts.$receiptId.tsx:214` gates the button on `hasAnyRole(roles, ["admin","accountant"])` while the route itself admits managers — so this is a boundary inconsistency, not a live break. It is the fifth surface of M3. | `t01_behaviour.sql`: `T2 manager create \| doc=RCP-1405-000053` then `T2 post button as MANAGER \| sqlstate=P0001 msg=دسترسی غیرمجاز برای ثبت سند حسابداری فیش`. Compare `T1 post_receipt_accounting as ADMIN \| {"posted_at": …, "already_posted": true}`. | Fold into M3's single migration, or record explicitly that `post_receipt_accounting` keeps the narrower boundary because it is the retiring path (D12, task 6.9). |
| m3 | MINOR | `asan_list_journal_export` `blocked_reason` × `cheque_receivable` | A cheque receipt's block message shown to the accountant is `کد حساب آسان برای «cheque_receivable» ثبت نشده است` — a raw English account_kind inside a Persian sentence, because `asan_control_accounts` has only one row (`invoice_ar`) and the fallback is `COALESCE(label_fa, account_kind)`. D16 makes Persian messages part of the contract. C7 hands the export behaviour to phase 5 correctly, but not this. | `t01_behaviour.sql`: `T4 asan_list_journal_export(all) \| doc_kind=unclassified line=1 account_code=<NULL> blocked=کد حساب آسان برای «cheque_receivable» ثبت نشده است`; and with `_filter='receipt'` the document returns **0 rows** — it disappears from the filtered export entirely. `SELECT account_kind, label_fa FROM asan_control_accounts` → one row, `invoice_ar`. | Seed `asan_control_accounts` with a `label_fa` for every `account_kind` in the CHECK (even where `accounting_code` stays NULL), so no English identifier can reach a user-facing message. Cheap now, and it is phase 5's problem otherwise. |
| m4 | MINOR | `docs/api/rpc-contracts.md:107` | Step 8 still reads "Bind `p_attachment_ids` to `document_attachments` (`document_type='receipt'`)" while the shipped function raises `0A000`. C8 is recorded in the progress file but not in the contract that task 2.1 existed to reconcile. | Read of line 107 against `T5 attachments non-empty \| sqlstate=0A000 msg=پیوست فایل در این نسخه هنوز پشتیبانی نمی‌شود…`. | Mark step 8 as C8, the way steps 6 and the journal table were marked for C3 and C1. |
| m5 | MINOR | `docs/api/rpc-contracts.md:57` (step 4) | The contract says the tracking number is minted for every non-`bank` channel; the implementation honours a caller-supplied value and mints only when none is given. The deviation is deliberate and correct (task 2.5 argues it well — discarding a value the caller sent is a swallowed input), but the contract was not updated, so the built object and its specification differ on a third point that task 2.1 did not mark. | Read of the contract line against `349:§5` and `T3 cash receipt \| tracking=INT-RCP-1405-000054` (minted) vs `T4 cheque receipt \| tracking=INT-RCP-1405-000055` and the stress rows' caller-supplied `PHASE2_STRESS_n`. | One-line correction. See also B1: whatever value ends up in this column is published by the bank-deposit export. |
| m6 | MINOR | `docs/api/rpc-contracts.md:35-36` | "**`auth.uid()` is NULL in psql**, so these functions cannot be called from a shell. To verify them manually, replicate the body without the role guard. Never invoke." This is false — every measurement in this report invoked `create_receipt` from psql by setting `request.jwt.claims`, which is exactly the method CLAUDE.md rule 7 prescribes — and the advice it gives instead ("replicate the body") is the anti-pattern that let phase 1's B1 through three reviewers. The phase itself correctly ignored this instruction and used simulated JWTs throughout. | Demonstrated by every `DO $$ … PERFORM set_config('request.jwt.claims', …) … create_receipt(…)` block in this review. | Replace with the JWT-simulation recipe from CLAUDE.md rule 7. A contract that tells the next engineer not to test the real object is worse than no note at all. |
| m7 | MINOR | `349:§6` column list | `bank_name` and `receipt_time` are never written. `get_receivable_detail` returns `pr.bank_name AS receipt_bank_name`, so that field is NULL for every receipt this RPC creates while 3 of the 6 legacy rows carry a value — a column that quietly changes meaning depending on which path made the row. `source_bank` is populated instead. | `SELECT (description='PHASE2_STRESS_do_not_keep') AS stress, count(*), count(bank_name), count(receipt_time) FROM payment_receipts GROUP BY 1` → legacy `6 \| 3 \| 4`, stress `50 \| 0 \| 0`, pre-existing `1 \| 0 \| 1`. | Decide which of `bank_name` / `source_bank` is canonical and make `get_receivable_detail` read that one; or populate both. Cheap, and it lands in phase 6's wizard either way. |

**Count: 1 BLOCKER, 8 MAJOR, 7 MINOR.**

---

## Checks performed and their real output — verified correct

| # | Check | Result |
|---|---|---|
| 1 | **The repo file is the live object.** Re-applied `20260818181000_349_create_receipt.sql` from the repo inside `BEGIN … ROLLBACK` and compared `md5(pg_get_functiondef(...))` before and after | `c9d9498427cd32612e471c9d447cef18` both times, length 19,407. Same for 348: constraint md5 `605cb833251d6edcd092bbca11233ea2` unchanged. **PASS** — the committed migration and the database agree exactly. |
| 2 | **Idempotency of both migrations.** 348 then 349 re-applied in one transaction | `exit 0`, no errors. `create_receipt` count stayed 1 (`CREATE OR REPLACE`, not a second overload), and the ACL survived the re-apply: `{postgres=X/supabase_admin, supabase_admin=X/supabase_admin, authenticated=X/supabase_admin, service_role=X/supabase_admin}`. **PASS.** |
| 3 | **Grants.** `pg_proc.proacl` for `create_receipt` | No `PUBLIC` entry, no `anon` entry. Task 2.8's claim reproduces exactly. **PASS.** |
| 4 | **Role gate, all three actors.** Real calls under simulated JWTs | `sales 00ebe9d3-…` → `42501 اجازهٔ ثبت فیش دریافت را ندارید`. `manager e534b94d-…` → `SUCCESS doc=RCP-1405-000053`. `admin b51e3d4f-…` → success. Refusal is a `RAISE`, never an empty result (spec §3.3). **PASS.** |
| 5 | **Down files, with `BEGIN`/`COMMIT` stripped** (see M7), run in reverse order in one transaction | `exit 0`. `create_receipt` count 1 → 0; the restored constraint is byte-identical to the pre-348 definition. `ROLLBACK` restored both. **PASS on the SQL**, FAIL on the recorded method. |
| 6 | **348-down's own claim — that it fails once cheque receipts exist** | Pre-flight gate before: `0`. Created one cheque receipt through the RPC → gate: `1`. Ran 348-down's two statements verbatim → `sqlstate=23514 msg=check constraint "payment_receipts_receiver_exclusive_chk" of relation "payment_receipts" is violated by some row`. **The claim is exactly true.** The rollback is genuinely usable *today* (0 such rows) and becomes permanently unusable the first time the cheque branch is used, because the offending rows cannot be reversed (M8). The file documents this honestly, which is more than phase 1 managed. |
| 7 | **`post_receipt_accounting` short-circuits (mission item 3).** Created a receipt with the RPC, then called the function the `/accounting/receipts/$receiptId` button calls, as admin | `{"posted_at": "2026-08-18T15:16:36+00:00", "already_posted": true}`. Entries for that receipt after the button: **1**. Credit-ledger rows after the button: **1**. No double post, no double credit. **PASS** (for admin/accountant; see m2 for manager). |
| 8 | **C3's status decision against every reader of `payment_receipts.status`.** Enumerated 15 functions whose live body references `payment_receipts`, plus both views and all 7 triggers | `trg_payment_receipts_recompute_employee_score` is `AFTER INSERT OR DELETE OR UPDATE OF status`, and `recompute_employee_scores_on_receipt` handles `TG_OP='INSERT'` explicitly with `'approved'` in its whitelist — so it **does** fire on the create path. Its body is inert by design since 330 (the salesperson join was removed), so nothing that should have run failed to run. `enforce_receipt_approval_allocation_limits` is `BEFORE UPDATE OF status` and does not fire — correctly, because `enforce_payment_receipt_link_limits` (`BEFORE INSERT` on the links table) enforces both caps and counts `r.status='approved'`, which the row already is by the time links are inserted. `calculate_credit_score`, `vw_customer_receivables`, `get_account_ledger`, `get_receivable_detail`, `vw_account_balances` all accept `'approved'`. **C3 is correct and the ordering inside the RPC (receipt before links) is what makes it work.** |
| 9 | **The two allocation caps are the trigger's, not a second copy.** Read of `enforce_payment_receipt_link_limits` live body | Rule 1 locks the receipt `FOR UPDATE` first, then sums the other links; rule 2 locks the quote and sums other approved-receipt links. Neither is re-implemented in 349. CLAUDE.md rule 14 respected. **PASS.** |
| 10 | **`p_attachment_ids` (mission item 4)** | Non-empty → `0A000 پیوست فایل در این نسخه هنوز پشتیبانی نمی‌شود؛ با فرم پیوست فاز بعد اضافه می‌شود`. Empty array `ARRAY[]::uuid[]` → accepted, `doc=RCP-1405-000056`. `NULL` → accepted. The refusal is correct on the merits — `document_attachments.document_id` is `NOT NULL` with a `BEFORE INSERT` existence trigger, so no id could legitimately be supplied — and `0A000` (`feature_not_supported`) is the right SQLSTATE. See the C8 verdict below on whether the parameter should be in the signature at all. |
| 11 | **Every `RAISE` in the live body (mission item 9).** All 26 extracted with `regexp_matches` from `pg_get_functiondef` | Every message is Persian and written for the user. SQLSTATEs: `42501` for the role gate, `22023` for all argument validation, `0A000` for attachments, `P0001` for the four business rules (missing bank accounting code, foreign proforma, imbalance, and `require_asan_code`'s own). **No Asan code, national id or phone appears in any message.** The only personal datum disclosed is `persons.display_name`, in `require_asan_code`'s message, to a caller who has already passed the admin/accountant/manager gate. **PASS.** |
| 12 | **Audit payload (spec §2's "never record").** Read of the `audit_logs` INSERT | `journal_entry_id`, `document_number`, `amount`, `counterparty_id`, `counterparty_kind`, `channel`, `debit_account_kind`, `allocation_count`. `actor_id` is `auth.uid()`, never a parameter. **No Asan code, phone or national id.** `increase_credit`'s second row carries only amounts and ids. **PASS.** |
| 13 | **The literal double-count question (mission item 1).** Enumerated every `public` function whose live body reads `customer_credit_balance` (10) and every one that reads `journal_lines` with `customer_credit` (7) | The two sets intersect only in `create_receipt` itself and `person_fk_drift_report`/`person_merge` (which read FKs, not amounts). **No reader sums both representations.** The mission's literal concern is not realised. Measured on the stress customer: `get_customer_credit → available=8,827,000`; journal `customer_credit` net `debit−credit = −8,827,000`; `customer_credit_ledger` payments `= 8,827,000`. Consistent, not summed. The realised double count is a different one — see M1. |
| 14 | **`person_settlement_position` after a receipt** | `receivable=-8827000 payable=0 net=-8827000 direction=we_pay`. Confirms the documented "misleading numbers": because nothing ever debits `customer_credit` (no sales posting exists), a customer who has only ever paid us reads as a party **we** owe. Pre-existing and out of phase 2's scope, but every receipt this RPC creates deepens it, and `list_mutual_settlement_candidates` and `post_mutual_settlement` read the same expression. Recorded for phase 5/6. |
| 15 | **Standing invariants after 348/349** | Tables without RLS: **0**. `SECURITY DEFINER` functions in `public` with no `search_path`: **0**. `create_receipt` is `prosecdef=t`, `proconfig={search_path=public}`. `journal_entries` / `journal_lines` carry **no** write policy — only `*_select_finance` (PERMISSIVE SELECT) and `viewer_restricted` (RESTRICTIVE ALL), so Gate A's M2 remediation is still in place and the RPC really is the only way an entry can be written. **PASS, all four.** |
| 16 | **PostgREST schema cache** | `Schema cache loaded 248 Relations, … 345 Functions` at `18/Aug/2026:14:38:30 +0000`, after both migrations. `create_receipt` is exposed. **PASS.** |
| 17 | **Migrations committed and in sync with the remote** | `git status --porcelain -- supabase/migrations docs/verification docs/api docs/execution/phase-2-PROGRESS.md` → empty. `git rev-list --count HEAD..origin/staging` → **0**. Numbering 348/349 contiguous with 347, no collision. **PASS.** |
| 18 | **The cheque branch's ledger shape** | `debit kind=cheque_receivable`, `account_ref_id = p_customer_id` (the drawer), `credit kind=customer_credit`, `dest_bank=NULL receiver_party=NULL`, `document_channel=cheque`, and it correctly does **not** appear in the bank-deposit export (`T4 cheque in bank-deposit export \| 0`). C1's resolution is the only one `validate_journal_line_ref` accepts. **PASS.** |
| 19 | **The migration-328 person-FK registry gate** | 348 adds and removes no foreign key, so the FK set and `person_merge`'s registry cannot disagree; the `ALTER TABLE` completing is itself the proof, as the phase says. **PASS.** |

---

## What I could not verify

- **Whether B1 is a real accounting error or an intended mapping.** I proved that a cash receipt is
  published by the bank-deposit export with a synthetic reference and no warning. Whether a receipt
  into a صندوق *should* appear in Asan's واریز بانکی document type is an accountant's question, not a
  technical one. The fabricated `INT-…` reference is wrong under either answer; the export filter may
  not be.
- **Whether the Part-B concurrency measurement observed genuine contention.** Both workers returning
  `RCP-1405-000051` and one row existing is consistent with a real race on the advisory lock *and*
  with the second worker simply starting after the first committed. The progress file records only
  the two output lines, not lock waits or timings. Reproducing it requires committing rows, which is
  outside this review's authority. The conclusion is almost certainly right — `assign_document_number`
  re-reads after taking the lock, which holds at READ COMMITTED — but it is not established by the
  evidence recorded. Note also that the measurement cannot be a property of `create_receipt`: that
  function generates `_receipt_id` internally, so two concurrent calls can never share a `source_id`.
  Gate A's m2 was about `assign_document_number` and is answered; the progress file presents it inside
  the `create_receipt` stress block, where a reader will take it for more than it is.
- **Anything through the browser.** `create_receipt` has no call site in `src/` or `server/` (D12
  keeps the legacy form until task 6.9), so there is nothing to click. The frontend facts in m2 and M1
  come from reading the route files, not from running the app.
- **Production.** Not contacted, by instruction. Whether production's readers differ from test is
  still `UNKNOWN` (ground-truth Q5). B1 and M1 must be re-measured there before phase 9.
- **The 70-error typecheck baseline.** Not re-run; phase 2 changed only SQL and the Lead's recorded
  70/70 is consistent with D14.
- **Whether the down files were edited before the recorded rollback run.** I proved the mechanism
  (M7) and that the files work with `BEGIN`/`COMMIT` stripped. What actually happened on 2026-08-18 is
  not recoverable from the record.

---

## Verdict on the phase's nine recorded contradictions

**C1 — the cheque debit's `account_ref_id`.** *Right, and the only available answer.* Live
`validate_journal_line_ref` accepts `cheque_receivable` against `customers` or `external_parties`
only; there is no cheque register. Measured: `debit kind=cheque_receivable, ref = the drawer`.
**Endorsed.**

**C2 — every payer is a customer.** *Right to build the contract as written and raise OG-16 rather
than widen the signature on a guess.* This is the correct reading of Gate A's OG-10 precedent.
**Endorsed.**

**C3 — `status='approved'` + `posting_status='posted'` instead of `status='posted'`.** *Right, and
better reasoned than the contract it corrects.* I verified both halves independently: the CHECK admits
only three values, and `enforce_payment_receipt_link_limits` counts `r.status='approved'`, so a fourth
value would have silently disabled the over-allocation cap. I also swept the readers the mission named
and found nothing that a non-transitioning `approved` breaks — `recompute_employee_scores_on_receipt`
fires on `INSERT` and handles it, and it is inert anyway; `enforce_receipt_approval_allocation_limits`
does not fire but is fully covered by the per-link trigger because the receipt is inserted before its
links. **Endorsed — this is the strongest single decision in the phase.**

**C4 — widen the receiver CHECK for cheques (migration 348).** *Right in substance, accepted on a
wrong reason.* Strictly weakening, so no current writer can start failing — verified. But the Lead's
answer to the Security Engineer ("the legacy form inserts `pending_review`, so its reachable state set
is unchanged") reasons about the form when the policy is what defines reachability; an accountant can
write the new state directly (m1). **Endorsed with the reason corrected.**

**C5 — `p_destination_bank_account_id` required for `cash` as well as `bank`.** *Right on the
constraint, and the source of B1.* The reasoning is sound — the debit line needs a reference and the
CHECK demands a receiver — but the conclusion was not followed through to "which bank account, and
what does the export do with it". The recorded data gap ("no `account_type='cash'` row exists") was
graded "not a blocker — D18"; it is the mechanism by which every cash receipt today lands in a real
bank account and in the bank-deposit export. **Endorsed as far as it goes; see B1.**

**C6 — `document_channel` stores `cash`/`cheque` and `NULL` for bank.** *Right.* Recording a false
sub-channel would be worse than recording none, and 2 of 7 pre-existing rows are already NULL. One
consequence worth carrying: `get_account_ledger` returns `document_channel` as a column, so every
bank receipt this RPC creates shows an empty channel in the treasury ledger until phase 6's wizard
supplies the real one. **Endorsed, with that noted.**

**C7 — the export still infers `doc_kind` and blocks cheque lines.** *Right to record rather than
fix.* Measured exactly as predicted: `doc_kind=unclassified`, `blocked_reason=کد حساب آسان برای
«cheque_receivable» ثبت نشده است`, and **0 rows** under `_filter='receipt'`. Tasks 5.1 and 5.2 own it.
**Endorsed** — and the English identifier inside the Persian message (m3) is worth fixing now, since
it costs one seed row.

**C8 — `p_attachment_ids` raises `0A000`.** *The refusal is right; the parameter should not be in the
signature.* The mission asks whether a parameter that can never be used is a signature that lies. It
is. Refusing loudly beats accepting silently, so the choice between those two was made correctly — but
there was a third option: leave the parameter out until phase 6 wires it. Against it: adding a
parameter later means either a new signature (CLAUDE.md rule 5 — the overload trap this project has
already hit) or a `DROP FUNCTION` + recreate in phase 6, and the contract already published the
parameter. On balance **the decision is defensible and I would not reverse it**, but the contract must
say so (m4), and phase 6 must not discover `0A000` from a user report.

**C9 — two audit rows, not one.** *Right.* The spec's intent ("created but unaudited" must be
impossible) holds, and writing a second credit path to make a row count come out at one would violate
rule 14. Measured: 50 `receipt_created` + 50 `credit_payment` for the 50 stress receipts. The spec
sentence does need amending, and deferring that to phase 4 (when all three RPCs exist and the number
changes again) is the right call. **Endorsed.**

---

## Verdict on the Lead's judgement calls

**The overruled reviewer — task 2.4's balance assertion (mission item 5).** The Software Engineer is
factually right that the branch cannot fire: both lines take `p_amount`, no `BEFORE` trigger on
`journal_lines` alters `debit`/`credit`, and `validate_journal_line_ref` only validates. The Lead is
right that this is not the point. **The overrule holds on its merits.** A tripwire earns its keep if
it fires when the thing it guards breaks, and the realistic breakage — a third line added for a fee,
or the cheque branch gaining a second debit — is exactly what it would catch; the cost is one
aggregate over two rows in a transaction that already performs eight writes, and the failure it
prevents is a document silently withheld from the Asan export months later, which is a failure mode
this programme has hit repeatedly. One refinement the Lead did not reach: the assertion belongs on the
**table**, not in each RPC. Phases 3 and 4 will each copy this block, which is precisely the drift
rule 14 exists to prevent. A deferred constraint trigger on `journal_entries` would cover
`post_receipt_accounting`, `post_mutual_settlement` and `pay_purchase_with_voucher` too — all three of
which are unguarded today. **Endorsed, with the recommendation that phase 3 promote it rather than
copy it.**

**Migration granularity — seven tasks, two migrations (mission item 6).** *No acceptance criterion
was weakened.* I checked each of the eight acceptance commands against the final object and every one
is a property of the finished function, not of an intermediate: one row with a document number, `P0001`
for a missing Asan code, `sum(debit)=sum(credit)`, a minted `INT-` tracking number, a
`cheque_receivable` debit, zero rows after a forced link failure, and the three-role gate. There is no
state in which `create_receipt` exists but does not post — and there must not be, because A4 forbids
it, so the "intermediate versions nobody uses" the Lead describes would have been states the
architecture rules out. The split the Lead chose is on the seam that actually matters: 348 is a schema
change with its own blast radius and its own rollback, 349 is a function with its own. **Endorsed. The
call is right and the reasoning is right.** The one cost is invisible in the record: with tasks 2.2–2.8
in one `CREATE FUNCTION`, no reviewer ever saw a diff smaller than 548 lines, and the three
task-level reviewer verdicts for 2.4, 2.6 and 2.7 were therefore all rendered against the same object.

---

## Verdict on the open Owner-Gates

**OG-16 — what does a receipt from a non-customer credit?**
Correctly raised, correctly framed, correctly not pre-empted, and correctly recorded as blocking
nothing in phase 2. The three options are stated fairly and option (b)'s objection — that it is exactly
what A2 rejected for cheques — is the right one to surface. **Endorsed.** Two things I would add before
it goes to the owner. First, it is not only a cheque question: OG-10 made external parties valid
counterparties on the *debit* side, and `post_receipt_accounting` already has an `external_party`
debit branch, so the asymmetry the owner is being asked about already exists in shipped code. Second,
option (c) — promote the payer to a customer — is cheaper than it looks and should be priced honestly:
it costs one `customers` row and no schema change, and the "permanent customer record" objection is
weaker now that persons are unified (Phase 2 persons core), because the person exists either way.

**OG-14 — no `reverse_document`, posted entries are permanent.**
Carried forward by the phase as "must close before phase 9". **I disagree with the timing and would
escalate it.** Verified: `SELECT count(*) FROM pg_proc WHERE proname='reverse_document'` → **0**. T1
removes the four-eyes control and names two mitigations, role gates and "a posted document cannot be
edited, only reversed". The first exists; the second does not. Phase 2 raised the number of immutable
posted entries from 1 to 51 and shipped the function that will create every future one, with no
request idempotency key (M2) and no way to undo a duplicate (M8). **This must close before phase 6
wires the RPC to a form, not before phase 9.**

**OG-13 — the role boundary.** Recorded as closed. **It is not** — two of the four surfaces Gate A M3
named still carry the old answer, plus a fifth surface nobody has listed. See M3 and m2. Reopen it.

**OG-10, OG-11, OG-12, OG-8, OG-9** — untouched by this phase; no new evidence either way.

---

## Closing note

The mission asked one question above the others: *is it true that a new object has limited dependency
exposure?* The phase's §G table answers it by enumerating what depends on `payment_receipts` and
checking, for each, whether **migration 348's constraint change** affects it. Every row in that table
is correct. But the column heading is "Affected by 348/349?" and only 348 was actually tested. The
rows that say "Unaffected" for `asan_list_bank_deposit_export` and `vw_account_balances` are true of
the constraint and false of the function: both readers select on `destination_bank_account_id IS NOT
NULL AND status='approved'`, which is precisely the shape `create_receipt` now produces fifty-one
times over — including for a channel the export has no way to recognise as cash.

That is the same failure phase 1 was failed for, moved one level out. Phase 1 verified what it built
and not what already depended on what it changed. Phase 2 swept what depended on what it *changed*, and
not what would now read what it *creates*. The distinction matters because a new writer is not exempt
from the existing readers — it is a new source of rows for every one of them.

What is genuinely better here: the contradictions table is real and nine entries long, the forced
failure in task 2.7 is a measurement rather than an argument, the reviewer dialogue overruled a real
objection for a real reason, the rollback files were written first and one of them documents its own
data-loss hazard accurately, and the migration granularity decision is both correct and correctly
justified. The engineering is sound. The record around it is where the two MAJORs that are not code
live — a rollback proof that cannot have happened as written, and a contract that tells phase 6 the
opposite of what the function does.

Fix B1 before anyone creates a cash receipt. Answer M1 before phase 6 wires this RPC to a form.
Correct M2 before phase 6 reads the contract.

— Supervising Engineer (مهندس ناظر), 2026-08-18
