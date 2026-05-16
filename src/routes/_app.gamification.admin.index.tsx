import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity, Target, Coins, Flag, Award, Gift, Crown, Info, ChevronLeft,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requireAnyRole } from "@/lib/rbac/route-guards";

export const Route = createFileRoute("/_app/gamification/admin/")({
  beforeLoad: async () => { await requireAnyRole(["admin", "manager"]); },
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
  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="مرکز مدیریت گیمیفیکیشن"
        description="دسترسی متمرکز به همه‌ی بخش‌های مدیریت گیمیفیکیشن."
      />

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          طلای زمان خرید تنظیمات فرمول و پارامترهای خرید است؛ قوانین KPI مقدار XP رویدادهای
          عمومی سیستم را مدیریت می‌کند. این دو در یک پنل دیده می‌شوند اما مدل داده و منطق
          جدا دارند.
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
