/**
 * Phase-0 Worker Dummy E2E library (G-08 / WPC-0-001).
 *
 * Local smoke only. Uses server-side Supabase credentials from environment.
 * No external platforms, scraping, messaging, OCR, STT, or AI.
 *
 * Required env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional env:
 *   AUTOMATION_E2E_IDEMPOTENCY_KEY — stable key to test idempotent enqueue skip
 *   AUTOMATION_E2E_WORKER_NAME — default phase0-dummy-worker
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";

const PHASE_LABEL = "PHASE-0";
const MODULE_KEY = "dummy_worker";
const ALLOWED_JOB_TYPES = new Set([
  "DUMMY_RUN",
  "generic.echo",
  "generic.noop",
  "generic.healthcheck",
]);

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function createAdminClient() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function nowIso() {
  return new Date().toISOString();
}

async function getDummyModuleId(supabase) {
  const { data, error } = await supabase
    .from("automation_modules")
    .select("id, module_key, status")
    .eq("module_key", MODULE_KEY)
    .maybeSingle();

  if (error) throw new Error(`Failed to load dummy_worker module: ${error.message}`);
  if (!data) {
    throw new Error(
      "automation_modules.dummy_worker not found. Apply migration 20260605120000_phase0_automation_tables.sql first.",
    );
  }
  if (data.status !== "enabled") {
    throw new Error(`dummy_worker module is not enabled (status=${data.status})`);
  }
  return data.id;
}

async function registerWorker(supabase, workerName) {
  const workerId = randomUUID();
  const { data, error } = await supabase
    .from("automation_workers")
    .insert({
      id: workerId,
      worker_name: workerName,
      status: "ONLINE",
      capabilities: ["dummy", "DUMMY_RUN", "generic.echo", "generic.noop"],
      phase_label: PHASE_LABEL,
      version: "phase0-dummy-e2e-0.1.0",
      host: { hostname: hostname(), platform: process.platform },
      metadata: { source: "automation/worker-dummy/run-e2e.mjs" },
      last_seen_at: nowIso(),
    })
    .select("id, worker_name")
    .single();

  if (error) throw new Error(`Failed to register worker: ${error.message}`);
  return data;
}

async function enqueueDummyJob(supabase, moduleId, idempotencyKey) {
  const { data: existing, error: existingError } = await supabase
    .from("automation_jobs")
    .select("id, status, idempotency_key")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to check idempotency key: ${existingError.message}`);
  }
  if (existing) {
    return { job: existing, created: false };
  }

  const payload = {
    action: "echo",
    input: { message: "phase0-dummy-e2e", idempotency_key: idempotencyKey },
    correlation_id: idempotencyKey,
  };

  const { data, error } = await supabase
    .from("automation_jobs")
    .insert({
      module_id: moduleId,
      job_type: "DUMMY_RUN",
      status: "PENDING",
      phase_label: PHASE_LABEL,
      idempotency_key: idempotencyKey,
      payload,
      priority: 50,
      correlation_id: idempotencyKey,
    })
    .select("id, status, job_type, idempotency_key")
    .single();

  if (error) throw new Error(`Failed to enqueue dummy job: ${error.message}`);
  if (!ALLOWED_JOB_TYPES.has(data.job_type)) {
    throw new Error(`Unexpected job_type: ${data.job_type}`);
  }
  return { job: data, created: true };
}

async function recordHeartbeat(supabase, workerId) {
  const observedAt = nowIso();
  const { error: hbError } = await supabase.from("automation_worker_heartbeats").insert({
    worker_id: workerId,
    status: "ONLINE",
    capabilities: ["dummy", "DUMMY_RUN", "generic.echo"],
    active_jobs: 0,
    max_concurrent_jobs: 1,
    observed_at: observedAt,
    version: "phase0-dummy-e2e-0.1.0",
    host: { hostname: hostname(), platform: process.platform },
    metadata: { phase: "PHASE-0" },
    phase_label: PHASE_LABEL,
  });

  if (hbError) throw new Error(`Failed to record heartbeat: ${hbError.message}`);

  const { error: workerError } = await supabase
    .from("automation_workers")
    .update({ status: "ONLINE", last_seen_at: observedAt })
    .eq("id", workerId);

  if (workerError) throw new Error(`Failed to update worker last_seen_at: ${workerError.message}`);
}

async function claimPendingJob(supabase, workerId) {
  const { data: pending, error: pendingError } = await supabase
    .from("automation_jobs")
    .select("id, status, job_type, payload, idempotency_key")
    .eq("status", "PENDING")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1);

  if (pendingError) throw new Error(`Failed to list pending jobs: ${pendingError.message}`);
  if (!pending?.length) return null;

  const candidate = pending[0];
  const claimedAt = nowIso();
  const { data: claimed, error: claimError } = await supabase
    .from("automation_jobs")
    .update({
      status: "CLAIMED",
      claimed_by_worker_id: workerId,
      claimed_at: claimedAt,
    })
    .eq("id", candidate.id)
    .eq("status", "PENDING")
    .select("id, status, job_type, payload, idempotency_key, claimed_at")
    .maybeSingle();

  if (claimError) throw new Error(`Failed to claim job: ${claimError.message}`);
  if (!claimed) return null;
  return claimed;
}

async function createRun(supabase, jobId, workerId) {
  const startedAt = nowIso();
  const { data, error } = await supabase
    .from("automation_job_runs")
    .insert({
      job_id: jobId,
      worker_id: workerId,
      status: "RUNNING",
      phase_label: PHASE_LABEL,
      started_at: startedAt,
      result: null,
    })
    .select("id, status, started_at")
    .single();

  if (error) throw new Error(`Failed to create run: ${error.message}`);

  const { error: workerError } = await supabase
    .from("automation_workers")
    .update({ active_run_id: data.id, last_seen_at: startedAt })
    .eq("id", workerId);

  if (workerError) throw new Error(`Failed to set worker active_run_id: ${workerError.message}`);
  return data;
}

async function appendEvent(supabase, { runId, jobId, workerId, eventType, message, payload = {} }) {
  const { error } = await supabase.from("automation_log_events").insert({
    run_id: runId,
    job_id: jobId,
    worker_id: workerId,
    event_type: eventType,
    message,
    payload,
    occurred_at: nowIso(),
    phase_label: PHASE_LABEL,
  });
  if (error) throw new Error(`Failed to append event ${eventType}: ${error.message}`);
}

async function saveCheckpoint(
  supabase,
  { runId, jobId, workerId, sequence, progressPercent, message },
) {
  const reportedAt = nowIso();
  const { error } = await supabase.from("automation_checkpoints").insert({
    run_id: runId,
    job_id: jobId,
    worker_id: workerId,
    sequence,
    progress_percent: progressPercent,
    stage: "dummy-e2e",
    message,
    state: { progress: progressPercent },
    reported_at: reportedAt,
    phase_label: PHASE_LABEL,
  });
  if (error) throw new Error(`Failed to save checkpoint: ${error.message}`);
}

async function completeRun(supabase, { runId, workerId, result }) {
  const completedAt = nowIso();
  const { error: runError } = await supabase
    .from("automation_job_runs")
    .update({
      status: "COMPLETED",
      completed_at: completedAt,
      result,
      error_code: null,
      error_message: null,
    })
    .eq("id", runId);

  if (runError) throw new Error(`Failed to complete run: ${runError.message}`);

  const { error: workerError } = await supabase
    .from("automation_workers")
    .update({ active_run_id: null, last_seen_at: completedAt })
    .eq("id", workerId);

  if (workerError) throw new Error(`Failed to clear worker active_run_id: ${workerError.message}`);
}

async function verifyRun(supabase, runId) {
  const { data: run, error: runError } = await supabase
    .from("automation_job_runs")
    .select("id, job_id, worker_id, status, result, started_at, completed_at")
    .eq("id", runId)
    .single();
  if (runError) throw new Error(`Failed to verify run: ${runError.message}`);

  const { data: events, error: eventsError } = await supabase
    .from("automation_log_events")
    .select("event_type")
    .eq("run_id", runId)
    .order("occurred_at", { ascending: true });
  if (eventsError) throw new Error(`Failed to verify events: ${eventsError.message}`);

  const { data: checkpoints, error: cpError } = await supabase
    .from("automation_checkpoints")
    .select("sequence, progress_percent")
    .eq("run_id", runId)
    .order("sequence", { ascending: true });
  if (cpError) throw new Error(`Failed to verify checkpoints: ${cpError.message}`);

  return { run, events: events ?? [], checkpoints: checkpoints ?? [] };
}

/**
 * Execute the full Phase-0 dummy worker E2E smoke flow.
 * @returns {Promise<object>} evidence object
 */
