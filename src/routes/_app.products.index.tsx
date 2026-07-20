import { useMemo, useState } from "react";
import { useSessionStorageState } from "@/hooks/use-session-storage-state";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Plus,
  Package,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Eye,
  Tag,
  History,
  ImageIcon,
} from "lucide-react";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasPermission } from "@/lib/rbac/roles";
import { useDebounce } from "@/hooks/use-debounce";
import { normalizeSearchText } from "@/lib/i18n/search-normalizer";
import {
  ProductFilters,
  EMPTY_FILTERS,
  type ProductFilterState,
} from "@/components/products/ProductFilters";
import {
  PRODUCT_TYPE_LABELS,
  BASE_CURRENCY_LABELS,
  STOCK_STATUS_LABELS,
  STOCK_STATUS_VARIANTS,
  PRODUCT_STATUS_LABELS,
  PRODUCT_STATUS_VARIANTS,
  PRODUCTS_PAGE_SIZE,
} from "@/lib/products/constants";
import { formatDateFa, formatNumber } from "@/lib/i18n/formatters";
import { fetchSettlementTypes, fetchSalePriceTypes } from "@/lib/pricing/queries";
import { formatProductDisplayNameWithFallback } from "@/lib/products/display-name";
import { ProductLabelsQuickDialog } from "@/components/products/ProductLabelsQuickDialog";
import { ProductTimelineDialog } from "@/components/products/ProductTimelineDialog";
import { RecentPurchaseBadge } from "@/components/products/RecentPurchaseBadge";
import { RecentPurchaseGroup } from "@/components/products/RecentPurchaseGroup";

export const Route = createFileRoute("/_app/products/")({
  beforeLoad: async () => {
    await requirePermission("products", "view");
  },
  component: ProductsPage,
});

interface ProductRow {
  id: string;
  name: string;
  sku: string | null;
  product_type: "iranian" | "foreign";
  base_currency: string;
  stock_status: "available" | "unavailable" | "limited" | "unknown";
  status: "active" | "inactive" | "discontinued";
  updated_at: string;
  color: string | null;
  capacity: string | null;
  model: string | null;
  brand: { id: string; name: string } | null;
  category: { id: string; name: string } | null;
  labels: { id: string; title: string; color: string }[];
}

