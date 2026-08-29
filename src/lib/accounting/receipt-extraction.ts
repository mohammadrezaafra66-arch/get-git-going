/**
 * Payment Receipt — Stage 1 extraction (text-only).
 *
 * Stage 1 supports plain-text inputs (text/plain). For images and PDFs the
 * pipeline runs but produces no extracted fields and is marked as
 * "needs_review", because no built-in OCR/PDF text capability is wired into
 * the project yet (no tesseract / pdfjs / vision-AI gateway). When such a
 * provider is added later, only `extractRawText` needs to learn new branches.
 */

export type DocumentChannel =
  | "card_to_card"
  | "paya"
  | "pol"
  | "satna"
  | "cash"
  | "other"
  | "unknown";

/** Re-export canonical structured OCR type (strict JSON schema). */
export type { ReceiptOcrResult as ReceiptStructuredExtraction } from "@/lib/accounting/receipt-ocr-structured";
import type { ReceiptOcrResult } from "@/lib/accounting/receipt-ocr-structured";

export interface ReceiptExtractionResult {
  raw_text: string;
  tracking_number: string | null;
  amount: number | null;
  receipt_date: string | null;
  receipt_time: string | null;
  source_bank: string | null;
  destination_bank: string | null;
  payer_name_on_receipt: string | null;
  receiver_name_on_receipt: string | null;
  document_channel: DocumentChannel;
  detected_keywords: string[];
  warnings: string[];
  /** Full vision JSON when structured OCR succeeded. */
  structured?: ReceiptOcrResult | null;
}

export const EMPTY_EXTRACTION: ReceiptExtractionResult = {
  raw_text: "",
  tracking_number: null,
  amount: null,
  receipt_date: null,
  receipt_time: null,
  source_bank: null,
  destination_bank: null,
  payer_name_on_receipt: null,
  receiver_name_on_receipt: null,
  document_channel: "unknown",
  detected_keywords: [],
  warnings: [],
};

/** Map Persian/Arabic-Indic digits to ASCII so regex can match numbers. */
export function normalizeDigits(input: string): string {
  const fa = "۰۱۲۳۴۵۶۷۸۹";
  const ar = "٠١٢٣٤٥٦٧٨٩";
  return input.replace(/[۰-۹٠-٩]/g, (d) => {
    const i = fa.indexOf(d);
    if (i !== -1) return String(i);
    return String(ar.indexOf(d));
  });
}

/** Common Iranian banks — name → canonical Persian label. */
const BANK_KEYWORDS: Array<{ keys: string[]; label: string }> = [
  { keys: ["ملی"], label: "بانک ملی" },
  { keys: ["ملت"], label: "بانک ملت" },
  { keys: ["صادرات"], label: "بانک صادرات" },
  { keys: ["تجارت"], label: "بانک تجارت" },
  { keys: ["سپه"], label: "بانک سپه" },
  { keys: ["پاسارگاد"], label: "بانک پاسارگاد" },
  { keys: ["پارسیان"], label: "بانک پارسیان" },
  { keys: ["سامان"], label: "بانک سامان" },
  { keys: ["اقتصاد نوین", "اقتصادنوین"], label: "بانک اقتصاد نوین" },
  { keys: ["سینا"], label: "بانک سینا" },
  { keys: ["شهر"], label: "بانک شهر" },
  { keys: ["دی"], label: "بانک دی" },
  { keys: ["آینده"], label: "بانک آینده" },
  { keys: ["انصار"], label: "بانک انصار" },
  { keys: ["رفاه"], label: "بانک رفاه" },
  { keys: ["کشاورزی"], label: "بانک کشاورزی" },
  { keys: ["مسکن"], label: "بانک مسکن" },
  { keys: ["پست بانک", "پست‌بانک"], label: "پست بانک" },
  { keys: ["گردشگری"], label: "بانک گردشگری" },
  { keys: ["کارآفرین"], label: "بانک کارآفرین" },
  { keys: ["سرمایه"], label: "بانک سرمایه" },
  { keys: ["خاورمیانه"], label: "بانک خاورمیانه" },
  { keys: ["قرض الحسنه مهر", "مهر ایران"], label: "بانک قرض‌الحسنه مهر ایران" },
  { keys: ["رسالت"], label: "بانک رسالت" },
];

