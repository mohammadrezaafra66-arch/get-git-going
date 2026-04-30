-- Override table
CREATE TABLE IF NOT EXISTS public.product_recommendation_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  recommended_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  priority int NOT NULL DEFAULT 0,
  is_pinned boolean NOT NULL DEFAULT false,
  is_disabled boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pro_no_self CHECK (product_id <> recommended_product_id),
  CONSTRAINT pro_unique UNIQUE (product_id, recommended_product_id)
);

CREATE INDEX IF NOT EXISTS idx_pro_product ON public.product_recommendation_overrides(product_id);
CREATE INDEX IF NOT EXISTS idx_pro_recommended ON public.product_recommendation_overrides(recommended_product_id);

ALTER TABLE public.product_recommendation_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pro_select_authed" ON public.product_recommendation_overrides;
CREATE POLICY "pro_select_authed"
  ON public.product_recommendation_overrides
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "pro_write_admin_manager" ON public.product_recommendation_overrides;
CREATE POLICY "pro_write_admin_manager"
  ON public.product_recommendation_overrides
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role));

-- Local updated_at trigger function
CREATE OR REPLACE FUNCTION public.tg_pro_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pro_updated_at ON public.product_recommendation_overrides;
CREATE TRIGGER trg_pro_updated_at
  BEFORE UPDATE ON public.product_recommendation_overrides
  FOR EACH ROW EXECUTE FUNCTION public.tg_pro_set_updated_at();

