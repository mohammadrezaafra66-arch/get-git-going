import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Target, Settings } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { toPersianDigits } from "@/lib/dashboard/utils";
import { LevelBadge } from "@/components/gamification/LevelBadge";
import { XpProgressBar } from "@/components/gamification/XpProgressBar";
import { ScoreChart } from "@/components/gamification/ScoreChart";
import { AchievementCard } from "@/components/gamification/AchievementCard";
import {
  useMyProgress,
  useMyRank,
  useMyAchievements,
} from "@/hooks/gamification/useGamification";
import { listKpis, type EmployeeScore } from "@/lib/operations/gamification";
import { hasAnyRole } from "@/lib/rbac/roles";

export const Route = createFileRoute("/_app/gamification")({
  component: GamificationRoutePage,
});

function GamificationRoutePage() {
  const location = useLocation();
  const normalizedPath = location.pathname.replace(/\/+$/, "") || "/";
  if (normalizedPath !== "/gamification") {
    return <Outlet />;
  }
  return <GamificationProfile />;
}

interface ScoreEvent {
  daily_score: number;
  captured_at: string;
}

function useWeeklyScoreSeries(employeeId: string) {
  return useQuery({
    enabled: !!employeeId,
    queryKey: ["my-score-series-7d", employeeId],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 6);
      since.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("score_snapshots")
        .select("daily_score, captured_at")
        .eq("employee_id", employeeId)
        .gte("captured_at", since.toISOString());
      if (error) throw error;
      const rows = (data ?? []) as ScoreEvent[];

      const buckets = new Map<string, number>();
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        buckets.set(d.toISOString().slice(0, 10), 0);
      }
      for (const r of rows) {
        const key = r.captured_at.slice(0, 10);
        if (buckets.has(key)) {
          buckets.set(key, Math.max(buckets.get(key) ?? 0, Number(r.daily_score || 0)));
        }
      }
      return Array.from(buckets.entries()).map(([date, score]) => ({
        date,
        score,
      }));
    },
    staleTime: 60_000,
  });
}

