# AfraKala — Weight validity fix: CONTINUATION (amended)

Resume the work defined in `docs/AfraKala-fix-weight-validity.md`.
Stage 1 is complete. This document AMENDS Stages 1.6, 3.1, 3.2, 5, and 6.1
based on your Stage 1 findings. Where this document and the original conflict,
**this document wins**.

Run unattended from Step 1 to Step 8. Do not ask for confirmation.

---

## 0. DECISIONS MADE — do not re-litigate

### 0.1 Overlap resolution: **Option A is approved**
Backfill ONLY rows where `valid_to IS NULL`.

Rationale: 12 customer weight rows exist for 10 customer parameters —
`customer_payment_discipline` and `customer_profit_3m` each have a superseded
row. Backfilling all 18 rows would resurrect the two retired weights and
produce a total active weight of 1.350 instead of 1.000, silently changing
every customer's score. Option A yields exactly 1.000 for both entity types.

Superseded rows keep `valid_from = 2026-07-12`, which correctly excludes them
from period 2026-07-01 and from every later month-start (their `valid_to`
already closes them).

Option B (retiring superseded rows) is NOT approved for this run — it is a
separate cleanup. Option C is rejected: it would modify
`calculate_dynamic_score`, which remains forbidden.

### 0.2 Insert paths: all FOUR must be fixed
Your 1.5 audit found more than the original document named. Fix every one:

| # | Path | Notes |
|---|---|---|
| 1 | `upsert_dynamic_parameter_weight(uuid, numeric, boolean)` | **Highest priority.** Called from `src/routes/_app.sales.credit-rules.tsx:133` on every weight edit. This is the live bug generator. |
| 2 | `create_dynamic_scoring_parameter_v2(text,text,text,numeric,text)` | Known path |
| 3 | `create_dynamic_scoring_parameter(text,text,numeric,text)` | v1, still live |
| 4 | Column default on `dynamic_parameter_weights.valid_from` | Currently `CURRENT_DATE` — covers any insert omitting the column |

For paths 1–3: use `CREATE OR REPLACE FUNCTION`, copy the body verbatim from
the LIVE definition (`pg_get_functiondef`), and change **only** the `valid_from`
value to `date_trunc('month', <existing expression>)::date`.

For path 4:
```sql
ALTER TABLE public.dynamic_parameter_weights
  ALTER COLUMN valid_from SET DEFAULT date_trunc('month', CURRENT_DATE)::date;
```

### 0.3 Still forbidden
Do not modify `calculate_dynamic_score`, `run_daily_capital_allocation`, or
`calculate_customer_realtime_credit`. Their period semantics stay exactly as
they are.

Do not touch: `calculate_employee_score` / `manual_daily_metrics_totals`
wiring; `dynamic_entity_scores` (zero salesperson rows is real missing business
data — report it, never fabricate it); QA test products.

### 0.4 Connection method — approved
Your PGPASSWORD deviation is correct and is now the standard for this task:
```powershell
docker exec -i -e PGPASSWORD=<from container env> afrakala-lan-db psql -v ON_ERROR_STOP=1 -U supabase_admin -d afrakala
```
Never print the credential.

### 0.5 Output rules
English only in terminal output. No Persian/Arabic characters — this terminal
reverses RTL text when copied. Paths, SQL, identifiers, SHAs verbatim.

### 0.6 Stop conditions
- Any DB or permission error.
- Step 5 verification still shows `total_active_weight = 0` after 2 repair
  attempts.
- Backup row count does not match live row count.
- Total active weight after the fix is anything other than 1.000 (±0.001) for
  either entity type.

---

## STEP 1 — Finish the missing baseline
Stage 1.6 was cut short. Capture the realtime-credit half now, BEFORE any
write:
```sql
SELECT * FROM public.calculate_customer_realtime_credit(
  'd05bbd0b-4b01-4ef1-b05f-83e839a783c1'::uuid);
```
Record: `final_limit`, `binding_constraint`, `salesperson_allocated_capital`,
`share_ratio`, `raw_allocation`, `is_capital_stale`.

Re-confirm the scoring baseline is unchanged since your audit:
```sql
SELECT * FROM public.calculate_dynamic_score('customer',
  'd05bbd0b-4b01-4ef1-b05f-83e839a783c1'::uuid, current_date);
```
Expect `total_active_weight = 0`, `weighted_score = 0.000000`.

## STEP 2 — Backup
```sql
CREATE TABLE IF NOT EXISTS public.dynamic_parameter_weights_backup_20260722 AS
  SELECT * FROM public.dynamic_parameter_weights;
```
Verify backup count = live count (expect 18 each). Report both. If they differ,
STOP.

## STEP 3 — Write the migration
Create `supabase/migrations/<YYYYMMDDHHMMSS>_142_fix_weight_validity_month_start.sql`.

