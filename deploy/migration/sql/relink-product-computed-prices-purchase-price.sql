-- AfraKala — Phase 3/B3 / Task AFRA-20260517-PRICING-RELINK-U02-S02
-- Safe LAN relink of public.product_computed_prices.purchase_price_id to
-- the best-match row in public.purchase_prices.
--
-- Scope (STRICT — enforced in SQL):
--   * Only UPDATE product_computed_prices.purchase_price_id.
--   * Only touch rows where purchase_price_id IS NULL.
--   * Never overwrite an existing non-null purchase_price_id.
--   * Never INSERT / DELETE product_computed_prices.
--   * Never touch sale_price_types, pricing_rules, purchase_prices,
--     auth.*, or any RBAC/RLS object.
--
-- Matching rule (per NULL pcp row, pick at most one pp row):
--   pp.product_id = pcp.product_id
--   AND pp.is_active = true
--   AND (pp.expires_at IS NULL OR pp.expires_at > pcp.computed_at)
--   ORDER BY
--     (pp.effective_at IS NULL OR pp.effective_at <= pcp.computed_at) DESC,
--     pp.effective_at DESC NULLS LAST,
--     pp.updated_at   DESC NULLS LAST,
--     pp.id ASC
--   LIMIT 1
--
-- Required psql variables (-v key=value):
--   ON_ERROR_STOP=1
--   dry_run=true|false   -- wrapper terminates with ROLLBACK (dry) or COMMIT (real)
--
-- Behavior:
--   * dry_run=true  : computes the proposed plan in a TEMP table only and
--     prints all diagnostic counts and a 20-row sample. NO update is issued
--     against public.product_computed_prices. Wrapper appends ROLLBACK.
--   * dry_run=false : same plan is computed, then a single UPDATE applies
--     only to rows where purchase_price_id IS NULL (defensive predicate
--     repeated in the UPDATE). Wrapper appends COMMIT.
--   * Post-update orphan check (purchase_price_id pointing to a missing
--     purchase_prices.id) MUST be 0 — otherwise the script RAISEs and the
--     surrounding transaction is aborted by ON_ERROR_STOP.

\set ON_ERROR_STOP on

BEGIN;

-- Capture psql variable :dry_run into a TEMP table so DO $$...$$ blocks
-- (which do NOT expand psql variables) can read it via plain SQL.
DROP TABLE IF EXISTS _relink_flags;
CREATE TEMP TABLE _relink_flags ON COMMIT DROP AS
SELECT (:'dry_run')::text AS dry_run;

-- --- 0) Snapshot baseline counters ----------------------------------------
DROP TABLE IF EXISTS _relink_before;
CREATE TEMP TABLE _relink_before ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM public.product_computed_prices)                                AS pcp_total,
  (SELECT count(*) FROM public.product_computed_prices WHERE purchase_price_id IS NULL)     AS pcp_null,
  (SELECT count(*) FROM public.product_computed_prices WHERE purchase_price_id IS NOT NULL) AS pcp_not_null,
  (SELECT count(*) FROM public.product_computed_prices pcp
      WHERE pcp.purchase_price_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.purchase_prices pp WHERE pp.id = pcp.purchase_price_id)
  ) AS orphan_before;

\echo '--- baseline ---'
SELECT * FROM _relink_before;

-- --- 1) Build relink plan in TEMP table (no public write) -----------------
DROP TABLE IF EXISTS _relink_plan;
CREATE TEMP TABLE _relink_plan ON COMMIT DROP AS
SELECT
  pcp.id                AS pcp_id,
  pcp.product_id        AS product_id,
  pcp.computed_at       AS computed_at,
  (
    SELECT pp.id
    FROM public.purchase_prices pp
    WHERE pp.product_id = pcp.product_id
      AND pp.is_active = true
      AND (pp.expires_at IS NULL OR pp.expires_at > pcp.computed_at)
    ORDER BY
      (pp.effective_at IS NULL OR pp.effective_at <= pcp.computed_at) DESC,
      pp.effective_at DESC NULLS LAST,
      pp.updated_at   DESC NULLS LAST,
      pp.id           ASC
    LIMIT 1
  ) AS matched_pp_id
FROM public.product_computed_prices pcp
WHERE pcp.purchase_price_id IS NULL;

CREATE INDEX ON _relink_plan (pcp_id);

-- --- 2) Plan diagnostics --------------------------------------------------
\echo '--- plan summary ---'
SELECT
  count(*)                                          AS null_pcp_total,
  count(*) FILTER (WHERE matched_pp_id IS NOT NULL) AS matched,
  count(*) FILTER (WHERE matched_pp_id IS NULL)     AS unmatched
