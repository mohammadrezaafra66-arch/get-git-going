import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { publishProductPrices } from "@/lib/pricing/publish-prices";

/**
 * PRICE-RT.4 — Shared pricing recompute queue processor.
 *
 * Extracted from src/routes/api/public/hooks/process-pricing-queue.ts so the
 * exact same draining logic can be invoked from:
 *  1. The public token-protected webhook (cron/host curl).
 *  2. The authenticated admin server function (UI button).
 *
 * Pricing formulas are NOT touched here; this only orchestrates the existing
 * publishProductPrices path against the queue.
 */

function reasonToSource(reason: string): string {
  switch (reason) {
    case "currency_rate_changed":
    case "currency_rate_activated":
      return "queue_currency_rate_changed";
    case "purchase_price_changed":
    case "purchase_price_activated":
    case "purchase_price_deactivated":
      return "queue_purchase_price_changed";
    case "pricing_rule_changed":
      return "queue_pricing_rule_changed";
    case "shipping_rule_changed":
      return "queue_shipping_rule_changed";
    default:
      return `queue_${reason}`;
  }
}

export type ProcessQueueOptions = {
  batchSize?: number;
  maxAttempts?: number;
  /** Optional acting user id for audit (set when triggered from UI). */
  actingUserId?: string | null;
};

export type ProcessQueueResult = {
  ok: true;
  picked: number;
  succeeded: number;
  failed: number;
  remaining_pending: number;
  duration_ms: number;
  sample_errors: string[];
};

export async function processPricingRecomputeQueue(
  opts: ProcessQueueOptions = {},
): Promise<ProcessQueueResult> {
  const batchSize = Math.min(100, Math.max(1, Math.floor(opts.batchSize ?? 25)));
  const maxAttempts = Math.min(10, Math.max(1, Math.floor(opts.maxAttempts ?? 3)));
  const startedAt = Date.now();

  const { data: claimed, error: claimErr } = await supabaseAdmin.rpc(
    "claim_pricing_recompute_jobs",
    { _batch_size: batchSize, _max_attempts: maxAttempts },
  );
  if (claimErr) {
    throw new Error(claimErr.message);
  }

  const jobs = (claimed ?? []) as Array<{
    id: string;
    product_id: string;
    reason: string;
    source_table: string | null;
    source_id: string | null;
  }>;

  if (jobs.length === 0) {
    const { count } = await supabaseAdmin
      .from("pricing_recompute_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    return {
      ok: true,
      picked: 0,
      succeeded: 0,
      failed: 0,
      remaining_pending: count ?? 0,
      duration_ms: Date.now() - startedAt,
      sample_errors: [],
    };
  }

  let succeeded = 0;
  let failed = 0;
  const sampleErrors: string[] = [];

  for (const job of jobs) {
    try {
      const res = await publishProductPrices(
        {
          productId: job.product_id,
          source: reasonToSource(job.reason),
          actingUserId: opts.actingUserId ?? null,
        },
        supabaseAdmin,
      );
      if (res.failed > 0 && res.succeeded === 0) {
        const firstErr =
          res.results.find((r) => !r.ok)?.error ?? "no sale price types succeeded";
        throw new Error(firstErr);
      }
      const { error: updErr } = await supabaseAdmin
        .from("pricing_recompute_queue")
        .update({
          status: "done",
          processed_at: new Date().toISOString(),
          error: null,
        })
        .eq("id", job.id);
      if (updErr) throw updErr;
      succeeded += 1;
    } catch (e: unknown) {
      failed += 1;
      const msg =
        (e as Error)?.message?.slice(0, 1000) ?? "unknown worker error";
      if (sampleErrors.length < 3) sampleErrors.push(msg);
      await supabaseAdmin
        .from("pricing_recompute_queue")
        .update({
          status: "failed",
          processed_at: new Date().toISOString(),
          error: msg,
        })
        .eq("id", job.id);
      console.error(
        "[pricing-worker] job failed",
        { job_id: job.id, product_id: job.product_id, reason: job.reason },
        msg,
      );
    }
  }

  const { count: remaining } = await supabaseAdmin
    .from("pricing_recompute_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  const summary: ProcessQueueResult = {
    ok: true,
    picked: jobs.length,
    succeeded,
    failed,
    remaining_pending: remaining ?? 0,
    duration_ms: Date.now() - startedAt,
    sample_errors: sampleErrors,
  };
  console.log("[pricing-worker] run complete", summary);
  return summary;
}