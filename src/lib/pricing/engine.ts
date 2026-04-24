import { supabase } from "@/integrations/supabase/client";
import {
  fetchLatestCurrencyRate,
  fetchLatestPurchasePrice,
  fetchLatestSalePrice,
  fetchProductLite,
} from "./queries";
import { roundSalePrice, type CurrencyCode } from "./constants";

export interface PricingEngineOptions {
  settlement_type_id?: string | null;
  /** اگر مشخص شد، به جای آخرین قیمت خرید همین رکورد استفاده می‌شود. */
  purchase_price_id?: string | null;
  /** ذخیره snapshot در دیتابیس. */
  force_snapshot?: boolean;
  calculated_by?: string | null;
}

export interface PricingBreakdown {
  product: { id: string; name: string; sku: string | null; product_type: "iranian" | "foreign" };
  purchase_price_id: string;
  input_purchase_price: number;
  input_currency: CurrencyCode;
  currency_rate: number;
  purchase_price_toman: number;
  shipping_cost: number;
  shipping_rule: { id: string; title: string } | null;
  margin_amount: number;
  pricing_rule: { id: string; rule_name: string; margin_type: string; margin_value: number; fixed_margin_value: number | null };
  final_sale_price: number;
  rounded_sale_price: number;
  settlement_type_id: string | null;
  /** توضیح قابل خواندن خط به خط. */
  steps: string[];
}

export interface PricingEngineResult {
  ok: true;
  breakdown: PricingBreakdown;
  snapshot_id: string | null;
  history_id: string | null;
}

export class PricingError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * موتور قیمت‌گذاری افراکالا.
 * فرمول کلی:
 *   purchase_price_toman = input_purchase_price * currency_rate
 *   shipping_cost = (fixed) cost_value یا (percent) purchase_price_toman * cost_value/100
 *   margin_amount =
 *     fixed   → margin_value
 *     percent → purchase_price_toman * margin_value / 100
 *     mixed   → purchase_price_toman * margin_value / 100 + (fixed_margin_value ?? 0)
 *   final_sale_price = purchase_price_toman + shipping_cost + margin_amount
 *   rounded_sale_price = roundSalePrice(final_sale_price)
 */
