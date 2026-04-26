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
// Money amounts must be LTR-safe English digits with comma grouping.
// Do not apply Persian digit conversion here — mixing RTL digits with
// commas and currency labels causes visual reordering in PDF viewers.
function formatMoneyPdf(n: number): string {
  const safe = Number.isFinite(n) ? n : 0;
  return Math.round(safe).toLocaleString("en-US");
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

  // Natural Persian column order, all right-aligned for visual consistency.
  // No reversal tricks — column meaning matches header text directly.
  const itemsHeader = [
    { text: "ردیف", style: "th" },
    { text: "عنوان کالا", style: "th" },
    { text: "SKU", style: "th" },
    { text: "تعداد", style: "th" },
    { text: "قیمت واحد (تومان)", style: "th" },
    { text: "تخفیف (تومان)", style: "th" },
    { text: "جمع خط (تومان)", style: "th" },
  ];
  const itemRows = payload.items.map((it, idx) => [
    { text: toFaDigits(idx + 1), style: "td" },
    { text: it.title || "—", style: "td" },
    { text: it.sku ? it.sku : "—", style: "tdSku" },
    { text: fmtNum(it.quantity), style: "td" },
    { text: formatMoneyPdf(it.unit_price), style: "tdMoney" },
    { text: formatMoneyPdf(it.discount_amount), style: "tdMoney" },
    { text: formatMoneyPdf(it.line_total), style: "tdMoneyStrong" },
  ]);

  const infoLine = (label: string, value: string) => ({
    text: [
      { text: `${label}: `, bold: true, color: "#374151" },
      { text: value },
    ],
    margin: [0, 0, 0, 3] as [number, number, number, number],
  });

  const docDefinition = {
    pageSize: "A4",
    pageMargins: [36, 40, 36, 50] as [number, number, number, number],
    defaultStyle: {
      font: "Vazirmatn",
      fontSize: 10,
      alignment: "right" as const,
      lineHeight: 1.3,
    },
    info: {
      title: `Quote ${payload.quote_number}`,
      author: "AFK",
      creator: "AFK",
    },
    content: [
      // Title
      { text: "پیش‌فاکتور فروش", style: "title" },
      // Quote number
      {
        text: [
          { text: "شماره پیش‌فاکتور: ", bold: true, color: "#374151" },
          { text: toFaDigits(payload.quote_number) },
        ],
        margin: [0, 4, 0, 8] as [number, number, number, number],
      },
      // Divider
      {
        canvas: [{ type: "line", x1: 0, y1: 0, x2: 523, y2: 0, lineWidth: 0.6, lineColor: "#d1d5db" }],
        margin: [0, 0, 0, 10] as [number, number, number, number],
      },
      // Stacked info section (no two-column layout to avoid RTL issues)
      { text: "اطلاعات مشتری", style: "sectionTitle" },
      infoLine("نام مشتری", payload.customer_name || "—"),
      infoLine("شماره تماس", toFaDigits(payload.customer_phone || "—")),

      { text: "اطلاعات سند", style: "sectionTitle", margin: [0, 8, 0, 4] as [number, number, number, number] },
      infoLine("فروشنده", payload.salesperson_name || "—"),
      infoLine("تاریخ صدور", fmtDateTime(payload.created_at)),
      infoLine("اعتبار تا", fmtDate(payload.expires_at)),
      infoLine("وضعیت", payload.status_label),

      // Items table
      { text: "اقلام پیش‌فاکتور", style: "sectionTitle", margin: [0, 12, 0, 6] as [number, number, number, number] },
      {
        table: {
          headerRows: 1,
          dontBreakRows: true,
          // Total ≈ 523pt content width (A4 595 − 36*2 margins).
          // 26 + * + 70 + 36 + 80 + 65 + 80 = 357 + flexible "*" for title.
          widths: [26, "*", 70, 36, 80, 65, 80],
          body: [itemsHeader, ...itemRows],
        },
        layout: {
          fillColor: (rowIndex: number) => (rowIndex === 0 ? "#f3f4f6" : null),
          hLineColor: () => "#d1d5db",
          vLineColor: () => "#d1d5db",
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          paddingLeft: () => 5,
          paddingRight: () => 5,
          paddingTop: () => 5,
          paddingBottom: () => 5,
        },
      },

      // Totals box — full-width simple table, all right-aligned, final row strong
      {
        margin: [0, 14, 0, 0] as [number, number, number, number],
        table: {
          widths: ["*", 110, 30],
          body: [
            [
              { text: "جمع جزء", style: "totalLabel" },
              { text: formatMoneyPdf(payload.subtotal_amount), style: "totalValue" },
              { text: "تومان", style: "totalCurrency" },
            ],
            [
              { text: "تخفیف", style: "totalLabel" },
              { text: formatMoneyPdf(payload.discount_amount), style: "totalValue" },
              { text: "تومان", style: "totalCurrency" },
            ],
            [
              { text: "مبلغ نهایی قابل پرداخت", style: "grandLabel" },
              { text: formatMoneyPdf(payload.final_amount), style: "grandValue" },
              { text: "تومان", style: "grandCurrency" },
            ],
          ],
        },
        layout: {
          fillColor: (rowIndex: number, node: { table: { body: unknown[] } }) =>
            rowIndex === node.table.body.length - 1 ? "#f3f4f6" : null,
          hLineColor: () => "#d1d5db",
          vLineColor: () => "#d1d5db",
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          paddingLeft: () => 8,
          paddingRight: () => 8,
          paddingTop: () => 6,
          paddingBottom: () => 6,
        },
      },

      ...(payload.customer_note
        ? [
            { text: "یادداشت مشتری", style: "sectionTitle", margin: [0, 14, 0, 4] as [number, number, number, number] },
            { text: payload.customer_note },
          ]
        : []),
    ],
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        {
          text: `صفحه ${toFaDigits(currentPage)} از ${toFaDigits(pageCount)}`,
          alignment: "right",
          fontSize: 8,
          color: "#6b7280",
          margin: [36, 14, 0, 0],
        },
        {
          text: "این سند پیش‌فاکتور است و فاکتور رسمی محسوب نمی‌شود.",
          alignment: "right",
          fontSize: 8,
          color: "#6b7280",
          margin: [0, 14, 36, 0],
        },
      ],
    }),
    styles: {
      title: { fontSize: 16, bold: true, color: "#111827" },
      sectionTitle: {
        fontSize: 11,
        bold: true,
        color: "#111827",
        margin: [0, 0, 0, 4] as [number, number, number, number],
      },
      th: { bold: true, fontSize: 10, color: "#111827", alignment: "right" as const },
      td: { fontSize: 10, color: "#111827", alignment: "right" as const },
      tdSku: { fontSize: 9, color: "#374151", alignment: "right" as const },
      tdStrong: { fontSize: 10, bold: true, color: "#111827", alignment: "right" as const },
      tdMoney: { fontSize: 10, color: "#111827", alignment: "left" as const },
      tdMoneyStrong: { fontSize: 10, bold: true, color: "#111827", alignment: "left" as const },
      totalLabel: { fontSize: 10, color: "#374151", alignment: "right" as const },
      totalValue: { fontSize: 10, bold: true, color: "#111827", alignment: "left" as const },
      totalCurrency: { fontSize: 10, color: "#374151", alignment: "right" as const },
      grandLabel: { fontSize: 12, bold: true, color: "#111827", alignment: "right" as const },
      grandValue: { fontSize: 13, bold: true, color: "#111827", alignment: "left" as const },
      grandCurrency: { fontSize: 11, bold: true, color: "#111827", alignment: "right" as const },
    },
  };

  pdfMake.createPdf(docDefinition).download(`quote-${payload.quote_number}.pdf`);
}
