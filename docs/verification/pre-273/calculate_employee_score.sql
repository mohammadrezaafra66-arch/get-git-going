Pager usage is off.
Output format is unaligned.
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

  _profit_d numeric := 0; _profit_w numeric := 0; _profit_m numeric := 0; _profit_t numeric := 0;

  _new_cust_m int := 0;
  _deals_d int := 0; _deals_w int := 0; _deals_m int := 0; _deals_t int := 0;

  -- Item 167/168 — marketing promotions counted from employee_score_events.
  _promo_d int := 0; _promo_w int := 0; _promo_m int := 0; _promo_t int := 0;

  _prev_month_sales numeric;
  _growth numeric := 0;

  _is_log_scale boolean;

  _collected_amount numeric := 0;
  _issued_sales_for_blend numeric;
  _blended_sales_m numeric;
  _window_months int := 6;

  _is_sales boolean;
  _sales_source text;
BEGIN
  _is_sales := public.has_role(_employee_id, 'sales'::public.app_role);

  -- Sales-source switch (default 'manual'); only sales AMOUNT is switched.
  _sales_source := COALESCE(
    (SELECT NULLIF(value,'') FROM public.shop_settings WHERE key='gamification_sales_source'),
    'manual');

  -- Calls / talk-minutes ALWAYS come from staff_daily_performance_metrics
  -- (call_logs has no data and no automatic source exists). talk_time_minutes
  -- is already in minutes. Applies to everyone.
  SELECT COALESCE(SUM(inbound_calls_count),0), COALESCE(SUM(outbound_calls_count),0),
         COALESCE(SUM(talk_time_minutes),0)
    INTO _inbound_d,_outbound_d,_talk_d
    FROM public.staff_daily_performance_metrics
   WHERE staff_user_id=_employee_id AND metric_date>=_day_start::date;

  SELECT COALESCE(SUM(inbound_calls_count),0), COALESCE(SUM(outbound_calls_count),0),
         COALESCE(SUM(talk_time_minutes),0)
    INTO _inbound_w,_outbound_w,_talk_w
    FROM public.staff_daily_performance_metrics
   WHERE staff_user_id=_employee_id AND metric_date>=_week_start::date;

  SELECT COALESCE(SUM(inbound_calls_count),0), COALESCE(SUM(outbound_calls_count),0),
         COALESCE(SUM(talk_time_minutes),0)
    INTO _inbound_m,_outbound_m,_talk_m
    FROM public.staff_daily_performance_metrics
   WHERE staff_user_id=_employee_id AND metric_date>=_month_start::date;

  SELECT COALESCE(SUM(inbound_calls_count),0), COALESCE(SUM(outbound_calls_count),0),
         COALESCE(SUM(talk_time_minutes),0)
    INTO _inbound_t,_outbound_t,_talk_t
    FROM public.staff_daily_performance_metrics
   WHERE staff_user_id=_employee_id;

  -- Sales-derived KPIs only for users with 'sales' role
  IF _is_sales THEN
    IF _sales_source = 'auto' THEN
      -- Finalized quotes = accepted sales_quotes, linked via salesperson_id,
      -- dated by created_at, amount = final_amount.
      SELECT
        COALESCE(SUM(CASE WHEN created_at>=_day_start   THEN COALESCE(final_amount,0) ELSE 0 END),0),
        COALESCE(SUM(CASE WHEN created_at>=_week_start  THEN COALESCE(final_amount,0) ELSE 0 END),0),
        COALESCE(SUM(CASE WHEN created_at>=_month_start THEN COALESCE(final_amount,0) ELSE 0 END),0),
        COALESCE(SUM(COALESCE(final_amount,0)),0),
        COALESCE(SUM(CASE WHEN created_at>=_day_start   THEN 1 ELSE 0 END),0),
        COALESCE(SUM(CASE WHEN created_at>=_week_start  THEN 1 ELSE 0 END),0),
        COALESCE(SUM(CASE WHEN created_at>=_month_start THEN 1 ELSE 0 END),0),
        COUNT(*)
        INTO _sales_d,_sales_w,_sales_m,_sales_t,
             _sales_count_d,_sales_count_w,_sales_count_m,_sales_count_t
        FROM public.sales_quotes
       WHERE salesperson_id=_employee_id AND status='accepted';

      SELECT COALESCE(SUM(COALESCE(final_amount,0)),0)
        INTO _prev_month_sales
        FROM public.sales_quotes
        WHERE salesperson_id=_employee_id AND status='accepted'
          AND created_at>=_prev_month_start AND created_at<_prev_month_end;
    ELSE
      -- Manual mode: sales amount from staff_daily_performance_metrics.
      -- Deal counts have no manual source, so they stay 0 in manual mode.
      SELECT
        COALESCE(SUM(CASE WHEN metric_date>=_day_start::date   THEN sales_amount ELSE 0 END),0),
        COALESCE(SUM(CASE WHEN metric_date>=_week_start::date  THEN sales_amount ELSE 0 END),0),
        COALESCE(SUM(CASE WHEN metric_date>=_month_start::date THEN sales_amount ELSE 0 END),0),
        COALESCE(SUM(sales_amount),0)
        INTO _sales_d,_sales_w,_sales_m,_sales_t
        FROM public.staff_daily_performance_metrics
       WHERE staff_user_id=_employee_id;
      _sales_count_d:=0; _sales_count_w:=0; _sales_count_m:=0; _sales_count_t:=0;

      SELECT COALESCE(SUM(sales_amount),0)
        INTO _prev_month_sales
        FROM public.staff_daily_performance_metrics
        WHERE staff_user_id=_employee_id
          AND metric_date>=_prev_month_start::date AND metric_date<_prev_month_end::date;
    END IF;

    _deals_d := _sales_count_d;
    _deals_w := _sales_count_w;
    _deals_m := _sales_count_m;
    _deals_t := _sales_count_t;

    IF _prev_month_sales > 0 THEN
      _growth := ((_sales_m - _prev_month_sales)/_prev_month_sales)*100;
    END IF;

    -- Profit is ALWAYS manual: sales_quote_items store no cost, so profit is not
    -- derivable from quotes. Source = staff_daily_performance_metrics.profit_amount.
    SELECT
      COALESCE(SUM(CASE WHEN metric_date>=_day_start::date   THEN profit_amount ELSE 0 END),0),
      COALESCE(SUM(CASE WHEN metric_date>=_week_start::date  THEN profit_amount ELSE 0 END),0),
      COALESCE(SUM(CASE WHEN metric_date>=_month_start::date THEN profit_amount ELSE 0 END),0),
      COALESCE(SUM(profit_amount),0)
      INTO _profit_d,_profit_w,_profit_m,_profit_t
      FROM public.staff_daily_performance_metrics
     WHERE staff_user_id=_employee_id;

    -- Collected: approved receipt allocations against THIS salesperson's
    -- accepted quotes, within the window, capped per quote at final_amount so
    -- over-allocation cannot inflate it. The 0.8/0.2 blend below is preserved.
    SELECT COALESCE(SUM(capped), 0) INTO _collected_amount
    FROM (
      SELECT LEAST(q.final_amount, SUM(prl.amount)) AS capped
      FROM public.sales_quotes q
      JOIN public.payment_receipt_links prl ON prl.quote_id = q.id
      JOIN public.payment_receipts pr ON pr.id = prl.receipt_id
      WHERE q.salesperson_id = _employee_id
        AND q.status = 'accepted'
        AND pr.status = 'approved'
        AND pr.payment_date >= (_now - (_window_months || ' months')::interval)::date
      GROUP BY q.id, q.final_amount
    ) per_quote;
  ELSE
    _sales_d := 0; _sales_w := 0; _sales_m := 0; _sales_t := 0;
    _sales_count_d := 0; _sales_count_w := 0; _sales_count_m := 0; _sales_count_t := 0;
    _profit_d := 0; _profit_w := 0; _profit_m := 0; _profit_t := 0;
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

  -- Item 167/168 — promotion events (suggestion used + product nomination).
  -- Written by trg_promotion_used_score_event / trg_promotion_nomination_score_event.
  SELECT
    COUNT(*) FILTER (WHERE e.triggered_at >= _day_start),
    COUNT(*) FILTER (WHERE e.triggered_at >= _week_start),
    COUNT(*) FILTER (WHERE e.triggered_at >= _month_start),
    COUNT(*)
  INTO _promo_d, _promo_w, _promo_m, _promo_t
  FROM public.employee_score_events e
  WHERE e.employee_id = _employee_id
    AND e.event_type = 'promotion_completed';

  FOR _kpi IN SELECT key, weight FROM public.gamification_kpis WHERE enabled=true LOOP
    _is_log_scale := _kpi.key IN ('total_sales','cumulative_sales');
    _period := 'monthly';

    CASE _kpi.key
      WHEN 'inbound_calls'         THEN _value:=_inbound_m;  _value_d:=_inbound_d;  _value_w:=_inbound_w;  _value_t:=_inbound_t;
      WHEN 'outbound_calls'        THEN _value:=_outbound_m; _value_d:=_outbound_d; _value_w:=_outbound_w; _value_t:=_outbound_t;
      WHEN 'talk_minutes'          THEN _value:=_talk_m;     _value_d:=_talk_d;     _value_w:=_talk_w;     _value_t:=_talk_t;
      WHEN 'total_sales'           THEN _value:=_blended_sales_m; _value_d:=_sales_d; _value_w:=_sales_w; _value_t:=_sales_t;
      WHEN 'total_profit'          THEN _value:=_profit_m;   _value_d:=_profit_d;   _value_w:=_profit_w;   _value_t:=_profit_t;
      WHEN 'new_customers'         THEN _value:=_new_cust_m; _value_d:=0;           _value_w:=0;           _value_t:=_new_cust_m;
      WHEN 'active_work_hours'     THEN _value:=_active_minutes/60.0; _value_d:=0; _value_w:=0; _value_t:=_value;
      WHEN 'deals_registered'      THEN _value:=_deals_m;    _value_d:=_deals_d;    _value_w:=_deals_w;    _value_t:=_deals_t;
      WHEN 'sales_per_talk_minute' THEN _value := CASE WHEN _talk_m>0 THEN _sales_m/_talk_m ELSE 0 END;
                                        _value_d := CASE WHEN _talk_d>0 THEN _sales_d/_talk_d ELSE 0 END;
                                        _value_w := CASE WHEN _talk_w>0 THEN _sales_w/_talk_w ELSE 0 END;
                                        _value_t := CASE WHEN _talk_t>0 THEN _sales_t/_talk_t ELSE 0 END;
      WHEN 'profit_per_talk_minute' THEN _value := CASE WHEN _talk_m>0 THEN _profit_m/_talk_m ELSE 0 END;
                                        _value_d := CASE WHEN _talk_d>0 THEN _profit_d/_talk_d ELSE 0 END;
                                        _value_w := CASE WHEN _talk_w>0 THEN _profit_w/_talk_w ELSE 0 END;
                                        _value_t := CASE WHEN _talk_t>0 THEN _profit_t/_talk_t ELSE 0 END;
      WHEN 'growth_vs_last_month'  THEN _value:=_growth; _value_d:=0; _value_w:=0; _value_t:=_growth;
      WHEN 'promotions_completed'  THEN _value:=_promo_m;   _value_d:=_promo_d;    _value_w:=_promo_w;    _value_t:=_promo_t;
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
    'sales_source',           _sales_source,
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
$function$

