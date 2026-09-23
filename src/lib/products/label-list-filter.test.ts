/**
 * Regression: catalog tag filter must run before pagination.
 * Run: npx --yes tsx --test src/lib/products/label-list-filter.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  listCatalogPage,
  productIdsHavingAllLabels,
  restrictProductIds,
  type CatalogCandidate,
} from "./label-list-filter";

const ADS = "52b77240-1806-4f84-a18d-4fb9891d6fbb";
const OTHER = "1215855f-219c-4f4c-8761-6b575c25427d";

function row(
  id: string,
  labelIds: string[],
  extra: Partial<CatalogCandidate> = {},
): CatalogCandidate {
  return { id, labelIds, brandId: "brand-a", status: "active", stockStatus: "available", ...extra };
}

describe("product tag filter", () => {
  it("keeps a product that has the selected tag", () => {
    const page = listCatalogPage(
      [row("tagged", [ADS]), row("plain", [])],
      { labelIds: [ADS] },
      0,
      20,
    );
    assert.deepEqual(
      page.rows.map((r) => r.id),
      ["tagged"],
    );
    assert.equal(page.total, 1);
  });

  it("excludes a product that does not have the selected tag", () => {
    const page = listCatalogPage(
      [row("plain", []), row("other", [OTHER])],
      { labelIds: [ADS] },
      0,
      20,
    );
    assert.deepEqual(page.rows, []);
    assert.equal(page.total, 0);
  });

  it("combines the tag with brand, status, and stock filters", () => {
    const products = [
      row("match", [ADS], { brandId: "brand-a", status: "active", stockStatus: "available" }),
      row("wrong-brand", [ADS], { brandId: "brand-b" }),
      row("wrong-status", [ADS], { status: "inactive" }),
      row("wrong-stock", [ADS], { stockStatus: "unavailable" }),
      row("untagged-same-brand", [], { brandId: "brand-a" }),
    ];
    const page = listCatalogPage(
      products,
      {
        labelIds: [ADS],
        brandId: "brand-a",
        status: "active",
        stockStatus: "available",
      },
      0,
      20,
    );
    assert.deepEqual(
      page.rows.map((r) => r.id),
      ["match"],
    );
    assert.equal(page.total, 1);
  });

  it("paginates the tagged set, including products past the first unfiltered page", () => {
    const untagged = Array.from({ length: 20 }, (_, i) => row(`u${i}`, []));
    const tagged = Array.from({ length: 25 }, (_, i) => row(`t${i}`, [ADS]));
    const ordered = [...untagged, ...tagged];

    const first = listCatalogPage(ordered, { labelIds: [ADS] }, 0, 20);
    const second = listCatalogPage(ordered, { labelIds: [ADS] }, 1, 20);

    assert.equal(first.total, 25);
    assert.equal(second.total, 25);
    assert.equal(first.rows.length, 20);
    assert.deepEqual(
      second.rows.map((r) => r.id),
      ["t20", "t21", "t22", "t23", "t24"],
    );
    const shown = new Set([...first.rows, ...second.rows].map((r) => r.id));
    assert.equal(shown.size, 25);
    assert.equal(
      [...shown].some((id) => id.startsWith("u")),
      false,
    );
  });

  it("requires every selected tag, not any one of them", () => {
    const ids = productIdsHavingAllLabels(
      [
        { product_id: "both", label_id: ADS },
        { product_id: "both", label_id: OTHER },
        { product_id: "only-ads", label_id: ADS },
      ],
      [ADS, OTHER],
    );
    assert.deepEqual(ids, ["both"]);
  });

  it("intersects a text-search id list with the tag matches", () => {
    const tagged = restrictProductIds(
      ["search-hit", "search-other"],
      ["search-hit", "not-in-search"],
    );
    assert.deepEqual(tagged.ids, ["search-hit"]);
    assert.equal(tagged.empty, false);

    const none = restrictProductIds(["search-other"], ["tagged-only"]);
    assert.equal(none.empty, true);
    assert.deepEqual(none.ids, []);

    const noLabel = restrictProductIds(null, null);
    assert.equal(noLabel.ids, null);
    assert.equal(noLabel.empty, false);
  });
});
