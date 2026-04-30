-- =========================================================================
-- 1) Lightweight product interaction events table
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.product_interaction_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  product_id   uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  event_type   text NOT NULL CHECK (event_type IN (
    'search_result_viewed',
    'price_checked',
    'chart_opened',
    'product_details_opened',
    'board_price_viewed'
  )),
  source       text NOT NULL CHECK (source IN (
    'sales_search',
    'live_price_list',
    'amin_hozoor_board',
    'product_details',
    'management_dashboard'
  )),
  sale_price_type_id uuid NULL REFERENCES public.sale_price_types(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pie_product_created ON public.product_interaction_events(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pie_event_created   ON public.product_interaction_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pie_source_created  ON public.product_interaction_events(source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pie_user_created    ON public.product_interaction_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pie_spt_created     ON public.product_interaction_events(sale_price_type_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pie_created         ON public.product_interaction_events(created_at DESC);

ALTER TABLE public.product_interaction_events ENABLE ROW LEVEL SECURITY;

-- Authenticated users can insert their own events (or anonymous null user_id when called from public RPC if ever)
DROP POLICY IF EXISTS "pie_insert_authed" ON public.product_interaction_events;
CREATE POLICY "pie_insert_authed"
  ON public.product_interaction_events
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id IS NULL OR user_id = auth.uid()
  );

-- Only privileged roles can read raw events
DROP POLICY IF EXISTS "pie_select_privileged" ON public.product_interaction_events;
CREATE POLICY "pie_select_privileged"
  ON public.product_interaction_events
  FOR SELECT TO authenticated
  USING (
    has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role])
  );

-- =========================================================================
-- 2) Helper: ensure caller is privileged for management dashboards
-- =========================================================================
CREATE OR REPLACE FUNCTION public._mi_require_privileged()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF NOT has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._mi_require_privileged() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._mi_require_privileged() TO authenticated;

-- =========================================================================
-- 3) RPC: mi_get_trending_products
-- =========================================================================
CREATE OR REPLACE FUNCTION public.mi_get_trending_products(
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
  search_count integer,
  price_view_count integer,
  chart_view_count integer,
  board_view_count integer,
  trend_score integer,
  current_price numeric,
  previous_price numeric,
  change_percent numeric
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
  WITH agg AS (
    SELECT
      e.product_id,
      COUNT(*) FILTER (WHERE e.event_type = 'search_result_viewed')::int AS search_count,
      COUNT(*) FILTER (WHERE e.event_type = 'price_checked')::int        AS price_view_count,
      COUNT(*) FILTER (WHERE e.event_type = 'chart_opened')::int         AS chart_view_count,
      COUNT(*) FILTER (WHERE e.event_type = 'board_price_viewed')::int   AS board_view_count
    FROM product_interaction_events e
    WHERE e.created_at >= now() - make_interval(days => v_days)
    GROUP BY e.product_id
  ),
  scored AS (
    SELECT
      a.product_id,
      a.search_count, a.price_view_count, a.chart_view_count, a.board_view_count,
      (a.search_count*3 + a.price_view_count*4 + a.chart_view_count*2 + a.board_view_count*1) AS trend_score
    FROM agg a
  ),
  latest_price AS (
    SELECT DISTINCT ON (h.product_id)
      h.product_id, h.new_sale_price, h.old_sale_price, h.change_percent, h.created_at
    FROM product_sale_price_history h
    WHERE h.product_id IN (SELECT product_id FROM scored)
    ORDER BY h.product_id, h.created_at DESC
  )
  SELECT
    p.id AS product_id,
    p.name,
    p.sku,
    (SELECT jsonb_build_object('id', b.id, 'name', b.name) FROM brands b WHERE b.id = p.brand_id) AS brand,
    (SELECT jsonb_build_object('id', c.id, 'name', c.name) FROM categories c WHERE c.id = p.category_id) AS category,
    p.stock_status::text,
    s.search_count, s.price_view_count, s.chart_view_count, s.board_view_count,
    s.trend_score,
    lp.new_sale_price AS current_price,
    lp.old_sale_price AS previous_price,
    lp.change_percent
  FROM scored s
  JOIN products p ON p.id = s.product_id AND p.is_active = true
  LEFT JOIN latest_price lp ON lp.product_id = s.product_id
  ORDER BY s.trend_score DESC, p.name ASC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.mi_get_trending_products(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mi_get_trending_products(integer, integer) TO authenticated;

-- =========================================================================
-- 4) RPC: mi_get_price_movers (rising or falling)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.mi_get_price_movers(
  p_days integer DEFAULT 7,
  p_direction text DEFAULT 'up', -- 'up' or 'down'
  p_sale_price_type_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  product_id uuid,
  name text,
  sku text,
  brand jsonb,
  category jsonb,
  stock_status text,
  sale_price_type_id uuid,
  sale_price_type_title text,
  start_price numeric,
  end_price numeric,
  change_amount numeric,
  change_percent numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 7), 1), 365);
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
  v_dir text := lower(COALESCE(p_direction, 'up'));