const CHANNEL_PATTERNS: Array<{ re: RegExp; channel: DocumentChannel; kw: string }> = [
  { re: /کارت\s*به\s*کارت/i, channel: "card_to_card", kw: "کارت به کارت" },
  { re: /\bپایا\b|paya/i, channel: "paya", kw: "پایا" },
  { re: /\bساتنا\b|satna/i, channel: "satna", kw: "ساتنا" },
  { re: /\bپل\b|\bpol\b/i, channel: "pol", kw: "پل" },
  { re: /نقدی|نقد|cash/i, channel: "cash", kw: "نقدی" },
];

/** Extract raw text from a Blob. Stage 1: text/plain only. */
export async function extractRawText(
  blob: Blob,
  mime: string,
): Promise<{ text: string; warnings: string[] }> {
  const warnings: string[] = [];
  const lower = (mime || "").toLowerCase();

  if (lower === "text/plain" || lower.startsWith("text/")) {
    const text = await blob.text();
    return { text, warnings };
  }

  if (lower.startsWith("image/")) {
    warnings.push("موتور OCR تصویری هنوز فعال نیست؛ متن استخراج نشد.");
    return { text: "", warnings };
  }

  if (lower === "application/pdf") {
    warnings.push("موتور استخراج متن PDF هنوز فعال نیست؛ متن استخراج نشد.");
    return { text: "", warnings };
  }

  warnings.push("نوع فایل پشتیبانی نمی‌شود.");
  return { text: "", warnings };
}

function findFirst(re: RegExp, text: string): string | null {
  const m = re.exec(text);
  if (!m) return null;
  return (m[1] ?? m[0]).trim();
}

/**
 * A card / account / IBAN / tracking number must never be read as an amount. Length alone is
 * the wrong test for that, and it used to be the only one: separators were stripped first and
 * then any 10-or-more-digit result was discarded, so every receipt of 1,000,000,000 rial —
 * 100,000,000 toman — came back empty with no error and no warning. The ceiling on a real
 * amount was effectively 999,999,999 rial.
 *
 * What actually separates the two is how the number is written, not how long it is:
 *   - an amount is printed with thousands separators, in three-digit groups;
 *   - an identifier is printed as a bare run of digits, or grouped in fours.
 * An Iranian card number is exactly 16 digits, which is a shape rather than a length.
 */
function looksLikeIdentifier(raw: string, cleaned: string): boolean {
  // Exactly 16 digits is a card number whether or not it carries separators.
  if (/^\d{16}$/.test(cleaned)) return true;
  // Grouped in fours (6037-9911-1234-5678 / 6037 9911 1234 5678) is card formatting.
  if (/^\d{4}([-\s]\d{4}){2,}$/.test(normalizeDigits(raw).trim())) return true;
  // A bare run of 10+ digits with no thousands separator at all: tracking/account/IBAN tail.
  const hasThousandsGrouping = /\d{1,3}([,،]\d{3})+/.test(normalizeDigits(raw));
  if (!hasThousandsGrouping && cleaned.length >= 10) return true;
  return false;
}

