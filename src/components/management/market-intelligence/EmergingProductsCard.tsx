import { Rocket, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { MICardShell } from "./CardShell";
import { fetchEmergingProducts, type RangeDays } from "@/lib/management/market-intelligence";
import { formatNumber } from "@/lib/i18n/formatters";

const STOCK_LABEL: Record<string, string> = { available: "موجود", limited: "محدود" };

export function EmergingProductsCard({ days }: { days: RangeDays }) {
  const q = useQuery({
    queryKey: ["mi-emerging", days],
    queryFn: () => fetchEmergingProducts(days, 10),
    staleTime: 60_000,
  });

  return (
    <MICardShell
      title="محصولات در آستانه داغ شدن"
      description={`رشد سریع تعاملات در ${formatNumber(days)} روز اخیر، ولی هنوز در صدر نیستند`}
      rule="امتیاز فعلی حداقل ۲ برابر بازه قبل و خارج از تاپ ۱۰ ترند"
      icon={<Rocket className="h-4 w-4 text-violet-600" />}
    >
      {q.isLoading ? (
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال بارگذاری...
        </div>
      ) : q.isError ? (
        <p className="py-6 text-center text-sm text-destructive">خطا در بارگذاری</p>
      ) : !q.data || q.data.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          هنوز داده کافی برای تحلیل رفتار بازار وجود ندارد.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {q.data.map((p) => (
            <li key={p.product_id} className="rounded-md border p-2 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{p.name}</div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    {p.brand?.name && <span>{p.brand.name}</span>}
                    {p.category?.name && <span>· {p.category.name}</span>}
                    {STOCK_LABEL[p.stock_status] && (
                      <Badge variant="outline" className="h-4 px-1 text-[10px]">{STOCK_LABEL[p.stock_status]}</Badge>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-left">
                  <div className="text-sm font-bold tabular-nums text-violet-600">
                    +{formatNumber(p.growth_percent)}٪
                  </div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    {formatNumber(p.previous_score)} → {formatNumber(p.current_score)}
                  </div>
                </div>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                «بررسی قیمت این محصول نسبت به بازه قبل رشد زیادی داشته است.»
              </p>
            </li>
          ))}
        </ul>
      )}
    </MICardShell>
  );
}