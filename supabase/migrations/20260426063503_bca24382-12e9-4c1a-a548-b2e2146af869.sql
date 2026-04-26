CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_dynamic_cells_text_trgm
  ON public.dynamic_table_cells
  USING gin (value_text gin_trgm_ops)
  WHERE value_text IS NOT NULL;

CREATE OR REPLACE FUNCTION public.query_dynamic_table_rows(
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
  _uid uuid := auth.uid();
  _filter jsonb;
  _col_id uuid;
  _col_type text;
  _op text;
  _val text;
  _val2 text;
  _search_like text;
  _search_num numeric;
  _limit int;
  _offset int;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF NOT public.has_any_role(_uid, ARRAY['admin'::app_role, 'manager'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  _limit := GREATEST(1, LEAST(COALESCE(p_limit, 200), 500));
  _offset := GREATEST(0, COALESCE(p_offset, 0));

  CREATE TEMP TABLE IF NOT EXISTS _q_rows (
    row_id uuid,
    row_number bigint,
    is_active boolean,
    created_at timestamptz
  ) ON COMMIT DROP;
  TRUNCATE _q_rows;

  INSERT INTO _q_rows (row_id, row_number, is_active, created_at)
  SELECT r.id, r.row_number, r.is_active, r.created_at
  FROM public.dynamic_table_rows r
  WHERE r.table_id = p_table_id
    AND (p_show_inactive OR r.is_active = true);

  IF p_search IS NOT NULL AND length(btrim(p_search)) > 0 THEN
    _search_like := '%' || btrim(p_search) || '%';
    BEGIN
      _search_num := btrim(p_search)::numeric;
    EXCEPTION WHEN others THEN
      _search_num := NULL;
    END;

    DELETE FROM _q_rows q
    WHERE NOT (
      (_search_num IS NOT NULL AND q.row_number = _search_num::bigint)
      OR EXISTS (
        SELECT 1
        FROM public.dynamic_table_cells c
        JOIN public.dynamic_table_columns col ON col.id = c.column_id
        WHERE c.row_id = q.row_id
          AND c.table_id = p_table_id
          AND col.data_type::text IN ('text','phone','tag','status')
          AND c.value_text ILIKE _search_like
      )
    );
  END IF;

  IF p_filters IS NOT NULL AND jsonb_typeof(p_filters) = 'array' THEN
    FOR _filter IN SELECT * FROM jsonb_array_elements(p_filters) LOOP
      _col_id := NULLIF(_filter->>'column_id','')::uuid;
      _op := lower(COALESCE(_filter->>'op',''));
      _val := _filter->>'value';
      _val2 := _filter->>'value2';

      IF _col_id IS NULL OR _op = '' THEN CONTINUE; END IF;

      SELECT col.data_type::text INTO _col_type
      FROM public.dynamic_table_columns col
      WHERE col.id = _col_id AND col.table_id = p_table_id;
      IF _col_type IS NULL THEN CONTINUE; END IF;

      IF _col_type = 'boolean' THEN
        IF _op = 'empty' THEN
          DELETE FROM _q_rows q WHERE EXISTS (
            SELECT 1 FROM public.dynamic_table_cells c
            WHERE c.row_id = q.row_id AND c.column_id = _col_id AND c.value_boolean IS NOT NULL
          );
        ELSIF _op IN ('true','false','equals') THEN
          DELETE FROM _q_rows q WHERE NOT EXISTS (
            SELECT 1 FROM public.dynamic_table_cells c
            WHERE c.row_id = q.row_id AND c.column_id = _col_id
              AND c.value_boolean = (CASE WHEN _op = 'true' OR _val = 'true' THEN true ELSE false END)
          );
        END IF;

      ELSIF _col_type = 'number' THEN
        IF _val IS NULL OR _val = '' THEN CONTINUE; END IF;
        DECLARE _n numeric;
        BEGIN
          BEGIN _n := _val::numeric; EXCEPTION WHEN others THEN CONTINUE; END;
          IF _op = 'equals' OR _op = 'eq' THEN
            DELETE FROM _q_rows q WHERE NOT EXISTS (
              SELECT 1 FROM public.dynamic_table_cells c
              WHERE c.row_id = q.row_id AND c.column_id = _col_id AND c.value_number = _n
            );
          ELSIF _op IN ('greater_than','gt') THEN
            DELETE FROM _q_rows q WHERE NOT EXISTS (
              SELECT 1 FROM public.dynamic_table_cells c
              WHERE c.row_id = q.row_id AND c.column_id = _col_id AND c.value_number > _n
            );
          ELSIF _op IN ('less_than','lt') THEN
            DELETE FROM _q_rows q WHERE NOT EXISTS (
              SELECT 1 FROM public.dynamic_table_cells c
              WHERE c.row_id = q.row_id AND c.column_id = _col_id AND c.value_number < _n
            );
          END IF;
        END;

      ELSIF _col_type = 'date' THEN
        DECLARE _d date; _d2 date;
        BEGIN
          BEGIN _d := NULLIF(_val,'')::date; EXCEPTION WHEN others THEN _d := NULL; END;
          BEGIN _d2 := NULLIF(_val2,'')::date; EXCEPTION WHEN others THEN _d2 := NULL; END;
          IF _d IS NOT NULL THEN
            DELETE FROM _q_rows q WHERE NOT EXISTS (
              SELECT 1 FROM public.dynamic_table_cells c
              WHERE c.row_id = q.row_id AND c.column_id = _col_id AND c.value_date >= _d
            );
          END IF;
          IF _d2 IS NOT NULL THEN
            DELETE FROM _q_rows q WHERE NOT EXISTS (
              SELECT 1 FROM public.dynamic_table_cells c
              WHERE c.row_id = q.row_id AND c.column_id = _col_id AND c.value_date <= _d2
            );
          END IF;
        END;

      ELSIF _col_type = 'datetime' THEN
        DECLARE _ts timestamptz; _ts2 timestamptz;
        BEGIN
          BEGIN _ts := NULLIF(_val,'')::timestamptz; EXCEPTION WHEN others THEN _ts := NULL; END;
          BEGIN _ts2 := NULLIF(_val2,'')::timestamptz; EXCEPTION WHEN others THEN _ts2 := NULL; END;
          IF _ts IS NOT NULL THEN
            DELETE FROM _q_rows q WHERE NOT EXISTS (
              SELECT 1 FROM public.dynamic_table_cells c
              WHERE c.row_id = q.row_id AND c.column_id = _col_id AND c.value_datetime >= _ts
            );
          END IF;
          IF _ts2 IS NOT NULL THEN
            DELETE FROM _q_rows q WHERE NOT EXISTS (
              SELECT 1 FROM public.dynamic_table_cells c
              WHERE c.row_id = q.row_id AND c.column_id = _col_id AND c.value_datetime <= _ts2
            );
          END IF;
        END;

      ELSE
        IF _val IS NOT NULL AND _val <> '' THEN
          DECLARE _like text := '%' || btrim(_val) || '%';
          BEGIN
            DELETE FROM _q_rows q WHERE NOT EXISTS (
              SELECT 1 FROM public.dynamic_table_cells c
              WHERE c.row_id = q.row_id AND c.column_id = _col_id AND c.value_text ILIKE _like
            );
          END;
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN QUERY
  WITH counted AS (
    SELECT count(*)::bigint AS total FROM _q_rows
  ),
  windowed AS (
    SELECT q.row_id, q.row_number, q.is_active, q.created_at
    FROM _q_rows q
    ORDER BY q.row_number ASC
    LIMIT _limit OFFSET _offset
  ),
  pivoted AS (
    SELECT w.row_id,
           COALESCE(
             jsonb_object_agg(
               col.column_key,
               CASE col.data_type::text
                 WHEN 'number'   THEN to_jsonb(c.value_number)
                 WHEN 'boolean'  THEN to_jsonb(c.value_boolean)
                 WHEN 'date'     THEN to_jsonb(c.value_date)
                 WHEN 'datetime' THEN to_jsonb(c.value_datetime)
                 ELSE                  to_jsonb(c.value_text)
               END
             ) FILTER (WHERE col.column_key IS NOT NULL),
             '{}'::jsonb
           ) AS vals
    FROM windowed w
    LEFT JOIN public.dynamic_table_cells c ON c.row_id = w.row_id AND c.table_id = p_table_id
    LEFT JOIN public.dynamic_table_columns col ON col.id = c.column_id
    GROUP BY w.row_id
  )
  SELECT (SELECT total FROM counted) AS total_count,
         w.row_id, w.row_number, w.is_active, w.created_at,
         COALESCE(p.vals, '{}'::jsonb) AS out_values
  FROM windowed w
  LEFT JOIN pivoted p ON p.row_id = w.row_id
  ORDER BY w.row_number ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.query_dynamic_table_rows(uuid, jsonb, text, boolean, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.query_dynamic_table_rows(uuid, jsonb, text, boolean, int, int) TO authenticated;