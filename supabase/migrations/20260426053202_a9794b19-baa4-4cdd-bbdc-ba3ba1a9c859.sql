-- ============================================================
-- Phase 4.1 — Dynamic Data Tables
-- ============================================================

-- Allowed data types for dynamic columns
DO $$ BEGIN
  CREATE TYPE public.dynamic_column_data_type AS ENUM
    ('text','number','boolean','date','datetime','phone','tag','status');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----- dynamic_tables -----
CREATE TABLE IF NOT EXISTS public.dynamic_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  owner_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dynamic_tables_slug_format CHECK (slug ~ '^[a-z0-9-]+$' AND length(slug) BETWEEN 2 AND 64),
  CONSTRAINT dynamic_tables_name_len CHECK (length(btrim(name)) BETWEEN 1 AND 120)
);
CREATE INDEX IF NOT EXISTS idx_dynamic_tables_active ON public.dynamic_tables(is_active);

-- ----- dynamic_table_columns -----
CREATE TABLE IF NOT EXISTS public.dynamic_table_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES public.dynamic_tables(id) ON DELETE CASCADE,
  column_key text NOT NULL,
  label text NOT NULL,
  data_type public.dynamic_column_data_type NOT NULL,
  is_required boolean NOT NULL DEFAULT false,
  is_filterable boolean NOT NULL DEFAULT false,
  is_editable_by_bot boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dynamic_columns_key_format CHECK (column_key ~ '^[a-z0-9_]+$' AND length(column_key) BETWEEN 1 AND 64),
  CONSTRAINT dynamic_columns_label_len CHECK (length(btrim(label)) BETWEEN 1 AND 120),
  UNIQUE (table_id, column_key)
);
CREATE INDEX IF NOT EXISTS idx_dynamic_columns_table ON public.dynamic_table_columns(table_id, sort_order);

-- ----- dynamic_table_rows -----
CREATE TABLE IF NOT EXISTS public.dynamic_table_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES public.dynamic_tables(id) ON DELETE CASCADE,
  row_number bigint NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (table_id, row_number)
);
CREATE INDEX IF NOT EXISTS idx_dynamic_rows_table_rownum ON public.dynamic_table_rows(table_id, row_number);
CREATE INDEX IF NOT EXISTS idx_dynamic_rows_table_active ON public.dynamic_table_rows(table_id, is_active);

-- Row number counter
CREATE TABLE IF NOT EXISTS public.dynamic_table_row_counters (
  table_id uuid PRIMARY KEY REFERENCES public.dynamic_tables(id) ON DELETE CASCADE,
  last_value bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ----- dynamic_table_cells -----
CREATE TABLE IF NOT EXISTS public.dynamic_table_cells (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES public.dynamic_tables(id) ON DELETE CASCADE,
  row_id uuid NOT NULL REFERENCES public.dynamic_table_rows(id) ON DELETE CASCADE,
  column_id uuid NOT NULL REFERENCES public.dynamic_table_columns(id) ON DELETE CASCADE,
  value_text text,
  value_number numeric,
  value_boolean boolean,
  value_date date,
  value_datetime timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (row_id, column_id)
);
CREATE INDEX IF NOT EXISTS idx_dynamic_cells_table_col ON public.dynamic_table_cells(table_id, column_id);
CREATE INDEX IF NOT EXISTS idx_dynamic_cells_text ON public.dynamic_table_cells(table_id, column_id, value_text);
CREATE INDEX IF NOT EXISTS idx_dynamic_cells_number ON public.dynamic_table_cells(table_id, column_id, value_number);
CREATE INDEX IF NOT EXISTS idx_dynamic_cells_boolean ON public.dynamic_table_cells(table_id, column_id, value_boolean);
CREATE INDEX IF NOT EXISTS idx_dynamic_cells_date ON public.dynamic_table_cells(table_id, column_id, value_date);
CREATE INDEX IF NOT EXISTS idx_dynamic_cells_datetime ON public.dynamic_table_cells(table_id, column_id, value_datetime);

-- ----- bot_api_keys -----
CREATE TABLE IF NOT EXISTS public.bot_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  key_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  allowed_table_ids uuid[] NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  CONSTRAINT bot_api_keys_name_len CHECK (length(btrim(name)) BETWEEN 1 AND 120)
);

