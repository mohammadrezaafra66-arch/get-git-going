import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

type LabelStatus = "full" | "limited" | "none";
type LabelData = {
  status: LabelStatus;
  is_today_purchase: boolean;
  last_purchase_at: string | null;
  hours_since: number | null;
};

interface Props {
  productId: string;
  showTodayBadge?: boolean;
  className?: string;
}

/**
 * نمایش وضعیت پویای موجودی بر اساس زمان آخرین خرید و تنظیمات
 * recent_purchase_settings. هیچ‌گاه مقدار stock واقعی محصول را تغییر نمی‌دهد.
 */
export function RecentPurchaseBadge({ productId, showTodayBadge = true, className }: Props) {
  const q = useQuery({
    queryKey: ["recent-purchase-label", productId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_recent_purchase_label", {
        p_product_id: productId,
      });
      if (error) throw error;
      return data as unknown as LabelData;
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  if (!q.data || q.data.status === "none") return null;

  return (
    <span className={"inline-flex flex-wrap gap-1 " + (className ?? "")}>
      {q.data.status === "full" && (
        <Badge variant="default" className="text-[10px]">موجود</Badge>
      )}
      {q.data.status === "limited" && (
        <Badge variant="secondary" className="text-[10px]">موجودی محدود</Badge>
      )}
      {showTodayBadge && q.data.is_today_purchase && (
        <Badge variant="outline" className="text-[10px] border-amber-500/60 text-amber-700 dark:text-amber-400">
          خرید روز
        </Badge>
      )}
    </span>
  );
}