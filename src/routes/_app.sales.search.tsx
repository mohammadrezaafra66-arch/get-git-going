import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Loader2,
  PackageX,
  Tag,
  Calculator,
  Sparkles,
  UserPlus,
  Filter,
  X,
  LineChart,
  Copy,
  Wand2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SupplierReferralModal } from "@/shared/components/SupplierReferralModal";
import { RoleGuard } from "@/components/rbac/RoleGuard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDebounce } from "@/hooks/use-debounce";
import { useSessionStorageState } from "@/hooks/use-session-storage-state";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasPermission } from "@/lib/rbac/roles";
import { supabase } from "@/integrations/supabase/client";
import { fetchSalePriceTypes } from "@/lib/pricing/queries";
import { fetchEffectiveCurrencies } from "@/lib/pricing/effective-currencies";
import { formatNumber, formatDateTimeFa } from "@/lib/i18n/formatters";
import { normalizeSearchText } from "@/lib/i18n/search-normalizer";
import { StockAlertButton } from "@/components/sales/StockAlertButton";
import { formatProductDisplayNameWithFallback } from "@/lib/products/display-name";
import { ProductPriceHistoryDrawer } from "@/components/pricing/price-history/ProductPriceHistoryDrawer";
import { PriceChangeBadge } from "@/components/pricing/price-history/PriceChangeBadge";
import { computeChangePercent, computeDirection } from "@/lib/pricing/price-history";
import { trackProductInteraction } from "@/lib/analytics/product-interactions";
import { RecentPurchaseBadge } from "@/components/products/RecentPurchaseBadge";
import { RecentPurchaseGroup } from "@/components/products/RecentPurchaseGroup";
import { CreatePriceAlertButton } from "@/components/pricing/price-alerts/CreatePriceAlertButton";
import { publishProductPrices } from "@/lib/pricing/publish-prices";
import { SalesProductRecommendations } from "@/components/sales/SalesProductRecommendations";
import { SalesReminderPopup } from "@/components/sales/SalesReminderPopup";
import { useProductThumbnails } from "@/hooks/products/useProductThumbnails";
import { useComputedPricesRealtime } from "@/hooks/pricing/useComputedPricesRealtime";
import {
  fetchObservatorySnippetsForProducts,
  type ObservatorySnippet,
} from "@/lib/sales/observatory-snippets";
import { ObservatoryBadges } from "@/components/sales/ObservatoryBadges";

export const Route = createFileRoute("/_app/sales/search")({
  beforeLoad: async () => {
    await requirePermission("sales", "view");
  },
  component: SalesSearchPage,
});

const RESULT_LIMIT = 20;
const LABEL_PAGE_SIZE = 50;
type LabelMode = "off" | "all" | "selected";

interface PriceEntry {
  sale_price_type_id: string;
  settlement_type_id?: string | null;
  code: string;
  title: string;
  settlement_title?: string | null;
  sort_order: number;
  current_price: number | null;
  previous_price: number | null;
  last_updated_at: string | null;
}

interface ProductRow {
  id: string;
  name: string;
  sku: string | null;
  barcode?: string | null;
  product_type: "iranian" | "foreign" | string;
  stock_status: string;
  color?: string | null;
  capacity?: string | null;
  model?: string | null;
  description?: string | null;
  primary_spec?: string | null;
  brand?: { id: string; name: string } | null;
  category?: { id: string; name: string } | null;
  labels?: Array<{ id: string; title: string; color: string | null; visibility?: string | null }>;
  prices?: PriceEntry[];
  is_unavailable_for_sales?: boolean;
  has_purchase_price?: boolean;
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
  const isPrivileged =
    roles.includes("admin") || roles.includes("manager") || roles.includes("accountant");
  const canRecalcPrice =
    hasPermission(roles, "pricing", "update") || hasPermission(roles, "pricing", "create");
  const queryClient = useQueryClient();

  // PRICE-RT.7 — هرگاه worker «product_computed_prices» را به‌روزرسانی کند،
  // کوئری‌های «جستجوی سریع فروش» باید بدون refresh دستی تازه شوند.
  // فیلترها/متن جستجو/صفحه‌بندی دست‌نخورده می‌مانند چون فقط queryKey ها
  // invalidate می‌شوند (state در useSessionStorageState نگه‌داری می‌شود).
  useComputedPricesRealtime({
    channelName: "sales-search-computed-prices",
    invalidateKeys: [["sales-search-products-rpc"], ["sales-search-products-rpc-label-mode"]],
  });

  const [search, setSearch] = useSessionStorageState<string>("sales-search:q", "");
  // supplier referral moved to per-product card actions
  const dSearch = useDebounce(search, 350);
  const [brandIds, setBrandIds] = useSessionStorageState<string[]>("sales-search:brandIds", []);
  const [categoryIds, setCategoryIds] = useSessionStorageState<string[]>(
    "sales-search:categoryIds",
    [],
  );
  const [labelIds, setLabelIds] = useSessionStorageState<string[]>("sales-search:labelIds", []);
  const [stockStatus, setStockStatus] = useSessionStorageState<string>(
    "sales-search:stockStatus",
    "__all",
  );
  const [productType, setProductType] = useSessionStorageState<string>(
    "sales-search:productType",
    "__all",
  );
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  // local search inputs inside filter panels
  const [brandFilterText, setBrandFilterText] = useState("");
  const [categoryFilterText, setCategoryFilterText] = useState("");
  const [labelFilterText, setLabelFilterText] = useState("");
  const [salePriceTypeId, setSalePriceTypeId] = useSessionStorageState<string>(
    "sales-search:salePriceTypeId",
    "",
  );
  const [onlyWithPrice, setOnlyWithPrice] = useSessionStorageState<boolean>(
    "sales-search:onlyWithPrice",
    false,
  );
  const [chartCtx, setChartCtx] = useState<{
    productId: string;
    productName: string;
    salePriceTypeId: string;
    salePriceTypeTitle: string;
  } | null>(null);

