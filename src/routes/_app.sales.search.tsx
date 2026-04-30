import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Loader2, PackageX, Tag, Calculator, Sparkles, UserPlus, Filter, X, LineChart } from "lucide-react";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter, SheetClose } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SupplierReferralModal } from "@/shared/components/SupplierReferralModal";
import { ProductPriceCard } from "@/shared/components/ProductPriceCard";
import { RoleGuard } from "@/components/rbac/RoleGuard";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useDebounce } from "@/hooks/use-debounce";
import { useAuth } from "@/lib/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { fetchSalePriceTypes } from "@/lib/pricing/queries";
import { formatNumber, formatDateTimeFa } from "@/lib/i18n/formatters";
import { normalizeSearchText } from "@/lib/i18n/search-normalizer";
import { StockAlertButton } from "@/components/sales/StockAlertButton";
import { formatProductDisplayNameWithFallback } from "@/lib/products/display-name";
import { ProductPriceHistoryDrawer } from "@/components/pricing/price-history/ProductPriceHistoryDrawer";
import { PriceChangeBadge } from "@/components/pricing/price-history/PriceChangeBadge";
import { computeChangePercent, computeDirection } from "@/lib/pricing/price-history";

export const Route = createFileRoute("/_app/sales/search")({
  beforeLoad: async () => { await requirePermission("sales", "view"); },
  component: SalesSearchPage,
});

const RESULT_LIMIT = 20;

interface PriceEntry {
  sale_price_type_id: string;
  code: string;
  title: string;
  sort_order: number;
  current_price: number | null;
  previous_price: number | null;
  last_updated_at: string | null;
}

interface ProductRow {
  id: string;
  name: string;
  sku: string | null;
  product_type: "iranian" | "foreign" | string;
  stock_status: string;
  color?: string | null;
  capacity?: string | null;
  model?: string | null;
  description?: string | null;
  brand?: { id: string; name: string } | null;
  category?: { id: string; name: string } | null;
  labels?: Array<{ id: string; title: string; color: string | null; visibility?: string | null }>;
  prices?: PriceEntry[];
  is_unavailable_for_sales?: boolean;
}

const STOCK_LABEL: Record<string, string> = {
  available: "موجود",
  unavailable: "ناموجود",
  limited: "محدود",
  unknown: "نامشخص",
};

const STOCK_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  available: "default",
  limited: "secondary",
  unavailable: "destructive",
  unknown: "outline",
};

