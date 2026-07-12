// Canonical price list model — single source of truth for all output formats.
//
// Back-compat: legacy fields (basePrice/priceMode/unit/...) used by
// live-price-list remain. New optional fields enrich the model so the same
// shape can describe a sale-list snapshot (PDF + share text channels).
export interface PriceListRow {
  // Legacy fields (still used by live-price-list)
  productId: string;
  productName: string;
  productCode: string;
  imageUrl?: string;
  basePrice: number;
  discountedPrice?: number;
  priceMode: "نیمایی" | "آزاد" | "توافقی" | string;
  unit: string;
  priority: number;
  categoryName: string;

  // Enriched optional fields (sale-list snapshot)
  brandKey?: string;
  brandName?: string | null;
  model?: string | null;
  currentPrice?: number;
  previousPrice?: number | null;
  changeAmount?: number | null;
  changePercent?: number | null;
  stockStatus?: string | null;
  productType?: string | null;
  labels?: string[];
  description?: string | null;
  observatoryHasPriceAdvantage?: boolean;
}

export interface PriceListShopInfo {
  name?: string | null;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  rubika?: string | null;
  whatsapp?: string | null;
  eitaa?: string | null;
  baleh?: string | null;
}

export interface PriceListCanonicalModel {
  id: string;
  title: string;
  generatedAt: Date;
  validUntil?: Date;
  rows: PriceListRow[];
  currency: "تومان" | "ریال";
  companyName: string;
  companyPhone?: string;
  notes?: string;

  // Enriched optional fields (sale-list snapshot)
  selectedColumns?: string[];
  brandOrder?: string[];
  productOrderByBrand?: Record<string, string[]>;
  sellerInfo?: string | null;
  termsText?: string | null;
  shopInfo?: PriceListShopInfo | null;
  salePriceTypeTitle?: string | null;
  settlementTypeTitle?: string | null;
  versionNumber?: number;
  createdByName?: string | null;
}

// Back-compat re-exports — live-price-list and any older callers continue to
// import formatters from this module.
export { formatForPlainText } from "./formatters/plain-text";
export { formatForTelegram } from "./formatters/telegram";
export { formatForWhatsApp } from "./formatters/whatsapp";
export { formatForRubika } from "./formatters/rubika";