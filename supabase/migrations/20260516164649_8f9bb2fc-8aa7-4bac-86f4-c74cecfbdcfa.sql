-- =========================================================================
-- DT.7E: Read-time calculation engine for "Product Price Observatory"
-- =========================================================================

-- 1) Patch _dyn_compute_row_values: branch the latest-batch _avg_price logic
--    so that for the observatory table, _avg_price is derived from the row's
--    own torob_avg / purchista_avg cells. Other tables behave exactly as before.
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
  _table_slug text;
BEGIN
  -- Determine table slug (used to switch computation strategy)
  SELECT slug INTO _table_slug FROM public.dynamic_tables WHERE id = p_table_id;

  -- Resolve key column ids ONCE for this table (used in non-observatory path)
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

  IF _table_slug = 'afrakala-product-price-observatory' THEN
    -- Observatory: _avg_price = average of torob_avg + purchista_avg (non-null)
    SELECT AVG(s.x)::numeric INTO _avg_price
    FROM (
      SELECT c.value_number AS x
      FROM public.dynamic_table_cells c
      JOIN public.dynamic_table_columns col ON col.id = c.column_id
      WHERE c.row_id = p_row_id
        AND col.column_key IN ('torob_avg_price_toman','purchista_avg_price_toman')
        AND c.value_number IS NOT NULL
    ) s;
  ELSE
    -- Existing behavior for Torob/Purchista raw extraction table
    IF _afrakala_pid IS NOT NULL THEN
      _grouping_key := _afrakala_pid_text;
      _grouping_col_id := (SELECT id FROM public.dynamic_table_columns WHERE table_id = p_table_id AND column_key = 'afrakala_product_id');
    ELSIF _match_key IS NOT NULL AND length(btrim(_match_key)) > 0 THEN
      _grouping_key := _match_key;
      _grouping_col_id := (SELECT id FROM public.dynamic_table_columns WHERE table_id = p_table_id AND column_key = 'match_key');
    ELSE
      _grouping_key := NULL;
    END IF;

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


