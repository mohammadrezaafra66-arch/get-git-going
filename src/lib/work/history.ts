import { supabase } from "@/integrations/supabase/client";

/**
 * Audit rows for work_items. Table may land via parallel migration —
 * missing relation returns [] rather than throwing.
 */
export interface WorkItemEvent {
  id: string;
  work_item_id: string;
  actor_id: string | null;
  event_at: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
}

/** Persian labels for known event fields (trigger writes ASCII keys). */
export const EVENT_FIELD_LABELS: Record<string, string> = {
  status: "وضعیت",
  assignee: "مسئول",
  priority: "اولویت",
  title: "عنوان",
  body: "شرح",
};

type WorkItemEventRow = {
  id: string;
  work_item_id: string;
  actor_id: string | null;
  event_at: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
};

function isMissingRelationError(error: {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}): boolean {
  const code = error.code ?? "";
  const blob = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
  // PostgREST schema cache / missing table
  if (code === "PGRST205" || code === "42P01" || code === "PGRST204") return true;
  if (blob.includes("work_item_events") && blob.includes("does not exist")) {
    return true;
  }
  if (blob.includes("could not find the table") && blob.includes("work_item_events")) {
    return true;
  }
  return false;
}

export async function listWorkItemEvents(
  workItemId: string,
  options?: { limit?: number },
): Promise<WorkItemEvent[]> {
  const limit = Math.min(options?.limit ?? 100, 200);
  const { data, error } = await (supabase as any)
    .from("work_item_events")
    .select("id, work_item_id, actor_id, event_at, field, old_value, new_value")
    .eq("work_item_id", workItemId)
    .order("event_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingRelationError(error)) return [];
    throw error;
  }

  return ((data ?? []) as WorkItemEventRow[]).map((row) => ({
    id: row.id,
    work_item_id: row.work_item_id,
    actor_id: row.actor_id,
    event_at: row.event_at,
    field: row.field,
    old_value: row.old_value,
    new_value: row.new_value,
  }));
}