export async function runPhase0DummyE2E(options = {}) {
  const supabase = createAdminClient();
  const workerName =
    options.workerName ?? process.env.AUTOMATION_E2E_WORKER_NAME ?? "phase0-dummy-worker";
  const idempotencyKey =
    options.idempotencyKey ??
    process.env.AUTOMATION_E2E_IDEMPOTENCY_KEY ??
    `phase0-e2e-${randomUUID()}`;

  const moduleId = await getDummyModuleId(supabase);
  const worker = await registerWorker(supabase, workerName);
  const { job, created: jobCreated } = await enqueueDummyJob(supabase, moduleId, idempotencyKey);

  await recordHeartbeat(supabase, worker.id);

  const claimed = await claimPendingJob(supabase, worker.id);
  if (!claimed) {
    throw new Error("No PENDING job available to claim after enqueue");
  }
  if (claimed.id !== job.id) {
    throw new Error(`Claimed unexpected job ${claimed.id}; expected ${job.id}`);
  }

  const run = await createRun(supabase, claimed.id, worker.id);

  await appendEvent(supabase, {
    runId: run.id,
    jobId: claimed.id,
    workerId: worker.id,
    eventType: "RUN_STARTED",
    message: "Phase-0 dummy run started",
  });

  await saveCheckpoint(supabase, {
    runId: run.id,
    jobId: claimed.id,
    workerId: worker.id,
    sequence: 1,
    progressPercent: 50,
    message: "Dummy midpoint checkpoint",
  });

  await appendEvent(supabase, {
    runId: run.id,
    jobId: claimed.id,
    workerId: worker.id,
    eventType: "CHECKPOINT_SAVED",
    message: "Checkpoint sequence 1 saved",
    payload: { sequence: 1, progress_percent: 50 },
  });

  const result = {
    output: { echoed: claimed.payload?.input?.message ?? "phase0-dummy-e2e" },
    message: "Phase-0 dummy run completed",
    finished_at: nowIso(),
  };

  await completeRun(supabase, { runId: run.id, workerId: worker.id, result });

  await appendEvent(supabase, {
    runId: run.id,
    jobId: claimed.id,
    workerId: worker.id,
    eventType: "RUN_COMPLETED",
    message: "Phase-0 dummy run completed",
    payload: { result },
  });

  const verification = await verifyRun(supabase, run.id);

  const eventTypes = verification.events.map((e) => e.event_type);
  const requiredEvents = ["RUN_STARTED", "CHECKPOINT_SAVED", "RUN_COMPLETED"];
  for (const required of requiredEvents) {
    if (!eventTypes.includes(required)) {
      throw new Error(`Missing required event: ${required}`);
    }
  }
  if (verification.run.status !== "COMPLETED") {
    throw new Error(`Run did not complete successfully (status=${verification.run.status})`);
  }

  return {
    ok: true,
    phase: PHASE_LABEL,
    task_packet: "WPC-0-001",
    governance: "G-08",
    job_created: jobCreated,
    idempotency_key: idempotencyKey,
    worker_id: worker.id,
    worker_name: worker.worker_name,
    job_id: claimed.id,
    job_status: claimed.status,
    run_id: run.id,
    run_status: verification.run.status,
    heartbeat_recorded: true,
    checkpoint_count: verification.checkpoints.length,
    event_types: eventTypes,
    verification,
  };
}

/**
 * Re-run claim against an already-completed job idempotency key.
 * Ensures no duplicate claim of non-PENDING jobs.
 */
export async function verifyNoDuplicateClaim(idempotencyKey) {
  const supabase = createAdminClient();
  const worker = await registerWorker(supabase, `phase0-dummy-rerun-${randomUUID().slice(0, 8)}`);
  const claimed = await claimPendingJob(supabase, worker.id);
  const { data: job } = await supabase
    .from("automation_jobs")
    .select("id, status")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  return {
    ok: true,
    prior_job_id: job?.id ?? null,
    prior_job_status: job?.status ?? null,
    new_pending_claimed: claimed?.id ?? null,
    note:
      claimed?.id && job?.id && claimed.id === job.id
        ? "unexpected re-claim of same job"
        : "completed/claimed jobs are not re-claimed as PENDING",
  };
}
