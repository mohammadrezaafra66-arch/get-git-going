import { Flame, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { MICardShell } from "./CardShell";
import { fetchTrendingProducts, type RangeDays } from "@/lib/management/market-intelligence";
import { formatNumber } from "@/lib/i18n/formatters";

const STOCK_LABEL: Record<string, string> = {
  available: "موجود",
  unavailable: "ناموجود",
  limited: "محدود",
  unknown: "نامشخص",
};
const STOCK_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  available: "default",
  limited: "secondary",
  unavailable: "destructive",
  unknown: "outline",
};

export function TrendingProductsCard({ days }: { days: RangeDays }) {
  const q = useQuery({
    queryKey: ["mi-trending", days],
    queryFn: () => fetchTrendingProducts(days, 10),
    staleTime: 60_000,
  });

  return (
    <MICardShell
      title="محصولات داغ بازار"
      description={`بر اساس تعاملات کاربران در ${formatNumber(days)} روز اخیر`}
      rule="trend = جستجو×۳ + بررسی قیمت×۴ + باز کردن نمودار×۲ + مشاهده تابلو×۱"
      icon={<Flame className="h-4 w-4 text-orange-500" />}
    >
      {q.isLoading ? (
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال بارگذاری...
        </div>
      ) : q.isError ? (
        <p className="py-6 text-center text-sm text-destructive">خطا در بارگذاری</p>
      ) : !q.data || q.data.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          داده کافی برای این بازه وجود ندارد.
        </p>
      ) : (
        <ol className="space-y-1.5">
          {q.data.map((p, idx) => {
            const stock = p.stock_status ?? "unknown";
            return (
              <li
                key={p.product_id}
                className="flex items-center gap-3 rounded-md border p-2 text-sm"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold tabular-nums">
                  {formatNumber(idx + 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{p.name}</div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    {p.brand?.name && <span>{p.brand.name}</span>}
                    {p.category?.name && <span>· {p.category.name}</span>}
                    {p.sku && <span className="font-mono">· {p.sku}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge variant={STOCK_VARIANT[stock] ?? "outline"} className="text-[10px]">
                    {STOCK_LABEL[stock] ?? stock}
                  </Badge>
                  <span className="text-xs font-bold tabular-nums">
                    {formatNumber(p.trend_score)}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </MICardShell>
  );
}
