/**
 * Sales-desk · live + CDR feed for the caller popup.
 *
 * Primary: call_ring_events (AMI / CEL) — last 2 minutes by created_at.
 * Fallback: call_logs — last 15 minutes by created_at.
 */
import { supabase } from "@/integrations/supabase/client";

export const RECENT_CALLS_WINDOW_MS = 15 * 60 * 1000;
export const RING_EVENTS_WINDOW_MS = 2 * 60 * 1000;
export const RECENT_RING_EVENTS_WINDOW_MS = RING_EVENTS_WINDOW_MS;
export const RECENT_CALLS_LIMIT = 20;

export type RecentInboundCall = {
  id: string;
  started_at: string;
  created_at?: string | null;
  direction: string;
  extension: string | null;
  customer_id: string | null;
  employee_id: string | null;
  is_missed: boolean | null;
  disposition: string | null;
  duration_seconds: number | null;
  metadata: Record<string, unknown> | null;
  popup_source?: string;
};

type ExtensionRow = { extension: string | null };

export async function listExtensionsForUser(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("call_log_extensions" as never)
    .select("extension")
    .eq("employee_id" as never, userId as never);

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as ExtensionRow[];
  return rows
    .map((r) => r.extension?.trim())
    .filter((e): e is string => Boolean(e));
}

type RingRow = {
  id: string;
  event_at: string;
  created_at: string;
  extension: string | null;
  caller_number: string | null;
  employee_id: string | null;
  person_id: string | null;
  source: string | null;
  direction: string | null;
  metadata: Record<string, unknown> | null;
};

export async function fetchRecentRingEventsForPopup(options?: {
  userId?: string | null;
  windowMs?: number;
  limit?: number;
  now?: Date;
}): Promise<RecentInboundCall[]> {
  const windowMs = options?.windowMs ?? RING_EVENTS_WINDOW_MS;
  const limit = Math.min(options?.limit ?? RECENT_CALLS_LIMIT, 50);
  const now = options?.now ?? new Date();
  const sinceIso = new Date(now.getTime() - windowMs).toISOString();

  const { data, error } = await supabase
    .from("call_ring_events" as never)
    .select(
      "id, event_at, created_at, extension, caller_number, employee_id, person_id, source, direction, metadata",
    )
    .gte("created_at" as never, sinceIso as never)
    .order("created_at" as never, { ascending: false } as never)
    .limit(limit);

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as RingRow[];

  return rows.map((r) => {
    const meta = { ...(r.metadata ?? {}) };
    if (r.caller_number && meta.raw_number == null) meta.raw_number = r.caller_number;
    if (r.direction) meta.direction = r.direction;
    return {
      id: `ring:${r.id}`,
      started_at: r.event_at,
      created_at: r.created_at,
      direction: r.direction === "outbound" ? "outbound" : "inbound",
      extension: r.extension,
      customer_id: r.person_id,
      employee_id: r.employee_id,
      is_missed: null,
      disposition: null,
      duration_seconds: null,
      metadata: meta,
      popup_source: r.source === "cel" ? "cel_ring" : "ami_ring",
    };
  });
}

export async function fetchRecentInboundForPopup(options?: {
  userId?: string | null;
  windowMs?: number;
  limit?: number;
  now?: Date;
}): Promise<RecentInboundCall[]> {
  const windowMs = options?.windowMs ?? RECENT_CALLS_WINDOW_MS;
  const limit = Math.min(options?.limit ?? RECENT_CALLS_LIMIT, 50);
  const now = options?.now ?? new Date();
  const sinceIso = new Date(now.getTime() - windowMs).toISOString();

  const userId =
    options?.userId != null && options.userId !== "" ? options.userId : null;
  const extensions = userId ? await listExtensionsForUser(userId) : [];

  const orParts: string[] = [];
  if (extensions.length > 0) {
    const list = extensions.map((e) => `"${e.replace(/"/g, "")}"`).join(",");
    orParts.push(`extension.in.(${list})`);
  }
  if (userId) {
    orParts.push(`employee_id.eq.${userId}`);
  }
  if (orParts.length === 0) {
    orParts.push("customer_id.is.null");
  }

  const { data, error } = await supabase
    .from("call_logs" as never)
    .select(
      "id, started_at, created_at, direction, extension, customer_id, employee_id, is_missed, disposition, duration_seconds, metadata",
    )
    .gte("created_at" as never, sinceIso as never)
    .or(orParts.join(",") as never)
    .order("created_at" as never, { ascending: false } as never)
    .limit(limit);

  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as RecentInboundCall[]).map((r) => ({
    ...r,
    popup_source: "cdr",
  }));
}

export async function fetchInboundPopupFeed(options?: {
  userId?: string | null;
  now?: Date;
}): Promise<RecentInboundCall[]> {
  const [rings, cdr] = await Promise.all([
    fetchRecentRingEventsForPopup(options),
    fetchRecentInboundForPopup(options),
  ]);
  const seen = new Set<string>();
  const out: RecentInboundCall[] = [];
  for (const row of [...rings, ...cdr]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}
