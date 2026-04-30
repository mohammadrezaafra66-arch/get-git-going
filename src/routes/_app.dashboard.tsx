import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, FileText, Users, DollarSign, Factory, GraduationCap, Cake, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { ROLE_LABELS } from "@/lib/rbac/roles";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/dashboard")({
  beforeLoad: async () => { await requirePermission("dashboard", "view"); },
  component: DashboardPage,
});

const STATS = [
  { icon: Package, label: "محصولات", value: "—", color: "text-blue-600" },
  { icon: FileText, label: "فاکتورهای امروز", value: "—", color: "text-emerald-600" },
  { icon: DollarSign, label: "فروش این ماه", value: "—", color: "text-amber-600" },
  { icon: Users, label: "مشتریان فعال", value: "—", color: "text-purple-600" },
  { icon: Factory, label: "تأمین‌کنندگان", value: "—", color: "text-cyan-600" },
  { icon: GraduationCap, label: "آکادمی", value: "—", color: "text-rose-600" },
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
    const created = Array.isArray(data) ? Number((data[0] as { created_count?: number })?.created_count ?? 0) : 0;
    if (created > 0) toast.success(`${created.toLocaleString("fa-IR")} نوتیفیکیشن تولد ایجاد شد`);
    else toast.success("امروز تولدی وجود ندارد یا قبلاً ثبت شده است");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`خوش آمدید${user?.email ? "" : ""}`}
        description={`نقش شما: ${roleText}`}
      />

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
            {bdayLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cake className="h-4 w-4" />}
            بررسی تولدهای امروز
          </Button>
        </div>
      )}

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