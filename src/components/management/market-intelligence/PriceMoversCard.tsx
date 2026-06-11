import { TrendingUp, TrendingDown, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { MICardShell } from "./CardShell";
import { fetchPriceMovers, type RangeDays } from "@/lib/management/market-intelligence";
import { formatNumber } from "@/lib/i18n/formatters";

interface Props {
  days: RangeDays;
  direction: "up" | "down";
  salePriceTypeId?: string | null;
}

export function PriceMoversCard({ days, direction, salePriceTypeId }: Props) {
  const isUp = direction === "up";
  const q = useQuery({
    queryKey: ["mi-movers", days, direction, salePriceTypeId ?? null],
    queryFn: () => fetchPriceMovers(days, direction, 10, salePriceTypeId ?? undefined),
    staleTime: 60_000,
  });

  return (
    <MICardShell
      title={isUp ? "کالاهای در حال افزایش قیمت" : "کالاهای در حال کاهش قیمت"}
      description={`بازه ${formatNumber(days)} روز ${salePriceTypeId ? "(نوع قیمت انتخابی)" : "(همه انواع قیمت)"}`}
      rule="درصد تغییر = (آخرین قیمت − اولین قیمت در بازه) ÷ اولین قیمت"
      icon={
        isUp ? (
          <TrendingUp className="h-4 w-4 text-emerald-600" />
        ) : (
          <TrendingDown className="h-4 w-4 text-red-600" />
        )
      }
    >
      {q.isLoading ? (
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال بارگذاری...
        </div>
      ) : q.isError ? (
        <p className="py-6 text-center text-sm text-destructive">خطا در بارگذاری</p>
      ) : !q.data || q.data.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {isUp
            ? "کالایی با افزایش قیمت در این بازه پیدا نشد."
            : "کالایی با کاهش قیمت در این بازه پیدا نشد."}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {q.data.map((p) => {
            const pct = Number(p.change_percent ?? 0);
            return (
              <li
                key={`${p.product_id}-${p.sale_price_type_id}`}
                className="flex items-center gap-3 rounded-md border p-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{p.name}</div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    {p.brand?.name && <span>{p.brand.name}</span>}
                    <Badge variant="outline" className="h-4 px-1 text-[10px]">
                      {p.sale_price_type_title}
                    </Badge>
                  </div>
                </div>
                <div className="shrink-0 text-left">
                  <div
                    className={`text-sm font-bold tabular-nums ${isUp ? "text-emerald-600" : "text-red-600"}`}
                  >
                    {isUp ? "+" : ""}
                    {formatNumber(pct)}٪
                  </div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    {formatNumber(Number(p.start_price))} → {formatNumber(Number(p.end_price))}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </MICardShell>
  );
}
