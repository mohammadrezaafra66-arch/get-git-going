/**
 * Unit tests for Caller ID call-card key grouping (B1).
 * Run: npx --yes tsx --test src/lib/calls/call-card-key.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getCallCardKey,
  groupCallsByCardKey,
  normalizePhoneForCardKey,
} from "./call-card-key";

describe("normalizePhoneForCardKey", () => {
  it("strips non-digits and leading 0/98", () => {
    assert.equal(normalizePhoneForCardKey("0900-000-0123"), "9000000123");
    assert.equal(normalizePhoneForCardKey("+989000000123"), "9000000123");
  });
});

describe("getCallCardKey", () => {
  it("prefers linkedid over uniqueid and phone", () => {
    assert.equal(
      getCallCardKey({
        id: "ring:a",
        linkedid: "L-100",
        uniqueid: "U-1",
        metadata: { raw_number: "09000000123" },
        started_at: "2026-09-21T12:00:00Z",
      }),
      "lid:L-100",
    );
  });

  it("falls back to uniqueid then phone+minute", () => {
    assert.equal(
      getCallCardKey({
        id: "ring:b",
        uniqueid: "U-9",
        metadata: { raw_number: "09000000123" },
        started_at: "2026-09-21T12:00:00Z",
      }),
      "uid:U-9",
    );
    assert.equal(
      getCallCardKey({
        id: "ring:c",
        metadata: { raw_number: "09000000123", linkedid: null },
        started_at: "2026-09-21T12:34:56Z",
      }),
      "ph:9000000123:202609211234",
    );
  });

  it("reads linkedid from metadata when top-level missing", () => {
    assert.equal(
      getCallCardKey({
        id: "ring:d",
        metadata: { linkedid: "L-meta" },
      }),
      "lid:L-meta",
    );
  });
});

describe("groupCallsByCardKey — B1 two extensions same linkedid", () => {
  it("collapses two ring rows with same linkedid into one card", () => {
    const rows = [
      {
        id: "ring:uuid-401",
        extension: "401",
        linkedid: "AMI-LINK-99",
        started_at: "2026-09-21T12:00:01Z",
        created_at: "2026-09-21T12:00:01Z",
        metadata: { raw_number: "09000000111" },
      },
      {
        id: "ring:uuid-412",
        extension: "412",
        linkedid: "AMI-LINK-99",
        started_at: "2026-09-21T12:00:02Z",
        created_at: "2026-09-21T12:00:02Z",
        metadata: { raw_number: "09000000111" },
      },
    ];

    // Before grouping: two distinct row keys (old popup behavior)
    assert.notEqual(rows[0]!.id, rows[1]!.id);
    assert.equal(getCallCardKey(rows[0]!), getCallCardKey(rows[1]!));
    assert.equal(getCallCardKey(rows[0]!), "lid:AMI-LINK-99");

    const groups = groupCallsByCardKey(rows);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.key, "lid:AMI-LINK-99");
    assert.deepEqual(groups[0]!.extensions, ["401", "412"]);
    assert.equal(groups[0]!.members.length, 2);
  });

  it("keeps separate cards for different linkedids", () => {
    const groups = groupCallsByCardKey([
      {
        id: "ring:1",
        extension: "401",
        linkedid: "A",
        started_at: "2026-09-21T12:00:00Z",
      },
      {
        id: "ring:2",
        extension: "412",
        linkedid: "B",
        started_at: "2026-09-21T12:00:00Z",
      },
    ]);
    assert.equal(groups.length, 2);
  });
});
