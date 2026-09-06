SET client_encoding='UTF8';

-- 468 - the four bot_* writers stop accepting a UUID as the whole credential.
--
-- ASCII except for ONE pre-existing character: bot_update_table_row's body carries a `->`
-- arrow drawn as U+2192 in a comment ("all NULLs -> clear cell"). It is carried through
-- unchanged, exactly as 461 carries its pre-existing Persian text through: nothing this file
-- ADDS is non-ASCII, and every string it adds is an API-level refusal, not a UI string.
-- Delivery was md5-verified byte-for-byte on both sides because of that one character.
--
-- ============================================================================
-- 1. WHAT IS OPEN, measured live 2026-09-06 on afrakala-lan-db / database `afrakala`
-- ============================================================================
--
--   SELECT proname, pg_get_function_identity_arguments(oid), prosecdef,
--          has_function_privilege('anon',oid,'EXECUTE'),
--          has_function_privilege('authenticated',oid,'EXECUTE'),
--          has_function_privilege('service_role',oid,'EXECUTE'),
--          array_to_string(proacl,' ')
--   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public' AND proname LIKE 'bot\_%';
--
--   bot_create_table_row  | DEFINER | anon=t | auth=t | service_role=t
--   bot_update_table_row  | DEFINER | anon=t | auth=t | service_role=t
--   bot_upsert_table_row  | DEFINER | anon=t | auth=t | service_role=t
--   bot_query_table_rows  | DEFINER | anon=t | auth=t | service_role=t
--   proacl on all four: =X/supabase_admin supabase_admin=X anon=X authenticated=X
--                       service_role=X postgres=X
--
-- All four authenticate by ONE THING: a `p_key_id uuid` passed as an argument. Their entire
-- access check, quoted verbatim from bot_create_table_row:
--
--     SELECT a.can_update, a.allowed_update_columns INTO _can_update, _allowed
--     FROM public.bot_api_key_table_access a
--     WHERE a.api_key_id = p_key_id AND a.table_id = p_table_id;
--     IF _can_update IS NULL THEN RAISE EXCEPTION 'forbidden_table'; END IF;
--
-- No hash check. No auth.uid(). No reference to bot_api_keys at all. Every `is_active` inside
-- these four bodies is `dynamic_table_rows.is_active` - the DATA row's flag, not the key's. So
-- a REVOKED or EXPIRED key's id still worked, because only bot_authenticate_key looks at
-- those columns:
--
--     _hash := encode(extensions.digest(p_raw_key,'sha256'),'hex');
--     SELECT k.id,k.name,k.is_active,k.expires_at INTO _id,_name,_active,_expires
--       FROM public.bot_api_keys k WHERE k.key_hash = _hash;
--     IF _id IS NULL THEN RAISE EXCEPTION 'invalid_key'; END IF;
--     IF NOT _active THEN RAISE EXCEPTION 'inactive_key'; END IF;
--     IF _expires IS NOT NULL AND _expires < now() THEN RAISE EXCEPTION 'expired_key'; END IF;
--
-- ...and bot_authenticate_key is anon=f. The secret check is bypassable by calling the
-- downstream function directly with a key id.
--
-- ============================================================================
-- 2. WHY REVOKING anon + PUBLIC IS SAFE - verified, not assumed
-- ============================================================================
--
-- Every call site of all four was read. All four go through the service_role client:
--
--   src/routes/api.public.bot.dynamic-tables.$tableId.rows.ts:82         supabaseAdmin.rpc("bot_query_table_rows")
--   src/routes/api.public.bot.dynamic-tables.$tableId.rows.ts:282        supabaseAdmin.rpc("bot_create_table_row")
--   src/routes/api.public.bot.dynamic-tables.$tableId.rows.$rowId.ts:157 supabaseAdmin.rpc("bot_update_table_row")
--   src/routes/api.public.bot.dynamic-tables.$tableId.rows.upsert.ts:336 supabaseAdmin.rpc("bot_upsert_table_row")
--
-- and the key is authenticated first, from the raw Bearer token, before any of them runs:
--
--   src/routes/api.public.bot.dynamic-tables.$tableId.rows.ts:40
--     const auth = await authenticateBot(extractBearer(request.headers.get("authorization")));
--   src/server/bot-api.ts:286
--     supabaseAdmin.rpc("bot_authenticate_key", { p_raw_key: rawKey })
--
-- grep over src/ finds NO other caller of the four - no anon client, no browser client, no
-- authenticated client. `service_role=X/supabase_admin` is a separate ACL entry and survives
-- the revoke untouched, so the real bot path is unaffected. The anon grant was pure bypass
-- surface with no legitimate caller.
--
-- BOTH `FROM anon` AND `FROM PUBLIC` are required. The `=X/supabase_admin` entry with an
-- empty grantee is the PUBLIC grant, and it survives `REVOKE ... FROM anon` completely
-- untouched - which is how a function can read anon=f in one column and still be callable.
--
-- `authenticated` is deliberately LEFT IN PLACE. These functions are not part of any signed-in
-- user's flow either, but removing that grant is a wider change than this halt row owns, and
-- after the body check below an authenticated caller gains nothing that a service_role caller
-- did not already have to prove. It is handed forward, not silently done here.
--
-- ============================================================================
-- 3. THE BODY CHECK - defence in depth, because a grant is one mistake from gone
-- ============================================================================
--
-- CREATE OR REPLACE FUNCTION silently restores default grants, so any future bare replace of
-- one of these four re-opens anon in the same statement. The revoke alone is therefore not
-- durable. Each body now opens with a nested block that refuses a key that does not exist, is
-- not active, or has expired - BEFORE the bot_api_key_table_access lookup runs:
--
--     DECLARE _bot_key_active boolean; _bot_key_expires timestamptz;
--     BEGIN
--       SELECT k.is_active, k.expires_at INTO _bot_key_active, _bot_key_expires
--       FROM public.bot_api_keys k WHERE k.id = p_key_id;
--       IF _bot_key_active IS NULL THEN RAISE EXCEPTION 'invalid_key'; END IF;
--       IF NOT _bot_key_active THEN RAISE EXCEPTION 'inactive_key'; END IF;
--       IF _bot_key_expires IS NOT NULL AND _bot_key_expires < now() THEN
--         RAISE EXCEPTION 'expired_key';
--       END IF;
--     END;
--
-- Three details that are not free choices:
--
--   * The three message strings are exactly bot_authenticate_key's, because src/server/bot-api.ts
--     lines 23-28 map them by text to Persian 401 responses. A novel string would fall through
--     to the "unmapped error message" branch at bot-api.ts:245 and surface as a 500.
--   * NULL expires_at means NO expiry, and the boundary is `< now()`. Read from the data, not
--     assumed: bot_api_keys.expires_at is nullable, 11 of 12 keys hold NULL, and
--     bot_authenticate_key raises only when `_expires IS NOT NULL AND _expires < now()`. This
--     block matches that condition exactly so the two paths can never disagree.
--   * It is a NESTED DECLARE/BEGIN/END block rather than two new variables in each function's
--     own DECLARE list, so the insertion is one contiguous hunk per function and touches no
--     existing line. The bodies already use that shape (bot_create_table_row lines 86-132).
--
-- bot_api_keys.is_active is NOT NULL DEFAULT true, so `_bot_key_active IS NULL` means one
-- thing only: no such key. The single live bot_api_key_table_access row maps to a key that is
-- is_active = true with expires_at = NULL, so this check refuses nothing that works today -
-- measured before writing it.
--
-- CORRECTION to the brief that commissioned this file: bot_upsert_table_row calls BOTH of its
-- siblings, not just one -
--   line 162  PERFORM public.bot_update_table_row(p_key_id, p_table_id, _existing_row, ...)
--   line 187  FROM public.bot_create_table_row(p_key_id, p_table_id, p_values) AS bc
-- so the check runs twice on either branch. That is accepted, not worked around: a nested call
-- from a DEFINER function runs as the definer and does not consult the caller's EXECUTE grant,
-- so the revoke cannot break the internal path, and a second lookup of one row by primary key
-- is not worth an exception to the rule that every entry point validates its own credential.
--
-- ============================================================================
-- 4. THE BODIES ARE THE DEPLOYED ONES, DIFFED AGAINST GIT FIRST
-- ============================================================================
--
-- Each function below is pg_get_functiondef() output taken from the live database on
-- 2026-09-06, with the nested block spliced in after the outer BEGIN and NOTHING else changed.
-- Each was first diffed against its defining migration:
--
--   bot_create_table_row  <- 20260516125845_17ca5230-...  identical
--   bot_update_table_row  <- 20260728200000_220_repair_corrupted_persian_function_texts
--                                                          identical
--   bot_upsert_table_row  <- 20260516162827_a0d845ef-...  identical
--   bot_query_table_rows  <- 20260426065532_414dc8ba-...  identical
--
-- "identical" means every executable line matches. The only differences are
-- pg_get_functiondef's own rendering of the header - the signature reflowed onto one line,
-- `timestamptz` printed as `timestamp with time zone`, `$$` printed as `$function$`,
-- `SET search_path = public` printed as `SET search_path TO 'public'`, and the default
-- VOLATILE dropped. There is no drift between database and git in these four.
--
-- ============================================================================
-- 5. ORDERING IS LOAD-BEARING, AND WHAT BREAKS IF THIS IS WRONG
-- ============================================================================
--
-- The REVOKEs come AFTER the four CREATE OR REPLACE statements, never before, because
-- CREATE OR REPLACE restores the default grants. Reversing the two halves of this file would
-- leave all four anon-callable again and the file would still apply cleanly.
--
-- If the revoke is wrong, the bot API breaks: every dynamic-table read and write a customer's
-- bot performs returns permission denied. service_role EXECUTE is asserted before and after
-- for exactly that reason. If the body check is wrong - if it refuses a key the raw-key path
-- accepts - the same bots break with a 401 that the UI cannot explain, which is why the
-- condition is copied from bot_authenticate_key character for character rather than rewritten.
--
-- SCOPE: five further bot_* functions (bot_check_rate_limit, bot_get_product_for_key,
-- bot_key_stats_today, bot_list_products_for_key, bot_suspicious_ips) are also anon=t today.
-- They are NOT in this file. Three of them are read paths and two are admin dashboards; they
-- belong to the function-gate row this wave allocated elsewhere, and are handed forward named
-- rather than left unmentioned.

