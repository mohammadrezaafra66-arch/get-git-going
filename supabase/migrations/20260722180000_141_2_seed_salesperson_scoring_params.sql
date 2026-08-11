-- =====================================================================
-- 141.2 - Seed salesperson dynamic scoring parameters
-- =====================================================================
--
-- WHY THIS MIGRATION EXISTS
--
-- public.dynamic_scoring_parameters already allows entity_type='salesperson'
-- (see dynamic_scoring_parameters_entity_type_check), and
-- /users/$userId already renders DynamicScoringSection with
-- entityType="salesperson". But the table currently contains ZERO
-- salesperson rows - only 10 customer rows.
--
-- Consequence today: every salesperson has a weighted score of 0, so
-- run_daily_capital_allocation splits the daily capital by all-zero scores
-- and no salesperson receives an allocation. This migration gives the
-- salesperson side a working default parameter set.
--
-- WEIGHTS SUM TO EXACTLY 1.000 for the active salesperson set:
--     0.30 + 0.25 + 0.10 + 0.10 + 0.10 + 0.15 = 1.00
--
-- input_type choices (constrained to score_100|toman|months|boolean|score_input):
--   toman     -> money input with thousands separators
--   months    -> plain numeric input; unit_label overrides the suffix, so it
--                is reused here for call counts and talk minutes
--   score_100 -> 0..100 slider
--
-- IDEMPOTENT: safe to run more than once.
--   - parameters use ON CONFLICT (entity_type, code) DO NOTHING
--   - weights are inserted only when no current-period row exists
--
-- ---------------------------------------------------------------------
-- PRE-CHECK - what exists before running:
--
--     SELECT entity_type, count(*)
--       FROM public.dynamic_scoring_parameters
--      GROUP BY entity_type;
--
-- Expect: customer=10, salesperson absent.
--
-- POST-CHECK - current-period weights must total 1.000:
--
--     SELECT p.entity_type, SUM(w.weight)
--       FROM public.dynamic_scoring_parameters p
--       JOIN public.dynamic_parameter_weights w ON w.parameter_id = p.id
--      WHERE p.is_active
--        AND w.valid_from <= CURRENT_DATE
--        AND (w.valid_to IS NULL OR w.valid_to >= CURRENT_DATE)
--      GROUP BY p.entity_type;
--
-- ---------------------------------------------------------------------
-- ROLLBACK
--
--     DELETE FROM public.dynamic_parameter_weights w
--      USING public.dynamic_scoring_parameters p
--      WHERE w.parameter_id = p.id AND p.entity_type = 'salesperson';
--
--     DELETE FROM public.dynamic_scoring_parameters
--      WHERE entity_type = 'salesperson'
--        AND code IN ('salesperson_sales_amount_monthly',
--                     'salesperson_profit_monthly',
--                     'salesperson_inbound_calls',
--                     'salesperson_outbound_calls',
--                     'salesperson_talk_time_minutes',
--                     'salesperson_discipline');
--
-- Note: rolling back returns every salesperson score to zero.
-- =====================================================================

BEGIN;

INSERT INTO public.dynamic_scoring_parameters
  (entity_type, code, label_fa, direction, is_active, display_order,
   input_type, min_value, max_value, unit_label, input_hint)
VALUES
  ('salesperson', 'salesperson_sales_amount_monthly',
   'مبلغ فروش ماهانه', 'positive', true, 10,
   'toman', 0, 1000000000, 'تومان',
   'مجموع فروش این کارشناس در ماه جاری'),

  ('salesperson', 'salesperson_profit_monthly',
   'سود ماهانه', 'positive', true, 20,
   'toman', 0, 200000000, 'تومان',
   'مجموع سود حاصل از فروش این کارشناس در ماه جاری'),

  ('salesperson', 'salesperson_inbound_calls',
   'تماس‌های ورودی', 'positive', true, 30,
   'months', 0, 500, 'تماس',
   'تعداد تماس‌های ورودی پاسخ‌داده‌شده در ماه جاری'),

  ('salesperson', 'salesperson_outbound_calls',
   'تماس‌های خروجی', 'positive', true, 40,
   'months', 0, 500, 'تماس',
   'تعداد تماس‌های خروجی برقرارشده در ماه جاری'),

  ('salesperson', 'salesperson_talk_time_minutes',
   'دقایق مکالمه', 'positive', true, 50,
   'months', 0, 3000, 'دقیقه',
   'مجموع دقایق مکالمه در ماه جاری'),

  ('salesperson', 'salesperson_discipline',
   'انضباط کاری', 'positive', true, 60,
   'score_100', 0, 100, 'امتیاز',
   'ارزیابی انضباط کاری از صفر تا صد')
