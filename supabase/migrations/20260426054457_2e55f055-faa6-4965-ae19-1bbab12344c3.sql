-- ============================================================
-- Phase 4.2 — Dynamic Data Tables editing RPCs
-- ============================================================

-- 1) Add a new column to an existing dynamic table
CREATE OR REPLACE FUNCTION public.add_dynamic_table_column(
  p_table_id uuid,
  p_column_key text,
  p_label text,
  p_data_type text,
  p_is_required boolean DEFAULT false,
  p_is_filterable boolean DEFAULT false,
  p_is_editable_by_bot boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_id uuid;
  _next_order int;
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_column_key !~ '^[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'invalid column_key';
  END IF;

  IF p_data_type NOT IN ('text','number','boolean','date','datetime','phone','tag','status') THEN
    RAISE EXCEPTION 'invalid data_type';
  END IF;

  IF EXISTS (
    SELECT 1 FROM dynamic_table_columns
    WHERE table_id = p_table_id AND column_key = p_column_key
  ) THEN
    RAISE EXCEPTION 'column_key already exists';
  END IF;

  SELECT COALESCE(MAX(sort_order), -1) + 1 INTO _next_order
  FROM dynamic_table_columns WHERE table_id = p_table_id;

  INSERT INTO dynamic_table_columns(
    table_id, column_key, label, data_type,
    is_required, is_filterable, is_editable_by_bot, sort_order
  ) VALUES (
    p_table_id, p_column_key, p_label, p_data_type::dynamic_column_data_type,
    p_is_required, p_is_filterable, p_is_editable_by_bot, _next_order
  ) RETURNING id INTO _new_id;

  INSERT INTO audit_logs(actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'dynamic_table_column', _new_id::text, 'created',
          jsonb_build_object('table_id', p_table_id, 'column_key', p_column_key, 'data_type', p_data_type));

  RETURN _new_id;
END;
$$;

-- 2) Update column meta (label + flags only; key & data_type are immutable)
CREATE OR REPLACE FUNCTION public.update_dynamic_table_column(
  p_column_id uuid,
  p_label text,
  p_is_required boolean,
  p_is_filterable boolean,
  p_is_editable_by_bot boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE dynamic_table_columns
  SET label = p_label,
      is_required = p_is_required,
      is_filterable = p_is_filterable,
      is_editable_by_bot = p_is_editable_by_bot
  WHERE id = p_column_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'column not found';
  END IF;

  INSERT INTO audit_logs(actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'dynamic_table_column', p_column_id::text, 'updated',
          jsonb_build_object('label', p_label,
                             'is_required', p_is_required,
                             'is_filterable', p_is_filterable,
                             'is_editable_by_bot', p_is_editable_by_bot));
END;
$$;

-- 3) Reorder columns (array of column_ids in desired order)
CREATE OR REPLACE FUNCTION public.reorder_dynamic_table_columns(
  p_table_id uuid,
  p_ordered_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _i int := 0;
  _id uuid;
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOREACH _id IN ARRAY p_ordered_ids LOOP
    UPDATE dynamic_table_columns
    SET sort_order = _i
    WHERE id = _id AND table_id = p_table_id;
    _i := _i + 1;
  END LOOP;

  INSERT INTO audit_logs(actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'dynamic_table', p_table_id::text, 'columns_reordered',
          jsonb_build_object('order', p_ordered_ids));
END;
$$;

-- 4) Update a single cell value (type-aware)
CREATE OR REPLACE FUNCTION public.update_dynamic_table_cell(
  p_row_id uuid,
  p_column_id uuid,
  p_value text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _table_id uuid;
  _data_type text;
  _v_text text;
  _v_number numeric;
  _v_boolean boolean;
  _v_date date;
  _v_datetime timestamptz;
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT c.table_id, c.data_type::text INTO _table_id, _data_type
  FROM dynamic_table_columns c WHERE c.id = p_column_id;

  IF _table_id IS NULL THEN
    RAISE EXCEPTION 'column not found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM dynamic_table_rows WHERE id = p_row_id AND table_id = _table_id) THEN
    RAISE EXCEPTION 'row not found in this table';
  END IF;

  IF p_value IS NULL OR p_value = '' THEN
    _v_text := NULL; _v_number := NULL; _v_boolean := NULL; _v_date := NULL; _v_datetime := NULL;
  ELSE
    BEGIN
      IF _data_type = 'number' THEN
        _v_number := p_value::numeric;
      ELSIF _data_type = 'boolean' THEN
        IF p_value IN ('true','t','1','بله') THEN _v_boolean := true;
        ELSIF p_value IN ('false','f','0','خیر') THEN _v_boolean := false;
        ELSE RAISE EXCEPTION 'invalid boolean value';
        END IF;
      ELSIF _data_type = 'date' THEN
        _v_date := p_value::date;
      ELSIF _data_type = 'datetime' THEN
        _v_datetime := p_value::timestamptz;
      ELSE
        _v_text := p_value;
      END IF;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid value for type %', _data_type;
    END;
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
$$;

-- 5) Toggle row active status
CREATE OR REPLACE FUNCTION public.set_dynamic_table_row_active(
  p_row_id uuid,
  p_is_active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE dynamic_table_rows
  SET is_active = p_is_active, updated_at = now()
  WHERE id = p_row_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'row not found';
  END IF;

  INSERT INTO audit_logs(actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'dynamic_table_row', p_row_id::text,
          CASE WHEN p_is_active THEN 'activated' ELSE 'deactivated' END,
          jsonb_build_object('is_active', p_is_active));
END;
$$;

-- Make sure (row_id, column_id) is unique for ON CONFLICT
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dynamic_table_cells_row_col_unique'
  ) THEN
    ALTER TABLE dynamic_table_cells
      ADD CONSTRAINT dynamic_table_cells_row_col_unique UNIQUE (row_id, column_id);
  END IF;
END$$;