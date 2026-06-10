/**
 * Pricing Workbench — pure helpers و typeهای فیلتر/گزارش سلامت.
 * منطق محض، بدون وابستگی به Supabase. قابل تست.
 */
import type { Database } from "@/integrations/supabase/types";

export type StockStatusV = Database["public"]["Enums"]["stock_status"];
export type ProductStatusV = Database["public"]["Enums"]["product_status"];
export type ProductTypeV = Database["public"]["Enums"]["product_type"];
export type CurrencyCodeV = Database["public"]["Enums"]["currency_code"];

export type CurrencyTypeFilter = "all" | "toman" | "foreign";
export type CurrencyFilter = "all" | CurrencyCodeV;
export type StockFilter = "all" | StockStatusV;
export type StatusFilter = "all" | "active" | "inactive";
export type SalePriceFilter = "all" | "has" | "missing";
export type OwnerFilter = "all" | "none" | string; // userId
export type LabelFilter = "all" | "none" | "any" | string; // labelId

export interface WorkbenchFilters {
  search: string;
  brandId: string; // "all" or uuid
  categoryId: string; // "all" or uuid (parent category)
  subcategoryId: string; // "all" or uuid (child category)
  currencyType: CurrencyTypeFilter;
  currency: CurrencyFilter;
  inventory: StockFilter;
  productStatus: StatusFilter;
  salePrice: SalePriceFilter;
  ownerId: OwnerFilter;
  labelId: LabelFilter;
}

export const DEFAULT_WORKBENCH_FILTERS: WorkbenchFilters = {
  search: "",
  brandId: "all",
  categoryId: "all",
  subcategoryId: "all",
  currencyType: "all",
  currency: "all",
  inventory: "all",
  productStatus: "all",
  salePrice: "all",
  ownerId: "all",
  labelId: "all",
};

export const STOCK_LABEL: Record<StockStatusV, string> = {
  available: "موجود",
  limited: "محدود",
  unavailable: "ناموجود",
  unknown: "نامشخص",
};

export const PRODUCT_STATUS_LABEL: Record<ProductStatusV, string> = {
  active: "فعال",
  inactive: "غیرفعال",
  discontinued: "متوقف‌شده",
};

/** نگاشت stock نامعتبر/خالی به نامشخص. */
export function normalizeInventoryStatus(s: string | null | undefined): StockStatusV {
  if (s === "available" || s === "limited" || s === "unavailable" || s === "unknown") return s;
  return "unknown";
}

/** قیمت فروش معتبر = عدد متناهی و بزرگ‌تر از صفر. */
export function hasValidSalePrice(price: number | null | undefined): boolean {
  return typeof price === "number" && Number.isFinite(price) && price > 0;
}

/** ساختار حداقلی برای محاسبه مشکلات. */
export interface PricingIssueInput {
  status: ProductStatusV;
  stock_status: StockStatusV;
  sale_price: number | null;
  owners_count: number;
  tags_count: number;
}

export type IssueCode = "inactive" | "no_sale_price" | "no_owner" | "unavailable" | "discontinued";

export const ISSUE_LABEL: Record<IssueCode, string> = {
  inactive: "غیرفعال",
  no_sale_price: "بدون قیمت فروش",
  no_owner: "بدون مسئول",
  unavailable: "ناموجود",
  discontinued: "متوقف‌شده",
};

export function getProductPricingIssues(p: PricingIssueInput): IssueCode[] {
  const out: IssueCode[] = [];
  if (p.status === "inactive") out.push("inactive");
  if (p.status === "discontinued") out.push("discontinued");
  if (!hasValidSalePrice(p.sale_price)) out.push("no_sale_price");
  if (p.owners_count === 0) out.push("no_owner");
  if (p.stock_status === "unavailable") out.push("unavailable");
  return out;
}

/** آیا محصول در گزارش «ناقص/غیرقابل فروش» می‌گنجد؟ */
export function isIncompleteProduct(p: PricingIssueInput): boolean {
  return p.status !== "active" || !hasValidSalePrice(p.sale_price) || p.owners_count === 0;
}

export type RiskPriority = "urgent" | "high" | "medium" | "low";

export const PRIORITY_LABEL: Record<RiskPriority, string> = {
  urgent: "فوری",
  high: "بالا",
  medium: "متوسط",
  low: "پایین",
};

export const PRIORITY_WEIGHT: Record<RiskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** اولویت اصلاح برای محصول برچسب‌دار مشکل‌دار. */
export function getTaggedProductRiskPriority(p: PricingIssueInput): RiskPriority {
  if (p.tags_count === 0) return "low";
  const noPrice = !hasValidSalePrice(p.sale_price);
  const inStockish = p.stock_status === "available" || p.stock_status === "limited";
  if (noPrice && inStockish) return "urgent";
  if (noPrice) return "urgent";
  if (inStockish && p.owners_count === 0) return "high";
  if (p.owners_count === 0) return "high";
  if (p.stock_status === "unavailable") return "high";
  if (p.status === "inactive" || p.status === "discontinued") return "medium";
  return "low";
}

/** آیا در گزارش «محصولات برچسب‌دار مشکل‌دار» قرار می‌گیرد؟ */
export function isTaggedRiskProduct(p: PricingIssueInput): boolean {
  if (p.tags_count === 0) return false;
  return (
    p.stock_status === "unavailable" ||
    p.status !== "active" ||
    !hasValidSalePrice(p.sale_price) ||
    p.owners_count === 0
  );
}

/** نوع خرید را از product_type و base_currency استنتاج می‌کند. */
export function isForeignProduct(productType: ProductTypeV, baseCurrency: string): boolean {
  return productType === "foreign" || (baseCurrency !== "toman" && !!baseCurrency);
}
