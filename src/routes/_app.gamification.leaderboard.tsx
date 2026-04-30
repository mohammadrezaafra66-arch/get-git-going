import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Trophy, ChevronRight, Crown } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getLeaderboard, type LeaderboardPeriod } from "@/lib/operations/gamification";

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
                const podium = row.rank === 1 ? "bg-yellow-500 text-white" : row.rank === 2 ? "bg-slate-400 text-white" : row.rank === 3 ? "bg-amber-700 text-white" : "bg-muted";
                return (
                  <li key={row.employee_id} className={`flex items-center gap-4 px-4 py-3 transition-colors ${isSelf ? "bg-primary/10 font-bold" : "hover:bg-muted/40"}`}>
                    <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-sm tabular-nums shadow-sm ${podium}`}>
                      {row.rank <= 3 ? <Crown className="h-4 w-4" /> : row.rank}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm">{row.full_name ?? "—"}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {row.team ?? "—"} · {row.department ?? "—"}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-sm font-bold tabular-nums">
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
