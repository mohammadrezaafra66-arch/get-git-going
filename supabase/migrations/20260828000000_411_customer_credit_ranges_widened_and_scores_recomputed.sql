-- 411: widen the seven customer credit scoring ranges, then recompute the
-- existing scores so they read on the new scale.
--
-- WHY
--   The accountant cannot enter real figures. Cooperation history was capped at
--   240 months, so a 20-year customer lands at the ceiling. purchase_1y was
--   capped at 5,000,000,000 and one live customer already reads raw_score =
--   1.000 -- at that point the score stops telling good customers apart.
--
-- UNIT
--   Verified live before this file was written: input_type = 'toman' for all six
--   money parameters, and their unit_label / input_hint say the value is entered
--   in toman. The amounts below are therefore used AS IS. No x10 rial
--   conversion is applied.
--
-- PART B -- WHY A SELF-UPDATE IS REQUIRED
--   dynamic_entity_scores.raw_score is frozen at write time. Changing a
--   parameter range does NOT touch existing score rows. The trigger
--   trg_a_compute_raw_score is BEFORE INSERT OR UPDATE and recomputes
--   raw_score from actual_value and the parameter's CURRENT min/max, so
--   updating a row to its own value refreshes it. Proven behaviourally inside a
--   rolled-back transaction before writing this file:
--     raw 0.300 -> (range change only) 0.300 -> (self-update) 0.060
--
-- SIDE EFFECTS (expected, not accidental)
--   trg_audit_dyn_score writes one audit_logs row per touched score row.
--   trg_refresh_dyn_capital_after_score_change refreshes today's dynamic
--   capital, so customer credit ceilings move. The owner approved this.
--
-- SAFETY
--   No DROP, no DELETE, no TRUNCATE. Part A updates range columns only; part B
--   is value-preserving (actual_value is set to itself).

SET client_encoding='UTF8';

-- ------------------------------------------------------------------ PART A
UPDATE public.dynamic_scoring_parameters SET min_value = 1, max_value = 360
 WHERE entity_type = 'customer' AND code = 'customer_cooperation_months';

UPDATE public.dynamic_scoring_parameters SET min_value = 0, max_value = 10000000000
 WHERE entity_type = 'customer' AND code = 'customer_purchase_3m';

UPDATE public.dynamic_scoring_parameters SET min_value = 0, max_value = 25000000000
 WHERE entity_type = 'customer' AND code = 'customer_purchase_1y';

UPDATE public.dynamic_scoring_parameters SET min_value = 0, max_value = 50000000000
 WHERE entity_type = 'customer' AND code = 'customer_purchase_3y';

UPDATE public.dynamic_scoring_parameters SET min_value = 0, max_value = 2500000000
 WHERE entity_type = 'customer' AND code = 'customer_profit_3m';

UPDATE public.dynamic_scoring_parameters SET min_value = 0, max_value = 5000000000
 WHERE entity_type = 'customer' AND code = 'customer_profit_1y';

UPDATE public.dynamic_scoring_parameters SET min_value = 0, max_value = 15000000000
 WHERE entity_type = 'customer' AND code = 'customer_profit_3y';

-- ------------------------------------------------------------------ PART B
UPDATE public.dynamic_entity_scores
   SET actual_value = actual_value
 WHERE entity_type = 'customer'
   AND actual_value IS NOT NULL
   AND parameter_id IN (
         SELECT id FROM public.dynamic_scoring_parameters
          WHERE entity_type = 'customer'
            AND code IN ('customer_cooperation_months','customer_purchase_3m',
                         'customer_purchase_1y','customer_purchase_3y',
                         'customer_profit_3m','customer_profit_1y',
                         'customer_profit_3y'));

-- ------------------------------------------------------------------ VERIFY
DO $verify$
DECLARE
  v_bad   integer;
  v_seen  integer;
BEGIN
  -- A: every one of the seven ranges holds exactly the intended pair.
  SELECT count(*) INTO v_seen
    FROM public.dynamic_scoring_parameters p
    JOIN (VALUES
           ('customer_cooperation_months', 1::numeric,   360::numeric),
           ('customer_purchase_3m',        0,  10000000000),
           ('customer_purchase_1y',        0,  25000000000),
           ('customer_purchase_3y',        0,  50000000000),
           ('customer_profit_3m',          0,   2500000000),
           ('customer_profit_1y',          0,   5000000000),
           ('customer_profit_3y',          0,  15000000000)
         ) AS want(code, mn, mx) ON want.code = p.code
   WHERE p.entity_type = 'customer'
     AND p.min_value = want.mn
     AND p.max_value = want.mx;

  IF v_seen <> 7 THEN
    RAISE EXCEPTION '411: expected 7 parameters at the intended range, found %', v_seen;
  END IF;

  -- B: every touched score row now reads on the new scale. Recompute the
  -- trigger's own formula here and compare; a frozen row fails this.
  SELECT count(*) INTO v_bad
    FROM public.dynamic_entity_scores s
    JOIN public.dynamic_scoring_parameters p ON p.id = s.parameter_id
   WHERE s.entity_type = 'customer'
     AND s.actual_value IS NOT NULL
     AND p.code IN ('customer_cooperation_months','customer_purchase_3m',
                    'customer_purchase_1y','customer_purchase_3y',
                    'customer_profit_3m','customer_profit_1y','customer_profit_3y')
     AND s.raw_score IS DISTINCT FROM ROUND(
           CASE WHEN p.direction = 'negative'
                THEN 1 - LEAST(1, GREATEST(0, (s.actual_value - p.min_value) / (p.max_value - p.min_value)))
                ELSE     LEAST(1, GREATEST(0, (s.actual_value - p.min_value) / (p.max_value - p.min_value)))
           END::numeric, 3);

  IF v_bad <> 0 THEN
    RAISE EXCEPTION '411: % score rows are still frozen on the old range', v_bad;
  END IF;

  RAISE NOTICE '411: 7 ranges set; all customer score rows recomputed on the new scale';
END
$verify$;
