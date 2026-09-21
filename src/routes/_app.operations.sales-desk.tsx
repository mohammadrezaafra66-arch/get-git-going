import { createFileRoute, Link } from "@tanstack/react-router";
import { PhoneCall, Activity, Sparkles } from "lucide-react";

import { requireAnyRole } from "@/lib/rbac/route-guards";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FollowUpsToday,
  MyMonthStatsCard,
  MyWorkDeals,
  QuickRequestForm,
  SalesDeskShell,
  SalesDeskTiltCard,
  SalesDeskLiveStatus,
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

function SalesDeskPage() {
  return (
    <SalesDeskShell
      title="میز فروش"
      description="خلاصه امروز، افزودن معامله و آمار تماس — با یا بدون مرکز تلفن."
      fallbackTo="/dashboard"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm" className="bg-white/70 backdrop-blur-sm">
            <Link to="/operations/call-activity">
              <Activity className="ml-1.5 h-4 w-4" />
              فعالیت تلفنی
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="bg-white/70 backdrop-blur-sm">
            <Link to="/sales/customers">
              <PhoneCall className="ml-1.5 h-4 w-4" />
              مشتریان
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="bg-white/70 backdrop-blur-sm">
            <Link to="/operations/sales-desk/deals-for-others">
              معاملات ثبت‌شده برای دیگران
            </Link>
          </Button>
        </div>
      }
    >
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <div className="sales-desk-chip">
          <Sparkles className="h-3.5 w-3.5" />
          آمادهٔ کار روزانه تیم فروش
        </div>
        <SalesDeskLiveStatus />
      </div>

      <Tabs defaultValue="today" dir="rtl" className="space-y-4">
        <TabsList>
          <TabsTrigger value="today">خلاصه امروز من</TabsTrigger>
          <TabsTrigger value="my-work">کارهای من</TabsTrigger>
          <TabsTrigger value="add">افزودن معامله</TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="space-y-4">
          <section aria-label="خلاصه امروز من">
            <SalesDeskTiltCard delayMs={40}>
              <div className="p-4 sm:p-5">
                <FollowUpsToday />
              </div>
            </SalesDeskTiltCard>
          </section>
          <SalesDeskTiltCard delayMs={120}>
            <div className="p-1">
              <MyMonthStatsCard />
            </div>
          </SalesDeskTiltCard>
        </TabsContent>

        <TabsContent value="my-work">
          <SalesDeskTiltCard delayMs={40}>
            <div className="p-1">
              <MyWorkDeals mode="my-work" title="کارهای من" />
            </div>
          </SalesDeskTiltCard>
        </TabsContent>

        <TabsContent value="add">
          <div className="grid gap-4 lg:grid-cols-2">
            <SalesDeskTiltCard delayMs={40}>
              <div className="p-1">
                <QuickRequestForm />
              </div>
            </SalesDeskTiltCard>
            <SalesDeskTiltCard delayMs={120}>
              <div className="p-1">
                <MyMonthStatsCard />
              </div>
            </SalesDeskTiltCard>
          </div>
        </TabsContent>
      </Tabs>
    </SalesDeskShell>
  );
}
