import { createFileRoute, Link } from "@tanstack/react-router";
import { BRANDING } from "@/config/branding";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Tag,
  LineChart,
  PackageX,
  Calculator,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  UserPlus,
  Minus,
} from "lucide-react";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { EffectiveCurrenciesPanel } from "@/components/pricing/EffectiveCurrenciesPanel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDebounce } from "@/hooks/use-debounce";
import { normalizeSearchText } from "@/lib/i18n/search-normalizer";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasPermissionEx } from "@/lib/rbac/roles";
import { supabase } from "@/integrations/supabase/client";
import { fetchSalePriceTypes } from "@/lib/pricing/queries";
import { formatNumber, formatDateTimeFa, toFaDigits } from "@/lib/i18n/formatters";
import { StockAlertButton } from "@/components/sales/StockAlertButton";
import { CreatePriceAlertButton } from "@/components/pricing/price-alerts/CreatePriceAlertButton";
import { SupplierReferralModal } from "@/shared/components/SupplierReferralModal";
import { RoleGuard } from "@/components/rbac/RoleGuard";
import { formatProductDisplayNameWithFallback } from "@/lib/products/display-name";
import { ProductPriceHistoryDrawer } from "@/components/pricing/price-history/ProductPriceHistoryDrawer";
import { trackProductInteraction } from "@/lib/analytics/product-interactions";
import { useProductThumbnails } from "@/hooks/products/useProductThumbnails";
import { toast } from "sonner";
import { Clipboard } from "lucide-react";
import {
  formatForPlainText,
  formatForTelegram,
  formatForWhatsApp,
  type PriceListCanonicalModel,
  type PriceListRow,
} from "@/lib/price-list/canonical";

export const Route = createFileRoute("/_app/pricing/live-price-list")({
  beforeLoad: async () => {
    await requirePermission("pricing", "view");
  },
  component: LivePriceListPage,
});

const PAGE_SIZE = 20;

type PriceFilter = "all" | "with" | "without";

interface ProductRow {
  id: string;
  name: string;
  sku: string | null;
  product_type: "iranian" | "foreign" | string;
  stock_status: string;
  status: string;
  color?: string | null;
  capacity?: string | null;
  model?: string | null;
  brand?: { id: string; name: string } | null;
  category?: { id: string; name: string } | null;
}

interface HistoryRow {
  id: string;
  product_id: string;
  sale_price_type_id: string | null;
  old_sale_price: number | null;
  change_amount: number | null;
  change_percent: number | null;
  created_at: string;
}

interface PriceRow {
  product_id: string;
  sale_price_type_id: string | null;
  rounded_sale_price: number;
  computed_at: string;
}

interface SnapshotLite {
  id: string;
  pricing_rule_id: string | null;
  rounded_sale_price: number | null;
  calculated_at: string;
}

