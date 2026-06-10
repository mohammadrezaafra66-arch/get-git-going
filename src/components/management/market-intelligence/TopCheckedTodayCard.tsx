import { Eye, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { MICardShell } from "./CardShell";
import { fetchTopCheckedToday } from "@/lib/management/market-intelligence";
import { formatNumber } from "@/lib/i18n/formatters";

function timeAgoFa(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.max(1, Math.round(diff / 60000));
  if (m < 60) return `${formatNumber(m)} دقیقه پیش`;
  const h = Math.round(m / 60);
  if (h < 24) return `${formatNumber(h)} ساعت پیش`;
  const d = Math.round(h / 24);
  return `${formatNumber(d)} روز پیش`;
}

export function TopCheckedTodayCard() {
  const q = useQuery({
    queryKey: ["mi-top-checked-today"],
    queryFn: () => fetchTopCheckedToday(10),
    staleTime: 60_000,
  });

  return (
    <MICardShell
      title="بیشترین بررسی قیمت امروز"
      description="محصولاتی که امروز بیشترین تعداد بررسی قیمت را داشته‌اند"
      rule="جمع رویدادهای price_checked و board_price_viewed از ابتدای امروز"
      icon={<Eye className="h-4 w-4 text-blue-600" />}
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
                    {p.current_price != null && (
                      <Badge variant="outline" className="h-4 px-1 text-[10px] tabular-nums">
                        {formatNumber(p.current_price)}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-left">
                  <div className="text-sm font-bold tabular-nums text-blue-600">
                    {formatNumber(p.price_check_count)} بررسی
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {formatNumber(p.unique_user_count)} نفر · {timeAgoFa(p.last_interaction_at)}
                  </div>
                </div>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                «{formatNumber(p.unique_user_count)} نفر امروز قیمت این محصول را دیده‌اند.»
              </p>
            </li>
          ))}
        </ul>
      )}
    </MICardShell>
  );
}
