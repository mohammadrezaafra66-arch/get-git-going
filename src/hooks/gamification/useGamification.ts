import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  getEmployeeProgress,
  getEmployeeRank,
  getLeaderboard,
  getRankNeighbors,
  type LeaderboardPeriod,
} from "@/lib/operations/gamification";

// ۱. پیشرفت XP کاربر فعلی
export function useMyProgress() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user?.id,
    queryKey: ["my-progress", user?.id],
    queryFn: () => getEmployeeProgress(user!.id),
    staleTime: 60_000,
  });
}

// ۲. رتبه کاربر فعلی
export function useMyRank() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user?.id,
    queryKey: ["my-rank", user?.id],
    queryFn: () => getEmployeeRank(user!.id),
    staleTime: 60_000,
  });
}

// ۳. leaderboard با دوره زمانی
export function useLeaderboard(period: LeaderboardPeriod, limit = 50) {
  return useQuery({
    queryKey: ["leaderboard", period, limit],
    queryFn: () => getLeaderboard(period, { limit }),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

// ۴. همسایه‌های رتبه کاربر فعلی
export function useMyRankNeighbors(period: LeaderboardPeriod = "monthly") {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user?.id,
    queryKey: ["rank-neighbors", user?.id, period],
    queryFn: () => getRankNeighbors(user!.id, period, 3),
    staleTime: 60_000,
  });
}

// ۵. نشان‌های کاربر فعلی
export function useMyAchievements() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user?.id,
    queryKey: ["my-achievements", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_achievements")
        .select(`
          id,
          unlocked_at,
          xp_awarded,
          achievement_id,
          achievements!inner(
            id, key, title_fa, description, icon, xp_reward, enabled
          )
        `)
        .eq("employee_id", user!.id)
        .order("unlocked_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 120_000,
  });
}

// ۶. همه نشان‌ها (قفل + آزاد)
export function useAllAchievements() {
  return useQuery({
    queryKey: ["all-achievements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("achievements")
        .select("*")
        .eq("enabled", true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 300_000,
  });
}

// ۷. داشبورد مدیر
export function useAdminGamificationOverview() {
  return useQuery({
    queryKey: ["admin-gamification-overview"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_gamification_overview");
      if (error) throw error;
      return data as unknown as {
        total_employees: number;
        total_events_today: number;
        top_scorer_today: { employee_id: string; full_name: string; score: number } | null;
        total_penalties_today: number;
        total_xp_awarded_today: number;
      };
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}