function GamificationProfile() {
  const { user, profile } = useAuth();
  const { roles } = useAuth();
  // KPI-weights page is admin-only (matches its route guard); align the hub link.
  const isAdmin = hasAnyRole(roles, ["admin"]);
  const employeeId = user?.id ?? "";
  const fullName = profile?.full_name ?? "کاربر";

  const progressQ = useMyProgress();
  const rankQ = useMyRank();
  const achievementsQ = useMyAchievements();
  const seriesQ = useWeeklyScoreSeries(employeeId);

  return (
    <div dir="rtl" className="container mx-auto space-y-6 p-4 md:p-6">
      {/* بخش ۱: هدر پروفایل */}
      <Card>
        <CardContent className="p-4 md:p-6">
          {progressQ.isLoading ? (
            <div className="flex items-center gap-4">
              <Skeleton className="h-16 w-16 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ) : progressQ.data ? (
            <div className="flex flex-col items-center gap-4 md:flex-row md:items-start">
              <LevelBadge level={progressQ.data.level} size="lg" />
              <div className="flex-1 space-y-3 text-center md:text-right">
                <h1 className="text-lg font-bold md:text-xl">{fullName}</h1>
                <XpProgressBar
                  current={progressQ.data.xp_current}
                  nextLevel={progressQ.data.xp_next_level}
                  percent={progressQ.data.progress_percent}
                  level={progressQ.data.level}
                />
                {rankQ.isLoading ? (
                  <Skeleton className="h-4 w-full" />
                ) : rankQ.data ? (
                  <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4 md:text-sm">
                    <RankStat label="رتبه امروز" value={rankQ.data.daily_rank} />
                    <RankStat label="این هفته" value={rankQ.data.weekly_rank} />
                    <RankStat label="این ماه" value={rankQ.data.monthly_rank} />
                    <RankStat label="کل" value={rankQ.data.all_time_rank} />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">رتبه‌ای ثبت نشده</p>
                )}
              </div>
            </div>
          ) : (
            <EmptyEncouragement />
          )}
        </CardContent>
      </Card>

      {/* بخش ۲: نمودار ۷ روزه */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">امتیاز ۷ روز گذشته</CardTitle>
        </CardHeader>
        <CardContent>
          {seriesQ.isLoading ? (
            <Skeleton className="h-[200px] w-full" />
          ) : (
            <ScoreChart data={seriesQ.data ?? []} />
          )}
        </CardContent>
      </Card>

      {/* تفکیک امتیاز */}
      <ScoreBreakdownCard employeeId={employeeId} />

      {/* بخش ۳: نشان‌های اخیر */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">نشان‌های من</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to="/gamification/leaderboard">مشاهده همه</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {achievementsQ.isLoading ? (
            <div className="grid grid-cols-3 gap-3 md:grid-cols-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : (achievementsQ.data ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              هنوز نشانی کسب نکرده‌اید — تلاش کن!
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3 md:grid-cols-4">
              {(achievementsQ.data ?? []).slice(0, 6).map((row) => {
                const ach = (row as unknown as {
                  id: string;
                  unlocked_at: string;
                  achievements: {
                    id: string;
                    key: string;
                    title_fa: string;
                    description: string | null;
                    icon: string | null;
                    xp_reward: number;
                  };
                }).achievements;
                return (
                  <AchievementCard
                    key={row.id}
                    achievement={ach}
                    unlocked={true}
                    unlockedAt={row.unlocked_at}
                  />
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* بخش ۴: لینک‌های سریع */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Button asChild size="lg" className="h-16 gap-2 text-base">
          <Link to="/gamification/leaderboard">
            <Trophy className="h-5 w-5" />
            جدول رتبه‌بندی
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="h-16 gap-2 text-base">
          <Link to="/gamification/leaderboard">
            <Target className="h-5 w-5" />
            همه نشان‌ها
          </Link>
        </Button>
        {isAdmin && (
          <Button asChild size="lg" variant="secondary" className="h-16 gap-2 text-base md:col-span-2">
            <Link to="/gamification/settings">
              <Settings className="h-5 w-5" />
              تنظیمات وزن KPIها (مدیر)
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function RankStat({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="rounded-md border bg-muted/30 p-2 text-center">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="font-bold">
        {value && value > 0 ? `#${toPersianDigits(value)}` : "—"}
      </div>
    </div>
  );
}

function EmptyEncouragement() {
  return (
    <div className="py-6 text-center">
      <div className="mb-2 text-3xl">🚀</div>
      <p className="font-semibold">هنوز امتیازی ثبت نشده — شروع کن!</p>
      <p className="mt-1 text-xs text-muted-foreground">
        با پاسخ سریع به استعلام‌ها و انجام مأموریت‌ها، امتیاز و نشان کسب کن.
      </p>
    </div>
  );
}

function periodLabel(p?: string) {
  if (p === "daily") return "روز";
  if (p === "weekly") return "هفته";
  if (p === "monthly") return "ماه";
  return "کل";
}

function ScoreBreakdownCard({ employeeId }: { employeeId: string }) {
  const scoreQ = useQuery({
    enabled: !!employeeId,
    queryKey: ["my-score-breakdown", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_scores")
        .select("breakdown, total_score, monthly_score")
        .eq("employee_id", employeeId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Pick<EmployeeScore, "breakdown" | "total_score" | "monthly_score"> | null;
    },
    staleTime: 60_000,
  });

  const kpisQ = useQuery({
    queryKey: ["gamification-kpis-labels"],
    queryFn: listKpis,
    staleTime: 5 * 60_000,
  });

  const labelMap = new Map((kpisQ.data ?? []).map((k) => [k.key, k.label_fa]));

  const breakdown = scoreQ.data?.breakdown ?? {};
  const entries = Object.entries(breakdown).sort(
    (a, b) => Math.abs(b[1]?.contribution ?? 0) - Math.abs(a[1]?.contribution ?? 0),
  );
  const totalAbs = entries.reduce((s, [, v]) => s + Math.abs(v?.contribution ?? 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">این امتیاز از کجا آمد؟</CardTitle>
      </CardHeader>
      <CardContent>
        {scoreQ.isLoading || kpisQ.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            هنوز امتیازی برای نمایش وجود ندارد
          </p>
        ) : (
          <div className="space-y-3">
            {entries.map(([key, v]) => {
              const contribution = Number(v?.contribution ?? 0);
              const share = totalAbs > 0 ? (Math.abs(contribution) / totalAbs) * 100 : 0;
              return (
                <div key={key} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{labelMap.get(key) ?? key}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {periodLabel(v?.period)}
                      </Badge>
                    </div>
                    <span className="tabular-nums text-muted-foreground">
                      {toPersianDigits(contribution.toFixed(2))}
                    </span>
                  </div>
                  <Progress value={share} className="h-2" />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
