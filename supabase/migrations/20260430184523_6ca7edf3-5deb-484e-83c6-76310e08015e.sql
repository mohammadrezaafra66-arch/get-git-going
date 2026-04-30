-- RPC: get_sales_search_products
-- Returns enriched product list for sales quick-search page.
CREATE OR REPLACE FUNCTION public.get_sales_search_products(
  p_search text DEFAULT '',
  p_brand_ids uuid[] DEFAULT NULL,
  p_category_ids uuid[] DEFAULT NULL,
  p_label_ids uuid[] DEFAULT NULL,
  p_stock_status text DEFAULT NULL,
  p_product_type text DEFAULT NULL,
  p_only_with_price boolean DEFAULT false,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  name text,
  sku text,
  product_type text,
  stock_status text,
  color text,
  capacity text,
  model text,
  description text,
  brand jsonb,
  category jsonb,
  labels jsonb,
  prices jsonb,
  is_unavailable_for_sales boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_privileged boolean := false;
  v_is_sales boolean := false;
  v_term text := COALESCE(NULLIF(trim(p_search), ''), '');
  v_pattern text;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  v_is_privileged := has_any_role(v_uid, ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role]);
  v_is_sales := has_any_role(v_uid, ARRAY['sales'::app_role]) OR v_is_privileged;

  IF NOT v_is_sales THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF length(v_term) < 2 THEN
    RETURN;
  END IF;

  v_pattern := '%' || replace(replace(v_term, '%', ''), '_', '') || '%';

  RETURN QUERY
  WITH base AS (
    SELECT p.id, p.name, p.sku, p.product_type::text AS product_type,
           p.stock_status::text AS stock_status,
           p.color, p.capacity, p.model, p.description,
           p.brand_id, p.category_id
    FROM products p
    LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.is_active = true
      AND (
        p.name ILIKE v_pattern
        OR (p.sku IS NOT NULL AND p.sku ILIKE v_pattern)
        OR (b.name IS NOT NULL AND b.name ILIKE v_pattern)
        OR (c.name IS NOT NULL AND c.name ILIKE v_pattern)
      )
      AND (p_brand_ids IS NULL OR p.brand_id = ANY(p_brand_ids))
      AND (p_category_ids IS NULL OR p.category_id = ANY(p_category_ids))
      AND (p_stock_status IS NULL OR p.stock_status::text = p_stock_status)
      AND (p_product_type IS NULL OR p.product_type::text = p_product_type)
      AND (
        p_label_ids IS NULL
        OR EXISTS (
          SELECT 1 FROM product_label_links pll
          WHERE pll.product_id = p.id AND pll.label_id = ANY(p_label_ids)
        )
      )
      -- For non-privileged sales: hide products that are unavailable AND have no active price
      AND (
        v_is_privileged
        OR p.stock_status::text <> 'unavailable'
        OR EXISTS (SELECT 1 FROM product_computed_prices pcp WHERE pcp.product_id = p.id)
      )
    ORDER BY p.name ASC
    LIMIT v_limit OFFSET v_offset
  ),
  with_prices AS (
    SELECT b.*,
      (
        SELECT jsonb_agg(jsonb_build_object(
          'sale_price_type_id', spt.id,
          'code', spt.code,
          'title', spt.title,
          'sort_order', spt.sort_order,
          'current_price', pcp.rounded_sale_price,
          'previous_price', (
            SELECT h2.new_sale_price
            FROM product_sale_price_history h2
            WHERE h2.product_id = b.id
              AND h2.sale_price_type_id = spt.id
              AND h2.created_at < (
                SELECT MAX(h3.created_at) FROM product_sale_price_history h3
                WHERE h3.product_id = b.id AND h3.sale_price_type_id = spt.id
              )
            ORDER BY h2.created_at DESC LIMIT 1
          ),
          'last_updated_at', (
            SELECT MAX(h.created_at) FROM product_sale_price_history h
            WHERE h.product_id = b.id AND h.sale_price_type_id = spt.id
          )
        ) ORDER BY spt.sort_order, spt.title)
        FROM sale_price_types spt
        JOIN product_computed_prices pcp ON pcp.product_id = b.id AND pcp.sale_price_type_id = spt.id
        WHERE spt.is_active = true
          AND (NOT (b.stock_status = 'unavailable' AND NOT v_is_privileged))
      ) AS prices_json,
      (b.stock_status = 'unavailable') AS is_unavailable_for_sales
    FROM base b
  )
  SELECT
    wp.id,
    wp.name,
    wp.sku,
    wp.product_type,
    wp.stock_status,
    wp.color,
    wp.capacity,
    wp.model,
    wp.description,
    (SELECT jsonb_build_object('id', br.id, 'name', br.name) FROM brands br WHERE br.id = wp.brand_id) AS brand,
    (SELECT jsonb_build_object('id', ca.id, 'name', ca.name) FROM categories ca WHERE ca.id = wp.category_id) AS category,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', pl.id, 'title', pl.title, 'color', pl.color, 'visibility', pl.visibility))
      FROM product_label_links pll
      JOIN product_labels pl ON pl.id = pll.label_id
      WHERE pll.product_id = wp.id
        AND (v_is_privileged OR pl.visibility <> 'internal')
    ), '[]'::jsonb) AS labels,
    COALESCE(wp.prices_json, '[]'::jsonb) AS prices,
    wp.is_unavailable_for_sales
  FROM with_prices wp
  WHERE (
    NOT p_only_with_price
    OR jsonb_array_length(COALESCE(wp.prices_json, '[]'::jsonb)) > 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_sales_search_products(text, uuid[], uuid[], uuid[], text, text, boolean, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_sales_search_products(text, uuid[], uuid[], uuid[], text, text, boolean, integer, integer) TO authenticated;