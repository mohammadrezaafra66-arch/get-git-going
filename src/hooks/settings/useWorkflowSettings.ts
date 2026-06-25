import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export interface WorkflowSetting {
  id: string;
  process_key: string;
  process_name_fa: string;
  uploader_role: string | null;
  reviewer_role: string | null;
  timer_minutes: number;
  penalty_enabled: boolean;
  penalty_for: string | null;
  is_active: boolean;
  updated_at: string;
  updated_by: string | null;
}

export interface UpdateWorkflowSettingArgs {
  process_key: string;
  uploader_role?: string | null;
  reviewer_role?: string | null;
  timer_minutes?: number;
  penalty_enabled?: boolean;
  penalty_for?: "uploader" | "reviewer" | "both" | null;
  is_active?: boolean;
}

const QUERY_KEY = ["workflow-settings"] as const;

export function useWorkflowSettings() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<WorkflowSetting[]> => {
      const { data, error } = await supabase.rpc("get_workflow_settings");
      if (error) throw error;
      return (data ?? []) as WorkflowSetting[];
    },
    staleTime: 60_000,
  });
}

export function useUpdateWorkflowSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: UpdateWorkflowSettingArgs) => {
      const payload: Record<string, unknown> = { p_process_key: args.process_key };
      if (args.uploader_role !== undefined) payload.p_uploader_role = args.uploader_role ?? undefined;
      if (args.reviewer_role !== undefined) payload.p_reviewer_role = args.reviewer_role ?? undefined;
      if (args.timer_minutes !== undefined) payload.p_timer_minutes = args.timer_minutes;
      if (args.penalty_enabled !== undefined) payload.p_penalty_enabled = args.penalty_enabled;
      if (args.penalty_for !== undefined && args.penalty_for !== null) payload.p_penalty_for = args.penalty_for;
      if (args.is_active !== undefined) payload.p_is_active = args.is_active;

      const { error } = await supabase.rpc(
        "update_workflow_setting",
        payload as never,
      );
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success("تنظیمات ذخیره شد");
    },
    onError: () => {
      toast.error("خطا در ذخیره تنظیمات");
    },
  });
}