-- FX.2: External rates ingestion infrastructure (Navasan + TGJU), all disabled by default

-- 1) Seed external sources (idempotent)
INSERT INTO public.market_rate_sources (code, title_fa, source_type, base_url, is_enabled, requires_api_key, confidence_weight)
VALUES
  ('NAVASAN_API', 'نوسان', 'api', 'https://www.navasan.tech', false, true, 0.85),
  ('TGJU_API', 'شبکه اطلاع‌رسانی طلا و ارز', 'api', 'https://www.tgju.org', false, true, 0.85)
ON CONFLICT (code) DO NOTHING;

-- 2) Mapping table: indicator <-> source symbol
CREATE TABLE IF NOT EXISTS public.market_rate_source_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.market_rate_sources(id) ON DELETE CASCADE,
  indicator_id uuid NOT NULL REFERENCES public.market_indicators(id) ON DELETE CASCADE,
  source_symbol text NOT NULL,
  normalize_multiplier numeric NOT NULL DEFAULT 1,
  is_enabled boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, indicator_id)
);

CREATE INDEX IF NOT EXISTS idx_mrsm_source ON public.market_rate_source_mappings(source_id) WHERE is_enabled = true;

ALTER TABLE public.market_rate_source_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mappings read elevated" ON public.market_rate_source_mappings;
CREATE POLICY "mappings read elevated" ON public.market_rate_source_mappings FOR SELECT TO authenticated
USING (
  (SELECT public.has_role(auth.uid(),'admin'::public.app_role))
  OR (SELECT public.has_role(auth.uid(),'manager'::public.app_role))
  OR (SELECT public.has_role(auth.uid(),'accountant'::public.app_role))
);

DROP POLICY IF EXISTS "mappings write elevated" ON public.market_rate_source_mappings;
CREATE POLICY "mappings write elevated" ON public.market_rate_source_mappings FOR ALL TO authenticated
USING (
  (SELECT public.has_role(auth.uid(),'admin'::public.app_role))
  OR (SELECT public.has_role(auth.uid(),'manager'::public.app_role))
)
WITH CHECK (
  (SELECT public.has_role(auth.uid(),'admin'::public.app_role))
  OR (SELECT public.has_role(auth.uid(),'manager'::public.app_role))
);

-- Seed mappings (Navasan symbols per public docs: usd, aed, 18ayar, mesghal, ons, sekee, sekeb, usdt)
DO $$
DECLARE
  v_nav uuid; v_tgju uuid;
BEGIN
  SELECT id INTO v_nav FROM public.market_rate_sources WHERE code='NAVASAN_API';
  SELECT id INTO v_tgju FROM public.market_rate_sources WHERE code='TGJU_API';

  IF v_nav IS NOT NULL THEN
    INSERT INTO public.market_rate_source_mappings (source_id, indicator_id, source_symbol, is_enabled, note)
    SELECT v_nav, mi.id, m.sym, true, 'mapping اولیه طبق مستندات نوسان'
    FROM public.market_indicators mi
    JOIN (VALUES
      ('USD_TEHRAN_FREE','usd'),
      ('AED_TEHRAN','aed'),
      ('GOLD_18','18ayar'),
      ('GOLD_MESGHAL','mesghal'),
      ('GOLD_OUNCE_USD','ons'),
      ('COIN_EMAMI','sekee'),
      ('COIN_BAHAR','sekeb'),
      ('USDT_TOMAN','usdt')
    ) AS m(code, sym) ON m.code = mi.code
    ON CONFLICT (source_id, indicator_id) DO NOTHING;
  END IF;

  -- TGJU: نمادهای دقیق در مستندات web service آن‌ها متفاوت‌اند؛
  -- فعلاً mappingها را disabled می‌سازیم و note می‌گذاریم تا ادمین بعداً تأیید کند.
  IF v_tgju IS NOT NULL THEN
    INSERT INTO public.market_rate_source_mappings (source_id, indicator_id, source_symbol, is_enabled, note)
    SELECT v_tgju, mi.id, m.sym, false, 'mapping TGJU نیاز به تأیید نماد دقیق توسط ادمین دارد'
    FROM public.market_indicators mi
    JOIN (VALUES
      ('USD_TEHRAN_FREE','price_dollar_rl'),
      ('AED_TEHRAN','price_aed'),
      ('GOLD_18','geram18'),
      ('GOLD_MESGHAL','mesghal'),
      ('GOLD_OUNCE_USD','ons'),
      ('COIN_EMAMI','sekee'),
      ('COIN_BAHAR','sekeb')
    ) AS m(code, sym) ON m.code = mi.code
    ON CONFLICT (source_id, indicator_id) DO NOTHING;
  END IF;
END $$;

