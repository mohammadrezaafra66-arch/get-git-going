import { createFileRoute } from "@tanstack/react-router";
import { processPricingRecomputeQueue } from "@/lib/pricing/process-recompute-queue.server";

/**
 * PRICE-RT.2 — Pricing recompute worker (public, token-protected).
 *
 * POST /api/public/hooks/process-pricing-queue
 * Auth: Authorization: Bearer ${PRICING_WORKER_TOKEN}
 *
 * Delegates the actual processing to processPricingRecomputeQueue (PRICE-RT.4)
 * so the same draining logic is shared with the authenticated UI trigger.
 */
export const Route = createFileRoute("/api/public/hooks/process-pricing-queue")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        let batchSize = 25;
        let maxAttempts = 3;
        try {
          const text = await request.text();
          if (text && text.trim().length > 0) {
            const body = JSON.parse(text) as { batch_size?: number; max_attempts?: number };
            if (typeof body.batch_size === "number" && body.batch_size > 0) {
              batchSize = body.batch_size;
            }
            if (typeof body.max_attempts === "number" && body.max_attempts > 0) {
              maxAttempts = body.max_attempts;
            }
          }
        } catch {
          // ignore body parse errors; defaults apply
        }

        try {
          const summary = await processPricingRecomputeQueue({ batchSize, maxAttempts });
          return Response.json(summary);
        } catch (e: unknown) {
          const msg = (e as Error)?.message ?? "worker error";
          console.error("[pricing-worker] run failed", msg);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
