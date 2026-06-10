import { supabase } from "@/integrations/supabase/client";

export type PriceRangeKey = "7d" | "30d" | "90d" | "all";

export interface PriceHistoryPoint {
  id: string;
  created_at: string;
  new_sale_price: number;
  old_sale_price: number | null;
  change_amount: number | null;
  change_percent: number | null;
}

export interface PriceChangeInfo {
  current_price: number | null;
  previous_price: number | null;
  change_amount: number | null;
  change_percent: number | null;
  direction: "up" | "down" | "flat" | "none";
  last_updated_at: string | null;
}

export const RANGE_DAYS: Record<PriceRangeKey, number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: null,
};

export const RANGE_LABEL: Record<PriceRangeKey, string> = {
  "7d": "۷ روز",
  "30d": "۳۰ روز",
  "90d": "۹۰ روز",
  all: "همه",
};

/**
 * محاسبه درصد تغییر بین قیمت فعلی و قبلی.
 * - اگر previous نباشد یا صفر باشد، null برمی‌گرداند.
 */
export function computeChangePercent(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return null;
  return Number((((current - previous) / previous) * 100).toFixed(2));
}

export function computeDirection(change: number | null): PriceChangeInfo["direction"] {
  if (change === null) return "none";
  if (change > 0.0001) return "up";
  if (change < -0.0001) return "down";
  return "flat";
}

/**
 * تبدیل قیمت تومانی به دلاری با snapshot آخرین نرخ معتبر.
 * اگر نرخ نباشد یا صفر باشد، null برمی‌گرداند.
 */
export function tomanToUsd(toman: number | null, usdRate: number | null): number | null {
  if (toman === null || usdRate === null) return null;
  if (!Number.isFinite(toman) || !Number.isFinite(usdRate) || usdRate <= 0) return null;
  return Number((toman / usdRate).toFixed(2));
}

/**
 * گرفتن تاریخچه قیمت فروش یک محصول برای یک sale_price_type با محدوده زمانی.
 * ورودی‌ها validate می‌شوند؛ خروجی به ترتیب صعودی زمان (برای رسم نمودار) برمی‌گردد.
 */
export async function fetchProductPriceHistory(opts: {
  productId: string;
  salePriceTypeId: string;
  range: PriceRangeKey;
  limit?: number;
}): Promise<PriceHistoryPoint[]> {
  const { productId, salePriceTypeId, range } = opts;
  if (!productId) throw new Error("شناسه محصول الزامی است.");
  if (!salePriceTypeId) throw new Error("نوع قیمت فروش الزامی است.");

  const limit = Math.min(Math.max(opts.limit ?? 500, 10), 1000);

  let q = supabase
    .from("product_sale_price_history")
    .select("id, created_at, new_sale_price, old_sale_price, change_amount, change_percent")
    .eq("product_id", productId)
    .eq("sale_price_type_id", salePriceTypeId)
    .order("created_at", { ascending: false })
    .limit(limit);

  const days = RANGE_DAYS[range];
  let sinceIso: string | null = null;
  if (days !== null) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    sinceIso = since.toISOString();
    q = q.gte("created_at", sinceIso);
  }

  const { data, error } = await q;
  if (error) throw error;

  const rows = ((data ?? []) as PriceHistoryPoint[])
    .map((r) => ({
      ...r,
      new_sale_price: Number(r.new_sale_price),
      old_sale_price: r.old_sale_price !== null ? Number(r.old_sale_price) : null,
      change_amount: r.change_amount !== null ? Number(r.change_amount) : null,
      change_percent: r.change_percent !== null ? Number(r.change_percent) : null,
    }))
    .reverse(); // ascending for chart

  // Anchor the chart at the start of the range with the last known price
  // before that window, so the line spans the full selected period even
  // when price changes are sparse.
  if (sinceIso) {
    const { data: anchorData } = await supabase
      .from("product_sale_price_history")
      .select("id, created_at, new_sale_price, old_sale_price, change_amount, change_percent")
      .eq("product_id", productId)
      .eq("sale_price_type_id", salePriceTypeId)
      .lt("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (anchorData) {
      const anchorPrice = Number(anchorData.new_sale_price);
      rows.unshift({
        id: `anchor-${anchorData.id}`,
        created_at: sinceIso,
        new_sale_price: anchorPrice,
        old_sale_price: null,
        change_amount: null,
        change_percent: null,
      });
    } else if (rows.length > 0) {
      // No prior data — extend first known point back to range start
      // so the chart shows a flat line up to the first real change.
      const first = rows[0];
      rows.unshift({
        id: `anchor-start-${first.id}`,
        created_at: sinceIso,
        new_sale_price: first.new_sale_price,
        old_sale_price: null,
        change_amount: null,
        change_percent: null,
      });
    }
  }

  // Append a synthetic "now" point with the latest known price so the
  // line extends to today even if no change happened recently.
  if (rows.length > 0) {
    const last = rows[rows.length - 1];
    const nowIso = new Date().toISOString();
    if (last.created_at < nowIso) {
      rows.push({
        id: `now-${last.id}`,
        created_at: nowIso,
        new_sale_price: last.new_sale_price,
        old_sale_price: null,
        change_amount: null,
        change_percent: null,
      });
    }
  }

  return rows;
}

/**
 * گرفتن خلاصه تغییر قیمت آخرین آپدیت محصول/نوع قیمت (برای جدول‌ها).
 * ۲ رکورد آخر را می‌خواند و previous را از history واقعی می‌گیرد.
 */
export async function fetchLatestPriceChange(opts: {
  productId: string;
  salePriceTypeId: string;
}): Promise<PriceChangeInfo> {
  const { productId, salePriceTypeId } = opts;
  if (!productId || !salePriceTypeId) {
    return { current_price: null, previous_price: null, change_amount: null, change_percent: null, direction: "none", last_updated_at: null };
  }
  const { data, error } = await supabase
    .from("product_sale_price_history")
    .select("new_sale_price, old_sale_price, change_amount, change_percent, created_at")
    .eq("product_id", productId)
    .eq("sale_price_type_id", salePriceTypeId)
    .order("created_at", { ascending: false })
    .limit(2);
  if (error) throw error;

  const rows = data ?? [];
  if (rows.length === 0) {
    return { current_price: null, previous_price: null, change_amount: null, change_percent: null, direction: "none", last_updated_at: null };
  }
  const latest = rows[0];
  const prev = rows[1] ?? null;

  const current = Number(latest.new_sale_price);
  const previous = prev ? Number(prev.new_sale_price) : (latest.old_sale_price !== null ? Number(latest.old_sale_price) : null);
  const change_amount = previous !== null ? current - previous : (latest.change_amount !== null ? Number(latest.change_amount) : null);
  const change_percent = latest.change_percent !== null
    ? Number(latest.change_percent)
    : computeChangePercent(current, previous);

  return {
    current_price: current,
    previous_price: previous,
    change_amount,
    change_percent,
    direction: computeDirection(change_amount),
    last_updated_at: latest.created_at,
  };
}

/** آخرین نرخ دلار به تومان (snapshot برای کل نمودار). */
export async function fetchLatestUsdRate(): Promise<{ rate: number; at: string } | null> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("currency_rates")
    .select("rate_to_toman, effective_at")
    .eq("currency", "usd")
    .eq("is_active", true)
    .lte("effective_at", nowIso)
    .order("effective_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const rate = Number(data.rate_to_toman);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return { rate, at: data.effective_at };
}