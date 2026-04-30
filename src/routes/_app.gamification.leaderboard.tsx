import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Trophy, ChevronRight, Crown } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getLeaderboard, type LeaderboardPeriod } from "@/lib/operations/gamification";
import { supabase } from "@/integrations/supabase/client";
import { LeagueBadge, type LeagueTier } from "@/components/gamification/LeagueBadge";

export const Route = createFileRoute("/_app/gamification/leaderboard")({
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<LeaderboardPeriod>("monthly");

  const q = useQuery({
    queryKey: ["gam", "leaderboard", period],
    queryFn: () => getLeaderboard(period, { limit: 100 }),
    refetchInterval: 30_000,
    staleTime: 60_000,
  });

  // Fetch current league for each employee shown — single batched query
  const employeeIds = (q.data ?? []).map((r) => r.employee_id);
  const leagues = useQuery({
    queryKey: ["gam", "leaderboard-leagues", employeeIds.sort().join(",")],
    enabled: employeeIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_leagues" as never)
        .select("employee_id, league, season")
        .in("employee_id", employeeIds);
      if (error) throw error;
      // pick most recent season per employee (lex sort fallback)
      const map = new Map<string, LeagueTier>();
      type Row = { employee_id: string; league: LeagueTier; season: string };
      for (const row of (data ?? []) as unknown as Row[]) {
        const existing = map.get(row.employee_id);
        if (!existing) map.set(row.employee_id, row.league);
      }
      return map;
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="تابلوی برترین‌ها" description="رتبه‌بندی کارشناسان فروش بر اساس امتیاز." />
        <Button variant="ghost" size="sm" asChild>
          <Link to="/gamification">
            <ChevronRight className="ml-1 h-4 w-4" /> بازگشت به داشبورد
          </Link>
        </Button>
      </div>

      <Tabs value={period} onValueChange={(v) => setPeriod(v as LeaderboardPeriod)} dir="rtl">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="daily">روزانه</TabsTrigger>
          <TabsTrigger value="weekly">هفتگی</TabsTrigger>
          <TabsTrigger value="monthly">ماهانه</TabsTrigger>
          <TabsTrigger value="all_time">تمام دوران</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          {q.isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
          ) : !q.data?.length ? (
            <div className="py-10 text-center text-sm text-muted-foreground">داده‌ای موجود نیست.</div>
          ) : (
            <ul className="divide-y">
              {q.data.map((row) => {
                const isSelf = row.employee_id === user?.id;
                const podium =
                  row.rank === 1 ? "bg-gradient-to-br from-yellow-400 to-amber-600 text-white shadow-yellow-500/40"
                  : row.rank === 2 ? "bg-gradient-to-br from-slate-300 to-slate-500 text-white shadow-slate-400/40"
                  : row.rank === 3 ? "bg-gradient-to-br from-amber-600 to-amber-800 text-white shadow-amber-700/40"
                  : "bg-muted text-muted-foreground";
                const initials = (row.full_name ?? "؟").trim().slice(0, 2);
                const tier = leagues.data?.get(row.employee_id) ?? null;
                return (
                  <li
                    key={row.employee_id}
                    className={`group flex items-center gap-4 px-4 py-3 transition-all ${
                      isSelf
                        ? "bg-gradient-to-l from-primary/15 via-primary/5 to-transparent font-bold"
                        : "hover:bg-muted/40 hover:shadow-[inset_4px_0_0_0_hsl(var(--primary))]"
                    }`}
                  >
                    <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums shadow-md ${podium}`}>
                      {row.rank <= 3 ? <Crown className="h-5 w-5" /> : row.rank}
                    </span>
                    <Avatar className="h-10 w-10 ring-2 ring-background shadow">
                      <AvatarFallback className="bg-gradient-to-br from-primary/30 to-accent/30 text-xs font-bold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm">{row.full_name ?? "—"}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {row.team ?? "—"} · {row.department ?? "—"}
                      </div>
                    </div>
                    <LeagueBadge tier={tier} size="sm" />
                    <div className="flex items-center gap-1 w-24 justify-end text-sm font-bold tabular-nums">
                      <Trophy className="h-4 w-4 text-amber-500" />
                      {Math.floor(row.score)}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
