import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { purchaseErrorMessage } from "./useCreatePurchase";

/**
 * Wave 1 / A4 — SUPPLIER_REQUIRED must map to the exact Persian label,
 * whether the trigger puts the ASCII code in hint, message, or details.
 */
describe("purchaseErrorMessage SUPPLIER_REQUIRED", () => {
  it("maps hint SUPPLIER_REQUIRED", () => {
    assert.equal(
      purchaseErrorMessage({ hint: "SUPPLIER_REQUIRED", message: "x" }),
      "تأمین‌کننده الزامی است",
    );
  });

  it("maps message containing SUPPLIER_REQUIRED", () => {
    assert.equal(
      purchaseErrorMessage({ message: "SUPPLIER_REQUIRED", code: "P0001" }),
      "تأمین‌کننده الزامی است",
    );
  });

  it("maps details containing SUPPLIER_REQUIRED", () => {
    assert.equal(
      purchaseErrorMessage({ message: "raise", details: "SUPPLIER_REQUIRED" }),
      "تأمین‌کننده الزامی است",
    );
  });
});
