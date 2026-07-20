-- =====================================================================
-- Migration: phase_e_payment_discipline_score100  (Phase E)
--
-- «انضباط در واریز و پرداخت» (dynamic_scoring_parameters.code =
--  'customer_payment_discipline') was a boolean toggle. Convert it to a free
--  numeric TEXT input 0–100 (like customer_cooperation_months / _profit_3m /
--  _purchase_3m — text inputs, NOT the score_100 slider), with
--  normalized = value/100 (100→1.00, 0→0.00, preserving current behavior).
--
-- Rendering type: a NEW input_type 'score_input' (numeric text, min 0 / max
--  100). A distinct type is used instead of reusing 'score_100' so the two
--  existing score_100 slider params are NOT changed. The scoring math in
--  DynamicScoringSection.tsx (computeNormalized / initialActualFor /
--  isClippedFor) already treats every non-'boolean' type as
--  (actual-min)/(max-min) = value/100 here, so only a render branch is added.
--
-- Value mapping for existing customer scores (dynamic_entity_scores):
--   old boolean actual_value 1 (true) → 100, 0 (false) → 0, NULL → NULL.
--   raw_score (normalized) preserved (100/100 = 1.0). The `actual_value <= 1`
--   guard keeps the remap idempotent.
--
-- Idempotent. supabase_admin on DB `afrakala`. Backup: D:\AfraKalaTest\backup_pre_E.sql
-- After applying: docker restart afrakala-lan-rest.
-- =====================================================================

-- 1) allow the new input_type value
ALTER TABLE public.dynamic_scoring_parameters
  DROP CONSTRAINT IF EXISTS dynamic_scoring_parameters_input_type_check;
ALTER TABLE public.dynamic_scoring_parameters
  ADD CONSTRAINT dynamic_scoring_parameters_input_type_check
  CHECK (input_type = ANY (ARRAY['score_100','toman','months','boolean','score_input']::text[]));

-- 2) convert the field to numeric-text 0..100
UPDATE public.dynamic_scoring_parameters
   SET input_type = 'score_input',
       min_value  = 0,
       max_value  = 100,
       updated_at = now()
 WHERE code = 'customer_payment_discipline';

-- 3) remap existing customer values: boolean 0/1 → 0/100 (idempotent guard)
UPDATE public.dynamic_entity_scores
   SET actual_value = actual_value * 100
 WHERE parameter_id = (
         SELECT id FROM public.dynamic_scoring_parameters
          WHERE code = 'customer_payment_discipline'
       )
   AND actual_value IS NOT NULL
   AND actual_value <= 1;
