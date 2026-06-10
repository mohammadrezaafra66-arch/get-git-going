import { supabase } from "@/integrations/supabase/client";

export type BoardAccessStatus = "pending" | "approved" | "rejected";

export interface BoardAccessRequest {
  id: string;
  board_key: string;
  user_id: string;
  status: BoardAccessStatus;
  requested_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface BoardAccessRequestWithProfile extends BoardAccessRequest {
  profile: {
    id: string;
    full_name: string | null;
    phone: string | null;
  } | null;
  roles: string[];
}

export async function fetchMyBoardAccess(
  boardKey: string,
  userId: string,
): Promise<BoardAccessRequest | null> {
  const { data, error } = await supabase
    .from("pricing_board_access_requests")
    .select("*")
    .eq("board_key", boardKey)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as BoardAccessRequest | null) ?? null;
}

export async function requestBoardAccess(
  boardKey: string,
  userId: string,
): Promise<BoardAccessRequest> {
  // ابتدا بررسی موجود بودن
  const existing = await fetchMyBoardAccess(boardKey, userId);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("pricing_board_access_requests")
    .insert({ board_key: boardKey, user_id: userId, status: "pending" })
    .select("*")
    .single();
  if (error) throw error;

  // notification event (داخلی، بدون ارسال)
  await supabase.from("notification_events").insert({
    event_type: "board_access_requested",
    user_id: userId,
    channel: "internal",
    payload: { board_key: boardKey, request_id: (data as BoardAccessRequest).id } as never,
    status: "pending",
  });

  return data as BoardAccessRequest;
}

export async function fetchPendingBoardRequests(
  boardKey: string,
  status: BoardAccessStatus | "all" = "pending",
): Promise<BoardAccessRequestWithProfile[]> {
  let q = supabase
    .from("pricing_board_access_requests")
    .select("*, profile:profiles!pricing_board_access_requests_user_id_fkey(id, full_name, phone)")
    .eq("board_key", boardKey)
    .order("requested_at", { ascending: false })
    .limit(100);
  if (status !== "all") q = q.eq("status", status);

  const { data, error } = await q;
  if (error) {
    // در صورت نبود FK explicit، بدون join تلاش کن
    const fallback = await supabase
      .from("pricing_board_access_requests")
      .select("*")
      .eq("board_key", boardKey)
      .order("requested_at", { ascending: false })
      .limit(100);
    if (fallback.error) throw fallback.error;
    const rows = (fallback.data ?? []) as BoardAccessRequest[];
    const filtered = status === "all" ? rows : rows.filter((r) => r.status === status);
    return enrichWithProfiles(filtered);
  }

  const rows = (data ?? []) as any[];
  // دریافت نقش‌ها
  const userIds = rows.map((r) => r.user_id);
  const rolesMap = await fetchRolesMap(userIds);
  return rows.map((r) => ({
    ...(r as BoardAccessRequest),
    profile: r.profile ?? null,
    roles: rolesMap.get(r.user_id) ?? [],
  }));
}

async function enrichWithProfiles(rows: BoardAccessRequest[]): Promise<BoardAccessRequestWithProfile[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.user_id);
  const [{ data: profiles }, rolesMap] = await Promise.all([
    supabase.from("profiles").select("id, full_name, phone").in("id", ids),
    fetchRolesMap(ids),
  ]);
  const pmap = new Map<string, any>((profiles ?? []).map((p) => [p.id, p]));
  return rows.map((r) => ({
    ...r,
    profile: pmap.get(r.user_id) ?? null,
    roles: rolesMap.get(r.user_id) ?? [],
  }));
}

async function fetchRolesMap(userIds: string[]): Promise<Map<string, string[]>> {
  const m = new Map<string, string[]>();
  if (userIds.length === 0) return m;
  const { data, error } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .in("user_id", userIds);
  if (error) return m;
  for (const r of data ?? []) {
    const arr = m.get((r as any).user_id) ?? [];
    arr.push((r as any).role);
    m.set((r as any).user_id, arr);
  }
  return m;
}

export async function reviewBoardAccessRequest(opts: {
  requestId: string;
  newStatus: "approved" | "rejected";
  reviewerId: string;
  reviewNote?: string;
}): Promise<BoardAccessRequest> {
  const { requestId, newStatus, reviewerId, reviewNote } = opts;

  // فِچ قبلی برای audit
  const { data: prev, error: prevErr } = await supabase
    .from("pricing_board_access_requests")
    .select("*")
    .eq("id", requestId)
    .single();
  if (prevErr) throw prevErr;

  const { data, error } = await supabase
    .from("pricing_board_access_requests")
    .update({
      status: newStatus,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      review_note: reviewNote ?? null,
    })
    .eq("id", requestId)
    .select("*")
    .single();
  if (error) throw error;

  const updated = data as BoardAccessRequest;

  // audit log
  await supabase.from("audit_logs").insert({
    action: newStatus === "approved" ? "pricing_board_access_approved" : "pricing_board_access_rejected",
    entity_type: "pricing_board_access_requests",
    entity_id: updated.id,
    actor_id: reviewerId,
    diff: {
      board_key: updated.board_key,
      target_user_id: updated.user_id,
      previous_status: (prev as any).status,
      new_status: newStatus,
      reviewed_at: updated.reviewed_at,
      review_note: reviewNote ?? null,
      source: "amin_hozoor_board_access",
    } as never,
  });

  // notification event
  await supabase.from("notification_events").insert({
    event_type: newStatus === "approved" ? "board_access_approved" : "board_access_rejected",
    user_id: updated.user_id,
    channel: "internal",
    payload: {
      board_key: updated.board_key,
      request_id: updated.id,
      reviewer_id: reviewerId,
      review_note: reviewNote ?? null,
    } as never,
    status: "pending",
  });

  return updated;
}