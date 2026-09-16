import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardList, ListOrdered, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { withOpsSession } from "@/lib/torob-ops/client-session";
import { FINDING_STATUS_LABELS_FA, type FindingStatus } from "@/lib/torob-ops/types";
import { torobOpsDashboardStats } from "@/lib/torob-ops/functions";
import { toFaDigits } from "@/lib/i18n/formatters";
import { TorobOpsGate } from "./TorobOpsGate";

function DashboardInner() {
  const statsFn = useServerFn(torobOpsDashboardStats);
  const q = useQuery({
    queryKey: ["torob-ops-dashboard"],
    queryFn: () => statsFn({ data: withOpsSession() }),
    refetchInterval: 30_000,
  });

  const counts = q.data?.counts ?? {};

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="عملیات ترب"
        description="مسیر ب: کشف قیمت پایین‌تر، صف بررسی طعمه، و ثبت دستی گزارش پس از تأیید."
      />

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link to="/torob-ops/runs">دستورهای اسکن</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link to="/torob-ops/findings">صف بررسی</Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(
          [
            "manual_review",
            "suspected_bait",
            "confirmed_bait",
            "cheaper_competitor",
            "reported",
          ] as FindingStatus[]
        ).map((status) => (
          <Card key={status}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-medium">
                {status === "suspected_bait" || status === "confirmed_bait" ? (
                  <ShieldAlert className="h-4 w-4" />
                ) : status === "reported" ? (
                  <ClipboardList className="h-4 w-4" />
                ) : (
                  <ListOrdered className="h-4 w-4" />
                )}
                {FINDING_STATUS_LABELS_FA[status]}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold tabular-nums">
              {toFaDigits(String(counts[status] ?? 0))}
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">تعداد اسکن‌ها</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {toFaDigits(String(q.data?.runsTotal ?? 0))}
          </CardContent>
        </Card>
      </div>

      {q.isError ? (
        <p className="text-sm text-destructive">
          {q.error instanceof Error ? q.error.message : "خطا در بارگذاری آمار"}
        </p>
      ) : null}
    </div>
  );
}

export function TorobOpsDashboardPage() {
  return (
    <TorobOpsGate>
      <DashboardInner />
    </TorobOpsGate>
  );
}
