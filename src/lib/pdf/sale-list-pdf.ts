/**
 * Sale-list "PDF" generator.
 *
 * History: previous attempts used pdfmake + arabic-persian-reshaper + bidi-js
 * to render Persian text in PDF directly. pdfmake's text engine does NOT
 * implement Arabic/Persian shaping or the Unicode Bidi algorithm correctly,
 * which led to disconnected letters and reversed words.
 *
 * To stop chasing that engine, we now render the document as a self-contained
 * RTL HTML page (with the locally-hosted Vazirmatn font) and open it in a new
 * browser tab. The browser's native text engine handles Persian shaping and
 * BiDi perfectly. The user can then save it as PDF from the browser's print
 * dialog — which is identical to what the preview shows.
 *
 * This keeps the project self-host friendly: no CDN, no external API, fonts
 * served from /fonts/vazirmatn/ already shipped with the app.
 */
import { formatNumber, formatDateFa } from "@/lib/i18n/formatters";
import {
  STOCK_STATUS_LABELS,
  PRODUCT_TYPE_LABELS,
  type StockStatus,
  type ProductType,
} from "@/lib/products/constants";

export type SaleListPdfColumn =
  | "name"
  | "brand"
  | "category"
  | "sale_price"
  | "previous_price"
  | "change"
  | "stock_status"
  | "product_type"
  | "labels"
  | "description"
  | "observatory_price_advantage";

export interface SaleListPdfItem {
  product_id?: string | null;
  product_name: string;
  brand_name?: string | null;
  category_name?: string | null;
  model?: string | null;
  current_price: number;
  previous_price?: number | null;
  change_amount?: number | null;
  change_percent?: number | null;
  stock_status?: string | null;
  product_type?: string | null;
  labels?: string[] | null;
  description?: string | null;
  /**
   * Customer-safe Observatory signal. When true, the PDF cell renders the
   * single phrase "قیمت رقابتی". Source: `get_observatory_pdf_hints_for_products`.
   * Raw market prices, scores, or sales messages must never be passed here.
   */
  observatory_has_price_advantage?: boolean | null;
}

export interface SaleListPdfInput {
  listName: string;
  versionNumber: number;
  createdByName: string;
  salePriceTypeTitle: string;
  /**
   * Optional settlement type title (e.g. "نقدی", "چک ۳۰ روزه").
   *
   * IMPORTANT: This is metadata only and is rendered as a single info line
   * in the PDF header. It MUST NOT be used to recalculate product prices
   * — pricing comes from `current_price` / `previous_price` on each item
   * exactly as stored on the sale list snapshot.
   */
  settlementTypeTitle?: string | null;
  termsText?: string | null;
  usdRate?: number | null;
  selectedColumns: SaleListPdfColumn[];
  items: SaleListPdfItem[];
  /**
   * Optional explicit brand display order. Brands not listed here are appended
   * at the end, preserving their original first-appearance order. When set,
   * items are grouped by brand and a brand-header row is rendered before each
   * group in the PDF.
   */
  brandOrder?: string[] | null;
  /**
   * Optional explicit product display order **inside each brand**. Map of
   * brand key → ordered list of product UUIDs. Products listed here are
   * rendered first in the given order; the rest of the brand's products are
   * appended using the default fallback sort (model, numeric capacity, name).
   * Use the same brand keys as `brandOrder` (NO_BRAND_KEY for no-brand).
   */
  productOrderByBrand?: Record<string, string[]> | null;
  sellerInfo?: string | null;
  shopInfo?: {
    name?: string | null;
    address?: string | null;
    phone?: string | null;
    website?: string | null;
    rubika?: string | null;
    whatsapp?: string | null;
    eitaa?: string | null;
    baleh?: string | null;
  } | null;
  /**
   * Visual density options for the generated PDF.
   * - fontSize: base body font size (header = base+1, footer/info ~= base-1).
   * - rowPaddingY: vertical padding inside each table row (top/bottom).
   * - cellPaddingX: horizontal padding inside each cell (left/right).
   * Sensible defaults are applied when omitted.
   */
  options?: {
    fontSize?: number;
    rowPaddingY?: number;
    cellPaddingX?: number;
    /**
     * Optional per-column widths. Keys are `"row"` (leading row-number column,
     * in PIXELS) and `SaleListPdfColumn` keys (in PERCENT). When provided and
     * non-empty, the table switches to `table-layout: fixed` and applies these
     * widths; columns without an explicit width share the remaining space
     * equally. Percentages are clamped to 3–60 and normalized if they exceed
     * 100. When omitted/null/empty, the current auto-layout behavior is kept.
     */
    columnWidths?: Record<string, number> | null;
  } | null;
}

