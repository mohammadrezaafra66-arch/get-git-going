-- =========================================================
-- PHASE-1: Automation driver outputs
-- TPC-I-003 — Supabase Output Migration Implementation
--
-- Scope:
--   - Standard output persistence for worker driver results
--   - Mock/internal/read-only source kinds only
--   - No real Torob/Google Maps/Divar/WhatsApp/Instagram/OCR/STT/AI tables
--   - No UI/API/worker code changes
--
-- Security:
--   - RLS enabled
--   - SELECT limited to admin/manager operator visibility
--   - No INSERT/UPDATE/DELETE policies for authenticated clients
--   - Worker writes must go through service-role server routes or approved RPCs
--
-- Rollback (manual — repo has no down migrations):
--   DROP TABLE IF EXISTS public.automation_driver_outputs CASCADE;
-- =========================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.automation_driver_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.automation_jobs(id) ON DELETE CASCADE,
  run_id uuid NULL REFERENCES public.automation_job_runs(id) ON DELETE SET NULL,
  driver_name text NOT NULL,
  job_type text NOT NULL,
  status text NOT NULL,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  checkpoint jsonb NULL,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_kind text NOT NULL DEFAULT 'mock',
  phase_label text NOT NULL DEFAULT 'PHASE-1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_driver_outputs_status_check
    CHECK (status IN ('COMPLETED', 'FAILED', 'SKIPPED')),
  CONSTRAINT automation_driver_outputs_source_kind_check
    CHECK (source_kind IN ('mock', 'internal', 'external_read_only')),
  CONSTRAINT automation_driver_outputs_phase_label_check
    CHECK (phase_label IN ('BASELINE', 'PHASE-0', 'PHASE-1', 'FUTURE')),
  CONSTRAINT automation_driver_outputs_driver_name_format_check
    CHECK (driver_name ~ '^[a-z][a-z0-9_]{1,63}$'),
  CONSTRAINT automation_driver_outputs_job_type_not_blank_check
    CHECK (length(trim(job_type)) > 0),
  CONSTRAINT automation_driver_outputs_output_is_object_check
    CHECK (jsonb_typeof(output) = 'object'),
  CONSTRAINT automation_driver_outputs_errors_is_array_check
    CHECK (jsonb_typeof(errors) = 'array')
);

COMMENT ON TABLE public.automation_driver_outputs IS
  'Standard structured output table for Phase-1 worker driver results. This table stores mock/internal/read-only driver outputs and does not introduce any real source integration.';

COMMENT ON COLUMN public.automation_driver_outputs.output IS
  'Structured driver output payload. Must not contain secrets.';

COMMENT ON COLUMN public.automation_driver_outputs.errors IS
  'Structured driver error list. Must be a JSON array and must not contain secrets.';

CREATE INDEX IF NOT EXISTS idx_automation_driver_outputs_job_created
  ON public.automation_driver_outputs (job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_driver_outputs_run_created
  ON public.automation_driver_outputs (run_id, created_at DESC)
  WHERE run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_automation_driver_outputs_driver_status
  ON public.automation_driver_outputs (driver_name, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_driver_outputs_source_kind
  ON public.automation_driver_outputs (source_kind, created_at DESC);

DROP TRIGGER IF EXISTS trg_automation_driver_outputs_updated_at ON public.automation_driver_outputs;
CREATE TRIGGER trg_automation_driver_outputs_updated_at
  BEFORE UPDATE ON public.automation_driver_outputs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.automation_driver_outputs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS automation_driver_outputs_select_admin_manager ON public.automation_driver_outputs;
CREATE POLICY automation_driver_outputs_select_admin_manager
  ON public.automation_driver_outputs FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));

-- No INSERT/UPDATE/DELETE policies => authenticated clients cannot mutate.
-- Service role bypass is reserved for approved server-side control-plane routes or RPCs.

COMMIT;
