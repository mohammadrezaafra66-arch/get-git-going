import { useQuery } from "@tanstack/react-query";
import { Loader2, Warehouse as WarehouseIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/i18n/formatters";
import { fetchProductStockByWarehouse } from "@/lib/warehouses/queries";

/**
 * ۱۷۶ / ۸.۶ — نمایش موجودی یک محصول به تفکیک انبار.
 * اگر محصول هیچ ردیف انباری ندارد، کارت رندر نمی‌شود (محصول هنوز وارد مدل
 * چندانباره نشده و `stock_status` دستی‌اش معتبر است).
 */
export function ProductStockByWarehouse({ productId }: { productId: string }) {
  const q = useQuery({
    queryKey: ["product-stock-by-warehouse", productId],
    queryFn: () => fetchProductStockByWarehouse(productId),
    staleTime: 30_000,
  });

  if (q.isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> در حال بارگذاری موجودی انبارها…
        </CardContent>
      </Card>
    );
  }
  if (q.isError || !q.data || q.data.length === 0) return null;

  const total = q.data.reduce((s, r) => s + r.quantity, 0);

  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <WarehouseIcon className="h-4 w-4 text-primary" />
            موجودی به تفکیک انبار
          </span>
          <Badge variant={total > 0 ? "secondary" : "outline"}>مجموع: {formatNumber(total)}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          {q.data.map((r) => (
            <div key={r.warehouse_id} className="flex items-center justify-between py-2 text-sm">
              <span>{r.warehouse_name}</span>
              <span
                className={r.quantity > 0 ? "font-semibold" : "font-semibold text-muted-foreground"}
              >
                {formatNumber(r.quantity)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
