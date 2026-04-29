import pdfMake from "pdfmake/build/pdfmake";
import type { TDocumentDefinitions, Content } from "pdfmake/interfaces";
import vazirRegularB64 from "@/assets/fonts/vazirmatn-regular.b64?raw";
import vazirBoldB64 from "@/assets/fonts/vazirmatn-bold.b64?raw";
import { formatNumber, formatDateFa } from "@/lib/i18n/formatters";
import { STOCK_STATUS_LABELS, PRODUCT_TYPE_LABELS, type StockStatus, type ProductType } from "@/lib/products/constants";

let fontsRegistered = false;
function ensureFonts() {
  if (fontsRegistered) return;
  // Inject font files into pdfmake virtual file system as base64
  (pdfMake as any).vfs = {
    ...((pdfMake as any).vfs ?? {}),
    "Vazirmatn-Regular.ttf": vazirRegularB64.trim(),
    "Vazirmatn-Bold.ttf": vazirBoldB64.trim(),
  };
  (pdfMake as any).fonts = {
    Vazirmatn: {
      normal: "Vazirmatn-Regular.ttf",
      bold: "Vazirmatn-Bold.ttf",
      italics: "Vazirmatn-Regular.ttf",
      bolditalics: "Vazirmatn-Bold.ttf",
    },
  };
  fontsRegistered = true;
}

export type SaleListPdfColumn =
  | "name" | "brand" | "category" | "sale_price" | "previous_price"
  | "change" | "stock_status" | "product_type" | "labels" | "description";

export interface SaleListPdfItem {
  product_name: string;
  brand_name?: string | null;
  category_name?: string | null;
  current_price: number;
  previous_price?: number | null;
  change_amount?: number | null;
  change_percent?: number | null;
  stock_status?: string | null;
  product_type?: string | null;
  labels?: string[] | null;
  description?: string | null;
}

export interface SaleListPdfInput {
  listName: string;
  versionNumber: number;
  createdByName: string;
  salePriceTypeTitle: string;
  termsText?: string | null;
  selectedColumns: SaleListPdfColumn[];
  items: SaleListPdfItem[];
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
}

const COLUMN_LABELS: Record<SaleListPdfColumn, string> = {
  name: "نام محصول",
  brand: "برند",
  category: "دسته",
  sale_price: "قیمت فروش",
  previous_price: "قیمت قبلی",
  change: "تغییر",
  stock_status: "موجودی",
  product_type: "نوع کالا",
  labels: "برچسب‌ها",
  description: "توضیحات",
};

const COLUMN_WIDTHS: Record<SaleListPdfColumn, string | number> = {
  name: "*",
  brand: 60,
  category: 60,
  sale_price: 70,
  previous_price: 65,
  change: 70,
  stock_status: 55,
  product_type: 50,
  labels: 60,
  description: 80,
};

