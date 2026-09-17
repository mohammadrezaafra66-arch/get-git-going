import { createFileRoute } from "@tanstack/react-router";
import { processAutoReportQueue, getTorobOpsSettings } from "@/lib/torob-ops/path-a.server";
import { torobOpsAdmin } from "@/lib/torob-ops/db.server";

/**
 * Torob Ops Path A — auto-report worker (public, token-protected).
 *
 * POST /api/public/hooks/process-torob-ops-report-queue
 * Auth: Authorization: Bearer ${TOROB_OPS_WORKER_TOKEN}
 *
 * Does NOT run inside UI request path. Respects kill_switch + auto_report_enabled.
 */
export const Route = createFileRoute("/api/public/hooks/process-torob-ops-report-queue")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.TOROB_OPS_WORKER_TOKEN;
        if (!expected) {
          return new Response(
            JSON.stringify({ ok: false, error: "TOROB_OPS_WORKER_TOKEN is not configured" }),
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

        let limit = 10;
        let dryRunForce = false;
        try {
          const text = await request.text();
          if (text && text.trim().length > 0) {
            const body = JSON.parse(text) as { limit?: number; dry_run?: boolean };
            if (typeof body.limit === "number" && body.limit > 0) limit = Math.min(20, body.limit);
            if (body.dry_run === true) dryRunForce = true;
          }
        } catch {
          /* defaults */
        }

        try {
          const settings = await getTorobOpsSettings();
          if (settings.kill_switch) {
            return Response.json({
              ok: true,
              processed: 0,
              results: [{ skipped: true, reason: "kill_switch" }],
            });
          }

          let actorId = process.env.TOROB_OPS_WORKER_ACTOR_ID?.trim() || "";
          if (!actorId) {
            const { data: adminRole } = await torobOpsAdmin()
              .from("user_roles")
              .select("user_id")
              .eq("role", "admin")
              .limit(1)
              .maybeSingle();
            actorId = adminRole?.user_id ? String(adminRole.user_id) : "";
          }
          if (!actorId) {
            return new Response(
              JSON.stringify({ ok: false, error: "No worker actor id" }),
              { status: 500, headers: { "Content-Type": "application/json" } },
            );
          }

          const summary = await processAutoReportQueue({
            actorId,
            dryRunForce,
            limit,
          });
          return Response.json({ ok: true, ...summary });
        } catch (e: unknown) {
          const msg = (e as Error)?.message ?? "worker error";
          console.error("[torob-ops-worker] run failed", msg);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