function SalesSearchPage() {
  const { roles } = useAuth();
  const isPrivileged = roles.includes("admin") || roles.includes("manager") || roles.includes("accountant");

  const [search, setSearch] = useState("");
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductRow | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const dSearch = useDebounce(search, 350);
  const [brandIds, setBrandIds] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [stockStatus, setStockStatus] = useState<string>("__all");
  const [productType, setProductType] = useState<string>("__all");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  // local search inputs inside filter panels
  const [brandFilterText, setBrandFilterText] = useState("");
  const [categoryFilterText, setCategoryFilterText] = useState("");
  const [labelFilterText, setLabelFilterText] = useState("");
  const [salePriceTypeId, setSalePriceTypeId] = useState<string>("");
  const [onlyWithPrice, setOnlyWithPrice] = useState<boolean>(false);
  const [chartCtx, setChartCtx] = useState<{
    productId: string; productName: string; salePriceTypeId: string; salePriceTypeTitle: string;
  } | null>(null);

  const term = normalizeSearchText(dSearch);
  const canSearch = term.length >= 2;

  const dBrandText = useDebounce(normalizeSearchText(brandFilterText), 200);
  const dCategoryText = useDebounce(normalizeSearchText(categoryFilterText), 200);
  const dLabelText = useDebounce(normalizeSearchText(labelFilterText), 200);

  const activeFilterCount =
    brandIds.length + categoryIds.length + labelIds.length +
    (stockStatus !== "__all" ? 1 : 0) + (productType !== "__all" ? 1 : 0);

  // ---------- reference data ----------
  const { data: brands = [] } = useQuery({
    queryKey: ["brands-lite-sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brands").select("id, name").eq("is_active", true).order("name").limit(500);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories-lite-sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories").select("id, name, parent_id").eq("is_active", true).order("name").limit(500);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const { data: labels = [] } = useQuery({
    queryKey: ["product-labels-lite-sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_labels").select("id, title, color, visibility").order("title").limit(500);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const canSeeInternalLabels = roles.includes("admin") || roles.includes("manager");
  const visibleLabels = useMemo(
    () => (labels as any[]).filter((l) => canSeeInternalLabels || l?.visibility !== "internal"),
    [labels, canSeeInternalLabels],
  );

  const { data: salePriceTypes = [] } = useQuery({
    queryKey: ["sale-price-types-active"],
    queryFn: () => fetchSalePriceTypes(true),
    staleTime: 5 * 60_000,
  });

  // pick first active sale price type by default
  useEffect(() => {
    if (!salePriceTypeId && salePriceTypes.length > 0) {
      setSalePriceTypeId((salePriceTypes[0] as { id: string }).id);
    }
  }, [salePriceTypes, salePriceTypeId]);

  // labels -> products mapping when label filter active
  const labelProductIdsQuery = useQuery({
    enabled: labelIds.length > 0,
    queryKey: ["sales-search-label-product-ids", labelIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_label_links")
        .select("product_id")
        .in("label_id", labelIds)
        .limit(5000);
      if (error) throw error;
      return Array.from(new Set((data ?? []).map((r: { product_id: string }) => r.product_id)));
    },
    staleTime: 60_000,
  });

  // ---------- products query ----------
  const productsQuery = useQuery({
    enabled: canSearch,
    queryKey: ["sales-search-products-rpc", { term, brandIds, categoryIds, labelIds, stockStatus, productType, onlyWithPrice }],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_sales_search_products", {
        p_search: term,
        p_brand_ids: brandIds.length > 0 ? brandIds : undefined,
        p_category_ids: categoryIds.length > 0 ? categoryIds : undefined,
        p_label_ids: labelIds.length > 0 ? labelIds : undefined,
        p_stock_status: stockStatus !== "__all" ? stockStatus : undefined,
        p_product_type: productType !== "__all" ? productType : undefined,
        p_only_with_price: onlyWithPrice,
        p_limit: RESULT_LIMIT,
        p_offset: 0,
      });
      if (error) throw error;
      return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        ...(row as object),
        labels: Array.isArray(row.labels) ? row.labels : [],
        prices: Array.isArray(row.prices) ? row.prices : [],
      })) as ProductRow[];
    },
    staleTime: 30_000,
  });

  const products = productsQuery.data ?? [];
  const isLoading = canSearch && productsQuery.isLoading;

  return (
    <div className="space-y-5">
      <PageHeader
        title="جستجوی سریع فروش"
        description="پیدا کردن سریع محصول و مشاهده قیمت فروش معتبر برای پاسخ به مشتری"
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
      <ProductPriceCard
        product={selectedProduct}
        open={panelOpen}
        onOpenChange={(v) => { setPanelOpen(v); if (!v) setSelectedProduct(null); }}
      />

      {/* search & price type */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="relative sm:col-span-2">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="نام محصول، SKU، برند یا دسته (حداقل ۲ کاراکتر)"
                className="pr-10 h-12 text-base"
                autoFocus
              />
            </div>
            <Select value={salePriceTypeId} onValueChange={setSalePriceTypeId}>
              <SelectTrigger className="h-12">
                <SelectValue placeholder="نوع قیمت فروش" />
              </SelectTrigger>
              <SelectContent>
                {salePriceTypes.map((t: { id: string; title: string }) => (
                  <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* mobile filters trigger */}
          <div className="flex items-center justify-between md:hidden">
            <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Filter className="h-4 w-4" />
                  فیلترها
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary" className="h-5 min-w-5 px-1">{formatNumber(activeFilterCount)}</Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-[85vh] overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>فیلترها</SheetTitle>
                </SheetHeader>
                <div className="mt-4">
                  <FiltersPanel
                    brands={brands as { id: string; name: string }[]}
                    categories={categories as { id: string; name: string; parent_id: string | null }[]}
                    labels={visibleLabels as { id: string; title: string; color: string | null }[]}
                    brandIds={brandIds} setBrandIds={setBrandIds}
                    categoryIds={categoryIds} setCategoryIds={setCategoryIds}
                    labelIds={labelIds} setLabelIds={setLabelIds}
                    stockStatus={stockStatus} setStockStatus={setStockStatus}
                    productType={productType} setProductType={setProductType}
                    brandFilterText={brandFilterText} setBrandFilterText={setBrandFilterText}
                    categoryFilterText={categoryFilterText} setCategoryFilterText={setCategoryFilterText}
                    labelFilterText={labelFilterText} setLabelFilterText={setLabelFilterText}
                    dBrandText={dBrandText} dCategoryText={dCategoryText} dLabelText={dLabelText}
                  />
                </div>
                <SheetFooter className="mt-4 flex-row gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setBrandIds([]); setCategoryIds([]); setLabelIds([]);
                      setStockStatus("__all"); setProductType("__all");
                    }}
                  >
                    پاک کردن همه
                  </Button>
                  <SheetClose asChild>
                    <Button className="flex-1">اعمال فیلترها</Button>
                  </SheetClose>
                </SheetFooter>
              </SheetContent>
            </Sheet>
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setBrandIds([]); setCategoryIds([]); setLabelIds([]);
                  setStockStatus("__all"); setProductType("__all");
                }}
              >
                <X className="ml-1 h-3.5 w-3.5" /> پاک کردن
              </Button>
            )}
          </div>

          {/* desktop horizontal filters */}
          <div className="hidden md:block space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Filter className="h-4 w-4" />
                <span>فیلترها</span>
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="h-5 min-w-5 px-1">
                    {formatNumber(activeFilterCount)}
                  </Badge>
                )}
              </div>
              {activeFilterCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setBrandIds([]); setCategoryIds([]); setLabelIds([]);
                    setStockStatus("__all"); setProductType("__all");
                  }}
                >
                  <X className="ml-1 h-3.5 w-3.5" /> پاک کردن همه فیلترها
                </Button>
              )}
            </div>
            <FiltersPanel
              brands={brands as { id: string; name: string }[]}
              categories={categories as { id: string; name: string; parent_id: string | null }[]}
              labels={visibleLabels as { id: string; title: string; color: string | null }[]}
              brandIds={brandIds} setBrandIds={setBrandIds}
              categoryIds={categoryIds} setCategoryIds={setCategoryIds}
              labelIds={labelIds} setLabelIds={setLabelIds}
              stockStatus={stockStatus} setStockStatus={setStockStatus}
              productType={productType} setProductType={setProductType}
              brandFilterText={brandFilterText} setBrandFilterText={setBrandFilterText}
              categoryFilterText={categoryFilterText} setCategoryFilterText={setCategoryFilterText}
              labelFilterText={labelFilterText} setLabelFilterText={setLabelFilterText}
              dBrandText={dBrandText} dCategoryText={dCategoryText} dLabelText={dLabelText}
            />
          </div>
        </CardContent>
      </Card>

      {/* results */}
      {!canSearch ? (
        <EmptyState
          icon={Search}
          title="برای جستجو حداقل ۲ کاراکتر وارد کنید"
          description="می‌توانید با نام محصول، کد SKU، نام برند یا دسته‌بندی جستجو کنید."
        />
      ) : isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال جستجو...
        </div>
      ) : products.length === 0 ? (
        <div className="space-y-3">
          <EmptyState
            icon={PackageX}
            title="محصولی پیدا نشد"
            description="محصولی با این عبارت پیدا نشد."
          />
          <div className="flex justify-center">
            <Link
              to="/pricing/quick-price"
              className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm text-primary hover:bg-primary/10"
            >
              <Calculator className="h-4 w-4" />
              محاسبه سریع قیمت برای کالای خارج از لیست
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {products.map((p) => {
            return (
              <ProductCard
                key={p.id}
                product={p}
                primarySalePriceTypeId={salePriceTypeId}
                isPrivileged={isPrivileged}
                onSelect={() => { setSelectedProduct(p); setPanelOpen(true); }}
                onOpenChart={(typeId) => {
                  const targetId = typeId ?? salePriceTypeId;
                  if (!targetId) return;
                  const title = (salePriceTypes as Array<{ id: string; title: string }>).find((t) => t.id === targetId)?.title
                    ?? p.prices?.find((x) => x.sale_price_type_id === targetId)?.title
                    ?? "—";
                  setChartCtx({
                    productId: p.id,
                    productName: p.name,
                    salePriceTypeId: targetId,
                    salePriceTypeTitle: title,
                  });
                }}
              />
            );
          })}
        </div>
      )}

      {/* Secondary action: link to calculator (kept for privileged users) */}
      {canSearch && isPrivileged && (
        <div className="flex justify-center pt-2">
          <Link
            to="/pricing/calculator"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
          >
            <Calculator className="h-3.5 w-3.5" />
            محاسبه قیمت برای کالای خارج از لیست
          </Link>
        </div>
      )}

      <ProductPriceHistoryDrawer
        open={!!chartCtx}
        onOpenChange={(v) => { if (!v) setChartCtx(null); }}
        productId={chartCtx?.productId ?? null}
        productName={chartCtx?.productName ?? null}
        salePriceTypeId={chartCtx?.salePriceTypeId ?? null}
        salePriceTypeTitle={chartCtx?.salePriceTypeTitle ?? null}
      />
    </div>
  );
}

