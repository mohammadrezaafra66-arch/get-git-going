/**
 * Strict JSON OCR pipeline for Iranian bank receipts.
 * Primary path: vision JSON → Zod validate → ReceiptOcrResult → form mapping.
 * Free-text regex (parseReceiptText) is fallback only for legacy responses.
 */

import { z } from "zod";
import {
  EMPTY_EXTRACTION,
  normalizeDigits,
  type DocumentChannel,
  type ReceiptExtractionResult,
} from "@/lib/accounting/receipt-extraction";

export const RECEIPT_OCR_STATUSES = ["SUCCESS", "PENDING", "FAILED", "UNKNOWN"] as const;
export const RECEIPT_OCR_TRANSFER_METHODS = [
  "PAYA",
  "SATNA",
  "CARD_TO_CARD",
  "INTERNAL",
  "ACCOUNT_TO_ACCOUNT",
  "CASH_DEPOSIT",
  "OTHER",
  "UNKNOWN",
] as const;
export const RECEIPT_OCR_CURRENCIES = ["IRR", "TOMAN", "UNKNOWN"] as const;

export type ReceiptOcrStatus = (typeof RECEIPT_OCR_STATUSES)[number];
export type ReceiptOcrTransferMethod = (typeof RECEIPT_OCR_TRANSFER_METHODS)[number];
export type ReceiptOcrCurrency = (typeof RECEIPT_OCR_CURRENCIES)[number];

export type ReceiptOcrResult = {
  status: ReceiptOcrStatus;
  transfer_method: ReceiptOcrTransferMethod;
  amount: number | null;
  currency: ReceiptOcrCurrency;
  receipt_date: string;
  receipt_time: string;
  sender_name: string;
  receiver_name: string;
  source_bank: string;
  destination_bank: string;
  source_card: string;
  destination_card: string;
  source_account: string;
  destination_account: string;
  source_sheba: string;
  destination_sheba: string;
  tracking_number: string;
  reference_number: string;
  transaction_number: string;
  terminal_number: string;
  branch: string;
  description: string;
  confidence: number;
  needs_manual_review: boolean;
  missing_fields: string[];
  warnings: string[];
};

/** @deprecated Use ReceiptOcrResult — kept for callers that still import the old name. */
export type ReceiptStructuredExtraction = ReceiptOcrResult;

export const EMPTY_RECEIPT_OCR_RESULT: ReceiptOcrResult = {
  status: "UNKNOWN",
  transfer_method: "UNKNOWN",
  amount: null,
  currency: "UNKNOWN",
  receipt_date: "",
  receipt_time: "",
  sender_name: "",
  receiver_name: "",
  source_bank: "",
  destination_bank: "",
  source_card: "",
  destination_card: "",
  source_account: "",
  destination_account: "",
  source_sheba: "",
  destination_sheba: "",
  tracking_number: "",
  reference_number: "",
  transaction_number: "",
  terminal_number: "",
  branch: "",
  description: "",
  confidence: 0,
  needs_manual_review: true,
  missing_fields: [],
  warnings: [],
};

/** Normalize Persian/Arabic digits and Arabic ی/ک variants. */
export function normalizeOcrText(input: string): string {
  const digits = normalizeDigits(input);
  return digits.replace(/\u064A/g, "\u06CC").replace(/\u0643/g, "\u06A9");
}

function asRawString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return String(v).trim();
}

function parseAmountValue(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    if (v <= 0 || v > 1e14) return null;
    return v;
  }
  const cleaned = normalizeDigits(String(v)).replace(/[,،\s]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0 || n > 1e14) return null;
  // Long digit strings without separators are likely IDs, not amounts.
  if (/^\d{10,}$/.test(cleaned) && n > 1e10) return null;
  return n;
}

function normalizeCurrency(raw: string): ReceiptOcrCurrency {
  const t = normalizeOcrText(raw).toLowerCase().trim();
  if (!t) return "UNKNOWN";
  if (t === "irr" || t === "rial" || t.includes("ریال")) return "IRR";
  if (t === "toman" || t === "irt" || t.includes("تومان")) return "TOMAN";
  if (t === "unknown") return "UNKNOWN";
  return "UNKNOWN";
}

