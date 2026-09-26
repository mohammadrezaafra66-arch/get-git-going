/**
 * Unit: mixed bulk delete/owner/status summary copy.
 * Run: npx --yes tsx --test src/lib/deals/bulk-summary.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyBulkRefusal,
  formatBulkMutationSummary,
} from "./bulk-summary.ts";

describe("formatBulkMutationSummary", () => {
  it("formats mixed delete with closed refusals", () => {
    assert.equal(
      formatBulkMutationSummary({ ok: 1, closed: 1, okVerb: "حذف شد" }),
      "۱ معامله حذف شد؛ ۱ معامله به دلیل بسته بودن حذف نشد (ابتدا به جاری برگردانید)",
    );
  });
  it("folds sales not-owned into the same delete sentence", () => {
    assert.equal(
      formatBulkMutationSummary({ ok: 1, closed: 1, denied: 1, okVerb: "حذف شد" }),
      "۱ معامله حذف شد؛ ۱ معامله به دلیل بسته بودن حذف نشد (ابتدا به جاری برگردانید)؛ ۱ معامله به دلیل نداشتن دسترسی تغییر نکرد",
    );
  });
  it("formats owner/status with the same pattern", () => {
    assert.equal(
      formatBulkMutationSummary({ ok: 1, denied: 1, okVerb: "تغییر کرد" }),
      "۱ معامله تغییر کرد؛ ۱ معامله به دلیل نداشتن دسترسی تغییر نکرد",
    );
    assert.equal(
      formatBulkMutationSummary({ ok: 2, closed: 1, okVerb: "تغییر کرد" }),
      "۲ معامله تغییر کرد؛ ۱ معامله به دلیل بسته بودن تغییر نکرد (ابتدا به جاری برگردانید)",
    );
  });
});

describe("classifyBulkRefusal", () => {
  it("detects closed-deal delete hint", () => {
    assert.equal(classifyBulkRefusal("برای حذف معامله ابتدا آن را به جاری برگردانید."), "closed");
    assert.equal(classifyBulkRefusal("permission denied"), "denied");
  });
});
