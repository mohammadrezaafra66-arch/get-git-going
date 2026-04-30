import { supabase } from "@/integrations/supabase/client";

export interface GamificationKpi {
  id: string;
  key: string;
  label_fa: string;
  description: string | null;
  weight: number;
  enabled: boolean;
  team_scope: string;
  source: string;
  unit: string | null;
  direction: "higher_better" | "lower_better";
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface EmployeeScore {
  employee_id: string;
  daily_score: number;
  weekly_score: number;
  monthly_score: number;
  total_score: number;
  normalized_score: number;
  active_work_minutes: number;
  breakdown: Record<
    string,
    {
      value: number;
      weight: number;
      contribution: number;
      period?: "daily" | "weekly" | "monthly" | "total";
      scaled?: boolean;
    }
  >;
  last_calculated_at: string;
}

export async function listKpis(): Promise<GamificationKpi[]> {
  const { data, error } = await supabase
    .from("gamification_kpis" as never)
    .select("*")
    .order("display_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as GamificationKpi[];
}

export interface UpdateKpiInput {
  id: string;
  weight?: number;
  enabled?: boolean;
  description?: string | null;
  team_scope?: string;
  display_order?: number;
}

export async function updateKpi(input: UpdateKpiInput): Promise<void> {
  const { id, ...patch } = input;

  // fetch previous for audit diff
  const { data: before } = await supabase
    .from("gamification_kpis" as never)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("gamification_kpis" as never)
    .update(patch as never)
    .eq("id", id);
  if (error) throw error;

  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await supabase.from("audit_logs").insert({
      actor_id: user.id,
      entity_type: "gamification_kpi",
      entity_id: id,
      action: "kpi_updated",
      diff: { before, after: patch } as never,
    } as never);
  }
}

export async function calculateEmployeeScore(employeeId: string): Promise<unknown> {
  const { data, error } = await supabase.rpc("calculate_employee_score" as never, {
    _employee_id: employeeId,
  } as never);
  if (error) throw error;
  return data;
}

export async function listEmployeeScores(): Promise<EmployeeScore[]> {
  const { data, error } = await supabase
    .from("employee_scores" as never)
    .select("*")
    .order("monthly_score", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as unknown as EmployeeScore[];
}

export type LeaderboardPeriod = "daily" | "weekly" | "monthly" | "all_time";

export interface LeaderboardRow {
  employee_id: string;
  full_name: string | null;
  team: string | null;
  department: string | null;
  role: string | null;
  score: number;
  rank: number;
}

export interface LeaderboardFilters {
  team?: string | null;
  department?: string | null;
  role?: string | null;
  limit?: number;
}

export async function getLeaderboard(
  period: LeaderboardPeriod,
  filters: LeaderboardFilters = {},
): Promise<LeaderboardRow[]> {
  const fnName =
    period === "daily"
      ? "get_leaderboard_daily"
      : period === "weekly"
        ? "get_leaderboard_weekly"
        : period === "all_time"
          ? "get_leaderboard_all_time"
          : "get_leaderboard_monthly";

  const { data, error } = await supabase.rpc(fnName as never, {
    _team: filters.team ?? null,
    _department: filters.department ?? null,
    _role: filters.role ?? null,
    _limit: filters.limit ?? 50,
  } as never);
  if (error) throw error;
  return (data ?? []) as unknown as LeaderboardRow[];
}