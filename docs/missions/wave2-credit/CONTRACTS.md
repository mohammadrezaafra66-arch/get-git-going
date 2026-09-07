# CONTRACTS — Wave 2 (credit truth + three wirings)

Orchestrator-owned. Specialists read it; only the orchestrator writes the progress ledger,
and only from verified returns.

## Stage-0 ground truth, re-measured 2026-09-05

Everything below was measured in this session. **Five items contradict the brief** — the brief
is stale, the measurements are current.

| Brief says | Measured | Consequence |
|---|---|---|
| Main tree on `chore/ignore-scratch-artefacts` | Main tree is on **`staging`** (`49f11b1e`, behind origin by 2) | Nothing to avoid switching; worktrees created from `origin/staging` anyway |
| Wave 1 unmerged, verify before starting | **All five wave-1 branches merged**: `wave1-agentA`, `-agentB`, `-agentC`, `-agentD`, `-b7-rename-backups` | Q-0 gate **PASSES** |
| The honest-columns branch carries migration **452** | It carries **453**. `staging` already holds a *different* 452 (`20260905180000_452_retire_parameter_weight_backups_by_rename.sql`, from wave1-b7); the branch was renumbered in `adbf5a5c` | **Refer to it as 453 everywhere.** Its down script is `docs/verification/453-down.sql` |
| Baseline `e2e/sales/` | **`e2e/sales/` does not exist** | Substituted the credit-adjacent suites: `e2e/scoring` (4), `e2e/capital` (1); kept `e2e/persons` (33) and `e2e/security` (24) |
| `docs/research/unwired-inventory-20260905.md` is untracked, main tree only | **Absent from the working tree**; it lives in commits `c8a96bb8` and `b9fb5cb3` | Recover with `git show c8a96bb8:docs/research/unwired-inventory-20260905.md` |

Deployed container `APP_GIT_SHA=6bf2b593` **equals `origin/staging` tip** — the app under test is
at staging's current SHA.

Ledger and disk agree at the tail: ledger's highest is `20260905183000`, which is exactly the
453 file's prefix. The renumber preserved the timestamp, so no orphan row was created.

## Migration allocation — take only your own

| Agent | Number | Timestamp prefix | Notes |
|---|---|---|---|
| Agent S | **454** | `20260905190000` | primary |
| Agent S | 455 | `20260905193000` | spare, only if 454 cannot carry it |
| Agent W | 456 | `20260905200000` | allocated; W's rows may need no migration at all |

Highest on disk **and** in the ledger at allocation time: **452 / `20260905180000`** on `staging`,
**453 / `20260905183000`** on the Agent S base. Do not re-derive; do not take a number outside
your row.

## Worktrees

| Agent | Path | Branch | Based on |
|---|---|---|---|
| S | `…/631fa7ea…/wt/agentS` | `feature/wave2-agentS` | `origin/feature/credit-customers-honest-columns` (staging + 453) |
| W | `…/631fa7ea…/wt/agentW` | `feature/wave2-agentW` | `origin/staging` |

**Why Agent S is based on the 453 branch rather than on a merged `staging`:** Q-0b's default was
to merge that branch first. The orchestrator did **not** merge it — it is the orchestrator's own
earlier work, and Part 4 forbids merging your own PR. Basing S's worktree on it achieves the
stated intent (the honest-NULL behaviour is the base, not a competitor) without that violation.
The branch still needs the owner's merge; it carries migration 453, already applied to the test
database.

## File ownership — do not cross

| Agent S owns | Agent W owns |
|---|---|
| `src/routes/_app.sales.credit-customers.tsx` | `src/routes/_app.suppliers.tsx` |
| the customer credit detail route (confirm real filename) | the supplier edit form |
| `list_trusted_credit_customers` and its migration | the financial-centre page |

Agent W touches the navigation registry only if W-3 genuinely needs a row, and says so out loud.

## S-0 finding — written once, consumed by S and V

**STATUS: REPORTED 2026-09-05 — VERDICT `STOP`. The halt condition fired. S-1 is not implemented.**

### The hop chain, as measured

The route file is confirmed: `src/routes/_app.sales_.customers_.$customerId.credit.tsx`.
**That one page shows TWO different scores from two different chains.**

