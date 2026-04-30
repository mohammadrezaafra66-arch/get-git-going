import { supabase } from "@/integrations/supabase/client";
import { calculateSalePrice, PricingError } from "./engine";

export interface EffectiveCurrency {
  code: string;
  title: string;
  symbol: string | null;
  is_active: boolean;
  sort_order: number;
  latest_rate: number | null;
  latest_rate_at: string | null;
  latest_rate_id: string | null;
  affected_products_count: number;
}

/** ارزهای مؤثر = ارزهایی که حداقل یک محصول active + (available|limited) با آن ارز پایه دارند. */
export async function fetchEffectiveCurrencies(): Promise<EffectiveCurrency[]> {
  const { data: currencies, error: cErr } = await supabase
    .from("effective_currencies_view")
    .select("code, title, symbol, is_active, sort_order")
    .order("sort_order", { ascending: true })
    .order("code", { ascending: true });
  if (cErr) throw cErr;
  if (!currencies || currencies.length === 0) return [];

  const codes = currencies.map((c) => c.code as string);

  // آخرین نرخ فعال هر ارز
  const { data: rates, error: rErr } = await supabase
    .from("currency_rates")
    .select("id, currency, rate_to_toman, effective_at")
    .in("currency", codes)
    .eq("is_active", true)
    .order("effective_at", { ascending: false });
  if (rErr) throw rErr;

  const latestByCode = new Map<string, { id: string; rate: number; at: string }>();
  (rates ?? []).forEach((r) => {
    if (!latestByCode.has(r.currency as string)) {
      latestByCode.set(r.currency as string, {
        id: r.id,
        rate: Number(r.rate_to_toman),
        at: r.effective_at,
      });
    }
  });

  // شمارش محصولات مؤثر هر ارز
  const counts = new Map<string, number>();
  await Promise.all(
    codes.map(async (code) => {
      const { count } = await supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("base_currency", code)
        .eq("status", "active")
        .in("stock_status", ["available", "limited"]);
      counts.set(code, count ?? 0);
    }),
  );

  return currencies.map((c) => {
    const latest = latestByCode.get(c.code as string) ?? null;
    return {
      code: c.code as string,
      title: c.title as string,
      symbol: (c.symbol as string | null) ?? null,
      is_active: c.is_active as boolean,
      sort_order: (c.sort_order as number) ?? 0,
      latest_rate: latest?.rate ?? null,
      latest_rate_at: latest?.at ?? null,
      latest_rate_id: latest?.id ?? null,
      affected_products_count: counts.get(c.code as string) ?? 0,
    };
  });
}

export interface RecomputeSummary {
  product_id: string;
  product_name: string;
  sale_price_type_id: string;
  sale_price_type_title: string;
  old_price: number | null;
  new_price: number;
  change_pct: number | null;
  error: string | null;
}

/**
 * ثبت نرخ ارز جدید + بازمحاسبه قیمت فروش همه محصولات مؤثر و ذخیره در product_computed_prices.
 * - رکورد فعال قبلی نرخ همان ارز را غیرفعال می‌کند.
 * - برای هر محصول مؤثر، برای همه sale_price_typeهای فعال محاسبه و upsert انجام می‌دهد.
 * - audit log ثبت می‌کند.
 */
