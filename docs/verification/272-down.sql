SET client_encoding='UTF8';

-- =====================================================================
-- Rollback for migration 272 (versioned score-level thresholds, D8-4).
--
-- Restores calculate_dynamic_score exactly as captured before 272 from
-- pg_get_functiondef (docs/verification/pre-272/calculate_dynamic_score.sql),
-- then drops the lookup function and the thresholds table.
--
-- WARNING -- WHAT RUNNING THIS COSTS YOU
-- The score NUMBERS are unaffected either way: 272 only merged extra keys onto
-- the returned jsonb and changed no arithmetic (proved by the parity gate --
-- checksum identical before and after). What you lose is the label: level_code,
-- level_label, level_order and score_pct disappear from the result, so the
-- badge in DynamicScoringSection stops rendering. Revert that component too if
-- this rollback is kept, otherwise it simply shows no badge (it already handles
-- a null label without erroring, so it will not break).
--
-- DROP TABLE is used here on a table that migration 272 itself created and
-- seeded with 4 rows; it holds no business data entered by anyone. If an admin
-- has since added threshold VERSIONS you want to keep, export them first --
-- this drops them.
--
--   docker cp docs/verification/272-down.sql afrakala-lan-db:/tmp/272-down.sql
--   docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin --     -d afrakala -v ON_ERROR_STOP=1 --single-transaction -f /tmp/272-down.sql
-- =====================================================================

-- Restore the pre-272 score function FIRST, so nothing references score_level_at.
CREATE OR REPLACE FUNCTION public.calculate_dynamic_score(p_entity_type text, p_entity_id uuid, p_period_month date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
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

DROP FUNCTION IF EXISTS public.score_level_at(numeric, date);
DROP TABLE    IF EXISTS public.score_level_thresholds;
