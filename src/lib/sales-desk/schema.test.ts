/**
 * C2 zod: reject missing salespersonId; accept uuid.
 * Run: npx --yes tsx --test src/lib/sales-desk/schema.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createDealInteractionSchema,
  parseCreateDealInteraction,
} from "./schema.ts";

const PERSON = "11111111-1111-4111-8111-111111111111";
const SP = "22222222-2222-4222-8222-222222222222";

describe("createDealInteractionSchema", () => {
  it("rejects empty salespersonId", () => {
    const r = createDealInteractionSchema.safeParse({
      personId: PERSON,
      kind: "request",
      body: "متن",
      salespersonId: "",
    });
    assert.equal(r.success, false);
    if (!r.success) {
      assert.ok(r.error.issues.some((i) => i.path[0] === "salespersonId"));
    }
  });

  it("rejects missing salespersonId", () => {
    const r = createDealInteractionSchema.safeParse({
      personId: PERSON,
      kind: "request",
      body: "متن",
    });
    assert.equal(r.success, false);
  });

  it("accepts uuid salespersonId", () => {
    const r = createDealInteractionSchema.safeParse({
      personId: PERSON,
      kind: "request",
      body: "متن درخواست",
      salespersonId: SP,
    });
    assert.equal(r.success, true);
    if (r.success) assert.equal(r.data.salespersonId, SP);
  });

  it("parseCreateDealInteraction throws Persian for empty", () => {
    assert.throws(
      () =>
        parseCreateDealInteraction({
          personId: PERSON,
          kind: "request",
          body: "متن",
          salespersonId: "",
        }),
      (e: unknown) =>
        e instanceof Error && e.message === "مسئول معامله الزامی است",
    );
  });
});
