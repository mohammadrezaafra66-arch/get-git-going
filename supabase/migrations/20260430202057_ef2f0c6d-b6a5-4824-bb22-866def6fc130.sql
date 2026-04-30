
-- 1) Auto-disable profit KPIs (no profit / cost_amount column on invoices)
UPDATE public.gamification_kpis
SET enabled = false,
    description = COALESCE(description,'') || ' [auto-disabled: no profit/cost data]'
WHERE key IN ('total_profit','profit_per_talk_minute');

-- 2) Improved score function
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
  _value_d numeric;
  _value_w numeric;
  _value_t numeric;
  _scaled numeric;
  _scaled_d numeric;
  _scaled_w numeric;
  _scaled_t numeric;
  _period text;

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
  _sales_count_d int; _sales_count_w int; _sales_count_m int; _sales_count_t int;

  _new_cust_m int := 0;
  _deals_d int := 0; _deals_w int := 0; _deals_m int := 0; _deals_t int := 0;

  _prev_month_sales numeric;
  _growth numeric := 0;

  _is_log_scale boolean;
BEGIN
  -- Calls
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

  -- Invoice sums + counts (used for sales + deals placeholder)
  SELECT
    COALESCE(SUM(CASE WHEN created_at>=_day_start   THEN COALESCE(total_amount,0) ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN created_at>=_week_start  THEN COALESCE(total_amount,0) ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN created_at>=_month_start THEN COALESCE(total_amount,0) ELSE 0 END),0),
    COALESCE(SUM(COALESCE(total_amount,0)),0),
    COALESCE(SUM(CASE WHEN created_at>=_day_start   THEN 1 ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN created_at>=_week_start  THEN 1 ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN created_at>=_month_start THEN 1 ELSE 0 END),0),
    COUNT(*)
    INTO _sales_d,_sales_w,_sales_m,_sales_t,
         _sales_count_d,_sales_count_w,_sales_count_m,_sales_count_t
    FROM public.invoices WHERE created_by=_employee_id;

  -- Deals placeholder = invoice counts
  _deals_d := _sales_count_d;
  _deals_w := _sales_count_w;
  _deals_m := _sales_count_m;
  _deals_t := _sales_count_t;

  -- Previous month sales for growth
  SELECT COALESCE(SUM(COALESCE(total_amount,0)),0)
    INTO _prev_month_sales
    FROM public.invoices
    WHERE created_by=_employee_id
      AND created_at>=_prev_month_start AND created_at<_prev_month_end;
  IF _prev_month_sales > 0 THEN
    _growth := ((_sales_m - _prev_month_sales)/_prev_month_sales)*100;
  END IF;

  -- New customers (this month) — uses responsible_id since customers has no created_by
  SELECT COALESCE(COUNT(*),0) INTO _new_cust_m
    FROM public.customers
    WHERE responsible_id=_employee_id
      AND created_at >= _month_start;

  -- Active work time (composite)
  _active_minutes := GREATEST(_talk_m + (_deals_m * 3) + (_sales_count_m * 2), 1);

  -- Iterate KPIs
  FOR _kpi IN SELECT key, weight FROM public.gamification_kpis WHERE enabled=true LOOP
    _is_log_scale := _kpi.key IN ('total_sales','cumulative_sales');
    _period := 'monthly';

    CASE _kpi.key
      WHEN 'inbound_calls'         THEN _value:=_inbound_m;  _value_d:=_inbound_d;  _value_w:=_inbound_w;  _value_t:=_inbound_t;
      WHEN 'outbound_calls'        THEN _value:=_outbound_m; _value_d:=_outbound_d; _value_w:=_outbound_w; _value_t:=_outbound_t;
      WHEN 'talk_minutes'          THEN _value:=_talk_m;     _value_d:=_talk_d;     _value_w:=_talk_w;     _value_t:=_talk_t;
      WHEN 'total_sales'           THEN _value:=_sales_m;    _value_d:=_sales_d;    _value_w:=_sales_w;    _value_t:=_sales_t;
      WHEN 'new_customers'         THEN _value:=_new_cust_m; _value_d:=0;           _value_w:=0;           _value_t:=_new_cust_m;
      WHEN 'active_work_hours'     THEN _value:=_active_minutes/60.0; _value_d:=0; _value_w:=0; _value_t:=_value;
      WHEN 'deals_registered'      THEN _value:=_deals_m;    _value_d:=_deals_d;    _value_w:=_deals_w;    _value_t:=_deals_t;
      WHEN 'sales_per_talk_minute' THEN _value := CASE WHEN _talk_m>0 THEN _sales_m/_talk_m ELSE 0 END;
                                        _value_d := CASE WHEN _talk_d>0 THEN _sales_d/_talk_d ELSE 0 END;
                                        _value_w := CASE WHEN _talk_w>0 THEN _sales_w/_talk_w ELSE 0 END;
                                        _value_t := CASE WHEN _talk_t>0 THEN _sales_t/_talk_t ELSE 0 END;
      WHEN 'growth_vs_last_month'  THEN _value:=_growth; _value_d:=0; _value_w:=0; _value_t:=_growth;
      WHEN 'cumulative_sales'      THEN _value:=_sales_t; _value_d:=_sales_d; _value_w:=_sales_w; _value_t:=_sales_t; _period:='total';
      ELSE _value:=0; _value_d:=0; _value_w:=0; _value_t:=0;
    END CASE;

    -- Scaling
    IF _is_log_scale THEN
      _scaled   := ln(GREATEST(_value,0)   + 1);
      _scaled_d := ln(GREATEST(_value_d,0) + 1);
      _scaled_w := ln(GREATEST(_value_w,0) + 1);
      _scaled_t := ln(GREATEST(_value_t,0) + 1);
    ELSE
      _scaled   := _value;
      _scaled_d := _value_d;
      _scaled_w := _value_w;
      _scaled_t := _value_t;
    END IF;

    _daily   := _daily   + (_scaled_d * _kpi.weight);
    _weekly  := _weekly  + (_scaled_w * _kpi.weight);
    _monthly := _monthly + (_scaled   * _kpi.weight);
    _total   := _total   + (_scaled_t * _kpi.weight);

    _breakdown := _breakdown || jsonb_build_object(_kpi.key, jsonb_build_object(
      'value',        _value,
      'weight',       _kpi.weight,
      'contribution', _scaled * _kpi.weight,
      'period',       _period,
      'scaled',       _is_log_scale
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
    'employee_id',       _employee_id,
    'daily_score',       _daily,
    'weekly_score',      _weekly,
    'monthly_score',     _monthly,
    'total_score',       _total,
    'normalized_score',  _normalized,
    'breakdown',         _breakdown
  );
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_employee_score(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.calculate_employee_score(uuid) TO authenticated;

-- 3) Trigger on call_logs
CREATE OR REPLACE FUNCTION public.recompute_employee_scores_on_call_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _emp uuid;
BEGIN
  IF TG_OP='DELETE' THEN _emp := OLD.employee_id; ELSE _emp := NEW.employee_id; END IF;
  IF _emp IS NOT NULL THEN
    BEGIN
      PERFORM public.calculate_employee_score(_emp);
      INSERT INTO public.employee_score_events(employee_id, event_type, source_table, source_id, payload)
      VALUES (_emp, 'call_'||lower(TG_OP), 'call_logs',
              COALESCE(NEW.id::text, OLD.id::text),
              jsonb_build_object('op', TG_OP));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_call_logs_recompute_employee_score ON public.call_logs;
CREATE TRIGGER trg_call_logs_recompute_employee_score
  AFTER INSERT OR UPDATE OR DELETE ON public.call_logs
  FOR EACH ROW EXECUTE FUNCTION public.recompute_employee_scores_on_call_log();

-- 4) Bulk recompute helper (used by cron)
CREATE OR REPLACE FUNCTION public.recompute_all_employee_scores()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _emp uuid;
  _count int := 0;
BEGIN
  FOR _emp IN
    SELECT DISTINCT employee_id FROM (
      SELECT created_by AS employee_id FROM public.invoices WHERE created_by IS NOT NULL
      UNION
      SELECT employee_id FROM public.call_logs WHERE employee_id IS NOT NULL
      UNION
      SELECT employee_id FROM public.employee_scores
    ) src
  LOOP
    BEGIN
      PERFORM public.calculate_employee_score(_emp);
      _count := _count + 1;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
  RETURN _count;
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_all_employee_scores() FROM public;
GRANT EXECUTE ON FUNCTION public.recompute_all_employee_scores() TO authenticated;

-- 5) Cron job — every 5 minutes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('recompute-employee-scores-5min')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='recompute-employee-scores-5min');
    PERFORM cron.schedule(
      'recompute-employee-scores-5min',
      '*/5 * * * *',
      $cron$ SELECT public.recompute_all_employee_scores(); $cron$
    );
  END IF;
END $$;