function normalizeStatus(raw: string): ReceiptOcrStatus {
  const t = normalizeOcrText(raw).trim();
  const upper = t.toUpperCase();
  if ((RECEIPT_OCR_STATUSES as readonly string[]).includes(upper)) {
    return upper as ReceiptOcrStatus;
  }
  const lower = t.toLowerCase();
  // Explicit non-final confirmation → not SUCCESS
  if (/قطعی\s*نیست|نهایی\s*نیست|تأیید\s*نهایی\s*نیست|تایید\s*نهایی\s*نیست|not\s*a\s*final/i.test(t)) {
    if (/در\s*حال|انتظار|ثبت\s*شد|پردازش/.test(t)) return "PENDING";
    return "UNKNOWN";
  }
  if (
    /ناموفق|رد\s*شد|لغو|خطا|برگشت\s*خورد|failed|failure|rejected|cancelled/i.test(t)
  ) {
    return "FAILED";
  }
  if (
    /در\s*حال\s*پردازش|در\s*انتظار|ثبت\s*شد|در\s*حال\s*انجام|در\s*انتظار\s*تأیید|در\s*انتظار\s*تایید|در\s*حال\s*بررسی|pending|processing/i.test(
      t,
    )
  ) {
    return "PENDING";
  }
  if (
    /تراکنش\s*موفق|انتقال\s*موفق|با\s*موفقیت|انجام\s*شد|\bموفق\b|success|successful/i.test(t)
  ) {
    return "SUCCESS";
  }
  if (lower.includes("pending")) return "PENDING";
  if (lower.includes("fail")) return "FAILED";
  if (lower.includes("success")) return "SUCCESS";
  return "UNKNOWN";
}

function normalizeTransferMethod(raw: string): ReceiptOcrTransferMethod {
  const t = normalizeOcrText(raw).trim();
  const upper = t.toUpperCase().replace(/[\s-]+/g, "_");
  if ((RECEIPT_OCR_TRANSFER_METHODS as readonly string[]).includes(upper)) {
    return upper as ReceiptOcrTransferMethod;
  }
  if (/پایا|paya/i.test(t)) return "PAYA";
  if (/ساتنا|satna/i.test(t)) return "SATNA";
  if (/کارت\s*به\s*کارت|کارت‌به‌کارت|card\s*to\s*card/i.test(t)) return "CARD_TO_CARD";
  if (/واریز\s*نقدی|نقدی|cash\s*deposit|\bcash\b/i.test(t)) return "CASH_DEPOSIT";
  if (/حساب\s*به\s*حساب|انتقال\s*وجه\s*حسابی|account\s*to\s*account/i.test(t)) {
    return "ACCOUNT_TO_ACCOUNT";
  }
  if (/انتقال\s*داخلی|درون\s*بانکی|internal/i.test(t)) return "INTERNAL";
  if (t) return "OTHER";
  return "UNKNOWN";
}

/** Normalize Solar Hijri or Gregorian date strings to YYYY/MM/DD when possible. */
export function normalizeReceiptDate(raw: string): string {
  const t = normalizeDigits(raw.trim()).replace(/[.\-]/g, "/");
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(t);
  if (!m) return "";
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return "";
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return "";
  // Accept Jalali 13xx/14xx or Gregorian 19xx/20xx
  if (!((y >= 1300 && y <= 1499) || (y >= 1900 && y <= 2100))) return "";
  return `${m[1]}/${String(mo).padStart(2, "0")}/${String(d).padStart(2, "0")}`;
}

/**
 * Normalize time to HH:mm (or HH:mm:ss if seconds present and valid).
 * Never invents a value; never uses "now".
 */
export function normalizeReceiptTime(raw: string): string {
  const t = normalizeDigits(raw.trim());
  if (!t) return "";
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t);
  if (!m) return "";
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = m[3] != null ? Number(m[3]) : null;
  if (hh > 23 || mm > 59) return "";
  if (ss != null && ss > 59) return "";
  const base = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  if (ss != null) return `${base}:${String(ss).padStart(2, "0")}`;
  return base;
}

