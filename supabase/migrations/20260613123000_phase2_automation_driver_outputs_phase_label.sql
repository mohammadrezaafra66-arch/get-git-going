-- =========================================================
-- PHASE-2: Automation driver outputs phase-label compatibility
-- Packet: TPC-2-005 — Torob Live-ReadOnly Output Persistence Gate
--
-- Scope:
--   - Allow PHASE-2 rows in public.automation_driver_outputs
--   - Evidence-table compatibility only
--   - No product/price/customer/supplier/sales writeback
--   - No worker execution
--   - No scheduler
--   - No live Torob request
--
-- Rollback (manual — repo has no down migrations):
--   ALTER TABLE public.automation_driver_outputs
--     DROP CONSTRAINT IF EXISTS automation_driver_outputs_phase_label_check;
--   ALTER TABLE public.automation_driver_outputs
--     ADD CONSTRAINT automation_driver_outputs_phase_label_check
--     CHECK (phase_label IN ('BASELINE', 'PHASE-0', 'PHASE-1', 'FUTURE'));
-- =========================================================

BEGIN;

ALTER TABLE public.automation_driver_outputs
  DROP CONSTRAINT IF EXISTS automation_driver_outputs_phase_label_check;

ALTER TABLE public.automation_driver_outputs
  ADD CONSTRAINT automation_driver_outputs_phase_label_check
  CHECK (phase_label IN ('BASELINE', 'PHASE-0', 'PHASE-1', 'PHASE-2', 'FUTURE'));

COMMENT ON CONSTRAINT automation_driver_outputs_phase_label_check
  ON public.automation_driver_outputs IS
  'Allows BASELINE/PHASE-0/PHASE-1/PHASE-2/FUTURE evidence rows. PHASE-2 is limited to approved read-only automation evidence and does not authorize business writeback.';

COMMENT ON TABLE public.automation_driver_outputs IS
  'Standard structured output table for worker driver results. Stores mock/internal/read-only driver evidence, including approved Phase-2 read-only automation evidence; this table does not authorize product, price, customer, supplier, or sales writeback.';

COMMIT;
