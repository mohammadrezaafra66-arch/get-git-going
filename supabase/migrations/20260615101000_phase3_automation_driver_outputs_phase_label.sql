-- =========================================================
-- PHASE-3: Automation driver outputs phase-label compatibility
-- Packet: TPC-3-004 — Draft PHASE-3 Evidence Table Compatibility Migration
--
-- Scope:
--   - Allow PHASE-3 rows in public.automation_driver_outputs
--   - Evidence-table compatibility only
--   - No product/price/customer/supplier/sales/CRM writeback
--   - No worker execution
--   - No scheduler
--   - No live external source request
--   - No UI/API route change
--
-- Dependency:
--   - This migration is stacked on top of the unmerged TPC-3-003 packet.
--   - It must not be accepted or merged unless TPC-3-003 is accepted/merged first.
--
-- Rollback (manual — repo has no down migrations):
--   ALTER TABLE public.automation_driver_outputs
--     DROP CONSTRAINT IF EXISTS automation_driver_outputs_phase_label_check;
--   ALTER TABLE public.automation_driver_outputs
--     ADD CONSTRAINT automation_driver_outputs_phase_label_check
--     CHECK (phase_label IN ('BASELINE', 'PHASE-0', 'PHASE-1', 'PHASE-2', 'FUTURE'));
-- =========================================================

BEGIN;

ALTER TABLE public.automation_driver_outputs
  DROP CONSTRAINT IF EXISTS automation_driver_outputs_phase_label_check;

ALTER TABLE public.automation_driver_outputs
  ADD CONSTRAINT automation_driver_outputs_phase_label_check
  CHECK (phase_label IN ('BASELINE', 'PHASE-0', 'PHASE-1', 'PHASE-2', 'PHASE-3', 'FUTURE'));

COMMENT ON CONSTRAINT automation_driver_outputs_phase_label_check
  ON public.automation_driver_outputs IS
  'Allows BASELINE/PHASE-0/PHASE-1/PHASE-2/PHASE-3/FUTURE evidence rows. PHASE-3 is limited to approved controlled evidence-table workflows and does not authorize business writeback.';

COMMENT ON TABLE public.automation_driver_outputs IS
  'Standard structured output table for worker driver results. Stores mock/internal/read-only evidence, including approved Phase-3 evidence-table compatibility; this table does not authorize product, price, customer, supplier, sales, CRM, or commercial writeback.';

COMMIT;
