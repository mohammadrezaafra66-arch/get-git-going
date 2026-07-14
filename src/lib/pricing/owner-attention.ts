import { supabase } from "@/integrations/supabase/client";

export type OwnerAttentionIssue = "no_purchase_price" | "unavailable" | "stale";

export interface OwnerAttentionProduct {
  id: string;
  name: string;
  sku: string | null;
  stock_status: string;
  has_purchase_price: boolean;
  last_update_at: string | null;
  days_since_update: number | null;
  issues: OwnerAttentionIssue[];
}

export interface OwnerAttentionGroup {
  owner_id: string;
  owner_name: string;
  total: number;
  no_purchase_price: number;
  unavailable: number;
  stale: number;
  products: OwnerAttentionProduct[];
}

export interface OwnerAttentionReport {
  groups: OwnerAttentionGroup[];
  total_products: number;
  total_no_purchase_price: number;
  total_unavailable: number;
  total_stale: number;
  stale_threshold_days: number;
  generated_at: string;
  truncated: boolean;
}

const STALE_DAYS = 2;
const OWNERS_LIMIT = 5000;
const PRODUCTS_CHUNK = 500;
const PP_CHUNK = 300;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function fetchOwnerAttentionReport(): Promise<OwnerAttentionReport> {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const staleBeforeIso = new Date(now - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // 1) owner assignments
  const { data: assigns, error: aErr } = await supabase
    .from("product_owner_assignments")
    .select("product_id, user_id")
    .limit(OWNERS_LIMIT);
  if (aErr) throw aErr;

  const truncated = (assigns?.length ?? 0) >= OWNERS_LIMIT;
  const ownersByProduct = new Map<string, { user_id: string; full_name: string | null }[]>();
  const ownerNameById = new Map<string, string | null>();
  for (const r of (assigns ?? []) as Array<{ product_id: string; user_id: string }>) {
    ownerNameById.set(r.user_id, null);
    const arr = ownersByProduct.get(r.product_id) ?? [];
    arr.push({ user_id: r.user_id, full_name: null });
    ownersByProduct.set(r.product_id, arr);
  }
  const userIds = Array.from(ownerNameById.keys());
  if (userIds.length > 0) {
    for (const ids of chunk(userIds, PRODUCTS_CHUNK)) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      for (const p of (profs ?? []) as Array<{ id: string; full_name: string | null }>) {
        ownerNameById.set(p.id, p.full_name);
      }
    }
  }
  const ownedProductIds = Array.from(ownersByProduct.keys());
  if (ownedProductIds.length === 0) {
    return {
      groups: [],
      total_products: 0,
      total_no_purchase_price: 0,
      total_unavailable: 0,
      total_stale: 0,
      stale_threshold_days: STALE_DAYS,
      generated_at: nowIso,
      truncated,
    };
  }

  // 2) active products
  const productsById = new Map<
    string,
    { id: string; name: string; sku: string | null; stock_status: string; updated_at: string }
  >();
  for (const ids of chunk(ownedProductIds, PRODUCTS_CHUNK)) {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, sku, stock_status, updated_at")
      .eq("status", "active")
      .in("id", ids);
    if (error) throw error;
    for (const p of (data ?? []) as Array<{
      id: string;
      name: string;
      sku: string | null;
      stock_status: string;
      updated_at: string;
    }>) {
      productsById.set(p.id, p);
    }
  }

  const activeIds = Array.from(productsById.keys());

  // 3) latest active purchase price (not expired) per product
  const latestPurchaseByProduct = new Map<string, string>();
  for (const ids of chunk(activeIds, PP_CHUNK)) {
    const { data, error } = await supabase
      .from("purchase_prices")
      .select("product_id, effective_at, expires_at")
      .eq("is_active", true)
      .lte("effective_at", nowIso)
      .in("product_id", ids)
      .order("effective_at", { ascending: false });
    if (error) throw error;
    for (const row of (data ?? []) as Array<{
      product_id: string;
      effective_at: string;
      expires_at: string | null;
    }>) {
      if (latestPurchaseByProduct.has(row.product_id)) continue;
      const notExpired = !row.expires_at || row.expires_at > nowIso;
      if (!notExpired) continue;
      latestPurchaseByProduct.set(row.product_id, row.effective_at);
    }
  }

  // 4) compute issues
  const flagged: OwnerAttentionProduct[] = [];
  for (const p of productsById.values()) {
    const pp = latestPurchaseByProduct.get(p.id);
    const noPurchase = !pp;
    const unavailable = p.stock_status === "unavailable";
    const lastUpdate = pp && pp > p.updated_at ? pp : p.updated_at;
    const stale = lastUpdate < staleBeforeIso;
    if (!noPurchase && !unavailable && !stale) continue;
    const issues: OwnerAttentionIssue[] = [];
    if (noPurchase) issues.push("no_purchase_price");
    if (unavailable) issues.push("unavailable");
    if (stale) issues.push("stale");
    flagged.push({
      id: p.id,
      name: p.name,
      sku: p.sku,
      stock_status: p.stock_status,
      has_purchase_price: !noPurchase,
      last_update_at: lastUpdate,
      days_since_update: Math.floor((now - Date.parse(lastUpdate)) / 86400000),
      issues,
    });
  }

  // 5) group per owner
  const groupsMap = new Map<string, OwnerAttentionGroup>();
  for (const prod of flagged) {
    const owners = ownersByProduct.get(prod.id) ?? [];
    for (const o of owners) {
      const g =
        groupsMap.get(o.user_id) ??
        ({
          owner_id: o.user_id,
          owner_name: ownerNameById.get(o.user_id) ?? o.user_id.slice(0, 8),
          total: 0,
          no_purchase_price: 0,
          unavailable: 0,
          stale: 0,
          products: [],
        } as OwnerAttentionGroup);
      g.total += 1;
      if (prod.issues.includes("no_purchase_price")) g.no_purchase_price += 1;
      if (prod.issues.includes("unavailable")) g.unavailable += 1;
      if (prod.issues.includes("stale")) g.stale += 1;
      g.products.push(prod);
      groupsMap.set(o.user_id, g);
    }
  }

  const groups = Array.from(groupsMap.values())
    .map((g) => {
      g.products.sort((a, b) => {
        if (b.issues.length !== a.issues.length) return b.issues.length - a.issues.length;
        return (b.days_since_update ?? 0) - (a.days_since_update ?? 0);
      });
      return g;
    })
    .sort((a, b) => b.total - a.total);

  let totalNoPP = 0,
    totalUnav = 0,
    totalStale = 0;
  for (const p of flagged) {
    if (p.issues.includes("no_purchase_price")) totalNoPP++;
    if (p.issues.includes("unavailable")) totalUnav++;
    if (p.issues.includes("stale")) totalStale++;
  }

  return {
    groups,
    total_products: flagged.length,
    total_no_purchase_price: totalNoPP,
    total_unavailable: totalUnav,
    total_stale: totalStale,
    stale_threshold_days: STALE_DAYS,
    generated_at: nowIso,
    truncated,
  };
}
