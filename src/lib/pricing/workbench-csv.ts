/**
 * CSV export برای گزارش‌های کارگاه قیمت‌گذاری.
 * client-side ساده با BOM برای Excel فارسی.
 */
import type { WorkbenchRowV2 } from "./workbench-queries";
import {
  STOCK_LABEL,
  PRODUCT_STATUS_LABEL,
  ISSUE_LABEL,
  PRIORITY_LABEL,
  getProductPricingIssues,
  getTaggedProductRiskPriority,
  type IssueCode,
} from "./workbench-filters";

function esc(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v).replace(/^\uFEFF/, "");
  return /[",\n\r;\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function download(filename: string, content: string) {
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function rowIssues(r: WorkbenchRowV2): IssueCode[] {
  return getProductPricingIssues({
    status: r.status,
    stock_status: r.stock_status,
    sale_price: r.sale_price,
    owners_count: r.owners.length,
    tags_count: r.tags.length,
  });
}

/** CSV محصولات ناقص / غیرقابل فروش. */
export function exportIncompleteCsv(rows: WorkbenchRowV2[]) {
  const headers = [
    "نام محصول",
    "برند",
    "مدل",
    "دسته",
    "زیر دسته",
    "نوع خرید",
    "ارز",
    "وضعیت موجودی",
    "وضعیت فعال بودن",
    "قیمت فروش (نقدی)",
    "مسئول محصول",
    "علت مشکل",
    "آخرین بروزرسانی قیمت فروش (نقدی)",
  ];
  const lines = [headers.map(esc).join(",")];
  for (const r of rows) {
    const issues = rowIssues(r);
    lines.push(
      [
        r.name,
        r.brand_name ?? "",
        r.model ?? "",
        r.parent_category_name ?? r.category_name ?? "",
        r.parent_category_name ? (r.category_name ?? "") : "",
        r.product_type === "foreign" ? "ارزی" : "تومانی",
        r.current_currency ?? r.base_currency ?? "",
        STOCK_LABEL[r.stock_status],
        PRODUCT_STATUS_LABEL[r.status],
        r.sale_price ?? "",
        r.owners.map((o) => o.full_name ?? o.user_id).join(" / ") || "—",
        issues.map((c) => ISSUE_LABEL[c]).join(" + "),
        r.sale_price_updated_at ?? "",
      ]
        .map(esc)
        .join(","),
    );
  }
  download("workbench-incomplete-products.csv", lines.join("\n"));
}

/** CSV محصولات برچسب‌دار مشکل‌دار. */
export function exportTaggedRiskCsv(rows: WorkbenchRowV2[]) {
  const headers = [
    "نام محصول",
    "برند",
    "مدل",
    "دسته",
    "زیر دسته",
    "برچسب‌ها",
    "وضعیت موجودی",
    "وضعیت فعال بودن",
    "قیمت فروش (نقدی)",
    "مسئول محصول",
    "علت مشکل",
    "اولویت اصلاح",
    "آخرین بروزرسانی قیمت فروش (نقدی)",
  ];
  const lines = [headers.map(esc).join(",")];
  for (const r of rows) {
    const issues = rowIssues(r);
    const priority = getTaggedProductRiskPriority({
      status: r.status,
      stock_status: r.stock_status,
      sale_price: r.sale_price,
      owners_count: r.owners.length,
      tags_count: r.tags.length,
    });
    lines.push(
      [
        r.name,
        r.brand_name ?? "",
        r.model ?? "",
        r.parent_category_name ?? r.category_name ?? "",
        r.parent_category_name ? (r.category_name ?? "") : "",
        r.tags.map((t) => t.title).join(" / "),
        STOCK_LABEL[r.stock_status],
        PRODUCT_STATUS_LABEL[r.status],
        r.sale_price ?? "",
        r.owners.map((o) => o.full_name ?? o.user_id).join(" / ") || "—",
        issues.map((c) => ISSUE_LABEL[c]).join(" + "),
        PRIORITY_LABEL[priority],
        r.sale_price_updated_at ?? "",
      ]
        .map(esc)
        .join(","),
    );
  }
  download("workbench-tagged-risk-products.csv", lines.join("\n"));
}
