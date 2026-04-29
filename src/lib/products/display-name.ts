/**
 * فرمت‌کننده نام نمایشی محصول
 * ترکیب: «برند - دسته - مدل - رنگ» یا هر زیرمجموعه‌ای از فیلدهای موجود.
 * اگر هیچ فیلدی نباشد، نام خام محصول برگردانده می‌شود.
 */
export interface ProductLikeForName {
  name: string;
  brand?: { name?: string | null } | null;
  category?: { name?: string | null } | null;
  model?: string | null;
  color?: string | null;
}

export function formatProductDisplayName(p: ProductLikeForName | null | undefined): string {
  if (!p) return "—";
  const parts: string[] = [];
  const brand = p.brand?.name?.trim();
  const category = p.category?.name?.trim();
  const model = p.model?.trim();
  const color = p.color?.trim();
  if (brand) parts.push(brand);
  if (category) parts.push(category);
  if (model) parts.push(model);
  if (color) parts.push(color);
  if (parts.length === 0) return p.name;
  // اگر نام خود محصول دارای اطلاعات اضافه است، آن را به‌عنوان عنوان اصلی نگه می‌داریم.
  // در غیر این‌صورت (یا اگر نام برابر برند بود)، فقط ترکیب را نمایش می‌دهیم.
  return parts.join(" - ");
}

export function formatProductDisplayNameWithFallback(p: ProductLikeForName | null | undefined): string {
  const composed = formatProductDisplayName(p);
  if (!p) return composed;
  if (composed === "—" || composed === p.name) return p.name;
  return composed;
}