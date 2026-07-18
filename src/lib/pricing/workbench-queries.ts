/**
 * Pricing Workbench — V2 queries: فیلترهای کامل + گزارش سلامت.
 * استراتژی: تا حد ممکن server-side با Supabase. relationهای tags/owners/sale_price
 * با batch query پس از گرفتن productIds صفحه fetch می‌شوند.
 *
 * TODO scale: روی dataset >10k، فیلترهای ترکیبی (tag+owner+salePrice با NOT IN)
 * ممکن است به RPC/view اختصاصی نیاز داشته باشند. الان limit 10_000 برای pre-filter.
 */
import { supabase } from "@/integrations/supabase/client";
import type {
  WorkbenchFilters,
  StockStatusV,
  ProductStatusV,
  ProductTypeV,
  CurrencyCodeV,
} from "./workbench-filters";

const PRE_FILTER_LIMIT = 10_000;

export interface WorkbenchOwnerLite {
  user_id: string;
  full_name: string | null;
}

export interface WorkbenchTagLite {
  id: string;
  title: string;
  color: string;
}

export interface WorkbenchRowV2 {
  id: string;
  name: string;
  sku: string | null;
  model: string | null;
  brand_id: string | null;
  brand_name: string | null;
  category_id: string | null;
  category_name: string | null;
  parent_category_id: string | null;
  parent_category_name: string | null;
  product_type: ProductTypeV;
  base_currency: string;
  status: ProductStatusV;
  stock_status: StockStatusV;
  current_price: number | null;
  current_price_id: string | null;
  current_supplier_id: string | null;
  current_currency: CurrencyCodeV | string | null;
  sale_price: number | null;
  sale_price_updated_at: string | null;
  owners: WorkbenchOwnerLite[];
  tags: WorkbenchTagLite[];
}

type CategoryRow = { id: string; name: string; parent_id: string | null };

async function resolveCategoryIds(filters: WorkbenchFilters): Promise<string[] | null> {
  if (filters.subcategoryId !== "all") return [filters.subcategoryId];
  if (filters.categoryId === "all") return null;
  // include parent + all descendants
  const { data: kids } = await supabase
    .from("categories")
    .select("id")
    .eq("parent_id", filters.categoryId);
  return [filters.categoryId, ...(kids ?? []).map((k) => k.id)];
}

async function fetchProductIdsBySalePrice(want: "has" | "missing"): Promise<Set<string>> {
  const { data, error } = await (supabase as any)
    .from("product_computed_prices_public")
    .select("product_id, rounded_sale_price")
    .gt("rounded_sale_price", 0)
    .limit(PRE_FILTER_LIMIT);
  if (error) {
    console.error("[workbench] sale price pre-filter query failed", error);
  }
  const has = new Set<string>(
    ((data ?? []) as Array<{ product_id: string }>).map((r) => r.product_id),
  );
  return want === "has" ? has : has; // caller uses positive set then inverts
}

async function fetchProductIdsByOwner(opts: { ownerId: string }): Promise<Set<string>> {
  const { data } = await supabase
    .from("product_owner_assignments")
    .select("product_id")
    .eq("user_id", opts.ownerId)
    .limit(PRE_FILTER_LIMIT);
  return new Set<string>((data ?? []).map((r) => r.product_id as string));
}

async function fetchAllOwnedProductIds(): Promise<Set<string>> {
  const { data } = await supabase
    .from("product_owner_assignments")
    .select("product_id")
    .limit(PRE_FILTER_LIMIT);
  return new Set<string>((data ?? []).map((r) => r.product_id as string));
}

async function fetchProductIdsByLabel(labelId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from("product_label_links")
    .select("product_id")
    .eq("label_id", labelId)
    .limit(PRE_FILTER_LIMIT);
  return new Set<string>((data ?? []).map((r) => r.product_id as string));
}

async function fetchAllLabeledProductIds(): Promise<Set<string>> {
  const { data } = await supabase
    .from("product_label_links")
    .select("product_id")
    .limit(PRE_FILTER_LIMIT);
  return new Set<string>((data ?? []).map((r) => r.product_id as string));
}

