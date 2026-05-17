### Task: AFRA-20260517-PRICING-RELINK-U02-S01 (Plan only)

## Recommendation
**Option A — Relink only now. Defer recompute (Option B) to a later phase after pricing_rules are reviewed on LAN.**

Reasoning:
- `product_computed_prices` (LAN: 123 rows) hold valid imported sale prices already mapped to LAN `cash_price`. They must not be overwritten.
- Imported `purchase_prices` cover 129 distinct products → near-full coverage for the 123 pcp products. Relink is low-risk and reversible (only sets a nullable FK).
- Recompute (B) requires LAN-canonical `pricing_rules` whose `sale_price_type_id` / `settlement_type_id` reference **LAN** ids. Cloud's `pricing_rules` reference Cloud sale_price_types that were intentionally not imported, so a blind recompute would either fail rule matching or produce wrong prices. B must wait for an explicit pricing_rules audit task.

## Investigation results (read on Cloud as structural reference; LAN counts come from U02's preflight)

Schema confirmed:
- `product_computed_prices.purchase_price_id uuid NULL` — safe to UPDATE.
- `purchase_prices` has `product_id, is_active, effective_at, expires_at, updated_at, id` — sufficient for deterministic matching.
- `pricing_recompute_queue` table and `v_pricing_recompute_queue_summary` view already exist — reuse, don't duplicate.
- No DB function named `*recompute*` exists; recompute is driven by app worker (`docs/PRICING_RECOMPUTE_WORKER.md`) calling `src/lib/pricing/engine.ts`.

Cloud reference (sanity check of matching feasibility, not LAN truth):
- pcp rows: 531, pcp products: 123, pp products: 129, active pp: 139.
- ~10+ products have multiple active purchase_prices → tie-breaker required.

LAN preflight (U02 must run on LAN before S02; results pasted back into S02 brief):
```sql
-- 1. NULL pp count
SELECT count(*) FROM public.product_computed_prices WHERE purchase_price_id IS NULL;
-- 2. Coverage
SELECT count(DISTINCT product_id) FROM public.product_computed_prices;
SELECT count(DISTINCT product_id) FROM public.purchase_prices;
-- 3. Matchability
SELECT count(DISTINCT pcp.product_id)
FROM public.product_computed_prices pcp
JOIN public.purchase_prices pp USING (product_id);
-- 4. Ambiguity
SELECT product_id, count(*) FROM public.purchase_prices
WHERE is_active=true GROUP BY product_id HAVING count(*)>1
ORDER BY 2 DESC LIMIT 20;
-- 5. Candidate match preview (read-only)
WITH ranked AS (
  SELECT pcp.id AS pcp_id, pp.id AS pp_id,
    row_number() OVER (
      PARTITION BY pcp.id
      ORDER BY
        (pp.is_active) DESC,
        (pp.effective_at <= pcp.computed_at) DESC,
        (pp.expires_at IS NULL OR pp.expires_at > pcp.computed_at) DESC,
        pp.effective_at DESC,
        pp.updated_at DESC,
        pp.id
    ) AS rn
  FROM public.product_computed_prices pcp
  LEFT JOIN public.purchase_prices pp ON pp.product_id = pcp.product_id
)
SELECT pcp_id, pp_id FROM ranked WHERE rn=1;
-- 6. Unmatched count
SELECT count(*) FROM public.product_computed_prices pcp
WHERE NOT EXISTS (SELECT 1 FROM public.purchase_prices pp WHERE pp.product_id = pcp.product_id);
-- 8. Rules
SELECT id, name, rule_name, is_active, sale_price_type_id, settlement_type_id, margin_type
FROM public.pricing_rules ORDER BY created_at;
```

## Exact matching rule for `purchase_price_id`
For each pcp row, pick the `purchase_prices.id` where `product_id` matches, ordered by:
1. `is_active = true` first
2. `effective_at <= pcp.computed_at` first (time-correctness)
3. `expires_at IS NULL OR expires_at > pcp.computed_at` first
4. `effective_at DESC` (most recent applicable)
5. `updated_at DESC`
6. `id` ASC (deterministic tie-break)

This is a single SELECT with `row_number() OVER (PARTITION BY pcp.id ...)`. The future S02 UPDATE wraps this in a CTE and only touches rows where `purchase_price_id IS NULL` (idempotent).

## Unmatched rows
- Leave `purchase_price_id = NULL`. Do not delete the pcp row, do not invent a fake pp.
- Insert one row per unmatched pcp into `pricing_recompute_queue` (status `pending`, reason `missing_purchase_price`) for human review.
- Report unmatched list (product_id, sale_price_type_id) in S02 final report.

## Products with multiple active `purchase_prices`
- The deterministic ORDER BY above guarantees exactly one winner per pcp.
- S02 dry-run must emit a "multi-active" report (product_id, candidate_count, chosen_pp_id) so U01 can spot-check before the real run.
- Do not deactivate the losers; relink does not change `purchase_prices.is_active`.

