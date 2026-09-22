/**
 * Unit: salesDeskErrorMessage maps ASCII codes.
 * Run: npx --yes tsx --test src/lib/sales-desk/errors.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { salesDeskErrorMessage } from "./errors.ts";

describe("salesDeskErrorMessage", () => {
  it("maps RESPONSIBLE_REQUIRED", () => {
    assert.equal(
      salesDeskErrorMessage("ERROR: RESPONSIBLE_REQUIRED"),
      "مسئول معامله الزامی است",
    );
  });
  it("maps LOST_REASON_REQUIRED", () => {
    assert.equal(
      salesDeskErrorMessage("LOST_REASON_REQUIRED"),
      "دلیل شکست را انتخاب کنید",
    );
  });
  it("maps ACTIVITY_OWNER_ONLY", () => {
    assert.equal(
      salesDeskErrorMessage("ERROR: ACTIVITY_OWNER_ONLY"),
      "فقط مسئول انجام این فعالیت می‌تواند نتیجه را ثبت کند",
    );
  });
  it("passes through other messages", () => {
    assert.equal(salesDeskErrorMessage("دیگر"), "دیگر");
  });
});
