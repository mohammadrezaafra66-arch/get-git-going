import { createFileRoute } from "@tanstack/react-router";
import {
  CALL_TRANSCRIPT_MAX_BODY_BYTES,
  checkDedicatedWorkerToken,
  validateCallTranscriptBody,
} from "@/lib/calls/call-transcript-validate";
import { ingestCallTranscript } from "@/lib/calls/ingest-call-transcript.server";

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

/**
 * POST /api/public/hooks/call-transcript
 * Auth: Authorization: Bearer ${CALL_TRANSCRIPT_WORKER_TOKEN}
 * Never reuse ISSABEL_IMPORT_WORKER_TOKEN.
 */
export const Route = createFileRoute("/api/public/hooks/call-transcript")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = checkDedicatedWorkerToken(
          request,
          process.env.CALL_TRANSCRIPT_WORKER_TOKEN,
        );
        if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

        const buf = Buffer.from(await request.arrayBuffer());
        if (buf.byteLength > CALL_TRANSCRIPT_MAX_BODY_BYTES) {
          return json({ ok: false, error: "payload_too_large" }, 413);
        }
        let parsed: unknown;
        try {
          parsed = buf.byteLength === 0 ? {} : JSON.parse(buf.toString("utf8"));
        } catch {
          return json({ ok: false, error: "invalid_json" }, 400);
        }
        const shape = validateCallTranscriptBody(parsed, buf.byteLength);
        if (!shape.ok) return json({ ok: false, error: shape.error }, shape.status);

        try {
          const result = await ingestCallTranscript(shape.body);
          return json(result, 200);
        } catch (error) {
          return json(
            {
              ok: false,
              error: "ingest_failed",
              message: error instanceof Error ? error.message : "unknown error",
            },
            500,
          );
        }
      },
    },
  },
});
