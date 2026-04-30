import { supabase } from "@/integrations/supabase/client";

export interface BoardSession {
  id: string;
  board_key: string;
  user_id: string;
  sale_price_type_id: string | null;
  entered_at: string;
  last_seen_at: string;
  left_at: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface OnlineSessionWithProfile extends BoardSession {
  profile: { id: string; full_name: string | null; phone: string | null } | null;
  roles: string[];
}

/** Upsert: ایجاد یا re-open کردن session فعال برای (board_key,user_id) */
export async function startOrUpdateSession(opts: {
  boardKey: string;
  userId: string;
  salePriceTypeId: string | null;
  userAgent?: string;
}): Promise<BoardSession> {
  const { boardKey, userId, salePriceTypeId, userAgent } = opts;

  // پیدا کردن session فعال موجود
  const { data: existing } = await supabase
    .from("pricing_board_viewer_sessions")
    .select("*")
    .eq("board_key", boardKey)
    .eq("user_id", userId)
    .is("left_at", null)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from("pricing_board_viewer_sessions")
      .update({
        last_seen_at: new Date().toISOString(),
        sale_price_type_id: salePriceTypeId,
      })
      .eq("id", (existing as BoardSession).id)
      .select("*")
      .single();
    if (error) throw error;
    return data as BoardSession;
  }

  const { data, error } = await supabase
    .from("pricing_board_viewer_sessions")
    .insert({
      board_key: boardKey,
      user_id: userId,
      sale_price_type_id: salePriceTypeId,
      user_agent: userAgent ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as BoardSession;
}

export async function heartbeatSession(sessionId: string, salePriceTypeId: string | null): Promise<void> {
  await supabase
    .from("pricing_board_viewer_sessions")
    .update({
      last_seen_at: new Date().toISOString(),
      sale_price_type_id: salePriceTypeId,
    })
    .eq("id", sessionId);
}

export async function endSession(sessionId: string): Promise<void> {
  await supabase
    .from("pricing_board_viewer_sessions")
    .update({ left_at: new Date().toISOString() })
    .eq("id", sessionId);
}

/** sessionهای آنلاین (last_seen_at >= now - 90s و left_at is null) */
export async function fetchOnlineSessions(boardKey: string): Promise<OnlineSessionWithProfile[]> {
  const since = new Date(Date.now() - 90_000).toISOString();
  const { data, error } = await supabase
    .from("pricing_board_viewer_sessions")
    .select("*")
    .eq("board_key", boardKey)
    .is("left_at", null)
    .gte("last_seen_at", since)
    .order("last_seen_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  const rows = (data ?? []) as BoardSession[];
  if (rows.length === 0) return [];

  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const [{ data: profiles }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, phone").in("id", userIds),
    supabase.from("user_roles").select("user_id, role").in("user_id", userIds),
  ]);
  const pmap = new Map<string, any>((profiles ?? []).map((p) => [p.id, p]));
  const rmap = new Map<string, string[]>();
  for (const r of roles ?? []) {
    const arr = rmap.get((r as any).user_id) ?? [];
    arr.push((r as any).role);
    rmap.set((r as any).user_id, arr);
  }
  return rows.map((r) => ({
    ...r,
    profile: pmap.get(r.user_id) ?? null,
    roles: rmap.get(r.user_id) ?? [],
  }));
}