import { supabase } from "@/integrations/supabase/client";
import { fetchLatestCurrencyRate, fetchLatestPurchasePrice, fetchProductLite } from "./queries";
import { roundSalePrice, type CurrencyCode } from "./constants";

type SbClient = typeof supabase;

export interface PricingEngineInput {
  product_id: string;
  sale_price_type_id: string;
  settlement_type_id?: string | null;
  purchase_price_id?: string | null;
  force_snapshot?: boolean;
  /** Optional override created_by for snapshot/history when running server-side without auth.uid() */
  acting_user_id?: string | null;
}

export interface PricingBreakdown {
  product_id: string;
  product_name: string;
  product_sku: string | null;
  purchase_price_id: string;
  pricing_rule_id: string;
  pricing_rule_name: string;
  sale_price_type_id: string;
  settlement_type_id: string | null;
  input_purchase_price: number;
  input_currency: CurrencyCode;
  currency_rate: number;
  currency_rate_source: string | null;
  purchase_price_toman: number;
  shipping_cost: number;
  shipping_rule: { id: string; title: string } | null;
  margin_amount: number;
  margin_type: "fixed" | "percent" | "mixed";
  margin_value: number;
  fixed_margin_value: number | null;
  final_sale_price: number;
  rounded_sale_price: number;
  steps: string[];
}

export interface PricingEngineResult {
  ok: true;
  breakdown: PricingBreakdown;
  snapshot_id: string | null;
  history_id: string | null;
  old_sale_price: number | null;
}

export class PricingError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "PricingError";
  }
}

const fmt = (n: number) => n.toLocaleString("en-US");

/**
 * موتور قیمت‌گذاری افراکالا.
 * فرمول کلی:
 *   purchase_price_toman = input_purchase_price * currency_rate
 *   shipping_cost        = fixed | percent of purchase_price_toman
 *   margin_amount        = fixed | percent | mixed
 *   final_sale_price     = purchase_price_toman + shipping_cost + margin_amount
 *   rounded_sale_price   = roundSalePrice(final_sale_price)
 */
