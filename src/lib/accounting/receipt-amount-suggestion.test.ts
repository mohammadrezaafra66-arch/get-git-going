/**
 * OG-85 follow-up — the OCR amount is a suggestion, and a disagreement is announced.
 * Run: npx --yes tsx --test src/lib/accounting/receipt-amount-suggestion.test.ts
 * Does not call external paid OCR/LLM APIs.
 *
 * WHY THIS EXISTS. The model reads the significant digits of a printed amount correctly and
 * then miscounts the run of zeros — by one, two or three digits, unpredictably — so an amount
 * written straight into the form could be 10x, 100x or 1000x short with nothing on screen to
 * show for it. No prompt fixes that reliably; twenty-four measured runs against a synthetic
 * slip could not even reproduce the failure, let alone discriminate between prompts.
 *
 * So the amount stops being treated as fact. Two changes are asserted here:
 *   1. the prompt now asks for `amount_digit_count` as well, and a count that disagrees with
 *      the number of digits in `amount` raises a warning naming both;
 *   2. that disagreement also forces `needs_manual_review`.
 *
 * The UI half — the amount reaching the form as a suggestion that must be accepted, and the
 * submit button staying disabled until it is — is asserted in
 * e2e/security/og87-ocr-amount-is-a-suggestion.spec.ts, which can read the components.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RECEIPT_OCR_PROMPT } from "./receipt-ocr-prompt.ts";
import { parseReceiptOcrResponse } from "./receipt-ocr-structured.ts";

const base = {
  status: "SUCCESS",
  transfer_method: "PAYA",
  currency: "IRR",
  receipt_date: "1405/04/25",
  tracking_number: "140504251224679842",
  receiver_name: "شرکت افراکالا",
};

describe("the prompt asks the model to count the digits", () => {
  it("declares amount_digit_count in the schema", () => {
    assert.ok(RECEIPT_OCR_PROMPT.includes("amount_digit_count"));
  });

  it("explains what to count, and warns about the zeros specifically", () => {
    // The rule has to name the zeros; that is the run the model gets wrong.
    assert.ok(RECEIPT_OCR_PROMPT.includes("ignoring the thousands separators"));
    assert.ok(RECEIPT_OCR_PROMPT.includes("Count the zeros carefully"));
  });
});

describe("a digit count that disagrees with the amount is announced", () => {
  it("warns when the count is larger than the number we were given", () => {
    // The real failure: printed 462,000,000 (9 digits), model returned 46,200,000 (8).
    const r = parseReceiptOcrResponse(
      JSON.stringify({ ...base, amount: 46200000, amount_digit_count: 9 }),
    );
    const warned = r.warnings.some((w) => w.includes("تعداد ارقام"));
    assert.ok(warned, "a mismatch must produce a warning");
    assert.equal(r.needs_manual_review, true);
  });

  it("names both numbers so the accountant knows what to look for", () => {
    const r = parseReceiptOcrResponse(
      JSON.stringify({ ...base, amount: 46200000, amount_digit_count: 9 }),
    );
    const w = r.warnings.find((x) => x.includes("تعداد ارقام")) ?? "";
    assert.ok(w.includes("9"), "the reported count must appear");
    assert.ok(w.includes("8"), "the actual digit length must appear");
  });

  it("stays quiet when the two agree", () => {
    // Non-vacuous: a warning that fired unconditionally would pass the tests above.
    const r = parseReceiptOcrResponse(
      JSON.stringify({ ...base, amount: 462000000, amount_digit_count: 9 }),
    );
    assert.equal(
      r.warnings.some((w) => w.includes("تعداد ارقام")),
      false,
    );
  });

  it("stays quiet when the model did not report a count", () => {
    // Absent is not wrong. The check is advisory and must never invent a problem.
    const r = parseReceiptOcrResponse(JSON.stringify({ ...base, amount: 46200000 }));
    assert.equal(
      r.warnings.some((w) => w.includes("تعداد ارقام")),
      false,
    );
  });

  it("ignores a count that is not a plausible digit count", () => {
    for (const bad of [0, -3, 99, "abc", null]) {
      const r = parseReceiptOcrResponse(
        JSON.stringify({ ...base, amount: 46200000, amount_digit_count: bad }),
      );
      assert.equal(
        r.warnings.some((w) => w.includes("تعداد ارقام")),
        false,
        `digit_count ${JSON.stringify(bad)} must be ignored, not treated as a mismatch`,
      );
    }
  });

  it("does not reject the amount — the check is advisory", () => {
    // A mismatch must still hand the number over. Refusing it would trade one silent
    // failure for another.
    const r = parseReceiptOcrResponse(
      JSON.stringify({ ...base, amount: 46200000, amount_digit_count: 9 }),
    );
    assert.equal(r.amount, 46200000);
  });
});
