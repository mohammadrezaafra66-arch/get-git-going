import { TrendingUp, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchEmergingProducts, type RangeDays } from "@/lib/management/market-intelligence";
import { formatNumber } from "@/lib/i18n/formatters";
import { useAuth } from "@/lib/auth/AuthProvider";

const PRIVILEGED_ROLES = ["admin", "manager", "accountant"] as const;

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

interface Props {
  range: RangeDays;
}

export function MarketingEmergingProductsCard({ range }: Props) {
  const { roles } = useAuth();
  const isPrivileged = roles.some((r) => (PRIVILEGED_ROLES as readonly string[]).includes(r));

  const q = useQuery({
    queryKey: ["reports", "marketing", "emerging-products", range] as const,
    queryFn: () => fetchEmergingProducts(range, 10),
    staleTime: 60_000,
    enabled: isPrivileged,
  });

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4 text-emerald-500" />
          محصولات در حال رشد
        </CardTitle>
        <CardDescription>
          محصولاتی که بیشترین رشد تعامل را در {formatNumber(range)} روز اخیر داشته‌اند
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!isPrivileged ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            این کارت فقط برای مدیران قابل مشاهده است.
          </p>
        ) : q.isLoading ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال بارگذاری...
          </div>
        ) : q.isError ? (
          <p className="py-6 text-center text-sm text-destructive">
            خطا در بارگذاری داده‌ها. لطفاً دوباره تلاش کنید.
          </p>
        ) : !q.data || q.data.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            داده کافی برای این بازه وجود ندارد.
          </p>
        ) : (
          <ol className="space-y-1.5">
            {q.data.map((p, idx) => {
              const stock = p.stock_status ?? "unknown";
              const growth = p.growth_percent ?? 0;
              const growthPositive = growth >= 0;
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
                    <span
                      className={`text-xs font-bold tabular-nums ${growthPositive ? "text-emerald-600" : "text-red-600"}`}
                    >
                      {growthPositive ? "+" : ""}
                      {formatNumber(growth)}٪
                    </span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      امتیاز {formatNumber(p.current_score)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
