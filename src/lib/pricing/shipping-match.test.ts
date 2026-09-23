import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isCatchAllShippingRule,
  pickShippingRulesToApply,
  shippingRuleAmountToman,
  shippingRuleMatches,
} from "./shipping-match.ts";

const lg24000 = { id: "p-24", brand_id: "lg", category_id: "ac", product_type: "foreign" };
const lgOther = { id: "p-other", brand_id: "lg", category_id: "ac", product_type: "foreign" };

const brandPicks = {
  id: "r-brand",
  title: "ال‌جی انتخابی",
  cost_type: "fixed" as const,
  cost_value: 200_000,
  brand_id: "lg",
  selected_product_ids: ["p-24", "p-12"],
};

const categoryRule = {
  id: "r-cat",
  title: "کولر گازی",
  cost_type: "fixed" as const,
  cost_value: 50_000,
  category_id: "ac",
};

const productRule = {
  id: "r-prod",
  title: "۲۴۰۰۰ خاص",
  cost_type: "percent" as const,
  cost_value: 10,
  product_id: "p-24",
};

const fallback = {
  id: "r-def",
  title: "پیش‌فرض",
  cost_type: "fixed" as const,
  cost_value: 0,
};

describe("shippingRuleMatches", () => {
  it("brand pick-list applies only to selected products of that brand", () => {
    assert.equal(shippingRuleMatches(brandPicks, lg24000, 1_000_000), true);
    assert.equal(shippingRuleMatches(brandPicks, lgOther, 1_000_000), false);
  });

  it("category and product rules still match independently", () => {
    assert.equal(shippingRuleMatches(categoryRule, lg24000, 1_000_000), true);
    assert.equal(shippingRuleMatches(productRule, lg24000, 1_000_000), true);
    assert.equal(shippingRuleMatches(productRule, lgOther, 1_000_000), false);
  });
});

describe("pickShippingRulesToApply", () => {
  it("sums every scoped match and drops the catch-all", () => {
    const matched = [brandPicks, categoryRule, productRule, fallback].filter((s) =>
      shippingRuleMatches(s, lg24000, 1_000_000),
    );
    const applied = pickShippingRulesToApply(matched);
    assert.deepEqual(
      applied.map((s) => s.id).sort(),
      ["r-brand", "r-cat", "r-prod"],
    );
    assert.equal(applied.some(isCatchAllShippingRule), false);
  });

  it("keeps the catch-all when nothing scoped matched", () => {
    const applied = pickShippingRulesToApply([fallback]);
    assert.deepEqual(
      applied.map((s) => s.id),
      ["r-def"],
    );
  });
});

describe("shippingRuleAmountToman", () => {
  it("adds fixed and percent amounts the engine will sum", () => {
    const a = shippingRuleAmountToman(brandPicks, 1_000_000, () => null).amount;
    const b = shippingRuleAmountToman(categoryRule, 1_000_000, () => null).amount;
    const c = shippingRuleAmountToman(productRule, 1_000_000, () => null).amount;
    assert.equal(a + b + c, 200_000 + 50_000 + 100_000);
  });
});
