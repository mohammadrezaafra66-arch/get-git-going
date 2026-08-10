import type { Database } from "@/integrations/supabase/types";

export type CurrencyCode = Database["public"]["Enums"]["currency_code"];
export type MarginType = Database["public"]["Enums"]["margin_type"];
export type ShippingCostType = Database["public"]["Enums"]["shipping_cost_type"];

export const CURRENCY_LABELS: Record<CurrencyCode, string> = {
  toman: "تومان",
  usd: "دلار سلیمانیه",
  aed: "درهم امارات",
  usd_us: "دلار تهران",
};

export const MARGIN_TYPE_LABELS: Record<MarginType, string> = {
  fixed: "مبلغ ثابت",
  percent: "درصدی",
  mixed: "ترکیبی (درصد + مبلغ ثابت)",
};

export const SHIPPING_COST_TYPE_LABELS: Record<ShippingCostType, string> = {
  fixed: "مبلغ ثابت",
  percent: "درصد قیمت خرید",
  currency: "ارزی",
};

export const PRICING_PAGE_SIZE = 20;

/**
 * کد نوع‌قیمتِ «نقدی» در `sale_price_types`.
 *
 * هر بار انتشار قیمت (`publishProductPrices`) برای **همهٔ** نوع‌قیمت‌های فعال
 * یک ردیف در `product_computed_prices` می‌نویسد — نقدی، چکی، همکاری. پس هر
 * کوئری‌ای که می‌خواهد «یک» قیمت فروش برای هر محصول نشان دهد، باید صریحاً نوع را
 * انتخاب کند؛ وگرنه ردیفی برمی‌گردد که آخر از همه محاسبه شده (همکاری، یا اگر
 * همکاری نداشته باشد چکی) و عددِ اشتباه نمایش داده می‌شود.
 *
 * جاهایی که عمداً همهٔ نوع‌قیمت‌ها را نشان می‌دهند (کارت انتشار محصول، پیشنهادهای
 * فروش) نباید از این ثابت استفاده کنند.
 */
export const BASE_SALE_PRICE_TYPE_CODE = "cash_price";

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
