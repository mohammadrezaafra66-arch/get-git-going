-- Phase 21.6D.1: gate sales-derived KPIs to users with 'sales' role only.
-- Non-sales users (admin/manager/accountant/viewer) still get call/customer/active KPIs but
-- not sales/collected/issued credit. Minimal change: zero-out _sales_*, _collected_amount,
-- _growth, _deals_* when user lacks sales role. Function shape, signature, security unchanged.
CREATE OR REPLACE FUNCTION public.calculate_employee_score(_employee_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  _collected_amount numeric := 0;
  _issued_sales_for_blend numeric;
  _blended_sales_m numeric;
  _window_months int := 6;

  _is_sales boolean;
BEGIN
  _is_sales := public.has_role(_employee_id, 'sales'::public.app_role);

  -- Calls (apply to everyone)
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

  -- Sales-derived KPIs only for users with 'sales' role
  IF _is_sales THEN
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

    _deals_d := _sales_count_d;
    _deals_w := _sales_count_w;
    _deals_m := _sales_count_m;
    _deals_t := _sales_count_t;

    SELECT COALESCE(SUM(COALESCE(total_amount,0)),0)
      INTO _prev_month_sales
      FROM public.invoices
      WHERE created_by=_employee_id
        AND created_at>=_prev_month_start AND created_at<_prev_month_end;
    IF _prev_month_sales > 0 THEN
      _growth := ((_sales_m - _prev_month_sales)/_prev_month_sales)*100;
    END IF;

    SELECT COALESCE(SUM(capped),0) INTO _collected_amount
    FROM (
      SELECT LEAST(COALESCE(i.total_amount,0), COALESCE(SUM(prl.amount),0)) AS capped
      FROM public.invoices i
      JOIN public.payment_receipt_links prl ON prl.invoice_id = i.id
      JOIN public.payment_receipts pr       ON pr.id = prl.receipt_id
      WHERE i.created_by = _employee_id
        AND COALESCE(i.status,'') NOT IN ('draft','cancelled')
        AND pr.status IN ('approved','verified','confirmed','posted')
        AND pr.payment_date >= (_now - (_window_months || ' months')::interval)::date
      GROUP BY i.id, i.total_amount
    ) per_invoice;
  ELSE
    _sales_d := 0; _sales_w := 0; _sales_m := 0; _sales_t := 0;
    _sales_count_d := 0; _sales_count_w := 0; _sales_count_m := 0; _sales_count_t := 0;
    _deals_d := 0; _deals_w := 0; _deals_m := 0; _deals_t := 0;
    _prev_month_sales := 0; _growth := 0;
    _collected_amount := 0;
  END IF;

  -- new_customers KPI: only for sales role (responsibility-based, sales-context)
  IF _is_sales THEN
    SELECT COALESCE(COUNT(*),0) INTO _new_cust_m
      FROM public.customers
      WHERE responsible_id=_employee_id
        AND created_at >= _month_start;
  ELSE
    _new_cust_m := 0;
  END IF;

  _issued_sales_for_blend := _sales_m;
  _blended_sales_m := (0.8 * _collected_amount) + (0.2 * _issued_sales_for_blend);

  _active_minutes := GREATEST(_talk_m + (_deals_m * 3) + (_sales_count_m * 2), 1);

  FOR _kpi IN SELECT key, weight FROM public.gamification_kpis WHERE enabled=true LOOP
    _is_log_scale := _kpi.key IN ('total_sales','cumulative_sales');
    _period := 'monthly';

    CASE _kpi.key
      WHEN 'inbound_calls'         THEN _value:=_inbound_m;  _value_d:=_inbound_d;  _value_w:=_inbound_w;  _value_t:=_inbound_t;
      WHEN 'outbound_calls'        THEN _value:=_outbound_m; _value_d:=_outbound_d; _value_w:=_outbound_w; _value_t:=_outbound_t;
      WHEN 'talk_minutes'          THEN _value:=_talk_m;     _value_d:=_talk_d;     _value_w:=_talk_w;     _value_t:=_talk_t;
      WHEN 'total_sales'           THEN _value:=_blended_sales_m; _value_d:=_sales_d; _value_w:=_sales_w; _value_t:=_sales_t;
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

  _breakdown := _breakdown || jsonb_build_object(
    'is_sales',               _is_sales,
    'collected_sales_amount', _collected_amount,
    'issued_sales_amount',    _issued_sales_for_blend,
    'collected_sales_score',  0.8 * _collected_amount,
    'issued_sales_score',     0.2 * _issued_sales_for_blend,
    'sales_score_source',     '80_collected_20_issued',
    'window_months',          _window_months
  );

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
$function$;

REVOKE EXECUTE ON FUNCTION public.calculate_employee_score(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_employee_score(uuid) TO authenticated;

COMMENT ON FUNCTION public.calculate_employee_score(uuid) IS
'Phase 21.6D.1: sales-derived KPIs (issued sales, collected sales, deals_registered, growth, new_customers, sales_per_talk_minute) only count for users with sales role. Non-sales users still receive call and active-work KPIs. Phase 21.6C 80/20 blend retained.';