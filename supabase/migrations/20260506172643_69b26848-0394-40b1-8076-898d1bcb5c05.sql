-- 1) Revoke PUBLIC execute and grant only to authenticated
REVOKE EXECUTE ON FUNCTION public.record_market_rate_tick(uuid,uuid,numeric,timestamptz,text,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_market_rate_tick_status(uuid,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_market_rate_ticks_public(uuid,integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.record_market_rate_tick(uuid,uuid,numeric,timestamptz,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_market_rate_tick_status(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_market_rate_ticks_public(uuid,integer) TO authenticated;

-- 2) Recreate functions with hardened search_path = '' and explicit schema references
CREATE OR REPLACE FUNCTION public.record_market_rate_tick(
  p_indicator_id uuid, p_source_id uuid, p_value numeric,
  p_observed_at timestamptz, p_status text DEFAULT 'accepted',
  p_note text DEFAULT NULL, p_unit text DEFAULT 'toman'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prev numeric; v_change_amt numeric; v_change_pct numeric;
  v_id uuid; v_ic text; v_sc text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'احراز هویت لازم است'; END IF;
  IF NOT (public.has_role(v_uid,'admin'::public.app_role)
       OR public.has_role(v_uid,'manager'::public.app_role)
       OR public.has_role(v_uid,'accountant'::public.app_role)) THEN
    RAISE EXCEPTION 'دسترسی لازم برای ثبت نرخ وجود ندارد';
  END IF;
  IF p_value IS NULL OR p_value <= 0 THEN RAISE EXCEPTION 'مقدار نرخ باید بزرگ‌تر از صفر باشد'; END IF;
  IF p_status NOT IN ('accepted','suspect','rejected') THEN RAISE EXCEPTION 'وضعیت نامعتبر'; END IF;

  SELECT value INTO v_prev FROM public.market_rate_ticks
  WHERE indicator_id = p_indicator_id AND status = 'accepted'
  ORDER BY observed_at DESC LIMIT 1;

  IF v_prev IS NOT NULL THEN
    v_change_amt := p_value - v_prev;
    v_change_pct := (v_change_amt / v_prev) * 100;
  END IF;

  INSERT INTO public.market_rate_ticks
    (indicator_id, source_id, value, unit, observed_at, change_amount, change_percent, status, note, created_by)
  VALUES (p_indicator_id, p_source_id, p_value, COALESCE(p_unit,'toman'), p_observed_at, v_change_amt, v_change_pct, p_status, p_note, v_uid)
  RETURNING id INTO v_id;

  SELECT code INTO v_ic FROM public.market_indicators WHERE id = p_indicator_id;
  SELECT code INTO v_sc FROM public.market_rate_sources WHERE id = p_source_id;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (v_uid, 'market_rate_tick', v_id::text, 'market_rate_created',
    jsonb_build_object('indicator_code', v_ic, 'source_code', v_sc, 'value', p_value,
      'unit', COALESCE(p_unit,'toman'), 'observed_at', p_observed_at, 'status', p_status,
      'change_amount', v_change_amt, 'change_percent', v_change_pct));

  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.set_market_rate_tick_status(
  p_tick_id uuid, p_status text, p_note text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := auth.uid(); v_old text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'احراز هویت لازم است'; END IF;
  IF NOT (public.has_role(v_uid,'admin'::public.app_role)
       OR public.has_role(v_uid,'manager'::public.app_role)
       OR public.has_role(v_uid,'accountant'::public.app_role)) THEN
    RAISE EXCEPTION 'دسترسی لازم نیست';
  END IF;
  IF p_status NOT IN ('accepted','suspect','rejected') THEN RAISE EXCEPTION 'وضعیت نامعتبر'; END IF;
  SELECT status INTO v_old FROM public.market_rate_ticks WHERE id = p_tick_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'نرخ یافت نشد'; END IF;
  UPDATE public.market_rate_ticks SET status = p_status, note = COALESCE(p_note, note) WHERE id = p_tick_id;
  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (v_uid, 'market_rate_tick', p_tick_id::text, 'market_rate_status_changed',
    jsonb_build_object('from', v_old, 'to', p_status, 'note', p_note));
END; $$;

CREATE OR REPLACE FUNCTION public.list_market_rate_ticks_public(
  p_indicator_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 15
) RETURNS TABLE (
  id uuid, indicator_id uuid, source_id uuid, value numeric, unit text,
  observed_at timestamptz, jalali_date_label text,
  change_amount numeric, change_percent numeric, status text
) LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT t.id, t.indicator_id, t.source_id, t.value, t.unit, t.observed_at,
         t.jalali_date_label, t.change_amount, t.change_percent, t.status
  FROM public.market_rate_ticks t
  WHERE t.status = 'accepted'
    AND (p_indicator_id IS NULL OR t.indicator_id = p_indicator_id)
  ORDER BY t.observed_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 15), 1), 50);
$$;

REVOKE EXECUTE ON FUNCTION public.list_market_rate_ticks_public(uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_market_rate_ticks_public(uuid,integer) TO authenticated;

-- 3) Performance: rewrite RLS policies with (select has_role(...)) wrapper
DROP POLICY IF EXISTS "indicators read" ON public.market_indicators;
DROP POLICY IF EXISTS "indicators write" ON public.market_indicators;
DROP POLICY IF EXISTS "sources read" ON public.market_rate_sources;
DROP POLICY IF EXISTS "sources write" ON public.market_rate_sources;
DROP POLICY IF EXISTS "ticks read elevated" ON public.market_rate_ticks;
DROP POLICY IF EXISTS "ticks insert elevated" ON public.market_rate_ticks;
DROP POLICY IF EXISTS "ticks update elevated" ON public.market_rate_ticks;

CREATE POLICY "indicators read" ON public.market_indicators
  FOR SELECT TO authenticated
  USING (
    (SELECT public.has_role(auth.uid(),'admin'::public.app_role))
    OR (SELECT public.has_role(auth.uid(),'manager'::public.app_role))
    OR (SELECT public.has_role(auth.uid(),'accountant'::public.app_role))
    OR (SELECT public.has_role(auth.uid(),'sales'::public.app_role))
  );
CREATE POLICY "indicators write" ON public.market_indicators
  FOR ALL TO authenticated
  USING (
    (SELECT public.has_role(auth.uid(),'admin'::public.app_role))
    OR (SELECT public.has_role(auth.uid(),'manager'::public.app_role))
    OR (SELECT public.has_role(auth.uid(),'accountant'::public.app_role))
  )
  WITH CHECK (
    (SELECT public.has_role(auth.uid(),'admin'::public.app_role))
    OR (SELECT public.has_role(auth.uid(),'manager'::public.app_role))
    OR (SELECT public.has_role(auth.uid(),'accountant'::public.app_role))
  );

CREATE POLICY "sources read" ON public.market_rate_sources
  FOR SELECT TO authenticated
  USING (
    (SELECT public.has_role(auth.uid(),'admin'::public.app_role))
    OR (SELECT public.has_role(auth.uid(),'manager'::public.app_role))
    OR (SELECT public.has_role(auth.uid(),'accountant'::public.app_role))
    OR (SELECT public.has_role(auth.uid(),'sales'::public.app_role))
  );
CREATE POLICY "sources write" ON public.market_rate_sources
  FOR ALL TO authenticated
  USING (
    (SELECT public.has_role(auth.uid(),'admin'::public.app_role))
    OR (SELECT public.has_role(auth.uid(),'manager'::public.app_role))
    OR (SELECT public.has_role(auth.uid(),'accountant'::public.app_role))
  )
  WITH CHECK (
    (SELECT public.has_role(auth.uid(),'admin'::public.app_role))
    OR (SELECT public.has_role(auth.uid(),'manager'::public.app_role))
    OR (SELECT public.has_role(auth.uid(),'accountant'::public.app_role))
  );

CREATE POLICY "ticks read elevated" ON public.market_rate_ticks
  FOR SELECT TO authenticated
  USING (
    (SELECT public.has_role(auth.uid(),'admin'::public.app_role))
    OR (SELECT public.has_role(auth.uid(),'manager'::public.app_role))
    OR (SELECT public.has_role(auth.uid(),'accountant'::public.app_role))
  );
CREATE POLICY "ticks insert elevated" ON public.market_rate_ticks
  FOR INSERT TO authenticated
  WITH CHECK (
    ((SELECT public.has_role(auth.uid(),'admin'::public.app_role))
     OR (SELECT public.has_role(auth.uid(),'manager'::public.app_role))
     OR (SELECT public.has_role(auth.uid(),'accountant'::public.app_role)))
    AND created_by = (SELECT auth.uid())
  );
CREATE POLICY "ticks update elevated" ON public.market_rate_ticks
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.has_role(auth.uid(),'admin'::public.app_role))
    OR (SELECT public.has_role(auth.uid(),'manager'::public.app_role))
    OR (SELECT public.has_role(auth.uid(),'accountant'::public.app_role))
  )
  WITH CHECK (
    (SELECT public.has_role(auth.uid(),'admin'::public.app_role))
    OR (SELECT public.has_role(auth.uid(),'manager'::public.app_role))
    OR (SELECT public.has_role(auth.uid(),'accountant'::public.app_role))
  );
