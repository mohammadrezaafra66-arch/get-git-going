import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type RecommendationReason =
  | "pinned"
  | "co_viewed"
  | "same_category"
  | "same_brand"
  | "price_range"
  | "trending"
  | "related";

export interface ProductRecommendation {
  product_id: string;
  name: string;
  sku: string | null;
  brand_name: string | null;
  category_name: string | null;
  stock_status: string;
  current_price: number | null;
  recommendation_score: number;
  reason: RecommendationReason;
  is_pinned: boolean;
}

export async function fetchProductRecommendations(
  productId: string,
): Promise<ProductRecommendation[]> {
  const { data, error } = await supabase.rpc("get_product_recommendations", {
    p_product_id: productId,
  });
  if (error) throw error;
  return (data ?? []) as ProductRecommendation[];
}

export const REASON_LABEL_FA: Record<RecommendationReason, string> = {
  pinned: "پین‌شده توسط مدیر",
  co_viewed: "زیاد بررسی شده",
  same_category: "هم‌دسته",
  same_brand: "هم‌برند",
  price_range: "قیمت مشابه",
  trending: "داغ بازار",
  related: "مرتبط",
};

export const STOCK_LABEL_FA: Record<string, string> = {
  in_stock: "موجود",
  low_stock: "موجودی کم",
  out_of_stock: "ناموجود",
  unknown: "نامشخص",
};

// ===================== Overrides (admin/manager) =====================

export interface RecommendationOverride {
  id: string;
  product_id: string;
  recommended_product_id: string;
  priority: number;
  is_pinned: boolean;
  is_disabled: boolean;
  created_at: string;
  updated_at: string;
  recommended_product?: {
    id: string;
    name: string;
    sku: string | null;
    stock_status: string | null;
    brand?: { name: string } | null;
    category?: { name: string } | null;
  } | null;
}

export interface UpsertOverrideInput {
  product_id: string;
  recommended_product_id: string;
  priority?: number;
  is_pinned?: boolean;
  is_disabled?: boolean;
}

function validateOverride(input: UpsertOverrideInput): string | null {
  if (!input.product_id || !input.recommended_product_id)
    return "محصول مبدأ و محصول پیشنهادی الزامی است.";
  if (input.product_id === input.recommended_product_id)
    return "محصول مبدأ و محصول پیشنهادی نمی‌توانند یکسان باشند.";
  if (input.priority !== undefined && !Number.isFinite(input.priority))
    return "اولویت باید عددی باشد.";
  if (input.priority !== undefined && (input.priority < -1000 || input.priority > 1000))
    return "اولویت باید بین -1000 و 1000 باشد.";
  return null;
}

export async function fetchOverridesForProduct(
  productId: string,
): Promise<RecommendationOverride[]> {
  const { data, error } = await supabase
    .from("product_recommendation_overrides")
    .select(
      `
      id, product_id, recommended_product_id, priority, is_pinned, is_disabled, created_at, updated_at,
      recommended_product:products!product_recommendation_overrides_recommended_product_id_fkey(
        id, name, sku, stock_status,
        brand:brands(name),
        category:categories(name)
      )
    `,
    )
    .eq("product_id", productId)
    .order("is_pinned", { ascending: false })
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as RecommendationOverride[];
}

async function getUid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) throw new Error("ابتدا وارد شوید.");
  return uid;
}

export async function createOverride(input: UpsertOverrideInput): Promise<string> {
  const err = validateOverride(input);
  if (err) throw new Error(err);
  const uid = await getUid();
  const payload = {
    product_id: input.product_id,
    recommended_product_id: input.recommended_product_id,
    priority: input.priority ?? 0,
    is_pinned: input.is_pinned ?? false,
    is_disabled: input.is_disabled ?? false,
    created_by: uid,
  };
  const { data, error } = await supabase
    .from("product_recommendation_overrides")
    .insert(payload)
    .select("id")
    .single();
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new Error("برای این جفت محصول قبلاً override تعریف شده است.");
    }
    throw error;
  }
  await supabase.from("audit_logs").insert([
    {
      actor_id: uid,
      entity_type: "product_recommendation_override",
      entity_id: data.id,
      action: "recommendation_override_created",
      diff: payload as unknown as Json,
    },
  ]);
  return data.id as string;
}

export async function updateOverride(
  id: string,
  patch: Partial<Pick<RecommendationOverride, "priority" | "is_pinned" | "is_disabled">>,
): Promise<void> {
  if (patch.priority !== undefined && !Number.isFinite(patch.priority)) {
    throw new Error("اولویت باید عددی باشد.");
  }
  const uid = await getUid();
  const { error } = await supabase
    .from("product_recommendation_overrides")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
  await supabase.from("audit_logs").insert([
    {
      actor_id: uid,
      entity_type: "product_recommendation_override",
      entity_id: id,
      action: "recommendation_override_updated",
      diff: patch as unknown as Json,
    },
  ]);
}

export async function deleteOverride(id: string): Promise<void> {
  const uid = await getUid();
  const { error } = await supabase.from("product_recommendation_overrides").delete().eq("id", id);
  if (error) throw error;
  await supabase.from("audit_logs").insert([
    {
      actor_id: uid,
      entity_type: "product_recommendation_override",
      entity_id: id,
      action: "recommendation_override_deleted",
      diff: {} as Json,
    },
  ]);
}

export interface ProductSearchResult {
  id: string;
  name: string;
  sku: string | null;
  brand_name: string | null;
  category_name: string | null;
}

export async function searchProductsLite(term: string, limit = 20): Promise<ProductSearchResult[]> {
  const t = term.trim();
  if (t.length < 2) return [];
  const { data, error } = await supabase
    .from("products")
    .select("id, name, sku, brand:brands(name), category:categories(name)")
    .eq("is_active", true)
    .eq("status", "active")
    .or(`name.ilike.%${t}%,sku.ilike.%${t}%`)
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    sku: (r.sku as string | null) ?? null,
    brand_name: (r.brand as { name?: string } | null)?.name ?? null,
    category_name: (r.category as { name?: string } | null)?.name ?? null,
  }));
}
