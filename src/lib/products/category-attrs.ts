import { supabase } from "@/integrations/supabase/client";

export type CpaInputType = "text" | "number" | "select" | "boolean" | "date";

export interface CategoryAttributeDef {
  id: string;
  category_id: string;
  attribute_key: string;
  label_fa: string;
  input_type: CpaInputType;
  is_required: boolean;
  is_active: boolean;
  use_in_product_name: boolean;
  sort_order: number;
  options: string[];
  help_text: string | null;
}

export type DynamicAttrValues = Record<string, string>;

/** Fetch active attribute definitions for a category, sorted. */
export async function fetchCategoryAttributes(categoryId: string): Promise<CategoryAttributeDef[]> {
  if (!categoryId) return [];
  const { data, error } = await supabase
    .from("category_product_attributes")
    .select(
      "id, category_id, attribute_key, label_fa, input_type, is_required, is_active, use_in_product_name, sort_order, options, help_text",
    )
    .eq("category_id", categoryId)
    .eq("is_active", true)
    .order("sort_order")
    .order("label_fa");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    ...r,
    input_type: r.input_type as CpaInputType,
    options: Array.isArray(r.options) ? (r.options as unknown[]).map(String) : [],
  }));
}

/** Fetch saved values for a product, keyed by attribute id. */
export async function fetchProductDynamicValues(
  productId: string,
): Promise<Record<string, string>> {
  if (!productId) return {};
  const { data, error } = await supabase
    .from("product_category_attribute_values")
    .select("category_attribute_id, value")
    .eq("product_id", productId);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const r of data ?? []) {
    out[r.category_attribute_id] = r.value ?? "";
  }
  return out;
}

/** Validate dynamic values against definitions. Returns errors keyed by attribute id. */
export function validateDynamicValues(
  defs: CategoryAttributeDef[],
  values: DynamicAttrValues,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const d of defs) {
    const raw = (values[d.id] ?? "").trim();
    if (d.is_required && !raw) {
      errors[d.id] = `${d.label_fa} الزامی است`;
      continue;
    }
    if (!raw) continue;
    if (d.input_type === "number" && Number.isNaN(Number(raw))) {
      errors[d.id] = `${d.label_fa} باید عدد باشد`;
    } else if (d.input_type === "select" && d.options.length > 0 && !d.options.includes(raw)) {
      errors[d.id] = `${d.label_fa} باید یکی از گزینه‌ها باشد`;
    } else if (d.input_type === "date" && Number.isNaN(new Date(raw).getTime())) {
      errors[d.id] = `${d.label_fa} باید تاریخ معتبر باشد`;
    }
  }
  return errors;
}

/**
 * Persist values for a product. Inserts/updates non-empty values; deletes rows
 * whose value the user cleared. Only touches attributes that belong to the given
 * `defs` list (i.e. the currently active set for the product's category).
 */
export async function saveProductDynamicValues(
  productId: string,
  defs: CategoryAttributeDef[],
  values: DynamicAttrValues,
): Promise<void> {
  if (!productId) return;

  const upserts: { product_id: string; category_attribute_id: string; value: string }[] = [];
  const toDelete: string[] = [];

  for (const d of defs) {
    const raw = (values[d.id] ?? "").trim();
    if (raw.length === 0) {
      toDelete.push(d.id);
    } else {
      upserts.push({ product_id: productId, category_attribute_id: d.id, value: raw });
    }
  }

  if (upserts.length > 0) {
    const { error } = await supabase
      .from("product_category_attribute_values")
      .upsert(upserts, { onConflict: "product_id,category_attribute_id" });
    if (error) throw error;
  }

  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("product_category_attribute_values")
      .delete()
      .eq("product_id", productId)
      .in("category_attribute_id", toDelete);
    if (error) throw error;
  }
}

/**
 * On category change in edit mode, drop values for definitions that don't
 * belong to the new category. Used to clean up after a category switch.
 */
export async function deleteAllDynamicValuesForProduct(productId: string): Promise<void> {
  if (!productId) return;
  const { error } = await supabase
    .from("product_category_attribute_values")
    .delete()
    .eq("product_id", productId);
  if (error) throw error;
}
