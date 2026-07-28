// Client-side PDF generation for sales quotes.
//
// History: this module used pdfmake with the local Vazirmatn TTFs. Two things
// broke it. pdfmake 0.3 dropped the `pdfMake.vfs = {...}` registration this
// file used, so the font never reached the virtual filesystem; and the failure
// surfaced inside an un-awaited async `download()`, so the caller's try/catch
// never saw it and the button silently did nothing. Underneath both sat a
// third, unfixable problem: pdfmake's text engine implements neither Arabic
// shaping nor the Unicode BiDi algorithm, so Persian came out as disconnected,
// reversed letters. src/lib/pdf/sale-list-pdf.ts hit the same wall and moved
// off pdfmake for exactly this reason.
//
// So the document is now built as a self-contained RTL HTML page using the
// locally-hosted Vazirmatn webfont, rendered in a hidden iframe, snapshotted
// with html2canvas-pro and sliced into A4 pages with jsPDF. The browser's own
// text engine does the shaping and BiDi, which is the only implementation that
// gets Persian right. Self-host friendly: no CDN, no server roundtrip.

import { toPersianAmountWords } from "@/lib/i18n/number-to-words";

export interface QuotePdfItem {
  title: string;
  sku?: string | null;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  line_total: number;
}

export interface QuotePdfPayload {
  quote_number: string;
  customer_name: string;
  customer_phone: string;
  salesperson_name?: string | null;
  /** Item 203 — the visitor credited for the deal, when one is assigned. */
  visitor_name?: string | null;
  created_at: string; // ISO
  expires_at?: string | null; // ISO
  status_label: string;
  customer_note?: string | null;
  items: QuotePdfItem[];
  subtotal_amount: number;
  discount_amount: number;
  final_amount: number;
}

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

function toFaDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

function fmtNum(n: number): string {
  const safe = Number.isFinite(n) ? n : 0;
  return toFaDigits(Math.round(safe).toLocaleString("en-US"));
}

// Money stays in Latin digits with comma grouping. Persian digits mixed with
// commas and a currency label reorder visually inside an RTL run.
function formatMoney(n: number): string {
  const safe = Number.isFinite(n) ? n : 0;
  return Math.round(safe).toLocaleString("en-US");
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return toFaDigits(
      new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(iso)),
    );
  } catch {
    return "—";
  }
}

