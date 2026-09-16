/**
 * Smoke for Need 3 day extraction — no DB required.
 * Run: npx --yes tsx --test src/lib/calls/import-issabel-derive-days.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tehranCalendarDaysFromStartedAts } from "./import-issabel-calls.server";

const here = dirname(fileURLToPath(import.meta.url));

describe("tehranCalendarDaysFromStartedAts", () => {
  it("returns distinct sorted Tehran calendar days", () => {
    // 2026-09-15 22:30 UTC = 2026-09-16 02:00 Tehran (+03:30)
    const days = tehranCalendarDaysFromStartedAts([
      "2026-09-15T10:00:00.000Z",
      "2026-09-15T22:30:00.000Z",
      "2026-09-15T11:00:00.000Z",
    ]);
    assert.deepEqual(days, ["2026-09-15", "2026-09-16"]);
  });

  it("skips invalid timestamps", () => {
    assert.deepEqual(tehranCalendarDaysFromStartedAts(["not-a-date"]), []);
  });
});

describe("import-issabel-calls.server derive wire (static)", () => {
  it("contains derive_staff_call_metrics call site", () => {
    const src = readFileSync(join(here, "import-issabel-calls.server.ts"), "utf8");
    assert.match(src, /derive_staff_call_metrics/);
    assert.match(src, /_for_date/);
    assert.match(src, /derive_days/);
    assert.match(src, /sales_interaction_create/);
  });
});