/** HH:mm for HTML time inputs (drop seconds). */
export function toHtmlTimeValue(raw: string): string {
  const n = normalizeReceiptTime(raw);
  if (!n) return "";
  return n.slice(0, 5);
}

const ReceiptOcrZod = z
  .object({
    status: z.unknown().optional(),
    transfer_method: z.unknown().optional(),
    amount: z.unknown().optional().nullable(),
    currency: z.unknown().optional(),
    receipt_date: z.unknown().optional(),
    receipt_time: z.unknown().optional(),
    // Legacy aliases from older prompt
    date: z.unknown().optional(),
    time: z.unknown().optional(),
    sender_name: z.unknown().optional(),
    receiver_name: z.unknown().optional(),
    source_bank: z.unknown().optional(),
    destination_bank: z.unknown().optional(),
    source_card: z.unknown().optional(),
    destination_card: z.unknown().optional(),
    source_account: z.unknown().optional(),
    destination_account: z.unknown().optional(),
    source_sheba: z.unknown().optional(),
    destination_sheba: z.unknown().optional(),
    tracking_number: z.unknown().optional(),
    reference_number: z.unknown().optional(),
    transaction_number: z.unknown().optional(),
    terminal_number: z.unknown().optional(),
    branch: z.unknown().optional(),
    description: z.unknown().optional(),
    confidence: z.unknown().optional(),
    needs_manual_review: z.unknown().optional(),
    missing_fields: z.unknown().optional(),
    warnings: z.unknown().optional(),
  })
  .passthrough();

function asStringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => asRawString(x)).filter(Boolean);
}

function asConfidence(v: unknown): number {
  const n = typeof v === "number" ? v : Number(normalizeDigits(String(v ?? "")));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function asBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (v === "true" || v === 1 || v === "1") return true;
  if (v === "false" || v === 0 || v === "0") return false;
  return fallback;
}

/** Strip optional markdown fences and extract the first JSON object. */
export function extractJsonObjectText(raw: string): string {
  let body = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(body);
  if (fence) body = fence[1].trim();
  // Also strip leading/trailing fence fragments if model was sloppy
  body = body.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("JSON object not found in vision response");
  }
  return body.slice(start, end + 1);
}

/**
 * Parse + validate vision model JSON into ReceiptOcrResult.
 * Throws on malformed/unexpected shapes (caller should catch).
 */
