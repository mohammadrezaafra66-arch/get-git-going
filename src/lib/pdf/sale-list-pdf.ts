import pdfMake from "pdfmake/build/pdfmake";
import type { TDocumentDefinitions, Content } from "pdfmake/interfaces";
// @ts-expect-error - no bundled types
import bidiFactory from "bidi-js";
// @ts-expect-error - no bundled types
import { PersianShaper } from "arabic-persian-reshaper";
import vazirRegularB64 from "@/assets/fonts/vazirmatn-regular.b64?raw";
import vazirBoldB64 from "@/assets/fonts/vazirmatn-bold.b64?raw";
import { formatNumber, formatDateFa } from "@/lib/i18n/formatters";
import { STOCK_STATUS_LABELS, PRODUCT_TYPE_LABELS, type StockStatus, type ProductType } from "@/lib/products/constants";

const bidi = bidiFactory();
/**
 * Reorder a logical-order Persian/Arabic string into visual order so that
 * pdfmake (which has no built-in BiDi engine) renders numbers and Latin
 * fragments in the correct on-screen position inside RTL text.
 */
function shapeRtl(text: string): string {
  if (!text) return text;
  const hasRtl = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/.test(text);
  if (!hasRtl) return text;
  try {
    const lines = text.split("\n");
    return lines
      .map((line) => {
        // 1) Reshape logical Arabic/Persian letters into their connected
        //    presentation forms (initial/medial/final/isolated).
        const shaped = PersianShaper.convertArabic(line);
        // 2) Reorder bidi runs into visual order so numbers/Latin appear
        //    at the correct on-screen position inside the RTL line.
        const embed = bidi.getEmbeddingLevels(shaped, "rtl");
        return bidi.getReorderedString(shaped, embed);
      })
      .join("\n");
  } catch {
    return text;
  }
}

const VFS = {
  "Vazirmatn-Regular.ttf": vazirRegularB64.trim(),
  "Vazirmatn-Bold.ttf": vazirBoldB64.trim(),
};
const FONTS = {
  Vazirmatn: {
    normal: "Vazirmatn-Regular.ttf",
    bold: "Vazirmatn-Bold.ttf",
    italics: "Vazirmatn-Regular.ttf",
    bolditalics: "Vazirmatn-Bold.ttf",
  },
};
function ensureFonts() {
  const pdf = pdfMake as any;
  if (typeof pdf.addVirtualFileSystem === "function") {
    pdf.addVirtualFileSystem(VFS);
  } else {
    pdf.vfs = { ...(pdf.vfs ?? {}), ...VFS };
  }

  if (typeof pdf.addFonts === "function") {
    pdf.addFonts(FONTS);
  } else {
    pdf.fonts = FONTS;
  }
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
  return shapeRtl(`${formatNumber(Number(n))} ت`);
}
function fmtChange(amount: number | null | undefined, percent: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  const a = Number(amount);
  if (a === 0) return shapeRtl("بدون تغییر");
  const sign = a > 0 ? "+" : "";
  const pct = percent !== null && percent !== undefined ? ` (${formatNumber(Number(percent))}٪)` : "";
  return shapeRtl(`${sign}${formatNumber(a)} ت${pct}`);
}