  // Labeled-products mode (shortcut to show all labeled products with the selected price type)
  const [labelMode, setLabelMode] = useSessionStorageState<LabelMode>(
    "sales-search:labelMode",
    "off",
  );
  const [labelModeIds, setLabelModeIds] = useSessionStorageState<string[]>(
    "sales-search:labelModeIds",
    [],
  );
  const [labelModePage, setLabelModePage] = useSessionStorageState<number>(
    "sales-search:labelModePage",
    1,
  );
  const [labelPickerOpen, setLabelPickerOpen] = useState(false);
  const [labelPickerDraft, setLabelPickerDraft] = useState<string[]>([]);

  const term = normalizeSearchText(dSearch);
  const canSearch = term.length >= 2 || labelMode !== "off";

  const dBrandText = useDebounce(normalizeSearchText(brandFilterText), 200);
  const dCategoryText = useDebounce(normalizeSearchText(categoryFilterText), 200);
  const dLabelText = useDebounce(normalizeSearchText(labelFilterText), 200);

  const activeFilterCount =
    brandIds.length +
    categoryIds.length +
    labelIds.length +
    (stockStatus !== "__all" ? 1 : 0) +
    (productType !== "__all" ? 1 : 0);

  // ---------- reference data ----------
  const { data: brands = [] } = useQuery({
    queryKey: ["brands-lite-sales"],
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
    queryKey: ["categories-lite-sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, parent_id")
        .eq("is_active", true)
        .order("name")
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const { data: labels = [] } = useQuery({
    queryKey: ["product-labels-lite-sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_labels")
        .select("id, title, color, visibility")
        .order("title")
        .limit(500);
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

  // reset page when label-mode filters change
  useEffect(() => {
    setLabelModePage(1);
  }, [labelMode, labelModeIds]);

  // Effective label ids for the current label-mode (always within visibleLabels)
  const visibleLabelIds = useMemo(
    () => (visibleLabels as Array<{ id: string }>).map((l) => l.id),
    [visibleLabels],
  );
  const effectiveLabelIds = useMemo<string[]>(() => {
    if (labelMode === "off") return [];
    if (labelMode === "all") return visibleLabelIds;
    // "selected": intersect with visibleLabelIds for safety
    const set = new Set(visibleLabelIds);
    return labelModeIds.filter((id) => set.has(id));
  }, [labelMode, labelModeIds, visibleLabelIds]);

  // ---------- products query ----------
  // A fresh session id per distinct search — used to de-duplicate interaction
  // events server-side via (user_id, product_id, search_session_id, event_type).
  const searchSessionKey = JSON.stringify(
    labelMode === "off"
      ? [term, brandIds, categoryIds, labelIds, stockStatus, productType, onlyWithPrice]
      : [effectiveLabelIds, labelModePage],
  );
  const searchSessionId = useMemo(() => {
    try {
      return crypto.randomUUID();
    } catch {
      return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
  }, [searchSessionKey]);
  const productsQuery = useQuery({
    enabled: canSearch && (labelMode === "off" || effectiveLabelIds.length > 0),
    queryKey:
      labelMode === "off"
        ? [
            "sales-search-products-rpc",
            { term, brandIds, categoryIds, labelIds, stockStatus, productType, onlyWithPrice },
          ]
        : ["sales-search-products-rpc-label-mode", { effectiveLabelIds, labelModePage }],
    queryFn: async () => {
      const isLabelMode = labelMode !== "off";
      const { data, error } = await supabase.rpc("get_sales_search_products", {
        p_search: isLabelMode ? "" : term,
        p_brand_ids: !isLabelMode && brandIds.length > 0 ? brandIds : undefined,
        p_category_ids: !isLabelMode && categoryIds.length > 0 ? categoryIds : undefined,
        p_label_ids: isLabelMode ? effectiveLabelIds : labelIds.length > 0 ? labelIds : undefined,
        // In label-mode we pull both available + limited by leaving stock filter open
        // and filter client-side below to stay consistent with the user's intent.
        p_stock_status: isLabelMode ? undefined : stockStatus !== "__all" ? stockStatus : undefined,
        p_product_type: isLabelMode ? undefined : productType !== "__all" ? productType : undefined,
        p_only_with_price: isLabelMode ? false : onlyWithPrice,
        p_limit: isLabelMode ? LABEL_PAGE_SIZE : RESULT_LIMIT,
        p_offset: isLabelMode ? (labelModePage - 1) * LABEL_PAGE_SIZE : 0,
      });
      if (error) throw error;
      let rows = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        ...(row as object),
        labels: Array.isArray(row.labels) ? row.labels : [],
        prices: Array.isArray(row.prices) ? row.prices : [],
      })) as ProductRow[];
      if (isLabelMode) {
        rows = rows.filter((r) => r.stock_status === "available" || r.stock_status === "limited");
      }
      // 130 — guard sort (mirrors the RPC ORDER BY): available → limited →
      // unknown → unavailable, then by name. Only reorders the current page of
      // results, so server-side pagination/offset is unaffected.
      const stockRank = (s?: string | null) =>
        s === "available"
          ? 0
          : s === "limited"
            ? 1
            : s === "unknown"
              ? 2
              : s === "unavailable"
                ? 3
                : 4;
      rows = [...rows].sort((a, b) => {
        const d = stockRank(a.stock_status) - stockRank(b.stock_status);
        return d !== 0 ? d : String(a.name ?? "").localeCompare(String(b.name ?? ""), "fa");
      });
      // NOTE: merely appearing in search results is no longer tracked as an
      // interaction (it created "herd" noise for brand searches). Deliberate
      // per-product actions (details/price/chart/copy) are tracked instead.
      return rows;
    },
    staleTime: 30_000,
  });

  const products = productsQuery.data ?? [];
  const isLoading = canSearch && productsQuery.isLoading;

  // Thumbnails for visible search results (shared pattern with /products admin list)
  const visibleProductIds = useMemo(() => products.map((p) => p.id), [products]);
  const { thumbnailFor } = useProductThumbnails(visibleProductIds);

  // ---------- DT.7H: Observatory snippets for current page of results ----------
  // Read-only sidecar query. Never blocks/replaces the main search.
  const productIdsForSnippets = useMemo(
    () => products.map((p) => p.id).filter(Boolean),
    [products],
  );
  const observatorySnippetsQuery = useQuery({
    enabled: productIdsForSnippets.length > 0,
    queryKey: ["sales-search-observatory-snippets", productIdsForSnippets],
    queryFn: () => fetchObservatorySnippetsForProducts(productIdsForSnippets),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  if (observatorySnippetsQuery.isError && import.meta.env.DEV) {
    // Silent in production; never surfaces a toast to the seller.
    console.warn(
      "[sales-search] Observatory snippet fetch failed:",
      observatorySnippetsQuery.error,
    );
  }
  const snippetMap = observatorySnippetsQuery.data ?? {};

  // ---------- label-mode total count (only enabled in label-mode) ----------
  const labelModeCountQuery = useQuery({
    enabled: labelMode !== "off" && effectiveLabelIds.length > 0,
    queryKey: ["sales-search-label-mode-count", { effectiveLabelIds }],
    queryFn: async () => {
      // Get distinct product_ids that are linked to any of the selected labels
      // and are available/limited and active. Page-side count via head:true + count:exact.
      const { data: linkRows, error: linkErr } = await supabase
        .from("product_label_links")
        .select("product_id")
        .in("label_id", effectiveLabelIds);
      if (linkErr) throw linkErr;
      const productIds = Array.from(
        new Set((linkRows ?? []).map((r: any) => r.product_id as string)),
      );
      if (productIds.length === 0) return 0;
      const { count, error: cntErr } = await supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .in("id", productIds)
        .eq("is_active", true)
        .in("stock_status", ["available", "limited"]);
      if (cntErr) throw cntErr;
      return count ?? 0;
    },
    staleTime: 60_000,
  });

  const labelModeTotal = labelModeCountQuery.data ?? 0;
  const labelModeTotalPages = Math.max(1, Math.ceil(labelModeTotal / LABEL_PAGE_SIZE));
  const salePriceTypeTitle =
    (salePriceTypes as Array<{ id: string; title: string }>).find((t) => t.id === salePriceTypeId)
      ?.title ?? "—";

  const exitLabelMode = () => {
    setLabelMode("off");
    setLabelModeIds([]);
    setLabelModePage(1);
  };

  const { data: pageEffectiveCurrencies } = useQuery({
    queryKey: ["effective-currencies"],
    queryFn: fetchEffectiveCurrencies,
    staleTime: 60_000,
  });
  const pageUsd = pageEffectiveCurrencies?.find((c) => c.code === "usd");
  const pageUsdRate = pageUsd?.latest_rate ?? null;
  const pageUsdRateAt = pageUsd?.latest_rate_at ?? null;

  return (
    <div className="space-y-5">
      <SalesReminderPopup />
      <PageHeader
        title="جستجوی سریع فروش"
        description="پیدا کردن سریع محصول و مشاهده قیمت فروش معتبر برای پاسخ به مشتری"
      />

      {pageUsdRate && pageUsdRate > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <DollarSign className="h-4 w-4 text-primary" />
          <span className="font-medium">نرخ لحظه‌ای دلار:</span>
          <span className="font-bold text-primary tabular-nums">
            {formatNumber(pageUsdRate)} تومان
          </span>
          <span className="text-xs text-muted-foreground">مبنای محاسبهٔ قیمت‌های دلاری</span>
          {pageUsdRateAt && (
            <span className="text-xs text-muted-foreground">
              — به‌روزرسانی: {formatDateTimeFa(pageUsdRateAt)}
            </span>
          )}
        </div>
      )}

      {/* search & price type */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="relative sm:col-span-2">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="نام محصول، SKU، بارکد، برند یا دسته (حداقل ۲ کاراکتر)"
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
                  <SelectItem key={t.id} value={t.id}>
                    {t.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Labeled-products shortcut */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={labelMode !== "off" ? "secondary" : "outline"}
              size="sm"
              onClick={() => {
                setLabelMode("all");
                setLabelModeIds([]);
                setLabelModePage(1);
              }}
              className="gap-2"
            >
              <Tag className="h-4 w-4" />
              نمایش محصولات برچسب‌دار
            </Button>

            <Popover
              open={labelPickerOpen}
              onOpenChange={(o) => {
                setLabelPickerOpen(o);
                if (o) {
                  // initialize draft from current selection
                  setLabelPickerDraft(labelMode === "selected" ? labelModeIds : []);
                }
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  aria-label="انتخاب برچسب خاص"
                >
                  <ChevronDown className="h-4 w-4" />
                  انتخاب برچسب خاص
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-3">
                <div className="mb-2 text-sm font-medium">انتخاب برچسب‌ها</div>
                {visibleLabels.length === 0 ? (
                  <div className="text-xs text-muted-foreground">برچسبی برای نمایش وجود ندارد.</div>
                ) : (
                  <ScrollArea className="h-56 pr-1">
                    <div className="space-y-1">
                      {(
                        visibleLabels as Array<{ id: string; title: string; color?: string | null }>
                      ).map((l) => {
                        const checked = labelPickerDraft.includes(l.id);
                        return (
                          <label
                            key={l.id}
                            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-muted/50"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) => {
                                setLabelPickerDraft((prev) =>
                                  v
                                    ? Array.from(new Set([...prev, l.id]))
                                    : prev.filter((x) => x !== l.id),
                                );
                              }}
                            />
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: l.color ?? "#0ea5e9" }}
                            />
                            <span className="text-sm">{l.title}</span>
                          </label>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
                <div className="mt-3 flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setLabelPickerDraft([])}
                  >
                    پاک کردن
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setLabelPickerOpen(false)}
                    >
                      انصراف
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        if (labelPickerDraft.length === 0) {
                          // empty selection => fall back to "all"
                          setLabelMode("all");
                          setLabelModeIds([]);
                        } else {
                          setLabelMode("selected");
                          setLabelModeIds(labelPickerDraft);
                        }
                        setLabelModePage(1);
                        setLabelPickerOpen(false);
                      }}
                    >
                      اعمال
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {labelMode !== "off" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={exitLabelMode}
                className="text-muted-foreground"
              >
                <X className="ml-1 h-3.5 w-3.5" /> خروج از حالت برچسب‌دار
              </Button>
            )}
          </div>

          {labelMode !== "off" && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
              <Badge variant="secondary" className="gap-1">
                <Tag className="h-3 w-3" />
                {labelMode === "all"
                  ? "حالت برچسب‌دار: همه برچسب‌ها"
                  : `حالت برچسب‌دار: ${formatNumber(effectiveLabelIds.length)} برچسب`}
              </Badge>
              <span className="text-muted-foreground">نوع قیمت نمایشی:</span>
              <Badge variant="outline">{salePriceTypeTitle}</Badge>
              <span className="text-muted-foreground">فقط موجود + محدود</span>
            </div>
          )}

          {/* mobile filters trigger */}
          <div
            className={`flex items-center justify-between md:hidden ${labelMode !== "off" ? "opacity-50 pointer-events-none" : ""}`}
          >
            <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Filter className="h-4 w-4" />
                  فیلترها
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary" className="h-5 min-w-5 px-1">
                      {formatNumber(activeFilterCount)}
                    </Badge>
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
                    categories={
                      categories as { id: string; name: string; parent_id: string | null }[]
                    }
                    labels={visibleLabels as { id: string; title: string; color: string | null }[]}
                    brandIds={brandIds}
                    setBrandIds={setBrandIds}
                    categoryIds={categoryIds}
                    setCategoryIds={setCategoryIds}
                    labelIds={labelIds}
                    setLabelIds={setLabelIds}
                    stockStatus={stockStatus}
                    setStockStatus={setStockStatus}
                    productType={productType}
                    setProductType={setProductType}
                    brandFilterText={brandFilterText}
                    setBrandFilterText={setBrandFilterText}
                    categoryFilterText={categoryFilterText}
                    setCategoryFilterText={setCategoryFilterText}
                    labelFilterText={labelFilterText}
                    setLabelFilterText={setLabelFilterText}
                    dBrandText={dBrandText}
                    dCategoryText={dCategoryText}
                    dLabelText={dLabelText}
                    onlyWithPrice={onlyWithPrice}
                    setOnlyWithPrice={setOnlyWithPrice}
                  />
                </div>
                <SheetFooter className="mt-4 flex-row gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setBrandIds([]);
                      setCategoryIds([]);
                      setLabelIds([]);
                      setStockStatus("__all");
                      setProductType("__all");
                      setOnlyWithPrice(false);
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
                  setBrandIds([]);
                  setCategoryIds([]);
                  setLabelIds([]);
                  setStockStatus("__all");
                  setProductType("__all");
                  setOnlyWithPrice(false);
                }}
              >
                <X className="ml-1 h-3.5 w-3.5" /> پاک کردن
              </Button>
            )}
          </div>

          {/* desktop horizontal filters */}
          <div
            className={`hidden md:block space-y-2 ${labelMode !== "off" ? "opacity-50 pointer-events-none" : ""}`}
          >
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
                    setBrandIds([]);
                    setCategoryIds([]);
                    setLabelIds([]);
                    setStockStatus("__all");
                    setProductType("__all");
                    setOnlyWithPrice(false);
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
              brandIds={brandIds}
              setBrandIds={setBrandIds}
              categoryIds={categoryIds}
              setCategoryIds={setCategoryIds}
              labelIds={labelIds}
              setLabelIds={setLabelIds}
              stockStatus={stockStatus}
              setStockStatus={setStockStatus}
              productType={productType}
              setProductType={setProductType}
              brandFilterText={brandFilterText}
              setBrandFilterText={setBrandFilterText}
              categoryFilterText={categoryFilterText}
              setCategoryFilterText={setCategoryFilterText}
              labelFilterText={labelFilterText}
              setLabelFilterText={setLabelFilterText}
              dBrandText={dBrandText}
              dCategoryText={dCategoryText}
              dLabelText={dLabelText}
              onlyWithPrice={onlyWithPrice}
              setOnlyWithPrice={setOnlyWithPrice}
            />
          </div>
        </CardContent>
      </Card>

      {/* results */}
      {!canSearch ? (
        <EmptyState
          icon={Search}
          title="برای جستجو حداقل ۲ کاراکتر وارد کنید"
          description="می‌توانید با نام محصول، کد SKU، نام برند یا دسته‌بندی جستجو کنید. یا روی «نمایش محصولات برچسب‌دار» بزنید."
        />
      ) : isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال جستجو...
        </div>
      ) : products.length === 0 ? (
        <div className="space-y-3">
          <EmptyState
            icon={PackageX}
            title={labelMode !== "off" ? "محصول برچسب‌داری پیدا نشد" : "محصولی پیدا نشد"}
            description={
              labelMode !== "off"
                ? "هیچ محصول برچسب‌دار موجود/محدودی برای فیلتر فعلی پیدا نشد."
                : "محصولی با این عبارت پیدا نشد."
            }
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
        <>
          <RecentPurchaseGroup productIds={products.map((p) => p.id)}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {products.map((p) => {
                return (
                  <ProductCard
                    key={p.id}
                    product={p}
                    primarySalePriceTypeId={salePriceTypeId}
                    searchSessionId={searchSessionId}
                    isPrivileged={isPrivileged}
                    canRecalcPrice={canRecalcPrice}
                    observatorySnippet={snippetMap[p.id] ?? null}
                    thumbnailUrl={thumbnailFor(p.id)}
                    onRecalcDone={() => {
                      queryClient.invalidateQueries({ queryKey: ["sales-search-products-rpc"] });
                      queryClient.invalidateQueries({
                        queryKey: ["sales-search-products-rpc-label-mode"],
                      });
                    }}
                    onOpenChart={(typeId) => {
                      const targetId = typeId ?? salePriceTypeId;
                      if (!targetId) return;
                      const title =
                        (salePriceTypes as Array<{ id: string; title: string }>).find(
                          (t) => t.id === targetId,
                        )?.title ??
                        p.prices?.find((x) => x.sale_price_type_id === targetId)?.title ??
                        "—";
                      trackProductInteraction({
                        productId: p.id,
                        eventType: "chart_opened",
                        source: "sales_search",
                        salePriceTypeId: targetId,
                        searchSessionId,
                      });
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
          </RecentPurchaseGroup>
          {labelMode !== "off" && (
            <div className="mt-4 flex flex-col items-center justify-between gap-2 sm:flex-row">
              <div className="text-xs text-muted-foreground">
                نمایش {formatNumber(products.length)} از {formatNumber(labelModeTotal)} محصول
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLabelModePage((p) => Math.max(1, p - 1))}
                  disabled={labelModePage <= 1 || productsQuery.isFetching}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <span className="text-xs">
                  صفحه {formatNumber(labelModePage)} از {formatNumber(labelModeTotalPages)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLabelModePage((p) => Math.min(labelModeTotalPages, p + 1))}
                  disabled={labelModePage >= labelModeTotalPages || productsQuery.isFetching}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
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

interface ProductCardProps {
  product: ProductRow;
  primarySalePriceTypeId: string;
  searchSessionId: string | null;
  isPrivileged: boolean;
  canRecalcPrice: boolean;
  observatorySnippet?: ObservatorySnippet | null;
  thumbnailUrl?: string;
  onRecalcDone: () => void;
  onOpenChart: (salePriceTypeId?: string) => void;
}

function ProductCard({
  product,
  primarySalePriceTypeId,
  searchSessionId,
  canRecalcPrice,
  observatorySnippet,
  thumbnailUrl,
  onRecalcDone,
  onOpenChart,
}: ProductCardProps) {
  const stockKey = product.stock_status ?? "unknown";
  const isUnavailable = stockKey === "unavailable";
  const prices = product.prices ?? [];
  const labels = product.labels ?? [];
  const [recalcing, setRecalcing] = useState(false);
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Item 138 — prices stay hidden until «مشاهده کامل». Cards are keyed by
  // product id, so a product that survives into the next search would keep its
  // revealed state; collapse everything whenever a new search session starts.
  useEffect(() => {
    setDetailsOpen(false);
  }, [searchSessionId]);

  // «مشاهده کامل» — reveals the full product details AND records the two
  // deliberate-intent events. Market Intelligence should count a price check
  // only when the user intentionally inspects a specific product, not merely
  // because it appeared in the search results. Fire on open only; the tracker
  // itself de-duplicates within a 30s window.
  const handleToggleDetails = () => {
    setDetailsOpen((open) => {
      const next = !open;
      if (next) {
        trackProductInteraction({
          productId: product.id,
          eventType: "product_details_opened",
          source: "sales_search",
          salePriceTypeId: primarySalePriceTypeId,
          searchSessionId,
        });
        trackProductInteraction({
          productId: product.id,
          eventType: "price_checked",
          source: "sales_search",
          salePriceTypeId: primarySalePriceTypeId,
          searchSessionId,
        });
      }
      return next;
    });
  };
  // Baseline rows carry settlement_type_id == null (exactly the pre-settlement
  // behavior). Per-settlement rows carry a settlement_type_id + settlement_title.
  const isBaseline = (p: PriceEntry) => p.settlement_type_id == null;
  // primary price = the BASELINE row of the globally selected sale type
  // (fallback to any baseline row, then the first entry).
  const primary =
    prices.find((p) => p.sale_price_type_id === primarySalePriceTypeId && isBaseline(p)) ??
    prices.find((p) => isBaseline(p)) ??
    prices[0] ??
    null;
  // Other sale-price types (baseline rows only, excluding the primary's type).
  const otherSaleTypes = prices.filter(
    (p) => isBaseline(p) && p.sale_price_type_id !== (primary?.sale_price_type_id ?? ""),
  );
  // Per-settlement prices (one row per settlement term that has a price).
  const settlementPrices = prices.filter((p) => !isBaseline(p));

  const cur = primary?.current_price != null ? Number(primary.current_price) : null;
  const prev = primary?.previous_price != null ? Number(primary.previous_price) : null;
  const amt = cur !== null && prev !== null ? cur - prev : null;
  const pct = computeChangePercent(cur, prev);

  const { data: effectiveCurrencies } = useQuery({
    queryKey: ["effective-currencies"],
    queryFn: fetchEffectiveCurrencies,
    staleTime: 60_000,
  });
  const usdRate = effectiveCurrencies?.find((c) => c.code === "usd")?.latest_rate ?? null;
  const toUsd = (tomanPrice: number | null): number | null =>
    tomanPrice != null && usdRate && usdRate > 0 ? Math.round(tomanPrice / usdRate) : null;

  const hasAnyPrice = prices.some((p) => p.current_price != null);
  const noPriceReason = !hasAnyPrice
    ? isUnavailable
      ? "ناموجود — قیمت نمایش داده نمی‌شود"
      : product.has_purchase_price === false
        ? "قیمت خرید فعالی ثبت نشده است"
        : "قیمت فروش هنوز محاسبه نشده است"
    : null;

  const specChips: Array<{ label: string; value: string }> = [];
  if (product.primary_spec) specChips.push({ label: "ظرفیت", value: product.primary_spec });
  else if (product.capacity) specChips.push({ label: "ظرفیت", value: product.capacity });
  if (product.model) specChips.push({ label: "مدل", value: product.model });
  if (product.color) specChips.push({ label: "رنگ", value: product.color });
  if (product.brand?.name) specChips.push({ label: "برند", value: product.brand.name });
  if (product.category?.name) specChips.push({ label: "دسته", value: product.category.name });
  if (product.product_type === "iranian" || product.product_type === "foreign") {
    specChips.push({
      label: "نوع",
      value: product.product_type === "foreign" ? "خارجی" : "ایرانی",
    });
  }

  const handleCopySalesText = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const lines: string[] = [];
    lines.push(formatProductDisplayNameWithFallback(product));
    if (product.sku) lines.push(`کد: ${product.sku}`);
    if (product.brand?.name) lines.push(`برند: ${product.brand.name}`);
    if (product.category?.name) lines.push(`دسته: ${product.category.name}`);
    if (product.product_type === "iranian" || product.product_type === "foreign") {
      lines.push(`نوع کالا: ${product.product_type === "foreign" ? "خارجی" : "ایرانی"}`);
    }
    if (specChips.length > 0) {
      const tech = specChips.filter((s) => !["برند", "دسته", "نوع"].includes(s.label));
      if (tech.length > 0) lines.push(tech.map((s) => `${s.label}: ${s.value}`).join("  •  "));
    }
    lines.push(`وضعیت: ${STOCK_LABEL[stockKey] ?? stockKey}`);
    lines.push("");
    if (hasAnyPrice) {
      lines.push("قیمت‌ها:");
      for (const p of prices) {
        const label = p.settlement_type_id == null ? p.title : `${p.title} (${p.settlement_title})`;
        if (p.current_price != null) {
          lines.push(`• ${label}: ${formatNumber(Number(p.current_price))} تومان`);
        } else {
          lines.push(`• ${label}: قیمت ثبت نشده`);
        }
      }
    } else {
      lines.push(`قیمت: ${noPriceReason ?? "ثبت نشده"}`);
    }
    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("متن فروش کپی شد");
    } catch {
      toast.error("کپی انجام نشد");
    }
  };

  const handleRecalc = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRecalcing(true);
    try {
      const r = await publishProductPrices({ productId: product.id, source: "sales_search" });
      if (r.succeeded > 0) {
        toast.success(
          `${r.succeeded} قیمت محاسبه و ذخیره شد` + (r.failed > 0 ? ` — ${r.failed} خطا` : ""),
        );
        onRecalcDone();
      } else {
        const firstErr = r.results.find((x) => !x.ok)?.error;
        toast.error(firstErr ?? "هیچ قیمتی محاسبه نشد");
      }
    } catch (err: unknown) {
      toast.error((err as Error)?.message ?? "خطا در محاسبه قیمت");
    } finally {
      setRecalcing(false);
    }
  };

  return (
    <Card className="overflow-hidden cursor-pointer transition hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 focus-within:border-primary/50">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-3">
            {thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt={product.name}
                loading="lazy"
                className="h-16 w-16 flex-shrink-0 rounded-md border border-border object-cover bg-muted"
              />
            ) : (
              <div className="h-16 w-16 flex-shrink-0 rounded-md border border-dashed border-border bg-muted/40" />
            )}
            <div className="min-w-0 space-y-1">
              <h3 className="font-semibold text-foreground break-words">
                {formatProductDisplayNameWithFallback(product)}
              </h3>
              <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                {product.sku && (
                  <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono">
                    <Tag className="h-3 w-3" /> {product.sku}
                  </span>
                )}
                {product.barcode && (
                  <span
                    className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono"
                    dir="ltr"
                    title="بارکد"
                  >
                    <Tag className="h-3 w-3" /> {product.barcode}
                  </span>
                )}
                {product.brand?.name && <span>برند: {product.brand.name}</span>}
                {product.category?.name && <span>· {product.category.name}</span>}
              </div>
              {specChips.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1 text-xs">
                  {specChips.map((s) => (
                    <span
                      key={s.label}
                      className="inline-flex items-center gap-1 rounded border bg-background px-1.5 py-0.5 text-foreground"
                    >
                      <span className="text-muted-foreground">{s.label}:</span>
                      <span className="font-medium">{s.value}</span>
                    </span>
                  ))}
                </div>
              )}
              {labels.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {labels.slice(0, 4).map((l) => (
                    <span
                      key={l.id}
                      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]"
                      style={l.color ? { borderColor: l.color, color: l.color } : undefined}
                    >
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={l.color ? { backgroundColor: l.color } : undefined}
                      />
                      {l.title}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant={STOCK_VARIANT[stockKey] ?? "outline"}>
              {STOCK_LABEL[stockKey] ?? stockKey}
            </Badge>
            <RecentPurchaseBadge productId={product.id} />
            <span className="text-[11px] text-muted-foreground">
              {product.product_type === "foreign"
                ? "خارجی"
                : product.product_type === "iranian"
                  ? "ایرانی"
                  : ""}
            </span>
          </div>
        </div>

        {/* Item 138 — every price in this card is gated behind «مشاهده کامل». */}
        <div className="rounded-md border border-border bg-muted/30 p-3">
          {!detailsOpen ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Eye className="h-3.5 w-3.5" />
              برای مشاهده قیمت‌ها، مشاهده کامل را بزنید.
            </div>
          ) : isUnavailable ? (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <PackageX className="h-4 w-4" />
              ناموجود — قیمت نمایش داده نمی‌شود
            </div>
          ) : primary && cur !== null ? (
            <div className="flex items-end justify-between gap-2">
              <div>
                <div className="text-xs text-muted-foreground">قیمت {primary.title}</div>
                <div
                  key={`pcard-${cur}`}
                  className="price-flash inline-block text-3xl font-bold tabular-nums tracking-tight text-primary"
                >
                  {formatNumber(cur)}
                  <span className="mr-1 text-xs font-normal text-muted-foreground">تومان</span>
                </div>
                {toUsd(cur) !== null && (
                  <div className="text-[11px] font-normal text-muted-foreground tabular-nums">
                    ≈ {formatNumber(toUsd(cur)!)} دلار
                  </div>
                )}
                {prev !== null && (
                  <div className="text-[11px] text-muted-foreground line-through">
                    {formatNumber(prev)} ت
                  </div>
                )}
                <div className="mt-1">
                  <PriceChangeBadge
                    info={{
                      change_amount: amt,
                      change_percent: pct,
                      direction: computeDirection(amt),
                    }}
                  />
                </div>
              </div>
              {primary.last_updated_at && (
                <div className="text-[11px] text-muted-foreground text-left">
                  آخرین بروزرسانی
                  <div>{formatDateTimeFa(primary.last_updated_at)}</div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4" />
              {noPriceReason ?? "قیمت ثبت نشده"}
            </div>
          )}
        </div>

        {/* DT.7H — Read-only Observatory hints (status / opportunity / message).
            Rendered only when a snippet exists for this product. */}
        <ObservatoryBadges snippet={observatorySnippet} />

        {/* Secondary prices grid — other sale price types (baseline rows). */}
        {detailsOpen && !isUnavailable && otherSaleTypes.length > 0 && (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {otherSaleTypes.map((p) => {
              const c = p.current_price != null ? Number(p.current_price) : null;
              const pv = p.previous_price != null ? Number(p.previous_price) : null;
              const a = c !== null && pv !== null ? c - pv : null;
              return (
                <button
                  key={p.sale_price_type_id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenChart(p.sale_price_type_id);
                  }}
                  className="rounded-md border bg-background/50 px-2 py-1.5 text-right transition hover:border-primary/40"
                >
                  <div className="text-[10px] text-muted-foreground truncate">{p.title}</div>
                  <div className="text-base font-semibold tabular-nums">
                    {c !== null ? (
                      formatNumber(c)
                    ) : (
                      <span className="text-muted-foreground font-normal">قیمت ثبت نشده</span>
                    )}
                  </div>
                  {toUsd(c) !== null && (
                    <div className="text-[10px] font-normal text-muted-foreground tabular-nums">
                      ≈ {formatNumber(toUsd(c)!)} دلار
                    </div>
                  )}
                  {a !== null && a !== 0 && (
                    <div
                      className={`text-[10px] tabular-nums ${a > 0 ? "text-emerald-600" : "text-red-600"}`}
                    >
                      {a > 0 ? "+" : ""}
                      {formatNumber(a)}
                    </div>
                  )}
                  {p.last_updated_at && (
                    <div className="text-[9px] text-muted-foreground truncate">
                      {formatDateTimeFa(p.last_updated_at)}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Per-settlement prices — one card per settlement term. */}
        {detailsOpen && !isUnavailable && settlementPrices.length > 0 && (
          <div className="mt-1.5">
            <div className="mb-1 text-[10px] font-medium text-muted-foreground">
              قیمت بر اساس نوع تسویه
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {settlementPrices.map((p) => {
                const c = p.current_price != null ? Number(p.current_price) : null;
                const pv = p.previous_price != null ? Number(p.previous_price) : null;
                const a = c !== null && pv !== null ? c - pv : null;
                return (
                  <button
                    key={`${p.sale_price_type_id}:${p.settlement_type_id}`}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenChart(p.sale_price_type_id);
                    }}
                    className="rounded-md border border-dashed bg-background/50 px-2 py-1.5 text-right transition hover:border-primary/40"
                  >
                    <div className="text-[10px] text-muted-foreground truncate">
                      {p.settlement_title ?? p.title}
                    </div>
                    <div className="text-base font-semibold tabular-nums">
                      {c !== null ? (
                        formatNumber(c)
                      ) : (
                        <span className="text-muted-foreground font-normal">قیمت ثبت نشده</span>
                      )}
                    </div>
                    {toUsd(c) !== null && (
                      <div className="text-[10px] font-normal text-muted-foreground tabular-nums">
                        ≈ {formatNumber(toUsd(c)!)} دلار
                      </div>
                    )}
                    {a !== null && a !== 0 && (
                      <div
                        className={`text-[10px] tabular-nums ${a > 0 ? "text-emerald-600" : "text-red-600"}`}
                      >
                        {a > 0 ? "+" : ""}
                        {formatNumber(a)}
                      </div>
                    )}
                    {p.last_updated_at && (
                      <div className="text-[9px] text-muted-foreground truncate">
                        {formatDateTimeFa(p.last_updated_at)}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Alternative / recommended products with their 3 cheapest prices.
            Gated too — it renders real sale prices of the suggested products. */}
        {detailsOpen && <SalesProductRecommendations productId={product.id} />}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={detailsOpen}
            onClick={(e) => {
              e.stopPropagation();
              handleToggleDetails();
            }}
          >
            <Eye className="ms-1 h-4 w-4" />
            {detailsOpen ? "بستن جزئیات" : "مشاهده کامل"}
            <ChevronDown
              className={`ms-1 h-4 w-4 transition-transform ${detailsOpen ? "rotate-180" : ""}`}
            />
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={handleCopySalesText}>
            <Copy className="ms-1 h-4 w-4" /> کپی متن فروش
          </Button>
          {canRecalcPrice && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRecalc}
              disabled={recalcing}
            >
              {recalcing ? (
                <Loader2 className="ms-1 h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="ms-1 h-4 w-4" />
              )}
              محاسبه دقیق قیمت
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onOpenChart(primary?.sale_price_type_id);
            }}
            disabled={!primary || cur === null}
          >
            <LineChart className="ms-1 h-4 w-4" /> نمودار قیمت
          </Button>
          <StockAlertButton
            productId={product.id}
            productName={product.name}
            productSku={product.sku}
            stockStatus={stockKey}
          />
          <CreatePriceAlertButton
            productId={product.id}
            productName={product.name}
            salePriceTypeId={primary?.sale_price_type_id ?? null}
          />
          <RoleGuard roles={["admin", "manager", "sales", "accountant"]}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setSupplierModalOpen(true);
              }}
            >
              <UserPlus className="ms-1 h-4 w-4" />
              معرفی تأمین‌کننده برای این محصول
            </Button>
          </RoleGuard>
        </div>

        {/* «مشاهده کامل» — full product details, revealed on demand. */}
        {detailsOpen && (
          <div className="mt-2 rounded-md border bg-muted/30 p-3 text-sm">
            <div className="mb-2 font-medium">{formatProductDisplayNameWithFallback(product)}</div>
            {(() => {
              const detailRows: Array<{ label: string; value: string }> = [];
              if (product.sku) detailRows.push({ label: "کد", value: product.sku });
              if (product.barcode) detailRows.push({ label: "بارکد", value: product.barcode });
              if (product.brand?.name)
                detailRows.push({ label: "برند", value: product.brand.name });
              if (product.category?.name)
                detailRows.push({ label: "دسته", value: product.category.name });
              if (product.model) detailRows.push({ label: "مدل", value: product.model });
              if (product.color) detailRows.push({ label: "رنگ", value: product.color });
              if (product.capacity) detailRows.push({ label: "ظرفیت", value: product.capacity });
              if (product.primary_spec)
                detailRows.push({ label: "مشخصهٔ اصلی", value: product.primary_spec });
              if (product.product_type === "iranian" || product.product_type === "foreign")
                detailRows.push({
                  label: "نوع کالا",
                  value: product.product_type === "foreign" ? "خارجی" : "ایرانی",
                });
              detailRows.push({ label: "وضعیت موجودی", value: STOCK_LABEL[stockKey] ?? stockKey });
              return (
                <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                  {detailRows.map((row) => (
                    <div key={row.label} className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">{row.label}</dt>
                      <dd className="text-right font-medium tabular-nums">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              );
            })()}
            {product.description && (
              <div className="mt-2 border-t pt-2">
                <div className="mb-1 text-muted-foreground">توضیحات</div>
                <p className="whitespace-pre-wrap leading-6">{product.description}</p>
              </div>
            )}
          </div>
        )}

        <SupplierReferralModal
          open={supplierModalOpen}
          onOpenChange={setSupplierModalOpen}
          defaultNotes={`تأمین‌کننده پیشنهادی برای محصول: ${product.name}${product.sku ? ` (کد ${product.sku})` : ""}`}
        />
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
  brandIds: string[];
  setBrandIds: (v: string[]) => void;
  categoryIds: string[];
  setCategoryIds: (v: string[]) => void;
  labelIds: string[];
  setLabelIds: (v: string[]) => void;
  stockStatus: string;
  setStockStatus: (v: string) => void;
  productType: string;
  setProductType: (v: string) => void;
  brandFilterText: string;
  setBrandFilterText: (v: string) => void;
  categoryFilterText: string;
  setCategoryFilterText: (v: string) => void;
  labelFilterText: string;
  setLabelFilterText: (v: string) => void;
  dBrandText: string;
  dCategoryText: string;
  dLabelText: string;
  onlyWithPrice: boolean;
  setOnlyWithPrice: (v: boolean) => void;
}

function FiltersPanel(props: FiltersPanelProps) {
  const {
    brands,
    categories,
    labels,
    brandIds,
    setBrandIds,
    categoryIds,
    setCategoryIds,
    labelIds,
    setLabelIds,
    stockStatus,
    setStockStatus,
    productType,
    setProductType,
    brandFilterText,
    setBrandFilterText,
    categoryFilterText,
    setCategoryFilterText,
    labelFilterText,
    setLabelFilterText,
    dBrandText,
    dCategoryText,
    dLabelText,
    onlyWithPrice,
    setOnlyWithPrice,
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
          {stockStatus !== "__all" && (
            <Badge variant="secondary" className="mr-2">
              ۱
            </Badge>
          )}
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
        <label className="flex items-center gap-2 text-sm pt-2 cursor-pointer">
          <Checkbox checked={onlyWithPrice} onCheckedChange={(v) => setOnlyWithPrice(!!v)} />
          <span>فقط محصولات دارای قیمت معتبر</span>
        </label>
      </div>

      {/* Brands */}
      <div className="space-y-2">
        <div className="text-sm font-semibold">
          برندها{" "}
          {brandIds.length > 0 && (
            <Badge variant="secondary" className="mr-2">
              {formatNumber(brandIds.length)} انتخاب
            </Badge>
          )}
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
            ) : (
              filteredBrands.map((b) => (
                <label
                  key={b.id}
                  className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5"
                >
                  <Checkbox
                    checked={brandIds.includes(b.id)}
                    onCheckedChange={() => toggle(brandIds, setBrandIds, b.id)}
                  />
                  <span className="truncate">{b.name}</span>
                </label>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Categories */}
      <div className="space-y-2">
        <div className="text-sm font-semibold">
          دسته‌بندی‌ها{" "}
          {categoryIds.length > 0 && (
            <Badge variant="secondary" className="mr-2">
              {formatNumber(categoryIds.length)} انتخاب
            </Badge>
          )}
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
            ) : (
              filteredCategories.map((c) => (
                <label
                  key={c.id}
                  className={`flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5 ${c.parent_id ? "pr-4" : ""}`}
                >
                  <Checkbox
                    checked={categoryIds.includes(c.id)}
                    onCheckedChange={() => toggle(categoryIds, setCategoryIds, c.id)}
                  />
                  <span className="truncate">{c.name}</span>
                </label>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Labels */}
      <div className="space-y-2">
        <div className="text-sm font-semibold">
          برچسب‌ها{" "}
          {labelIds.length > 0 && (
            <Badge variant="secondary" className="mr-2">
              {formatNumber(labelIds.length)} انتخاب
            </Badge>
          )}
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
            ) : (
              filteredLabels.map((l) => (
                <label
                  key={l.id}
                  className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5"
                >
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
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
