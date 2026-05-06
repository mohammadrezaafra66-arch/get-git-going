import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatDateFa, formatDateTimeFa, toFaDigits } from "@/lib/i18n/formatters";

type SuspectRow = {
  id: string;
  value: number;
  observed_at: string;
  change_percent: number | null;
  note: string | null;
  indicator: { code: string; title_fa: string } | null;
  source: { code: string; title_fa: string } | null;
};

export function MarketRateSuspectAlerts() {
  const { roles } = useAuth();
  const canView = roles.some((r) => ["admin", "manager", "accountant"].includes(r));
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const q = useQuery({
    queryKey: ["market-rate-suspect-alerts"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_rate_ticks")
        .select(
          "id,value,observed_at,change_percent,note," +
            "indicator:market_indicators(code,title_fa)," +
            "source:market_rate_sources(code,title_fa)",
        )
        .eq("status", "suspect")
        .order("observed_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as unknown as SuspectRow[];
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    if (q.isSuccess && q.dataUpdatedAt) {
      setLastUpdatedAt(new Date(q.dataUpdatedAt));
    }
  }, [q.isSuccess, q.dataUpdatedAt]);

  if (!canView) return null;

  return (
    <Card className="border-amber-500/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          نرخ‌های مشکوک نیازمند بررسی
          {q.data && q.data.length > 0 && (
            <Badge variant="destructive" className="text-[10px]">
              {toFaDigits(q.data.length)}
            </Badge>
          )}
        </CardTitle>
        {lastUpdatedAt && (
          <div className="text-[11px] text-muted-foreground">
            آخرین به‌روزرسانی: {formatDateTimeFa(lastUpdatedAt)}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <div className="text-sm text-muted-foreground">در حال بارگذاری…</div>
        ) : q.isError ? (
          (() => {
            console.warn("[MarketRateSuspectAlerts] query error", q.error);
            return (
              <div className="flex flex-col items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                <span>خطا در دریافت نرخ‌های مشکوک. لطفاً دوباره تلاش کنید یا با مدیر سیستم تماس بگیرید.</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => q.refetch()}
                  disabled={q.isFetching}
                >
                  <RefreshCw className="ml-1 h-3 w-3" />
                  تلاش دوباره
                </Button>
              </div>
            );
          })()
        ) : !q.data || q.data.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            در حال حاضر نرخ مشکوکی ثبت نشده است.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-right text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-2 py-2">شاخص</th>
                  <th className="px-2 py-2">مقدار</th>
                  <th className="px-2 py-2">منبع</th>
                  <th className="px-2 py-2">زمان مشاهده</th>
                  <th className="px-2 py-2">تغییر %</th>
                  <th className="px-2 py-2">دلیل</th>
                </tr>
              </thead>
              <tbody>
                {q.data.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-2 py-2">
                      <div className="font-medium">{r.indicator?.title_fa ?? "—"}</div>
                      <div className="text-[10px] text-muted-foreground">{r.indicator?.code}</div>
                    </td>
                    <td className="px-2 py-2 font-mono">{toFaDigits(Number(r.value).toLocaleString("en-US"))}</td>
                    <td className="px-2 py-2">{r.source?.title_fa ?? r.source?.code ?? "—"}</td>
                    <td className="px-2 py-2 text-muted-foreground">{formatDateFa(r.observed_at)}</td>
                    <td className="px-2 py-2">
                      {r.change_percent == null ? "—" : toFaDigits(Number(r.change_percent).toFixed(2)) + "٪"}
                    </td>
                    <td
                      className="px-2 py-2 max-w-[260px] truncate text-muted-foreground"
                      title={r.note ?? ""}
                    >
                      {r.note ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}