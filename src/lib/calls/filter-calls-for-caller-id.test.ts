/**
 * Unit tests for Caller ID preference filter.
 * Run: npx --yes tsx --test src/lib/calls/filter-calls-for-caller-id.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterCallsForCallerId,
  passesOnlyMyCustomers,
} from "./filter-calls-for-caller-id";
import type { CallerIdSettings } from "./caller-id-settings";

const base: CallerIdSettings = {
  enabled: true,
  show_inbound: true,
  show_outbound: true,
  show_others_outbound: false,
  display_seconds: 15,
  only_my_extension: false,
  only_my_customers: false,
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

  it("only_my_extension keeps inbound+outbound on my exts only", () => {
    const out = filterCallsForCallerId(
      sample,
      { ...base, only_my_extension: true, show_others_outbound: true },
      ["412"],
    );
    assert.deepEqual(
      out.map((c) => c.id),
      ["o-mine"],
    );
  });

  it("only_my_customers defers until customerResolved", () => {
    const unresolved = [
      {
        id: "i1",
        direction: "inbound",
        extension: "401",
        customerResolved: false as const,
      },
    ];
    const kept = filterCallsForCallerId(
      unresolved,
      { ...base, only_my_customers: true },
      ["401"],
      { currentUserId: "user-a" },
    );
    assert.equal(kept.length, 1);

    const resolvedOther = filterCallsForCallerId(
      [
        {
          id: "i1",
          direction: "inbound",
          extension: "401",
          customerResolved: true,
          responsibleUserId: "other",
        },
      ],
      { ...base, only_my_customers: true },
      ["401"],
      { currentUserId: "user-a" },
    );
    assert.equal(resolvedOther.length, 0);

    const resolvedMine = filterCallsForCallerId(
      [
        {
          id: "i1",
          direction: "inbound",
          extension: "401",
          customerResolved: true,
          responsibleUserId: "user-a",
        },
      ],
      { ...base, only_my_customers: true },
      ["401"],
      { currentUserId: "user-a" },
    );
    assert.equal(resolvedMine.length, 1);
  });
});

describe("passesOnlyMyCustomers", () => {
  it("allows all when setting off", () => {
    assert.equal(passesOnlyMyCustomers(base, "u1", null), true);
  });
  it("requires match when on", () => {
    const s = { ...base, only_my_customers: true };
    assert.equal(passesOnlyMyCustomers(s, "u1", "u1"), true);
    assert.equal(passesOnlyMyCustomers(s, "u1", "u2"), false);
    assert.equal(passesOnlyMyCustomers(s, "u1", null), false);
  });
});
