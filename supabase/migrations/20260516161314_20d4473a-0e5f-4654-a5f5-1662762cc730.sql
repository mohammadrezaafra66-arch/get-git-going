-- ============================================================================
-- DT.7B — Seed «رصدخانه قیمت محصولات افراکالا» Dynamic Table + Backfill
-- Idempotent / Reversible-friendly. No changes to other tables.
-- ============================================================================

DO $mig$
DECLARE
  v_table_id uuid;
BEGIN
  -- 1) Upsert the dynamic table itself
  INSERT INTO public.dynamic_tables (name, slug, description, access_level, allowed_roles, is_active)
  VALUES (
    'رصدخانه قیمت محصولات افراکالا',
    'afrakala-product-price-observatory',
    'نمای تحلیلی محصول‌محور برای مقایسه قیمت داخلی افراکالا با داده‌های بازار و کمک به تیم فروش',
    'sales_only',
    '[]'::jsonb,
    true
  )
  ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name,
        description = EXCLUDED.description,
        access_level = EXCLUDED.access_level,
        is_active = true,
        updated_at = now()
  RETURNING id INTO v_table_id;

  -- 2) Upsert all 35 columns (locked contract per DT.7A-FIX2)
  -- Helper inline INSERTs with ON CONFLICT(table_id, column_key) DO UPDATE.

  WITH cols(sort_order, column_key, label, data_type, is_computed, is_editable_by_bot, formula_key) AS (
    VALUES
      ( 1, 'afrakala_product_id',              'شناسه محصول افراکالا',                'text',     false, false, NULL),
      ( 2, 'product_name',                     'نام محصول',                            'text',     false, false, NULL),
      ( 3, 'sku',                              'کد کالا',                              'text',     false, false, NULL),
      ( 4, 'brand_name',                       'برند',                                 'text',     false, false, NULL),
      ( 5, 'category_name',                    'دسته‌بندی',                            'text',     false, false, NULL),
      ( 6, 'model',                            'مدل',                                  'text',     false, false, NULL),
      ( 7, 'color',                            'رنگ',                                  'text',     false, false, NULL),
      ( 8, 'capacity',                         'ظرفیت / حافظه',                       'text',     false, false, NULL),
      ( 9, 'stock_status',                     'وضعیت موجودی',                         'status',   false, false, NULL),
      (10, 'product_labels',                   'برچسب‌های محصول',                      'tag',      false, false, NULL),
      (11, 'internal_price_updated_at',        'آخرین به‌روزرسانی قیمت داخلی',         'datetime', false, false, NULL),
      (12, 'torob_avg_price_toman',            'میانگین قیمت ترب',                     'number',   false, true,  NULL),
      (13, 'torob_min_price_toman',            'کمترین قیمت ترب',                      'number',   false, true,  NULL),
      (14, 'torob_max_price_toman',            'بیشترین قیمت ترب',                     'number',   false, true,  NULL),
      (15, 'torob_seller_count',               'تعداد فروشنده ترب',                    'number',   false, true,  NULL),
      (16, 'torob_last_seen_at',               'آخرین رصد ترب',                        'datetime', false, true,  NULL),
      (17, 'purchista_avg_price_toman',        'میانگین قیمت پورچیستا',                'number',   false, true,  NULL),
      (18, 'purchista_min_price_toman',        'کمترین قیمت پورچیستا',                 'number',   false, true,  NULL),
      (19, 'purchista_max_price_toman',        'بیشترین قیمت پورچیستا',                'number',   false, true,  NULL),
      (20, 'purchista_last_seen_at',           'آخرین رصد پورچیستا',                   'datetime', false, true,  NULL),
      (21, 'afrakala_purchase_price_toman',    'قیمت خرید افراکالا',                   'number',   true,  false, 'latest_purchase_price_toman'),
      (22, 'afrakala_min_sale_price',          'حداقل قیمت فروش افراکالا',             'number',   true,  false, 'min_sale_price'),
      (23, 'market_avg_price_toman',           'میانگین قیمت بازار',                   'number',   false, false, NULL),
      (24, 'price_gap_to_market_avg',          'اختلاف با میانگین بازار',              'number',   true,  false, 'price_gap_to_market_avg'),
      (25, 'price_gap_percent_to_market_avg',  'اختلاف درصدی با میانگین بازار',        'number',   true,  false, 'price_gap_percent_to_market_avg'),
      (26, 'price_gap_to_market_min',          'اختلاف با کمترین قیمت بازار',          'number',   false, false, NULL),
      (27, 'competitive_price_status',         'وضعیت رقابتی قیمت',                    'status',   false, false, NULL),
      (28, 'sales_opportunity_score',          'امتیاز فرصت فروش',                     'number',   false, false, NULL),
      (29, 'sales_priority_rank',              'رتبه اولویت فروش',                     'number',   false, false, NULL),
      (30, 'suggested_sales_message',          'پیام پیشنهادی برای فروشنده',           'text',     false, false, NULL),
      (31, 'manager_note',                     'یادداشت مدیر',                         'text',     false, false, NULL),
      (32, 'sales_priority_override',          'اولویت دستی فروش',                     'number',   false, false, NULL),
      (33, 'show_in_quick_sales_search',       'نمایش در جستجوی سریع فروش',            'boolean',  false, false, NULL),
      (34, 'show_in_pdf',                      'نمایش در PDF لیست فروش',               'boolean',  false, false, NULL),
      (35, 'is_watch_active',                  'پایش فعال',                            'boolean',  false, false, NULL)
  )
  INSERT INTO public.dynamic_table_columns
    (table_id, column_key, label, data_type, is_required, is_filterable, is_editable_by_bot, is_computed, formula_key, formula_config, sort_order)
  SELECT
    v_table_id,
    c.column_key,
    c.label,
    c.data_type::dynamic_column_data_type,
    false,
    true,
    c.is_editable_by_bot,
    c.is_computed,
    c.formula_key,
    '{}'::jsonb,
    c.sort_order
  FROM cols c
  ON CONFLICT (table_id, column_key) DO UPDATE
    SET label              = EXCLUDED.label,
        data_type          = EXCLUDED.data_type,
        is_editable_by_bot = EXCLUDED.is_editable_by_bot,
        is_computed        = EXCLUDED.is_computed,
        formula_key        = EXCLUDED.formula_key,
        formula_config     = EXCLUDED.formula_config,
        sort_order         = EXCLUDED.sort_order,
        is_filterable      = EXCLUDED.is_filterable;
END
$mig$;

-- ============================================================================
-- 3) Sync function: idempotent backfill of one row per active product
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_product_price_observatory_rows()
RETURNS TABLE(inserted_rows int, updated_rows int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
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
    SELECT string_agg(pl.title, '، ' ORDER BY pl.title)
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
$fn$;

REVOKE ALL ON FUNCTION public.sync_product_price_observatory_rows() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_product_price_observatory_rows() TO service_role;

-- ============================================================================
-- 4) Initial backfill (idempotent — safe to re-run via the function)
-- ============================================================================
SELECT public.sync_product_price_observatory_rows();