-- 3) Ingestion runs table
CREATE TABLE IF NOT EXISTS public.market_rate_ingestion_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES public.market_rate_sources(id) ON DELETE SET NULL,
  source_code text NOT NULL,
  started_by uuid,
  status text NOT NULL DEFAULT 'started' CHECK (status IN ('started','completed','failed','skipped')),
  fetched_count integer NOT NULL DEFAULT 0,
  inserted_count integer NOT NULL DEFAULT 0,
  suspect_count integer NOT NULL DEFAULT 0,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_mrir_started_at ON public.market_rate_ingestion_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_mrir_source ON public.market_rate_ingestion_runs(source_code, started_at DESC);

ALTER TABLE public.market_rate_ingestion_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "runs read elevated" ON public.market_rate_ingestion_runs;
CREATE POLICY "runs read elevated" ON public.market_rate_ingestion_runs FOR SELECT TO authenticated
USING (
  (SELECT public.has_role(auth.uid(),'admin'::public.app_role))
  OR (SELECT public.has_role(auth.uid(),'manager'::public.app_role))
  OR (SELECT public.has_role(auth.uid(),'accountant'::public.app_role))
);
-- writes go through SECURITY DEFINER RPCs only; no direct INSERT/UPDATE policy

-- 4) RPC: start ingestion run
CREATE OR REPLACE FUNCTION public.start_market_rate_ingestion_run(p_source_code text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid := auth.uid(); v_sid uuid; v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'احراز هویت لازم است'; END IF;
  IF NOT (public.has_role(v_uid,'admin'::public.app_role)
       OR public.has_role(v_uid,'manager'::public.app_role)
       OR public.has_role(v_uid,'accountant'::public.app_role)) THEN
    RAISE EXCEPTION 'دسترسی لازم برای دریافت نرخ خارجی وجود ندارد';
  END IF;

  SELECT id INTO v_sid FROM public.market_rate_sources WHERE code = p_source_code;

  INSERT INTO public.market_rate_ingestion_runs (source_id, source_code, started_by, status)
  VALUES (v_sid, p_source_code, v_uid, 'started')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_market_rate_ingestion_run(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_market_rate_ingestion_run(text) TO authenticated;

-- 5) RPC: finish ingestion run
CREATE OR REPLACE FUNCTION public.finish_market_rate_ingestion_run(
  p_run_id uuid, p_status text, p_fetched integer, p_inserted integer,
  p_suspect integer, p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'احراز هویت لازم است'; END IF;
  IF NOT (public.has_role(v_uid,'admin'::public.app_role)
       OR public.has_role(v_uid,'manager'::public.app_role)
       OR public.has_role(v_uid,'accountant'::public.app_role)) THEN
    RAISE EXCEPTION 'دسترسی لازم نیست';
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
$$;
REVOKE EXECUTE ON FUNCTION public.finish_market_rate_ingestion_run(uuid,text,integer,integer,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_market_rate_ingestion_run(uuid,text,integer,integer,integer,text) TO authenticated;

-- 6) RPC: record external tick (with suspect heuristics)
CREATE OR REPLACE FUNCTION public.record_external_market_rate_tick(
  p_indicator_id uuid,
  p_source_id uuid,
  p_value numeric,
  p_observed_at timestamptz,
  p_source_reported_at timestamptz DEFAULT NULL,
  p_raw_payload jsonb DEFAULT NULL,
  p_unit text DEFAULT 'toman'
)
RETURNS TABLE(tick_id uuid, status_out text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prev numeric; v_change_amt numeric; v_change_pct numeric;
  v_status text := 'accepted'; v_note text;
  v_id uuid; v_ic text; v_sc text; v_conf numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'احراز هویت لازم است'; END IF;
  IF NOT (public.has_role(v_uid,'admin'::public.app_role)
       OR public.has_role(v_uid,'manager'::public.app_role)
       OR public.has_role(v_uid,'accountant'::public.app_role)) THEN
    RAISE EXCEPTION 'دسترسی لازم برای ثبت نرخ خارجی نیست';
  END IF;
  IF p_value IS NULL OR p_value <= 0 THEN
    RAISE EXCEPTION 'مقدار نامعتبر برای نرخ خارجی';
  END IF;

  -- Previous accepted rate for change calc + suspect threshold
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
     v_change_amt, v_change_pct, v_status, v_note, p_raw_payload, v_conf, v_uid)
  RETURNING id INTO v_id;

  SELECT code INTO v_ic FROM public.market_indicators WHERE id = p_indicator_id;
  SELECT code INTO v_sc FROM public.market_rate_sources WHERE id = p_source_id;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (v_uid, 'market_rate_tick', v_id, 'market_rate_external_ingested',
    jsonb_build_object(
      'indicator_code', v_ic, 'source_code', v_sc,
      'value', p_value, 'unit', COALESCE(p_unit,'toman'),
      'observed_at', p_observed_at, 'source_reported_at', p_source_reported_at,
      'status', v_status, 'change_percent', v_change_pct
    ));

  RETURN QUERY SELECT v_id, v_status;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.record_external_market_rate_tick(uuid,uuid,numeric,timestamptz,timestamptz,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_external_market_rate_tick(uuid,uuid,numeric,timestamptz,timestamptz,jsonb,text) TO authenticated;