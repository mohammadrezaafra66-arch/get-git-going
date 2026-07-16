# DB-D5 — Promotion nomination boost calibration (owner-run)

> **Do not run automatically.** This is a runbook + SQL the project owner runs
> on the self-hosted server **after** the DB-C (`..._dbc_promotion_nominations.sql`)
> and DB-D (`..._dbd_promotion_nomination_rpcs.sql`) migrations have been applied.
> No structural migration is involved — only an `UPDATE` on the policy row.

## Why

`boost_per_nomination` and `boost_cap_per_product` are seeded at **0**, so today
`final_score == market_score` and nominations change nothing. Calibration picks
boost values relative to the real market-score distribution so a nomination
gives a meaningful — but bounded — lift.

## Step 1 — observe the market-score distribution

```sql
SELECT
  percentile_cont(0.5) WITHIN GROUP (ORDER BY market_score) AS p50,
  percentile_cont(0.9) WITHIN GROUP (ORDER BY market_score) AS p90,
  max(market_score)                                          AS max_score,
  count(*)                                                   AS rows_scored
FROM public.v_promotion_suggestions
WHERE market_score > 0;
```

Note p50, p90 and max.

## Step 2 — choose values

Suggested starting point (tune to taste):

- `boost_per_nomination`  ≈ **p50** — one or two nominations lift a mid-ranked
  product into contention without swamping genuine market signal.
- `boost_cap_per_product` ≈ **p90** — total nomination boost for a product can
  never exceed roughly a top-decile market score, so nominations tilt ranking
  rather than override it.

`per_product_daily_cap` (seeded 1) already limits how many nominations of the
same product earn a boost on a given day; raise it only if several reps should
each contribute boost to the same product.

## Step 3 — apply (default policy)

```sql
UPDATE public.promotion_nomination_policy
SET boost_per_nomination  = :chosen_boost,      -- e.g. the p50 value
    boost_cap_per_product = :chosen_boost_cap,  -- e.g. the p90 value
    updated_at            = now()
WHERE role IS NULL AND user_id IS NULL;
```

### Optional — a lower quota for new reps ("تازه‌کار")

```sql
INSERT INTO public.promotion_nomination_policy
  (role, user_id, daily_quota, per_product_daily_cap, boost_per_nomination, boost_cap_per_product)
VALUES
  (NULL, :new_rep_user_id, 1, 1, :chosen_boost, :chosen_boost_cap)
ON CONFLICT DO NOTHING;
```

(A per-user row wins over the role/default row in `_promo_policy_for`.)

## Step 4 — verify

```sql
-- final_score should now exceed market_score for products nominated today.
SELECT product_id, market_score, sales_nomination_boost, final_score, nomination_count
FROM public.v_promotion_suggestions
WHERE sales_nomination_boost > 0
ORDER BY final_score DESC
LIMIT 20;
```

Re-tune `boost_per_nomination` / `boost_cap_per_product` with another `UPDATE`
as needed; no migration or redeploy is required.
