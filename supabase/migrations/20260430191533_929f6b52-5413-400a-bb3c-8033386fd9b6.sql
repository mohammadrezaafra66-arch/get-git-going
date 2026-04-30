-- =========================================================================
-- Market Intelligence — Behavior analysis RPCs
-- =========================================================================

-- 1) Top checked today: products with highest price_checked / board_price_viewed today
CREATE OR REPLACE FUNCTION public.mi_get_top_checked_today(
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  product_id uuid,
  name text,
  sku text,
  brand jsonb,
  category jsonb,
  stock_status text,
  current_price numeric,
  price_check_count integer,
  unique_user_count integer,
  last_interaction_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
BEGIN
  PERFORM _mi_require_privileged();

  RETURN QUERY
  WITH agg AS (
    SELECT
      e.product_id,
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
    SELECT DISTINCT ON (h.product_id)
      h.product_id, h.new_sale_price
    FROM product_sale_price_history h
    WHERE h.product_id IN (SELECT product_id FROM agg)
    ORDER BY h.product_id, h.created_at DESC
  )
  SELECT
    p.id AS product_id,
    p.name,
    p.sku,
    (SELECT jsonb_build_object('id', b.id, 'name', b.name) FROM brands b WHERE b.id = p.brand_id) AS brand,
    (SELECT jsonb_build_object('id', c.id, 'name', c.name) FROM categories c WHERE c.id = p.category_id) AS category,
    p.stock_status::text,
    lp.new_sale_price AS current_price,
    a.price_check_count,
    a.unique_user_count,
    a.last_interaction_at
  FROM agg a
  JOIN products p ON p.id = a.product_id AND p.is_active = true
  LEFT JOIN latest_price lp ON lp.product_id = a.product_id
  ORDER BY a.price_check_count DESC, a.unique_user_count DESC, p.name ASC
  LIMIT v_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.mi_get_top_checked_today(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mi_get_top_checked_today(integer) TO authenticated;


-- 2) Market demand growth: total weighted demand current vs previous period
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
      WHEN 'price_checked' THEN 4
      WHEN 'board_price_viewed' THEN 3
      WHEN 'chart_opened' THEN 2
      WHEN 'search_result_viewed' THEN 1
      WHEN 'product_details_opened' THEN 2
      ELSE 0 END), 0)::numeric,
    COUNT(*)::int
  INTO v_cur_score, v_cur_count
  FROM product_interaction_events
  WHERE created_at >= v_cur_start
    AND (v_days = 1 OR created_at < now());

  SELECT
    COALESCE(SUM(CASE event_type
      WHEN 'price_checked' THEN 4
      WHEN 'board_price_viewed' THEN 3
      WHEN 'chart_opened' THEN 2
      WHEN 'search_result_viewed' THEN 1
      WHEN 'product_details_opened' THEN 2
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


-- 3) Emerging products: high growth, but not yet top trending
CREATE OR REPLACE FUNCTION public.mi_get_emerging_products(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  product_id uuid,
  name text,
  sku text,
  brand jsonb,
  category jsonb,
  stock_status text,
  current_score integer,
  previous_score integer,
  growth_percent numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 7), 1), 365);
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
  v_min_score integer := 6;