**A — the headline card «امتیاز وزنی»**
1. `_app.sales_.customers_.$customerId.credit.tsx:113` renders `realtime?.weighted_score ?? latestAlloc.weighted_score`
2. `src/hooks/credit/useDynamicScoring.ts:393` calls RPC `calculate_customer_realtime_credit(p_customer_id)`
3. that function body **:41** `LEFT JOIN public.customer_credit_profile cp` -> `v_credit_limit`, `v_has_overdue`  <-- **HALT-LISTED TABLE**
4. body **:48-56** `IF v_has_overdue THEN RETURN ... 'weighted_score', 0` — a hard zero gated on the empty table
5. body **:92** `calculate_dynamic_score('customer', p_customer_id, v_capital_date)`
6. `calculate_dynamic_score` **:83-96** `SUM(s.raw_score * w.weight / total_active_weight)`
7. physical source: **`dynamic_entity_scores.raw_score` x `dynamic_parameter_weights.weight`**

**B — the section below, `DynamicScoringSection`**
`credit.tsx:160` -> `DynamicScoringSection.tsx:92` `currentPeriodMonth()` = `2026-09-01` ->
`useDynamicScoring.ts:148` RPC `calculate_dynamic_score(..., p_period_month:'2026-09-01')`.
Same physical table, **different period**, therefore a different answer.

### Why this is STOP, not PROCEED

`customer_credit_profile` is on the halt list and it sits inside chain A as a **gate**, not a
cosmetic read. Nothing on either chain touches `calculate_credit_score`, `credit_scoring_rules`,
`invoices` (`to_regclass('public.invoices')` is NULL — confirmed dropped), `credit_score_snapshots`,
`credit_requests` or `capital_allocation_ledger`.

### Live proof, customer `61ba4ba6-…`, inside BEGIN…ROLLBACK

    calculate_customer_realtime_credit  -> weighted_score 0.213150, credit_limit 0 (empty profile),
                                           capital_date_used 2026-08-31, is_capital_stale TRUE
    calculate_dynamic_score(...,'2026-08-31') -> 0.213150   (period 2026-08-01)
    calculate_dynamic_score(...,'2026-09-01') -> 0.000000   (params_evaluated 0)

**The page shows 0.213 in the header and 0.000 in the section below it, today.**
`dynamic_entity_scores` has rows for `2026-07-01` and `2026-08-01` only — nothing for the current
month, which is exactly what `currentPeriodMonth()` asks for.

### Query shape — the second reason S-1 cannot be honoured as written

`calculate_customer_realtime_credit` is `plpgsql`, single `p_customer_id`, **not set-returning —
there is no joinable form**. Serving the list means ~90-180 sequential RPCs. The only joinable
column, `customer_capital_allocations_dynamic.weighted_score`, is a frozen snapshot covering
**8 distinct customers out of 90**. `dynamic_entity_scores` covers 11.

### Contradictions with the brief's [E] facts

| Briefed | Measured |
|---|---|
| 91 customers | **90** |
| `customer_capital_allocations_dynamic` is *the live ceiling* | it is a **snapshot**; the page's live ceiling is recomputed by `calculate_customer_realtime_credit` against `salesperson_capital_allocations_dynamic`. 35 rows / **8 distinct customers** |
| live path `run_daily_capital_allocation -> … -> get_customer_dynamic_credit` | all four exist, but **the detail page calls none of them** |
| `dynamic_entity_scores` holds scoring rows | 150 rows / 11 customers / 2 periods, **neither the current month** |

### Finding not in the brief — a live safety hole

Because `customer_credit_profile` is empty, `v_credit_limit` is always 0 and `v_has_overdue` always
false, so the `'credit_limit'` and `'overdue'` binding constraints inside
`calculate_customer_realtime_credit` are **unreachable**. **An overdue customer is not blocked by
this RPC**, and the «قید فعال» card can only ever say «فرمول امتیاز».

### The two pages share no score source at all

List: `customer_credit_profile.credit_score` (integer 0-100, empty -> «محاسبه نشده» for all 90).
Detail: `dynamic_entity_scores.raw_score` via `calculate_dynamic_score` (numeric 0-1, 11 customers).
Different scales, different tables, different populations — and the halt-listed table is in both.

## Progress ledger — orchestrator only

