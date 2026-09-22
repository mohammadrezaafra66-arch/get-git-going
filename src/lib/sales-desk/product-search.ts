/**
 * Product search for deal line items — reuses sales quote RPC `search_product_ids`
 * (partial code, name, brand; includes unavailable with stock_status).
 */
import { supabase } from "@/integrations/supabase/client";
import type { StockStatus } from "@/lib/products/constants";

export type DealProductSearchHit = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  stock_status: StockStatus;
  is_active: boolean;
};

export async function searchDealProducts(
  term: string,
  limit = 20,
): Promise<DealProductSearchHit[]> {
  const t = (term ?? "").trim();
  if (t.length < 1) return [];
  const safe = t.replace(/[%_]/g, "");
  const { data, error } = await supabase.rpc("search_product_ids", {
    p_term: safe,
    p_limit: limit,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as DealProductSearchHit[];
}
