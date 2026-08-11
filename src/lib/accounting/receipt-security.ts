/**
 * Shared evaluator for payment-receipt security warnings.
 *
 * Aggregates checks based on the receipt's own fields plus optional
 * extracted OCR data (Phase 11.12+). Output is intentionally small and
 * stable so callers can render it, store it, or include it in audit diffs.
 */

import type { ReceiptExtractionResult } from "@/lib/accounting/receipt-extraction";

export type WarningSeverity = "low" | "medium" | "high";
export type WarningSource = "manual" | "ocr" | "both";

export interface ReceiptSecurityWarning {
  code: string;
  message: string;
  severity: WarningSeverity;
  source: WarningSource;
}

export interface ReceiptSecurityInput {
  payment_date?: string | null;
  tracking_number?: string | null;
  amount?: number | null;
  document_channel?: string | null;
  payer_name_on_receipt?: string | null;
  has_perforation?: boolean | null;
  is_typed_receipt?: boolean | null;
  is_mobile_bank_screenshot?: boolean | null;
  /** Optional OCR side. */
  extracted_data?: ReceiptExtractionResult | null;
  extraction_confidence?: number | null;
  /** Optional override for "today" — defaults to local-day ISO. */
  today?: string;
}

const SEVERITY_LABELS: Record<WarningSeverity, string> = {
  low: "کم",
  medium: "متوسط",
  high: "مهم",
};

export function severityLabel(s: WarningSeverity): string {
  return SEVERITY_LABELS[s];
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isBlank(s: string | null | undefined): boolean {
  return !s || s.trim().length === 0;
}

/** Evaluate all security warnings for a receipt + optional extraction. */
export function evaluateReceiptSecurityWarnings(
  input: ReceiptSecurityInput,
): ReceiptSecurityWarning[] {
  const warnings: ReceiptSecurityWarning[] = [];
  const today = input.today ?? todayIso();
  const ex = input.extracted_data ?? null;

  // --- Manual / receipt-field checks -----------------------------------------
  if (input.payment_date && input.payment_date !== today) {
    warnings.push({
      code: "date_not_today",
      message: "تاریخ فیش مربوط به امروز نیست.",
      severity: "medium",
      source: "manual",
    });
  }

  if (isBlank(input.tracking_number)) {
    warnings.push({
      code: "tracking_missing",
      message: "شماره پیگیری ثبت نشده است.",
      severity: "high",
      source: "manual",
    });
  }

  if (input.document_channel === "pol") {
    warnings.push({
      code: "channel_pol",
      message: "انتقال از طریق پل انجام شده است؛ نیازمند بررسی بیشتر.",
      severity: "high",
      source: "manual",
    });
  }

  if (isBlank(input.payer_name_on_receipt)) {
    warnings.push({
      code: "payer_name_missing",
      message: "نام واریزکننده روی فیش مشخص نیست.",
      severity: "medium",
      source: "manual",
    });
  }

  if (input.has_perforation === false) {
    warnings.push({
      code: "no_perforation",
      message: "فیش پرفراژ ندارد.",
      severity: "medium",
      source: "manual",
    });
  }

  if (input.is_typed_receipt === true) {
    warnings.push({
      code: "typed_receipt",
      message: "فیش تایپی است؛ نیازمند بررسی بیشتر.",
      severity: "high",
      source: "manual",
    });
  }

  // --- OCR-side checks -------------------------------------------------------
  if (ex) {
    if (input.extraction_confidence != null && input.extraction_confidence < 0.5) {
      warnings.push({
        code: "low_extraction_confidence",
        message: "اطمینان استخراج اطلاعات پایین است؛ بررسی دستی لازم است.",
        severity: "medium",
        source: "ocr",
      });
    }

    if (
      ex.amount != null &&
      input.amount != null &&
      Math.abs(Number(ex.amount) - Number(input.amount)) > 0.001
    ) {
      warnings.push({
        code: "amount_mismatch",
        message: "مبلغ استخراج‌شده با مبلغ ثبت‌شده متفاوت است.",
        severity: "high",
        source: "ocr",
      });
    }

    if (
      ex.tracking_number &&
      !isBlank(input.tracking_number) &&
      ex.tracking_number.trim() !== (input.tracking_number ?? "").trim()
    ) {
      warnings.push({
        code: "tracking_mismatch",
        message: "شماره پیگیری استخراج‌شده با شماره پیگیری ثبت‌شده متفاوت است.",
        severity: "high",
        source: "ocr",
      });
    }

    if (
      ex.receipt_date &&
      input.payment_date &&
      ex.receipt_date.trim() !== input.payment_date.trim()
    ) {
      warnings.push({
        code: "date_mismatch",
        message: "تاریخ استخراج‌شده با تاریخ ثبت‌شده متفاوت است.",
        severity: "medium",
        source: "ocr",
      });
    }
  }

  return warnings;
}

/** Back-compat helper: messages only (used by older form code). */
export function evaluateReceiptSecurityMessages(input: ReceiptSecurityInput): string[] {
  return evaluateReceiptSecurityWarnings(input).map((w) => w.message);
}
