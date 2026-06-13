/**
 * Phase 2 / TPC-2-004 — server-side guarded Torob read-only job enqueue.
 *
 * This module only creates a PENDING queue envelope. It does not execute Torob,
 * does not call external services, and does not expose service-role secrets to the browser.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PHASE_LABEL = "PHASE-2" as const;
const MODULE_KEY = "torob_limited_readonly" as const;
const JOB_TYPE = "TOROB_LIMITED_READONLY" as const;
const EXECUTION_PACKET = "TPC-2-004" as const;

export const EnqueueTorobReadonlyJobInputSchema = z.object({
  productUrl: z
    .string()
    .trim()
    .min(1, "لینک محصول ترب الزامی است")
    .refine((value) => {
      try {
        const parsed = new URL(value);
        const host = parsed.hostname.toLowerCase();
        return parsed.protocol === "https:" && (host === "torob.com" || host === "www.torob.com") && parsed.pathname.startsWith("/p/");
      } catch {
        return false;
      }
    }, "فقط لینک عمومی محصول ترب با قالب https://torob.com/p/... مجاز است"),
});

export type EnqueueTorobReadonlyJobInput = z.infer<typeof EnqueueTorobReadonlyJobInputSchema>;

export type EnqueueTorobReadonlyJobRow = {
  id: string;
  status: string;
  job_type: string;
  idempotency_key: string;
  created_at: string;
};

export type EnqueueTorobReadonlyJobResult = {
  ok: true;
  created: boolean;
  job: EnqueueTorobReadonlyJobRow;
  module_key: typeof MODULE_KEY;
  job_type: typeof JOB_TYPE;
  phase_label: typeof PHASE_LABEL;
  product_url: string;
  direct_ui_execution: false;
  queued_for_worker: true;
};

// automation_* tables are not yet in generated Database types.
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

function normalizeProductUrl(value: string): string {
  const parsed = new URL(value.trim());
  parsed.hash = "";
  return parsed.toString();
}

async function getTorobModuleId(): Promise<string> {
  const { data, error } = await adminDb()
    .from("automation_modules")
    .select("id, module_key, status")
    .eq("module_key", MODULE_KEY)
    .maybeSingle();

  if (error) throw new Error(`بارگذاری ماژول ترب ناموفق بود: ${error.message}`);
  if (!data) {
    throw new Error("ماژول torob_limited_readonly یافت نشد. migration فاز ۲ را اعمال کنید.");
  }
  if (data.status !== "enabled") {
    throw new Error(`ماژول torob_limited_readonly فعال نیست (وضعیت: ${String(data.status)})`);
  }
  return String(data.id);
}

export async function enqueueTorobReadonlyAutomationJob(
  actingUserId: string,
  input: EnqueueTorobReadonlyJobInput,
): Promise<EnqueueTorobReadonlyJobResult> {
  const parsedInput = EnqueueTorobReadonlyJobInputSchema.parse(input);
  const productUrl = normalizeProductUrl(parsedInput.productUrl);
  const moduleId = await getTorobModuleId();
  const idempotencyKey = `phase2-torob-ui-${randomUUID()}`;

  const payload = {
    action: "enqueue_torob_limited_readonly",
    source: "admin-ui",
    module: MODULE_KEY,
    job_type: JOB_TYPE,
    source_kind: "torob",
    mode: "read-only",
    execution_packet: EXECUTION_PACKET,
    direct_ui_execution: false,
    queued_for_worker: true,
    live_execution_requested: true,
    product_count: 1,
    items: [
      {
        test_product_id: "torob-ui-001",
        product_name: "queued torob readonly product",
        product_url: productUrl,
      },
    ],
    limits: {
      max_products: 3,
      max_concurrency: 1,
      min_delay_ms_between_requests: 3000,
      max_sellers_per_product: 3,
      max_total_run_seconds: 300,
      max_total_requests: 10,
    },
    operator_confirmations: {
      no_secrets: true,
      no_login_session_cookie: true,
      no_browser_automation: true,
      manual_not_scheduled: true,
      read_only: true,
      non_production_impacting: true,
    },
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
      priority: 40,
      correlation_id: idempotencyKey,
      created_by: actingUserId,
    })
    .select("id, status, job_type, idempotency_key, created_at")
    .single();

  if (error) throw new Error(`ایجاد دستور ترب ناموفق بود: ${error.message}`);
  if (!data) throw new Error("پاسخ نامعتبر از پایگاه داده.");

  const job: EnqueueTorobReadonlyJobRow = {
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
    action: "torob_readonly_job_enqueued",
    entity_type: "automation_job",
    entity_id: job.id,
    actor_id: actingUserId,
    diff: {
      module_key: MODULE_KEY,
      job_type: JOB_TYPE,
      status: job.status,
      phase_label: PHASE_LABEL,
      idempotency_key: job.idempotency_key,
      product_count: 1,
      direct_ui_execution: false,
      queued_for_worker: true,
    },
  });
  if (auditError) {
    console.warn("[automation] torob audit log insert failed:", auditError.message);
  }

  return {
    ok: true,
    created: true,
    job,
    module_key: MODULE_KEY,
    job_type: JOB_TYPE,
    phase_label: PHASE_LABEL,
    product_url: productUrl,
    direct_ui_execution: false,
    queued_for_worker: true,
  };
}