function fmtDateTime(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return toFaDigits(
      new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso)),
    );
  } catch {
    return "—";
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildQuoteHtml(payload: QuotePdfPayload): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const infoRow = (label: string, value: string) =>
    `<div class="info"><span class="lbl">${escapeHtml(label)}:</span> <span>${escapeHtml(value)}</span></div>`;

  const itemRows = payload.items
    .map(
      (it, i) => `<tr>
      <td class="c">${toFaDigits(i + 1)}</td>
      <td>${escapeHtml(it.title || "—")}</td>
      <td class="sku">${escapeHtml(it.sku ?? "—")}</td>
      <td class="c">${fmtNum(it.quantity)}</td>
      <td class="m">${formatMoney(it.unit_price)}</td>
      <td class="m">${formatMoney(it.discount_amount)}</td>
      <td class="m strong">${formatMoney(it.line_total)}</td>
    </tr>`,
    )
    .join("");

  // Item 203 — the amount in Persian letters. Kept in its own full-width block
  // rather than inside the totals table: an RTL sentence sitting next to Latin
  // digits in a narrow cell reorders visually.
  const amountWords = toPersianAmountWords(payload.final_amount);

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(`پیش‌فاکتور ${payload.quote_number}`)}</title>
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
    margin: 0; padding: 0;
    font-family: "Vazirmatn", Tahoma, Arial, sans-serif;
    color: #111827; background: #ffffff; direction: rtl;
    font-size: 13px; line-height: 1.7;
  }
  .page { padding: 22px 24px; max-width: 1024px; margin: 0 auto; background: #fff; }
  h1 { font-size: 21px; margin: 0 0 6px; color: #111827; }
  .qnum { font-size: 14px; margin-bottom: 10px; }
  .lbl { font-weight: 700; color: #374151; }
  hr { border: 0; border-top: 1px solid #d1d5db; margin: 12px 0; }
  h2 { font-size: 14px; margin: 16px 0 6px; color: #111827; }
  .info { margin-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th, td { border: 1px solid #d1d5db; padding: 7px 8px; text-align: right; vertical-align: top; }
  th { background: #f3f4f6; font-weight: 700; font-size: 12.5px; }
  td { font-size: 12.5px; }
  td.c { text-align: center; }
  td.m { text-align: left; direction: ltr; font-variant-numeric: tabular-nums; }
  td.strong { font-weight: 700; }
  td.sku { font-size: 11.5px; color: #374151; direction: ltr; text-align: left; }
  .totals { margin-top: 16px; width: 100%; }
  .totals td { border: 1px solid #d1d5db; padding: 8px 10px; }
  .totals .tl { text-align: right; color: #374151; }
  .totals .tv { text-align: left; direction: ltr; font-weight: 700; width: 150px; }
  .totals .tc { text-align: right; width: 52px; color: #374151; }
  .grand td { background: #f3f4f6; font-size: 15px; font-weight: 700; }
  .words { margin-top: 12px; border: 1px solid #d1d5db; background: #f9fafb; padding: 10px 12px; border-radius: 4px; }
  .words .lbl { display: block; margin-bottom: 2px; font-size: 12px; }
  .note { margin-top: 14px; }
  .note-body { border: 1px solid #d1d5db; background: #f9fafb; padding: 9px 11px; white-space: pre-wrap; border-radius: 4px; }
  .foot { margin-top: 20px; padding-top: 8px; border-top: 1px solid #d1d5db; font-size: 11px; color: #6b7280; }
</style>
</head>
<body>
<div class="page">
  <h1>پیش‌فاکتور فروش</h1>
  <div class="qnum"><span class="lbl">شماره پیش‌فاکتور:</span> ${escapeHtml(toFaDigits(payload.quote_number))}</div>
  <hr />

  <h2>اطلاعات مشتری</h2>
  ${infoRow("نام مشتری", payload.customer_name || "—")}
  ${infoRow("شماره تماس", toFaDigits(payload.customer_phone || "—"))}

  <h2>اطلاعات سند</h2>
  ${infoRow("فروشنده", payload.salesperson_name || "—")}
  ${payload.visitor_name ? infoRow("ویزیتور", payload.visitor_name) : ""}
  ${infoRow("تاریخ صدور", fmtDateTime(payload.created_at))}
  ${infoRow("اعتبار تا", fmtDate(payload.expires_at))}
  ${infoRow("وضعیت", payload.status_label)}

  <h2>اقلام پیش‌فاکتور</h2>
  <table>
    <thead>
      <tr>
        <th style="width:34px">ردیف</th>
        <th>عنوان کالا</th>
        <th style="width:90px">SKU</th>
        <th style="width:52px">تعداد</th>
        <th style="width:104px">قیمت واحد (تومان)</th>
        <th style="width:88px">تخفیف (تومان)</th>
        <th style="width:104px">جمع خط (تومان)</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <table class="totals">
    <tbody>
      <tr>
        <td class="tl">جمع جزء</td>
        <td class="tv">${formatMoney(payload.subtotal_amount)}</td>
        <td class="tc">تومان</td>
      </tr>
      <tr>
        <td class="tl">تخفیف</td>
        <td class="tv">${formatMoney(payload.discount_amount)}</td>
        <td class="tc">تومان</td>
      </tr>
      <tr class="grand">
        <td class="tl">مبلغ نهایی قابل پرداخت</td>
        <td class="tv">${formatMoney(payload.final_amount)}</td>
        <td class="tc">تومان</td>
      </tr>
    </tbody>
  </table>

  ${amountWords ? `<div class="words"><span class="lbl">مبلغ به حروف:</span>${escapeHtml(amountWords)}</div>` : ""}

  ${
    payload.customer_note
      ? `<div class="note"><h2>یادداشت مشتری</h2><div class="note-body">${escapeHtml(payload.customer_note)}</div></div>`
      : ""
  }

  <div class="foot">این سند پیش‌فاکتور است و فاکتور رسمی محسوب نمی‌شود.</div>
</div>
</body>
</html>`;
}

export async function downloadQuotePdf(payload: QuotePdfPayload): Promise<void> {
  if (!payload.quote_number) {
    throw new Error("شماره پیش‌فاکتور موجود نیست.");
  }
  if (!payload.items || payload.items.length === 0) {
    throw new Error("این پیش‌فاکتور آیتمی ندارد.");
  }

  const html = buildQuoteHtml(payload);
  const fileName = `quote-${payload.quote_number.replace(/[\\/:*?"<>|]+/g, "_")}.pdf`;

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
    if (!doc) throw new Error("سند داخلی برای ساخت PDF ساخته نشد.");
    doc.open();
    doc.write(html);
    doc.close();

    // Wait for the document, then for the webfont: snapshotting before
    // Vazirmatn loads bakes a fallback face into the PDF.
    await new Promise<void>((resolve) => {
      if (iframe.contentWindow?.document.readyState === "complete") resolve();
      else iframe.onload = () => resolve();
    });
    try {
      await (iframe.contentDocument as Document & { fonts?: FontFaceSet })?.fonts?.ready;
    } catch {
      /* font loading API unavailable — fall through to the settle delay */
    }
    await new Promise((r) => setTimeout(r, 250));

    const target =
      (iframe.contentDocument?.querySelector(".page") as HTMLElement | null) ??
      (iframe.contentDocument?.body as HTMLElement);

    const html2canvasMod = await import("html2canvas-pro");
    const html2canvas =
      (html2canvasMod as unknown as { default?: unknown }).default ?? html2canvasMod;
    const { jsPDF } = await import("jspdf");

    const canvas: HTMLCanvasElement = await (
      html2canvas as (el: HTMLElement, o: Record<string, unknown>) => Promise<HTMLCanvasElement>
    )(target, {
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
      if (!ctx) throw new Error("ساخت بوم تصویر برای PDF ممکن نشد.");
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
      pdf.addImage(imgData, "JPEG", marginMm, marginMm, usableWidthMm, sliceHeightPx / pxPerMm);
      renderedPx += sliceHeightPx;
      pageIndex += 1;
    }

    // Blob + anchor click rather than pdf.save(): the latter can fail silently
    // under strict popup blockers.
    const blobUrl = URL.createObjectURL(pdf.output("blob"));
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
      } catch {
        /* already gone */
      }
      URL.revokeObjectURL(blobUrl);
    }, 1000);
  } finally {
    setTimeout(() => {
      try {
        document.body.removeChild(iframe);
      } catch {
        /* already gone */
      }
    }, 500);
  }
}
