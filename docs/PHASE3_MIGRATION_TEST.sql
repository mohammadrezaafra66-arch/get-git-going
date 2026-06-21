-- =========================================================
-- Test script for Phase 3 migration
-- This validates that PHASE-3 can be inserted after migration
-- =========================================================

-- Test 1: Verify constraint allows PHASE-3
SELECT constraint_definition 
FROM information_schema.check_constraints 
WHERE constraint_name = 'automation_driver_outputs_phase_label_check';

-- Expected: CHECK (phase_label IN ('BASELINE', 'PHASE-0', 'PHASE-1', 'PHASE-2', 'PHASE-3', 'FUTURE'))

-- Test 2: Attempt PHASE-3 insert (should succeed)
INSERT INTO public.automation_driver_outputs (
  job_id,
  phase_label,
  status,
  output_json,
  created_at
) VALUES (
  'test-phase3-' || gen_random_uuid()::text,
  'PHASE-3',
  'success',
  '{"test": "phase3"}'::jsonb,
  now()
) RETURNING id, job_id, phase_label;

-- Test 3: Verify insert succeeded by counting
SELECT COUNT(*) as phase3_count 
FROM public.automation_driver_outputs 
WHERE phase_label = 'PHASE-3' AND job_id ILIKE 'test-phase3-%';

-- Expected: >= 1

-- Test 4: Attempt invalid phase_label (should fail)
-- Uncomment to test rejection:
-- INSERT INTO public.automation_driver_outputs (
--   job_id,
--   phase_label,
--   status,
--   output_json,
--   created_at
-- ) VALUES (
--   'test-invalid',
--   'PHASE-4',  -- Not allowed
--   'success',
--   '{}'::jsonb,
--   now()
-- );
-- Expected: ERROR - CHECK constraint violation
