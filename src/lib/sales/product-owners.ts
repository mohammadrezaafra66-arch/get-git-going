import { supabase } from "@/integrations/supabase/client";

/**
 * 125 — authoritative product "مسئول" (responsible person) for Quick Sales
 * Search.
 *
 * The responsible person must come from product_owner_assignments joined to
 * profiles.full_name — NOT inferred from a person-named product label, which
 * never updates when ownership actually changes. When a product has no
 * assignment the caller shows "بدون مسئول".
 *
 * Read-only sidecar (mirrors observatory-snippets): never blocks or replaces
 * the main search.
 */
export interface ProductOwnerLite {
  user_id: string;
  full_name: string | null;
}

export type ProductOwnersMap = Record<string, ProductOwnerLite[]>;

export async function fetchProductOwnersForProducts(
  productIds: string[],
): Promise<ProductOwnersMap> {
  const map: ProductOwnersMap = {};
  const unique = Array.from(new Set((productIds ?? []).filter(Boolean)));
  if (unique.length === 0) return map;

  // Preferred: single query using the FK hint to embed the profile name.
  const { data, error } = await supabase
    .from("product_owner_assignments")
    .select(
      "product_id, user_id, profile:profiles!product_owner_assignments_user_id_fkey(full_name)",
    )
    .in("product_id", unique);

  let rows = (data ?? []) as unknown as Array<{
    product_id: string;
    user_id: string;
    profile: { full_name: string | null } | { full_name: string | null }[] | null;
  }>;

  // Fallback: some environments don't resolve the FK hint — do a manual join.
  if (error) {
    const { data: raw } = await supabase
      .from("product_owner_assignments")
      .select("product_id, user_id")
      .in("product_id", unique);
    const rawRows = (raw ?? []) as Array<{ product_id: string; user_id: string }>;
    const userIds = Array.from(new Set(rawRows.map((r) => r.user_id)));
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
    rows = rawRows.map((r) => ({
      product_id: r.product_id,
      user_id: r.user_id,
      profile: { full_name: nameMap.get(r.user_id) ?? null },
    }));
  }

  for (const r of rows) {
    const prof = Array.isArray(r.profile) ? r.profile[0] : r.profile;
    (map[r.product_id] ??= []).push({
      user_id: r.user_id,
      full_name: prof?.full_name ?? null,
    });
  }
  return map;
}
