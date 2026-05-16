-- DT.7C-FIX: Allow upsert when unique_by column is not in allowed_update_columns.
-- The unique_by keys are match identifiers, not mutations — strip them from the
-- payload before delegating to bot_update_table_row. Signature unchanged.

CREATE OR REPLACE FUNCTION public.bot_upsert_table_row(
  p_key_id uuid,
  p_table_id uuid,
  p_unique_by text[],
  p_values jsonb
)
RETURNS TABLE(
  out_mode text,
  out_row_id uuid,
  out_row_number bigint,
  out_is_active boolean,
  out_created_at timestamptz,
  out_updated_at timestamptz,
  out_values jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _can_update boolean;
  _allowed uuid[];
  _key text;
  _col record;
  _val jsonb;
  _raw_text text;
  _col_ids uuid[] := '{}'::uuid[];
  _v_texts text[] := '{}'::text[];
  _v_nums  numeric[] := '{}'::numeric[];
  _v_bools boolean[] := '{}'::boolean[];
  _v_dates date[] := '{}'::date[];
  _v_dts   timestamptz[] := '{}'::timestamptz[];
  _dtypes  text[] := '{}'::text[];
  _matched uuid[];
  _existing_row uuid;
  _new_row uuid;
  _update_values jsonb;
  _strip_key text;
BEGIN
  -- 1) Access check
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

  -- 2) Reject computed columns explicitly
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_values) k
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

  -- 3) Validate + normalize each unique_by key into parallel arrays
  FOREACH _key IN ARRAY p_unique_by LOOP
    SELECT c.id, c.column_key, c.label, c.data_type::text AS data_type, c.is_computed
      INTO _col
    FROM public.dynamic_table_columns c
    WHERE c.table_id = p_table_id AND c.column_key = _key;

    IF _col.id IS NULL THEN
      RAISE EXCEPTION 'unknown_column:%', _key;
    END IF;
    IF _col.is_computed THEN
      RAISE EXCEPTION 'invalid_unique_by';
    END IF;

    IF NOT (p_values ? _key) OR jsonb_typeof(p_values -> _key) = 'null' THEN
      RAISE EXCEPTION 'required_column_missing:%', _key;
    END IF;

    _val := p_values -> _key;
    _raw_text := _val #>> '{}';

    DECLARE
      _vt text := NULL; _vn numeric := NULL; _vb boolean := NULL;
      _vd date := NULL; _vdt timestamptz := NULL;
    BEGIN
      IF _col.data_type = 'number' THEN
        BEGIN _vn := _raw_text::numeric;
        EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid_number_for_column:%', _key; END;
      ELSIF _col.data_type = 'boolean' THEN
        IF jsonb_typeof(_val) = 'boolean' THEN
          _vb := (_val)::text::boolean;
        ELSE
          IF lower(_raw_text) IN ('true','1','yes') THEN _vb := true;
          ELSIF lower(_raw_text) IN ('false','0','no') THEN _vb := false;
          ELSE RAISE EXCEPTION 'invalid_boolean_for_column:%', _key;
          END IF;
        END IF;
      ELSIF _col.data_type = 'date' THEN
        BEGIN _vd := _raw_text::date;
        EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid_date_for_column:%', _key; END;
      ELSIF _col.data_type = 'datetime' THEN
        BEGIN _vdt := _raw_text::timestamptz;
        EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid_datetime_for_column:%', _key; END;
      ELSE
        IF _raw_text IS NULL OR length(btrim(_raw_text)) = 0 THEN
          RAISE EXCEPTION 'required_column_missing:%', _key;
        END IF;
        _vt := _raw_text;
      END IF;

      _col_ids := array_append(_col_ids, _col.id);
      _v_texts := array_append(_v_texts, _vt);
      _v_nums  := array_append(_v_nums, _vn);
      _v_bools := array_append(_v_bools, _vb);
      _v_dates := array_append(_v_dates, _vd);
      _v_dts   := array_append(_v_dts, _vdt);
      _dtypes  := array_append(_dtypes, _col.data_type);
    END;
  END LOOP;

  -- 4) Set-based match: row must satisfy ALL unique_by keys
  SELECT array_agg(row_id) INTO _matched
  FROM (
    SELECT cl.row_id
    FROM public.dynamic_table_cells cl
    JOIN unnest(_col_ids, _v_texts, _v_nums, _v_bools, _v_dates, _v_dts, _dtypes)
      WITH ORDINALITY AS u(col_id, vt, vn, vb, vd, vdt, dt, idx)
      ON cl.column_id = u.col_id
    WHERE cl.table_id = p_table_id
      AND CASE u.dt
        WHEN 'number'   THEN cl.value_number   IS NOT DISTINCT FROM u.vn
        WHEN 'boolean'  THEN cl.value_boolean  IS NOT DISTINCT FROM u.vb
        WHEN 'date'     THEN cl.value_date     IS NOT DISTINCT FROM u.vd
        WHEN 'datetime' THEN cl.value_datetime IS NOT DISTINCT FROM u.vdt
        ELSE cl.value_text IS NOT DISTINCT FROM u.vt
      END
    GROUP BY cl.row_id
    HAVING count(*) = array_length(_col_ids, 1)
    LIMIT 2
  ) m;

  IF _matched IS NOT NULL AND array_length(_matched, 1) > 1 THEN
    RAISE EXCEPTION 'duplicate_match';
  END IF;

  -- 5) UPDATE path
  IF _matched IS NOT NULL AND array_length(_matched, 1) = 1 THEN
    _existing_row := _matched[1];

    -- DT.7C-FIX: strip unique_by keys from the payload before delegating to
    -- bot_update_table_row. These keys are match identifiers, not values the
    -- bot is allowed (or trying) to change. Any OTHER key in payload still
    -- goes through bot_update_table_row's allowed_update_columns check.
    _update_values := p_values;
    FOREACH _strip_key IN ARRAY p_unique_by LOOP
      _update_values := _update_values - _strip_key;
    END LOOP;

    -- Only call the update if there is at least one mutable key left.
    IF _update_values IS NOT NULL
       AND jsonb_typeof(_update_values) = 'object'
       AND (SELECT count(*) FROM jsonb_object_keys(_update_values)) > 0 THEN
      PERFORM public.bot_update_table_row(p_key_id, p_table_id, _existing_row, _update_values);
    END IF;

    RETURN QUERY
    SELECT 'updated'::text, r.id, r.row_number, r.is_active, r.created_at, r.updated_at,
      COALESCE(
        (SELECT jsonb_object_agg(col.column_key,
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
    FROM public.dynamic_table_rows r
    WHERE r.id = _existing_row;
    RETURN;
  END IF;

  -- 6) CREATE path
  SELECT bc.out_row_id INTO _new_row
  FROM public.bot_create_table_row(p_key_id, p_table_id, p_values) AS bc;

  RETURN QUERY
  SELECT 'created'::text, r.id, r.row_number, r.is_active, r.created_at, r.updated_at,
    COALESCE(
      (SELECT jsonb_object_agg(col.column_key,
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
  FROM public.dynamic_table_rows r
  WHERE r.id = _new_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.bot_upsert_table_row(uuid, uuid, text[], jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bot_upsert_table_row(uuid, uuid, text[], jsonb) TO service_role;