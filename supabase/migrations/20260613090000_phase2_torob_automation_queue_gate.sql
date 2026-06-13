-- =========================================================
-- PHASE-2: Torob limited read-only automation queue gate
-- TPC-2-004
--
-- Scope:
--   - Enable a controlled queue envelope for TOROB_LIMITED_READONLY jobs.
--   - Seed torob_limited_readonly as an enabled Phase-2 automation module.
--   - Keep writes server-side only; no authenticated client mutations.
--   - No scheduler, browser automation, login/session/cookie, bulk crawl, or production write.
-- =========================================================

BEGIN;

-- ---------------------------------------------------------
-- Phase label constraints: add PHASE-2 to automation tables.
-- ---------------------------------------------------------
ALTER TABLE public.automation_modules
  DROP CONSTRAINT IF EXISTS automation_modules_phase_label_check;
ALTER TABLE public.automation_modules
  ADD CONSTRAINT automation_modules_phase_label_check
    CHECK (phase_label IN ('BASELINE', 'PHASE-0', 'PHASE-1', 'PHASE-2', 'FUTURE'));

ALTER TABLE public.automation_workers
  DROP CONSTRAINT IF EXISTS automation_workers_phase_label_check;
ALTER TABLE public.automation_workers
  ADD CONSTRAINT automation_workers_phase_label_check
    CHECK (phase_label IN ('BASELINE', 'PHASE-0', 'PHASE-1', 'PHASE-2', 'FUTURE'));

ALTER TABLE public.automation_jobs
  DROP CONSTRAINT IF EXISTS automation_jobs_phase_label_check;
ALTER TABLE public.automation_jobs
  ADD CONSTRAINT automation_jobs_phase_label_check
    CHECK (phase_label IN ('BASELINE', 'PHASE-0', 'PHASE-1', 'PHASE-2', 'FUTURE'));

ALTER TABLE public.automation_job_runs
  DROP CONSTRAINT IF EXISTS automation_job_runs_phase_label_check;
ALTER TABLE public.automation_job_runs
  ADD CONSTRAINT automation_job_runs_phase_label_check
    CHECK (phase_label IN ('BASELINE', 'PHASE-0', 'PHASE-1', 'PHASE-2', 'FUTURE'));

ALTER TABLE public.automation_worker_heartbeats
  DROP CONSTRAINT IF EXISTS automation_worker_heartbeats_phase_label_check;
ALTER TABLE public.automation_worker_heartbeats
  ADD CONSTRAINT automation_worker_heartbeats_phase_label_check
    CHECK (phase_label IN ('BASELINE', 'PHASE-0', 'PHASE-1', 'PHASE-2', 'FUTURE'));

ALTER TABLE public.automation_checkpoints
  DROP CONSTRAINT IF EXISTS automation_checkpoints_phase_label_check;
ALTER TABLE public.automation_checkpoints
  ADD CONSTRAINT automation_checkpoints_phase_label_check
    CHECK (phase_label IN ('BASELINE', 'PHASE-0', 'PHASE-1', 'PHASE-2', 'FUTURE'));

ALTER TABLE public.automation_artifacts
  DROP CONSTRAINT IF EXISTS automation_artifacts_phase_label_check;
ALTER TABLE public.automation_artifacts
  ADD CONSTRAINT automation_artifacts_phase_label_check
    CHECK (phase_label IN ('BASELINE', 'PHASE-0', 'PHASE-1', 'PHASE-2', 'FUTURE'));

ALTER TABLE public.automation_log_events
  DROP CONSTRAINT IF EXISTS automation_log_events_phase_label_check;
ALTER TABLE public.automation_log_events
  ADD CONSTRAINT automation_log_events_phase_label_check
    CHECK (phase_label IN ('BASELINE', 'PHASE-0', 'PHASE-1', 'PHASE-2', 'FUTURE'));

-- ---------------------------------------------------------
-- Job type gate: allow only dummy/generic plus Torob limited read-only.
-- ---------------------------------------------------------
ALTER TABLE public.automation_jobs
  DROP CONSTRAINT IF EXISTS automation_jobs_job_type_phase0_check;
ALTER TABLE public.automation_jobs
  ADD CONSTRAINT automation_jobs_job_type_phase2_check
    CHECK (job_type IN (
      'DUMMY_RUN',
      'generic.echo',
      'generic.noop',
      'generic.healthcheck',
      'TOROB_LIMITED_READONLY'
    ));

COMMENT ON TABLE public.automation_jobs IS
  'Database-backed automation command queue. Phase-2 allows controlled TOROB_LIMITED_READONLY envelopes through server-side guarded UI only.';

-- ---------------------------------------------------------
-- Seed controlled Torob module.
-- ---------------------------------------------------------
INSERT INTO public.automation_modules (
  module_key,
  display_name,
  description,
  phase_label,
  status,
  capabilities,
  config
)
VALUES (
  'torob_limited_readonly',
  'Torob Limited Read-Only',
  'Phase-2 guarded Torob read-only queue module. Manual, low-volume, evidence-backed only.',
  'PHASE-2',
  'enabled',
  ARRAY['torob', 'TOROB_LIMITED_READONLY', 'read-only', 'guarded', 'manual-only'],
  jsonb_build_object(
    'task_packet', 'TPC-2-004',
    'max_products', 3,
    'max_total_requests', 10,
    'max_concurrency', 1,
    'min_delay_ms_between_requests', 3000,
    'ui_execution_enabled', false,
    'requires_evidence', true
  )
)
ON CONFLICT (module_key) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  phase_label = EXCLUDED.phase_label,
  status = EXCLUDED.status,
  capabilities = EXCLUDED.capabilities,
  config = EXCLUDED.config,
  updated_at = now();

COMMIT;
