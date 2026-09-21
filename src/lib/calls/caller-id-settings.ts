/**
 * Per-user Caller ID popup preferences (server-backed).
 * No row → DEFAULT_CALLER_ID_SETTINGS.
 *
 * Extra columns (display_seconds, only_my_*) may land via migration 563 —
 * typed casts keep the UI compiling before types.ts regenerates.
 */
import { supabase } from "@/integrations/supabase/client";

export type CallerIdSettings = {
  enabled: boolean;
  show_inbound: boolean;
  show_outbound: boolean;
  show_others_outbound: boolean;
  /** Card toast TTL in seconds (default 15, clamp 5–120). */
  display_seconds: number;
  /** Only calls involving the user's mapped extensions. */
  only_my_extension: boolean;
  /** Only when customer.responsible_id = current user (after resolve). */
  only_my_customers: boolean;
};

export const DEFAULT_CALLER_ID_SETTINGS: CallerIdSettings = {
  enabled: true,
  show_inbound: true,
  show_outbound: true,
  show_others_outbound: false,
  display_seconds: 15,
  only_my_extension: false,
  only_my_customers: false,
};

export const CALLER_ID_SETTINGS_QUERY_KEY = ["caller-id-settings"] as const;

const SELECT_COLS =
  "enabled, show_inbound, show_outbound, show_others_outbound, display_seconds, only_my_extension, only_my_customers";

type SettingsRow = CallerIdSettings & { user_id: string };

export function clampDisplaySeconds(value: unknown): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n)) return DEFAULT_CALLER_ID_SETTINGS.display_seconds;
  return Math.min(120, Math.max(5, Math.round(n)));
}

function normalizeRow(row: Partial<CallerIdSettings> | null | undefined): CallerIdSettings {
  if (!row) return { ...DEFAULT_CALLER_ID_SETTINGS };
  return {
    enabled: row.enabled ?? DEFAULT_CALLER_ID_SETTINGS.enabled,
    show_inbound: row.show_inbound ?? DEFAULT_CALLER_ID_SETTINGS.show_inbound,
    show_outbound: row.show_outbound ?? DEFAULT_CALLER_ID_SETTINGS.show_outbound,
    show_others_outbound:
      row.show_others_outbound ?? DEFAULT_CALLER_ID_SETTINGS.show_others_outbound,
    display_seconds: clampDisplaySeconds(
      row.display_seconds ?? DEFAULT_CALLER_ID_SETTINGS.display_seconds,
    ),
    only_my_extension:
      row.only_my_extension ?? DEFAULT_CALLER_ID_SETTINGS.only_my_extension,
    only_my_customers:
      row.only_my_customers ?? DEFAULT_CALLER_ID_SETTINGS.only_my_customers,
  };
}

export async function fetchCallerIdSettings(
  userId: string,
): Promise<CallerIdSettings> {
  const { data, error } = await supabase
    .from("user_caller_id_settings" as never)
    .select(SELECT_COLS)
    .eq("user_id" as never, userId as never)
    .maybeSingle();

  // Column missing (migration not applied) → retry legacy select
  if (error) {
    const msg = error.message || "";
    if (/display_seconds|only_my_extension|only_my_customers|column/i.test(msg)) {
      const legacy = await supabase
        .from("user_caller_id_settings" as never)
        .select("enabled, show_inbound, show_outbound, show_others_outbound")
        .eq("user_id" as never, userId as never)
        .maybeSingle();
      if (legacy.error) throw new Error(legacy.error.message);
      return normalizeRow(legacy.data as Partial<CallerIdSettings> | null);
    }
    throw new Error(error.message);
  }
  if (!data) return { ...DEFAULT_CALLER_ID_SETTINGS };
  return normalizeRow(data as Partial<CallerIdSettings>);
}

export async function upsertCallerIdSettings(
  userId: string,
  settings: CallerIdSettings,
): Promise<CallerIdSettings> {
  const clamped: CallerIdSettings = {
    ...settings,
    display_seconds: clampDisplaySeconds(settings.display_seconds),
  };

  const payload: SettingsRow = {
    user_id: userId,
    enabled: clamped.enabled,
    show_inbound: clamped.show_inbound,
    show_outbound: clamped.show_outbound,
    show_others_outbound: clamped.show_others_outbound,
    display_seconds: clamped.display_seconds,
    only_my_extension: clamped.only_my_extension,
    only_my_customers: clamped.only_my_customers,
  };

  const { data, error } = await supabase
    .from("user_caller_id_settings" as never)
    .upsert(
      {
        ...payload,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "user_id" },
    )
    .select(SELECT_COLS)
    .maybeSingle();

  if (error) {
    const msg = error.message || "";
    // Migration not applied yet — persist legacy columns only
    if (/display_seconds|only_my_extension|only_my_customers|column/i.test(msg)) {
      const legacyPayload = {
        user_id: userId,
        enabled: clamped.enabled,
        show_inbound: clamped.show_inbound,
        show_outbound: clamped.show_outbound,
        show_others_outbound: clamped.show_others_outbound,
        updated_at: new Date().toISOString(),
      };
      const legacy = await supabase
        .from("user_caller_id_settings" as never)
        .upsert(legacyPayload as never, { onConflict: "user_id" })
        .select("enabled, show_inbound, show_outbound, show_others_outbound")
        .maybeSingle();
      if (legacy.error) throw new Error(legacy.error.message);
      return {
        ...normalizeRow(legacy.data as Partial<CallerIdSettings> | null),
        display_seconds: clamped.display_seconds,
        only_my_extension: clamped.only_my_extension,
        only_my_customers: clamped.only_my_customers,
      };
    }
    throw new Error(error.message);
  }
  if (!data) return { ...clamped };
  return normalizeRow(data as Partial<CallerIdSettings>);
}

/** Card TTL ms from settings (replaces hardcoded 5000). */
export function callerIdCardTtlMs(settings: CallerIdSettings): number {
  return clampDisplaySeconds(settings.display_seconds) * 1000;
}
