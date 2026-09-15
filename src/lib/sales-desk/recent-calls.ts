/**
 * Sales-desk · recent inbound calls for the caller popup.
 *
 * Window: last 2 minutes. Includes:
 *  - unmatched inbound (customer_id IS NULL), or
 *  - inbound on an extension mapped to the current user via call_log_extensions
 *    (same mapping used by call-activity / import).
 *
 * Uses authenticated browser client; RLS on call_logs still applies.
 * call_logs CDR columns + call_log_extensions are newer than types.ts — cast.
 */
import { supabase } from "@/integrations/supabase/client";

export const RECENT_CALLS_WINDOW_MS = 2 * 60 * 1000;
export const RECENT_CALLS_LIMIT = 20;

export type RecentInboundCall = {
  id: string;
  started_at: string;
  direction: string;
  extension: string | null;
  customer_id: string | null;
  employee_id: string | null;
  is_missed: boolean | null;
  disposition: string | null;
  duration_seconds: number | null;
  metadata: Record<string, unknown> | null;
};

type ExtensionRow = { extension: string | null };

/**
 * Extensions mapped to `userId` in `call_log_extensions` (employee_id = profiles.id).
 */
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

/**
 * Recent inbound rows for the caller popup.
 * Pass `userId` from auth; if omitted, only unmatched inbound are returned.
 */
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

  const extensions =
    options?.userId != null && options.userId !== ""
      ? await listExtensionsForUser(options.userId)
      : [];

  // PostgREST OR: unmatched OR extension.in.(mine)
  const orParts = ["customer_id.is.null"];
  if (extensions.length > 0) {
    const list = extensions.map((e) => `"${e.replace(/"/g, "")}"`).join(",");
    orParts.push(`extension.in.(${list})`);
  }

  const { data, error } = await supabase
    .from("call_logs" as never)
    .select(
      "id, started_at, direction, extension, customer_id, employee_id, is_missed, disposition, duration_seconds, metadata",
    )
    .eq("direction" as never, "inbound" as never)
    .gte("started_at" as never, sinceIso as never)
    .or(orParts.join(",") as never)
    .order("started_at" as never, { ascending: false } as never)
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as RecentInboundCall[];
}
