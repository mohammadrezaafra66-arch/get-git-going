import { Eye, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchTopCheckedToday } from "@/lib/management/market-intelligence";
import { formatNumber } from "@/lib/i18n/formatters";

export function MarketingTopCheckedTodayCard() {
  const q = useQuery({
    queryKey: ["reports", "marketing", "top-checked-today"] as const,
    queryFn: () => fetchTopCheckedToday(10),
    staleTime: 60_000,
  });

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <Eye className="h-4 w-4 text-blue-600" />
          محصولات بیشتر بررسی‌شده امروز
        </CardTitle>
        <CardDescription>
          محصولاتی که امروز بیشترین تعداد بررسی قیمت را داشته‌اند
        </CardDescription>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال بارگذاری...
          </div>
        ) : q.isError ? (
          <p className="py-6 text-center text-sm text-destructive">
            خطا در بارگذاری داده‌ها. لطفاً دوباره تلاش کنید.
          </p>
        ) : !q.data || q.data.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            داده‌ای برای امروز ثبت نشده است.
          </p>
        ) : (
          <ol className="space-y-1.5">
            {q.data.map((p, idx) => (
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
                  {p.current_price != null && (
                    <Badge variant="outline" className="text-[10px] tabular-nums">
                      {formatNumber(p.current_price)}
                    </Badge>
                  )}
                  <span className="text-xs font-bold tabular-nums text-blue-600">
                    {formatNumber(p.price_check_count)} بررسی
                  </span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {formatNumber(p.unique_user_count)} نفر
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}