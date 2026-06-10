/**
 * Queryهای کمکی برای صفحهٔ «فرصت جبران» و یادآوری‌های مالک.
 * فقط خواندنی؛ هیچ تغییری در DB/RLS نمی‌دهد.
 *
 * نکته: چون فیلد اختصاصی stock_status_changed_at نداریم، از products.updated_at
 * به‌عنوان تقریب استفاده می‌کنیم (هر تغییر روی محصول این فیلد را به‌روز می‌کند).
 * این یک تقریب UI است؛ در صورت نیاز به دقت بالاتر باید فیلد اختصاصی اضافه شود.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  PURCHASE_PRICE_STALE_DAYS,
  STOCK_STALE_DAYS,
  USD_DRIFT_THRESHOLD_PCT,
} from "@/lib/popups/config";

const FETCH_LIMIT = 500;

export interface OwnerLite {
  user_id: string;
  full_name: string | null;
}

export interface AttentionProduct {
  id: string;
  name: string;
  sku: string | null;
  stock_status: string;
  updated_at: string;
  owners: OwnerLite[];
}

export interface StalePurchasePriceItem {
  product_id: string;
  name: string;
  sku: string | null;
  purchase_price: number;
  price_updated_at: string;
  owners: OwnerLite[];
  /** درصد تغییر معادل دلاری از زمان ثبت قیمت تا حالا (مثبت = گران‌تر شده). */
  usd_drift_pct: number | null;
  /** true اگر تومانی > X روز قدیمی باشد. */
  is_toman_stale: boolean;
  /** true اگر drift دلاری > آستانه باشد. */
  is_usd_drifted: boolean;
}

async function fetchOwnersFor(productIds: string[]): Promise<Map<string, OwnerLite[]>> {
  const map = new Map<string, OwnerLite[]>();
  if (productIds.length === 0) return map;
  const { data } = await supabase
    .from("product_owner_assignments")
    .select("product_id, user_id")
    .in("product_id", productIds);
  const rows = (data ?? []) as Array<{ product_id: string; user_id: string }>;
  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const nameMap = new Map<string, string | null>();
  if (userIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);
    for (const p of (profs ?? []) as Array<{ id: string; full_name: string | null }>) {
      nameMap.set(p.id, p.full_name);
    }
  }
  for (const row of rows) {
    const arr = map.get(row.product_id) ?? [];
    arr.push({ user_id: row.user_id, full_name: nameMap.get(row.user_id) ?? null });
    map.set(row.product_id, arr);
  }
  return map;
}

/** محصولات ناموجودی که بیش از STOCK_STALE_DAYS روز در این وضعیت‌اند. */
export async function fetchStaleUnavailableProducts(opts?: {
  ownerUserId?: string | null;
}): Promise<AttentionProduct[]> {
  const cutoff = new Date(Date.now() - STOCK_STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  let qb = supabase
    .from("products")
    .select("id, name, sku, stock_status, updated_at")
    .eq("stock_status", "unavailable")
    .lt("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(FETCH_LIMIT);
  const { data, error } = await qb;
  if (error) throw error;
  let rows = (data ?? []) as AttentionProduct[];

  const ownersMap = await fetchOwnersFor(rows.map((r) => r.id));
  rows = rows.map((r) => ({ ...r, owners: ownersMap.get(r.id) ?? [] }));

  if (opts?.ownerUserId) {
    rows = rows.filter((r) => r.owners.some((o) => o.user_id === opts.ownerUserId));
  }
  return rows;
}

/** آخرین نرخ فعال USD به تومان. null اگر یافت نشد. */
async function fetchLatestUsdRate(): Promise<{ rate: number; effective_at: string } | null> {
  const { data } = await supabase
    .from("currency_rates")
    .select("rate_to_toman, effective_at")
    .eq("currency", "USD")
    .eq("is_active", true)
    .order("effective_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { rate: Number(data.rate_to_toman), effective_at: data.effective_at };
}

/** نرخ USD نزدیک به یک تاریخ مشخص (آخرین نرخ فعال قبل از آن تاریخ). */
async function fetchUsdRateAt(when: string): Promise<number | null> {
  const { data } = await supabase
    .from("currency_rates")
    .select("rate_to_toman, effective_at")
    .eq("currency", "USD")
    .eq("is_active", true)
    .lte("effective_at", when)
    .order("effective_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return Number(data.rate_to_toman);
}

/**
 * قیمت‌های خرید تومانی که یا بیش از PURCHASE_PRICE_STALE_DAYS روز
 * به‌روزرسانی نشده‌اند، یا معادل دلاری‌شان بیش از آستانه drift کرده.
 */
export async function fetchStalePurchasePrices(opts?: {
  ownerUserId?: string | null;
}): Promise<StalePurchasePriceItem[]> {
  // آخرین قیمت خرید فعال هر محصول از view موجود
  const { data: prices, error } = await supabase
    .from("v_latest_active_purchase_prices")
    .select("product_id, purchase_price, currency, effective_at")
    .eq("currency", "toman")
    .limit(FETCH_LIMIT);
  if (error) throw error;
  const list = (prices ?? []) as Array<{
    product_id: string | null;
    purchase_price: number | null;
    currency: string | null;
    effective_at: string | null;
  }>;
  if (list.length === 0) return [];

  const productIds = list.map((p) => p.product_id).filter(Boolean) as string[];
  const { data: products } = await supabase
    .from("products")
    .select("id, name, sku")
    .in("id", productIds);
  const pMap = new Map<string, { name: string; sku: string | null }>();
  for (const p of (products ?? []) as Array<{ id: string; name: string; sku: string | null }>) {
    pMap.set(p.id, { name: p.name, sku: p.sku });
  }

  const ownersMap = await fetchOwnersFor(productIds);

  const now = Date.now();
  const staleCutoff = now - PURCHASE_PRICE_STALE_DAYS * 24 * 60 * 60 * 1000;

  const currentUsd = await fetchLatestUsdRate();

  const out: StalePurchasePriceItem[] = [];
  for (const row of list) {
    if (!row.product_id || !row.effective_at || row.purchase_price == null) continue;
    const meta = pMap.get(row.product_id);
    if (!meta) continue;
    const owners = ownersMap.get(row.product_id) ?? [];
    if (opts?.ownerUserId && !owners.some((o) => o.user_id === opts.ownerUserId)) continue;

    const ts = new Date(row.effective_at).getTime();
    const is_toman_stale = ts < staleCutoff;

    let usd_drift_pct: number | null = null;
    if (currentUsd && currentUsd.rate > 0) {
      const oldRate = await fetchUsdRateAt(row.effective_at);
      if (oldRate && oldRate > 0) {
        const oldUsd = Number(row.purchase_price) / oldRate;
        const newUsd = Number(row.purchase_price) / currentUsd.rate;
        if (oldUsd > 0) {
          usd_drift_pct = ((newUsd - oldUsd) / oldUsd) * 100;
        }
      }
    }
    const is_usd_drifted = usd_drift_pct != null && Math.abs(usd_drift_pct) > USD_DRIFT_THRESHOLD_PCT;

    if (!is_toman_stale && !is_usd_drifted) continue;

    out.push({
      product_id: row.product_id,
      name: meta.name,
      sku: meta.sku,
      purchase_price: Number(row.purchase_price),
      price_updated_at: row.effective_at,
      owners,
      usd_drift_pct,
      is_toman_stale,
      is_usd_drifted,
    });
  }

  out.sort((a, b) => a.price_updated_at.localeCompare(b.price_updated_at));
  return out;
}