export async function calculateSalePrice(
  productId: string,
  options: PricingEngineOptions = {}
): Promise<PricingEngineResult> {
  const product = await fetchProductLite(productId);
  if (!product) throw new PricingError("PRODUCT_NOT_FOUND", "محصول مورد نظر یافت نشد.");

  // 1) قیمت خرید
  type PurchaseRec = { id: string; product_id: string; supplier_id: string | null; purchase_price: number; currency: CurrencyCode };
  let purchase: PurchaseRec | null = null;
  if (options.purchase_price_id) {
    const { data, error } = await supabase
      .from("purchase_prices")
      .select("id, product_id, supplier_id, purchase_price, currency, is_active")
      .eq("id", options.purchase_price_id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new PricingError("PURCHASE_NOT_FOUND", "قیمت خرید انتخاب‌شده یافت نشد.");
    purchase = {
      id: data.id,
      product_id: data.product_id,
      supplier_id: data.supplier_id,
      purchase_price: Number(data.purchase_price),
      currency: data.currency as CurrencyCode,
    };
  } else {
    const latest = await fetchLatestPurchasePrice(productId);
    if (latest) {
      purchase = {
        id: latest.id,
        product_id: latest.product_id,
        supplier_id: latest.supplier_id,
        purchase_price: Number(latest.purchase_price),
        currency: latest.currency as CurrencyCode,
      };
    }
  }
  if (!purchase) {
    throw new PricingError("NO_PURCHASE_PRICE", "برای این محصول هنوز قیمت خرید ثبت نشده است.");
  }

  // 2) نرخ ارز
  let currency_rate = 1;
  if (purchase.currency !== "toman") {
    const rate = await fetchLatestCurrencyRate(purchase.currency);
    if (!rate) throw new PricingError("NO_CURRENCY_RATE", "نرخ ارز معتبر برای محاسبه قیمت موجود نیست.");
    currency_rate = Number(rate.rate_to_toman);
  }
  const input_purchase_price = Number(purchase.purchase_price);
  const purchase_price_toman = Math.round(input_purchase_price * currency_rate);

  // 3) قانون قیمت‌گذاری مناسب (priority asc → کمتر = اولویت بیشتر)
  const { data: rules, error: rulesErr } = await supabase
    .from("pricing_rules")
    .select("id, rule_name, name, product_type, category_id, brand_id, min_purchase_price_toman, max_purchase_price_toman, settlement_type_id, margin_type, margin_value, fixed_margin_value, shipping_cost_rule_id, priority, is_active")
    .eq("is_active", true)
    .order("priority", { ascending: true })
    .limit(500);
  if (rulesErr) throw rulesErr;

  const matchedRule = (rules ?? []).find((r: any) => {
    if (r.product_type && r.product_type !== product.product_type) return false;
    if (r.category_id && r.category_id !== product.category_id) return false;
    if (r.brand_id && r.brand_id !== product.brand_id) return false;
    if (r.settlement_type_id && options.settlement_type_id && r.settlement_type_id !== options.settlement_type_id) return false;
    if (r.settlement_type_id && !options.settlement_type_id) return false;
    if (r.min_purchase_price_toman != null && purchase_price_toman < Number(r.min_purchase_price_toman)) return false;
    if (r.max_purchase_price_toman != null && purchase_price_toman > Number(r.max_purchase_price_toman)) return false;
    if (!r.margin_type || r.margin_value == null) return false;
    return true;
  });

  if (!matchedRule) throw new PricingError("NO_RULE", "قانون قیمت‌گذاری مناسب برای این محصول پیدا نشد.");

  // 4) قانون هزینه حمل
  let shipping_cost = 0;
  let shipping_rule_used: { id: string; title: string } | null = null;
  let candidateShippingRules: any[] = [];
  if ((matchedRule as any).shipping_cost_rule_id) {
    const { data, error } = await supabase
      .from("shipping_cost_rules")
      .select("id, title, cost_type, cost_value, product_type, category_id, min_purchase_price, max_purchase_price, is_active, priority")
      .eq("id", (matchedRule as any).shipping_cost_rule_id)
      .maybeSingle();
    if (error) throw error;
    if (data && data.is_active) candidateShippingRules = [data];
  } else {
    const { data, error } = await supabase
      .from("shipping_cost_rules")
      .select("id, title, cost_type, cost_value, product_type, category_id, min_purchase_price, max_purchase_price, is_active, priority")
      .eq("is_active", true)
      .order("priority", { ascending: true })
      .limit(200);
    if (error) throw error;
    candidateShippingRules = data ?? [];
  }

  const sRule = candidateShippingRules.find((s: any) => {
    if (s.product_type && s.product_type !== product.product_type) return false;
    if (s.category_id && s.category_id !== product.category_id) return false;
    if (s.min_purchase_price != null && purchase_price_toman < Number(s.min_purchase_price)) return false;
    if (s.max_purchase_price != null && purchase_price_toman > Number(s.max_purchase_price)) return false;
    return true;
  });
  if (sRule) {
    shipping_rule_used = { id: sRule.id, title: sRule.title };
    shipping_cost = sRule.cost_type === "percent"
      ? Math.round(purchase_price_toman * Number(sRule.cost_value) / 100)
      : Math.round(Number(sRule.cost_value));
  }

  // 5) margin
  const m = matchedRule as any;
  const margin_value = Number(m.margin_value);
  const fixed_margin_value = m.fixed_margin_value == null ? null : Number(m.fixed_margin_value);
  let margin_amount = 0;
  if (m.margin_type === "fixed") {
    margin_amount = Math.round(margin_value);
  } else if (m.margin_type === "percent") {
    margin_amount = Math.round((purchase_price_toman * margin_value) / 100);
  } else {
    margin_amount = Math.round((purchase_price_toman * margin_value) / 100 + (fixed_margin_value ?? 0));
  }

  const final_sale_price = purchase_price_toman + shipping_cost + margin_amount;
  const rounded_sale_price = roundSalePrice(final_sale_price);

  const steps: string[] = [];
  steps.push(`قیمت خرید ورودی: ${fmt(input_purchase_price)} ${purchase.currency}`);
  steps.push(`نرخ ارز: ${fmt(currency_rate)} → قیمت خرید تومانی: ${fmt(purchase_price_toman)} تومان`);
  steps.push(
    sRule
      ? `هزینه حمل (${sRule.title} / ${sRule.cost_type === "percent" ? `%${margin_value}` : "ثابت"}): ${fmt(shipping_cost)} تومان`
      : "هزینه حمل: ۰ (قانونی منطبق نشد)"
  );
  steps.push(
    m.margin_type === "fixed"
      ? `حاشیه سود (مبلغ ثابت): ${fmt(margin_amount)} تومان`
      : m.margin_type === "percent"
        ? `حاشیه سود (%${margin_value}): ${fmt(margin_amount)} تومان`
        : `حاشیه سود (ترکیبی %${margin_value} + ${fmt(fixed_margin_value ?? 0)}): ${fmt(margin_amount)} تومان`
  );
  steps.push(`قیمت نهایی: ${fmt(final_sale_price)} → گرد شده: ${fmt(rounded_sale_price)} تومان`);

  const breakdown: PricingBreakdown = {
    product: { id: product.id, name: product.name, sku: product.sku, product_type: product.product_type as "iranian" | "foreign" },
    purchase_price_id: purchase.id,
    input_purchase_price,
    input_currency: purchase.currency,
    currency_rate,
    purchase_price_toman,
    shipping_cost,
    shipping_rule: shipping_rule_used,
    margin_amount,
    pricing_rule: {
      id: m.id,
      rule_name: m.rule_name ?? m.name ?? "—",
      margin_type: m.margin_type,
      margin_value,
      fixed_margin_value,
    },
    final_sale_price,
    rounded_sale_price,
    settlement_type_id: options.settlement_type_id ?? null,
    steps,
  };

  let snapshot_id: string | null = null;
  let history_id: string | null = null;

  if (options.force_snapshot) {
    const { data: snap, error: snapErr } = await supabase
      .from("price_calculation_snapshots")
      .insert({
        product_id: product.id,
        purchase_price_id: purchase.id,
        pricing_rule_id: m.id,
        settlement_type_id: options.settlement_type_id ?? null,
        input_purchase_price,
        input_currency: purchase.currency,
        currency_rate,
        purchase_price_toman,
        shipping_cost,
        margin_amount,
        final_sale_price,
        rounded_sale_price,
        calculation_details: breakdown as any,
        calculated_by: options.calculated_by ?? null,
      })
      .select("id")
      .single();
    if (snapErr) throw snapErr;
    snapshot_id = snap.id;

    // اگر قیمت تغییر کرده، history ثبت کن
    const last = await fetchLatestSalePrice(product.id);
    // last == آخرین snapshot قبل از این یکی → چون snapshot جدید لحظاتی پیش ساخته شد،
    // باید بررسی کنیم که snapshot قبلی متفاوت باشد. پس از last در میان snapshotهای قبل از این جدید استفاده می‌کنیم:
    // برای سادگی: history را وقتی ثبت کن که rounded_sale_price با last فرق دارد یا last وجود ندارد.
    const oldPrice = last && last.id !== snap.id ? Number(last.rounded_sale_price) : null;
    if (oldPrice == null || oldPrice !== rounded_sale_price) {
      const change_amount = oldPrice == null ? null : rounded_sale_price - oldPrice;
      const change_percent = oldPrice == null || oldPrice === 0 ? null : Math.round(((rounded_sale_price - oldPrice) / oldPrice) * 10000) / 100;
      const { data: hist, error: histErr } = await supabase
        .from("product_sale_price_history")
        .insert({
          product_id: product.id,
          snapshot_id: snap.id,
          old_sale_price: oldPrice,
          new_sale_price: rounded_sale_price,
          change_amount,
          change_percent,
          created_by: options.calculated_by ?? null,
        })
        .select("id")
        .single();
      if (histErr) throw histErr;
      history_id = hist.id;
    }
  }

  return { ok: true, breakdown, snapshot_id, history_id };
}