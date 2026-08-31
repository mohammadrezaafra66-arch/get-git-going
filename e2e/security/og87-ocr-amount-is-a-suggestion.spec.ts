/**
 * OG-87 — the OCR amount reaches the form as a suggestion, never as a value.
 *
 * WHY THIS EXISTS. OG-85 established that the vision model reads the significant digits of a
 * printed amount correctly and then miscounts the run of zeros, by one, two or three digits,
 * unpredictably. An auto-filled amount could therefore be 10x, 100x or 1000x short with nothing
 * on screen to show for it — the worst shape a defect can take in a ledger.
 *
 * No prompt fixes it reliably. Twenty-four measured runs against a synthetic slip could not even
 * reproduce the failure, so they could not discriminate between prompts either. The remedy is
 * therefore independent of model accuracy: the amount is offered, the accountant compares it
 * with the paper, and nothing is recorded until they act on it.
 *
 * Two consumers had to change, in different ways:
 *   - the ledger wizard auto-filled the field; it now holds a suggestion and disables submit
 *     while one is unresolved;
 *   - the receipt page wrote the amount straight onto the row (its own comment said
 *     "silently push"); it now leaves the amount to the per-field checkboxes that already
 *     existed and already default to off.
 *
 * Only the amount is held back. A date or a tracking number is either read or it is not — they
 * do not have this failure mode, and treating them the same way would be friction for nothing.
 */
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const wizard = readFileSync("src/features/ledger-wizard/DocumentWizard.tsx", "utf8");
const receiptDocs = readFileSync("src/components/accounting/PaymentReceiptDocuments.tsx", "utf8");
const prompt = readFileSync("src/lib/accounting/receipt-ocr-prompt.ts", "utf8");

test.describe("OG-87 — the OCR amount is a suggestion", () => {
  test("the wizard no longer writes the extracted amount into the field", () => {
    // The exact line that used to do it.
    expect(wizard).not.toContain("setAmountText(String(parsed.amount))");
  });

  test("it holds the amount as a suggestion instead", () => {
    expect(wizard).toContain("setAmountSuggestion(parsed.amount)");
    expect(wizard).toContain("function AmountSuggestion");
  });

  test("accepting the suggestion is what puts it in the field", () => {
    // The value must still be reachable in one click; the point is deliberateness, not friction.
    expect(wizard).toContain('data-testid="amount-suggestion-accept"');
    expect(wizard).toContain('setAmountText(String(amountSuggestion ?? ""))');
  });

  test("a document cannot be submitted while a suggestion is unresolved", () => {
    // The hard constraint: it must not be possible to record without having seen the amount.
    expect(wizard).toContain("disabled={submitting || amountSuggestion != null}");
  });

  test("the suggestion tells the accountant why to look, not just what to click", () => {
    expect(wizard).toContain("مبلغ پیشنهادی از روی فیش");
    expect(wizard).toContain("با فیش مقایسه و تأیید کنید");
  });

  test("a digit-count disagreement is shown on the suggestion", () => {
    expect(wizard).toContain('data-testid="amount-suggestion-warning"');
    expect(wizard).toContain("تعداد ارقام");
  });

  test("the receipt page no longer pushes the amount onto the row", () => {
    // Its own comment used to say "silently push extracted amount".
    expect(receiptDocs).not.toContain('update["amount"] = exAmount');
  });

  test("but it still reports a disagreement with an amount already entered", () => {
    // Removing the write must not remove the warning; that is information, not a mutation.
    expect(receiptDocs).toContain('autoMismatches.push({ field: "amount"');
  });

  test("the other extracted fields are untouched", () => {
    // Non-vacuous guard on the change's scope: tracking_number must still auto-apply, or the
    // "only the amount" claim above is false.
    expect(receiptDocs).toContain('update["tracking_number"] = exTracking');
    expect(wizard).toContain("setTracking(parsed.tracking_number)");
    expect(wizard).toContain("setDate(parsed.receipt_date)");
  });

  test("the prompt asks the model to count the digits", () => {
    expect(prompt).toContain("amount_digit_count");
    expect(prompt).toContain("Count the zeros carefully");
  });
});
