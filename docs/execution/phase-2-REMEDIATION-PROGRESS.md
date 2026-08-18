# phase-2-REMEDIATION-PROGRESS — Gate A remediation

Remediation of the 16 defects raised by the independent supervising engineer in
`docs/execution/phase-2-GATE-A.md` (merged as #303, commit `87c1a921`).

Per-defect detail lives here. The programme-level ledger is `docs/execution/00-progress.md`.

## HANDOFF STATE

```
Programme:            AfraKala Live Ledger
Phase:                2 — Gate A remediation
Branch:               feature/gatea-remediation-350-353
Migrations added:     350, 351, 352, 353  (all applied to the TEST database, all verified live)
Typecheck:            70 / 70 baseline — unchanged (no TypeScript was touched)
Owner-Gates open:     OG-8, OG-11, OG-12, OG-14, OG-15, OG-16, **OG-17 (new)**
                      OG-10 and OG-13 CLOSED
Defects closed:       B1, M2, M3, M6, M7, M8, m2, m4, m5, m6      (10 of 16)
Defects with owner:   M1 → OG-17, M5* (see below)
Defects still open:   M4, M5, m1, m3, m7                          (5 of 16)
Production touched:   NO
```

---

## 0. The drift incident — applied but not committed

**This section exists because the failure it records is the one CLAUDE.md forbids most plainly, and
it very nearly shipped silently.**

The session that authored migrations 350–353 applied all four to the test database and was then cut
off by an API 500 error before it committed anything. For roughly a day the state was:

| | |
|---|---|
| Test database | carried migrations 350, 351, 352, 353 |
| `origin/staging` | `87c1a921` — knew nothing about any of them |
| Working tree | four untracked migration files, four untracked rollback files |

A database ahead of the repository is not a cosmetic problem. `staging` is what the test computer
deploys, `main` is what production deploys, and phase 9 replays `supabase/migrations/` in filename
order against production. Four migrations that exist only as untracked files in one working tree
would have been replayed against nothing — and CLAUDE.md's own warning about parallel agents ("**5.
Uncommitted work gets destroyed.** Edits were wiped twice by other agents' git operations") applied
in full: another mission's `git` operation in this shared tree would have taken all four with it.

**What was done about it.** Nothing was re-applied and nothing was re-run. Each migration was
verified against the **live object** — `pg_get_functiondef`, `pg_policies`, `pg_get_triggerdef`,
`role_permissions` — rather than against the file on disk or a log line from the dead session, on
the principle that a file is not evidence that it ran. All four were confirmed present, all four
had their rollback file, and the work was then committed and merged as one unit (§1).

**The lesson, for the next agent:** the commit is part of applying a migration, not a step that
follows it. Apply → verify the object → commit → push, in one uninterrupted sequence. If the
sequence breaks, the first task of the next session is to close the drift before doing anything
else.

### Verification that each migration is genuinely live

Run 2026-08-18 against `afrakala-lan-db` / database `afrakala` as `supabase_admin`.

| Migration | Object inspected | Probe | Result |
|---|---|---|---|
| **350** | `public.asan_list_bank_deposit_export(date,date)` | `pg_get_functiondef` contains `NOT IN ('cash', 'cheque')` | `t` |
| | | contains `document_channel IS NULL` (the bank branch still exports) | `t` |
| **351** | `public.create_receipt(...)` | contains `p_payment_date > public.tehran_today()` | `t` |
| | | contains `jalali_year(public.tehran_today()) - 1` | `t` |
| | | contains `_channel = 'cash' AND _account_type IS DISTINCT FROM 'cash'` | `t` |
| | | contains `_channel = 'bank' AND _account_type IS DISTINCT FROM 'bank'` | `t` |
| | | raises `0A000` (m4, attachments) | `t` |
| | | `_tracking := NULLIF(btrim(coalesce(p_tracking_number, ''))…` (m5, honours caller) | `t` |
| | | `_tracking := 'INT-' \|\| _doc_number` (m5, mints only as fallback) | `t` |
| | | **signature count = 1** — no overload was created (CLAUDE.md rule 5) | `1` |
| **352** | `pg_policies` on `document_numbers` | `document_numbers_select_finance` qual = `has_any_role(uid(), ARRAY['admin','accountant','manager'])` | confirmed |
| | `role_permissions` where `module='ledger-documents'` | `manager` = view `t`, create `t`, update `f`, delete `f`, approve `f`, export `f` | confirmed |
| **353** | `pg_get_triggerdef` | `BEFORE DELETE ON public.payment_receipts FOR EACH ROW EXECUTE FUNCTION tg_payment_receipts_block_delete_when_posted()`, `tgenabled='O'` | confirmed |
| | `tg_payment_receipts_block_delete_when_posted()` | checks `source_type='payment_receipt'`, `je.status='posted'`, `RETURN OLD` | `t`,`t`,`t` |

Grants were checked at the same time: both `create_receipt` and `asan_list_bank_deposit_export` are
`SECURITY DEFINER` with `EXECUTE` to `authenticated` and `service_role`. `asan_list_bank_deposit_export`
additionally carries a pre-existing `anon` grant — **not introduced by 350**, and not exploitable,
because the function's own body gates on `has_any_role` and raises for a caller with no role. Proved
accidentally: the census query below, run as `supabase_admin` with no JWT, was refused by that gate
(`اجازهٔ خروجی گرفتن از واریزیهای بانکی را ندارید`) and had to be re-run under a simulated admin JWT.

> **Note on `supabase_migrations.schema_migrations`.** This table's newest row is `20260811180000`.
> It records nothing from 336 onward — the whole phase-1 and phase-2 series is absent, not just
> 350–353. The project's real ledger is the table in `00-progress.md`, maintained by hand. This is
> pre-existing and out of scope here, but it is worth someone's attention before phase 9, because a
> replay tool that trusts that table would skip eighteen migrations.

---

## 1. Migration ledger — 350 to 353

| # | File | Defect | Applied | Rollback file | Verified live |
|---|---|---|---|---|---|
| 350 | `20260819090000_350_bank_deposit_export_excludes_cash_cheque.sql` | B1 (1) | 2026-08-18 | `docs/verification/350-down.sql` | yes |
| 351 | `20260819091000_351_create_receipt_cash_account_and_date_bounds.sql` | B1 (3), M6 | 2026-08-18 | `docs/verification/351-down.sql` | yes |
| 352 | `20260819092000_352_og13_remaining_surfaces.sql` | M3, m2 | 2026-08-18 | `docs/verification/352-down.sql` | yes |
| 353 | `20260819093000_353_block_receipt_delete_when_posted.sql` | M8 (stopgap) | 2026-08-18 | `docs/verification/353-down.sql` | yes |

Every rollback file from 350 onward contains **statements only** — no `BEGIN`, no `COMMIT`, no
`ROLLBACK`. That rule was established by Gate A M7 and is enforced by
`docs/verification/rollback-dryrun.sql`, which applies a file inside a transaction it owns, asserts,
and discards. A file that carried its own `COMMIT` would show up as state that did not return after
the `ROLLBACK`.

---

## 2. Group 3 — the contract corrections (`docs/api/rpc-contracts.md`)

Task 2.1 existed to reconcile the contract with the live schema, and Gate A found four places where
the built object and its specification still disagreed. All four are now corrected in place, each
marked with the defect that found it so the next reader can see why the wording changed.

| Defect | Where | What changed |
|---|---|---|
| **M2** | Conventions error table, row `23505` | Was "Idempotent replay — treat as success; return the existing document". Now "A real unique violation. **Not** a success path". |
| **M2** | Conventions, **Idempotency** | Was "Callers should retry safely on network failure". Replaced with **RETRY IS NOT SAFE**, the measurement (`doc1=RCP-1405-000054 doc2=RCP-1405-000055`, two immutable posted documents), why no natural dedup key exists, and the four things the front end must do instead. |
| **M2** | §5 items 1 and 5 | Both inverted to match. A banner at the top of §5 says so explicitly, for anyone holding a cached copy. |
| **m6** | Conventions, verifying from psql | Was "`auth.uid()` is NULL in psql … replicate the body without the role guard. Never invoke." Both halves were false and the advice was the anti-pattern that let phase 1's blocker through three reviewers. Replaced with the CLAUDE.md rule 7 JWT-simulation recipe, including `SET LOCAL ROLE authenticated` for exercising RLS. |
| **m4** | §1 step 8, and the signature comment on `p_attachment_ids` | Was "Bind `p_attachment_ids` to `document_attachments`". Now records that a non-empty array raises `0A000`, **why** it cannot be done in this order (`document_attachments.document_id` is `NOT NULL` and `validate_document_attachment_ref` is a `BEFORE INSERT` existence trigger), that `NULL` and `[]` both mean "no attachments", and that phase 6 owns the design decision. The parameter stays in the signature deliberately — adding it later would create an overload, not a replacement (CLAUDE.md rule 5). |
| **m4** | §5 | New item 6: `0A000` means "not built yet", not a field validation error. |
| **m5** | §1 step 4, and the signature comment on `p_tracking_number` | Was "If `p_channel <> 'bank'`, mint `p_tracking_number`" — i.e. unconditionally. Now: the caller's value is honoured and `INT-<doc_number>` is minted only as a fallback. The implementation was right; the contract was stale. |
| **M6** | §1 step 2 | Records the two new date bounds, that they are refused separately so the message names the rule the user hit, and the rationale (a backdated entry lands in an export window that may already have been submitted, and 343 + no `reverse_document` mean it can never be moved). |
| **M6** | §5 | New item 7: enforce the same bounds in the date picker. |
| **B1** | §1 step 4 | Records the new `account_type` precondition, and states plainly that **no `account_type='cash'` row exists on the test database yet, so cash receipts are refused until the owner creates the صندوق** — intended behaviour, not a defect. |

§1's own **Idempotency** paragraph already said the correct thing before Gate A; that is precisely
why M2 was graded MAJOR — one document stated both, and the half a front-end developer actually
reads was the wrong half.

---

## OWNER-GATE

### OG-17 — a receipt allocated to a proforma is counted twice

**Asked:** 2026-08-18. **Status:** OPEN. **Blocks:** phase 6 (must be answered before the wizard
wires `create_receipt`). **Source:** Gate A defect M1. **Do not fix without an answer** — this is a
business decision about what a number means, not a bug with an obvious correction.

A receipt allocated to a proforma does two things with the same money:

1. It inserts a `payment_receipt_links` row, which `vw_customer_receivables` subtracts from that
   proforma's `outstanding_amount`. The proforma is now that much closer to settled.
2. It calls `increase_credit(p_customer_id, p_amount, …)` — **unconditionally, for the full receipt
   amount, with no regard to allocations** — which adds that amount to
   `customer_credit_balance.available_credit`. The customer now has that much spendable credit.

`hold_credit` will then let the same money be committed to a different order.

**Reproduced by Gate A** (`t02_doublecount.sql`, admin JWT, inside `BEGIN … ROLLBACK`):

```
BEFORE     | available_credit=0.00        proforma outstanding=62,200,000
           | one 1,000,000 receipt, fully allocated to that proforma
AFTER      | available_credit=1,000,000   proforma outstanding=61,200,000
HOLD       | hold_credit(1,000,000) SUCCEEDED — the settled money was spent a second time
AFTER HOLD | available=0.00  held=1,000,000
```

**Confirmed again in this session, statically**, at
`supabase/migrations/20260819091000_351_…sql:542`:

```sql
PERFORM public.increase_credit(p_customer_id, p_amount, _receipt_id, _uid);
```

No allocation term appears anywhere in that call, and nothing between §7 (allocations) and §9
(credit) reduces it. 351 did not change this and was not asked to.

**Why it is an owner gate and not a defect fix.** The question is what
`customer_credit_balance.available_credit` is *for*, and only the owner can say:

- **(a) It is prepayment credit** — money received and not yet assigned to anything. Then
  `create_receipt` must add only the unallocated remainder, `p_amount − sum(allocations)`, and the
  UI label اعتبار قابل استفاده is correct.
- **(b) It is "total ever received"** — a lifetime figure. Then the arithmetic is right, but it must
  not be the number `hold_credit` spends, and it must not be labelled اعتبار قابل استفاده at
  `src/routes/_app.accounting.receipts.$receiptId.tsx:258`.

**Scope of the existing exposure.** The behaviour is inherited from `post_receipt_accounting`, which
does the same, so it predates phase 2. `customer_credit_ledger` currently holds **only** `payment`
rows — nothing in the system's history has ever held, released or consumed credit — so
`available_credit` is today a monotonically increasing lifetime total that is displayed to users as
though it were spendable. `hold_credit` has no call site in `src/` yet, which is the only reason this
was graded MAJOR rather than BLOCKER. Phase 6 is where it becomes reachable.

---

## 3. M4 and M5 — still open, and the live risk

### What is wrong

Phase 2's stress test committed 50 receipts marked `description='PHASE2_STRESS_do_not_keep'`. They
are not inert test noise:

- They are **exportable accounting documents on a page the accountant uses**, `/admin/asan-export`.
  Measured under an admin JWT on 2026-08-18: `asan_list_bank_deposit_export('2026-01-01','2027-12-31')`
  returns **51 rows, of which 50 are the stress receipts**, each with `blocked_reason = NULL` — so the
  export presents them as clean, submittable bank deposits carrying a real customer's real Asan code.
- They add 50,000 Toman to the only bank account's `total_in` in `vw_account_balances`.
- They add 50 permanent posted rows to `journal_entries`, which held **one** row before phase 2
  (51 now).
- They add 50,000 Toman of spendable credit to customer `d634ac60-21c5-4bf7-8760-4f340b813c7a`
  (person `f144680e-2580-4015-8034-8c03cb2b0fe2`, شخص آزمایشی 23).

**Migration 350 does not hide them.** 350 excludes `document_channel IN ('cash','cheque')`; these
rows carry `document_channel = NULL` (the bank branch), so the exclusion does not reach them.
Verified: all 50 still satisfy the export's channel predicate.

**M5** is separate and from the same stress run: `RCP-1405-000051` is committed against
`source_id = 8141b507-3905-4c2e-918f-a05b81b510c0`, for which **no `payment_receipts` row exists and
never did** — the artefact of a same-`source_id` race probe that called `assign_document_number`
directly and committed. `burned_at` is `NULL`, so the numbering ledger presents it as a live issued
number pointing at a document that does not exist. Verified this session:
`receipt_behind_it = 0`.

### Does migration 353's new delete guard change what the cleanup script does?

**No — and this is now proved rather than argued.** 353 refuses to delete a `payment_receipts` row
that has a **posted journal entry**. The cleanup script deletes the journal entries in step 1 and the
receipts in step 3, in the same transaction, so by the time the guard fires there is no posted entry
left to find and it passes. The dry run below was executed **with the guard live** and its
`DELETE FROM public.payment_receipts` reported `DELETE 50`.

What 353 does change is that **the script's step order is now load-bearing.** Before 353, deleting
the receipts first would merely have orphaned the entries (that was M8). After 353, deleting the
receipts first is *refused outright*. Do not reorder the steps, and do not run only part of the file.

### Why the owner has to run it, and not an agent

The script was written and its dry run succeeds, but the real run was **blocked by a safety
classifier** — it deletes rows from business tables and temporarily disables two immutability
triggers. That block was not circumvented and must not be. The script is therefore a hand-run
operation, recorded here with its measured effect so the owner can see exactly what it will do
before authorising it.

Note also that the script is deliberately **not** a migration and must never become one
(`docs/verification/`, not `supabase/migrations/`). Shipping a `DELETE` over business tables into the
sequence phase 9 replays against production would be a serious mistake — the header of the file says
so at length.

### Dry run — real output, 2026-08-18

Executed exactly as documented, through the M7 harness, against `afrakala-lan-db` / `afrakala`:

```
docker cp docs/verification/rollback-dryrun.sql                      afrakala-lan-db:/tmp/rollback-dryrun.sql
docker cp docs/verification/phase-2-remediation-testdata-cleanup.sql afrakala-lan-db:/tmp/cleanup.sql
docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala \
  -v ON_ERROR_STOP=1 -v downfile=/tmp/cleanup.sql -f /tmp/rollback-dryrun.sql
```

```
                   marker                    | public_functions | already_in_txn
---------------------------------------------+------------------+----------------
 >>>> STATE BEFORE (outside any transaction) |              835 | f
(1 row)

BEGIN
 >>>> running the down file inside a transaction we control

SET
SELECT 50            <- _stress_receipts  : the 50 receipts
SELECT 50            <- _stress_entries   : their 50 journal entries
DO                   <- safety gate passed (refuses on anything but exactly 50 / 50)
ALTER TABLE          <- DISABLE TRIGGER trg_journal_line_immutable
ALTER TABLE          <- DISABLE TRIGGER trg_journal_entry_immutable
DELETE 100           <- journal_lines
DELETE 50            <- journal_entries
ALTER TABLE          <- ENABLE TRIGGER trg_journal_entry_immutable
ALTER TABLE          <- ENABLE TRIGGER trg_journal_line_immutable
SELECT 1             <- _credit_backout: one person affected
DELETE 50            <- customer_credit_ledger
UPDATE 1             <- customer_credit_balance decremented
DELETE 50            <- payment_receipts  (migration 353's guard live, and it passed)
 burn_document_number
----------------------

(1 row)               <- M5: RCP-1405-000051 burned

                         marker                         | still_in_txn
--------------------------------------------------------+--------------
 >>>> down file completed; still inside the transaction | t
(1 row)

ROLLBACK
                       marker                        | public_functions
-----------------------------------------------------+------------------
 >>>> STATE AFTER ROLLBACK — must equal STATE BEFORE |              835
(1 row)
```

`835 = 835` and `still_in_txn = t`, with no "there is no transaction in progress" warning: the file
kept its hands off the transaction boundary, and the dry run discarded everything.

### Expected before / after — measured, not estimated

Measured by running the cleanup inside a transaction, taking a census on both sides, and rolling
back. These are the numbers the owner should see when they run it for real.

| Metric | Before | After |
|---|---|---|
| `payment_receipts` where `description='PHASE2_STRESS_do_not_keep'` | 50 | **0** |
| `payment_receipts` total | 57 | **7** |
| Their `journal_entries` | 50 | **0** |
| `journal_entries` total | 51 | **1** |
| `journal_lines` total | 102 | **2** |
| `customer_credit_ledger` rows for those receipts | 50 | **0** |
| `available_credit` for person `f144680e-…` | 50,000.00 | **0.00** |
| `held_credit` for person `f144680e-…` | 0.00 | 0.00 |
| **`asan_list_bank_deposit_export('2026-01-01','2027-12-31')` rows** | **51** | **1** |
| `document_numbers` doc_type `receipt`, total | 51 | 51 |
| — of those, `burned_at IS NOT NULL` | 0 | **51** |
| — of those, `burned_at IS NULL` (live) | 51 | **0** |
| `RCP-1405-000051` burned (M5) | false | **true** |

Two consequences, recorded rather than hidden:

- **All 51 receipt serials end up burned and the series resumes at `RCP-1405-000052`.** No number is
  deleted — the burn columns exist for exactly this, and Gate A m3 objected to numbers being removed
  by hand. On a test database that is the honest outcome. Production has its own database, its own
  series, and is untouched.
- **`audit_logs` is deliberately not touched.** The 50 `receipt_created` and 50 `credit_payment` rows
  stay. The stress test really did happen, and an audit trail edited to hide activity is worse than
  one that references a deleted document. Nothing joins `audit_logs` to `payment_receipts` by foreign
  key, so nothing breaks.

### Does the cleanup script cover M5?

**Yes.** Step 4 of the script is M5:

```sql
SELECT public.burn_document_number(
         'receipt',
         '8141b507-3905-4c2e-918f-a05b81b510c0'::uuid,
         'آزمون هم‌زمانی فاز ۲؛ سندی برای این شماره ثبت نشد');
```

It **burns** the number rather than deleting it, which is what Gate A M5 asked for. Confirmed by the
census: `RCP51_burned` goes `false → true`. So one hand-run closes both M4 and M5; there is no
separate command for M5.

### THE COMMAND THE OWNER MUST RUN — by hand, on the test computer

Run from `D:\AfraKalaTest\app` in PowerShell on the **test computer**. This is the test database
(`afrakala`), never production (`postgres`).

```powershell
$pw = (Select-String -Path deploy\lan\.env.lan -Pattern '^POSTGRES_PASSWORD=').Line -replace '^POSTGRES_PASSWORD=',''

docker cp "docs\verification\phase-2-remediation-testdata-cleanup.sql" afrakala-lan-db:/tmp/cleanup.sql

docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala `
  -v ON_ERROR_STOP=1 --single-transaction -f /tmp/cleanup.sql
```

`docker cp` is mandatory — the file contains Persian, and piping Persian SQL through PowerShell
replaces every non-ASCII byte with `?`. That is the mistake that destroyed the Persian text inside
44 database functions on 2026-07-11 (CLAUDE.md, database safety rule 1).

`--single-transaction` with `-v ON_ERROR_STOP=1` is mandatory too: if any step fails, the two
immutability triggers come back with the rollback rather than being left disabled on a shared
database.

**Expected output** — the same statement tags as the dry run above, ending with the
`burn_document_number` row, and **exit code 0**. Ignore a PowerShell exit code of 1 caused purely by
`NOTICE:` lines on stderr (CLAUDE.md, "Note on PowerShell") and verify the real outcome with the
check below.

**Confirm it worked:**

```powershell
docker cp "docs\verification\phase-2-remediation-verify-cleanup.sql" afrakala-lan-db:/tmp/vc.sql
docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala -f /tmp/vc.sql
```

Expect `stress_receipts = 0`, `stress_journal_entries = 0`, `journal_entries_total = 1`,
`receipt_numbers_live = 0`, `RCP51_burned = t`, and — the one that matters to the accountant —
`asan_export_rows = 1`.

**If the safety gate refuses**, with `expected 50 stress receipts and 50 stress entries, found X and
Y`: stop. It means the shared test database moved under the script — another mission's work, or a
partial earlier run. Re-take the census before doing anything else. Do not edit the gate to make it
pass.

**Until this is run, M4 and M5 stay open**, and the accountant's export at `/admin/asan-export`
continues to show 50 fabricated bank deposits of 1,000 Toman as clean and submittable.

---

## 4. Defect-by-defect status — all 16

Severities are Gate A's. "Closed" means the object was changed *and* verified live, or the document
was corrected. "With owner" means the fix is a business decision, not an engineering one.

| # | Sev | Defect | Status | Evidence / reason |
|---|---|---|---|---|
| **B1** | BLOCKER | Cash receipt exported to Asan as a bank deposit with a fabricated bank reference | **CLOSED** | Both halves fixed. **350** adds `document_channel NOT IN ('cash','cheque')` to `asan_list_bank_deposit_export` — verified in the live `pg_get_functiondef` — per the owner's answer (c): cash and cheque go to Asan by hand. **351** makes `create_receipt` require `bank_accounts.account_type='cash'` for `p_channel='cash'` and `'bank'` for `'bank'`, so channel and account can never disagree silently — both gates verified live. Recorded in the contract, §1 step 4. **Consequence to know:** no `account_type='cash'` row exists on the test database, so cash receipts are refused until the owner creates the صندوق. That is B1's second half working, not a regression. |
| **M1** | MAJOR | The same money settles a proforma *and* becomes spendable credit; `hold_credit` spends it again | **WITH OWNER → OG-17** | Raised as OG-17 above with Gate A's reproduction (62,200,000 → 61,200,000 outstanding; 0 → 1,000,000 available; `hold_credit(1,000,000)` succeeded) and confirmed statically at `351:542`. Not fixed: the correction depends on what `available_credit` is defined to mean. Must be answered before phase 6 wires the RPC. |
| **M2** | MAJOR | The contract told the front end retry was safe; a retry is a second permanent document | **CLOSED** | `rpc-contracts.md` corrected in three places — Conventions `23505` row, Conventions **Idempotency** (rewritten with the measurement and the four client-side rules), §5 items 1 and 5 — plus a banner at the top of §5 for cached copies. §1 already said the right thing; the contradiction is gone. |
| **M3** | MAJOR | OG-13 recorded closed; two of its four surfaces still carried the old answer | **CLOSED** | **352**. Surface 2: `document_numbers_select_finance` now `admin, accountant, manager` — verified in live `pg_policies`. Surface 4: `role_permissions('ledger-documents','manager')` now `can_view=t, can_create=t` and everything else `f` — verified live. All four surfaces now carry answer (a). OG-13 is genuinely closed. |
| **M4** | MAJOR | 50 stress receipts are exportable documents on `/admin/asan-export` | **OPEN — awaiting the owner's hand-run** | Script written, dry run passes (real output in §3), before/after measured, exact command documented. Confirmed still live this session: 50 receipts, all posted, all in the export; export returns 51 rows where it should return 1. 350 does not hide them — they are `document_channel = NULL`. |
| **M5** | MAJOR | `RCP-1405-000051` — a committed, unburned number with no document behind it | **OPEN — same hand-run** | Confirmed live: `receipt_behind_it = 0`, `burned_at` NULL. Covered by step 4 of the same cleanup script, which **burns** it rather than deleting it (per m3's objection). Census shows `false → true`. No separate command. |
| **M6** | MAJOR | `create_receipt` accepts any `p_payment_date` and posts an immutable entry on it | **CLOSED** | **351** adds two bounds, refused separately so the message names the rule: `p_payment_date > tehran_today()` rejected, and `jalali_year(p_payment_date) < jalali_year(tehran_today()) - 1` rejected. Both verified in the live function body. Recorded in the contract, §1 step 2 and §5 item 7. The one-year window exists so an accountant entering a 29 Esfand receipt on 2 Farvardin is not pushed back to the legacy form. **Not done:** mirroring the bounds into `create_payment` / `create_dual_document` — those functions do not exist yet; it belongs to phases 3 and 4. |
| **M7** | MAJOR | The recorded proof that the rollback files run cannot have happened as written | **CLOSED** | `docs/verification/rollback-dryrun.sql` now defines the rule — *a rollback file contains statements only; the caller owns the transaction* — and its header records the mechanism Gate A measured (inner `COMMIT` commits the outer transaction; both markers survived). 350-down through 353-down all comply. The harness proves itself on every use: `public_functions` 835 → 835 across the run in §3. |
| **M8** | MAJOR | Deleting a receipt leaves an orphaned immutable posted entry and inflated credit | **CLOSED as a stopgap; root cause is OG-14** | **353** adds `BEFORE DELETE` trigger `trg_payment_receipts_block_delete_when_posted` on `payment_receipts`, refusing with `P0001` when a posted `journal_entries` row references the row — so the orphan can no longer be created. Trigger and function both verified live. This is a guard, not a cure: the real fix is `reverse_document`, which is **OG-14** and must close before phase 9 (Gate A argues before phase 6). |
| **m1** | MINOR | `pr_insert_admin_accountant` lets an accountant write an `approved` cheque receipt directly, bypassing `create_receipt` | **OPEN** | Not addressed. Gate A's own recommendation is to re-record the risk with the correct reason and tighten the policy at task 6.9, the way `journal_entries`' write policies went in 346. Deliberately not done here: narrowing a live `INSERT` policy is a behaviour change outside this remediation's scope, and D12 accepts the legacy path until 6.9. **Carry to phase 6.** |
| **m2** | MINOR | A manager is refused by `post_receipt_accounting` — the fifth surface of M3 | **CLOSED by record** | Gate A offered two resolutions: fold it into M3's migration, *or* record explicitly that `post_receipt_accounting` keeps the narrower boundary because it is the retiring path. **352 takes the second**, and its header says so: the function is retired at task 6.9 (D12) and widening a path that is about to be deleted would leave one more surface to unpick. Not reachable through the UI — the button is gated on `admin`/`accountant` at `_app.accounting.receipts.$receiptId.tsx:214`. |
| **m3** | MINOR | `blocked_reason` shows the raw English `cheque_receivable` inside a Persian sentence | **OPEN** | Not addressed. The fix is to seed `asan_control_accounts` with a `label_fa` for every `account_kind` in the CHECK, even where `accounting_code` stays NULL. That table is phase 5's (Asan exports live), and seeding it needs the owner's Asan codes to be worth doing once. **Carry to phase 5.** D16 makes Persian messages part of the contract, so this must not be forgotten. |
| **m4** | MINOR | Contract step 8 claimed `p_attachment_ids` binds attachments; the function raises `0A000` | **CLOSED** | §1 step 8 rewritten with the mechanism (`document_attachments.document_id` is `NOT NULL`; `validate_document_attachment_ref` is a `BEFORE INSERT` existence trigger, so the row cannot precede its document), the `NULL`/`[]` semantics, and the phase-6 decision it leaves open. `0A000` added to the Conventions table and as §5 item 6, and to the signature comment. `raises_0A000 = t` verified in the live function. |
| **m5** | MINOR | Contract said the tracking number is minted for every non-`bank` channel | **CLOSED** | §1 step 4 and the signature comment now say the caller's value is honoured and `INT-<doc_number>` is minted only as a fallback. Verified live: the function contains both `_tracking := NULLIF(btrim(coalesce(p_tracking_number, '')))…` and `_tracking := 'INT-' \|\| _doc_number`. |
| **m6** | MINOR | Contract said `auth.uid()` is NULL in psql and these functions must never be invoked | **CLOSED** | Replaced with the CLAUDE.md rule 7 JWT-simulation recipe plus `SET LOCAL ROLE authenticated` for RLS, and a note that the advice it replaced ("replicate the body") is the anti-pattern that let phase 1's blocker through three reviewers. Disproved again in this session: every measurement above, including the export census, ran by setting `request.jwt.claims` in psql. |
| **m7** | MINOR | `bank_name` and `receipt_time` are never written; `get_receivable_detail` reads `bank_name` | **OPEN** | Not addressed. Requires deciding which of `bank_name` / `source_bank` is canonical and changing `get_receivable_detail` or the writer to match. That is a front-end-visible data-shape decision that lands in phase 6's wizard either way. **Carry to phase 6.** |

**Totals: 10 closed, 1 with the owner (OG-17), 5 open** — of which M4 and M5 need only the owner's
hand-run, and m1, m3, m7 are deliberately carried to the phase that owns the surface.

---

## Verification

| Command | Result |
|---|---|
| `npx tsc --noEmit` | 70 errors — the D14 baseline, unchanged. No TypeScript was touched by this remediation. |
| `npm run build` | not run — no application code changed; this remediation is SQL and documentation only. |
| `npm run lint` | not run — no touched file is linted (`.sql`, `.md`). |
| tests | **there is no test script in this project.** Behaviour was verified by invoking the live objects from psql under simulated JWTs inside `BEGIN … ROLLBACK`. |

## Self-Host Acceptance Check

No CDN, no online font, no external API, no non-self-hostable service. Four SQL migrations against
the project's own Postgres and edits to two Markdown files. Nothing added to `package.json`. No
secret in any committed file — the database password is read from `deploy/lan/.env.lan`, which is
untracked, and is never printed.

## Remaining manual steps — a human must do these

1. **Run the cleanup script** (§3, "THE COMMAND THE OWNER MUST RUN"). Until then M4 and M5 are open
   and the accountant's Asan export shows 50 fabricated deposits as clean.
2. **Answer OG-17.** Blocks phase 6.
3. **Answer OG-14** (`reverse_document`). 353 is only a guard; Gate A argues the real fix must land
   before phase 6, not phase 9.
4. **Browser check of `/admin/asan-export`** after the cleanup — confirm the page shows one row, not
   51. No agent can do this.
5. **Confirm cash receipts.** Once the owner creates a `bank_accounts` row with
   `account_type='cash'` (the صندوق), re-test a cash receipt end to end. Until that row exists, B1's
   second half means every cash receipt is correctly refused.
6. **Carry forward:** m1 → phase 6 (task 6.9), m3 → phase 5, m7 → phase 6.
