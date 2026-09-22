/**
 * Per-user Caller ID popup preferences (server-backed).
 * No row → DEFAULT_CALLER_ID_SETTINGS.
 */
import { supabase } from "@/integrations/supabase/client";

export type CallerIdSettings = {
  enabled: boolean;
  show_inbound: boolean;
  show_outbound: boolean;
  show_others_outbound: boolean;
};

export const DEFAULT_CALLER_ID_SETTINGS: CallerIdSettings = {
  enabled: true,
  show_inbound: true,
  show_outbound: true,
  show_others_outbound: false,
};

export const CALLER_ID_SETTINGS_QUERY_KEY = ["caller-id-settings"] as const;

type SettingsRow = CallerIdSettings & { user_id: string };

export async function fetchCallerIdSettings(
  userId: string,
): Promise<CallerIdSettings> {
  const { data, error } = await supabase
    .from("user_caller_id_settings" as never)
    .select("enabled, show_inbound, show_outbound, show_others_outbound")
    .eq("user_id" as never, userId as never)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return { ...DEFAULT_CALLER_ID_SETTINGS };
  const row = data as CallerIdSettings;
  return {
    enabled: row.enabled ?? DEFAULT_CALLER_ID_SETTINGS.enabled,
    show_inbound: row.show_inbound ?? DEFAULT_CALLER_ID_SETTINGS.show_inbound,
    show_outbound: row.show_outbound ?? DEFAULT_CALLER_ID_SETTINGS.show_outbound,
    show_others_outbound:
      row.show_others_outbound ?? DEFAULT_CALLER_ID_SETTINGS.show_others_outbound,
  };
}

export async function upsertCallerIdSettings(
  userId: string,
  settings: CallerIdSettings,
): Promise<CallerIdSettings> {
  const payload: SettingsRow = {
    user_id: userId,
    enabled: settings.enabled,
    show_inbound: settings.show_inbound,
    show_outbound: settings.show_outbound,
    show_others_outbound: settings.show_others_outbound,
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
    .select("enabled, show_inbound, show_outbound, show_others_outbound")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return { ...settings };
  const row = data as CallerIdSettings;
  return {
    enabled: row.enabled,
    show_inbound: row.show_inbound,
    show_outbound: row.show_outbound,
    show_others_outbound: row.show_others_outbound,
  };
}
