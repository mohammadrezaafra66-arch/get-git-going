import { supabase } from "@/integrations/supabase/client";
import type {
  CreateWorkTopicInput,
  UpdateWorkTopicPatch,
  WorkTopic,
} from "./types";
import { updateWorkItem } from "./items";

const topicsTable = () => (supabase as any).from("work_topics");

export async function listWorkTopics(filters?: {
  status?: WorkTopic["status"];
  owner_id?: string;
  limit?: number;
}): Promise<WorkTopic[]> {
  const limit = Math.min(filters?.limit ?? 100, 200);
  let q = topicsTable()
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (filters?.status) q = q.eq("status", filters.status);
  if (filters?.owner_id) q = q.eq("owner_id", filters.owner_id);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as WorkTopic[];
}

export async function getWorkTopic(id: string): Promise<WorkTopic | null> {
  const { data, error } = await topicsTable()
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as WorkTopic | null) ?? null;
}

export async function createWorkTopic(
  input: CreateWorkTopicInput,
): Promise<WorkTopic> {
  const title = input.title.trim();
  if (!title) throw new Error("عنوان موضوع الزامی است.");

  const row: Record<string, unknown> = {
    title,
    body: input.body ?? null,
    status: input.status ?? "open",
  };
  if (input.owner_id !== undefined) row.owner_id = input.owner_id;

  // RLS requires owner_id = auth.uid() on insert unless we set it from session.
  if (row.owner_id == null) {
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) throw userErr;
    const uid = userData.user?.id;
    if (!uid) throw new Error("برای ساخت موضوع باید وارد شوید.");
    row.owner_id = uid;
  }

  const { data, error } = await topicsTable().insert(row).select("*").single();
  if (error) throw error;
  return data as WorkTopic;
}

export async function updateWorkTopic(
  id: string,
  patch: UpdateWorkTopicPatch,
): Promise<WorkTopic> {
  const { data, error } = await topicsTable()
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as WorkTopic;
}

export async function linkItemToTopic(
  itemId: string,
  topicId: string,
): Promise<void> {
  await updateWorkItem(itemId, { topic_id: topicId });
}

export async function unlinkItemFromTopic(itemId: string): Promise<void> {
  await updateWorkItem(itemId, { topic_id: null });
}

/** Alias matching brief name. */
export const unlinkItem = unlinkItemFromTopic;
