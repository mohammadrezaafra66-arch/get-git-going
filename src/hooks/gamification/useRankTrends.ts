import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RankTrend {
  rank: number | null;
  previous_rank: number | null;
}

/**
 * Fetch persisted rank / previous_rank from employee_scores for a set of
 * employees. Used to render trend indicators (▲/▼) on leaderboards.
 * Returns an empty map when there are no ids.
 */
export function useRankTrends(employeeIds: string[]) {
  const ids = [...new Set(employeeIds)].filter(Boolean).sort();
  return useQuery({
    enabled: ids.length > 0,
    queryKey: ["rank-trends", ids],
    queryFn: async (): Promise<Record<string, RankTrend>> => {
      const { data, error } = await supabase
        .from("employee_scores" as never)
        .select("employee_id, rank, previous_rank")
        .in("employee_id", ids);
      if (error) throw error;
      const rows = (data ?? []) as unknown as {
        employee_id: string;
        rank: number | null;
        previous_rank: number | null;
      }[];
      const map: Record<string, RankTrend> = {};
      for (const r of rows) {
        map[r.employee_id] = { rank: r.rank, previous_rank: r.previous_rank };
      }
      return map;
    },
    staleTime: 60_000,
  });
}