| Row | Agent | State | Evidence |
|---|---|---|---|
| S-0 | S | dispatched | — |
| S-1 | S | **HALTED** | PR #397 merged 2026-09-05T16:11:59Z, so the base blocker is cleared. S-0's STOP verdict STANDS: owner must first decide which score is authoritative. Do not resume. |
| S-2 | S | **HALTED** | premise contradicted: `customer_capital_allocations_dynamic` is a snapshot covering 8 of 90 customers, not the live ceiling. Owner decision required. Do not resume. |
| S-3 | S | **investigate DONE**, FIX half halted | 13 functions + 34 DB objects reference it; all 3 writers dead; a DROP breaks the live credit-hold path |
| S-4 | S | **investigate DONE**, no FIX needed on the frontend | cause is data recency, NOT React Query (max 30s vs a 5-day and an infinite gap) |
| W-1 | W | **done** | 4 old criteria unchanged (15/2/1/1/1), 3 Asan terms went 0->1; searches the `suppliers.accounting_code` mirror, reason recorded |
| W-2 | W | **done** | cause was a mount race, not the source; cold load empty vs warm load `601702` reproduced on the deployed build |
| W-3 | W | **done** | HubItem via the registry gate, `registry.ts` untouched; finance-hub spec 17->18, non-vacuous (fails when removed) |

`dispatched = done + failed + blocked` must reconcile against **8** at the join.


## Stage-0 Playwright baseline — measured, not carried in

`npx playwright test e2e/persons e2e/security e2e/scoring e2e/capital` (config already `workers: 1`):

    365 total -> 346 passed, 16 failed, 3 skipped, 6.6 min

**This is the bar Stage 3 must not fall below.** The 16 failures are the baseline, not regressions.

### Ledger vs disk, measured in one pass (627 ledger rows / 624 disk files)

In the ledger with no file in this tree:
`20260903100000`, `20260903140000` (**pre-existing, not ours**), `20260905180000` (wave1-b7's 452 —
present on `origin/staging`, absent only because the local tree is 2 commits behind),
`20260905163000` (**our 437**, branch unmerged), `20260905183000` (**our 453**, branch unmerged).

On disk with no ledger row: `20260903160000`, `20260904150000` — **pre-existing, not ours**.

So `og81-migration-ledger-matches-disk` was already red independently of this session (the two
2026-09-03 orphans and the two unrecorded files), and two of our applied-but-unmerged migrations add
to it. Merging `feature/customer-asan-code-identifier` and
`feature/credit-customers-honest-columns` removes our two; the other four are somebody else's to
answer for.

## S-3 result — the retirement decision's input

**13 functions** name `customer_credit_profile`. **10 READ it and are LIVE**; the **3 that WRITE it are
all unreachable** — which is the direct answer to why the table is empty and will stay empty:

    calculate_credit_score          only caller recompute_customer_credit_scores -> 0 call sites
    recalculate_settlement_score    no in-DB caller, 0 src/ call sites
    update_customer_overdue_status  no in-DB caller, 0 src/ call sites

No `pg_cron` (`cron.job` does not exist). 0 views, 0 matviews, 0 inbound FKs, 0 policies on other
tables referencing it. On the table itself: 2 triggers, 3 policies, 6 constraints, 10 indexes
(two of them duplicates), 1 `person_merge` registry key. **DB object total 34.**

Frontend: the only `.from("customer_credit_profile")` is
`src/lib/sales/customer-credit-snapshot.ts:165`, a module with **zero importers** — dead. Six e2e
specs INSERT into the table as fixtures and would break.

**Break-verdict:** a `DROP` does not merely break a page. Migration 328's event trigger aborts the
DDL first (the table owns a registered `persons` FK). If it did drop, `_ensure_credit_balance` raises
`42P01` at runtime, taking down `hold_credit`, `release_credit`, `reverse_document`,
`get_customer_credit`, `get_customer_dynamic_credit`, and through them **`create_sales_quote_with_items`
and `create_receipt`** — quote creation and receipt posting. Retirement is a ~13-function rewrite plus
a `person_merge` registry change. The three dead writers can go first at no risk.

## S-4 result — the staleness is not the frontend

React Query can introduce **at most 30 seconds** (`credit-customers.tsx:167-170` `staleTime: 30_000`;
`__root.tsx:359` global `staleTime: 30_000`, `refetchOnWindowFocus: false`). Below the query there is
**no cache at all**: the RPC is `LANGUAGE sql STABLE`, `public` has **0 matviews**,
`vw_customer_receivables` is a plain view, and `customer_credit_balance` was written **today**.

The real gaps are two, and they are different problems:

| what | gap |
|---|---|
| the four `customer_credit_profile` columns | **never computed**, and no reachable code path can compute them |
| `dynamic_entity_scores` / `daily_capital_settings` | newest period `2026-08-01`, last capital run `2026-08-31` — **5 days ago**, while `current_period` is `2026-09-01` |

