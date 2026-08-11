-- 335: converge the drift that migrations alone cannot reproduce.
--
-- WHY THIS EXISTS
--
-- On 2026-08-11 the production server was brought from commit cb7c070f (5 June)
-- up to feature/navigation-modernization. Replaying the 299 intervening
-- migrations onto an exact copy of production produced a database that did NOT
-- match the test server, and the app could not read a single table. The reasons
-- were all the same shape: **state that exists on the test server but in no
-- migration file.**
--
--   * Migrations 324, 325 and 326 were applied to the test server but their
--     files were never committed to any branch. `git log --all --diff-filter=A`
--     finds nothing for any of them. The tree jumps 323 -> 327.
--   * 46 function bodies on the test server differ from what the migration files
--     produce. Among them are has_role, has_any_role and has_dynamic_permission,
--     which every RLS policy calls. The files still compare user_roles.role
--     against 'admin'::app_role while the column is now text, so a replayed
--     database raises `operator does not exist: text = app_role` on every read.
--   * Two indexes on product_interaction_events exist on the test server and are
--     created by no file.
--   * anon/authenticated/service_role need USAGE on schemas auth and extensions.
--     Without it every policy calling auth.uid() fails with
--     `permission denied for schema auth`, which silently empties list pages.
--   * The storage schema tables must be owned by supabase_storage_admin. When a
--     pg_restore runs as the wrong role they end up owned by supabase_admin and
--     the storage service crash-loops on `permission denied for table migrations`.
--   * salesperson_capital_allocations_dynamic.salesperson_id needs an explicit FK
--     to profiles(id). The page embeds profiles via PostgREST, and the only other
--     FK on that column points at auth.users, which PostgREST cannot follow. The
--     capital allocation list came up empty on BOTH servers because of this.
--
-- This migration carries all of that, so a database built from the files alone
-- reaches the same state as the test server.
--
-- IDEMPOTENT BY DESIGN
-- Every statement is CREATE OR REPLACE, IF NOT EXISTS, a GRANT, or an ownership
-- assignment. Running it against an environment that already has these changes
-- is a no-op. It was applied to production piecemeal on 2026-08-11 and is
-- expected to change nothing there.
--
-- ROLLBACK
-- There is no meaningful rollback: reverting this restores the broken state.
-- The prior function bodies are recoverable from the pre-migration dump.

SET client_encoding='UTF8';

-- ---------------------------------------------------------------- functions --
-- Signatures match on every environment; only the bodies drifted. One function
-- changed its parameter defaults and must be dropped before it can be replaced.
DROP FUNCTION IF EXISTS public.get_employee_rank(uuid);
CREATE OR REPLACE FUNCTION public._mi_require_privileged()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF NOT has_any_role(auth.uid(), ARRAY['admin'::text,'manager'::text,'accountant'::text]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.add_dynamic_table_column(p_table_id uuid, p_column_key text, p_label text, p_data_type text, p_is_required boolean DEFAULT false, p_is_filterable boolean DEFAULT false, p_is_editable_by_bot boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _new_id uuid;
  _next_order int;
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text]) THEN
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
$function$
;

