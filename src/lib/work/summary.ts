import { supabase } from "@/integrations/supabase/client";
import type { WorkMorningSummary } from "./types";

/**
 * Morning calm summary — counts decision buckets + top impact open items.
 * Caller: UI morning screen / dashboard widget.
 */
export async function getMorningSummary(): Promise<WorkMorningSummary> {
  const { data, error } = await (supabase as any).rpc("work_morning_summary");
  if (error) throw error;
  return data as WorkMorningSummary;
}
