import { UsersRound, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { MICardShell } from "./CardShell";
import { fetchSellerTopProducts, type RangeDays } from "@/lib/management/market-intelligence";
import { formatNumber } from "@/lib/i18n/formatters";

const STOCK_LABEL: Record<string, string> = {
  available: "موجود",
  limited: "محدود",
  unavailable: "ناموجود",
  unknown: "نامشخص",
};

function timeAgoFa(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.max(1, Math.round(diff / 60000));
  if (m < 60) return `${formatNumber(m)} دقیقه پیش`;
  const h = Math.round(m / 60);
  if (h < 24) return `${formatNumber(h)} ساعت پیش`;
  const d = Math.round(h / 24);
  return `${formatNumber(d)} روز پیش`;
}

export function SellerFavoritesCard({ days }: { days: RangeDays }) {
  const q = useQuery({
    queryKey: ["mi-seller-favorites", days],
    queryFn: () => fetchSellerTopProducts(days, 10),
    staleTime: 60_000,
  });

  return (
    <MICardShell
      title="محبوب فروشندگان"
      description={`بیشترین تعامل کاربران دارای نقش فروش در ${formatNumber(days)} روز اخیر`}
      rule="جمع رویدادهای price_checked / chart_opened / product_details_opened / search_result_viewed برای کاربران sales"
      icon={<UsersRound className="h-4 w-4 text-amber-600" />}
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
            <li
              key={p.product_id}
              className="flex items-center gap-3 rounded-md border p-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{p.name}</div>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  {p.brand?.name && <span>{p.brand.name}</span>}
                  {p.category?.name && <span>· {p.category.name}</span>}
                  <Badge variant="outline" className="h-4 px-1 text-[10px]">
                    {STOCK_LABEL[p.stock_status] ?? p.stock_status}
                  </Badge>
                </div>
              </div>
              <div className="shrink-0 text-left">
                <div className="text-sm font-bold tabular-nums text-amber-600">
                  {formatNumber(p.seller_interaction_count)}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {formatNumber(p.unique_seller_count)} فروشنده · {timeAgoFa(p.last_interaction_at)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </MICardShell>
  );
}
