import type { Database } from "@/integrations/supabase/types";

export type CurrencyCode = Database["public"]["Enums"]["currency_code"];
export type MarginType = Database["public"]["Enums"]["margin_type"];
export type ShippingCostType = Database["public"]["Enums"]["shipping_cost_type"];

export const CURRENCY_LABELS: Record<CurrencyCode, string> = {
  toman: "تومان",
  usd: "دلار",
  aed: "درهم",
};

export const MARGIN_TYPE_LABELS: Record<MarginType, string> = {
  fixed: "مبلغ ثابت",
  percent: "درصدی",
  mixed: "ترکیبی (درصد + مبلغ ثابت)",
};

export const SHIPPING_COST_TYPE_LABELS: Record<ShippingCostType, string> = {
  fixed: "مبلغ ثابت",
  percent: "درصد قیمت خرید",
};

export const PRICING_PAGE_SIZE = 20;

/**
 * گرد کردن قیمت تومانی بر اساس بازه:
 *  - زیر 1,000,000  → 10,000
 *  - 1m تا 10m      → 50,000
 *  - بالای 10m      → 100,000
 */
export function roundSalePrice(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  let step = 10_000;
  if (price >= 10_000_000) step = 100_000;
  else if (price >= 1_000_000) step = 50_000;
  return Math.round(price / step) * step;
}