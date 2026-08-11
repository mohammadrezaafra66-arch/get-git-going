-- =====================================================================
-- 146 - Gamification sales-source switch + read finalized quotes
-- =====================================================================
--
-- WHY THIS MIGRATION EXISTS
--
-- This business issues no formal invoices; public.invoices is empty and unused.
-- Sales run through public.sales_quotes, and an 'accepted' quote is the
-- finalized sale. calculate_employee_score read public.invoices three times, so
-- every sales KPI was always 0. call_logs is also empty, so call/talk KPIs were
-- always 0 too.
--
-- This migration:
--   1) adds a persisted setting `gamification_sales_source` ('auto'|'manual',
--      default 'manual') in the existing shop_settings KV table;
--   2) adds an audited, role-guarded RPC to change it (admin/accountant only);
--   3) rewrites calculate_employee_score's SOURCE reads only, preserving the
--      KPI CASE semantics:
--        - calls/talk always read staff_daily_performance_metrics (no auto src);
--        - sales amount switches: 'auto' = accepted sales_quotes.final_amount,
--          'manual' = staff_daily_performance_metrics.sales_amount;
--        - profit is ALWAYS manual (see below);
--   4) adds the missing CASE branches for total_profit and
--      profit_per_talk_minute so they score correctly when enabled.
--
-- PROFIT IS NOT AUTOMATABLE (STEP 1 verdict = B): sales_quote_items stores
-- unit_price/discount_amount/line_total but NO per-line cost or purchase price,
-- and joining to current purchase prices would falsify historical profit.
-- Profit therefore comes from manual entry in BOTH modes.
--
-- COLLECTED-AMOUNT NOTE: the old function blended 80% receipt-collected + 20%
-- issued. payment_receipt_links links receipts to invoices only (no quote link)
-- and payment_receipts has 0 rows, so there is no way to source "collected" from
-- quotes. Collected is set to 0 (its actual value today); the 0.8/0.2 blend
-- formula is preserved unchanged, so _blended_sales_m = 0.2 * issued exactly as
-- it already resolved.
--
-- DEFAULT is 'manual' on purpose: only 1 accepted quote exists, so 'auto' would
-- score nearly everyone 0 today.
--
-- ---------------------------------------------------------------------
-- ROLLBACK
--
--   1) Restore the previous function body (reads call_logs x4 + invoices x3,
--      no profit branches). The pre-change definition is the one live
--      immediately before this migration - recover it from git history of this
--      file's sibling migrations or from a pg_get_functiondef snapshot.
--   2) Remove the setting and RPC:
--        DROP FUNCTION IF EXISTS public.set_gamification_sales_source(text);
--        DELETE FROM public.shop_settings WHERE key = 'gamification_sales_source';
--
-- Manual metric data is never modified by this migration.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Persisted setting in the existing shop_settings KV table.
--    (Chosen because shop_settings is the project's generic key/value config
--     store: columns key/value/updated_at/updated_by, already holding 24 keys.)
-- ---------------------------------------------------------------------
INSERT INTO public.shop_settings (key, value)
VALUES ('gamification_sales_source', 'manual')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2) Audited, role-guarded setter. This is the sanctioned write path; it
--    enforces admin/accountant itself (SECURITY DEFINER) and records the change
--    to audit_logs. Direct-table RLS is left unchanged so the RPC stays the one
--    place the rule and the audit live.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_gamification_sales_source(_mode text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_old text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'accountant')) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF _mode NOT IN ('auto','manual') THEN
    RAISE EXCEPTION 'INVALID_MODE';
  END IF;

  SELECT value INTO v_old FROM public.shop_settings WHERE key='gamification_sales_source';

  INSERT INTO public.shop_settings (key, value, updated_by, updated_at)
  VALUES ('gamification_sales_source', _mode, v_uid, now())
  ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=now();

  IF v_old IS DISTINCT FROM _mode THEN
    INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
    VALUES (v_uid, 'shop_settings', 'gamification_sales_source', 'setting_changed',
            jsonb_build_object('key','gamification_sales_source','before',v_old,'after',_mode));
  END IF;

  RETURN _mode;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_gamification_sales_source(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_gamification_sales_source(text) TO authenticated;

-- ---------------------------------------------------------------------
-- 3) calculate_employee_score: source reads changed, KPI CASE preserved.
--    Body copied verbatim from the live definition; edits are limited to the
--    pre-computation blocks (calls, sales, profit) and two new CASE branches.
-- ---------------------------------------------------------------------
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

    -- Collected amount cannot be sourced from quotes (no quote->receipt link;
    -- payment_receipts is empty). It is 0; the 0.8/0.2 blend below is preserved.
    _collected_amount := 0;
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
$function$;

COMMIT;
