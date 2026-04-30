-- 1. KPI catalog
CREATE TABLE public.gamification_kpis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label_fa text NOT NULL,
  description text,
  weight numeric NOT NULL DEFAULT 1,
  enabled boolean NOT NULL DEFAULT true,
  team_scope text NOT NULL DEFAULT 'all',
  source text NOT NULL DEFAULT 'invoices',
  unit text,
  direction text NOT NULL DEFAULT 'higher_better',
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gamification_kpis_direction_check CHECK (direction IN ('higher_better','lower_better')),
  CONSTRAINT gamification_kpis_team_scope_check CHECK (team_scope IN ('all','sales','support','manager'))
);
CREATE INDEX idx_gamification_kpis_enabled ON public.gamification_kpis(enabled) WHERE enabled = true;
ALTER TABLE public.gamification_kpis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view kpis" ON public.gamification_kpis FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/manager can insert kpis" ON public.gamification_kpis FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "Admin/manager can update kpis" ON public.gamification_kpis FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "Admin/manager can delete kpis" ON public.gamification_kpis FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE TRIGGER trg_gamification_kpis_updated_at BEFORE UPDATE ON public.gamification_kpis
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Employee scores
CREATE TABLE public.employee_scores (
  employee_id uuid PRIMARY KEY,
  daily_score numeric NOT NULL DEFAULT 0,
  weekly_score numeric NOT NULL DEFAULT 0,
  monthly_score numeric NOT NULL DEFAULT 0,
  total_score numeric NOT NULL DEFAULT 0,
  normalized_score numeric NOT NULL DEFAULT 0,
  active_work_minutes numeric NOT NULL DEFAULT 0,
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_employee_scores_total ON public.employee_scores(total_score DESC);
CREATE INDEX idx_employee_scores_monthly ON public.employee_scores(monthly_score DESC);
ALTER TABLE public.employee_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Self/admin/manager can view scores" ON public.employee_scores FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE TRIGGER trg_employee_scores_updated_at BEFORE UPDATE ON public.employee_scores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Score events
CREATE TABLE public.employee_score_events (
  id bigserial PRIMARY KEY,
  employee_id uuid NOT NULL,
  event_type text NOT NULL,
  source_table text,
  source_id text,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb
);
CREATE INDEX idx_score_events_employee ON public.employee_score_events(employee_id, triggered_at DESC);
ALTER TABLE public.employee_score_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can view score events" ON public.employee_score_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- 4. Call logs
CREATE TABLE public.call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  direction text NOT NULL,
  duration_seconds integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  customer_id uuid,
  external_id text,
  source text NOT NULL DEFAULT 'manual',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT call_logs_direction_check CHECK (direction IN ('inbound','outbound'))
);
CREATE INDEX idx_call_logs_employee_time ON public.call_logs(employee_id, started_at DESC);
CREATE INDEX idx_call_logs_external ON public.call_logs(external_id) WHERE external_id IS NOT NULL;
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Self/admin/manager can view call logs" ON public.call_logs FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "Admin/manager can insert call logs" ON public.call_logs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "Admin/manager can update call logs" ON public.call_logs FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "Admin can delete call logs" ON public.call_logs FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- 5. Score calculation function
CREATE OR REPLACE FUNCTION public.calculate_employee_score(_employee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _now timestamptz := now();
  _day_start timestamptz := date_trunc('day', _now);
  _week_start timestamptz := date_trunc('week', _now);
  _month_start timestamptz := date_trunc('month', _now);
  _prev_month_start timestamptz := date_trunc('month', _now - interval '1 month');
  _prev_month_end timestamptz := date_trunc('month', _now);

  _kpi RECORD;
  _value numeric;
  _daily numeric := 0;
  _weekly numeric := 0;
  _monthly numeric := 0;
  _total numeric := 0;
  _active_minutes numeric := 0;
  _normalized numeric := 0;
  _breakdown jsonb := '{}'::jsonb;

  _inbound_d int; _outbound_d int; _talk_d numeric;
  _inbound_w int; _outbound_w int; _talk_w numeric;
  _inbound_m int; _outbound_m int; _talk_m numeric;
  _inbound_t int; _outbound_t int; _talk_t numeric;

  _sales_d numeric; _sales_w numeric; _sales_m numeric; _sales_t numeric;
  _profit_d numeric := 0; _profit_w numeric := 0; _profit_m numeric := 0; _profit_t numeric := 0;
  _new_cust_m int := 0; _deals_m int := 0;
  _prev_month_sales numeric;
  _growth numeric := 0;
BEGIN
  SELECT COALESCE(SUM(CASE WHEN direction='inbound' THEN 1 ELSE 0 END),0),
         COALESCE(SUM(CASE WHEN direction='outbound' THEN 1 ELSE 0 END),0),
         COALESCE(SUM(duration_seconds)/60.0,0)
    INTO _inbound_d,_outbound_d,_talk_d
    FROM public.call_logs WHERE employee_id=_employee_id AND started_at>=_day_start;

  SELECT COALESCE(SUM(CASE WHEN direction='inbound' THEN 1 ELSE 0 END),0),
         COALESCE(SUM(CASE WHEN direction='outbound' THEN 1 ELSE 0 END),0),
         COALESCE(SUM(duration_seconds)/60.0,0)
    INTO _inbound_w,_outbound_w,_talk_w
    FROM public.call_logs WHERE employee_id=_employee_id AND started_at>=_week_start;

  SELECT COALESCE(SUM(CASE WHEN direction='inbound' THEN 1 ELSE 0 END),0),
         COALESCE(SUM(CASE WHEN direction='outbound' THEN 1 ELSE 0 END),0),
         COALESCE(SUM(duration_seconds)/60.0,0)
    INTO _inbound_m,_outbound_m,_talk_m
    FROM public.call_logs WHERE employee_id=_employee_id AND started_at>=_month_start;

  SELECT COALESCE(SUM(CASE WHEN direction='inbound' THEN 1 ELSE 0 END),0),
         COALESCE(SUM(CASE WHEN direction='outbound' THEN 1 ELSE 0 END),0),
         COALESCE(SUM(duration_seconds)/60.0,0)
    INTO _inbound_t,_outbound_t,_talk_t
    FROM public.call_logs WHERE employee_id=_employee_id;

  SELECT
    COALESCE(SUM(CASE WHEN created_at>=_day_start   THEN COALESCE(total_amount,0) ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN created_at>=_week_start  THEN COALESCE(total_amount,0) ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN created_at>=_month_start THEN COALESCE(total_amount,0) ELSE 0 END),0),
    COALESCE(SUM(COALESCE(total_amount,0)),0)
    INTO _sales_d,_sales_w,_sales_m,_sales_t
    FROM public.invoices WHERE created_by=_employee_id;

  SELECT COALESCE(SUM(COALESCE(total_amount,0)),0)
    INTO _prev_month_sales
    FROM public.invoices
    WHERE created_by=_employee_id
      AND created_at>=_prev_month_start AND created_at<_prev_month_end;

  IF _prev_month_sales > 0 THEN
    _growth := ((_sales_m - _prev_month_sales)/_prev_month_sales)*100;
  END IF;

  _active_minutes := GREATEST(_talk_m, 1);

  FOR _kpi IN SELECT key, weight FROM public.gamification_kpis WHERE enabled=true LOOP
    CASE _kpi.key
      WHEN 'inbound_calls'         THEN _value := _inbound_m;
      WHEN 'outbound_calls'        THEN _value := _outbound_m;
      WHEN 'talk_minutes'          THEN _value := _talk_m;
      WHEN 'total_sales'           THEN _value := _sales_m;
      WHEN 'total_profit'          THEN _value := _profit_m;
      WHEN 'new_customers'         THEN _value := _new_cust_m;
      WHEN 'active_work_hours'     THEN _value := _active_minutes/60.0;
      WHEN 'deals_registered'      THEN _value := _deals_m;
      WHEN 'sales_per_talk_minute' THEN _value := CASE WHEN _talk_m>0 THEN _sales_m/_talk_m ELSE 0 END;
      WHEN 'profit_per_talk_minute'THEN _value := CASE WHEN _talk_m>0 THEN _profit_m/_talk_m ELSE 0 END;
      WHEN 'growth_vs_last_month'  THEN _value := _growth;
      WHEN 'cumulative_sales'      THEN _value := _sales_t;
      ELSE _value := 0;
    END CASE;

    _daily := _daily + (CASE _kpi.key
      WHEN 'inbound_calls' THEN _inbound_d
      WHEN 'outbound_calls' THEN _outbound_d
      WHEN 'talk_minutes' THEN _talk_d
      WHEN 'total_sales' THEN _sales_d
      ELSE 0 END) * _kpi.weight;

    _weekly := _weekly + (CASE _kpi.key
      WHEN 'inbound_calls' THEN _inbound_w
      WHEN 'outbound_calls' THEN _outbound_w
      WHEN 'talk_minutes' THEN _talk_w
      WHEN 'total_sales' THEN _sales_w
      ELSE 0 END) * _kpi.weight;

    _monthly := _monthly + (_value * _kpi.weight);

    _total := _total + (CASE _kpi.key
      WHEN 'inbound_calls' THEN _inbound_t
      WHEN 'outbound_calls' THEN _outbound_t
      WHEN 'talk_minutes' THEN _talk_t
      WHEN 'total_sales' THEN _sales_t
      WHEN 'cumulative_sales' THEN _sales_t
      ELSE _value END) * _kpi.weight;

    _breakdown := _breakdown || jsonb_build_object(_kpi.key, jsonb_build_object(
      'value', _value, 'weight', _kpi.weight, 'contribution', _value * _kpi.weight
    ));
  END LOOP;

  _normalized := CASE WHEN _active_minutes>0 THEN _monthly/_active_minutes ELSE 0 END;

  INSERT INTO public.employee_scores (
    employee_id, daily_score, weekly_score, monthly_score, total_score,
    normalized_score, active_work_minutes, breakdown, last_calculated_at
  ) VALUES (
    _employee_id, _daily, _weekly, _monthly, _total,
    _normalized, _active_minutes, _breakdown, _now
  )
  ON CONFLICT (employee_id) DO UPDATE SET
    daily_score=EXCLUDED.daily_score,
    weekly_score=EXCLUDED.weekly_score,
    monthly_score=EXCLUDED.monthly_score,
    total_score=EXCLUDED.total_score,
    normalized_score=EXCLUDED.normalized_score,
    active_work_minutes=EXCLUDED.active_work_minutes,
    breakdown=EXCLUDED.breakdown,
    last_calculated_at=EXCLUDED.last_calculated_at,
    updated_at=now();

  RETURN jsonb_build_object(
    'employee_id',_employee_id,
    'daily',_daily,'weekly',_weekly,'monthly',_monthly,'total',_total,
    'normalized',_normalized,'breakdown',_breakdown
  );
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_employee_score(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.calculate_employee_score(uuid) TO authenticated;

-- 6. Trigger on invoices
CREATE OR REPLACE FUNCTION public.recompute_employee_scores_on_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _emp uuid;
BEGIN
  IF TG_OP='DELETE' THEN _emp := OLD.created_by; ELSE _emp := NEW.created_by; END IF;
  IF _emp IS NOT NULL THEN
    BEGIN
      PERFORM public.calculate_employee_score(_emp);
      INSERT INTO public.employee_score_events(employee_id, event_type, source_table, source_id, payload)
      VALUES (_emp, 'invoice_'||lower(TG_OP), 'invoices',
              COALESCE(NEW.id::text, OLD.id::text),
              jsonb_build_object('op', TG_OP));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_recompute_employee_score ON public.invoices;
CREATE TRIGGER trg_invoices_recompute_employee_score
  AFTER INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.recompute_employee_scores_on_invoice();

-- 7. Seed KPIs
INSERT INTO public.gamification_kpis (key, label_fa, description, weight, source, unit, direction, display_order) VALUES
  ('inbound_calls','تماس‌های ورودی','تعداد تماس‌های ورودی پاسخ داده شده',1,'call_logs','count','higher_better',10),
  ('outbound_calls','تماس‌های خروجی','تعداد تماس‌های خروجی برقرار شده',1,'call_logs','count','higher_better',20),
  ('talk_minutes','مدت مکالمه','مجموع دقایق مکالمه',0.5,'call_logs','minutes','higher_better',30),
  ('total_sales','مجموع فروش (ماهانه)','جمع مبلغ فاکتورهای فروش در ماه جاری',0.0001,'invoices','currency','higher_better',40),
  ('total_profit','مجموع سود (ماهانه)','جمع سود فاکتورهای فروش در ماه جاری',0.0002,'invoices','currency','higher_better',50),
  ('new_customers','مشتریان جدید','تعداد مشتریان تازه‌جذب‌شده',5,'profiles','count','higher_better',60),
  ('active_work_hours','ساعات کاری فعال','تخمین ساعات فعالیت بر اساس فعالیت‌ها',2,'derived','hours','higher_better',70),
  ('deals_registered','معاملات ثبت‌شده در CRM','تعداد معاملات ثبت‌شده در CRM',3,'crm_deals','count','higher_better',80),
  ('sales_per_talk_minute','فروش به ازای دقیقه مکالمه','نسبت مبلغ فروش به دقایق مکالمه',0.001,'derived','ratio','higher_better',90),
  ('profit_per_talk_minute','سود به ازای دقیقه مکالمه','نسبت سود به دقایق مکالمه',0.002,'derived','ratio','higher_better',100),
  ('growth_vs_last_month','رشد نسبت به ماه قبل','درصد رشد فروش این ماه نسبت به ماه گذشته',0.5,'derived','percent','higher_better',110),
  ('cumulative_sales','مجموع کل فروش','جمع کل فروش از ابتدا تاکنون',0.00001,'invoices','currency','higher_better',120)
ON CONFLICT (key) DO NOTHING;