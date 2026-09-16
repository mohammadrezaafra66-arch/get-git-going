/**
 * Calm Mind work_* domain types — mirrors CHECK constraints in
 * supabase/migrations/20260915233000_543_work_calm_mind.sql
 * (not public.tasks).
 */

export type WorkItemStatus =
  | "pending"
  | "in_progress"
  | "testing"
  | "done"
  | "cancelled";

export type WorkItemKind = "question" | "change_request" | "bug" | "note";

export type WorkItemPriority = "low" | "normal" | "high";

export type WorkDecisionBucket = "today_decide" | "today_do" | "waiting";

export type WorkMode = "request" | "executable";

export type WorkImpactLevel = "none" | "low" | "medium" | "high" | "blocker";

export type WorkTopicStatus = "open" | "closed";

export type WorkMergeSuggestionStatus = "pending" | "accepted" | "dismissed";

export interface WorkItem {
  id: string;
  title: string;
  body: string | null;
  status: WorkItemStatus;
  kind: WorkItemKind;
  priority: WorkItemPriority;
  group_name: string | null;
  section: string | null;
  assignee_id: string | null;
  creator_id: string | null;
  intake_summary: string | null;
  intake_transcript: string | null;
  acceptance_criteria: string | null;
  claimed_due_at: string | null;
  decision_bucket: WorkDecisionBucket | null;
  decision_bucket_date: string | null;
  work_mode: WorkMode;
  impact_level: WorkImpactLevel;
  impact_if_missed: string | null;
  topic_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface WorkTopic {
  id: string;
  title: string;
  body: string | null;
  status: WorkTopicStatus;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkMergeSuggestion {
  id: string;
  source_item_id: string;
  target_item_id: string;
  score: number;
  reason: string | null;
  status: WorkMergeSuggestionStatus;
  created_at: string;
}

/** Shape returned by work_morning_summary RPC (jsonb). */
export interface WorkMorningSummary {
  today_decide: number;
  today_do: number;
  waiting: number;
  open: number;
  top_impact: Array<{
    id: string;
    title: string;
    status: WorkItemStatus;
    impact_level: WorkImpactLevel;
    priority: WorkItemPriority;
    claimed_due_at: string | null;
    decision_bucket: WorkDecisionBucket | null;
  }>;
  as_of_date: string;
}

export interface CreateWorkItemInput {
  title: string;
  body?: string | null;
  kind?: WorkItemKind;
  priority?: WorkItemPriority;
  group_name?: string | null;
  section?: string | null;
  assignee_id?: string | null;
  intake_summary?: string | null;
  intake_transcript?: string | null;
  acceptance_criteria?: string | null;
  decision_bucket?: WorkDecisionBucket | null;
  work_mode?: WorkMode;
  impact_level?: WorkImpactLevel;
  impact_if_missed?: string | null;
  topic_id?: string | null;
}

export type UpdateWorkItemPatch = Partial<
  Pick<
    WorkItem,
    | "title"
    | "body"
    | "status"
    | "kind"
    | "priority"
    | "group_name"
    | "section"
    | "assignee_id"
    | "intake_summary"
    | "intake_transcript"
    | "acceptance_criteria"
    | "claimed_due_at"
    | "decision_bucket"
    | "decision_bucket_date"
    | "work_mode"
    | "impact_level"
    | "impact_if_missed"
    | "topic_id"
  >
>;

export interface ListWorkItemsFilters {
  status?: WorkItemStatus | WorkItemStatus[];
  kind?: WorkItemKind;
  priority?: WorkItemPriority;
  assignee_id?: string;
  creator_id?: string;
  topic_id?: string | null;
  decision_bucket?: WorkDecisionBucket;
  decision_bucket_date?: string;
  /** Exclude done/cancelled when true (default false). */
  openOnly?: boolean;
  search?: string;
  limit?: number;
}

export interface CreateWorkTopicInput {
  title: string;
  body?: string | null;
  owner_id?: string | null;
  status?: WorkTopicStatus;
}

export type UpdateWorkTopicPatch = Partial<
  Pick<WorkTopic, "title" | "body" | "status" | "owner_id">
>;

/** Jaccard similarity threshold used by DB scan and TS enrichment. */
export const WORK_MERGE_SIMILARITY_THRESHOLD = 0.35;
