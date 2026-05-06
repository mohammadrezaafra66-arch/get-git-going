CREATE TABLE public.market_indicators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  title_fa text NOT NULL,
  title_en text,
  category text NOT NULL CHECK (category IN ('currency','gold','coin','official','crypto','manual')),
  unit text NOT NULL DEFAULT 'toman',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.market_rate_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  title_fa text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('manual','api','scraper')),
  base_url text,
  is_enabled boolean NOT NULL DEFAULT true,
  confidence_weight numeric NOT NULL DEFAULT 1,
  fetch_interval_seconds integer,
  requires_api_key boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.market_rate_ticks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id uuid NOT NULL REFERENCES public.market_indicators(id) ON DELETE RESTRICT,
  source_id uuid NOT NULL REFERENCES public.market_rate_sources(id) ON DELETE RESTRICT,
  value numeric NOT NULL CHECK (value > 0),
  unit text NOT NULL DEFAULT 'toman',
  observed_at timestamptz NOT NULL DEFAULT now(),
  source_reported_at timestamptz,
  jalali_date_label text,
  change_amount numeric,
  change_percent numeric,
  raw_payload jsonb,
  confidence_score numeric,
  status text NOT NULL DEFAULT 'accepted' CHECK (status IN ('accepted','suspect','rejected')),
  note text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX market_rate_ticks_indicator_observed_idx ON public.market_rate_ticks (indicator_id, observed_at DESC);
CREATE INDEX market_rate_ticks_source_observed_idx ON public.market_rate_ticks (source_id, observed_at DESC);
CREATE INDEX market_rate_ticks_status_idx ON public.market_rate_ticks (status);
CREATE INDEX market_rate_ticks_created_idx ON public.market_rate_ticks (created_at DESC);

CREATE OR REPLACE FUNCTION public.market_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_market_indicators_updated
  BEFORE UPDATE ON public.market_indicators
  FOR EACH ROW EXECUTE FUNCTION public.market_set_updated_at();

CREATE TRIGGER trg_market_rate_sources_updated
  BEFORE UPDATE ON public.market_rate_sources
  FOR EACH ROW EXECUTE FUNCTION public.market_set_updated_at();

ALTER TABLE public.market_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_rate_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_rate_ticks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "indicators read" ON public.market_indicators
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR
    public.has_role(auth.uid(),'accountant') OR public.has_role(auth.uid(),'sales')
  );
CREATE POLICY "indicators write" ON public.market_indicators
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'accountant'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'accountant'));

CREATE POLICY "sources read" ON public.market_rate_sources
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR
    public.has_role(auth.uid(),'accountant') OR public.has_role(auth.uid(),'sales')
  );
CREATE POLICY "sources write" ON public.market_rate_sources
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'accountant'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'accountant'));

CREATE POLICY "ticks read elevated" ON public.market_rate_ticks
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'accountant'));
CREATE POLICY "ticks insert elevated" ON public.market_rate_ticks
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'accountant'))
    AND created_by = auth.uid()
  );
CREATE POLICY "ticks update elevated" ON public.market_rate_ticks
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'accountant'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'accountant'));

-- نمای عمومی برای sales: فقط ستون‌های غیرحساس و فقط accepted
CREATE VIEW public.market_rate_ticks_public AS
SELECT id, indicator_id, source_id, value, unit, observed_at, source_reported_at,
       jalali_date_label, change_amount, change_percent, status, created_at
FROM public.market_rate_ticks
WHERE status = 'accepted';

GRANT SELECT ON public.market_rate_ticks_public TO authenticated;

CREATE OR REPLACE FUNCTION public.record_market_rate_tick(
  p_indicator_id uuid, p_source_id uuid, p_value numeric,
  p_observed_at timestamptz, p_status text DEFAULT 'accepted',
  p_note text DEFAULT NULL, p_unit text DEFAULT 'toman'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prev numeric; v_change_amt numeric; v_change_pct numeric;
  v_id uuid; v_ic text; v_sc text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'احراز هویت لازم است'; END IF;
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'manager') OR public.has_role(v_uid,'accountant')) THEN
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

GRANT EXECUTE ON FUNCTION public.record_market_rate_tick(uuid,uuid,numeric,timestamptz,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_market_rate_tick_status(
  p_tick_id uuid, p_status text, p_note text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_old text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'احراز هویت لازم است'; END IF;
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'manager') OR public.has_role(v_uid,'accountant')) THEN
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

GRANT EXECUTE ON FUNCTION public.set_market_rate_tick_status(uuid,text,text) TO authenticated;

INSERT INTO public.market_indicators (code, title_fa, title_en, category, unit, sort_order) VALUES
  ('USD_TEHRAN_FREE','دلار تهران','USD Tehran (Free)','currency','toman',10),
  ('USD_HERAT','دلار هرات','USD Herat','currency','toman',20),
  ('USD_SULAYMANIYAH','دلار سلیمانیه','USD Sulaymaniyah','currency','toman',30),
  ('AED_TEHRAN','درهم تهران','AED Tehran','currency','toman',40),
  ('USDT_TOMAN','تتر','USDT/Toman','crypto','toman',50),
  ('GOLD_18','طلای ۱۸ عیار','Gold 18K','gold','toman',60),
  ('GOLD_MESGHAL','مثقال طلا','Gold Mesghal','gold','toman',70),
  ('GOLD_OUNCE_USD','انس جهانی طلا','Gold Ounce (USD)','gold','usd',80),
  ('COIN_EMAMI','سکه امامی','Coin Emami','coin','toman',90),
  ('COIN_BAHAR','سکه بهار آزادی','Coin Bahar','coin','toman',100),
  ('IQD_100','صد دینار عراق','100 IQD','currency','toman',110);

INSERT INTO public.market_rate_sources (code, title_fa, source_type) VALUES
  ('MANUAL_ACCOUNTING','ثبت دستی حسابداری','manual'),
  ('MANUAL_MANAGER','ثبت دستی مدیرکل','manual');
