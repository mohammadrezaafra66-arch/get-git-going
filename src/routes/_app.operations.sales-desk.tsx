import { createFileRoute, Link } from "@tanstack/react-router";
import { PhoneCall, Activity } from "lucide-react";

import { requireAnyRole } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import {
  FollowUpsToday,
  MyMonthStatsCard,
  QuickRequestForm,
} from "@/components/sales-desk";

export const Route = createFileRoute("/_app/operations/sales-desk")({
  staticData: {
    gate: { kind: "anyRole", allowed: ["admin", "manager", "sales"] },
  },
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager", "sales"]);
  },
  component: SalesDeskPage,
});

/**
 * میز تماس فروش — خلاصه امروز، ثبت سریع درخواست، آمار ماهانه.
 * بدون ایزابل کاملاً قابل استفاده است (تعاملات دستی).
 */
function SalesDeskPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="میز فروش"
        description="خلاصه امروز، ثبت سریع درخواست و آمار تماس‌های شما — با یا بدون مرکز تلفن."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/operations/call-activity">
                <Activity className="ml-1.5 h-4 w-4" />
                فعالیت تلفنی
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/sales/customers">
                <PhoneCall className="ml-1.5 h-4 w-4" />
                مشتریان
              </Link>
            </Button>
          </div>
        }
      />

      <section aria-label="خلاصه امروز من">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          خلاصه امروز من
        </h2>
        <FollowUpsToday />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <QuickRequestForm />
        <MyMonthStatsCard />
      </div>
    </div>
  );
}
