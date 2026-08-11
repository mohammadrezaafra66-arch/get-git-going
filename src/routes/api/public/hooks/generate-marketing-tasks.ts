import { createFileRoute } from "@tanstack/react-router";
import { generateMarketingTasks } from "@/lib/marketing/generate-marketing-tasks.server";

/**
 * Phase 10 / requirement 224 — daily marketing task generation (public,
 * token-protected). Same shape as the pricing worker hook (PRICE-RT.2).
 *
 * POST /api/public/hooks/generate-marketing-tasks
 * Auth: Authorization: Bearer ${MARKETING_TASKS_WORKER_TOKEN}
 *
 * Driven by host cron — see deploy/app/scripts/marketing-tasks-cron.example.sh.
 * There is no pg_cron extension on this database (verified: pg_extension lists
 * btree_gist, pg_graphql, pg_stat_statements, pg_trgm, pgcrypto, pgjwt,
 * pgsodium, plpgsql, supabase_vault, uuid-ossp, vector — no pg_cron), so host
 * cron calling a token-protected endpoint is the established pattern in this
 * repo, not a new mechanism.
 *
 * Safe to call more than once a day: the SQL function is idempotent and takes
 * a per-day advisory lock, so overlapping runs cannot double-generate.
 *
 * MARKETING_TASKS_WORKER_TOKEN is server-only. It must never carry a VITE_
 * prefix and must never be committed (rules 4/5).
 */
export const Route = createFileRoute("/api/public/hooks/generate-marketing-tasks")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.MARKETING_TASKS_WORKER_TOKEN;
        if (!expected) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: "MARKETING_TASKS_WORKER_TOKEN is not configured",
            }),
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

        // Optional for_date, for a deliberate backfill only. The daily run
        // sends no body and lets the database decide "today" in Tehran.
        let forDate: string | null = null;
        try {
          const text = await request.text();
          if (text && text.trim().length > 0) {
            const body = JSON.parse(text) as { for_date?: unknown };
            if (typeof body.for_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.for_date)) {
              forDate = body.for_date;
            }
          }
        } catch {
          // ignore body parse errors; the daily run has no body
        }

        try {
          const summary = await generateMarketingTasks({ forDate });
          return Response.json(summary);
        } catch (e: unknown) {
          const msg = (e as Error)?.message ?? "worker error";
          console.error("[marketing-tasks-worker] run failed", msg);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
