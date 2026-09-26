import { describe, expect, it } from "vitest";
import { isAllowedFindingStatusTransition } from "./finding-status";

describe("isAllowedFindingStatusTransition", () => {
  it("allows review-desk moves and blocks a sales-role skip to reported", () => {
    expect(isAllowedFindingStatusTransition("cheaper_competitor", "confirmed_bait")).toBe(
      true,
    );
    expect(isAllowedFindingStatusTransition("confirmed_bait", "queued_for_report")).toBe(
      true,
    );
    expect(isAllowedFindingStatusTransition("cheaper_competitor", "reported")).toBe(false);
    expect(isAllowedFindingStatusTransition("queued_for_report", "reported")).toBe(false);
  });
});
