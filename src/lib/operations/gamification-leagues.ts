import { supabase } from "@/integrations/supabase/client";

export type LeagueTier = "Bronze" | "Silver" | "Gold" | "Platinum" | "Diamond" | "Legend";
export const LEAGUE_TIERS: LeagueTier[] = [
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
  "Diamond",
  "Legend",
];
export const TIER_FA: Record<LeagueTier, string> = {
  Bronze: "برنز",
  Silver: "نقره",
  Gold: "طلا",
  Platinum: "پلاتین",
  Diamond: "الماس",
  Legend: "افسانه",
};

export type SeasonStatus = "draft" | "active" | "closed";
export const SEASON_STATUSES: SeasonStatus[] = ["draft", "active", "closed"];
export const STATUS_FA: Record<SeasonStatus, string> = {
  draft: "پیش‌نویس",
  active: "فعال",
  closed: "بسته",
};

export interface LeagueSettingRow {
  id: string;
  tier: LeagueTier;
  title_fa: string;
  title_en: string | null;
  min_level: number;
  min_xp: number;
  promotion_percent: number;
  demotion_percent: number;
  sort_order: number;
  is_active: boolean;
}

export interface LeagueSettingInput {
  tier: LeagueTier;
  title_fa: string;
  title_en?: string | null;
  min_level: number;
  min_xp: number;
  promotion_percent: number;
  demotion_percent: number;
  sort_order: number;
  is_active: boolean;
}