export function parseReceiptOcrResponse(raw: string): ReceiptOcrResult {
  const obj = JSON.parse(extractJsonObjectText(raw)) as unknown;
  if (obj == null || typeof obj !== "object" || Array.isArray(obj)) {
    throw new Error("Vision response is not a JSON object");
  }
  const parsed = ReceiptOcrZod.parse(obj);
  const receiptDate = normalizeReceiptDate(
    asRawString(parsed.receipt_date || parsed.date || ""),
  );
  const receiptTime = normalizeReceiptTime(
    asRawString(parsed.receipt_time || parsed.time || ""),
  );
  // HTML/form use HH:mm — keep seconds only in internal if present; form maps via toHtmlTimeValue
  const amount = parseAmountValue(parsed.amount);
  const currency = normalizeCurrency(asRawString(parsed.currency ?? ""));
  const status = normalizeStatus(asRawString(parsed.status ?? ""));
  const transfer_method = normalizeTransferMethod(asRawString(parsed.transfer_method ?? ""));
  const confidence = asConfidence(parsed.confidence);
  const missing_fields = asStringList(parsed.missing_fields);
  const warnings = asStringList(parsed.warnings).map((w) => normalizeOcrText(w));

  const importantMissing: string[] = [];
  if (amount == null) importantMissing.push("amount");
  if (!receiptDate) importantMissing.push("receipt_date");
  if (!(asRawString(parsed.tracking_number) || asRawString(parsed.reference_number))) {
    importantMissing.push("tracking_number");
  }
  if (!asRawString(parsed.receiver_name)) importantMissing.push("receiver_name");
  if (transfer_method === "UNKNOWN") importantMissing.push("transfer_method");

  const needs_manual_review = asBool(
    parsed.needs_manual_review,
    confidence < 70 ||
      importantMissing.length > 0 ||
      currency === "UNKNOWN" ||
      status === "PENDING" ||
      status === "UNKNOWN",
  );

  return {
    status,
    transfer_method,
    amount,
    currency,
    receipt_date: receiptDate,
    receipt_time: receiptTime.slice(0, 5) || "", // store HH:mm for form/DB
    sender_name: normalizeOcrText(asRawString(parsed.sender_name)),
    receiver_name: normalizeOcrText(asRawString(parsed.receiver_name)),
    source_bank: normalizeOcrText(asRawString(parsed.source_bank)),
    destination_bank: normalizeOcrText(asRawString(parsed.destination_bank)),
    source_card: normalizeDigits(asRawString(parsed.source_card)).replace(/\s+/g, ""),
    destination_card: normalizeDigits(asRawString(parsed.destination_card)).replace(/\s+/g, ""),
    source_account: normalizeOcrText(asRawString(parsed.source_account)),
    destination_account: normalizeOcrText(asRawString(parsed.destination_account)),
    source_sheba: normalizeDigits(asRawString(parsed.source_sheba)).replace(/\s+/g, "").toUpperCase(),
    destination_sheba: normalizeDigits(asRawString(parsed.destination_sheba))
      .replace(/\s+/g, "")
      .toUpperCase(),
    tracking_number: normalizeDigits(asRawString(parsed.tracking_number)).replace(/\s+/g, ""),
    reference_number: normalizeDigits(asRawString(parsed.reference_number)).replace(/\s+/g, ""),
    transaction_number: normalizeOcrText(asRawString(parsed.transaction_number)),
    terminal_number: normalizeDigits(asRawString(parsed.terminal_number)).replace(/\s+/g, ""),
    branch: normalizeOcrText(asRawString(parsed.branch)),
    description: normalizeOcrText(asRawString(parsed.description)),
    confidence,
    needs_manual_review,
    missing_fields: Array.from(new Set([...missing_fields, ...importantMissing])),
    warnings,
  };
}

/** @deprecated Prefer parseReceiptOcrResponse */
export function parseReceiptVisionJson(raw: string): ReceiptOcrResult {
  return parseReceiptOcrResponse(raw);
}

/**
 * Convert printed amount + currency into toman at the form-mapping boundary.
 *
 * UNKNOWN is treated as IRR. Every Iranian bank receipt prints rial — there is no counter
 * example in this business — so refusing to convert when the model failed to read the unit
 * left the accountant with a raw rial figure in a toman field, which is worse than assuming
 * the only unit that occurs. The assumption is stated in the warning so it is never silent.
 *
 * This lives in the function rather than at either call site on purpose: both OCR consumers
 * (the ledger wizard via receipt-ocr-bytes.functions.ts:186 and the receipt page via
 * receipt-ocr.functions.ts:231) reach the form through this one call, so changing it here
 * covers both and leaves no way for the two to drift apart.
 */
export function amountToToman(
  amount: number | null,
  currency: ReceiptOcrCurrency | string,
): { value: number | null; warning: string | null; original_amount: number | null; original_currency: string } {
  const original_amount = amount;
  const original_currency = String(currency || "UNKNOWN");
  if (amount == null || !(amount > 0) || amount > 1e14) {
    return { value: null, warning: null, original_amount, original_currency };
  }
  const c =
    typeof currency === "string" && (RECEIPT_OCR_CURRENCIES as readonly string[]).includes(currency)
      ? (currency as ReceiptOcrCurrency)
      : normalizeCurrency(String(currency));

  if (c === "IRR" || c === "UNKNOWN") {
    const assumed = c === "UNKNOWN";
    if (amount % 10 !== 0) {
      return {
        value: null,
        warning: "مبلغ ریالی بر ۱۰ بخش‌پذیر نیست؛ تبدیل خودکار انجام نشد.",
        original_amount,
        original_currency,
      };
    }
    const value = amount / 10;
    if (!(value > 0) || value > 1e12) {
      return { value: null, warning: "مبلغ ریالی نامعتبر بود.", original_amount, original_currency };
    }
    return {
      value,
      warning: assumed
        ? "واحد روی فیش خوانده نشد؛ طبق قاعده ریال فرض و به تومان تبدیل شد. لطفاً مبلغ را کنترل کنید."
        : "مبلغ به ریال بود؛ برای فرم به تومان تبدیل شد.",
      original_amount,
      original_currency,
    };
  }
  // TOMAN
  const value = Math.round(amount);
  if (value > 1e12) {
    return { value: null, warning: "مبلغ خارج از محدوده مجاز است.", original_amount, original_currency };
  }
  return { value, warning: null, original_amount, original_currency };
}

