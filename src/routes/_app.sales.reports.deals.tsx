import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/i18n/formatters";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/sales/reports/deals")({
  staticData: {
    gate: { kind: "anyRole", allowed: ["admin", "manager", "sales"] },
  },
  beforeLoad: async () => {
    await requirePermission("deal-lost-report", "view");
  },
  component: DealCohortReportsPage,
});

function DealCohortReportsPage() {
  const [tab, setTab] = useState<"register" | "close">("register");
  const q = useQuery({
    queryKey: ["sales-desk", "deal-cohorts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_interactions" as never)
        .select("id, status, register_time, created_at, won_at, lost_at, estimated_amount" as never)
        .eq("kind" as never, "request" as never)
        .is("deleted_at" as never, null as never)
        .limit(4000);
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<{
        id: string;
        status: string;
        register_time: string | null;
        created_at: string;
        won_at: string | null;
        lost_at: string | null;
        estimated_amount: number | null;
      }>;
    },
  });

  const rows = q.data ?? [];
  const register = summarize(rows.map((r) => ({ ...r, when: r.register_time ?? r.created_at })));
  const close = summarize(
    rows
      .filter((r) => r.status === "won" || r.status === "lost")
      .map((r) => ({ ...r, when: r.status === "won" ? r.won_at : r.lost_at })),
  );
  const active = tab === "register" ? register : close;

  return (
    <div className="deal-surface space-y-4" dir="rtl">
      <PageHeader
        title="گزارش معاملات"
        description="دو نما: تاریخ ثبت و تاریخ موفق/ناموفق"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/deal/filter">لیست معاملات</Link>
          </Button>
        }
      />
      <div className="flex gap-2">
        <Button type="button" variant={tab === "register" ? "default" : "outline"} onClick={() => setTab("register")}>
          تحلیل معاملات (تاریخ ثبت)
        </Button>
        <Button type="button" variant={tab === "close" ? "default" : "outline"} onClick={() => setTab("close")}>
          تحلیل فروش (تاریخ موفق/ناموفق)
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tab === "register" ? "cohort تاریخ ثبت" : "cohort تاریخ بستن"}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm md:grid-cols-4">
          {q.isLoading ? (
            <>
              <div className="h-16 animate-pulse rounded-xl bg-muted" />
              <div className="h-16 animate-pulse rounded-xl bg-muted" />
              <div className="h-16 animate-pulse rounded-xl bg-muted" />
              <div className="h-16 animate-pulse rounded-xl bg-muted" />
            </>
          ) : (
            <>
              <p className="deal-elev rounded-xl border bg-card p-3">تعداد کل {active.count}</p>
              <p className="deal-elev deal-stat-won rounded-xl border bg-card p-3">موفق {active.won} · IRR {formatNumber(active.wonAmt)}</p>
              <p className="deal-elev deal-stat-lost rounded-xl border bg-card p-3">ناموفق {active.lost} · IRR {formatNumber(active.lostAmt)}</p>
              <p className="deal-elev deal-stat-open rounded-xl border bg-card p-3">جاری {active.open} · IRR {formatNumber(active.openAmt)}</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function summarize(
  rows: Array<{ status: string; estimated_amount: number | null; when: string | null }>,
) {
  const amt = (pred: (r: { status: string }) => boolean) =>
    rows.filter(pred).reduce((n, r) => n + Number(r.estimated_amount ?? 0), 0);
  return {
    count: rows.length,
    won: rows.filter((r) => r.status === "won").length,
    lost: rows.filter((r) => r.status === "lost").length,
    open: rows.filter((r) => r.status === "open").length,
    wonAmt: amt((r) => r.status === "won"),
    lostAmt: amt((r) => r.status === "lost"),
    openAmt: amt((r) => r.status === "open"),
  };
}
