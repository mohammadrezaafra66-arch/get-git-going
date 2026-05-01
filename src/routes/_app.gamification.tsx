import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Crown, Flame, Target, Medal, Zap, ChevronLeft, Lock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
  getEmployeeProgress,
  getEmployeeRank,
  getCurrentLeague,
  getRankNeighbors,
  getLeaderboard,
  listEmployeeAchievements,
  listTodayMissions,
  listEmployeeStreaks,
} from "@/lib/operations/gamification";
import { LeagueBadge, getLeagueLabel, type LeagueTier } from "@/components/gamification/LeagueBadge";
import { LevelUpOverlay } from "@/components/gamification/LevelUpOverlay";

export const Route = createFileRoute("/_app/gamification")({
  component: GamificationRoutePage,
});

const REFETCH_MS = 30_000;
const LEADERBOARD_STALE = 60_000;

function GamificationRoutePage() {
  const location = useLocation();
  const normalizedPath = location.pathname.replace(/\/+$/, "") || "/";

  if (normalizedPath !== "/gamification") {
    return <Outlet />;
  }

  return <GamificationDashboard />;
}

function GamificationDashboard() {
  const { user, profile } = useAuth();
  const employeeId = user?.id ?? "";

  const progress = useQuery({
    queryKey: ["gam", "progress", employeeId],
    queryFn: () => getEmployeeProgress(employeeId),
    enabled: !!employeeId,
    refetchInterval: REFETCH_MS,
  });
  const rank = useQuery({
    queryKey: ["gam", "rank", employeeId],
    queryFn: () => getEmployeeRank(employeeId),
    enabled: !!employeeId,
    refetchInterval: REFETCH_MS,
  });
  const league = useQuery({
    queryKey: ["gam", "league", employeeId],
    queryFn: () => getCurrentLeague(employeeId),
    enabled: !!employeeId,
    refetchInterval: REFETCH_MS,
  });
  const neighbors = useQuery({
    queryKey: ["gam", "neighbors", employeeId],
    queryFn: () => getRankNeighbors(employeeId, "monthly", 3),
    enabled: !!employeeId,
    refetchInterval: REFETCH_MS,
  });
  const top5 = useQuery({
    queryKey: ["gam", "leaderboard-top5"],
    queryFn: () => getLeaderboard("monthly", { limit: 5 }),
    refetchInterval: REFETCH_MS,
    staleTime: LEADERBOARD_STALE,
  });
  const achievements = useQuery({
    queryKey: ["gam", "achievements", employeeId],
    queryFn: () => listEmployeeAchievements(employeeId),
    enabled: !!employeeId,
    refetchInterval: REFETCH_MS,
  });
  const missions = useQuery({
    queryKey: ["gam", "missions", employeeId],
    queryFn: () => listTodayMissions(employeeId),
    enabled: !!employeeId,
    refetchInterval: REFETCH_MS,
  });
  const streaks = useQuery({
    queryKey: ["gam", "streaks", employeeId],
    queryFn: () => listEmployeeStreaks(employeeId),
    enabled: !!employeeId,
    refetchInterval: REFETCH_MS,
  });

  const initials = (profile?.full_name ?? "؟").trim().slice(0, 2);
  const xpPct = progress.data?.progress_percent ?? 0;
  const tier = (league.data?.league as LeagueTier | null) ?? null;

  // Level-up celebration: full-screen overlay (replaces previous toast)
  const prevLevel = useRef<number | null>(null);
  const [celebrateLevel, setCelebrateLevel] = useState<number | null>(null);

  useEffect(() => {
    const lvl = progress.data?.level;
    if (lvl == null) return;
    if (prevLevel.current != null && lvl > prevLevel.current) {
      setCelebrateLevel(lvl);
    }
    prevLevel.current = lvl;
  }, [progress.data?.level]);

  // Achievement-unlock toast (kept from previous phase)
  const prevAchievementIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    const list = achievements.data;
    if (!list) return;
    const ids = new Set(list.map((a) => a.id));
    if (prevAchievementIds.current) {
      for (const a of list) {
        if (!prevAchievementIds.current.has(a.id)) {
          toast(`🏅 نشان جدید: ${a.title_fa}`, {
            description: a.description ?? "نشان تازه‌ای باز شد!",
            duration: 6000,
          });
        }
      }
    }
    prevAchievementIds.current = ids;
  }, [achievements.data]);

  return (
    <div className="space-y-6 pb-10">
      <LevelUpOverlay level={celebrateLevel} onDone={() => setCelebrateLevel(null)} />
      {/* HERO / Player Card */}
      <Card className="relative overflow-hidden border-0 bg-gradient-to-bl from-primary/20 via-background to-accent/20 shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/30 via-transparent to-transparent" />
        <CardContent className="relative flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <div className="relative">
              <Avatar className="h-20 w-20 ring-4 ring-primary/30 shadow-lg">
                <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-2xl font-bold text-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-1 -left-1 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 text-sm font-bold text-white shadow-md ring-2 ring-background">
                {progress.data?.level ?? 1}
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold">{profile?.full_name ?? "بازیکن"}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="secondary" className="gap-1">
                  <Zap className="h-3 w-3" /> سطح {progress.data?.level ?? 1}
                </Badge>
                {tier ? (
                  <Badge variant="outline" className="gap-1 border-amber-500/40">
                    <Crown className="h-3 w-3 text-amber-500" /> لیگ {getLeagueLabel(tier)}
                  </Badge>
                ) : null}
                {rank.data?.monthly_rank ? (
                  <Badge variant="outline" className="gap-1">
                    <Trophy className="h-3 w-3" /> رتبه {rank.data.monthly_rank}
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>
          <LeagueBadge tier={tier} size="xl" animated />
        </CardContent>
      </Card>

      {/* XP + League grid */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* XP Progress */}
        <Card className="md:col-span-2 overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-5 w-5 text-yellow-500" />
              پیشرفت تجربه (XP)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-bold tabular-nums">{Math.floor(progress.data?.xp_current ?? 0)}</span>
              <span className="text-sm text-muted-foreground tabular-nums">
                / {Math.floor(progress.data?.xp_next_level ?? 0)} XP
              </span>
            </div>
            <div className="relative h-4 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-yellow-400 via-amber-400 to-orange-500 shadow-[0_0_12px_rgba(251,191,36,0.6)] transition-all duration-700 ease-out"
                style={{ width: `${xpPct}%` }}
              />
              <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>سطح {progress.data?.level ?? 1}</span>
              <span className="tabular-nums">{xpPct.toFixed(1)}%</span>
              <span>سطح {(progress.data?.level ?? 1) + 1}</span>
            </div>
          </CardContent>
        </Card>

        {/* League Card */}
        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Crown className="h-5 w-5 text-amber-500" />
              لیگ فصل
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3 text-center">
            <LeagueBadge tier={tier} size="lg" />
            <div>
              <div className="text-lg font-bold">{getLeagueLabel(tier)}</div>
              <div className="text-xs text-muted-foreground">
                فصل {league.data?.season_name ?? "—"}
              </div>
            </div>
            <div className="flex w-full justify-around border-t pt-3 text-center">
              <div>
                <div className="text-lg font-bold tabular-nums">{league.data?.rank ?? "—"}</div>
                <div className="text-[10px] text-muted-foreground">رتبه لیگ</div>
              </div>
              <div>
                <div className="text-lg font-bold tabular-nums">{Math.floor(league.data?.score ?? 0)}</div>
                <div className="text-[10px] text-muted-foreground">امتیاز فصل</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rank Context + Leaderboard */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-5 w-5 text-primary" />
              همسایگان رتبه
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {neighbors.isLoading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
            ) : !neighbors.data?.length ? (
              <div className="p-6 text-center text-sm text-muted-foreground">داده‌ای وجود ندارد.</div>
            ) : (
              <ul className="divide-y">
                {neighbors.data.map((n) => {
                  const isSelf = n.relative_position === "self";
                  return (
                    <li key={n.employee_id} className={`flex items-center gap-3 px-4 py-2.5 ${isSelf ? "bg-primary/10 font-bold" : ""}`}>
                      <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs tabular-nums ${isSelf ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                        {n.rank}
                      </span>
                      <span className="flex-1 truncate text-sm">{n.full_name ?? "—"}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">{Math.floor(n.score)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-5 w-5 text-amber-500" />
              برترین‌های ماه
            </CardTitle>
            <Button size="sm" variant="ghost" asChild>
              <Link to="/gamification/leaderboard">
                نمایش کامل <ChevronLeft className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {top5.isLoading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
            ) : !top5.data?.length ? (
              <div className="p-6 text-center text-sm text-muted-foreground">رتبه‌بندی‌ای موجود نیست.</div>
            ) : (
              <ul className="divide-y">
                {top5.data.map((row) => (
                  <li key={row.employee_id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs tabular-nums ${row.rank === 1 ? "bg-yellow-500 text-white" : row.rank === 2 ? "bg-slate-400 text-white" : row.rank === 3 ? "bg-amber-700 text-white" : "bg-muted"}`}>
                      {row.rank}
                    </span>
                    <span className="flex-1 truncate text-sm">{row.full_name ?? "—"}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{Math.floor(row.score)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Achievements + Streaks */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Medal className="h-5 w-5 text-fuchsia-500" />
              نشان‌های باز شده
            </CardTitle>
          </CardHeader>
          <CardContent>
            {achievements.isLoading ? (
              <div className="py-6 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
            ) : !achievements.data?.length ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
                <Lock className="h-8 w-8 opacity-30" />
                هنوز هیچ نشانی باز نشده است.
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {achievements.data.slice(0, 8).map((a) => (
                  <div key={a.id} className="group flex flex-col items-center gap-1 rounded-lg border bg-card p-3 text-center transition-all hover:scale-105 hover:shadow-md hover:shadow-primary/20">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white shadow">
                      <Medal className="h-6 w-6" />
                    </div>
                    <div className="line-clamp-1 text-xs font-medium">{a.title_fa}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Flame className="h-5 w-5 text-orange-500" />
              زنجیره‌ها (Streaks)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {streaks.isLoading ? (
              <div className="py-6 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
            ) : !streaks.data?.length ? (
              <div className="py-6 text-center text-sm text-muted-foreground">هیچ زنجیره‌ای ثبت نشده.</div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {streaks.data.map((s) => (
                  <div key={s.streak_type} className="flex flex-col items-center rounded-lg border bg-gradient-to-b from-orange-500/10 to-transparent p-3 text-center">
                    <Flame className="h-6 w-6 text-orange-500" />
                    <div className="mt-1 text-2xl font-bold tabular-nums">{s.current_count}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {s.streak_type === "login" ? "ورود" : s.streak_type === "sales" ? "فروش" : s.streak_type === "calls" ? "تماس" : s.streak_type}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Daily Missions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-5 w-5 text-emerald-500" />
            مأموریت‌های امروز
          </CardTitle>
        </CardHeader>
        <CardContent>
          {missions.isLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
          ) : !missions.data?.length ? (
            <div className="py-6 text-center text-sm text-muted-foreground">مأموریتی برای امروز تعریف نشده است.</div>
          ) : (
            <ul className="space-y-3">
              {missions.data.map((m) => {
                const pct = m.target_value > 0 ? Math.min(100, (m.progress / m.target_value) * 100) : 0;
                return (
                  <li key={m.id} className={`rounded-lg border p-3 ${m.completed ? "bg-emerald-500/5 border-emerald-500/30" : ""}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          {m.completed ? <Trophy className="h-4 w-4 text-emerald-500" /> : <Target className="h-4 w-4 text-muted-foreground" />}
                          {m.title_fa}
                        </div>
                        {m.description ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">{m.description}</p>
                        ) : null}
                      </div>
                      <Badge variant="secondary" className="gap-1 shrink-0">
                        <Zap className="h-3 w-3" /> {m.xp_reward} XP
                      </Badge>
                    </div>
                    <div className="mt-2">
                      <Progress value={pct} className="h-2" />
                      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground tabular-nums">
                        <span>{m.progress} / {m.target_value}</span>
                        <span>{pct.toFixed(0)}%</span>
                      </div>
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
