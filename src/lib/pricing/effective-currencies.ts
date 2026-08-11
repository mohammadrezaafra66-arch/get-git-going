import { supabase } from "@/integrations/supabase/client";
import { roundSalePrice, type CurrencyCode } from "./constants";

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

  // 5) Bulk-prefetch — یک‌بار همه داده‌های لازم را می‌گیریم تا N×M کوئری حذف شود.
  const nowIso = new Date().toISOString();
  const [productsRes, sptsRes, rulesRes, shippingRes, ratesRes] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, sku, product_type, base_currency, brand_id, category_id")
      .eq("base_currency", currency)
      .eq("status", "active")
      .in("stock_status", ["available", "limited"]),
    supabase.from("sale_price_types").select("id, title").eq("is_active", true).order("sort_order"),
    supabase
      .from("pricing_rules")
      .select(
        "id, rule_name, name, product_type, category_id, brand_id, min_purchase_price_toman, max_purchase_price_toman, settlement_type_id, sale_price_type_id, margin_type, margin_value, fixed_margin_value, priority, created_at",
      )
      .eq("is_active", true)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("shipping_cost_rules")
      .select(
        "id, title, cost_type, cost_value, cost_currency, product_type, product_id, brand_id, category_id, min_purchase_price, max_purchase_price, sort_order, priority",
      )
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("priority", { ascending: true })
      .limit(500),
    supabase
      .from("currency_rates")
      .select("currency, rate_to_toman, effective_at")
      .eq("is_active", true)
      .lte("effective_at", nowIso)
      .order("effective_at", { ascending: false }),
  ]);
  if (productsRes.error) throw productsRes.error;
  if (sptsRes.error) throw sptsRes.error;
  if (rulesRes.error) throw rulesRes.error;
  if (shippingRes.error) throw shippingRes.error;
  if (ratesRes.error) throw ratesRes.error;

  const products = productsRes.data ?? [];
  const spts = sptsRes.data ?? [];
  const rules = rulesRes.data ?? [];
  const shippingRules = shippingRes.data ?? [];
  const ratesAll = ratesRes.data ?? [];

  // نقشه آخرین نرخ فعال هر ارز (برای ارز پایه و ارز هزینه حمل)
  const rateMap = new Map<string, number>();
  for (const r of ratesAll) {
    const code = String(r.currency);
    if (!rateMap.has(code)) rateMap.set(code, Number(r.rate_to_toman));
  }
  // نرخ تازه درج‌شده باید مرجع باشد
  rateMap.set(currency, newRate);

  const productIds = products.map((p) => p.id);
  const sptIds = spts.map((s) => s.id);

  // قیمت‌های خرید و قیمت‌های قبلی به‌صورت bulk
  const [purchasesRes, prevRes] = await Promise.all([
    productIds.length > 0
      ? supabase
          .from("purchase_prices")
          .select("id, product_id, supplier_id, purchase_price, currency, effective_at, expires_at")
          .in("product_id", productIds)
          .eq("is_active", true)
          .lte("effective_at", nowIso)
          .order("effective_at", { ascending: false })
      : Promise.resolve({ data: [], error: null } as any),
    productIds.length > 0 && sptIds.length > 0
      ? supabase
          .from("product_computed_prices")
          .select("product_id, sale_price_type_id, rounded_sale_price")
          .in("product_id", productIds)
          .in("sale_price_type_id", sptIds)
          // Baseline rows only — currency recompute targets the settlement-NULL row.
          .is("settlement_type_id", null)
      : Promise.resolve({ data: [], error: null } as any),
  ]);
  if (purchasesRes.error) throw purchasesRes.error;
  if (prevRes.error) throw prevRes.error;

  // آخرین قیمت خرید معتبر برای هر محصول
  const latestPurchase = new Map<string, any>();
  for (const pp of purchasesRes.data ?? []) {
    if (pp.expires_at && new Date(pp.expires_at) <= new Date(nowIso)) continue;
    if (!latestPurchase.has(pp.product_id)) latestPurchase.set(pp.product_id, pp);
  }

  const prevMap = new Map<string, number>();
  for (const r of prevRes.data ?? []) {
    prevMap.set(`${r.product_id}|${r.sale_price_type_id}`, Number(r.rounded_sale_price));
  }

  // محاسبه in-memory
  const results: RecomputeSummary[] = [];
  const upsertRows: any[] = [];

  const computedAt = new Date().toISOString();

  for (const p of products) {
    const purchase = latestPurchase.get(p.id);
    for (const spt of spts) {
      try {
        if (!purchase) {
          throw new Error("قیمت خرید معتبر برای این محصول پیدا نشد.");
        }
        const inputPrice = Number(purchase.purchase_price);
        const baseCurrency = String(purchase.currency) as CurrencyCode;
        const currency_rate = baseCurrency === "toman" ? 1 : (rateMap.get(baseCurrency) ?? 0);
        if (baseCurrency !== "toman" && (!currency_rate || currency_rate <= 0)) {
          throw new Error(`نرخ ارز ${baseCurrency} موجود نیست.`);
        }
        const purchase_price_toman = Math.round(inputPrice * currency_rate);

        // پیدا کردن قانون قیمت‌گذاری
        const matched = rules.find((r: any) => {
          if (r.sale_price_type_id && r.sale_price_type_id !== spt.id) return false;
          if (r.product_type && r.product_type !== p.product_type) return false;
          if (r.category_id && r.category_id !== p.category_id) return false;
          if (r.brand_id && r.brand_id !== p.brand_id) return false;
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
        if (!matched) throw new Error("قانون قیمت‌گذاری مناسب پیدا نشد.");

        // قانون حمل
        const candidates = shippingRules.filter((s: any) => {
          if (s.product_id && s.product_id !== p.id) return false;
          if (s.category_id && s.category_id !== p.category_id) return false;
          if (s.brand_id && s.brand_id !== p.brand_id) return false;
          if (s.product_type && s.product_type !== p.product_type) return false;
          if (s.min_purchase_price != null && purchase_price_toman < Number(s.min_purchase_price))
            return false;
          if (s.max_purchase_price != null && purchase_price_toman > Number(s.max_purchase_price))
            return false;
          return true;
        });
        const specificity = (s: any) =>
          (s.product_id ? 1000 : 0) +
          (s.category_id ? 100 : 0) +
          (s.brand_id ? 10 : 0) +
          (s.product_type ? 1 : 0);
        candidates.sort((a: any, b: any) => specificity(b) - specificity(a));
        const sRule = candidates[0];
        let shipping_cost = 0;
        if (sRule) {
          if (sRule.cost_type === "percent") {
            shipping_cost = Math.round((purchase_price_toman * Number(sRule.cost_value)) / 100);
          } else if (sRule.cost_type === "currency") {
            const code = String(sRule.cost_currency ?? "").toLowerCase();
            const rate = rateMap.get(code) ?? 0;
            if (!rate || rate <= 0) throw new Error(`نرخ ارز ${code} برای حمل پیدا نشد.`);
            shipping_cost = Math.round(Number(sRule.cost_value) * rate);
          } else {
            shipping_cost = Math.round(Number(sRule.cost_value));
          }
        }

        // سود
        const margin_value = Number((matched as any).margin_value);
        const fixed_margin_value =
          (matched as any).fixed_margin_value == null
            ? null
            : Number((matched as any).fixed_margin_value);
        let margin_amount = 0;
        if ((matched as any).margin_type === "fixed") {
          margin_amount = Math.round(margin_value);
        } else if ((matched as any).margin_type === "percent") {
          margin_amount = Math.round((purchase_price_toman * margin_value) / 100);
        } else {
          margin_amount = Math.round(
            (purchase_price_toman * margin_value) / 100 + (fixed_margin_value ?? 0),
          );
        }

        const final_sale_price = purchase_price_toman + shipping_cost + margin_amount;
        const rounded_sale_price = roundSalePrice(final_sale_price);

        const oldPrice = prevMap.get(`${p.id}|${spt.id}`) ?? null;
        const changePct =
          oldPrice && oldPrice > 0
            ? Number((((rounded_sale_price - oldPrice) / oldPrice) * 100).toFixed(2))
            : null;

        upsertRows.push({
          product_id: p.id,
          sale_price_type_id: spt.id,
          settlement_type_id: null,
          purchase_price_id: purchase.id,
          pricing_rule_id: (matched as any).id,
          input_purchase_price: inputPrice,
          input_currency: baseCurrency,
          currency_rate,
          purchase_price_toman,
          shipping_cost,
          margin_amount,
          final_sale_price,
          rounded_sale_price,
          computed_at: computedAt,
          computed_by: actorId,
          source: "currency_rate_change",
        });

        results.push({
          product_id: p.id,
          product_name: p.name,
          sale_price_type_id: spt.id,
          sale_price_type_title: spt.title,
          old_price: oldPrice,
          new_price: rounded_sale_price,
          change_pct: changePct,
          error: null,
        });
      } catch (e) {
        results.push({
          product_id: p.id,
          product_name: p.name,
          sale_price_type_id: spt.id,
          sale_price_type_title: spt.title,
          old_price: null,
          new_price: 0,
          change_pct: null,
          error: (e as Error)?.message ?? "خطای ناشناخته",
        });
      }
    }
  }

  // bulk upsert در chunkهای 200تایی
  const CHUNK = 200;
  for (let i = 0; i < upsertRows.length; i += CHUNK) {
    const chunk = upsertRows.slice(i, i + CHUNK);
    const { error: upErr } = await supabase
      .from("product_computed_prices")
      .upsert(chunk, { onConflict: "product_id,sale_price_type_id,settlement_type_id" });
    if (upErr) {
      // علامت‌گذاری خطا روی این chunk
      for (const row of chunk) {
        const idx = results.findIndex(
          (r) =>
            r.product_id === row.product_id &&
            r.sale_price_type_id === row.sale_price_type_id &&
            !r.error,
        );
        if (idx >= 0) {
          results[idx] = {
            ...results[idx],
            error: upErr.message,
          };
        }
      }
    }
  }

  return { rateId, results };
}
