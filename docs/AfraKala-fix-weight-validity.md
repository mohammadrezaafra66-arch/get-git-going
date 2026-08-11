# AfraKala — Fix scoring weight validity dates (Path B)
## Autonomous execution prompt

Run unattended from Stage 1 to Stage 7. Never ask for confirmation. Stop only
for the hard stop conditions in 0.4.

---

## 0. RULES

### 0.1 Output
- Print ALL terminal output in **English only**. No Persian/Arabic characters —
  this terminal reverses RTL text when copied.
- Persian is allowed inside files you write.
- Keep paths, SQL, identifiers, and SHAs verbatim.

### 0.2 Environment (verified — do not re-derive)
```
Repo            : D:\AfraKalaTest\app
Branch          : feature/navigation-modernization  (origin HEAD 5ddc4495)
DB container    : afrakala-lan-db
PostgREST       : afrakala-lan-rest
Database        : afrakala
Frontend        : container afrakala-lan-web, built from D:\AfraKalaTest\app\deploy\lan
                  via: docker compose --env-file .env.lan build web
                       docker compose --env-file .env.lan up -d web
Typecheck base  : 70 pre-existing errors — BASELINE, not yours
```

**Database access — CRITICAL:** connect as `supabase_admin`. The `postgres`
role lacks CREATE on schema public and will fail with `permission denied`.
```powershell
Get-Content -Raw <file.sql> | docker exec -i afrakala-lan-db psql -v ON_ERROR_STOP=1 -U supabase_admin -d afrakala
```
For queries, pipe a here-string the same way. Never use `psql -c` with
multiline or nested quotes — it breaks in PowerShell.

### 0.3 The problem being fixed

`public.calculate_dynamic_score(text, uuid, date)` normalizes the period:
```sql
v_period := date_trunc('month', COALESCE(p_period_month, current_date))::date;
```
and resolves weights in all three of its internal queries with:
```sql
w.valid_from <= v_period AND (w.valid_to IS NULL OR w.valid_to >= v_period)
```
Validity is therefore judged against the **first of the month**, never today.

But weight rows are inserted with `valid_from = CURRENT_DATE`. Any weight
created mid-month is invisible for the rest of that month.

Live impact right now (2026-07-22): all 12 customer weight rows have
`valid_from` of 2026-07-12/13 and all 6 salesperson rows have 2026-07-22 — every
one later than 2026-07-01. A live read returns `total_active_weight = 0` and
`weighted_score = 0.000000` with `params_active = 10`.

**Chosen fix (Path B): keep the function's period semantics — a month's score
must stay reproducible — and correct the DATA and the INSERT PATH instead.**

Do NOT change how `calculate_dynamic_score` resolves periods or weights.
`run_daily_capital_allocation` and `calculate_customer_realtime_credit` are its
only callers and must keep their current semantics.

### 0.4 Hard stop conditions
Stop and report if:
1. Backfilling would create overlapping validity ranges for the same parameter
   (Stage 1.4 detects this) — this is a data-modelling decision, not yours.
2. Any DB error or permission error occurs.
3. Table/column/function names asserted here do not exist as described.
4. Verification in Stage 4 still shows `total_active_weight = 0` after 2 repair
   attempts.

When stopping: exact reason, affected rows/objects, commands already run, safe
options, recommended option, exact resume point, what was committed/pushed.

### 0.5 Self-repair engine
After each stage, validate. Then classify:
- **STOP**: DB errors, permission errors, overlap detected, semantics of
  `calculate_dynamic_score` would change.
- **REPAIR (max 3 attempts)**: new TypeScript/ESLint/build failures you
  introduced. After 3 failures, revert only your own edits, record as DEFERRED,
  continue.
- **RECORD & CONTINUE**: the 70 baseline typecheck errors.

Acceptance: zero NEW errors vs baseline. Never claim validation passed when it
did not.

