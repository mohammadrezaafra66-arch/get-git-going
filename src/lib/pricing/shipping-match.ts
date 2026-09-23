/**
 * Shared shipping-rule match + stack.
 * A product pays the sum of every scoped rule that matches.
 * A catch-all (no product / brand / category / type / range / pick-list)
 * is only used when nothing scoped matched — so «هزینه حمل پیش‌فرض» does
 * not pile on top of every other rule.
 */

export type ShippingRuleRow = {
  id: string;
  title: string;
  cost_type: "fixed" | "percent" | "currency";
  cost_value: number;
  cost_currency?: string | null;
  product_type?: string | null;
  product_id?: string | null;
  brand_id?: string | null;
  category_id?: string | null;
  min_purchase_price?: number | null;
  max_purchase_price?: number | null;
  selected_product_ids?: string[];
};

export type ShippingProductRef = {
  id: string;
  brand_id?: string | null;
  category_id?: string | null;
  product_type?: string | null;
};

export function isCatchAllShippingRule(s: ShippingRuleRow): boolean {
  return (
    !s.product_id &&
    !s.brand_id &&
    !s.category_id &&
    !s.product_type &&
    s.min_purchase_price == null &&
    s.max_purchase_price == null &&
    (!s.selected_product_ids || s.selected_product_ids.length === 0)
  );
}

export function shippingRuleMatches(
  s: ShippingRuleRow,
  product: ShippingProductRef,
  purchase_price_toman: number,
): boolean {
  if (s.selected_product_ids && s.selected_product_ids.length > 0) {
    if (!s.selected_product_ids.includes(product.id)) return false;
  } else if (s.product_id && s.product_id !== product.id) {
    return false;
  }
  if (s.category_id && s.category_id !== product.category_id) return false;
  if (s.brand_id && s.brand_id !== product.brand_id) return false;
  if (s.product_type && s.product_type !== product.product_type) return false;
  if (s.min_purchase_price != null && purchase_price_toman < Number(s.min_purchase_price)) {
    return false;
  }
  if (s.max_purchase_price != null && purchase_price_toman > Number(s.max_purchase_price)) {
    return false;
  }
  return true;
}

export function pickShippingRulesToApply(candidates: ShippingRuleRow[]): ShippingRuleRow[] {
  const scoped = candidates.filter((s) => !isCatchAllShippingRule(s));
  return scoped.length > 0 ? scoped : candidates;
}

export function shippingRuleAmountToman(
  s: ShippingRuleRow,
  purchase_price_toman: number,
  currencyRate: (code: string) => number | null,
): { amount: number; rate: number | null; currencyCode: string | null } {
  if (s.cost_type === "percent") {
    return {
      amount: Math.round((purchase_price_toman * Number(s.cost_value)) / 100),
      rate: null,
      currencyCode: null,
    };
  }
  if (s.cost_type === "currency") {
    const code = (s.cost_currency ?? "").toString().toLowerCase();
    if (!code) {
      throw new Error("NO_SHIPPING_CURRENCY");
    }
    const rate = currencyRate(code);
    if (!rate || rate <= 0) {
      throw new Error("NO_SHIPPING_RATE");
    }
    return { amount: Math.round(Number(s.cost_value) * rate), rate, currencyCode: code };
  }
  return { amount: Math.round(Number(s.cost_value)), rate: null, currencyCode: null };
}

export function withSelectedProducts(row: {
  shipping_cost_rule_products?: { product_id: string }[] | null;
  [key: string]: unknown;
}): ShippingRuleRow {
  const picks = row.shipping_cost_rule_products;
  const ids = Array.isArray(picks) ? picks.map((p) => p.product_id).filter(Boolean) : [];
  return { ...(row as unknown as ShippingRuleRow), selected_product_ids: ids };
}
