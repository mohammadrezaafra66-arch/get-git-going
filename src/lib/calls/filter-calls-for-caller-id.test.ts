/**
 * Unit tests for Caller ID preference filter.
 * Run: npx --yes tsx --test src/lib/calls/filter-calls-for-caller-id.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterCallsForCallerId } from "./filter-calls-for-caller-id";
import type { CallerIdSettings } from "./caller-id-settings";

const base: CallerIdSettings = {
  enabled: true,
  show_inbound: true,
  show_outbound: true,
  show_others_outbound: false,
};

const sample = [
  { id: "i1", direction: "inbound", extension: "401" },
  { id: "o-mine", direction: "outbound", extension: "412" },
  { id: "o-other", direction: "outbound", extension: "403" },
];

describe("filterCallsForCallerId", () => {
  it("returns empty when master disabled", () => {
    assert.deepEqual(
      filterCallsForCallerId(sample, { ...base, enabled: false }, ["412"]),
      [],
    );
  });

  it("keeps only inbound when outbound off", () => {
    const out = filterCallsForCallerId(
      sample,
      { ...base, show_outbound: false },
      ["412"],
    );
    assert.deepEqual(
      out.map((c) => c.id),
      ["i1"],
    );
  });

  it("keeps only own outbound when others off", () => {
    const out = filterCallsForCallerId(sample, base, ["412"]);
    assert.deepEqual(
      out.map((c) => c.id),
      ["i1", "o-mine"],
    );
  });

  it("includes others outbound when enabled", () => {
    const out = filterCallsForCallerId(
      sample,
      { ...base, show_others_outbound: true },
      ["412"],
    );
    assert.deepEqual(
      out.map((c) => c.id),
      ["i1", "o-mine", "o-other"],
    );
  });

  it("with no mapped extensions, own outbound empty unless others on", () => {
    const withoutOthers = filterCallsForCallerId(sample, base, []);
    assert.deepEqual(
      withoutOthers.map((c) => c.id),
      ["i1"],
    );
    const withOthers = filterCallsForCallerId(
      sample,
      { ...base, show_others_outbound: true },
      [],
    );
    assert.deepEqual(
      withOthers.map((c) => c.id),
      ["i1", "o-mine", "o-other"],
    );
  });

  it("both direction checkboxes off yields empty while enabled", () => {
    const out = filterCallsForCallerId(
      sample,
      { ...base, show_inbound: false, show_outbound: false },
      ["412"],
    );
    assert.deepEqual(out, []);
  });
});
