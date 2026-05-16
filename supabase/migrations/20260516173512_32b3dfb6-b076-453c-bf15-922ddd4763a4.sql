
CREATE OR REPLACE FUNCTION public.get_observatory_pdf_hints_for_products(p_product_ids uuid[])
RETURNS TABLE(
  product_id uuid,
  has_price_advantage boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _table_id uuid;
  _col_pid uuid;
  _col_show_pdf uuid;
  _col_watch uuid;
BEGIN
  IF p_product_ids IS NULL OR array_length(p_product_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO _table_id
    FROM public.dynamic_tables
   WHERE slug = 'afrakala-product-price-observatory';
  IF _table_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO _col_pid
    FROM public.dynamic_table_columns
   WHERE table_id = _table_id AND column_key = 'afrakala_product_id';
  SELECT id INTO _col_show_pdf
    FROM public.dynamic_table_columns
   WHERE table_id = _table_id AND column_key = 'show_in_pdf';
  SELECT id INTO _col_watch
    FROM public.dynamic_table_columns
   WHERE table_id = _table_id AND column_key = 'is_watch_active';

  IF _col_pid IS NULL OR _col_show_pdf IS NULL OR _col_watch IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH valid_rows AS (
    SELECT r.id AS row_id,
           c_pid.value_text::uuid AS pid
      FROM public.dynamic_table_rows r
      JOIN public.dynamic_table_cells c_pid
        ON c_pid.row_id = r.id AND c_pid.column_id = _col_pid
      JOIN public.dynamic_table_cells c_show
        ON c_show.row_id = r.id AND c_show.column_id = _col_show_pdf
      JOIN public.dynamic_table_cells c_watch
        ON c_watch.row_id = r.id AND c_watch.column_id = _col_watch
     WHERE r.table_id = _table_id
       AND COALESCE(r.is_active, true) = true
       AND COALESCE(c_show.value_boolean, false) = true
       AND COALESCE(c_watch.value_boolean, false) = true
       AND c_pid.value_text ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       AND c_pid.value_text::uuid = ANY (p_product_ids)
  ),
  computed AS (
    SELECT vr.pid AS product_id,
           public._obs_compute_row_values(vr.row_id) AS v
      FROM valid_rows vr
  )
  SELECT c.product_id,
         (
           NULLIF(c.v->>'competitive_price_status','') = 'below_market'
           AND COALESCE(NULLIF(c.v->>'sales_opportunity_score','')::numeric, 0) >= 60
         ) AS has_price_advantage
    FROM computed c;
END;
$$;

REVOKE ALL ON FUNCTION public.get_observatory_pdf_hints_for_products(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_observatory_pdf_hints_for_products(uuid[]) TO authenticated, service_role;