export async function calculateSalePrice(
  input: PricingEngineInput,
  db: SbClient = supabase,
): Promise<PricingEngineResult> {
  if (!input.product_id) throw new PricingError("PRODUCT_REQUIRED", "محصول الزامی است.");
  if (!input.sale_price_type_id)
    throw new PricingError("SALE_PRICE_TYPE_REQUIRED", "نوع قیمت فروش الزامی است.");

  // 1) محصول
  const product = await fetchProductLite(input.product_id, db);
  if (!product) throw new PricingError("PRODUCT_NOT_FOUND", "محصول مورد نظر یافت نشد.");

  // 2) قیمت خرید
  type Purchase = {
    id: string;
    product_id: string;
    supplier_id: string | null;
    purchase_price: number;
    currency: CurrencyCode;
  };
  let purchase: Purchase | null = null;
  if (input.purchase_price_id) {
    const { data, error } = await db
      .from("purchase_prices")
      .select(
        "id, product_id, supplier_id, purchase_price, currency, is_active, effective_at, expires_at",
      )
      .eq("id", input.purchase_price_id)
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
    const latest = await fetchLatestPurchasePrice(input.product_id, db);
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
    throw new PricingError(
      "NO_PURCHASE_PRICE",
      "برای این محصول هنوز قیمت خرید معتبر ثبت نشده است.",
    );
  }

  // 3) نرخ ارز
  let currency_rate = 1;
  let currency_rate_source: string | null = null;
  if (purchase.currency !== "toman") {
    const rate = await fetchLatestCurrencyRate(purchase.currency, db);
    if (!rate)
      throw new PricingError("NO_CURRENCY_RATE", "نرخ ارز معتبر برای محاسبه قیمت موجود نیست.");
    currency_rate = Number(rate.rate_to_toman);
    currency_rate_source = (rate as { source_name?: string | null }).source_name ?? null;
  }
  const input_purchase_price = Number(purchase.purchase_price);
  const purchase_price_toman = Math.round(input_purchase_price * currency_rate);

  // 4) قانون قیمت‌گذاری
  const { data: rules, error: rulesErr } = await db
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
    // اگر ورودی settlement مشخص کرده، باید با قانون یکسان باشد.
    // اگر ورودی settlement ندارد (مثل «محاسبه و انتشار قیمت‌ها»)، قانون‌هایی که
    // فقط روی sale_price_type کار می‌کنند یا settlement خودشان را دارند نیز پذیرفته می‌شوند.
    if (
      input.settlement_type_id &&
      r.settlement_type_id &&
      r.settlement_type_id !== input.settlement_type_id
    )
      return false;
    if (r.product_type && r.product_type !== product.product_type) return false;
    if (r.category_id && r.category_id !== product.category_id) return false;
    if (r.brand_id && r.brand_id !== product.brand_id) return false;
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
    throw new PricingError("NO_RULE", "قانون قیمت‌گذاری مناسب برای این محصول پیدا نشد.");
  const m = matchedRule as any;
  // settlement مؤثر = ورودی کاربر یا settlement قانون انتخاب‌شده
  const effective_settlement_type_id: string | null =
    input.settlement_type_id ?? m.settlement_type_id ?? null;

  // 5) قانون حمل — همیشه از shipping_cost_rules انتخاب می‌شود
  // (اولویت تطبیق: محصول > برند > دسته > نوع کالا)
  let shipping_cost = 0;
  let shipping_rule_used: { id: string; title: string } | null = null;
  const { data: shippingRows, error: shippingErr } = await db
    .from("shipping_cost_rules")
    .select(
      "id, title, cost_type, cost_value, cost_currency, product_type, product_id, brand_id, category_id, min_purchase_price, max_purchase_price, is_active, sort_order, priority",
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("priority", { ascending: true })
    .limit(500);
  if (shippingErr) throw shippingErr;
  const candidates = (shippingRows ?? []).filter((s: any) => {
    if (s.product_id && s.product_id !== product.id) return false;
    if (s.category_id && s.category_id !== product.category_id) return false;
    if (s.brand_id && s.brand_id !== product.brand_id) return false;
    if (s.product_type && s.product_type !== product.product_type) return false;
    if (s.min_purchase_price != null && purchase_price_toman < Number(s.min_purchase_price))
      return false;
    if (s.max_purchase_price != null && purchase_price_toman > Number(s.max_purchase_price))
      return false;
    return true;
  });
  // اولویت‌بندی صریح: محصول > برند > دسته > نوع کالا (نیازمندی ۱۲۷).
  // مجموع امتیازها باعث می‌شود قانونِ باریک‌ترِ زنجیرهٔ دسته→برند→محصول
  // (که چند فیلد را هم‌زمان مقید می‌کند) خاص‌تر از قانونِ تک‌بُعدی شمرده شود.
  const specificity = (s: any): number =>
    (s.product_id ? 1000 : 0) +
    (s.brand_id ? 100 : 0) +
    (s.category_id ? 10 : 0) +
    (s.product_type ? 1 : 0);
  candidates.sort((a: any, b: any) => specificity(b) - specificity(a));
  const sRule = candidates[0];
  let shipping_currency_rate: number | null = null;
  if (sRule) {
    shipping_rule_used = { id: sRule.id, title: sRule.title };
    if (sRule.cost_type === "percent") {
      shipping_cost = Math.round((purchase_price_toman * Number(sRule.cost_value)) / 100);
    } else if (sRule.cost_type === "currency") {
      const code = (sRule.cost_currency ?? "").toString().toLowerCase();
      if (!code)
        throw new PricingError("NO_SHIPPING_CURRENCY", "نوع ارز برای قانون حمل تعیین نشده است.");
      const { data: rateRows, error: rateErr } = await db
        .from("currency_rates")
        .select("rate_to_toman")
        .eq("currency", code)
        .eq("is_active", true)
        .order("effective_at", { ascending: false })
        .limit(1);
      if (rateErr) throw rateErr;
      const rate = rateRows && rateRows[0] ? Number(rateRows[0].rate_to_toman) : 0;
      if (!rate || rate <= 0) {
        throw new PricingError("NO_SHIPPING_RATE", `نرخ فعال برای ارز ${code} پیدا نشد.`);
      }
      shipping_currency_rate = rate;
      shipping_cost = Math.round(Number(sRule.cost_value) * rate);
    } else {
      shipping_cost = Math.round(Number(sRule.cost_value));
    }
  }

  // 6) سود
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

  // 7) قیمت نهایی + گرد کردن
  const final_sale_price = purchase_price_toman + shipping_cost + margin_amount;
  const rounded_sale_price = roundSalePrice(final_sale_price);

  const steps: string[] = [
    `قیمت خرید ورودی: ${fmt(input_purchase_price)} ${purchase.currency}`,
    purchase.currency === "toman"
      ? `ارز پایه تومان است؛ نرخ ارز ۱`
      : `نرخ ارز: ${fmt(currency_rate)} → قیمت خرید تومانی: ${fmt(purchase_price_toman)} تومان`,
    sRule
      ? sRule.cost_type === "currency"
        ? `هزینه حمل (${sRule.title}) — ${fmt(Number(sRule.cost_value))} ${sRule.cost_currency} × نرخ ${fmt(shipping_currency_rate ?? 0)} = ${fmt(shipping_cost)} تومان`
        : `هزینه حمل (${sRule.title}): ${fmt(shipping_cost)} تومان`
      : "هزینه حمل: ۰ (قانون منطبق پیدا نشد)",
    m.margin_type === "fixed"
      ? `سود (مبلغ ثابت): ${fmt(margin_amount)} تومان`
      : m.margin_type === "percent"
        ? `سود (%${margin_value}): ${fmt(margin_amount)} تومان`
        : `سود (ترکیبی %${margin_value} + ${fmt(fixed_margin_value ?? 0)}): ${fmt(margin_amount)} تومان`,
    `قیمت نهایی: ${fmt(final_sale_price)} → گرد شده: ${fmt(rounded_sale_price)} تومان`,
  ];

  const breakdown: PricingBreakdown = {
    product_id: product.id,
    product_name: product.name,
    product_sku: product.sku,
    purchase_price_id: purchase.id,
    pricing_rule_id: m.id,
    pricing_rule_name: m.rule_name ?? m.name ?? "—",
    sale_price_type_id: input.sale_price_type_id,
    settlement_type_id: effective_settlement_type_id,
    input_purchase_price,
    input_currency: purchase.currency,
    currency_rate,
    currency_rate_source,
    purchase_price_toman,
    shipping_cost,
    shipping_rule: shipping_rule_used,
    margin_amount,
    margin_type: m.margin_type,
    margin_value,
    fixed_margin_value,
    final_sale_price,
    rounded_sale_price,
    steps,
  };

  let snapshot_id: string | null = null;
  let history_id: string | null = null;
  let old_sale_price: number | null = null;

  if (input.force_snapshot) {
    let uid: string | null = input.acting_user_id ?? null;
    if (uid === null) {
      try {
        const { data: userData } = await db.auth.getUser();
        uid = userData.user?.id ?? null;
      } catch {
        uid = null;
      }
    }

    const { data: snap, error: snapErr } = await db
      .from("price_calculation_snapshots")
      .insert({
        product_id: product.id,
        purchase_price_id: purchase.id,
        pricing_rule_id: m.id,
        settlement_type_id: effective_settlement_type_id,
        sale_price_type_id: input.sale_price_type_id,
        input_purchase_price,
        input_currency: purchase.currency,
        currency_rate,
        purchase_price_toman,
        shipping_cost,
        margin_amount,
        final_sale_price,
        rounded_sale_price,
        calculation_details: breakdown as any,
        calculated_by: uid,
      })
      .select("id")
      .single();
    if (snapErr) throw snapErr;
    snapshot_id = snap.id;

    // آخرین قیمت فروش ثبت‌شده برای همان محصول و همان sale_price_type
    const { data: lastHist, error: lastErr } = await db
      .from("product_sale_price_history")
      .select("id, new_sale_price")
      .eq("product_id", product.id)
      .eq("sale_price_type_id", input.sale_price_type_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastErr) throw lastErr;

    old_sale_price = lastHist ? Number(lastHist.new_sale_price) : null;

    if (old_sale_price === null || old_sale_price !== rounded_sale_price) {
      const change_amount = old_sale_price === null ? null : rounded_sale_price - old_sale_price;
      const change_percent =
        old_sale_price === null || old_sale_price === 0
          ? null
          : Math.round(((rounded_sale_price - old_sale_price) / old_sale_price) * 10000) / 100;
      const { data: hist, error: histErr } = await db
        .from("product_sale_price_history")
        .insert({
          product_id: product.id,
          snapshot_id: snap.id,
          sale_price_type_id: input.sale_price_type_id,
          old_sale_price,
          new_sale_price: rounded_sale_price,
          change_amount,
          change_percent,
          created_by: uid,
        })
        .select("id")
        .single();
      if (histErr) throw histErr;
      history_id = hist.id;
    }
  }

  return { ok: true, breakdown, snapshot_id, history_id, old_sale_price };
}