## Are `pricing_rules` sufficient for recompute? → No, not yet
- LAN `pricing_rules` were imported from Cloud and still reference Cloud `sale_price_type_id` / `settlement_type_id` values. LAN sale_price_types are canonical and different. → rule matching in `engine.ts` would fail (`NO_RULE`) for most products.
- Therefore recompute (B) is **blocked** until a separate task remaps `pricing_rules.sale_price_type_id` and `settlement_type_id` to LAN ids, validates `shipping_cost_rules`, and confirms active currency_rates.
- Proposed follow-up plan task: `AFRA-20260517-PRICING-RULES-REMAP-U02-S01-PLAN`.

## Future Agent task
**`AFRA-20260517-PRICING-RELINK-U02-S02` (Agent, dry-run first, real-run gated)**

Must produce:
1. `deploy/migration/sql/relink-purchase-prices-staged.sql` containing:
   - staging CTE with the matching rule above
   - dry-run block printing: total pcp, currently NULL, candidate matches, unmatched, multi-active sample
   - real-run `UPDATE public.product_computed_prices SET purchase_price_id = c.pp_id FROM candidates c WHERE pcp.id = c.pcp_id AND pcp.purchase_price_id IS NULL;`
   - `pricing_recompute_queue` inserts for unmatched
   - wrapped in `BEGIN; ... ROLLBACK;` for dry-run
2. `deploy/lan/scripts/relink-purchase-prices.ps1` wrapper (mirrors `import-purchase-prices-staged.ps1`): defaults to dry-run, requires `-DryRun:$false -BackupFile <path>` for real-run, supports `-UseDocker`.
3. Verification queries:
   ```sql
   SELECT count(*) FILTER (WHERE purchase_price_id IS NOT NULL) AS linked,
          count(*) FILTER (WHERE purchase_price_id IS NULL)     AS unlinked
   FROM public.product_computed_prices;
   -- Orphan check (must be 0)
   SELECT count(*) FROM public.product_computed_prices pcp
   LEFT JOIN public.purchase_prices pp ON pp.id = pcp.purchase_price_id
   WHERE pcp.purchase_price_id IS NOT NULL AND pp.id IS NULL;
   -- Sample joined preview
   SELECT pcp.id, p.name, pp.purchase_price, pp.currency, pp.effective_at
   FROM public.product_computed_prices pcp
   JOIN public.products p ON p.id = pcp.product_id
   JOIN public.purchase_prices pp ON pp.id = pcp.purchase_price_id
   LIMIT 20;
   ```
4. Rollback plan:
   - Pre-run LAN backup via `deploy/backups/scripts/backup-postgres.sh` (mandatory; wrapper refuses real-run without `-BackupFile`).
   - Logical rollback: `UPDATE public.product_computed_prices SET purchase_price_id = NULL WHERE id IN (<set captured in pre-run snapshot table>);` — S02 must create `_staging_import.pcp_relink_snapshot(pcp_id, prev_pp_id)` before the UPDATE to enable per-row revert.
   - Physical rollback: restore from backup.
5. Backup requirement: fresh `pg_dump` of `public` schema immediately before real-run; SHA-256 recorded.

## Required verification after future real-run
- `count(pcp WHERE purchase_price_id IS NOT NULL)` ≈ expected linked count from dry-run.
- Orphan `purchase_price_id` count = 0.
- 20-row sample join pcp ↔ product ↔ purchase_price renders sensible data.
- Smoke test: pricing board (`/_app/pricing/amin-hozoor-board`), product list, sales search still load with no console errors.
- `pricing_recompute_queue` contains exactly the unmatched set (count match).

## Stop conditions
- Stop if LAN preflight #3 shows < 80% of pcp products have any matching pp (indicates import gap, not a relink issue).
- Stop if dry-run unmatched count > LAN preflight #6 (logic error).
- Stop if any orphan check > 0 post-run → rollback immediately.
- Stop if pricing board or product list breaks after real-run → rollback.
- Stop if U01 has not given written §-by-§ approval.

## Required U01 approvals before S02 Agent mode
1. ✅ Approve **Option A (relink only)**; recompute (B) deferred to a separate planned task.
2. ✅ Approve the **deterministic matching rule** (active → effective_at ≤ computed_at → not expired → effective_at DESC → updated_at DESC → id).
3. ✅ Approve treatment of **unmatched rows**: leave NULL + enqueue in `pricing_recompute_queue`.
4. ✅ Approve **mandatory LAN backup** before real-run and snapshot table for per-row rollback.
5. ✅ Authorize **freeze window** on pricing writes during real-run.

Also required: U02 pastes the LAN preflight query results (1–6, 8 above) into the S02 brief before Agent execution.

## What must NOT be done in S02
- No writes to `purchase_prices`, `pricing_rules`, `sale_price_types`, `settlement_types`, `shipping_cost_rules`, `auth.users`, `user_roles`, RLS, or RBAC.
- No recompute of `final_sale_price` / `rounded_sale_price` / `margin_amount` / `purchase_price_toman`.
- No DELETE on `product_computed_prices`.
- No overwrite of existing non-NULL `purchase_price_id`.