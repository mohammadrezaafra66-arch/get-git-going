import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type RecentPurchaseLabel = {
  status: "full" | "limited" | "none";
  is_today_purchase: boolean;
  last_purchase_at: string | null;
  hours_since: number | null;
};

type Ctx = {
  getLabel: (productId: string) => RecentPurchaseLabel | undefined;
  isLoading: boolean;
};

const RecentPurchaseCtx = createContext<Ctx | null>(null);

/**
 * یک‌بار batch RPC برای لیستی از productIdها صدا می‌زند تا از N تا
 * request جدا برای هر badge جلوگیری شود (بهینه برای اینترنت ضعیف ایران).
 */
export function RecentPurchaseGroup({
  productIds,
  children,
}: {
  productIds: string[];
  children: ReactNode;
}) {
  // dedupe + stable key
  const ids = useMemo(
    () => Array.from(new Set(productIds.filter(Boolean))).sort(),
    [productIds],
  );

  const q = useQuery({
    queryKey: ["recent-purchase-labels-batch", ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_recent_purchase_labels", {
        p_ids: ids,
      });
      if (error) throw error;
      const map = new Map<string, RecentPurchaseLabel>();
      for (const row of (data ?? []) as any[]) {
        map.set(row.product_id, {
          status: row.status,
          is_today_purchase: row.is_today_purchase,
          last_purchase_at: row.last_purchase_at,
          hours_since: row.hours_since,
        });
      }
      return map;
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  const value = useMemo<Ctx>(
    () => ({
      getLabel: (id) => q.data?.get(id),
      isLoading: q.isLoading,
    }),
    [q.data, q.isLoading],
  );

  return <RecentPurchaseCtx.Provider value={value}>{children}</RecentPurchaseCtx.Provider>;
}

export function useRecentPurchaseGroup() {
  return useContext(RecentPurchaseCtx);
}
