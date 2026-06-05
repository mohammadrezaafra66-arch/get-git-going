-- =========================================================
-- PHASE-0: Automation tables (database-backed queue)
-- ADR-0001, G-04, WPC-0-003
--
-- Scope:
--   - Generic automation persistence only (dummy_worker enabled)
--   - No Divar/WhatsApp/Instagram/Torob/OCR/STT/AI tables
--   - No Redis/RabbitMQ
--   - Worker/API routes are a later phase; this migration is schema-only
--
-- Security:
--   - RLS enabled on all tables
--   - SELECT limited to admin/manager (operator visibility)
--   - No INSERT/UPDATE/DELETE policies for authenticated clients
--   - Writes must go through service-role server routes or SECURITY DEFINER RPCs (future)
--
-- Rollback (manual — repo has no down migrations):
--   DROP TABLE IF EXISTS public.automation_log_events CASCADE;
--   DROP TABLE IF EXISTS public.automation_artifacts CASCADE;
--   DROP TABLE IF EXISTS public.automation_checkpoints CASCADE;
--   DROP TABLE IF EXISTS public.automation_worker_heartbeats CASCADE;
--   DROP TABLE IF EXISTS public.automation_job_runs CASCADE;
--   DROP TABLE IF EXISTS public.automation_jobs CASCADE;
--   DROP TABLE IF EXISTS public.automation_workers CASCADE;
--   DROP TABLE IF EXISTS public.automation_modules CASCADE;
-- =========================================================

BEGIN;

-- ---------------------------------------------------------
-- Shared phase label constraint helper (inline per table)
-- Allowed: BASELINE, PHASE-0, PHASE-1, FUTURE
-- ---------------------------------------------------------

-- 1) automation_modules -----------------------------------
CREATE TABLE IF NOT EXISTS public.automation_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL,
  display_name text NOT NULL,
  description text NULL,
  phase_label text NOT NULL DEFAULT 'PHASE-0',
  status text NOT NULL DEFAULT 'draft',
  capabilities text[] NOT NULL DEFAULT '{}',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_modules_module_key_unique UNIQUE (module_key),
  CONSTRAINT automation_modules_phase_label_check
    CHECK (phase_label IN ('BASELINE', 'PHASE-0', 'PHASE-1', 'FUTURE')),
  CONSTRAINT automation_modules_status_check
    CHECK (status IN ('draft', 'enabled', 'disabled')),
  CONSTRAINT automation_modules_module_key_format_check
    CHECK (module_key ~ '^[a-z][a-z0-9_]{1,63}$')
);

COMMENT ON TABLE public.automation_modules IS
  'Phase-0 automation module registry. Only dummy_worker is enabled in seed data; real bots remain FUTURE/disabled.';

CREATE INDEX IF NOT EXISTS idx_automation_modules_status_phase
  ON public.automation_modules (status, phase_label);

-- 2) automation_workers -----------------------------------
CREATE TABLE IF NOT EXISTS public.automation_workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_name text NOT NULL,
  status text NOT NULL DEFAULT 'OFFLINE',
  capabilities text[] NOT NULL DEFAULT '{}',
  active_run_id uuid NULL,
  last_seen_at timestamptz NULL,
  version text NULL,
  host jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  phase_label text NOT NULL DEFAULT 'PHASE-0',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_workers_status_check
    CHECK (status IN ('ONLINE', 'DEGRADED', 'OFFLINE')),
  CONSTRAINT automation_workers_phase_label_check
    CHECK (phase_label IN ('BASELINE', 'PHASE-0', 'PHASE-1', 'FUTURE'))
);

COMMENT ON TABLE public.automation_workers IS
  'Registered external worker instances (Python runtime). Upserted via future /api/automation/v1/workers/heartbeat.';

