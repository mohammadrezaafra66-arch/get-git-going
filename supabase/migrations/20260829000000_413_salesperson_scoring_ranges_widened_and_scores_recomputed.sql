-- 413: widen four salesperson scoring ranges, then recompute the existing scores
-- so they read on the new scale.
--
-- WHY
--   The ceilings no longer describe the business. Monthly sales was capped at
--   1,000,000,000 and monthly profit at 200,000,000, so a strong month pins at
--   raw_score = 1.000 and the score stops telling salespeople apart -- the same
--   failure 411 fixed on the customer side. Call counts were capped at 500.
--
-- UNIT
--   Both money parameters are input_type='toman' with unit_label set to the Persian word for toman,
--   verified live before this file was written. The amounts below are used AS IS;
--   no rial conversion. Call counts are plain counts.
--
-- VALUES (owner-approved 2026-08-29)
--   salesperson_sales_amount_monthly : 1,000,000,000 -> 15,000,000,000
--   salesperson_profit_monthly       :   200,000,000 ->    500,000,000
--   salesperson_inbound_calls        :           500 ->          1,000
--   salesperson_outbound_calls       :           500 ->          1,000
--   talk_time_minutes and discipline are deliberately unchanged.
--
-- PART B -- WHY A SELF-UPDATE IS REQUIRED
--   dynamic_entity_scores.raw_score is frozen at write time; changing a range
--   does NOT touch existing rows. trg_a_compute_raw_score is BEFORE INSERT OR
--   UPDATE and recomputes from actual_value and the parameter's CURRENT min/max,
--   so a value-preserving self-update refreshes it. Proven behaviourally for 411.
--
-- SIDE EFFECTS (expected)
--   trg_audit_dyn_score writes one audit_logs row per touched score row.
--   trg_refresh_dyn_capital_after_score_change refreshes today's dynamic capital,
--   so salesperson capital allocations move. Widening lowers every normalised
--   score, so allocations shift accordingly. The owner approved this.
--
-- SAFETY
--   No DROP, no DELETE, no TRUNCATE. Part A updates range columns only; part B is
--   value-preserving. CHECK (max_value > min_value) is satisfied by all four.

SET client_encoding='UTF8';

-- ------------------------------------------------------------------ PART A
UPDATE public.dynamic_scoring_parameters SET min_value = 0, max_value = 15000000000
 WHERE entity_type = 'salesperson' AND code = 'salesperson_sales_amount_monthly';

UPDATE public.dynamic_scoring_parameters SET min_value = 0, max_value = 500000000
 WHERE entity_type = 'salesperson' AND code = 'salesperson_profit_monthly';

UPDATE public.dynamic_scoring_parameters SET min_value = 0, max_value = 1000
 WHERE entity_type = 'salesperson' AND code = 'salesperson_inbound_calls';

UPDATE public.dynamic_scoring_parameters SET min_value = 0, max_value = 1000
 WHERE entity_type = 'salesperson' AND code = 'salesperson_outbound_calls';

-- ------------------------------------------------------------------ PART B
UPDATE public.dynamic_entity_scores
   SET actual_value = actual_value
 WHERE entity_type = 'salesperson'
   AND actual_value IS NOT NULL
   AND parameter_id IN (
         SELECT id FROM public.dynamic_scoring_parameters
          WHERE entity_type = 'salesperson'
            AND code IN ('salesperson_sales_amount_monthly','salesperson_profit_monthly',
                         'salesperson_inbound_calls','salesperson_outbound_calls'));

-- ------------------------------------------------------------------ VERIFY
DO $verify$
DECLARE
  v_seen integer;
  v_bad  integer;
BEGIN
  SELECT count(*) INTO v_seen
    FROM public.dynamic_scoring_parameters p
    JOIN (VALUES
           ('salesperson_sales_amount_monthly', 0::numeric, 15000000000::numeric),
           ('salesperson_profit_monthly',       0,             500000000),
           ('salesperson_inbound_calls',        0,                  1000),
           ('salesperson_outbound_calls',       0,                  1000)
         ) AS want(code, mn, mx) ON want.code = p.code
   WHERE p.entity_type = 'salesperson'
     AND p.min_value = want.mn AND p.max_value = want.mx;

  IF v_seen <> 4 THEN
    RAISE EXCEPTION '413: expected 4 parameters at the intended range, found %', v_seen;
  END IF;

  SELECT count(*) INTO v_bad
    FROM public.dynamic_entity_scores s
    JOIN public.dynamic_scoring_parameters p ON p.id = s.parameter_id
   WHERE s.entity_type = 'salesperson'
     AND s.actual_value IS NOT NULL
     AND p.code IN ('salesperson_sales_amount_monthly','salesperson_profit_monthly',
                    'salesperson_inbound_calls','salesperson_outbound_calls')
     AND s.raw_score IS DISTINCT FROM ROUND(
           CASE WHEN p.direction = 'negative'
                THEN 1 - LEAST(1, GREATEST(0, (s.actual_value - p.min_value) / (p.max_value - p.min_value)))
                ELSE     LEAST(1, GREATEST(0, (s.actual_value - p.min_value) / (p.max_value - p.min_value)))
           END::numeric, 3);

  IF v_bad <> 0 THEN
    RAISE EXCEPTION '413: % score rows are still frozen on the old range', v_bad;
  END IF;

  RAISE NOTICE '413: 4 ranges set; all salesperson score rows recomputed on the new scale';
END
$verify$;