export async function saveCurrencyRateAndRecompute(opts: {
  currency: string;
  newRate: number;
  actorId: string;
}): Promise<{ rateId: string; results: RecomputeSummary[] }> {
  const { currency, newRate, actorId } = opts;
  if (!Number.isFinite(newRate) || newRate <= 0) {
    throw new Error("نرخ ارز معتبر نیست.");
  }

  // 1) آخرین نرخ فعلی (برای audit)
  const { data: prev } = await supabase
    .from("currency_rates")
    .select("id, rate_to_toman")
    .eq("currency", currency)
    .eq("is_active", true)
    .order("effective_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const prevRate = prev ? Number(prev.rate_to_toman) : null;

  // 2) غیرفعال کردن همه نرخ‌های فعال قبلی همان ارز
  const { error: deactErr } = await supabase
    .from("currency_rates")
    .update({ is_active: false })
    .eq("currency", currency)
    .eq("is_active", true);
  if (deactErr) throw deactErr;

  // 3) درج نرخ جدید
  const { data: inserted, error: insErr } = await supabase
    .from("currency_rates")
    .insert({
      currency,
      rate_to_toman: newRate,
      source_name: "ویرایش دستی سریع",
      effective_at: new Date().toISOString(),
      is_active: true,
      created_by: actorId,
      approved_by: actorId,
      approved_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (insErr) throw insErr;
  const rateId = inserted.id;

  // 4) audit
  await supabase.from("audit_logs").insert({
    action: "currency_rate_quick_update",
    entity_type: "currency_rates",
    entity_id: rateId,
    actor_id: actorId,
    diff: {
      currency,
      from: prevRate,
      to: newRate,
      change_pct:
        prevRate && prevRate > 0
          ? Number((((newRate - prevRate) / prevRate) * 100).toFixed(2))
          : null,
    } as never,
  });

  // 5) محصولات مؤثر این ارز
  const { data: products, error: pErr } = await supabase
    .from("products")
    .select("id, name, sku")
    .eq("base_currency", currency)
    .eq("status", "active")
    .in("stock_status", ["available", "limited"]);
  if (pErr) throw pErr;

  // 6) sale_price_types فعال
  const { data: spts, error: sptErr } = await supabase
    .from("sale_price_types")
    .select("id, title")
    .eq("is_active", true)
    .order("sort_order");
  if (sptErr) throw sptErr;

  const results: RecomputeSummary[] = [];

  // 7) برای هر محصول × sale_price_type — محاسبه و upsert (sequential برای کنترل بار)
  for (const p of products ?? []) {
    for (const spt of spts ?? []) {
      try {
        const res = await calculateSalePrice({
          product_id: p.id,
          sale_price_type_id: spt.id,
          force_snapshot: false,
        });

        // قیمت قبلی از کش
        const { data: prevComputed } = await supabase
          .from("product_computed_prices")
          .select("rounded_sale_price")
          .eq("product_id", p.id)
          .eq("sale_price_type_id", spt.id)
          .maybeSingle();
        const oldPrice = prevComputed ? Number(prevComputed.rounded_sale_price) : null;
        const newPrice = res.breakdown.rounded_sale_price;
        const changePct =
          oldPrice && oldPrice > 0
            ? Number((((newPrice - oldPrice) / oldPrice) * 100).toFixed(2))
            : null;

        // upsert
        const { error: upErr } = await supabase
          .from("product_computed_prices")
          .upsert(
            {
              product_id: p.id,
              sale_price_type_id: spt.id,
              purchase_price_id: res.breakdown.purchase_price_id,
              pricing_rule_id: res.breakdown.pricing_rule_id,
              input_purchase_price: res.breakdown.input_purchase_price,
              input_currency: res.breakdown.input_currency,
              currency_rate: res.breakdown.currency_rate,
              purchase_price_toman: res.breakdown.purchase_price_toman,
              shipping_cost: res.breakdown.shipping_cost,
              margin_amount: res.breakdown.margin_amount,
              final_sale_price: res.breakdown.final_sale_price,
              rounded_sale_price: res.breakdown.rounded_sale_price,
              computed_at: new Date().toISOString(),
              computed_by: actorId,
              source: "currency_rate_change",
            },
            { onConflict: "product_id,sale_price_type_id" },
          );
        if (upErr) throw upErr;

        results.push({
          product_id: p.id,
          product_name: p.name,
          sale_price_type_id: spt.id,
          sale_price_type_title: spt.title,
          old_price: oldPrice,
          new_price: newPrice,
          change_pct: changePct,
          error: null,
        });
      } catch (e) {
        const msg = e instanceof PricingError ? e.message : (e as Error)?.message ?? "خطای ناشناخته";
        results.push({
          product_id: p.id,
          product_name: p.name,
          sale_price_type_id: spt.id,
          sale_price_type_title: spt.title,
          old_price: null,
          new_price: 0,
          change_pct: null,
          error: msg,
        });
      }
    }
  }

  return { rateId, results };
}