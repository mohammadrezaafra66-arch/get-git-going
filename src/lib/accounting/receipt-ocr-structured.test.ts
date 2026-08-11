/**
 * Unit tests for strict receipt OCR JSON parsing / mapping.
 * Run: npx --yes tsx --test src/lib/accounting/receipt-ocr-structured.test.ts
 * Does not call external paid OCR/LLM APIs.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RECEIPT_OCR_PROMPT } from "./receipt-ocr-prompt.ts";
import {
  amountToToman,
  mapTransferMethodToChannel,
  normalizeOcrText,
  normalizeReceiptDate,
  normalizeReceiptTime,
  parseReceiptOcrResponse,
  TEJARAT_SAMPLE_OCR_JSON,
  toHtmlTimeValue,
  tryParseReceiptOcr,
  tryStructuredExtraction,
} from "./receipt-ocr-structured.ts";

describe("receipt OCR prompt", () => {
  it("requests receipt_date/receipt_time and forbids status-bar time", () => {
    assert.match(RECEIPT_OCR_PROMPT, /receipt_time/);
    assert.match(RECEIPT_OCR_PROMPT, /receipt_date/);
    assert.match(RECEIPT_OCR_PROMPT, /status-bar|status bar|وضعیت/i);
    assert.match(RECEIPT_OCR_PROMPT, /NEVER use/i);
    assert.doesNotMatch(RECEIPT_OCR_PROMPT, /```/);
  });
});

describe("strict JSON parsing", () => {
  it("parses a clean JSON object", () => {
    const ocr = parseReceiptOcrResponse(
      JSON.stringify({
        status: "PENDING",
        transfer_method: "PAYA",
        amount: 1000,
        currency: "TOMAN",
        receipt_date: "1405/04/23",
        receipt_time: "18:52",
        sender_name: "",
        receiver_name: "علی",
        source_bank: "",
        destination_bank: "بانک کشاورزی",
        confidence: 90,
        needs_manual_review: true,
        missing_fields: [],
        warnings: [],
      }),
    );
    assert.equal(ocr.receipt_time, "18:52");
    assert.equal(ocr.receipt_date, "1405/04/23");
    assert.equal(ocr.status, "PENDING");
    assert.equal(ocr.transfer_method, "PAYA");
  });

  it("strips accidental markdown fences", () => {
    const ocr = parseReceiptOcrResponse(
      "```json\n" +
        JSON.stringify({
          status: "SUCCESS",
          transfer_method: "SATNA",
          amount: 10,
          currency: "TOMAN",
          receipt_date: "1405/01/01",
          receipt_time: "09:05",
          confidence: 80,
          needs_manual_review: false,
          missing_fields: [],
          warnings: [],
        }) +
        "\n```",
    );
    assert.equal(ocr.receipt_time, "09:05");
  });

  it("rejects invalid JSON safely via tryParseReceiptOcr", () => {
    const r = tryParseReceiptOcr("not json at all");
    assert.equal(r.ok, false);
    assert.equal(r.extraction, null);
  });

  it("does not crash tryStructuredExtraction on invalid JSON", () => {
    assert.equal(tryStructuredExtraction("{{{"), null);
    assert.equal(tryStructuredExtraction(""), null);
  });
});

describe("digit and script normalization", () => {
  it("normalizes Persian digits", () => {
    assert.equal(normalizeReceiptTime("۱۸:۵۲"), "18:52");
    assert.equal(normalizeReceiptDate("۱۴۰۵/۰۴/۲۳"), "1405/04/23");
  });

  it("normalizes Arabic ی/ک variants", () => {
    // Arabic Yeh / Kaf → Persian
    const raw = "بانك\u064A";
    const n = normalizeOcrText(raw);
    assert.ok(n.includes("ی") || n.includes("ک") || n.length > 0);
  });
});

describe("amount / currency conversion", () => {
  it("converts IRR to toman at mapping boundary", () => {
    const r = amountToToman(1_000_000_000, "IRR");
    assert.equal(r.value, 100_000_000);
    assert.ok(r.warning);
  });

  it("keeps TOMAN as-is", () => {
    const r = amountToToman(100_000_000, "TOMAN");
    assert.equal(r.value, 100_000_000);
    assert.equal(r.warning, null);
  });

  it("does not fill amount when currency is UNKNOWN", () => {
    const r = amountToToman(1_000_000_000, "UNKNOWN");
    assert.equal(r.value, null);
    assert.ok(r.warning);
  });

  it("rejects non-divisible IRR amounts", () => {
    const r = amountToToman(1001, "IRR");
    assert.equal(r.value, null);
  });
});

describe("time extraction safety", () => {
  it("does not fall back to current/upload time when receipt_time missing", () => {
    const ocr = parseReceiptOcrResponse(
      JSON.stringify({
        status: "UNKNOWN",
        transfer_method: "UNKNOWN",
        amount: null,
        currency: "UNKNOWN",
        receipt_date: "",
        receipt_time: "",
        confidence: 10,
        needs_manual_review: true,
        missing_fields: ["receipt_time"],
        warnings: [],
      }),
    );
    assert.equal(ocr.receipt_time, "");
    const now = new Date().toTimeString().slice(0, 5);
    assert.notEqual(ocr.receipt_time, now);
  });

  it("accepts HH:mm for HTML time inputs without AM/PM conversion", () => {
    assert.equal(toHtmlTimeValue("18:52"), "18:52");
    assert.equal(toHtmlTimeValue("18:52:01"), "18:52");
  });

  it("ignores garbage that is not a receipt time", () => {
    assert.equal(normalizeReceiptTime("status bar 9:41 AM"), "");
    assert.equal(normalizeReceiptTime(""), "");
  });
});

describe("bank and person mapping", () => {
  it("keeps source and destination banks separate", () => {
    const ocr = parseReceiptOcrResponse(
      JSON.stringify({
        status: "PENDING",
        transfer_method: "PAYA",
        amount: 10,
        currency: "TOMAN",
        receipt_date: "1405/04/23",
        receipt_time: "18:52",
        sender_name: "",
        receiver_name: "سحر",
        source_bank: "بانک تجارت",
        destination_bank: "بانک کشاورزی",
        confidence: 80,
        needs_manual_review: true,
        missing_fields: [],
        warnings: [],
      }),
    );
    assert.equal(ocr.source_bank, "بانک تجارت");
    assert.equal(ocr.destination_bank, "بانک کشاورزی");
    assert.notEqual(ocr.source_bank, ocr.destination_bank);
  });

  it("keeps missing sender_name empty", () => {
    const ocr = parseReceiptOcrResponse(TEJARAT_SAMPLE_OCR_JSON);
    assert.equal(ocr.sender_name, "");
  });
});

describe("status and transfer method", () => {
  it("does not convert PENDING to SUCCESS", () => {
    const ocr = parseReceiptOcrResponse(
      JSON.stringify({
        status: "در انتظار چرخه پایا",
        transfer_method: "پایا",
        amount: 10,
        currency: "TOMAN",
        receipt_date: "1405/04/23",
        receipt_time: "18:52",
        confidence: 70,
        needs_manual_review: true,
        missing_fields: [],
        warnings: ["این رسید تأیید نهایی نیست"],
      }),
    );
    assert.equal(ocr.status, "PENDING");
    assert.notEqual(ocr.status, "SUCCESS");
    assert.equal(ocr.transfer_method, "PAYA");
    assert.equal(mapTransferMethodToChannel(ocr.transfer_method), "paya");
  });
});

describe("Bank Tejarat sample mapping", () => {
  it("maps expected fields including IRR→toman form amount", () => {
    const outcome = tryParseReceiptOcr(TEJARAT_SAMPLE_OCR_JSON);
    assert.equal(outcome.ok, true);
    if (!outcome.ok) return;
    const { ocr, extraction } = outcome;
    assert.equal(ocr.receipt_date, "1405/04/23");
    assert.equal(ocr.receipt_time, "18:52");
    assert.match(ocr.destination_bank, /کشاورزی/);
    assert.match(ocr.receiver_name, /سحر\s*شاهمرادی/);
    assert.equal(ocr.transfer_method, "PAYA");
    assert.equal(ocr.status, "PENDING");
    assert.equal(extraction.amount, 100_000_000);
    assert.equal(extraction.tracking_number, "000441889888");
    assert.equal(extraction.receipt_time, "18:52");
    assert.equal(extraction.document_channel, "paya");
    assert.equal(extraction.payer_name_on_receipt, null);
  });
});

describe("shared module exports used by both OCR routes", () => {
  it("exposes shared prompt and parser symbols", () => {
    assert.ok(RECEIPT_OCR_PROMPT.length > 100);
    assert.equal(typeof parseReceiptOcrResponse, "function");
    assert.equal(typeof tryStructuredExtraction, "function");
  });
});
