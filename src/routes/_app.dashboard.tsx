import { createFileRoute, Link } from "@tanstack/react-router";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Package,
  FileText,
  Users,
  DollarSign,
  Factory,
  GraduationCap,
  Cake,
  Loader2,
  Home,
  ChevronLeft,
  TrendingUp,
  ShoppingCart,
  Wallet,
  Activity,
  ListTodo,
  BarChart3,
  Bell,
} from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { ROLE_LABELS } from "@/lib/rbac/roles";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/dashboard")({
  beforeLoad: async () => {
    await requirePermission("dashboard", "view");
  },
  component: DashboardPage,
});

// KPIها فعلاً placeholder هستند تا اتصال به backend واقعی در فاز بعد. هیچ داده جعلی نمایش داده نمی‌شود.
const KPIS = [
  {
    icon: TrendingUp,
    label: "فروش امروز",
    value: "—",
    unit: "تومان",
    accent: "text-emerald-600",
    bg: "bg-emerald-50",
  },
  {
    icon: ShoppingCart,
    label: "سفارش‌های جدید",
    value: "—",
    unit: "",
    accent: "text-blue-600",
    bg: "bg-blue-50",
  },
  {
    icon: Users,
    label: "مشتریان جدید",
    value: "—",
    unit: "",
    accent: "text-violet-600",
    bg: "bg-violet-50",
  },
  {
    icon: Wallet,
    label: "سود خالص امروز",
    value: "—",
    unit: "تومان",
    accent: "text-amber-600",
    bg: "bg-amber-50",
  },
];

const SECONDARY_STATS = [
  { icon: Package, label: "محصولات", value: "—" },
  { icon: FileText, label: "فاکتورهای امروز", value: "—" },
  { icon: DollarSign, label: "فروش این ماه", value: "—" },
  { icon: Factory, label: "تأمین‌کنندگان", value: "—" },
  { icon: GraduationCap, label: "آکادمی", value: "—" },
  { icon: Bell, label: "اعلان‌ها", value: "—" },
];

function DashboardPage() {
  const { user, roles } = useAuth();
  const roleText = roles.map((r) => ROLE_LABELS[r]).join("، ") || "بدون نقش";
  const canRunBirthdays =
    roles.includes("admin") || roles.includes("manager") || roles.includes("accountant");
  const [bdayLoading, setBdayLoading] = useState(false);

  const runBirthdayCheck = async () => {
    setBdayLoading(true);
    const { data, error } = await supabase.rpc("generate_birthday_notifications");
    setBdayLoading(false);
    if (error) {
      toast.error("خطا در بررسی تولدها");
      return;
    }
    const created = Array.isArray(data)
      ? Number((data[0] as { created_count?: number })?.created_count ?? 0)
      : 0;
    if (created > 0) toast.success(`${created.toLocaleString("fa-IR")} نوتیفیکیشن تولد ایجاد شد`);
    else toast.success("امروز تولدی وجود ندارد یا قبلاً ثبت شده است");
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="مسیر" className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Home className="h-3.5 w-3.5" />
        <span>خانه</span>
        <ChevronLeft className="h-3.5 w-3.5" />
        <span className="font-medium text-foreground">داشبورد</span>
      </nav>

      <PageHeader title="داشبورد" description={`نقش شما: ${roleText}`} />

      {canRunBirthdays && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={runBirthdayCheck}
            disabled={bdayLoading}
            className="gap-2"
          >
            {bdayLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Cake className="h-4 w-4" />
            )}
            بررسی تولدهای امروز
          </Button>
        </div>
      )}

      {/* Primary KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {KPIS.map((k) => (
          <Card
            key={k.label}
            className="overflow-hidden border-border/70 transition-shadow hover:shadow-md"
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-lg ${k.bg} ${k.accent}`}
                >
                  <k.icon className="h-[18px] w-[18px]" />
                </div>
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                  در حال آماده‌سازی
                </span>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">{k.label}</div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-bold tabular-nums text-foreground">{k.value}</span>
                {k.unit && <span className="text-[10px] text-muted-foreground">{k.unit}</span>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <BarChart3 className="h-4 w-4 text-primary" />
              نمودار فروش ۷ روز اخیر
            </CardTitle>
            <span className="text-[10px] text-muted-foreground">به‌زودی</span>
          </CardHeader>
          <CardContent>
            <div className="flex h-48 items-end gap-2 rounded-md border border-dashed border-border/60 bg-muted/30 p-4">
              {[42, 58, 38, 72, 65, 88, 76].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-sm bg-primary/15"
                  style={{ height: `${h}%` }}
                  aria-hidden="true"
                />
              ))}
            </div>
            <div className="mt-2 text-center text-[11px] text-muted-foreground">
              داده‌های واقعی پس از اتصال به ماژول فروش نمایش داده می‌شود.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Activity className="h-4 w-4 text-primary" />
              سهم فروش بر اساس دسته‌بندی
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-48 items-center justify-center rounded-md border border-dashed border-border/60 bg-muted/30 text-center text-[11px] text-muted-foreground">
              نمودار دایره‌ای پس از اتصال به ماژول گزارش‌ها در دسترس خواهد بود
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Activities & tasks */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Activity className="h-4 w-4 text-primary" />
              فعالیت‌های اخیر
            </CardTitle>
            <Link to="/notifications" className="text-[11px] text-primary hover:underline">
              مشاهده همه
            </Link>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border/60">
              {[0, 1, 2, 3].map((i) => (
                <li key={i} className="flex items-start gap-3 py-2.5">
                  <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/30" />
                  <div className="min-w-0 flex-1">
                    <div className="h-3 w-3/4 rounded bg-muted" />
                    <div className="mt-1.5 h-2.5 w-1/3 rounded bg-muted/60" />
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-2 text-center text-[11px] text-muted-foreground">
              لیست فعالیت‌ها از ماژول اعلان‌ها بارگذاری می‌شود
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <ListTodo className="h-4 w-4 text-primary" />
              وظایف و یادآورها
            </CardTitle>
            <Link to="/operations/tasks" className="text-[11px] text-primary hover:underline">
              مشاهده برد
            </Link>
          </CardHeader>
          <CardContent>
            <div className="flex h-32 flex-col items-center justify-center gap-2 text-center text-[12px] text-muted-foreground">
              <ListTodo className="h-6 w-6 text-muted-foreground/40" />
              <div>برای مشاهده و مدیریت وظایف به برد وظایف بروید</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {SECONDARY_STATS.map((s) => (
          <Card key={s.label} className="border-border/60">
            <CardContent className="flex items-center gap-2.5 p-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <s.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-[10.5px] text-muted-foreground">{s.label}</div>
                <div className="text-sm font-bold tabular-nums">{s.value}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>درباره این سامانه</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-7 text-muted-foreground">
          <p>
            <strong className="text-foreground">دستیار هوشمند افراکالا</strong> هسته عملیاتی شرکت
            برای مدیریت محصولات، قیمت‌گذاری، خرید و فروش، فاکتور، کاربران، گزارش‌ها و دانش سازمانی
            است.
          </p>
          <p>
            این نسخه (فاز ۱) شامل اسکلت معماری، احراز هویت، کنترل دسترسی نقش‌محور و route همه
            ماژول‌ها است. منطق هر ماژول در فازهای بعدی به‌تدریج تکمیل می‌شود.
          </p>
          <p className="text-xs">
            ✓ کاملاً فارسی و RTL &nbsp; · &nbsp; ✓ آماده self-host &nbsp; · &nbsp; ✓ بدون وابستگی
            CDN خارجی
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
