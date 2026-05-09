
-- Bot API: per-key label allowlist for products endpoint
CREATE TABLE IF NOT EXISTS public.bot_api_key_label_access (
  api_key_id uuid NOT NULL REFERENCES public.bot_api_keys(id) ON DELETE CASCADE,
  label_id   uuid NOT NULL REFERENCES public.product_labels(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (api_key_id, label_id)
);

CREATE INDEX IF NOT EXISTS bakla_label_idx ON public.bot_api_key_label_access(label_id);

ALTER TABLE public.bot_api_key_label_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bakla_admin_manager_all ON public.bot_api_key_label_access;
CREATE POLICY bakla_admin_manager_all
  ON public.bot_api_key_label_access
  FOR ALL
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));

-- RPC: list products for a bot key, filtered by allowed labels
CREATE OR REPLACE FUNCTION public.bot_list_products_for_key(
  p_key_id uuid,
  p_label_id uuid DEFAULT NULL,
  p_updated_since timestamptz DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50
)
RETURNS TABLE (
  total_count bigint,
  product jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offset integer := GREATEST(0, (COALESCE(p_page,1) - 1) * COALESCE(p_page_size,50));
  v_limit  integer := LEAST(100, GREATEST(1, COALESCE(p_page_size,50)));
  v_has_any boolean;
BEGIN
  -- Confirm key has at least one allowed label
  SELECT EXISTS (SELECT 1 FROM public.bot_api_key_label_access WHERE api_key_id = p_key_id) INTO v_has_any;
  IF NOT v_has_any THEN
    RAISE EXCEPTION 'forbidden_no_labels';
  END IF;

  -- If specific label requested, ensure it's in allowlist
  IF p_label_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.bot_api_key_label_access
                   WHERE api_key_id = p_key_id AND label_id = p_label_id) THEN
      RAISE EXCEPTION 'forbidden_label';
    END IF;
  END IF;

  RETURN QUERY
  WITH allowed AS (
    SELECT label_id FROM public.bot_api_key_label_access WHERE api_key_id = p_key_id
  ),
  matched AS (
    SELECT DISTINCT pll.product_id
    FROM public.product_label_links pll
    JOIN allowed a ON a.label_id = pll.label_id
    WHERE p_label_id IS NULL OR pll.label_id = p_label_id
  ),
  base AS (
    SELECT p.*
    FROM public.products p
    JOIN matched m ON m.product_id = p.id
    WHERE (p_updated_since IS NULL OR p.updated_at >= p_updated_since)
  ),
  counted AS (SELECT count(*)::bigint AS c FROM base),
  page AS (
    SELECT * FROM base ORDER BY updated_at DESC NULLS LAST, id ASC
    LIMIT v_limit OFFSET v_offset
  )
  SELECT
    (SELECT c FROM counted) AS total_count,
    jsonb_build_object(
      'id', pg.id,
      'sku', pg.sku,
      'name', pg.name,
      'description', pg.description,
      'status', pg.status,
      'stock_status', pg.stock_status,
      'unit', pg.unit,
      'color', pg.color,
      'capacity', pg.capacity,
      'model', pg.model,
      'primary_spec', pg.primary_spec,
      'updated_at', pg.updated_at,
      'brand', (SELECT jsonb_build_object('id', b.id, 'name', b.name)
                FROM public.brands b WHERE b.id = pg.brand_id),
      'category', (SELECT jsonb_build_object('id', c.id, 'name', c.name)
                   FROM public.categories c WHERE c.id = pg.category_id),
      'labels', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', l.id, 'title', l.title, 'color', l.color))
        FROM public.product_label_links pll
        JOIN public.product_labels l ON l.id = pll.label_id
        WHERE pll.product_id = pg.id
      ), '[]'::jsonb),
      'prices', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'sale_price_type_id', spt.id,
          'sale_price_type_title', spt.title,
          'rounded_sale_price', pcp.rounded_sale_price,
          'final_sale_price', pcp.final_sale_price,
          'computed_at', pcp.computed_at
        ))
        FROM public.product_computed_prices pcp
        JOIN public.sale_price_types spt ON spt.id = pcp.sale_price_type_id
        WHERE pcp.product_id = pg.id AND spt.is_active = true
      ), '[]'::jsonb)
    ) AS product
  FROM page pg;
END;
$$;

REVOKE ALL ON FUNCTION public.bot_list_products_for_key(uuid, uuid, timestamptz, integer, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bot_list_products_for_key(uuid, uuid, timestamptz, integer, integer) TO service_role;

-- RPC: single product detail (subject to label allowlist)
CREATE OR REPLACE FUNCTION public.bot_get_product_for_key(
  p_key_id uuid,
  p_product_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed boolean;
  v_result jsonb;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.product_label_links pll
    JOIN public.bot_api_key_label_access kla ON kla.label_id = pll.label_id
    WHERE pll.product_id = p_product_id AND kla.api_key_id = p_key_id
  ) INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'forbidden_product';
  END IF;

  SELECT jsonb_build_object(
    'id', p.id,
    'sku', p.sku,
    'name', p.name,
    'description', p.description,
    'technical_notes', p.technical_notes,
    'status', p.status,
    'stock_status', p.stock_status,
    'unit', p.unit,
    'color', p.color,
    'capacity', p.capacity,
    'model', p.model,
    'primary_spec', p.primary_spec,
    'updated_at', p.updated_at,
    'created_at', p.created_at,
    'brand', (SELECT jsonb_build_object('id', b.id, 'name', b.name) FROM public.brands b WHERE b.id = p.brand_id),
    'category', (SELECT jsonb_build_object('id', c.id, 'name', c.name) FROM public.categories c WHERE c.id = p.category_id),
    'labels', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', l.id, 'title', l.title, 'color', l.color))
      FROM public.product_label_links pll
      JOIN public.product_labels l ON l.id = pll.label_id
      WHERE pll.product_id = p.id
    ), '[]'::jsonb),
    'prices', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'sale_price_type_id', spt.id,
        'sale_price_type_title', spt.title,
        'rounded_sale_price', pcp.rounded_sale_price,
        'final_sale_price', pcp.final_sale_price,
        'computed_at', pcp.computed_at
      ))
      FROM public.product_computed_prices pcp
      JOIN public.sale_price_types spt ON spt.id = pcp.sale_price_type_id
      WHERE pcp.product_id = p.id AND spt.is_active = true
    ), '[]'::jsonb),
    'attributes', COALESCE((
      SELECT jsonb_object_agg(cpa.attribute_key, pcav.value)
      FROM public.product_category_attribute_values pcav
      JOIN public.category_product_attributes cpa ON cpa.id = pcav.category_attribute_id
      WHERE pcav.product_id = p.id
    ), '{}'::jsonb)
  ) INTO v_result
  FROM public.products p
  WHERE p.id = p_product_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.bot_get_product_for_key(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bot_get_product_for_key(uuid, uuid) TO service_role;
