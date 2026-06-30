import { supabase } from "@/integrations/supabase/client";
import { fetchLatestCurrencyRate } from "./queries";
import { roundSalePrice, type CurrencyCode } from "./constants";
import { PricingError } from "./engine";

export interface QuickPriceInput {
  product_name?: string | null;
  purchase_price: number;
  currency: CurrencyCode;
  product_type: "iranian" | "foreign";
  category_id?: string | null;
  sale_price_type_id: string;
  settlement_type_id?: string | null;
  manual_shipping_cost?: number | null;
}

export interface QuickPriceBreakdown {
  product_name: string | null;
  input_purchase_price: number;
  input_currency: CurrencyCode;
  currency_rate: number;
  currency_rate_source: string | null;
  purchase_price_toman: number;
  product_type: "iranian" | "foreign";
  category_id: string | null;
  sale_price_type_id: string;
  settlement_type_id: string | null;
  pricing_rule_id: string;
  pricing_rule_name: string;
  shipping_rule: { id: string; title: string } | null;
  shipping_cost: number;
  shipping_is_manual: boolean;
  margin_amount: number;
  margin_type: "fixed" | "percent" | "mixed";
  margin_value: number;
  fixed_margin_value: number | null;
  final_sale_price: number;
  rounded_sale_price: number;
  steps: string[];
}

const fmt = (n: number) => n.toLocaleString("en-US");

/**
 * محاسبه قیمت سریع برای کالای خارج از لیست.
 * هیچ snapshot، history یا product رسمی ساخته نمی‌شود.
 */
