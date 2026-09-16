import { supabase } from "@/integrations/supabase/client";
import type {
  CreateWorkItemInput,
  ListWorkItemsFilters,
  UpdateWorkItemPatch,
  WorkItem,
} from "./types";
import { scanMergeSuggestions, enrichMergeSuggestionsWithBody } from "./merge";

// Generated Database types lack work_* tables — same cast pattern as tasks board.
const workItemsTable = () => (supabase as any).from("work_items");
const workRpc = (name: string, args?: Record<string, unknown>) =>
  (supabase as any).rpc(name, args);

export async function listWorkItems(
  filters: ListWorkItemsFilters = {},
): Promise<WorkItem[]> {
  const limit = Math.min(filters.limit ?? 100, 200);
  let q = workItemsTable()
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters.status) {
    if (Array.isArray(filters.status)) {
      q = q.in("status", filters.status);
    } else {
      q = q.eq("status", filters.status);
    }
  } else if (filters.openOnly) {
    q = q.not("status", "in", '("done","cancelled")');
  }
  if (filters.kind) q = q.eq("kind", filters.kind);
  if (filters.priority) q = q.eq("priority", filters.priority);
  if (filters.assignee_id) q = q.eq("assignee_id", filters.assignee_id);
  if (filters.creator_id) q = q.eq("creator_id", filters.creator_id);
  if (filters.topic_id === null) q = q.is("topic_id", null);
  else if (filters.topic_id) q = q.eq("topic_id", filters.topic_id);
  if (filters.decision_bucket) q = q.eq("decision_bucket", filters.decision_bucket);
  if (filters.decision_bucket_date) {
    q = q.eq("decision_bucket_date", filters.decision_bucket_date);
  }
  if (filters.search) q = q.ilike("title", `%${filters.search}%`);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as WorkItem[];
}

export async function getWorkItem(id: string): Promise<WorkItem | null> {
  const { data, error } = await workItemsTable()
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as WorkItem | null) ?? null;
}

/**
 * Create via work_create_item RPC, then trigger Phase 2 merge scan (title Jaccard).
 * Optionally enriches with TS Jaccard over title+body+intake_summary (RLS insert).
 */
export async function createWorkItem(
  input: CreateWorkItemInput,
  options?: { enrichBodySimilarity?: boolean },
): Promise<WorkItem> {
  const title = input.title.trim();
  if (!title) throw new Error("عنوان کار الزامی است.");

  const { data, error } = await workRpc("work_create_item", {
    p_title: title,
    p_body: input.body ?? null,
    p_kind: input.kind ?? "note",
    p_priority: input.priority ?? "normal",
    p_group_name: input.group_name ?? null,
    p_section: input.section ?? null,
    p_assignee_id: input.assignee_id ?? null,
    p_intake_summary: input.intake_summary ?? null,
    p_intake_transcript: input.intake_transcript ?? null,
    p_acceptance_criteria: input.acceptance_criteria ?? null,
    p_decision_bucket: input.decision_bucket ?? null,
    p_work_mode: input.work_mode ?? "request",
    p_impact_level: input.impact_level ?? "none",
    p_impact_if_missed: input.impact_if_missed ?? null,
    p_topic_id: input.topic_id ?? null,
  });
  if (error) throw error;
  const item = data as WorkItem;

  // Phase 2: always run DB title scan so merge suggestions appear after create.
  await scanMergeSuggestions(item.id);

  if (options?.enrichBodySimilarity !== false) {
    try {
      await enrichMergeSuggestionsWithBody(item.id);
    } catch {
      // Gap documented in merge.ts — RLS or visibility may block enrichment.
    }
  }

  return item;
}

export async function updateWorkItem(
  id: string,
  patch: UpdateWorkItemPatch,
): Promise<WorkItem> {
  const { data, error } = await workItemsTable()
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as WorkItem;
}
