import type { PriceListCanonicalModel, PriceListRow } from "../canonical";

function rowPrice(r: PriceListRow): number {
  return r.currentPrice ?? r.discountedPrice ?? r.basePrice;
}

function rowMode(r: PriceListRow, model: PriceListCanonicalModel): string {
  return r.priceMode || model.salePriceTypeTitle || "";
}

// روبیکا: مشابه تلگرام ولی به‌صورت یک متن واحد (paste توسط کاربر).
export function formatForRubika(model: PriceListCanonicalModel): string {
  const dateFa = model.generatedAt.toLocaleDateString("fa-IR");
  const headerLines = [`📋 ${model.title}`, `📅 ${dateFa}`];
  if (model.versionNumber !== undefined) {
    headerLines.push(`🔢 نسخه ${model.versionNumber.toLocaleString("fa-IR")}`);
  }
  if (model.salePriceTypeTitle) headerLines.push(`💰 ${model.salePriceTypeTitle}`);
  if (model.settlementTypeTitle) headerLines.push(`🧾 ${model.settlementTypeTitle}`);
  const header = headerLines.join("\n") + "\n\n";

  const rows = model.rows
    .map((r) => {
      const price = rowPrice(r).toLocaleString("fa-IR");
      const mode = rowMode(r, model);
      const parts = [`📦 ${r.productName}`, `${price} ${model.currency}`];
      if (mode) parts.push(mode);
      return parts.join(" | ");
    })
    .join("\n");

  const shop = model.shopInfo;
  const phone = shop?.phone ?? model.companyPhone;
  const footerLines: string[] = [];
  if (phone) footerLines.push(`📞 ${phone}`);
  if (shop?.rubika) footerLines.push(`🆔 ${shop.rubika}`);
  const footer = footerLines.length ? "\n\n" + footerLines.join("\n") : "";

  return header + rows + footer;
}