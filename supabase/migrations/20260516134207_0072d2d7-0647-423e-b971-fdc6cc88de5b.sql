-- ============================================================
-- DT.1 — Computed columns + Torob/Purchista seed + bot upsert
-- ============================================================

-- 1) Add computed-column metadata to dynamic_table_columns
ALTER TABLE public.dynamic_table_columns
  ADD COLUMN IF NOT EXISTS is_computed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS formula_key text,
  ADD COLUMN IF NOT EXISTS formula_config jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$ BEGIN
  ALTER TABLE public.dynamic_table_columns
    ADD CONSTRAINT dynamic_columns_formula_key_whitelist
    CHECK (
      formula_key IS NULL OR formula_key IN (
        'latest_purchase_price_toman',
        'min_sale_price',
        'latest_batch_average_price',
        'price_gap_to_market_avg',
        'price_gap_percent_to_market_avg'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.dynamic_table_columns
    ADD CONSTRAINT dynamic_columns_computed_requires_key
    CHECK ((is_computed = false) OR (formula_key IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Performance indexes for cell lookups (upsert + formula scans)
CREATE INDEX IF NOT EXISTS idx_dyn_cells_text_lookup
  ON public.dynamic_table_cells (column_id, value_text)
  WHERE value_text IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dyn_cells_datetime_desc
  ON public.dynamic_table_cells (column_id, value_datetime DESC)
  WHERE value_datetime IS NOT NULL;

-- 3) Seed the Torob/Purchista table idempotently
DO $$
DECLARE
  _table_id uuid;
  _slug text := 'torob-purchista-extracted-data';
BEGIN
  SELECT id INTO _table_id FROM public.dynamic_tables WHERE slug = _slug;
  IF _table_id IS NULL THEN
    INSERT INTO public.dynamic_tables (name, slug, description, access_level, allowed_roles)
    VALUES (
      'دیتای استخراج شده ترب - پورچیستا',
      _slug,
      'داده‌های استخراج‌شده ربات‌ها از ترب و پورچیستا. ستون‌های فرمولی به‌صورت زنده از قیمت خرید و فروش افراکالا محاسبه می‌شوند.',
      'manager_only',
      '[]'::jsonb
    )
    RETURNING id INTO _table_id;
  END IF;

  -- Helper inserts: data columns
  INSERT INTO public.dynamic_table_columns
    (table_id, column_key, label, data_type, is_required, is_filterable, is_editable_by_bot, sort_order)
  VALUES
    (_table_id, 'source',                 'منبع',                       'status',   true,  true,  true,  1),
    (_table_id, 'extraction_batch_id',    'شناسه دسته استخراج',         'text',     true,  true,  true,  2),
    (_table_id, 'extracted_at',           'زمان استخراج',                'datetime', true,  true,  true,  3),
    (_table_id, 'external_product_id',    'شناسه محصول در منبع',         'text',     false, true,  true,  4),
    (_table_id, 'product_url',            'لینک محصول',                  'text',     false, false, true,  5),
    (_table_id, 'product_title_raw',      'نام خام محصول',               'text',     true,  true,  true,  6),
    (_table_id, 'brand_raw',              'برند خام',                    'text',     false, true,  true,  7),
    (_table_id, 'model_raw',              'مدل خام',                     'text',     false, true,  true,  8),
    (_table_id, 'seller_name',            'نام فروشنده',                 'text',     false, true,  true,  9),
    (_table_id, 'extracted_price_toman',  'قیمت استخراج‌شده',            'number',   false, true,  true, 10),
    (_table_id, 'stock_status_raw',       'وضعیت موجودی خام',           'status',   false, true,  true, 11),
    (_table_id, 'match_key',              'کلید تطبیق محصول',            'text',     false, true,  true, 12),
    (_table_id, 'afrakala_product_id',    'محصول افراکالا',              'text',     false, true,  true, 13),
    (_table_id, 'match_confidence',       'اطمینان تطبیق',               'number',   false, true,  true, 14),
    (_table_id, 'bot_notes',              'یادداشت ربات',                'text',     false, false, true, 15)
  ON CONFLICT (table_id, column_key) DO NOTHING;

  -- Computed/formula columns
  INSERT INTO public.dynamic_table_columns
    (table_id, column_key, label, data_type, is_required, is_filterable, is_editable_by_bot,
     sort_order, is_computed, formula_key)
  VALUES
    (_table_id, 'afrakala_purchase_price_toman', 'قیمت خرید افراکالا',                                'number', false, false, false, 16, true, 'latest_purchase_price_toman'),
    (_table_id, 'afrakala_min_sale_price',       'مینیموم قیمت فروش افراکالا',                       'number', false, false, false, 17, true, 'min_sale_price'),
    (_table_id, 'latest_batch_average_price',    'میانگین قیمت در آخرین دسته استخراج‌شده',           'number', false, false, false, 18, true, 'latest_batch_average_price'),
    (_table_id, 'price_gap_to_market_avg',       'اختلاف با میانگین آخرین استخراج',                   'number', false, false, false, 19, true, 'price_gap_to_market_avg'),
    (_table_id, 'price_gap_percent_to_market_avg','درصد اختلاف با میانگین آخرین استخراج',             'number', false, false, false, 20, true, 'price_gap_percent_to_market_avg')
  ON CONFLICT (table_id, column_key) DO NOTHING;
END $$;

-- 4) Server-side formula evaluator (per-row)
CREATE OR REPLACE FUNCTION public._dyn_compute_row_values(
  p_table_id uuid,
  p_row_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _out jsonb := '{}'::jsonb;
  _col record;
  _afrakala_pid uuid;
  _afrakala_pid_text text;
  _match_key text;
  _source text;
  _grouping_key text;
  _grouping_col_id uuid;
  _source_col_id uuid;
  _extracted_at_col_id uuid;
  _batch_id_col_id uuid;
  _price_col_id uuid;
  _latest_batch text;
  _avg_price numeric;
  _purchase_price numeric;
  _min_sale numeric;
BEGIN
  -- Resolve key column ids ONCE for this table
  SELECT id INTO _source_col_id        FROM public.dynamic_table_columns WHERE table_id = p_table_id AND column_key = 'source';
  SELECT id INTO _extracted_at_col_id  FROM public.dynamic_table_columns WHERE table_id = p_table_id AND column_key = 'extracted_at';
  SELECT id INTO _batch_id_col_id      FROM public.dynamic_table_columns WHERE table_id = p_table_id AND column_key = 'extraction_batch_id';
  SELECT id INTO _price_col_id         FROM public.dynamic_table_columns WHERE table_id = p_table_id AND column_key = 'extracted_price_toman';

  -- Read base values from the current row
  SELECT c.value_text INTO _afrakala_pid_text
  FROM public.dynamic_table_cells c
  JOIN public.dynamic_table_columns col ON col.id = c.column_id
  WHERE c.row_id = p_row_id AND col.column_key = 'afrakala_product_id';

  SELECT c.value_text INTO _match_key
  FROM public.dynamic_table_cells c
  JOIN public.dynamic_table_columns col ON col.id = c.column_id
  WHERE c.row_id = p_row_id AND col.column_key = 'match_key';

  SELECT c.value_text INTO _source
  FROM public.dynamic_table_cells c
  JOIN public.dynamic_table_columns col ON col.id = c.column_id
  WHERE c.row_id = p_row_id AND col.column_key = 'source';

  BEGIN
    _afrakala_pid := NULLIF(btrim(COALESCE(_afrakala_pid_text, '')), '')::uuid;
  EXCEPTION WHEN others THEN
    _afrakala_pid := NULL;
  END;

  -- Latest purchase price (toman) from existing pricing data
  IF _afrakala_pid IS NOT NULL THEN
    SELECT pp.purchase_price INTO _purchase_price
    FROM public.purchase_prices pp
    WHERE pp.product_id = _afrakala_pid
      AND pp.is_active = true
      AND pp.currency = 'toman'::currency_code
    ORDER BY pp.effective_at DESC
    LIMIT 1;

    SELECT MIN(pcp.rounded_sale_price) INTO _min_sale
    FROM public.product_computed_prices pcp
    WHERE pcp.product_id = _afrakala_pid;
  END IF;

  -- Determine grouping key for latest-batch average
  IF _afrakala_pid IS NOT NULL THEN
    _grouping_key := _afrakala_pid_text;
    _grouping_col_id := (SELECT id FROM public.dynamic_table_columns WHERE table_id = p_table_id AND column_key = 'afrakala_product_id');
  ELSIF _match_key IS NOT NULL AND length(btrim(_match_key)) > 0 THEN
    _grouping_key := _match_key;
    _grouping_col_id := (SELECT id FROM public.dynamic_table_columns WHERE table_id = p_table_id AND column_key = 'match_key');
  ELSE
    _grouping_key := NULL;
  END IF;

  -- Find the latest extraction_batch_id (by max extracted_at) for the same source + grouping key
  IF _grouping_key IS NOT NULL AND _source IS NOT NULL
     AND _source_col_id IS NOT NULL AND _extracted_at_col_id IS NOT NULL
     AND _batch_id_col_id IS NOT NULL AND _price_col_id IS NOT NULL THEN
    WITH peer_rows AS (
      SELECT r.id AS row_id
      FROM public.dynamic_table_rows r
      WHERE r.table_id = p_table_id
        AND r.is_active = true
        AND EXISTS (
          SELECT 1 FROM public.dynamic_table_cells cs
          WHERE cs.row_id = r.id AND cs.column_id = _source_col_id AND cs.value_text = _source
        )
        AND EXISTS (
          SELECT 1 FROM public.dynamic_table_cells cg
          WHERE cg.row_id = r.id AND cg.column_id = _grouping_col_id AND cg.value_text = _grouping_key
        )
    ),
    latest AS (
      SELECT cb.value_text AS batch_id
      FROM peer_rows pr
      JOIN public.dynamic_table_cells ce ON ce.row_id = pr.row_id AND ce.column_id = _extracted_at_col_id
      JOIN public.dynamic_table_cells cb ON cb.row_id = pr.row_id AND cb.column_id = _batch_id_col_id
      ORDER BY ce.value_datetime DESC NULLS LAST
      LIMIT 1
    )
    SELECT batch_id INTO _latest_batch FROM latest;

    IF _latest_batch IS NOT NULL THEN
      SELECT AVG(cp.value_number)::numeric INTO _avg_price
      FROM public.dynamic_table_rows r
      JOIN public.dynamic_table_cells cs ON cs.row_id = r.id AND cs.column_id = _source_col_id AND cs.value_text = _source
      JOIN public.dynamic_table_cells cg ON cg.row_id = r.id AND cg.column_id = _grouping_col_id AND cg.value_text = _grouping_key
      JOIN public.dynamic_table_cells cb ON cb.row_id = r.id AND cb.column_id = _batch_id_col_id AND cb.value_text = _latest_batch
      JOIN public.dynamic_table_cells cp ON cp.row_id = r.id AND cp.column_id = _price_col_id
      WHERE r.table_id = p_table_id
        AND r.is_active = true
        AND cp.value_number IS NOT NULL
        AND cp.value_number > 0;
    END IF;
  END IF;

  -- Build output for each computed column in this table
  FOR _col IN
    SELECT column_key, formula_key
    FROM public.dynamic_table_columns
    WHERE table_id = p_table_id AND is_computed = true AND formula_key IS NOT NULL
  LOOP
    IF _col.formula_key = 'latest_purchase_price_toman' THEN
      _out := _out || jsonb_build_object(_col.column_key, to_jsonb(_purchase_price));
    ELSIF _col.formula_key = 'min_sale_price' THEN
      _out := _out || jsonb_build_object(_col.column_key, to_jsonb(_min_sale));
    ELSIF _col.formula_key = 'latest_batch_average_price' THEN
      _out := _out || jsonb_build_object(_col.column_key, to_jsonb(_avg_price));
    ELSIF _col.formula_key = 'price_gap_to_market_avg' THEN
      IF _min_sale IS NOT NULL AND _avg_price IS NOT NULL THEN
        _out := _out || jsonb_build_object(_col.column_key, to_jsonb((_min_sale - _avg_price)::numeric));
      ELSE
        _out := _out || jsonb_build_object(_col.column_key, 'null'::jsonb);
      END IF;
    ELSIF _col.formula_key = 'price_gap_percent_to_market_avg' THEN
      IF _min_sale IS NOT NULL AND _avg_price IS NOT NULL AND _avg_price <> 0 THEN
        _out := _out || jsonb_build_object(
          _col.column_key,
          to_jsonb(round(((_min_sale - _avg_price) / _avg_price * 100)::numeric, 2))
        );
      ELSE
        _out := _out || jsonb_build_object(_col.column_key, 'null'::jsonb);
      END IF;
    END IF;
  END LOOP;

  RETURN _out;
END;
$$;

REVOKE ALL ON FUNCTION public._dyn_compute_row_values(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._dyn_compute_row_values(uuid, uuid) TO authenticated, service_role;

-- 5) v2 query wrapper that merges computed values
CREATE OR REPLACE FUNCTION public.query_dynamic_table_rows_v2(
  p_table_id uuid,
  p_filters jsonb DEFAULT '[]'::jsonb,
  p_search text DEFAULT NULL,
  p_show_inactive boolean DEFAULT false,
  p_limit int DEFAULT 200,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  total_count bigint,
  out_row_id uuid,
  out_row_number bigint,
  out_is_active boolean,
  out_created_at timestamptz,
  out_values jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT q.total_count,
         q.out_row_id,
         q.out_row_number,
         q.out_is_active,
         q.out_created_at,
         COALESCE(q.out_values, '{}'::jsonb)
           || public._dyn_compute_row_values(p_table_id, q.out_row_id)
  FROM public.query_dynamic_table_rows(p_table_id, p_filters, p_search, p_show_inactive, p_limit, p_offset) q;
END;
$$;

REVOKE ALL ON FUNCTION public.query_dynamic_table_rows_v2(uuid, jsonb, text, boolean, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.query_dynamic_table_rows_v2(uuid, jsonb, text, boolean, int, int) TO authenticated;

-- 6) Bot upsert RPC (find by unique_by, then update or create)
CREATE OR REPLACE FUNCTION public.bot_upsert_table_row(
  p_key_id uuid,
  p_table_id uuid,
  p_unique_by text[],
  p_values jsonb
)
RETURNS TABLE (
  out_mode text,
  out_row_id uuid,
  out_row_number bigint,
  out_is_active boolean,
  out_created_at timestamptz,
  out_updated_at timestamptz,
  out_values jsonb
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _can_update boolean;
  _allowed uuid[];
  _key text;
  _col_id uuid;
  _val text;
  _existing_row uuid;
  _candidate uuid;
  _first boolean := true;
BEGIN
  -- Access check (mirrors bot_create_table_row / bot_update_table_row)
  SELECT a.can_update, a.allowed_update_columns
    INTO _can_update, _allowed
  FROM public.bot_api_key_table_access a
  WHERE a.api_key_id = p_key_id AND a.table_id = p_table_id;

  IF _can_update IS NULL THEN RAISE EXCEPTION 'forbidden_table'; END IF;
  IF NOT _can_update THEN RAISE EXCEPTION 'forbidden_update'; END IF;

  IF p_values IS NULL OR jsonb_typeof(p_values) <> 'object' THEN
    RAISE EXCEPTION 'invalid_values';
  END IF;

  IF p_unique_by IS NULL OR array_length(p_unique_by, 1) IS NULL THEN
    RAISE EXCEPTION 'invalid_unique_by';
  END IF;

  -- Reject computed columns explicitly (bot must not try to set them)
  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(p_values) k
    JOIN public.dynamic_table_columns c
      ON c.table_id = p_table_id AND c.column_key = k
    WHERE c.is_computed = true
  ) THEN
    RAISE EXCEPTION 'column_not_allowed:%',
      (SELECT c.column_key
       FROM jsonb_object_keys(p_values) k
       JOIN public.dynamic_table_columns c
         ON c.table_id = p_table_id AND c.column_key = k
       WHERE c.is_computed = true
       LIMIT 1);
  END IF;

  -- Resolve existing row by intersecting cell matches across unique_by
  FOREACH _key IN ARRAY p_unique_by LOOP
    SELECT id INTO _col_id
    FROM public.dynamic_table_columns
    WHERE table_id = p_table_id AND column_key = _key AND is_computed = false;

    IF _col_id IS NULL THEN
      RAISE EXCEPTION 'unknown_column:%', _key;
    END IF;

    IF NOT (p_values ? _key) OR jsonb_typeof(p_values -> _key) = 'null' THEN
      RAISE EXCEPTION 'required_column_missing:%', _key;
    END IF;

    _val := p_values ->> _key;
    IF _val IS NULL OR length(btrim(_val)) = 0 THEN
      RAISE EXCEPTION 'required_column_missing:%', _key;
    END IF;

    IF _first THEN
      SELECT r.id INTO _existing_row
      FROM public.dynamic_table_rows r
      JOIN public.dynamic_table_cells c
        ON c.row_id = r.id AND c.column_id = _col_id AND c.value_text = _val
      WHERE r.table_id = p_table_id
      ORDER BY r.row_number ASC
      LIMIT 2;

      -- Detect ambiguous duplicates early
      IF (SELECT COUNT(*) FROM public.dynamic_table_rows r
          JOIN public.dynamic_table_cells c
            ON c.row_id = r.id AND c.column_id = _col_id AND c.value_text = _val
          WHERE r.table_id = p_table_id) > 1 THEN
        -- continue: will be narrowed by subsequent unique_by keys
        NULL;
      END IF;
      _first := false;
    ELSE
      -- Narrow: keep _existing_row only if it also matches this key
      IF _existing_row IS NOT NULL THEN
        SELECT _existing_row INTO _candidate
        FROM public.dynamic_table_cells
        WHERE row_id = _existing_row AND column_id = _col_id AND value_text = _val;

        IF _candidate IS NULL THEN
          _existing_row := NULL;
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- If still ambiguous after narrowing, refuse
  IF _existing_row IS NOT NULL AND (
    SELECT COUNT(*) FROM public.dynamic_table_rows r
    WHERE r.table_id = p_table_id
      AND (
        SELECT bool_and(EXISTS (
          SELECT 1 FROM public.dynamic_table_cells c
          JOIN public.dynamic_table_columns col ON col.id = c.column_id
          WHERE c.row_id = r.id
            AND col.column_key = uk
            AND c.value_text = (p_values ->> uk)
        )) FROM unnest(p_unique_by) AS uk
      )
  ) > 1 THEN
    RAISE EXCEPTION 'duplicate_match';
  END IF;

  IF _existing_row IS NOT NULL THEN
    -- UPDATE path: delegate to bot_update_table_row
    PERFORM public.bot_update_table_row(p_key_id, p_table_id, _existing_row, p_values);
    RETURN QUERY
    SELECT 'updated'::text,
           r.id, r.row_number, r.is_active, r.created_at, r.updated_at,
           COALESCE(
             (SELECT jsonb_object_agg(
                col.column_key,
                CASE col.data_type::text
                  WHEN 'number'   THEN to_jsonb(c.value_number)
                  WHEN 'boolean'  THEN to_jsonb(c.value_boolean)
                  WHEN 'date'     THEN to_jsonb(c.value_date)
                  WHEN 'datetime' THEN to_jsonb(c.value_datetime)
                  ELSE to_jsonb(c.value_text)
                END)
              FROM public.dynamic_table_cells c
              JOIN public.dynamic_table_columns col ON col.id = c.column_id
              WHERE c.row_id = r.id AND c.table_id = p_table_id),
             '{}'::jsonb)
           || public._dyn_compute_row_values(p_table_id, r.id)
    FROM public.dynamic_table_rows r
    WHERE r.id = _existing_row;
  ELSE
    -- CREATE path: delegate to bot_create_table_row
    RETURN QUERY
    SELECT 'created'::text,
           c.out_row_id, c.out_row_number, c.out_is_active,
           c.out_created_at, c.out_updated_at,
           COALESCE(c.out_values, '{}'::jsonb)
             || public._dyn_compute_row_values(p_table_id, c.out_row_id)
    FROM public.bot_create_table_row(p_key_id, p_table_id, p_values) c;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.bot_upsert_table_row(uuid, uuid, text[], jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bot_upsert_table_row(uuid, uuid, text[], jsonb) TO service_role;