export async function calculateQuickSalePrice(
  input: QuickPriceInput,
): Promise<QuickPriceBreakdown> {
  if (!input.purchase_price || input.purchase_price <= 0) {
    throw new PricingError("INVALID_PURCHASE_PRICE", "قیمت خرید باید عددی بزرگ‌تر از صفر باشد.");
  }
  if (!input.sale_price_type_id) {
    throw new PricingError("SALE_PRICE_TYPE_REQUIRED", "نوع قیمت فروش الزامی است.");
  }
  if (input.product_type !== "iranian" && input.product_type !== "foreign") {
    throw new PricingError("INVALID_PRODUCT_TYPE", "نوع کالا نامعتبر است.");
  }
  if (!["toman", "usd", "aed"].includes(input.currency)) {
    throw new PricingError("INVALID_CURRENCY", "ارز نامعتبر است.");
  }

  // 1) نرخ ارز
  let currency_rate = 1;
  let currency_rate_source: string | null = null;
  if (input.currency !== "toman") {
    const rate = await fetchLatestCurrencyRate(input.currency);
    if (!rate)
      throw new PricingError("NO_CURRENCY_RATE", "نرخ ارز معتبر برای محاسبه قیمت موجود نیست.");
    currency_rate = Number(rate.rate_to_toman);
    currency_rate_source = (rate as { source_name?: string | null }).source_name ?? null;
  }
  const input_purchase_price = Number(input.purchase_price);
  const purchase_price_toman = Math.round(input_purchase_price * currency_rate);

  // 2) pricing rule
  const { data: rules, error: rulesErr } = await supabase
    .from("pricing_rules")
    .select(
      "id, rule_name, name, product_type, category_id, brand_id, min_purchase_price_toman, max_purchase_price_toman, settlement_type_id, sale_price_type_id, margin_type, margin_value, fixed_margin_value, priority, created_at, is_active",
    )
    .eq("is_active", true)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(500);
  if (rulesErr) throw rulesErr;

  const matchedRule = (rules ?? []).find((r: any) => {
    if (r.sale_price_type_id && r.sale_price_type_id !== input.sale_price_type_id) return false;
    if (r.settlement_type_id) {
      if (!input.settlement_type_id) return false;
      if (r.settlement_type_id !== input.settlement_type_id) return false;
    }
    if (r.product_type && r.product_type !== input.product_type) return false;
    if (r.category_id) {
      if (!input.category_id) return false;
      if (r.category_id !== input.category_id) return false;
    }
    // brand_id در ابزار محاسبه سریع نادیده گرفته می‌شود
    if (
      r.min_purchase_price_toman != null &&
      purchase_price_toman < Number(r.min_purchase_price_toman)
    )
      return false;
    if (
      r.max_purchase_price_toman != null &&
      purchase_price_toman > Number(r.max_purchase_price_toman)
    )
      return false;
    if (!r.margin_type || r.margin_value == null) return false;
    return true;
  });

  if (!matchedRule)
    throw new PricingError("NO_RULE", "قانون قیمت‌گذاری مناسب برای این ورودی پیدا نشد.");
  const m = matchedRule as any;

  // 3) shipping
  let shipping_cost = 0;
  let shipping_rule_used: { id: string; title: string } | null = null;
  let shipping_is_manual = false;

  if (input.manual_shipping_cost != null && input.manual_shipping_cost >= 0) {
    shipping_cost = Math.round(Number(input.manual_shipping_cost));
    shipping_is_manual = true;
  } else {
    // اولویت تطبیق: محصول > دسته > برند > نوع کالا
    const { data: shippingRows, error: shippingErr } = await supabase
      .from("shipping_cost_rules")
      .select(
        "id, title, cost_type, cost_value, product_type, product_id, brand_id, category_id, min_purchase_price, max_purchase_price, is_active, sort_order, priority",
      )
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("priority", { ascending: true })
      .limit(500);
    if (shippingErr) throw shippingErr;
    const candidates = (shippingRows ?? []).filter((s: any) => {
      // quick-price بدون شناسه محصول است؛ قوانین مخصوص یک product خاص نادیده گرفته می‌شوند
      if (s.product_id) return false;
      if (s.category_id) {
        if (!input.category_id) return false;
        if (s.category_id !== input.category_id) return false;
      }
      // quick-price ورودی برند ندارد؛ قوانین مخصوص یک برند خاص نادیده گرفته می‌شوند
      if (s.brand_id) return false;
      if (s.product_type && s.product_type !== input.product_type) return false;
      if (s.min_purchase_price != null && purchase_price_toman < Number(s.min_purchase_price))
        return false;
      if (s.max_purchase_price != null && purchase_price_toman > Number(s.max_purchase_price))
        return false;
      return true;
    });
    const specificity = (s: any): number =>
      (s.category_id ? 100 : 0) + (s.brand_id ? 10 : 0) + (s.product_type ? 1 : 0);
    candidates.sort((a: any, b: any) => specificity(b) - specificity(a));
    const sRule = candidates[0];
    if (sRule) {
      shipping_rule_used = { id: sRule.id, title: sRule.title };
      if (sRule.cost_type === "percent") {
        shipping_cost = Math.round((purchase_price_toman * Number(sRule.cost_value)) / 100);
      } else if (sRule.cost_type === "currency") {
        // قوانین ارزی نیازمند نرخ ارز هستند و در quick-price (بدون product) صرفاً نادیده می‌گیریم
        shipping_cost = 0;
        shipping_rule_used = null;
      } else {
        shipping_cost = Math.round(Number(sRule.cost_value));
      }
    }
  }

  // 4) margin
  const margin_value = Number(m.margin_value);
  const fixed_margin_value = m.fixed_margin_value == null ? null : Number(m.fixed_margin_value);
  let margin_amount = 0;
  if (m.margin_type === "fixed") {
    margin_amount = Math.round(margin_value);
  } else if (m.margin_type === "percent") {
    margin_amount = Math.round((purchase_price_toman * margin_value) / 100);
  } else {
    margin_amount = Math.round(
      (purchase_price_toman * margin_value) / 100 + (fixed_margin_value ?? 0),
    );
  }

  // 5) final + round
  const final_sale_price = purchase_price_toman + shipping_cost + margin_amount;
  const rounded_sale_price = roundSalePrice(final_sale_price);

  const steps: string[] = [
    `قیمت خرید ورودی: ${fmt(input_purchase_price)} ${input.currency}`,
    input.currency === "toman"
      ? `ارز پایه تومان است؛ نرخ ارز ۱`
      : `نرخ ارز: ${fmt(currency_rate)} → قیمت خرید تومانی: ${fmt(purchase_price_toman)} تومان`,
    shipping_is_manual
      ? `هزینه حمل (دستی): ${fmt(shipping_cost)} تومان`
      : shipping_rule_used
        ? `هزینه حمل (${shipping_rule_used.title}): ${fmt(shipping_cost)} تومان`
        : "هزینه حمل: ۰ (قانون منطبق پیدا نشد)",
    m.margin_type === "fixed"
      ? `سود (مبلغ ثابت): ${fmt(margin_amount)} تومان`
      : m.margin_type === "percent"
        ? `سود (%${margin_value}): ${fmt(margin_amount)} تومان`
        : `سود (ترکیبی %${margin_value} + ${fmt(fixed_margin_value ?? 0)}): ${fmt(margin_amount)} تومان`,
    `قیمت نهایی: ${fmt(final_sale_price)} → گرد شده: ${fmt(rounded_sale_price)} تومان`,
  ];

  return {
    product_name: input.product_name?.trim() || null,
    input_purchase_price,
    input_currency: input.currency,
    currency_rate,
    currency_rate_source,
    purchase_price_toman,
    product_type: input.product_type,
    category_id: input.category_id ?? null,
    sale_price_type_id: input.sale_price_type_id,
    settlement_type_id: input.settlement_type_id ?? null,
    pricing_rule_id: m.id,
    pricing_rule_name: m.rule_name ?? m.name ?? "—",
    shipping_rule: shipping_rule_used,
    shipping_cost,
    shipping_is_manual,
    margin_amount,
    margin_type: m.margin_type,
    margin_value,
    fixed_margin_value,
    final_sale_price,
    rounded_sale_price,
    steps,
  };
}
