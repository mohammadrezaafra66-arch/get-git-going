import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createTaxonomy,
  listActiveTaxonomies,
  listTaxonomies,
  softDeleteTaxonomy,
  updateTaxonomy,
} from "./taxonomies.ts";

describe("work taxonomies client surface", () => {
  it("exports list/create/update/softDelete helpers", () => {
    assert.equal(typeof listActiveTaxonomies, "function");
    assert.equal(typeof listTaxonomies, "function");
    assert.equal(typeof createTaxonomy, "function");
    assert.equal(typeof updateTaxonomy, "function");
    assert.equal(typeof softDeleteTaxonomy, "function");
  });
});
