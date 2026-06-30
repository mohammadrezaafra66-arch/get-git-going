
CREATE OR REPLACE FUNCTION public.calculate_dynamic_score(
  p_entity_type text,
  p_entity_id uuid,
  p_period_month date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_period date;
  v_result jsonb;
  v_weighted numeric;
  v_total_active_weight numeric;
  v_params_active int;
  v_params_evaluated int;
  v_breakdown jsonb;
BEGIN
  -- Validation
  IF p_entity_type NOT IN ('customer', 'salesperson') THEN
    RAISE EXCEPTION 'invalid entity_type: %, must be customer or salesperson', p_entity_type
      USING ERRCODE = '22023';
  END IF;

  IF p_entity_id IS NULL THEN
    RAISE EXCEPTION 'entity_id cannot be null' USING ERRCODE = '22004';
  END IF;

  v_period := date_trunc('month', COALESCE(p_period_month, current_date))::date;

  -- Build the per-parameter rows
  WITH active_params AS (
    SELECT p.id, p.code, p.name, p.weight_default
    FROM public.dynamic_scoring_parameters p
    WHERE p.entity_type = p_entity_type
      AND p.is_active = true
  ),
  weighted AS (
    SELECT
      ap.id,
      ap.code,
      ap.name,
      w.weight AS raw_weight
    FROM active_params ap
    LEFT JOIN public.dynamic_parameter_weights w
      ON w.parameter_id = ap.id
     AND w.valid_from <= v_period
     AND (w.valid_to IS NULL OR w.valid_to >= v_period)
  ),
  scored AS (
    SELECT
      w.id,
      w.code,
      w.name,
      w.raw_weight,
      s.raw_score
    FROM weighted w
    LEFT JOIN public.dynamic_entity_scores s
      ON s.parameter_id = w.id
     AND s.entity_type = p_entity_type
     AND s.entity_id = p_entity_id
     AND s.period_month = v_period
  ),
  totals AS (
    SELECT
      COUNT(*)::int AS params_active,
      COUNT(*) FILTER (WHERE raw_score IS NOT NULL AND raw_weight IS NOT NULL)::int AS params_evaluated,
      COALESCE(SUM(raw_weight) FILTER (WHERE raw_score IS NOT NULL AND raw_weight IS NOT NULL), 0) AS total_active_weight
    FROM scored
  ),
  enriched AS (
    SELECT
      s.code,
      s.name,
      s.raw_score,
      s.raw_weight,
      CASE
        WHEN s.raw_score IS NOT NULL AND s.raw_weight IS NOT NULL AND t.total_active_weight > 0
          THEN s.raw_weight / t.total_active_weight
        ELSE 0
      END AS normalized_weight
    FROM scored s
    CROSS JOIN totals t
  ),
  contributions AS (
    SELECT
      code,
      name,
      raw_score,
      raw_weight,
      normalized_weight,
      COALESCE(raw_score * normalized_weight, 0) AS contribution,
      (raw_score IS NOT NULL) AS has_score
    FROM enriched
  )
  SELECT
    COALESCE(SUM(c.contribution), 0),
    t.total_active_weight,
    t.params_active,
    t.params_evaluated,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'parameter_code', c.code,
          'parameter_name', c.name,
          'raw_score', c.raw_score,
          'raw_weight', c.raw_weight,
          'normalized_weight', round(c.normalized_weight::numeric, 6),
          'contribution', round(c.contribution::numeric, 6),
          'has_score', c.has_score
        )
        ORDER BY c.code
      ) FILTER (WHERE c.code IS NOT NULL),
      '[]'::jsonb
    )
  INTO v_weighted, v_total_active_weight, v_params_active, v_params_evaluated, v_breakdown
  FROM contributions c
  CROSS JOIN totals t
  GROUP BY t.total_active_weight, t.params_active, t.params_evaluated;

  -- Edge case: no active params at all
  IF v_params_active IS NULL THEN
    v_params_active := 0;
    v_params_evaluated := 0;
    v_total_active_weight := 0;
    v_breakdown := '[]'::jsonb;
    v_weighted := NULL;
  ELSIF v_params_evaluated = 0 THEN
    v_weighted := NULL;
  END IF;

  v_result := jsonb_build_object(
    'entity_type', p_entity_type,
    'entity_id', p_entity_id,
    'period_month', v_period,
    'weighted_score', CASE WHEN v_weighted IS NULL THEN NULL ELSE round(v_weighted::numeric, 6) END,
    'total_weight_used', round(COALESCE(v_total_active_weight, 0)::numeric, 6),
    'parameters_active', v_params_active,
    'parameters_evaluated', v_params_evaluated,
    'breakdown', v_breakdown
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.calculate_dynamic_score(text, uuid, date) IS
'محاسبه read-only امتیاز پویا برای customer/salesperson در یک ماه. وزن پارامترهای بدون امتیاز حذف و باقی نرمال می‌شوند. خروجی jsonb شامل weighted_score و breakdown کامل. فاز ۵ snapshot از این تابع استفاده می‌کند.';

GRANT EXECUTE ON FUNCTION public.calculate_dynamic_score(text, uuid, date) TO authenticated, service_role;
