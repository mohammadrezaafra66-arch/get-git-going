/**
 * Unit: settlement price pick + C9 catalog draft mapping.
 * Run: npx --yes tsx --test src/lib/sales/quotes-deal-prefill.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  draftCatalogQuoteItem,
  resolveSettlementPriceFromEntries,
  validateQuote,
  type SettlementPriceEntry,
} from "./quotes.ts";

const SPT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SPT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const SETTLEMENT = "cccccccc-cccc-cccc-cccc-cccccccccccc";

const entries: SettlementPriceEntry[] = [
  {
    sale_price_type_id: SPT_A,
    settlement_type_id: null,
    current_price: 100_000,
  },
  {
    sale_price_type_id: SPT_A,
    settlement_type_id: SETTLEMENT,
    current_price: 110_000,
  },
  {
    sale_price_type_id: SPT_B,
    settlement_type_id: null,
    current_price: 90_000,
  },
];

describe("resolveSettlementPriceFromEntries", () => {
  it("returns exact settlement match", () => {
    const r = resolveSettlementPriceFromEntries(entries, SPT_A, SETTLEMENT);
    assert.deepEqual(r, { status: "match", price: 110_000 });
  });

  it("returns baseline when settlement has no row", () => {
    const r = resolveSettlementPriceFromEntries(entries, SPT_B, SETTLEMENT);
    assert.deepEqual(r, { status: "baseline_fallback", price: 90_000 });
  });

  it("returns match on baseline when settlement is null", () => {
    const r = resolveSettlementPriceFromEntries(entries, SPT_A, null);
    assert.deepEqual(r, { status: "match", price: 100_000 });
  });

  it("returns no_price when nothing sellable", () => {
    const r = resolveSettlementPriceFromEntries(entries, "missing", null);
    assert.deepEqual(r, { status: "no_price" });
  });
});

describe("draftCatalogQuoteItem (C9 deal prefill shape)", () => {
  it("uses product_price with sale_price_type_id (not manual)", () => {
    const item = draftCatalogQuoteItem({
      key: "k1",
      productId: "dddddddd-dddd-dddd-dddd-dddddddddddd",
      sku: "X287",
      title: "آئوولی",
      quantity: 2,
      salePriceTypeId: SPT_A,
      unitPrice: 100_000,
    });
    assert.equal(item.source, "product_price");
    assert.equal(item.sale_price_type_id, SPT_A);
    assert.equal(item.unit_price, 100_000);
    assert.equal(item.product_id, "dddddddd-dddd-dddd-dddd-dddddddddddd");
    assert.equal(item.free_item_name, null);

    const errs = validateQuote(
      { customer_name: "مشتری تست", customer_phone: "09000000201" },
      [item],
    );
    assert.equal(errs.length, 0, errs.map((e) => e.message).join("; "));
  });

  it("validateQuote still rejects legacy manual source", () => {
    const errs = validateQuote(
      { customer_name: "مشتری تست", customer_phone: "09000000201" },
      [
        {
          key: "k2",
          source: "manual",
          product_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
          free_item_name: null,
          sku_snapshot: null,
          title_snapshot: "x",
          sale_price_type_id: null,
          quantity: 1,
          unit_price: 100_000,
          discount_amount: 0,
        },
      ],
    );
    assert.ok(errs.some((e) => e.message.includes("در سیستم تعریف نشده")));
  });
});