export const COLUMN_LABELS: Record<SaleListPdfColumn, string> = {
  name: "نام محصول",
  brand: "برند",
  category: "دسته",
  sale_price: "قیمت فروش",
  previous_price: "قیمت قبلی",
  change: "میزان تغییرات",
  stock_status: "موجودی",
  product_type: "نوع کالا",
  labels: "برچسب‌ها",
  description: "توضیحات",
  observatory_price_advantage: "مزیت قیمت",
};

export const NO_BRAND_KEY = "__NO_BRAND__";
export const NO_BRAND_LABEL = "بدون برند";

export function brandKey(b: string | null | undefined): string {
  const t = (b ?? "").trim();
  return t === "" ? NO_BRAND_KEY : t;
}

export function brandLabel(k: string): string {
  return k === NO_BRAND_KEY ? NO_BRAND_LABEL : k;
}

/** Extract first numeric run from a string (e.g. "کولر گازی 12000" -> 12000). */
function firstNumber(s: string | null | undefined): number {
  if (!s) return Number.POSITIVE_INFINITY;
  const m = String(s).match(/\d+(?:[\.,]\d+)?/);
  if (!m) return Number.POSITIVE_INFINITY;
  const n = Number(m[0].replace(",", "."));
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

/**
 * Sort/group items by user-chosen brand order, then within each brand by model
 * (alphabetical) and finally by the numeric capacity extracted from the
 * product name (e.g. 12000 < 18000 < 24000 < 30000).
 */
function arrangeItems(
  items: SaleListPdfItem[],
  brandOrder: string[] | null | undefined,
  productOrderByBrand?: Record<string, string[]> | null,
): { brand: string; rows: SaleListPdfItem[] }[] {
  const groups = new Map<string, SaleListPdfItem[]>();
  const firstSeen: string[] = [];
  for (const it of items) {
    const k = brandKey(it.brand_name);
    if (!groups.has(k)) {
      groups.set(k, []);
      firstSeen.push(k);
    }
    groups.get(k)!.push(it);
  }
  const orderKeys = (brandOrder ?? []).map(brandKey);
  const seen = new Set<string>();
  const finalOrder: string[] = [];
  for (const k of orderKeys) {
    if (groups.has(k) && !seen.has(k)) {
      finalOrder.push(k);
      seen.add(k);
    }
  }
  for (const k of firstSeen) {
    if (!seen.has(k)) {
      finalOrder.push(k);
      seen.add(k);
    }
  }
  return finalOrder.map((k) => {
    const groupRows = (groups.get(k) ?? []).slice();
    const fallbackSort = (a: SaleListPdfItem, b: SaleListPdfItem) => {
      const ma = (a.model ?? "").trim();
      const mb = (b.model ?? "").trim();
      if (ma && mb) {
        const cmp = ma.localeCompare(mb, "fa");
        if (cmp !== 0) return cmp;
      } else if (ma !== mb) {
        return ma ? -1 : 1;
      }
      const na = firstNumber(a.product_name);
      const nb = firstNumber(b.product_name);
      if (na !== nb) return na - nb;
      return (a.product_name ?? "").localeCompare(b.product_name ?? "", "fa");
    };

    const savedIds = productOrderByBrand?.[k] ?? null;
    let rows: SaleListPdfItem[];
    if (savedIds && savedIds.length > 0) {
      const byId = new Map<string, SaleListPdfItem>();
      const noId: SaleListPdfItem[] = [];
      for (const it of groupRows) {
        const pid = (it.product_id ?? "").trim();
        if (pid) byId.set(pid, it);
        else noId.push(it);
      }
      const used = new Set<string>();
      const ordered: SaleListPdfItem[] = [];
      for (const pid of savedIds) {
        const it = byId.get(pid);
        if (it && !used.has(pid)) {
          ordered.push(it);
          used.add(pid);
        }
      }
      const remaining = groupRows
        .filter((it) => {
          const pid = (it.product_id ?? "").trim();
          return !pid || !used.has(pid);
        })
        .sort(fallbackSort);
      rows = [...ordered, ...remaining];
    } else {
      rows = groupRows.sort(fallbackSort);
    }
    return { brand: k, rows };
  });
}

function escapeHtml(s: string | null | undefined): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtPrice(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${formatNumber(Number(n))} ت`;
}

function fmtChange(amount: number | null | undefined, percent: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  const a = Number(amount);
  if (a === 0) return "بدون تغییر";
  const sign = a > 0 ? "+" : "";
  const pct =
    percent !== null && percent !== undefined ? ` (${formatNumber(Number(percent))}٪)` : "";
  return `${sign}${formatNumber(a)} ت${pct}`;
}

function cellText(c: SaleListPdfColumn, it: SaleListPdfItem): string {
  switch (c) {
    case "name":
      return it.product_name || "—";
    case "brand":
      return it.brand_name || "—";
    case "category":
      return it.category_name || "—";
    case "sale_price":
      return fmtPrice(it.current_price);
    case "previous_price":
      return fmtPrice(it.previous_price ?? null);
    case "change":
      return fmtChange(it.change_amount ?? null, it.change_percent ?? null);
    case "stock_status":
      return it.stock_status
        ? (STOCK_STATUS_LABELS[it.stock_status as StockStatus] ?? it.stock_status)
        : "—";
    case "product_type":
      return it.product_type
        ? (PRODUCT_TYPE_LABELS[it.product_type as ProductType] ?? it.product_type)
        : "—";
    case "labels":
      return it.labels && it.labels.length ? it.labels.join("، ") : "—";
    case "description":
      return it.description || "—";
    case "observatory_price_advantage":
      return it.observatory_has_price_advantage === true ? "قیمت رقابتی" : "";
  }
}

function buildHtmlDocument(input: SaleListPdfInput, autoPrint: boolean): string {
  const cols: SaleListPdfColumn[] = ["name", ...input.selectedColumns.filter((c) => c !== "name")];
  const baseFont = Math.max(8, Math.min(20, Number(input.options?.fontSize ?? 11)));
  const padY = Math.max(0, Math.min(20, Number(input.options?.rowPaddingY ?? 4)));
  const padX = Math.max(0, Math.min(20, Number(input.options?.cellPaddingX ?? 6)));

  // Optional per-column widths. When provided (non-empty), switch the table to
  // a fixed layout and apply explicit widths; otherwise keep the current auto
  // layout so lists without saved widths render exactly as before.
  const widthsInput = input.options?.columnWidths ?? null;
  const useFixedLayout = !!widthsInput && Object.keys(widthsInput).length > 0;
  const rawRowW = Number(widthsInput?.row);
  const rowColPx =
    useFixedLayout && Number.isFinite(rawRowW) ? Math.max(24, Math.min(200, rawRowW)) : 48;

  // Percent width per data column (excludes the row-number column).
  const colPct = new Map<SaleListPdfColumn, number>();
  if (useFixedLayout) {
    const clampPct = (n: number) => Math.max(3, Math.min(60, n));
    const undefinedCols: SaleListPdfColumn[] = [];
    let definedSum = 0;
    for (const c of cols) {
      const raw = Number((widthsInput as Record<string, number>)[c]);
      if (Number.isFinite(raw)) {
        const v = clampPct(raw);
        colPct.set(c, v);
        definedSum += v;
      } else {
        undefinedCols.push(c);
      }
    }
    // Columns without an explicit width share the remaining space equally
    // (min 3% each so they never vanish).
    if (undefinedCols.length > 0) {
      const share = Math.max(3, Math.max(0, 100 - definedSum) / undefinedCols.length);
      for (const c of undefinedCols) colPct.set(c, share);
    }
    // Never overflow 100% — normalize proportionally instead of breaking layout.
    let total = 0;
    colPct.forEach((v) => (total += v));
    if (total > 100) {
      const f = 100 / total;
      colPct.forEach((v, c) => colPct.set(c, v * f));
    }
  }

  // Always include a leading row-number column ("ردیف").
  const totalCols = cols.length + 1;
  const headerCells =
    `<th style="width:${rowColPx}px">ردیف</th>` +
    cols
      .map((c) => {
        const w = colPct.get(c);
        const st = w != null ? ` style="width:${Math.round(w * 100) / 100}%"` : "";
        return `<th${st}>${escapeHtml(COLUMN_LABELS[c])}</th>`;
      })
      .join("");

  const changeClass = (it: SaleListPdfItem): string => {
    const amount = it.change_amount;
    if (amount === null || amount === undefined) return "";
    const n = Number(amount);
    if (!Number.isFinite(n)) return "";
    if (n > 0) return "change-up";
    if (n < 0) return "change-down";
    return "change-flat";
  };

  const groups = arrangeItems(input.items, input.brandOrder, input.productOrderByBrand);
  let rowIdx = 0;
  const bodyRows = groups
    .map((g) => {
      const header = `<tr class="brand-row"><td colspan="${totalCols}">${escapeHtml(brandLabel(g.brand))}</td></tr>`;
      const rows = g.rows
        .map((it) => {
          rowIdx += 1;
          const num = `<td class="row-num">${escapeHtml(formatNumber(rowIdx))}</td>`;
          const tds = cols
            .map((c) => {
              const cls = c === "change" ? changeClass(it) : "";
              const classAttr = cls ? ` class="${cls}"` : "";
              return `<td${classAttr}>${escapeHtml(cellText(c, it))}</td>`;
            })
            .join("");
          return `<tr>${num}${tds}</tr>`;
        })
        .join("");
      return header + rows;
    })
    .join("");

  const shop = input.shopInfo ?? {};
  const infoLines: string[] = [];
  if (shop.name && shop.name.trim()) infoLines.push(shop.name.trim());
  if (shop.address && shop.address.trim()) infoLines.push(`آدرس: ${shop.address.trim()}`);
  if (shop.phone && shop.phone.trim()) infoLines.push(`تلفن: ${shop.phone.trim()}`);
  const m1: string[] = [];
  if (shop.rubika && shop.rubika.trim()) m1.push(`روبیکا: ${shop.rubika.trim()}`);
  if (shop.whatsapp && shop.whatsapp.trim()) m1.push(`واتساپ: ${shop.whatsapp.trim()}`);
  if (m1.length) infoLines.push(m1.join(" | "));
  const m2: string[] = [];
  if (shop.eitaa && shop.eitaa.trim()) m2.push(`ایتا: ${shop.eitaa.trim()}`);
  if (shop.baleh && shop.baleh.trim()) m2.push(`بله: ${shop.baleh.trim()}`);
  if (m2.length) infoLines.push(m2.join(" | "));
  if (shop.website && shop.website.trim()) infoLines.push(`وب‌سایت: ${shop.website.trim()}`);

  const sellerInfoText = (input.sellerInfo ?? "").trim();
  const sellerBlock = sellerInfoText
    ? `<div class="seller">فروشنده: ${escapeHtml(sellerInfoText)}</div>`
    : "";
  const infoBlock = infoLines.length
    ? `<div class="info-block">${sellerBlock}${infoLines.map((l) => `<div>${escapeHtml(l)}</div>`).join("")}</div>`
    : sellerBlock
      ? `<div class="info-block">${sellerBlock}</div>`
      : "";

  const termsBlock =
    input.termsText && input.termsText.trim()
      ? `<div class="terms">${escapeHtml(input.termsText.trim())}</div>`
      : "";

  const title = `لیست فروش - ${input.listName}`;
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const settlementLine =
    input.settlementTypeTitle && input.settlementTypeTitle.trim()
      ? `<div>نوع تسویه: ${escapeHtml(input.settlementTypeTitle.trim())}</div>`
      : "";

  const usdRateLine =
    input.usdRate && input.usdRate > 0
      ? `<div style="font-weight:700;color:#1e293b">نرخ دلار (در لحظهٔ صدور): ${escapeHtml(formatNumber(Math.round(input.usdRate)))} تومان</div>`
      : "";

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  @font-face {
    font-family: "Vazirmatn";
    src: url("${origin}/fonts/vazirmatn/Vazirmatn-400.woff2") format("woff2");
    font-weight: 400;
    font-display: swap;
  }
  @font-face {
    font-family: "Vazirmatn";
    src: url("${origin}/fonts/vazirmatn/Vazirmatn-700.woff2") format("woff2");
    font-weight: 700;
    font-display: swap;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    font-family: "Vazirmatn", Tahoma, Arial, sans-serif;
    color: #111827;
    background: #ffffff;
    direction: rtl;
    font-size: ${baseFont}px;
    line-height: 1.6;
  }
  .page {
    padding: 16px 18px;
    max-width: 1024px;
    margin: 0 auto;
  }
  .toolbar {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
    padding: 8px 12px;
    background: #f1f5f9;
    border-radius: 6px;
    font-size: 12px;
    color: #334155;
  }
  .toolbar button {
    font: inherit;
    background: #1e293b;
    color: #fff;
    border: 0;
    border-radius: 4px;
    padding: 6px 12px;
    cursor: pointer;
  }
  .toolbar button.secondary {
    background: #e2e8f0;
    color: #1e293b;
  }
  .header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 8px;
    margin-bottom: 12px;
  }
  .brand { font-size: ${baseFont + 6}px; font-weight: 700; color: #1e293b; }
  .doc-title { font-size: ${baseFont + 2}px; font-weight: 700; color: #334155; }
  .meta { font-size: ${Math.max(9, baseFont - 2)}px; color: #475569; line-height: 1.7; }
  .meta .row { display: flex; justify-content: space-between; gap: 16px; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 8px;
    table-layout: ${useFixedLayout ? "fixed" : "auto"};
  }
  th, td {
    border: 1px solid #e5e7eb;
    padding: ${padY}px ${padX}px;
    text-align: right;
    vertical-align: middle;
    font-size: ${baseFont}px;
    word-break: break-word;
  }
  th {
    background: #eef2ff;
    color: #1e293b;
    font-weight: 700;
  }
  tbody tr:nth-child(even) td { background: #fafafa; }
  tbody tr.brand-row td {
    background: #1e293b !important;
    color: #ffffff;
    font-weight: 700;
    text-align: center;
    font-size: ${baseFont + 1}px;
    padding: ${padY + 2}px ${padX}px;
  }
  td.row-num { text-align: center; color: #475569; font-variant-numeric: tabular-nums; }
  td.change-up {
    color: #dc2626;
    font-weight: 700;
    direction: ltr;
    text-align: center;
    unicode-bidi: isolate;
  }
  td.change-down {
    color: #059669;
    font-weight: 700;
    direction: ltr;
    text-align: center;
    unicode-bidi: isolate;
  }
  td.change-flat {
    color: #64748b;
    font-weight: 600;
    text-align: center;
  }
  .info-block {
    margin-top: 16px;
    padding: 10px 12px;
    background: #f8fafc;
    border-top: 1px solid #cbd5e1;
    font-size: ${Math.max(9, baseFont - 2)}px;
    color: #374151;
    line-height: 1.9;
  }
  .info-block .seller { font-weight: 700; color: #111827; margin-bottom: 4px; }
  .terms {
    margin-top: 12px;
    font-size: ${Math.max(9, baseFont - 2)}px;
    color: #475569;
    border-top: 1px dashed #e5e7eb;
    padding-top: 8px;
    white-space: pre-wrap;
  }
  @page { size: A4; margin: 14mm 12mm; }
  @media print {
    .toolbar { display: none !important; }
    body { background: #fff; }
    .page { padding: 0; max-width: none; }
    tbody tr { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="toolbar">
    <button onclick="window.print()">چاپ / ذخیره به PDF</button>
    <button class="secondary" onclick="(function(){try{window.close();}catch(e){} setTimeout(function(){if(!window.closed){if(window.history.length>1){window.history.back();}else{window.location.href='about:blank';}}},150);})()">بستن</button>
    <span style="margin-inline-start:auto">برای ذخیره به‌صورت PDF در دیالوگ چاپ، گزینهٔ «Save as PDF» را انتخاب کنید.</span>
  </div>
  <div class="header">
    <div>
      <div class="brand">افراکالا</div>
      <div class="meta">
        <div>${escapeHtml(input.listName)} — نسخه ${escapeHtml(formatNumber(input.versionNumber))}</div>
      </div>
    </div>
    <div style="text-align:left">
      <div class="doc-title">لیست فروش</div>
      <div class="meta">
        <div>تاریخ: ${escapeHtml(formatDateFa(new Date()))}</div>
        ${usdRateLine}
        <div>ایجادکننده: ${escapeHtml(input.createdByName)}</div>
        ${settlementLine}
      </div>
    </div>
  </div>

  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>

  ${infoBlock}
  ${termsBlock}
</div>
${autoPrint ? "<script>window.addEventListener('load', () => setTimeout(() => window.print(), 400));</script>" : ""}
</body>
</html>`;
}

function openHtmlInNewWindow(html: string): void {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (!win) {
    // Popup blocked — fallback to same tab so user still gets the content.
    window.location.href = url;
  }
  // Revoke after a generous delay so the new tab can finish loading.
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

export async function previewSaleListPdf(input: SaleListPdfInput): Promise<void> {
  const html = buildHtmlDocument(input, false);
  openHtmlInNewWindow(html);
}

export async function downloadSaleListPdf(input: SaleListPdfInput): Promise<void> {
  // Render the same RTL HTML inside a hidden iframe, then snapshot it with
  // html2canvas-pro and slice the bitmap into A4 pages with jsPDF. This gives
  // the user a real downloadable .pdf file without relying on the browser's
  // print dialog (which some users find unreliable / hard to find).
  const html = buildHtmlDocument(input, false);
  const safeName =
    (input.listName || "sale-list").replace(/[\\/:*?"<>|]+/g, "_").trim() || "sale-list";
  const fileName = `${safeName}-v${input.versionNumber}.pdf`;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = "1024px";
  iframe.style.height = "1px";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error("no_iframe_document");
    doc.open();
    doc.write(html);
    doc.close();

    // Wait for fonts + layout
    await new Promise<void>((resolve) => {
      if (iframe.contentWindow?.document.readyState === "complete") resolve();
      else iframe.onload = () => resolve();
    });
    try {
      await (iframe.contentDocument as any)?.fonts?.ready;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));

    const target =
      (iframe.contentDocument?.querySelector(".page") as HTMLElement | null) ??
      (iframe.contentDocument?.body as HTMLElement);
    // Hide toolbar in capture
    const toolbar = iframe.contentDocument?.querySelector(".toolbar") as HTMLElement | null;
    if (toolbar) toolbar.style.display = "none";

    const html2canvasMod = await import("html2canvas-pro");
    const html2canvas = (html2canvasMod as any).default ?? (html2canvasMod as any);
    const { jsPDF } = await import("jspdf");

    const canvas: HTMLCanvasElement = await html2canvas(target, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
      windowWidth: target.scrollWidth,
      windowHeight: target.scrollHeight,
    });

    const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
    const pageWidthMm = pdf.internal.pageSize.getWidth();
    const pageHeightMm = pdf.internal.pageSize.getHeight();
    const marginMm = 8;
    const usableWidthMm = pageWidthMm - marginMm * 2;
    const usableHeightMm = pageHeightMm - marginMm * 2;

    const pxPerMm = canvas.width / usableWidthMm;
    const pageHeightPx = Math.floor(usableHeightMm * pxPerMm);

    let renderedPx = 0;
    let pageIndex = 0;
    while (renderedPx < canvas.height) {
      const sliceHeightPx = Math.min(pageHeightPx, canvas.height - renderedPx);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = sliceHeightPx;
      const ctx = slice.getContext("2d");
      if (!ctx) throw new Error("canvas_ctx");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(
        canvas,
        0,
        renderedPx,
        canvas.width,
        sliceHeightPx,
        0,
        0,
        canvas.width,
        sliceHeightPx,
      );
      const imgData = slice.toDataURL("image/jpeg", 0.92);
      if (pageIndex > 0) pdf.addPage();
      const sliceHeightMm = sliceHeightPx / pxPerMm;
      pdf.addImage(imgData, "JPEG", marginMm, marginMm, usableWidthMm, sliceHeightMm);
      renderedPx += sliceHeightPx;
      pageIndex += 1;
    }

    // Use blob + anchor click for maximum browser compatibility — pdf.save()
    // sometimes fails silently inside iframes / strict popup-blockers.
    const pdfBlob: Blob = pdf.output("blob");
    const blobUrl = URL.createObjectURL(pdfBlob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = fileName;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        document.body.removeChild(a);
      } catch {}
      URL.revokeObjectURL(blobUrl);
    }, 1000);
  } finally {
    setTimeout(() => {
      try {
        document.body.removeChild(iframe);
      } catch {}
    }, 500);
  }
}
