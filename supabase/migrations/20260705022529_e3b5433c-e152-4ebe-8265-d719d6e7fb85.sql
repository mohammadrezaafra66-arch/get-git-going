DROP FUNCTION IF EXISTS public.search_product_ids(text, integer);

CREATE OR REPLACE FUNCTION public.search_product_ids(
  p_term text,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  name text,
  sku text,
  barcode text,
  stock_status text,
  is_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  v_norm := normalize_fa_text(p_term);

  RETURN QUERY
  SELECT DISTINCT
    p.id,
    p.name,
    p.sku,
    p.barcode,
    p.stock_status::text,
    p.is_active
  FROM products p
  WHERE p.is_active = true
    AND (
      normalize_fa_text(p.name) ILIKE '%' || v_norm || '%'
      OR normalize_fa_text(COALESCE(p.sku, '')) ILIKE '%' || v_norm || '%'
      OR normalize_fa_text(COALESCE(p.barcode, '')) ILIKE '%' || v_norm || '%'
    )
  ORDER BY p.name
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_product_ids(text, integer) TO authenticated, anon;