BEGIN
  PERFORM _mi_require_privileged();

  RETURN QUERY
  WITH cur AS (
    SELECT product_id,
      SUM(CASE event_type
        WHEN 'price_checked' THEN 4
        WHEN 'board_price_viewed' THEN 3
        WHEN 'chart_opened' THEN 2
        WHEN 'product_details_opened' THEN 2
        WHEN 'search_result_viewed' THEN 1
        ELSE 0 END)::int AS score
    FROM product_interaction_events
    WHERE created_at >= now() - make_interval(days => v_days)
    GROUP BY product_id
  ),
  prev AS (
    SELECT product_id,
      SUM(CASE event_type
        WHEN 'price_checked' THEN 4
        WHEN 'board_price_viewed' THEN 3
        WHEN 'chart_opened' THEN 2
        WHEN 'product_details_opened' THEN 2
        WHEN 'search_result_viewed' THEN 1
        ELSE 0 END)::int AS score
    FROM product_interaction_events
    WHERE created_at >= now() - make_interval(days => v_days * 2)
      AND created_at <  now() - make_interval(days => v_days)
    GROUP BY product_id
  ),
  -- top trending threshold: products in top 10 by current score are excluded
  top_trending AS (
    SELECT product_id FROM cur ORDER BY score DESC LIMIT 10
  ),
  joined AS (
    SELECT
      c.product_id,
      c.score AS cur_score,
      COALESCE(p.score, 0) AS prev_score,
      CASE
        WHEN COALESCE(p.score, 0) = 0 THEN 999
        ELSE ROUND(((c.score - p.score)::numeric / p.score) * 100, 2)
      END AS growth_percent
    FROM cur c
    LEFT JOIN prev p ON p.product_id = c.product_id
    WHERE c.score >= v_min_score
      AND (COALESCE(p.score, 0) = 0 OR c.score >= 2 * p.score)
      AND c.product_id NOT IN (SELECT product_id FROM top_trending)
  )
  SELECT
    p.id AS product_id,
    p.name,
    p.sku,
    (SELECT jsonb_build_object('id', b.id, 'name', b.name) FROM brands b WHERE b.id = p.brand_id) AS brand,
    (SELECT jsonb_build_object('id', c2.id, 'name', c2.name) FROM categories c2 WHERE c2.id = p.category_id) AS category,
    p.stock_status::text,
    j.cur_score,
    j.prev_score,
    j.growth_percent
  FROM joined j
  JOIN products p ON p.id = j.product_id
    AND p.is_active = true
    AND p.stock_status::text IN ('available','limited')
  ORDER BY j.growth_percent DESC, j.cur_score DESC
  LIMIT v_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.mi_get_emerging_products(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mi_get_emerging_products(integer, integer) TO authenticated;


-- 4) Hot brands and categories
CREATE OR REPLACE FUNCTION public.mi_get_hot_brands(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  brand_id uuid,
  brand_name text,
  interaction_count integer,
  unique_product_count integer,
  previous_count integer,
  growth_percent numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 7), 1), 365);
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
BEGIN
  PERFORM _mi_require_privileged();

  RETURN QUERY
  WITH cur AS (
    SELECT p.brand_id,
           COUNT(*)::int AS cnt,
           COUNT(DISTINCT e.product_id)::int AS upc
    FROM product_interaction_events e
    JOIN products p ON p.id = e.product_id
    WHERE e.created_at >= now() - make_interval(days => v_days)
      AND p.brand_id IS NOT NULL
    GROUP BY p.brand_id
  ),
  prev AS (
    SELECT p.brand_id, COUNT(*)::int AS cnt
    FROM product_interaction_events e
    JOIN products p ON p.id = e.product_id
    WHERE e.created_at >= now() - make_interval(days => v_days * 2)
      AND e.created_at <  now() - make_interval(days => v_days)
      AND p.brand_id IS NOT NULL
    GROUP BY p.brand_id
  )
  SELECT
    c.brand_id,
    b.name AS brand_name,
    c.cnt AS interaction_count,
    c.upc AS unique_product_count,
    COALESCE(pr.cnt, 0) AS previous_count,
    CASE
      WHEN COALESCE(pr.cnt, 0) = 0 AND c.cnt > 0 THEN 100
      WHEN COALESCE(pr.cnt, 0) = 0 THEN 0
      ELSE ROUND(((c.cnt - pr.cnt)::numeric / pr.cnt) * 100, 2)
    END AS growth_percent
  FROM cur c
  JOIN brands b ON b.id = c.brand_id
  LEFT JOIN prev pr ON pr.brand_id = c.brand_id
  ORDER BY c.cnt DESC
  LIMIT v_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.mi_get_hot_brands(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mi_get_hot_brands(integer, integer) TO authenticated;


CREATE OR REPLACE FUNCTION public.mi_get_hot_categories(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  category_id uuid,
  category_name text,
  interaction_count integer,
  unique_product_count integer,
  previous_count integer,
  growth_percent numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 7), 1), 365);
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
BEGIN
  PERFORM _mi_require_privileged();

  RETURN QUERY
  WITH cur AS (
    SELECT p.category_id,
           COUNT(*)::int AS cnt,
           COUNT(DISTINCT e.product_id)::int AS upc
    FROM product_interaction_events e
    JOIN products p ON p.id = e.product_id
    WHERE e.created_at >= now() - make_interval(days => v_days)
      AND p.category_id IS NOT NULL
    GROUP BY p.category_id
  ),
  prev AS (
    SELECT p.category_id, COUNT(*)::int AS cnt
    FROM product_interaction_events e
    JOIN products p ON p.id = e.product_id
    WHERE e.created_at >= now() - make_interval(days => v_days * 2)
      AND e.created_at <  now() - make_interval(days => v_days)
      AND p.category_id IS NOT NULL
    GROUP BY p.category_id
  )
  SELECT
    c.category_id,
    cat.name AS category_name,
    c.cnt AS interaction_count,
    c.upc AS unique_product_count,
    COALESCE(pr.cnt, 0) AS previous_count,
    CASE
      WHEN COALESCE(pr.cnt, 0) = 0 AND c.cnt > 0 THEN 100
      WHEN COALESCE(pr.cnt, 0) = 0 THEN 0
      ELSE ROUND(((c.cnt - pr.cnt)::numeric / pr.cnt) * 100, 2)
    END AS growth_percent
  FROM cur c
  JOIN categories cat ON cat.id = c.category_id
  LEFT JOIN prev pr ON pr.category_id = c.category_id
  ORDER BY c.cnt DESC
  LIMIT v_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.mi_get_hot_categories(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mi_get_hot_categories(integer, integer) TO authenticated;


-- 5) Seller favorites: products most interacted with by users having sales role
CREATE OR REPLACE FUNCTION public.mi_get_seller_top_products(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  product_id uuid,
  name text,
  sku text,
  brand jsonb,
  category jsonb,
  stock_status text,
  seller_interaction_count integer,
  unique_seller_count integer,
  last_interaction_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 7), 1), 365);
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
BEGIN
  PERFORM _mi_require_privileged();

  RETURN QUERY
  WITH sellers AS (
    SELECT DISTINCT user_id FROM user_roles WHERE role = 'sales'::app_role
  ),
  agg AS (
    SELECT
      e.product_id,
      COUNT(*)::int AS seller_interaction_count,
      COUNT(DISTINCT e.user_id)::int AS unique_seller_count,
      MAX(e.created_at) AS last_interaction_at
    FROM product_interaction_events e
    JOIN sellers s ON s.user_id = e.user_id
    WHERE e.created_at >= now() - make_interval(days => v_days)
      AND e.event_type IN ('price_checked','chart_opened','product_details_opened','search_result_viewed')
    GROUP BY e.product_id
  )
  SELECT
    p.id AS product_id,
    p.name,
    p.sku,
    (SELECT jsonb_build_object('id', b.id, 'name', b.name) FROM brands b WHERE b.id = p.brand_id) AS brand,
    (SELECT jsonb_build_object('id', c.id, 'name', c.name) FROM categories c WHERE c.id = p.category_id) AS category,
    p.stock_status::text,
    a.seller_interaction_count,
    a.unique_seller_count,
    a.last_interaction_at
  FROM agg a
  JOIN products p ON p.id = a.product_id AND p.is_active = true
  ORDER BY a.seller_interaction_count DESC, a.unique_seller_count DESC, p.name ASC
  LIMIT v_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.mi_get_seller_top_products(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mi_get_seller_top_products(integer, integer) TO authenticated;
