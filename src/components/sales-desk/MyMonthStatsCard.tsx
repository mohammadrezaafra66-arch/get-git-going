import { useQuery } from "@tanstack/react-query";
import { BarChart3, Loader2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchMyMonthStats } from "@/lib/sales-desk";
import { formatNumber, toFaDigits } from "@/lib/i18n/formatters";

/**
 * کارت آمار شخصی فروشنده برای ماه جاری (RPC sales_my_month_stats).
 */
export function MyMonthStatsCard() {
  const q = useQuery({
    queryKey: ["sales-desk", "my-month-stats"],
    queryFn: () => fetchMyMonthStats(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  return (
    <Card dir="rtl">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          آمار من این ماه
        </CardTitle>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> در حال بارگذاری…
          </div>
        ) : q.isError ? (
          <p className="text-sm text-destructive">
            {(q.error as Error)?.message || "خطا در دریافت آمار"}
          </p>
        ) : !q.data ? (
          <p className="text-sm text-muted-foreground">آماری ثبت نشده است.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <Stat label="تماس‌ها" value={q.data.calls_count} />
            <Stat label="موفق" value={q.data.won_count} />
            <Stat label="ناموفق" value={q.data.lost_count} />
            {q.data.month_start ? (
              <p className="col-span-3 text-xs text-muted-foreground">
                از{" "}
                <span dir="ltr" className="inline-block tabular-nums">
                  {toFaDigits(q.data.month_start.slice(0, 10))}
                </span>
                {q.data.calls_source === "call_logs" ? " · منبع: تماس‌های ثبت‌شده" : null}
              </p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-center">
      <div className="text-lg font-semibold tabular-nums">{formatNumber(value)}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
