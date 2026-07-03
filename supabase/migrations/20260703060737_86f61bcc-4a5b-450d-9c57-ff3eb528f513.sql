
-- Step 1: Extend dynamic_scoring_parameters
ALTER TABLE public.dynamic_scoring_parameters
  ADD COLUMN input_type text NOT NULL DEFAULT 'score_100'
    CHECK (input_type IN ('score_100','toman','months','boolean')),
  ADD COLUMN min_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN max_value numeric NOT NULL DEFAULT 100,
  ADD COLUMN unit_label text,
  ADD COLUMN input_hint text,
  ADD CONSTRAINT dyn_scoring_params_min_max_chk CHECK (max_value > min_value);

-- Step 2: Add actual_value and is_clipped to dynamic_entity_scores
ALTER TABLE public.dynamic_entity_scores
  ADD COLUMN actual_value numeric,
  ADD COLUMN is_clipped boolean NOT NULL DEFAULT false;

-- Alter raw_score to be nullable when actual_value is provided (trigger fills it)
-- Keep CHECK constraint intact (0..1); still NOT NULL, trigger will populate.
-- To allow inserts that only provide actual_value, we relax NOT NULL:
ALTER TABLE public.dynamic_entity_scores ALTER COLUMN raw_score DROP NOT NULL;

-- Step 3: Trigger that computes normalized raw_score from actual_value
CREATE OR REPLACE FUNCTION public.compute_normalized_raw_score()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  p_min numeric;
  p_max numeric;
  p_direction text;
  v_norm numeric;
BEGIN
  IF NEW.actual_value IS NOT NULL THEN
    SELECT min_value, max_value, direction
      INTO p_min, p_max, p_direction
    FROM public.dynamic_scoring_parameters
    WHERE id = NEW.parameter_id;

    IF p_max IS NULL OR p_max = p_min THEN
      RAISE EXCEPTION 'پارامتر % دارای min/max معتبر نیست', NEW.parameter_id;
    END IF;

    NEW.is_clipped := (NEW.actual_value > p_max) OR (NEW.actual_value < p_min);
    v_norm := LEAST(1, GREATEST(0, (NEW.actual_value - p_min) / (p_max - p_min)));
    IF p_direction = 'negative' THEN
      v_norm := 1 - v_norm;
    END IF;
    NEW.raw_score := ROUND(v_norm::numeric, 3);
  ELSE
    NEW.is_clipped := false;
    IF NEW.raw_score IS NULL THEN
      RAISE EXCEPTION 'باید actual_value یا raw_score ارائه شود';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_a_compute_raw_score
  BEFORE INSERT OR UPDATE ON public.dynamic_entity_scores
  FOR EACH ROW EXECUTE FUNCTION public.compute_normalized_raw_score();

-- Step 4: Delete old customer parameters (CASCADE clears weights + 11 test scores)
DELETE FROM public.dynamic_scoring_parameters WHERE entity_type = 'customer';

-- Step 5: Insert 10 new customer parameters
INSERT INTO public.dynamic_scoring_parameters
  (entity_type, code, label_fa, direction, is_active, display_order, input_type, min_value, max_value, unit_label, input_hint)
VALUES
  ('customer','customer_payment_discipline','انضباط در واریز و پرداخت','positive',true,10,'boolean',0,1,NULL,'۰ = خیر، ۱ = بله'),
  ('customer','customer_cooperation_months','سابقه همکاری','positive',true,20,'months',1,240,'ماه','بین ۱ تا ۲۴۰ ماه'),
  ('customer','customer_profit_3m','سود ۳ ماه گذشته','positive',true,30,'toman',0,500000000,'تومان','مبلغ به تومان'),
  ('customer','customer_purchase_3m','خرید ۳ ماه گذشته','positive',true,40,'toman',0,2000000000,'تومان','مبلغ به تومان'),
  ('customer','customer_purchase_1y','خرید ۱ سال گذشته','positive',true,50,'toman',0,5000000000,'تومان','مبلغ به تومان'),
  ('customer','customer_profit_1y','سود ۱ سال گذشته','positive',true,60,'toman',0,1000000000,'تومان','مبلغ به تومان'),
  ('customer','customer_purchase_3y','خرید ۳ سال گذشته','positive',true,70,'toman',0,10000000000,'تومان','مبلغ به تومان'),
  ('customer','customer_profit_3y','سود ۳ سال گذشته','positive',true,80,'toman',0,3000000000,'تومان','مبلغ به تومان'),
  ('customer','customer_professional_behavior','رفتار حرفه‌ای و احترام','positive',true,90,'score_100',0,100,'امتیاز','۰ تا ۱۰۰'),
  ('customer','customer_availability','میزان در دسترس بودن','positive',true,100,'score_100',0,100,'امتیاز','۰ تا ۱۰۰');