CREATE INDEX IF NOT EXISTS idx_automation_workers_status_last_seen
  ON public.automation_workers (status, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_workers_capabilities_gin
  ON public.automation_workers USING gin (capabilities);

-- 3) automation_jobs (command / queue envelope) -----------
CREATE TABLE IF NOT EXISTS public.automation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.automation_modules(id) ON DELETE RESTRICT,
  job_type text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  phase_label text NOT NULL DEFAULT 'PHASE-0',
  idempotency_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority integer NOT NULL DEFAULT 50,
  claimed_by_worker_id uuid NULL REFERENCES public.automation_workers(id) ON DELETE SET NULL,
  claimed_at timestamptz NULL,
  expires_at timestamptz NULL,
  correlation_id text NULL,
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_jobs_idempotency_key_unique UNIQUE (idempotency_key),
  CONSTRAINT automation_jobs_phase_label_check
    CHECK (phase_label IN ('BASELINE', 'PHASE-0', 'PHASE-1', 'FUTURE')),
  CONSTRAINT automation_jobs_status_check
    CHECK (status IN ('PENDING', 'CLAIMED', 'CANCELLED', 'EXPIRED')),
  CONSTRAINT automation_jobs_priority_check
    CHECK (priority BETWEEN 0 AND 100),
  CONSTRAINT automation_jobs_job_type_phase0_check
    CHECK (job_type IN ('DUMMY_RUN', 'generic.echo', 'generic.noop', 'generic.healthcheck'))
);

COMMENT ON TABLE public.automation_jobs IS
  'Database-backed automation command queue. Maps to job.schema.json and POST /jobs/claim (automation/openapi/automation-v1.yaml). Phase-0 allows only dummy/generic job types.';

CREATE INDEX IF NOT EXISTS idx_automation_jobs_dispatch
  ON public.automation_jobs (status, priority DESC, created_at ASC)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_automation_jobs_module_status
  ON public.automation_jobs (module_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_jobs_claimed_by
  ON public.automation_jobs (claimed_by_worker_id, status)
  WHERE claimed_by_worker_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_automation_jobs_correlation
  ON public.automation_jobs (correlation_id)
  WHERE correlation_id IS NOT NULL;

-- 4) automation_job_runs ----------------------------------
CREATE TABLE IF NOT EXISTS public.automation_job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.automation_jobs(id) ON DELETE CASCADE,
  worker_id uuid NULL REFERENCES public.automation_workers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'QUEUED',
  phase_label text NOT NULL DEFAULT 'PHASE-0',
  result jsonb NULL,
  error_code text NULL,
  error_message text NULL,
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_job_runs_phase_label_check
    CHECK (phase_label IN ('BASELINE', 'PHASE-0', 'PHASE-1', 'FUTURE')),
  CONSTRAINT automation_job_runs_status_check
    CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'))
);

COMMENT ON TABLE public.automation_job_runs IS
  'Execution run for a claimed automation job. Run lifecycle aligns with PATCH /jobs/{jobId}/status (future implementation).';

CREATE INDEX IF NOT EXISTS idx_automation_job_runs_job_created
  ON public.automation_job_runs (job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_job_runs_worker_status
  ON public.automation_job_runs (worker_id, status, created_at DESC)
  WHERE worker_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_automation_job_runs_active
  ON public.automation_job_runs (status, created_at DESC)
  WHERE status IN ('QUEUED', 'RUNNING');

-- Deferred FK: worker.active_run_id -> job_runs
ALTER TABLE public.automation_workers
  DROP CONSTRAINT IF EXISTS automation_workers_active_run_id_fkey;

ALTER TABLE public.automation_workers
  ADD CONSTRAINT automation_workers_active_run_id_fkey
  FOREIGN KEY (active_run_id) REFERENCES public.automation_job_runs(id) ON DELETE SET NULL;

-- 5) automation_worker_heartbeats (append-only) -----------
CREATE TABLE IF NOT EXISTS public.automation_worker_heartbeats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES public.automation_workers(id) ON DELETE CASCADE,
  status text NOT NULL,
  capabilities text[] NOT NULL DEFAULT '{}',
  active_jobs integer NOT NULL DEFAULT 0,
  max_concurrent_jobs integer NOT NULL DEFAULT 1,
  observed_at timestamptz NOT NULL,
  version text NULL,
  host jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  phase_label text NOT NULL DEFAULT 'PHASE-0',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_worker_heartbeats_status_check
    CHECK (status IN ('ONLINE', 'DEGRADED', 'OFFLINE')),
  CONSTRAINT automation_worker_heartbeats_active_jobs_check
    CHECK (active_jobs BETWEEN 0 AND 100),
  CONSTRAINT automation_worker_heartbeats_max_concurrent_jobs_check
    CHECK (max_concurrent_jobs BETWEEN 1 AND 100),
  CONSTRAINT automation_worker_heartbeats_phase_label_check
    CHECK (phase_label IN ('BASELINE', 'PHASE-0', 'PHASE-1', 'FUTURE'))
);

