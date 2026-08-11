SET client_encoding='UTF8';

-- =============================================================================
-- 273 — D8-5: manual scores carry a manager-chosen duration, and the manager
--             sees the effect before confirming.
--
-- WHY THIS MIGRATION EXISTS
-- -------------------------
-- Before this migration `recordManualScoreAdjustment` wrote a row into
-- employee_score_events with event_type='manual_adjustment', showed the manager
-- «امتیاز دستی ثبت و امتیاز کارمند به‌روز شد», and then called
-- calculate_employee_score(). But calculate_employee_score NEVER READ
-- manual_adjustment events — its only event_type reference was
-- 'promotion_completed' (of which there are 0 rows). So the number never moved.
-- Measured before this change:
--     employee_score_events where event_type='manual_adjustment'  -> 1 row
--     calculate_employee_score body contains 'manual_adjustment'  -> false
-- D8-5's HARD GATE ("the preview number must equal the post-submit score
-- exactly") is unsatisfiable on that base: the only preview that could pass is
-- one that always reports "no change". So the base is wired up FIRST, here.
--
-- WHAT CHANGES
-- ------------
-- 1. Manual entries gain `effect_months` (per entry, 1..60 — no global rule).
-- 2. Decay shape: LINEAR, and it is the ONLY shape. The entry lands at full
--    weight in the month it is recorded and falls linearly to zero by the end
--    of the chosen duration:
--        factor(m) = (effect_months - m) / effect_months   for 0 <= m < effect_months
--        factor(m) = 0                                     otherwise
--    where m = whole calendar months elapsed since the recording month.
--    With effect_months = 1 this is exactly "full effect in the recording
--    month, nothing afterwards" — which is why 1 is the migration default for
--    pre-existing rows (see below).
--    Named in the UI in Persian as «کاهش خطی».
-- 3. The score computation is split so the preview CANNOT drift from reality:
--        compute_employee_score(uuid, jsonb)  -- pure, no writes, the real maths
--        calculate_employee_score(uuid)       -- compute + persist  (signature UNCHANGED)
--        preview_manual_score_adjustment(...) -- compute with a hypothetical entry
--    The preview does not re-implement anything; it calls the same function
--    that produces the stored score, with one extra hypothetical entry. That is
--    what makes the HARD GATE meaningful rather than a coincidence.
-- 4. award_xp_from_score gains a RATCHET on last_score_converted (see below).
--
-- EXISTING ROWS — measured, not assumed
-- -------------------------------------
-- Exactly 1 manual_adjustment row exists:
--     employee 97eb29a9-4113-4cc9-a421-946735465183 (profiles.full_name = '1')
--     amount +1235, recorded 2026-07-18.
-- It is backfilled with effect_months = 1. Because it was recorded in
-- 2026-07 and we are now in 2026-08, m = 1 >= effect_months = 1, so its factor
-- is 0 and IT CHANGES NO LIVE SCORE. That is deliberate: the mission rule is
-- "do not silently change anyone's current score". Had the default been larger,
-- this employee's monthly score would have jumped 0.033 -> ~1235 and their XP
-- 0 -> 12; it does not.
--
-- WHY award_xp_from_score NEEDED A ONE-LINE FIX
-- ---------------------------------------------
-- award_xp_from_score converts score into XP via
--     delta := GREATEST(total_score - last_score_converted, 0)
-- and then unconditionally sets last_score_converted := total_score.
-- XP only ever goes up. Before this migration total_score effectively only went
-- up too, so that was fine. A negative manual adjustment makes total_score fall
-- and then rise again when the effect expires — and the old code would award XP
-- a SECOND time for the same score on the way back up (penalise -500, converted
-- drops to 500; effect expires, total returns to 1000, delta 500, +5 XP for
-- points already paid for). That is an XP farm opened by this phase, so it is
-- closed in the same migration: last_score_converted now only ratchets UPWARD.
-- For every existing employee (all monotonically increasing) the behaviour is
-- byte-identical.
--
-- SCOPE NOTES
-- -----------
-- - No new table. `employee_score_events.payload` is where per-event-type data
--   already lives (amount / reason / adjusted_by); effect_months joins it
--   rather than becoming a column that only one event_type would ever use.
--   (rule 14 — do not build a parallel structure next to a working one)
-- - No employee_* table is restructured. No FK moves.
-- - calculate_employee_score keeps its exact signature (uuid -> jsonb), so none
--   of its 8 in-database callers or the frontend RPC wrapper change.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Backfill existing manual entries BEFORE the constraint that requires the key
-- -----------------------------------------------------------------------------
UPDATE public.employee_score_events
   SET payload = payload
              || jsonb_build_object('effect_months', 1)
              || jsonb_build_object('effect_months_migrated', true)
 WHERE event_type = 'manual_adjustment'
   AND NOT (payload ? 'effect_months');