-- Step 6: Insert new weights (sum = 1.00)
INSERT INTO public.dynamic_parameter_weights (parameter_id, weight, valid_from, valid_to)
SELECT p.id,
  CASE p.code
    WHEN 'customer_payment_discipline'    THEN 0.20
    WHEN 'customer_cooperation_months'    THEN 0.10
    WHEN 'customer_profit_3m'             THEN 0.15
    WHEN 'customer_purchase_3m'           THEN 0.10
    WHEN 'customer_purchase_1y'           THEN 0.10
    WHEN 'customer_profit_1y'             THEN 0.15
    WHEN 'customer_purchase_3y'           THEN 0.05
    WHEN 'customer_profit_3y'             THEN 0.05
    WHEN 'customer_professional_behavior' THEN 0.05
    WHEN 'customer_availability'          THEN 0.05
  END,
  current_date, NULL
FROM public.dynamic_scoring_parameters p
WHERE p.entity_type = 'customer';

-- Step 7: Update calculate_dynamic_score to include actual_value + is_clipped
CREATE OR REPLACE FUNCTION public.calculate_dynamic_score(
  p_entity_type text, p_entity_id uuid, p_period_month date DEFAULT NULL::date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $function$
DECLARE
  v_period date;
  v_total_active_weight numeric := 0;
  v_weighted_score numeric := 0;
  v_params_active int := 0;
  v_params_evaluated int := 0;
  v_breakdown jsonb := '[]'::jsonb;
  v_result jsonb;
BEGIN
  IF p_entity_type NOT IN ('customer','salesperson') THEN
    RAISE EXCEPTION 'entity_type نامعتبر: %', p_entity_type;
  END IF;
  v_period := date_trunc('month', COALESCE(p_period_month, current_date))::date;

  SELECT COALESCE(SUM(w.weight), 0)
  INTO v_total_active_weight
  FROM dynamic_scoring_parameters p
  JOIN dynamic_parameter_weights w
    ON w.parameter_id = p.id
    AND w.valid_from <= v_period
    AND (w.valid_to IS NULL OR w.valid_to >= v_period)
  JOIN dynamic_entity_scores s
    ON s.parameter_id = p.id
    AND s.entity_type = p_entity_type
    AND s.entity_id = p_entity_id
    AND s.period_month = v_period
  WHERE p.entity_type = p_entity_type
    AND p.is_active = true;

  SELECT COUNT(*)
  INTO v_params_active
  FROM dynamic_scoring_parameters
  WHERE entity_type = p_entity_type AND is_active = true;

  SELECT
    COUNT(*) FILTER (WHERE s.raw_score IS NOT NULL),
    jsonb_agg(
      jsonb_build_object(
        'parameter_code',    p.code,
        'parameter_name',    p.label_fa,
        'input_type',        p.input_type,
        'unit_label',        p.unit_label,
        'min_value',         p.min_value,
        'max_value',         p.max_value,
        'actual_value',      s.actual_value,
        'is_clipped',        COALESCE(s.is_clipped, false),
        'raw_score',         s.raw_score,
        'raw_weight',        w.weight,
        'normalized_weight', CASE
                                WHEN s.raw_score IS NOT NULL AND v_total_active_weight > 0
                                THEN ROUND((w.weight / v_total_active_weight)::numeric, 6)
                                ELSE 0
                              END,
        'contribution',      CASE
                                WHEN s.raw_score IS NOT NULL AND v_total_active_weight > 0
                                THEN ROUND((s.raw_score * w.weight / v_total_active_weight)::numeric, 6)
                                ELSE 0
                              END,
        'has_score',         s.raw_score IS NOT NULL
      ) ORDER BY p.display_order
    )
  INTO v_params_evaluated, v_breakdown
  FROM dynamic_scoring_parameters p
  LEFT JOIN dynamic_parameter_weights w
    ON w.parameter_id = p.id
    AND w.valid_from <= v_period
    AND (w.valid_to IS NULL OR w.valid_to >= v_period)
  LEFT JOIN dynamic_entity_scores s
    ON s.parameter_id = p.id
    AND s.entity_type = p_entity_type
    AND s.entity_id = p_entity_id
    AND s.period_month = v_period
  WHERE p.entity_type = p_entity_type
    AND p.is_active = true;

  IF v_total_active_weight > 0 THEN
    SELECT COALESCE(SUM(s.raw_score * w.weight / v_total_active_weight), 0)
    INTO v_weighted_score
    FROM dynamic_scoring_parameters p
    JOIN dynamic_parameter_weights w
      ON w.parameter_id = p.id
      AND w.valid_from <= v_period
      AND (w.valid_to IS NULL OR w.valid_to >= v_period)
    JOIN dynamic_entity_scores s
      ON s.parameter_id = p.id
      AND s.entity_type = p_entity_type
      AND s.entity_id = p_entity_id
      AND s.period_month = v_period
    WHERE p.entity_type = p_entity_type
      AND p.is_active = true;
  END IF;

  v_result := jsonb_build_object(
    'entity_type', p_entity_type,
    'entity_id', p_entity_id,
    'period_month', v_period,
    'weighted_score', ROUND(v_weighted_score::numeric, 6),
    'total_active_weight', v_total_active_weight,
    'params_active', v_params_active,
    'params_evaluated', COALESCE(v_params_evaluated, 0),
    'breakdown', COALESCE(v_breakdown, '[]'::jsonb)
  );
  RETURN v_result;
END $function$;