-- ----------------------------------------------------------------------------
-- bot_create_table_row
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bot_create_table_row(p_key_id uuid, p_table_id uuid, p_values jsonb)
 RETURNS TABLE(out_row_id uuid, out_row_number bigint, out_is_active boolean, out_created_at timestamp with time zone, out_updated_at timestamp with time zone, out_values jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- 468: key validity, defence in depth. Runs BEFORE the table-access lookup.
  -- Message strings match bot_authenticate_key exactly; src/server/bot-api.ts maps them.
  DECLARE
    _bot_key_active  boolean;
    _bot_key_expires timestamptz;
  BEGIN
    SELECT k.is_active, k.expires_at
      INTO _bot_key_active, _bot_key_expires
    FROM public.bot_api_keys k
    WHERE k.id = p_key_id;

    IF _bot_key_active IS NULL THEN RAISE EXCEPTION 'invalid_key'; END IF;
    IF NOT _bot_key_active THEN RAISE EXCEPTION 'inactive_key'; END IF;
    IF _bot_key_expires IS NOT NULL AND _bot_key_expires < now() THEN
      RAISE EXCEPTION 'expired_key';
    END IF;
  END;
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
$function$
;

-- ----------------------------------------------------------------------------
-- bot_update_table_row
-- ----------------------------------------------------------------------------
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

  -- 468: key validity, defence in depth. Runs BEFORE the table-access lookup.
  -- Message strings match bot_authenticate_key exactly; src/server/bot-api.ts maps them.
  DECLARE
    _bot_key_active  boolean;
    _bot_key_expires timestamptz;
  BEGIN
    SELECT k.is_active, k.expires_at
      INTO _bot_key_active, _bot_key_expires
    FROM public.bot_api_keys k
    WHERE k.id = p_key_id;

    IF _bot_key_active IS NULL THEN RAISE EXCEPTION 'invalid_key'; END IF;
    IF NOT _bot_key_active THEN RAISE EXCEPTION 'inactive_key'; END IF;
    IF _bot_key_expires IS NOT NULL AND _bot_key_expires < now() THEN
      RAISE EXCEPTION 'expired_key';
    END IF;
  END;
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
$function$
;

-- ----------------------------------------------------------------------------
-- bot_upsert_table_row
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bot_upsert_table_row(p_key_id uuid, p_table_id uuid, p_unique_by text[], p_values jsonb)
 RETURNS TABLE(out_mode text, out_row_id uuid, out_row_number bigint, out_is_active boolean, out_created_at timestamp with time zone, out_updated_at timestamp with time zone, out_values jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

  -- 468: key validity, defence in depth. Runs BEFORE the table-access lookup.
  -- Message strings match bot_authenticate_key exactly; src/server/bot-api.ts maps them.
  DECLARE
    _bot_key_active  boolean;
    _bot_key_expires timestamptz;
  BEGIN
    SELECT k.is_active, k.expires_at
      INTO _bot_key_active, _bot_key_expires
    FROM public.bot_api_keys k
    WHERE k.id = p_key_id;

    IF _bot_key_active IS NULL THEN RAISE EXCEPTION 'invalid_key'; END IF;
    IF NOT _bot_key_active THEN RAISE EXCEPTION 'inactive_key'; END IF;
    IF _bot_key_expires IS NOT NULL AND _bot_key_expires < now() THEN
      RAISE EXCEPTION 'expired_key';
    END IF;
  END;
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
$function$
;

-- ----------------------------------------------------------------------------
-- bot_query_table_rows
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bot_query_table_rows(p_key_id uuid, p_table_id uuid, p_search text DEFAULT NULL::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 50)
 RETURNS TABLE(total_count bigint, out_row_id uuid, out_row_number bigint, out_is_active boolean, out_created_at timestamp with time zone, out_updated_at timestamp with time zone, out_values jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _can_read boolean;
  _limit int;
  _offset int;
  _search_like text;
  _search_num numeric;
  _total bigint;
BEGIN

  -- 468: key validity, defence in depth. Runs BEFORE the table-access lookup.
  -- Message strings match bot_authenticate_key exactly; src/server/bot-api.ts maps them.
  DECLARE
    _bot_key_active  boolean;
    _bot_key_expires timestamptz;
  BEGIN
    SELECT k.is_active, k.expires_at
      INTO _bot_key_active, _bot_key_expires
    FROM public.bot_api_keys k
    WHERE k.id = p_key_id;

    IF _bot_key_active IS NULL THEN RAISE EXCEPTION 'invalid_key'; END IF;
    IF NOT _bot_key_active THEN RAISE EXCEPTION 'inactive_key'; END IF;
    IF _bot_key_expires IS NOT NULL AND _bot_key_expires < now() THEN
      RAISE EXCEPTION 'expired_key';
    END IF;
  END;
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
$function$
;

-- ----------------------------------------------------------------------------
-- GRANTS - and these MUST come after the four CREATE OR REPLACE statements above,
-- because CREATE OR REPLACE FUNCTION silently restores the default grants. Both
-- `FROM anon` and `FROM PUBLIC` are needed: the `=X/supabase_admin` entry in proacl
-- is the PUBLIC grant and survives `REVOKE ... FROM anon` untouched.
--
-- service_role is NOT revoked. It is the bot API's own path
-- (supabaseAdmin.rpc(...) in the four api.public.bot.* routes) and revoking it
-- would take the product's bot integration down.
-- authenticated is NOT revoked here - see header section 2.
-- ----------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.bot_create_table_row(p_key_id uuid, p_table_id uuid, p_values jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.bot_create_table_row(p_key_id uuid, p_table_id uuid, p_values jsonb) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.bot_update_table_row(p_key_id uuid, p_table_id uuid, p_row_id uuid, p_values jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.bot_update_table_row(p_key_id uuid, p_table_id uuid, p_row_id uuid, p_values jsonb) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.bot_upsert_table_row(p_key_id uuid, p_table_id uuid, p_unique_by text[], p_values jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.bot_upsert_table_row(p_key_id uuid, p_table_id uuid, p_unique_by text[], p_values jsonb) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.bot_query_table_rows(p_key_id uuid, p_table_id uuid, p_search text, p_page integer, p_page_size integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.bot_query_table_rows(p_key_id uuid, p_table_id uuid, p_search text, p_page integer, p_page_size integer) FROM PUBLIC;