-- -----------------------------------------------------------------------------
-- 2. Constraint: a manual entry must carry a numeric amount and a 1..60 duration
--    Deliberately expressed with jsonb comparisons and no casts, so no
--    evaluation order can raise a cast error on a malformed payload.
--
--    ⚠️ EVERY branch is wrapped in COALESCE(..., false) and event_type uses
--    IS DISTINCT FROM. This is not defensive noise — the first version of this
--    constraint used bare `=` and `<>` and the dry-run gate proved it ACCEPTED a
--    manual_adjustment payload with no effect_months at all. When the key is
--    absent, payload->'effect_months' is SQL NULL, jsonb_typeof(NULL) is NULL,
--    and the whole expression evaluates to NULL — and PostgreSQL only rejects a
--    CHECK that is FALSE, never one that is NULL. Out-of-range values (0, 61)
--    were rejected correctly the whole time, which is exactly what made the hole
--    look closed. Do not "simplify" this back.
-- -----------------------------------------------------------------------------
ALTER TABLE public.employee_score_events
  DROP CONSTRAINT IF EXISTS chk_manual_adjustment_payload;

ALTER TABLE public.employee_score_events
  ADD CONSTRAINT chk_manual_adjustment_payload CHECK (
    event_type IS DISTINCT FROM 'manual_adjustment'
    OR (
      COALESCE(jsonb_typeof(payload->'amount') = 'number', false)
      AND COALESCE(jsonb_typeof(payload->'effect_months') = 'number', false)
      AND COALESCE(payload->'effect_months' >= '1'::jsonb, false)
      AND COALESCE(payload->'effect_months' <= '60'::jsonb, false)
    )
  );


-- -----------------------------------------------------------------------------
-- 3. The decay shape, as ONE function so preview and reality cannot diverge
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.manual_score_decay_factor(
  _months_elapsed integer,
  _effect_months  integer
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  -- Linear decay: full weight in the recording month, zero at the end of the
  -- chosen duration. effect_months = 1 -> recording month only.
  SELECT CASE
    WHEN _effect_months IS NULL OR _effect_months < 1 THEN 0::numeric
    WHEN _months_elapsed IS NULL OR _months_elapsed < 0 THEN 0::numeric
    WHEN _months_elapsed >= _effect_months THEN 0::numeric
    ELSE (_effect_months - _months_elapsed)::numeric / _effect_months::numeric
  END;
$function$;

COMMENT ON FUNCTION public.manual_score_decay_factor(integer, integer) IS
  'D8-5 (273): linear decay of a manual score entry. The single source of truth '
  'for the shape — calculate_employee_score and preview_manual_score_adjustment '
  'both go through it, so a preview cannot disagree with the real score.';


-- Whole calendar months between the month of _from and the month of _to.
CREATE OR REPLACE FUNCTION public.manual_score_months_elapsed(
  _from timestamptz,
  _to   timestamptz
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT (
    (date_part('year', _to) - date_part('year', _from)) * 12
    + (date_part('month', _to) - date_part('month', _from))
  )::integer;
$function$;


-- -----------------------------------------------------------------------------
-- 4. The manual effect in force for an employee at a point in time,
--    plus the per-entry detail used by the score breakdown.
--    _extra is an optional hypothetical entry {"amount":n,"effect_months":n}
--    treated as if recorded at _ref — this is how the preview works.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.employee_manual_score_detail(
  _employee_id uuid,
  _ref         timestamptz DEFAULT now(),
  _extra       jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH entries AS (
    SELECT
      e.id::text                                   AS event_id,
      (e.payload->>'amount')::numeric              AS amount,
      COALESCE((e.payload->>'effect_months')::int, 1) AS effect_months,
      e.triggered_at,
      public.manual_score_months_elapsed(e.triggered_at, _ref) AS months_elapsed,
      COALESCE(e.payload->>'reason', '')           AS reason,
      COALESCE((e.payload->>'effect_months_migrated')::boolean, false) AS migrated
    FROM public.employee_score_events e
    WHERE e.employee_id = _employee_id
      AND e.event_type  = 'manual_adjustment'
      AND jsonb_typeof(e.payload->'amount') = 'number'
    UNION ALL
    SELECT
      'hypothetical',
      (_extra->>'amount')::numeric,
      COALESCE((_extra->>'effect_months')::int, 1),
      _ref,
      0,
      COALESCE(_extra->>'reason', ''),
      false
    WHERE _extra IS NOT NULL
      AND jsonb_typeof(_extra->'amount') = 'number'
  ), scored AS (
    SELECT
      entries.*,
      public.manual_score_decay_factor(months_elapsed, effect_months) AS factor
    FROM entries
  )
  SELECT jsonb_build_object(
    'total_effect', COALESCE((SELECT SUM(amount * factor) FROM scored), 0),
    'entry_count',  (SELECT COUNT(*) FROM scored),
    'active_count', (SELECT COUNT(*) FROM scored WHERE factor > 0),
    'entries', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'event_id',         event_id,
        'amount',           amount,
        'effect_months',    effect_months,
        'months_elapsed',   months_elapsed,
        'months_remaining', GREATEST(effect_months - months_elapsed, 0),
        'factor',           factor,
        'effective_amount', amount * factor,
        'triggered_at',     triggered_at,
        'reason',           reason,
        'migrated',         migrated
      ) ORDER BY triggered_at DESC)
      FROM scored
    ), '[]'::jsonb)
  );