function parseAmountToNumber(s: string): number | null {
  const cleaned = normalizeDigits(s).replace(/[,،\s]/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (looksLikeIdentifier(s, cleaned)) return null;
  // سقف منطقی: ۱۰۰۰ میلیارد تومان (۱e12). بیشتر از این قطعاً مبلغ نیست.
  if (n > 1e12) return null;
  return n;
}

/** Parse normalized text into receipt fields. */
export function parseReceiptText(rawText: string): ReceiptExtractionResult {
  const result: ReceiptExtractionResult = {
    ...EMPTY_EXTRACTION,
    raw_text: rawText,
    detected_keywords: [],
    warnings: [],
  };
  if (!rawText.trim()) return result;

  const text = normalizeDigits(rawText);
  const detected = new Set<string>();

  // Tracking number
  const trackingPatterns = [
    /(?:شماره\s*پیگیری|کد\s*پیگیری|کد\s*رهگیری|شماره\s*رهگیری|شناسه\s*پیگیری|پیگیری)\s*[:#\-]?\s*([0-9]{4,30})/i,
    /\bref(?:erence)?\s*[:#\-]?\s*([0-9A-Za-z]{4,30})/i,
    /\btracking\s*[:#\-]?\s*([0-9A-Za-z]{4,30})/i,
  ];
  for (const p of trackingPatterns) {
    const v = findFirst(p, text);
    if (v) {
      result.tracking_number = v;
      detected.add("tracking_number");
      break;
    }
  }

  // Amount: فقط با لیبل صریح «مبلغ/amount» یا واحد صریح «ریال/تومان» قبول می‌شود.
  // عدد تنها بدون قرینه قبول نمی‌شود (جلوگیری از خواندن شماره کارت/حساب به‌عنوان مبلغ).
  // برای جلوگیری از تداخل، خطوطی که شامل کلیدواژه‌های زیر هستند نادیده گرفته می‌شوند.
  const NON_AMOUNT_HINT =
    /(شماره\s*کارت|شماره\s*حساب|شبا|iban|sheba|card|شناسه\s*پرداخت|کد\s*پیگیری|شماره\s*پیگیری|reference|tracking)/i;

  // واحد را هم capture می‌کنیم تا اگر روی فیش «ریال» بود، مثل شاخهٔ fallback به تومان تبدیل شود.
  const amountLabeledMatch =
    /(?:مبلغ\s*تراکنش|مبلغ\s*واریزی|مبلغ\s*انتقال|مبلغ|amount)\s*[:#\-]?\s*([0-9][0-9,،\s]{2,20})\s*(ریال|تومان|rial|toman)?/i.exec(
      text,
    );
  if (amountLabeledMatch) {
    const n = parseAmountToNumber(amountLabeledMatch[1]);
    if (n) {
      const unit = (amountLabeledMatch[2] ?? "").toLowerCase();
      const isRial = unit === "ریال" || unit === "rial";
      const value = isRial ? Math.round(n / 10) : n;
      if (value > 0) {
        result.amount = value;
        detected.add("amount");
        if (isRial) result.warnings.push("مبلغ به ریال بود؛ به تومان تبدیل شد.");
      }
    }
  }
  if (result.amount == null) {
    // عدد + واحد. ابتدا بررسی می‌کنیم که در همان خط hint مزاحم نباشد.
    const lines = text.split(/\n+/);
    for (const line of lines) {
      if (NON_AMOUNT_HINT.test(line)) continue;
      const m = /([0-9][0-9,،\s]{4,20})\s*(ریال|تومان|rial|toman)/i.exec(line);
      if (!m) continue;
      const n = parseAmountToNumber(m[1]);
      if (n) {
        const unit = m[2].toLowerCase();
        const isRial = unit === "ریال" || unit === "rial";
        const value = isRial ? Math.round(n / 10) : n;
        if (value > 0 && value <= 1e12) {
          result.amount = value;
          detected.add("amount");
          if (isRial) result.warnings.push("مبلغ به ریال بود؛ به تومان تبدیل شد.");
          break;
        }
      }
    }
  }

  // Date — Jalali (1300–1499) or Gregorian (19xx–20xx) with /, -, .
  const dateJalali =
    findFirst(
      /(?:تاریخ|تاريخ|date)\s*[:#\-]?\s*(1[3-4][0-9]{2}[\/\-.][0-1]?[0-9][\/\-.][0-3]?[0-9])/i,
      text,
    ) || findFirst(/\b(1[3-4][0-9]{2}[\/\-.][0-1]?[0-9][\/\-.][0-3]?[0-9])\b/, text);
  const dateGreg = findFirst(/\b((?:19|20)[0-9]{2}[\/\-.][0-1]?[0-9][\/\-.][0-3]?[0-9])\b/, text);
  if (dateJalali) {
    result.receipt_date = dateJalali;
    detected.add("date");
  } else if (dateGreg) {
    result.receipt_date = dateGreg;
    detected.add("date");
  }

  // Time
  const time =
    findFirst(/(?:ساعت|زمان|time)\s*[:#\-]?\s*([0-2]?[0-9]:[0-5][0-9](?::[0-5][0-9])?)/i, text) ||
    findFirst(/\b([0-2]?[0-9]:[0-5][0-9](?::[0-5][0-9])?)\b/, text);
  if (time) {
    result.receipt_time = time;
    detected.add("time");
  }

  // Channel
  for (const cp of CHANNEL_PATTERNS) {
    if (cp.re.test(text)) {
      result.document_channel = cp.channel;
      detected.add(cp.kw);
      break;
    }
  }

  // Banks — try labeled "از/مبدا" and "به/مقصد" lines first
  const sourceLine = findFirst(
    /(?:بانک\s*مبدا|مبدا|از\s*بانک|از)\s*[:\-]?\s*([^\n,،]{2,60})/i,
    text,
  );
  const destLine = findFirst(/(?:بانک\s*مقصد|مقصد|به\s*بانک|به)\s*[:\-]?\s*([^\n,،]{2,60})/i, text);
  for (const bk of BANK_KEYWORDS) {
    for (const k of bk.keys) {
      if (sourceLine && sourceLine.includes(k) && !result.source_bank) {
        result.source_bank = bk.label;
        detected.add(`source:${bk.label}`);
      }
      if (destLine && destLine.includes(k) && !result.destination_bank) {
        result.destination_bank = bk.label;
        detected.add(`destination:${bk.label}`);
      }
    }
  }
  // If we couldn't disambiguate, record any bank seen anywhere in text
  if (!result.source_bank && !result.destination_bank) {
    for (const bk of BANK_KEYWORDS) {
      for (const k of bk.keys) {
        if (text.includes(k)) {
          detected.add(`bank_seen:${bk.label}`);
          // Don't claim source/destination ambiguously.
          break;
        }
      }
    }
  }

  // Names — labeled only (avoid noisy guesses)
  const payer = findFirst(
    /(?:نام\s*پرداخت\s*کننده|پرداخت\s*کننده|واریز\s*کننده|فرستنده)\s*[:\-]?\s*([^\n,،]{2,60})/i,
    text,
  );
  if (payer) {
    result.payer_name_on_receipt = payer;
    detected.add("payer_name");
  }
  const receiver = findFirst(
    /(?:نام\s*گیرنده|گیرنده|دریافت\s*کننده|واریز\s*به)\s*[:\-]?\s*([^\n,،]{2,60})/i,
    text,
  );
  if (receiver) {
    result.receiver_name_on_receipt = receiver;
    detected.add("receiver_name");
  }

  result.detected_keywords = Array.from(detected);
  return result;
}

/** Compute extraction confidence in [0, 1] from detected fields. */
export function scoreExtraction(r: ReceiptExtractionResult): number {
  let s = 0;
  if (r.tracking_number) s += 0.2;
  if (r.amount != null) s += 0.2;
  if (r.receipt_date) s += 0.15;
  if (r.receipt_time) s += 0.1;
  if (r.source_bank || r.destination_bank) s += 0.15;
  if (r.payer_name_on_receipt || r.receiver_name_on_receipt) s += 0.1;
  return Math.min(1, Math.round(s * 100) / 100);
}

/** Decide extraction status from the parsed result. */
export function decideStatus(
  r: ReceiptExtractionResult,
  hasRawText: boolean,
): "extracted" | "needs_review" | "failed" {
  const importantHits =
    (r.tracking_number ? 1 : 0) + (r.amount != null ? 1 : 0) + (r.receipt_date ? 1 : 0);
  if (!hasRawText) return "needs_review";
  if (importantHits >= 2) return "extracted";
  return "needs_review";
}
