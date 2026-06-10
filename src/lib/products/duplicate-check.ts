import { supabase } from "@/integrations/supabase/client";

export interface DuplicateProduct {
  id: string;
  name: string;
  sku: string | null;
}

/**
 * بررسی تکراری بودن محصول بر اساس ترکیب «برند + دسته + مدل + رنگ + ظرفیت»
 * با نرمال‌سازی فارسی (سمت دیتابیس). در صورت پیدا شدن مشابه، اطلاعات آن
 * برمی‌گردد. اگر برند یا دسته خالی باشد، بررسی انجام نمی‌شود.
 */
export async function findDuplicateProduct(args: {
  brandId: string | null | undefined;
  categoryId: string | null | undefined;
  model: string | null | undefined;
  color: string | null | undefined;
  capacity: string | null | undefined;
  excludeId?: string | null;
}): Promise<DuplicateProduct | null> {
  if (!args.brandId || !args.categoryId) return null;
  const { data, error } = await supabase.rpc("find_duplicate_product", {
    p_brand_id: args.brandId,
    p_category_id: args.categoryId,
    p_model: args.model ?? "",
    p_color: args.color ?? "",
    p_capacity: args.capacity ?? "",
    p_exclude_id: args.excludeId ?? undefined,
  });
  if (error) {
    console.error("find_duplicate_product failed:", error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;
  return { id: row.id, name: row.name, sku: row.sku ?? null };
}
