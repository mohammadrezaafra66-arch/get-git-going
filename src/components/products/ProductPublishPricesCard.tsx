import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, CheckCircle2, AlertCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasPermissionEx } from "@/lib/rbac/roles";
import { publishProductPrices, type PublishProductResult } from "@/lib/pricing/publish-prices";
import { formatNumber, formatDateTimeFa } from "@/lib/i18n/formatters";

interface Props {
  productId: string;
}

export function ProductPublishPricesCard({ productId }: Props) {
  const { roles } = useAuth();
  const canPrice =
    hasPermissionEx(roles, "pricing", "update") || hasPermissionEx(roles, "pricing", "create");
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<PublishProductResult | null>(null);

  const {
    data: prices,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["product-computed-prices", productId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("product_computed_prices_public")
        .select(
          "rounded_sale_price, computed_at, source, sale_price_type:sale_price_types(id, title, sort_order)",
        )
        .eq("product_id", productId);
      if (error) throw error;
      const rows = (data ?? []) as any[];
      rows.sort(
        (a, b) => (a.sale_price_type?.sort_order ?? 0) - (b.sale_price_type?.sort_order ?? 0),
      );
      return rows;
    },
  });

  async function handleRun() {
    setRunning(true);
    setLastResult(null);
    try {
      const r = await publishProductPrices({ productId });
      setLastResult(r);
      if (r.succeeded > 0) {
        toast.success(
          `${r.succeeded} قیمت فروش محاسبه و ذخیره شد` + (r.failed > 0 ? ` — ${r.failed} خطا` : ""),
        );
      } else {
        toast.error(`هیچ قیمتی محاسبه نشد — ${r.failed} خطا`);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["product-computed-prices", productId] }),
        queryClient.invalidateQueries({ queryKey: ["sales-search"] }),
        queryClient.invalidateQueries({ queryKey: ["product-price-history"] }),
      ]);
      refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "خطا در محاسبه قیمت‌ها");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">قیمت‌های فروش فعال</h3>
            <p className="text-xs text-muted-foreground">
              با کلیک روی دکمه، برای همهٔ انواع قیمت فروش فعال محاسبه و در سیستم ذخیره می‌شود.
            </p>
          </div>
          {canPrice && (
            <Button size="sm" onClick={handleRun} disabled={running}>
              {running ? (
                <Loader2 className="ms-1 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="ms-1 h-4 w-4" />
              )}
              محاسبه و انتشار قیمت‌ها
            </Button>
          )}
        </div>

        {isLoading ? (
          <p className="text-xs text-muted-foreground">در حال بارگذاری…</p>
        ) : (prices ?? []).length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
            هنوز قیمت فروش فعالی برای این محصول ذخیره نشده. روی «محاسبه و انتشار قیمت‌ها» کلیک کنید.
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {(prices ?? []).map((row: any) => (
              <div
                key={row.sale_price_type?.id}
                className="flex items-center justify-between rounded-md border border-border bg-background p-2 text-sm"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{row.sale_price_type?.title ?? "—"}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {formatDateTimeFa(row.computed_at)}
                    {row.source ? ` · ${row.source}` : ""}
                  </div>
                </div>
                <div className="font-bold tabular-nums">
                  {formatNumber(Number(row.rounded_sale_price))} ت
                </div>
              </div>
            ))}
          </div>
        )}

        {lastResult && (
          <div className="space-y-1 rounded-md border border-border p-2 text-xs">
            <div className="flex items-center gap-2 font-medium">
              <RefreshCw className="h-3.5 w-3.5" />
              نتیجه آخرین اجرا: {lastResult.succeeded} موفق / {lastResult.failed} خطا از{" "}
              {lastResult.total_types}
            </div>
            <ul className="space-y-1">
              {lastResult.results.map((r) => (
                <li key={r.sale_price_type_id} className="flex items-start gap-2">
                  {r.ok ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-600" />
                  ) : (
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-destructive" />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{r.sale_price_type_title}:</span>{" "}
                    {r.ok ? (
                      <>
                        {formatNumber(Number(r.new_price ?? 0))} ت{" "}
                        {r.changed ? (
                          <Badge variant="secondary" className="ms-1 text-[10px]">
                            به‌روزرسانی شد
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="ms-1 text-[10px]">
                            بدون تغییر
                          </Badge>
                        )}
                      </>
                    ) : (
                      <span className="text-destructive">{r.error}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
