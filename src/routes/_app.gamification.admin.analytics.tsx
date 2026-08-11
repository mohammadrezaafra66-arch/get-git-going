import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  BarChart,
  Bar,
} from "recharts";
import { Loader2, Activity, Trophy, Target, Users, AlertTriangle } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { PersianDatePicker } from "@/components/common/PersianDatePicker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { TIER_FA, type LeagueTier } from "@/lib/operations/gamification-leagues";
import {
  EVENT_TYPES,
  EVENT_TYPE_FA,
  getActiveSeason,
  getEmployees,
  getSummary,
  getTrend,
  getTopEmployees,
  getKpiEffectiveness,
  getMissionAnalytics,
  getAchievementAnalytics,
  getLeagueDistribution,
  getRiskEmployees,
} from "@/lib/operations/gamification-analytics";

export const Route = createFileRoute("/_app/gamification/admin/analytics")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager"]);
  },
  component: AnalyticsPage,
});

type RangeKey = "today" | "7d" | "30d" | "season" | "custom";

function startOfTodayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function daysAgoISO(n: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}
function nowISO() {
  return new Date().toISOString();
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("fa-IR");
  } catch {
    return d;
  }
}
function fmtDateTime(d: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("fa-IR");
  } catch {
    return d;
  }
}
function toDateInput(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fromDateInput(s: string, endOfDay = false) {
  const d = new Date(s);
  if (endOfDay) d.setHours(23, 59, 59, 999);
  else d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function StatCard({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="rounded-md bg-primary/10 text-primary p-2">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-xl font-semibold">{value}</div>
          {hint ? <div className="text-[11px] text-muted-foreground">{hint}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ s }: { s: "inactive" | "low" | "normal" }) {
  if (s === "inactive") return <Badge variant="destructive">بدون فعالیت</Badge>;
  if (s === "low") return <Badge variant="secondary">فعالیت کم</Badge>;
  return <Badge variant="outline">عادی</Badge>;
}

function AnalyticsPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("30d");
  const [customFrom, setCustomFrom] = useState<string>(toDateInput(daysAgoISO(30)));
  const [customTo, setCustomTo] = useState<string>(toDateInput(nowISO()));
  const [employeeId, setEmployeeId] = useState<string>("__all");
  const [eventType, setEventType] = useState<string>("__all");

  const seasonQ = useQuery({
    queryKey: ["analytics-active-season"],
    queryFn: getActiveSeason,
    staleTime: 60_000,
  });
  const employeesQ = useQuery({
    queryKey: ["analytics-employees"],
    queryFn: getEmployees,
    staleTime: 60_000,
  });

  const seasonFallbackNotice = rangeKey === "season" && !seasonQ.isLoading && !seasonQ.data;

  const range = useMemo(() => {
    if (rangeKey === "today") return { from: startOfTodayISO(), to: nowISO() };
    if (rangeKey === "7d") return { from: daysAgoISO(7), to: nowISO() };
    if (rangeKey === "30d") return { from: daysAgoISO(30), to: nowISO() };
    if (rangeKey === "season") {
      if (seasonQ.data) return { from: seasonQ.data.starts_at, to: seasonQ.data.ends_at };
      return { from: daysAgoISO(30), to: nowISO() };
    }
    return { from: fromDateInput(customFrom), to: fromDateInput(customTo, true) };
  }, [rangeKey, customFrom, customTo, seasonQ.data]);

  const filters = useMemo(
    () => ({
      from: range.from,
      to: range.to,
      employeeId: employeeId === "__all" ? null : employeeId,
      eventType: eventType === "__all" ? null : eventType,
    }),
    [range, employeeId, eventType],
  );

  const baseKey = [filters.from, filters.to, filters.employeeId, filters.eventType] as const;
  const rangeKeyArr = [filters.from, filters.to] as const;

  const summaryQ = useQuery({
    queryKey: ["g-an-summary", ...baseKey],
    queryFn: () => getSummary(filters),
  });
  const trendQ = useQuery({
    queryKey: ["g-an-trend", ...baseKey],
    queryFn: () => getTrend(filters),
  });
  const topQ = useQuery({
    queryKey: ["g-an-top", ...baseKey],
    queryFn: () => getTopEmployees(filters),
  });
  const kpiEffQ = useQuery({
    queryKey: ["g-an-kpieff", ...rangeKeyArr],
    queryFn: () => getKpiEffectiveness(range),
  });
  const missionsQ = useQuery({
    queryKey: ["g-an-missions", ...rangeKeyArr],
    queryFn: () => getMissionAnalytics(range),
  });
  const achievementsQ = useQuery({
    queryKey: ["g-an-ach", ...rangeKeyArr],
    queryFn: () => getAchievementAnalytics(range),
  });
  const leagueQ = useQuery({
    queryKey: ["g-an-league"],
    queryFn: getLeagueDistribution,
    staleTime: 60_000,
  });
  const riskQ = useQuery({
    queryKey: ["g-an-risk", ...rangeKeyArr],
    queryFn: () => getRiskEmployees(range),
  });

  // Build trend chart data: { day, [event_type]: cnt }
  const trendChartData = useMemo(() => {
    const rows = trendQ.data ?? [];
    const byDay = new Map<string, Record<string, number | string>>();
    const types = new Set<string>();
    for (const r of rows) {
      types.add(r.event_type);
      const k = r.day;
      if (!byDay.has(k)) byDay.set(k, { day: k });
      byDay.get(k)![r.event_type] = Number(r.cnt);
    }
    const series = Array.from(types);
    const data = Array.from(byDay.values()).sort((a, b) =>
      String(a.day).localeCompare(String(b.day)),
    );
    return { data, series };
  }, [trendQ.data]);

  const colors = [
    "hsl(var(--primary))",
    "hsl(var(--accent-foreground))",
    "hsl(var(--destructive))",
    "hsl(var(--muted-foreground))",
    "hsl(var(--secondary-foreground))",
    "hsl(var(--ring))",
  ];

  return (
    <div className="container py-6 space-y-6" dir="rtl">
      <PageHeader
        title="تحلیل گیمیفیکیشن"
        description="در این داشبورد عملکرد فروشنده‌ها، مأموریت‌ها، مدال‌ها و لیگ‌ها در بازه انتخابی تحلیل می‌شود."
      />

      {/* Filter bar */}
      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">بازه زمانی</Label>
            <Select value={rangeKey} onValueChange={(v) => setRangeKey(v as RangeKey)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">امروز</SelectItem>
                <SelectItem value="7d">۷ روز اخیر</SelectItem>
                <SelectItem value="30d">۳۰ روز اخیر</SelectItem>
                <SelectItem value="season">فصل فعال</SelectItem>
                <SelectItem value="custom">سفارشی</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {rangeKey === "custom" ? (
            <>
              <div className="space-y-1">
                <Label className="text-xs">از تاریخ</Label>
                <PersianDatePicker
                  value={customFrom || null}
                  onChange={(v) => setCustomFrom(v ?? "")}
                  placeholder="از تاریخ"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">تا تاریخ</Label>
                <PersianDatePicker
                  value={customTo || null}
                  onChange={(v) => setCustomTo(v ?? "")}
                  placeholder="تا تاریخ"
                />
              </div>
            </>
          ) : null}

          <div className="space-y-1">
            <Label className="text-xs">کارمند</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger>
                <SelectValue placeholder="همه کارمندان" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">همه کارمندان</SelectItem>
                {(employeesQ.data ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.full_name ?? "بدون نام"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">نوع رویداد</Label>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger>
                <SelectValue placeholder="همه" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">همه رویدادها</SelectItem>
                {EVENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {EVENT_TYPE_FA[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {seasonFallbackNotice ? (
        <Alert>
          <AlertDescription>
            فصل فعالی پیدا نشد؛ بازه ۳۰ روز اخیر نمایش داده می‌شود.
          </AlertDescription>
        </Alert>
      ) : null}
      <Alert variant="default">
        <AlertDescription>
          منبع XP تجمیعی قابل اتکا نیست؛ به همین دلیل کارت «مجموع XP» در این داشبورد نمایش داده
          نمی‌شود.
        </AlertDescription>
      </Alert>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {summaryQ.isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)
        ) : summaryQ.error ? (
          <Card className="col-span-full">
            <CardContent className="p-4 text-sm text-destructive">
              {(summaryQ.error as Error).message}
            </CardContent>
          </Card>
        ) : (
          <>
            <StatCard
              label="مجموع رویدادها"
              value={summaryQ.data!.total_events.toLocaleString("fa-IR")}
              icon={Activity}
            />
            <StatCard
              label="مدال‌های آزادشده"
              value={summaryQ.data!.total_achievements.toLocaleString("fa-IR")}
              icon={Trophy}
            />
            <StatCard
              label="مأموریت‌های تکمیل‌شده"
              value={summaryQ.data!.total_missions_completed.toLocaleString("fa-IR")}
              icon={Target}
            />
            <StatCard
              label="کارمندان فعال"
              value={summaryQ.data!.active_employees.toLocaleString("fa-IR")}
              icon={Users}
            />
            <StatCard
              label="میانگین رویداد به ازای کارمند"
              value={Number(summaryQ.data!.avg_events_per_employee).toLocaleString("fa-IR")}
              icon={Activity}
            />
          </>
        )}
      </div>

      {/* Activity trend */}
      <Card>
        <CardHeader>
          <CardTitle>روند فعالیت‌ها</CardTitle>
        </CardHeader>
        <CardContent>
          {trendQ.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : trendChartData.data.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              داده‌ای در این بازه پیدا نشد.
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendChartData.data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" tickFormatter={(v) => fmtDate(v as string)} />
                  <YAxis allowDecimals={false} />
                  <Tooltip labelFormatter={(v) => fmtDate(v as string)} />
                  <Legend formatter={(v) => EVENT_TYPE_FA[v as string] ?? v} />
                  {trendChartData.series.map((s, i) => (
                    <Line
                      key={s}
                      type="monotone"
                      dataKey={s}
                      stroke={colors[i % colors.length]}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top Employees */}
      <Card>
        <CardHeader>
          <CardTitle>کارمندان برتر</CardTitle>
        </CardHeader>
        <CardContent>
          {topQ.isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="animate-spin h-5 w-5" />
            </div>
          ) : (topQ.data?.length ?? 0) === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              داده‌ای در این بازه پیدا نشد.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>کارمند</TableHead>
                    <TableHead>رویدادها</TableHead>
                    <TableHead>مأموریت‌ها</TableHead>
                    <TableHead>مدال‌ها</TableHead>
                    <TableHead>لیگ فعلی</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topQ.data!.map((r) => (
                    <TableRow key={r.employee_id}>
                      <TableCell>{r.full_name ?? "بدون نام"}</TableCell>
                      <TableCell>{r.events_count.toLocaleString("fa-IR")}</TableCell>
                      <TableCell>{r.missions_count.toLocaleString("fa-IR")}</TableCell>
                      <TableCell>{r.achievements_count.toLocaleString("fa-IR")}</TableCell>
                      <TableCell>
                        {r.current_league
                          ? (TIER_FA[r.current_league as LeagueTier] ?? r.current_league)
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* KPI Effectiveness */}
      <Card>
        <CardHeader>
          <CardTitle>اثربخشی قوانین KPI</CardTitle>
        </CardHeader>
        <CardContent>
          {kpiEffQ.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (kpiEffQ.data?.length ?? 0) === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              داده‌ای در این بازه پیدا نشد.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>کلید رویداد</TableHead>
                    <TableHead>عنوان KPI</TableHead>
                    <TableHead>تعداد وقوع</TableHead>
                    <TableHead>XP قانون</TableHead>
                    <TableHead>وضعیت</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {kpiEffQ.data!.map((r) => (
                    <TableRow key={r.event_key}>
                      <TableCell className="font-mono text-xs">{r.event_key}</TableCell>
                      <TableCell>
                        {r.title_fa ?? (
                          <span className="text-xs text-muted-foreground">— بدون قانون —</span>
                        )}
                      </TableCell>
                      <TableCell>{r.events_count.toLocaleString("fa-IR")}</TableCell>
                      <TableCell>
                        {r.xp_amount != null ? Number(r.xp_amount).toLocaleString("fa-IR") : "—"}
                      </TableCell>
                      <TableCell>
                        {r.title_fa == null ? (
                          <Badge variant="outline">بدون قانون</Badge>
                        ) : r.is_active ? (
                          <Badge>فعال</Badge>
                        ) : (
                          <Badge variant="secondary">غیرفعال</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mission Analytics */}
      <Card>
        <CardHeader>
          <CardTitle>تحلیل مأموریت‌ها</CardTitle>
        </CardHeader>
        <CardContent>
          {missionsQ.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (missionsQ.data?.length ?? 0) === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              داده‌ای در این بازه پیدا نشد.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>عنوان</TableHead>
                    <TableHead>تعداد تکمیل</TableHead>
                    <TableHead>کارمندان منحصربه‌فرد</TableHead>
                    <TableHead>میانگین پیشرفت</TableHead>
                    <TableHead>XP جایزه</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {missionsQ.data!.map((r) => (
                    <TableRow key={r.mission_id}>
                      <TableCell>
                        {r.title_fa}{" "}
                        {!r.enabled ? (
                          <Badge variant="secondary" className="ml-1">
                            غیرفعال
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>{r.completions.toLocaleString("fa-IR")}</TableCell>
                      <TableCell>{r.unique_employees.toLocaleString("fa-IR")}</TableCell>
                      <TableCell>{Number(r.avg_progress).toLocaleString("fa-IR")}</TableCell>
                      <TableCell>{r.xp_reward.toLocaleString("fa-IR")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Achievement Analytics */}
      <Card>
        <CardHeader>
          <CardTitle>تحلیل مدال‌ها</CardTitle>
        </CardHeader>
        <CardContent>
          {achievementsQ.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (achievementsQ.data?.length ?? 0) === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              داده‌ای در این بازه پیدا نشد.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>عنوان</TableHead>
                    <TableHead>تعداد آزاد شدن</TableHead>
                    <TableHead>آخرین آزاد شدن</TableHead>
                    <TableHead>XP جایزه</TableHead>
                    <TableHead>وضعیت</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {achievementsQ.data!.map((r) => (
                    <TableRow key={r.achievement_id}>
                      <TableCell>{r.title_fa}</TableCell>
                      <TableCell>{r.unlocks.toLocaleString("fa-IR")}</TableCell>
                      <TableCell>{fmtDateTime(r.last_unlock)}</TableCell>
                      <TableCell>{r.xp_reward.toLocaleString("fa-IR")}</TableCell>
                      <TableCell>
                        {r.enabled ? (
                          <Badge>فعال</Badge>
                        ) : (
                          <Badge variant="secondary">غیرفعال</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* League Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>توزیع لیگ‌ها</CardTitle>
        </CardHeader>
        <CardContent>
          {leagueQ.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (leagueQ.data?.length ?? 0) === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              داده‌ای در دسترس نیست.
            </div>
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={(leagueQ.data ?? []).map((r) => ({
                    name: TIER_FA[r.league as LeagueTier] ?? r.league,
                    value: Number(r.employees_count),
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Risk / Inactivity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" /> فروشندگان با فعالیت کم
          </CardTitle>
        </CardHeader>
        <CardContent>
          {riskQ.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (riskQ.data?.length ?? 0) === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              همه فروشندگان فعالیت کافی دارند.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>کارمند</TableHead>
                    <TableHead>تعداد رویداد در بازه</TableHead>
                    <TableHead>آخرین رویداد</TableHead>
                    <TableHead>لیگ فعلی</TableHead>
                    <TableHead>وضعیت</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {riskQ.data!.map((r) => (
                    <TableRow key={r.employee_id}>
                      <TableCell>{r.full_name ?? "بدون نام"}</TableCell>
                      <TableCell>{r.events_in_window.toLocaleString("fa-IR")}</TableCell>
                      <TableCell>{fmtDateTime(r.last_event_at)}</TableCell>
                      <TableCell>
                        {r.current_league
                          ? (TIER_FA[r.current_league as LeagueTier] ?? r.current_league)
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge s={r.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
