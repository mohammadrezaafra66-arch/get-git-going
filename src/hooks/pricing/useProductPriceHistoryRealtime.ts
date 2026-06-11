import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * اشتراک Realtime روی product_sale_price_history برای یک محصول/نوع قیمت مشخص.
 * هنگام درج رکورد جدید، queryهای تاریخچه قیمت مربوطه invalidate می‌شوند.
 */
export function useProductPriceHistoryRealtime(opts: {
  productId: string | null;
  salePriceTypeId: string | null;
  enabled?: boolean;
}) {
  const { productId, salePriceTypeId } = opts;
  const enabled = (opts.enabled ?? true) && !!productId && !!salePriceTypeId;
  const queryClient = useQueryClient();
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setIsLive(false);
      return;
    }

    const channel = supabase
      .channel(`price-history:${productId}:${salePriceTypeId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "product_sale_price_history",
          filter: `product_id=eq.${productId}`,
        },
        (payload) => {
          const row = payload.new as { sale_price_type_id?: string } | null;
          if (!row || row.sale_price_type_id !== salePriceTypeId) return;
          queryClient.invalidateQueries({
            queryKey: ["product-price-history", productId, salePriceTypeId],
          });
        },
      )
      .subscribe((status) => {
        setIsLive(status === "SUBSCRIBED");
      });

    return () => {
      setIsLive(false);
      supabase.removeChannel(channel);
    };
  }, [enabled, productId, salePriceTypeId, queryClient]);

  return { isLive };
}
