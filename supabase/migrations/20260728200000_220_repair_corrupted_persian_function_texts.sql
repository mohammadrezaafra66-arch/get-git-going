-- 220 — repair Persian text destroyed by the 2026-07-11 encoding accident.
--
-- Scope: STRINGS ONLY. Each body below is the live definition read back with
-- pg_get_functiondef, with corrupted string literals restored. No logic, no
-- signature and no argument list is altered -- several of these functions are
-- deliberately OLDER in the database than the newest definition in git, and
-- re-applying git wholesale would change their behaviour.
--
-- Every restored string was verified by re-applying the corruption to the
-- candidate and requiring a byte-exact match with what the database holds.
--
-- Apply with: docker cp + psql -f  (never a PowerShell pipe -- that is what
-- caused the original accident).
SET client_encoding='UTF8';

-- _obs_compute_row_values
CREATE OR REPLACE FUNCTION public._obs_compute_row_values(p_row_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- _validate_allocation_amounts
CREATE OR REPLACE FUNCTION public._validate_allocation_amounts()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.held_amount + NEW.consumed_amount > NEW.final_amount THEN
    RAISE EXCEPTION 'held_amount(%) + consumed_amount(%) از final_amount(%) بیشتر است',
      NEW.held_amount, NEW.consumed_amount, NEW.final_amount;
  END IF;
  RETURN NEW;
END;
$function$;

-- api_dynamic_table_query_rows
CREATE OR REPLACE FUNCTION public.api_dynamic_table_query_rows(p_table_slug text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _table_id uuid;
  _eff_limit int := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
  _eff_offset int := GREATEST(COALESCE(p_offset, 0), 0);
  _total bigint;
  _rows jsonb;
  _filter_key text;
  _filter_val text;
  _col record;
  _where_extra text := '';
  _sql text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_any_role(_uid, ARRAY['admin','manager']::text[]) THEN
    RAISE EXCEPTION 'دسترسی لازم را ندارید.' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO _table_id FROM public.dynamic_tables WHERE slug = p_table_slug AND is_active = true;
  IF _table_id IS NULL THEN
    RAISE EXCEPTION 'جدول یافت نشد یا غیرفعال است.' USING ERRCODE = 'P0002';
  END IF;

  -- Build EXISTS clauses for each filter (only on filterable columns)
  IF p_filters IS NOT NULL AND jsonb_typeof(p_filters) = 'object' THEN
    FOR _filter_key, _filter_val IN
      SELECT key, value::text FROM jsonb_each_text(p_filters)
    LOOP
      SELECT * INTO _col FROM public.dynamic_table_columns
      WHERE table_id = _table_id AND column_key = _filter_key AND is_filterable = true;
      IF NOT FOUND THEN CONTINUE; END IF;

      _where_extra := _where_extra || format(
        ' AND EXISTS (SELECT 1 FROM public.dynamic_table_cells c WHERE c.row_id = r.id AND c.column_id = %L AND %s)',
        _col.id,
        CASE _col.data_type
          WHEN 'number' THEN format('c.value_number = %L::numeric', _filter_val)
          WHEN 'boolean' THEN format('c.value_boolean = %L::boolean',
            CASE WHEN lower(_filter_val) IN ('true','1','yes') THEN 'true' ELSE 'false' END)
          WHEN 'date' THEN format('c.value_date = %L::date', _filter_val)
          WHEN 'datetime' THEN format('c.value_datetime = %L::timestamptz', _filter_val)
          ELSE format('c.value_text = %L', _filter_val)
        END
      );
    END LOOP;
  END IF;

  -- Total count
  EXECUTE format(
    'SELECT count(*) FROM public.dynamic_table_rows r WHERE r.table_id = %L AND r.is_active = true %s',
    _table_id, _where_extra
  ) INTO _total;

  -- Page rows aggregated with cells
  _sql := format($f$
    WITH page AS (
      SELECT r.id, r.row_number
      FROM public.dynamic_table_rows r
      WHERE r.table_id = %L AND r.is_active = true %s
      ORDER BY r.row_number ASC
      LIMIT %s OFFSET %s
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'row_id', p.id,
      'row_number', p.row_number,
      'values', COALESCE((
        SELECT jsonb_object_agg(col.column_key,
          CASE col.data_type
            WHEN 'number' THEN to_jsonb(c.value_number)
            WHEN 'boolean' THEN to_jsonb(c.value_boolean)
            WHEN 'date' THEN to_jsonb(c.value_date)
            WHEN 'datetime' THEN to_jsonb(c.value_datetime)
            ELSE to_jsonb(c.value_text)
          END
        )
        FROM public.dynamic_table_cells c
        JOIN public.dynamic_table_columns col ON col.id = c.column_id
        WHERE c.row_id = p.id
      ), '{}'::jsonb)
    ) ORDER BY p.row_number), '[]'::jsonb)
    FROM page p
  $f$, _table_id, _where_extra, _eff_limit, _eff_offset);

  EXECUTE _sql INTO _rows;

  RETURN jsonb_build_object(
    'table_slug', p_table_slug,
    'total', _total,
    'limit', _eff_limit,
    'offset', _eff_offset,
    'rows', _rows
  );
END; $function$;

