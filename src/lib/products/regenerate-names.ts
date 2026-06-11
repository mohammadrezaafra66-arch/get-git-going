import { supabase } from "@/integrations/supabase/client";
import { composeProductName } from "./name-template";

export interface RegenerateNameResult {
  product_id: string;
  old_name: string;
  new_name: string;
  status: "updated" | "skipped" | "error";
  reason?: string;
}

export interface RegenerateOptions {
  onlyMissingTemplate?: boolean;
  categoryId?: string | null;
  dryRun?: boolean;
  onProgress?: (done: number, total: number, last: RegenerateNameResult) => void;
}

/** Recompute and persist auto-generated names for existing products
 *  using each product's category naming_template + dynamic attributes. */
export async function regenerateProductNames(opts: RegenerateOptions = {}): Promise<{
  total: number;
  updated: number;
  skipped: number;
  failed: number;
  results: RegenerateNameResult[];
}> {
  // Fetch products with related brand/category
  let q = supabase
    .from("products")
    .select(`id, name, sku, color, capacity, model, primary_spec,
             brand:brands(name),
             category:categories(id, name, naming_template)`)
    .order("updated_at", { ascending: false });
  if (opts.categoryId) q = q.eq("category_id", opts.categoryId);

  const { data: products, error } = await q;
  if (error) throw error;
  const list = (products ?? []) as any[];

  // Preload all active category attributes once
  const { data: attrDefs } = await supabase
    .from("category_product_attributes")
    .select("id, category_id, attribute_key, use_in_product_name, is_active")
    .eq("is_active", true);

  const defsByCat = new Map<string, any[]>();
  for (const d of attrDefs ?? []) {
    const arr = defsByCat.get(d.category_id) ?? [];
    arr.push(d);
    defsByCat.set(d.category_id, arr);
  }

  // Preload all dynamic attribute values for involved products
  const productIds = list.map((p) => p.id);
  const valuesByProduct = new Map<string, Map<string, string>>();
  if (productIds.length > 0) {
    const { data: vals } = await supabase
      .from("product_category_attribute_values")
      .select("product_id, category_attribute_id, value")
      .in("product_id", productIds);
    for (const v of vals ?? []) {
      const m = valuesByProduct.get(v.product_id) ?? new Map();
      m.set(v.category_attribute_id, v.value ?? "");
      valuesByProduct.set(v.product_id, m);
    }
  }

  const results: RegenerateNameResult[] = [];
  let updated = 0, skipped = 0, failed = 0;

  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const cat = p.category;
    const tpl = cat?.naming_template ?? "";
    if (opts.onlyMissingTemplate && !tpl) {
      const r: RegenerateNameResult = { product_id: p.id, old_name: p.name, new_name: p.name, status: "skipped", reason: "بدون الگوی نام‌گذاری" };
      results.push(r); skipped++;
      opts.onProgress?.(i + 1, list.length, r);
      continue;
    }

    // Build dynamic attrs map: attribute_key -> value
    const defs = defsByCat.get(cat?.id ?? "") ?? [];
    const valMap = valuesByProduct.get(p.id) ?? new Map();
    const dynAttrs: Record<string, string> = {};
    const useInNameKeys: string[] = [];
    for (const d of defs) {
      const v = valMap.get(d.id);
      if (v) dynAttrs[d.attribute_key] = v;
      if (d.use_in_product_name) useInNameKeys.push(d.attribute_key);
    }

    const newName = composeProductName({
      template: tpl || null,
      category: cat?.name ?? "",
      brand: p.brand?.name ?? "",
      primary_spec: p.primary_spec ?? "",
      model: p.model ?? "",
      capacity: p.capacity ?? "",
      color: p.color ?? "",
      sku: p.sku ?? "",
      dynamic_attrs: dynAttrs,
      use_in_name_keys: useInNameKeys,
    });

    if (!newName || newName === p.name) {
      const r: RegenerateNameResult = { product_id: p.id, old_name: p.name, new_name: newName || p.name, status: "skipped", reason: !newName ? "نام تولیدشده خالی" : "تغییری ندارد" };
      results.push(r); skipped++;
      opts.onProgress?.(i + 1, list.length, r);
      continue;
    }

    if (opts.dryRun) {
      const r: RegenerateNameResult = { product_id: p.id, old_name: p.name, new_name: newName, status: "updated", reason: "پیش‌نمایش" };
      results.push(r); updated++;
      opts.onProgress?.(i + 1, list.length, r);
      continue;
    }

    const { error: upErr } = await supabase
      .from("products")
      .update({ name: newName })
      .eq("id", p.id);
    if (upErr) {
      const r: RegenerateNameResult = { product_id: p.id, old_name: p.name, new_name: newName, status: "error", reason: upErr.message };
      results.push(r); failed++;
    } else {
      const r: RegenerateNameResult = { product_id: p.id, old_name: p.name, new_name: newName, status: "updated" };
      results.push(r); updated++;
    }
    opts.onProgress?.(i + 1, list.length, results[results.length - 1]);
  }

  return { total: list.length, updated, skipped, failed, results };
}