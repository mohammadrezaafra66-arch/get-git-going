import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ProductTimelineEventType =
  | "inquiry"
  | "purchase_request"
  | "document"
  | "delivery_receipt";

export interface ProductTimelineEvent {
  event_time: string;
  event_type: ProductTimelineEventType;
  actor_id: string | null;
  actor_name: string | null;
  description: string;
  amount: number | null;
  reference_id: string;
  reference_type: string;
}

export interface ProductStats {
  inquiry_count_month: number;
  inquiry_count_total: number;
  avg_price: number | null;
  last_price: number | null;
  purchase_count: number;
  last_purchase_date: string | null;
}

export function useProductTimeline(productId: string | null | undefined) {
  return useQuery({
    enabled: !!productId,
    queryKey: ["product-timeline", productId],
    queryFn: async (): Promise<ProductTimelineEvent[]> => {
      const { data, error } = await supabase.rpc("get_product_timeline", {
        p_product_id: productId!,
        p_limit: 50,
        p_offset: 0,
      });
      if (error) throw error;
      return (data ?? []) as ProductTimelineEvent[];
    },
    staleTime: 60_000,
  });
}

export function useProductStats(productId: string | null | undefined) {
  return useQuery({
    enabled: !!productId,
    queryKey: ["product-stats", productId],
    queryFn: async (): Promise<ProductStats> => {
      const { data, error } = await supabase.rpc("get_product_stats", {
        p_product_id: productId!,
      });
      if (error) throw error;
      return ((data ?? {
        inquiry_count_month: 0,
        inquiry_count_total: 0,
        avg_price: null,
        last_price: null,
        purchase_count: 0,
        last_purchase_date: null,
      }) as unknown) as ProductStats;
    },
    staleTime: 60_000,
  });
}
