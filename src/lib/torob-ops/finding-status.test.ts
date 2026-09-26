import assert from "node:assert/strict";
import { test } from "node:test";
import { isAllowedFindingStatusTransition } from "./finding-status.ts";

test("allows review-desk moves and blocks a skip to reported", () => {
  assert.equal(isAllowedFindingStatusTransition("cheaper_competitor", "confirmed_bait"), true);
  assert.equal(isAllowedFindingStatusTransition("confirmed_bait", "queued_for_report"), true);
  assert.equal(isAllowedFindingStatusTransition("cheaper_competitor", "reported"), false);
  assert.equal(isAllowedFindingStatusTransition("queued_for_report", "reported"), false);
});
