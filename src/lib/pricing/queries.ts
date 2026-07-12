import { supabase } from "@/integrations/supabase/client";

type SbClient = typeof supabase;

export async function fetchSettlementTypes(activeOnly = false) {
  let q = supabase
    .from("settlement_types")
    .select("id, code, title, is_active, sort_order")
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function fetchChangeReasons(activeOnly = false) {
  let q = supabase.from("price_change_reasons").select("id, title, is_active").order("title");
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function fetchSuppliersLite() {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, is_active")
    .order("name", { ascending: true })
    .limit(500);
  if (error) throw error;
  return data ?? [];
}

export async function fetchShippingRulesLite() {
  const { data, error } = await supabase
    .from("shipping_cost_rules")
    .select("id, title, is_active, priority")
    .order("priority", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchSalePriceTypes(activeOnly = false) {
  let q = supabase
    .from("sale_price_types")
    .select("id, code, title, description, is_active, sort_order")
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/** جستجوی محصول برای autocomplete (limited). */
export async function searchProducts(term: string, limit = 15) {
  const t = (term ?? "").trim();
  if (!t) return [];
  const safe = t.replace(/[%_]/g, "");
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, name, sku, base_currency, product_type, brand:brands(name), category:categories(name)",
    )
    .or(`name.ilike.%${safe}%,sku.ilike.%${safe}%`)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function fetchProductLite(id: string, db: SbClient = supabase) {
  const { data, error } = await db
    .from("products")
    .select("id, name, sku, product_type, base_currency, brand_id, category_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** آخرین قیمت خرید معتبر یک محصول. */
export async function fetchLatestPurchasePrice(productId: string, db: SbClient = supabase) {
  const nowIso = new Date().toISOString();
  const { data, error } = await db
    .from("purchase_prices")
    .select(
      "id, product_id, supplier_id, purchase_price, currency, effective_at, expires_at, is_active",
    )
    .eq("product_id", productId)
    .eq("is_active", true)
    .lte("effective_at", nowIso)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order("effective_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** آخرین نرخ ارز فعال. */
export async function fetchLatestCurrencyRate(currency: string, db: SbClient = supabase) {
  const nowIso = new Date().toISOString();
  const { data, error } = await db
    .from("currency_rates")
    .select("id, currency, rate_to_toman, effective_at, is_active, source_name")
    .eq("currency", currency)
    .eq("is_active", true)
    .lte("effective_at", nowIso)
    .order("effective_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** آخرین snapshot قیمت فروش محصول. */
export async function fetchLatestSalePrice(productId: string) {
  const { data, error } = await supabase
    .from("price_calculation_snapshots")
    .select("id, rounded_sale_price, final_sale_price, calculated_at, pricing_rule_id")
    .eq("product_id", productId)
    .order("calculated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
