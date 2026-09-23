/**
 * Report «دلایل شکست» — counts of lost deals by reason.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Loader2 } from "lucide-react";

import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toFaDigits } from "@/lib/i18n/formatters";
import { supabase } from "@/integrations/supabase/client";
import { listDealLostReasons } from "@/lib/sales-desk";

export const Route = createFileRoute("/_app/sales/reports/deal-lost")({
  beforeLoad: async () => {
    await requirePermission("deal-lost-report", "view");
  },
  component: DealLostReportPage,
});

function DealLostReportPage() {
  const q = useQuery({
    queryKey: ["sales-desk", "deal-lost-report"],
    queryFn: async () => {
      const reasons = await listDealLostReasons();
      const { data, error } = await supabase
        .from("sales_interactions" as never)
        .select("id, lost_reason_id, lost_reason_other, status" as never)
        .eq("kind" as never, "request" as never)
        .eq("status" as never, "lost" as never)
        .limit(2000);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as Array<{
        id: string;
        lost_reason_id: string | null;
        lost_reason_other: string | null;
      }>;
      const counts = new Map<string, number>();
      let missing = 0;
      for (const r of rows) {
        if (!r.lost_reason_id) {
          missing += 1;
          continue;
        }
        counts.set(r.lost_reason_id, (counts.get(r.lost_reason_id) ?? 0) + 1);
      }
      return {
        reasons,
        counts,
        missing,
        total: rows.length,
      };
    },
    staleTime: 60_000,
  });

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        title="دلایل شکست"
        description="تعداد معاملات ناموفق به تفکیک دلیل"
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/settings/deal-lost-reasons">دلایل شکست معامله</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/operations/sales-desk">
                <ArrowRight className="ms-1 h-4 w-4" />
                میز فروش
              </Link>
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            مجموع ناموفق:{" "}
            {q.data ? toFaDigits(q.data.total) : "…"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {q.isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> …
            </p>
          ) : q.isError ? (
            <p className="text-sm text-destructive">{(q.error as Error).message}</p>
          ) : (
            <ul className="divide-y">
              {(q.data?.reasons ?? []).map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 py-2.5 text-sm"
                >
                  <span>
                    {r.title}
                    {!r.is_active ? (
                      <Badge variant="outline" className="mr-2 text-[10px]">
                        غیرفعال
                      </Badge>
                    ) : null}
                  </span>
                  <Badge variant="secondary">
                    {toFaDigits(q.data?.counts.get(r.id) ?? 0)}
                  </Badge>
                </li>
              ))}
              {(q.data?.missing ?? 0) > 0 ? (
                <li className="flex items-center justify-between py-2.5 text-sm text-muted-foreground">
                  <span>بدون دلیل</span>
                  <Badge variant="outline">{toFaDigits(q.data!.missing)}</Badge>
                </li>
              ) : null}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