-- ============================================================
-- Triggers: updated_at
-- ============================================================
DROP TRIGGER IF EXISTS trg_dynamic_tables_updated ON public.dynamic_tables;
CREATE TRIGGER trg_dynamic_tables_updated BEFORE UPDATE ON public.dynamic_tables
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_dynamic_rows_updated ON public.dynamic_table_rows;
CREATE TRIGGER trg_dynamic_rows_updated BEFORE UPDATE ON public.dynamic_table_rows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_dynamic_cells_updated ON public.dynamic_table_cells;
CREATE TRIGGER trg_dynamic_cells_updated BEFORE UPDATE ON public.dynamic_table_cells
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Stamp created_by on tables/rows
CREATE OR REPLACE FUNCTION public.dynamic_tables_stamp_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF tg_op = 'INSERT' THEN
    new.created_by := COALESCE(new.created_by, auth.uid());
    new.owner_id := COALESCE(new.owner_id, auth.uid());
  END IF;
  RETURN new;
END; $$;

DROP TRIGGER IF EXISTS trg_dynamic_tables_stamp ON public.dynamic_tables;
CREATE TRIGGER trg_dynamic_tables_stamp BEFORE INSERT ON public.dynamic_tables
  FOR EACH ROW EXECUTE FUNCTION public.dynamic_tables_stamp_user();

CREATE OR REPLACE FUNCTION public.dynamic_rows_stamp_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF tg_op = 'INSERT' THEN
    new.created_by := COALESCE(new.created_by, auth.uid());
  END IF;
  RETURN new;
END; $$;

DROP TRIGGER IF EXISTS trg_dynamic_rows_stamp ON public.dynamic_table_rows;
CREATE TRIGGER trg_dynamic_rows_stamp BEFORE INSERT ON public.dynamic_table_rows
  FOR EACH ROW EXECUTE FUNCTION public.dynamic_rows_stamp_user();

-- ============================================================
-- Audit triggers
-- ============================================================
CREATE OR REPLACE FUNCTION public.audit_dynamic_tables()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF tg_op = 'INSERT' THEN
    INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'dynamic_tables', new.id::text, 'dynamic_table_created',
      jsonb_build_object('name', new.name, 'slug', new.slug));
    RETURN new;
  ELSIF tg_op = 'UPDATE' THEN
    IF old.is_active = true AND new.is_active = false THEN
      INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
      VALUES (auth.uid(), 'dynamic_tables', new.id::text, 'dynamic_table_deactivated',
        jsonb_build_object('name', new.name, 'slug', new.slug));
    END IF;
    RETURN new;
  END IF;
  RETURN null;
END; $$;

DROP TRIGGER IF EXISTS trg_audit_dynamic_tables ON public.dynamic_tables;
CREATE TRIGGER trg_audit_dynamic_tables AFTER INSERT OR UPDATE ON public.dynamic_tables
  FOR EACH ROW EXECUTE FUNCTION public.audit_dynamic_tables();

CREATE OR REPLACE FUNCTION public.audit_dynamic_table_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF tg_op = 'INSERT' THEN
    INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'dynamic_table_columns', new.id::text, 'dynamic_table_column_created',
      jsonb_build_object('table_id', new.table_id, 'column_key', new.column_key, 'data_type', new.data_type));
  END IF;
  RETURN new;
END; $$;

DROP TRIGGER IF EXISTS trg_audit_dynamic_columns ON public.dynamic_table_columns;
CREATE TRIGGER trg_audit_dynamic_columns AFTER INSERT ON public.dynamic_table_columns
  FOR EACH ROW EXECUTE FUNCTION public.audit_dynamic_table_columns();

