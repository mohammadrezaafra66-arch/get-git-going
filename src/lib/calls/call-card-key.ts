/**
 * Pure call-card key for Caller ID: one UI card per logical call.
 * Storage remains one-row-per-extension; grouping is app-layer only.
 *
 * Priority: linkedid → uniqueid → normalized phone + minute bucket.
 */

export type CallCardKeyInput = {
  id?: string;
  started_at?: string | null;
  created_at?: string | null;
  extension?: string | null;
  metadata?: Record<string, unknown> | null;
  /** Top-level columns when present on ring/CDR rows */
  linkedid?: string | null;
  uniqueid?: string | null;
};

export function normalizePhoneForCardKey(
  phone: string | null | undefined,
): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  // Iranian mobiles often stored with leading 0 or 98
  if (digits.startsWith("98") && digits.length >= 12) return digits.slice(2);
  if (digits.startsWith("0") && digits.length >= 10) return digits.slice(1);
  return digits;
}

function metaString(
  meta: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (!meta) return null;
  const v = meta[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function extractLinkedId(call: CallCardKeyInput): string | null {
  const top = call.linkedid?.trim() || null;
  if (top) return top;
  return (
    metaString(call.metadata, "linkedid") ??
    metaString(call.metadata, "linkedId") ??
    null
  );
}

export function extractUniqueId(call: CallCardKeyInput): string | null {
  const top = call.uniqueid?.trim() || null;
  if (top) return top;
  return (
    metaString(call.metadata, "uniqueid") ??
    metaString(call.metadata, "uniqueId") ??
    null
  );
}

export function extractPhoneHint(call: CallCardKeyInput): string | null {
  const meta = call.metadata;
  return (
    metaString(meta, "raw_number") ??
    metaString(meta, "stripped_number") ??
    metaString(meta, "caller_number") ??
    null
  );
}

function minuteBucketIso(call: CallCardKeyInput): string {
  const raw = call.started_at ?? call.created_at ?? "";
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms) || ms <= 0) return "unknown";
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  return `${y}${m}${day}${h}${min}`;
}

/**
 * Stable UI card key for a ring/CDR row.
 */
export function getCallCardKey(call: CallCardKeyInput): string {
  const linked = extractLinkedId(call);
  if (linked) return `lid:${linked}`;

  const unique = extractUniqueId(call);
  if (unique) return `uid:${unique}`;

  const phone = normalizePhoneForCardKey(extractPhoneHint(call));
  if (phone) return `ph:${phone}:${minuteBucketIso(call)}`;

  // Last resort: row id (ring:uuid or cdr uuid) — no cross-ext merge
  return `row:${call.id ?? "unknown"}`;
}

export type GroupedCallCard<T extends CallCardKeyInput> = {
  key: string;
  /** Representative row (newest by created_at/started_at) */
  primary: T;
  members: T[];
  extensions: string[];
};

/**
 * Group ring+CDR rows that belong to the same logical call.
 * Order of `primary` prefers CDR over ring when both exist (stable call_log id).
 */
export function groupCallsByCardKey<T extends CallCardKeyInput>(
  calls: T[],
): GroupedCallCard<T>[] {
  const buckets = new Map<string, T[]>();
  for (const call of calls) {
    const key = getCallCardKey(call);
    const list = buckets.get(key);
    if (list) list.push(call);
    else buckets.set(key, [call]);
  }

  const out: GroupedCallCard<T>[] = [];
  for (const [key, members] of buckets) {
    const sorted = [...members].sort((a, b) => {
      const aRing = typeof a.id === "string" && a.id.startsWith("ring:");
      const bRing = typeof b.id === "string" && b.id.startsWith("ring:");
      if (aRing !== bRing) return aRing ? 1 : -1; // CDR first
      const aMs =
        Date.parse(a.created_at ?? a.started_at ?? "") || 0;
      const bMs =
        Date.parse(b.created_at ?? b.started_at ?? "") || 0;
      return bMs - aMs;
    });
    const primary = sorted[0]!;
    const extensions = [
      ...new Set(
        members
          .map((m) => m.extension?.trim())
          .filter((e): e is string => Boolean(e)),
      ),
    ].sort();
    out.push({ key, primary, members: sorted, extensions });
  }

  // Newest groups first
  out.sort((a, b) => {
    const aMs =
      Date.parse(a.primary.created_at ?? a.primary.started_at ?? "") || 0;
    const bMs =
      Date.parse(b.primary.created_at ?? b.primary.started_at ?? "") || 0;
    return bMs - aMs;
  });

  return out;
}
