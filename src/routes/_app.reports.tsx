import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { MarketingActiveChannelsCard } from "@/components/reports/MarketingActiveChannelsCard";
import { MarketingTrendingCard } from "@/components/reports/MarketingTrendingCard";
import { MarketingTopCheckedTodayCard } from "@/components/reports/MarketingTopCheckedTodayCard";
import { MarketingEmergingProductsCard } from "@/components/reports/MarketingEmergingProductsCard";
import { MarketingPromotionSuggestionsUsedCard } from "@/components/reports/MarketingPromotionSuggestionsUsedCard";
import type { RangeDays } from "@/lib/management/market-intelligence";

const RANGE_OPTIONS: { value: RangeDays; label: string }[] = [
  { value: 7, label: "۷ روز" },
  { value: 30, label: "۳۰ روز" },
  { value: 90, label: "۹۰ روز" },
];

function ReportsPage() {
  const [range, setRange] = useState<RangeDays>(30);

  return (
    <div className="space-y-6">
      <PageHeader title="گزارش‌ها" description="گزارش‌های فروش، مالی و عملیاتی" />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">بازه زمانی</span>
        <Select value={String(range)} onValueChange={(v) => setRange(Number(v) as RangeDays)}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={String(o.value)}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="marketing" dir="rtl" className="space-y-4">
        <TabsList>
          <TabsTrigger value="marketing">بازاریابی</TabsTrigger>
          <TabsTrigger value="sales">فروش</TabsTrigger>
          <TabsTrigger value="finance">مالی</TabsTrigger>
        </TabsList>

        <TabsContent value="marketing" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <MarketingTrendingCard range={range} />
            <MarketingTopCheckedTodayCard />
            <MarketingEmergingProductsCard range={range} />
            <MarketingPromotionSuggestionsUsedCard range={range} />
            <MarketingActiveChannelsCard />
          </div>
        </TabsContent>

        <TabsContent value="sales" className="space-y-4">
          <SalesReportTab range={range} />
        </TabsContent>

        <TabsContent value="finance" className="space-y-4">
          <FinanceReportTab range={range} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SalesReportTab({ range }: { range: number }) {
  const since = new Date(Date.now() - range * 24 * 60 * 60 * 1000).toISOString();

  // فروش = پیش‌فاکتورهای پذیرفته‌شده در بازه، بر پایهٔ `accepted_at`.
  //
  // منبع پیشین جدول `invoices` بود؛ آن جدول در migration 332 حذف شده و این
  // پرس‌وجو با `throw error` کل تب «فروش» را برای هر کاربر می‌شکست.
  //
  // نام مشتری از ستون `sales_quotes.customer_name` خوانده می‌شود و نه از join با
  // `customers`. دو دلیل، هر دو اندازه‌گیری‌شده روی داده‌های زنده (۱۴۰۵/۰۶/۱۴):
  //   ۱) `customers` ستونی به نام `full_name` ندارد؛ ستون نامش `name` است.
  //   ۲) `customer_id` روی ۶ ردیف از ۶۶ خالی است — از جمله ۲ ردیف از ۹ ردیف
  //      پذیرفته‌شده. یک join از نوع `!inner` آن دو را (شامل بزرگ‌ترین فروش
  //      پذیرفته‌شده) بی‌صدا حذف می‌کرد. `customer_name` روی هر ۶۶ ردیف پر است.
  const invoicesQ = useQuery({
    queryKey: ["report-sales-accepted-quotes", range],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_quotes")
        .select("id, final_amount, status, accepted_at, customer_name, accounting_registered_at")
        .gte("accepted_at", since)
        .order("accepted_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      // `src/integrations/supabase/types.ts` هنوز `accepted_at` را نمی‌شناسد (و
      // هنوز جدول حذف‌شدهٔ `invoices` را اعلام می‌کند). ستون در دیتابیس زنده هست
      // — همین کور بودنِ typeها بود که گذاشت باگ `invoices` هفته‌ها بماند.
      // بازتولید آن فایل خارج از دامنهٔ این تغییر است، پس مثل بقیهٔ جاهای این
      // codebase اینجا cast می‌کنیم و شکل واقعی را صریح می‌نویسیم.
      const rows = (data ?? []) as unknown as Array<{
        id: string;
        final_amount: number | null;
        status: string;
        accepted_at: string | null;
        customer_name: string | null;
        accounting_registered_at: string | null;
      }>;
      const total = rows.reduce((s, r) => s + Number(r.final_amount ?? 0), 0);
      const byStatus: Record<string, number> = {};
      for (const r of rows) {
        byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      }
      // Top 5 customers by total
      const byCustomer: Record<string, { name: string; total: number }> = {};
      for (const r of rows) {
        const name = r.customer_name ?? "—";
        byCustomer[name] = {
          name,
          total: (byCustomer[name]?.total ?? 0) + Number(r.final_amount ?? 0),
        };
      }
      const topCustomers = Object.values(byCustomer)
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);
      // Daily revenue for simple chart
      const daily: Record<string, number> = {};
      for (const r of rows) {
        const day = (r.accepted_at ?? "").slice(0, 10);
        if (!day) continue;
        daily[day] = (daily[day] ?? 0) + Number(r.final_amount ?? 0);
      }
      const chartData = Object.entries(daily)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, amount]) => ({ date: date.slice(5), amount }));
      const registered = rows.filter((r) => r.accounting_registered_at != null).length;
      return { count: rows.length, total, byStatus, topCustomers, chartData, registered };
    },
  });

  // وضعیت‌های `sales_quotes`. `paid`/`overdue` از دنیای `invoices` بودند و روی
  // این منبع هرگز رخ نمی‌دهند؛ نگه داشتنشان یعنی برچسبی که هیچ‌وقت دیده نمی‌شود.
  const STATUS_FA: Record<string, string> = {
    draft: "پیش‌نویس",
    sent: "ارسال‌شده",
    accepted: "پذیرفته‌شده",
    rejected: "ردشده",
    canceled: "لغوشده",
  };

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-primary">
              {invoicesQ.isLoading ? "…" : (invoicesQ.data?.count ?? 0).toLocaleString("fa-IR")}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">تعداد فاکتور</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-emerald-600">
              {invoicesQ.isLoading
                ? "…"
                : Math.round((invoicesQ.data?.total ?? 0) / 1_000_000).toLocaleString("fa-IR")}
              <span className="text-base font-normal text-muted-foreground"> م.ت</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">جمع کل (میلیون تومان)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-blue-600">
              {invoicesQ.isLoading ? "…" : (invoicesQ.data?.registered ?? 0).toLocaleString("fa-IR")}
            </div>
            {/* منبع پیشین `byStatus["paid"]` بود؛ `sales_quotes` هیچ وضعیت `paid`
                ندارد، پس این کارت برای همیشه صفر می‌ماند — دقیقاً همان صفرِ
                نادرستی که این مأموریت برای حذفش است. `accounting_registered_at`
                نزدیک‌ترین معنای واقعیِ موجود است (۷ از ۹ پیش‌فاکتور پذیرفته‌شده). */}
            <div className="mt-1 text-xs text-muted-foreground">ثبت‌شده در حسابداری</div>
          </CardContent>
        </Card>
      </div>

      {/* Status breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">وضعیت فاکتورها</CardTitle>
        </CardHeader>
        <CardContent>
          {invoicesQ.isLoading ? (
            <div className="text-sm text-muted-foreground">در حال بارگذاری…</div>
          ) : (
            <div className="space-y-2">
              {Object.entries(invoicesQ.data?.byStatus ?? {}).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between text-sm">
                  <span>{STATUS_FA[status] ?? status}</span>
                  <span className="font-bold">{count.toLocaleString("fa-IR")}</span>
                </div>
              ))}
              {Object.keys(invoicesQ.data?.byStatus ?? {}).length === 0 && (
                <p className="text-sm text-muted-foreground">فاکتوری در این بازه ثبت نشده</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top customers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">۵ مشتری برتر</CardTitle>
        </CardHeader>
        <CardContent>
          {invoicesQ.isLoading ? (
            <div className="text-sm text-muted-foreground">در حال بارگذاری…</div>
          ) : (invoicesQ.data?.topCustomers ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">داده‌ای موجود نیست</p>
          ) : (
            <ul className="space-y-2">
              {invoicesQ.data?.topCustomers.map((c) => (
                <li key={c.name} className="flex items-center justify-between text-sm">
                  <span className="truncate">{c.name}</span>
                  <span className="shrink-0 font-bold text-emerald-700">
                    {Math.round(c.total / 1_000).toLocaleString("fa-IR")} هزار ت
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FinanceReportTab({ range }: { range: number }) {
  const since = new Date(Date.now() - range * 24 * 60 * 60 * 1000).toISOString();

  const receivablesQ = useQuery({
    queryKey: ["report-finance-receivables", range],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // Use the shared summary RPC (same one the receivables page uses) instead of
      // selecting columns that do not exist on vw_customer_receivables.
      const { data, error } = await supabase.rpc("get_receivables_summary", {
        p_from_date: undefined,
        p_to_date: undefined,
        p_customer_id: undefined,
      });
      if (error) throw error;
      const row = (data as Array<{
        total_outstanding: number | null;
        overdue_outstanding: number | null;
        due_today: number | null;
      }> | null)?.[0];
      return {
        totalReceivables: Number(row?.total_outstanding ?? 0),
        overdueReceivables: Number(row?.overdue_outstanding ?? 0),
        dueTodayReceivables: Number(row?.due_today ?? 0),
      };
    },
  });

  const paymentsQ = useQuery({
    queryKey: ["report-finance-payments", range],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_receipts")
        .select("id, amount, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const rows = data ?? [];
      const totalPayments = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
      return { count: rows.length, totalPayments };
    },
  });

  const fmt = (n: number) => Math.round(n / 1_000_000).toLocaleString("fa-IR");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">
              {receivablesQ.isLoading ? "…" : fmt(receivablesQ.data?.totalReceivables ?? 0)}
              <span className="text-sm font-normal text-muted-foreground"> م.ت</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">جمع مطالبات</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-rose-600">
              {receivablesQ.isLoading ? "…" : fmt(receivablesQ.data?.overdueReceivables ?? 0)}
              <span className="text-sm font-normal text-muted-foreground"> م.ت</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">معوقات</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-amber-600">
              {receivablesQ.isLoading ? "…" : fmt(receivablesQ.data?.dueTodayReceivables ?? 0)}
              <span className="text-sm font-normal text-muted-foreground"> م.ت</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">سررسید امروز</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-emerald-600">
              {paymentsQ.isLoading ? "…" : fmt(paymentsQ.data?.totalPayments ?? 0)}
              <span className="text-sm font-normal text-muted-foreground"> م.ت</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">وصولی {range} روز اخیر</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">خلاصه دریافت‌ها ({range} روز اخیر)</CardTitle>
        </CardHeader>
        <CardContent>
          {paymentsQ.isLoading ? (
            <div className="text-sm text-muted-foreground">در حال بارگذاری…</div>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">تعداد رسید پرداخت</span>
                <span className="font-bold">
                  {(paymentsQ.data?.count ?? 0).toLocaleString("fa-IR")}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">میانگین هر رسید</span>
                <span className="font-bold">
                  {paymentsQ.data && paymentsQ.data.count > 0
                    ? Math.round(
                        paymentsQ.data.totalPayments / paymentsQ.data.count / 1_000,
                      ).toLocaleString("fa-IR")
                    : "—"}{" "}
                  هزار ت
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export const Route = createFileRoute("/_app/reports")({
  // Wave 2 / B-1 — the client half of the guard below. `beforeLoad` runs only on the server
  // for a direct navigation and cannot see a localStorage session, so RouteRoleGate reads this.
  // Mirrors requirePermission("reports", "view"). `allowed` is the LIVE
  // role_permissions.reports.can_view set read from the database on 2026-09-06 —
  // NOT src/lib/rbac/roles.ts, whose static table disagrees for several modules.
  staticData: {
    gate: {
      kind: "anyRole",
      allowed: ["admin", "manager", "accountant", "sales", "purchase_specialist", "viewer"],
    },
  },
  beforeLoad: async () => {
    await requirePermission("reports", "view");
  },
  component: ReportsPage,
});