-- Recommendation RPC
CREATE OR REPLACE FUNCTION public.get_product_recommendations(p_product_id uuid)
RETURNS TABLE (
  product_id uuid,
  name text,
  sku text,
  brand_name text,
  category_name text,
  stock_status text,
  current_price numeric,
  recommendation_score numeric,
  reason text,
  is_pinned boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_id uuid;
  v_category_id uuid;
  v_price numeric;
  v_price_low numeric;
  v_price_high numeric;
BEGIN
  SELECT p.brand_id, p.category_id INTO v_brand_id, v_category_id
  FROM public.products p WHERE p.id = p_product_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT AVG(rounded_sale_price)::numeric
    INTO v_price
  FROM public.product_computed_prices pcp
  WHERE pcp.product_id = p_product_id;

  IF v_price IS NOT NULL AND v_price > 0 THEN
    v_price_low  := v_price * 0.7;
    v_price_high := v_price * 1.3;
  END IF;

  RETURN QUERY
  WITH
  co_view AS (
    SELECT b.product_id AS rec_id, COUNT(DISTINCT a.user_id)::numeric AS cnt
    FROM public.product_interaction_events a
    JOIN public.product_interaction_events b
      ON a.user_id = b.user_id
     AND a.user_id IS NOT NULL
     AND b.product_id <> a.product_id
     AND abs(extract(epoch FROM (b.created_at - a.created_at))) <= 1800
    WHERE a.product_id = p_product_id
      AND a.created_at > now() - interval '30 days'
      AND b.created_at > now() - interval '30 days'
    GROUP BY b.product_id
  ),
  trending AS (
    SELECT pie.product_id AS rec_id,
           (COUNT(*) FILTER (WHERE pie.event_type = 'price_checked') * 4
          + COUNT(*) FILTER (WHERE pie.event_type = 'board_price_viewed') * 3
          + COUNT(*) FILTER (WHERE pie.event_type IN ('chart_opened','product_details_opened')) * 2
          + COUNT(*) FILTER (WHERE pie.event_type = 'search_result_viewed'))::numeric AS score
    FROM public.product_interaction_events pie
    WHERE pie.created_at > now() - interval '7 days'
      AND pie.product_id <> p_product_id
    GROUP BY pie.product_id
  ),
  trending_max AS (
    SELECT GREATEST(COALESCE(MAX(score), 0), 1) AS max_score FROM trending
  ),
  candidates AS (
    SELECT p.id AS rec_id
    FROM public.products p
    WHERE p.id <> p_product_id
      AND p.is_active = true
      AND p.status = 'active'
      AND (
        (v_category_id IS NOT NULL AND p.category_id = v_category_id)
        OR (v_brand_id IS NOT NULL AND p.brand_id = v_brand_id)
        OR EXISTS (SELECT 1 FROM co_view cv WHERE cv.rec_id = p.id)
        OR EXISTS (SELECT 1 FROM trending tr WHERE tr.rec_id = p.id)
      )
  ),
  cand_price AS (
    SELECT pcp.product_id AS rec_id, AVG(pcp.rounded_sale_price)::numeric AS price
    FROM public.product_computed_prices pcp
    GROUP BY pcp.product_id
  ),
  overrides AS (
    SELECT pro.recommended_product_id AS rec_id,
           pro.is_pinned,
           pro.is_disabled,
           pro.priority
    FROM public.product_recommendation_overrides pro
    WHERE pro.product_id = p_product_id
  ),
  scored AS (
    SELECT
      c.rec_id,
      COALESCE(cv.cnt, 0) AS co_view_cnt,
      CASE WHEN v_category_id IS NOT NULL AND p.category_id = v_category_id THEN 1 ELSE 0 END AS same_cat,
      CASE WHEN v_brand_id IS NOT NULL AND p.brand_id = v_brand_id THEN 1 ELSE 0 END AS same_brand,
      CASE WHEN v_price_low IS NOT NULL AND cp.price BETWEEN v_price_low AND v_price_high THEN 1 ELSE 0 END AS price_match,
      COALESCE(tr.score, 0) / (SELECT max_score FROM trending_max) AS trend_norm,
      p.stock_status::text AS stock_text,
      cp.price AS cand_price,
      p.name AS p_name,
      p.sku AS p_sku,
      b.name AS brand_name,
      cat.name AS category_name,
      ov.is_pinned,
      ov.is_disabled,
      ov.priority
    FROM candidates c
    JOIN public.products p ON p.id = c.rec_id
    LEFT JOIN public.brands b ON b.id = p.brand_id
    LEFT JOIN public.categories cat ON cat.id = p.category_id
    LEFT JOIN co_view cv ON cv.rec_id = c.rec_id
    LEFT JOIN trending tr ON tr.rec_id = c.rec_id
    LEFT JOIN cand_price cp ON cp.rec_id = c.rec_id
    LEFT JOIN overrides ov ON ov.rec_id = c.rec_id
  ),
  final_scored AS (
    SELECT
      s.*,
      (
        LEAST(s.co_view_cnt, 10) * 0.4 * 4
        + s.same_cat   * 3
        + s.same_brand * 2
        + s.price_match * 2
        + s.trend_norm * 1
      )
      * CASE WHEN s.stock_text IN ('out_of_stock','unknown') THEN 0.6 ELSE 1.0 END AS base_score
    FROM scored s
    WHERE COALESCE(s.is_disabled, false) = false
  )
  SELECT
    fs.rec_id,
    fs.p_name,
    fs.p_sku,
    fs.brand_name,
    fs.category_name,
    fs.stock_text,
    fs.cand_price,
    ROUND(
      CASE WHEN fs.is_pinned THEN fs.base_score + 1000 + COALESCE(fs.priority, 0)
           ELSE fs.base_score END
    , 3) AS recommendation_score,
    CASE
      WHEN fs.is_pinned THEN 'pinned'
      WHEN fs.co_view_cnt >= 1 THEN 'co_viewed'
      WHEN fs.same_cat = 1 THEN 'same_category'
      WHEN fs.same_brand = 1 THEN 'same_brand'
      WHEN fs.price_match = 1 THEN 'price_range'
      WHEN fs.trend_norm > 0 THEN 'trending'
      ELSE 'related'
    END::text AS reason,
    COALESCE(fs.is_pinned, false) AS is_pinned
  FROM final_scored fs
  ORDER BY recommendation_score DESC NULLS LAST
  LIMIT 5;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_recommendations(uuid) TO authenticated;
