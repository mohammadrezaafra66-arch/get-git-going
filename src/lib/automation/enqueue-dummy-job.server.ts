/**
 * Phase 0 (WPC-0-004) — server-side dummy job enqueue.
 * Service-role writes only; dummy_worker module; no external platforms.
 */
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PHASE_LABEL = "PHASE-0";
const MODULE_KEY = "dummy_worker";
const JOB_TYPE = "DUMMY_RUN";

export type EnqueueDummyJobRow = {
  id: string;
  status: string;
  job_type: string;
  idempotency_key: string;
  created_at: string;
};

export type EnqueueDummyJobResult = {
  ok: true;
  created: boolean;
  job: EnqueueDummyJobRow;
  module_key: typeof MODULE_KEY;
  real_bot_scope: false;
  phase_label: typeof PHASE_LABEL;
};

// automation_* tables are not yet in generated Database types (Phase 0 migration).
type AutomationAdminClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        val: string,
      ) => {
        maybeSingle: () => Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
      };
    };
    insert: (row: Record<string, unknown>) => {
      select: (cols: string) => {
        single: () => Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
};

function adminDb(): AutomationAdminClient {
  return supabaseAdmin as unknown as AutomationAdminClient;
}

async function getDummyModuleId(): Promise<string> {
  const { data, error } = await adminDb()
    .from("automation_modules")
    .select("id, module_key, status")
    .eq("module_key", MODULE_KEY)
    .maybeSingle();

  if (error) throw new Error(`بارگذاری ماژول dummy_worker ناموفق بود: ${error.message}`);
  if (!data) {
    throw new Error("ماژول dummy_worker یافت نشد. migration فاز صفر را اعمال کنید.");
  }
  if (data.status !== "enabled") {
    throw new Error(`ماژول dummy_worker فعال نیست (وضعیت: ${String(data.status)})`);
  }
  return String(data.id);
}

export async function enqueueDummyAutomationJob(
  actingUserId: string,
): Promise<EnqueueDummyJobResult> {
  const moduleId = await getDummyModuleId();
  const idempotencyKey = `phase0-ui-${randomUUID()}`;

  const payload = {
    action: "echo",
    source: "admin-ui",
    input: { message: "phase0-ui-dummy-enqueue", idempotency_key: idempotencyKey },
    correlation_id: idempotencyKey,
  };

  const { data, error } = await adminDb()
    .from("automation_jobs")
    .insert({
      module_id: moduleId,
      job_type: JOB_TYPE,
      status: "PENDING",
      phase_label: PHASE_LABEL,
      idempotency_key: idempotencyKey,
      payload,
      priority: 50,
      correlation_id: idempotencyKey,
      created_by: actingUserId,
    })
    .select("id, status, job_type, idempotency_key, created_at")
    .single();

  if (error) throw new Error(`ایجاد دستور dummy ناموفق بود: ${error.message}`);
  if (!data) throw new Error("پاسخ نامعتبر از پایگاه داده.");

  const job: EnqueueDummyJobRow = {
    id: String(data.id),
    status: String(data.status),
    job_type: String(data.job_type),
    idempotency_key: String(data.idempotency_key),
    created_at: String(data.created_at),
  };

  if (job.job_type !== JOB_TYPE) {
    throw new Error(`نوع دستور غیرمجاز: ${job.job_type}`);
  }

  const { error: auditError } = await supabaseAdmin.from("audit_logs").insert({
    action: "automation_dummy_job_enqueued",
    entity_type: "automation_job",
    entity_id: job.id,
    actor_id: actingUserId,
    diff: {
      module_key: MODULE_KEY,
      job_type: JOB_TYPE,
      status: job.status,
      phase_label: PHASE_LABEL,
      idempotency_key: job.idempotency_key,
      real_bot_scope: false,
    },
  });
  if (auditError) {
    console.warn("[automation] audit log insert failed:", auditError.message);
  }

  return {
    ok: true,
    created: true,
    job,
    module_key: MODULE_KEY,
    real_bot_scope: false,
    phase_label: PHASE_LABEL,
  };
}
