import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, Target, Coins, Flag, Award, Gift, Crown, Info, ChevronLeft, Users, CalendarClock, Trophy, ShieldAlert, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { useAdminGamificationOverview } from "@/hooks/gamification/useGamification";
import { toPersianDigits } from "@/lib/dashboard/utils";

export const Route = createFileRoute("/_app/gamification/admin/")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager"]);
  },
  component: GamificationAdminHub,
});

type HubCard = {
  title: string;
  description: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
};

const CARDS: HubCard[] = [
  {
    title: "داشبورد و تحلیل‌ها",
    description: "نمای کلی فعالیت‌ها، روند امتیازها و عملکرد کارکنان.",
    to: "/gamification/admin/analytics",
    icon: Activity,
  },
  {
    title: "قوانین امتیازدهی KPI",
    description: "مدیریت مقدار XP برای رویدادهای عمومی سیستم.",
    to: "/gamification/admin/kpi-rules",
    icon: Target,
  },
  {
    title: "طلای زمان خرید",
    description: "تنظیم فرمول و پارامترهای امتیاز خرید (مدل داده جدا از KPI).",
    to: "/gamification/admin/purchase-settings",
    icon: Coins,
  },
  {
    title: "مأموریت‌ها",
    description: "تعریف و مدیریت مأموریت‌های روزانه و دوره‌ای.",
    to: "/gamification/admin/missions",
    icon: Flag,
  },
  {
    title: "دستاوردها",
    description: "مدیریت دستاوردها و شرایط فعال‌سازی آن‌ها.",
    to: "/gamification/admin/achievements",
    icon: Award,
  },
  {
    title: "پاداش‌ها",
    description: "تعریف پاداش‌های قابل دریافت توسط کارکنان.",
    to: "/gamification/admin/rewards",
    icon: Gift,
  },
  {
    title: "لیگ‌ها",
    description: "مدیریت سطوح لیگ، آستانه‌ها و فصل‌ها.",
    to: "/gamification/admin/leagues",
    icon: Crown,
  },
];

function GamificationAdminHub() {
  const overview = useAdminGamificationOverview();
  const d = overview.data;
  const num = (n: number | undefined | null) =>
    overview.isLoading ? null : toPersianDigits(Number(n ?? 0).toLocaleString("en-US"));

  const stats: { label: string; value: string | null; icon: React.ComponentType<{ className?: string }>; hint?: string }[] = [
    { label: "کل کارمندان", value: num(d?.total_employees), icon: Users },
    { label: "رویدادهای امروز", value: num(d?.total_events_today), icon: CalendarClock },
    {
      label: "برترین امتیازدهنده امروز",
      value: overview.isLoading ? null : d?.top_scorer_today?.full_name ?? "—",
      icon: Trophy,
      hint: d?.top_scorer_today ? `${toPersianDigits(Math.round(d.top_scorer_today.score))} امتیاز` : undefined,
    },
    { label: "کارت قرمز امروز", value: num(d?.total_penalties_today), icon: ShieldAlert },
    { label: "XP داده‌شده امروز", value: num(d?.total_xp_awarded_today), icon: Sparkles },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="مرکز مدیریت گیمیفیکیشن"
        description="دسترسی متمرکز به همه‌ی بخش‌های مدیریت گیمیفیکیشن."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs">{s.label}</span>
                  <Icon className="h-4 w-4" />
                </div>
                {s.value === null ? (
                  <Skeleton className="h-6 w-20" />
                ) : (
                  <div className="text-lg font-bold tabular-nums truncate" title={s.value}>
                    {s.value}
                  </div>
                )}
                {s.hint && (
                  <div className="text-[11px] text-muted-foreground">{s.hint}</div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          طلای زمان خرید تنظیمات فرمول و پارامترهای خرید است؛ قوانین KPI مقدار XP رویدادهای عمومی
          سیستم را مدیریت می‌کند. این دو در یک پنل دیده می‌شوند اما مدل داده و منطق جدا دارند.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CARDS.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.to} className="flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="h-5 w-5 text-primary" />
                  {c.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 flex-1">
                <p className="text-sm text-muted-foreground flex-1">{c.description}</p>
                <Button asChild variant="outline" className="w-full justify-between">
                  <Link to={c.to}>
                    <span>ورود به بخش</span>
                    <ChevronLeft className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