CREATE OR REPLACE FUNCTION public.audit_dynamic_table_rows()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF tg_op = 'INSERT' THEN
    INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'dynamic_table_rows', new.id::text, 'dynamic_table_row_created',
      jsonb_build_object('table_id', new.table_id, 'row_number', new.row_number));
  END IF;
  RETURN new;
END; $$;

DROP TRIGGER IF EXISTS trg_audit_dynamic_rows ON public.dynamic_table_rows;
CREATE TRIGGER trg_audit_dynamic_rows AFTER INSERT ON public.dynamic_table_rows
  FOR EACH ROW EXECUTE FUNCTION public.audit_dynamic_table_rows();

CREATE OR REPLACE FUNCTION public.audit_bot_api_keys()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF tg_op = 'INSERT' THEN
    INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'bot_api_keys', new.id::text, 'bot_api_key_created',
      jsonb_build_object('name', new.name, 'allowed_table_ids', new.allowed_table_ids));
  END IF;
  RETURN new;
END; $$;

DROP TRIGGER IF EXISTS trg_audit_bot_api_keys ON public.bot_api_keys;
CREATE TRIGGER trg_audit_bot_api_keys AFTER INSERT ON public.bot_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.audit_bot_api_keys();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.dynamic_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dynamic_table_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dynamic_table_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dynamic_table_cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dynamic_table_row_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_api_keys ENABLE ROW LEVEL SECURITY;

-- dynamic_tables
CREATE POLICY "dyn_tables_view_active_all_authed" ON public.dynamic_tables
  FOR SELECT TO authenticated
  USING (is_active = true OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]));

CREATE POLICY "dyn_tables_insert_admin_manager" ON public.dynamic_tables
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]));

CREATE POLICY "dyn_tables_update_admin_manager" ON public.dynamic_tables
  FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]));

-- No DELETE policy => physical delete blocked

-- dynamic_table_columns
CREATE POLICY "dyn_cols_view_authed" ON public.dynamic_table_columns
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dynamic_tables t
      WHERE t.id = dynamic_table_columns.table_id
        AND (t.is_active = true OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]))
    )
  );

CREATE POLICY "dyn_cols_modify_admin_manager" ON public.dynamic_table_columns
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]));

-- dynamic_table_rows
CREATE POLICY "dyn_rows_view_authed" ON public.dynamic_table_rows
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dynamic_tables t
      WHERE t.id = dynamic_table_rows.table_id
        AND (t.is_active = true OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]))
    )
  );

CREATE POLICY "dyn_rows_modify_admin_manager" ON public.dynamic_table_rows
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]));

-- dynamic_table_cells
CREATE POLICY "dyn_cells_view_authed" ON public.dynamic_table_cells
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dynamic_tables t
      WHERE t.id = dynamic_table_cells.table_id
        AND (t.is_active = true OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]))
    )
  );

CREATE POLICY "dyn_cells_modify_admin_manager" ON public.dynamic_table_cells
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]));

-- counters
CREATE POLICY "dyn_row_counters_admin_manager" ON public.dynamic_table_row_counters
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]));

-- bot_api_keys
CREATE POLICY "bot_api_keys_admin_manager_all" ON public.bot_api_keys
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]));

-- ============================================================
-- RPC: Insert a row with cells
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_dynamic_table_row(p_table_id uuid, p_values jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  IF NOT public.has_any_role(_uid, ARRAY['admin','manager']::app_role[]) THEN
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
END; $$;

-- ============================================================
-- RPC: Bot query rows (paginated, filterable)
-- ============================================================
CREATE OR REPLACE FUNCTION public.api_dynamic_table_query_rows(
  p_table_slug text,
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  IF NOT public.has_any_role(_uid, ARRAY['admin','manager']::app_role[]) THEN
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
END; $$;

-- ============================================================
-- RPC: Bot update single cell
-- ============================================================
CREATE OR REPLACE FUNCTION public.api_dynamic_table_update_cell(
  p_table_slug text,
  p_row_id uuid,
  p_column_key text,
  p_value text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  IF NOT public.has_any_role(_uid, ARRAY['admin','manager']::app_role[]) THEN
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
END; $$;