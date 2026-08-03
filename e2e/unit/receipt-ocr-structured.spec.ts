/**
 * Playwright unit-style check: create-receipt form mapping helpers with mocked OCR JSON.
 * Does not call external paid OCR/LLM APIs.
 *
 * Run:
 *   npx playwright test e2e/unit/receipt-ocr-structured.spec.ts --config=e2e/unit/playwright.unit.config.ts
 */
import { test, expect } from "@playwright/test";
import {
  TEJARAT_SAMPLE_OCR_JSON,
  amountToToman,
  parseReceiptOcrResponse,
  tryParseReceiptOcr,
  toHtmlTimeValue,
} from "../../src/lib/accounting/receipt-ocr-structured";
import { RECEIPT_OCR_PROMPT } from "../../src/lib/accounting/receipt-ocr-prompt";

test.describe("receipt OCR structured (mocked, no live vision)", () => {
  test("Tejarat sample → form-ready values", () => {
    const ocr = parseReceiptOcrResponse(TEJARAT_SAMPLE_OCR_JSON);
    const toman = amountToToman(ocr.amount, ocr.currency);
    expect(toman.value).toBe(100_000_000);
    expect(ocr.receipt_date).toBe("1405/04/23");
    expect(toHtmlTimeValue(ocr.receipt_time)).toBe("18:52");
    expect(ocr.destination_bank).toContain("کشاورزی");
    expect(ocr.receiver_name).toContain("سحر");
    expect(ocr.transfer_method).toBe("PAYA");
    expect(ocr.status).toBe("PENDING");
    expect(ocr.sender_name).toBe("");
  });

  test("invalid JSON does not throw through tryParse", () => {
    const r = tryParseReceiptOcr("```not-json```");
    expect(r.ok).toBe(false);
  });

  test("shared prompt forbids inventing receipt_time from clock", () => {
    expect(RECEIPT_OCR_PROMPT).toContain("receipt_time");
    expect(RECEIPT_OCR_PROMPT).toMatch(/NEVER use/i);
    expect(RECEIPT_OCR_PROMPT).toContain("upload time");
  });
});
