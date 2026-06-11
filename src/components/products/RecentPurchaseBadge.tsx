import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useRecentPurchaseGroup, type RecentPurchaseLabel } from "./RecentPurchaseGroup";

interface Props {
  productId: string;
  showTodayBadge?: boolean;
  className?: string;
}

/**
 * نمایش وضعیت پویای موجودی بر اساس زمان آخرین خرید و تنظیمات
 * recent_purchase_settings. هیچ‌گاه مقدار stock واقعی محصول را تغییر نمی‌دهد.
 *
 * اگر داخل <RecentPurchaseGroup> رندر شود از batch RPC مشترک استفاده می‌کند،
 * در غیر این صورت یک fallback تک‌محصولی می‌زند.
 */
export function RecentPurchaseBadge({ productId, showTodayBadge = true, className }: Props) {
  const group = useRecentPurchaseGroup();

  const single = useQuery({
    queryKey: ["recent-purchase-label", productId],
    enabled: !group && !!productId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_recent_purchase_label", {
        p_product_id: productId,
      });
      if (error) throw error;
      return data as unknown as RecentPurchaseLabel;
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  const data = group ? group.getLabel(productId) : single.data;
  if (!data || data.status === "none") return null;

  return (
    <span className={"inline-flex flex-wrap gap-1 " + (className ?? "")}>
      {data.status === "full" && (
        <Badge variant="default" className="text-[10px]">
          موجود
        </Badge>
      )}
      {data.status === "limited" && (
        <Badge variant="secondary" className="text-[10px]">
          موجودی محدود
        </Badge>
      )}
      {showTodayBadge && data.is_today_purchase && (
        <Badge
          variant="outline"
          className="text-[10px] border-amber-500/60 text-amber-700 dark:text-amber-400"
        >
          خرید روز
        </Badge>
      )}
    </span>
  );
}
