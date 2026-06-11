import { supabase } from "@/integrations/supabase/client";
import type { ProfileFieldDefinition, ProfileFieldOption } from "./types";

export async function fetchActiveProfileFields(opts?: {
  registerOnly?: boolean;
}): Promise<ProfileFieldDefinition[]> {
  let q = supabase
    .from("profile_field_definitions")
    .select(
      "id,name,label,field_type,options,is_required,is_active,show_on_register,sort_order,help_text",
    )
    .eq("is_active", true)
    .order("sort_order");
  if (opts?.registerOnly) q = q.eq("show_on_register", true);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as unknown as ProfileFieldDefinition[]).map((r) => ({
    ...r,
    options: Array.isArray(r.options) ? (r.options as ProfileFieldOption[]) : [],
  }));
}

export async function fetchProfileFieldValues(userId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from("profile_field_values")
    .select("field_name,value")
    .eq("user_id", userId);
  if (error) throw error;
  const out: Record<string, unknown> = {};
  for (const r of data ?? []) out[r.field_name as string] = (r as { value: unknown }).value;
  return out;
}

/** Saves all values for a user via RPC (admin or self only, enforced server-side). */
export async function saveProfileFieldValues(userId: string, values: Record<string, unknown>) {
  const entries = Object.entries(values);
  for (const [field_name, value] of entries) {
    const { error } = await supabase.rpc("set_profile_field_value", {
      _user_id: userId,
      _field_name: field_name,
      _value: value as never,
    });
    if (error) throw error;
  }
}
