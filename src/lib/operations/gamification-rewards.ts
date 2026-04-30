import { supabase } from "@/integrations/supabase/client";
import { LEAGUE_TIERS, TIER_FA, type LeagueTier } from "@/lib/operations/gamification-leagues";

export type RewardType = "gift_card" | "cash_bonus" | "commission_bonus" | "paid_leave" | "badge_reward" | "custom";
export const REWARD_TYPES: RewardType[] = ["gift_card", "cash_bonus", "commission_bonus", "paid_leave", "badge_reward", "custom"];
export const REWARD_TYPE_FA: Record<RewardType, string> = {
  gift_card: "کارت هدیه",
  cash_bonus: "پاداش نقدی",
  commission_bonus: "پورسانت اضافه",
  paid_leave: "مرخصی تشویقی",
  badge_reward: "نشان",
  custom: "سفارشی",
};

export type TriggerType = "level_reached" | "achievement_unlocked" | "mission_completed" | "league_reached" | "season_top_rank";
export const TRIGGER_TYPES: TriggerType[] = ["level_reached", "achievement_unlocked", "mission_completed", "league_reached", "season_top_rank"];
export const TRIGGER_TYPE_FA: Record<TriggerType, string> = {
  level_reached: "رسیدن به سطح",
  achievement_unlocked: "آزاد شدن مدال",
  mission_completed: "تکمیل مأموریت",
  league_reached: "رسیدن به لیگ",
  season_top_rank: "رتبه برتر فصل",
};

export type RewardUnit = "toman" | "day" | "percent" | "point" | "item" | "custom";
export const REWARD_UNITS: RewardUnit[] = ["toman", "day", "percent", "point", "item", "custom"];
export const REWARD_UNIT_FA: Record<RewardUnit, string> = {
  toman: "تومان", day: "روز", percent: "درصد", point: "امتیاز", item: "عدد", custom: "سفارشی",
};

export interface RewardRow {
  id: string;
  title_fa: string;
  title_en: string | null;
  description: string | null;
  reward_type: RewardType;
  trigger_type: TriggerType;
  trigger_ref_id: string | null;
  trigger_value: number | null;
  reward_value: number | null;
  reward_unit: RewardUnit;
  requires_manual_approval: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface RewardInput {
  title_fa: string;
  title_en?: string | null;
  description?: string | null;
  reward_type: RewardType;
  trigger_type: TriggerType;
  trigger_ref_id?: string | null;
  trigger_value?: number | null;
  reward_value?: number | null;
  reward_unit: RewardUnit;
  requires_manual_approval: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface AchievementOption { id: string; title_fa: string; }
export interface MissionOption { id: string; title_fa: string; }
export interface LeagueOption { id: string; tier: LeagueTier; title_fa: string; }

const COLS =
  "id,title_fa,title_en,description,reward_type,trigger_type,trigger_ref_id,trigger_value," +
  "reward_value,reward_unit,requires_manual_approval,is_active,sort_order,created_at,updated_at";

function mapRow(r: Record<string, unknown>): RewardRow {
  return {
    id: r.id as string,
    title_fa: r.title_fa as string,
    title_en: (r.title_en as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    reward_type: r.reward_type as RewardType,
    trigger_type: r.trigger_type as TriggerType,
    trigger_ref_id: (r.trigger_ref_id as string | null) ?? null,
    trigger_value: r.trigger_value == null ? null : Number(r.trigger_value),
    reward_value: r.reward_value == null ? null : Number(r.reward_value),
    reward_unit: (r.reward_unit as RewardUnit) ?? "custom",
    requires_manual_approval: Boolean(r.requires_manual_approval),
    is_active: Boolean(r.is_active),
    sort_order: Number(r.sort_order ?? 0),
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

function toDbRow(input: RewardInput) {
  return {
    title_fa: input.title_fa,
    title_en: input.title_en ?? null,
    description: input.description ?? null,
    reward_type: input.reward_type,
    trigger_type: input.trigger_type,
    trigger_ref_id: input.trigger_ref_id ?? null,
    trigger_value: input.trigger_value ?? null,
    reward_value: input.reward_value ?? null,
    reward_unit: input.reward_unit,
    requires_manual_approval: input.requires_manual_approval,
    is_active: input.is_active,
    sort_order: input.sort_order,
  };
}

async function logAudit(action: string, entityId: string, diff: Record<string, unknown>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("audit_logs").insert({
    actor_id: user.id,
    entity_type: "gamification_reward",
    entity_id: entityId,
    action,
    diff: { ...diff, source: "gamification_rewards_admin" } as never,
  } as never);
}

export async function listRewards(): Promise<RewardRow[]> {
  const { data, error } = await supabase
    .from("gamification_rewards")
    .select(COLS)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((r) => mapRow(r as unknown as Record<string, unknown>));
}

export async function createReward(input: RewardInput): Promise<RewardRow> {
  const { data, error } = await supabase
    .from("gamification_rewards")
    .insert(toDbRow(input) as never)
    .select(COLS)
    .single();
  if (error) throw error;
  const row = mapRow(data as unknown as Record<string, unknown>);
  await logAudit("reward_created", row.id, { after: row });
  return row;
}

export async function updateReward(id: string, input: RewardInput): Promise<RewardRow> {
  const { data: before } = await supabase.from("gamification_rewards").select(COLS).eq("id", id).maybeSingle();
  const { data, error } = await supabase
    .from("gamification_rewards")
    .update(toDbRow(input) as never)
    .eq("id", id)
    .select(COLS)
    .single();
  if (error) throw error;
  const row = mapRow(data as unknown as Record<string, unknown>);
  await logAudit("reward_updated", id, {
    before: before ? mapRow(before as unknown as Record<string, unknown>) : null,
    after: row,
  });
  return row;
}

export async function setRewardActive(id: string, is_active: boolean): Promise<void> {
  const { error } = await supabase.from("gamification_rewards").update({ is_active } as never).eq("id", id);
  if (error) throw error;
  await logAudit(is_active ? "reward_enabled" : "reward_disabled", id, { is_active });
}

// ---------- Selector option queries ----------
export async function listAchievementOptions(): Promise<AchievementOption[]> {
  const { data, error } = await supabase
    .from("achievements")
    .select("id,title_fa")
    .order("display_order", { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as unknown as AchievementOption[];
}

export async function listMissionOptions(): Promise<MissionOption[]> {
  const { data, error } = await supabase
    .from("missions")
    .select("id,title_fa")
    .order("sort_order", { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as unknown as MissionOption[];
}

export async function listLeagueOptions(): Promise<LeagueOption[]> {
  const { data, error } = await supabase
    .from("league_settings")
    .select("id,tier,title_fa")
    .not("tier", "is", null)
    .order("sort_order", { ascending: true })
    .limit(50);
  if (error) throw error;
  return ((data ?? []) as unknown as Array<{ id: string; tier: string; title_fa: string }>)
    .filter((r) => LEAGUE_TIERS.includes(r.tier as LeagueTier))
    .map((r) => ({ id: r.id, tier: r.tier as LeagueTier, title_fa: r.title_fa || TIER_FA[r.tier as LeagueTier] }));
}