FROM _relink_plan;

\echo '--- sample 20 proposed relinks ---'
SELECT
  p.pcp_id,
  p.product_id,
  p.computed_at,
  p.matched_pp_id,
  pp.is_active        AS pp_is_active,
  pp.effective_at     AS pp_effective_at,
  pp.expires_at       AS pp_expires_at,
  pp.updated_at       AS pp_updated_at
FROM _relink_plan p
LEFT JOIN public.purchase_prices pp ON pp.id = p.matched_pp_id
ORDER BY p.matched_pp_id IS NULL DESC, p.computed_at DESC
LIMIT 20;

\echo '--- unmatched NULL pcp rows (should be 0 per preflight) ---'
SELECT pcp_id, product_id, computed_at
FROM _relink_plan
WHERE matched_pp_id IS NULL
ORDER BY computed_at DESC
LIMIT 50;

\echo '--- preserved existing non-null links (untouched by this script) ---'
SELECT count(*) AS preserved_existing_links
FROM public.product_computed_prices
WHERE purchase_price_id IS NOT NULL;

-- --- 3) Safety preflight: matched pp ids must exist -----------------------
DO $check_plan$
DECLARE
  v_missing int;
BEGIN
  SELECT count(*) INTO v_missing
  FROM _relink_plan p
  WHERE p.matched_pp_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.purchase_prices pp WHERE pp.id = p.matched_pp_id);
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'plan references % missing purchase_prices.id values — aborting', v_missing;
  END IF;
END
$check_plan$;

-- --- 4) Apply update (skipped in dry-run) ---------------------------------
\echo '--- apply phase (skipped when dry_run=true) ---'

WITH plan AS (
  SELECT pcp_id, matched_pp_id
  FROM _relink_plan
  WHERE matched_pp_id IS NOT NULL
    AND (SELECT dry_run FROM _relink_flags) = 'false'
)
UPDATE public.product_computed_prices AS pcp
SET purchase_price_id = plan.matched_pp_id
FROM plan
WHERE pcp.id = plan.pcp_id
  AND pcp.purchase_price_id IS NULL;  -- defensive: never overwrite existing

-- --- 5) Post-update diagnostics + invariants ------------------------------
\echo '--- after ---'
SELECT
  (SELECT count(*) FROM public.product_computed_prices)                                    AS pcp_total,
  (SELECT count(*) FROM public.product_computed_prices WHERE purchase_price_id IS NULL)    AS pcp_null,
  (SELECT count(*) FROM public.product_computed_prices WHERE purchase_price_id IS NOT NULL) AS pcp_not_null,
  (SELECT count(*) FROM public.product_computed_prices pcp
      WHERE pcp.purchase_price_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.purchase_prices pp WHERE pp.id = pcp.purchase_price_id)
  ) AS orphan_after;

DO $invariants$
DECLARE
  v_before_not_null bigint;
  v_after_not_null  bigint;
  v_planned_matches bigint;
  v_orphan_after    bigint;
  v_dry             text;
BEGIN
  SELECT dry_run INTO v_dry FROM _relink_flags;
  SELECT pcp_not_null INTO v_before_not_null FROM _relink_before;
  SELECT count(*) INTO v_after_not_null
  FROM public.product_computed_prices WHERE purchase_price_id IS NOT NULL;
  SELECT count(*) INTO v_planned_matches
  FROM _relink_plan WHERE matched_pp_id IS NOT NULL;
  SELECT count(*) INTO v_orphan_after
  FROM public.product_computed_prices pcp
  WHERE pcp.purchase_price_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.purchase_prices pp WHERE pp.id = pcp.purchase_price_id);

  IF v_orphan_after <> 0 THEN
    RAISE EXCEPTION 'orphan purchase_price_id after update = % (must be 0)', v_orphan_after;
  END IF;

  IF v_dry = 'true' THEN
    IF v_after_not_null <> v_before_not_null THEN
      RAISE EXCEPTION 'dry-run invariant violated: pcp_not_null changed (% -> %)',
        v_before_not_null, v_after_not_null;
    END IF;
    RAISE NOTICE 'dry-run OK: no rows mutated. planned matches = %', v_planned_matches;
  ELSE
    IF v_after_not_null <> v_before_not_null + v_planned_matches THEN
      RAISE EXCEPTION 'real-run invariant violated: expected pcp_not_null = % + % = %, got %',
        v_before_not_null, v_planned_matches,
        v_before_not_null + v_planned_matches, v_after_not_null;
    END IF;
    RAISE NOTICE 'real-run OK: % rows linked', v_planned_matches;
  END IF;
END
$invariants$;

-- Wrapper appends COMMIT (real) or ROLLBACK (dry).