CREATE OR REPLACE FUNCTION public.add_messenger_group_member(p_group_id uuid, p_user_id uuid, p_role text DEFAULT 'member'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_id  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_role NOT IN ('admin','member','viewer','purchaser') THEN
    RAISE EXCEPTION 'INVALID_ROLE' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.messenger_group_members
    WHERE group_id = p_group_id AND user_id = v_uid AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'NOT_GROUP_ADMIN' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.messenger_group_members(group_id, user_id, role)
  VALUES (p_group_id, p_user_id, p_role)
  ON CONFLICT (group_id, user_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'ALREADY_MEMBER' USING ERRCODE = 'P0001';
  END IF;

  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_gamification_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::text) OR has_role(auth.uid(), 'manager'::text)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'total_employees', (SELECT count(*) FROM public.employee_progress),
    'avg_xp', COALESCE((SELECT round(avg(xp_total)::numeric, 1) FROM public.employee_progress), 0),
    'avg_level', COALESCE((SELECT round(avg(level)::numeric, 1) FROM public.employee_progress), 0),
    'top_players', COALESCE((
      SELECT jsonb_agg(t)
      FROM (
        SELECT ep.employee_id, p.full_name, ep.level, ep.xp_total
        FROM public.employee_progress ep
        LEFT JOIN public.profiles p ON p.id = ep.employee_id
        ORDER BY ep.xp_total DESC
        LIMIT 5
      ) t
    ), '[]'::jsonb),
    'league_distribution', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('league', league, 'count', cnt))
      FROM (
        SELECT league, count(*) AS cnt
        FROM public.employee_leagues el
        WHERE el.season = (SELECT id::text FROM public.league_seasons WHERE is_active LIMIT 1)
           OR NOT EXISTS (SELECT 1 FROM public.league_seasons WHERE is_active)
        GROUP BY league
      ) s
    ), '[]'::jsonb),
    'xp_distribution', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('bucket', bucket, 'count', cnt) ORDER BY ord)
      FROM (
        SELECT
          CASE
            WHEN xp_total < 500 THEN '0-500'
            WHEN xp_total < 2000 THEN '500-2k'
            WHEN xp_total < 5000 THEN '2k-5k'
            WHEN xp_total < 10000 THEN '5k-10k'
            ELSE '10k+'
          END AS bucket,
          CASE
            WHEN xp_total < 500 THEN 1
            WHEN xp_total < 2000 THEN 2
            WHEN xp_total < 5000 THEN 3
            WHEN xp_total < 10000 THEN 4
            ELSE 5
          END AS ord,
          count(*) AS cnt
        FROM public.employee_progress
        GROUP BY bucket, ord
      ) s
    ), '[]'::jsonb),
    'missions_completion', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('mission', title_fa, 'completed', completed, 'total', total))
      FROM (
        SELECT m.title_fa,
               count(emp.*) FILTER (WHERE emp.completed) AS completed,
               count(emp.*) AS total
        FROM public.missions m
        LEFT JOIN public.employee_mission_progress emp ON emp.mission_id = m.id
        WHERE m.enabled
        GROUP BY m.title_fa
        ORDER BY total DESC
        LIMIT 10
      ) s
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.assign_user_role_txt(_target_user uuid, _role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.user_roles (user_id, role, assigned_by)
  VALUES (_target_user, _role::public.app_role, auth.uid())
  ON CONFLICT (user_id, role) DO NOTHING;
END; $function$
;

CREATE OR REPLACE FUNCTION public.auto_submit_penalty(p_inquiry_id uuid, p_user_id uuid, p_type text, p_severity text, p_description text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_penalty_id uuid;
  v_event_type text;
  v_default_score numeric;
  v_score_value numeric;
BEGIN
  IF p_user_id IS NULL THEN RETURN NULL; END IF;

  IF EXISTS (
    SELECT 1 FROM public.performance_penalties
    WHERE inquiry_id = p_inquiry_id AND user_id = p_user_id AND type = p_type AND is_active = true
  ) THEN RETURN NULL; END IF;

  INSERT INTO public.performance_penalties (user_id, inquiry_id, type, severity, description, created_by)
  VALUES (p_user_id, p_inquiry_id, p_type, p_severity, p_description, NULL)
  RETURNING id INTO v_penalty_id;

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, diff)
  VALUES ('penalty', v_penalty_id::text, 'auto_created', p_user_id,
          jsonb_build_object('type', p_type, 'severity', p_severity,
                             'inquiry_id', p_inquiry_id, 'description', p_description));

  INSERT INTO public.notification_events (event_type, user_id, channel, payload, status)
  VALUES (
    'red_card_issued', p_user_id, 'in_app',
    jsonb_build_object(
      'title', 'کارت قرمز جدید',
      'body', 'کارت قرمز در پرونده عملکرد شما ثبت شد.',
      'reference_type', 'penalty',
      'reference_id', v_penalty_id
    ),
    'pending'
  );

  v_event_type := 'penalty_' || p_type;
  v_default_score := CASE lower(coalesce(p_severity,'medium'))
    WHEN 'low' THEN -5 WHEN 'medium' THEN -10 WHEN 'high' THEN -20 WHEN 'critical' THEN -50 ELSE -10 END;
  v_score_value := public.get_kpi_xp(v_event_type, v_default_score);

  INSERT INTO public.employee_score_events (employee_id, event_type, source_table, source_id, triggered_at, payload)
  VALUES (p_user_id, v_event_type, 'performance_penalties', v_penalty_id::text, now(),
          jsonb_build_object('severity', p_severity, 'inquiry_id', p_inquiry_id,
                             'penalty_type', p_type, 'score_value', v_score_value))
  -- Migration 326: the WHERE clause is REQUIRED. uniq_score_events_source is a
  -- PARTIAL unique index, and ON CONFLICT cannot infer a partial index unless
  -- the statement repeats its predicate. Without this line the statement fails
  -- to plan with 42P10 on every call - it is not an optimisation.
  -- Identical to the clause in award_inquiry_response_score().
  ON CONFLICT (source_table, source_id, event_type)
    WHERE source_table IS NOT NULL AND source_id IS NOT NULL
  DO NOTHING;

  RETURN v_penalty_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.bot_key_stats_today()
 RETURNS TABLE(api_key_id uuid, requests_today bigint, errors_today bigint, last_used_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT
      l.api_key_id,
      count(*)                                                        AS requests_today,
      count(*) FILTER (WHERE l.status_code >= 400)                    AS errors_today,
      max(l.created_at)                                               AS last_used_at
    FROM public.bot_api_usage_logs l
    WHERE l.api_key_id IS NOT NULL
      AND l.created_at >= date_trunc('day', now())
    GROUP BY l.api_key_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.bot_suspicious_ips(p_limit integer DEFAULT 20)
 RETURNS TABLE(ip text, failed_count bigint, last_attempt_at timestamp with time zone, distinct_endpoints bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT
      l.ip,
      count(*)                       AS failed_count,
      max(l.created_at)              AS last_attempt_at,
      count(DISTINCT l.endpoint)     AS distinct_endpoints
    FROM public.bot_api_usage_logs l
    WHERE l.ip IS NOT NULL
      AND l.status_code >= 400
      AND l.created_at >= now() - interval '24 hours'
    GROUP BY l.ip
    HAVING count(*) >= 5
    ORDER BY count(*) DESC
    LIMIT GREATEST(1, LEAST(p_limit, 100));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_bot_api_key(p_name text, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(id uuid, raw_key text, key_prefix text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _id uuid;
  _raw text;
  _prefix text;
  _hash text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT public.has_any_role(_uid, ARRAY['admin'::text, 'manager'::text]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_name IS NULL OR length(btrim(p_name)) = 0 THEN
    RAISE EXCEPTION 'name_required';
  END IF;

  _raw := 'bk_' || encode(extensions.gen_random_bytes(20), 'hex');
  _prefix := substring(_raw FROM 1 FOR 10);
  _hash := encode(extensions.digest(_raw, 'sha256'), 'hex');

  INSERT INTO public.bot_api_keys (name, key_hash, key_prefix, is_active, created_by, expires_at)
  VALUES (btrim(p_name), _hash, _prefix, true, _uid, p_expires_at)
  RETURNING bot_api_keys.id INTO _id;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (_uid, 'bot_api_keys', _id::text, 'bot_api_key_created',
          jsonb_build_object('name', btrim(p_name), 'expires_at', p_expires_at, 'key_prefix', _prefix));

  RETURN QUERY SELECT _id, _raw, _prefix;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_custom_role(_name text, _display_name text DEFAULT NULL::text, _description text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE new_id uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::text) THEN RAISE EXCEPTION 'permission denied'; END IF;
  IF _name IS NULL OR length(_name) < 2 OR length(_name) > 50 THEN RAISE EXCEPTION 'invalid role name length'; END IF;
  IF _name !~ '^[a-z_][a-z0-9_]*$' THEN RAISE EXCEPTION 'role name must be lowercase letters/digits/underscores'; END IF;

  INSERT INTO public.custom_roles (name, display_name, description, is_system, is_active, created_by)
  VALUES (_name, COALESCE(_display_name, _name), _description, false, true, auth.uid())
  RETURNING id INTO new_id;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'role', new_id::text, 'role_created', jsonb_build_object('name', _name, 'display_name', _display_name));
  RETURN new_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_bot_api_key_table_access(p_key_id uuid, p_table_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT public.has_any_role(_uid, ARRAY['admin'::text, 'manager'::text]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  DELETE FROM public.bot_api_key_table_access
  WHERE api_key_id = p_key_id AND table_id = p_table_id;

  UPDATE public.bot_api_keys k
  SET allowed_table_ids = COALESCE((
    SELECT array_agg(DISTINCT a.table_id)
    FROM public.bot_api_key_table_access a
    WHERE a.api_key_id = k.id
  ), '{}'::uuid[])
  WHERE k.id = p_key_id;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (_uid, 'bot_api_keys', p_key_id::text, 'bot_api_key_access_removed',
          jsonb_build_object('table_id', p_table_id));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.dyn_table_role_can_view(_user_id uuid, _access_level text, _allowed_roles jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _role_text text;
BEGIN
  IF _access_level <> 'custom' THEN
    RETURN public.dyn_table_role_can_view(_user_id, _access_level);
  END IF;

  -- Custom: admin/manager always pass
  IF public.has_any_role(_user_id, ARRAY['admin','manager']::text[]) THEN
    RETURN true;
  END IF;

  IF _allowed_roles IS NULL OR jsonb_typeof(_allowed_roles) <> 'array' THEN
    RETURN false;
  END IF;

  -- Iterate the allowed_roles array; match against text enum
  FOR _role_text IN SELECT jsonb_array_elements_text(_allowed_roles) LOOP
    BEGIN
      IF public.has_role(_user_id, _role_text::text) THEN
        RETURN true;
      END IF;
    EXCEPTION WHEN invalid_text_representation THEN
      -- ignore unknown role names
      NULL;
    END;
  END LOOP;

  RETURN false;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.dyn_table_role_can_view(_user_id uuid, _access_level text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _allowed jsonb;
BEGIN
  -- Admin / manager always see everything
  IF public.has_any_role(_user_id, ARRAY['admin','manager']::text[]) THEN
    RETURN true;
  END IF;

  IF _access_level = 'all' THEN RETURN true; END IF;
  IF _access_level = 'manager_only' THEN RETURN false; END IF; -- handled above
  IF _access_level = 'admin_only' THEN RETURN false; END IF;
  IF _access_level = 'finance_only' THEN
    RETURN public.has_role(_user_id, 'accountant'::text);
  END IF;
  IF _access_level = 'sales_only' THEN
    RETURN public.has_role(_user_id, 'sales'::text);
  END IF;

  -- 'custom' is row-specific so this overload returns false; the row-aware
  -- overload below handles that case via allowed_roles.
  RETURN false;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.export_dynamic_table_rows(p_table_id uuid, p_filters jsonb DEFAULT '[]'::jsonb, p_search text DEFAULT NULL::text, p_show_inactive boolean DEFAULT false, p_limit integer DEFAULT 5000)
 RETURNS TABLE(total_count bigint, exported_count bigint, out_row_id uuid, out_row_number bigint, out_is_active boolean, out_created_at timestamp with time zone, out_values jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  _total bigint := 0;
  _exported bigint := 0;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF NOT public.has_any_role(_uid, ARRAY['admin'::text, 'manager'::text]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  _limit := GREATEST(1, LEAST(COALESCE(p_limit, 5000), 5000));

  CREATE TEMP TABLE IF NOT EXISTS _x_rows (
    row_id uuid,
    row_number bigint,
    is_active boolean,
    created_at timestamptz
  ) ON COMMIT DROP;
  TRUNCATE _x_rows;

  INSERT INTO _x_rows (row_id, row_number, is_active, created_at)
  SELECT r.id, r.row_number, r.is_active, r.created_at
  FROM public.dynamic_table_rows r
  WHERE r.table_id = p_table_id
    AND (p_show_inactive OR r.is_active = true);

  IF p_search IS NOT NULL AND length(btrim(p_search)) > 0 THEN
    _search_like := '%' || btrim(p_search) || '%';
    BEGIN _search_num := btrim(p_search)::numeric; EXCEPTION WHEN others THEN _search_num := NULL; END;

    DELETE FROM _x_rows q
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
          DELETE FROM _x_rows q WHERE EXISTS (
            SELECT 1 FROM public.dynamic_table_cells c
            WHERE c.row_id = q.row_id AND c.column_id = _col_id AND c.value_boolean IS NOT NULL
          );
        ELSIF _op IN ('true','false','equals') THEN
          DELETE FROM _x_rows q WHERE NOT EXISTS (
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
            DELETE FROM _x_rows q WHERE NOT EXISTS (
              SELECT 1 FROM public.dynamic_table_cells c
              WHERE c.row_id = q.row_id AND c.column_id = _col_id AND c.value_number = _n);
          ELSIF _op IN ('greater_than','gt') THEN
            DELETE FROM _x_rows q WHERE NOT EXISTS (
              SELECT 1 FROM public.dynamic_table_cells c
              WHERE c.row_id = q.row_id AND c.column_id = _col_id AND c.value_number > _n);
          ELSIF _op IN ('less_than','lt') THEN
            DELETE FROM _x_rows q WHERE NOT EXISTS (
              SELECT 1 FROM public.dynamic_table_cells c
              WHERE c.row_id = q.row_id AND c.column_id = _col_id AND c.value_number < _n);
          END IF;
        END;

      ELSIF _col_type = 'date' THEN
        DECLARE _d date; _d2 date;
        BEGIN
          BEGIN _d := NULLIF(_val,'')::date; EXCEPTION WHEN others THEN _d := NULL; END;
          BEGIN _d2 := NULLIF(_val2,'')::date; EXCEPTION WHEN others THEN _d2 := NULL; END;
          IF _d IS NOT NULL THEN
            DELETE FROM _x_rows q WHERE NOT EXISTS (
              SELECT 1 FROM public.dynamic_table_cells c
              WHERE c.row_id = q.row_id AND c.column_id = _col_id AND c.value_date >= _d);
          END IF;
          IF _d2 IS NOT NULL THEN
            DELETE FROM _x_rows q WHERE NOT EXISTS (
              SELECT 1 FROM public.dynamic_table_cells c
              WHERE c.row_id = q.row_id AND c.column_id = _col_id AND c.value_date <= _d2);
          END IF;
        END;

      ELSIF _col_type = 'datetime' THEN
        DECLARE _ts timestamptz; _ts2 timestamptz;
        BEGIN
          BEGIN _ts := NULLIF(_val,'')::timestamptz; EXCEPTION WHEN others THEN _ts := NULL; END;
          BEGIN _ts2 := NULLIF(_val2,'')::timestamptz; EXCEPTION WHEN others THEN _ts2 := NULL; END;
          IF _ts IS NOT NULL THEN
            DELETE FROM _x_rows q WHERE NOT EXISTS (
              SELECT 1 FROM public.dynamic_table_cells c
              WHERE c.row_id = q.row_id AND c.column_id = _col_id AND c.value_datetime >= _ts);
          END IF;
          IF _ts2 IS NOT NULL THEN
            DELETE FROM _x_rows q WHERE NOT EXISTS (
              SELECT 1 FROM public.dynamic_table_cells c
              WHERE c.row_id = q.row_id AND c.column_id = _col_id AND c.value_datetime <= _ts2);
          END IF;
        END;

      ELSE
        IF _val IS NOT NULL AND _val <> '' THEN
          DECLARE _like text := '%' || btrim(_val) || '%';
          BEGIN
            DELETE FROM _x_rows q WHERE NOT EXISTS (
              SELECT 1 FROM public.dynamic_table_cells c
              WHERE c.row_id = q.row_id AND c.column_id = _col_id AND c.value_text ILIKE _like);
          END;
        END IF;
      END IF;
    END LOOP;
  END IF;

  SELECT count(*) INTO _total FROM _x_rows;
  _exported := LEAST(_total, _limit);

  -- Audit log entry (one per export call)
  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, diff)
  VALUES (
    'dynamic_table',
    p_table_id::text,
    'export_csv',
    _uid,
    jsonb_build_object(
      'table_id', p_table_id,
      'filters', COALESCE(p_filters, '[]'::jsonb),
      'search', p_search,
      'show_inactive', p_show_inactive,
      'total_count', _total,
      'exported_count', _exported,
      'limit', _limit
    )
  );

  RETURN QUERY
  WITH windowed AS (
    SELECT q.row_id, q.row_number, q.is_active, q.created_at
    FROM _x_rows q
    ORDER BY q.row_number ASC
    LIMIT _limit
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
  SELECT _total AS total_count,
         _exported AS exported_count,
         w.row_id, w.row_number, w.is_active, w.created_at,
         COALESCE(p.vals, '{}'::jsonb) AS out_values
  FROM windowed w
  LEFT JOIN pivoted p ON p.row_id = w.row_id
  ORDER BY w.row_number ASC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_employee_rank(_employee_id uuid)
 RETURNS TABLE(employee_id uuid, daily_score numeric, weekly_score numeric, monthly_score numeric, total_score numeric, daily_rank bigint, weekly_rank bigint, monthly_rank bigint, all_time_rank bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH ranked AS (
    SELECT
      es.employee_id AS emp_id,
      es.daily_score, es.weekly_score, es.monthly_score, es.total_score,
      RANK() OVER (ORDER BY es.daily_score   DESC) AS d_rank,
      RANK() OVER (ORDER BY es.weekly_score  DESC) AS w_rank,
      RANK() OVER (ORDER BY es.monthly_score DESC) AS m_rank,
      RANK() OVER (ORDER BY es.total_score   DESC) AS a_rank
    FROM public.employee_scores es
  )
  SELECT
    r.emp_id        AS employee_id,
    r.daily_score, r.weekly_score, r.monthly_score, r.total_score,
    r.d_rank        AS daily_rank,
    r.w_rank        AS weekly_rank,
    r.m_rank        AS monthly_rank,
    r.a_rank        AS all_time_rank
  FROM ranked r
  WHERE r.emp_id = _employee_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_leaderboard_all_time(_team text DEFAULT NULL::text, _department text DEFAULT NULL::text, _role text DEFAULT NULL::text, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
 RETURNS TABLE(employee_id uuid, full_name text, team text, department text, role text, score numeric, rank bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT * FROM public.get_leaderboard('all_time', _team, _department, _role, _limit, _offset);
$function$
;

CREATE OR REPLACE FUNCTION public.get_leaderboard_daily(_team text DEFAULT NULL::text, _department text DEFAULT NULL::text, _role text DEFAULT NULL::text, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
 RETURNS TABLE(employee_id uuid, full_name text, team text, department text, role text, score numeric, rank bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT * FROM public.get_leaderboard('daily', _team, _department, _role, _limit, _offset);
$function$
;

CREATE OR REPLACE FUNCTION public.get_leaderboard_monthly(_team text DEFAULT NULL::text, _department text DEFAULT NULL::text, _role text DEFAULT NULL::text, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
 RETURNS TABLE(employee_id uuid, full_name text, team text, department text, role text, score numeric, rank bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT * FROM public.get_leaderboard('monthly', _team, _department, _role, _limit, _offset);
$function$
;

CREATE OR REPLACE FUNCTION public.get_leaderboard_weekly(_team text DEFAULT NULL::text, _department text DEFAULT NULL::text, _role text DEFAULT NULL::text, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
 RETURNS TABLE(employee_id uuid, full_name text, team text, department text, role text, score numeric, rank bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT * FROM public.get_leaderboard('weekly', _team, _department, _role, _limit, _offset);
$function$
;

CREATE OR REPLACE FUNCTION public.get_payable_detail(p_supplier_id uuid DEFAULT NULL::uuid, p_purchase_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(supplier_id uuid, supplier_name text, purchase_id uuid, purchase_date date, due_date date, payment_term_days integer, purchase_total_amount numeric, cash_price numeric, currency text, paid_at timestamp with time zone, outstanding_amount numeric, is_paid boolean, is_overdue boolean, item_id uuid, product_id uuid, product_name text, item_quantity numeric, item_unit_price numeric, item_line_total numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_supplier_id IS NULL AND p_purchase_id IS NULL THEN
    RAISE EXCEPTION 'p_supplier_id or p_purchase_id required' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    v.supplier_id, v.supplier_name, v.purchase_id, v.purchase_date, v.due_date,
    v.payment_term_days, v.purchase_total_amount, v.cash_price, v.currency,
    v.paid_at, v.outstanding_amount, v.is_paid, v.is_overdue,
    pi.id AS item_id,
    COALESCE(pi.product_id, pu.product_id) AS product_id,
    pr.name AS product_name,
    COALESCE(pi.quantity, pu.quantity) AS item_quantity,
    COALESCE(pi.unit_price, pu.purchase_price) AS item_unit_price,
    COALESCE(pi.line_total, pu.purchase_price * pu.quantity) AS item_line_total
  FROM public.vw_supplier_payables v
  JOIN public.purchases pu              ON pu.id = v.purchase_id
  LEFT JOIN public.purchase_items pi    ON pi.purchase_id = v.purchase_id
  LEFT JOIN public.products pr          ON pr.id = COALESCE(pi.product_id, pu.product_id)
  WHERE (p_purchase_id IS NULL OR v.purchase_id = p_purchase_id)
    AND (p_supplier_id IS NULL OR v.supplier_id = p_supplier_id)
  ORDER BY v.purchase_date DESC NULLS LAST;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_rank_neighbors(_employee_id uuid, _period text DEFAULT 'monthly'::text, _window integer DEFAULT 3)
 RETURNS TABLE(employee_id uuid, full_name text, score numeric, rank bigint, relative_position text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH ranked AS (
    SELECT
      es.employee_id AS emp_id,
      p.full_name    AS full_name,
      CASE _period
        WHEN 'daily'    THEN es.daily_score
        WHEN 'weekly'   THEN es.weekly_score
        WHEN 'all_time' THEN es.total_score
        ELSE es.monthly_score
      END AS score_v,
      RANK() OVER (ORDER BY
        CASE _period
          WHEN 'daily'    THEN es.daily_score
          WHEN 'weekly'   THEN es.weekly_score
          WHEN 'all_time' THEN es.total_score
          ELSE es.monthly_score
        END DESC
      ) AS rnk
    FROM public.employee_scores es
    LEFT JOIN public.profiles p ON p.id = es.employee_id
  ),
  me AS (
    SELECT r.rnk AS r FROM ranked r WHERE r.emp_id = _employee_id LIMIT 1
  )
  SELECT
    r.emp_id    AS employee_id,
    r.full_name AS full_name,
    r.score_v   AS score,
    r.rnk       AS rank,
    CASE
      WHEN r.emp_id = _employee_id THEN 'self'
      WHEN r.rnk < (SELECT m.r FROM me m) THEN 'above'
      ELSE 'below'
    END AS relative_position
  FROM ranked r, me
  WHERE r.rnk BETWEEN (me.r - _window) AND (me.r + _window)
  ORDER BY r.rnk;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = ANY(_roles)) $function$
;

CREATE OR REPLACE FUNCTION public.has_dynamic_permission(_user_id uuid, _module text, _action text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _col text;
  _matched boolean;
  _exists boolean;
BEGIN
  IF _user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Admin shortcut
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'admin'::text
  ) THEN
    RETURN true;
  END IF;

  _col := CASE _action
    WHEN 'view' THEN 'can_view'
    WHEN 'create' THEN 'can_create'
    WHEN 'update' THEN 'can_update'
    WHEN 'delete' THEN 'can_delete'
    WHEN 'approve' THEN 'can_approve'
    WHEN 'export' THEN 'can_export'
    WHEN 'view_sensitive' THEN 'can_view_sensitive'
    ELSE NULL
  END;

  IF _col IS NULL THEN
    RETURN false;
  END IF;

  -- Check if any dynamic row exists for this user's roles + module
  EXECUTE format($f$
    SELECT
      EXISTS (
        SELECT 1
        FROM public.role_permissions rp
        JOIN public.user_roles ur
          ON ur.role::text = rp.role_name
        WHERE ur.user_id = $1
          AND rp.module = $2
      ),
      COALESCE(bool_or(rp.%I), false)
    FROM public.role_permissions rp
    JOIN public.user_roles ur
      ON ur.role::text = rp.role_name
    WHERE ur.user_id = $1
      AND rp.module = $2
  $f$, _col)
  INTO _exists, _matched
  USING _user_id, _module;

  IF _exists THEN
    RETURN _matched;
  END IF;

  -- Fallback: sensible defaults based on legacy static matrix
  IF _action IN ('view') THEN
    RETURN public.has_any_role(_user_id, ARRAY['admin','manager','accountant','sales','viewer']::text[]);
  ELSIF _action IN ('create','update') THEN
    RETURN public.has_any_role(_user_id, ARRAY['admin','manager']::text[]);
  ELSIF _action = 'delete' THEN
    RETURN public.has_role(_user_id, 'admin'::text);
  ELSIF _action IN ('approve','export') THEN
    RETURN public.has_any_role(_user_id, ARRAY['admin','manager','accountant']::text[]);
  ELSIF _action = 'view_sensitive' THEN
    RETURN public.has_any_role(_user_id, ARRAY['admin','manager','accountant']::text[]);
  END IF;

  RETURN false;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = _role) $function$
;

CREATE OR REPLACE FUNCTION public.kd_role_can_view(_uid uuid, _access_level text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE _access_level
    WHEN 'all' THEN true
    WHEN 'manager_only' THEN public.has_any_role(_uid, ARRAY['admin'::text,'manager'::text])
    WHEN 'finance_only' THEN public.has_any_role(_uid, ARRAY['admin'::text,'manager'::text,'accountant'::text])
    WHEN 'admin_only' THEN public.has_role(_uid, 'admin'::text)
    ELSE false
  END
$function$
;

CREATE OR REPLACE FUNCTION public.mi_get_seller_favorite_products(p_days integer DEFAULT 7, p_limit integer DEFAULT 10)
 RETURNS TABLE(product_id uuid, name text, sku text, brand jsonb, category jsonb, stock_status text, interaction_count integer, last_interaction_at timestamp with time zone, current_price numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 7), 1), 365);
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
BEGIN
  PERFORM _mi_require_privileged();

  RETURN QUERY
  WITH sales_users AS (
    SELECT ur.user_id FROM user_roles ur WHERE ur.role = 'sales'::text
  ),
  agg AS (
    SELECT e.product_id,
           COUNT(*)::int AS interaction_count,
           MAX(e.created_at) AS last_interaction_at
    FROM product_interaction_events e
    JOIN sales_users su ON su.user_id = e.user_id
    WHERE e.created_at >= now() - make_interval(days => v_days)
    GROUP BY e.product_id
  ),
  latest_price AS (
    SELECT DISTINCT ON (h.product_id) h.product_id, h.new_sale_price
    FROM product_sale_price_history h
    WHERE h.product_id IN (SELECT product_id FROM agg)
    ORDER BY h.product_id, h.created_at DESC
  )
  SELECT
    p.id AS product_id,
    p.name, p.sku,
    (SELECT jsonb_build_object('id', b.id, 'name', b.name) FROM brands b WHERE b.id = p.brand_id) AS brand,
    (SELECT jsonb_build_object('id', c.id, 'name', c.name) FROM categories c WHERE c.id = p.category_id) AS category,
    p.stock_status::text,
    a.interaction_count,
    a.last_interaction_at,
    lp.new_sale_price AS current_price
  FROM agg a
  JOIN products p ON p.id = a.product_id AND p.is_active = true
  LEFT JOIN latest_price lp ON lp.product_id = a.product_id
  ORDER BY a.interaction_count DESC, a.last_interaction_at DESC
  LIMIT v_limit;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mi_get_seller_top_products(p_days integer DEFAULT 7, p_limit integer DEFAULT 10)
 RETURNS TABLE(product_id uuid, name text, sku text, brand jsonb, category jsonb, stock_status text, seller_interaction_count integer, unique_seller_count integer, last_interaction_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 7), 1), 365);
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
BEGIN
  PERFORM _mi_require_privileged();

  RETURN QUERY
  WITH sellers AS (
    SELECT DISTINCT user_id FROM user_roles WHERE role = 'sales'::text
  ),
  agg AS (
    SELECT
      e.product_id,
      COUNT(*)::int AS seller_interaction_count,
      COUNT(DISTINCT e.user_id)::int AS unique_seller_count,
      MAX(e.created_at) AS last_interaction_at
    FROM product_interaction_events e
    JOIN sellers s ON s.user_id = e.user_id
    WHERE e.created_at >= now() - make_interval(days => v_days)
      AND e.event_type IN ('price_checked','chart_opened','product_details_opened','search_result_viewed')
    GROUP BY e.product_id
  )
  SELECT
    p.id AS product_id,
    p.name,
    p.sku,
    (SELECT jsonb_build_object('id', b.id, 'name', b.name) FROM brands b WHERE b.id = p.brand_id) AS brand,
    (SELECT jsonb_build_object('id', c.id, 'name', c.name) FROM categories c WHERE c.id = p.category_id) AS category,
    p.stock_status::text,
    a.seller_interaction_count,
    a.unique_seller_count,
    a.last_interaction_at
  FROM agg a
  JOIN products p ON p.id = a.product_id AND p.is_active = true
  ORDER BY a.seller_interaction_count DESC, a.unique_seller_count DESC, p.name ASC
  LIMIT v_limit;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.person_merge(p_winner_id uuid, p_loser_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid        uuid := auth.uid();
  _winner     public.persons%ROWTYPE;
  _loser      public.persons%ROWTYPE;
  _repointed  jsonb := '{}'::jsonb;
  _ids_moved  integer := 0;
  _als_moved  integer := 0;
  _lnk_moved  integer := 0;
  _n          integer;
  _key        text;
  _mode       text;
  _r          record;
  _remaining  bigint;
  _log_id     uuid;

  -- POLICY REGISTRY -----------------------------------------------------------
  -- "table.column" -> handling mode.
  --   identity_root : the legacy mirror's own person_id. Repointed FIRST so the
  --                   derived *_person_id columns stay consistent with it.
  --   generic       : plain UPDATE ... SET col = winner WHERE col = loser.
  --   special_move  : person-owned child rows, moved with de-duplication below.
  --   special_keep  : deliberately keeps references to the loser.
  --   skip          : audit trail; must never be repointed.
  -- Anything in the catalog and NOT in this registry aborts the merge.
  _registry constant jsonb := jsonb_build_object(
    'customers.person_id',                                    'identity_root',
    'suppliers.person_id',                                    'identity_root',
    'external_parties.person_id',                             'identity_root',

    -- D8-3 (migration 271): profiles.person_id, added by 270. It is 'generic'
    -- and NOT 'identity_root': profiles.person_id has no unique constraint, so
    -- two user accounts may legitimately point at one person, and a profile
    -- carries no financial state -- unlike a customer or supplier file, merging
    -- two of them mixes nothing that needs an accounting decision first. A
    -- plain repoint is therefore correct and needs no both-sides guard.
    'asan_import_person_rows.matched_person_id',                'generic',
    'profiles.person_id',                                     'generic',

    -- Migration 324. mutual_settlements.person_id, added by 319 (mutual
    -- settlement). Registering it is not optional bookkeeping: Guard 3 above
    -- aborts EVERY merge in the system while any persons-referencing column is
    -- unregistered, so from 319 until this migration no merge could run at all.
    -- Third time this trap has been sprung -- see 271 (profiles.person_id) and
    -- 287 (asan_import_person_rows.matched_person_id).
    --
    -- 'generic', not 'identity_root': a person can have many settlement
    -- documents, so the column carries no unique constraint and is not an
    -- identity mirror. A plain repoint is correct and needs no extra guard.
    --
    -- Why a plain repoint leaves a COHERENT document. A mutual settlement only
    -- exists for a person who has BOTH a customer file and a supplier file. If
    -- the loser has settlements it therefore has both, and Guard 7 above
    -- already refuses the merge unless the winner has neither. So the loser's
    -- customers and suppliers rows are themselves repointed to the winner as
    -- identity_root in the same Step A, and the settlement's customer_id and
    -- supplier_id keep pointing at those same rows. person_id, customer_id and
    -- supplier_id therefore all end up describing the winner -- no half-moved
    -- document. Asserted live in docs/verification/324-merge-test.sql.
    'mutual_settlements.person_id',                           'generic',

    'credit_requests.customer_person_id',                     'generic',
    'credit_score_snapshots.customer_person_id',              'generic',
    'customer_capital_allocations_dynamic.customer_person_id','generic',
    'customer_credit_balance.customer_person_id',             'generic',
    'customer_credit_ledger.customer_person_id',              'generic',
    'customer_credit_profile.customer_person_id',             'generic',
    'delivery_receipts.customer_person_id',                   'generic',
    'didar_activities.customer_person_id',                    'generic',
    'payment_receipts.customer_person_id',                    'generic',
    'payment_receipts.receiver_party_person_id',              'generic',
    'payment_vouchers.payee_person_id',                       'generic',
    'product_suppliers.supplier_person_id',                   'generic',
    'purchase_prices.supplier_person_id',                     'generic',
    'purchases.supplier_person_id',                           'generic',
    'sales_quotes.customer_person_id',                        'generic',

    'person_identifiers.person_id',                           'special_move',
    'person_aliases.person_id',                               'special_move',
    'person_context_links.person_id',                         'special_move',
    'person_field_values.person_id',                          'special_move',

    'person_merge_candidates.person_id_a',                    'special_keep',
    'person_merge_candidates.person_id_b',                    'special_keep',

    'person_merge_log.winner_id',                             'skip',
    'person_merge_log.loser_id',                              'skip'
  );
BEGIN
  ---------------------------------------------------------------------------
  -- Guard 1 + 2: authentication, role, existence, distinctness, active state.
  ---------------------------------------------------------------------------
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_any_role(_uid, ARRAY['admin','manager']::text[]) THEN
    RAISE EXCEPTION 'ادغام اشخاص فقط برای مدیر سیستم یا مدیر مجاز است.'
      USING ERRCODE = '42501';
  END IF;

  IF p_winner_id IS NULL OR p_loser_id IS NULL THEN
    RAISE EXCEPTION 'شناسهٔ شخص برنده و بازنده هر دو الزامی است.' USING ERRCODE = '22023';
  END IF;

  IF p_winner_id = p_loser_id THEN
    RAISE EXCEPTION 'نمی‌توان یک شخص را با خودش ادغام کرد.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _winner FROM public.persons WHERE id = p_winner_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'شخص برندهٔ ادغام پیدا نشد.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO _loser FROM public.persons WHERE id = p_loser_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'شخص بازندهٔ ادغام پیدا نشد.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT _winner.is_active THEN
    RAISE EXCEPTION 'شخص برنده غیرفعال است و نمی‌تواند مقصد ادغام باشد.' USING ERRCODE = '22023';
  END IF;

  IF NOT _loser.is_active THEN
    RAISE EXCEPTION 'شخص بازنده از پیش غیرفعال است؛ احتمالاً قبلاً ادغام شده است.'
      USING ERRCODE = '22023';
  END IF;

  ---------------------------------------------------------------------------
  -- Guard 3: catalog completeness. Every FK column referencing persons must
  -- have a registered merge policy, or this merge does not run at all.
  ---------------------------------------------------------------------------
  FOR _r IN
    SELECT con.conrelid::regclass::text AS tbl, att.attname::text AS col
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid
                         AND att.attnum = ANY (con.conkey)
    WHERE con.contype = 'f'
      AND con.confrelid = 'public.persons'::regclass
  LOOP
    _key := _r.tbl || '.' || _r.col;
    IF NOT (_registry ? _key) THEN
      RAISE EXCEPTION
        'ادغام متوقف شد: ستون «%» به جدول اشخاص ارجاع می‌دهد ولی سیاست ادغام برای آن تعریف نشده است. تا زمانی که این ستون در فهرست سیاست‌های تابع person_merge ثبت نشود، ادغام انجام نمی‌شود.',
        _key
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  ---------------------------------------------------------------------------
  -- Guard 7: cardinality. Two customer rows (or two supplier rows) is a
  -- business reconciliation, not an identity merge.
  ---------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM public.customers WHERE person_id = p_winner_id)
     AND EXISTS (SELECT 1 FROM public.customers WHERE person_id = p_loser_id) THEN
    RAISE EXCEPTION
      'هر دو شخص پروندهٔ مشتری دارند. ادغام هویت این دو، مانده‌ها و سابقهٔ اعتباری دو مشتری را در هم می‌آمیزد. ابتدا باید دو پروندهٔ مشتری به‌صورت حسابداری تعیین تکلیف شوند؛ این کار از عهدهٔ ادغام هویت خارج است.'
      USING ERRCODE = '23505';
  END IF;

  IF EXISTS (SELECT 1 FROM public.suppliers WHERE person_id = p_winner_id)
     AND EXISTS (SELECT 1 FROM public.suppliers WHERE person_id = p_loser_id) THEN
    RAISE EXCEPTION
      'هر دو شخص پروندهٔ تأمین‌کننده دارند. ادغام هویت این دو، سابقهٔ خرید و پرداخت دو تأمین‌کننده را در هم می‌آمیزد. ابتدا باید دو پروندهٔ تأمین‌کننده تعیین تکلیف شوند؛ این کار از عهدهٔ ادغام هویت خارج است.'
      USING ERRCODE = '23505';
  END IF;

  -- D8-2 (migration 269): the same guard for external parties. It matters now
  -- that uq_external_parties_person_active exists: without this, merging two
  -- people who each have an ACTIVE external party would fail deep inside Step A
  -- with a raw unique_violation on the index instead of this explanation.
  -- Mirrors the customers/suppliers guards above exactly.
  IF EXISTS (SELECT 1 FROM public.external_parties WHERE person_id = p_winner_id AND is_active)
     AND EXISTS (SELECT 1 FROM public.external_parties WHERE person_id = p_loser_id AND is_active) THEN
    RAISE EXCEPTION
      'هر دو شخص طرف حساب خارجیِ فعال دارند. طبق تصمیم «یک شخص = یک طرف حساب فعال»، ادغام هویت این دو تا وقتی هر دو طرف حساب فعال‌اند انجام نمی‌شود. ابتدا یکی از دو طرف حساب را غیرفعال کنید و سپس ادغام را تکرار کنید.'
      USING ERRCODE = '23505';
  END IF;

  ---------------------------------------------------------------------------
  -- Step A: identity roots first, then every generic reference.
  ---------------------------------------------------------------------------
  FOR _mode IN SELECT unnest(ARRAY['identity_root','generic']) LOOP
    FOR _key IN
      SELECT k.key FROM jsonb_each_text(_registry) k
      WHERE k.value = _mode ORDER BY k.key
    LOOP
      _n := public._person_merge_repoint(
        split_part(_key, '.', 1), split_part(_key, '.', 2), p_winner_id, p_loser_id);
      IF _n > 0 THEN
        _repointed := _repointed || jsonb_build_object(_key, _n);
      END IF;
    END LOOP;
  END LOOP;

  ---------------------------------------------------------------------------
  -- Step B: identifiers. Drop the loser's exact duplicates first, then demote
  -- its is_primary flags where the winner already holds a primary of that kind
  -- (uq_person_identifiers_primary_active is (person_id, kind) WHERE is_primary
  -- AND status <> 'revoked'), then move the rest.
  ---------------------------------------------------------------------------
  DELETE FROM public.person_identifiers li
  WHERE li.person_id = p_loser_id
    AND EXISTS (
      SELECT 1 FROM public.person_identifiers wi
      WHERE wi.person_id = p_winner_id
        AND wi.kind = li.kind
        AND wi.value_normalized = li.value_normalized
    );

  UPDATE public.person_identifiers li
  SET is_primary = false
  WHERE li.person_id = p_loser_id
    AND li.is_primary
    AND EXISTS (
      SELECT 1 FROM public.person_identifiers wi
      WHERE wi.person_id = p_winner_id
        AND wi.kind = li.kind
        AND wi.is_primary
        AND wi.status <> 'revoked'
    );

  UPDATE public.person_identifiers SET person_id = p_winner_id WHERE person_id = p_loser_id;
  GET DIAGNOSTICS _ids_moved = ROW_COUNT;

  ---------------------------------------------------------------------------
  -- Step C: aliases. Same de-duplication, plus the loser's display_name is
  -- preserved as an alias of the winner so search still finds the old name.
  -- alias_normalized is a GENERATED column, so it is never written directly.
  ---------------------------------------------------------------------------
  DELETE FROM public.person_aliases la
  WHERE la.person_id = p_loser_id
    AND EXISTS (
      SELECT 1 FROM public.person_aliases wa
      WHERE wa.person_id = p_winner_id
        AND wa.alias_normalized = la.alias_normalized
    );

  UPDATE public.person_aliases SET person_id = p_winner_id WHERE person_id = p_loser_id;
  GET DIAGNOSTICS _als_moved = ROW_COUNT;

  INSERT INTO public.person_aliases (person_id, alias, alias_kind, source, created_by)
  VALUES (p_winner_id, _loser.display_name, 'former', 'person_merge', _uid)
  ON CONFLICT DO NOTHING;

  ---------------------------------------------------------------------------
  -- Step D: context links, de-duplicated on the same key that
  -- uq_pcl_active_ref enforces.
  ---------------------------------------------------------------------------
  DELETE FROM public.person_context_links ll
  WHERE ll.person_id = p_loser_id
    AND EXISTS (
      SELECT 1 FROM public.person_context_links wl
      WHERE wl.person_id = p_winner_id
        AND wl.context_kind IS NOT DISTINCT FROM ll.context_kind
        AND wl.ref_table   IS NOT DISTINCT FROM ll.ref_table
        AND wl.ref_id      IS NOT DISTINCT FROM ll.ref_id
    );

  UPDATE public.person_context_links SET person_id = p_winner_id WHERE person_id = p_loser_id;
  GET DIAGNOSTICS _lnk_moved = ROW_COUNT;

  ---------------------------------------------------------------------------
  -- Step E: custom field values. The winner's own value wins on collision
  -- (person_field_values is UNIQUE on (person_id, field_definition_id)).
  ---------------------------------------------------------------------------
  DELETE FROM public.person_field_values lv
  WHERE lv.person_id = p_loser_id
    AND EXISTS (
      SELECT 1 FROM public.person_field_values wv
      WHERE wv.person_id = p_winner_id
        AND wv.field_definition_id = lv.field_definition_id
    );

  UPDATE public.person_field_values SET person_id = p_winner_id WHERE person_id = p_loser_id;
  GET DIAGNOSTICS _n = ROW_COUNT;
  IF _n > 0 THEN
    _repointed := _repointed || jsonb_build_object('person_field_values.person_id', _n);
  END IF;

  ---------------------------------------------------------------------------
  -- Step F: VERIFICATION SWEEP. SECURITY INVOKER means an RLS-filtered UPDATE
  -- matches nothing instead of raising. Prove no reference to the loser
  -- survived, or abort the whole merge.
  ---------------------------------------------------------------------------
  FOR _key, _mode IN SELECT k.key, k.value FROM jsonb_each_text(_registry) k ORDER BY k.key LOOP
    CONTINUE WHEN _mode IN ('special_keep', 'skip');
    _remaining := public._person_merge_count_refs(
      split_part(_key, '.', 1), split_part(_key, '.', 2), p_loser_id);

    IF _remaining > 0 THEN
      RAISE EXCEPTION
        'ادغام ناتمام ماند: % ردیف در ستون «%» هنوز به شخص بازنده ارجاع می‌دهد (احتمالاً به دلیل محدودیت سطح دسترسی). کل عملیات لغو شد.',
        _remaining, _key
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  ---------------------------------------------------------------------------
  -- Step G: deactivate the loser. Never hard-deleted — its id may appear in
  -- audit_logs and in person_merge_log itself.
  ---------------------------------------------------------------------------
  UPDATE public.persons
  SET is_active = false,
      notes = COALESCE(NULLIF(btrim(COALESCE(notes, '')), '') || E'\n', '')
              || 'ادغام‌شده در شخص ' || p_winner_id::text || ' در تاریخ ' || now()::date::text,
      updated_at = now()
  WHERE id = p_loser_id;

  ---------------------------------------------------------------------------
  -- Step H: audit + candidate queue.
  ---------------------------------------------------------------------------
  INSERT INTO public.person_merge_log (
    winner_id, loser_id, reason, repointed,
    identifiers_moved, aliases_moved, links_moved, merged_by
  )
  VALUES (
    p_winner_id, p_loser_id, NULLIF(btrim(COALESCE(p_reason, '')), ''), _repointed,
    _ids_moved, _als_moved, _lnk_moved, _uid
  )
  RETURNING id INTO _log_id;

  -- Only the exact pair is resolved. Other pending pairs that involve the loser
  -- are left untouched on purpose: marking them 'merged' would be false, and
  -- silently re-pointing them at the winner could collide with an existing pair.
  -- The merge UI filters those out by requiring both persons to be active.
  UPDATE public.person_merge_candidates
  SET status = 'merged', reviewed_by = _uid, reviewed_at = now(), updated_at = now()
  WHERE status = 'pending'
    AND ((person_id_a = p_winner_id AND person_id_b = p_loser_id)
      OR (person_id_a = p_loser_id  AND person_id_b = p_winner_id));

  RETURN jsonb_build_object(
    'winner_id',         p_winner_id,
    'loser_id',          p_loser_id,
    'merge_log_id',      _log_id,
    'repointed',         _repointed,
    'identifiers_moved', _ids_moved,
    'aliases_moved',     _als_moved,
    'links_moved',       _lnk_moved
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.query_dynamic_table_rows(p_table_id uuid, p_filters jsonb DEFAULT '[]'::jsonb, p_search text DEFAULT NULL::text, p_show_inactive boolean DEFAULT false, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS TABLE(total_count bigint, out_row_id uuid, out_row_number bigint, out_is_active boolean, out_created_at timestamp with time zone, out_values jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF NOT public.has_any_role(_uid, ARRAY['admin'::text, 'manager'::text]) THEN
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
$function$
;

CREATE OR REPLACE FUNCTION public.quick_approve_user(_user_id uuid, _role text DEFAULT 'sales'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _role_enum app_role;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admin can approve users';
  END IF;

  BEGIN
    _role_enum := _role::text;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Invalid role: %', _role;
  END;

  UPDATE public.profiles
  SET status = 'active', is_active = true, updated_at = now()
  WHERE id = _user_id;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, _role_enum)
  ON CONFLICT (user_id, role) DO NOTHING;

  BEGIN
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    VALUES (auth.uid(), 'user_quick_approved', 'profile', _user_id, jsonb_build_object('role', _role));
  EXCEPTION WHEN undefined_table THEN NULL;
        WHEN undefined_column THEN NULL; END;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.recompute_customer_credit_scores(p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(customer_id uuid, score integer, credit_limit numeric, status text, error text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_limit integer;
  v_offset integer;
  r record;
  v_score integer;
  v_limit_amt numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF NOT (
    public.has_role(v_uid, 'admin'::text)
    OR public.has_role(v_uid, 'manager'::text)
    OR public.has_role(v_uid, 'accountant'::text)
  ) THEN
    RAISE EXCEPTION 'forbidden: only admin/manager/accountant may run batch recompute';
  END IF;

  v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 100), 500));
  v_offset := GREATEST(0, COALESCE(p_offset, 0));

  FOR r IN
    SELECT c.id
    FROM public.customers c
    WHERE c.is_active = true
    ORDER BY c.id
    LIMIT v_limit OFFSET v_offset
  LOOP
    BEGIN
      SELECT cs.score, cs.credit_limit
        INTO v_score, v_limit_amt
        FROM public.calculate_credit_score(r.id) AS cs;

      customer_id := r.id;
      score := v_score;
      credit_limit := v_limit_amt;
      status := 'ok';
      error := NULL;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      customer_id := r.id;
      score := NULL;
      credit_limit := NULL;
      status := 'error';
      error := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;

  RETURN;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.record_currency_fetch(p_source_id uuid, p_currency currency_code, p_rate numeric, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_count int;
  v_id uuid;
BEGIN
  IF NOT has_any_role(v_user, ARRAY['admin'::text, 'accountant'::text]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_rate IS NULL OR p_rate <= 0 THEN
    RAISE EXCEPTION 'invalid rate';
  END IF;

  -- Rate limit: 10/hour per source
  SELECT count(*) INTO v_count
    FROM currency_rate_fetches
    WHERE source_id = p_source_id
      AND fetched_at > now() - interval '1 hour';
  IF v_count >= 10 THEN
    RAISE EXCEPTION 'rate limit exceeded';
  END IF;

  INSERT INTO currency_rate_fetches(source_id, currency, rate, fetched_by, note)
    VALUES (p_source_id, p_currency, p_rate, v_user, p_note)
    RETURNING id INTO v_id;

  INSERT INTO audit_logs(action, entity_type, entity_id, actor_id, diff)
    VALUES ('currency_rate_fetched', 'currency_rate_fetches', v_id::text, v_user,
      jsonb_build_object('source_id', p_source_id, 'currency', p_currency, 'rate', p_rate));

  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reject_currency_fetch(p_fetch_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF NOT has_any_role(v_user, ARRAY['admin'::text, 'accountant'::text]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE currency_rate_fetches
    SET status = 'rejected', approved_by = v_user, approved_at = now(),
        note = COALESCE(p_reason, note)
    WHERE id = p_fetch_id AND status = 'pending_review';

  INSERT INTO audit_logs(action, entity_type, entity_id, actor_id, diff)
    VALUES ('currency_rate_rejected', 'currency_rate_fetches', p_fetch_id::text, v_user,
      jsonb_build_object('reason', p_reason));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reorder_dynamic_table_columns(p_table_id uuid, p_ordered_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _i int := 0;
  _id uuid;
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text]) THEN
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
$function$
;

CREATE OR REPLACE FUNCTION public.review_market_product_match_approve(p_match_id uuid, p_afrakala_product_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS market_product_matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_product_name text;
  v_row public.market_product_matches;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin'::text) OR public.has_role(v_uid, 'manager'::text)) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;
  IF p_afrakala_product_id IS NULL THEN
    RAISE EXCEPTION 'afrakala_product_id is required to approve' USING ERRCODE = '22023';
  END IF;

  SELECT name INTO v_product_name FROM public.products WHERE id = p_afrakala_product_id;
  IF v_product_name IS NULL THEN
    RAISE EXCEPTION 'product not found' USING ERRCODE = '23503';
  END IF;

  UPDATE public.market_product_matches
  SET afrakala_product_id = p_afrakala_product_id,
      afrakala_product_name_snapshot = v_product_name,
      match_status = 'approved'::market_match_status,
      matched_by = 'human'::market_match_actor,
      reviewed_by = v_uid,
      reviewed_at = now(),
      reject_reason = NULL,
      notes = COALESCE(p_notes, notes),
      updated_at = now()
  WHERE id = p_match_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'match not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_row;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.review_market_product_match_disable(p_match_id uuid, p_reason text, p_notes text DEFAULT NULL::text)
 RETURNS market_product_matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.market_product_matches;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin'::text) OR public.has_role(v_uid, 'manager'::text)) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason is required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.market_product_matches
  SET match_status = 'disabled'::market_match_status,
      matched_by = 'human'::market_match_actor,
      reviewed_by = v_uid,
      reviewed_at = now(),
      reject_reason = btrim(p_reason),
      notes = COALESCE(p_notes, notes),
      updated_at = now()
  WHERE id = p_match_id
    AND match_status IN ('approved'::market_match_status, 'needs_review'::market_match_status, 'pending'::market_match_status)
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'match not found or not disable-able' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_row;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.review_market_product_match_reject(p_match_id uuid, p_reject_reason text, p_notes text DEFAULT NULL::text)
 RETURNS market_product_matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.market_product_matches;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin'::text) OR public.has_role(v_uid, 'manager'::text)) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;
  IF p_reject_reason IS NULL OR length(btrim(p_reject_reason)) = 0 THEN
    RAISE EXCEPTION 'reject_reason is required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.market_product_matches
  SET match_status = 'rejected'::market_match_status,
      matched_by = 'human'::market_match_actor,
      reviewed_by = v_uid,
      reviewed_at = now(),
      reject_reason = btrim(p_reject_reason),
      notes = COALESCE(p_notes, notes),
      updated_at = now()
  WHERE id = p_match_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'match not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_row;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_bot_api_key_active(p_key_id uuid, p_is_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT public.has_any_role(_uid, ARRAY['admin'::text, 'manager'::text]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.bot_api_keys SET is_active = p_is_active WHERE id = p_key_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (_uid, 'bot_api_keys', p_key_id::text,
          CASE WHEN p_is_active THEN 'bot_api_key_activated' ELSE 'bot_api_key_deactivated' END,
          jsonb_build_object('is_active', p_is_active));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_bot_api_key_table_access(p_key_id uuid, p_table_id uuid, p_can_read boolean, p_can_update boolean, p_allowed_update_columns uuid[] DEFAULT '{}'::uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _valid_cols uuid[];
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT public.has_any_role(_uid, ARRAY['admin'::text, 'manager'::text]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Verify key + table exist
  IF NOT EXISTS (SELECT 1 FROM public.bot_api_keys WHERE id = p_key_id) THEN
    RAISE EXCEPTION 'key_not_found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dynamic_tables WHERE id = p_table_id) THEN
    RAISE EXCEPTION 'table_not_found';
  END IF;

  -- Constrain allowed_update_columns to columns that actually belong to that table
  SELECT COALESCE(array_agg(c.id), '{}'::uuid[]) INTO _valid_cols
  FROM public.dynamic_table_columns c
  WHERE c.table_id = p_table_id
    AND c.id = ANY (COALESCE(p_allowed_update_columns, '{}'::uuid[]));

  INSERT INTO public.bot_api_key_table_access
    (api_key_id, table_id, can_read, can_update, allowed_update_columns)
  VALUES (p_key_id, p_table_id, COALESCE(p_can_read, true), COALESCE(p_can_update, false), _valid_cols)
  ON CONFLICT (api_key_id, table_id) DO UPDATE
    SET can_read = EXCLUDED.can_read,
        can_update = EXCLUDED.can_update,
        allowed_update_columns = EXCLUDED.allowed_update_columns,
        updated_at = now();

  -- Maintain legacy allowed_table_ids array for back-compat
  UPDATE public.bot_api_keys k
  SET allowed_table_ids = COALESCE((
    SELECT array_agg(DISTINCT a.table_id)
    FROM public.bot_api_key_table_access a
    WHERE a.api_key_id = k.id
  ), '{}'::uuid[])
  WHERE k.id = p_key_id;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (_uid, 'bot_api_keys', p_key_id::text, 'bot_api_key_access_updated',
          jsonb_build_object(
            'table_id', p_table_id,
            'can_read', COALESCE(p_can_read, true),
            'can_update', COALESCE(p_can_update, false),
            'allowed_update_columns', _valid_cols
          ));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_dynamic_table_row_active(p_row_id uuid, p_is_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text]) THEN
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
$function$
;

CREATE OR REPLACE FUNCTION public.settle_league_season()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  active_season public.league_seasons%ROWTYPE;
  next_start date;
  next_end date;
  next_name text;
  next_id uuid;
  total_count integer;
BEGIN
  -- status, not is_active: status is the column the trigger treats as the
  -- source of truth and is_active is merely derived from it.
  SELECT * INTO active_season
    FROM public.league_seasons
   WHERE status = 'active'
   ORDER BY COALESCE(starts_at, start_date::timestamptz) DESC
   LIMIT 1;

  -- If no active season, bootstrap current month and exit
  IF NOT FOUND THEN
    next_start := date_trunc('month', current_date)::date;
    next_end := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
    next_name := to_char(next_start, 'YYYY-MM');

    INSERT INTO public.league_seasons(season_name, title_fa, starts_at, ends_at, status)
    VALUES (next_name, next_name,
            next_start::timestamptz,
            (next_end + 1)::timestamptz - interval '1 microsecond',
            'active')
    ON CONFLICT (season_name) DO UPDATE
      SET status    = 'active',
          title_fa  = COALESCE(public.league_seasons.title_fa, EXCLUDED.title_fa),
          starts_at = EXCLUDED.starts_at,
          ends_at   = EXCLUDED.ends_at
    RETURNING id INTO next_id;

    RETURN jsonb_build_object('bootstrapped', true, 'season_id', next_id);
  END IF;

  -- 1. Snapshot final monthly scores into the active season
  INSERT INTO public.employee_leagues(employee_id, season_id, league, score)
  SELECT es.employee_id, active_season.id, 'Bronze'::public.league_tier, COALESCE(es.monthly_score, 0)
  FROM public.employee_scores es
  ON CONFLICT (employee_id, season_id) DO UPDATE
    SET score = EXCLUDED.score;

  -- 2. Compute rank within current league tier
  WITH ranked AS (
    SELECT id,
           league,
           RANK() OVER (PARTITION BY league ORDER BY score DESC) AS r,
           COUNT(*) OVER (PARTITION BY league) AS tier_count
    FROM public.employee_leagues
    WHERE season_id = active_season.id
  )
  UPDATE public.employee_leagues el
  SET rank = ranked.r
  FROM ranked
  WHERE el.id = ranked.id;

  -- Mark active as settled. status='closed' is what actually deactivates it -
  -- setting is_active = false here did nothing, because the trigger overwrote
  -- it from status on the way through.
  UPDATE public.league_seasons
  SET status = 'closed', settled_at = now()
  WHERE id = active_season.id;

  -- 3. Open next month's season
  next_start := (COALESCE(active_season.ends_at::date, active_season.end_date) + interval '1 day')::date;
  next_end := (date_trunc('month', next_start) + interval '1 month - 1 day')::date;
  next_name := to_char(next_start, 'YYYY-MM');

  INSERT INTO public.league_seasons(season_name, title_fa, starts_at, ends_at, status)
  VALUES (next_name, next_name,
          next_start::timestamptz,
          (next_end + 1)::timestamptz - interval '1 microsecond',
          'active')
  ON CONFLICT (season_name) DO UPDATE
    SET status    = 'active',
        title_fa  = COALESCE(public.league_seasons.title_fa, EXCLUDED.title_fa),
        starts_at = EXCLUDED.starts_at,
        ends_at   = EXCLUDED.ends_at
  RETURNING id INTO next_id;

  -- 4. Carry forward members to the new season with promotion/demotion
  --    Within each tier of the just-settled season:
  --      top 20% -> promoted (tier + 1, capped at Legend)
  --      bottom 20% -> demoted (tier - 1, floored at Bronze)
  --      else stays
  INSERT INTO public.employee_leagues(employee_id, season_id, league, score, promoted, demoted)
  SELECT
    el.employee_id,
    next_id,
    CASE
      WHEN el.rank <= GREATEST(1, ceil(tier_count * 0.2))::int
        THEN public.league_tier_from_index(public.league_tier_index(el.league) + 1)
      WHEN el.rank > tier_count - GREATEST(1, floor(tier_count * 0.2))::int
        AND public.league_tier_index(el.league) > 1
        THEN public.league_tier_from_index(public.league_tier_index(el.league) - 1)
      ELSE el.league
    END AS new_league,
    0 AS score,
    (el.rank <= GREATEST(1, ceil(tier_count * 0.2))::int) AS promoted,
    (el.rank > tier_count - GREATEST(1, floor(tier_count * 0.2))::int
      AND public.league_tier_index(el.league) > 1) AS demoted
  FROM (
    SELECT
      el.*,
      COUNT(*) OVER (PARTITION BY el.league) AS tier_count
    FROM public.employee_leagues el
    WHERE el.season_id = active_season.id
  ) el
  ON CONFLICT (employee_id, season_id) DO NOTHING;

  SELECT COUNT(*) INTO total_count FROM public.employee_leagues WHERE season_id = active_season.id;

  RETURN jsonb_build_object(
    'settled_season_id', active_season.id,
    'settled_season_name', active_season.season_name,
    'new_season_id', next_id,
    'new_season_name', next_name,
    'employees_settled', total_count
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.start_league_season(_name text, _start date, _end date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _name IS NULL OR length(btrim(_name)) = 0 THEN
    RAISE EXCEPTION 'نام فصل الزامی است' USING ERRCODE = '22023';
  END IF;
  IF _start IS NULL OR _end IS NULL THEN
    RAISE EXCEPTION 'تاریخ شروع و پایان فصل الزامی است' USING ERRCODE = '22023';
  END IF;

  -- season_name is UNIQUE. Catch it here with a readable message instead of
  -- letting a raw 23505 reach the UI.
  IF EXISTS (SELECT 1 FROM public.league_seasons WHERE season_name = btrim(_name)) THEN
    RAISE EXCEPTION 'فصلی با نام «%» از قبل وجود دارد', btrim(_name) USING ERRCODE = '23505';
  END IF;

  -- Close whatever is currently active. status is what the trigger reads;
  -- writing is_active directly does nothing, because the trigger recomputes it.
  --
  -- The COALESCE backfill exists so a row that predates the new columns (and
  -- would therefore fail the trigger's NOT NULL checks on UPDATE) can still be
  -- closed rather than wedging the whole feature. On this database there are no
  -- such rows; it costs nothing and removes a way to get stuck.
  UPDATE public.league_seasons
     SET status    = 'closed',
         title_fa  = COALESCE(title_fa, season_name, 'فصل بدون نام'),
         starts_at = COALESCE(starts_at, start_date::timestamptz),
         ends_at   = COALESCE(ends_at, (end_date + 1)::timestamptz - interval '1 microsecond')
   WHERE status = 'active';

  INSERT INTO public.league_seasons(
    season_name, title_fa, starts_at, ends_at, status)
  VALUES (
    btrim(_name),
    btrim(_name),
    _start::timestamptz,
    (_end + 1)::timestamptz - interval '1 microsecond',
    'active')
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.toggle_custom_role_status(_role_id uuid, _is_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r public.custom_roles%ROWTYPE;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::text) THEN RAISE EXCEPTION 'permission denied'; END IF;
  SELECT * INTO r FROM public.custom_roles WHERE id = _role_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'role not found'; END IF;
  IF r.is_system THEN RAISE EXCEPTION 'cannot disable system roles'; END IF;

  UPDATE public.custom_roles SET is_active = _is_active, updated_at = now() WHERE id = _role_id;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'role', _role_id::text, 'role_status_changed',
          jsonb_build_object('name', r.name, 'old', r.is_active, 'new', _is_active));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_dynamic_table_column(p_column_id uuid, p_label text, p_is_required boolean, p_is_filterable boolean, p_is_editable_by_bot boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text]) THEN
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
$function$
;

CREATE OR REPLACE FUNCTION public.update_role_permissions(_role_name text, _permissions jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec jsonb;
  changed_modules text[] := ARRAY[]::text[];
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::text) THEN RAISE EXCEPTION 'permission denied'; END IF;

  FOR rec IN SELECT * FROM jsonb_array_elements(_permissions) LOOP
    INSERT INTO public.role_permissions (
      role_name, module, can_view, can_create, can_update, can_delete, can_approve, can_export, can_view_sensitive
    ) VALUES (
      _role_name,
      rec->>'module',
      COALESCE((rec->>'can_view')::boolean, false),
      COALESCE((rec->>'can_create')::boolean, false),
      COALESCE((rec->>'can_update')::boolean, false),
      COALESCE((rec->>'can_delete')::boolean, false),
      COALESCE((rec->>'can_approve')::boolean, false),
      COALESCE((rec->>'can_export')::boolean, false),
      COALESCE((rec->>'can_view_sensitive')::boolean, false)
    )
    ON CONFLICT (role_name, module) DO UPDATE SET
      can_view = EXCLUDED.can_view,
      can_create = EXCLUDED.can_create,
      can_update = EXCLUDED.can_update,
      can_delete = EXCLUDED.can_delete,
      can_approve = EXCLUDED.can_approve,
      can_export = EXCLUDED.can_export,
      can_view_sensitive = EXCLUDED.can_view_sensitive,
      updated_at = now();
    changed_modules := array_append(changed_modules, rec->>'module');
  END LOOP;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'role_permissions', _role_name, 'role_permissions_updated',
          jsonb_build_object('role_name', _role_name, 'modules', to_jsonb(changed_modules)));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_daily_capital_input(p_capital_date date, p_bank_balance numeric DEFAULT 0, p_cash_balance numeric DEFAULT 0, p_incoming_checks numeric DEFAULT 0, p_outgoing_checks numeric DEFAULT 0, p_external_receivables numeric DEFAULT 0, p_external_payables numeric DEFAULT 0, p_near_term_expenses numeric DEFAULT 0, p_risk_reserve numeric DEFAULT 0, p_blocked_funds numeric DEFAULT 0, p_inventory_liquidity_value numeric DEFAULT 0, p_manual_adjustment numeric DEFAULT 0, p_notes text DEFAULT NULL::text)
 RETURNS daily_capital_inputs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.daily_capital_inputs;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_capital_date IS NULL THEN
    RAISE EXCEPTION 'capital_date is required' USING ERRCODE = '22023';
  END IF;

  -- Disallow negative numeric inputs (defensive; UI may also clamp).
  IF p_bank_balance < 0 OR p_cash_balance < 0 OR p_incoming_checks < 0
     OR p_outgoing_checks < 0 OR p_external_receivables < 0 OR p_external_payables < 0
     OR p_near_term_expenses < 0 OR p_risk_reserve < 0 OR p_blocked_funds < 0
     OR p_inventory_liquidity_value < 0 THEN
    RAISE EXCEPTION 'numeric inputs must be >= 0' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.daily_capital_inputs(
    capital_date, bank_balance, cash_balance, incoming_checks, outgoing_checks,
    external_receivables, external_payables, near_term_expenses, risk_reserve,
    blocked_funds, inventory_liquidity_value, manual_adjustment, notes,
    created_by, updated_by
  ) VALUES (
    p_capital_date, p_bank_balance, p_cash_balance, p_incoming_checks, p_outgoing_checks,
    p_external_receivables, p_external_payables, p_near_term_expenses, p_risk_reserve,
    p_blocked_funds, p_inventory_liquidity_value, p_manual_adjustment, p_notes,
    auth.uid(), auth.uid()
  )
  ON CONFLICT (capital_date) DO UPDATE SET
    bank_balance              = EXCLUDED.bank_balance,
    cash_balance              = EXCLUDED.cash_balance,
    incoming_checks           = EXCLUDED.incoming_checks,
    outgoing_checks           = EXCLUDED.outgoing_checks,
    external_receivables      = EXCLUDED.external_receivables,
    external_payables         = EXCLUDED.external_payables,
    near_term_expenses        = EXCLUDED.near_term_expenses,
    risk_reserve              = EXCLUDED.risk_reserve,
    blocked_funds             = EXCLUDED.blocked_funds,
    inventory_liquidity_value = EXCLUDED.inventory_liquidity_value,
    manual_adjustment         = EXCLUDED.manual_adjustment,
    notes                     = EXCLUDED.notes,
    updated_by                = auth.uid()
  RETURNING * INTO r;

  RETURN r;
END;
$function$
;

-- ------------------------------------------------------------------ indexes --
-- Present on the test server, created by no migration file.
CREATE INDEX IF NOT EXISTS idx_pie_search_session_created
  ON public.product_interaction_events USING btree (search_session_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pie_dedup_session_event
  ON public.product_interaction_events USING btree (user_id, product_id, search_session_id, event_type)
  WHERE ((search_session_id IS NOT NULL) AND (user_id IS NOT NULL));

-- ------------------------------------------------------------------- grants --
-- Every policy that calls auth.uid() needs USAGE on the auth schema. Without
-- this the API answers "permission denied for schema auth" and list pages that
-- carry a viewer_restricted policy come back empty.
GRANT USAGE ON SCHEMA auth       TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

GRANT SELECT ON public.academy_quiz_questions TO anon, authenticated;
GRANT SELECT ON public.currency_sources       TO anon, authenticated;

-- ------------------------------------------------------- storage ownership --
-- A pg_restore run as the wrong role leaves these owned by supabase_admin and
-- the storage service cannot run its own internal migrations.
DO $storage$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.relname, c.relkind
             FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'storage' AND c.relkind IN ('r','S','v')
              AND pg_get_userbyid(c.relowner) <> 'supabase_storage_admin'
  LOOP
    IF    r.relkind = 'r' THEN EXECUTE format('ALTER TABLE storage.%I OWNER TO supabase_storage_admin', r.relname);
    ELSIF r.relkind = 'S' THEN EXECUTE format('ALTER SEQUENCE storage.%I OWNER TO supabase_storage_admin', r.relname);
    ELSE                       EXECUTE format('ALTER VIEW storage.%I OWNER TO supabase_storage_admin', r.relname);
    END IF;
  END LOOP;
END
$storage$;
GRANT ALL ON SCHEMA storage TO supabase_storage_admin;
GRANT ALL ON ALL TABLES IN SCHEMA storage TO supabase_storage_admin;

-- -------------------------------------------------------------- foreign key --
-- Names the salesperson -> profiles relationship for PostgREST. profiles.id is
-- the PK and already references auth.users, so this constrains nothing new; it
-- only makes an existing relationship visible to the API layer.
DO $fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.salesperson_capital_allocations_dynamic'::regclass
       AND conname  = 'salesperson_alloc_dyn_profile_fkey'
  ) THEN
    ALTER TABLE public.salesperson_capital_allocations_dynamic
      ADD CONSTRAINT salesperson_alloc_dyn_profile_fkey
      FOREIGN KEY (salesperson_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END
$fk$;

NOTIFY pgrst, 'reload schema';