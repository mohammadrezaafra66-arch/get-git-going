import type {
  PriceListCanonicalModel,
  PriceListRow,
  PriceListShopInfo,
} from "./canonical";
import { BRANDING } from "@/config/branding";

// ---------- Inputs ----------

export interface SaleListSource {
  id: string;
  name: string;
  version_number: number;
  terms_text?: string | null;
  seller_info?: string | null;
  selected_columns?: string[] | null;
  pdf_brand_order?: string[] | null;
  pdf_product_order_by_brand?: Record<string, string[]> | null;
  sale_price_type?: { title: string } | null;
  settlement_type?: { title: string } | null;
}

export interface SaleListSourceItem {
  product_id: string;
  current_price: number;
  previous_price?: number | null;
  change_amount?: number | null;
  change_percent?: number | null;
  stock_status?: string | null;
  product?: {
    id: string;
    name: string;
    sku?: string | null;
    model?: string | null;
    description?: string | null;
    brand?: { name: string } | null;
    category?: { name: string } | null;
  } | null;
}

export interface LiveBoardRow {
  productId: string;
  productName: string;
  productCode: string;
  imageUrl?: string;
  basePrice: number;
  discountedPrice?: number;
  priceMode: string;
  unit: string;
  priority: number;
  categoryName: string;
}

export interface BuildShopSettings {
  shop_name?: string | null;
  shop_address?: string | null;
  shop_phone?: string | null;
  shop_website?: string | null;
  shop_rubika?: string | null;
  shop_whatsapp?: string | null;
  shop_eitaa?: string | null;
  shop_baleh?: string | null;
}

function toShopInfo(shop?: BuildShopSettings | null): PriceListShopInfo | null {
  if (!shop) return null;
  return {
    name: shop.shop_name ?? null,
    address: shop.shop_address ?? null,
    phone: shop.shop_phone ?? null,
    website: shop.shop_website ?? null,
    rubika: shop.shop_rubika ?? null,
    whatsapp: shop.shop_whatsapp ?? null,
    eitaa: shop.shop_eitaa ?? null,
    baleh: shop.shop_baleh ?? null,
  };
}

// ---------- Builders ----------

export function buildFromSaleList(opts: {
  list: SaleListSource;
  items: SaleListSourceItem[];
  livePrices?: Map<string, number>;
  shop?: BuildShopSettings | null;
  observatoryHints?: Record<string, boolean> | null;
  createdByName?: string | null;
}): PriceListCanonicalModel {
  const { list, items, livePrices, shop, observatoryHints, createdByName } = opts;
  const priceMode = list.sale_price_type?.title ?? "";

  const rows: PriceListRow[] = items.map((it) => {
    const snapshot = Number(it.current_price);
    const live = it.product?.id ? livePrices?.get(it.product.id) : undefined;
    const current = live !== undefined && live > 0 ? live : snapshot;
    const previous = it.previous_price != null ? Number(it.previous_price) : null;
    const changeAmount =
      previous !== null && current > 0
        ? current - previous
        : it.change_amount != null
          ? Number(it.change_amount)
          : null;
    const changePercent =
      previous && previous !== 0 && current > 0
        ? Number((((current - previous) / previous) * 100).toFixed(2))
        : it.change_percent != null
          ? Number(it.change_percent)
          : null;

    return {
      productId: it.product?.id ?? it.product_id,
      productName: it.product?.name ?? "—",
      productCode: it.product?.sku ?? "",
      basePrice: current,
      currentPrice: current,
      previousPrice: previous,
      changeAmount,
      changePercent,
      priceMode,
      unit: "",
      priority: 0,
      categoryName: it.product?.category?.name ?? "",
      brandName: it.product?.brand?.name ?? null,
      model: it.product?.model ?? null,
      description: it.product?.description ?? null,
      stockStatus: it.stock_status ?? null,
      observatoryHasPriceAdvantage:
        it.product?.id && observatoryHints ? observatoryHints[it.product.id] === true : false,
    };
  });

  return {
    id: list.id,
    title: list.name,
    generatedAt: new Date(),
    rows,
    currency: "تومان",
    companyName: shop?.shop_name ?? BRANDING.platformName,
    companyPhone: shop?.shop_phone ?? undefined,
    selectedColumns: list.selected_columns ?? undefined,
    brandOrder: list.pdf_brand_order ?? undefined,
    productOrderByBrand: list.pdf_product_order_by_brand ?? undefined,
    sellerInfo: list.seller_info ?? null,
    termsText: list.terms_text ?? null,
    shopInfo: toShopInfo(shop),
    salePriceTypeTitle: list.sale_price_type?.title ?? null,
    settlementTypeTitle: list.settlement_type?.title ?? null,
    versionNumber: list.version_number,
    createdByName: createdByName ?? null,
  };
}

export function buildFromLiveBoard(opts: {
  rows: LiveBoardRow[];
  shop?: BuildShopSettings | null;
  title?: string;
}): PriceListCanonicalModel {
  const { rows, shop, title } = opts;
  return {
    id: "live-price-list",
    title: title ?? "لیست قیمت زنده",
    generatedAt: new Date(),
    rows: rows.map((r) => ({ ...r })),
    currency: "تومان",
    companyName: shop?.shop_name ?? BRANDING.platformName,
    companyPhone: shop?.shop_phone ?? undefined,
    shopInfo: toShopInfo(shop),
  };
}