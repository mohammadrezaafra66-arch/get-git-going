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
  offset?: number;
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
    _offset: filters.offset ?? 0,
  } as never);
  if (error) throw error;
  return (data ?? []) as unknown as LeaderboardRow[];
}

export interface EmployeeRank {
  employee_id: string;
  daily_score: number;
  weekly_score: number;
  monthly_score: number;
  total_score: number;
  daily_rank: number;
  weekly_rank: number;
  monthly_rank: number;
  all_time_rank: number;
}

export async function getEmployeeRank(employeeId: string): Promise<EmployeeRank | null> {
  const { data, error } = await supabase.rpc("get_employee_rank" as never, {
    _employee_id: employeeId,
  } as never);
  if (error) throw error;
  const rows = (data ?? []) as unknown as EmployeeRank[];
  return rows[0] ?? null;
}

export interface RankNeighbor {
  employee_id: string;
  full_name: string | null;
  score: number;
  rank: number;
  relative_position: "self" | "above" | "below";
}

export async function getRankNeighbors(
  employeeId: string,
  period: LeaderboardPeriod = "monthly",
  windowSize = 3,
): Promise<RankNeighbor[]> {
  const { data, error } = await supabase.rpc("get_rank_neighbors" as never, {
    _employee_id: employeeId,
    _period: period,
    _window: windowSize,
  } as never);
  if (error) throw error;
  return (data ?? []) as unknown as RankNeighbor[];
}

// =====================================================
// Phase 2 — XP Progression
// =====================================================

export interface EmployeeProgress {
  employee_id: string;
  level: number;
  xp_current: number;
  xp_total: number;
  xp_next_level: number;
  progress_percent: number;
  last_level_up: string | null;
}

export interface AddXpResult {
  employee_id: string;
  level: number;
  xp_current: number;
  xp_total: number;
  xp_next_level: number;
  leveled_up: boolean;
  old_level?: number;
  new_level?: number;
}

export async function getEmployeeProgress(employeeId: string): Promise<EmployeeProgress> {
  const { data, error } = await supabase.rpc("get_employee_progress" as never, {
    _employee_id: employeeId,
  } as never);
  if (error) throw error;
  return data as unknown as EmployeeProgress;
}

export async function addEmployeeXp(employeeId: string, xp: number): Promise<AddXpResult> {
  const { data, error } = await supabase.rpc("add_employee_xp" as never, {
    _employee_id: employeeId,
    _xp: xp,
  } as never);
  if (error) throw error;
  return data as unknown as AddXpResult;
}

// =====================================================
// Phase 3 — League System
// =====================================================

export type LeagueTier = "Bronze" | "Silver" | "Gold" | "Platinum" | "Diamond" | "Legend";

export interface CurrentLeague {
  employee_id: string;
  season_id: string | null;
  season_name: string | null;
  league: LeagueTier | null;
  rank: number | null;
  score: number;
  promoted: boolean;
  demoted: boolean;
}

export interface LeagueLeaderboardRow {
  employee_id: string;
  full_name: string | null;
  league: LeagueTier;
  score: number;
  rank: number;
  promoted: boolean;
  demoted: boolean;
}

export async function getCurrentLeague(employeeId: string): Promise<CurrentLeague> {
  const { data, error } = await supabase.rpc("get_current_league" as never, {
    _employee_id: employeeId,
  } as never);
  if (error) throw error;
  return data as unknown as CurrentLeague;
}

export async function getLeagueLeaderboard(
  league: LeagueTier,
  limit = 100,
  offset = 0,
): Promise<LeagueLeaderboardRow[]> {
  const { data, error } = await supabase.rpc("get_league_leaderboard" as never, {
    _league: league,
    _limit: limit,
    _offset: offset,
  } as never);
  if (error) throw error;
  return (data ?? []) as unknown as LeagueLeaderboardRow[];
}

// =====================================================
// Phase 4 — Achievements / Missions / Streaks
// =====================================================

export interface UnlockedAchievement {
  id: string;
  achievement_id: string;
  unlocked_at: string;
  key: string;
  title_fa: string;
  description: string | null;
  icon: string | null;
  xp_reward: number;
}

export async function listEmployeeAchievements(employeeId: string): Promise<UnlockedAchievement[]> {
  const { data, error } = await supabase
    .from("employee_achievements" as never)
    .select("id, achievement_id, unlocked_at, achievements:achievement_id(key, title_fa, description, icon, xp_reward)")
    .eq("employee_id", employeeId)
    .order("unlocked_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  type Row = {
    id: string; achievement_id: string; unlocked_at: string;
    achievements: { key: string; title_fa: string; description: string | null; icon: string | null; xp_reward: number } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    achievement_id: r.achievement_id,
    unlocked_at: r.unlocked_at,
    key: r.achievements?.key ?? "",
    title_fa: r.achievements?.title_fa ?? "",
    description: r.achievements?.description ?? null,
    icon: r.achievements?.icon ?? null,
    xp_reward: r.achievements?.xp_reward ?? 0,
  }));
}

export interface MissionWithProgress {
  id: string;
  key: string;
  title_fa: string;
  description: string | null;
  target_value: number;
  xp_reward: number;
  frequency: "daily" | "weekly";
  progress: number;
  completed: boolean;
}

export async function listTodayMissions(employeeId: string): Promise<MissionWithProgress[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data: missions, error: mErr } = await supabase
    .from("missions" as never)
    .select("*")
    .eq("enabled", true)
    .eq("frequency", "daily")
    .order("display_order", { ascending: true });
  if (mErr) throw mErr;

  const { data: progress, error: pErr } = await supabase
    .from("employee_mission_progress" as never)
    .select("mission_id, progress, completed")
    .eq("employee_id", employeeId)
    .eq("period_key", today);
  if (pErr) throw pErr;

  type M = { id: string; key: string; title_fa: string; description: string | null; target_value: number; xp_reward: number; frequency: "daily" | "weekly" };
  type P = { mission_id: string; progress: number; completed: boolean };
  const pMap = new Map(((progress ?? []) as unknown as P[]).map((p) => [p.mission_id, p]));
  return ((missions ?? []) as unknown as M[]).map((m) => ({
    id: m.id,
    key: m.key,
    title_fa: m.title_fa,
    description: m.description,
    target_value: Number(m.target_value),
    xp_reward: m.xp_reward,
    frequency: m.frequency,
    progress: Number(pMap.get(m.id)?.progress ?? 0),
    completed: pMap.get(m.id)?.completed ?? false,
  }));
}

export interface EmployeeStreak {
  streak_type: string;
  current_count: number;
  best_count: number;
  last_event_date: string | null;
}

export async function listEmployeeStreaks(employeeId: string): Promise<EmployeeStreak[]> {
  const { data, error } = await supabase
    .from("employee_streaks" as never)
    .select("streak_type, current_count, best_count, last_event_date")
    .eq("employee_id", employeeId);
  if (error) throw error;
  return (data ?? []) as unknown as EmployeeStreak[];
}