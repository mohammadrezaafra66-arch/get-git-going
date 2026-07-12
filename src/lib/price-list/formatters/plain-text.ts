import type { PriceListCanonicalModel, PriceListRow } from "../canonical";

function rowPrice(r: PriceListRow): number {
  return r.currentPrice ?? r.discountedPrice ?? r.basePrice;
}

function rowMode(r: PriceListRow, model: PriceListCanonicalModel): string {
  return r.priceMode || model.salePriceTypeTitle || "";
}

export function formatForPlainText(model: PriceListCanonicalModel): string {
  const dateFa = model.generatedAt.toLocaleDateString("fa-IR");
  const headerLines = [model.title, dateFa];
  if (model.versionNumber !== undefined) {
    headerLines.push(`نسخه ${model.versionNumber.toLocaleString("fa-IR")}`);
  }
  if (model.salePriceTypeTitle) headerLines.push(`نوع قیمت: ${model.salePriceTypeTitle}`);
  if (model.settlementTypeTitle) headerLines.push(`نوع تسویه: ${model.settlementTypeTitle}`);
  const header = headerLines.join("\n") + "\n\n";

  const rows = model.rows
    .map((r) => {
      const price = rowPrice(r).toLocaleString("fa-IR");
      const mode = rowMode(r, model);
      const parts = [r.productName, `${price} ${model.currency}`];
      if (mode) parts.push(mode);
      return parts.join(" | ");
    })
    .join("\n");

  const footerLines: string[] = [];
  const shop = model.shopInfo;
  if (shop?.phone) footerLines.push(`تلفن: ${shop.phone}`);
  else if (model.companyPhone) footerLines.push(`تلفن: ${model.companyPhone}`);
  if (shop?.address) footerLines.push(`نشانی: ${shop.address}`);
  if (model.termsText) footerLines.push("", model.termsText);
  const footer = footerLines.length ? "\n\n" + footerLines.join("\n") : "";

  return header + rows + footer;
}