/** اعمال فیلترهای پایه روی query products. */
function applyBaseFilters(qb: any, filters: WorkbenchFilters) {
  if (filters.brandId !== "all") qb = qb.eq("brand_id", filters.brandId);
  if (filters.inventory !== "all") qb = qb.eq("stock_status", filters.inventory);
  if (filters.productStatus === "active") qb = qb.eq("status", "active");
  if (filters.productStatus === "inactive") qb = qb.in("status", ["inactive", "discontinued"]);
  if (filters.currencyType === "toman") {
    qb = qb.eq("product_type", "iranian");
  } else if (filters.currencyType === "foreign") {
    qb = qb.eq("product_type", "foreign");
    if (filters.currency !== "all" && filters.currency !== "toman") {
      qb = qb.eq("base_currency", filters.currency);
    } else {
      qb = qb.neq("base_currency", "toman");
    }
  } else if (filters.currency !== "all") {
    qb = qb.eq("base_currency", filters.currency);
  }
  if (filters.search.trim()) {
    const safe = filters.search.trim().replace(/[%_]/g, "");
    qb = qb.or(`name.ilike.%${safe}%,sku.ilike.%${safe}%,model.ilike.%${safe}%`);
  }
  return qb;
}

function intersect(a: Set<string>, b: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const x of a) if (b.has(x)) out.add(x);
  return out;
}

