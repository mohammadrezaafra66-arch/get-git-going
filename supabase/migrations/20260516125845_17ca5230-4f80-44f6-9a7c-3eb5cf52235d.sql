-- Bot API: create a new row in a dynamic table on behalf of a bot key
CREATE OR REPLACE FUNCTION public.bot_create_table_row(
  p_key_id uuid,
  p_table_id uuid,
  p_values jsonb
)
RETURNS TABLE (
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
  _row_id uuid;
  _row_num bigint;
  _now timestamptz := now();
  _key text;
  _val jsonb;
  _col record;
  _applied text[] := '{}'::text[];
  _missing_label text;
BEGIN
  -- 1) Access check
  SELECT a.can_update, a.allowed_update_columns
    INTO _can_update, _allowed
  FROM public.bot_api_key_table_access a
  WHERE a.api_key_id = p_key_id AND a.table_id = p_table_id;

  IF _can_update IS NULL THEN RAISE EXCEPTION 'forbidden_table'; END IF;
  IF NOT _can_update THEN RAISE EXCEPTION 'forbidden_update'; END IF;

  -- 2) Body shape
  IF p_values IS NULL OR jsonb_typeof(p_values) <> 'object' THEN
    RAISE EXCEPTION 'invalid_values';
  END IF;

  -- 3) Validate every supplied key BEFORE inserting the row
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
  END LOOP;

  -- 4) Required columns check (any required column must have a non-null/non-empty value)
  SELECT c.label INTO _missing_label
  FROM public.dynamic_table_columns c
  WHERE c.table_id = p_table_id AND c.is_required = true
    AND (
      NOT (p_values ? c.column_key)
      OR jsonb_typeof(p_values -> c.column_key) = 'null'
      OR (jsonb_typeof(p_values -> c.column_key) = 'string'
          AND length(btrim(p_values ->> c.column_key)) = 0)
    )
  LIMIT 1;

  IF _missing_label IS NOT NULL THEN
    RAISE EXCEPTION 'required_column_missing:%', _missing_label;
  END IF;

  -- 5) Allocate row number
  INSERT INTO public.dynamic_table_row_counters(table_id, last_value, updated_at)
  VALUES (p_table_id, 1, _now)
  ON CONFLICT (table_id) DO UPDATE
    SET last_value = public.dynamic_table_row_counters.last_value + 1,
        updated_at = _now
  RETURNING last_value INTO _row_num;

  -- 6) Create row
  INSERT INTO public.dynamic_table_rows(table_id, row_number)
  VALUES (p_table_id, _row_num)
  RETURNING id INTO _row_id;

  -- 7) Insert cells with type validation
  FOR _key, _val IN SELECT key, value FROM jsonb_each(p_values) LOOP
    SELECT c.id, c.column_key, c.label, c.data_type::text AS data_type
      INTO _col
    FROM public.dynamic_table_columns c
    WHERE c.table_id = p_table_id AND c.column_key = _key;

    -- (already validated above)

    DECLARE
      _value_text text := NULL;
      _value_number numeric := NULL;
      _value_boolean boolean := NULL;
      _value_date date := NULL;
      _value_datetime timestamptz := NULL;
      _raw_text text;
    BEGIN
      IF _val IS NULL OR jsonb_typeof(_val) = 'null' THEN
        CONTINUE; -- skip null
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
        (p_table_id, _row_id, _col.id, _value_text, _value_number, _value_boolean, _value_date, _value_datetime);

      _applied := array_append(_applied, _key);
    END;
  END LOOP;

  -- 8) Audit
  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (NULL, 'dynamic_table_row', _row_id::text, 'bot_row_created',
          jsonb_build_object(
            'api_key_id', p_key_id,
            'table_id', p_table_id,
            'row_number', _row_num,
            'applied_keys', _applied,
            'values', p_values
          ));

  -- 9) Return full row (pivot cells -> jsonb)
  RETURN QUERY
  SELECT
    r.id,
    r.row_number,
    r.is_active,
    r.created_at,
    r.updated_at,
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
  FROM public.dynamic_table_rows r
  WHERE r.id = _row_id;
END;
$$;

REVOKE ALL ON FUNCTION public.bot_create_table_row(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bot_create_table_row(uuid, uuid, jsonb) TO service_role;