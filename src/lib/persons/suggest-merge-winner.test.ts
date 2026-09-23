/**
 * Pure suggestMergeWinner probes.
 * Run: npx --yes tsx --test src/lib/persons/suggest-merge-winner.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isBulkMergeEligible,
  suggestMergeWinner,
  type MergeSideEvidence,
} from "./suggest-merge-winner.ts";

function side(partial: Partial<MergeSideEvidence> & { id: string }): MergeSideEvidence {
  return {
    display_name: partial.display_name ?? "نام",
    legal_name: partial.legal_name ?? null,
    is_active: partial.is_active ?? true,
    has_customer: partial.has_customer ?? false,
    has_supplier: partial.has_supplier ?? false,
    has_external_party: partial.has_external_party ?? false,
    reference_count: partial.reference_count ?? 0,
    created_at: partial.created_at ?? "2026-01-01T00:00:00Z",
    identifiers: partial.identifiers ?? [],
    id: partial.id,
  };
}

describe("suggestMergeWinner", () => {
  it("returns blocked with no side", () => {
    const r = suggestMergeWinner(side({ id: "a" }), side({ id: "b" }), true);
    assert.equal(r.side, null);
    assert.equal(r.reason, "blocked");
  });

  it("prefers the only commercial role (customer)", () => {
    const r = suggestMergeWinner(
      side({ id: "a", has_customer: false, created_at: "2026-06-10T00:00:00Z" }),
      side({ id: "b", has_customer: true, created_at: "2026-05-24T00:00:00Z" }),
      false,
    );
    assert.equal(r.side, "b");
    assert.equal(r.reason, "commercial_role");
  });

  it("prefers hard identity over bare name twin", () => {
    const r = suggestMergeWinner(
      side({ id: "a", identifiers: [] }),
      side({
        id: "b",
        identifiers: [{ kind: "mobile_e164", status: "provisional" }],
      }),
      false,
    );
    assert.equal(r.side, "b");
    assert.equal(r.reason, "hard_identity");
  });

  it("prefers higher reference_count", () => {
    const r = suggestMergeWinner(
      side({ id: "a", reference_count: 1 }),
      side({ id: "b", reference_count: 5 }),
      false,
    );
    assert.equal(r.side, "b");
    assert.equal(r.reason, "reference_count");
  });

  it("prefers older when other scores tie", () => {
    const r = suggestMergeWinner(
      side({ id: "a", created_at: "2026-06-10T00:00:00Z" }),
      side({ id: "b", created_at: "2026-05-24T00:00:00Z" }),
      false,
    );
    assert.equal(r.side, "b");
    assert.equal(r.reason, "older");
  });

  it("falls back to a", () => {
    const r = suggestMergeWinner(
      side({ id: "a", created_at: "2026-01-01T00:00:00Z" }),
      side({ id: "b", created_at: "2026-01-01T00:00:00Z" }),
      false,
    );
    assert.equal(r.side, "a");
    assert.equal(r.reason, "fallback_a");
  });
});

describe("isBulkMergeEligible", () => {
  it("allows shared_identifier when unblocked", () => {
    assert.equal(
      isBulkMergeEligible({
        blocked_reason: null,
        reason: "shared_identifier",
        a: { is_active: true },
        b: { is_active: true },
      }),
      true,
    );
  });

  it("rejects same_name and blocked", () => {
    assert.equal(
      isBulkMergeEligible({
        blocked_reason: null,
        reason: "same_name",
        a: { is_active: true },
        b: { is_active: true },
      }),
      false,
    );
    assert.equal(
      isBulkMergeEligible({
        blocked_reason: "both_customer",
        reason: "shared_identifier",
        a: { is_active: true },
        b: { is_active: true },
      }),
      false,
    );
  });
});
