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

  const itemsHeader = [
    { text: "ردیف", style: "th", alignment: "right" },
    { text: "عنوان", style: "th", alignment: "right" },
    { text: "SKU", style: "th", alignment: "right" },
    { text: "تعداد", style: "th", alignment: "right" },
    { text: "قیمت واحد (تومان)", style: "th", alignment: "right" },
    { text: "تخفیف (تومان)", style: "th", alignment: "right" },
    { text: "جمع خط (تومان)", style: "th", alignment: "right" },
  ];
  const itemRows = payload.items.map((it, idx) => [
    { text: toFaDigits(idx + 1), alignment: "right" },
    { text: it.title || "—", alignment: "right" },
    { text: it.sku ? it.sku : "—", alignment: "right" },
    { text: fmtNum(it.quantity), alignment: "right" },
    { text: fmtNum(it.unit_price), alignment: "right" },
    { text: fmtNum(it.discount_amount), alignment: "right" },
    { text: fmtNum(it.line_total), alignment: "right", bold: true },
  ]);

  const docDefinition = {
    pageSize: "A4",
    pageMargins: [32, 40, 32, 50] as [number, number, number, number],
    defaultStyle: { font: "Vazirmatn", fontSize: 10, alignment: "right" as const },
    info: {
      title: `Quote ${payload.quote_number}`,
      author: "AFK",
      creator: "AFK",
    },
    content: [
      {
        columns: [
          { text: "پیش‌فاکتور فروش", style: "title", alignment: "right" },
          { text: `شماره: ${toFaDigits(payload.quote_number)}`, style: "subtitle", alignment: "left" },
        ],
        margin: [0, 0, 0, 8] as [number, number, number, number],
      },
      {
        canvas: [{ type: "line", x1: 0, y1: 0, x2: 530, y2: 0, lineWidth: 0.7, lineColor: "#cccccc" }],
        margin: [0, 0, 0, 10] as [number, number, number, number],
      },
      {
        columns: [
          {
            width: "50%",
            stack: [
              { text: "اطلاعات مشتری", style: "sectionTitle" },
              { text: `نام: ${payload.customer_name}` },
              { text: `تماس: ${toFaDigits(payload.customer_phone)}` },
            ],
          },
          {
            width: "50%",
            stack: [
              { text: "اطلاعات سند", style: "sectionTitle" },
              { text: `تاریخ صدور: ${fmtDateTime(payload.created_at)}` },
              { text: `اعتبار تا: ${fmtDate(payload.expires_at)}` },
              { text: `وضعیت: ${payload.status_label}` },
              { text: `فروشنده: ${payload.salesperson_name || "—"}` },
            ],
          },
        ],
        columnGap: 16,
        margin: [0, 0, 0, 12] as [number, number, number, number],
      },
      {
        text: "اقلام پیش‌فاکتور",
        style: "sectionTitle",
        margin: [0, 4, 0, 4] as [number, number, number, number],
      },
      {
        table: {
          headerRows: 1,
          widths: [22, "*", 60, 35, 70, 60, 70],
          body: [itemsHeader, ...itemRows],
        },
        layout: {
          fillColor: (rowIndex: number) => (rowIndex === 0 ? "#f3f4f6" : null),
          hLineColor: () => "#e5e7eb",
          vLineColor: () => "#e5e7eb",
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
        },
      },
      {
        margin: [0, 12, 0, 0] as [number, number, number, number],
        columns: [
          { width: "*", text: "" },
          {
            width: 240,
            table: {
              widths: ["*", "auto"],
              body: [
                [
                  { text: "جمع جزء", alignment: "right" },
                  { text: `${fmtNum(payload.subtotal_amount)} تومان`, alignment: "left" },
                ],
                [
                  { text: "تخفیف", alignment: "right" },
                  { text: `${fmtNum(payload.discount_amount)} تومان`, alignment: "left" },
                ],
                [
                  { text: "مبلغ نهایی", alignment: "right", bold: true, fontSize: 12 },
                  { text: `${fmtNum(payload.final_amount)} تومان`, alignment: "left", bold: true, fontSize: 12 },
                ],
              ],
            },
            layout: {
              hLineColor: () => "#e5e7eb",
              vLineColor: () => "#e5e7eb",
              hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
                i === 0 || i === node.table.body.length ? 0.5 : 0.3,
              vLineWidth: () => 0.3,
            },
          },
        ],
      },
      ...(payload.customer_note
        ? [
            {
              margin: [0, 14, 0, 0] as [number, number, number, number],
              stack: [
                { text: "یادداشت مشتری", style: "sectionTitle" },
                { text: payload.customer_note, alignment: "right" },
              ],
            },
          ]
        : []),
    ],
    footer: () => ({
      text: "این سند پیش‌فاکتور است و فاکتور رسمی محسوب نمی‌شود.",
      alignment: "center",
      fontSize: 8,
      color: "#6b7280",
      margin: [0, 14, 0, 0],
    }),
    styles: {
      title: { fontSize: 16, bold: true },
      subtitle: { fontSize: 11, color: "#374151" },
      sectionTitle: { fontSize: 11, bold: true, color: "#111827", margin: [0, 0, 0, 4] },
      th: { bold: true, fontSize: 10, color: "#111827" },
    },
  };

  pdfMake.createPdf(docDefinition).download(`quote-${payload.quote_number}.pdf`);
}
