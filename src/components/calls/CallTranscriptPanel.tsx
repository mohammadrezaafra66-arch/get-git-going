import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type SessionRow = {
  id: string;
  status: string;
  call_log_id: string | null;
  linkedid: string | null;
  uniqueid: string | null;
  recording_uniqueid: string | null;
};

type SegmentRow = {
  id: string;
  kind: string;
  segment_seq: number;
  text: string;
  created_at: string;
};

async function loadSessions(args: {
  callLogId?: string | null;
  linkedid?: string | null;
  uniqueid?: string | null;
}): Promise<SessionRow[]> {
  let q = supabase
    .from("call_transcript_sessions" as never)
    .select("id, status, call_log_id, linkedid, uniqueid, recording_uniqueid")
    .order("created_at" as never, { ascending: false } as never)
    .limit(5);
  if (args.callLogId) q = q.eq("call_log_id" as never, args.callLogId as never);
  else {
    const parts: string[] = [];
    if (args.linkedid) parts.push(`linkedid.eq.${args.linkedid}`);
    if (args.uniqueid) {
      parts.push(`uniqueid.eq.${args.uniqueid}`);
      parts.push(`recording_uniqueid.eq.${args.uniqueid}`);
    }
    if (parts.length === 0) return [];
    q = q.or(parts.join(",") as never);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as SessionRow[];
}

async function loadSegments(sessionId: string): Promise<SegmentRow[]> {
  const { data, error } = await supabase
    .from("call_transcript_segments" as never)
    .select("id, kind, segment_seq, text, created_at")
    .eq("session_id" as never, sessionId as never)
    .order("segment_seq" as never, { ascending: true } as never)
    .limit(80);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as SegmentRow[];
}

export function CallTranscriptPanel(props: {
  callLogId?: string | null;
  linkedid?: string | null;
  uniqueid?: string | null;
  pollMs?: number;
}) {
  const pollMs = props.pollMs ?? 1000;
  const sessionsQ = useQuery({
    queryKey: ["call-transcript-sessions", props.callLogId, props.linkedid, props.uniqueid],
    queryFn: () =>
      loadSessions({
        callLogId: props.callLogId,
        linkedid: props.linkedid,
        uniqueid: props.uniqueid,
      }),
    refetchInterval: pollMs,
    enabled: Boolean(props.callLogId || props.linkedid || props.uniqueid),
  });
  const session = sessionsQ.data?.[0] ?? null;
  const segsQ = useQuery({
    queryKey: ["call-transcript-segments", session?.id],
    queryFn: () => loadSegments(session!.id),
    enabled: Boolean(session?.id),
    refetchInterval: pollMs,
  });

  const committed = (segsQ.data ?? []).filter((s) => s.kind === "committed" || s.kind === "final");
  const lastPartial = [...(segsQ.data ?? [])].reverse().find((s) => s.kind === "partial");
  const finalText = committed.filter((s) => s.kind === "final").map((s) => s.text).join(" ");
  const liveText = committed
    .filter((s) => s.kind === "committed")
    .map((s) => s.text)
    .join(" ");

  return (
    <section dir="rtl" className="space-y-2 rounded-md border border-border/60 p-3" data-testid="call-transcript">
      <h3 className="text-sm font-semibold">متن تماس</h3>
      {!session ? (
        <p className="text-xs text-muted-foreground">در حال رونویسی…</p>
      ) : finalText ? (
        <div>
          <p className="text-[11px] text-muted-foreground">متن نهایی</p>
          <p className="whitespace-pre-wrap text-sm leading-7">{finalText}</p>
        </div>
      ) : (
        <div>
          <p className="text-[11px] text-muted-foreground">در حال رونویسی…</p>
          <p className="whitespace-pre-wrap text-sm leading-7">
            {liveText}
            {lastPartial ? (
              <span className="text-muted-foreground"> {lastPartial.text}</span>
            ) : null}
          </p>
        </div>
      )}
    </section>
  );
}
