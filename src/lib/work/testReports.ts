import { supabase } from "@/integrations/supabase/client";

/**
 * Calm Mind test delivery reports — mirrors
 * supabase/migrations/20260916140000_550_work_test_reports.sql
 * (work_test_reports + work_submit_test_report). Not public.tasks.
 */

export type WorkTestVerdict =
  | "approve"
  | "reject_existing_bug"
  | "reject_new_bug";

export interface WorkTestReport {
  id: string;
  work_item_id: string;
  reporter_id: string;
  verdict: WorkTestVerdict;
  notes: string | null;
  linked_bug_item_id: string | null;
  created_at: string;
  deleted_at: string | null;
}

export interface SubmitTestReportInput {
  workItemId: string;
  verdict: WorkTestVerdict;
  notes?: string | null;
  linkedBugItemId?: string | null;
  /** Required by RPC when rejecting and item has no claimed_due_at. */
  claimedDueAt?: string | null;
}

const reportsTable = () => (supabase as any).from("work_test_reports");
const workRpc = (name: string, args?: Record<string, unknown>) =>
  (supabase as any).rpc(name, args);

export async function submitTestReport(
  input: SubmitTestReportInput,
): Promise<WorkTestReport> {
  const { data, error } = await workRpc("work_submit_test_report", {
    p_item_id: input.workItemId,
    p_verdict: input.verdict,
    p_notes: input.notes ?? null,
    p_linked_bug_item_id: input.linkedBugItemId ?? null,
    p_claimed_due_at: input.claimedDueAt ?? null,
  });
  if (error) throw error;
  return data as WorkTestReport;
}

export async function listTestReports(
  workItemId: string,
): Promise<WorkTestReport[]> {
  const { data, error } = await reportsTable()
    .select("*")
    .eq("work_item_id", workItemId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as WorkTestReport[];
}
