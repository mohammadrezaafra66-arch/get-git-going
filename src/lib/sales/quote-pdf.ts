// Client-side PDF generation for sales quotes.
// Uses pdfmake (self-hosted) + local Vazirmatn TTF fonts under /fonts/vazirmatn/.
// No external CDN, no server roundtrip, no realtime.

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
  created_at: string;       // ISO
  expires_at?: string | null; // ISO
  status_label: string;
  customer_note?: string | null;
  items: QuotePdfItem[];
  subtotal_amount: number;
  discount_amount: number;
  final_amount: number;
}

const FA_DIGITS = ["۰","۱","۲","۳","۴","۵","۶","۷","۸","۹"];
function toFaDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}
function fmtNum(n: number): string {
  const safe = Number.isFinite(n) ? n : 0;
  return toFaDigits(Math.round(safe).toLocaleString("en-US"));
}
function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return toFaDigits(
      new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
        year: "numeric", month: "2-digit", day: "2-digit",
      }).format(d),
    );
  } catch { return "—"; }
}
function fmtDateTime(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return toFaDigits(
      new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit",
      }).format(d),
    );
  } catch { return "—"; }
}

let vfsLoaded = false;

async function fetchTtfAsBase64(url: string): Promise<string> {
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`Failed to load font: ${url}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  // Avoid huge call stack for ~120KB
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + chunk)));
  }
  return btoa(bin);
}

async function loadPdfMake() {
  // Lazy import so the main bundle stays light.
  const mod = await import("pdfmake/build/pdfmake");
  // pdfmake's default export shape varies depending on bundler.
  // Treat as a permissive object — typing for runtime is best-effort here.
  type PdfMakeRuntime = {
    vfs?: Record<string, string>;
    fonts?: Record<string, { normal: string; bold: string; italics?: string; bolditalics?: string }>;
    createPdf: (def: unknown) => { download: (filename: string) => void };
  };
  const pdfMake = (mod as unknown as { default: PdfMakeRuntime }).default ?? (mod as unknown as PdfMakeRuntime);

  if (!vfsLoaded) {
    const [reg, bold] = await Promise.all([
      fetchTtfAsBase64("/fonts/vazirmatn/Vazirmatn-Regular.ttf"),
      fetchTtfAsBase64("/fonts/vazirmatn/Vazirmatn-Bold.ttf"),
    ]);
    pdfMake.vfs = {
      ...(pdfMake.vfs ?? {}),
      "Vazirmatn-Regular.ttf": reg,
      "Vazirmatn-Bold.ttf": bold,
    };
    pdfMake.fonts = {
      Vazirmatn: {
        normal: "Vazirmatn-Regular.ttf",
        bold: "Vazirmatn-Bold.ttf",
        italics: "Vazirmatn-Regular.ttf",
        bolditalics: "Vazirmatn-Bold.ttf",
      },
    };
    vfsLoaded = true;
  }
  return pdfMake;
}

export async function downloadQuotePdf(payload: QuotePdfPayload): Promise<void> {
  if (!payload.quote_number) {
    throw new Error("شماره پیش‌فاکتور موجود نیست.");
  }
  if (!payload.items || payload.items.length === 0) {
    throw new Error("این پیش‌فاکتور آیتمی ندارد.");
  }

  const pdfMake = await loadPdfMake();

  // RTL-friendly column order: amounts on the LEFT, identifiers on the RIGHT.
  // pdfmake itself does not flip RTL, so we order columns visually for Persian readers.
  const itemsHeader = [
    { text: "ردیف", style: "th", alignment: "center" },
    { text: "شرح کالا", style: "th", alignment: "right" },
    { text: "کد (SKU)", style: "th", alignment: "right" },
    { text: "تعداد", style: "th", alignment: "center" },
    { text: "قیمت واحد\n(تومان)", style: "th", alignment: "left" },
    { text: "تخفیف\n(تومان)", style: "th", alignment: "left" },
    { text: "جمع خط\n(تومان)", style: "th", alignment: "left" },
  ];
  const itemRows = payload.items.map((it, idx) => [
    { text: toFaDigits(idx + 1), alignment: "center", style: "td" },
    { text: it.title || "—", alignment: "right", style: "td", noWrap: false },
    { text: it.sku ? it.sku : "—", alignment: "right", style: "tdMono", noWrap: false },
    { text: fmtNum(it.quantity), alignment: "center", style: "td" },
    { text: fmtNum(it.unit_price), alignment: "left", style: "td" },
    { text: fmtNum(it.discount_amount), alignment: "left", style: "td" },
    { text: fmtNum(it.line_total), alignment: "left", style: "tdStrong" },
  ]);

  const docDefinition = {
    pageSize: "A4",
    pageMargins: [36, 48, 36, 60] as [number, number, number, number],
    defaultStyle: { font: "Vazirmatn", fontSize: 10, alignment: "right" as const, lineHeight: 1.35 },
    info: {
      title: `Quote ${payload.quote_number}`,
      author: "AFK",
      creator: "AFK",
    },
    content: [
      // Header band — title on the right, document number on the left.
      {
        table: {
          widths: ["*", "auto"],
          body: [[
            {
              stack: [
                { text: "پیش‌فاکتور فروش", style: "title", alignment: "right" },
                { text: "Sales Quote", style: "titleEn", alignment: "right" },
              ],
              border: [false, false, false, false],
              margin: [8, 6, 8, 6] as [number, number, number, number],
            },
            {
              stack: [
                { text: "شماره سند", style: "muted", alignment: "left" },
                { text: toFaDigits(payload.quote_number), style: "quoteNo", alignment: "left" },
              ],
              border: [false, false, false, false],
              margin: [8, 6, 8, 6] as [number, number, number, number],
            },
          ]],
        },
        layout: {
          fillColor: () => "#f8fafc",
          hLineColor: () => "#e5e7eb",
          vLineColor: () => "#e5e7eb",
          hLineWidth: () => 0.6,
          vLineWidth: () => 0,
        },
        margin: [0, 0, 0, 14] as [number, number, number, number],
      },
      // Customer + document info in a clean two-column card grid
      {
        columns: [
          {
            width: "*",
            table: {
              widths: ["*"],
              body: [
                [{ text: "اطلاعات مشتری", style: "cardTitle", alignment: "right", fillColor: "#f1f5f9" }],
                [{
                  alignment: "right",
                  stack: [
                    { text: [{ text: "نام: ", style: "label" }, { text: payload.customer_name || "—" }] },
                    { text: [{ text: "تماس: ", style: "label" }, { text: toFaDigits(payload.customer_phone || "—") }], margin: [0, 4, 0, 0] as [number, number, number, number] },
                  ],
                }],
              ],
            },
            layout: cardLayout,
          },
          { width: 14, text: "" },
          {
            width: "*",
            table: {
              widths: ["*"],
              body: [
                [{ text: "اطلاعات سند", style: "cardTitle", alignment: "right", fillColor: "#f1f5f9" }],
                [{
                  alignment: "right",
                  stack: [
                    { text: [{ text: "تاریخ صدور: ", style: "label" }, { text: fmtDateTime(payload.created_at) }] },
                    { text: [{ text: "اعتبار تا: ", style: "label" }, { text: fmtDate(payload.expires_at) }], margin: [0, 4, 0, 0] as [number, number, number, number] },
                    { text: [{ text: "وضعیت: ", style: "label" }, { text: payload.status_label }], margin: [0, 4, 0, 0] as [number, number, number, number] },
                    { text: [{ text: "فروشنده: ", style: "label" }, { text: payload.salesperson_name || "—" }], margin: [0, 4, 0, 0] as [number, number, number, number] },
                  ],
                }],
              ],
            },
            layout: cardLayout,
          },
        ],
        margin: [0, 0, 0, 14] as [number, number, number, number],
      },
      {
        text: "اقلام پیش‌فاکتور",
        style: "sectionTitle",
        alignment: "right",
        margin: [0, 0, 0, 6] as [number, number, number, number],
      },
      {
        table: {
          headerRows: 1,
          dontBreakRows: true,
          // Tuned widths: row no + small numeric cols fixed, title flexes,
          // amount columns are wider to fit "تومان" totals comfortably.
          widths: [24, "*", 70, 38, 72, 62, 78],
          body: [itemsHeader, ...itemRows],
        },
        layout: {
          fillColor: (rowIndex: number) => {
            if (rowIndex === 0) return "#1f2937";
            return rowIndex % 2 === 0 ? "#f9fafb" : null;
          },
          hLineColor: () => "#e5e7eb",
          vLineColor: () => "#e5e7eb",
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          paddingLeft: () => 6,
          paddingRight: () => 6,
          paddingTop: () => 6,
          paddingBottom: () => 6,
        },
      },
      // Totals card aligned to the LEFT (where amounts sit), with stronger final row
      {
        margin: [0, 14, 0, 0] as [number, number, number, number],
        columns: [
          {
            width: 260,
            table: {
              widths: ["*", "auto"],
              body: [
                [
                  { text: "جمع جزء", alignment: "right", style: "totalLabel", fillColor: "#f8fafc" },
                  { text: `${fmtNum(payload.subtotal_amount)} تومان`, alignment: "left", style: "totalValue", fillColor: "#f8fafc" },
                ],
                [
                  { text: "تخفیف", alignment: "right", style: "totalLabel" },
                  { text: `${fmtNum(payload.discount_amount)} تومان`, alignment: "left", style: "totalValue" },
                ],
                [
                  { text: "مبلغ نهایی قابل پرداخت", alignment: "right", style: "grandLabel", fillColor: "#1f2937" },
                  { text: `${fmtNum(payload.final_amount)} تومان`, alignment: "left", style: "grandValue", fillColor: "#1f2937" },
                ],
              ],
            },
            layout: {
              hLineColor: () => "#e5e7eb",
              vLineColor: () => "#e5e7eb",
              hLineWidth: () => 0.5,
              vLineWidth: () => 0.5,
              paddingLeft: () => 8,
              paddingRight: () => 8,
              paddingTop: () => 6,
              paddingBottom: () => 6,
            },
          },
          { width: "*", text: "" },
        ],
      },
      ...(payload.customer_note
        ? [
            {
              margin: [0, 16, 0, 0] as [number, number, number, number],
              table: {
                widths: ["*"],
                body: [
                  [{ text: "یادداشت مشتری", style: "cardTitle", alignment: "right", fillColor: "#f1f5f9" }],
                  [{ text: payload.customer_note, alignment: "right" }],
                ],
              },
              layout: cardLayout,
            },
          ]
        : []),
    ],
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        {
          text: "این سند پیش‌فاکتور است و فاکتور رسمی محسوب نمی‌شود.",
          alignment: "right",
          fontSize: 8,
          color: "#6b7280",
          margin: [36, 18, 0, 0],
        },
        {
          text: `صفحه ${toFaDigits(currentPage)} از ${toFaDigits(pageCount)}`,
          alignment: "left",
          fontSize: 8,
          color: "#6b7280",
          margin: [0, 18, 36, 0],
        },
      ],
    }),
    styles: {
      title: { fontSize: 18, bold: true, color: "#0f172a" },
      titleEn: { fontSize: 9, color: "#64748b", margin: [0, 2, 0, 0] as [number, number, number, number] },
      muted: { fontSize: 8, color: "#64748b" },
      quoteNo: { fontSize: 14, bold: true, color: "#0f172a" },
      sectionTitle: { fontSize: 12, bold: true, color: "#0f172a", margin: [0, 0, 0, 4] as [number, number, number, number] },
      cardTitle: { fontSize: 10, bold: true, color: "#0f172a", margin: [0, 0, 0, 0] as [number, number, number, number] },
      label: { color: "#475569", bold: true },
      th: { bold: true, fontSize: 10, color: "#ffffff" },
      td: { fontSize: 10, color: "#0f172a" },
      tdMono: { fontSize: 9, color: "#334155" },
      tdStrong: { fontSize: 10, color: "#0f172a", bold: true },
      totalLabel: { fontSize: 10, color: "#334155" },
      totalValue: { fontSize: 10, color: "#0f172a", bold: true },
      grandLabel: { fontSize: 11, color: "#ffffff", bold: true },
      grandValue: { fontSize: 12, color: "#ffffff", bold: true },
    },
  };

  pdfMake.createPdf(docDefinition).download(`quote-${payload.quote_number}.pdf`);
}

const cardLayout = {
  fillColor: () => null as string | null,
  hLineColor: () => "#e5e7eb",
  vLineColor: () => "#e5e7eb",
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  paddingLeft: () => 8,
  paddingRight: () => 8,
  paddingTop: () => 6,
  paddingBottom: () => 6,
};
