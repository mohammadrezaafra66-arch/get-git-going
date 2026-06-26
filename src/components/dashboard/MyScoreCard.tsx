import { Link } from "@tanstack/react-router";
import { Trophy } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Card, CardContent } from "@/components/ui/card";
import { toFaDigits } from "@/lib/i18n/formatters";

export function MyScoreCard() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    enabled: !!user?.id,
    queryKey: ["my-total-score", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_scores" as never)
        .select("total_score")
        .eq("employee_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as { total_score: number } | null;
    },
    staleTime: 60_000,
  });

  const score = data?.total_score;
  const display =
    isLoading || score === undefined || score === null
      ? "—"
      : toFaDigits(Math.round(Number(score)).toLocaleString("en-US"));

  return (
    <Link to="/gamification/leaderboard" className="block">
      <Card className="transition-colors hover:bg-accent/30">
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Trophy className="h-4 w-4" />
            </div>
            <span className="text-sm font-medium">امتیاز من</span>
          </div>
          <span className="text-lg font-bold text-primary">{display}</span>
        </CardContent>
      </Card>
    </Link>
  );
}

export default MyScoreCard;