function buildDocDefinition(input: SaleListPdfInput): TDocumentDefinitions {
  // Always include name; preserve order from selected_columns but ensure 'name' first
  const cols: SaleListPdfColumn[] = ["name", ...input.selectedColumns.filter((c) => c !== "name")];

  const baseFont = Math.max(6, Math.min(20, Number(input.options?.fontSize ?? 10)));
  const padY = Math.max(0, Math.min(20, Number(input.options?.rowPaddingY ?? 2)));
  const padX = Math.max(0, Math.min(20, Number(input.options?.cellPaddingX ?? 4)));
  const headerFont = baseFont;
  const cellFont = Math.max(6, baseFont - 1);

  const headerRow = cols.map((c) => ({
    text: shapeRtl(COLUMN_LABELS[c]),
    style: "tableHeader",
    alignment: "right" as const,
    fontSize: headerFont,
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
      return { text: shapeRtl(text), alignment: "right", fontSize: cellFont };
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
      paddingLeft: () => padX,
      paddingRight: () => padX,
      paddingTop: () => padY,
      paddingBottom: () => padY,
    },
  };

  // Shop info / seller block (rendered after the table, before page footer)
  const shop = input.shopInfo ?? {};
  const infoLines: string[] = [];
  if (shop.name && shop.name.trim()) infoLines.push(shop.name.trim());
  if (shop.address && shop.address.trim()) infoLines.push(`آدرس: ${shop.address.trim()}`);
  if (shop.phone && shop.phone.trim()) infoLines.push(`تلفن: ${shop.phone.trim()}`);
  const messengers1: string[] = [];
  if (shop.rubika && shop.rubika.trim()) messengers1.push(`روبیکا: ${shop.rubika.trim()}`);
  if (shop.whatsapp && shop.whatsapp.trim()) messengers1.push(`واتساپ: ${shop.whatsapp.trim()}`);
  if (messengers1.length) infoLines.push(messengers1.join(" | "));
  const messengers2: string[] = [];
  if (shop.eitaa && shop.eitaa.trim()) messengers2.push(`ایتا: ${shop.eitaa.trim()}`);
  if (shop.baleh && shop.baleh.trim()) messengers2.push(`بله: ${shop.baleh.trim()}`);
  if (messengers2.length) infoLines.push(messengers2.join(" | "));
  if (shop.website && shop.website.trim()) infoLines.push(`وب‌سایت: ${shop.website.trim()}`);

  const sellerInfoText = (input.sellerInfo ?? "").trim();
  const footerInfoBlock: Content[] = [];
  if (sellerInfoText || infoLines.length > 0) {
    footerInfoBlock.push({
      margin: [0, 16, 0, 0],
      table: {
        widths: ["*"],
        body: [[{
          stack: [
            ...(sellerInfoText
              ? [{ text: shapeRtl(`فروشنده: ${sellerInfoText}`), fontSize: 9, bold: true, alignment: "right" as const, margin: [0, 0, 0, 4] as [number, number, number, number] }]
              : []),
            ...infoLines.map((line) => ({
              text: shapeRtl(line),
              fontSize: 9,
              color: "#374151",
              alignment: "right" as const,
              margin: [0, 1, 0, 1] as [number, number, number, number],
            })),
          ],
          fillColor: "#f8fafc",
          margin: [8, 8, 8, 8] as [number, number, number, number],
          border: [false, true, false, false] as [boolean, boolean, boolean, boolean],
        }]],
      },
      layout: {
        hLineColor: () => "#cbd5e1",
        vLineColor: () => "#cbd5e1",
        hLineWidth: (i: number) => (i === 0 ? 1 : 0),
        vLineWidth: () => 0,
      },
    });
  }

  return {
    pageSize: "A4",
    pageMargins: [25, 80, 25, 60],
    // RTL document — explicit direction + right alignment for all default text
    defaultStyle: { font: "Vazirmatn", fontSize: baseFont, alignment: "right" } as any,
    info: {
      title: `لیست فروش - ${input.listName}`,
      author: "افراکالا",
    },
    header: () => ({
      margin: [25, 20, 25, 0],
      stack: [
        {
          columns: [
            { text: shapeRtl("افراکالا"), style: "brand", alignment: "right" },
            { text: shapeRtl("لیست فروش"), style: "title", alignment: "left" },
          ],
        },
        {
          columns: [
            { text: shapeRtl(`${input.listName} — نسخه ${formatNumber(input.versionNumber)}`), alignment: "right", fontSize: 10 },
            { text: shapeRtl(`تاریخ: ${formatDateFa(new Date())}`), alignment: "left", fontSize: 9, color: "#666" },
          ],
          margin: [0, 4, 0, 0],
        },
        {
          columns: [
            { text: shapeRtl(`نوع قیمت: ${input.salePriceTypeTitle}`), alignment: "right", fontSize: 9, color: "#666" },
            { text: shapeRtl(`ایجادکننده: ${input.createdByName}`), alignment: "left", fontSize: 9, color: "#666" },
          ],
        },
      ],
    }),
    footer: (currentPage, pageCount) => ({
      margin: [25, 10, 25, 20],
      stack: [
        ...(input.termsText
          ? [{ text: shapeRtl(input.termsText), fontSize: 8, color: "#555", alignment: "right" as const, margin: [0, 0, 0, 4] as [number, number, number, number] }]
          : []),
        {
          text: shapeRtl(`صفحه ${formatNumber(currentPage)} از ${formatNumber(pageCount)}`),
          alignment: "center",
          fontSize: 8,
          color: "#888",
        },
      ],
    }),
    content: [tableContent, ...footerInfoBlock],
    styles: {
      brand: { fontSize: 14, bold: true, color: "#1e293b" },
      title: { fontSize: 12, bold: true, color: "#334155" },
      tableHeader: { bold: true, fontSize: headerFont, color: "#1e293b" },
    },
  };
}

export async function previewSaleListPdf(input: SaleListPdfInput): Promise<void> {
  ensureFonts();
  const doc = (pdfMake as any).createPdf(buildDocDefinition(input), {});
  return new Promise<void>((resolve, reject) => {
    try {
      doc.getBlob((blob: Blob) => {
        const url = URL.createObjectURL(blob);
        const win = window.open(url, "_blank");
        if (!win) {
          // Fallback: navigate same tab if popup blocked
          window.location.href = url;
        }
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        resolve();
      });
    } catch (e) {
      reject(e);
    }
  });
}

export async function downloadSaleListPdf(input: SaleListPdfInput): Promise<void> {
  ensureFonts();
  const safe = input.listName.replace(/[\\/:*?"<>|]/g, "_");
  const filename = `SaleList-${safe}-v${input.versionNumber}.pdf`;
  const doc = (pdfMake as any).createPdf(buildDocDefinition(input), {});
  return new Promise<void>((resolve, reject) => {
    try {
      doc.download(filename, () => resolve());
    } catch (e) {
      reject(e);
    }
  });
}