import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type UserPenalty = {
  id: string;
  type: string;
  severity: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  inquiry_id: string | null;
  has_appeal: boolean;
  appeal_status: string | null;
  can_appeal: boolean;
};

export function useMyPenalties() {
  return useQuery({
    queryKey: ["penalties", "me"],
    queryFn: async (): Promise<UserPenalty[]> => {
      const { data, error } = await supabase.rpc("get_user_penalties", {});
      if (error) throw new Error(error.message);
      return (data ?? []) as UserPenalty[];
    },
    staleTime: 30_000,
  });
}

export function useUserPenalties(userId: string | null | undefined) {
  return useQuery({
    queryKey: ["penalties", "user", userId],
    queryFn: async (): Promise<UserPenalty[]> => {
      if (!userId) return [];
      const { data, error } = await supabase.rpc("get_user_penalties", { p_user_id: userId });
      if (error) throw new Error(error.message);
      return (data ?? []) as UserPenalty[];
    },
    enabled: !!userId,
    staleTime: 30_000,
  });
}

/** فقط شمارش کارت‌های قرمز فعال یک کاربر — برای PenaltyBadge */
export function useUserPenaltyCount(userId: string | null | undefined) {
  return useQuery({
    queryKey: ["penalties", "count", userId],
    queryFn: async (): Promise<number> => {
      if (!userId) return 0;
      const { count, error } = await supabase
        .from("performance_penalties")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_active", true);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    enabled: !!userId,
    staleTime: 60_000,
  });
}

export type ReviewerAppealItem = {
  reviewer_row_id: string;
  appeal_id: string;
  penalty_id: string;
  appellant_id: string;
  appellant_name: string | null;
  reason: string;
  appeal_created_at: string;
  review_deadline: string;
  appeal_status: string;
  penalty_type: string;
  penalty_severity: string;
  penalty_created_at: string;
  votes: { accept: number; reject: number; pending: number; total: number };
};

export function useReviewerAppeals(currentUserId: string | null | undefined) {
  return useQuery({
    queryKey: ["penalties", "reviewer-appeals", currentUserId],
    queryFn: async (): Promise<ReviewerAppealItem[]> => {
      if (!currentUserId) return [];

      // 1) اعضای هیئت که این کاربر هستند و هنوز رأی نداده‌اند
      const { data: rows, error } = await supabase
        .from("appeal_reviewers")
        .select("id, appeal_id")
        .eq("reviewer_id", currentUserId)
        .is("vote", null);
      if (error) throw new Error(error.message);
      const appealIds = Array.from(new Set((rows ?? []).map((r) => r.appeal_id)));
      if (appealIds.length === 0) return [];

      // 2) اعتراض‌های pending
      const { data: appeals, error: aErr } = await supabase
        .from("penalty_appeals")
        .select("id, penalty_id, appellant_id, reason, created_at, review_deadline, status")
        .in("id", appealIds)
        .eq("status", "pending");
      if (aErr) throw new Error(aErr.message);
      const appealList = appeals ?? [];
      if (appealList.length === 0) return [];

      // 3) تخلف‌های مرتبط
      const penaltyIds = appealList.map((a) => a.penalty_id);
      const { data: penalties, error: pErr } = await supabase
        .from("performance_penalties")
        .select("id, type, severity, created_at")
        .in("id", penaltyIds);
      if (pErr) throw new Error(pErr.message);

      // 4) نام کاربران (appellants)
      const userIds = Array.from(new Set(appealList.map((a) => a.appellant_id)));
      const { data: profiles, error: prErr } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      if (prErr) throw new Error(prErr.message);

      // 5) آراء فعلی برای هر اعتراض
      const { data: allReviewers, error: rErr } = await supabase
        .from("appeal_reviewers")
        .select("appeal_id, vote")
        .in("appeal_id", appealList.map((a) => a.id));
      if (rErr) throw new Error(rErr.message);

      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
      const penaltyMap = new Map((penalties ?? []).map((p) => [p.id, p]));
      const reviewerRowMap = new Map((rows ?? []).map((r) => [r.appeal_id, r.id]));

      const voteAgg = new Map<string, { accept: number; reject: number; pending: number; total: number }>();
      for (const r of allReviewers ?? []) {
        const v = voteAgg.get(r.appeal_id) ?? { accept: 0, reject: 0, pending: 0, total: 0 };
        v.total += 1;
        if (r.vote === "accept") v.accept += 1;
        else if (r.vote === "reject") v.reject += 1;
        else v.pending += 1;
        voteAgg.set(r.appeal_id, v);
      }

      return appealList.map((a) => {
        const pen = penaltyMap.get(a.penalty_id);
        return {
          reviewer_row_id: reviewerRowMap.get(a.id) ?? "",
          appeal_id: a.id,
          penalty_id: a.penalty_id,
          appellant_id: a.appellant_id,
          appellant_name: profileMap.get(a.appellant_id) ?? null,
          reason: a.reason,
          appeal_created_at: a.created_at,
          review_deadline: a.review_deadline,
          appeal_status: a.status,
          penalty_type: pen?.type ?? "",
          penalty_severity: pen?.severity ?? "",
          penalty_created_at: pen?.created_at ?? a.created_at,
          votes: voteAgg.get(a.id) ?? { accept: 0, reject: 0, pending: 0, total: 0 },
        };
      });
    },
    enabled: !!currentUserId,
    staleTime: 30_000,
  });
}

export type AdminPenaltyFilters = {
  userName?: string;
  type?: string | null;
  severity?: string | null;
  fromIso?: string | null;
  toIso?: string | null;
  limit?: number;
  offset?: number;
};

export type AdminPenaltyRow = {
  id: string;
  user_id: string;
  user_name: string | null;
  type: string;
  severity: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  inquiry_id: string | null;
  appeal_status: string | null;
};

export function useAdminPenalties(filters: AdminPenaltyFilters) {
  return useQuery({
    queryKey: ["penalties", "admin", filters],
    queryFn: async (): Promise<{ rows: AdminPenaltyRow[]; total: number }> => {
      const limit = filters.limit ?? 50;
      const offset = filters.offset ?? 0;

      // 1) اگر سرچ کاربر داریم → ابتدا profiles را فیلتر کنیم
      let userIdFilter: string[] | null = null;
      if (filters.userName && filters.userName.trim().length > 0) {
        const { data: profs, error: pErr } = await supabase
          .from("profiles")
          .select("id")
          .ilike("full_name", `%${filters.userName.trim()}%`)
          .limit(500);
        if (pErr) throw new Error(pErr.message);
        userIdFilter = (profs ?? []).map((p) => p.id);
        if (userIdFilter.length === 0) return { rows: [], total: 0 };
      }

      let q = supabase
        .from("performance_penalties")
        .select("id, user_id, type, severity, description, is_active, created_at, inquiry_id", {
          count: "exact",
        })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (filters.type) q = q.eq("type", filters.type);
      if (filters.severity) q = q.eq("severity", filters.severity);
      if (filters.fromIso) q = q.gte("created_at", filters.fromIso);
      if (filters.toIso) q = q.lte("created_at", filters.toIso);
      if (userIdFilter) q = q.in("user_id", userIdFilter);

      const { data, error, count } = await q;
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      if (rows.length === 0) return { rows: [], total: count ?? 0 };

      // join با profiles و penalty_appeals
      const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
      const penaltyIds = rows.map((r) => r.id);

      const [{ data: profs }, { data: appeals }] = await Promise.all([
        supabase.from("profiles").select("id, full_name").in("id", userIds),
        supabase.from("penalty_appeals").select("penalty_id, status").in("penalty_id", penaltyIds),
      ]);

      const nameMap = new Map((profs ?? []).map((p) => [p.id, p.full_name]));
      const appealMap = new Map((appeals ?? []).map((a) => [a.penalty_id, a.status]));

      return {
        rows: rows.map((r) => ({
          id: r.id,
          user_id: r.user_id,
          user_name: nameMap.get(r.user_id) ?? null,
          type: r.type,
          severity: r.severity,
          description: r.description,
          is_active: r.is_active,
          created_at: r.created_at,
          inquiry_id: r.inquiry_id,
          appeal_status: appealMap.get(r.id) ?? null,
        })),
        total: count ?? rows.length,
      };
    },
    staleTime: 15_000,
  });
}

export function usePenaltyStats() {
  return useQuery({
    queryKey: ["penalties", "stats"],
    queryFn: async () => {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [weekRes, monthRes, pendingRes] = await Promise.all([
        supabase
          .from("performance_penalties")
          .select("id", { count: "exact", head: true })
          .gte("created_at", weekAgo),
        supabase
          .from("performance_penalties")
          .select("id", { count: "exact", head: true })
          .gte("created_at", monthAgo),
        supabase
          .from("penalty_appeals")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
      ]);

      if (weekRes.error) throw new Error(weekRes.error.message);
      if (monthRes.error) throw new Error(monthRes.error.message);
      if (pendingRes.error) throw new Error(pendingRes.error.message);

      return {
        week: weekRes.count ?? 0,
        month: monthRes.count ?? 0,
        pendingAppeals: pendingRes.count ?? 0,
      };
    },
    staleTime: 60_000,
  });
}

export function useSubmitAppeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { penaltyId: string; reason: string }) => {
      const { data, error } = await supabase.rpc("submit_appeal", {
        p_penalty_id: vars.penaltyId,
        p_reason: vars.reason,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: () => {
      toast.success("اعتراض شما ثبت شد");
      qc.invalidateQueries({ queryKey: ["penalties"] });
    },
    onError: (e: Error) => toast.error(e.message || "ثبت اعتراض ناموفق بود"),
  });
}