function fmtPrice(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${formatNumber(Number(n))} ت`;
}
function fmtChange(amount: number | null | undefined, percent: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  const a = Number(amount);
  if (a === 0) return "بدون تغییر";
  const sign = a > 0 ? "+" : "";
  const pct = percent !== null && percent !== undefined ? ` (${formatNumber(Number(percent))}٪)` : "";
  return `${sign}${formatNumber(a)} ت${pct}`;
}

function buildDocDefinition(input: SaleListPdfInput): TDocumentDefinitions {
  // Always include name; preserve order from selected_columns but ensure 'name' first
  const cols: SaleListPdfColumn[] = ["name", ...input.selectedColumns.filter((c) => c !== "name")];

  const headerRow = cols.map((c) => ({
    text: COLUMN_LABELS[c],
    style: "tableHeader",
    alignment: "right" as const,
  }));

  const bodyRows = input.items.map((it) =>
    cols.map((c): any => {
      let text = "—";
      switch (c) {
        case "name": text = it.product_name || "—"; break;
        case "brand": text = it.brand_name || "—"; break;
        case "category": text = it.category_name || "—"; break;
        case "sale_price": text = fmtPrice(it.current_price); break;
        case "previous_price": text = fmtPrice(it.previous_price ?? null); break;
        case "change": text = fmtChange(it.change_amount ?? null, it.change_percent ?? null); break;
        case "stock_status":
          text = it.stock_status
            ? (STOCK_STATUS_LABELS[it.stock_status as StockStatus] ?? it.stock_status)
            : "—"; break;
        case "product_type":
          text = it.product_type
            ? (PRODUCT_TYPE_LABELS[it.product_type as ProductType] ?? it.product_type)
            : "—"; break;
        case "labels": text = it.labels && it.labels.length ? it.labels.join("، ") : "—"; break;
        case "description": text = it.description || "—"; break;
      }
      return { text, alignment: "right", fontSize: 9 };
    }),
  );

  const tableContent: Content = {
    table: {
      headerRows: 1,
      widths: cols.map((c) => COLUMN_WIDTHS[c]),
      body: [headerRow, ...bodyRows],
      dontBreakRows: true,
    },
    layout: {
      fillColor: (rowIndex: number) => (rowIndex === 0 ? "#eef2ff" : rowIndex % 2 === 0 ? "#fafafa" : null),
      hLineColor: () => "#e5e7eb",
      vLineColor: () => "#e5e7eb",
    },
  };

  return {
    pageSize: "A4",
    pageMargins: [25, 80, 25, 60],
    // RTL document — explicit direction + right alignment for all default text
    defaultStyle: { font: "Vazirmatn", fontSize: 10, alignment: "right", direction: "rtl" } as any,
    info: {
      title: `لیست فروش - ${input.listName}`,
      author: "افراکالا",
    },
    header: () => ({
      margin: [25, 20, 25, 0],
      stack: [
        {
          columns: [
            { text: "افراکالا", style: "brand", alignment: "right" },
            { text: "لیست فروش", style: "title", alignment: "left" },
          ],
        },
        {
          columns: [
            { text: `${input.listName} — نسخه ${formatNumber(input.versionNumber)}`, alignment: "right", fontSize: 10 },
            { text: `تاریخ: ${formatDateFa(new Date())}`, alignment: "left", fontSize: 9, color: "#666" },
          ],
          margin: [0, 4, 0, 0],
        },
        {
          columns: [
            { text: `نوع قیمت: ${input.salePriceTypeTitle}`, alignment: "right", fontSize: 9, color: "#666" },
            { text: `ایجادکننده: ${input.createdByName}`, alignment: "left", fontSize: 9, color: "#666" },
          ],
        },
      ],
    }),
    footer: (currentPage, pageCount) => ({
      margin: [25, 10, 25, 20],
      stack: [
        ...(input.termsText
          ? [{ text: input.termsText, fontSize: 8, color: "#555", alignment: "right" as const, margin: [0, 0, 0, 4] as [number, number, number, number] }]
          : []),
        {
          text: `صفحه ${formatNumber(currentPage)} از ${formatNumber(pageCount)}`,
          alignment: "center",
          fontSize: 8,
          color: "#888",
        },
      ],
    }),
    content: [tableContent],
    styles: {
      brand: { fontSize: 14, bold: true, color: "#1e293b" },
      title: { fontSize: 12, bold: true, color: "#334155" },
      tableHeader: { bold: true, fontSize: 10, color: "#1e293b" },
    },
  };
}

export function previewSaleListPdf(input: SaleListPdfInput): void {
  ensureFonts();
  const doc = pdfMake.createPdf(buildDocDefinition(input));
  (doc as any).getBlob((blob: Blob) => {
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  });
}

export function downloadSaleListPdf(input: SaleListPdfInput): void {
  ensureFonts();
  const safe = input.listName.replace(/[\\/:*?"<>|]/g, "_");
  const filename = `SaleList-${safe}-v${input.versionNumber}.pdf`;
  pdfMake.createPdf(buildDocDefinition(input)).download(filename);
}