import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Package, ChevronLeft, ChevronRight, Pencil, Eye } from "lucide-react";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasPermission } from "@/lib/rbac/roles";
import { useDebounce } from "@/hooks/use-debounce";
import { ProductFilters, EMPTY_FILTERS, type ProductFilterState } from "@/components/products/ProductFilters";
import {
  PRODUCT_TYPE_LABELS, BASE_CURRENCY_LABELS, STOCK_STATUS_LABELS, STOCK_STATUS_VARIANTS,
  PRODUCT_STATUS_LABELS, PRODUCT_STATUS_VARIANTS, PRODUCTS_PAGE_SIZE,
} from "@/lib/products/constants";
import { formatDateFa } from "@/lib/i18n/formatters";

export const Route = createFileRoute("/_app/products/")({
  beforeLoad: async () => { await requirePermission("products", "view"); },
  component: ProductsPage,
});

interface ProductRow {
  id: string;
  name: string;
  sku: string | null;
  product_type: "iranian" | "foreign";
  base_currency: "toman" | "usd" | "aed";
  stock_status: "available" | "unavailable" | "limited" | "unknown";
  status: "active" | "inactive" | "discontinued";
  updated_at: string;
  brand: { id: string; name: string } | null;
  category: { id: string; name: string } | null;
  labels: { id: string; title: string; color: string }[];
}

