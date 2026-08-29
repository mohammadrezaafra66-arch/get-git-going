/**
 * Receipt amounts are printed in rial and stored in toman.
 * Run: npx --yes tsx --test src/lib/accounting/receipt-rial-conversion.test.ts
 * Does not call external paid OCR/LLM APIs.
 *
 * WHY THIS EXISTS. Two defects sat on the same number. The first was a policy gap: when the
 * vision model could not read the printed unit it returned `currency: "UNKNOWN"`, and the
 * converter refused to guess — which left a raw rial figure sitting in a toman field, ten times
 * too large and with nothing to mark it. Every Iranian bank receipt prints rial, so the owner's
 * rule is that UNKNOWN converts too, loudly.
 *
 * The second was silent data loss. `parseAmountToNumber` stripped the thousands separators and
 * then discarded any result of ten digits or more as an identifier, so a receipt for
 * 1,000,000,000 rial — 100,000,000 toman — came back empty. No error, no warning, just a blank
 * field. The effective ceiling on a readable amount was 999,999,999 rial.
 *
 * Both are asserted against the real functions, and each assertion was shown to fail with the
 * fix removed before it was trusted.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { amountToToman } from "./receipt-ocr-structured.ts";
import { parseReceiptText } from "./receipt-extraction.ts";

describe("rial to toman at the form boundary", () => {
  it("converts an explicit IRR amount", () => {
    const r = amountToToman(100_000_000, "IRR");
    assert.equal(r.value, 10_000_000);
    assert.equal(r.original_amount, 100_000_000);
  });

  it("converts UNKNOWN too, and says that it assumed rial", () => {
    // The owner's decision: there is no toman-printed bank receipt in this business, so an
    // unreadable unit must not leave the amount unconverted.
    const r = amountToToman(100_000_000, "UNKNOWN");
    assert.equal(r.value, 10_000_000);
    assert.ok(r.warning, "an assumed unit must be announced");
    assert.ok(r.warning!.includes("ریال فرض"));
  });

  it("still passes a TOMAN amount through untouched", () => {
    // Guards against the fix over-reaching: if the model does read TOMAN, dividing would be
    // the same bug in the other direction.
    const r = amountToToman(10_000_000, "TOMAN");
    assert.equal(r.value, 10_000_000);
  });

  it("records what was printed, so the assumption is auditable", () => {
    const r = amountToToman(100_000_000, "UNKNOWN");
    assert.equal(r.original_currency, "UNKNOWN");
    assert.equal(r.original_amount, 100_000_000);
  });
});

describe("amounts at and above one billion rial", () => {
  it("reads 1,000,000,000 rial as 100,000,000 toman instead of dropping it", () => {
    const r = parseReceiptText("مبلغ: 1,000,000,000 ریال");
    assert.equal(r.amount, 100_000_000);
  });

  it("reads a ten-digit toman amount rather than discarding it", () => {
    const r = parseReceiptText("مبلغ: 1,234,567,890 تومان");
    assert.equal(r.amount, 1_234_567_890);
  });

  it("still converts the ordinary case", () => {
    const r = parseReceiptText("مبلغ: 100,000,000 ریال");
    assert.equal(r.amount, 10_000_000);
  });
});

describe("identifiers must never be read as an amount", () => {
  it("ignores a bare 16-digit card number and still finds the real amount", () => {
    const r = parseReceiptText("شماره کارت 6037991112345678 مبلغ: 500,000 ریال");
    assert.equal(r.amount, 50_000);
  });

  it("ignores a card number grouped in fours", () => {
    const r = parseReceiptText("کارت مبدأ: 6037-9911-1234-5678");
    assert.equal(r.amount, null);
  });

  it("ignores a long bare tracking number", () => {
    const r = parseReceiptText("کد پیگیری 14050425122467984220");
    assert.equal(r.amount, null);
  });

  it("ignores a 16-digit run even when a unit word follows it", () => {
    // The shape decides, not the neighbouring text.
    const r = parseReceiptText("6037991112345678 ریال");
    assert.equal(r.amount, null);
  });
});