### 0.6 Git
- Stay on `feature/navigation-modernization`.
- Stage only files this task touches. Never `git add -A` or `git add .`.
- Never commit pre-existing untracked `*.md` / `docs/` files.
- Push to `origin/feature/navigation-modernization` at the end. Never `main`.
- FORBIDDEN: `git reset --hard`, `git clean -fd`, `git checkout -- .`,
  `git restore .`, `git push --force`.

### 0.7 Out of scope — do not touch
- `calculate_employee_score` and the deferred `manual_daily_metrics_totals`
  wiring. Confirmed unrelated; leave it alone.
- `dynamic_entity_scores` has **zero salesperson rows**. Do NOT invent or seed
  scores — that is real business data the user must enter via `/users/$userId`.
  Report it; do not fabricate it.
- QA test products (`QA-` prefix, SKU `AFK-2026-00402`..`00421`).
- Sales logic, RLS policies, pricing, gamification business logic.

---

# STAGE 1 — AUDIT (read-only, change nothing)

### 1.1 Inspect actual structure
Do not assume column names. Print the structure of:
- `public.dynamic_parameter_weights`
- `public.dynamic_scoring_parameters`
Report the primary key column name and whether `valid_to`, `created_by`,
`updated_at` exist.

### 1.2 Full weight inventory
For every row in `dynamic_parameter_weights`, joined to its parameter, report:
parameter code, entity_type, is_active, weight, `valid_from`, `valid_to`,
`date_trunc('month', valid_from)::date` as proposed_new_valid_from, and two
booleans: valid against `CURRENT_DATE`, and valid against
`date_trunc('month', CURRENT_DATE)`.

Group the summary by entity_type and by month so the scope is unambiguous.

### 1.3 Identify which rows actually need backfilling
A row needs backfilling when `valid_from > date_trunc('month', valid_from)`
**and** that makes it invalid for its own month. List them explicitly with
counts per entity_type.

Also report any row belonging to a month **before** the current month whose
scores currently compute non-zero — backfilling those would rewrite history
that presently works. If any exist, exclude them and report why.

### 1.4 Overlap safety check — MANDATORY BEFORE ANY WRITE
Detect whether the proposed backfill would make two weight rows for the same
parameter overlap in time:
```sql
WITH proposed AS (
  SELECT <pk> AS row_id, parameter_id,
         valid_from,
         date_trunc('month', valid_from)::date AS new_valid_from,
         valid_to
  FROM public.dynamic_parameter_weights
)
SELECT a.parameter_id, a.row_id AS row_a, b.row_id AS row_b,
       a.new_valid_from AS a_from, a.valid_to AS a_to,
       b.new_valid_from AS b_from, b.valid_to AS b_to
FROM proposed a
JOIN proposed b
  ON a.parameter_id = b.parameter_id
 AND a.row_id < b.row_id
 AND a.new_valid_from <= COALESCE(b.valid_to, 'infinity'::date)
 AND b.new_valid_from <= COALESCE(a.valid_to, 'infinity'::date);
```
Replace `<pk>` with the real primary key from 1.1.

**If this returns ANY row: STOP and report.** Do not proceed.

### 1.5 Find every insert path
Search for all code that inserts into `dynamic_parameter_weights`:
- DB functions: search `pg_get_functiondef` across `public` for
  `dynamic_parameter_weights`. Known: `create_dynamic_scoring_parameter_v2`
  (from migration 141_2) inserts with `v_today`.
- Frontend: grep `src/` for `dynamic_parameter_weights`, `valid_from`, and any
  RPC that creates parameters or weights.
- Migration files: grep `supabase/migrations/` for
  `INSERT INTO public.dynamic_parameter_weights`.

Report every path found and whether it uses `CURRENT_DATE`/`now()` (wrong) or a
month-truncated date (correct).

### 1.6 Record the "before" baseline using the REAL scoring path
**Do not verify with `CURRENT_DATE`.** The 141_2 migration's own POST-CHECK used
`CURRENT_DATE` and reported false success — that is exactly the mistake to
avoid. Verify only through the function that actually consumes the weights:

```sql
SELECT * FROM public.calculate_dynamic_score('customer',
  'd05bbd0b-4b01-4ef1-b05f-83e839a783c1'::uuid, current_date);
```
Record `total_active_weight`, `weighted_score`, `params_active`,
`params_evaluated`. Expect zeros right now.

Also record, for the same customer:
```sql
SELECT * FROM public.calculate_customer_realtime_credit(
  'd05bbd0b-4b01-4ef1-b05f-83e839a783c1'::uuid);
```
Record `final_limit`, `binding_constraint`, `salesperson_allocated_capital`,
`is_capital_stale`.

---

# STAGE 2 — BACKUP (mandatory before any data change)

```sql
CREATE TABLE IF NOT EXISTS public.dynamic_parameter_weights_backup_20260722 AS
  SELECT * FROM public.dynamic_parameter_weights;
```
Verify the backup row count equals the live row count. Report both numbers.
If they differ, STOP.

---

# STAGE 3 — WRITE THE MIGRATION

Create `supabase/migrations/<YYYYMMDDHHMMSS>_142_fix_weight_validity_month_start.sql`.

At the top, as a comment block, include:
- the backup command from Stage 2
- the rollback SQL (restore `valid_from` from the backup table by primary key,
  and restore the previous function body)
- a one-line statement of why this migration exists

### 3.1 Data backfill
Move `valid_from` to the first of its own month, for exactly the rows
identified in 1.3:
```sql
UPDATE public.dynamic_parameter_weights
   SET valid_from = date_trunc('month', valid_from)::date
 WHERE valid_from <> date_trunc('month', valid_from)::date
   <plus any exclusions from 1.3>;
```
Include the overlap guard from 1.4 as a `DO $$ ... RAISE EXCEPTION ... $$`
pre-check inside the migration so the migration itself refuses to run if the
data has changed since the audit.

If the table has `updated_at`, let its trigger fire normally; do not force it.

### 3.2 Fix the insert path
Rewrite `create_dynamic_scoring_parameter_v2` with `CREATE OR REPLACE
FUNCTION`, changing **only** the weight insert so `valid_from` uses
`date_trunc('month', v_today)::date` instead of `v_today`. Copy the rest of the
body verbatim from the live definition (`pg_get_functiondef`), not from the
migration file — the live definition is the source of truth.

Apply the same correction to every other insert path found in 1.5 that lives in
the database.

### 3.3 Do NOT touch
`calculate_dynamic_score`, `run_daily_capital_allocation`,
`calculate_customer_realtime_credit`. Their period semantics stay exactly as
they are.

---

# STAGE 4 — APPLY AND VERIFY THROUGH THE REAL PATH

### 4.1 Apply
```powershell
Get-Content -Raw supabase\migrations\<new file>.sql | docker exec -i afrakala-lan-db psql -v ON_ERROR_STOP=1 -U supabase_admin -d afrakala
```

### 4.2 Verify — the only acceptance test that counts
Re-run the exact query from 1.6:
```sql
SELECT * FROM public.calculate_dynamic_score('customer',
  'd05bbd0b-4b01-4ef1-b05f-83e839a783c1'::uuid, current_date);
```
**PASS criteria:** `total_active_weight` is now approximately 1.000 (not 0), and
`weighted_score` is greater than 0.

Also verify the salesperson side resolves:
```sql
SELECT sum(w.weight)
  FROM public.dynamic_parameter_weights w
  JOIN public.dynamic_scoring_parameters p ON p.id = w.parameter_id
 WHERE p.entity_type = 'salesperson' AND p.is_active
   AND w.valid_from <= date_trunc('month', current_date)::date
   AND (w.valid_to IS NULL OR w.valid_to >= date_trunc('month', current_date)::date);
```
Expect 1.000.