export interface SeasonRow {
  id: string;
  title_fa: string;
  title_en: string | null;
  starts_at: string;
  ends_at: string;
  status: SeasonStatus;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SeasonInput {
  title_fa: string;
  title_en?: string | null;
  starts_at: string;
  ends_at: string;
  status: SeasonStatus;
}

export interface PreviewRow {
  employee_id: string;
  full_name: string;
  current_tier: LeagueTier;
  score: number;
  rank_in_tier: number;
  suggested_action: "promote" | "demote" | "stay";
  target_tier: LeagueTier;
}

const SETTING_COLS =
  "id,tier,title_fa,title_en,min_level,min_xp,promotion_percent,demotion_percent,sort_order,is_active";
const SEASON_COLS = "id,title_fa,title_en,starts_at,ends_at,status,is_active,created_at,updated_at";

async function logAudit(
  action: string,
  entityType: string,
  entityId: string,
  diff: Record<string, unknown>,
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("audit_logs").insert({
    actor_id: user.id,
    entity_type: entityType,
    entity_id: entityId,
    action,
    diff: { ...diff, source: "gamification_league_admin" } as never,
  } as never);
}

// ---------- League Settings ----------
export async function listLeagueSettings(): Promise<LeagueSettingRow[]> {
  const { data, error } = await supabase
    .from("league_settings")
    .select(SETTING_COLS)
    .not("tier", "is", null)
    .order("sort_order", { ascending: true })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as unknown as LeagueSettingRow[];
}

export async function updateLeagueSetting(
  id: string,
  input: LeagueSettingInput,
): Promise<LeagueSettingRow> {
  const { data: before } = await supabase
    .from("league_settings")
    .select(SETTING_COLS)
    .eq("id", id)
    .maybeSingle();
  const { data, error } = await supabase
    .from("league_settings")
    .update(input as never)
    .eq("id", id)
    .select(SETTING_COLS)
    .single();
  if (error) throw error;
  await logAudit("league_setting_updated", "gamification_league_setting", id, {
    before,
    after: data,
  });
  return data as unknown as LeagueSettingRow;
}

export async function setLeagueSettingActive(id: string, is_active: boolean): Promise<void> {
  const { error } = await supabase
    .from("league_settings")
    .update({ is_active } as never)
    .eq("id", id);
  if (error) throw error;
  await logAudit(
    is_active ? "league_setting_enabled" : "league_setting_disabled",
    "gamification_league_setting",
    id,
    { is_active },
  );
}

// ---------- Seasons ----------
export async function listSeasons(): Promise<SeasonRow[]> {
  const { data, error } = await supabase
    .from("league_seasons")
    .select(SEASON_COLS)
    .order("starts_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as unknown as SeasonRow[];
}

export async function createSeason(input: SeasonInput): Promise<SeasonRow> {
  const { data, error } = await supabase
    .from("league_seasons")
    .insert(input as never)
    .select(SEASON_COLS)
    .single();
  if (error) throw error;
  await logAudit("season_created", "gamification_season", (data as { id: string }).id, {
    after: data,
  });
  return data as unknown as SeasonRow;
}

export async function updateSeason(id: string, input: SeasonInput): Promise<SeasonRow> {
  const { data: before } = await supabase
    .from("league_seasons")
    .select(SEASON_COLS)
    .eq("id", id)
    .maybeSingle();
  const { data, error } = await supabase
    .from("league_seasons")
    .update(input as never)
    .eq("id", id)
    .select(SEASON_COLS)
    .single();
  if (error) throw error;
  await logAudit("season_updated", "gamification_season", id, { before, after: data });
  return data as unknown as SeasonRow;
}

export async function activateSeason(id: string): Promise<void> {
  const { error } = await supabase
    .from("league_seasons")
    .update({ status: "active" } as never)
    .eq("id", id);
  if (error) throw error;
  await logAudit("season_activated", "gamification_season", id, { status: "active" });
}

export async function closeSeason(id: string): Promise<void> {
  const { error } = await supabase
    .from("league_seasons")
    .update({ status: "closed" } as never)
    .eq("id", id);
  if (error) throw error;
  await logAudit("season_closed", "gamification_season", id, { status: "closed" });
}

// ---------- Preview ----------
export async function previewLeagueSeasonChanges(seasonId: string): Promise<PreviewRow[]> {
  const { data, error } = await supabase.rpc(
    "preview_league_season_changes" as never,
    { _season_id: seasonId } as never,
  );
  if (error) throw error;
  await logAudit("league_season_previewed", "gamification_season", seasonId, {
    rows: (data as unknown[] | null)?.length ?? 0,
  });
  return (data ?? []) as unknown as PreviewRow[];
}

// ---------- Orphaned season RPCs (Phase 3 league engine) ----------
/** Live RPC — currently blocked by validate_league_season requiring title_fa. */
export async function startLeagueSeasonRpc(input: {
  name: string;
  start: string;
  end: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc(
    "start_league_season" as never,
    {
      _name: input.name,
      _start: input.start,
      _end: input.end,
    } as never,
  );
  if (error) throw error;
  const id = String(data);
  await logAudit("league_season_started_rpc", "gamification_season", id, {
    name: input.name,
    start: input.start,
    end: input.end,
  });
  return id;
}

/** Live RPC — settle/promote/demote from employee_scores. Same title_fa stop on insert. */
export async function settleLeagueSeasonRpc(): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc("settle_league_season" as never);
  if (error) throw error;
  const result = (data ?? {}) as Record<string, unknown>;
  await logAudit(
    "league_season_settled_rpc",
    "gamification_season",
    String(result.settled_season_id ?? result.season_id ?? "unknown"),
    result,
  );
  return result;
}

export interface CurrentLeagueInfo {
  employee_id?: string;
  season_id?: string;
  season_name?: string;
  league: LeagueTier | null;
  rank: number | null;
  score: number;
  promoted: boolean;
  demoted: boolean;
  season?: unknown;
}

export async function getCurrentLeague(employeeId: string): Promise<CurrentLeagueInfo> {
  const { data, error } = await supabase.rpc(
    "get_current_league" as never,
    {
      _employee_id: employeeId,
    } as never,
  );
  if (error) throw error;
  return (data ?? { league: null, season: null }) as CurrentLeagueInfo;
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

export async function getLeagueLeaderboard(
  league: LeagueTier,
  limit = 50,
  offset = 0,
): Promise<LeagueLeaderboardRow[]> {
  const { data, error } = await supabase.rpc(
    "get_league_leaderboard" as never,
    {
      _league: league,
      _limit: limit,
      _offset: offset,
    } as never,
  );
  if (error) throw error;
  return (data ?? []) as unknown as LeagueLeaderboardRow[];
}

export interface RpcSeasonRow {
  id: string;
  season_name: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  settled_at: string | null;
  created_at: string;
  title_fa: string | null;
  status: SeasonStatus;
}

export async function listRpcSeasons(): Promise<RpcSeasonRow[]> {
  const { data, error } = await supabase
    .from("league_seasons")
    .select("id,season_name,start_date,end_date,is_active,settled_at,created_at,title_fa,status")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as unknown as RpcSeasonRow[];
}
