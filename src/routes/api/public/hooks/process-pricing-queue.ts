import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { publishProductPrices } from "@/lib/pricing/publish-prices";

/**
 * PRICE-RT.2 — Pricing recompute worker.
 *
 * POST /api/public/hooks/process-pricing-queue
 * Auth: Authorization: Bearer ${PRICING_WORKER_TOKEN}
 *
 * Drains pricing_recompute_queue safely:
 *  - claim_pricing_recompute_jobs(batch_size, max_attempts) (FOR UPDATE SKIP LOCKED)
 *  - calls existing publishProductPrices(supabaseAdmin) for each product
 *  - marks rows done/failed and stores error
 *
 * Pricing formulas are NOT changed; this only automates the existing
 * publish path. Manual recompute UI remains for maintenance/import/recovery.
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

export const Route = createFileRoute("/api/public/hooks/process-pricing-queue")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // --- 1) Auth ----------------------------------------------------
        const expected = process.env.PRICING_WORKER_TOKEN;
        if (!expected) {
          return new Response(
            JSON.stringify({ ok: false, error: "PRICING_WORKER_TOKEN is not configured" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.startsWith("Bearer ")
          ? authHeader.slice("Bearer ".length).trim()
          : "";
        if (!token || token !== expected) {
          return new Response(
            JSON.stringify({ ok: false, error: "Unauthorized" }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }

        // --- 2) Parse params -------------------------------------------
        let batchSize = 25;
        let maxAttempts = 3;
        try {
          const text = await request.text();
          if (text && text.trim().length > 0) {
            const body = JSON.parse(text) as {
              batch_size?: number;
              max_attempts?: number;
            };
            if (typeof body.batch_size === "number" && body.batch_size > 0) {
              batchSize = Math.min(100, Math.floor(body.batch_size));
            }
            if (typeof body.max_attempts === "number" && body.max_attempts > 0) {
              maxAttempts = Math.min(10, Math.floor(body.max_attempts));
            }
          }
        } catch {
          // ignore body parse errors; defaults apply
        }

        const startedAt = Date.now();

        // --- 3) Claim a batch ------------------------------------------
        const { data: claimed, error: claimErr } = await supabaseAdmin.rpc(
          "claim_pricing_recompute_jobs",
          { _batch_size: batchSize, _max_attempts: maxAttempts },
        );

        if (claimErr) {
          console.error("[pricing-worker] claim failed", claimErr);
          return new Response(
            JSON.stringify({ ok: false, error: claimErr.message }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        const jobs = (claimed ?? []) as Array<{
          id: string;
          product_id: string;
          reason: string;
          source_table: string | null;
          source_id: string | null;
        }>;

        if (jobs.length === 0) {
          // Nothing to do — quick exit.
          const { count } = await supabaseAdmin
            .from("pricing_recompute_queue")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending");
          return Response.json({
            ok: true,
            picked: 0,
            succeeded: 0,
            failed: 0,
            remaining_pending: count ?? 0,
            duration_ms: Date.now() - startedAt,
          });
        }

        // --- 4) Process jobs sequentially ------------------------------
        let succeeded = 0;
        let failed = 0;
        const sampleErrors: string[] = [];

        for (const job of jobs) {
          try {
            const res = await publishProductPrices(
              {
                productId: job.product_id,
                source: reasonToSource(job.reason),
                actingUserId: null,
              },
              supabaseAdmin,
            );

            if (res.failed > 0 && res.succeeded === 0) {
              const firstErr =
                res.results.find((r) => !r.ok)?.error ??
                "no sale price types succeeded";
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

        // --- 5) Summary ------------------------------------------------
        const { count: remaining } = await supabaseAdmin
          .from("pricing_recompute_queue")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending");

        const summary = {
          ok: true,
          picked: jobs.length,
          succeeded,
          failed,
          remaining_pending: remaining ?? 0,
          duration_ms: Date.now() - startedAt,
          sample_errors: sampleErrors,
        };
        console.log("[pricing-worker] run complete", summary);
        return Response.json(summary);
      },
    },
  },
});