ON CONFLICT (entity_type, code) DO NOTHING;

-- Weights, valid from today with an open end date. Only inserted when the
-- parameter has no weight row covering today, so re-running never stacks.
INSERT INTO public.dynamic_parameter_weights (parameter_id, weight, valid_from, valid_to)
SELECT p.id, v.weight, CURRENT_DATE, NULL
  FROM public.dynamic_scoring_parameters p
  JOIN (VALUES
      ('salesperson_sales_amount_monthly', 0.30::numeric),
      ('salesperson_profit_monthly',       0.25::numeric),
      ('salesperson_inbound_calls',        0.10::numeric),
      ('salesperson_outbound_calls',       0.10::numeric),
      ('salesperson_talk_time_minutes',    0.10::numeric),
      ('salesperson_discipline',           0.15::numeric)
  ) AS v(code, weight) ON v.code = p.code
 WHERE p.entity_type = 'salesperson'
   AND NOT EXISTS (
     SELECT 1 FROM public.dynamic_parameter_weights w
      WHERE w.parameter_id = p.id
        AND w.valid_from <= CURRENT_DATE
        AND (w.valid_to IS NULL OR w.valid_to >= CURRENT_DATE)
   );

-- ---------------------------------------------------------------------
-- v2 of create_dynamic_scoring_parameter
--
-- Two problems with the existing function, which is left in place so no
-- current caller breaks:
--
--   1. It hardcodes entity_type = 'customer', so the UI can never create a
--      salesperson parameter.
--   2. It INSERTs into columns `name` and `weight_default`, NEITHER OF WHICH
--      EXISTS on public.dynamic_scoring_parameters anymore. Any call therefore
--      fails outright - the "add parameter" action in /sales/credit-rules is
--      broken today.
--
-- v2 takes an explicit entity_type and writes only real columns. Permission
-- model and the post-create reallocation behaviour are preserved.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_dynamic_scoring_parameter_v2(
  _entity_type text,
  _code        text,
  _label_fa    text,
  _weight      numeric,
  _direction   text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_today date := CURRENT_DATE;
  v_next_order int;
  v_setting record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'manager')
          OR public.has_role(v_uid,'accountant')) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF _entity_type NOT IN ('customer','salesperson') THEN
    RAISE EXCEPTION 'INVALID_ENTITY_TYPE';
  END IF;
  IF _code IS NULL OR btrim(_code) = '' THEN RAISE EXCEPTION 'INVALID_CODE'; END IF;
  IF _weight IS NULL OR _weight < 0 OR _weight > 1 THEN RAISE EXCEPTION 'INVALID_WEIGHT'; END IF;
  IF _direction NOT IN ('positive','negative') THEN RAISE EXCEPTION 'INVALID_DIRECTION'; END IF;

  SELECT COALESCE(MAX(display_order), 0) + 1 INTO v_next_order
    FROM public.dynamic_scoring_parameters WHERE entity_type = _entity_type;

  INSERT INTO public.dynamic_scoring_parameters
    (entity_type, code, label_fa, direction, is_active, display_order)
  VALUES
    (_entity_type, btrim(_code),
     COALESCE(NULLIF(btrim(_label_fa), ''), btrim(_code)),
     _direction, true, v_next_order)
  RETURNING id INTO v_id;

  INSERT INTO public.dynamic_parameter_weights(parameter_id, weight, valid_from, created_by)
  VALUES (v_id, _weight, v_today, v_uid);

  INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
  VALUES (v_uid, 'dynamic_scoring_parameter', v_id::text, 'parameter_created',
          jsonb_build_object('entity_type', _entity_type, 'code', _code,
                             'weight', _weight, 'direction', _direction));

  -- Re-run today's allocation so a new parameter takes effect immediately.
  SELECT capital_date, total_capital, notes INTO v_setting
    FROM public.daily_capital_settings WHERE capital_date = v_today
   ORDER BY created_at DESC LIMIT 1;

  IF v_setting.capital_date IS NOT NULL THEN
    BEGIN
      PERFORM public.run_daily_capital_allocation(
        v_setting.capital_date, v_setting.total_capital,
        COALESCE(v_setting.notes, 'auto-rerun after new parameter'));
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
      VALUES (v_uid, 'dynamic_scoring_parameter', v_id::text, 'auto_reallocation_failed',
              jsonb_build_object('error', SQLERRM));
    END;
  END IF;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_dynamic_scoring_parameter_v2(text,text,text,numeric,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_dynamic_scoring_parameter_v2(text,text,text,numeric,text)
  TO authenticated;

COMMIT;
