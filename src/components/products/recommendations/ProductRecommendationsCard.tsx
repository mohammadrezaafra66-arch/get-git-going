import { useQuery } from "@tanstack/react-query";
import { Loader2, Sparkles, Package, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/i18n/formatters";
import {
  fetchProductRecommendations,
  REASON_LABEL_FA,
  STOCK_LABEL_FA,
  type ProductRecommendation,
} from "@/lib/products/recommendations";

interface Props {
  productId: string | null;
  onSelect?: (rec: ProductRecommendation) => void;
  compact?: boolean;
}

export function ProductRecommendationsCard({ productId, onSelect, compact = false }: Props) {
  const query = useQuery({
    enabled: !!productId,
    queryKey: ["product-recommendations", productId],
    queryFn: () => fetchProductRecommendations(productId!),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
  });

  const items = query.data ?? [];

  return (
    <Card className="border-primary/20">
      <CardHeader className={compact ? "pb-2 pt-3" : undefined}>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          محصولات پیشنهادی برای مقایسه
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          فروشندگان مشابه معمولاً این محصولات را هم بررسی کرده‌اند
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {query.isLoading && (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="mr-2 text-sm">در حال بارگذاری پیشنهادها…</span>
          </div>
        )}
        {query.isError && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
            <AlertCircle className="h-4 w-4" />
            خطا در دریافت پیشنهادها
          </div>
        )}
        {!query.isLoading && !query.isError && items.length === 0 && (
          <p className="rounded-md bg-muted/40 p-3 text-center text-xs text-muted-foreground">
            فعلاً پیشنهاد مرتبطی برای این محصول وجود ندارد.
          </p>
        )}
        <ul className="divide-y divide-border/60">
          {items.map((rec) => (
            <li
              key={rec.product_id}
              className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm font-medium">{rec.name}</span>
                  {rec.is_pinned && (
                    <Badge variant="default" className="h-4 px-1.5 text-[10px]">
                      پین
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  {rec.brand_name && <span>{rec.brand_name}</span>}
                  {rec.category_name && <span>· {rec.category_name}</span>}
                  {rec.sku && <span>· {rec.sku}</span>}
                  <Badge
                    variant="outline"
                    className={
                      rec.stock_status === "in_stock"
                        ? "h-4 border-emerald-500/40 px-1.5 text-[10px] text-emerald-600"
                        : rec.stock_status === "out_of_stock"
                          ? "h-4 border-destructive/40 px-1.5 text-[10px] text-destructive"
                          : "h-4 px-1.5 text-[10px]"
                    }
                  >
                    {STOCK_LABEL_FA[rec.stock_status] ?? rec.stock_status}
                  </Badge>
                  <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                    {REASON_LABEL_FA[rec.reason] ?? rec.reason}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 sm:justify-end">
                <span className="text-sm font-semibold tabular-nums">
                  {rec.current_price != null
                    ? `${formatNumber(Math.round(rec.current_price))} ﷼`
                    : "—"}
                </span>
                {onSelect && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => onSelect(rec)}>
                    مشاهده
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