$function$;

COMMENT ON FUNCTION public.employee_manual_score_detail(uuid, timestamptz, jsonb) IS
  'D8-5 (273): the manual-score effect in force at _ref, entry by entry. _extra '
  'injects a hypothetical entry recorded at _ref, which is how the pre-submit '
  'preview is computed from the real maths instead of a second formula.';


-- -----------------------------------------------------------------------------
-- 5. compute_employee_score — the whole computation, WITHOUT persisting.
--    Body is calculate_employee_score's live definition (snapshot:
--    docs/verification/pre-273/calculate_employee_score.sql) with the INSERT
--    removed and the manual-adjustment block added. Nothing else changed.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_employee_score(
  _employee_id   uuid,
  _extra_manual  jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
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

  -- D8-5 (273)
  _manual_detail jsonb;
  _manual_effect numeric := 0;
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

    SELECT
      COALESCE(SUM(CASE WHEN metric_date>=_day_start::date   THEN profit_amount ELSE 0 END),0),
      COALESCE(SUM(CASE WHEN metric_date>=_week_start::date  THEN profit_amount ELSE 0 END),0),
      COALESCE(SUM(CASE WHEN metric_date>=_month_start::date THEN profit_amount ELSE 0 END),0),
      COALESCE(SUM(profit_amount),0)
      INTO _profit_d,_profit_w,_profit_m,_profit_t
      FROM public.staff_daily_performance_metrics
     WHERE staff_user_id=_employee_id;

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

  -- ===========================================================================
  -- D8-5 (273) — manual adjustments, decayed by their per-entry effect_months.
  -- Applied to ALL FOUR periods so that no displayed score disagrees with
  -- another: a manager who penalises someone must not see the monthly score
  -- fall while the all-time score and the leaderboard stay put.
  -- ===========================================================================
  _manual_detail := public.employee_manual_score_detail(_employee_id, _now, _extra_manual);
  _manual_effect := COALESCE((_manual_detail->>'total_effect')::numeric, 0);

  _daily   := _daily   + _manual_effect;
  _weekly  := _weekly  + _manual_effect;
  _monthly := _monthly + _manual_effect;
  _total   := _total   + _manual_effect;

  _breakdown := _breakdown || jsonb_build_object(
    'manual_adjustment', jsonb_build_object(
      'value',        _manual_effect,
      'weight',       1,
      'contribution', _manual_effect,
      'period',       'monthly',
      'scaled',       false,
      'decay_shape',  'linear',
      'entries',      _manual_detail->'entries',
      'entry_count',  _manual_detail->'entry_count',
      'active_count', _manual_detail->'active_count'
    )
  );

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

  RETURN jsonb_build_object(
    'employee_id',        _employee_id,
    'daily_score',        _daily,
    'weekly_score',       _weekly,
    'monthly_score',      _monthly,
    'total_score',        _total,
    'normalized_score',   _normalized,
    'active_work_minutes',_active_minutes,
    'manual_effect',      _manual_effect,
    'breakdown',          _breakdown
  );
END;
$function$;

COMMENT ON FUNCTION public.compute_employee_score(uuid, jsonb) IS
  'D8-5 (273): the employee score computation, WITHOUT persisting. '
  'calculate_employee_score persists its result; preview_manual_score_adjustment '
  'calls it with a hypothetical entry. One implementation, two entry points — '
  'so the pre-submit preview cannot drift from the score that actually lands.';


-- -----------------------------------------------------------------------------
-- 6. calculate_employee_score — now compute + persist. Signature UNCHANGED
--    (uuid -> jsonb), so all 8 in-database callers and the frontend RPC wrapper
--    keep working untouched, and no DROP FUNCTION is required (rule 5 n/a).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_employee_score(_employee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _r jsonb;
BEGIN
  _r := public.compute_employee_score(_employee_id, NULL);

  INSERT INTO public.employee_scores (
    employee_id, daily_score, weekly_score, monthly_score, total_score,
    normalized_score, active_work_minutes, breakdown, last_calculated_at
  ) VALUES (
    _employee_id,
    (_r->>'daily_score')::numeric,
    (_r->>'weekly_score')::numeric,
    (_r->>'monthly_score')::numeric,
    (_r->>'total_score')::numeric,
    (_r->>'normalized_score')::numeric,
    (_r->>'active_work_minutes')::numeric,
    _r->'breakdown',
    now()
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
    'employee_id',      _employee_id,
    'daily_score',      (_r->>'daily_score')::numeric,
    'weekly_score',     (_r->>'weekly_score')::numeric,
    'monthly_score',    (_r->>'monthly_score')::numeric,
    'total_score',      (_r->>'total_score')::numeric,
    'normalized_score', (_r->>'normalized_score')::numeric,
    'breakdown',        _r->'breakdown'
  );
END;
$function$;


-- -----------------------------------------------------------------------------
-- 7. award_xp_from_score — ratchet last_score_converted upward only.
--    See the header for why this phase requires it.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.award_xp_from_score(_employee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_total numeric;
  last_converted numeric;
  delta numeric;
  xp_to_add numeric;
BEGIN
  SELECT total_score INTO current_total
  FROM public.employee_scores
  WHERE employee_id = _employee_id;

  IF current_total IS NULL THEN
    RETURN jsonb_build_object('xp_added', 0, 'reason', 'no_score');
  END IF;

  INSERT INTO public.employee_progress(employee_id, xp_next_level)
  VALUES (_employee_id, public.calc_xp_for_level(1))
  ON CONFLICT (employee_id) DO NOTHING;

  SELECT last_score_converted INTO last_converted
  FROM public.employee_progress
  WHERE employee_id = _employee_id;

  delta := GREATEST(current_total - COALESCE(last_converted, 0), 0);
  xp_to_add := floor(delta / 100);

  -- 273: ratchet. A manual penalty pushes total_score DOWN and it rises again
  -- when the effect expires; without GREATEST the same points would be
  -- converted into XP a second time on the way back up.
  UPDATE public.employee_progress
  SET last_score_converted = GREATEST(current_total, COALESCE(last_converted, 0))
  WHERE employee_id = _employee_id;

  IF xp_to_add > 0 THEN
    RETURN public.add_employee_xp(_employee_id, xp_to_add) || jsonb_build_object('xp_added', xp_to_add);
  END IF;

  RETURN jsonb_build_object('xp_added', 0, 'score_delta', delta);
END;
$function$;


-- -----------------------------------------------------------------------------
-- 8. Level projection — what add_employee_xp WOULD do, without writing.
--    Mirrors award_xp_from_score + add_employee_xp exactly (including the new
--    ratchet), so the preview's "level after" is the level that actually lands.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.project_employee_level(
  _employee_id     uuid,
  _projected_total numeric
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  rec public.employee_progress%ROWTYPE;
  _level int;
  _xp_current numeric;
  _xp_total numeric;
  _xp_next numeric;
  _last_converted numeric;
  _delta numeric;
  _xp_to_add numeric;
  _old_level int;
  _guard int := 0;
BEGIN
  SELECT * INTO rec FROM public.employee_progress WHERE employee_id = _employee_id;

  IF NOT FOUND THEN
    _level := 1; _xp_current := 0; _xp_total := 0;
    _xp_next := public.calc_xp_for_level(1); _last_converted := 0;
  ELSE
    _level := rec.level; _xp_current := rec.xp_current; _xp_total := rec.xp_total;
    _xp_next := rec.xp_next_level; _last_converted := COALESCE(rec.last_score_converted, 0);
  END IF;

  _old_level := _level;

  _delta := GREATEST(_projected_total - _last_converted, 0);
  _xp_to_add := floor(_delta / 100);

  IF _xp_to_add > 0 THEN
    _xp_current := _xp_current + _xp_to_add;
    _xp_total   := _xp_total + _xp_to_add;
    WHILE _xp_current >= _xp_next AND _guard < 1000 LOOP
      _xp_current := _xp_current - _xp_next;
      _level := _level + 1;
      _xp_next := public.calc_xp_for_level(_level);
      _guard := _guard + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'level',         _level,
    'old_level',     _old_level,
    'leveled_up',    _level > _old_level,
    'xp_current',    _xp_current,
    'xp_total',      _xp_total,
    'xp_next_level', _xp_next,
    'xp_added',      COALESCE(_xp_to_add, 0)
  );
END;
$function$;


-- -----------------------------------------------------------------------------
-- 9. preview_manual_score_adjustment — what the manager must see before confirming.
--    Admin-only, mirroring recordManualScoreAdjustment's own authorization.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.preview_manual_score_adjustment(
  _employee_id   uuid,
  _amount        numeric,
  _effect_months integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _before jsonb;
  _after  jsonb;
  _lvl_before jsonb;
  _lvl_after  jsonb;
  _schedule jsonb;
  _m int;
  _now timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'دسترسی ندارید: ابتدا وارد شوید.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'فقط مدیر سیستم می‌تواند امتیاز دستی ثبت کند.' USING ERRCODE = '42501';
  END IF;

  IF _amount IS NULL OR _amount = 0 THEN
    RAISE EXCEPTION 'مقدار نمی‌تواند صفر باشد.' USING ERRCODE = '22023';
  END IF;

  IF _effect_months IS NULL OR _effect_months < 1 OR _effect_months > 60 THEN
    RAISE EXCEPTION 'مدت اثر باید بین ۱ تا ۶۰ ماه باشد.' USING ERRCODE = '22023';
  END IF;

  _before := public.compute_employee_score(_employee_id, NULL);
  _after  := public.compute_employee_score(
               _employee_id,
               jsonb_build_object('amount', _amount, 'effect_months', _effect_months)
             );

  _lvl_before := public.project_employee_level(_employee_id, (_before->>'total_score')::numeric);
  _lvl_after  := public.project_employee_level(_employee_id, (_after ->>'total_score')::numeric);

  -- Month-by-month effect of THIS entry over the chosen duration.
  SELECT jsonb_agg(jsonb_build_object(
           'month_offset',     g,
           'month_start',      (date_trunc('month', _now) + (g || ' months')::interval),
           'factor',           public.manual_score_decay_factor(g, _effect_months),
           'effective_amount', _amount * public.manual_score_decay_factor(g, _effect_months)
         ) ORDER BY g)
    INTO _schedule
    FROM generate_series(0, _effect_months - 1) AS g;

  RETURN jsonb_build_object(
    'employee_id',   _employee_id,
    'amount',        _amount,
    'effect_months', _effect_months,
    'decay_shape',   'linear',
    'current', jsonb_build_object(
      'monthly_score', (_before->>'monthly_score')::numeric,
      'total_score',   (_before->>'total_score')::numeric,
      'level',         (_lvl_before->>'level')::int
    ),
    'projected', jsonb_build_object(
      'monthly_score', (_after->>'monthly_score')::numeric,
      'total_score',   (_after->>'total_score')::numeric,
      'level',         (_lvl_after->>'level')::int,
      'leveled_up',    (_lvl_after->>'level')::int > (_lvl_before->>'level')::int
    ),
    'delta', jsonb_build_object(
      'monthly_score', (_after->>'monthly_score')::numeric - (_before->>'monthly_score')::numeric,
      'total_score',   (_after->>'total_score')::numeric   - (_before->>'total_score')::numeric
    ),
    'schedule', COALESCE(_schedule, '[]'::jsonb)
  );
END;
$function$;

COMMENT ON FUNCTION public.preview_manual_score_adjustment(uuid, numeric, integer) IS
  'D8-5 (273): the pre-submit preview. Computed by compute_employee_score — the '
  'same function that produces the stored score — with the pending entry injected '
  'as a hypothetical. Admin only.';


-- -----------------------------------------------------------------------------
-- 10. Privileges. Supabase grants EXECUTE to PUBLIC by default; take it back and
--     grant deliberately (the 256 lesson).
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.compute_employee_score(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.project_employee_level(uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.preview_manual_score_adjustment(uuid, numeric, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.employee_manual_score_detail(uuid, timestamptz, jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.preview_manual_score_adjustment(uuid, numeric, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.employee_manual_score_detail(uuid, timestamptz, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manual_score_decay_factor(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manual_score_months_elapsed(timestamptz, timestamptz) TO authenticated;
