SET client_encoding='UTF8';

-- ============================================================================
-- 546 - RPCs for sales_interactions (create / status / follow-up / month stats).
-- ============================================================================
--
-- Depends on migration 545 (public.sales_interactions).
--
-- Authz pattern follows 481/482: SECURITY DEFINER + body checks via has_any_role
-- with ::text[]; author_id is always auth.uid() on create (never caller-supplied
-- identity). REVOKE PUBLIC/anon then GRANT authenticated after every CREATE.
--
-- Chosen path for assignment notify: migration 547 AFTER INSERT/UPDATE trigger
-- (not inside these RPCs) so direct table writes and RPCs both fire.
--
-- Reverse: docs/research/sales-desk-9-needs/orchestration/546-down.sql
-- ============================================================================

SET lock_timeout = '60s';


-- ----------------------------------------------------------------------------
-- 1. sales_interaction_create
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sales_interaction_create(
  p_person_id uuid,
  p_kind text,
  p_body text DEFAULT '',
  p_title text DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_salesperson_id uuid DEFAULT NULL,
  p_call_log_id uuid DEFAULT NULL,
  p_next_follow_up_at timestamptz DEFAULT NULL,
  p_source text DEFAULT 'manual',
  p_status text DEFAULT 'open'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _actor uuid := auth.uid();
  _id    uuid;
  _kind  text := lower(btrim(COALESCE(p_kind, '')));
  _status text := lower(btrim(COALESCE(p_status, 'open')));
  _source text := NULLIF(btrim(COALESCE(p_source, 'manual')), '');
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_any_role(_actor, ARRAY['sales', 'admin', 'manager', 'accountant']::text[]) THEN
    RAISE EXCEPTION 'ثبت تعامل فروش فقط برای کارکنان مجاز است.'
      USING ERRCODE = '42501';
  END IF;

  IF p_person_id IS NULL THEN
    RAISE EXCEPTION 'شناسه شخص الزامی است.' USING ERRCODE = '22023';
  END IF;

  IF NOT (_kind = ANY (ARRAY['request', 'call', 'note'])) THEN
    RAISE EXCEPTION 'نوع تعامل نامعتبر است.' USING ERRCODE = '22023';
  END IF;

  IF NOT (_status = ANY (ARRAY['open', 'won', 'lost', 'cancelled', 'done'])) THEN
    RAISE EXCEPTION 'وضعیت تعامل نامعتبر است.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.persons WHERE id = p_person_id) THEN
    RAISE EXCEPTION 'شخص پیدا نشد.' USING ERRCODE = 'P0002';
  END IF;

  IF p_customer_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id) THEN
    RAISE EXCEPTION 'مشتری پیدا نشد.' USING ERRCODE = 'P0002';
  END IF;

  IF p_salesperson_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_salesperson_id) THEN
    RAISE EXCEPTION 'پروفایل فروشنده پیدا نشد.' USING ERRCODE = 'P0002';
  END IF;

  IF p_call_log_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.call_logs WHERE id = p_call_log_id) THEN
    RAISE EXCEPTION 'لاگ تماس پیدا نشد.' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.sales_interactions (
    person_id, customer_id, kind, title, body, status,
    salesperson_id, author_id, call_log_id, next_follow_up_at, source
  )
  VALUES (
    p_person_id, p_customer_id, _kind, NULLIF(btrim(COALESCE(p_title, '')), ''),
    COALESCE(p_body, ''), _status,
    p_salesperson_id, _actor, p_call_log_id, p_next_follow_up_at,
    COALESCE(_source, 'manual')
  )
  RETURNING id INTO _id;

  RETURN _id;
END
$function$;

COMMENT ON FUNCTION public.sales_interaction_create(uuid, text, text, text, uuid, uuid, uuid, timestamptz, text, text) IS
  'Creates a sales_interactions row; author_id is always auth.uid(). Migration 546.';