BEGIN
  PERFORM _mi_require_privileged();
  IF v_dir NOT IN ('up','down') THEN v_dir := 'up'; END IF;

  RETURN QUERY
  WITH window_history AS (
    SELECT h.product_id, h.sale_price_type_id, h.new_sale_price, h.created_at,
           ROW_NUMBER() OVER (PARTITION BY h.product_id, h.sale_price_type_id ORDER BY h.created_at ASC)  AS rn_first,
           ROW_NUMBER() OVER (PARTITION BY h.product_id, h.sale_price_type_id ORDER BY h.created_at DESC) AS rn_last
    FROM product_sale_price_history h
    WHERE h.created_at >= now() - make_interval(days => v_days)
      AND h.sale_price_type_id IS NOT NULL
      AND (p_sale_price_type_id IS NULL OR h.sale_price_type_id = p_sale_price_type_id)
  ),
  pairs AS (
    SELECT f.product_id, f.sale_price_type_id,
           f.new_sale_price AS start_price,
           l.new_sale_price AS end_price
    FROM window_history f
    JOIN window_history l
      ON l.product_id = f.product_id
     AND l.sale_price_type_id = f.sale_price_type_id
     AND l.rn_last = 1
    WHERE f.rn_first = 1
      AND f.new_sale_price IS NOT NULL
      AND l.new_sale_price IS NOT NULL
      AND f.new_sale_price > 0
      AND f.new_sale_price <> l.new_sale_price
  ),
  scored AS (
    SELECT pr.product_id, pr.sale_price_type_id, pr.start_price, pr.end_price,
           (pr.end_price - pr.start_price) AS change_amount,
           ROUND(((pr.end_price - pr.start_price) / pr.start_price) * 100, 2) AS change_percent
    FROM pairs pr
  )
  SELECT
    p.id AS product_id,
    p.name,
    p.sku,
    (SELECT jsonb_build_object('id', b.id, 'name', b.name) FROM brands b WHERE b.id = p.brand_id) AS brand,
    (SELECT jsonb_build_object('id', c.id, 'name', c.name) FROM categories c WHERE c.id = p.category_id) AS category,
    p.stock_status::text,
    s.sale_price_type_id,
    spt.title AS sale_price_type_title,
    s.start_price, s.end_price, s.change_amount, s.change_percent
  FROM scored s
  JOIN products p ON p.id = s.product_id AND p.is_active = true
  JOIN sale_price_types spt ON spt.id = s.sale_price_type_id
  WHERE (v_dir = 'up'   AND s.change_percent > 0)
     OR (v_dir = 'down' AND s.change_percent < 0)
  ORDER BY (CASE WHEN v_dir = 'up' THEN s.change_percent ELSE -s.change_percent END) DESC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.mi_get_price_movers(integer, text, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mi_get_price_movers(integer, text, uuid, integer) TO authenticated;

-- =========================================================================
-- 5) RPC: mi_get_market_index (Afra Market Index)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.mi_get_market_index(
  p_days integer DEFAULT 7
)
RETURNS TABLE (
  index_change_percent numeric,
  product_count integer,
  rising_count integer,
  falling_count integer,
  flat_count integer,
  status text,
  range_days integer
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 7), 1), 365);
BEGIN
  PERFORM _mi_require_privileged();

  RETURN QUERY
  WITH window_history AS (
    SELECT h.product_id, h.sale_price_type_id, h.new_sale_price, h.created_at,
           ROW_NUMBER() OVER (PARTITION BY h.product_id, h.sale_price_type_id ORDER BY h.created_at ASC)  AS rn_first,
           ROW_NUMBER() OVER (PARTITION BY h.product_id, h.sale_price_type_id ORDER BY h.created_at DESC) AS rn_last
    FROM product_sale_price_history h
    WHERE h.created_at >= now() - make_interval(days => v_days)
      AND h.sale_price_type_id IS NOT NULL
  ),
  pairs AS (
    SELECT f.product_id, f.sale_price_type_id,
           f.new_sale_price AS start_price,
           l.new_sale_price AS end_price
    FROM window_history f
    JOIN window_history l
      ON l.product_id = f.product_id
     AND l.sale_price_type_id = f.sale_price_type_id
     AND l.rn_last = 1
    WHERE f.rn_first = 1
      AND f.new_sale_price IS NOT NULL
      AND l.new_sale_price IS NOT NULL
      AND f.new_sale_price > 0
  ),
  filtered AS (
    SELECT pr.product_id,
           AVG((pr.end_price - pr.start_price) / pr.start_price * 100) AS change_pct
    FROM pairs pr
    JOIN products p ON p.id = pr.product_id
    WHERE p.is_active = true
      AND p.stock_status::text IN ('available','limited')
    GROUP BY pr.product_id
  ),
  agg AS (
    SELECT
      ROUND(AVG(change_pct)::numeric, 2) AS index_change_percent,
      COUNT(*)::int AS product_count,
      COUNT(*) FILTER (WHERE change_pct > 0.0001)::int AS rising_count,
      COUNT(*) FILTER (WHERE change_pct < -0.0001)::int AS falling_count,
      COUNT(*) FILTER (WHERE change_pct BETWEEN -0.0001 AND 0.0001)::int AS flat_count
    FROM filtered
  )
  SELECT
    a.index_change_percent,
    a.product_count,
    a.rising_count,
    a.falling_count,
    a.flat_count,
    CASE
      WHEN a.product_count = 0 THEN 'no_data'
      WHEN a.index_change_percent > 1 THEN 'rising'
      WHEN a.index_change_percent < -1 THEN 'falling'
      WHEN ABS(a.index_change_percent) <= 0.5 THEN 'flat'
      ELSE 'volatile'
    END AS status,
    v_days AS range_days
  FROM agg a;
