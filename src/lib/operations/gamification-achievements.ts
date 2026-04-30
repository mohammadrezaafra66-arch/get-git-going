import { supabase } from "@/integrations/supabase/client";

export type ConditionOperator = ">=" | ">" | "=" | "<=" | "<";
export const CONDITION_OPERATORS: ConditionOperator[] = [">=", ">", "=", "<=", "<"];

/**
 * Manually trigger the unlock engine for a single (employee, eventType) pair.
 * The engine is also wired as a DB trigger on employee_score_events, so app
 * code does not normally need to call this — it is provided for explicit
 * recheck flows (e.g. admin "recompute" tools).
 */
export async function checkAndUnlockAchievementsForEmployee(
  employeeId: string,
  eventType: string,
): Promise<{ unlocked: number; items: Array<Record<string, unknown>> }> {
  const { data, error } = await supabase.rpc(
    "check_and_unlock_achievements_for_employee" as never,
    { _employee_id: employeeId, _event_type: eventType } as never,
  );
  if (error) throw error;
  return (data ?? { unlocked: 0, items: [] }) as { unlocked: number; items: Array<Record<string, unknown>> };
}

export interface AchievementRow {
  id: string;
  title_fa: string;
  title_en: string | null;
  description: string | null;
  icon: string | null;
  condition_event_key: string | null;
  condition_operator: ConditionOperator | null;
  condition_value: number | null;
  xp_reward: number;
  enabled: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface AchievementInput {
  title_fa: string;
  title_en?: string | null;
  description?: string | null;
  icon_key?: string | null;
  condition_event_key: string;
  condition_operator: ConditionOperator;
  condition_value: number;
  reward_xp: number;
  is_active: boolean;
  sort_order: number;
}

async function logAudit(action: string, entityId: string, diff: Record<string, unknown>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("audit_logs").insert({
    actor_id: user.id,
    entity_type: "gamification_achievement",
    entity_id: entityId,
    action,
    diff: diff as never,
  } as never);
}

export async function listAchievements(): Promise<AchievementRow[]> {
  const { data, error } = await supabase
    .from("achievements")
    .select("id,title_fa,title_en,description,icon,condition_event_key,condition_operator,condition_value,xp_reward,enabled,display_order,created_at,updated_at")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as unknown as AchievementRow[];
}

export interface KpiOption { event_key: string; title_fa: string; is_active: boolean }
export async function listKpiOptions(): Promise<KpiOption[]> {
  const { data, error } = await supabase
    .from("gamification_kpi_rules" as never)
    .select("event_key,title_fa,is_active")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as KpiOption[];
}

function toRow(input: AchievementInput) {
  return {
    title_fa: input.title_fa,
    title_en: input.title_en ?? null,
    description: input.description ?? null,
    icon: input.icon_key ?? null,
    condition_event_key: input.condition_event_key,
    condition_operator: input.condition_operator,
    condition_value: input.condition_value,
    xp_reward: input.reward_xp,
    enabled: input.is_active,
    display_order: input.sort_order,
    // legacy NOT NULL columns from Phase 8 schema
    key: `ach_${input.condition_event_key}_${input.condition_operator}_${input.condition_value}`,
    rule_type: "score" as const,
    rule_value: input.condition_value,
  };
}

export async function createAchievement(input: AchievementInput): Promise<AchievementRow> {
  const { data, error } = await supabase
    .from("achievements")
    .insert(toRow(input) as never)
    .select("*")
    .single();
  if (error) throw error;
  const row = data as unknown as AchievementRow;
  await logAudit("achievement_created", row.id, { after: row });
  return row;
}

export async function updateAchievement(id: string, input: AchievementInput): Promise<AchievementRow> {
  const { data: before } = await supabase.from("achievements").select("*").eq("id", id).maybeSingle();
  const { data, error } = await supabase
    .from("achievements")
    .update(toRow(input) as never)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  const row = data as unknown as AchievementRow;
  await logAudit("achievement_updated", id, { before, after: row });
  return row;
}

export async function setAchievementActive(id: string, is_active: boolean): Promise<void> {
  const { error } = await supabase
    .from("achievements")
    .update({ enabled: is_active } as never)
    .eq("id", id);
  if (error) throw error;
  await logAudit(is_active ? "achievement_enabled" : "achievement_disabled", id, { is_active });
}