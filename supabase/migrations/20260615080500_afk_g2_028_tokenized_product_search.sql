-- AFK-G2-028 — Tokenized product search
--
-- Goal:
-- - Keep existing product search fields.
-- - Match all search tokens regardless of order.
-- - Allow spaced compound terms such as "لباس شویی" to match "لباسشویی".
-- - Include product labels in the searchable document.
--
-- Rollback:
-- - Re-apply the previous definitions of search_product_ids and get_sales_search_products
--   from migration 20260502132422_cf5715e4-d227-4fe2-9b1f-4fc8623d210a.sql.

CREATE OR REPLACE FUNCTION public.search_tokens_match(p_document text, p_term text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  WITH normalized AS (
    SELECT
      public.normalize_fa_text(p_document) AS document,
      public.normalize_fa_text(p_term) AS term
  ), tokens AS (
    SELECT replace(replace(token, '%', ''), '_', '') AS token
    FROM normalized,
      regexp_split_to_table(COALESCE(normalized.term, ''), '\s+') AS token
    WHERE length(replace(replace(token, '%', ''), '_', '')) >= 2
  )
  SELECT CASE
    WHEN (SELECT term FROM normalized) IS NULL OR length((SELECT term FROM normalized)) < 2 THEN false
    WHEN NOT EXISTS (SELECT 1 FROM tokens) THEN false
    ELSE NOT EXISTS (
      SELECT 1
      FROM tokens
      WHERE COALESCE((SELECT document FROM normalized), '') NOT ILIKE '%' || tokens.token || '%'
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.search_product_ids(p_term text, p_limit integer DEFAULT 200)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_term text := COALESCE(NULLIF(public.normalize_fa_text(p_term), ''), '');
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF length(v_term) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH searchable AS (
    SELECT
      p.id,
      concat_ws(' ',
        p.name,
        p.sku,
        p.model,
        p.color,
        p.capacity,
        p.primary_spec,
        b.name,
        c.name,
        (
          SELECT string_agg(pl.title, ' ')
          FROM product_label_links pll
          JOIN product_labels pl ON pl.id = pll.label_id
          WHERE pll.product_id = p.id
        ),
        (
          SELECT string_agg(pcav.value, ' ')
          FROM product_category_attribute_values pcav
          WHERE pcav.product_id = p.id
            AND pcav.value IS NOT NULL
        )
      ) AS search_document
    FROM products p
    LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN categories c ON c.id = p.category_id
  )
  SELECT DISTINCT searchable.id
  FROM searchable
  WHERE public.search_tokens_match(searchable.search_document, v_term)
  LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_product_ids(text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_sales_search_products(
  p_search text DEFAULT ''::text,
  p_brand_ids uuid[] DEFAULT NULL::uuid[],
  p_category_ids uuid[] DEFAULT NULL::uuid[],
  p_label_ids uuid[] DEFAULT NULL::uuid[],
  p_stock_status text DEFAULT NULL::text,
  p_product_type text DEFAULT NULL::text,
  p_only_with_price boolean DEFAULT false,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, name text, sku text, product_type text, stock_status text,
  color text, capacity text, model text, description text,
  brand jsonb, category jsonb, labels jsonb, prices jsonb,
  is_unavailable_for_sales boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_privileged boolean := false;
  v_is_sales boolean := false;
  v_term text := COALESCE(NULLIF(public.normalize_fa_text(p_search), ''), '');
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

  RETURN QUERY
  WITH searchable AS (
    SELECT
      p.id,
      p.name,
      p.sku,
      p.product_type::text AS product_type,
      p.stock_status::text AS stock_status,
      p.color,
      p.capacity,
      p.model,
      p.description,
      p.brand_id,
      p.category_id,
      concat_ws(' ',
        p.name,
        p.sku,
        p.model,
        p.color,
        p.capacity,
        p.primary_spec,
        b.name,
        c.name,
        (
          SELECT string_agg(pl.title, ' ')
          FROM product_label_links pll
          JOIN product_labels pl ON pl.id = pll.label_id
          WHERE pll.product_id = p.id
            AND (v_is_privileged OR pl.visibility <> 'internal')
        ),
        (
          SELECT string_agg(pcav.value, ' ')
          FROM product_category_attribute_values pcav
          WHERE pcav.product_id = p.id
            AND pcav.value IS NOT NULL
        )
      ) AS search_document
    FROM products p
    LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN categories c ON c.id = p.category_id
  ), base AS (
    SELECT
      s.id,
      s.name,
      s.sku,
      s.product_type,
      s.stock_status,
      s.color,
      s.capacity,
      s.model,
      s.description,
      s.brand_id,
      s.category_id
    FROM searchable s
    WHERE public.search_tokens_match(s.search_document, v_term)
      AND EXISTS (SELECT 1 FROM products p WHERE p.id = s.id AND p.is_active = true)
      AND (p_brand_ids IS NULL OR s.brand_id = ANY(p_brand_ids))
      AND (p_category_ids IS NULL OR s.category_id = ANY(p_category_ids))
      AND (p_stock_status IS NULL OR s.stock_status = p_stock_status)
      AND (p_product_type IS NULL OR s.product_type = p_product_type)
      AND (
        p_label_ids IS NULL
        OR EXISTS (
          SELECT 1 FROM product_label_links pll
          WHERE pll.product_id = s.id AND pll.label_id = ANY(p_label_ids)
        )
      )
      AND (
        v_is_privileged
        OR s.stock_status <> 'unavailable'
        OR EXISTS (SELECT 1 FROM product_computed_prices pcp WHERE pcp.product_id = s.id)
      )
    ORDER BY s.name ASC
    LIMIT v_limit OFFSET v_offset
  ), with_prices AS (
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
    wp.id, wp.name, wp.sku, wp.product_type, wp.stock_status,
    wp.color, wp.capacity, wp.model, wp.description,
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
$function$;
