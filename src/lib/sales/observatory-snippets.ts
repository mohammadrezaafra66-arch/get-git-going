import { supabase } from "@/integrations/supabase/client";

/**
 * Observatory snippet shown next to a product card in Quick Sales Search.
 *
 * Source: read-time `_obs_compute_row_values` exposed via
 * `public.get_observatory_snippets_for_products(uuid[])`.
 *
 * Only products whose Observatory row has
 * `show_in_quick_sales_search = true` AND `is_watch_active = true`
 * (and row is_active = true) are returned.
 *
 * Raw market prices are intentionally NOT exposed here — only the three
 * sales-facing fields.
 */
export interface ObservatorySnippet {
  product_id: string;
  competitive_price_status: string | null;
  sales_opportunity_score: number | null;
  suggested_sales_message: string | null;
}

export type ObservatorySnippetMap = Record<string, ObservatorySnippet>;

/**
 * Fetch Observatory snippets for the given product IDs.
 *
 * Empty input → empty map (no network call).
 * On Supabase error → throws so the caller can decide how to degrade.
 */
export async function fetchObservatorySnippetsForProducts(
  productIds: string[],
): Promise<ObservatorySnippetMap> {
  if (!productIds || productIds.length === 0) return {};

  // Deduplicate to keep the payload tight.
  const unique = Array.from(new Set(productIds.filter(Boolean)));
  if (unique.length === 0) return {};

  const { data, error } = await supabase.rpc("get_observatory_snippets_for_products", {
    p_product_ids: unique,
  });
  if (error) throw error;

  const map: ObservatorySnippetMap = {};
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const pid = typeof row.product_id === "string" ? row.product_id : null;
    if (!pid) continue;
    const scoreRaw = row.sales_opportunity_score;
    const score = scoreRaw == null || scoreRaw === "" ? null : Number(scoreRaw);
    map[pid] = {
      product_id: pid,
      competitive_price_status:
        typeof row.competitive_price_status === "string" && row.competitive_price_status.length > 0
          ? row.competitive_price_status
          : null,
      sales_opportunity_score: score != null && Number.isFinite(score) ? score : null,
      suggested_sales_message:
        typeof row.suggested_sales_message === "string" && row.suggested_sales_message.length > 0
          ? row.suggested_sales_message
          : null,
    };
  }
  return map;
}

/**
 * Customer-safe Observatory hint for Sale List PDF.
 *
 * Source: `public.get_observatory_pdf_hints_for_products(uuid[])`.
 *
 * The RPC only returns a single boolean `has_price_advantage` per product
 * and intentionally does NOT expose raw market prices, opportunity scores,
 * competitive status strings, or any internal sales message.
 *
 * Only products whose Observatory row has
 * `show_in_pdf = true` AND `is_watch_active = true` (and row is_active = true)
 * are returned. `has_price_advantage` is true only when the underlying
 * competitive status is `below_market` AND opportunity score >= 60.
 */
export type ObservatoryPdfHintMap = Record<string, boolean>;

export async function fetchObservatoryPdfHintsForProducts(
  productIds: string[],
): Promise<ObservatoryPdfHintMap> {
  if (!productIds || productIds.length === 0) return {};

  const unique = Array.from(new Set(productIds.filter(Boolean)));
  if (unique.length === 0) return {};

  const { data, error } = await supabase.rpc("get_observatory_pdf_hints_for_products", {
    p_product_ids: unique,
  });
  if (error) throw error;

  const map: ObservatoryPdfHintMap = {};
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const pid = typeof row.product_id === "string" ? row.product_id : null;
    if (!pid) continue;
    map[pid] = row.has_price_advantage === true;
  }
  return map;
}