export function mapTransferMethodToChannel(method: ReceiptOcrTransferMethod | string): DocumentChannel {
  switch (method) {
    case "PAYA":
      return "paya";
    case "SATNA":
      return "satna";
    case "CARD_TO_CARD":
      return "card_to_card";
    case "CASH_DEPOSIT":
      return "cash";
    case "INTERNAL":
    case "ACCOUNT_TO_ACCOUNT":
    case "OTHER":
      return "other";
    default:
      return "unknown";
  }
}

function buildLabeledRawText(s: ReceiptOcrResult, amountToman: number | null): string {
  const lines: string[] = [];
  if (s.status) lines.push(`وضعیت: ${s.status}`);
  if (s.transfer_method) lines.push(`روش انتقال: ${s.transfer_method}`);
  if (amountToman != null) lines.push(`مبلغ: ${amountToman} تومان`);
  else if (s.amount != null) lines.push(`مبلغ: ${s.amount} ${s.currency}`);
  if (s.receipt_date) lines.push(`تاریخ روی فیش: ${s.receipt_date}`);
  if (s.receipt_time) lines.push(`ساعت روی فیش: ${s.receipt_time}`);
  if (s.sender_name) lines.push(`واریزکننده: ${s.sender_name}`);
  if (s.receiver_name) lines.push(`گیرنده: ${s.receiver_name}`);
  if (s.source_bank) lines.push(`بانک مبدا: ${s.source_bank}`);
  if (s.destination_bank) lines.push(`بانک مقصد: ${s.destination_bank}`);
  if (s.source_account) lines.push(`حساب مبدا: ${s.source_account}`);
  if (s.destination_account) lines.push(`حساب مقصد: ${s.destination_account}`);
  if (s.tracking_number) lines.push(`شماره پیگیری: ${s.tracking_number}`);
  if (s.reference_number) lines.push(`شماره مرجع: ${s.reference_number}`);
  if (s.transaction_number) lines.push(`شماره تراکنش: ${s.transaction_number}`);
  if (s.description) lines.push(`توضیح: ${s.description}`);
  return lines.join("\n");
}

export const IMPORTANT_OCR_FIELDS = [
  "amount",
  "receipt_date",
  "tracking_number",
  "receiver_name",
  "transfer_method",
] as const;

export function buildManualReviewWarnings(ocr: ReceiptOcrResult): string[] {
  const out: string[] = [...ocr.warnings];
  if (ocr.confidence > 0 && ocr.confidence < 70) {
    out.push("اطمینان مدل پایین است؛ لطفاً همه فیلدها را بررسی کنید.");
  }
  if (ocr.needs_manual_review) {
    out.push("نیاز به بررسی دستی حسابدار.");
  }
  if (ocr.currency === "UNKNOWN") {
    out.push("واحد مبلغ نامشخص است.");
  }
  if (ocr.status === "PENDING" || ocr.status === "UNKNOWN") {
    out.push(`وضعیت تراکنش روی فیش: ${ocr.status} — نهایی فرض نشود.`);
  }
  if (ocr.missing_fields.length > 0) {
    out.push(`فیلدهای ناقص/نامطمئن: ${ocr.missing_fields.join("، ")}`);
  }
  return Array.from(new Set(out));
}

