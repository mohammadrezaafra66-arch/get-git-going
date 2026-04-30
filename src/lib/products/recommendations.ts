import { supabase } from "@/integrations/supabase/client";

export type RecommendationReason =
  | "pinned"
  | "co_viewed"
  | "same_category"
  | "same_brand"
  | "price_range"
  | "trending"
  | "related";

export interface ProductRecommendation {
  product_id: string;
  name: string;
  sku: string | null;
  brand_name: string | null;
  category_name: string | null;
  stock_status: string;
  current_price: number | null;
  recommendation_score: number;
  reason: RecommendationReason;
  is_pinned: boolean;
}

export async function fetchProductRecommendations(
  productId: string,
): Promise<ProductRecommendation[]> {
  const { data, error } = await supabase.rpc("get_product_recommendations", {
    p_product_id: productId,
  });
  if (error) throw error;
  return (data ?? []) as ProductRecommendation[];
}

export const REASON_LABEL_FA: Record<RecommendationReason, string> = {
  pinned: "پین‌شده توسط مدیر",
  co_viewed: "زیاد بررسی شده",
  same_category: "هم‌دسته",
  same_brand: "هم‌برند",
  price_range: "قیمت مشابه",
  trending: "داغ بازار",
  related: "مرتبط",
};

export const STOCK_LABEL_FA: Record<string, string> = {
  in_stock: "موجود",
  low_stock: "موجودی کم",
  out_of_stock: "ناموجود",
  unknown: "نامشخص",
};