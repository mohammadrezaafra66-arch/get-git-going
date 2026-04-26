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
  IF NOT has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]) THEN
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