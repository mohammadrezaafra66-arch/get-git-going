-- Fix ambiguous "product_id" reference in MI RPCs.
-- The OUT parameter `product_id` from RETURNS TABLE is in scope inside the
-- function body, colliding with subqueries that select unqualified product_id.

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
      COUNT(*) FILTER (WHERE e.event_type = 'search_result_viewed')::int AS search_count,
      COUNT(*) FILTER (WHERE e.event_type = 'price_checked')::int        AS price_view_count,
      COUNT(*) FILTER (WHERE e.event_type = 'chart_opened')::int         AS chart_view_count,
      COUNT(*) FILTER (WHERE e.event_type = 'board_price_viewed')::int   AS board_view_count
    FROM product_interaction_events e
    WHERE e.created_at >= now() - make_interval(days => v_days)
    GROUP BY e.product_id
  ),
  scored AS (
    SELECT a.product_id, a.search_count, a.price_view_count, a.chart_view_count, a.board_view_count,
      (a.search_count*3 + a.price_view_count*4 + a.chart_view_count*2 + a.board_view_count*1) AS trend_score
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

CREATE OR REPLACE FUNCTION public.mi_get_top_checked_today(
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  product_id uuid, name text, sku text, brand jsonb, category jsonb,
  stock_status text, current_price numeric, price_check_count integer,
  unique_user_count integer, last_interaction_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
BEGIN
  PERFORM _mi_require_privileged();
  RETURN QUERY
  WITH agg AS (
    SELECT e.product_id,
      COUNT(*) FILTER (WHERE e.event_type IN ('price_checked','board_price_viewed'))::int AS price_check_count,
      COUNT(DISTINCT e.user_id) FILTER (WHERE e.user_id IS NOT NULL)::int AS unique_user_count,
      MAX(e.created_at) AS last_interaction_at
    FROM product_interaction_events e
    WHERE e.created_at >= date_trunc('day', now())
      AND e.event_type IN ('price_checked','board_price_viewed','chart_opened','product_details_opened','search_result_viewed')
    GROUP BY e.product_id
    HAVING COUNT(*) FILTER (WHERE e.event_type IN ('price_checked','board_price_viewed')) > 0
  ),
  latest_price AS (
    SELECT DISTINCT ON (h.product_id) h.product_id, h.new_sale_price
    FROM product_sale_price_history h
    WHERE h.product_id IN (SELECT agg.product_id FROM agg)
    ORDER BY h.product_id, h.created_at DESC
  )
  SELECT p.id, p.name, p.sku,
    (SELECT jsonb_build_object('id', b.id, 'name', b.name) FROM brands b WHERE b.id = p.brand_id),
    (SELECT jsonb_build_object('id', c.id, 'name', c.name) FROM categories c WHERE c.id = p.category_id),
    p.stock_status::text,
    lp.new_sale_price, a.price_check_count, a.unique_user_count, a.last_interaction_at
  FROM agg a
  JOIN products p ON p.id = a.product_id AND p.is_active = true
  LEFT JOIN latest_price lp ON lp.product_id = a.product_id
  ORDER BY a.price_check_count DESC, a.unique_user_count DESC, p.name ASC
  LIMIT v_limit;
END; $$;

CREATE OR REPLACE FUNCTION public.mi_get_emerging_products(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  product_id uuid, name text, sku text, brand jsonb, category jsonb,
  stock_status text, current_score integer, previous_score integer, growth_percent numeric
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 7), 1), 365);
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
  v_min_score integer := 6;
BEGIN
  PERFORM _mi_require_privileged();
  RETURN QUERY
  WITH cur AS (
    SELECT e.product_id,
      SUM(CASE e.event_type
        WHEN 'price_checked' THEN 4 WHEN 'board_price_viewed' THEN 3
        WHEN 'chart_opened' THEN 2 WHEN 'product_details_opened' THEN 2
        WHEN 'search_result_viewed' THEN 1 ELSE 0 END)::int AS score
    FROM product_interaction_events e
    WHERE e.created_at >= now() - make_interval(days => v_days)
    GROUP BY e.product_id
  ),
  prev AS (
    SELECT e.product_id,
      SUM(CASE e.event_type
        WHEN 'price_checked' THEN 4 WHEN 'board_price_viewed' THEN 3
        WHEN 'chart_opened' THEN 2 WHEN 'product_details_opened' THEN 2
        WHEN 'search_result_viewed' THEN 1 ELSE 0 END)::int AS score
    FROM product_interaction_events e
    WHERE e.created_at >= now() - make_interval(days => v_days * 2)
      AND e.created_at <  now() - make_interval(days => v_days)
    GROUP BY e.product_id
  ),
  top_trending AS (
    SELECT cur.product_id FROM cur ORDER BY cur.score DESC LIMIT 10
  ),
  joined AS (
    SELECT c.product_id, c.score AS cur_score, COALESCE(p.score, 0) AS prev_score,
      CASE WHEN COALESCE(p.score, 0) = 0 THEN 999
           ELSE ROUND(((c.score - p.score)::numeric / p.score) * 100, 2) END AS growth_percent
    FROM cur c
    LEFT JOIN prev p ON p.product_id = c.product_id
    WHERE c.score >= v_min_score
      AND (COALESCE(p.score, 0) = 0 OR c.score >= 2 * p.score)
      AND c.product_id NOT IN (SELECT top_trending.product_id FROM top_trending)
  )
  SELECT p.id, p.name, p.sku,
    (SELECT jsonb_build_object('id', b.id, 'name', b.name) FROM brands b WHERE b.id = p.brand_id),
    (SELECT jsonb_build_object('id', c2.id, 'name', c2.name) FROM categories c2 WHERE c2.id = p.category_id),
    p.stock_status::text,
    j.cur_score, j.prev_score, j.growth_percent
  FROM joined j
  JOIN products p ON p.id = j.product_id
    AND p.is_active = true
    AND p.stock_status::text IN ('available','limited')
  ORDER BY j.growth_percent DESC, j.cur_score DESC
  LIMIT v_limit;
END; $$;