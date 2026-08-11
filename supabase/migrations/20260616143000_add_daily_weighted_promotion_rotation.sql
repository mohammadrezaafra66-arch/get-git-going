-- APP-100 / WPC-1-100
-- Daily deterministic weighted rotation for marketing promotion suggestions.
--
-- Goal:
--   Keep the existing scoring, filtering, quota and RPC contract, but avoid
--   showing the exact same highest-score products every day.
--
-- Design:
--   - No cron/job/external scheduler.
--   - No random() because refreshes during the same day must be stable.
--   - The daily seed is based on Asia/Tehran date + product_id + channel_id.
--   - Higher score still increases the chance of being ranked near the top.
--   - Function signature and returned columns stay unchanged.

CREATE OR REPLACE FUNCTION public.compute_promotion_scores(
  _channel_id uuid DEFAULT NULL,
  _min_score  numeric DEFAULT 0,
  _limit      int DEFAULT 200
)
RETURNS SETOF public.v_promotion_suggestions
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH candidates AS (
    SELECT v.*
    FROM public.v_promotion_suggestions v
    WHERE v.score > 0
      AND (_channel_id IS NULL OR v.channel_id = _channel_id)
      AND v.score >= COALESCE(_min_score, 0)
      AND (v.daily_quota IS NULL OR v.daily_quota = 0 OR v.used_today < v.daily_quota)
  ),
  ranked AS (
    SELECT
      c.*,
      (
        -ln(rnd.u)
        / GREATEST(1.0, sqrt(c.score::double precision))
      ) AS weighted_rotation_key
    FROM candidates c
    CROSS JOIN LATERAL (
      SELECT md5(
        (date(now() AT TIME ZONE 'Asia/Tehran'))::text
        || ':' || c.product_id::text
        || ':' || c.channel_id::text
      ) AS hash_hex
    ) h
    CROSS JOIN LATERAL (
      SELECT (
        (
          SUM(
            (strpos('0123456789abcdef', substr(h.hash_hex, gs.pos, 1)) - 1)::numeric
            * power(16::numeric, (8 - gs.pos)::numeric)
          )
          + 1
        )::double precision
        / 4294967297.0
      ) AS u
      FROM generate_series(1, 8) AS gs(pos)
    ) rnd
  )
  SELECT
    product_id,
    product_name,
    sku,
    stock_status,
    channel_id,
    channel_name,
    label_weight_sum,
    channel_weight,
    stock_factor,
    recency_factor,
    score,
    qty_90d,
    daily_quota,
    used_today,
    remaining_today
  FROM ranked
  ORDER BY
    weighted_rotation_key ASC,
    score DESC,
    qty_90d DESC,
    product_name ASC,
    product_id ASC
  LIMIT GREATEST(COALESCE(_limit, 200), 1);
$$;

REVOKE ALL ON FUNCTION public.compute_promotion_scores(uuid, numeric, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.compute_promotion_scores(uuid, numeric, int) TO authenticated;
