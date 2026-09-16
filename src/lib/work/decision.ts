import { supabase } from "@/integrations/supabase/client";
import type { WorkDecisionBucket, WorkItem } from "./types";

/**
 * Set or clear decision_bucket via RPC (date defaults to Tehran today in DB).
 * Pass bucket=null to clear.
 */
export async function setDecisionBucket(
  itemId: string,
  bucket: WorkDecisionBucket | null,
  date?: string | null,
): Promise<WorkItem> {
  const args: Record<string, unknown> = {
    p_item_id: itemId,
    p_bucket: bucket,
  };
  if (date !== undefined) args.p_date = date;

  const { data, error } = await (supabase as any).rpc(
    "work_set_decision_bucket",
    args,
  );
  if (error) throw error;
  return data as WorkItem;
}