END;
$$;

REVOKE ALL ON FUNCTION public.mi_get_market_index(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mi_get_market_index(integer) TO authenticated;

-- =========================================================================
-- 6) RPC: mi_get_seller_favorite_products
-- =========================================================================
CREATE OR REPLACE FUNCTION public.mi_get_seller_favorite_products(
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
  interaction_count integer,
  last_interaction_at timestamptz,
  current_price numeric
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
  WITH sales_users AS (
    SELECT ur.user_id FROM user_roles ur WHERE ur.role = 'sales'::app_role
  ),
  agg AS (
    SELECT e.product_id,
           COUNT(*)::int AS interaction_count,
           MAX(e.created_at) AS last_interaction_at
    FROM product_interaction_events e
    JOIN sales_users su ON su.user_id = e.user_id
    WHERE e.created_at >= now() - make_interval(days => v_days)
    GROUP BY e.product_id
  ),
  latest_price AS (
    SELECT DISTINCT ON (h.product_id) h.product_id, h.new_sale_price
    FROM product_sale_price_history h
    WHERE h.product_id IN (SELECT product_id FROM agg)
    ORDER BY h.product_id, h.created_at DESC
  )
  SELECT
    p.id AS product_id,
    p.name, p.sku,
    (SELECT jsonb_build_object('id', b.id, 'name', b.name) FROM brands b WHERE b.id = p.brand_id) AS brand,
    (SELECT jsonb_build_object('id', c.id, 'name', c.name) FROM categories c WHERE c.id = p.category_id) AS category,
    p.stock_status::text,
    a.interaction_count,
    a.last_interaction_at,
    lp.new_sale_price AS current_price
  FROM agg a
  JOIN products p ON p.id = a.product_id AND p.is_active = true
  LEFT JOIN latest_price lp ON lp.product_id = a.product_id
  ORDER BY a.interaction_count DESC, a.last_interaction_at DESC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.mi_get_seller_favorite_products(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mi_get_seller_favorite_products(integer, integer) TO authenticated;