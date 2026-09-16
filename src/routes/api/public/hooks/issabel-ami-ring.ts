import { createFileRoute } from "@tanstack/react-router";
import {
  ingestAmiRingEvent,
  listMappedExtensions,
} from "@/lib/calls/ingest-ami-ring.server";

/**
 * Live ring/dial ingest (AMI listener or CEL poller on the host).
 *
 * POST /api/public/hooks/issabel-ami-ring
 * GET  /api/public/hooks/issabel-ami-ring  → mapped extensions (poller filter)
 * Auth: Authorization: Bearer ${ISSABEL_IMPORT_WORKER_TOKEN}
 */
function unauthorized() {
  return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

function checkToken(request: Request): boolean {
  const expected = process.env.ISSABEL_IMPORT_WORKER_TOKEN;
  if (!expected) return false;
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  return Boolean(token && token === expected);
}

export const Route = createFileRoute("/api/public/hooks/issabel-ami-ring")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!process.env.ISSABEL_IMPORT_WORKER_TOKEN) {
          return new Response(
            JSON.stringify({ ok: false, error: "ISSABEL_IMPORT_WORKER_TOKEN is not configured" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
        if (!checkToken(request)) return unauthorized();
        try {
          const extensions = await listMappedExtensions();
          return new Response(JSON.stringify({ ok: true, extensions }), {
            status: 200,
            headers: { "Content-Type": "application/json; charset=utf-8" },
          });
        } catch (error) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: "list_failed",
              message: error instanceof Error ? error.message : "unknown error",
            }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
      POST: async ({ request }) => {
        if (!process.env.ISSABEL_IMPORT_WORKER_TOKEN) {
          return new Response(
            JSON.stringify({ ok: false, error: "ISSABEL_IMPORT_WORKER_TOKEN is not configured" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
        if (!checkToken(request)) return unauthorized();

        let body: Record<string, unknown> = {};
        try {
          const text = await request.text();
          if (text && text.trim()) body = JSON.parse(text) as Record<string, unknown>;
        } catch {
          return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const extension = typeof body.extension === "string" ? body.extension : "";
        if (!extension.trim()) {
          return new Response(
            JSON.stringify({ ok: false, error: "extension_required" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        const sourceRaw = typeof body.source === "string" ? body.source : "ami";
        const source =
          sourceRaw === "cel" || sourceRaw === "manual" || sourceRaw === "ami"
            ? sourceRaw
            : "ami";
        const direction =
          body.direction === "outbound" ? ("outbound" as const) : ("inbound" as const);

        try {
          const result = await ingestAmiRingEvent({
            extension,
            callerNumber: typeof body.callerNumber === "string" ? body.callerNumber : null,
            linkedid: typeof body.linkedid === "string" ? body.linkedid : null,
            uniqueid: typeof body.uniqueid === "string" ? body.uniqueid : null,
            eventAt: typeof body.eventAt === "string" ? body.eventAt : null,
            source,
            direction,
            raw:
              body.raw && typeof body.raw === "object"
                ? (body.raw as Record<string, unknown>)
                : null,
          });
          const status = result.ok ? 200 : result.error === "invalid_extension" ? 400 : 500;
          return new Response(JSON.stringify(result), {
            status,
            headers: { "Content-Type": "application/json; charset=utf-8" },
          });
        } catch (error) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: "ingest_failed",
              message: error instanceof Error ? error.message : "unknown error",
            }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
