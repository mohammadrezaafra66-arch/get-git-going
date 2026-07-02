import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Wallet, TrendingUp, ShieldCheck } from "lucide-react";

import { requireAnyRole } from "@/lib/rbac/route-guards";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole } from "@/lib/rbac/roles";
import { PageHeader } from "@/components/common/PageHeader";
import { HelpHint } from "@/components/common/HelpHint";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatNumber, toFaDigits } from "@/lib/i18n/formatters";
import { DynamicScoringSection } from "@/components/credit/DynamicScoringSection";
import { useCustomerLatestAllocation } from "@/hooks/credit/useDynamicScoring";

export const Route = createFileRoute("/_app/sales_/customers_/$customerId/credit")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager", "accountant"]);
  },
  component: CustomerCreditPage,
});

function CustomerCreditPage() {
  const { customerId } = Route.useParams();
  const { roles } = useAuth();
  const canRecalc = hasAnyRole(roles, ["admin", "accountant"]);

  const { data: customer } = useQuery({
    queryKey: ["customer-basic", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone")
        .eq("id", customerId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: latestAlloc } = useCustomerLatestAllocation(customerId);

  const bindingLabel = (b: string) => {
    switch (b) {
      case "credit_limit":
        return "سقف اعتباری";
      case "overdue":
        return "مانده معوق";
      case "floor":
        return "کف تخصیص";
      case "formula":
      default:
        return "فرمول امتیاز";
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title={`پروفایل اعتباری ${customer?.name ?? ""}`}
        description="امتیازدهی پویا و آخرین سقف اعتبار مؤثر مشتری"
        actions={
          <div className="flex gap-2">
            <HelpHint
              size={18}
              text={
                "این صفحه بر اساس سیستم امتیازدهی پویا کار می‌کند:\n" +
                "• پارامترها و وزن‌ها در «قوانین امتیازدهی» تعریف می‌شوند.\n" +
                "• سقف اعتبار مؤثر از آخرین اجرای تخصیص سرمایه پویا می‌آید.\n" +
                "• اگر تخصیص امروز موجود نباشد، آخرین تخصیص تاریخی مبنا قرار می‌گیرد."
              }
            />
            <Button variant="outline" asChild>
              <Link to="/sales/customers">بازگشت به مشتریان</Link>
            </Button>
          </div>
        }
      />

      {/* آخرین تخصیص پویا */}
      {latestAlloc ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            icon={<Wallet className="h-5 w-5" />}
            label="سقف اعتبار مؤثر (Dynamic)"
            hintText="آخرین final_limit از تخصیص سرمایه پویا. اگر امروز محاسبه نشده باشد، آخرین تاریخ موجود مبنا است."
            value={<span className="text-xl font-bold">{formatNumber(latestAlloc.final_limit)}</span>}
            hint="ریال"
          />
          <MetricCard
            icon={<TrendingUp className="h-5 w-5" />}
            label="امتیاز وزنی"
            hintText="امتیاز نهایی از سیستم امتیازدهی پویا (۰ تا ۱)."
            value={
              <span className="text-xl font-bold">
                {toFaDigits(Number(latestAlloc.weighted_score).toFixed(3))}
              </span>
            }
          />
          <MetricCard
            icon={<ShieldCheck className="h-5 w-5" />}
            label="قید فعال"
            hintText="عاملی که سقف نهایی را محدود کرده است."
            value={
              <Badge variant="secondary" className="text-base px-3 py-1">
                {bindingLabel(latestAlloc.binding_constraint)}
              </Badge>
            }
          />
          <MetricCard
            icon={<Wallet className="h-5 w-5" />}
            label="تاریخ تخصیص"
            hintText="تاریخ اجرای تخصیص سرمایه که این سقف از آن آمده."
            value={
              <span className="text-base font-semibold">
                {toFaDigits(latestAlloc.capital_date || "—")}
              </span>
            }
          />
        </div>
      ) : (
        <Card>
          <CardContent className="py-6 text-center text-muted-foreground text-sm">
            هنوز هیچ تخصیص سرمایه پویایی برای این مشتری ثبت نشده است. برای فعال شدن سقف اعتبار،
            ابتدا از صفحه «تخصیص سرمایه پویا» یک اجرا انجام دهید.
          </CardContent>
        </Card>
      )}

      <DynamicScoringSection entityType="customer" entityId={customerId} canEdit={canRecalc} />
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  hint,
  hintText,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: string;
  hintText?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {icon}
          <span>{label}</span>
          {hintText && <HelpHint text={hintText} />}
        </div>
        <div>{value}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}