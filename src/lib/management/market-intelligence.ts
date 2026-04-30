import { supabase } from "@/integrations/supabase/client";

export type RangeDays = 1 | 7 | 30 | 90;

export interface BrandRef { id: string; name: string }
export interface CategoryRef { id: string; name: string }

export interface TrendingProduct {
  product_id: string;
  name: string;
  sku: string | null;
  brand: BrandRef | null;
  category: CategoryRef | null;
  stock_status: string;
  search_count: number;
  price_view_count: number;
  chart_view_count: number;
  board_view_count: number;
  trend_score: number;
  current_price: number | null;
  previous_price: number | null;
  change_percent: number | null;
}

export interface PriceMover {
  product_id: string;
  name: string;
  sku: string | null;
  brand: BrandRef | null;
  category: CategoryRef | null;
  stock_status: string;
  sale_price_type_id: string;
  sale_price_type_title: string;
  start_price: number;
  end_price: number;
  change_amount: number;
  change_percent: number;
}

export interface MarketIndex {
  index_change_percent: number | null;
  product_count: number;
  rising_count: number;
  falling_count: number;
  flat_count: number;
  status: "rising" | "falling" | "flat" | "volatile" | "no_data";
  range_days: number;
}

export async function fetchTrendingProducts(days: RangeDays, limit = 10): Promise<TrendingProduct[]> {
  const { data, error } = await supabase.rpc("mi_get_trending_products", {
    p_days: days,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as TrendingProduct[];
}

export async function fetchPriceMovers(
  days: RangeDays,
  direction: "up" | "down",
  limit = 10,
  salePriceTypeId?: string | null,
): Promise<PriceMover[]> {
  const { data, error } = await supabase.rpc("mi_get_price_movers", {
    p_days: days,
    p_direction: direction,
    p_sale_price_type_id: salePriceTypeId ?? undefined,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as PriceMover[];
}

export async function fetchMarketIndex(days: RangeDays): Promise<MarketIndex | null> {
  const { data, error } = await supabase.rpc("mi_get_market_index", { p_days: days });
  if (error) throw error;
  const row = (data ?? [])[0] as MarketIndex | undefined;
  return row ?? null;
}