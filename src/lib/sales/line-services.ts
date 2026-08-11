import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * src/integrations/supabase/types.ts is generated and has not been regenerated
 * since migration 271, so the tables added by 276 are unknown to it — the same
 * situation migration 272's score_level_thresholds is in.
 *
 * Casting once here is deliberate: editing a file whose header says "do not
 * edit it directly" would be undone by the next regeneration, and sprinkling
 * `any` at each call site would lose the row shapes entirely. Every query below
 * still declares an explicit interface for what it returns, so the data is
 * typed even though the client is not.
 */
const db = supabase as unknown as SupabaseClient;

/**
 * Per-line product services — requirement 223 (migration 276).
 *
 * Two different questions, two different hooks, on purpose:
 *
 *  - useQuoteLineServices(quoteId)  — what a SAVED proforma actually carries.
 *    Reads sales_quote_item_services, the rows the database attached.
 *
 *  - useCategoryRequiredServices()  — what the rule SAYS, before anything is
 *    saved. The new-proforma form has no quote_item rows yet, so it cannot read
 *    the first hook; it predicts from the rule instead. The prediction is
 *    display only — the obligation is created and enforced by the database
 *    (triggers in 276), never by this code.
 */

export interface QuoteLineService {
  id: string;
  quote_item_id: string;
  service_type_id: string;
  is_mandatory: boolean;
  display_text: string | null;
  source: string;
  service_name: string;
}

export interface CategoryRequiredService {
  category_id: string;
  service_type_id: string;
  is_mandatory: boolean;
  display_text: string;
  service_name: string;
}

/**
 * Non-hook version, for the PDF path — that runs inside a click handler, where
 * a hook cannot be called.
 */
export async function fetchQuoteLineServices(
  quoteId: string,
): Promise<Map<string, QuoteLineService[]>> {
  const { data: items, error: itemsError } = await db
    .from("sales_quote_items")
    .select("id")
    .eq("quote_id", quoteId);
  if (itemsError) throw itemsError;

  const ids = ((items ?? []) as { id: string }[]).map((i) => i.id);
  if (ids.length === 0) return new Map();

  const { data, error } = await db
    .from("sales_quote_item_services")
    .select(
      "id, quote_item_id, service_type_id, is_mandatory, display_text, source, product_service_types(name_fa)",
    )
    .in("quote_item_id", ids);
  if (error) throw error;

  const map = new Map<string, QuoteLineService[]>();
  for (const row of (data ?? []) as unknown as (Omit<QuoteLineService, "service_name"> & {
    product_service_types: { name_fa: string } | null;
  })[]) {
    const entry: QuoteLineService = {
      id: row.id,
      quote_item_id: row.quote_item_id,
      service_type_id: row.service_type_id,
      is_mandatory: row.is_mandatory,
      display_text: row.display_text,
      source: row.source,
      service_name: row.product_service_types?.name_fa ?? "خدمت",
    };
    const list = map.get(entry.quote_item_id) ?? [];
    list.push(entry);
    map.set(entry.quote_item_id, list);
  }
  return map;
}

/** Services attached to the lines of one saved proforma, keyed by line id. */
export function useQuoteLineServices(quoteId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["quote-line-services", quoteId],
    enabled: Boolean(quoteId) && enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<Map<string, QuoteLineService[]>> => {
      const { data: items, error: itemsError } = await db
        .from("sales_quote_items")
        .select("id")
        .eq("quote_id", quoteId!);
      if (itemsError) throw itemsError;

      const ids = ((items ?? []) as { id: string }[]).map((i) => i.id);
      if (ids.length === 0) return new Map();

      const { data, error } = await db
        .from("sales_quote_item_services")
        .select(
          "id, quote_item_id, service_type_id, is_mandatory, display_text, source, product_service_types(name_fa)",
        )
        .in("quote_item_id", ids);
      if (error) throw error;

      const map = new Map<string, QuoteLineService[]>();
      for (const row of (data ?? []) as unknown as (Omit<QuoteLineService, "service_name"> & {
        product_service_types: { name_fa: string } | null;
      })[]) {
        const entry: QuoteLineService = {
          id: row.id,
          quote_item_id: row.quote_item_id,
          service_type_id: row.service_type_id,
          is_mandatory: row.is_mandatory,
          display_text: row.display_text,
          source: row.source,
          service_name: row.product_service_types?.name_fa ?? "خدمت",
        };
        const list = map.get(entry.quote_item_id) ?? [];
        list.push(entry);
        map.set(entry.quote_item_id, list);
      }
      return map;
    },
  });
}

/**
 * What the rule WILL attach to each of these products once the proforma is
 * saved, keyed by product id.
 *
 * Used by the new-proforma form, which has no saved lines to read from yet.
 * This is a prediction for display; if it were ever wrong the database would
 * still attach the correct obligation on insert, because 276 does the work in
 * a trigger rather than trusting the client.
 */
export function usePredictedLineServices(productIds: string[]) {
  const rulesQuery = useCategoryRequiredServices();
  const ids = Array.from(new Set(productIds.filter(Boolean))).sort();

  const categoriesQuery = useQuery({
    queryKey: ["product-categories-for-services", ids],
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Map<string, string | null>> => {
      const { data, error } = await db.from("products").select("id, category_id").in("id", ids);
      if (error) throw error;
      const map = new Map<string, string | null>();
      for (const row of (data ?? []) as { id: string; category_id: string | null }[]) {
        map.set(row.id, row.category_id);
      }
      return map;
    },
  });

  const rules = rulesQuery.data;
  const categories = categoriesQuery.data;

  const byProduct = new Map<string, CategoryRequiredService[]>();
  if (rules && categories) {
    for (const [productId, categoryId] of categories) {
      if (!categoryId) continue;
      const list = rules.get(categoryId);
      if (list && list.length > 0) byProduct.set(productId, list);
    }
  }
  return byProduct;
}

/** The active category rules, keyed by category id. Small table, cached long. */
export function useCategoryRequiredServices() {
  return useQuery({
    queryKey: ["category-required-services"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Map<string, CategoryRequiredService[]>> => {
      const { data, error } = await db
        .from("category_required_services")
        .select(
          "category_id, service_type_id, is_mandatory, display_text, product_service_types(name_fa, is_active)",
        )
        .eq("is_active", true)
        .eq("is_mandatory", true);
      if (error) throw error;

      const map = new Map<string, CategoryRequiredService[]>();
      for (const row of (data ?? []) as unknown as (Omit<
        CategoryRequiredService,
        "service_name"
      > & {
        product_service_types: { name_fa: string; is_active: boolean } | null;
      })[]) {
        if (!row.product_service_types?.is_active) continue;
        const entry: CategoryRequiredService = {
          category_id: row.category_id,
          service_type_id: row.service_type_id,
          is_mandatory: row.is_mandatory,
          display_text: row.display_text,
          service_name: row.product_service_types.name_fa,
        };
        const list = map.get(entry.category_id) ?? [];
        list.push(entry);
        map.set(entry.category_id, list);
      }
      return map;
    },
  });
}
