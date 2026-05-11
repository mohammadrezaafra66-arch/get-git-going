-- MR-AUTO.4: System (service-role) RPC variants for unattended cron market-rate ingestion.
-- These mirror the existing user-facing RPCs but skip auth.uid()/role checks.
-- They are safe because:
--   1. They are SECURITY DEFINER and explicitly REVOKE EXECUTE FROM PUBLIC, anon, authenticated.
--      Only service_role (server-side, no JWT user) can call them.
--   2. They additionally guard with `IF auth.uid() IS NOT NULL THEN RAISE EXCEPTION` so
--      that even if EXECUTE is mistakenly granted to an authenticated role later,
--      a logged-in user cannot bypass the user-facing RPC checks via these.
--   3. They write started_by = NULL as the system/cron marker (consistent with audit schema).
-- The original user-facing RPCs (start/finish/record) are untouched.

CREATE OR REPLACE FUNCTION public.start_market_rate_ingestion_run_system(p_source_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_sid uuid; v_id uuid;
BEGIN
  -- Service-role only: callable when there is no authenticated user.
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'system RPC: not callable by authenticated users';
  END IF;

  SELECT id INTO v_sid FROM public.market_rate_sources WHERE code = p_source_code;

  INSERT INTO public.market_rate_ingestion_runs (source_id, source_code, started_by, status)
  VALUES (v_sid, p_source_code, NULL, 'started')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finish_market_rate_ingestion_run_system(
  p_run_id uuid, p_status text, p_fetched integer, p_inserted integer, p_suspect integer, p_error text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'system RPC: not callable by authenticated users';
  END IF;
  IF p_status NOT IN ('completed','failed','skipped') THEN
    RAISE EXCEPTION 'وضعیت نامعتبر';
  END IF;

  UPDATE public.market_rate_ingestion_runs
     SET status = p_status,
         fetched_count = COALESCE(p_fetched, 0),
         inserted_count = COALESCE(p_inserted, 0),
         suspect_count = COALESCE(p_suspect, 0),
         error_message = p_error,
         finished_at = now()
   WHERE id = p_run_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_external_market_rate_tick_system(
  p_indicator_id uuid, p_source_id uuid, p_value numeric, p_observed_at timestamp with time zone,
  p_source_reported_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_raw_payload jsonb DEFAULT NULL::jsonb, p_unit text DEFAULT 'toman'::text
)
RETURNS TABLE(tick_id uuid, status_out text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_prev numeric; v_change_amt numeric; v_change_pct numeric;
  v_status text := 'accepted'; v_note text;
  v_id uuid; v_ic text; v_sc text; v_conf numeric;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'system RPC: not callable by authenticated users';
  END IF;
  IF p_value IS NULL OR p_value <= 0 THEN
    RAISE EXCEPTION 'مقدار نامعتبر برای نرخ خارجی';
  END IF;

  SELECT value INTO v_prev FROM public.market_rate_ticks
   WHERE indicator_id = p_indicator_id AND status = 'accepted'
   ORDER BY observed_at DESC LIMIT 1;

  IF v_prev IS NOT NULL THEN
    v_change_amt := p_value - v_prev;
    v_change_pct := (v_change_amt / v_prev) * 100;
    IF abs(v_change_pct) > 3 THEN
      v_status := 'suspect';
      v_note := 'تغییر بیش از ۳٪ نسبت به آخرین نرخ تأییدشده';
    END IF;
  END IF;

  IF p_source_reported_at IS NOT NULL AND p_source_reported_at < now() - interval '24 hours' THEN
    v_status := 'suspect';
    v_note := COALESCE(v_note || ' | ', '') || 'داده منبع قدیمی‌تر از ۲۴ ساعت';
  END IF;

  SELECT confidence_weight INTO v_conf FROM public.market_rate_sources WHERE id = p_source_id;

  INSERT INTO public.market_rate_ticks
    (indicator_id, source_id, value, unit, observed_at, source_reported_at,
     change_amount, change_percent, status, note, raw_payload, confidence_score, created_by)
  VALUES (p_indicator_id, p_source_id, p_value, COALESCE(p_unit,'toman'), p_observed_at, p_source_reported_at,
     v_change_amt, v_change_pct, v_status, v_note, p_raw_payload, v_conf, NULL)
  RETURNING id INTO v_id;

  SELECT code INTO v_ic FROM public.market_indicators WHERE id = p_indicator_id;
  SELECT code INTO v_sc FROM public.market_rate_sources WHERE id = p_source_id;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (NULL, 'market_rate_tick', v_id, 'market_rate_external_ingested_system',
    jsonb_build_object(
      'indicator_code', v_ic, 'source_code', v_sc,
      'value', p_value, 'unit', COALESCE(p_unit,'toman'),
      'observed_at', p_observed_at, 'source_reported_at', p_source_reported_at,
      'status', v_status, 'change_percent', v_change_pct,
      'initiated_by', 'system_cron'
    ));

  RETURN QUERY SELECT v_id, v_status;
END;
$function$;

-- Lock down EXECUTE: only service_role should call these.
REVOKE ALL ON FUNCTION public.start_market_rate_ingestion_run_system(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_market_rate_ingestion_run_system(uuid, text, integer, integer, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_external_market_rate_tick_system(uuid, uuid, numeric, timestamp with time zone, timestamp with time zone, jsonb, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.start_market_rate_ingestion_run_system(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_market_rate_ingestion_run_system(uuid, text, integer, integer, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_external_market_rate_tick_system(uuid, uuid, numeric, timestamp with time zone, timestamp with time zone, jsonb, text) TO service_role;

COMMENT ON FUNCTION public.start_market_rate_ingestion_run_system(text) IS
'MR-AUTO.4 system/cron variant. Service-role only. Skips auth.uid() check; rejects authenticated users. Used by /api/public/hooks/ingest-market-rates.';
COMMENT ON FUNCTION public.finish_market_rate_ingestion_run_system(uuid, text, integer, integer, integer, text) IS
'MR-AUTO.4 system/cron variant. Service-role only.';
COMMENT ON FUNCTION public.record_external_market_rate_tick_system(uuid, uuid, numeric, timestamp with time zone, timestamp with time zone, jsonb, text) IS
'MR-AUTO.4 system/cron variant. Service-role only. started_by/created_by = NULL marks system origin.';