function LivePriceListPage() {
  const { roles } = useAuth();
  const isPrivileged = hasPermissionEx(roles, "pricing", "view_sensitive");
  const isSalesOnly = !isPrivileged && roles.includes("sales");

  // ---------- chart drawer ----------
  const [chartCtx, setChartCtx] = useState<{
    productId: string;
    productName: string;
    salePriceTypeId: string;
    salePriceTypeTitle: string;
  } | null>(null);

  // ---------- filters ----------
  const [search, setSearch] = useState("");
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const dSearchRaw = useDebounce(search, 350);
  const dSearch = normalizeSearchText(dSearchRaw);
  const [brandId, setBrandId] = useState<string>("__all");
  const [categoryId, setCategoryId] = useState<string>("__all");
  const [productType, setProductType] = useState<string>("__all");
  const [stockStatus, setStockStatus] = useState<string>("__all");
  const [salePriceTypeId, setSalePriceTypeId] = useState<string>("__all");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");
  const [minPrice, setMinPrice] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [page, setPage] = useState(1);

  const minNum = minPrice.trim() ? Number(minPrice) : null;
  const maxNum = maxPrice.trim() ? Number(maxPrice) : null;
  const priceRangeError =
    (minNum !== null && (Number.isNaN(minNum) || minNum < 0)) ||
    (maxNum !== null && (Number.isNaN(maxNum) || maxNum < 0))
      ? "قیمت باید عدد مثبت باشد."
      : minNum !== null && maxNum !== null && minNum > maxNum
        ? "حداقل قیمت نمی‌تواند بیشتر از حداکثر باشد."
        : null;

  const effectiveSearch = dSearch.trim().length >= 2 ? dSearch.trim() : "";

  // reset page when filters change
  useMemo(() => {
    setPage(1);
  }, [
    effectiveSearch,
    brandId,
    categoryId,
    productType,
    stockStatus,
    salePriceTypeId,
    priceFilter,
    minPrice,
    maxPrice,
  ]);

  // ---------- reference data ----------
  const { data: brands = [] } = useQuery({
    queryKey: ["brands-lite"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brands")
        .select("id, name")
        .eq("is_active", true)
        .order("name")
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["categories-lite"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name")
        .eq("is_active", true)
        .order("name")
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });
  const { data: salePriceTypes = [] } = useQuery({
    queryKey: ["sale-price-types-active"],
    queryFn: () => fetchSalePriceTypes(true),
    staleTime: 5 * 60_000,
  });

  // ---------- products query (paginated) ----------
  const productsQuery = useQuery({
    queryKey: [
      "live-price-products",
      { effectiveSearch, brandId, categoryId, productType, stockStatus, page },
    ],
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = supabase
        .from("products")
        .select(
          "id, name, sku, product_type, stock_status, status, color, capacity, model, brand:brands(id, name), category:categories(id, name)",
          { count: "exact" },
        )
        .eq("is_active", true)
        .order("name", { ascending: true })
        .range(from, to);
      if (effectiveSearch) {
        const safe = effectiveSearch.replace(/[%_]/g, "");
        const { data: idsData, error: idsErr } = await supabase.rpc("search_product_ids", {
          p_term: safe,
          p_limit: 500,
        });
        if (idsErr) {
          q = q.or(`name.ilike.%${safe}%,sku.ilike.%${safe}%`);
        } else {
          const ids = (idsData ?? []).map((r: { id: string }) => r.id);
          if (ids.length === 0) {
            return { rows: [] as ProductRow[], total: 0 };
          }
          q = q.in("id", ids);
        }
      }
      if (brandId !== "__all") q = q.eq("brand_id", brandId);
      if (categoryId !== "__all") q = q.eq("category_id", categoryId);
      if (productType !== "__all") q = q.eq("product_type", productType as "iranian" | "foreign");
      if (stockStatus !== "__all")
        q = q.eq(
          "stock_status",
          stockStatus as "available" | "limited" | "unavailable" | "unknown",
        );
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as ProductRow[], total: count ?? 0 };
    },
    staleTime: 30_000,
  });

  const productIds = useMemo(
    () => (productsQuery.data?.rows ?? []).map((p) => p.id),
    [productsQuery.data],
  );

  // Thumbnails for visible products (shared pattern with /products admin list)
  const { thumbnailFor } = useProductThumbnails(productIds);

  // ---------- current prices (from product_computed_prices_public) ----------
  const pricesQuery = useQuery({
    enabled: productIds.length > 0,
    queryKey: ["live-price-pcp", productIds, salePriceTypeId],
    queryFn: async () => {
      let q = supabase
        .from("product_computed_prices_public")
        .select(
          "product_id, sale_price_type_id, rounded_sale_price, computed_at",
        )
        .in("product_id", productIds)
        .order("computed_at", { ascending: false })
        .limit(productIds.length * 50);
      if (salePriceTypeId !== "__all") q = q.eq("sale_price_type_id", salePriceTypeId);
      const { data, error } = await q;
      if (error) throw error;
      // dedupe latest by (product_id, sale_price_type_id)
      const seen = new Set<string>();
      const latest: PriceRow[] = [];
      for (const r of (data ?? []) as PriceRow[]) {
        const k = `${r.product_id}::${r.sale_price_type_id ?? "_"}`;
        if (seen.has(k)) continue;
        seen.add(k);
        latest.push(r);
      }
      return latest;
    },
    staleTime: 30_000,
  });

  // ---------- last change info (from product_sale_price_history) ----------
  const changeQuery = useQuery({
    enabled: productIds.length > 0,
    queryKey: ["live-price-history-change", productIds, salePriceTypeId],
    queryFn: async () => {
      let q = supabase
        .from("product_sale_price_history")
        .select(
          "product_id, sale_price_type_id, old_sale_price, change_amount, change_percent, created_at",
        )
        .in("product_id", productIds)
        .order("created_at", { ascending: false })
        .limit(productIds.length * 50);
      if (salePriceTypeId !== "__all") q = q.eq("sale_price_type_id", salePriceTypeId);
      const { data, error } = await q;
      if (error) throw error;
      const seen = new Set<string>();
      const latest: Array<Omit<HistoryRow, "id">> = [];
      for (const r of (data ?? []) as Array<Omit<HistoryRow, "id">>) {
        const k = `${r.product_id}::${r.sale_price_type_id ?? "_"}`;
        if (seen.has(k)) continue;
        seen.add(k);
        latest.push(r);
      }
      return latest;
    },
    staleTime: 30_000,
  });

  // ---------- snapshots (only for privileged users) ----------
  // PCP rows don't carry snapshot_id; keep query disabled to preserve type-shape.
  const snapshotIds: string[] = useMemo(() => [], []);
  const snapshotsQuery = useQuery({
    enabled: isPrivileged && snapshotIds.length > 0,
    queryKey: ["live-price-snapshots", snapshotIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("price_calculation_snapshots")
        .select("id, pricing_rule_id, rounded_sale_price, calculated_at")
        .in("id", snapshotIds);
      if (error) throw error;
      return (data ?? []) as SnapshotLite[];
    },
    staleTime: 60_000,
  });

  // ---------- merge ----------
  type MergedHistory = {
    id: string;
    product_id: string;
    sale_price_type_id: string | null;
    rounded_sale_price: number;
    computed_at: string;
    old_sale_price: number | null;
    change_amount: number | null;
    change_percent: number | null;
    snapshot?: SnapshotLite | null;
    sale_price_type_title?: string;
  };
  type MergedRow = {
    product: ProductRow;
    histories: MergedHistory[];
    hasPrice: boolean;
  };
  const merged: MergedRow[] = useMemo(() => {
    const byProduct = new Map<string, MergedRow>();
    const products = productsQuery.data?.rows ?? [];
    for (const p of products) byProduct.set(p.id, { product: p, histories: [], hasPrice: false });
    const typeMap = new Map(salePriceTypes.map((t: any) => [t.id, t.title as string]));
    const changeMap = new Map<string, Omit<HistoryRow, "id">>();
    for (const c of changeQuery.data ?? []) {
      changeMap.set(`${c.product_id}::${c.sale_price_type_id ?? "_"}`, c);
    }
    for (const p of pricesQuery.data ?? []) {
      const m = byProduct.get(p.product_id);
      if (!m) continue;
      const key = `${p.product_id}::${p.sale_price_type_id ?? "_"}`;
      const ch = changeMap.get(key);
      m.histories.push({
        id: key,
        product_id: p.product_id,
        sale_price_type_id: p.sale_price_type_id,
        rounded_sale_price: Number(p.rounded_sale_price),
        computed_at: p.computed_at,
        old_sale_price: ch?.old_sale_price ?? null,
        change_amount: ch?.change_amount ?? null,
        change_percent: ch?.change_percent ?? null,
        snapshot: null,
        sale_price_type_title: p.sale_price_type_id ? typeMap.get(p.sale_price_type_id) : "—",
      });
      m.hasPrice = true;
    }
    let result = Array.from(byProduct.values());
    // price filter
    if (priceFilter === "with") result = result.filter((r) => r.hasPrice);
    else if (priceFilter === "without") result = result.filter((r) => !r.hasPrice);
    // price range filter — applied to ANY history row of the product
    if (!priceRangeError && (minNum !== null || maxNum !== null)) {
      result = result.filter((r) => {
        if (!r.hasPrice) return false;
        return r.histories.some((h) => {
          const v = Number(h.rounded_sale_price);
          if (minNum !== null && v < minNum) return false;
          if (maxNum !== null && v > maxNum) return false;
          return true;
        });
      });
    }
    return result;
  }, [
    productsQuery.data,
    pricesQuery.data,
    changeQuery.data,
    salePriceTypes,
    priceFilter,
    minNum,
    maxNum,
    priceRangeError,
  ]);

  const total = productsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isLoading = productsQuery.isLoading || (productIds.length > 0 && pricesQuery.isLoading);

  // ---------- analytics: track price_checked for products whose price is shown ----------
  useEffect(() => {
    for (const r of merged) {
      if (!r.hasPrice) continue;
      const sptId = r.histories[0]?.sale_price_type_id ?? null;
      trackProductInteraction({
        productId: r.product.id,
        eventType: "price_checked",
        source: "live_price_list",
        salePriceTypeId: sptId,
      });
    }
  }, [merged]);

  // ---------- summary ----------
  const summaryQuery = useQuery({
    queryKey: ["live-price-summary"],
    queryFn: async () => {
      const [{ count: totalProducts }, distinctRes] = await Promise.all([
        supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true),
        supabase.from("product_sale_price_history").select("product_id").limit(5000),
      ]);
      const distinct = new Set((distinctRes.data ?? []).map((r: any) => r.product_id));
      return {
        total: totalProducts ?? 0,
        withPrice: distinct.size,
        withoutPrice: Math.max(0, (totalProducts ?? 0) - distinct.size),
      };
    },
    staleTime: 60_000,
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="لیست قیمت زنده محصولات"
        description="آخرین قیمت فروش ثبت‌شده هر محصول بر اساس تاریخچه قیمت فروش"
        actions={
          <RoleGuard roles={["admin", "manager", "sales", "accountant"]}>
            <Button variant="outline" size="sm" onClick={() => setSupplierModalOpen(true)}>
              <UserPlus className="ml-2 h-4 w-4" />
              معرفی تأمین‌کننده جدید
            </Button>
          </RoleGuard>
        }
      />
      <SupplierReferralModal open={supplierModalOpen} onOpenChange={setSupplierModalOpen} />

      <EffectiveCurrenciesPanel />

      {/* summary */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <SummaryCard
          label="کل محصولات فعال"
          value={summaryQuery.isLoading ? "..." : formatNumber(summaryQuery.data?.total ?? 0)}
        />
        <SummaryCard
          label="دارای قیمت فروش"
          value={summaryQuery.isLoading ? "..." : formatNumber(summaryQuery.data?.withPrice ?? 0)}
        />
        <SummaryCard
          label="بدون قیمت فروش"
          value={
            summaryQuery.isLoading ? "..." : formatNumber(summaryQuery.data?.withoutPrice ?? 0)
          }
          variant={(summaryQuery.data?.withoutPrice ?? 0) > 0 ? "warning" : "default"}
        />
      </div>

      {/* share */}
      <PriceListShareSection
        rows={merged
          .filter((m) => m.hasPrice && m.histories[0])
          .map<PriceListRow>((m) => ({
            productId: m.product.id,
            productName: formatProductDisplayNameWithFallback(m.product as any),
            productCode: m.product.sku ?? "",
            basePrice: Number(m.histories[0]?.rounded_sale_price ?? 0),
            priceMode: m.histories[0]?.sale_price_type_title ?? "—",
            unit: "",
            priority: 0,
            categoryName: m.product.category?.name ?? "",
          }))}
      />

      {/* filters */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Filter className="h-4 w-4" /> فیلترها
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative sm:col-span-2 lg:col-span-2">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="جستجو بر اساس نام محصول یا SKU (حداقل ۲ کاراکتر)"
                className="pr-9"
              />
            </div>
            <Select value={brandId} onValueChange={setBrandId}>
              <SelectTrigger>
                <SelectValue placeholder="برند" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">همه برندها</SelectItem>
                {brands.map((b: any) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="دسته‌بندی" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">همه دسته‌ها</SelectItem>
                {categories.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={productType} onValueChange={setProductType}>
              <SelectTrigger>
                <SelectValue placeholder="نوع کالا" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">همه</SelectItem>
                <SelectItem value="iranian">ایرانی</SelectItem>
                <SelectItem value="foreign">خارجی</SelectItem>
              </SelectContent>
            </Select>
            <Select value={stockStatus} onValueChange={setStockStatus}>
              <SelectTrigger>
                <SelectValue placeholder="موجودی" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">همه</SelectItem>
                <SelectItem value="available">موجود</SelectItem>
                <SelectItem value="unavailable">ناموجود</SelectItem>
                <SelectItem value="limited">محدود</SelectItem>
                <SelectItem value="unknown">نامشخص</SelectItem>
              </SelectContent>
            </Select>
            <Select value={salePriceTypeId} onValueChange={setSalePriceTypeId}>
              <SelectTrigger>
                <SelectValue placeholder="نوع قیمت فروش" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">همه انواع</SelectItem>
                {salePriceTypes.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={priceFilter} onValueChange={(v) => setPriceFilter(v as PriceFilter)}>
              <SelectTrigger>
                <SelectValue placeholder="وضعیت قیمت" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه محصولات</SelectItem>
                <SelectItem value="with">فقط دارای قیمت</SelectItem>
                <SelectItem value="without">فقط بدون قیمت</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="حداقل قیمت (تومان)"
              inputMode="numeric"
            />
            <Input
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="حداکثر قیمت (تومان)"
              inputMode="numeric"
            />
          </div>
          {priceRangeError && <p className="text-xs text-destructive">{priceRangeError}</p>}
        </CardContent>
      </Card>

      {/* content */}
      {isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال بارگذاری لیست قیمت...
        </div>
      ) : merged.length === 0 ? (
        <EmptyState
          icon={PackageX}
          title="نتیجه‌ای پیدا نشد"
          description="هنوز قیمت فروشی برای این فیلتر ثبت نشده است یا محصولی با این مشخصات وجود ندارد."
        />
      ) : (
        <>
          {/* desktop table */}
          <div className="hidden md:block">
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-background shadow-sm text-xs text-muted-foreground">
                      <tr>
                        <th className="p-3 text-right font-medium">محصول</th>
                        <th className="p-3 text-right font-medium">برند / دسته</th>
                        {!isSalesOnly && <th className="p-3 text-right font-medium">نوع کالا</th>}
                        <th className="p-3 text-right font-medium">موجودی</th>
                        <th className="p-3 text-right font-medium">نوع قیمت</th>
                        <th className="p-3 text-right font-medium">قیمت فعلی</th>
                        <th className="p-3 text-right font-medium">تغییر</th>
                        <th className="p-3 text-right font-medium">آخرین بروزرسانی</th>
                        <th className="p-3 text-right font-medium">نمودار</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {merged.flatMap((row) =>
                        renderProductRows(row, {
                          isSalesOnly,
                          isPrivileged,
                          thumbnailFor,
                          onOpenChart: (args) => {
                            trackProductInteraction({
                              productId: args.productId,
                              eventType: "chart_opened",
                              source: "live_price_list",
                              salePriceTypeId: args.salePriceTypeId,
                            });
                            setChartCtx(args);
                          },
                        }),
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* mobile cards */}
          <div className="space-y-3 md:hidden">
            {merged.map((row) => (
              <MobileProductCard
                key={row.product.id}
                row={row}
                isSalesOnly={isSalesOnly}
                isPrivileged={isPrivileged}
                thumbnailFor={thumbnailFor}
                onOpenChart={(args) => {
                  trackProductInteraction({
                    productId: args.productId,
                    eventType: "chart_opened",
                    source: "live_price_list",
                    salePriceTypeId: args.salePriceTypeId,
                  });
                  setChartCtx(args);
                }}
              />
            ))}
          </div>

          {/* pagination */}
          <div className="flex items-center justify-between gap-2 pt-2">
            <div className="text-xs text-muted-foreground">
              صفحه {toFaDigits(page)} از {toFaDigits(totalPages)} — مجموع {formatNumber(total)}{" "}
              محصول
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronRight className="h-4 w-4" /> قبلی
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                بعدی <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      <ProductPriceHistoryDrawer
        open={!!chartCtx}
        onOpenChange={(v) => {
          if (!v) setChartCtx(null);
        }}
        productId={chartCtx?.productId ?? null}
        productName={chartCtx?.productName ?? null}
        salePriceTypeId={chartCtx?.salePriceTypeId ?? null}
        salePriceTypeTitle={chartCtx?.salePriceTypeTitle ?? null}
      />
    </div>
  );
}

function renderProductRows(
  row: { product: ProductRow; histories: any[]; hasPrice: boolean },
  ctx: {
    isSalesOnly: boolean;
    isPrivileged: boolean;
    thumbnailFor: (id: string) => string | undefined;
    onOpenChart: (args: {
      productId: string;
      productName: string;
      salePriceTypeId: string;
      salePriceTypeTitle: string;
    }) => void;
  },
) {
  const colSpan = ctx.isSalesOnly ? 8 : 9;
  const isUnavailable = row.product.stock_status === "unavailable";
  if (isUnavailable) {
    return [
      <tr key={row.product.id} className="bg-muted/20">
        <td className="p-3 align-top">
          <ProductCell product={row.product} thumbnailUrl={ctx.thumbnailFor(row.product.id)} />
        </td>
        <td className="p-3 align-top text-xs text-muted-foreground">
          {row.product.brand?.name ?? "—"} / {row.product.category?.name ?? "—"}
        </td>
        {!ctx.isSalesOnly && (
          <td className="p-3 align-top">
            <ProductTypeBadge t={row.product.product_type} />
          </td>
        )}
        <td className="p-3 align-top">
          <StockBadge s={row.product.stock_status} />
        </td>
        <td className="p-3 align-top text-xs text-muted-foreground" colSpan={colSpan - 4}>
          <Badge
            variant="outline"
            className="border-red-500/30 bg-red-500/5 text-red-600 font-normal"
          >
            ناموجود — قیمت نمایش داده نمی‌شود
          </Badge>
        </td>
      </tr>,
    ];
  }
  if (!row.hasPrice) {
    return [
      <tr key={row.product.id} className="bg-muted/20">
        <td className="p-3 align-top">
          <ProductCell product={row.product} thumbnailUrl={ctx.thumbnailFor(row.product.id)} />
        </td>
        <td className="p-3 align-top text-xs text-muted-foreground">
          {row.product.brand?.name ?? "—"} / {row.product.category?.name ?? "—"}
        </td>
        {!ctx.isSalesOnly && (
          <td className="p-3 align-top">
            <ProductTypeBadge t={row.product.product_type} />
          </td>
        )}
        <td className="p-3 align-top">
          <StockBadge s={row.product.stock_status} />
        </td>
        <td className="p-3 align-top text-xs text-muted-foreground" colSpan={colSpan - 4}>
          <div className="flex flex-wrap items-center gap-2">
            <span>قیمت ثبت نشده</span>
            {ctx.isPrivileged && (
              <Link
                to="/pricing/calculator"
                className="text-primary underline-offset-2 hover:underline inline-flex items-center gap-1"
              >
                <Calculator className="h-3.5 w-3.5" /> رفتن به محاسبه قیمت
              </Link>
            )}
          </div>
        </td>
      </tr>,
    ];
  }
  return row.histories.map((h, idx) => (
    <tr key={`${row.product.id}-${h.id}`} className="hover:bg-muted/30">
      {idx === 0 ? (
        <>
          <td className="p-3 align-top" rowSpan={row.histories.length}>
            <ProductCell product={row.product} thumbnailUrl={ctx.thumbnailFor(row.product.id)} />
          </td>
          <td
            className="p-3 align-top text-xs text-muted-foreground"
            rowSpan={row.histories.length}
          >
            {row.product.brand?.name ?? "—"} / {row.product.category?.name ?? "—"}
          </td>
          {!ctx.isSalesOnly && (
            <td className="p-3 align-top" rowSpan={row.histories.length}>
              <ProductTypeBadge t={row.product.product_type} />
            </td>
          )}
          <td className="p-3 align-top" rowSpan={row.histories.length}>
            <StockBadge s={row.product.stock_status} />
          </td>
        </>
      ) : null}
      <td className="p-3 align-top text-xs">
        <Badge variant="secondary" className="font-normal">
          {h.sale_price_type_title ?? "—"}
        </Badge>
      </td>
      <td className="p-3 align-top">
        <div
          key={`price-${h.rounded_sale_price}`}
          className="price-flash inline-block text-lg font-bold tabular-nums text-foreground"
        >
          {formatNumber(Number(h.rounded_sale_price))}{" "}
          <span className="text-xs font-normal text-muted-foreground">ت</span>
        </div>
        {h.old_sale_price !== null && h.old_sale_price !== undefined && (
          <div className="text-xs text-muted-foreground/60 line-through">
            {formatNumber(Number(h.old_sale_price))}
          </div>
        )}
      </td>
      <td className="p-3 align-top">
        <ChangeCell h={h} />
      </td>
      <td className="p-3 align-top text-[11px] text-muted-foreground">
        {formatDateTimeFa(h.computed_at)}
      </td>
      {idx === 0 && (
        <td className="p-3 align-top" rowSpan={row.histories.length}>
          <div className="flex flex-col items-start gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() =>
                ctx.onOpenChart({
                  productId: row.product.id,
                  productName: row.product.name,
                  salePriceTypeId: h.sale_price_type_id ?? "",
                  salePriceTypeTitle: h.sale_price_type_title ?? "—",
                })
              }
              disabled={!h.sale_price_type_id}
              title="نمودار قیمت"
            >
              <LineChart className="h-3.5 w-3.5" /> نمودار
            </Button>
            <CreatePriceAlertButton
              productId={row.product.id}
              productName={row.product.name}
              salePriceTypeId={h.sale_price_type_id ?? null}
            />
          </div>
        </td>
      )}
    </tr>
  ));
}

function MobileProductCard({
  row,
  isSalesOnly,
  isPrivileged,
  thumbnailFor,
  onOpenChart,
}: {
  row: { product: ProductRow; histories: any[]; hasPrice: boolean };
  isSalesOnly: boolean;
  isPrivileged: boolean;
  thumbnailFor: (id: string) => string | undefined;
  onOpenChart: (args: {
    productId: string;
    productName: string;
    salePriceTypeId: string;
    salePriceTypeTitle: string;
  }) => void;
}) {
  const isUnavailable = row.product.stock_status === "unavailable";
  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <ProductCell product={row.product} thumbnailUrl={thumbnailFor(row.product.id)} size="md" />
          <StockBadge s={row.product.stock_status} />
        </div>
        <div className="text-[11px] text-muted-foreground">
          {row.product.brand?.name ?? "—"} / {row.product.category?.name ?? "—"}
          {!isSalesOnly && (
            <>
              {" "}
              • <ProductTypeBadge t={row.product.product_type} inline />
            </>
          )}
        </div>
        <div className="flex justify-end">
          <StockAlertButton
            productId={row.product.id}
            productName={row.product.name}
            productSku={row.product.sku}
            stockStatus={row.product.stock_status}
          />
        </div>
        {isUnavailable ? (
          <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-600">
            ناموجود — قیمت نمایش داده نمی‌شود.
          </div>
        ) : !row.hasPrice ? (
          <div className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">
            قیمت ثبت نشده
            {isPrivileged && (
              <div className="mt-2">
                <Link
                  to="/pricing/calculator"
                  className="text-primary inline-flex items-center gap-1"
                >
                  <Calculator className="h-3.5 w-3.5" /> رفتن به محاسبه قیمت
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {row.histories.map((h) => (
              <div key={h.id} className="rounded-lg border bg-card p-2.5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="secondary" className="text-[10px] font-normal">
                    {h.sale_price_type_title ?? "—"}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {formatDateTimeFa(h.computed_at)}
                  </span>
                </div>
                <div className="mt-1 flex items-end justify-between">
                  <div>
                    <div
                      key={`mprice-${h.rounded_sale_price}`}
                      className="price-flash inline-block text-xl font-bold tabular-nums text-foreground"
                    >
                      {formatNumber(Number(h.rounded_sale_price))}{" "}
                      <span className="text-xs font-normal text-muted-foreground">ت</span>
                    </div>
                    {h.old_sale_price !== null && h.old_sale_price !== undefined && (
                      <div className="text-xs text-muted-foreground/60 line-through">
                        {formatNumber(Number(h.old_sale_price))}
                      </div>
                    )}
                  </div>
                  <ChangeCell h={h} />
                </div>
                <div className="mt-2 flex justify-end">
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() =>
                        onOpenChart({
                          productId: row.product.id,
                          productName: row.product.name,
                          salePriceTypeId: h.sale_price_type_id ?? "",
                          salePriceTypeTitle: h.sale_price_type_title ?? "—",
                        })
                      }
                      disabled={!h.sale_price_type_id}
                    >
                      <LineChart className="h-3.5 w-3.5" /> نمودار قیمت
                    </Button>
                    <CreatePriceAlertButton
                      productId={row.product.id}
                      productName={row.product.name}
                      salePriceTypeId={h.sale_price_type_id ?? null}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProductCell({
  product,
  thumbnailUrl,
  size = "sm",
}: {
  product: ProductRow;
  thumbnailUrl?: string;
  size?: "sm" | "md";
}) {
  const thumbCls = size === "md" ? "h-14 w-14 rounded-lg" : "h-12 w-12 rounded-md";
  return (
    <div className="flex min-w-0 items-start gap-2">
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt={product.name}
          loading="lazy"
          className={`${thumbCls} flex-shrink-0 border border-border object-cover bg-muted`}
        />
      ) : (
        <div className={`${thumbCls} flex-shrink-0 border border-dashed border-border bg-muted/40`} />
      )}
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-foreground">
          {formatProductDisplayNameWithFallback(product)}
        </div>
        <div className="text-[11px] text-muted-foreground">{product.sku ?? "—"}</div>
        <div className="mt-1">
          <StockAlertButton
            productId={product.id}
            productName={product.name}
            productSku={product.sku}
            stockStatus={product.stock_status}
          />
        </div>
      </div>
    </div>
  );
}

function ProductTypeBadge({ t, inline = false }: { t: string; inline?: boolean }) {
  const label = t === "iranian" ? "ایرانی" : t === "foreign" ? "خارجی" : t;
  if (inline) return <span className="text-[11px]">{label}</span>;
  return (
    <Badge variant="outline" className="font-normal">
      {label}
    </Badge>
  );
}

function StockBadge({ s }: { s: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    available: { label: "موجود", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
    unavailable: { label: "ناموجود", cls: "bg-red-500/10 text-red-600 border-red-500/30" },
    limited: { label: "محدود", cls: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
    unknown: { label: "نامشخص", cls: "bg-muted text-muted-foreground border-border" },
  };
  const v = map[s] ?? map.unknown;
  return (
    <Badge variant="outline" className={`font-normal ${v.cls}`}>
      {v.label}
    </Badge>
  );
}

function ChangeCell({
  h,
}: {
  h: {
    old_sale_price: number | null;
    change_amount: number | null;
    change_percent: number | null;
  };
}) {
  if (h.old_sale_price === null || h.old_sale_price === undefined) {
    return (
      <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary font-normal">
        <Sparkles className="ml-1 h-3 w-3" /> قیمت اولیه
      </Badge>
    );
  }
  const amt = Number(h.change_amount ?? 0);
  const pct =
    h.change_percent === null || h.change_percent === undefined ? null : Number(h.change_percent);
  if (amt === 0) {
    return (
      <Badge variant="outline" className="border-border text-muted-foreground font-normal">
        <Minus className="ml-1 h-3 w-3" /> بدون تغییر
      </Badge>
    );
  }
  const up = amt > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  // قرارداد: افزایش = سبز، کاهش = قرمز
  const cls = up ? "text-emerald-600" : "text-red-600";
  return (
    <div className={`flex flex-col text-xs ${cls}`}>
      <span className="inline-flex items-center gap-1 font-medium">
        <Icon className="h-3.5 w-3.5" />
        {up ? "افزایش" : "کاهش"} {formatNumber(Math.abs(amt))}
      </span>
      {pct !== null && (
        <span className="text-[11px] opacity-80">{toFaDigits(Math.abs(pct).toString())}٪</span>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  variant = "default",
}: {
  label: string;
  value: string;
  variant?: "default" | "warning";
}) {
  return (
    <Card className={variant === "warning" ? "border-amber-500/40" : undefined}>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Tag className="h-3.5 w-3.5" />
          <span>{label}</span>
        </div>
        <div className="mt-1 text-lg font-bold text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}

function PriceListShareSection({ rows }: { rows: PriceListRow[] }) {
  const buildModel = (): PriceListCanonicalModel => ({
    id: "live-price-list",
    title: "لیست قیمت زنده",
    generatedAt: new Date(),
    rows,
    currency: "تومان",
    companyName: BRANDING.platformName,
  });

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} در کلیپ‌بورد کپی شد`);
    } catch {
      toast.error("کپی در کلیپ‌بورد ناموفق بود");
    }
  };

  const disabled = rows.length === 0;

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="text-sm font-medium text-foreground">
          اشتراک‌گذاری
          <span className="ms-2 text-xs text-muted-foreground">
            ({toFaDigits(String(rows.length))} ردیف)
          </span>
          <span className="ms-2 text-xs text-muted-foreground">
            • آخرین بروزرسانی: {formatDateTimeFa(new Date().toISOString())}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => copy(formatForPlainText(buildModel()), "متن لیست قیمت")}
          >
            <Clipboard className="ms-1 h-4 w-4" />
            📋 کپی متن
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => {
              const parts = formatForTelegram(buildModel());
              copy(parts[0] ?? "", "متن تلگرام");
            }}
          >
            <Clipboard className="ms-1 h-4 w-4" />
            📱 تلگرام
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => copy(formatForWhatsApp(buildModel()), "متن واتساپ")}
          >
            <Clipboard className="ms-1 h-4 w-4" />
            💬 واتساپ
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