/** نمای صفحه‌بندی‌شده کارگاه قیمت‌گذاری با همه فیلترها. */
export async function fetchWorkbenchRowsV2(opts: {
  filters: WorkbenchFilters;
  page: number;
  pageSize: number;
  ownedOnly: { userId: string } | null; // اگر null => همه محصولات (مدیریتی)
}): Promise<{ rows: WorkbenchRowV2[]; total: number }> {
  const { filters, page, pageSize, ownedOnly } = opts;

  // 1) ساخت مجموعه‌های pre-filter productIds — همه pre-filterها مستقل‌اند
  // و به‌صورت موازی fetch می‌شوند تا latency اولیه کم شود.
  const ownedOnlyP = ownedOnly
    ? fetchProductIdsByOwner({ ownerId: ownedOnly.userId })
    : Promise.resolve(null as Set<string> | null);

  const ownerRestrictP: Promise<Set<string> | null> =
    filters.ownerId !== "all" && filters.ownerId !== "none"
      ? fetchProductIdsByOwner({ ownerId: filters.ownerId })
      : Promise.resolve(null);

  const ownerNegP: Promise<Set<string> | null> =
    filters.ownerId === "none"
      ? fetchAllOwnedProductIds()
      : Promise.resolve(null);

  const labelRestrictP: Promise<Set<string> | null> =
    filters.labelId === "any"
      ? fetchAllLabeledProductIds()
      : filters.labelId !== "all" && filters.labelId !== "none"
        ? fetchProductIdsByLabel(filters.labelId)
        : Promise.resolve(null);

  const labelNegP: Promise<Set<string> | null> =
    filters.labelId === "none"
      ? fetchAllLabeledProductIds()
      : Promise.resolve(null);

  const salePriceHasP: Promise<Set<string> | null> =
    filters.salePrice === "has" || filters.salePrice === "missing"
      ? fetchProductIdsBySalePrice("has")
      : Promise.resolve(null);

  const catIdsP = resolveCategoryIds(filters);

  const [
    ownedOnlySet,
    ownerRestrict,
    ownerNeg,
    labelRestrict,
    labelNeg,
    saleHas,
    catIds,
  ] = await Promise.all([
    ownedOnlyP,
    ownerRestrictP,
    ownerNegP,
    labelRestrictP,
    labelNegP,
    salePriceHasP,
    catIdsP,
  ]);

  let restrict: Set<string> | null = null;
  const addRestrict = (s: Set<string>) => {
    restrict = restrict === null ? s : intersect(restrict, s);
  };
  if (ownedOnlySet) {
    addRestrict(ownedOnlySet);
    if (restrict!.size === 0) return { rows: [], total: 0 };
  }
  if (ownerRestrict) {
    addRestrict(ownerRestrict);
    if (restrict!.size === 0) return { rows: [], total: 0 };
  }
  if (labelRestrict) {
    addRestrict(labelRestrict);
    if (restrict!.size === 0) return { rows: [], total: 0 };
  }
  if (filters.salePrice === "has" && saleHas) {
    addRestrict(saleHas);
    if (restrict!.size === 0) return { rows: [], total: 0 };
  }
  if (ownerNeg) (opts as any).__notOwners = ownerNeg;
  if (labelNeg) (opts as any).__notLabels = labelNeg;
  if (filters.salePrice === "missing" && saleHas) (opts as any).__notPriced = saleHas;

  // 2) base products query
  let qb: any = supabase
    .from("products")
    .select(
      "id, name, sku, model, brand_id, category_id, product_type, base_currency, status, stock_status, brand:brands(name), category:categories(id, name, parent_id)",
      { count: "exact" },
    )
    .order("name", { ascending: true });

  qb = applyBaseFilters(qb, filters);
  if (catIds) qb = qb.in("category_id", catIds);
  if (restrict !== null) {
    const arr = Array.from(restrict);
    if (arr.length === 0) return { rows: [], total: 0 };
    qb = qb.in("id", arr);
  }
  const notOwners: Set<string> | undefined = (opts as any).__notOwners;
  const notLabels: Set<string> | undefined = (opts as any).__notLabels;
  const notPriced: Set<string> | undefined = (opts as any).__notPriced;

  // برای exclusionهای کوچک، .not("id","in",...) — اما برای مجموعه‌های بزرگ
  // post-filter سمت client روی نتیجه صفحه (با pageSize زیاد) مطمئن‌تر است.
  // اینجا اگر set کوچک باشد به DB می‌فرستیم.
  const sendExcl = (s?: Set<string>) => (s && s.size > 0 && s.size <= 1000 ? Array.from(s) : null);
  const exclOwners = sendExcl(notOwners);
  const exclLabels = sendExcl(notLabels);
  const exclPriced = sendExcl(notPriced);
  if (exclOwners) qb = qb.not("id", "in", `(${exclOwners.join(",")})`);
  if (exclLabels) qb = qb.not("id", "in", `(${exclLabels.join(",")})`);
  if (exclPriced) qb = qb.not("id", "in", `(${exclPriced.join(",")})`);

  // اگر set بزرگ هست، fetch بیشتر و post-filter
  const needPostFilter = !!(
    (!exclOwners && notOwners) ||
    (!exclLabels && notLabels) ||
    (!exclPriced && notPriced)
  );
  const rangeSize = needPostFilter ? Math.min(2000, pageSize * 50) : pageSize;
  const start = needPostFilter ? 0 : page * pageSize;
  qb = qb.range(start, start + rangeSize - 1);

  const { data: products, error, count } = await qb;
  if (error) throw error;

  let baseRows: any[] = products ?? [];
  if (needPostFilter) {
    baseRows = baseRows.filter((r: any) => {
      if (notOwners && notOwners.has(r.id)) return false;
      if (notLabels && notLabels.has(r.id)) return false;
      if (notPriced && notPriced.has(r.id)) return false;
      return true;
    });
  }

  const totalCount = needPostFilter ? baseRows.length : (count ?? 0);
  const pageSlice = needPostFilter
    ? baseRows.slice(page * pageSize, page * pageSize + pageSize)
    : baseRows;

  if (pageSlice.length === 0) return { rows: [], total: totalCount };
  const productIds = pageSlice.map((r: any) => r.id as string);

  // 3) hydrate: purchase price (latest active), sale price (latest), owners, tags, parent category
  const nowIso = new Date().toISOString();
  const [ppRes, spRes, ownRes, tagRes, parentCatRes] = await Promise.all([
    supabase
      .from("purchase_prices")
      .select("id, product_id, supplier_id, purchase_price, currency, effective_at")
      .in("product_id", productIds)
      .eq("is_active", true)
      .lte("effective_at", nowIso)
      .order("effective_at", { ascending: false }),
    (supabase as any)
      .from("product_computed_prices_public")
      .select("product_id, rounded_sale_price, computed_at")
      .in("product_id", productIds)
      .order("computed_at", { ascending: false }),
    supabase
      .from("product_owner_assignments")
      .select(
        "product_id, user_id, profile:profiles!product_owner_assignments_user_id_fkey(full_name)",
      )
      .in("product_id", productIds),
    supabase
      .from("product_label_links")
      .select("product_id, label_id, label:product_labels(id, title, color)")
      .in("product_id", productIds),
    (async () => {
      const parentIds = Array.from(
        new Set(
          pageSlice
            .map((r: any) => r.category?.parent_id)
            .filter((x: string | null | undefined): x is string => !!x),
        ),
      );
      if (parentIds.length === 0) return { data: [] as CategoryRow[] };
      const { data } = await supabase
        .from("categories")
        .select("id, name, parent_id")
        .in("id", parentIds);
      return { data: (data ?? []) as CategoryRow[] };
    })(),
  ]);

  if ((spRes as any).error) {
    console.error("[workbench] sale price query failed", (spRes as any).error);
  }

  const latestPP = new Map<string, any>();
  (ppRes.data ?? []).forEach((p: any) => {
    if (!latestPP.has(p.product_id)) latestPP.set(p.product_id, p);
  });
  // Note: profiles join may not always work via fk hint; fallback to manual.
  // برای امنیت، اگر profile null بود همان user_id را نشان می‌دهیم.
  // اگر join شکست خورد، در fallback یک query دوم بزن.
  let ownersRows: any[] = ownRes.data ?? [];
  if ((ownRes as any).error) {
    const { data: ownRaw } = await supabase
      .from("product_owner_assignments")
      .select("product_id, user_id")
      .in("product_id", productIds);
    const userIds = Array.from(new Set((ownRaw ?? []).map((r: any) => r.user_id)));
    const { data: profs } = userIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
      : { data: [] as { id: string; full_name: string | null }[] };
    const profMap = new Map((profs ?? []).map((p) => [p.id, p.full_name]));
    ownersRows = (ownRaw ?? []).map((r: any) => ({
      product_id: r.product_id,
      user_id: r.user_id,
      profile: { full_name: profMap.get(r.user_id) ?? null },
    }));
  }

  const ownersByProduct = new Map<string, WorkbenchOwnerLite[]>();
  ownersRows.forEach((r: any) => {
    const arr = ownersByProduct.get(r.product_id) ?? [];
    arr.push({
      user_id: r.user_id,
      full_name: r.profile?.full_name ?? null,
    });
    ownersByProduct.set(r.product_id, arr);
  });

  const tagsByProduct = new Map<string, WorkbenchTagLite[]>();
  (tagRes.data ?? []).forEach((r: any) => {
    if (!r.label) return;
    const arr = tagsByProduct.get(r.product_id) ?? [];
    arr.push({ id: r.label.id, title: r.label.title, color: r.label.color });
    tagsByProduct.set(r.product_id, arr);
  });

  const latestSP = new Map<string, { price: number; at: string }>();
  (spRes.data ?? []).forEach((r: any) => {
    if (latestSP.has(r.product_id)) return;
    latestSP.set(r.product_id, { price: Number(r.rounded_sale_price), at: r.computed_at });
  });

  const parentCatMap = new Map<string, CategoryRow>();
  (parentCatRes.data ?? []).forEach((c) => parentCatMap.set(c.id, c));

  const rows: WorkbenchRowV2[] = pageSlice.map((p: any) => {
    const pp = latestPP.get(p.id);
    const sp = latestSP.get(p.id);
    const cat = p.category as { id: string; name: string; parent_id: string | null } | null;
    const parent = cat?.parent_id ? parentCatMap.get(cat.parent_id) : undefined;
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      model: p.model,
      brand_id: p.brand_id,
      brand_name: (p.brand as { name: string } | null)?.name ?? null,
      category_id: p.category_id,
      category_name: cat?.name ?? null,
      parent_category_id: parent?.id ?? null,
      parent_category_name: parent?.name ?? null,
      product_type: p.product_type,
      base_currency: p.base_currency,
      status: p.status,
      stock_status: p.stock_status,
      current_price: pp ? Number(pp.purchase_price) : null,
      current_price_id: pp?.id ?? null,
      current_supplier_id: pp?.supplier_id ?? null,
      current_currency: pp?.currency ?? p.base_currency,
      sale_price: sp ? sp.price : null,
      sale_price_updated_at: sp ? sp.at : null,
      owners: ownersByProduct.get(p.id) ?? [],
      tags: tagsByProduct.get(p.id) ?? [],
    };
  });

  return { rows, total: totalCount };
}

