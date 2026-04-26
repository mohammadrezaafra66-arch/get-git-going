CREATE OR REPLACE FUNCTION public.import_dynamic_table_rows(
  p_table_id uuid,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _row jsonb;
  _row_id uuid;
  _row_num bigint;
  _col record;
  _val text;
  _v_num numeric;
  _v_bool boolean;
  _v_date date;
  _v_dt timestamptz;
  _inserted int := 0;
  _total int := 0;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_any_role(_uid, ARRAY['admin','manager']::app_role[]) THEN
    RAISE EXCEPTION 'دسترسی لازم را ندارید.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dynamic_tables WHERE id = p_table_id AND is_active = true) THEN
    RAISE EXCEPTION 'جدول یافت نشد یا غیرفعال است.' USING ERRCODE = 'P0002';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'ورودی باید آرایه‌ای از ردیف‌ها باشد.' USING ERRCODE = '22023';
  END IF;

  _total := jsonb_array_length(p_rows);
  IF _total = 0 THEN
    RETURN jsonb_build_object('inserted', 0, 'total', 0);
  END IF;
  IF _total > 5000 THEN
    RAISE EXCEPTION 'حداکثر ۵۰۰۰ ردیف در هر واردسازی مجاز است.' USING ERRCODE = '22023';
  END IF;

  FOR _row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    -- allocate row number
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
      _val := NULLIF(btrim(COALESCE(_row->>_col.column_key, '')), '');

      IF _val IS NULL THEN
        IF _col.is_required THEN
          RAISE EXCEPTION 'مقدار ستون «%» الزامی است.', _col.label USING ERRCODE = '22023';
        END IF;
        CONTINUE;
      END IF;

      _v_num := NULL; _v_bool := NULL; _v_date := NULL; _v_dt := NULL;

      BEGIN
        IF _col.data_type = 'number' THEN
          _v_num := _val::numeric;
        ELSIF _col.data_type = 'boolean' THEN
          IF _val ILIKE 'true' OR _val = '1' OR _val ILIKE 'yes' OR _val = 'بله' THEN
            _v_bool := true;
          ELSIF _val ILIKE 'false' OR _val = '0' OR _val ILIKE 'no' OR _val = 'خیر' THEN
            _v_bool := false;
          ELSE
            RAISE EXCEPTION 'مقدار بولی نامعتبر';
          END IF;
        ELSIF _col.data_type = 'date' THEN
          _v_date := _val::date;
        ELSIF _col.data_type = 'datetime' THEN
          _v_dt := _val::timestamptz;
        END IF;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'مقدار نامعتبر برای ستون «%»: %', _col.label, _val USING ERRCODE = '22023';
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

    _inserted := _inserted + 1;
  END LOOP;

  INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
  VALUES (
    _uid,
    'dynamic_table',
    p_table_id::text,
    'csv_import',
    jsonb_build_object(
      'table_id', p_table_id,
      'total_rows', _total,
      'inserted_rows', _inserted,
      'imported_at', now()
    )
  );

  RETURN jsonb_build_object('inserted', _inserted, 'total', _total);
END;
$$;

GRANT EXECUTE ON FUNCTION public.import_dynamic_table_rows(uuid, jsonb) TO authenticated;