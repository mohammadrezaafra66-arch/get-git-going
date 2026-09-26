import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { parseIssabelRecordingName } from "./transcript-filename";
import type { CallTranscriptIngestBody } from "./call-transcript-validate";

type SessionRow = {
  id: string;
  recording_filename: string;
};

export async function ingestCallTranscript(body: CallTranscriptIngestBody): Promise<{
  ok: true;
  session_id: string;
  segment_id: string | null;
  duplicate: boolean;
}> {
  const parsed = parseIssabelRecordingName(body.recording_filename);
  const filename = parsed?.basename ?? body.recording_filename;
  const uniqueid = parsed?.recordingUniqueid ?? body.recording_uniqueid;
  const extension = body.extension ?? parsed?.extension ?? null;
  const prefix = body.prefix ?? parsed?.prefix ?? null;
  const queue = body.queue ?? parsed?.queue ?? null;
  const startedAt =
    body.started_at ?? (parsed ? parsed.startedAtUtc.toISOString() : null);

  const db = supabaseAdmin as unknown as {
    from: (t: string) => {
      upsert: (row: Record<string, unknown>, opts: { onConflict: string }) => {
        select: (cols: string) => {
          single: () => Promise<{ data: SessionRow | null; error: { message: string } | null }>;
        };
      };
      insert: (
        row: Record<string, unknown>,
        opts?: { count?: "exact" },
      ) => {
        select: (cols: string) => {
          maybeSingle: () => Promise<{
            data: { id: string } | null;
            error: { message: string; code?: string } | null;
          }>;
        };
      };
    };
    rpc: (
      name: string,
      args?: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>;
  };

  const sessionRes = await db
    .from("call_transcript_sessions")
    .upsert(
      {
        recording_filename: filename,
        recording_uniqueid: uniqueid,
        uniqueid,
        extension,
        prefix,
        queue,
        direction: body.direction,
        started_at: startedAt,
        ended_at: body.ended_at,
        status: body.kind === "final" || body.eof ? "pending_final" : "live",
      },
      { onConflict: "recording_filename" },
    )
    .select("id, recording_filename")
    .single();

  if (sessionRes.error || !sessionRes.data) {
    throw new Error(sessionRes.error?.message ?? "session_upsert_failed");
  }

  const sessionId = sessionRes.data.id;
  await db.rpc("link_transcript_session_live", { p_session_id: sessionId });

  const segRes = await db
    .from("call_transcript_segments")
    .insert({
      session_id: sessionId,
      kind: body.kind,
      segment_seq: body.segment_seq,
      text: body.text,
      start_ms: body.start_ms,
      end_ms: body.end_ms,
      engine: body.engine,
      latency_ms: body.latency_ms,
    })
    .select("id")
    .maybeSingle();

  if (segRes.error) {
    if (segRes.error.code === "23505") {
      return { ok: true, session_id: sessionId, segment_id: null, duplicate: true };
    }
    throw new Error(segRes.error.message);
  }

  if (body.kind === "final" || body.eof) {
    await db.rpc("link_pending_transcript_sessions", {});
  }

  return {
    ok: true,
    session_id: sessionId,
    segment_id: segRes.data?.id ?? null,
    duplicate: false,
  };
}
