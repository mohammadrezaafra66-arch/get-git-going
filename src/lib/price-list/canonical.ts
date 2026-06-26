// Canonical price list model — single source of truth for all output formats
export interface PriceListRow {
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
}

const MAX_TELEGRAM_CHARS = 4096;

export function formatForTelegram(model: PriceListCanonicalModel): string[] {
  const header = `📋 ${model.title}\n📅 ${model.generatedAt.toLocaleDateString("fa-IR")}\n\n`;
  const footer = `\n📞 ${model.companyPhone ?? ""}`;
  const rows = model.rows.map(
    (r) =>
      `📦 ${r.productName} | ${r.basePrice.toLocaleString("fa-IR")} ${model.currency} | ${r.priceMode}`,
  );
  const parts: string[] = [];
  let current = header;
  for (const row of rows) {
    if ((current + row + "\n" + footer).length > MAX_TELEGRAM_CHARS) {
      parts.push(current + footer);
      current = "";
    }
    current += row + "\n";
  }
  parts.push(current + footer);
  return parts;
}

export function formatForWhatsApp(model: PriceListCanonicalModel): string {
  const header = `*${model.title}*\n_${model.generatedAt.toLocaleDateString("fa-IR")}_\n\n`;
  const rows = model.rows
    .map(
      (r) =>
        `📦 *${r.productName}* | ${r.basePrice.toLocaleString("fa-IR")} ${model.currency} | ${r.priceMode}`,
    )
    .join("\n");
  const footer = model.companyPhone ? `\n\n📞 ${model.companyPhone}` : "";
  return header + rows + footer;
}

export function formatForPlainText(model: PriceListCanonicalModel): string {
  const header = `${model.title}\n${model.generatedAt.toLocaleDateString("fa-IR")}\n\n`;
  const rows = model.rows
    .map(
      (r) =>
        `${r.productName} | ${r.basePrice.toLocaleString("fa-IR")} ${model.currency} | ${r.priceMode}`,
    )
    .join("\n");
  return header + rows;
}