function ProductsPage() {
  const { roles } = useAuth();
  const canCreate = hasPermission(roles, "products", "create");
  const canUpdate = hasPermission(roles, "products", "update");

  const [filters, setFilters] = useSessionStorageState<ProductFilterState>(
    "products:list:filters",
    EMPTY_FILTERS,
  );
  const [page, setPage] = useSessionStorageState<number>("products:list:page", 0);
  const [pageSize, setPageSize] = useSessionStorageState<number>(
    "products:list:pageSize",
    PRODUCTS_PAGE_SIZE,
  );
  const [labelTarget, setLabelTarget] = useState<{ id: string; name: string } | null>(null);
  const [timelineTarget, setTimelineTarget] = useState<{ id: string; name: string } | null>(null);
  const debouncedRaw = useDebounce(filters.q, 350);
  const debouncedNorm = normalizeSearchText(debouncedRaw);
  const debouncedQ = debouncedNorm.length >= 2 ? debouncedNorm : "";

  // any change in filters resets page to 0
  const stableFilters = useMemo(() => ({ ...filters, q: debouncedQ }), [filters, debouncedQ]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["products", stableFilters, page, pageSize],
    queryFn: async () => {
      const from = page * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from("products")
        .select(
          `id, name, sku, product_type, base_currency, stock_status, status, updated_at, color, capacity, model,
           brand:brands(id,name), category:categories(id,name),
           product_label_links(label:product_labels(id,title,color))`,
          { count: "exact" },
        )
        .order("updated_at", { ascending: false })
        .range(from, to);

      if (stableFilters.q.trim()) {
        const term = stableFilters.q.trim().replace(/[%_]/g, "");
        // Use server-side multi-field search RPC to also match brand, category,
        // model, color, capacity, primary_spec, and dynamic attribute values.
        const { data: idsData, error: idsErr } = await supabase.rpc("search_product_ids", {
          p_term: term,
          p_limit: 500,
        });
        if (idsErr) {
          // Fallback to legacy name/sku search if RPC is unavailable
          query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
        } else {
          const ids = (idsData ?? []).map((r: { id: string }) => r.id);
          if (ids.length === 0) {
            return { rows: [] as ProductRow[], total: 0 };
          }
          query = query.in("id", ids);
        }
      }
      if (stableFilters.brand_id) query = query.eq("brand_id", stableFilters.brand_id);
      if (stableFilters.category_id) query = query.eq("category_id", stableFilters.category_id);
      if (stableFilters.product_type) query = query.eq("product_type", stableFilters.product_type);
      if (stableFilters.base_currency)
        query = query.eq("base_currency", stableFilters.base_currency);
      if (stableFilters.stock_status) query = query.eq("stock_status", stableFilters.stock_status);
      if (stableFilters.status) query = query.eq("status", stableFilters.status);
      if (stableFilters.color) query = query.eq("color", stableFilters.color);
      if (stableFilters.capacity) query = query.eq("capacity", stableFilters.capacity);
      if (stableFilters.model) query = query.eq("model", stableFilters.model);

      const { data: rows, error, count } = await query;
      if (error) throw error;

      let normalized: ProductRow[] = (rows ?? []).map((r) => {
        const row = r as any;
        return {
          id: row.id,
          name: row.name,
          sku: row.sku,
          product_type: row.product_type,
          base_currency: row.base_currency,
          stock_status: row.stock_status,
          status: row.status,
          updated_at: row.updated_at,
          color: row.color ?? null,
          capacity: row.capacity ?? null,
          model: row.model ?? null,
          brand: row.brand ?? null,
          category: row.category ?? null,
          labels: (row.product_label_links ?? []).map((x: any) => x.label).filter(Boolean),
        };
      });

      // فیلتر برچسب‌ها سمت کلاینت (چون m2m)
      if (stableFilters.label_ids.length > 0) {
        normalized = normalized.filter((p) =>
          stableFilters.label_ids.every((id) => p.labels.some((l) => l.id === id)),
        );
      }

      return { rows: normalized, total: count ?? 0 };
    },
  });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Fetch one thumbnail per visible product (primary first, else lowest sort_order)
  const visibleIds = useMemo(() => (data?.rows ?? []).map((r) => r.id), [data?.rows]);
  const thumbnailsQ = useQuery({
    enabled: visibleIds.length > 0,
    queryKey: ["product-thumbnails", visibleIds],
    queryFn: async () => {
      const { data: imgs, error } = await supabase
        .from("product_images")
        .select("product_id, url, is_primary, sort_order")
        .in("product_id", visibleIds)
        .order("is_primary", { ascending: false })
        .order("sort_order", { ascending: true });
      if (error) throw error;
      const firstByProduct = new Map<string, string>();
      for (const r of imgs ?? []) {
        if (!firstByProduct.has((r as any).product_id))
          firstByProduct.set((r as any).product_id, (r as any).url);
      }
      const paths = Array.from(firstByProduct.values());
      if (paths.length === 0) return new Map<string, string>();
      const { data: signed } = await supabase.storage
        .from("product-images")
        .createSignedUrls(paths, 3600);
      const signedByPath = new Map<string, string>();
      (signed ?? []).forEach((s: any) => {
        if (s.path && s.signedUrl) signedByPath.set(s.path, s.signedUrl);
      });
      const out = new Map<string, string>();
      firstByProduct.forEach((path, pid) => {
        const u = signedByPath.get(path);
        if (u) out.set(pid, u);
      });
      return out;
    },
    staleTime: 60_000,
  });
  const thumbnailFor = (id: string) => thumbnailsQ.data?.get(id);

  // Sale-price column: settlement-term selector + batched price lookup.
  const [settlementTypeId, setSettlementTypeId] = useState<string>("__base");
  const settlementTypesQ = useQuery({
    queryKey: ["settlement-types-active"],
    queryFn: () => fetchSettlementTypes(true),
    staleTime: 300_000,
  });
  const salePriceTypesQ = useQuery({
    queryKey: ["sale-price-types-active"],
    queryFn: () => fetchSalePriceTypes(true),
    staleTime: 300_000,
  });
  // "primary" price type = first active by sort_order (نقدی), matching the
  // sort_order convention used elsewhere.
  const primaryPriceTypeId = salePriceTypesQ.data?.[0]?.id ?? null;
  const primaryPriceTypeTitle = salePriceTypesQ.data?.[0]?.title ?? "";

  const pricesQ = useQuery({
    enabled: visibleIds.length > 0 && !!primaryPriceTypeId,
    queryKey: ["product-list-prices", visibleIds, primaryPriceTypeId, settlementTypeId],
    queryFn: async () => {
      let pq = supabase
        .from("product_computed_prices")
        .select("product_id, rounded_sale_price, final_sale_price")
        .eq("sale_price_type_id", primaryPriceTypeId as string)
        .in("product_id", visibleIds);
      pq =
        settlementTypeId === "__base"
          ? pq.is("settlement_type_id", null)
          : pq.eq("settlement_type_id", settlementTypeId);
      const { data: rows, error } = await pq;
      if (error) throw error;
      const map = new Map<string, number>();
      for (const r of rows ?? []) {
        const row = r as {
          product_id: string;
          rounded_sale_price: number | null;
          final_sale_price: number | null;
        };
        const price = row.rounded_sale_price ?? row.final_sale_price ?? null;
        if (price != null) map.set(row.product_id, Number(price));
      }
      return map;
    },
  });
  const priceFor = (id: string): number | null => pricesQ.data?.get(id) ?? null;

  const onFiltersChange = (next: ProductFilterState) => {
    setFilters(next);
    setPage(0);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="محصولات"
        description="مدیریت محصولات افراکالا، دسته‌ها، برندها و برچسب‌ها"
        actions={
          canCreate ? (
            <Button asChild size="sm">
              <Link to="/products/new">
                <Plus className="ms-1 h-4 w-4" />
                محصول جدید
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap gap-2 text-xs">
        <Link
          to="/products/brands"
          className="rounded-md border border-border bg-card px-3 py-1.5 text-foreground hover:bg-muted"
        >
          برندها
        </Link>
        <Link
          to="/products/categories"
          className="rounded-md border border-border bg-card px-3 py-1.5 text-foreground hover:bg-muted"
        >
          دسته‌بندی‌ها
        </Link>
        <Link
          to="/products/labels"
          className="rounded-md border border-border bg-card px-3 py-1.5 text-foreground hover:bg-muted"
        >
          برچسب‌ها
        </Link>
        <Link
          to="/products/attributes"
          className="rounded-md border border-border bg-card px-3 py-1.5 text-foreground hover:bg-muted"
        >
          ویژگی‌های محصول
        </Link>
        {canUpdate && (
          <Link
            to="/products/regenerate-names"
            className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-primary hover:bg-primary/20"
          >
            ساخت خودکار نام محصولات
          </Link>
        )}
      </div>

      <ProductFilters value={filters} onChange={onFiltersChange} />

      {isLoading ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            در حال بارگذاری...
          </CardContent>
        </Card>
      ) : (data?.rows.length ?? 0) === 0 ? (
        <EmptyState
          icon={Package}
          title="محصولی یافت نشد"
          description="با تغییر فیلترها یا افزودن محصول جدید شروع کنید."
        />
      ) : (
        <RecentPurchaseGroup productIds={(data?.rows ?? []).map((p) => p.id)}>
          {/* Settlement-term selector for the sale-price column */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">نوع تسویه (قیمت فروش):</span>
            <Select value={settlementTypeId} onValueChange={setSettlementTypeId}>
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__base">قیمت پایه</SelectItem>
                {(settlementTypesQ.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {primaryPriceTypeTitle && (
              <span className="text-[11px] text-muted-foreground">
                (نوع قیمت: {primaryPriceTypeTitle})
              </span>
            )}
          </div>
          {/* Desktop table */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50 text-right text-xs text-muted-foreground">
                    <tr>
                      <th className="p-3 font-medium w-12">تصویر</th>
                      <th className="p-3 font-medium">نام</th>
                      <th className="p-3 font-medium">SKU</th>
                      <th className="p-3 font-medium">برند</th>
                      <th className="p-3 font-medium">دسته</th>
                      <th className="p-3 font-medium">رنگ</th>
                      <th className="p-3 font-medium">ظرفیت</th>
                      <th className="p-3 font-medium">مدل</th>
                      <th className="p-3 font-medium">نوع / ارز</th>
                      <th className="p-3 font-medium">موجودی</th>
                      <th className="p-3 font-medium">خرید اخیر</th>
                      <th className="p-3 font-medium">قیمت فروش</th>
                      <th className="p-3 font-medium">وضعیت</th>
                      <th className="p-3 font-medium">به‌روزرسانی</th>
                      <th className="p-3 font-medium">عملیات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.rows ?? []).map((p, index) => (
                      <tr
                        key={p.id}
                        className="border-b last:border-0 hover:bg-muted/30 animate-in fade-in slide-in-from-bottom-1 duration-300 fill-mode-forwards"
                        style={{ animationDelay: `${index * 30}ms`, animationFillMode: "forwards" }}
                      >
                        <td className="p-2">
                          {thumbnailFor(p.id) ? (
                            <img
                              src={thumbnailFor(p.id)}
                              alt=""
                              className="h-10 w-10 rounded-md object-cover border border-border transition-transform duration-200 hover:scale-110"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                              <ImageIcon className="h-4 w-4" />
                            </div>
                          )}
                        </td>
                        <td className="p-3">
                          <Link
                            to="/products/$id"
                            params={{ id: p.id }}
                            className="font-medium text-foreground hover:underline"
                          >
                            {formatProductDisplayNameWithFallback(p)}
                          </Link>
                          {p.labels.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {p.labels.map((l) => (
                                <span
                                  key={l.id}
                                  className="rounded-full px-2 py-0.5 text-[10px]"
                                  style={{ backgroundColor: `${l.color}22`, color: l.color }}
                                >
                                  {l.title}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-muted-foreground" dir="ltr">
                          {p.sku ?? "—"}
                        </td>
                        <td className="p-3">{p.brand?.name ?? "—"}</td>
                        <td className="p-3">{p.category?.name ?? "—"}</td>
                        <td className="p-3 text-muted-foreground">{p.color ?? "—"}</td>
                        <td className="p-3 text-muted-foreground">{p.capacity ?? "—"}</td>
                        <td className="p-3 text-muted-foreground">{p.model ?? "—"}</td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {PRODUCT_TYPE_LABELS[p.product_type]} /{" "}
                          {(BASE_CURRENCY_LABELS as Record<string, string>)[p.base_currency] ??
                            p.base_currency.toUpperCase()}
                        </td>
                        <td className="p-3">
                          <Badge variant={STOCK_STATUS_VARIANTS[p.stock_status]}>
                            {STOCK_STATUS_LABELS[p.stock_status]}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <RecentPurchaseBadge productId={p.id} />
                        </td>
                        <td className="p-3 font-medium">
                          {priceFor(p.id) != null ? (
                            `${formatNumber(priceFor(p.id) as number)} ت`
                          ) : (
                            <span className="text-xs text-muted-foreground">قیمت ثبت نشده</span>
                          )}
                        </td>
                        <td className="p-3">
                          <Badge variant={PRODUCT_STATUS_VARIANTS[p.status]}>
                            {PRODUCT_STATUS_LABELS[p.status]}
                          </Badge>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {formatDateFa(p.updated_at)}
                        </td>
                        <td className="p-3">
                          <div className="flex gap-1">
                            <Button asChild variant="ghost" size="icon" aria-label="جزئیات">
                              <Link to="/products/$id" params={{ id: p.id }}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="تاریخچه"
                              title="تاریخچه"
                              onClick={() =>
                                setTimelineTarget({
                                  id: p.id,
                                  name: formatProductDisplayNameWithFallback(p),
                                })
                              }
                            >
                              <History className="h-4 w-4" />
                            </Button>
                            {canUpdate && (
                              <Button asChild variant="ghost" size="icon" aria-label="ویرایش">
                                <Link to="/products/$id" params={{ id: p.id }} search={{ edit: 1 }}>
                                  <Pencil className="h-4 w-4" />
                                </Link>
                              </Button>
                            )}
                            {canUpdate && (
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="برچسب‌زدن"
                                title="برچسب‌زدن"
                                onClick={() =>
                                  setLabelTarget({
                                    id: p.id,
                                    name: formatProductDisplayNameWithFallback(p),
                                  })
                                }
                              >
                                <Tag className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {(data?.rows ?? []).map((p) => (
              <Card key={p.id}>
                <CardContent className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <Link
                        to="/products/$id"
                        params={{ id: p.id }}
                        className="shrink-0"
                        aria-label="مشاهده محصول"
                      >
                        {thumbnailFor(p.id) ? (
                          <img
                            src={thumbnailFor(p.id)}
                            alt=""
                            className="h-12 w-12 rounded-md border border-border object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                            <ImageIcon className="h-4 w-4" />
                          </div>
                        )}
                      </Link>
                      <Link
                        to="/products/$id"
                        params={{ id: p.id }}
                        className="min-w-0 font-semibold text-foreground hover:underline"
                      >
                        {formatProductDisplayNameWithFallback(p)}
                      </Link>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Badge variant={PRODUCT_STATUS_VARIANTS[p.status]}>
                        {PRODUCT_STATUS_LABELS[p.status]}
                      </Badge>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                    <div>
                      SKU: <span dir="ltr">{p.sku ?? "—"}</span>
                    </div>
                    <div>برند: {p.brand?.name ?? "—"}</div>
                    <div>دسته: {p.category?.name ?? "—"}</div>
                    <div>رنگ: {p.color ?? "—"}</div>
                    <div>ظرفیت: {p.capacity ?? "—"}</div>
                    <div>مدل: {p.model ?? "—"}</div>
                    <div>
                      {PRODUCT_TYPE_LABELS[p.product_type]} /{" "}
                      {(BASE_CURRENCY_LABELS as Record<string, string>)[p.base_currency] ??
                        p.base_currency.toUpperCase()}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge variant={STOCK_STATUS_VARIANTS[p.stock_status]}>
                        {STOCK_STATUS_LABELS[p.stock_status]}
                      </Badge>
                      <RecentPurchaseBadge productId={p.id} />
                      <span className="text-xs font-medium">
                        {priceFor(p.id) != null
                          ? `${formatNumber(priceFor(p.id) as number)} ت`
                          : "قیمت ثبت نشده"}
                      </span>
                    </div>
                    {canUpdate && (
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setTimelineTarget({
                              id: p.id,
                              name: formatProductDisplayNameWithFallback(p),
                            })
                          }
                        >
                          <History className="ms-1 h-3.5 w-3.5" />
                          تاریخچه
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setLabelTarget({
                              id: p.id,
                              name: formatProductDisplayNameWithFallback(p),
                            })
                          }
                        >
                          <Tag className="ms-1 h-3.5 w-3.5" />
                          برچسب
                        </Button>
                        <Button asChild variant="outline" size="sm">
                          <Link to="/products/$id" params={{ id: p.id }} search={{ edit: 1 }}>
                            <Pencil className="ms-1 h-3.5 w-3.5" />
                            ویرایش
                          </Link>
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm">
            <div className="text-muted-foreground">
              مجموع:{" "}
              <span className="font-medium text-foreground">{total.toLocaleString("fa-IR")}</span>
              {isFetching && <span className="ms-2 text-xs">در حال به‌روزرسانی...</span>}
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v));
                  setPage(0);
                }}
              >
                <SelectTrigger className="h-8 w-[130px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="20">۲۰ در صفحه</SelectItem>
                  <SelectItem value="50">۵۰ در صفحه</SelectItem>
                  <SelectItem value="100">۱۰۰ در صفحه</SelectItem>
                  <SelectItem value="200">۲۰۰ در صفحه</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronRight className="h-4 w-4" />
                قبلی
              </Button>
              <span className="text-xs text-muted-foreground">
                {(page + 1).toLocaleString("fa-IR")} / {totalPages.toLocaleString("fa-IR")}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                بعدی
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </RecentPurchaseGroup>
      )}

      <ProductLabelsQuickDialog
        productId={labelTarget?.id ?? null}
        productName={labelTarget?.name ?? ""}
        open={!!labelTarget}
        onOpenChange={(o) => {
          if (!o) setLabelTarget(null);
        }}
      />

      <ProductTimelineDialog
        productId={timelineTarget?.id ?? null}
        productName={timelineTarget?.name ?? ""}
        open={!!timelineTarget}
        onOpenChange={(o) => {
          if (!o) setTimelineTarget(null);
        }}
      />
    </div>
  );
}
