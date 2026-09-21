/**
 * Unit: B5 soft-fail must hide missing-column only — not FK/constraint.
 * Run: npx --yes tsx --test src/lib/sales-desk/interactions-deal-id.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isMissingDealIdColumnError } from "./interactions";

describe("isMissingDealIdColumnError", () => {
  it("soft-fails missing-column style messages", () => {
    assert.equal(
      isMissingDealIdColumnError('column "deal_id" does not exist'),
      true,
    );
    assert.equal(
      isMissingDealIdColumnError("column deal_id does not exist"),
      true,
    );
    assert.equal(
      isMissingDealIdColumnError("Could not find the 'deal_id' column of 'sales_interactions' in the schema cache"),
      true,
    );
    assert.equal(
      isMissingDealIdColumnError("Could not find the column deal_id"),
      true,
    );
  });

  it("does NOT soft-hide FK / constraint / RLS errors that mention deal_id", () => {
    assert.equal(
      isMissingDealIdColumnError(
        "violates foreign key constraint sales_interactions_deal_id_fkey",
      ),
      false,
      "FK must throw, not soft-return",
    );
    assert.equal(
      isMissingDealIdColumnError(
        'insert or update on table "sales_interactions" violates foreign key constraint "sales_interactions_deal_id_fkey"',
      ),
      false,
    );
    assert.equal(
      isMissingDealIdColumnError("new row violates row-level security policy"),
      false,
    );
    assert.equal(isMissingDealIdColumnError("permission denied"), false);
  });
});
