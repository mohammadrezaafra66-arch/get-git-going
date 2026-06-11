import type { Database } from "@/integrations/supabase/types";

export type ProductType = Database["public"]["Enums"]["product_type"];
export type BaseCurrency = Database["public"]["Enums"]["base_currency"];
export type StockStatus = Database["public"]["Enums"]["stock_status"];
export type ProductStatus = Database["public"]["Enums"]["product_status"];

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  iranian: "ایرانی",
  foreign: "خارجی",
};

export const BASE_CURRENCY_LABELS: Record<BaseCurrency, string> = {
  toman: "تومان",
  usd: "دلار آمریکا",
  aed: "درهم امارات",
};

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  available: "موجود",
  unavailable: "ناموجود",
  limited: "محدود",
  unknown: "نامشخص",
};

export const STOCK_STATUS_VARIANTS: Record<StockStatus, "default" | "destructive" | "outline" | "secondary"> = {
  available: "default",
  unavailable: "destructive",
  limited: "secondary",
  unknown: "outline",
};

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  active: "فعال",
  inactive: "غیرفعال",
  discontinued: "متوقف‌شده",
};

export const PRODUCT_STATUS_VARIANTS: Record<ProductStatus, "default" | "destructive" | "outline" | "secondary"> = {
  active: "default",
  inactive: "secondary",
  discontinued: "destructive",
};

export const PRODUCTS_PAGE_SIZE = 20;