function ProductsPage() {
  const { roles } = useAuth();
  const canCreate = hasPermission(roles, "products", "create");
  const canUpdate = hasPermission(roles, "products", "update");

  const [filters, setFilters] = useState<ProductFilterState>(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const debouncedQ = useDebounce(filters.q, 350);

  // any change in filters resets page to 0
  const stableFilters = useMemo(() => ({ ...filters, q: debouncedQ }), [filters, debouncedQ]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["products", stableFilters, page],
    queryFn: async () => {
      const from = page * PRODUCTS_PAGE_SIZE;
      const to = from + PRODUCTS_PAGE_SIZE - 1;

      let query = supabase
        .from("products")
        .select(
          `id, name, sku, product_type, base_currency, stock_status, status, updated_at,
           brand:brands(id,name), category:categories(id,name),
           product_label_links(label:product_labels(id,title,color))`,
          { count: "exact" }
        )
        .order("updated_at", { ascending: false })
        .range(from, to);

      if (stableFilters.q.trim()) {
        const term = stableFilters.q.trim().replace(/[%_]/g, "");
        query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
      }
      if (stableFilters.brand_id) query = query.eq("brand_id", stableFilters.brand_id);
      if (stableFilters.category_id) query = query.eq("category_id", stableFilters.category_id);
      if (stableFilters.product_type) query = query.eq("product_type", stableFilters.product_type);
      if (stableFilters.base_currency) query = query.eq("base_currency", stableFilters.base_currency);
      if (stableFilters.stock_status) query = query.eq("stock_status", stableFilters.stock_status);
      if (stableFilters.status) query = query.eq("status", stableFilters.status);

      const { data: rows, error, count } = await query;
      if (error) throw error;

      let normalized: ProductRow[] = (rows ?? []).map((r) => {
        const row = r as any;
        return {
          id: row.id, name: row.name, sku: row.sku,
          product_type: row.product_type, base_currency: row.base_currency,
          stock_status: row.stock_status, status: row.status, updated_at: row.updated_at,
          brand: row.brand ?? null,
          category: row.category ?? null,
          labels: (row.product_label_links ?? []).map((x: any) => x.label).filter(Boolean),
        };
      });

      // فیلتر برچسب‌ها سمت کلاینت (چون m2m)
      if (stableFilters.label_ids.length > 0) {
        normalized = normalized.filter((p) =>
          stableFilters.label_ids.every((id) => p.labels.some((l) => l.id === id))
        );
      }

      return { rows: normalized, total: count ?? 0 };
    },
  });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PRODUCTS_PAGE_SIZE));

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
              <Link to="/products/new"><Plus className="ms-1 h-4 w-4" />محصول جدید</Link>
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap gap-2 text-xs">
        <Link to="/products/brands" className="rounded-md border border-border bg-card px-3 py-1.5 text-foreground hover:bg-muted">برندها</Link>
        <Link to="/products/categories" className="rounded-md border border-border bg-card px-3 py-1.5 text-foreground hover:bg-muted">دسته‌بندی‌ها</Link>
        <Link to="/products/labels" className="rounded-md border border-border bg-card px-3 py-1.5 text-foreground hover:bg-muted">برچسب‌ها</Link>
      </div>

      <ProductFilters value={filters} onChange={onFiltersChange} />

      {isLoading ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">در حال بارگذاری...</CardContent></Card>
      ) : (data?.rows.length ?? 0) === 0 ? (
        <EmptyState icon={Package} title="محصولی یافت نشد" description="با تغییر فیلترها یا افزودن محصول جدید شروع کنید." />
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50 text-right text-xs text-muted-foreground">
                    <tr>
                      <th className="p-3 font-medium">نام</th>
                      <th className="p-3 font-medium">SKU</th>
                      <th className="p-3 font-medium">برند</th>
                      <th className="p-3 font-medium">دسته</th>
                      <th className="p-3 font-medium">نوع / ارز</th>
                      <th className="p-3 font-medium">موجودی</th>
                      <th className="p-3 font-medium">وضعیت</th>
                      <th className="p-3 font-medium">به‌روزرسانی</th>
                      <th className="p-3 font-medium">عملیات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.rows ?? []).map((p) => (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="p-3">
                          <Link to="/products/$id" params={{ id: p.id }} className="font-medium text-foreground hover:underline">
                            {p.name}
                          </Link>
                          {p.labels.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {p.labels.map((l) => (
                                <span key={l.id} className="rounded-full px-2 py-0.5 text-[10px]" style={{ backgroundColor: `${l.color}22`, color: l.color }}>
                                  {l.title}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-muted-foreground" dir="ltr">{p.sku ?? "—"}</td>
                        <td className="p-3">{p.brand?.name ?? "—"}</td>
                        <td className="p-3">{p.category?.name ?? "—"}</td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {PRODUCT_TYPE_LABELS[p.product_type]} / {BASE_CURRENCY_LABELS[p.base_currency]}
                        </td>
                        <td className="p-3"><Badge variant={STOCK_STATUS_VARIANTS[p.stock_status]}>{STOCK_STATUS_LABELS[p.stock_status]}</Badge></td>
                        <td className="p-3"><Badge variant={PRODUCT_STATUS_VARIANTS[p.status]}>{PRODUCT_STATUS_LABELS[p.status]}</Badge></td>
                        <td className="p-3 text-xs text-muted-foreground">{formatDateFa(p.updated_at)}</td>
                        <td className="p-3">
                          <div className="flex gap-1">
                            <Button asChild variant="ghost" size="icon" aria-label="جزئیات">
                              <Link to="/products/$id" params={{ id: p.id }}><Eye className="h-4 w-4" /></Link>
                            </Button>
                            {canUpdate && (
                              <Button asChild variant="ghost" size="icon" aria-label="ویرایش">
                                <Link to="/products/$id/edit" params={{ id: p.id }}><Pencil className="h-4 w-4" /></Link>
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
                    <Link to="/products/$id" params={{ id: p.id }} className="font-semibold text-foreground hover:underline">
                      {p.name}
                    </Link>
                    <div className="flex shrink-0 gap-1">
                      <Badge variant={PRODUCT_STATUS_VARIANTS[p.status]}>{PRODUCT_STATUS_LABELS[p.status]}</Badge>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                    <div>SKU: <span dir="ltr">{p.sku ?? "—"}</span></div>
                    <div>برند: {p.brand?.name ?? "—"}</div>
                    <div>دسته: {p.category?.name ?? "—"}</div>
                    <div>{PRODUCT_TYPE_LABELS[p.product_type]} / {BASE_CURRENCY_LABELS[p.base_currency]}</div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <Badge variant={STOCK_STATUS_VARIANTS[p.stock_status]}>{STOCK_STATUS_LABELS[p.stock_status]}</Badge>
                    {canUpdate && (
                      <Button asChild variant="outline" size="sm">
                        <Link to="/products/$id/edit" params={{ id: p.id }}><Pencil className="ms-1 h-3.5 w-3.5" />ویرایش</Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm">
            <div className="text-muted-foreground">
              مجموع: <span className="font-medium text-foreground">{total.toLocaleString("fa-IR")}</span>
              {isFetching && <span className="ms-2 text-xs">در حال به‌روزرسانی...</span>}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                <ChevronRight className="h-4 w-4" />قبلی
              </Button>
              <span className="text-xs text-muted-foreground">
                {(page + 1).toLocaleString("fa-IR")} / {totalPages.toLocaleString("fa-IR")}
              </span>
              <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
                بعدی<ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
