CREATE OR REPLACE FUNCTION public.sync_product_price_observatory_rows()
 RETURNS TABLE(inserted_rows integer, updated_rows integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_table_id        uuid;
  v_col_pid         uuid;
  v_col_pname       uuid;
  v_col_sku         uuid;
  v_col_brand       uuid;
  v_col_cat         uuid;
  v_col_model       uuid;
  v_col_color       uuid;
  v_col_capacity    uuid;
  v_col_stock       uuid;
  v_col_labels      uuid;
  v_col_iput        uuid;
  v_inserted        int := 0;
  v_updated         int := 0;
  v_row_id          uuid;
  v_next_rownum     bigint;
  r                 record;
  v_labels_text     text;
BEGIN
  SELECT id INTO v_table_id FROM public.dynamic_tables
   WHERE slug = 'afrakala-product-price-observatory';
  IF v_table_id IS NULL THEN
    RAISE EXCEPTION 'observatory table not found';
  END IF;

  -- column ids
  SELECT id INTO v_col_pid      FROM public.dynamic_table_columns WHERE table_id=v_table_id AND column_key='afrakala_product_id';
  SELECT id INTO v_col_pname    FROM public.dynamic_table_columns WHERE table_id=v_table_id AND column_key='product_name';
  SELECT id INTO v_col_sku      FROM public.dynamic_table_columns WHERE table_id=v_table_id AND column_key='sku';
  SELECT id INTO v_col_brand    FROM public.dynamic_table_columns WHERE table_id=v_table_id AND column_key='brand_name';
  SELECT id INTO v_col_cat      FROM public.dynamic_table_columns WHERE table_id=v_table_id AND column_key='category_name';
  SELECT id INTO v_col_model    FROM public.dynamic_table_columns WHERE table_id=v_table_id AND column_key='model';
  SELECT id INTO v_col_color    FROM public.dynamic_table_columns WHERE table_id=v_table_id AND column_key='color';
  SELECT id INTO v_col_capacity FROM public.dynamic_table_columns WHERE table_id=v_table_id AND column_key='capacity';
  SELECT id INTO v_col_stock    FROM public.dynamic_table_columns WHERE table_id=v_table_id AND column_key='stock_status';
  SELECT id INTO v_col_labels   FROM public.dynamic_table_columns WHERE table_id=v_table_id AND column_key='product_labels';
  SELECT id INTO v_col_iput     FROM public.dynamic_table_columns WHERE table_id=v_table_id AND column_key='internal_price_updated_at';

  FOR r IN
    SELECT p.id, p.sku, p.name, p.model, p.color, p.capacity, p.stock_status::text AS stock_status,
           p.updated_at, b.name AS brand_name, c.name AS category_name
      FROM public.products p
      LEFT JOIN public.brands b     ON b.id = p.brand_id
      LEFT JOIN public.categories c ON c.id = p.category_id
     WHERE p.is_active = true AND p.status = 'active'
  LOOP
    -- aggregate labels as comma-separated text (data_type=tag stored in value_text)
    SELECT string_agg(pl.title, '?? ' ORDER BY pl.title)
      INTO v_labels_text
      FROM public.product_label_links pll
      JOIN public.product_labels pl ON pl.id = pll.label_id
     WHERE pll.product_id = r.id AND COALESCE(pl.is_active, true) = true;

    -- find existing row by afrakala_product_id cell
    SELECT cell.row_id INTO v_row_id
      FROM public.dynamic_table_cells cell
      JOIN public.dynamic_table_rows rw ON rw.id = cell.row_id
     WHERE cell.table_id = v_table_id
       AND cell.column_id = v_col_pid
       AND cell.value_text = r.id::text
     LIMIT 1;

    IF v_row_id IS NULL THEN
      SELECT COALESCE(MAX(row_number), 0) + 1 INTO v_next_rownum
        FROM public.dynamic_table_rows WHERE table_id = v_table_id;
      INSERT INTO public.dynamic_table_rows(table_id, row_number, is_active)
      VALUES (v_table_id, v_next_rownum, true)
      RETURNING id INTO v_row_id;
      v_inserted := v_inserted + 1;
    ELSE
      v_updated := v_updated + 1;
    END IF;

    -- upsert system cells only (no bot/computed/user touch)
    INSERT INTO public.dynamic_table_cells(table_id, row_id, column_id, value_text)
    VALUES
      (v_table_id, v_row_id, v_col_pid,      r.id::text),
      (v_table_id, v_row_id, v_col_pname,    r.name),
      (v_table_id, v_row_id, v_col_sku,      r.sku),
      (v_table_id, v_row_id, v_col_brand,    r.brand_name),
      (v_table_id, v_row_id, v_col_cat,      r.category_name),
      (v_table_id, v_row_id, v_col_model,    r.model),
      (v_table_id, v_row_id, v_col_color,    r.color),
      (v_table_id, v_row_id, v_col_capacity, r.capacity),
      (v_table_id, v_row_id, v_col_stock,    r.stock_status),
      (v_table_id, v_row_id, v_col_labels,   v_labels_text)
    ON CONFLICT (row_id, column_id) DO UPDATE
      SET value_text = EXCLUDED.value_text, updated_at = now();

    -- internal_price_updated_at: store products.updated_at as a best-effort proxy
    INSERT INTO public.dynamic_table_cells(table_id, row_id, column_id, value_datetime)
    VALUES (v_table_id, v_row_id, v_col_iput, r.updated_at)
    ON CONFLICT (row_id, column_id) DO UPDATE
      SET value_datetime = EXCLUDED.value_datetime, updated_at = now();
  END LOOP;

  RETURN QUERY SELECT v_inserted, v_updated;
END
$function$

