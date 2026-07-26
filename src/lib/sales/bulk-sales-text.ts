import { formatNumber } from "@/lib/i18n/formatters";
import { formatProductDisplayNameWithFallback } from "@/lib/products/display-name";

/** یک ردیف قیمت (نوع قیمت × نوع تسویه) همان‌طور که RPC جستجوی فروش برمی‌گرداند. */
export interface SalesPriceEntry {
  sale_price_type_id: string;
  settlement_type_id?: string | null;
  title: string;
  settlement_title?: string | null;
  current_price: number | null;
}

/** حداقل شکلی از محصول که برای ساخت متن گروهی لازم است. */
export interface SalesTextProduct {
  id: string;
  name: string;
  sku?: string | null;
  product_type?: string | null;
  stock_status?: string | null;
  color?: string | null;
  capacity?: string | null;
  model?: string | null;
  primary_spec?: string | null;
  brand?: { name: string } | null;
  category?: { name: string } | null;
  prices?: SalesPriceEntry[];
}

export type SpecChip = { label: string; value: string };

/**
 * چیپ‌های مشخصات محصول — همان ترتیبی که کارت محصول در «جستجوی سریع فروش» نشان می‌دهد.
 * برچسب‌های «برند»/«دسته»/«نوع» عمداً داخل همین آرایه‌اند چون UI آن‌ها را هم چیپ می‌کند؛
 * متن کپی آن‌ها را جدا فیلتر می‌کند.
 */
export function buildProductSpecChips(product: SalesTextProduct): SpecChip[] {
  const chips: SpecChip[] = [];
  if (product.primary_spec) chips.push({ label: "ظرفیت", value: product.primary_spec });
  else if (product.capacity) chips.push({ label: "ظرفیت", value: product.capacity });
  if (product.model) chips.push({ label: "مدل", value: product.model });
  if (product.color) chips.push({ label: "رنگ", value: product.color });
  if (product.brand?.name) chips.push({ label: "برند", value: product.brand.name });
  if (product.category?.name) chips.push({ label: "دسته", value: product.category.name });
  if (product.product_type === "iranian" || product.product_type === "foreign") {
    chips.push({ label: "نوع", value: product.product_type === "foreign" ? "خارجی" : "ایرانی" });
  }
  return chips;
}

/** شناسهٔ پایدار یک «حالت قیمت» = نوع قیمت × نوع تسویه. */
export function priceModeKey(
  p: Pick<SalesPriceEntry, "sale_price_type_id" | "settlement_type_id">,
) {
  return `${p.sale_price_type_id}:${p.settlement_type_id ?? ""}`;
}

/** برچسب فارسی یک حالت قیمت؛ برای ردیف‌های تسویه‌دار، عنوان تسویه در پرانتز می‌آید. */
export function priceModeLabel(p: SalesPriceEntry) {
  return p.settlement_type_id == null ? p.title : `${p.title} (${p.settlement_title ?? ""})`;
}

export interface PriceMode {
  key: string;
  label: string;
  /** برای مرتب‌سازی پایدار: ردیف‌های پایه قبل از ردیف‌های تسویه‌دار */
  isBaseline: boolean;
}

/** فهرست یکتای حالت‌های قیمتِ موجود در مجموعه‌ای از محصولات. */
export function collectPriceModes(products: SalesTextProduct[]): PriceMode[] {
  const map = new Map<string, PriceMode>();
  for (const product of products) {
    for (const p of product.prices ?? []) {
      const key = priceModeKey(p);
      if (!map.has(key)) {
        map.set(key, { key, label: priceModeLabel(p), isBaseline: p.settlement_type_id == null });
      }
    }
  }
  return [...map.values()].sort((a, b) => {
    if (a.isBaseline !== b.isBaseline) return a.isBaseline ? -1 : 1;
    return a.label.localeCompare(b.label, "fa");
  });
}

const SEPARATOR = "———————————————";

/**
 * متن کپی گروهی: برای هر محصول فقط اطلاعات حداقلی (نام/برند/دسته/نوع/مشخصات کوتاه/وضعیت)
 * به‌همراه قیمت حالت‌های انتخاب‌شده. `selectedModeKeys === null` یعنی «همهٔ حالت‌ها».
 */
export function buildBulkSalesText(
  products: SalesTextProduct[],
  selectedModeKeys: Set<string> | null,
  stockLabels: Record<string, string>,
): string {
  const blocks = products.map((product) => {
    const lines: string[] = [];
    lines.push(formatProductDisplayNameWithFallback(product as { name: string }));
    if (product.brand?.name) lines.push(`برند: ${product.brand.name}`);
    if (product.category?.name) lines.push(`دسته: ${product.category.name}`);
    if (product.product_type === "iranian" || product.product_type === "foreign") {
      lines.push(`نوع کالا: ${product.product_type === "foreign" ? "خارجی" : "ایرانی"}`);
    }
    const tech = buildProductSpecChips(product).filter(
      (s) => !["برند", "دسته", "نوع"].includes(s.label),
    );
    if (tech.length > 0) lines.push(tech.map((s) => `${s.label}: ${s.value}`).join("  •  "));

    const stockKey = product.stock_status ?? "unknown";
    lines.push(`وضعیت: ${stockLabels[stockKey] ?? stockKey}`);

    const chosen = (product.prices ?? []).filter(
      (p) => selectedModeKeys === null || selectedModeKeys.has(priceModeKey(p)),
    );
    lines.push("");
    if (chosen.length === 0) {
      lines.push("قیمت: ثبت نشده");
    } else {
      lines.push("قیمت‌ها:");
      for (const p of chosen) {
        const value =
          p.current_price != null
            ? `${formatNumber(Number(p.current_price))} تومان`
            : "قیمت ثبت نشده";
        lines.push(`• ${priceModeLabel(p)}: ${value}`);
      }
    }
    return lines.join("\n");
  });

  return blocks.join(`\n\n${SEPARATOR}\n\n`);
}