REVOKE ALL ON FUNCTION public.sales_interaction_create(uuid, text, text, text, uuid, uuid, uuid, timestamptz, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_interaction_create(uuid, text, text, text, uuid, uuid, uuid, timestamptz, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.sales_interaction_create(uuid, text, text, text, uuid, uuid, uuid, timestamptz, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_interaction_create(uuid, text, text, text, uuid, uuid, uuid, timestamptz, text, text) TO service_role;


-- ----------------------------------------------------------------------------
-- 2. sales_interaction_update_status
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sales_interaction_update_status(
  p_id uuid,
  p_status text,
  p_outcome_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _actor  uuid := auth.uid();
  _row    public.sales_interactions%ROWTYPE;
  _status text := lower(btrim(COALESCE(p_status, '')));
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;

  IF NOT (_status = ANY (ARRAY['open', 'won', 'lost', 'cancelled', 'done'])) THEN
    RAISE EXCEPTION 'وضعیت تعامل نامعتبر است.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _row FROM public.sales_interactions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'تعامل فروش پیدا نشد.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.has_any_role(_actor, ARRAY['admin', 'manager']::text[])
    OR _row.author_id = _actor
    OR _row.salesperson_id = _actor
  ) THEN
    RAISE EXCEPTION 'دسترسی لازم برای تغییر وضعیت را ندارید.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.sales_interactions
     SET status = _status,
         outcome_note = COALESCE(NULLIF(btrim(COALESCE(p_outcome_note, '')), ''), outcome_note)
   WHERE id = p_id;

  RETURN p_id;
END
$function$;

COMMENT ON FUNCTION public.sales_interaction_update_status(uuid, text, text) IS
  'Updates sales_interactions.status (+ optional outcome_note). Migration 546.';

REVOKE ALL ON FUNCTION public.sales_interaction_update_status(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_interaction_update_status(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.sales_interaction_update_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_interaction_update_status(uuid, text, text) TO service_role;


-- ----------------------------------------------------------------------------
-- 3. sales_interaction_set_follow_up
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sales_interaction_set_follow_up(
  p_id uuid,
  p_next_follow_up_at timestamptz,
  p_followed_up_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _actor uuid := auth.uid();
  _row   public.sales_interactions%ROWTYPE;
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _row FROM public.sales_interactions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'تعامل فروش پیدا نشد.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.has_any_role(_actor, ARRAY['admin', 'manager']::text[])
    OR _row.author_id = _actor
    OR _row.salesperson_id = _actor
  ) THEN
    RAISE EXCEPTION 'دسترسی لازم برای پیگیری را ندارید.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.sales_interactions
     SET next_follow_up_at = p_next_follow_up_at,
         followed_up_at = COALESCE(p_followed_up_at, followed_up_at)
   WHERE id = p_id;

  RETURN p_id;
END
$function$;

COMMENT ON FUNCTION public.sales_interaction_set_follow_up(uuid, timestamptz, timestamptz) IS
  'Sets next_follow_up_at and optionally followed_up_at. Migration 546.';

REVOKE ALL ON FUNCTION public.sales_interaction_set_follow_up(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_interaction_set_follow_up(uuid, timestamptz, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.sales_interaction_set_follow_up(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_interaction_set_follow_up(uuid, timestamptz, timestamptz) TO service_role;


-- ----------------------------------------------------------------------------
-- 4. sales_my_month_stats
-- Prefer staff_daily_performance_metrics for call counts (project source of truth
-- after 517); fall back to call_logs for the current user when SDPM has no rows.
-- won/lost counts: rows where current user is salesperson_id OR author_id.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sales_my_month_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _actor uuid := auth.uid();
  _month_start date;
  _month_end   date;
  _calls bigint := 0;
  _sdpm  bigint := 0;
  _won   bigint := 0;
  _lost  bigint := 0;
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_any_role(_actor, ARRAY['sales', 'admin', 'manager', 'accountant']::text[]) THEN
    RAISE EXCEPTION 'مشاهده آمار ماهانه فقط برای کارکنان مجاز است.'
      USING ERRCODE = '42501';
  END IF;

  _month_start := date_trunc('month', (now() AT TIME ZONE 'Asia/Tehran'))::date;
  _month_end   := (_month_start + interval '1 month')::date;

  SELECT COALESCE(SUM(m.inbound_calls_count + m.outbound_calls_count), 0)
    INTO _sdpm
    FROM public.staff_daily_performance_metrics m
   WHERE m.staff_user_id = _actor
     AND m.metric_date >= _month_start
     AND m.metric_date < _month_end;

  IF _sdpm > 0 THEN
    _calls := _sdpm;
  ELSE
    SELECT COUNT(*) INTO _calls
      FROM public.call_logs cl
     WHERE cl.employee_id = _actor
       AND (cl.started_at AT TIME ZONE 'Asia/Tehran')::date >= _month_start
       AND (cl.started_at AT TIME ZONE 'Asia/Tehran')::date < _month_end;
  END IF;

  SELECT COUNT(*) INTO _won
    FROM public.sales_interactions si
   WHERE si.status = 'won'
     AND (si.salesperson_id = _actor OR si.author_id = _actor)
     AND (si.updated_at AT TIME ZONE 'Asia/Tehran')::date >= _month_start
     AND (si.updated_at AT TIME ZONE 'Asia/Tehran')::date < _month_end;

  SELECT COUNT(*) INTO _lost
    FROM public.sales_interactions si
   WHERE si.status = 'lost'
     AND (si.salesperson_id = _actor OR si.author_id = _actor)
     AND (si.updated_at AT TIME ZONE 'Asia/Tehran')::date >= _month_start
     AND (si.updated_at AT TIME ZONE 'Asia/Tehran')::date < _month_end;

  RETURN jsonb_build_object(
    'month_start', _month_start,
    'calls_count', _calls,
    'won_count', _won,
    'lost_count', _lost,
    'calls_source', CASE WHEN _sdpm > 0 THEN 'staff_daily_performance_metrics' ELSE 'call_logs' END
  );
END
$function$;

COMMENT ON FUNCTION public.sales_my_month_stats() IS
  'Month-to-date call + won/lost stats for auth.uid(). Migration 546.';

REVOKE ALL ON FUNCTION public.sales_my_month_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_my_month_stats() FROM anon;
GRANT EXECUTE ON FUNCTION public.sales_my_month_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_my_month_stats() TO service_role;


-- ----------------------------------------------------------------------------
-- 5. Assertions
-- ----------------------------------------------------------------------------
DO $do$
DECLARE
  _missing text;
BEGIN
  IF to_regprocedure('public.sales_interaction_create(uuid,text,text,text,uuid,uuid,uuid,timestamptz,text,text)') IS NULL
     OR to_regprocedure('public.sales_interaction_update_status(uuid,text,text)') IS NULL
     OR to_regprocedure('public.sales_interaction_set_follow_up(uuid,timestamptz,timestamptz)') IS NULL
     OR to_regprocedure('public.sales_my_month_stats()') IS NULL THEN
    RAISE EXCEPTION '546: one or more sales_interaction RPCs missing after create';
  END IF;

  SELECT string_agg(f, ', ') INTO _missing
  FROM unnest(ARRAY[
    'sales_interaction_create(uuid,text,text,text,uuid,uuid,uuid,timestamptz,text,text)',
    'sales_interaction_update_status(uuid,text,text)',
    'sales_interaction_set_follow_up(uuid,timestamptz,timestamptz)',
    'sales_my_month_stats()'
  ]) AS f
  WHERE has_function_privilege('anon', ('public.' || f)::regprocedure, 'EXECUTE');

  IF _missing IS NOT NULL THEN
    RAISE EXCEPTION '546: anon still has EXECUTE on %', _missing;
  END IF;

  IF NOT has_function_privilege(
       'authenticated',
       'public.sales_my_month_stats()'::regprocedure,
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION '546: authenticated missing EXECUTE on sales_my_month_stats';
  END IF;

  RAISE NOTICE '546 OK: four sales_interaction RPCs installed; anon execute closed';
END
$do$;
