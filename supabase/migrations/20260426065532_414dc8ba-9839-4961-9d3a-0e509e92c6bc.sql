-- Phase 4.7: Public bot endpoints — usage log + secure RPCs
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Usage log table
CREATE TABLE IF NOT EXISTS public.bot_api_usage_logs (
  id bigserial PRIMARY KEY,
  api_key_id uuid REFERENCES public.bot_api_keys(id) ON DELETE SET NULL,
  table_id uuid,
  endpoint text NOT NULL,
  method text NOT NULL,
  status_code int NOT NULL,
  error_code text,
  ip text,
  request_size int,
  response_count int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bot_usage_key_time ON public.bot_api_usage_logs(api_key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_usage_time ON public.bot_api_usage_logs(created_at DESC);

ALTER TABLE public.bot_api_usage_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bot_usage_admin_manager_read" ON public.bot_api_usage_logs;
CREATE POLICY "bot_usage_admin_manager_read" ON public.bot_api_usage_logs
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));

-- 2) RPC: authenticate a raw bot key (called from server with service role)
-- Returns the key_id if active and non-expired; raises otherwise.
CREATE OR REPLACE FUNCTION public.bot_authenticate_key(p_raw_key text)
RETURNS TABLE (key_id uuid, name text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hash text;
  _id uuid;
  _name text;
  _active boolean;
  _expires timestamptz;
BEGIN
  IF p_raw_key IS NULL OR length(btrim(p_raw_key)) < 8 THEN
    RAISE EXCEPTION 'invalid_key';
  END IF;

  _hash := encode(digest(p_raw_key, 'sha256'), 'hex');

  SELECT k.id, k.name, k.is_active, k.expires_at
    INTO _id, _name, _active, _expires
  FROM public.bot_api_keys k
  WHERE k.key_hash = _hash;

  IF _id IS NULL THEN RAISE EXCEPTION 'invalid_key'; END IF;
  IF NOT _active THEN RAISE EXCEPTION 'inactive_key'; END IF;
  IF _expires IS NOT NULL AND _expires < now() THEN RAISE EXCEPTION 'expired_key'; END IF;

  UPDATE public.bot_api_keys SET last_used_at = now() WHERE id = _id;

  RETURN QUERY SELECT _id, _name;
END;
$$;

-- 3) RPC: query rows on behalf of a bot key (read access enforced)
CREATE OR REPLACE FUNCTION public.bot_query_table_rows(
  p_key_id uuid,
  p_table_id uuid,
  p_search text DEFAULT NULL,
  p_page int DEFAULT 1,
  p_page_size int DEFAULT 50
)
RETURNS TABLE (
  total_count bigint,
  out_row_id uuid,
  out_row_number bigint,
  out_is_active boolean,
  out_created_at timestamptz,
  out_updated_at timestamptz,
  out_values jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _can_read boolean;
  _limit int;
  _offset int;
  _search_like text;
  _search_num numeric;
  _total bigint;
BEGIN
  -- Verify access mapping
  SELECT a.can_read INTO _can_read
  FROM public.bot_api_key_table_access a
  WHERE a.api_key_id = p_key_id AND a.table_id = p_table_id;

  IF _can_read IS NULL THEN RAISE EXCEPTION 'forbidden_table'; END IF;
  IF NOT _can_read THEN RAISE EXCEPTION 'forbidden_read'; END IF;

  _limit := GREATEST(1, LEAST(COALESCE(p_page_size, 50), 100));
  _offset := GREATEST(0, (GREATEST(1, COALESCE(p_page, 1)) - 1) * _limit);

  CREATE TEMP TABLE IF NOT EXISTS _bot_q_rows (
    row_id uuid, row_number bigint, is_active boolean,
    created_at timestamptz, updated_at timestamptz
  ) ON COMMIT DROP;
  TRUNCATE _bot_q_rows;

  INSERT INTO _bot_q_rows (row_id, row_number, is_active, created_at, updated_at)
  SELECT r.id, r.row_number, r.is_active, r.created_at, r.updated_at
  FROM public.dynamic_table_rows r
  WHERE r.table_id = p_table_id AND r.is_active = true;

  IF p_search IS NOT NULL AND length(btrim(p_search)) > 0 THEN
    _search_like := '%' || btrim(p_search) || '%';
    BEGIN _search_num := btrim(p_search)::numeric; EXCEPTION WHEN others THEN _search_num := NULL; END;

    DELETE FROM _bot_q_rows q WHERE NOT (
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

  SELECT count(*) INTO _total FROM _bot_q_rows;

  RETURN QUERY
  WITH windowed AS (
    SELECT q.row_id, q.row_number, q.is_active, q.created_at, q.updated_at
    FROM _bot_q_rows q
    ORDER BY q.row_number ASC
    LIMIT _limit OFFSET _offset
  ),
  pivoted AS (
    SELECT w.row_id,
      COALESCE(jsonb_object_agg(
        col.column_key,
        CASE col.data_type::text
          WHEN 'number' THEN to_jsonb(c.value_number)
          WHEN 'boolean' THEN to_jsonb(c.value_boolean)
          WHEN 'date' THEN to_jsonb(c.value_date)
          WHEN 'datetime' THEN to_jsonb(c.value_datetime)
          ELSE to_jsonb(c.value_text)
        END
      ) FILTER (WHERE col.column_key IS NOT NULL), '{}'::jsonb) AS vals
    FROM windowed w
    LEFT JOIN public.dynamic_table_cells c ON c.row_id = w.row_id AND c.table_id = p_table_id
    LEFT JOIN public.dynamic_table_columns col ON col.id = c.column_id
    GROUP BY w.row_id
  )
  SELECT _total, w.row_id, w.row_number, w.is_active, w.created_at, w.updated_at,
         COALESCE(p.vals, '{}'::jsonb)
  FROM windowed w
  LEFT JOIN pivoted p ON p.row_id = w.row_id
  ORDER BY w.row_number ASC;
END;
$$;

-- 4) RPC: update one row on behalf of a bot key (update + per-column access enforced)
CREATE OR REPLACE FUNCTION public.bot_update_table_row(
  p_key_id uuid,
  p_table_id uuid,
  p_row_id uuid,
  p_values jsonb
)
RETURNS TABLE (updated_count int, applied_keys text[])
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.bot_authenticate_key(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bot_query_table_rows(uuid, uuid, text, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bot_update_table_row(uuid, uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bot_authenticate_key(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.bot_query_table_rows(uuid, uuid, text, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.bot_update_table_row(uuid, uuid, uuid, jsonb) TO service_role;