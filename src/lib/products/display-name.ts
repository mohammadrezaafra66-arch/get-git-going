/**
 * فرمت‌کننده نام نمایشی محصول
 * طبق درخواست کسب‌وکار: همیشه نام کامل محصول (همان نامی که در «ساخت نام
 * خودکار» تولید و در ستون products.name ذخیره شده است) نمایش داده می‌شود.
 * هیچ ترکیب مجدد از برند/دسته/مدل/رنگ انجام نمی‌شود.
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
  return (p.name ?? "").trim() || "—";
}

export function formatProductDisplayNameWithFallback(p: ProductLikeForName | null | undefined): string {
  if (!p) return "—";
  return (p.name ?? "").trim() || "—";
}