COMMENT ON TABLE public.automation_worker_heartbeats IS
  'Append-only heartbeat history per worker. Must not store secrets in metadata.';

CREATE INDEX IF NOT EXISTS idx_automation_worker_heartbeats_worker_observed
  ON public.automation_worker_heartbeats (worker_id, observed_at DESC);

-- 6) automation_checkpoints (append-only) -------------------
CREATE TABLE IF NOT EXISTS public.automation_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.automation_job_runs(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.automation_jobs(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.automation_workers(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  progress_percent integer NOT NULL DEFAULT 0,
  stage text NULL,
  message text NULL,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  reported_at timestamptz NOT NULL,
  phase_label text NOT NULL DEFAULT 'PHASE-0',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_checkpoints_run_sequence_unique UNIQUE (run_id, sequence),
  CONSTRAINT automation_checkpoints_phase_label_check
    CHECK (phase_label IN ('BASELINE', 'PHASE-0', 'PHASE-1', 'FUTURE')),
  CONSTRAINT automation_checkpoints_progress_percent_check
    CHECK (progress_percent BETWEEN 0 AND 100),
  CONSTRAINT automation_checkpoints_sequence_check
    CHECK (sequence >= 1)
);

COMMENT ON TABLE public.automation_checkpoints IS
  'Durable progress checkpoints for long-running runs. Maps to CHECKPOINT_SAVED events and future PUT /jobs/{id}/checkpoint.';

CREATE INDEX IF NOT EXISTS idx_automation_checkpoints_run_sequence
  ON public.automation_checkpoints (run_id, sequence DESC);

CREATE INDEX IF NOT EXISTS idx_automation_checkpoints_job_reported
  ON public.automation_checkpoints (job_id, reported_at DESC);

-- 7) automation_artifacts ---------------------------------
CREATE TABLE IF NOT EXISTS public.automation_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.automation_job_runs(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.automation_jobs(id) ON DELETE CASCADE,
  artifact_type text NOT NULL DEFAULT 'result',
  storage_path text NULL,
  content jsonb NULL,
  mime_type text NULL,
  byte_size integer NULL,
  phase_label text NOT NULL DEFAULT 'PHASE-0',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_artifacts_phase_label_check
    CHECK (phase_label IN ('BASELINE', 'PHASE-0', 'PHASE-1', 'FUTURE')),
  CONSTRAINT automation_artifacts_type_check
    CHECK (artifact_type IN ('result', 'log', 'output', 'attachment')),
  CONSTRAINT automation_artifacts_byte_size_check
    CHECK (byte_size IS NULL OR byte_size >= 0)
);

COMMENT ON TABLE public.automation_artifacts IS
  'Small structured outputs or storage references produced by a run. No binary blobs required in Phase-0.';

CREATE INDEX IF NOT EXISTS idx_automation_artifacts_run_type
  ON public.automation_artifacts (run_id, artifact_type, created_at DESC);

-- 8) automation_log_events (append-only) ------------------
CREATE TABLE IF NOT EXISTS public.automation_log_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.automation_job_runs(id) ON DELETE CASCADE,
  job_id uuid NULL REFERENCES public.automation_jobs(id) ON DELETE SET NULL,
  worker_id uuid NULL REFERENCES public.automation_workers(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  message text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL,
  phase_label text NOT NULL DEFAULT 'PHASE-0',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_log_events_phase_label_check
    CHECK (phase_label IN ('BASELINE', 'PHASE-0', 'PHASE-1', 'FUTURE')),
  CONSTRAINT automation_log_events_event_type_check
    CHECK (event_type IN (
      'RUN_STARTED',
      'HEARTBEAT',
      'CHECKPOINT_SAVED',
      'RUN_COMPLETED',
      'RUN_FAILED',
      'RUN_CANCELLED'
    ))
);