interface ProductCardProps {
  product: ProductRow;
  history: HistoryRow | undefined;
  isPrivileged: boolean;
  onSelect: () => void;
  onOpenChart: () => void;
}

function ProductCard({ product, history, isPrivileged, onSelect, onOpenChart }: ProductCardProps) {
  const stockKey = product.stock_status ?? "unknown";
  const isUnavailable = stockKey === "unavailable";
  const prev = history?.old_sale_price != null ? Number(history.old_sale_price) : null;
  const cur = history ? Number(history.new_sale_price) : null;
  const amt = (cur !== null && prev !== null) ? cur - prev : (history?.change_amount != null ? Number(history.change_amount) : null);
  const pct = history?.change_percent != null ? Number(history.change_percent) : computeChangePercent(cur, prev);
  return (
    <Card className="overflow-hidden cursor-pointer transition hover:border-primary/40 hover:shadow-md focus-within:border-primary/40">
      <CardContent
        className="p-4 space-y-3"
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <h3 className="font-semibold text-foreground truncate">{formatProductDisplayNameWithFallback(product)}</h3>
            <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
              {product.sku && (
                <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono">
                  <Tag className="h-3 w-3" /> {product.sku}
                </span>
              )}
              {product.brand?.name && <span>برند: {product.brand.name}</span>}
              {product.category?.name && <span>· {product.category.name}</span>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant={STOCK_VARIANT[stockKey] ?? "outline"}>
              {STOCK_LABEL[stockKey] ?? stockKey}
            </Badge>
            <span className="text-[11px] text-muted-foreground">
              {product.product_type === "foreign" ? "خارجی" : product.product_type === "iranian" ? "ایرانی" : ""}
            </span>
          </div>
        </div>

        <div className="rounded-md border border-border bg-muted/30 p-3">
          {isUnavailable ? (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <PackageX className="h-4 w-4" />
              ناموجود — قیمت نمایش داده نمی‌شود
            </div>
          ) : history ? (
            <div className="flex items-end justify-between gap-2">
              <div>
                <div className="text-xs text-muted-foreground">قیمت فروش</div>
                <div className="text-2xl font-bold text-primary">
                  {formatNumber(Number(history.new_sale_price))}
                  <span className="mr-1 text-xs font-normal text-muted-foreground">تومان</span>
                </div>
                {prev !== null && (
                  <div className="text-[11px] text-muted-foreground line-through">{formatNumber(prev)} ت</div>
                )}
                <div className="mt-1">
                  <PriceChangeBadge info={{ change_amount: amt, change_percent: pct, direction: computeDirection(amt) }} />
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground text-left">
                آخرین بروزرسانی
                <div>{formatDateTimeFa(history.created_at)}</div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4" />
                برای این نوع قیمت، قیمت فروش ثبت نشده است.
              </div>
              {isPrivileged && (
                <Link
                  to="/pricing/calculator"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Calculator className="h-3.5 w-3.5" /> رفتن به محاسبه قیمت
                </Link>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); onOpenChart(); }}
            disabled={!history}
          >
            <LineChart className="ms-1 h-4 w-4" /> نمودار قیمت
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
          >
            مشاهده همه قیمت‌ها
          </Button>
          <StockAlertButton
            productId={product.id}
            productName={product.name}
            productSku={product.sku}
            stockStatus={stockKey}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Filters Panel (shared between desktop horizontal layout and mobile sheet)
// =============================================================================

interface FiltersPanelProps {
  brands: { id: string; name: string }[];
  categories: { id: string; name: string; parent_id: string | null }[];
  labels: { id: string; title: string; color: string | null }[];
  brandIds: string[]; setBrandIds: (v: string[]) => void;
  categoryIds: string[]; setCategoryIds: (v: string[]) => void;
  labelIds: string[]; setLabelIds: (v: string[]) => void;
  stockStatus: string; setStockStatus: (v: string) => void;
  productType: string; setProductType: (v: string) => void;
  brandFilterText: string; setBrandFilterText: (v: string) => void;
  categoryFilterText: string; setCategoryFilterText: (v: string) => void;
  labelFilterText: string; setLabelFilterText: (v: string) => void;
  dBrandText: string; dCategoryText: string; dLabelText: string;
}

function FiltersPanel(props: FiltersPanelProps) {
  const {
    brands, categories, labels,
    brandIds, setBrandIds, categoryIds, setCategoryIds, labelIds, setLabelIds,
    stockStatus, setStockStatus, productType, setProductType,
    brandFilterText, setBrandFilterText,
    categoryFilterText, setCategoryFilterText,
    labelFilterText, setLabelFilterText,
    dBrandText, dCategoryText, dLabelText,
  } = props;

  const filteredBrands = useMemo(() => {
    if (!dBrandText) return brands;
    return brands.filter((b) => normalizeSearchText(b.name).includes(dBrandText));
  }, [brands, dBrandText]);

  const filteredCategories = useMemo(() => {
    if (!dCategoryText) return categories;
    return categories.filter((c) => normalizeSearchText(c.name).includes(dCategoryText));
  }, [categories, dCategoryText]);

  const filteredLabels = useMemo(() => {
    if (!dLabelText) return labels;
    return labels.filter((l) => normalizeSearchText(l.title).includes(dLabelText));
  }, [labels, dLabelText]);

  const toggle = (arr: string[], setArr: (v: string[]) => void, id: string) => {
    setArr(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  };

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Stock status (toggle buttons) */}
      <div className="space-y-2">
        <div className="text-sm font-semibold">
          وضعیت موجودی
          {stockStatus !== "__all" && <Badge variant="secondary" className="mr-2">۱</Badge>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { v: "__all", l: "همه" },
            { v: "available", l: "موجود" },
            { v: "limited", l: "محدود" },
            { v: "unavailable", l: "ناموجود" },
          ].map((o) => (
            <Button
              key={o.v}
              type="button"
              variant={stockStatus === o.v ? "default" : "outline"}
              size="sm"
              onClick={() => setStockStatus(o.v)}
            >
              {o.l}
            </Button>
          ))}
        </div>
        <div className="text-sm font-semibold pt-2">نوع کالا</div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { v: "__all", l: "همه" },
            { v: "iranian", l: "ایرانی" },
            { v: "foreign", l: "خارجی" },
          ].map((o) => (
            <Button
              key={o.v}
              type="button"
              variant={productType === o.v ? "default" : "outline"}
              size="sm"
              onClick={() => setProductType(o.v)}
            >
              {o.l}
            </Button>
          ))}
        </div>
      </div>

      {/* Brands */}
      <div className="space-y-2">
        <div className="text-sm font-semibold">
          برندها {brandIds.length > 0 && <Badge variant="secondary" className="mr-2">{formatNumber(brandIds.length)} انتخاب</Badge>}
        </div>
        <Input
          value={brandFilterText}
          onChange={(e) => setBrandFilterText(e.target.value)}
          placeholder="جستجو در برند..."
          className="h-8 text-sm"
        />
        <ScrollArea className="h-44 rounded-md border p-2">
          <div className="space-y-1.5">
            {filteredBrands.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-4">برندی یافت نشد</div>
            ) : filteredBrands.map((b) => (
              <label key={b.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                <Checkbox
                  checked={brandIds.includes(b.id)}
                  onCheckedChange={() => toggle(brandIds, setBrandIds, b.id)}
                />
                <span className="truncate">{b.name}</span>
              </label>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Categories */}
      <div className="space-y-2">
        <div className="text-sm font-semibold">
          دسته‌بندی‌ها {categoryIds.length > 0 && <Badge variant="secondary" className="mr-2">{formatNumber(categoryIds.length)} انتخاب</Badge>}
        </div>
        <Input
          value={categoryFilterText}
          onChange={(e) => setCategoryFilterText(e.target.value)}
          placeholder="جستجو در دسته..."
          className="h-8 text-sm"
        />
        <ScrollArea className="h-44 rounded-md border p-2">
          <div className="space-y-1.5">
            {filteredCategories.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-4">دسته‌ای یافت نشد</div>
            ) : filteredCategories.map((c) => (
              <label key={c.id} className={`flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5 ${c.parent_id ? "pr-4" : ""}`}>
                <Checkbox
                  checked={categoryIds.includes(c.id)}
                  onCheckedChange={() => toggle(categoryIds, setCategoryIds, c.id)}
                />
                <span className="truncate">{c.name}</span>
              </label>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Labels */}
      <div className="space-y-2">
        <div className="text-sm font-semibold">
          برچسب‌ها {labelIds.length > 0 && <Badge variant="secondary" className="mr-2">{formatNumber(labelIds.length)} انتخاب</Badge>}
        </div>
        <Input
          value={labelFilterText}
          onChange={(e) => setLabelFilterText(e.target.value)}
          placeholder="جستجو در برچسب..."
          className="h-8 text-sm"
        />
        <ScrollArea className="h-44 rounded-md border p-2">
          <div className="space-y-1.5">
            {filteredLabels.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-4">برچسبی یافت نشد</div>
            ) : filteredLabels.map((l) => (
              <label key={l.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                <Checkbox
                  checked={labelIds.includes(l.id)}
                  onCheckedChange={() => toggle(labelIds, setLabelIds, l.id)}
                />
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full border"
                  style={l.color ? { backgroundColor: l.color } : undefined}
                />
                <span className="truncate">{l.title}</span>
              </label>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}