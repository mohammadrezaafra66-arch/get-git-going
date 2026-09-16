import { supabase } from "@/integrations/supabase/client";
import type { WorkItem, WorkMergeSuggestion } from "./types";
import { meetsMergeThreshold, scoreWorkItems } from "./similarity";

const mergeTable = () => (supabase as any).from("work_merge_suggestions");
const workItemsTable = () => (supabase as any).from("work_items");
const workRpc = (name: string, args?: Record<string, unknown>) =>
  (supabase as any).rpc(name, args);

export async function listMergeSuggestions(filters?: {
  status?: WorkMergeSuggestion["status"];
  itemId?: string;
  limit?: number;
}): Promise<WorkMergeSuggestion[]> {
  const limit = Math.min(filters?.limit ?? 50, 200);
  let q = mergeTable()
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters?.status) q = q.eq("status", filters.status);
  if (filters?.itemId) {
    q = q.or(
      `source_item_id.eq.${filters.itemId},target_item_id.eq.${filters.itemId}`,
    );
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as WorkMergeSuggestion[];
}

/** DB title-only Jaccard scan (threshold 0.35). Returns inserted pending count. */
export async function scanMergeSuggestions(itemId: string): Promise<number> {
  const { data, error } = await workRpc("work_scan_merge_suggestions", {
    p_item_id: itemId,
  });
  if (error) throw error;
  return typeof data === "number" ? data : Number(data ?? 0);
}

/**
 * Optional Phase 2 enrichment: Jaccard on title+body+intake_summary in TS,
 * then INSERT pending rows via supabase.from when RLS allows.
 *
 * Gap: if insert fails (RLS / unique conflict), RPC title-only suggestions remain
 * the source of truth — this function does not replace the RPC.
 */
export async function enrichMergeSuggestionsWithBody(
  itemId: string,
): Promise<number> {
  const { data: sourceRow, error: srcErr } = await workItemsTable()
    .select("*")
    .eq("id", itemId)
    .maybeSingle();
  if (srcErr) throw srcErr;
  const source = sourceRow as WorkItem | null;
  if (!source) return 0;
  if (source.status === "done" || source.status === "cancelled") return 0;

  const { data: candRows, error: candErr } = await workItemsTable()
    .select("*")
    .not("status", "in", '("done","cancelled")')
    .order("created_at", { ascending: false })
    .limit(200);
  if (candErr) throw candErr;

  let inserted = 0;
  for (const cand of (candRows ?? []) as WorkItem[]) {
    if (cand.id === itemId) continue;
    const score = scoreWorkItems(source, cand);
    if (!meetsMergeThreshold(score)) continue;

    const { error } = await mergeTable().insert({
      source_item_id: itemId,
      target_item_id: cand.id,
      score,
      reason: `jaccard_title_body_intake=${score.toFixed(4)}`,
      status: "pending",
    });
    // Unique pending-pair index → conflict is OK (already suggested).
    if (!error) inserted += 1;
  }

  return inserted;
}

export async function acceptMerge(
  suggestionId: string,
  keepItemId: string,
): Promise<WorkItem> {
  const { data, error } = await workRpc("work_accept_merge", {
    p_suggestion_id: suggestionId,
    p_keep_item_id: keepItemId,
  });
  if (error) throw error;
  return data as WorkItem;
}

export async function dismissMerge(
  suggestionId: string,
): Promise<WorkMergeSuggestion> {
  const { data, error } = await workRpc("work_dismiss_merge", {
    p_suggestion_id: suggestionId,
  });
  if (error) throw error;
  return data as WorkMergeSuggestion;
}
