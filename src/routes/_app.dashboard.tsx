import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/rbac/route-guards";
import { Card, CardContent } from "@/components/ui/card";
import {
  MessageSquare,
  CheckCircle2,
  Clock,
  Timer,
  ShoppingCart,
  Wallet,
  ShoppingBag,
  ShieldAlert,
  FileText,
  CheckSquare,
  XCircle,
  FileCheck,
  Cake,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { SalesChart } from "@/components/dashboard/SalesChart";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { NewsTicker } from "@/components/dashboard/NewsTicker";
import { MyScoreCard } from "@/components/dashboard/MyScoreCard";
import {
  useTodayInquiryStats,
  useTodaySalesStats,
  useTodayPurchaseStats,
  useTodayPenaltyStats,
  useTodayDocumentStats,
} from "@/hooks/dashboard/useDashboardStats";
import { formatTomanFa } from "@/lib/dashboard/utils";
import { getPageTitle } from "@/config/branding";

export const Route = createFileRoute("/_app/dashboard")({
  beforeLoad: async () => {
    await requirePermission("dashboard", "view");
  },
  head: () => ({ meta: [{ title: getPageTitle("داشبورد") }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { roles } = useAuth();
  const isAdminish = roles.includes("admin") || roles.includes("manager");
  const isSales = roles.includes("sales");
  const isAccountant = roles.includes("accountant");
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
    <div dir="rtl" className="space-y-5">
      <NewsTicker />
      <DashboardHeader />

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

      {isAdminish && <AdminKpis />}
      {isSales && !isAdminish && <SalesKpis />}
      {isAccountant && !isAdminish && <AccountantKpis />}

      {!isAdminish && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MyScoreCard />
        </div>
      )}

      {isAdminish && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <SalesChart />
          </div>
          <RecentActivity />
        </div>
      )}

      {!isAdminish && <RecentActivity />}

      {!isAdminish && !isSales && !isAccountant && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            برای مشاهدهٔ KPIهای داشبورد، نقش کاربری شما باید توسط مدیر مشخص شود.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AdminKpis() {
  const inquiries = useTodayInquiryStats("all");
  const sales = useTodaySalesStats();
  const purchases = useTodayPurchaseStats("all");
  const penalties = useTodayPenaltyStats("all");
  const docs = useTodayDocumentStats("all");

  return (
    <div className="space-y-3">
      <KpiGrid>
        <KpiCard
          title="استعلام امروز"
          icon={MessageSquare}
          color="blue"
          value={inquiries.data?.total ?? null}
          loading={inquiries.isLoading}
        />
        <KpiCard
          title="پاسخ به‌موقع"
          icon={CheckCircle2}
          color="green"
          value={inquiries.data?.onTime ?? null}
          loading={inquiries.isLoading}
        />
        <KpiCard
          title="با تأخیر"
          icon={Clock}
          color="red"
          value={inquiries.data?.late ?? null}
          loading={inquiries.isLoading}
        />
        <KpiCard
          title="میانگین پاسخ"
          icon={Timer}
          color="amber"
          value={inquiries.data?.avgResponseMin ?? null}
          unit="دقیقه"
          loading={inquiries.isLoading}
        />
      </KpiGrid>

      <KpiGrid>
        <KpiCard
          title="فروش امروز"
          icon={ShoppingCart}
          color="blue"
          value={sales.data?.count ?? null}
          subtitle={sales.data ? `${sales.data.issuedCount} فاکتور صادرشده` : undefined}
          loading={sales.isLoading}
        />
        <KpiCard
          title="مبلغ فروش"
          icon={Wallet}
          color="green"
          value={sales.data?.totalAmount ?? null}
          unit="تومان"
          formatter={formatTomanFa}
          loading={sales.isLoading}
        />
        <KpiCard
          title="درخواست خرید"
          icon={ShoppingBag}
          color="amber"
          value={purchases.data?.total ?? null}
          subtitle={
            purchases.data
              ? `${purchases.data.approved} تأیید · ${purchases.data.pending} در انتظار`
              : undefined
          }
          loading={purchases.isLoading}
        />
        <KpiCard
          title="کارت قرمز امروز"
          icon={ShieldAlert}
          color="red"
          value={penalties.data?.total ?? null}
          loading={penalties.isLoading}
        />
      </KpiGrid>

      <KpiGrid>
        <KpiCard
          title="اسناد آپلودشده"
          icon={FileText}
          color="blue"
          value={docs.data?.uploaded ?? null}
          loading={docs.isLoading}
        />
        <KpiCard
          title="تأییدشده"
          icon={CheckSquare}
          color="green"
          value={docs.data?.confirmed ?? null}
          loading={docs.isLoading}
        />
        <KpiCard
          title="رد / منقضی"
          icon={XCircle}
          color="red"
          value={docs.data?.rejectedOrExpired ?? null}
          loading={docs.isLoading}
        />
        <KpiCard
          title="رسیدهای تحویل"
          icon={FileCheck}
          color="violet"
          value={docs.data?.deliveryReceipts ?? null}
          loading={docs.isLoading}
        />
      </KpiGrid>
    </div>
  );
}

function SalesKpis() {
  const inquiries = useTodayInquiryStats("mine");
  const purchases = useTodayPurchaseStats("mine");
  const penalties = useTodayPenaltyStats("mine");

  return (
    <div className="space-y-3">
      <KpiGrid>
        <KpiCard
          title="استعلام‌های من امروز"
          icon={MessageSquare}
          color="blue"
          value={inquiries.data?.total ?? null}
          loading={inquiries.isLoading}
        />
        <KpiCard
          title="پاسخ‌گرفته"
          icon={CheckCircle2}
          color="green"
          value={inquiries.data?.onTime ?? null}
          loading={inquiries.isLoading}
        />
        <KpiCard
          title="در انتظار"
          icon={Clock}
          color="amber"
          value={
            inquiries.data
              ? Math.max(inquiries.data.total - inquiries.data.onTime - inquiries.data.late, 0) +
                inquiries.data.late
              : null
          }
          loading={inquiries.isLoading}
        />
      </KpiGrid>
      <KpiGrid>
        <KpiCard
          title="درخواست خریدم"
          icon={ShoppingBag}
          color="amber"
          value={purchases.data?.total ?? null}
          subtitle={
            purchases.data
              ? `${purchases.data.approved} تأیید · ${purchases.data.pending} در انتظار`
              : undefined
          }
          loading={purchases.isLoading}
        />
        <KpiCard
          title="کارت قرمز فعالم"
          icon={ShieldAlert}
          color="red"
          value={penalties.data?.myActive ?? null}
          loading={penalties.isLoading}
        />
      </KpiGrid>
    </div>
  );
}

function AccountantKpis() {
  const docs = useTodayDocumentStats("mine");
  const pending =
    docs.data ? Math.max(docs.data.uploaded - docs.data.confirmed - docs.data.rejectedOrExpired, 0) : null;
  return (
    <KpiGrid>
      <KpiCard
        title="اسناد آپلودشده امروز"
        icon={FileText}
        color="blue"
        value={docs.data?.uploaded ?? null}
        loading={docs.isLoading}
      />
      <KpiCard
        title="تأییدشده"
        icon={CheckSquare}
        color="green"
        value={docs.data?.confirmed ?? null}
        loading={docs.isLoading}
      />
      <KpiCard
        title="در انتظار"
        icon={Clock}
        color="amber"
        value={pending}
        loading={docs.isLoading}
      />
      <KpiCard
        title="رد شده"
        icon={XCircle}
        color="red"
        value={docs.data?.rejectedOrExpired ?? null}
        loading={docs.isLoading}
      />
    </KpiGrid>
  );
}