COMMENT ON TABLE public.automation_log_events IS
  'Append-only run event stream. Persisted for operator visibility and future worker event ingestion.';

CREATE INDEX IF NOT EXISTS idx_automation_log_events_run_occurred
  ON public.automation_log_events (run_id, occurred_at ASC);

CREATE INDEX IF NOT EXISTS idx_automation_log_events_type_occurred
  ON public.automation_log_events (event_type, occurred_at DESC);

-- ---------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------
DROP TRIGGER IF EXISTS trg_automation_modules_updated_at ON public.automation_modules;
CREATE TRIGGER trg_automation_modules_updated_at
  BEFORE UPDATE ON public.automation_modules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_automation_workers_updated_at ON public.automation_workers;
CREATE TRIGGER trg_automation_workers_updated_at
  BEFORE UPDATE ON public.automation_workers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_automation_jobs_updated_at ON public.automation_jobs;
CREATE TRIGGER trg_automation_jobs_updated_at
  BEFORE UPDATE ON public.automation_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_automation_job_runs_updated_at ON public.automation_job_runs;
CREATE TRIGGER trg_automation_job_runs_updated_at
  BEFORE UPDATE ON public.automation_job_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_automation_artifacts_updated_at ON public.automation_artifacts;
CREATE TRIGGER trg_automation_artifacts_updated_at
  BEFORE UPDATE ON public.automation_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------
-- RLS — conservative; server-side writes only for now
-- TODO(phase-0+): add module-scoped operator INSERT on automation_jobs via
--   SECURITY DEFINER RPC once UI command path and RBAC module key are approved.
-- TODO(phase-0+): add worker write RPCs (claim/heartbeat/events) — never direct
--   authenticated client writes to queue tables.
-- ---------------------------------------------------------
ALTER TABLE public.automation_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_job_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_worker_heartbeats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_log_events ENABLE ROW LEVEL SECURITY;

-- SELECT: admin/manager operator visibility (future status UI)
DROP POLICY IF EXISTS automation_modules_select_admin_manager ON public.automation_modules;
CREATE POLICY automation_modules_select_admin_manager
  ON public.automation_modules FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));

DROP POLICY IF EXISTS automation_workers_select_admin_manager ON public.automation_workers;
CREATE POLICY automation_workers_select_admin_manager
  ON public.automation_workers FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));

DROP POLICY IF EXISTS automation_jobs_select_admin_manager ON public.automation_jobs;
CREATE POLICY automation_jobs_select_admin_manager
  ON public.automation_jobs FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));

DROP POLICY IF EXISTS automation_job_runs_select_admin_manager ON public.automation_job_runs;
CREATE POLICY automation_job_runs_select_admin_manager
  ON public.automation_job_runs FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));

DROP POLICY IF EXISTS automation_worker_heartbeats_select_admin_manager ON public.automation_worker_heartbeats;
CREATE POLICY automation_worker_heartbeats_select_admin_manager
  ON public.automation_worker_heartbeats FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));

DROP POLICY IF EXISTS automation_checkpoints_select_admin_manager ON public.automation_checkpoints;
CREATE POLICY automation_checkpoints_select_admin_manager
  ON public.automation_checkpoints FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));

DROP POLICY IF EXISTS automation_artifacts_select_admin_manager ON public.automation_artifacts;
CREATE POLICY automation_artifacts_select_admin_manager
  ON public.automation_artifacts FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));

DROP POLICY IF EXISTS automation_log_events_select_admin_manager ON public.automation_log_events;
CREATE POLICY automation_log_events_select_admin_manager
  ON public.automation_log_events FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));

-- No INSERT/UPDATE/DELETE policies => authenticated clients cannot mutate.
-- Service role (server routes) bypasses RLS when used from control plane only.

-- ---------------------------------------------------------
-- Seed: single enabled Phase-0 module (dummy_worker)
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
  'dummy_worker',
  'Worker Dummy',
  'Phase-0 dummy automation module. No external platform integration.',
  'PHASE-0',
  'enabled',
  ARRAY['dummy', 'DUMMY_RUN', 'generic.echo', 'generic.noop', 'generic.healthcheck'],
  jsonb_build_object(
    'openapi_contract', '/api/automation/v1',
    'task_packet', 'WPC-0-001'
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