/** گزارش سلامت: تا 2000 محصول مشکل‌دار را برمی‌گرداند (با scope ownedOnly اختیاری). */
export async function fetchWorkbenchHealthReport(opts: {
  ownedOnly: { userId: string } | null;
}): Promise<WorkbenchRowV2[]> {
  const { rows } = await fetchWorkbenchRowsV2({
    filters: {
      ...{
        search: "",
        brandId: "all",
        categoryId: "all",
        subcategoryId: "all",
        currencyType: "all",
        currency: "all",
        inventory: "all",
        productStatus: "all",
        salePrice: "all",
        ownerId: "all",
        labelId: "all",
      },
    },
    page: 0,
    pageSize: 2000,
    ownedOnly: opts.ownedOnly,
  });
  return rows;
}

/** لیست مسئولین یکتا (برای فیلتر). */
export async function fetchAllProductOwners(): Promise<
  { user_id: string; full_name: string | null }[]
> {
  const { data: assigns } = await supabase
    .from("product_owner_assignments")
    .select("user_id")
    .limit(PRE_FILTER_LIMIT);
  const ids = Array.from(new Set((assigns ?? []).map((a) => a.user_id as string)));
  if (ids.length === 0) return [];
  const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
  return (profs ?? []).map((p) => ({ user_id: p.id, full_name: p.full_name }));
}