export function ocrResultToExtractionResult(
  ocr: ReceiptOcrResult,
  originalVisionText: string,
): ReceiptExtractionResult {
  const { value: amountToman, warning: amountWarning } = amountToToman(ocr.amount, ocr.currency);
  const warnings = buildManualReviewWarnings(ocr);
  if (amountWarning) warnings.unshift(amountWarning);

  const tracking = ocr.tracking_number || ocr.reference_number || "";
  const channel = mapTransferMethodToChannel(ocr.transfer_method);
  const detected = new Set<string>(["structured_json"]);
  if (channel !== "unknown") detected.add(channel);
  if (amountToman != null) detected.add("amount");
  if (tracking) detected.add("tracking_number");
  if (ocr.receipt_date) detected.add("date");
  if (ocr.receipt_time) detected.add("time");
  if (ocr.source_bank) detected.add(`source:${ocr.source_bank}`);
  if (ocr.destination_bank) detected.add(`destination:${ocr.destination_bank}`);
  if (ocr.sender_name) detected.add("payer_name");
  if (ocr.receiver_name) detected.add("receiver_name");
  if (ocr.status) detected.add(`status:${ocr.status}`);

  return {
    ...EMPTY_EXTRACTION,
    raw_text: buildLabeledRawText(ocr, amountToman) || originalVisionText,
    tracking_number: tracking || null,
    amount: amountToman,
    receipt_date: ocr.receipt_date || null,
    receipt_time: ocr.receipt_time || null,
    source_bank: ocr.source_bank || null,
    destination_bank: ocr.destination_bank || null,
    payer_name_on_receipt: ocr.sender_name || null,
    receiver_name_on_receipt: ocr.receiver_name || null,
    document_channel: channel,
    detected_keywords: Array.from(detected),
    warnings,
    structured: ocr,
  };
}

/** @deprecated Prefer ocrResultToExtractionResult */
export function structuredToExtractionResult(
  structured: ReceiptOcrResult,
  originalVisionText: string,
): ReceiptExtractionResult {
  return ocrResultToExtractionResult(structured, originalVisionText);
}

export type ParseReceiptOcrOutcome =
  | { ok: true; ocr: ReceiptOcrResult; extraction: ReceiptExtractionResult }
  | { ok: false; error: string; extraction: null };

/**
 * Safe primary parser: never throws to callers.
 * On failure, returns ok:false so UI can warn and leave fields empty.
 */
export function tryParseReceiptOcr(visionText: string): ParseReceiptOcrOutcome {
  try {
    const ocr = parseReceiptOcrResponse(visionText);
    return {
      ok: true,
      ocr,
      extraction: ocrResultToExtractionResult(ocr, visionText),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg, extraction: null };
  }
}

/** Try structured parse; on failure return null (caller may regex-fallback). */
export function tryStructuredExtraction(visionText: string): ReceiptExtractionResult | null {
  const r = tryParseReceiptOcr(visionText);
  return r.ok ? r.extraction : null;
}

/** Bank Tejarat sample fixture (deterministic unit tests — no live OCR). */
export const TEJARAT_SAMPLE_OCR_JSON = JSON.stringify({
  status: "PENDING",
  transfer_method: "PAYA",
  amount: 1000000000,
  currency: "IRR",
  receipt_date: "1405/04/23",
  receipt_time: "18:52",
  sender_name: "",
  receiver_name: "سحر شاهمرادی",
  source_bank: "بانک تجارت",
  destination_bank: "بانک کشاورزی",
  source_card: "",
  destination_card: "",
  source_account: "قرض الحسنه جاری - 0002113076065",
  destination_account: "",
  source_sheba: "",
  destination_sheba: "",
  tracking_number: "",
  reference_number: "000441889888",
  transaction_number: "PFT000148140403",
  terminal_number: "",
  branch: "",
  description: "در انتظار چرخه پایا",
  confidence: 88,
  needs_manual_review: true,
  missing_fields: ["sender_name"],
  warnings: ["رسید ممکن است تأیید نهایی پرداخت نباشد"],
});
