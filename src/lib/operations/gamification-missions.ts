import { supabase } from "@/integrations/supabase/client";

export type MissionType = "daily" | "weekly" | "monthly" | "custom";
export const MISSION_TYPES: MissionType[] = ["daily", "weekly", "monthly", "custom"];

export type RepeatRule = "none" | "daily" | "weekly" | "monthly";
export const REPEAT_RULES: RepeatRule[] = ["none", "daily", "weekly", "monthly"];

export type ConditionOperator = ">=" | ">" | "=" | "<=" | "<";
export const CONDITION_OPERATORS: ConditionOperator[] = [">=", ">", "=", "<=", "<"];

export interface MissionRow {
  id: string;
  title_fa: string;
  title_en: string | null;
  description: string | null;
  mission_type: MissionType;
  condition_event_key: string | null;
  condition_operator: ConditionOperator | null;
  condition_value: number | null;
  reward_xp: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  repeat_rule: RepeatRule;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface MissionInput {
  title_fa: string;
  title_en?: string | null;
  description?: string | null;
  mission_type: MissionType;
  condition_event_key: string;
  condition_operator: ConditionOperator;
  condition_value: number;
  reward_xp: number;
  is_active: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
  repeat_rule: RepeatRule;
  sort_order: number;
}

export interface KpiOption { event_key: string; title_fa: string; is_active: boolean }

const MISSION_COLUMNS =
  "id,title_fa,title_en,description,mission_type,condition_event_key,condition_operator,condition_value," +
  "xp_reward,enabled,starts_at,ends_at,repeat_rule,sort_order,created_at,updated_at";

function mapRow(r: Record<string, unknown>): MissionRow {
  return {
    id: r.id as string,
    title_fa: r.title_fa as string,
    title_en: (r.title_en as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    mission_type: (r.mission_type as MissionType) ?? "daily",
    condition_event_key: (r.condition_event_key as string | null) ?? null,
    condition_operator: (r.condition_operator as ConditionOperator | null) ?? null,
    condition_value: r.condition_value == null ? null : Number(r.condition_value),
    reward_xp: Number(r.xp_reward ?? 0),
    is_active: Boolean(r.enabled),
    starts_at: (r.starts_at as string | null) ?? null,
    ends_at: (r.ends_at as string | null) ?? null,
    repeat_rule: (r.repeat_rule as RepeatRule) ?? "none",
    sort_order: Number(r.sort_order ?? 0),
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

function toDbRow(input: MissionInput) {
  return {
    title_fa: input.title_fa,
    title_en: input.title_en ?? null,
    description: input.description ?? null,
    mission_type: input.mission_type,
    condition_event_key: input.condition_event_key,
    condition_operator: input.condition_operator,
    condition_value: input.condition_value,
    xp_reward: input.reward_xp,
    enabled: input.is_active,
    starts_at: input.starts_at ?? null,
    ends_at: input.ends_at ?? null,
    repeat_rule: input.repeat_rule,
    sort_order: input.sort_order,
    // legacy NOT NULL columns
    key: `mis_${input.mission_type}_${input.condition_event_key}_${input.condition_operator}_${input.condition_value}_${input.repeat_rule}`,
    target_value: input.condition_value,
    frequency: input.mission_type === "custom" ? "daily" : input.mission_type,
  };
}

async function logAudit(action: string, entityId: string, diff: Record<string, unknown>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("audit_logs").insert({
    actor_id: user.id,
    entity_type: "gamification_mission",
    entity_id: entityId,
    action,
    diff: diff as never,
  } as never);
}

export async function listMissions(): Promise<MissionRow[]> {
  const { data, error } = await supabase
    .from("missions")
    .select(MISSION_COLUMNS)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((r) => mapRow(r as unknown as Record<string, unknown>));
}

export async function listKpiOptions(): Promise<KpiOption[]> {
  const { data, error } = await supabase
    .from("gamification_kpi_rules" as never)
    .select("event_key,title_fa,is_active")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as KpiOption[];
}

export async function createMission(input: MissionInput): Promise<MissionRow> {
  const { data, error } = await supabase
    .from("missions")
    .insert(toDbRow(input) as never)
    .select(MISSION_COLUMNS)
    .single();
  if (error) throw error;
  const row = mapRow(data as unknown as Record<string, unknown>);
  await logAudit("mission_created", row.id, { after: row });
  return row;
}

export async function updateMission(id: string, input: MissionInput): Promise<MissionRow> {
  const { data: before } = await supabase.from("missions").select(MISSION_COLUMNS).eq("id", id).maybeSingle();
  const { data, error } = await supabase
    .from("missions")
    .update(toDbRow(input) as never)
    .eq("id", id)
    .select(MISSION_COLUMNS)
    .single();
  if (error) throw error;
  const row = mapRow(data as unknown as Record<string, unknown>);
  await logAudit("mission_updated", id, {
    before: before ? mapRow(before as unknown as Record<string, unknown>) : null,
    after: row,
  });
  return row;
}

export async function setMissionActive(id: string, is_active: boolean): Promise<void> {
  const { error } = await supabase
    .from("missions")
    .update({ enabled: is_active } as never)
    .eq("id", id);
  if (error) throw error;
  await logAudit(is_active ? "mission_enabled" : "mission_disabled", id, { is_active });
}

/**
 * Manually trigger the mission progress engine for a single (employee, eventType).
 * Normally invoked automatically by an AFTER INSERT trigger on
 * employee_score_events; exposed here for explicit recompute flows.
 */
export async function checkAndUpdateMissionProgressForEmployee(
  employeeId: string,
  eventType: string,
): Promise<{ completed: number; items: Array<Record<string, unknown>> }> {
  const { data, error } = await supabase.rpc(
    "check_and_update_mission_progress_for_employee" as never,
    { _employee_id: employeeId, _event_type: eventType } as never,
  );
  if (error) throw error;
  return (data ?? { completed: 0, items: [] }) as {
    completed: number;
    items: Array<Record<string, unknown>>;
  };
}