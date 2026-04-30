import { supabase } from "@/integrations/supabase/client";

export type EventTypeFilter =
  | "outbound_call" | "inbound_call" | "new_customer_created"
  | "sale_closed" | "mission_completed" | "achievement_unlocked";

export const EVENT_TYPE_FA: Record<string, string> = {
  outbound_call: "تماس خروجی",
  inbound_call: "تماس ورودی",
  new_customer_created: "ثبت مشتری جدید",
  sale_closed: "بستن فروش",
  mission_completed: "تکمیل مأموریت",
  achievement_unlocked: "آزاد شدن مدال",
};

export const EVENT_TYPES: EventTypeFilter[] = [
  "outbound_call", "inbound_call", "new_customer_created",
  "sale_closed", "mission_completed", "achievement_unlocked",
];

export interface AnalyticsRange { from: string; to: string; }
export interface AnalyticsFilters extends AnalyticsRange {
  employeeId?: string | null;
  eventType?: string | null;
}

function nullable(v?: string | null) {
  return v && v.length > 0 ? v : null;
}

export async function getActiveSeason() {
  const { data, error } = await supabase.rpc("gamification_analytics_active_season");
  if (error) throw new Error(error.message);
  return (data as Array<{ id: string; title_fa: string; starts_at: string; ends_at: string }>)[0] ?? null;
}

export async function getEmployees() {
  const { data, error } = await supabase.rpc("gamification_analytics_employees");
  if (error) throw new Error(error.message);
  return (data as Array<{ id: string; full_name: string | null }>) ?? [];
}

export interface SummaryRow {
  total_events: number;
  total_achievements: number;
  total_missions_completed: number;
  active_employees: number;
  avg_events_per_employee: number;
}

export async function getSummary(f: AnalyticsFilters): Promise<SummaryRow> {
  const { data, error } = await supabase.rpc("gamification_analytics_summary", {
    p_from: f.from, p_to: f.to,
    p_employee_id: nullable(f.employeeId),
    p_event_type: nullable(f.eventType),
  });
  if (error) throw new Error(error.message);
  const row = (data as SummaryRow[])[0];
  return row ?? {
    total_events: 0, total_achievements: 0, total_missions_completed: 0,
    active_employees: 0, avg_events_per_employee: 0,
  };
}

export interface TrendRow { day: string; event_type: string; cnt: number; }
export async function getTrend(f: AnalyticsFilters): Promise<TrendRow[]> {
  const { data, error } = await supabase.rpc("gamification_analytics_trend", {
    p_from: f.from, p_to: f.to,
    p_employee_id: nullable(f.employeeId),
    p_event_type: nullable(f.eventType),
  });
  if (error) throw new Error(error.message);
  return (data as TrendRow[]) ?? [];
}

export interface TopEmployeeRow {
  employee_id: string; full_name: string | null;
  events_count: number; missions_count: number; achievements_count: number;
  current_league: string | null;
}
export async function getTopEmployees(f: AnalyticsFilters): Promise<TopEmployeeRow[]> {
  const { data, error } = await supabase.rpc("gamification_analytics_top_employees", {
    p_from: f.from, p_to: f.to,
    p_event_type: nullable(f.eventType),
    p_limit: 50,
  });
  if (error) throw new Error(error.message);
  return (data as TopEmployeeRow[]) ?? [];
}

export interface KpiEffRow {
  event_key: string; title_fa: string | null; xp_amount: number | null;
  is_active: boolean; events_count: number;
}
export async function getKpiEffectiveness(r: AnalyticsRange): Promise<KpiEffRow[]> {
  const { data, error } = await supabase.rpc("gamification_analytics_kpi_effectiveness", {
    p_from: r.from, p_to: r.to,
  });
  if (error) throw new Error(error.message);
  return (data as KpiEffRow[]) ?? [];
}

export interface MissionAnalyticsRow {
  mission_id: string; title_fa: string; xp_reward: number; enabled: boolean;
  completions: number; unique_employees: number; avg_progress: number;
}
export async function getMissionAnalytics(r: AnalyticsRange): Promise<MissionAnalyticsRow[]> {
  const { data, error } = await supabase.rpc("gamification_analytics_missions", {
    p_from: r.from, p_to: r.to,
  });
  if (error) throw new Error(error.message);
  return (data as MissionAnalyticsRow[]) ?? [];
}

export interface AchievementAnalyticsRow {
  achievement_id: string; title_fa: string; xp_reward: number; enabled: boolean;
  unlocks: number; last_unlock: string | null;
}
export async function getAchievementAnalytics(r: AnalyticsRange): Promise<AchievementAnalyticsRow[]> {
  const { data, error } = await supabase.rpc("gamification_analytics_achievements", {
    p_from: r.from, p_to: r.to,
  });
  if (error) throw new Error(error.message);
  return (data as AchievementAnalyticsRow[]) ?? [];
}

export interface LeagueDistributionRow { league: string; employees_count: number; }
export async function getLeagueDistribution(): Promise<LeagueDistributionRow[]> {
  const { data, error } = await supabase.rpc("gamification_analytics_league_distribution");
  if (error) throw new Error(error.message);
  return (data as LeagueDistributionRow[]) ?? [];
}

export interface RiskRow {
  employee_id: string; full_name: string | null;
  events_in_window: number; last_event_at: string | null;
  current_league: string | null; status: "inactive" | "low" | "normal";
}
export async function getRiskEmployees(r: AnalyticsRange): Promise<RiskRow[]> {
  const { data, error } = await supabase.rpc("gamification_analytics_risk", {
    p_from: r.from, p_to: r.to, p_limit: 50,
  });
  if (error) throw new Error(error.message);
  return (data as RiskRow[]) ?? [];
}