export function useVoteOnAppeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { appealId: string; vote: "accept" | "reject"; note?: string }) => {
      const { data, error } = await supabase.rpc("vote_on_appeal", {
        p_appeal_id: vars.appealId,
        p_vote: vars.vote,
        p_note: vars.note ?? undefined,
      });
      if (error) throw new Error(error.message);
      return data as { status: string; votes?: number };
    },
    onSuccess: (data) => {
      const s = data?.status;
      if (s === "accepted") toast.success("رأی شما ثبت شد — اعتراض پذیرفته شد");
      else if (s === "rejected") toast.success("رأی شما ثبت شد — اعتراض رد شد");
      else toast.success("رأی شما ثبت شد");
      qc.invalidateQueries({ queryKey: ["penalties"] });
    },
    onError: (e: Error) => toast.error(e.message || "ثبت رأی ناموفق بود"),
  });
}

export function useCreateManualPenalty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      userId: string;
      type: string;
      severity: "low" | "medium" | "high";
      description?: string;
    }) => {
      const { data, error } = await supabase.rpc("create_manual_penalty", {
        p_user_id: vars.userId,
        p_type: vars.type,
        p_severity: vars.severity,
        p_description: vars.description ?? undefined,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: () => {
      toast.success("کارت قرمز با موفقیت ثبت شد");
      qc.invalidateQueries({ queryKey: ["penalties"] });
    },
    onError: (e: Error) => toast.error(e.message || "ثبت کارت قرمز ناموفق بود"),
  });
}