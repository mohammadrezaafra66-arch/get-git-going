import { supabase } from "@/integrations/supabase/client";

export interface PublicSaleListItem {
  id: string;
  product_id: string;
  product_name: string;
  brand_name: string | null;
  category_name: string | null;
  current_price: number;
  previous_price: number | null;
  change_amount: number | null;
  change_percent: number | null;
  stock_status: string | null;
  description: string | null;
  sort_order: number;
}

export interface PublicSaleList {
  id: string;
  name: string;
  description: string | null;
  terms_text: string | null;
  version_number: number;
  published_at: string | null;
  sale_price_type_title: string | null;
  total_items: number;
  items: PublicSaleListItem[];
}

export const PUBLIC_PAGE_SIZE = 50;

/**
 * Fetches a published sale list for public/anonymous viewing.
 * Returns null when the list does not exist or is not published (treat as 404).
 */
export async function getPublicSaleList(
  listId: string,
  page = 1,
): Promise<PublicSaleList | null> {
  // 1) Fetch list (must be published)
  const { data: list, error: listErr } = await supabase
    .from("sale_lists")
    .select("id, name, description, terms_text, version_number, published_at, status, sale_price_type_id")
    .eq("id", listId)
    .eq("status", "published")
    .maybeSingle();

  if (listErr || !list) return null;

  // 2) Fetch sale price type title (best-effort)
  let priceTypeTitle: string | null = null;
  if (list.sale_price_type_id) {
    const { data: spt } = await supabase
      .from("sale_price_types")
      .select("title")
      .eq("id", list.sale_price_type_id)
      .maybeSingle();
    priceTypeTitle = spt?.title ?? null;
  }

  // 3) Count items
  const { count } = await supabase
    .from("sale_list_items")
    .select("id", { count: "exact", head: true })
    .eq("sale_list_id", listId);

  // 4) Fetch paginated items
  const from = (Math.max(1, page) - 1) * PUBLIC_PAGE_SIZE;
  const to = from + PUBLIC_PAGE_SIZE - 1;

  const { data: items, error: itemsErr } = await supabase
    .from("sale_list_items")
    .select("id, product_id, current_price, previous_price, change_amount, change_percent, stock_status, sort_order")
    .eq("sale_list_id", listId)
    .order("sort_order", { ascending: true })
    .range(from, to);

  if (itemsErr) return null;

  const productIds = Array.from(new Set((items ?? []).map((i) => i.product_id))).filter(Boolean);
  let productsById = new Map<string, { id: string; name: string; description: string | null; brand_id: string | null; category_id: string | null }>();
  let brandsById = new Map<string, string>();
  let categoriesById = new Map<string, string>();

  if (productIds.length > 0) {
    const { data: products } = await supabase
      .from("products")
      .select("id, name, description, brand_id, category_id")
      .in("id", productIds);
    productsById = new Map((products ?? []).map((p: any) => [p.id, p]));

    const brandIds = Array.from(new Set((products ?? []).map((p: any) => p.brand_id).filter(Boolean)));
    const categoryIds = Array.from(new Set((products ?? []).map((p: any) => p.category_id).filter(Boolean)));

    if (brandIds.length > 0) {
      const { data: brands } = await supabase.from("brands").select("id, name").in("id", brandIds);
      brandsById = new Map((brands ?? []).map((b: any) => [b.id, b.name]));
    }
    if (categoryIds.length > 0) {
      const { data: cats } = await supabase.from("categories").select("id, name").in("id", categoryIds);
      categoriesById = new Map((cats ?? []).map((c: any) => [c.id, c.name]));
    }
  }

  const enrichedItems: PublicSaleListItem[] = (items ?? []).map((it: any) => {
    const p = productsById.get(it.product_id);
    return {
      id: it.id,
      product_id: it.product_id,
      product_name: p?.name ?? "—",
      brand_name: p?.brand_id ? brandsById.get(p.brand_id) ?? null : null,
      category_name: p?.category_id ? categoriesById.get(p.category_id) ?? null : null,
      current_price: Number(it.current_price ?? 0),
      previous_price: it.previous_price !== null && it.previous_price !== undefined ? Number(it.previous_price) : null,
      change_amount: it.change_amount !== null && it.change_amount !== undefined ? Number(it.change_amount) : null,
      change_percent: it.change_percent !== null && it.change_percent !== undefined ? Number(it.change_percent) : null,
      stock_status: it.stock_status ?? null,
      description: p?.description ?? null,
      sort_order: it.sort_order ?? 0,
    };
  });

  return {
    id: list.id,
    name: list.name,
    description: list.description,
    terms_text: list.terms_text,
    version_number: list.version_number,
    published_at: list.published_at,
    sale_price_type_title: priceTypeTitle,
    total_items: count ?? enrichedItems.length,
    items: enrichedItems,
  };
}