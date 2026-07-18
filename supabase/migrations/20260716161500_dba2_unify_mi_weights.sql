-- =========================================================================
-- DB-A2 — unify market-intelligence scoring weights + include new events
-- =========================================================================
-- One shared weight set across the mi_* trend/demand functions, now that
-- deliberate per-product events exist:
--   sales_text_copied    x5
--   price_checked        x4
--   board_price_viewed   x3
--   chart_opened         x2
--   product_details_opened x2
--   search_result_viewed x1
--
-- Only the scoring math changes. RETURNS TABLE signatures and output column
-- names are preserved so the existing UI keeps working. No types.ts patch
-- needed (function bodies only, output shape unchanged).
--
-- Self-host: file only. Owner applies on the server. Nothing runs here.
-- =========================================================================

-- 1) mi_get_trending_products -------------------------------------------------
CREATE OR REPLACE FUNCTION public.mi_get_trending_products(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  product_id uuid, name text, sku text, brand jsonb, category jsonb,
  stock_status text, search_count integer, price_view_count integer,
  chart_view_count integer, board_view_count integer, trend_score integer,
  current_price numeric, previous_price numeric, change_percent numeric
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 7), 1), 365);
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
BEGIN
  PERFORM _mi_require_privileged();
  RETURN QUERY
  WITH agg AS (
    SELECT e.product_id,
      COUNT(*) FILTER (WHERE e.event_type = 'search_result_viewed')::int   AS search_count,
      COUNT(*) FILTER (WHERE e.event_type = 'price_checked')::int          AS price_view_count,
      COUNT(*) FILTER (WHERE e.event_type = 'chart_opened')::int           AS chart_view_count,
      COUNT(*) FILTER (WHERE e.event_type = 'board_price_viewed')::int     AS board_view_count,
      COUNT(*) FILTER (WHERE e.event_type = 'product_details_opened')::int AS details_count,
      COUNT(*) FILTER (WHERE e.event_type = 'sales_text_copied')::int      AS copy_count
    FROM product_interaction_events e
    WHERE e.created_at >= now() - make_interval(days => v_days)
    GROUP BY e.product_id
  ),
  scored AS (
    SELECT a.product_id, a.search_count, a.price_view_count, a.chart_view_count, a.board_view_count,
      ( a.copy_count*5
      + a.price_view_count*4
      + a.board_view_count*3
      + a.chart_view_count*2
      + a.details_count*2
      + a.search_count*1 )::int AS trend_score
    FROM agg a
  ),
  latest_price AS (
    SELECT DISTINCT ON (h.product_id)
      h.product_id, h.new_sale_price, h.old_sale_price, h.change_percent, h.created_at
    FROM product_sale_price_history h
    WHERE h.product_id IN (SELECT scored.product_id FROM scored)
    ORDER BY h.product_id, h.created_at DESC
  )
  SELECT p.id, p.name, p.sku,
    (SELECT jsonb_build_object('id', b.id, 'name', b.name) FROM brands b WHERE b.id = p.brand_id),
    (SELECT jsonb_build_object('id', c.id, 'name', c.name) FROM categories c WHERE c.id = p.category_id),
    p.stock_status::text,
    s.search_count, s.price_view_count, s.chart_view_count, s.board_view_count, s.trend_score,
    lp.new_sale_price, lp.old_sale_price, lp.change_percent
  FROM scored s
  JOIN products p ON p.id = s.product_id AND p.is_active = true
  LEFT JOIN latest_price lp ON lp.product_id = s.product_id
  ORDER BY s.trend_score DESC, p.name ASC
  LIMIT v_limit;
END; $$;

REVOKE ALL ON FUNCTION public.mi_get_trending_products(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mi_get_trending_products(integer, integer) TO authenticated;

-- 2) mi_get_demand_growth -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.mi_get_demand_growth(
  p_days integer DEFAULT 1
)
RETURNS TABLE (
  current_score numeric,
  previous_score numeric,
  growth_percent numeric,
  status text,
  range_days integer,
  current_event_count integer,
  previous_event_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 1), 1), 365);
  v_cur_start timestamptz;
  v_prev_start timestamptz;
  v_cur_score numeric;
  v_prev_score numeric;
  v_cur_count integer;
  v_prev_count integer;
  v_growth numeric;
  v_status text;
BEGIN
  PERFORM _mi_require_privileged();

  IF v_days = 1 THEN
    v_cur_start  := date_trunc('day', now());
    v_prev_start := date_trunc('day', now()) - interval '1 day';
  ELSE
    v_cur_start  := now() - make_interval(days => v_days);
    v_prev_start := now() - make_interval(days => v_days * 2);
  END IF;

  SELECT
    COALESCE(SUM(CASE event_type
      WHEN 'sales_text_copied' THEN 5
      WHEN 'price_checked' THEN 4
      WHEN 'board_price_viewed' THEN 3
      WHEN 'chart_opened' THEN 2
      WHEN 'product_details_opened' THEN 2
      WHEN 'search_result_viewed' THEN 1
      ELSE 0 END), 0)::numeric,
    COUNT(*)::int
  INTO v_cur_score, v_cur_count
  FROM product_interaction_events
  WHERE created_at >= v_cur_start
    AND (v_days = 1 OR created_at < now());

  SELECT
    COALESCE(SUM(CASE event_type
      WHEN 'sales_text_copied' THEN 5
      WHEN 'price_checked' THEN 4
      WHEN 'board_price_viewed' THEN 3
      WHEN 'chart_opened' THEN 2
      WHEN 'product_details_opened' THEN 2
      WHEN 'search_result_viewed' THEN 1
      ELSE 0 END), 0)::numeric,
    COUNT(*)::int
  INTO v_prev_score, v_prev_count
  FROM product_interaction_events
  WHERE created_at >= v_prev_start
    AND created_at < v_cur_start;

  IF v_prev_score = 0 AND v_cur_score = 0 THEN
    v_growth := 0;
    v_status := 'no_data';
  ELSIF v_prev_score = 0 THEN
    v_growth := 100;
    v_status := 'strong_growth';
  ELSE
    v_growth := ROUND(((v_cur_score - v_prev_score) / v_prev_score) * 100, 2);
    v_status := CASE
      WHEN v_growth >= 50 THEN 'strong_growth'
      WHEN v_growth >= 10 THEN 'moderate_growth'
      WHEN v_growth > -10 THEN 'flat'
      ELSE 'declining'
    END;
  END IF;

  RETURN QUERY SELECT v_cur_score, v_prev_score, v_growth, v_status, v_days, v_cur_count, v_prev_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mi_get_demand_growth(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mi_get_demand_growth(integer) TO authenticated;

-- NOTE: after applying on the server, run: supabase gen types → regenerate types.ts.
