import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, FileText, Users, DollarSign } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { ROLE_LABELS } from "@/lib/rbac/roles";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});

const STATS = [
  { icon: Package, label: "محصولات", value: "—", color: "text-blue-600" },
  { icon: FileText, label: "فاکتورهای امروز", value: "—", color: "text-emerald-600" },
  { icon: DollarSign, label: "فروش این ماه", value: "—", color: "text-amber-600" },
  { icon: Users, label: "مشتریان فعال", value: "—", color: "text-purple-600" },
];

function DashboardPage() {
  const { user, roles } = useAuth();
  const roleText = roles.map((r) => ROLE_LABELS[r]).join("، ") || "بدون نقش";

  return (
    <div className="space-y-6">
      <PageHeader
        title={`خوش آمدید${user?.email ? "" : ""}`}
        description={`نقش شما: ${roleText}`}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {STATS.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 pt-6">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-muted ${s.color}`}>
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
                <div className="text-lg font-bold">{s.value}</div>
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
            <strong className="text-foreground">دستیار هوشمند افراکالا</strong> هسته عملیاتی شرکت برای مدیریت
            محصولات، قیمت‌گذاری، خرید و فروش، فاکتور، کاربران، گزارش‌ها و دانش سازمانی است.
          </p>
          <p>
            این نسخه (فاز ۱) شامل اسکلت معماری، احراز هویت، کنترل دسترسی نقش‌محور و route همه ماژول‌ها است.
            منطق هر ماژول در فازهای بعدی به‌تدریج تکمیل می‌شود.
          </p>
          <p className="text-xs">
            ✓ کاملاً فارسی و RTL &nbsp; · &nbsp; ✓ آماده self-host &nbsp; · &nbsp; ✓ بدون وابستگی CDN خارجی
          </p>
        </CardContent>
      </Card>
    </div>
  );
}