**No frontend cache setting fixes either.** Also worth carrying: "the page is stale" is too broad —
the trust decision and the allowed-credit figure are current and correct today; only the four dead
columns are not, and the page already says so.


## Migration-number audit, re-verified on owner challenge

The collision was real and was fixed before the challenge arrived, in commit `adbf5a5c`
("renumber this migration 452 -> 453"). The first commit on that branch, `cf5adf91`, did add the
file as `20260905183000_452_…`, which is what a reader of the PR's first commit sees.

Applied state read from `supabase_migrations.schema_migrations`, all three present:

    20260905180000  452_retire_parameter_weight_backups_by_rename    APPLIED   (was on staging)
    20260905183000  453_credit_customers_report_uncomputed_as_null   APPLIED   (PR #397)
    20260905163000  437_inline_create_registers_asan_identifier      APPLIED   (PR #391, still open)

`max(version)` in the ledger = `20260905183000`. Highest number used on any branch = **453**.
The allocation (454 / 455 / 456, prefixes from `20260905190000`) was already above the true maximum;
nothing needed changing.

**PR #397 merged 2026-09-05T16:11:59Z.** `origin/staging` now carries
`supabase/migrations/20260905183000_453_credit_customers_report_uncomputed_as_null.sql`, and the
branch is an ancestor of staging. Q-0b is satisfied.

Migration **437** remains applied-but-unmerged, inside PR #391 — an auto-generated bundle whose
title does not describe its contents. **No row in this wave depends on it**; neither worktree
contains it.


## Owner holds, recorded 2026-09-05

- **S-1 and S-2 stay HALTED.** PR #397 merged, so the base blocker is gone; S-0's STOP verdict
  stands until the owner decides which score is authoritative. Neither row may be resumed.
- **NO DEPLOY.** The owner decides the deploy after the scoring research returns. Stage 3's
  build/deploy/`APP_GIT_SHA` steps are suspended; do not run
  `docker compose … up -d --build --no-deps web`.
- `origin/staging` measured at **`fcfd48e1`** (PR #395 merge), one commit above the `021e6432`
  the owner quoted, which is the PR #397 merge. Both carry the 453 file.


## Agent W return — verified by the orchestrator, not taken on trust

Branch `feature/wave2-agentW`, 4 commits, **one file each**, no PR opened, no migration:

    38495089  test(navigation)  e2e/navigation/finance-hub.spec.ts
    04e1c4f9  feat(finance)     src/components/finance/FinanceHub.tsx
    a9bba574  fix(suppliers)    src/routes/_app.suppliers_.$supplierId.tsx
    ee8d84eb  feat(suppliers)   src/routes/_app.suppliers.tsx

No file of Agent S's, no `supabase/migrations/**`, no `registry.ts`.

**Independently re-measured after cleanup: `npx tsc --noEmit` = 70, baseline exactly, and zero
errors in W's own files.**

### The `git stash` incident — checked, nothing lost

Agent W ran `git stash` in a shared-tree repository, which CLAUDE.md forbids precisely because the
stash stack is shared process-wide. It stashed nothing (the file had no changes) and the paired
`git stash pop` surfaced a **pre-existing** entry, `stash@{0}: wip-others`, belonging to another
agent. The pop conflicted, so the entry was **not dropped**.

Verified by the orchestrator: the stack still holds its **5 original entries**
(`On feature/navigation-modernization: wip-others`, `…-after-eg-commit`, `…-blocking-pull`,
`…-wip-before-eg-commit`, `…-during-clusters4`) — none created, none destroyed. Another agent's
work is intact.

Three files were left `UU` with conflict markers **in the agentW worktree only**. Restored with
`git checkout HEAD --` on those three paths; the stash was untouched by that restore and still
shows 5. Worktree is clean.

### NOT VERIFIED — carried forward honestly

**No browser confirmation of the "after" state for any W row.** The evidence is database-level
(W-1), live-reproduction-of-the-cause plus a warm/cold split (W-2), and gate-level (W-3). Agent W
could not render the fixed build: the deployed container runs staging, and rebuilding it would
swap the app out from under the other agents sharing this machine. Part 6 requires a browser for a
CONNECT row, so **W-3 does not meet the brief's evidence bar** and W-1/W-2 lack their visual
confirmation. This remains open and is blocked behind the owner's deploy decision.