If `total_active_weight` is still 0 after 2 repair attempts, STOP and report.

### 4.3 Confirm the insert path is fixed
Verify the live definition of `create_dynamic_scoring_parameter_v2` now
contains `date_trunc('month'` on the weight insert.

### 4.4 Re-check the credit ceiling and set expectations honestly
Re-run `calculate_customer_realtime_credit` for the same customer. Compare with
1.6 and report the delta.

**Expected outcome:** `weighted_score` rises above 0. `final_limit` may STILL be
0 — a second, independent cause exists (`salesperson_allocated_capital = 0`, no
dynamic capital allocation run recorded). That is NOT a failure of this fix and
must NOT be "repaired" here. Report `binding_constraint` and
`salesperson_allocated_capital` so the user can see which cause remains.

### 4.5 Reload the API schema cache
```powershell
docker restart afrakala-lan-rest
```
Confirm readiness by polling a REST endpoint until it returns 200 (this
container has no Docker healthcheck, so "healthy" is never reported).

---

# STAGE 5 — FRONTEND INSERT PATHS

Only if Stage 1.5 found frontend code that writes `valid_from` directly.

Fix it to use the first of the month, matching the DB path. If no frontend
insert path exists, state that explicitly and skip this stage.

Then run: `npm run typecheck`, `npm run lint`, `npm run build`.
Apply the self-repair engine. Zero new errors versus the 70-error baseline.

---

# STAGE 6 — REBUILD, SMOKE TEST, COMMIT, PUSH

### 6.1 Rebuild the frontend
Only if Stage 5 changed source files. If nothing in `src/` changed, skip the
rebuild and say so.
```powershell
cd D:\AfraKalaTest\app\deploy\lan
docker compose --env-file .env.lan build web
docker compose --env-file .env.lan up -d web
```
Stamp `GIT_SHA` and `BUILD_TIME` as in the previous build.

### 6.2 Smoke test
Confirm these return 200, plus one deliberately bogus route that must return
404 to prove the 200s are meaningful:
```
/sales/customers/d05bbd0b-4b01-4ef1-b05f-83e839a783c1/credit
/accounting/dynamic-capital
/gamification/admin/manual-metrics
/sales/search
/this-route-does-not-exist-xyz   -> must be 404
```

### 6.3 Commit and push
```
fix(scoring): align weight validity dates with month-start period semantics
```
Stage only: the new migration file, and any `src/` file changed in Stage 5.
Then push to `origin/feature/navigation-modernization`.

---

# STAGE 7 — FINAL REPORT (English)

1. Stage-by-stage: OK / FAILED / SKIPPED
2. Structure findings from 1.1 (real PK and column names)
3. Weight inventory summary: rows total, rows needing backfill, per entity_type
4. Overlap check result (must be zero rows)
5. All insert paths found, and which were corrected
6. Backup table name and row count
7. New migration filename
8. **BEFORE vs AFTER table** for the real scoring path:
   `total_active_weight`, `weighted_score`, `params_active`, `params_evaluated`
9. Salesperson weight sum for the current month
10. `calculate_customer_realtime_credit` before vs after: `final_limit`,
    `binding_constraint`, `salesperson_allocated_capital`, `is_capital_stale`
11. Whether the frontend needed changes; typecheck/lint/build results vs baseline
12. Smoke test results including the 404 control
13. Commit SHA and push confirmation
14. Anything you decided on your own that should be reviewed
15. **Remaining known gaps** — state these plainly, do not fix them:
    - `dynamic_entity_scores` has zero salesperson rows, so salespeople still
      score 0 until values are entered via `/users/$userId`
    - the deferred `manual_daily_metrics_totals` → `calculate_employee_score`
      wiring
    - whether `final_limit` is still 0 and which binding constraint remains

Do not claim success unless Stage 4.2 passed against the real scoring path.

## START NOW
Begin at Stage 1.1. Continue automatically through Stage 7.