-- api_dynamic_table_update_cell
CREATE OR REPLACE FUNCTION public.api_dynamic_table_update_cell(p_table_slug text, p_row_id uuid, p_column_key text, p_value text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _table_id uuid;
  _col record;
  _v_text text; _v_num numeric; _v_bool boolean; _v_date date; _v_dt timestamptz;
  _val text := NULLIF(btrim(COALESCE(p_value, '')), '');
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_any_role(_uid, ARRAY['admin','manager']::text[]) THEN
    RAISE EXCEPTION 'دسترسی لازم را ندارید.' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO _table_id FROM public.dynamic_tables WHERE slug = p_table_slug AND is_active = true;
  IF _table_id IS NULL THEN
    RAISE EXCEPTION 'جدول یافت نشد یا غیرفعال است.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO _col FROM public.dynamic_table_columns
  WHERE table_id = _table_id AND column_key = p_column_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ستون یافت نشد.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT _col.is_editable_by_bot THEN
    RAISE EXCEPTION 'این ستون توسط ربات قابل ویرایش نیست.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.dynamic_table_rows WHERE id = p_row_id AND table_id = _table_id) THEN
    RAISE EXCEPTION 'ردیف یافت نشد.' USING ERRCODE = 'P0002';
  END IF;

  BEGIN
    IF _col.data_type = 'number' THEN _v_num := _val::numeric;
    ELSIF _col.data_type = 'boolean' THEN _v_bool := (_val ILIKE 'true' OR _val = '1' OR _val ILIKE 'yes');
    ELSIF _col.data_type = 'date' THEN _v_date := _val::date;
    ELSIF _col.data_type = 'datetime' THEN _v_dt := _val::timestamptz;
    ELSE _v_text := _val;
    END IF;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'مقدار نامعتبر برای ستون %', _col.label USING ERRCODE = '22023';
  END;

  INSERT INTO public.dynamic_table_cells(
    table_id, row_id, column_id,
    value_text, value_number, value_boolean, value_date, value_datetime
  ) VALUES (
    _table_id, p_row_id, _col.id, _v_text, _v_num, _v_bool, _v_date, _v_dt
  )
  ON CONFLICT (row_id, column_id) DO UPDATE SET
    value_text = EXCLUDED.value_text,
    value_number = EXCLUDED.value_number,
    value_boolean = EXCLUDED.value_boolean,
    value_date = EXCLUDED.value_date,
    value_datetime = EXCLUDED.value_datetime,
    updated_at = now();

  INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
  VALUES (_uid, 'dynamic_table_cells', p_row_id::text, 'dynamic_table_cell_updated',
    jsonb_build_object(
      'table_slug', p_table_slug,
      'column_key', p_column_key,
      'value', p_value
    ));

  RETURN jsonb_build_object('ok', true, 'row_id', p_row_id, 'column_key', p_column_key);
END; $function$;

-- approve_currency_fetch
CREATE OR REPLACE FUNCTION public.approve_currency_fetch(p_fetch_id uuid, p_deactivate_previous boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_fetch currency_rate_fetches%ROWTYPE;
  v_old_rate numeric;
  v_threshold numeric;
  v_diff_pct numeric;
  v_new_rate_id uuid;
  v_source_name text;
  r_user RECORD;
BEGIN
  IF NOT has_any_role(v_user, ARRAY['admin'::text, 'accountant'::text]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_fetch FROM currency_rate_fetches WHERE id = p_fetch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'fetch not found'; END IF;
  IF v_fetch.status <> 'pending_review' THEN RAISE EXCEPTION 'already processed'; END IF;

  -- Latest active rate for diff
  SELECT rate_to_toman INTO v_old_rate
    FROM currency_rates
    WHERE currency = v_fetch.currency AND is_active = true
    ORDER BY effective_at DESC LIMIT 1;

  IF p_deactivate_previous THEN
    UPDATE currency_rates SET is_active = false
      WHERE currency = v_fetch.currency AND is_active = true;
  END IF;

  SELECT name INTO v_source_name FROM currency_sources WHERE id = v_fetch.source_id;

  INSERT INTO currency_rates(currency, rate_to_toman, source_name, is_active, approved_by, approved_at, fetch_source_id)
    VALUES (v_fetch.currency, v_fetch.rate, COALESCE(v_source_name, 'منبع خودکار'), true, v_user, now(), v_fetch.source_id)
    RETURNING id INTO v_new_rate_id;

  UPDATE currency_rate_fetches
    SET status = 'approved', approved_by = v_user, approved_at = now()
    WHERE id = p_fetch_id;

  INSERT INTO audit_logs(action, entity_type, entity_id, actor_id, diff)
    VALUES ('currency_rate_approved', 'currency_rate_fetches', p_fetch_id::text, v_user,
      jsonb_build_object('currency', v_fetch.currency, 'rate', v_fetch.rate, 'old_rate', v_old_rate));

  -- Alert if threshold exceeded
  IF v_old_rate IS NOT NULL AND v_old_rate > 0 THEN
    SELECT COALESCE(NULLIF(value,'')::numeric, 5) INTO v_threshold
      FROM shop_settings WHERE key = 'alert_threshold_percent';
    v_threshold := COALESCE(v_threshold, 5);
    v_diff_pct := abs(v_fetch.rate - v_old_rate) / v_old_rate * 100;

    IF v_diff_pct >= v_threshold THEN
      FOR r_user IN
        SELECT DISTINCT p.id
          FROM profiles p
          JOIN user_roles ur ON ur.user_id = p.id
          WHERE ur.role IN ('admin','accountant')
      LOOP
        INSERT INTO notification_queue(user_id, title, body, type, reference_type, reference_id)
          VALUES (
            r_user.id,
            'هشدار تغییر نرخ ارز',
            format('نرخ %s از %s به %s تغییر کرده است (%s٪)', v_fetch.currency, round(v_old_rate,2), round(v_fetch.rate,2), round(v_diff_pct,2)),
            'system',
            'currency_rates',
            v_new_rate_id
          );
      END LOOP;

      INSERT INTO audit_logs(action, entity_type, entity_id, actor_id, diff)
        VALUES ('currency_rate_alert', 'currency_rates', v_new_rate_id::text, v_user,
          jsonb_build_object('currency', v_fetch.currency, 'old_rate', v_old_rate, 'new_rate', v_fetch.rate, 'diff_pct', v_diff_pct, 'threshold', v_threshold));
    END IF;
  END IF;

  RETURN v_new_rate_id;
END;
$function$;

-- auto_link_supplier_on_purchase
CREATE OR REPLACE FUNCTION public.auto_link_supplier_on_purchase()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.supplier_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.product_suppliers (product_id, supplier_id, is_primary, auto_added, notes)
  VALUES (NEW.product_id, NEW.supplier_id, false, true, 'افزوده‌شده خودکار از ثبت خرید')
  ON CONFLICT (product_id, supplier_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- bot_update_table_row
CREATE OR REPLACE FUNCTION public.bot_update_table_row(p_key_id uuid, p_table_id uuid, p_row_id uuid, p_values jsonb)
 RETURNS TABLE(updated_count integer, applied_keys text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _can_update boolean;
  _allowed uuid[];
  _row_table uuid;
  _key text;
  _val jsonb;
  _col record;
  _applied text[] := '{}'::text[];
  _now timestamptz := now();
BEGIN
  -- Access check
  SELECT a.can_update, a.allowed_update_columns
    INTO _can_update, _allowed
  FROM public.bot_api_key_table_access a
  WHERE a.api_key_id = p_key_id AND a.table_id = p_table_id;

  IF _can_update IS NULL THEN RAISE EXCEPTION 'forbidden_table'; END IF;
  IF NOT _can_update THEN RAISE EXCEPTION 'forbidden_update'; END IF;

  -- Verify row belongs to the table
  SELECT r.table_id INTO _row_table FROM public.dynamic_table_rows r WHERE r.id = p_row_id;
  IF _row_table IS NULL THEN RAISE EXCEPTION 'row_not_found'; END IF;
  IF _row_table <> p_table_id THEN RAISE EXCEPTION 'row_table_mismatch'; END IF;

  IF p_values IS NULL OR jsonb_typeof(p_values) <> 'object' THEN
    RAISE EXCEPTION 'invalid_values';
  END IF;

  -- Iterate keys
  FOR _key, _val IN SELECT key, value FROM jsonb_each(p_values) LOOP
    SELECT c.id, c.column_key, c.label, c.data_type::text AS data_type
      INTO _col
    FROM public.dynamic_table_columns c
    WHERE c.table_id = p_table_id AND c.column_key = _key;

    IF _col.id IS NULL THEN
      RAISE EXCEPTION 'unknown_column:%', _key;
    END IF;
    IF NOT (_col.id = ANY (COALESCE(_allowed, '{}'::uuid[]))) THEN
      RAISE EXCEPTION 'column_not_allowed:%', _key;
    END IF;

    -- Type-aware upsert into dynamic_table_cells
    DECLARE
      _value_text text := NULL;
      _value_number numeric := NULL;
      _value_boolean boolean := NULL;
      _value_date date := NULL;
      _value_datetime timestamptz := NULL;
      _raw_text text;
    BEGIN
      IF _val IS NULL OR jsonb_typeof(_val) = 'null' THEN
        -- Pass: all NULLs → clear cell
        NULL;
      ELSIF _col.data_type = 'number' THEN
        BEGIN
          _value_number := (_val #>> '{}')::numeric;
        EXCEPTION WHEN others THEN
          RAISE EXCEPTION 'invalid_number_for_column:%', _key;
        END;
      ELSIF _col.data_type = 'boolean' THEN
        IF jsonb_typeof(_val) = 'boolean' THEN
          _value_boolean := (_val)::text::boolean;
        ELSE
          _raw_text := lower(_val #>> '{}');
          IF _raw_text IN ('true','1','yes') THEN _value_boolean := true;
          ELSIF _raw_text IN ('false','0','no') THEN _value_boolean := false;
          ELSE RAISE EXCEPTION 'invalid_boolean_for_column:%', _key;
          END IF;
        END IF;
      ELSIF _col.data_type = 'date' THEN
        BEGIN _value_date := (_val #>> '{}')::date;
        EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid_date_for_column:%', _key; END;
      ELSIF _col.data_type = 'datetime' THEN
        BEGIN _value_datetime := (_val #>> '{}')::timestamptz;
        EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid_datetime_for_column:%', _key; END;
      ELSE
        _raw_text := _val #>> '{}';
        IF _raw_text IS NOT NULL AND length(_raw_text) > 10000 THEN
          RAISE EXCEPTION 'value_too_long_for_column:%', _key;
        END IF;
        _value_text := _raw_text;
      END IF;

      INSERT INTO public.dynamic_table_cells
        (table_id, row_id, column_id, value_text, value_number, value_boolean, value_date, value_datetime)
      VALUES
        (p_table_id, p_row_id, _col.id, _value_text, _value_number, _value_boolean, _value_date, _value_datetime)
      ON CONFLICT (row_id, column_id) DO UPDATE SET
        value_text = EXCLUDED.value_text,
        value_number = EXCLUDED.value_number,
        value_boolean = EXCLUDED.value_boolean,
        value_date = EXCLUDED.value_date,
        value_datetime = EXCLUDED.value_datetime,
        updated_at = _now;

      _applied := array_append(_applied, _key);
    END;
  END LOOP;

  -- Touch row
  UPDATE public.dynamic_table_rows SET updated_at = _now WHERE id = p_row_id;

  -- Audit
  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (NULL, 'dynamic_table_row', p_row_id::text, 'bot_row_updated',
          jsonb_build_object(
            'api_key_id', p_key_id,
            'table_id', p_table_id,
            'applied_keys', _applied,
            'values', p_values
          ));

  RETURN QUERY SELECT array_length(_applied, 1) AS updated_count, _applied AS applied_keys;
END;
$function$;

-- check_price_alerts_for_product
CREATE OR REPLACE FUNCTION public.check_price_alerts_for_product(p_product_id uuid, p_sale_price_type_id uuid, p_current_price numeric, p_previous_price numeric DEFAULT NULL::numeric, p_change_percent numeric DEFAULT NULL::numeric)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_triggered integer := 0;
  v_match boolean;
  v_product_name text;
  v_spt_name text;
  v_title text;
  v_message text;
  v_usd_rate numeric;
  v_current_usd numeric;
  v_cooldown interval := interval '6 hours';
BEGIN
  IF p_current_price IS NULL OR p_product_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT name INTO v_product_name FROM products WHERE id = p_product_id;
  IF p_sale_price_type_id IS NOT NULL THEN
    SELECT name INTO v_spt_name FROM sale_price_types WHERE id = p_sale_price_type_id;
  END IF;

  v_usd_rate := public._par_latest_usd_rate();
  IF v_usd_rate IS NOT NULL AND v_usd_rate > 0 THEN
    v_current_usd := p_current_price / v_usd_rate;
  END IF;

  FOR r IN
    SELECT * FROM price_alert_rules
    WHERE product_id = p_product_id
      AND is_active = true
      AND (sale_price_type_id IS NULL OR sale_price_type_id = p_sale_price_type_id)
  LOOP
    v_match := false;

    -- Cooldown for repeatable
    IF r.is_repeatable = true AND r.last_triggered_at IS NOT NULL
       AND r.last_triggered_at > now() - v_cooldown THEN
      CONTINUE;
    END IF;

    -- Evaluate operator
    IF r.operator = 'below_price' AND r.target_value IS NOT NULL THEN
      v_match := p_current_price < r.target_value;
    ELSIF r.operator = 'above_price' AND r.target_value IS NOT NULL THEN
      v_match := p_current_price > r.target_value;
    ELSIF r.operator = 'increase_percent' AND r.target_value IS NOT NULL
          AND p_change_percent IS NOT NULL THEN
      v_match := p_change_percent >= r.target_value;
    ELSIF r.operator = 'decrease_percent' AND r.target_value IS NOT NULL
          AND p_change_percent IS NOT NULL THEN
      v_match := p_change_percent <= -1 * r.target_value;
    ELSIF r.operator = 'below_usd_price' AND r.target_value IS NOT NULL
          AND v_current_usd IS NOT NULL THEN
      v_match := v_current_usd < r.target_value;
    ELSIF r.operator = 'above_usd_price' AND r.target_value IS NOT NULL
          AND v_current_usd IS NOT NULL THEN
      v_match := v_current_usd > r.target_value;
    ELSIF r.operator = 'stock_status_changed' THEN
      -- Stock change is handled by separate path; skip in price-trigger context
      v_match := false;
    END IF;

    IF v_match THEN
      v_title := COALESCE(v_product_name, 'محصول');
      v_message := CASE r.operator
        WHEN 'below_price' THEN format('قیمت %s کمتر از %s تومان شد.', COALESCE(v_product_name,''), to_char(r.target_value,'FM999G999G999G999'))
        WHEN 'above_price' THEN format('قیمت %s بیشتر از %s تومان شد.', COALESCE(v_product_name,''), to_char(r.target_value,'FM999G999G999G999'))
        WHEN 'increase_percent' THEN format('قیمت %s نسبت به آپدیت قبلی %s%% افزایش یافت.', COALESCE(v_product_name,''), to_char(p_change_percent,'FM990D0'))
        WHEN 'decrease_percent' THEN format('قیمت %s نسبت به آپدیت قبلی %s%% کاهش یافت.', COALESCE(v_product_name,''), to_char(abs(p_change_percent),'FM990D0'))
        WHEN 'below_usd_price' THEN format('قیمت دلاری %s کمتر از %s دلار شد.', COALESCE(v_product_name,''), to_char(r.target_value,'FM999G999G999'))
        WHEN 'above_usd_price' THEN format('قیمت دلاری %s بیشتر از %s دلار شد.', COALESCE(v_product_name,''), to_char(r.target_value,'FM999G999G999'))
        ELSE format('شرط هشدار قیمت %s برقرار شد.', COALESCE(v_product_name,''))
      END;

      INSERT INTO price_alert_notifications(
        user_id, alert_rule_id, product_id, sale_price_type_id,
        title, message, current_price, previous_price, change_percent
      ) VALUES (
        r.user_id, r.id, p_product_id, p_sale_price_type_id,
        v_title, v_message, p_current_price, p_previous_price, p_change_percent
      );

      INSERT INTO notification_events(event_type, user_id, channel, payload, status)
      VALUES (
        'price_alert_triggered', r.user_id, 'internal',
        jsonb_build_object(
          'alert_rule_id', r.id,
          'product_id', p_product_id,
          'sale_price_type_id', p_sale_price_type_id,
          'operator', r.operator,
          'target_value', r.target_value,
          'current_price', p_current_price,
          'previous_price', p_previous_price,
          'change_percent', p_change_percent,
          'title', v_title,
          'message', v_message
        ),
        'pending'
      );

      UPDATE price_alert_rules
      SET last_triggered_at = now(),
          triggered_count = triggered_count + 1,
          is_active = CASE WHEN is_repeatable THEN is_active ELSE false END
      WHERE id = r.id;

      v_triggered := v_triggered + 1;
    END IF;
  END LOOP;

  RETURN v_triggered;
END;$function$;

-- claim_next_quote_send_queue_item
CREATE OR REPLACE FUNCTION public.claim_next_quote_send_queue_item()
 RETURNS sales_quote_send_queue
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _row public.sales_quote_send_queue;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_any_role(_uid, ARRAY['admin','manager']::text[]) THEN
    RAISE EXCEPTION 'دسترسی لازم را ندارید.' USING ERRCODE = '42501';
  END IF;

  WITH next_item AS (
    SELECT id
    FROM public.sales_quote_send_queue
    WHERE status = 'pending'
      AND scheduled_at <= now()
      AND attempts < max_attempts
    ORDER BY scheduled_at ASC, created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.sales_quote_send_queue q
  SET status = 'processing',
      locked_at = now(),
      attempts = q.attempts + 1,
      updated_at = now()
  FROM next_item
  WHERE q.id = next_item.id
  RETURNING q.* INTO _row;

  RETURN _row;
END;
$function$;

-- complete_quote_send_queue_item
CREATE OR REPLACE FUNCTION public.complete_quote_send_queue_item(p_queue_id uuid, p_success boolean, p_error text DEFAULT NULL::text)
 RETURNS sales_quote_send_queue
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _row public.sales_quote_send_queue;
  _action text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_any_role(_uid, ARRAY['admin','manager']::text[]) THEN
    RAISE EXCEPTION 'دسترسی لازم را ندارید.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _row FROM public.sales_quote_send_queue WHERE id = p_queue_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'رکورد یافت نشد.' USING ERRCODE = 'P0002';
  END IF;

  IF p_success THEN
    UPDATE public.sales_quote_send_queue
    SET status = 'sent',
        processed_at = now(),
        last_error = NULL,
        locked_at = NULL,
        updated_at = now()
    WHERE id = p_queue_id
    RETURNING * INTO _row;
    _action := 'sales_quote_send_queue_sent';
  ELSE
    IF _row.attempts >= _row.max_attempts THEN
      UPDATE public.sales_quote_send_queue
      SET status = 'failed',
          processed_at = now(),
          last_error = p_error,
          locked_at = NULL,
          updated_at = now()
      WHERE id = p_queue_id
      RETURNING * INTO _row;
      _action := 'sales_quote_send_queue_failed';
    ELSE
      UPDATE public.sales_quote_send_queue
      SET status = 'pending',
          locked_at = NULL,
          last_error = p_error,
          scheduled_at = now() + interval '2 minutes',
          updated_at = now()
      WHERE id = p_queue_id
      RETURNING * INTO _row;
      _action := 'sales_quote_send_queue_retry_scheduled';
    END IF;
  END IF;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (_uid, 'sales_quote_send_queue', _row.id::text, _action,
    jsonb_build_object(
      'quote_id', _row.quote_id,
      'attempts', _row.attempts,
      'max_attempts', _row.max_attempts,
      'status', _row.status,
      'last_error', _row.last_error,
      'scheduled_at', _row.scheduled_at,
      'processed_at', _row.processed_at
    ));

  RETURN _row;
END;
$function$;

-- create_dynamic_table_row
CREATE OR REPLACE FUNCTION public.create_dynamic_table_row(p_table_id uuid, p_values jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _row_id uuid;
  _row_num bigint;
  _col record;
  _val text;
  _v_num numeric;
  _v_bool boolean;
  _v_date date;
  _v_dt timestamptz;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_any_role(_uid, ARRAY['admin','manager']::text[]) THEN
    RAISE EXCEPTION 'دسترسی لازم را ندارید.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dynamic_tables WHERE id = p_table_id AND is_active = true) THEN
    RAISE EXCEPTION 'جدول یافت نشد یا غیرفعال است.' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.dynamic_table_row_counters(table_id, last_value, updated_at)
  VALUES (p_table_id, 1, now())
  ON CONFLICT (table_id) DO UPDATE
    SET last_value = public.dynamic_table_row_counters.last_value + 1,
        updated_at = now()
  RETURNING last_value INTO _row_num;

  INSERT INTO public.dynamic_table_rows(table_id, row_number)
  VALUES (p_table_id, _row_num)
  RETURNING id INTO _row_id;

  FOR _col IN
    SELECT * FROM public.dynamic_table_columns WHERE table_id = p_table_id
  LOOP
    _val := NULLIF(btrim(COALESCE(p_values->>_col.column_key, '')), '');
    IF _val IS NULL THEN
      IF _col.is_required THEN
        RAISE EXCEPTION 'مقدار ستون % الزامی است.', _col.label USING ERRCODE = '22023';
      END IF;
      CONTINUE;
    END IF;

    _v_num := NULL; _v_bool := NULL; _v_date := NULL; _v_dt := NULL;

    BEGIN
      IF _col.data_type = 'number' THEN
        _v_num := _val::numeric;
      ELSIF _col.data_type = 'boolean' THEN
        _v_bool := (_val ILIKE 'true' OR _val = '1' OR _val ILIKE 'yes');
      ELSIF _col.data_type = 'date' THEN
        _v_date := _val::date;
      ELSIF _col.data_type = 'datetime' THEN
        _v_dt := _val::timestamptz;
      END IF;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'مقدار نامعتبر برای ستون %', _col.label USING ERRCODE = '22023';
    END;

    INSERT INTO public.dynamic_table_cells(
      table_id, row_id, column_id,
      value_text, value_number, value_boolean, value_date, value_datetime
    ) VALUES (
      p_table_id, _row_id, _col.id,
      CASE WHEN _col.data_type IN ('number','boolean','date','datetime') THEN NULL ELSE _val END,
      _v_num, _v_bool, _v_date, _v_dt
    );
  END LOOP;

  RETURN _row_id;
END; $function$;

-- customer_clear_person
CREATE OR REPLACE FUNCTION public.customer_clear_person(p_customer_id uuid, p_note text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_person_id uuid;
  v_updated       int;
  v_closed        int;
BEGIN
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'شناسه مشتری الزامی است' USING ERRCODE = '22023';
  END IF;

  SELECT person_id INTO v_old_person_id
  FROM public.customers
  WHERE id = p_customer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'مشتری یافت نشد یا دسترسی به آن ندارید' USING ERRCODE = 'P0002';
  END IF;

  IF v_old_person_id IS NULL THEN
    -- No-op; nothing to clear.
    RETURN false;
  END IF;

  -- Close active customer context link(s) for this customer.
  UPDATE public.person_context_links
     SET ended_at = now(),
         note     = COALESCE(p_note, note)
   WHERE context_kind = 'customer'
     AND ref_table    = 'customers'
     AND ref_id       = p_customer_id
     AND ended_at IS NULL;
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  -- Clear the FK on customers.
  UPDATE public.customers
     SET person_id = NULL
   WHERE id = p_customer_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'دسترسی لازم برای ویرایش این مشتری را ندارید' USING ERRCODE = '42501';
  END IF;

  RETURN true;
END;
$function$;

-- customer_set_person
CREATE OR REPLACE FUNCTION public.customer_set_person(p_customer_id uuid, p_person_id uuid, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_person_id uuid;
  v_existing_link uuid;
  v_new_link      uuid;
  v_updated       int;
BEGIN
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'شناسه مشتری الزامی است' USING ERRCODE = '22023';
  END IF;
  IF p_person_id IS NULL THEN
    RAISE EXCEPTION 'شناسه شخص الزامی است' USING ERRCODE = '22023';
  END IF;

  -- Visibility check via persons RLS (SELECT). Invisible/missing → safe message.
  PERFORM 1 FROM public.persons WHERE id = p_person_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'شخص مرتبط یافت نشد یا دسترسی به آن ندارید' USING ERRCODE = 'P0002';
  END IF;

  -- Read current person_id via customers RLS. Missing/invisible → safe message.
  SELECT person_id INTO v_old_person_id
  FROM public.customers
  WHERE id = p_customer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'مشتری یافت نشد یا دسترسی به آن ندارید' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotent path: same person already linked and an active context link exists.
  IF v_old_person_id IS NOT NULL AND v_old_person_id = p_person_id THEN
    SELECT id INTO v_existing_link
    FROM public.person_context_links
    WHERE person_id    = p_person_id
      AND context_kind = 'customer'
      AND ref_table    = 'customers'
      AND ref_id       = p_customer_id
      AND ended_at IS NULL
    LIMIT 1;

    IF v_existing_link IS NOT NULL THEN
      IF p_note IS NOT NULL THEN
        UPDATE public.person_context_links
           SET note = p_note
         WHERE id = v_existing_link;
      END IF;
      RETURN v_existing_link;
    END IF;
    -- No active link though person_id matches — fall through to create one.
  END IF;

  -- Close active link(s) for this customer regardless of which person they point to,
  -- so the (customer ↔ active person) invariant is maintained.
  UPDATE public.person_context_links
     SET ended_at = now()
   WHERE context_kind = 'customer'
     AND ref_table    = 'customers'
     AND ref_id       = p_customer_id
     AND ended_at IS NULL;

  -- Update customers.person_id (RLS enforced here).
  UPDATE public.customers
     SET person_id = p_person_id
   WHERE id = p_customer_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'دسترسی لازم برای ویرایش این مشتری را ندارید' USING ERRCODE = '42501';
  END IF;

  -- Open a fresh active context link.
  INSERT INTO public.person_context_links(
    person_id, context_kind, ref_table, ref_id, note, started_at, created_by
  )
  VALUES (
    p_person_id, 'customer', 'customers', p_customer_id, p_note, now(), auth.uid()
  )
  RETURNING id INTO v_new_link;

  RETURN v_new_link;
END;
$function$;

-- enforce_no_overdue_on_commitment
CREATE OR REPLACE FUNCTION public.enforce_no_overdue_on_commitment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_check_required boolean := false;
  v_can boolean;
  v_amount numeric;
  v_count integer;
  v_oldest date;
  v_reason text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.commitment_confirmed,false) = true
       OR COALESCE(NEW.invoice_type,'') = 'pre_invoice' THEN
      v_check_required := true;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF COALESCE(NEW.commitment_confirmed,false) = true
       AND COALESCE(OLD.commitment_confirmed,false) = false THEN
      v_check_required := true;
    END IF;
  END IF;

  IF NOT v_check_required THEN
    RETURN NEW;
  END IF;

  IF NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT can_issue, overdue_amount, overdue_count, oldest_due_date, reason
    INTO v_can, v_amount, v_count, v_oldest, v_reason
  FROM public.can_issue_customer_invoice(NEW.customer_id);

  IF v_can = false THEN
    -- توجه: هرگونه INSERT به audit_logs اینجا با همین RAISE rollback می‌شود.
    -- بنابراین audit ثبت بلاک باید سمت UI / فاز جدا با مکانیزم non-transactional انجام شود.
    RAISE EXCEPTION '%', v_reason USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END
$function$;

-- finish_market_rate_ingestion_run
CREATE OR REPLACE FUNCTION public.finish_market_rate_ingestion_run(p_run_id uuid, p_status text, p_fetched integer, p_inserted integer, p_suspect integer, p_error text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'احراز هویت لازم است'; END IF;
  IF NOT (public.has_role(v_uid,'admin'::public.app_role)
       OR public.has_role(v_uid,'manager'::public.app_role)
       OR public.has_role(v_uid,'accountant'::public.app_role)) THEN
    RAISE EXCEPTION 'دسترسی لازم نیست';
  END IF;
  IF p_status NOT IN ('completed','failed','skipped') THEN
    RAISE EXCEPTION 'وضعیت نامعتبر';
  END IF;

  UPDATE public.market_rate_ingestion_runs
     SET status = p_status,
         fetched_count = COALESCE(p_fetched, 0),
         inserted_count = COALESCE(p_inserted, 0),
         suspect_count = COALESCE(p_suspect, 0),
         error_message = p_error,
         finished_at = now()
   WHERE id = p_run_id;
END;
$function$;

-- finish_market_rate_ingestion_run_system
CREATE OR REPLACE FUNCTION public.finish_market_rate_ingestion_run_system(p_run_id uuid, p_status text, p_fetched integer, p_inserted integer, p_suspect integer, p_error text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'system RPC: not callable by authenticated users';
  END IF;
  IF p_status NOT IN ('completed','failed','skipped') THEN
    RAISE EXCEPTION 'وضعیت نامعتبر';
  END IF;

  UPDATE public.market_rate_ingestion_runs
     SET status = p_status,
         fetched_count = COALESCE(p_fetched, 0),
         inserted_count = COALESCE(p_inserted, 0),
         suspect_count = COALESCE(p_suspect, 0),
         error_message = p_error,
         finished_at = now()
   WHERE id = p_run_id;
END;
$function$;

-- gamification_assert_manager
CREATE OR REPLACE FUNCTION public.gamification_assert_manager()
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز: فقط مدیر یا مدیر ارشد می‌تواند داده‌های تحلیلی را ببیند' USING ERRCODE = '42501';
  END IF;
END;
$function$;

-- generate_birthday_notifications
CREATE OR REPLACE FUNCTION public.generate_birthday_notifications()
 RETURNS TABLE(created_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_caller uuid := auth.uid();
  v_template text;
  v_today date := current_date;
  v_count integer := 0;
  r_person record;
  r_recipient record;
  v_title text;
  v_body text;
  v_ref_type text;
  v_ref_id uuid;
  v_exists boolean;
begin
  -- Auth + role gate
  if v_caller is null then
    raise exception 'authentication required';
  end if;
  if not has_any_role(v_caller, array['admin'::text, 'manager'::text, 'accountant'::text]) then
    raise exception 'insufficient privileges';
  end if;

  -- Load message template (fallback if missing)
  select coalesce(nullif(value, ''), '🎂 تولدت مبارک!')
    into v_template
  from public.shop_settings
  where key = 'birthday_message_template'
  limit 1;
  if v_template is null then
    v_template := '🎂 تولدت مبارک!';
  end if;

  -- Iterate customers + users whose birthday matches today (day+month)
  for r_person in
    select 'customer'::text as kind, c.id as person_id, c.name as person_name
      from public.customers c
      where c.birth_date is not null
        and c.is_active = true
        and extract(month from c.birth_date) = extract(month from v_today)
        and extract(day   from c.birth_date) = extract(day   from v_today)
    union all
    select 'user'::text as kind, p.id as person_id,
           coalesce(p.full_name, p.email, 'کاربر') as person_name
      from public.profiles p
      where p.birth_date is not null
        and extract(month from p.birth_date) = extract(month from v_today)
        and extract(day   from p.birth_date) = extract(day   from v_today)
  loop
    v_ref_type := r_person.kind;
    v_ref_id   := r_person.person_id;
    v_title := case r_person.kind
                 when 'customer' then 'تولد مشتری: ' || r_person.person_name
                 else 'تولد کاربر: ' || r_person.person_name
               end;
    v_body  := v_template || E'\n' ||
               case r_person.kind when 'customer' then 'مشتری: ' else 'کاربر: ' end
               || r_person.person_name;

    -- For each admin/accountant recipient
    for r_recipient in
      select distinct ur.user_id
      from public.user_roles ur
      where ur.role in ('admin'::text, 'accountant'::text)
    loop
      -- Dedupe: same recipient, same person, type=birthday, today
      select exists(
        select 1 from public.notification_queue n
        where n.user_id = r_recipient.user_id
          and n.type = 'birthday'
          and n.reference_type = v_ref_type
          and n.reference_id = v_ref_id
          and n.created_at >= v_today::timestamptz
          and n.created_at <  (v_today + 1)::timestamptz
      ) into v_exists;

      if not v_exists then
        insert into public.notification_queue
          (user_id, title, body, type, reference_type, reference_id)
        values
          (r_recipient.user_id, v_title, v_body, 'birthday', v_ref_type, v_ref_id);
        v_count := v_count + 1;

        insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
        values (
          v_caller,
          v_ref_type,
          v_ref_id::text,
          'birthday_notification_sent',
          jsonb_build_object(
            'recipient_id', r_recipient.user_id,
            'person_kind',  v_ref_type,
            'person_id',    v_ref_id,
            'person_name',  r_person.person_name,
            'date',         v_today
          )
        );
      end if;
    end loop;
  end loop;

  return query select v_count;
end;
$function$;

-- get_customer_credit
CREATE OR REPLACE FUNCTION public.get_customer_credit(p_customer_id uuid)
 RETURNS TABLE(available_credit numeric, held_credit numeric, total_purchases numeric, outstanding_balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text, 'accountant'::text, 'sales'::text]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  PERFORM public._ensure_credit_balance(p_customer_id);

  RETURN QUERY
  SELECT
    b.available_credit,
    b.held_credit,
    COALESCE(p.total_purchases, 0)::numeric,
    COALESCE(p.outstanding_balance, 0)::numeric
  FROM public.customer_credit_balance b
  LEFT JOIN public.customer_credit_profile p ON p.customer_id = b.customer_id
  WHERE b.customer_id = p_customer_id;
END;
$function$;

-- guard_accountant_purchase_update
CREATE OR REPLACE FUNCTION public.guard_accountant_purchase_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Admin/manager bypass guard
  IF public.has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text]) THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'accountant'::text) THEN
    -- Accountant may only set paid_at/paid_by; everything else must remain unchanged
    IF NEW.product_id      IS DISTINCT FROM OLD.product_id      OR
       NEW.supplier_id     IS DISTINCT FROM OLD.supplier_id     OR
       NEW.payment_term_id IS DISTINCT FROM OLD.payment_term_id OR
       NEW.purchase_price  IS DISTINCT FROM OLD.purchase_price  OR
       NEW.cash_price      IS DISTINCT FROM OLD.cash_price      OR
       NEW.cash_price_currency IS DISTINCT FROM OLD.cash_price_currency OR
       NEW.currency        IS DISTINCT FROM OLD.currency        OR
       NEW.quantity        IS DISTINCT FROM OLD.quantity        OR
       NEW.purchase_date   IS DISTINCT FROM OLD.purchase_date   OR
       NEW.total_amount    IS DISTINCT FROM OLD.total_amount    OR
       NEW.notes           IS DISTINCT FROM OLD.notes           OR
       NEW.status          IS DISTINCT FROM OLD.status          OR
       NEW.created_by      IS DISTINCT FROM OLD.created_by      OR
       NEW.number          IS DISTINCT FROM OLD.number
    THEN
      RAISE EXCEPTION 'حسابدار فقط مجاز به ثبت زمان پرداخت است';
    END IF;

    IF NEW.paid_at IS NOT NULL AND NEW.paid_by IS NULL THEN
      NEW.paid_by := auth.uid();
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- hold_credit
CREATE OR REPLACE FUNCTION public.hold_credit(p_customer_id uuid, p_amount numeric, p_invoice_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_available numeric;
  v_held numeric;
  v_new_available numeric;
  v_new_held numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'مبلغ باید بزرگتر از صفر باشد';
  END IF;

  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text, 'sales'::text, 'accountant'::text]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  PERFORM public._ensure_credit_balance(p_customer_id);

  SELECT available_credit, held_credit
    INTO v_available, v_held
    FROM public.customer_credit_balance
   WHERE customer_id = p_customer_id
   FOR UPDATE;

  IF v_available < p_amount THEN
    RAISE EXCEPTION 'اعتبار کافی نیست (موجودی: %، درخواست: %)', v_available, p_amount;
  END IF;

  v_new_available := v_available - p_amount;
  v_new_held := v_held + p_amount;

  UPDATE public.customer_credit_balance
     SET available_credit = v_new_available,
         held_credit = v_new_held,
         last_transaction_at = now(),
         updated_at = now()
   WHERE customer_id = p_customer_id;

  INSERT INTO public.customer_credit_ledger
    (customer_id, transaction_type, amount, balance_before, balance_after, reference_type, reference_id, description, created_by)
  VALUES
    (p_customer_id, 'hold', -p_amount, v_available, v_new_available, 'invoice', p_invoice_id, 'مسدودسازی اعتبار برای پیش‌فاکتور', p_user_id);

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, diff)
  VALUES (
    COALESCE(p_user_id, auth.uid()),
    'credit_hold',
    'customer',
    p_customer_id::text,
    jsonb_build_object('amount', p_amount, 'invoice_id', p_invoice_id, 'balance_before', v_available, 'balance_after', v_new_available)
  );
END;
$function$;

-- increase_credit
CREATE OR REPLACE FUNCTION public.increase_credit(p_customer_id uuid, p_amount numeric, p_receipt_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_available numeric;
  v_held numeric;
  v_new_available numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'مبلغ باید بزرگتر از صفر باشد';
  END IF;

  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text, 'accountant'::text]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز برای افزایش اعتبار';
  END IF;

  PERFORM public._ensure_credit_balance(p_customer_id);

  SELECT available_credit, held_credit
    INTO v_available, v_held
    FROM public.customer_credit_balance
   WHERE customer_id = p_customer_id
   FOR UPDATE;

  v_new_available := v_available + p_amount;

  UPDATE public.customer_credit_balance
     SET available_credit = v_new_available,
         last_transaction_at = now(),
         updated_at = now()
   WHERE customer_id = p_customer_id;

  INSERT INTO public.customer_credit_ledger
    (customer_id, transaction_type, amount, balance_before, balance_after, reference_type, reference_id, description, created_by)
  VALUES
    (p_customer_id, 'payment', p_amount, v_available, v_new_available, 'receipt', p_receipt_id, 'افزایش اعتبار با تأیید فیش واریزی', p_user_id);

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, diff)
  VALUES (
    COALESCE(p_user_id, auth.uid()),
    'credit_payment',
    'customer',
    p_customer_id::text,
    jsonb_build_object('amount', p_amount, 'receipt_id', p_receipt_id, 'balance_before', v_available, 'balance_after', v_new_available)
  );
END;
$function$;

-- list_market_rate_ticks_public
CREATE OR REPLACE FUNCTION public.list_market_rate_ticks_public(p_indicator_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 15)
 RETURNS TABLE(id uuid, indicator_id uuid, source_id uuid, value numeric, unit text, observed_at timestamp with time zone, jalali_date_label text, change_amount numeric, change_percent numeric, status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'احراز هویت لازم است'; END IF;
  IF NOT (
       public.has_role(v_uid,'admin'::public.app_role)
    OR public.has_role(v_uid,'manager'::public.app_role)
    OR public.has_role(v_uid,'accountant'::public.app_role)
    OR public.has_role(v_uid,'sales'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'دسترسی به نرخ‌های بازار مجاز نیست';
  END IF;

  RETURN QUERY
  SELECT t.id, t.indicator_id, t.source_id, t.value, t.unit, t.observed_at,
         t.jalali_date_label, t.change_amount, t.change_percent, t.status
  FROM public.market_rate_ticks t
  WHERE t.status = 'accepted'
    AND (p_indicator_id IS NULL OR t.indicator_id = p_indicator_id)
  ORDER BY t.observed_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 15), 1), 50);
END;
$function$;

-- log_invoice_issuance_blocked_overdue
CREATE OR REPLACE FUNCTION public.log_invoice_issuance_blocked_overdue(p_customer_id uuid, p_overdue_amount numeric, p_overdue_count integer, p_oldest_due_date date, p_invoice_type text DEFAULT NULL::text, p_commitment_confirmed boolean DEFAULT NULL::boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_can boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'p_customer_id الزامی است' USING ERRCODE = '22023';
  END IF;

  -- محافظت در برابر لاگ جعلی: فقط اگر مشتری واقعاً معوقه دارد، ثبت شود
  SELECT can_issue INTO v_can
  FROM public.can_issue_customer_invoice(p_customer_id);
  IF v_can IS DISTINCT FROM false THEN
    RETURN;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, diff)
  VALUES (
    v_uid,
    'invoice_issuance_blocked_overdue',
    'invoice',
    p_customer_id::text,
    jsonb_build_object(
      'customer_id', p_customer_id,
      'invoice_type', p_invoice_type,
      'commitment_confirmed', p_commitment_confirmed,
      'overdue_amount', p_overdue_amount,
      'overdue_count', p_overdue_count,
      'oldest_due_date', p_oldest_due_date,
      'source', 'ui_pre_check'
    )
  );
END
$function$;

-- normalize_fa
CREATE OR REPLACE FUNCTION public.normalize_fa(input text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$
  SELECT NULLIF(
    regexp_replace(
      lower(
        translate(
          coalesce(input, ''),
          'كيىﻱﻲﻳﻴةۀﺁﺂﺃﺄإأﺇﺈؤئﺅﺉ' ||
          '٠١٢٣٤٥٦٧٨٩' ||
          '۰۱۲۳۴۵۶۷۸۹' ||
          E'\u200c\u200f\u200e\u064b\u064c\u064d\u064e\u064f\u0650\u0651\u0652',
          'كيييييههاااااايييي' ||
          '0123456789' ||
          '0123456789' ||
          '            '
        )
      ),
      '\s+', ' ', 'g'
    ),
    ''
  );
$function$;

-- notify_on_stock_available
CREATE OR REPLACE FUNCTION public.notify_on_stock_available()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_req record;
  v_prices text;
  v_count int := 0;
BEGIN
  IF NEW.stock_status IS DISTINCT FROM OLD.stock_status
     AND NEW.stock_status = 'available'
     AND OLD.stock_status IN ('unavailable','limited','unknown') THEN

    -- Build price summary string (latest per sale_price_type)
    SELECT string_agg(
             COALESCE(spt.title, 'قیمت') || ': ' || to_char(h.new_sale_price, 'FM999,999,999,999'),
             E'\n'
           )
      INTO v_prices
    FROM (
      SELECT DISTINCT ON (sale_price_type_id)
             sale_price_type_id, new_sale_price
      FROM public.product_sale_price_history
      WHERE product_id = NEW.id
      ORDER BY sale_price_type_id, created_at DESC
    ) h
    LEFT JOIN public.sale_price_types spt ON spt.id = h.sale_price_type_id;

    FOR v_req IN
      SELECT id, salesperson_id, customer_name, customer_phone
      FROM public.stock_alert_requests
      WHERE product_id = NEW.id
        AND status = 'open'
        AND salesperson_id IS NOT NULL
      LIMIT 100
    LOOP
      INSERT INTO public.notification_queue(user_id, title, body, type, reference_type, reference_id)
      VALUES (
        v_req.salesperson_id,
        'موجود شدن کالا',
        'محصول «' || COALESCE(NEW.name, '') || '» موجود شد.' || E'\n' ||
        'مشتری: ' || v_req.customer_name || ' (' || v_req.customer_phone || ')' ||
        CASE WHEN v_prices IS NOT NULL THEN E'\n\nقیمت‌ها:\n' || v_prices ELSE '' END,
        'stock_alert',
        'stock_alert_request',
        v_req.id
      );

      UPDATE public.stock_alert_requests
        SET status = 'notified', updated_at = now()
        WHERE id = v_req.id;

      INSERT INTO public.audit_logs(entity_type, entity_id, action, actor_id, diff)
      VALUES ('stock_alert_request', v_req.id::text, 'stock_alert_notified', auth.uid(),
              jsonb_build_object('product_id', NEW.id, 'salesperson_id', v_req.salesperson_id));

      v_count := v_count + 1;
    END LOOP;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Don't break the product update if notification fails
  RAISE WARNING 'notify_on_stock_available failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

-- post_receipt_accounting
CREATE OR REPLACE FUNCTION public.post_receipt_accounting(p_receipt_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_receipt public.payment_receipts%ROWTYPE;
  v_link record;
  v_paid numeric;
  v_total numeric;
  v_new_status text;
  v_invoice_updates jsonb := '[]'::jsonb;
  v_journal_id uuid;
  v_existing_journal uuid;
  v_debit_kind text;
  v_debit_ref uuid;
  v_debit_desc text;
  v_balance record;
  v_journal_summary jsonb;
  v_receiver_code text;
  v_bank_title text;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::text, 'accountant'::text]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز برای ثبت سند حسابداری فیش';
  END IF;

  SELECT * INTO v_receipt
    FROM public.payment_receipts
   WHERE id = p_receipt_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'فیش یافت نشد';
  END IF;

  IF v_receipt.posting_status = 'posted' THEN
    RETURN jsonb_build_object('already_posted', true, 'posted_at', v_receipt.posted_at);
  END IF;

  IF v_receipt.status <> 'approved' THEN
    RAISE EXCEPTION 'فقط فیش تأییدشده قابل ثبت در حسابداری است';
  END IF;

  IF (v_receipt.destination_bank_account_id IS NULL AND v_receipt.receiver_party_id IS NULL)
     OR (v_receipt.destination_bank_account_id IS NOT NULL AND v_receipt.receiver_party_id IS NOT NULL) THEN
    RAISE EXCEPTION 'برای ثبت سند، باید دقیقاً یکی از «بانک ما» یا «طرف خارجی» به‌عنوان گیرنده انتخاب شده باشد';
  END IF;

  -- Resolve receiver accounting code from chosen receiver entity
  IF v_receipt.receiver_accounting_code IS NOT NULL AND length(trim(v_receipt.receiver_accounting_code)) > 0 THEN
    v_receiver_code := v_receipt.receiver_accounting_code;
  ELSIF v_receipt.receiver_party_id IS NOT NULL THEN
    SELECT accounting_code INTO v_receiver_code FROM public.external_parties WHERE id = v_receipt.receiver_party_id;
  ELSIF v_receipt.destination_bank_account_id IS NOT NULL THEN
    -- Migration 155: bank_accounts.accounting_code now EXISTS, so the bank
    -- receiver resolves its code exactly the way the external-party branch
    -- above does. Migration 149 wrote NULL here only because the column did
    -- not exist at the time; that is no longer true.
    SELECT accounting_code, title
      INTO v_receiver_code, v_bank_title
      FROM public.bank_accounts
     WHERE id = v_receipt.destination_bank_account_id;

    -- Refuse rather than post a blank code.
    --
    -- The generic receiver_accounting_code check further down would also stop
    -- this, but only while that validation_rule stays enabled, and its stored
    -- message is one of the strings corrupted on 2026-07-11, so it cannot tell
    -- the accountant what to actually do. This check is unconditional and
    -- names the account, because a journal entry carrying an empty receiver
    -- code is worse than a refused receipt: it is a silent hole in the ledger
    -- that nobody is ever prompted to fix.
    IF v_receiver_code IS NULL OR length(trim(v_receiver_code)) = 0 THEN
      RAISE EXCEPTION
        'کد حسابداری برای حساب بانکی «%» ثبت نشده است. ابتدا در صفحهٔ «حساب‌های بانکی» کد حسابداری این حساب را وارد کنید، سپس فیش را دوباره ثبت کنید.',
        COALESCE(v_bank_title, '?')
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Enforce blocking rules from validation_rules for journal_entry scope
  IF EXISTS (
    SELECT 1 FROM public.validation_rules
    WHERE scope='journal_entry' AND enabled AND severity='blocking'
      AND field_key='payer_accounting_code' AND rule_type='required'
  ) AND (v_receipt.payer_accounting_code IS NULL OR length(trim(v_receipt.payer_accounting_code)) = 0) THEN
    RAISE EXCEPTION 'کد آسان واریزکننده برای ثبت سند حسابداری اجباری است.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.validation_rules
    WHERE scope='journal_entry' AND enabled AND severity='blocking'
      AND field_key='receiver_accounting_code' AND rule_type='required'
  ) AND (v_receiver_code IS NULL OR length(trim(v_receiver_code)) = 0) THEN
    RAISE EXCEPTION 'کد آسان گیرنده برای ثبت سند حسابداری اجباری است.';
  END IF;

  UPDATE public.payment_receipts
     SET posting_status = 'posted',
         posted_at = now()
   WHERE id = p_receipt_id;

  PERFORM public.increase_credit(
    v_receipt.customer_id,
    v_receipt.amount,
    v_receipt.id,
    p_user_id
  );

  -- Allocate to invoices
  FOR v_link IN
    SELECT prl.invoice_id, prl.amount AS link_amount, i.total_amount, i.status
      FROM public.payment_receipt_links prl
      JOIN public.invoices i ON i.id = prl.invoice_id
     WHERE prl.receipt_id = p_receipt_id
  LOOP
    SELECT COALESCE(SUM(amount), 0) INTO v_paid
      FROM public.payment_receipt_links
     WHERE invoice_id = v_link.invoice_id;

    v_total := v_link.total_amount;
    IF v_paid >= v_total THEN
      v_new_status := 'paid';
    ELSIF v_paid > 0 THEN
      v_new_status := 'partially_paid';
    ELSE
      v_new_status := 'unpaid';
    END IF;

    UPDATE public.invoices SET status = v_new_status WHERE id = v_link.invoice_id;

    v_invoice_updates := v_invoice_updates || jsonb_build_object(
      'invoice_id', v_link.invoice_id,
      'paid_total', v_paid,
      'new_status', v_new_status
    );
  END LOOP;

  -- Create journal entry (idempotent)
  SELECT id INTO v_existing_journal
    FROM public.journal_entries
   WHERE source_type = 'payment_receipt' AND source_id = v_receipt.id;

  IF v_existing_journal IS NULL THEN
    IF v_receipt.destination_bank_account_id IS NOT NULL THEN
      v_debit_kind := 'bank';
      v_debit_ref  := v_receipt.destination_bank_account_id;
      v_debit_desc := 'واریز به حساب بانکی شرکت';
    ELSE
      v_debit_kind := 'external_party';
      v_debit_ref  := v_receipt.receiver_party_id;
      v_debit_desc := 'پرداخت به طرف خارجی';
    END IF;

    INSERT INTO public.journal_entries(
      source_type, source_id, entry_date, description, status, posted_by,
      payer_accounting_code, receiver_accounting_code
    )
    VALUES (
      'payment_receipt', v_receipt.id, v_receipt.payment_date,
      'سند فیش واریزی شماره ' || v_receipt.tracking_number, 'posted', p_user_id,
      NULLIF(trim(COALESCE(v_receipt.payer_accounting_code,'')), ''),
      NULLIF(trim(COALESCE(v_receiver_code,'')), '')
    )
    RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_lines(journal_entry_id, line_no, account_kind, account_ref_id, debit, credit, description)
    VALUES
      (v_journal_id, 1, v_debit_kind, v_debit_ref, v_receipt.amount, 0, v_debit_desc),
      (v_journal_id, 2, 'customer_credit', v_receipt.customer_id, 0, v_receipt.amount, 'افزایش اعتبار/کاهش بدهی مشتری');
  ELSE
    v_journal_id := v_existing_journal;
    UPDATE public.journal_entries
       SET payer_accounting_code = COALESCE(payer_accounting_code, NULLIF(trim(COALESCE(v_receipt.payer_accounting_code,'')), '')),
           receiver_accounting_code = COALESCE(receiver_accounting_code, NULLIF(trim(COALESCE(v_receiver_code,'')), ''))
     WHERE id = v_journal_id;
  END IF;

  SELECT public.get_customer_credit(v_receipt.customer_id) INTO v_balance;

  v_journal_summary := jsonb_build_object(
    'journal_id', v_journal_id,
    'debit_kind', v_debit_kind,
    'debit_ref', v_debit_ref
  );

  RETURN jsonb_build_object(
    'posted', true,
    'invoice_updates', v_invoice_updates,
    'customer_credit', row_to_json(v_balance),
    'journal', v_journal_summary
  );
END;
$function$;

-- preview_league_season_changes
CREATE OR REPLACE FUNCTION public.preview_league_season_changes(_season_id uuid)
 RETURNS TABLE(employee_id uuid, full_name text, current_tier league_tier, score numeric, rank_in_tier integer, suggested_action text, target_tier league_tier)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF NOT (has_role(v_uid, 'admin') OR has_role(v_uid, 'manager')) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  RETURN QUERY
  WITH ranked AS (
    SELECT
      el.employee_id,
      el.league AS current_tier,
      el.score,
      ROW_NUMBER() OVER (PARTITION BY el.league ORDER BY el.score DESC, el.employee_id) AS rnk,
      COUNT(*)    OVER (PARTITION BY el.league) AS total_in_tier
    FROM public.employee_leagues el
    WHERE el.season_id = _season_id
    LIMIT 5000
  ),
  tiers AS (
    SELECT tier, sort_order, promotion_percent, demotion_percent
    FROM public.league_settings
    WHERE tier IS NOT NULL AND is_active = true
  ),
  decided AS (
    SELECT
      r.employee_id,
      r.current_tier,
      r.score,
      r.rnk::int AS rank_in_tier,
      CASE
        WHEN r.rnk <= GREATEST(1, FLOOR(r.total_in_tier * t.promotion_percent / 100.0))
             AND EXISTS (SELECT 1 FROM tiers tu WHERE tu.sort_order = t.sort_order + 1)
          THEN 'promote'
        WHEN r.rnk > (r.total_in_tier - GREATEST(0, FLOOR(r.total_in_tier * t.demotion_percent / 100.0)))
             AND EXISTS (SELECT 1 FROM tiers td WHERE td.sort_order = t.sort_order - 1)
          THEN 'demote'
        ELSE 'stay'
      END AS suggested_action,
      t.sort_order AS cur_order
    FROM ranked r
    JOIN tiers t ON t.tier = r.current_tier
  )
  SELECT
    d.employee_id,
    COALESCE(p.full_name, p.email, d.employee_id::text) AS full_name,
    d.current_tier,
    d.score,
    d.rank_in_tier,
    d.suggested_action,
    CASE d.suggested_action
      WHEN 'promote' THEN (SELECT tier FROM tiers WHERE sort_order = d.cur_order + 1)
      WHEN 'demote'  THEN (SELECT tier FROM tiers WHERE sort_order = d.cur_order - 1)
      ELSE d.current_tier
    END AS target_tier
  FROM decided d
  LEFT JOIN public.profiles p ON p.id = d.employee_id
  ORDER BY d.cur_order DESC, d.rank_in_tier ASC
  LIMIT 5000;
END$function$;

-- record_external_market_rate_tick
CREATE OR REPLACE FUNCTION public.record_external_market_rate_tick(p_indicator_id uuid, p_source_id uuid, p_value numeric, p_observed_at timestamp with time zone, p_source_reported_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_raw_payload jsonb DEFAULT NULL::jsonb, p_unit text DEFAULT 'toman'::text)
 RETURNS TABLE(tick_id uuid, status_out text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_prev numeric; v_change_amt numeric; v_change_pct numeric;
  v_status text := 'accepted'; v_note text;
  v_id uuid; v_ic text; v_sc text; v_conf numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'احراز هویت لازم است'; END IF;
  IF NOT (public.has_role(v_uid,'admin'::public.app_role)
       OR public.has_role(v_uid,'manager'::public.app_role)
       OR public.has_role(v_uid,'accountant'::public.app_role)) THEN
    RAISE EXCEPTION 'دسترسی لازم برای ثبت نرخ خارجی نیست';
  END IF;
  IF p_value IS NULL OR p_value <= 0 THEN
    RAISE EXCEPTION 'مقدار نامعتبر برای نرخ خارجی';
  END IF;

  -- Previous accepted rate for change calc + suspect threshold
  SELECT value INTO v_prev FROM public.market_rate_ticks
   WHERE indicator_id = p_indicator_id AND status = 'accepted'
   ORDER BY observed_at DESC LIMIT 1;

  IF v_prev IS NOT NULL THEN
    v_change_amt := p_value - v_prev;
    v_change_pct := (v_change_amt / v_prev) * 100;
    IF abs(v_change_pct) > 3 THEN
      v_status := 'suspect';
      v_note := 'تغییر بیش از ۳٪ نسبت به آخرین نرخ تأییدشده';
    END IF;
  END IF;

  IF p_source_reported_at IS NOT NULL AND p_source_reported_at < now() - interval '24 hours' THEN
    v_status := 'suspect';
    v_note := COALESCE(v_note || ' | ', '') || 'داده منبع قدیمی‌تر از ۲۴ ساعت';
  END IF;

  SELECT confidence_weight INTO v_conf FROM public.market_rate_sources WHERE id = p_source_id;

  INSERT INTO public.market_rate_ticks
    (indicator_id, source_id, value, unit, observed_at, source_reported_at,
     change_amount, change_percent, status, note, raw_payload, confidence_score, created_by)
  VALUES (p_indicator_id, p_source_id, p_value, COALESCE(p_unit,'toman'), p_observed_at, p_source_reported_at,
     v_change_amt, v_change_pct, v_status, v_note, p_raw_payload, v_conf, v_uid)
  RETURNING id INTO v_id;

  SELECT code INTO v_ic FROM public.market_indicators WHERE id = p_indicator_id;
  SELECT code INTO v_sc FROM public.market_rate_sources WHERE id = p_source_id;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (v_uid, 'market_rate_tick', v_id, 'market_rate_external_ingested',
    jsonb_build_object(
      'indicator_code', v_ic, 'source_code', v_sc,
      'value', p_value, 'unit', COALESCE(p_unit,'toman'),
      'observed_at', p_observed_at, 'source_reported_at', p_source_reported_at,
      'status', v_status, 'change_percent', v_change_pct
    ));

  RETURN QUERY SELECT v_id, v_status;
END;
$function$;

-- record_external_market_rate_tick_system
CREATE OR REPLACE FUNCTION public.record_external_market_rate_tick_system(p_indicator_id uuid, p_source_id uuid, p_value numeric, p_observed_at timestamp with time zone, p_source_reported_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_raw_payload jsonb DEFAULT NULL::jsonb, p_unit text DEFAULT 'toman'::text)
 RETURNS TABLE(tick_id uuid, status_out text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_prev numeric; v_change_amt numeric; v_change_pct numeric;
  v_status text := 'accepted'; v_note text;
  v_id uuid; v_ic text; v_sc text; v_conf numeric;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'system RPC: not callable by authenticated users';
  END IF;
  IF p_value IS NULL OR p_value <= 0 THEN
    RAISE EXCEPTION 'مقدار نامعتبر برای نرخ خارجی';
  END IF;

  SELECT value INTO v_prev FROM public.market_rate_ticks
   WHERE indicator_id = p_indicator_id AND status = 'accepted'
   ORDER BY observed_at DESC LIMIT 1;

  IF v_prev IS NOT NULL THEN
    v_change_amt := p_value - v_prev;
    v_change_pct := (v_change_amt / v_prev) * 100;
    IF abs(v_change_pct) > 3 THEN
      v_status := 'suspect';
      v_note := 'تغییر بیش از ۳٪ نسبت به آخرین نرخ تأییدشده';
    END IF;
  END IF;

  IF p_source_reported_at IS NOT NULL AND p_source_reported_at < now() - interval '24 hours' THEN
    v_status := 'suspect';
    v_note := COALESCE(v_note || ' | ', '') || 'داده منبع قدیمی‌تر از ۲۴ ساعت';
  END IF;

  SELECT confidence_weight INTO v_conf FROM public.market_rate_sources WHERE id = p_source_id;

  INSERT INTO public.market_rate_ticks
    (indicator_id, source_id, value, unit, observed_at, source_reported_at,
     change_amount, change_percent, status, note, raw_payload, confidence_score, created_by)
  VALUES (p_indicator_id, p_source_id, p_value, COALESCE(p_unit,'toman'), p_observed_at, p_source_reported_at,
     v_change_amt, v_change_pct, v_status, v_note, p_raw_payload, v_conf, NULL)
  RETURNING id INTO v_id;

  SELECT code INTO v_ic FROM public.market_indicators WHERE id = p_indicator_id;
  SELECT code INTO v_sc FROM public.market_rate_sources WHERE id = p_source_id;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (NULL, 'market_rate_tick', v_id, 'market_rate_external_ingested_system',
    jsonb_build_object(
      'indicator_code', v_ic, 'source_code', v_sc,
      'value', p_value, 'unit', COALESCE(p_unit,'toman'),
      'observed_at', p_observed_at, 'source_reported_at', p_source_reported_at,
      'status', v_status, 'change_percent', v_change_pct,
      'initiated_by', 'system_cron'
    ));

  RETURN QUERY SELECT v_id, v_status;
END;
$function$;

-- record_market_rate_tick
CREATE OR REPLACE FUNCTION public.record_market_rate_tick(p_indicator_id uuid, p_source_id uuid, p_value numeric, p_observed_at timestamp with time zone, p_status text DEFAULT 'accepted'::text, p_note text DEFAULT NULL::text, p_unit text DEFAULT 'toman'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_prev numeric; v_change_amt numeric; v_change_pct numeric;
  v_id uuid; v_ic text; v_sc text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'احراز هویت لازم است'; END IF;
  IF NOT (public.has_role(v_uid,'admin'::public.app_role)
       OR public.has_role(v_uid,'manager'::public.app_role)
       OR public.has_role(v_uid,'accountant'::public.app_role)) THEN
    RAISE EXCEPTION 'دسترسی لازم برای ثبت نرخ وجود ندارد';
  END IF;
  IF p_value IS NULL OR p_value <= 0 THEN RAISE EXCEPTION 'مقدار نرخ باید بزرگ‌تر از صفر باشد'; END IF;
  IF p_status NOT IN ('accepted','suspect','rejected') THEN RAISE EXCEPTION 'وضعیت نامعتبر'; END IF;

  SELECT value INTO v_prev FROM public.market_rate_ticks
  WHERE indicator_id = p_indicator_id AND status = 'accepted'
  ORDER BY observed_at DESC LIMIT 1;

  IF v_prev IS NOT NULL THEN
    v_change_amt := p_value - v_prev;
    v_change_pct := (v_change_amt / v_prev) * 100;
  END IF;

  INSERT INTO public.market_rate_ticks
    (indicator_id, source_id, value, unit, observed_at, change_amount, change_percent, status, note, created_by)
  VALUES (p_indicator_id, p_source_id, p_value, COALESCE(p_unit,'toman'), p_observed_at, v_change_amt, v_change_pct, p_status, p_note, v_uid)
  RETURNING id INTO v_id;

  SELECT code INTO v_ic FROM public.market_indicators WHERE id = p_indicator_id;
  SELECT code INTO v_sc FROM public.market_rate_sources WHERE id = p_source_id;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (v_uid, 'market_rate_tick', v_id::text, 'market_rate_created',
    jsonb_build_object('indicator_code', v_ic, 'source_code', v_sc, 'value', p_value,
      'unit', COALESCE(p_unit,'toman'), 'observed_at', p_observed_at, 'status', p_status,
      'change_amount', v_change_amt, 'change_percent', v_change_pct));

  RETURN v_id;
END; $function$;

-- release_credit
CREATE OR REPLACE FUNCTION public.release_credit(p_customer_id uuid, p_amount numeric, p_invoice_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_available numeric;
  v_held numeric;
  v_new_available numeric;
  v_new_held numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'مبلغ باید بزرگتر از صفر باشد';
  END IF;

  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text, 'sales'::text, 'accountant'::text]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  PERFORM public._ensure_credit_balance(p_customer_id);

  SELECT available_credit, held_credit
    INTO v_available, v_held
    FROM public.customer_credit_balance
   WHERE customer_id = p_customer_id
   FOR UPDATE;

  v_new_available := v_available + p_amount;
  v_new_held := GREATEST(v_held - p_amount, 0);

  UPDATE public.customer_credit_balance
     SET available_credit = v_new_available,
         held_credit = v_new_held,
         last_transaction_at = now(),
         updated_at = now()
   WHERE customer_id = p_customer_id;

  INSERT INTO public.customer_credit_ledger
    (customer_id, transaction_type, amount, balance_before, balance_after, reference_type, reference_id, description, created_by)
  VALUES
    (p_customer_id, 'release', p_amount, v_available, v_new_available, 'invoice', p_invoice_id, 'آزادسازی اعتبار از پیش‌فاکتور', p_user_id);

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, diff)
  VALUES (
    COALESCE(p_user_id, auth.uid()),
    'credit_release',
    'customer',
    p_customer_id::text,
    jsonb_build_object('amount', p_amount, 'invoice_id', p_invoice_id, 'balance_before', v_available, 'balance_after', v_new_available)
  );
END;
$function$;

-- release_stale_quote_send_locks
CREATE OR REPLACE FUNCTION public.release_stale_quote_send_locks()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _count integer := 0;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_any_role(_uid, ARRAY['admin','manager']::text[]) THEN
    RAISE EXCEPTION 'دسترسی لازم را ندارید.' USING ERRCODE = '42501';
  END IF;

  WITH released AS (
    UPDATE public.sales_quote_send_queue
    SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
        locked_at = NULL,
        last_error = 'Processing lock expired',
        processed_at = CASE WHEN attempts >= max_attempts THEN now() ELSE processed_at END,
        updated_at = now()
    WHERE status = 'processing'
      AND locked_at IS NOT NULL
      AND locked_at < now() - interval '10 minutes'
    RETURNING id
  )
  SELECT count(*) INTO _count FROM released;

  RETURN _count;
END;
$function$;

-- requeue_failed_quote_send_item
CREATE OR REPLACE FUNCTION public.requeue_failed_quote_send_item(p_queue_id uuid)
 RETURNS sales_quote_send_queue
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _row public.sales_quote_send_queue;
  _old public.sales_quote_send_queue;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_any_role(_uid, ARRAY['admin','manager']::text[]) THEN
    RAISE EXCEPTION 'دسترسی لازم را ندارید.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _old FROM public.sales_quote_send_queue WHERE id = p_queue_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'رکورد یافت نشد.' USING ERRCODE = 'P0002';
  END IF;
  IF _old.status <> 'failed' THEN
    RAISE EXCEPTION 'فقط رکوردهای ناموفق قابل بازگردانی هستند.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.sales_quote_send_queue
  SET status = 'pending',
      scheduled_at = now(),
      locked_at = NULL,
      processed_at = NULL,
      last_error = NULL,
      updated_at = now()
  WHERE id = p_queue_id
  RETURNING * INTO _row;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (_uid, 'sales_quote_send_queue', _row.id::text, 'sales_quote_send_queue_requeued',
    jsonb_build_object(
      'quote_id', _row.quote_id,
      'attempts', _row.attempts,
      'max_attempts', _row.max_attempts,
      'old_status', _old.status,
      'new_status', _row.status
    ));

  RETURN _row;
END;
$function$;

-- send_invoice_to_accountant
CREATE OR REPLACE FUNCTION public.send_invoice_to_accountant(p_invoice_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_inv record;
  v_task_id uuid;
  v_existing uuid;
BEGIN
  IF NOT public.has_any_role(v_user, ARRAY['admin','manager','sales']::text[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT i.id, i.status, i.type, i.number, i.total_amount, i.customer_id, c.name AS customer_name
    INTO v_inv
  FROM public.invoices i
  LEFT JOIN public.customers c ON c.id = i.customer_id
  WHERE i.id = p_invoice_id;

  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'invoice not found'; END IF;
  IF v_inv.status <> 'draft' THEN RAISE EXCEPTION 'only draft invoices can be sent to accountant'; END IF;

  UPDATE public.invoices SET status = 'pending_accountant', updated_at = now() WHERE id = p_invoice_id;

  -- Avoid duplicate task
  SELECT id INTO v_existing
  FROM public.tasks
  WHERE reference_type = 'invoice' AND reference_id = p_invoice_id AND status IN ('pending','in_progress')
  LIMIT 1;

  IF v_existing IS NULL THEN
    INSERT INTO public.tasks (title, description, status, priority, reference_type, reference_id, created_by)
    VALUES (
      'بررسی پیش‌فاکتور',
      'پیش‌فاکتور ' || COALESCE(v_inv.number, p_invoice_id::text)
        || ' — مشتری: ' || COALESCE(v_inv.customer_name, '—')
        || ' — مبلغ: ' || to_char(v_inv.total_amount, 'FM999,999,999,999'),
      'pending', 'normal', 'invoice', p_invoice_id, v_user
    )
    RETURNING id INTO v_task_id;
  ELSE
    v_task_id := v_existing;
  END IF;

  INSERT INTO public.audit_logs(entity_type, entity_id, action, actor_id, diff)
  VALUES ('invoice', p_invoice_id::text, 'invoice_sent_to_accountant', v_user,
          jsonb_build_object('new_status','pending_accountant','task_id',v_task_id));

  RETURN v_task_id;
END;
$function$;

-- set_market_rate_tick_status
CREATE OR REPLACE FUNCTION public.set_market_rate_tick_status(p_tick_id uuid, p_status text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_uid uuid := auth.uid(); v_old text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'احراز هویت لازم است'; END IF;
  IF NOT (public.has_role(v_uid,'admin'::public.app_role)
       OR public.has_role(v_uid,'manager'::public.app_role)
       OR public.has_role(v_uid,'accountant'::public.app_role)) THEN
    RAISE EXCEPTION 'دسترسی لازم نیست';
  END IF;
  IF p_status NOT IN ('accepted','suspect','rejected') THEN RAISE EXCEPTION 'وضعیت نامعتبر'; END IF;
  SELECT status INTO v_old FROM public.market_rate_ticks WHERE id = p_tick_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'نرخ یافت نشد'; END IF;
  UPDATE public.market_rate_ticks SET status = p_status, note = COALESCE(p_note, note) WHERE id = p_tick_id;
  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (v_uid, 'market_rate_tick', p_tick_id::text, 'market_rate_status_changed',
    jsonb_build_object('from', v_old, 'to', p_status, 'note', p_note));
END; $function$;

-- start_market_rate_ingestion_run
CREATE OR REPLACE FUNCTION public.start_market_rate_ingestion_run(p_source_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_uid uuid := auth.uid(); v_sid uuid; v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'احراز هویت لازم است'; END IF;
  IF NOT (public.has_role(v_uid,'admin'::public.app_role)
       OR public.has_role(v_uid,'manager'::public.app_role)
       OR public.has_role(v_uid,'accountant'::public.app_role)) THEN
    RAISE EXCEPTION 'دسترسی لازم برای دریافت نرخ خارجی وجود ندارد';
  END IF;

  SELECT id INTO v_sid FROM public.market_rate_sources WHERE code = p_source_code;

  INSERT INTO public.market_rate_ingestion_runs (source_id, source_code, started_by, status)
  VALUES (v_sid, p_source_code, v_uid, 'started')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- update_dynamic_table_cell
CREATE OR REPLACE FUNCTION public.update_dynamic_table_cell(p_row_id uuid, p_column_id uuid, p_value text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _table_id uuid;
  _data_type text;
  _col_label text;
  _v_text text;
  _v_number numeric;
  _v_boolean boolean;
  _v_date date;
  _v_datetime timestamptz;
  _val text := NULLIF(btrim(COALESCE(p_value, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;
  IF NOT has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text]) THEN
    RAISE EXCEPTION 'دسترسی لازم برای ویرایش سلول را ندارید.' USING ERRCODE = '42501';
  END IF;

  SELECT c.table_id, c.data_type::text, c.label
    INTO _table_id, _data_type, _col_label
  FROM dynamic_table_columns c WHERE c.id = p_column_id;

  IF _table_id IS NULL THEN
    RAISE EXCEPTION 'ستون یافت نشد.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM dynamic_table_rows WHERE id = p_row_id AND table_id = _table_id) THEN
    RAISE EXCEPTION 'ردیف یافت نشد.' USING ERRCODE = 'P0002';
  END IF;

  IF _val IS NULL THEN
    _v_text := NULL; _v_number := NULL; _v_boolean := NULL; _v_date := NULL; _v_datetime := NULL;
  ELSE
    IF _data_type = 'number' THEN
      BEGIN
        _v_number := _val::numeric;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'مقدار وارد شده برای ستون «%» یک عدد معتبر نیست.', _col_label USING ERRCODE = '22023';
      END;
    ELSIF _data_type = 'boolean' THEN
      IF _val IN ('true','t','1','بله','yes') THEN _v_boolean := true;
      ELSIF _val IN ('false','f','0','خیر','no') THEN _v_boolean := false;
      ELSE
        RAISE EXCEPTION 'مقدار «بله/خیر» برای ستون «%» نامعتبر است.', _col_label USING ERRCODE = '22023';
      END IF;
    ELSIF _data_type = 'date' THEN
      BEGIN
        _v_date := _val::date;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'تاریخ وارد شده برای ستون «%» معتبر نیست (قالب درست: YYYY-MM-DD).', _col_label USING ERRCODE = '22023';
      END;
    ELSIF _data_type = 'datetime' THEN
      BEGIN
        _v_datetime := _val::timestamptz;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'تاریخ و ساعت وارد شده برای ستون «%» معتبر نیست.', _col_label USING ERRCODE = '22023';
      END;
    ELSE
      _v_text := _val;
    END IF;
  END IF;

  INSERT INTO dynamic_table_cells(table_id, row_id, column_id,
                                  value_text, value_number, value_boolean, value_date, value_datetime, updated_at)
  VALUES (_table_id, p_row_id, p_column_id,
          _v_text, _v_number, _v_boolean, _v_date, _v_datetime, now())
  ON CONFLICT (row_id, column_id) DO UPDATE
    SET value_text = EXCLUDED.value_text,
        value_number = EXCLUDED.value_number,
        value_boolean = EXCLUDED.value_boolean,
        value_date = EXCLUDED.value_date,
        value_datetime = EXCLUDED.value_datetime,
        updated_at = now();

  UPDATE dynamic_table_rows SET updated_at = now() WHERE id = p_row_id;

  INSERT INTO audit_logs(actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'dynamic_table_cell', p_row_id::text || ':' || p_column_id::text, 'updated',
          jsonb_build_object('value', p_value));
END;
$function$;

-- update_market_rate_source_mapping
CREATE OR REPLACE FUNCTION public.update_market_rate_source_mapping(p_mapping_id uuid, p_source_symbol text, p_normalize_multiplier numeric, p_is_enabled boolean, p_note text)
 RETURNS market_rate_source_mappings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_old public.market_rate_source_mappings;
  v_new public.market_rate_source_mappings;
  v_source_code text;
  v_indicator_code text;
  v_sym text;
  v_note text;
  v_suspect_activation boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT (
    public.has_role(v_uid, 'admin'::public.app_role)
    OR public.has_role(v_uid, 'manager'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Access denied: only admin/manager can update mappings';
  END IF;

  v_sym := btrim(coalesce(p_source_symbol, ''));
  IF length(v_sym) = 0 THEN
    RAISE EXCEPTION 'source_symbol cannot be empty';
  END IF;
  IF length(v_sym) > 100 THEN
    RAISE EXCEPTION 'source_symbol too long (max 100)';
  END IF;
  IF p_normalize_multiplier IS NULL OR p_normalize_multiplier <= 0 THEN
    RAISE EXCEPTION 'normalize_multiplier must be > 0';
  END IF;
  v_note := coalesce(p_note, '');
  IF length(v_note) > 500 THEN
    RAISE EXCEPTION 'note too long (max 500)';
  END IF;

  SELECT * INTO v_old FROM public.market_rate_source_mappings WHERE id = p_mapping_id;
  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'mapping not found';
  END IF;

  IF p_is_enabled = true AND v_old.is_enabled = false
     AND (coalesce(v_old.note,'') ~ 'نیاز به تأیید' OR coalesce(v_old.note,'') ~ 'مبهم') THEN
    v_suspect_activation := true;
  END IF;

  UPDATE public.market_rate_source_mappings
  SET source_symbol = v_sym,
      normalize_multiplier = p_normalize_multiplier,
      is_enabled = p_is_enabled,
      note = NULLIF(v_note, ''),
      updated_at = now()
  WHERE id = p_mapping_id
  RETURNING * INTO v_new;

  SELECT code INTO v_source_code FROM public.market_rate_sources WHERE id = v_new.source_id;
  SELECT code INTO v_indicator_code FROM public.market_indicators WHERE id = v_new.indicator_id;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
  VALUES (
    'market_rate_mapping_updated',
    'market_rate_source_mapping',
    v_new.id,
    v_uid,
    jsonb_build_object(
      'source_code', v_source_code,
      'indicator_code', v_indicator_code,
      'suspect_activation', v_suspect_activation,
      'before', jsonb_build_object(
        'source_symbol', v_old.source_symbol,
        'normalize_multiplier', v_old.normalize_multiplier,
        'is_enabled', v_old.is_enabled,
        'note', v_old.note
      ),
      'after', jsonb_build_object(
        'source_symbol', v_new.source_symbol,
        'normalize_multiplier', v_new.normalize_multiplier,
        'is_enabled', v_new.is_enabled,
        'note', v_new.note
      )
    )
  );

  RETURN v_new;
END;
$function$;

-- validate_gamification_reward
CREATE OR REPLACE FUNCTION public.validate_gamification_reward()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.title_fa IS NULL OR length(btrim(NEW.title_fa)) = 0 THEN
    RAISE EXCEPTION 'عنوان فارسی الزامی است';
  END IF;
  IF NEW.reward_value IS NOT NULL AND NEW.reward_value < 0 THEN
    RAISE EXCEPTION 'مقدار پاداش نمی‌تواند منفی باشد';
  END IF;
  IF NEW.sort_order < 0 THEN
    RAISE EXCEPTION 'ترتیب نمی‌تواند منفی باشد';
  END IF;

  IF NEW.trigger_type IN ('level_reached','season_top_rank') THEN
    IF NEW.trigger_value IS NULL OR NEW.trigger_value <= 0 THEN
      RAISE EXCEPTION 'برای این نوع محرک، مقدار عددی الزامی است';
    END IF;
  END IF;

  IF NEW.trigger_type IN ('achievement_unlocked','mission_completed','league_reached') THEN
    IF NEW.trigger_ref_id IS NULL THEN
      RAISE EXCEPTION 'برای این نوع محرک، انتخاب مرجع الزامی است';
    END IF;
  END IF;

  IF NEW.trigger_value IS NULL THEN NEW.trigger_value := 0; END IF;
  NEW.enabled := NEW.is_active;
  NEW.display_order := NEW.sort_order;
  IF NEW.key IS NULL OR length(btrim(NEW.key)) = 0 THEN
    NEW.key := 'rwd_' || NEW.trigger_type || '_' || COALESCE(NEW.trigger_ref_id::text,'') || '_' || COALESCE(NEW.trigger_value::text,'') || '_' || NEW.reward_type;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.gamification_rewards r
     WHERE r.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
       AND r.trigger_type = NEW.trigger_type
       AND r.reward_type = NEW.reward_type
       AND COALESCE(r.trigger_ref_id::text,'') = COALESCE(NEW.trigger_ref_id::text,'')
       AND COALESCE(r.trigger_value, 0) = COALESCE(NEW.trigger_value, 0)
  ) THEN
    RAISE EXCEPTION 'این پاداش قبلاً تعریف شده است';
  END IF;

  RETURN NEW;
END$function$;

-- validate_invoice_item_price
CREATE OR REPLACE FUNCTION public.validate_invoice_item_price()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice RECORD;
  v_bounds RECORD;
  v_product_name text;
  v_msg text;
BEGIN
  SELECT id, type, sale_price_type_id, customer_id
  INTO v_invoice
  FROM public.invoices
  WHERE id = NEW.invoice_id;

  -- Only enforce on pre_invoice
  IF v_invoice.type IS DISTINCT FROM 'pre_invoice' THEN
    RETURN NEW;
  END IF;

  IF NEW.unit_price IS NULL OR NEW.unit_price <= 0 THEN
    RAISE EXCEPTION 'قیمت واحد ردیف معتبر نیست.' USING ERRCODE = 'P0001';
  END IF;

  SELECT name INTO v_product_name FROM public.products WHERE id = NEW.product_id;
  v_product_name := COALESCE(v_product_name, '—');

  SELECT * INTO v_bounds
  FROM public.get_product_price_bounds(NEW.product_id, v_invoice.sale_price_type_id);

  IF NOT v_bounds.has_any THEN
    v_msg := format('برای محصول «%s» هیچ قیمت فروشی ثبت نشده — ابتدا قیمت‌گذاری کنید.', v_product_name);
    INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff, created_at)
    VALUES (auth.uid(), 'invoice_price_blocked', 'invoice_item', NEW.id::text,
      jsonb_build_object('reason','no_price','product_id',NEW.product_id,'attempted',NEW.unit_price), now());
    RAISE EXCEPTION '%', v_msg USING ERRCODE = 'P0001';
  END IF;

  IF NEW.unit_price < v_bounds.min_price THEN
    v_msg := format('قیمت ردیف «%s» (%s) از کمترین قیمت فروش ثبت‌شده (%s) کمتر است.',
      v_product_name, NEW.unit_price::text, v_bounds.min_price::text);
    INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff, created_at)
    VALUES (auth.uid(), 'invoice_price_blocked', 'invoice_item', NEW.id::text,
      jsonb_build_object('reason','below_min','product_id',NEW.product_id,
        'attempted',NEW.unit_price,'min',v_bounds.min_price,'max',v_bounds.max_price,
        'cap',v_bounds.cap_price,'selected',v_bounds.selected_price,
        'sale_price_type_id',v_invoice.sale_price_type_id), now());
    RAISE EXCEPTION '%', v_msg USING ERRCODE = 'P0001';
  END IF;

  IF v_bounds.selected_price IS NOT NULL AND NEW.unit_price < v_bounds.selected_price THEN
    v_msg := format('قیمت ردیف «%s» (%s) از قیمت قانون نوع قیمت انتخاب‌شده (%s) کمتر است.',
      v_product_name, NEW.unit_price::text, v_bounds.selected_price::text);
    INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff, created_at)
    VALUES (auth.uid(), 'invoice_price_blocked', 'invoice_item', NEW.id::text,
      jsonb_build_object('reason','below_selected','product_id',NEW.product_id,
        'attempted',NEW.unit_price,'selected',v_bounds.selected_price,
        'sale_price_type_id',v_invoice.sale_price_type_id), now());
    RAISE EXCEPTION '%', v_msg USING ERRCODE = 'P0001';
  END IF;

  IF NEW.unit_price > v_bounds.cap_price THEN
    v_msg := format('قیمت ردیف «%s» (%s) بیش از سقف مجاز (%s = ۱.۰۵×بالاترین قیمت) است.',
      v_product_name, NEW.unit_price::text, v_bounds.cap_price::text);
    INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff, created_at)
    VALUES (auth.uid(), 'invoice_price_blocked', 'invoice_item', NEW.id::text,
      jsonb_build_object('reason','above_cap','product_id',NEW.product_id,
        'attempted',NEW.unit_price,'cap',v_bounds.cap_price,'max',v_bounds.max_price), now());
    RAISE EXCEPTION '%', v_msg USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

-- validate_league_season
CREATE OR REPLACE FUNCTION public.validate_league_season()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.title_fa IS NULL OR length(btrim(NEW.title_fa)) = 0 THEN
    RAISE EXCEPTION 'عنوان فارسی الزامی است';
  END IF;
  IF NEW.starts_at IS NULL THEN RAISE EXCEPTION 'تاریخ شروع الزامی است'; END IF;
  IF NEW.ends_at   IS NULL THEN RAISE EXCEPTION 'تاریخ پایان الزامی است'; END IF;
  IF NEW.ends_at <= NEW.starts_at THEN
    RAISE EXCEPTION 'تاریخ پایان باید بعد از تاریخ شروع باشد';
  END IF;

  -- keep legacy columns in sync so existing readers keep working
  NEW.season_name := COALESCE(NEW.season_name, NEW.title_fa);
  NEW.start_date  := COALESCE(NEW.start_date, NEW.starts_at::date);
  NEW.end_date    := COALESCE(NEW.end_date, NEW.ends_at::date);
  NEW.is_active   := (NEW.status = 'active');
  NEW.updated_at  := now();

  -- only one active season
  IF NEW.status = 'active' AND EXISTS (
    SELECT 1 FROM public.league_seasons s
     WHERE s.status = 'active' AND s.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) THEN
    RAISE EXCEPTION 'فقط یک فصل فعال می‌تواند وجود داشته باشد';
  END IF;

  RETURN NEW;
END$function$;

-- validate_league_setting
CREATE OR REPLACE FUNCTION public.validate_league_setting()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.tier IS NULL THEN
    RAISE EXCEPTION 'لیگ الزامی است';
  END IF;
  IF NEW.title_fa IS NULL OR length(btrim(NEW.title_fa)) = 0 THEN
    RAISE EXCEPTION 'عنوان فارسی الزامی است';
  END IF;
  IF NEW.min_level < 0 THEN RAISE EXCEPTION 'حداقل سطح نمی‌تواند منفی باشد'; END IF;
  IF NEW.min_xp < 0 THEN RAISE EXCEPTION 'حداقل XP نمی‌تواند منفی باشد'; END IF;
  IF NEW.promotion_percent < 0 OR NEW.promotion_percent > 100 THEN
    RAISE EXCEPTION 'درصد ارتقا باید بین ۰ و ۱۰۰ باشد';
  END IF;
  IF NEW.demotion_percent < 0 OR NEW.demotion_percent > 100 THEN
    RAISE EXCEPTION 'درصد سقوط باید بین ۰ و ۱۰۰ باشد';
  END IF;
  IF (NEW.promotion_percent + NEW.demotion_percent) > 100 THEN
    RAISE EXCEPTION 'درصد ارتقا و سقوط نمی‌توانند مجموعاً بیشتر از ۱۰۰ باشند';
  END IF;
  IF NEW.sort_order < 0 THEN RAISE EXCEPTION 'ترتیب نمی‌تواند منفی باشد'; END IF;
  RETURN NEW;
END$function$;

-- validate_sale_price_positive
CREATE OR REPLACE FUNCTION public.validate_sale_price_positive()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.new_sale_price IS NULL OR NEW.new_sale_price <= 0 THEN
    RAISE EXCEPTION 'قیمت فروش باید بزرگ‌تر از صفر باشد (مقدار دریافتی: %)', NEW.new_sale_price
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;