Header comment block must contain: the Step 2 backup command; the rollback SQL
(restore `valid_from` from the backup table by `id`, restore the three previous
function bodies, restore the column default to `CURRENT_DATE`); and one line
stating why this migration exists.

**3.1 — Guarded backfill (Option A)**
Include a `DO $$ ... RAISE EXCEPTION ... $$` pre-check that recomputes the
overlap test and aborts if the data changed since the audit. Then:
```sql
UPDATE public.dynamic_parameter_weights
   SET valid_from = date_trunc('month', valid_from)::date
 WHERE valid_to IS NULL
   AND valid_from <> date_trunc('month', valid_from)::date;
```
Expected: 16 rows updated (10 customer + 6 salesperson). If the count differs,
report it prominently.

**3.2 — Fix all four insert paths** exactly as specified in 0.2.

**3.3 — Post-check inside the migration**
The post-check MUST use the same predicate the scoring path uses — compare
against `date_trunc('month', CURRENT_DATE)`, never `CURRENT_DATE`. The 141_2
migration failed precisely because its post-check used `CURRENT_DATE` and gave
a false pass. Raise an exception if either entity type's active weight sum is
not 1.000 (±0.001).

## STEP 4 — Apply
Apply the migration with `ON_ERROR_STOP=1`. Report rows affected per statement.

## STEP 5 — Verify through the REAL scoring path
This is the only acceptance test that counts.

```sql
SELECT * FROM public.calculate_dynamic_score('customer',
  'd05bbd0b-4b01-4ef1-b05f-83e839a783c1'::uuid, current_date);
```
**PASS:** `total_active_weight` = 1.000 (±0.001) and `weighted_score` > 0.

Salesperson side:
```sql
SELECT sum(w.weight)
  FROM public.dynamic_parameter_weights w
  JOIN public.dynamic_scoring_parameters p ON p.id = w.parameter_id
 WHERE p.entity_type = 'salesperson' AND p.is_active
   AND w.valid_from <= date_trunc('month', current_date)::date
   AND (w.valid_to IS NULL OR w.valid_to >= date_trunc('month', current_date)::date);
```
Expect 1.000.

Confirm no double-counting: verify the two superseded rows still resolve to
excluded for period `date_trunc('month', current_date)`.

Confirm all four insert paths are fixed: print the live definitions of the
three functions and the column default, showing `date_trunc('month'` present in
each.

## STEP 6 — Credit ceiling re-check (report only, do not "fix")
Re-run the Step 1 realtime-credit query. Report before vs after.

**Expected:** `weighted_score` rises above 0. `final_limit` may STILL be 0
because a second independent cause exists (`salesperson_allocated_capital = 0`,
no dynamic capital allocation run recorded). That is NOT a failure of this fix.
Report `binding_constraint` and `salesperson_allocated_capital` so the
remaining cause is visible. Do not attempt to fix it here.

## STEP 7 — Reload API, then commit
```powershell
docker restart afrakala-lan-rest
```
Confirm readiness by polling a REST endpoint until it returns 200 (this
container defines no Docker healthcheck).

Stage 5 of the original document is a **documented skip** — the frontend writes
no `valid_from` directly; it reads at `_app.sales.credit-rules.tsx:101` and
otherwise goes through the RPC. State this explicitly.

Stage 6.1 rebuild is therefore also **skipped** — no `src/` file changed. State
this explicitly.

Commit only the new migration file:
```
fix(scoring): align weight validity dates with month-start period semantics
```
Push to `origin/feature/navigation-modernization`.

## STEP 8 — FINAL REPORT (English)
1. Step-by-step: OK / FAILED / SKIPPED
2. Backup table name and row counts (backup vs live)
3. Migration filename
4. Rows updated by the backfill (expected 16) and which were excluded and why
5. **BEFORE vs AFTER table** from the real scoring path: `total_active_weight`,
   `weighted_score`, `params_active`, `params_evaluated`
6. Salesperson weight sum for the current month
7. Confirmation that the two superseded rows remain excluded
8. All four insert paths, with the corrected `valid_from` expression for each
9. `calculate_customer_realtime_credit` before vs after: `final_limit`,
   `binding_constraint`, `salesperson_allocated_capital`, `is_capital_stale`
10. Commit SHA and push confirmation
11. Anything you decided on your own that should be reviewed
12. **Remaining gaps — state plainly, fix nothing:**
    - `dynamic_entity_scores` has zero salesperson rows; salespeople score 0
      until real values are entered via `/users/$userId`
    - the two superseded weight rows are left in place (Option B cleanup
      deferred)
    - the deferred `manual_daily_metrics_totals` -> `calculate_employee_score`
      wiring
    - whether `final_limit` is still 0 and which binding constraint remains

Do not claim success unless Step 5 passed against the real scoring path.

## START NOW
Begin at Step 1.