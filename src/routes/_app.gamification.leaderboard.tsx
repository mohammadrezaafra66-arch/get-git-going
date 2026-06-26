import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { LeaderboardPeriod } from "@/lib/operations/gamification";
import { useLeaderboard, useMyRankNeighbors } from "@/hooks/gamification/useGamification";
import { useRankTrends } from "@/hooks/gamification/useRankTrends";
import { LeaderboardRow } from "@/components/gamification/LeaderboardRow";

export const Route = createFileRoute("/_app/gamification/leaderboard")({
  component: LeaderboardPage,
});

const PERIOD_TABS: { value: LeaderboardPeriod; label: string }[] = [
  { value: "daily", label: "امروز" },
  { value: "weekly", label: "این هفته" },
  { value: "monthly", label: "این ماه" },
  { value: "all_time", label: "کل" },
];

function RowsSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-16 w-full rounded-lg" />
      ))}
    </div>
  );
}

function LeaderboardPage() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<LeaderboardPeriod>("monthly");

  const leaderboard = useLeaderboard(period, 100);
  const neighbors = useMyRankNeighbors(period);

  const rows = leaderboard.data ?? [];
  const topScore = rows[0]?.score ?? 0;
  const neighborRows = neighbors.data ?? [];
  const neighborTop = neighborRows.reduce((m, r) => (r.score > m ? r.score : m), 0);

  const trendIds = [
    ...rows.map((r) => r.employee_id),
    ...neighborRows.map((r) => r.employee_id),
  ];
  const trends = useRankTrends(trendIds);
  const trendMap = trends.data ?? {};

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="جدول رتبه‌بندی"
          description="رتبه‌بندی کارشناسان فروش بر اساس امتیاز."
        />
        <Button variant="ghost" size="sm" asChild>
          <Link to="/gamification">
            <ChevronRight className="ml-1 h-4 w-4" /> بازگشت
          </Link>
        </Button>
      </div>

      <Tabs value={period} onValueChange={(v) => setPeriod(v as LeaderboardPeriod)} dir="rtl">
        <TabsList className="grid w-full grid-cols-4">
          {PERIOD_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {neighbors.isLoading ? (
        <Card>
          <CardHeader><CardTitle className="text-base">موقعیت شما</CardTitle></CardHeader>
          <CardContent><RowsSkeleton /></CardContent>
        </Card>
      ) : neighborRows.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">موقعیت شما</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {neighborRows.map((n, i) => (
              <LeaderboardRow
                key={`n-${n.employee_id}`}
                row={{
                  employee_id: n.employee_id,
                  full_name: n.full_name ?? "—",
                  score: n.score,
                  rank: n.rank,
                }}
                isCurrentUser={n.employee_id === user?.id}
                period={period}
                topScore={neighborTop}
                index={i}
                previousRank={trendMap[n.employee_id]?.previous_rank ?? null}
              />
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">جدول کامل</CardTitle>
        </CardHeader>
        <CardContent>
          {leaderboard.isLoading ? (
            <RowsSkeleton />
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              هیچ امتیازی ثبت نشده است.
            </div>
          ) : (
            <div className="space-y-2">
              {rows.map((row, i) => (
                <LeaderboardRow
                  key={row.employee_id}
                  row={{
                    employee_id: row.employee_id,
                    full_name: row.full_name ?? "—",
                    score: row.score,
                    rank: row.rank,
                  }}
                  isCurrentUser={row.employee_id === user?.id}
                  period={period}
                  topScore={topScore}
                  index={i}
                  previousRank={trendMap[row.employee_id]?.previous_rank ?? null}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
