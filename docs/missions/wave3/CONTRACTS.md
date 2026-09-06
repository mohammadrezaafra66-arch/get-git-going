# CONTRACTS — Wave 3 (overdue gate · score period · aging · navigation · hygiene)

Orchestrator-owned. Specialists read it; only the orchestrator writes the progress ledger, and only
from verified returns.

## Stage-0 ground truth, measured 2026-09-05

| Check | Measured | Verdict |
|---|---|---|
| `origin/staging` tip | `1691aeca` | — |
| `APP_GIT_SHA` on the running container | `1691aeca`, built `2026-09-05T21:50:18` | **equal — Q-0 passes** |
| `feature/wave2-agentW` | ancestor of `origin/staging` | **merged** |
| Wave 2's supplier Asan search live? | the exact new placeholder «شهر یا کد آسان» is present in `/app/.output/public/assets/_app.suppliers-CdrMu_yL.js` **and** the SSR bundle | **live — verified in the running build, not inferred from git** |
| Main tree branch | `staging`, clean but for untracked `.ship-state.json` and `docs/missions/` | not switched by anyone |

**Prior art: 5 of 6 present.** `docs/research/unwired-inventory-20260905.md` is **absent from the
working tree** — it exists only inside commits `c8a96bb8` / `b9fb5cb3` (i.e. inside PRs #391/#396).
The brief already rates it hypothesis-only, so this blocks nothing; recover with
`git show c8a96bb8:docs/research/unwired-inventory-20260905.md` if needed.

**e2e directories that actually exist** (`e2e/sales/` does **not**, confirming wave 2):
`persons` 33 · `security` 24 · `scoring` 4 · `capital` 1 · `business-flows` 9.
Baseline scope for this wave adds `business-flows`, because Group Y touches receivables/payables.

## Migration allocation — take only your own, and only in your row's order

True maximum at allocation time: **number 453**, ledger `max(version) = 20260905183000`, staging's
last file `20260905183000_453_credit_customers_report_uncomputed_as_null.sql`. (The `_452_` that a
whole-history scan shows at that same timestamp is the pre-rename add of the same file — one 452
exists, at `20260905180000`.)

| Agent | Numbers | Timestamp prefixes |
|---|---|---|
| Agent X | 454, 455, 456 | `20260905220000`, `20260905221500`, `20260905223000` |
| Agent Y | 457, 458, 459 | `20260905224500`, `20260905230000`, `20260905231500` |
| Agent Z | 460 | `20260905233000` (expected unused — Z is frontend) |

Do not re-derive. Do not take a number outside your row. Push the branch the moment a migration is
applied (rule 6 — four migrations have already lived only in temp worktrees this week).

## Worktrees — all from `origin/staging` @ `1691aeca`

    …/631fa7ea…/wt/agentX   feature/wave3-agentX
    …/631fa7ea…/wt/agentY   feature/wave3-agentY
    …/631fa7ea…/wt/agentZ   feature/wave3-agentZ

`git stash` is forbidden in all of them — the stack is shared process-wide and an agent already
surfaced someone else's entry this week.

## The `HubItem` shape for Z-2 — quoted from wave 2, `src/components/finance/FinanceHub.tsx:111-115`

```tsx
{
  to: "/sales/customers",
  label: "مشتریان",
  target: { kind: "registry", route: "/sales/customers" },
},
```

Z-2 uses **this** shape with `/admin/persons-cleanup`. The registry entry at `:1275` is `admin`-only;
`isNavigationEntryPermitted` is what enforces it. **Measure a `sales` and a `viewer` session — the
brief warns `has_dynamic_permission` grants every role when no `role_permissions` row exists.**

## X-1 finding — written once, consumed by the builder and the verifier

**STATUS: REPORTED 2026-09-05 — VERDICT `PROCEED (wiring)`. Nothing is built. The halt condition did NOT fire.**

Overdue is already computed, already correct, and already **enforced in one path**. The only broken
link is that the two credit RPCs read `has_overdue` from the empty `customer_credit_profile` instead
of from the live view.

### The source

`public.vw_customer_receivables.is_overdue` — answers for **91/91** customers (no row = not overdue).
Today: 8 rows, 7 overdue, **3 distinct customers** — `مشتری آزمایشی 11`, `مشتری آزمایشی 17`,
`شخص آزمایشی 20`.

    semantics:  due_date IS NOT NULL AND due_date < tehran_today() AND outstanding_amount > 0
                due_date  = (accepted_at + settlement_types.days)::date
                outstanding = GREATEST(final_amount - confirmed_paid, 0)
                over status='accepted' quotes with approved/verified/confirmed/posted receipts

Single-level view, not a view-over-view. The `customer_id` predicate **pushes down to
`Index Scan using idx_sales_quotes_customer_id`**; `cost=35.87`, **0.810 ms**, 70 buffers. The
whole-table aggregate `list_trusted_credit_customers` already performs costs **1.256 ms**.

### The wiring — a finished gate nobody calls

`public.can_issue_customer_invoice(uuid)` is byte-for-byte the needed per-customer check and **has
zero callers**. Either call it, or inline its body:

```sql
SELECT NOT ci.can_issue, ci.oldest_due_date
  INTO v_has_overdue, v_overdue_since
FROM public.can_issue_customer_invoice(p_customer_id) ci;
```

`calculate_customer_realtime_credit` already has its `IF v_has_overdue THEN … binding_constraint='overdue'`
branch; `get_customer_dynamic_credit` already returns `has_overdue`/`overdue_since` and
`create_sales_quote_with_items` **lines 194-206 already raise** «مشتری مانده معوق دارد…» with a
salesperson-commitment exception path. **Wiring one function fixes the quote gate with no change to
the quote path.** Nobody needs to design the gate — it has never fired.

### Commercial impact: **ZERO customers newly refused**

All five customers with `final_limit > 0` at 2026-08-31 return `can_issue = true`, `overdue_count = 0`
(حانیه ماهرو · مشتری آزمایشی 6 · مشتری آزمایشی 3 · مشتری آزمایشی 10 · محمدرضا تست 2). All three
genuinely-overdue customers already have `final_limit = 0`. **The overdue set and the funded set are
disjoint.**

⚠️ **One caveat the owner must hear.** Quote `SQ-2026-000233` (106,300,000 rial, due 2026-08-29,
overdue) carries `customer_name = 'محمدرضا تست 2'` — the name of a funded customer — but its
`customer_id` **and** `customer_person_id` are both NULL, and `sales_quotes.customer_name` is a proven
unreliable snapshot (three quotes on one customer carry three different stale names). The link cannot
be established from the data. **If that quote is ever re-linked, محمدرضا تست 2 becomes the one
customer newly refused, losing a 161,825,459 rial limit.**

### Blind spot, quantified — this is NOT fixed by X-2

**700,800,000 of 1,679,300,000 outstanding (41.7%) is invisible to the view:** 2 accepted quotes with
NULL `customer_id` (637,800,000) and 1 row with NULL `due_date` (63,000,000). The second is exactly
**Y-2's defect**. `sales_quotes.customer_person_id` recovers nothing — measured
`customer_id IS NULL AND customer_person_id IS NOT NULL` = **0**.

### Contradictions with the dispatch — all four matter

1. **The quote path is not merely blind, it is fully built and waiting.** Design nothing.
2. **`list_trusted_credit_customers` does not merely aggregate — it enforces.** `overdue_count > 0`
   forces `computed_allowed_credit = 0`, `is_trusted = false`, `status_code = 'overdue'`. So the
   trusted-list screen is **not** blind; only the two RPCs are. **The system currently gives two
   different answers for the same customer.**
3. **"the three writers are unreachable" is the wrong mechanism, and the truth is worse.**
   `update_customer_overdue_status` and `recalculate_settlement_score` are reachable and grantable —
   **migration 331 gutted their bodies** (`v_overdue_since := NULL` hardcoded, loop emptied). If either
   is ever called it **INSERTs a `has_overdue = false` row**. A populated table of hardcoded `false`
   would actively defeat any wiring that still reads it. **This is the decisive argument for wiring to
   the view rather than backfilling the table.**
4. **The view's role guard fails OPEN** — `WHERE auth.uid() IS NOT NULL AND NOT is_viewer_only(auth.uid())`.
   A failed guard yields zero rows, which reads as "not overdue", not as an error. Both RPCs do their
   role check before this point, so it passes today; whoever wires it must not let that change.

Minor: the two RPCs read `customer_credit_profile` by **different keys** (`customer_person_id` vs
`customer_id`); wiring to the view removes that inconsistency from the overdue path.
`status='accepted'` is complete — the enum is `draft, sent, accepted, rejected, canceled`, no
`invoiced` state is being missed.

## Progress ledger — orchestrator only, from verified returns

| Row | Agent | State | Evidence |
|---|---|---|---|
| X-1 | X | **done** | PROCEED (wiring); source `vw_customer_receivables`, gate `can_issue_customer_invoice` already exists unused; **0 customers newly refused** |
| X-2 | X | **done** | migration 454; 3 customers move `binding_constraint` formula->overdue; **0 `final_limit` / `available_credit` movers**; spec red 4/1 -> green 5/5 |
| X-3 | X | **done** | migration 455, `resolve_score_period` as the single definition; 5 customers recover a July score, month labelled |
| X-4 | X | **done** (investigate) | 77/91 unassigned = mostly a data gap **plus** one code path that should not depend on it |
| Y-1 | Y | **done** | debt is `total_amount`; +2,000,000,000 on one row; EXCEPT both ways = exactly that row |
| Y-2 | Y | **done** — premise corrected | the total DID add up; the real defect was date-range filtering losing 63,000,000 |
| Y-3 | Y | **done** — premise false | migration 423 closed both routes on 2026-09-04; the view still ENCODED the old behaviour |
| Z-1 | Z | **done** | existing highlight widened, not duplicated; section key `subgroup ?? group`; browser screenshot; 44/44 navigation tests |
| Z-2 | Z | **done** | exact wave-2 `HubItem` shape, `registry.ts` untouched; accountant/manager probe replaces a vacuous sales/viewer one |
| M-1 | orchestrator | **done** | PR **#399** opened from the existing clean branch; live `pg_get_functiondef` diff identical to the file |
| M-2 | orchestrator | **done** | file-by-file inventory below; #396 holds nothing of unique value |

`dispatched = done + failed + blocked` must reconcile against **11**.


## M-1 — migration 437 rescued. **Deviation from the brief, stated.**

M-1 asked for a fresh `feature/*` branch carrying 437's file "and nothing else". Measured first:
**a clean branch already existed** — `feature/customer-asan-code-identifier`, three commits, and
`git diff --name-only` against staging shows **zero sweep debris** (no `ship.ps1`, no
`pw.session.config.ts`, no `.ship-state.json`, no 1100-line research doc). Creating a third copy of
the same migration file is precisely the duplication that produced this mess, so the existing branch
was used.

    7559774c  the migration + 437-down.sql + asan-code.ts + CustomerForm + SupplierForm + edit route
    23103d5f  CustomerForm (prettier only)
    64a7cd95  PROGRESS.md

A first read of `git diff origin/staging <branch>` looks alarming — 61 files, 3972 deletions — but
that is the branch being **behind**, not reverting anything: `git rev-list --count` is **3**. A PR
merges three commits.

The frontend half is kept with the migration deliberately: 437 fixes the **create** path in the RPC,
`CustomerForm`'s edit branch fixes the **edit** path. Shipping the migration alone would let a
customer's Asan code diverge again on the first edit.

**Verification M-1 required:** `pg_get_functiondef(person_create_inline)` on the live test database
diffed against the branch's file — **identical** after normalising whitespace and the explicit casts
`pg_get_functiondef` adds; the live body carries the three `437` markers.

**PR #399 opened**, `mergeable: MERGEABLE`, `mergeStateStatus: BLOCKED` — blocked on the required
status check that is red at baseline (the 70 typecheck errors), which is the documented `--admin`
situation. **Not merged; that is the owner's call.**

## M-2 — what PRs #391 and #396 actually contain

### PR #391 · `feature/auto-20260905-1746` · title "feat(customers): allow editing asan code on customer form"

| file | +/- | verdict |
|---|---|---|
| `supabase/migrations/20260905163000_437_…sql` | 294+ | **unique value — now rescued by #399** |
| `docs/verification/437-down.sql` | 190+ | **unique value — in #399** |
| `src/lib/persons/asan-code.ts` | 70+ | **unique value — in #399** |
| `src/shared/components/CustomerForm.tsx` | 44+/6- | **unique value — in #399** |
| `src/shared/components/SupplierForm.tsx` | 1+/60- | **unique value — in #399** |
| `src/routes/_app.sales_.customers_.$customerId.edit.tsx` | 3+ | **unique value — in #399** |
| `docs/research/unwired-inventory-20260905.md` | 1100+ | prior art, **not on staging**, exists only here and in #396 |
| `scripts/ship.ps1` | 320+ | the cause of the confusion |
| `pw.session.config.ts` | 7+ | debris |
| `.gitignore` | 8+ | debris |

**If closed unmerged, nothing of value is lost** — every valuable file is now in PR #399, except the
1100-line research doc, which also sits in #396.

### PR #396 · `feature/auto-20260905-1928` · title "chore: add ship automation script and session config"

| file | +/- | verdict |
|---|---|---|
| `supabase/migrations/20260905183000_452_credit_customers_report_uncomputed_as_null.sql` | 271+ | **STALE DUPLICATE.** The same work is on `staging` as **453**. Merging this puts it there twice, under a number already taken by `20260905180000_452_retire_parameter_weight_backups_by_rename.sql` |
| `docs/verification/452-down.sql` | 149+ | stale — staging has `453-down.sql` |
| `src/routes/_app.sales.credit-customers.tsx` | 73+/10- | already merged via PR #397 |
| `docs/research/unwired-inventory-20260905.md` | 1100+ | duplicate of #391's copy |
| `scripts/ship.ps1` | 386+ | debris |
| `.ship-state.json` | 5+ | debris |
| `pw.session.config.ts` | 7+ | debris |

**#396 contains nothing of unique value beyond the research doc, and merging it would be actively
harmful** — a second file for work already on staging, numbered 452, colliding with the real 452.


## Stage-0 Playwright baseline — measured for THIS wave

`npx playwright test e2e/persons e2e/security e2e/scoring e2e/capital e2e/business-flows`
(config is already `workers: 1`):

    394 total -> 369 passed, 22 failed, 3 skipped, 12.9 min

**This is the bar Stage 4 must not fall below.** Wave 2's comparable figure was 365/346/16 over four
directories; the 29 extra tests and 5 of the extra failures come from adding `business-flows`, plus
one further failure in `persons/person-profile.spec.ts:121`.

⚠️ **Caveat, stated because Stage 4 compares against this number.** The baseline ran **while three
specialists were working against the same database and the same app server.** CLAUDE.md records that
business data moves under tests on this shared machine. Treat any single-run difference at Stage 4 as
a signal to re-measure, not as proof of a regression.

### Two baseline failures are directly in Agent X's blast radius — and that is an opportunity

    e2e/business-flows/212-quote-credit-guard.spec.ts:607
      "Requirement 212 credit guard and permitted exceptions are enforced through UI and API"
    e2e/business-flows/213-dynamic-customer-credit-scoring.spec.ts:486
      "Requirement 213 dynamic customer credit scoring and recompute is proven end-to-end"

212 tests the very gate X-2 is wiring, and it is **red today** — consistent with X-1's finding that
the gate has never fired. If X-2 turns it green, that is a far stronger red-before/green-after proof
than any test the agent writes for itself. Agent X was told to check both.

The `og81-migration-ledger-matches-disk` failures remain, and PR #399 removes one of their causes
(migration 437's file reaching `staging`). Four older mismatches predate this week.


## Owner instructions executed 2026-09-05 — hygiene

**1 · PR #399 merged** at `2026-09-05T17:26:53Z`. Verified before relying on it:
`supabase/migrations/20260905163000_437_inline_create_registers_asan_identifier.sql` is on
`origin/staging`, and `schema_migrations` holds `20260905163000`. **Ledger and disk agree for 437.**

**2 · Rescue then close.**
`docs/research/unwired-inventory-20260905.md` was **absent from the working tree** — the note calling
it "untracked, main tree only" is stale; `ship.ps1` swept it into a commit and it never returned. Both
bundle copies are byte-identical (1100 lines, md5 `4d781a361335e6af4130c92b1b5e53cf`), so there was no
ambiguity. Rescued to `docs/rescue-unwired-inventory`, re-checked against its source after writing
(same md5), carrying that one file and nothing else. **PR #401 opened, not merged.**

Then, in order: **#391 CLOSED** unmerged ("code is on staging via #399, research doc rescued in
#401"), **#396 CLOSED** unmerged ("stale duplicate of migration 453 under the old number 452, which
would put the same work on staging twice").

**3 · The `ship.ps1` deletion PR cannot be written — there is nothing on `staging` to delete.**

    scripts/ship.ps1        NOT on staging · absent from the working tree entirely
    .ship-state.json        NOT on staging · present locally but UNTRACKED
    pw.session.config.ts    NOT on staging · absent locally

The only branches that ever carried `ship.ps1` were `feature/auto-20260905-1746` (#391) and
`feature/auto-20260905-1928` (#396) — **both closed above**. Closing them already achieved what the
deletion PR was for: the script can no longer reach `staging`. A PR "deleting both files" would have
to add them first.

No **scheduled task** references it (`Get-ScheduledTask` filtered on `ship`: none), no git hook is
active, and the only repo mention is an incidental `git status` paste inside
`docs/research/scoring-engine-zero-parameters-20260905.md`. **Nothing was disabled.**

`.ship-state.json` is untracked in the **shared** main tree and was left alone — deleting another
agent's local state unilaterally is not the orchestrator's call.

⚠️ **The one real remaining gap:** `staging`'s `.gitignore` has **zero** entries matching `ship` or
`pw.session`, so nothing prevents the next sweep from re-adding these files. PR #391 carried the
ignore lines (`.ship-state.json`, `.ship.log`, `.shipmsg`) and they died with it. A one-file
`.gitignore` PR would close this; **not opened, because it is not what was asked for.**

## Superseded finding — recorded at the owner's instruction

The earlier statement that **"7 of 8 receivable rows are overdue, so the gate bites immediately"**
described **rows, not customers**, and was **wrong about the business effect**. It originated in
`allocation-workbench-findings-20260904.md` F19 line 437 and was repeated into this wave.

**The measurement that supersedes it**, taken by the orchestrator independently of Agent X, running
every one of the 91 customers through `can_issue_customer_invoice` under a simulated authenticated
JWT (necessary because the view's guard **fails open** — without a JWT it returns zero rows, i.e. a
false "not overdue"):

    customers_total | gate_refuses | funded_today | NEWLY_REFUSED
                 91 |            3 |            5 |             0

    مشتری آزمایشی 11   ceiling 0   1 overdue    62,200,000   already refused today
    مشتری آزمایشی 17   ceiling 0   1 overdue   500,500,000   already refused today
    شخص آزمایشی 20     ceiling 0   3 overdue   415,800,000   already refused today

7 overdue **rows** resolve to **3 customers**, and all three already hold a zero ceiling. The overdue
set and the funded set are **disjoint**. **Enabling the gate refuses 0 new customers today.**
This is the figure that belongs in the completion report.

The single caveat stands: quote `SQ-2026-000233` (106,300,000 rial, overdue) carries the *name* of a
funded customer but has NULL `customer_id` **and** NULL `customer_person_id`, and that name column is
a proven-unreliable snapshot. If it is ever re-linked, that customer becomes the one newly refused,
losing a 161,825,459 rial ceiling.

## Prior-art correction, third of its kind

`unwired-inventory-20260905.md` **F31** states that the guard of `log_invoice_issuance_blocked_overdue`
"relies on invoice data". The live body reads
`SELECT can_issue INTO v_can FROM public.can_issue_customer_invoice(p_customer_id)`, and that function
reads `public.vw_customer_receivables`. `to_regclass('public.invoices')` is NULL. The only `invoice`
strings in it are the `audit_logs` entity label.

**There was no contradiction between the two prior reports — they describe two different functions.**
`allocation-workbench-findings-20260904.md` F19 speaks about `can_issue_customer_invoice` and is
**correct**; the unwired entry speaks about the *logger* and is **wrong about it**.


## Agent Y returned — verified by the orchestrator, not taken on trust

Branch `feature/wave3-agentY`, three commits, **each touching exactly one file — its three allocated
migrations 457 / 458 / 459 and nothing else.** (A `git diff` against `staging` looks much wider; that
is the branch being behind, not files it touched. Checked commit by commit.)

All three ledger rows recorded: `20260905224500`, `20260905230000`, `20260905231500`.

### Y-1 — verified independently through the real RPC path

`get_payables_summary()` under a simulated authenticated admin JWT:

    total_outstanding  330,938,021,699.94      items_count 317
    buckets            293,846,836,075.00 + 37,066,180,624.95 + 25,004,999.99 = 330,938,021,699.94

Exactly the post-fix figure Agent Y reported, and the buckets sum to the total. The view's debt
expression now reads `ELSE COALESCE(p.total_amount, 0)`; `cash_price` survives only as an
informational column.

⚠️ **A weak test I nearly accepted, recorded so nobody repeats it.** Grepping the view definition for
`cash_price` returns a hit and *looks* like the fix failed. It does not — the column is still exposed
for display. Only reading the debt expression settles it.

⚠️ **And a second trap I walked into:** `vw_supplier_payables` and `vw_customer_receivables` both
return **zero rows** when queried as the `postgres` superuser without a JWT, and `authenticated`
cannot select them at all — they are reachable only through `SECURITY DEFINER` RPCs. A "0 rows" or a
"0 overdue" reading taken that way is a **false negative**, not a measurement.

**Y's extra finding on the quantity multiplier is the opposite of the briefed one.** The view has no
quantity term. `create_purchase` computes `total_amount := purchase_price * quantity` but stores
`cash_price` **as typed (per-unit)**, so the COALESCE was choosing between two different dimensions.
**0 rows** currently have both a `cash_price` and `quantity > 1`, which is the only reason this has
never been seen.

### Y-2 — the briefed defect was not the real one

**`total_outstanding` DID add up**: buckets `1,679,300,000` against a total of `1,679,300,000`, gap
**0**. `vw_customer_receivables` files a NULL due date under `'current'`, so no row is bucketless. The
briefed `1,616,300,000` is not a bucket sum — it is the total *once any date filter is applied*.

**The real defect is worse:** a range of `1900-01-01 .. 2999-12-31` lost 63,000,000, because
`due_date >= p_from_date` is NULL — not true — for a dateless row. Probe run twice: before `f`
(1,679,300,000 vs 1,616,300,000), after `t` (both 1,679,300,000). `EXCEPT` both ways over the 16
pre-existing columns unfiltered: **0 rows each way**. Only `SQ-2026-000005` moves, and only under a
date filter.

Bucketing deliberately untouched — migration 419 files NULL dates as `current`, and moving 63,000,000
out of `bucket_current` would change a number nobody asked about.

### Y-3 — **every premise in the row was false**, and the orchestrator confirmed it

Migration **423**, applied 2026-09-04 — one day before this wave — had already closed both named
routes. Measured directly, not via the agent:

    payment_terms.days                attnotnull = t          (briefed as nullable)
    payment_terms_days_check          CHECK (days >= 0)       (briefed as "days IS NULL OR days >= 0")
    purchases_payment_term_id_fkey    ON DELETE RESTRICT      (briefed as ON DELETE SET NULL)

What *was* still wrong is that the view still **encoded** the old behaviour (`ELSE p.purchase_date`),
unreachable only because of 423's constraints. Y proved it by relaxing the constraint inside a
rolled-back transaction — red: `is_overdue = t`, bucket `d31_60`; green: `due_date` NULL, bucket
`current`, reason `no_term_days` — and verified the simulation left no trace.

**A deliberate asymmetry, documented in the migration so nobody "corrects" it later:** Y did **not**
mirror 419's `inactive AND days = 0 -> no due date`. Here `days = 0` is the active cash term used by
**300 of 317** purchases; that rule would blank three hundred real due dates on one `is_active` toggle.

### Y's operational finding — worth more than one row

**`npx tsc` in a worktree with no `node_modules` silently reports 0 errors instead of failing.** An
agent taking its baseline in a fresh worktree is handed a fake **0** and then appears to "raise" it to
70. Y installed dependencies before trusting the number. Every future baseline in a fresh worktree
must do the same.

### Two things Y found and deliberately did not change

1. `pay_purchase_with_voucher` defaults its voucher amount to the same
   `COALESCE(_amount, cash_price, total_amount)`. That is a different question — what we choose to
   *pay* may legitimately be the cash price — and it accepts an explicit amount. Flagged, not changed.
2. **Ledger drift, pre-existing:** `20260903160000_422_document_register_view` and
   `20260904150000_424_bank_account_asan_code` are applied with **no ledger row**. Y did not record
   them, on the reasoning that it had not verified they are truly applied and that recording a row for
   an unapplied migration hides a genuinely pending one. **That judgement is correct and is left
   standing.**

## Correction to the orchestrator's own earlier report — `ship.ps1`

**I reported that a deletion PR "cannot be written because nothing is on `staging`". That was true
when measured and is now false.** Between that measurement and this one, `staging` moved twice:
PR #400 (`feature/ship-guards`) merged `c7715cac` "scope auto-commit to observed paths + concurrency
guard", and PR #402 (`chore/untrack-ship-state`) untracked `.ship-state.json`.

Current state on `staging` @ `5e5942be`:

    scripts/ship.ps1        TRACKED  (b9fb5cb3, then modified by c7715cac)
    pw.session.config.ts    TRACKED  (b9fb5cb3)
    .ship-state.json        already untracked by PR #402

**PR #403 opened**, deleting `scripts/ship.ps1` and nothing else. `.ship-state.json` needed no action;
`pw.session.config.ts` was left alone because the owner did not name it.

⚠️ **The PR body carries a conflict the owner must weigh:** PR #400 is active work making this script
*safer*, merged an hour before. Merging #403 discards those guards. Two live positions exist on this
file and #403 represents only one. Not merged.


## Agent Z returned — verified by the orchestrator

Branch `feature/wave3-agentZ` (`d5f7edc0`), two commits. Files touched: `FinanceHub.tsx`,
`AppSidebar.tsx`, `nav-items.ts`, and two e2e specs — **all within Z's ownership.
`src/lib/navigation/registry.ts` untouched**, as claimed. No forbidden file.

### Z-1
The existing highlight at `AppSidebar.tsx:216-249` is **untouched**; the submenu is now bracketed by
the `group`/`subgroup` the registry already carried, consuming the Persian labels that had been
sitting unused in the orphaned `nav-items.ts` — so that file became the live consumer instead of a
parallel module. **No second highlight mechanism.**

Design call, measured: the section key is `subgroup ?? group`, because grouping by `group` alone
leaves `admin` as **one section of 50** — the flat list it replaced. The same 50 split 22/15/8/5 by
subgroup.

### Z-2
Exact wave-2 `HubItem` shape with `{ kind: "registry", route: "/admin/persons-cleanup" }`; the
registry allowlist `["admin"]` mirrors the route's own `requireAnyRole(["admin"])`.

**Z found its own first test vacuous and replaced it** — `sales` and `viewer` are refused the hub
route outright, so testing them proves nothing about the button. The probe that actually exercises
the allowlist uses `accountant` and `manager`: both render the hub in full and still do not get the
button. That matters because `has_dynamic_permission` fails open at module level.

### Red before, green after
Same spec against two targets: deployed staging (`:3100`, this code without the change) → **4 of 8
red**; dev server on port 8137 → **8/8 green**. The 4 passing in both are role-gate controls.
Removing the hub item makes `finance-hub.spec.ts` fail with `hub is missing /admin/persons-cleanup`,
then restored byte-identically (md5-checked). Count 18 -> 19.

Gates: typecheck **70 with an error set identical to baseline**; build passes; lint clean on touched
files; **44/44** navigation tests including the five wave1c "reachable by clicking it in the sidebar"
tests — the real regression risk, since collapsing could have hidden those links.

## 🔴 SECURITY FINDING — pre-existing, outside Z's rows, confirmed by the orchestrator

**A `viewer` session navigating cold to `/admin/persons-cleanup` renders the page in full on
`staging`** — heading, **93 person rows, and their delete buttons**. `sales` identically.

Mechanism, verified structurally by the orchestrator independently of Agent Z:

    src/routes/_app.admin.persons-cleanup.tsx:559-560
        beforeLoad: async () => { await requireAnyRole(["admin"]); }
        -- and nothing else: no staticData.gate, no RouteRoleGate

    src/lib/rbac/route-guards.ts:86
        if (auth.rolesLoading || auth.profileLoading || auth.loading)
            return { user, roles: auth.roles };     <-- returns WITHOUT denying

During the role-loading window the guard fail-opens and the page renders, with nothing re-checking
after hydration.

This is the same hole documented at length in `_app.accounting.receipts.create.tsx`, whose comment
records it as affecting **150 route files** (62 `requireAnyRole`, 73 `requirePermission`, 15
`requireAdmin`) and as a standing Owner-Gate. That route defends itself with a `staticData` gate plus
a post-hydration client check; **`/admin/persons-cleanup` has neither**, and unlike most of the 150 it
exposes real person records and destructive controls.

Agent Z correctly **did not fix it** (shared RBAC code, not its row) and **did not encode it as
expected behaviour** — it is documented at the bottom of its spec. **This is the owner's call and is
the highest-risk item surfaced by this wave.**

## Two Z findings left as questions, not decisions

1. **The 28 wrong-module pages.** Z left the recorded `primary-modules.ts:135-147` decision alone.
   They highlight nothing false — no item prefix-matches, so nothing highlights. What is arguably
   false is the rail showing «داشبورد» as active, which is pre-existing and whose fix would reverse
   that recorded decision. Z's one guard: when no section matches, **all** sections open rather than
   none, so those 28 pages never land on an all-collapsed panel.
2. **Off-screen highlight.** No `scrollIntoView` added. Collapsing largely dissolves the problem —
   admin goes from 50 flat rows to 5 headings plus the open group's 15. Whether the residual case (a
   22-item open section) warrants scrolling is the owner's call.

## Z — not verified
The `/users` evidence screenshot failed on a cold-compile timeout; the behaviour is covered by a
passing automated test, so it was not re-shot. Full-repo `npm run lint` not run (legacy baseline).
Nothing ran against production; the shared `:3100` container was neither rebuilt nor restarted.

## Orchestrator measurement traps — three now, all producing FALSE ZEROS

1. `git show 'origin/staging:<path>'` in Git Bash on Windows mangles the colon path
   (`origin\staging;<path>`), the command fails, and a `grep -c` on the empty output returns **0**.
   **This produced two wrong findings in this wave** — first "ship.ps1 is not on staging", then
   "staging's .gitignore has no ship entries". Both were false. **Read the file from a worktree's
   disk instead.**
2. `vw_supplier_payables` / `vw_customer_receivables` return **zero rows** to the `postgres`
   superuser without a JWT, and `authenticated` cannot select them at all — they are reachable only
   through `SECURITY DEFINER` RPCs. A zero read that way is a false negative.
3. `npx tsc` in a worktree with no `node_modules` silently reports **0 errors** (Agent Y's finding).


## Two owner instructions, 2026-09-05 — one executed as a measurement, one held for Stage 4

### 1 · The `.gitignore` PR — NOT opened, because the lines are already there

Re-verified from a worktree's disk at `origin/staging` @ `5e5942be` (the reliable method, after the
`git show 'ref:path'` trap produced two false zeros in this wave):

    .gitignore:141  .ship-state.json
    .gitignore:142  .ship.log
    .gitignore:143  .shipmsg

Added by `c7715cac` ("feat(ship): scope auto-commit to observed paths + concurrency guard"), which
reached staging via PR #400. **The requested PR would be a zero-line diff.** The goal it was for —
these artefacts never being committable again — is already met. No branch was created and none was
pushed.

### 2 · Legacy pg_cron jobs — decision (b), HELD for Stage 4 as instructed

`cron.job` read from the **`postgres`** database, before any change:

    jobid | schedule    | database | username       | active | command
    ------+-------------+----------+----------------+--------+---------------------------------------------
        9 | 0 6 * * *   | postgres | postgres       | t      | generate_birthday_notifications()
       10 | */5 * * * * | postgres | postgres       | t      | recompute_all_employee_scores()
       11 | */5 * * * * | postgres | postgres       | t      | capture_score_snapshots()
       12 | 0 2 * * *   | postgres | postgres       | t      | cleanup_stale_auto_suppliers()
       20 | 30 22 * * * | afrakala | supabase_admin | t      | capture_score_snapshots()
       21 | 45 22 * * * | afrakala | supabase_admin | t      | refresh_all_sale_list_prices()
       22 | 0 23 * * *  | afrakala | supabase_admin | t      | sync_product_price_observatory_rows()

**The owner's description matches the measured reality exactly.** Jobs 9-12 are the legacy set on
`postgres`/`postgres`; jobs 20-22 are wave 1's on `afrakala`/`supabase_admin`.

**Planned action at Stage 4, before the deploy step:** unschedule **10, 11, 12**; leave **9**
(`generate_birthday_notifications`) alone; do not touch **20, 21, 22**. `cron.job` to be shown before
and after.

⚠️ **DATABASE EXCEPTION, to be restated in the completion report so nobody reads it as a rule
violation.** Every other operation in this project targets `afrakala` and never `postgres`. This one
is the exception, because **`pg_cron` lives in `postgres`** — that is where the `cron.job` table is
and where `cron.unschedule` must be called. Targeting `afrakala` here would do nothing.

Worth noting alongside: **job 11 duplicates job 20** — both run `capture_score_snapshots()`, the
legacy one every 5 minutes against the stale `postgres` copy, wave 1's nightly against `afrakala`.

**Job 12 (`cleanup_stale_auto_suppliers`) goes regardless of any other decision:** the owner declined
automatic supplier removal, and repointing that job at `afrakala` would start deleting real
suppliers. It currently fires daily at 02:00 against the stale `postgres` copy, so there is no
imminent harm to real data before Stage 4.


## Agent X returned — verified by the orchestrator

Branch `feature/wave3-agentX` (`b9c01b37`), 3 commits. Files all within X's ownership; no supplier,
navigation or aging file touched. Migration **456 unused** — X-4 was investigate-only, the number is
free. Ledger rows `20260905220000` and `20260905221500` both present.

### X-2 — verified
`can_issue_customer_invoice` is now called by both RPCs; no second copy of the predicate. On all 91
customers, `EXCEPT` both ways: **3 movers on `has_overdue` and `binding_constraint`** (formula ->
overdue), and **0 movers on `final_limit` and `available_credit`**. Invariant
`has_overdue == exists(overdue receivable)` — **0 mismatches**. `customer_credit_profile` still 0
rows. **Zero customers newly refused**, exactly as X-1 predicted.

**X caught a real defect in its own first draft, and it is the trap the brief warned about.**
`REVOKE EXECUTE … FROM anon` did **not** close anon — the grant comes from the bare `=X` PUBLIC entry
`acldefault()` puts on every function. Its own proof section still showed `anon_exec = t`. Fixed with
`REVOKE … FROM PUBLIC` **and** `FROM anon` plus explicit re-grants.

**Orchestrator's independent check with `has_function_privilege`:**

    can_issue_customer_invoice          anon f   authenticated t   service_role t
    get_customer_dynamic_credit         anon f   authenticated t   service_role t
    resolve_score_period                anon f   authenticated t   service_role t
    calculate_customer_realtime_credit  anon t   <- pre-existing, disclosed, NOT a regression

The last one X deliberately left alone. **Verified to fail closed:** its body carries an explicit
role gate — `has_role(v_caller,'admin') OR 'manager' OR 'accountant'` else
`RAISE EXCEPTION 'Forbidden'` — and `auth.uid()` is NULL for anon. Untidiness, not exposure.

### 212 / 213 — they cannot turn green, and not because of X
Both die in **fixture setup**, before any gate assertion: they insert into `customers` without
`person_id`, which is now `NOT NULL`. Identical failure before and after X's change, same line. X did
not touch either spec — correct.

**And the sharper point:** had 212's fixture run, it would have passed **for the wrong reason**. It
also seeds `customer_capital_allocations_dynamic.binding_constraint = 'overdue'`, and the quote gate
ORs that with `has_overdue` — so 212 never exercised the sensor X repaired. Giving those two fixtures
a `person_id` would make 212 a real gate on the credit guard **for the first time**.

### X-3 — and the brief's premise was wrong again
**The newest scoring data is AUGUST, not July.** September 0 rows; August 53 customer rows / 6
entities; July 38 / 5. So the credit card's August read was empty for the **five** customers last
scored in July.

The fallback is **per entity** on purpose: a global "newest month overall" resolves to August for
everyone and would still show `0.000000` for exactly those five — it would not fix the bug it exists
to fix.

🔴 **THE NUMBER THE OWNER MUST APPROVE BEFORE THIS SHIPS.** Stored ceilings do **not** move — both
allocation writers pass an explicit capital date and the `EXCEPT` over
`customer_capital_allocations_dynamic` is **empty in both directions** (checked before writing the
migration, per rule 10). But the **realtime preview** moves for one customer:

> **مشتری آزمایشی 20 — `final_limit` 0 -> 152,517,283** (score 0.000000 -> 0.188950).
> Nothing is persisted by that RPC, but it is what a salesperson sees.

The 454 gate still wins over any score: the three overdue customers stay at `0 / overdue`. Writes stay
pinned to the current month — loading an older month into the form would have overwritten that
month's history on save.

### X-4 — report only, nobody assigned
77 of 91 have no `responsible_id`, all active. The answer is **both**.

*Mostly a data gap:* of the 77, **1** has ever been scored, **3** have any quote, **0** an accepted
quote, **0** an allocation. Dormant records, not customers denied capital they earned. Tier 2 is an
equality join (`c.responsible_id = v_sp.salesperson_id`) and NULL never equals anything; the
`no_salesperson` branch is a designed, named, labelled state, and a customer belonging to no
salesperson has no capital pool to draw a share from. **A person must fill these in.**

*But one path genuinely should not depend on it, and the two now contradict each other live:*

> **مشتری آزمایشی 8** — no `responsible_id`, yet `customer_credit_balance.available_credit = 5,000,000`.
> `/sales/credit-customers` computes `computed_allowed_credit` with **no `responsible_id` reference at
> all** and shows them trusted at 5,000,000, while the credit card for the same customer returns
> `final_limit = 0, binding_constraint = 'no_salesperson'`.

Second, `calculate_customer_realtime_credit` returns at `no_salesperson` **before** considering
`v_credit_limit`, so a manually-set limit is reported in the payload but never honoured. Moot while
the profile is empty. **No code changed for this row.**

## Row reconciliation — 11 of 11 closed

    X-1 X-2 X-3 X-4 · Y-1 Y-2 Y-3 · Z-1 Z-2 · M-1 M-2   = 11 done, 0 failed, 0 blocked

**Stage 4 is NOT done and is held by the owner:** no branch merged beyond what the owner merged
themselves, no deploy, no `APP_GIT_SHA` check, and the cron unschedule (jobs 10/11/12) is queued for
immediately before the deploy step.
