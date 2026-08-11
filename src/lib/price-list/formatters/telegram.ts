import type { PriceListCanonicalModel, PriceListRow } from "../canonical";

const MAX_TELEGRAM_CHARS = 4096;

function rowPrice(r: PriceListRow): number {
  return r.currentPrice ?? r.discountedPrice ?? r.basePrice;
}

function rowMode(r: PriceListRow, model: PriceListCanonicalModel): string {
  return r.priceMode || model.salePriceTypeTitle || "";
}

export function formatForTelegram(model: PriceListCanonicalModel): string[] {
  const dateFa = model.generatedAt.toLocaleDateString("fa-IR");
  const headerLines = [`📋 ${model.title}`, `📅 ${dateFa}`];
  if (model.versionNumber !== undefined) {
    headerLines.push(`🔢 نسخه ${model.versionNumber.toLocaleString("fa-IR")}`);
  }
  if (model.salePriceTypeTitle) headerLines.push(`💰 ${model.salePriceTypeTitle}`);
  if (model.settlementTypeTitle) headerLines.push(`🧾 ${model.settlementTypeTitle}`);
  const header = headerLines.join("\n") + "\n\n";

  const phone = model.shopInfo?.phone ?? model.companyPhone ?? "";
  const footer = phone ? `\n📞 ${phone}` : "";

  const rows = model.rows.map((r) => {
    const price = rowPrice(r).toLocaleString("fa-IR");
    const mode = rowMode(r, model);
    const parts = [`📦 ${r.productName}`, `${price} ${model.currency}`];
    if (mode) parts.push(mode);
    return parts.join(" | ");
  });

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