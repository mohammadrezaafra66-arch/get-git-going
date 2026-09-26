export const CALL_TRANSCRIPT_MAX_BODY_BYTES = 65_536;
export const CALL_TRANSCRIPT_KINDS = ["partial", "committed", "final"] as const;
export type CallTranscriptKind = (typeof CALL_TRANSCRIPT_KINDS)[number];

export type CallTranscriptIngestBody = {
  recording_filename: string;
  recording_uniqueid: string;
  kind: CallTranscriptKind;
  segment_seq: number;
  text: string;
  start_ms?: number | null;
  end_ms?: number | null;
  engine?: string | null;
  latency_ms?: number | null;
  extension?: string | null;
  prefix?: string | null;
  queue?: string | null;
  direction?: "inbound" | "outbound" | null;
  started_at?: string | null;
  ended_at?: string | null;
  eof?: boolean;
};

export type ValidateOk = { ok: true; body: CallTranscriptIngestBody };
export type ValidateErr = { ok: false; error: string; status: number };

export function checkDedicatedWorkerToken(
  request: Request,
  expected: string | undefined,
): { ok: true } | { ok: false; status: 401 | 500; error: string } {
  if (!expected) {
    return { ok: false, status: 500, error: "CALL_TRANSCRIPT_WORKER_TOKEN is not configured" };
  }
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  if (!token || token !== expected) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}

function asOptString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function validateCallTranscriptBody(
  raw: unknown,
  byteLength: number,
): ValidateOk | ValidateErr {
  if (byteLength > CALL_TRANSCRIPT_MAX_BODY_BYTES) {
    return { ok: false, error: "payload_too_large", status: 413 };
  }
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "invalid_shape", status: 400 };
  }
  const o = raw as Record<string, unknown>;
  const recording_filename = asOptString(o.recording_filename);
  const recording_uniqueid = asOptString(o.recording_uniqueid);
  if (!recording_filename || !recording_uniqueid) {
    return { ok: false, error: "recording_filename_and_uniqueid_required", status: 400 };
  }
  const kindRaw = typeof o.kind === "string" ? o.kind : "";
  if (!CALL_TRANSCRIPT_KINDS.includes(kindRaw as CallTranscriptKind)) {
    return { ok: false, error: "invalid_kind", status: 400 };
  }
  const segment_seq = Number(o.segment_seq);
  if (!Number.isInteger(segment_seq) || segment_seq < 0) {
    return { ok: false, error: "invalid_segment_seq", status: 400 };
  }
  if (typeof o.text !== "string") {
    return { ok: false, error: "text_required", status: 400 };
  }
  const direction =
    o.direction === "outbound" || o.direction === "inbound" ? o.direction : null;
  return {
    ok: true,
    body: {
      recording_filename,
      recording_uniqueid,
      kind: kindRaw as CallTranscriptKind,
      segment_seq,
      text: o.text,
      start_ms: typeof o.start_ms === "number" ? o.start_ms : null,
      end_ms: typeof o.end_ms === "number" ? o.end_ms : null,
      engine: asOptString(o.engine),
      latency_ms: typeof o.latency_ms === "number" ? o.latency_ms : null,
      extension: asOptString(o.extension),
      prefix: asOptString(o.prefix),
      queue: asOptString(o.queue),
      direction,
      started_at: asOptString(o.started_at),
      ended_at: asOptString(o.ended_at),
      eof: o.eof === true,
    },
  };
}