-- 2) Observatory-only read-time computer for the 6 placeholder columns
CREATE OR REPLACE FUNCTION public._obs_compute_row_values(p_row_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _table_id uuid;
  _slug text;
  _vals jsonb;
  _torob_avg numeric;
  _purchista_avg numeric;
  _torob_min numeric;
  _purchista_min numeric;
  _stock_status text;
  _product_labels text;
  _afrakala_pid_text text;
  _afrakala_pid uuid;
  _min_sale numeric;
  _market_avg numeric;
  _market_min numeric;
  _gap_to_min numeric;
  _gap_pct numeric;
  _status text;
  _base numeric;
  _score numeric;
  _msg text;
BEGIN
  SELECT r.table_id INTO _table_id FROM public.dynamic_table_rows r WHERE r.id = p_row_id;
  IF _table_id IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT t.slug INTO _slug FROM public.dynamic_tables t WHERE t.id = _table_id;
  IF _slug IS DISTINCT FROM 'afrakala-product-price-observatory' THEN
    RETURN '{}'::jsonb;
  END IF;

  -- Collect needed cells in one pass
  SELECT jsonb_object_agg(
           col.column_key,
           jsonb_build_object('n', c.value_number, 't', c.value_text)
         )
    INTO _vals
  FROM public.dynamic_table_cells c
  JOIN public.dynamic_table_columns col ON col.id = c.column_id
  WHERE c.row_id = p_row_id
    AND col.column_key IN (
      'torob_avg_price_toman','purchista_avg_price_toman',
      'torob_min_price_toman','purchista_min_price_toman',
      'stock_status','product_labels','afrakala_product_id'
    );

  IF _vals IS NULL THEN _vals := '{}'::jsonb; END IF;

  _torob_avg      := NULLIF(_vals->'torob_avg_price_toman'->>'n','')::numeric;
  _purchista_avg  := NULLIF(_vals->'purchista_avg_price_toman'->>'n','')::numeric;
  _torob_min      := NULLIF(_vals->'torob_min_price_toman'->>'n','')::numeric;
  _purchista_min  := NULLIF(_vals->'purchista_min_price_toman'->>'n','')::numeric;
  _stock_status   := _vals->'stock_status'->>'t';
  _product_labels := _vals->'product_labels'->>'t';
  _afrakala_pid_text := _vals->'afrakala_product_id'->>'t';

  BEGIN
    _afrakala_pid := NULLIF(btrim(COALESCE(_afrakala_pid_text,'')),'')::uuid;
  EXCEPTION WHEN others THEN
    _afrakala_pid := NULL;
  END;

  -- afrakala min sale price (same source as 'min_sale_price' formula)
  IF _afrakala_pid IS NOT NULL THEN
    SELECT MIN(pcp.rounded_sale_price) INTO _min_sale
    FROM public.product_computed_prices pcp
    WHERE pcp.product_id = _afrakala_pid;
  END IF;

  -- market_avg
  IF _torob_avg IS NOT NULL AND _purchista_avg IS NOT NULL THEN
    _market_avg := (_torob_avg + _purchista_avg) / 2.0;
  ELSIF _torob_avg IS NOT NULL THEN
    _market_avg := _torob_avg;
  ELSIF _purchista_avg IS NOT NULL THEN
    _market_avg := _purchista_avg;
  END IF;

  -- market_min
  IF _torob_min IS NOT NULL AND _purchista_min IS NOT NULL THEN
    _market_min := LEAST(_torob_min, _purchista_min);
  ELSIF _torob_min IS NOT NULL THEN
    _market_min := _torob_min;
  ELSIF _purchista_min IS NOT NULL THEN
    _market_min := _purchista_min;
  END IF;

  -- price gap to market min
  IF _market_min IS NOT NULL AND _min_sale IS NOT NULL THEN
    _gap_to_min := _min_sale - _market_min;
  END IF;

  -- competitive_price_status
  IF _market_avg IS NULL OR _min_sale IS NULL OR _market_avg = 0 THEN
    _status := 'unknown';
  ELSE
    _gap_pct := (_min_sale - _market_avg) / _market_avg;
    IF _gap_pct <= -0.03 THEN
      _status := 'below_market';
    ELSIF _gap_pct >= 0.03 THEN
      _status := 'above_market';
    ELSE
      _status := 'near_market';
    END IF;
  END IF;

  -- sales_opportunity_score
  IF _market_avg IS NULL OR _min_sale IS NULL OR _market_avg = 0 THEN
    _score := NULL;
  ELSE
    _base := 50;
    _base := _base + GREATEST(-40, LEAST(40, ((_market_avg - _min_sale) / _market_avg) * 100 * 2));
    IF _stock_status IN ('in_stock','available','موجود') THEN
      _base := _base + 10;
    ELSIF _stock_status IN ('out_of_stock','unavailable','ناموجود') THEN
      _base := _base - 30;
    END IF;
    IF _product_labels IS NOT NULL
       AND (_product_labels ILIKE '%پرفروش%' OR _product_labels ILIKE '%ویژه%') THEN
      _base := _base + 5;
    END IF;
    _score := GREATEST(0, LEAST(100, round(_base)));
  END IF;

  -- suggested_sales_message
  _msg := CASE _status
    WHEN 'below_market' THEN 'این محصول از میانگین بازار ارزان‌تر است؛ برای مشتریانی که قیمت را مقایسه می‌کنند گزینه خوبی است.'
    WHEN 'near_market'  THEN 'قیمت این محصول نزدیک به بازار است؛ روی موجودی، گارانتی و سرعت تحویل تأکید کنید.'
    WHEN 'above_market' THEN 'قیمت این محصول بالاتر از میانگین بازار است؛ قبل از پیشنهاد، شرایط فروش یا تخفیف را بررسی کنید.'
    ELSE 'داده بازار کافی برای پیشنهاد قیمت موجود نیست.'
  END;

  RETURN jsonb_build_object(
    'market_avg_price_toman',  to_jsonb(_market_avg),
    'price_gap_to_market_min', to_jsonb(_gap_to_min),
    'competitive_price_status', to_jsonb(_status),
    'sales_opportunity_score', to_jsonb(_score),
    'sales_priority_rank',     'null'::jsonb,
    'suggested_sales_message', to_jsonb(_msg)
  );
END;
$$;

REVOKE ALL ON FUNCTION public._obs_compute_row_values(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._obs_compute_row_values(uuid) TO authenticated, service_role;


-- 3) Patch query_dynamic_table_rows_v2 to merge observatory values
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
DECLARE
  _slug text;
BEGIN
  SELECT slug INTO _slug FROM public.dynamic_tables WHERE id = p_table_id;

  RETURN QUERY
  SELECT q.total_count,
         q.out_row_id,
         q.out_row_number,
         q.out_is_active,
         q.out_created_at,
         COALESCE(q.out_values, '{}'::jsonb)
           || public._dyn_compute_row_values(p_table_id, q.out_row_id)
           || CASE
                WHEN _slug = 'afrakala-product-price-observatory'
                  THEN public._obs_compute_row_values(q.out_row_id)
                ELSE '{}'::jsonb
              END
  FROM public.query_dynamic_table_rows(p_table_id, p_filters, p_search, p_show_inactive, p_limit, p_offset) q;
END;
$$;

REVOKE ALL ON FUNCTION public.query_dynamic_table_rows_v2(uuid, jsonb, text, boolean, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.query_dynamic_table_rows_v2(uuid, jsonb, text, boolean, int, int) TO authenticated;