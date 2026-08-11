import { useMemo, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowLeft,
  Search,
  ChevronRight,
  ChevronLeft,
  Save,
  Loader2,
  FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/use-debounce";
import { formatNumber, formatCurrency } from "@/lib/i18n/formatters";
import { fetchSalePriceTypes } from "@/lib/pricing/queries";
import { fetchSettlementTypes } from "@/lib/pricing/queries";
import { fetchBrandsLite, fetchCategoriesLite } from "@/lib/products/queries";
import { fetchShopSettings } from "@/lib/shop/settings";
import {
  STOCK_STATUS_LABELS,
  STOCK_STATUS_VARIANTS,
  PRODUCT_TYPE_LABELS,
  type StockStatus,
  type ProductType,
} from "@/lib/products/constants";
import {
  exportSalePriceListToExcel,
  type SalePriceListExportRow,
} from "@/lib/export/sale-price-list-excel";

const PAGE_SIZE = 20;

export const Route = createFileRoute("/_app/pricing/sale-lists_/new")({
  beforeLoad: async () => {
    await requirePermission("pricing", "create");
  },
  component: NewSaleListPage,
});

type ColumnKey =
  | "name"
  | "brand"
  | "category"
  | "sale_price"
  | "previous_price"
  | "change"
  | "stock_status"
  | "product_type"
  | "labels"
  | "description";

const COLUMN_OPTIONS: { key: ColumnKey; label: string; locked?: boolean }[] = [
  { key: "name", label: "نام محصول", locked: true },
  { key: "brand", label: "برند" },
  { key: "category", label: "دسته‌بندی" },
  { key: "sale_price", label: "قیمت فروش" },
  { key: "previous_price", label: "قیمت قبلی" },
  { key: "change", label: "میزان تغییر (تومان و درصد)" },
  { key: "stock_status", label: "وضعیت موجودی" },
  { key: "product_type", label: "نوع کالا" },
  { key: "labels", label: "برچسب‌ها" },
  { key: "description", label: "توضیحات" },
];

interface ProductRow {
  id: string;
  name: string;
  sku: string | null;
  product_type: ProductType;
  stock_status: StockStatus;
  brand: { id: string; name: string } | null;
  category: { id: string; name: string } | null;
}

interface PriceMapEntry {
  current: number | null;
  previous: number | null;
}

function NewSaleListPage() {
  const navigate = useNavigate();

  // Wizard step
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 state
  const [salePriceTypeId, setSalePriceTypeId] = useState<string>("");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput.trim(), 350);
  const [brandId, setBrandId] = useState<string>("__all");
  const [categoryId, setCategoryId] = useState<string>("__all");
  const [stockStatus, setStockStatus] = useState<string>("__all");
  const [productType, setProductType] = useState<string>("__all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE);
  const [pageSizeInput, setPageSizeInput] = useState<string>(String(PAGE_SIZE));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectingAll, setSelectingAll] = useState(false);

  // Step 2 state
  const [selectedColumns, setSelectedColumns] = useState<ColumnKey[]>(
    COLUMN_OPTIONS.map((c) => c.key),
  );

  // Step 3 state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [termsText, setTermsText] = useState("");
  const [sellerInfo, setSellerInfo] = useState("");
  const [sellerInfoTouched, setSellerInfoTouched] = useState(false);
  // Settlement type is PDF/header metadata only — never affects pricing.
  const [settlementTypeId, setSettlementTypeId] = useState<string>("__none");
  const [saving, setSaving] = useState(false);

  const shopSettingsQ = useQuery({
    queryKey: ["shop-settings"],
    queryFn: fetchShopSettings,
    staleTime: 300_000,
  });

  // Prefill seller info from default once settings load (if user hasn't typed)
  useMemo(() => {
    if (!sellerInfoTouched && shopSettingsQ.data?.default_seller_info) {
      setSellerInfo(shopSettingsQ.data.default_seller_info);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopSettingsQ.data?.default_seller_info]);

  // Reset page on filter changes
  const resetPage = () => setPage(1);

  // Free numeric "per page" input, clamped to 5–500 on commit (blur/Enter).
  const commitPageSize = () => {
    const raw = Number(pageSizeInput);
    if (pageSizeInput.trim() === "" || !Number.isFinite(raw)) {
      setPageSizeInput(String(pageSize));
      return;
    }
    let n = Math.round(raw);
    let clamped = false;
    if (n < 5) {
      n = 5;
      clamped = true;
    } else if (n > 500) {
      n = 500;
      clamped = true;
    }
    setPageSizeInput(String(n));
    if (n !== pageSize) {
      setPageSize(n);
      resetPage();
    }
    if (clamped) {
      toast.info(`تعداد در هر صفحه بین ۵ تا ۵۰۰ است — به ${formatNumber(n)} تنظیم شد.`);
    }
  };

  const salePriceTypesQ = useQuery({
    queryKey: ["sale-price-types-active"],
    queryFn: () => fetchSalePriceTypes(true),
    staleTime: 60_000,
  });
  const settlementTypesQ = useQuery({
    queryKey: ["settlement-types-active"],
    queryFn: () => fetchSettlementTypes(true),
    staleTime: 60_000,
  });
  const brandsQ = useQuery({
    queryKey: ["brands-lite"],
    queryFn: fetchBrandsLite,
    staleTime: 60_000,
  });
  const categoriesQ = useQuery({
    queryKey: ["categories-lite"],
    queryFn: fetchCategoriesLite,
    staleTime: 60_000,
  });

  const productsQ = useQuery({
    queryKey: [
      "sale-list-new-products",
      search,
      brandId,
      categoryId,
      stockStatus,
      productType,
      page,
      pageSize,
    ],
    queryFn: async () => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      let q = supabase
        .from("products")
        .select(
          "id, name, sku, product_type, stock_status, brand:brands(id, name), category:categories(id, name)",
          { count: "exact" },
        )
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .range(from, to);
      if (search) {
        const safe = search.replace(/[%_]/g, "");
        q = q.or(`name.ilike.%${safe}%,sku.ilike.%${safe}%`);
      }
      if (brandId !== "__all") q = q.eq("brand_id", brandId);
      if (categoryId !== "__all") q = q.eq("category_id", categoryId);
      if (stockStatus !== "__all") q = q.eq("stock_status", stockStatus as StockStatus);
      if (productType !== "__all") q = q.eq("product_type", productType as ProductType);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as unknown as ProductRow[], total: count ?? 0 };
    },
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });

  // Fetch sale price snapshots for visible products to render the price column
  const visibleIds = useMemo(() => (productsQ.data?.rows ?? []).map((p) => p.id), [productsQ.data]);

  const visiblePricesQ = useQuery({
    queryKey: ["sale-list-new-visible-prices", salePriceTypeId, visibleIds],
    enabled: !!salePriceTypeId && visibleIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_sale_price_history")
        .select("product_id, new_sale_price, old_sale_price, created_at")
        .eq("sale_price_type_id", salePriceTypeId)
        .in("product_id", visibleIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const map = new Map<string, PriceMapEntry>();
      for (const row of data ?? []) {
        if (!map.has(row.product_id)) {
          map.set(row.product_id, {
            current: Number(row.new_sale_price ?? 0) || null,
            previous:
              row.old_sale_price === null || row.old_sale_price === undefined
                ? null
                : Number(row.old_sale_price),
          });
        }
      }
      return map;
    },
    staleTime: 10_000,
  });

  const total = productsQ.data?.total ?? 0;
  const rows = productsQ.data?.rows ?? [];
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // مورد ۱۳۶ — خروجی اکسل. لیست هنوز ذخیره نشده، پس از همان ردیف‌های جدول
  // جاری و نقشهٔ قیمت‌های بارگذاری‌شده خروجی می‌گیریم.
  const [exporting, setExporting] = useState(false);

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const priceMap = visiblePricesQ.data;
      const priceTypeTitle =
        (salePriceTypesQ.data ?? []).find((t) => t.id === salePriceTypeId)?.title ?? null;

      const exportRows: SalePriceListExportRow[] = rows.map((r) => ({
        sku: r.sku,
        name: r.name,
        salePrice: priceMap?.get(r.id)?.current ?? null,
        brand: r.brand?.name ?? null,
        category: r.category?.name ?? null,
        stockStatus: STOCK_STATUS_LABELS[r.stock_status] ?? r.stock_status,
        productType: PRODUCT_TYPE_LABELS[r.product_type] ?? r.product_type,
      }));

      await exportSalePriceListToExcel(exportRows, { salePriceTypeTitle: priceTypeTitle });
      toast.success("خروجی اکسل آماده شد.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      toast.error(msg || "خطا در ساخت خروجی اکسل.");
    } finally {
      setExporting(false);
    }
  };

  const allVisibleSelected = rows.length > 0 && rows.every((r) => selectedIds.includes(r.id));

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedIds((prev) => prev.filter((id) => !rows.some((r) => r.id === id)));
    } else {
      const ids = rows.map((r) => r.id);
      setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  // Fetch ALL product ids matching the CURRENT filters (not just the visible
  // page), in batches so a large catalog never issues one heavy query.
  const fetchAllMatchingIds = async (): Promise<string[]> => {
    const BATCH = 1000;
    const ids: string[] = [];
    let from = 0;
    // guard: max 20 batches = 20,000 products
    for (let guard = 0; guard < 20; guard++) {
      let q = supabase
        .from("products")
        .select("id")
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .range(from, from + BATCH - 1);
      if (search) {
        const safe = search.replace(/[%_]/g, "");
        q = q.or(`name.ilike.%${safe}%,sku.ilike.%${safe}%`);
      }
      if (brandId !== "__all") q = q.eq("brand_id", brandId);
      if (categoryId !== "__all") q = q.eq("category_id", categoryId);
      if (stockStatus !== "__all") q = q.eq("stock_status", stockStatus as StockStatus);
      if (productType !== "__all") q = q.eq("product_type", productType as ProductType);
      const { data, error } = await q;
      if (error) throw error;
      const batch = (data ?? []).map((r) => r.id as string);
      ids.push(...batch);
      if (batch.length < BATCH) break;
      from += BATCH;
    }
    return ids;
  };

  const handleSelectAllMatching = async () => {
    setSelectingAll(true);
    try {
      const ids = await fetchAllMatchingIds();
      setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
      toast.success(`${formatNumber(ids.length)} محصول انتخاب شد.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "انتخاب همهٔ محصولات ناموفق بود.");
    } finally {
      setSelectingAll(false);
    }
  };

  const clearSelection = () => setSelectedIds([]);

  const toggleColumn = (key: ColumnKey) => {
    const opt = COLUMN_OPTIONS.find((c) => c.key === key);
    if (opt?.locked) return;
    setSelectedColumns((prev) =>
      prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key],
    );
  };

  // Step navigation guards
  const canGoStep2 = !!salePriceTypeId && selectedIds.length > 0;
  const canGoStep3 = selectedColumns.length > 0;

  // Save handler
  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!salePriceTypeId) {
      toast.error("ابتدا نوع قیمت فروش را در مرحله ۱ انتخاب کنید.");
      setStep(1);
      return;
    }
    if (selectedIds.length === 0) {
      toast.error("حداقل یک محصول باید انتخاب شود.");
      setStep(1);
      return;
    }
    if (!trimmedName) {
      toast.error("نام لیست فروش الزامی است.");
      return;
    }
    if (trimmedName.length > 200) {
      toast.error("نام لیست حداکثر ۲۰۰ کاراکتر است.");
      return;
    }

    setSaving(true);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) throw new Error("کاربر شناسایی نشد.");

      // Fetch latest sale price for selected products in one query
      const { data: priceRows, error: priceErr } = await supabase
        .from("product_sale_price_history")
        .select("product_id, new_sale_price, old_sale_price, created_at")
        .eq("sale_price_type_id", salePriceTypeId)
        .in("product_id", selectedIds)
        .order("created_at", { ascending: false });
      if (priceErr) throw priceErr;
      const priceMap = new Map<string, PriceMapEntry>();
      for (const row of priceRows ?? []) {
        if (!priceMap.has(row.product_id)) {
          priceMap.set(row.product_id, {
            current: Number(row.new_sale_price ?? 0) || 0,
            previous:
              row.old_sale_price === null || row.old_sale_price === undefined
                ? null
                : Number(row.old_sale_price),
          });
        }
      }

      // Fetch stock status snapshot for selected products
      const { data: prodRows, error: prodErr } = await supabase
        .from("products")
        .select("id, stock_status")
        .in("id", selectedIds);
      if (prodErr) throw prodErr;
      const stockMap = new Map<string, StockStatus>();
      for (const p of prodRows ?? []) stockMap.set(p.id, p.stock_status as StockStatus);

      // Insert sale_list
      const { data: listData, error: listErr } = await supabase
        .from("sale_lists")
        .insert({
          name: trimmedName,
          description: description.trim() || null,
          terms_text: termsText.trim() || null,
          seller_info: sellerInfo.trim() || null,
          sale_price_type_id: salePriceTypeId,
          settlement_type_id: settlementTypeId === "__none" ? null : settlementTypeId,
          created_by: userData.user.id,
          version_number: 1,
          status: "draft",
          selected_columns: selectedColumns,
        })
        .select("id")
        .single();
      if (listErr || !listData) throw listErr ?? new Error("ایجاد لیست ناموفق بود.");

      // Insert items
      const items = selectedIds.map((pid, idx) => {
        const pe = priceMap.get(pid);
        const current = pe?.current ?? 0;
        const previous = pe?.previous ?? null;
        const change_amount =
          previous !== null && previous !== undefined ? current - previous : null;
        const change_percent =
          previous && previous !== 0
            ? Number((((current - previous) / previous) * 100).toFixed(2))
            : null;
        return {
          sale_list_id: listData.id,
          product_id: pid,
          current_price: current,
          previous_price: previous,
          change_amount,
          change_percent,
          stock_status: stockMap.get(pid) ?? null,
          sort_order: idx,
        };
      });

      const { error: itemsErr } = await supabase.from("sale_list_items").insert(items);
      if (itemsErr) {
        // Rollback: delete the just-created list to avoid orphan
        await supabase.from("sale_lists").delete().eq("id", listData.id);
        throw itemsErr;
      }

      toast.success("لیست فروش با موفقیت ایجاد شد.");
      navigate({ to: "/pricing/sale-lists" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "خطا در ذخیره لیست فروش.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const priceMap = visiblePricesQ.data;

  return (
    <div className="space-y-5">
      <PageHeader
        title="ایجاد لیست فروش جدید"
        description="انتخاب محصولات، ستون‌های نمایشی و ثبت اطلاعات لیست"
        actions={
          <Button asChild variant="outline">
            <Link to="/pricing/sale-lists">بازگشت</Link>
          </Button>
        }
      />

      <Stepper step={step} />

      {step === 1 && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1">
                <Label>نوع قیمت فروش *</Label>
                <Select
                  value={salePriceTypeId}
                  onValueChange={(v) => {
                    setSalePriceTypeId(v);
                    resetPage();
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="انتخاب کنید" />
                  </SelectTrigger>
                  <SelectContent>
                    {(salePriceTypesQ.data ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>برند</Label>
                <Select
                  value={brandId}
                  onValueChange={(v) => {
                    setBrandId(v);
                    resetPage();
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">همه برندها</SelectItem>
                    {(brandsQ.data ?? [])
                      .filter((b) => b.is_active)
                      .map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>دسته‌بندی</Label>
                <Select
                  value={categoryId}
                  onValueChange={(v) => {
                    setCategoryId(v);
                    resetPage();
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">همه دسته‌ها</SelectItem>
                    {(categoriesQ.data ?? [])
                      .filter((c) => c.is_active)
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>وضعیت موجودی</Label>
                <Select
                  value={stockStatus}
                  onValueChange={(v) => {
                    setStockStatus(v);
                    resetPage();
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">همه</SelectItem>
                    {Object.entries(STOCK_STATUS_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>نوع کالا</Label>
                <Select
                  value={productType}
                  onValueChange={(v) => {
                    setProductType(v);
                    resetPage();
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">همه</SelectItem>
                    {Object.entries(PRODUCT_TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>جستجو (نام / SKU)</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchInput}
                    onChange={(e) => {
                      setSearchInput(e.target.value);
                      resetPage();
                    }}
                    placeholder="جستجو..."
                    className="pr-9"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
              <span>
                <strong>{formatNumber(selectedIds.length)}</strong> از{" "}
                <strong>{formatNumber(total)}</strong> محصول انتخاب شده
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAllMatching}
                  disabled={selectingAll || total === 0}
                  className="gap-1"
                >
                  {selectingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  انتخاب همهٔ {formatNumber(total)} محصول
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearSelection}
                  disabled={selectedIds.length === 0}
                >
                  حذف انتخاب‌ها
                </Button>
                {/* مورد ۱۳۶ — خروجی اکسل از همان ردیف‌های جدول جاری */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleExportExcel}
                  disabled={exporting || rows.length === 0}
                >
                  {exporting ? (
                    <Loader2 className="ms-1 h-4 w-4 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="ms-1 h-4 w-4" />
                  )}
                  خروجی اکسل
                </Button>
              </div>
            </div>
            {!salePriceTypeId && (
              <div className="px-3 text-xs text-muted-foreground">
                برای مشاهده قیمت‌ها، نوع قیمت فروش را انتخاب کنید.
              </div>
            )}

            {productsQ.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                محصولی با این فیلترها یافت نشد.
              </div>
            ) : (
              <>
                {/* Desktop */}
                <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={allVisibleSelected}
                            onCheckedChange={toggleSelectAllVisible}
                            aria-label="انتخاب این صفحه"
                          />
                        </TableHead>
                        <TableHead className="text-right">نام محصول</TableHead>
                        <TableHead className="text-right">SKU</TableHead>
                        <TableHead className="text-right">برند</TableHead>
                        <TableHead className="text-right">دسته</TableHead>
                        <TableHead className="text-right">موجودی</TableHead>
                        <TableHead className="text-right">قیمت فروش</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => {
                        const checked = selectedIds.includes(r.id);
                        const pe = priceMap?.get(r.id);
                        return (
                          <TableRow key={r.id} className={checked ? "bg-muted/30" : ""}>
                            <TableCell>
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => toggleOne(r.id)}
                                aria-label="انتخاب"
                              />
                            </TableCell>
                            <TableCell className="font-medium">{r.name}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {r.sku ?? "—"}
                            </TableCell>
                            <TableCell>{r.brand?.name ?? "—"}</TableCell>
                            <TableCell>{r.category?.name ?? "—"}</TableCell>
                            <TableCell>
                              <Badge variant={STOCK_STATUS_VARIANTS[r.stock_status]}>
                                {STOCK_STATUS_LABELS[r.stock_status]}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {!salePriceTypeId
                                ? "—"
                                : pe?.current
                                  ? formatCurrency(pe.current, "تومان")
                                  : "ناموجود"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile */}
                <div className="space-y-2 md:hidden">
                  {rows.map((r) => {
                    const checked = selectedIds.includes(r.id);
                    const pe = priceMap?.get(r.id);
                    return (
                      <Card key={r.id} className={checked ? "border-primary" : ""}>
                        <CardContent className="flex gap-3 p-3">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleOne(r.id)}
                            className="mt-1"
                          />
                          <div className="flex-1 space-y-1 text-sm">
                            <div className="font-semibold">{r.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {r.sku ?? "—"} • {r.brand?.name ?? "بدون برند"}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <Badge variant={STOCK_STATUS_VARIANTS[r.stock_status]}>
                                {STOCK_STATUS_LABELS[r.stock_status]}
                              </Badge>
                              <span className="text-xs">
                                {!salePriceTypeId
                                  ? "—"
                                  : pe?.current
                                    ? formatCurrency(pe.current, "تومان")
                                    : "ناموجود"}
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between gap-2 pt-2">
                  <div className="text-xs text-muted-foreground">
                    مجموع: {formatNumber(total)} — صفحه {formatNumber(page)} از{" "}
                    {formatNumber(totalPages)}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <span className="whitespace-nowrap text-xs text-muted-foreground">
                        تعداد در صفحه:
                      </span>
                      <Input
                        type="number"
                        min={5}
                        max={500}
                        inputMode="numeric"
                        className="h-8 w-20 text-xs"
                        value={pageSizeInput}
                        onChange={(e) => setPageSizeInput(e.target.value)}
                        onBlur={commitPageSize}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronRight className="h-4 w-4" /> قبلی
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      بعدی <ChevronLeft className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div>
              <h3 className="text-base font-semibold">انتخاب ستون‌های نمایشی</h3>
              <p className="text-xs text-muted-foreground">
                این ستون‌ها در نمایش لیست فروش و خروجی‌های آینده استفاده خواهند شد.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
              {COLUMN_OPTIONS.map((opt) => {
                const checked = selectedColumns.includes(opt.key);
                return (
                  <label
                    key={opt.key}
                    className={`flex cursor-pointer items-center gap-2 rounded-md border border-border p-3 text-sm ${opt.locked ? "opacity-70" : ""}`}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={opt.locked}
                      onCheckedChange={() => toggleColumn(opt.key)}
                    />
                    <span>{opt.label}</span>
                    {opt.locked && (
                      <span className="mr-auto text-[10px] text-muted-foreground">(الزامی)</span>
                    )}
                  </label>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="space-y-1">
              <Label htmlFor="sl-name">نام لیست *</Label>
              <Input
                id="sl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
                placeholder="مثلاً لیست فروش هفته جاری"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sl-desc">توضیحات</Label>
              <Textarea
                id="sl-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="توضیح کوتاه (اختیاری)"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sl-terms">شرایط فروش</Label>
              <Textarea
                id="sl-terms"
                value={termsText}
                onChange={(e) => setTermsText(e.target.value)}
                rows={4}
                placeholder="شرایط، گارانتی، ارسال و ... (اختیاری)"
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="sl-seller">اطلاعات فروشنده (درج‌شده در PDF)</Label>
                {shopSettingsQ.data?.default_seller_info ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setSellerInfo(shopSettingsQ.data!.default_seller_info);
                      setSellerInfoTouched(true);
                    }}
                  >
                    استفاده از مقدار پیش‌فرض
                  </Button>
                ) : null}
              </div>
              <Textarea
                id="sl-seller"
                value={sellerInfo}
                onChange={(e) => {
                  setSellerInfo(e.target.value);
                  setSellerInfoTouched(true);
                }}
                rows={3}
                maxLength={500}
                placeholder="نام، شماره تماس و سمت فروشنده (اختیاری، حداکثر ۵۰۰ کاراکتر)"
                dir="rtl"
              />
            </div>
            <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <div>تعداد محصولات: {formatNumber(selectedIds.length)}</div>
              <div>ستون‌های نمایشی: {formatNumber(selectedColumns.length)}</div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="sl-settlement">نوع تسویه (نمایش در PDF)</Label>
              <Select
                value={settlementTypeId}
                onValueChange={(v) => setSettlementTypeId(v)}
                dir="rtl"
              >
                <SelectTrigger id="sl-settlement">
                  <SelectValue placeholder="انتخاب نوع تسویه" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— بدون نوع تسویه —</SelectItem>
                  {(settlementTypesQ.data ?? []).map((s: { id: string; title: string }) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-[11px] text-muted-foreground">
                این مقدار فقط در سربرگ PDF نمایش داده می‌شود و در محاسبه قیمت محصولات تأثیری ندارد.
              </div>
            </div>
            <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              پس از ایجاد لیست، می‌توانید ترتیب برند و محصول در PDF را از صفحه ویرایش تنظیم کنید.
            </div>
          </CardContent>
        </Card>
      )}

      {/* Wizard nav */}
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s))}
          disabled={step === 1 || saving}
          className="gap-2"
        >
          <ArrowRight className="h-4 w-4" />
          مرحله قبل
        </Button>

        {step < 3 ? (
          <Button
            onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
            disabled={step === 1 ? !canGoStep2 : !canGoStep3}
            className="gap-2"
          >
            مرحله بعد
            <ArrowLeft className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            ذخیره لیست فروش
          </Button>
        )}
      </div>
    </div>
  );
}

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const items = [
    { n: 1, label: "انتخاب محصولات" },
    { n: 2, label: "ستون‌های نمایشی" },
    { n: 3, label: "اطلاعات نهایی" },
  ];
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {items.map((it, idx) => {
        const active = step === it.n;
        const done = step > it.n;
        return (
          <div key={it.n} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                active
                  ? "bg-primary text-primary-foreground"
                  : done
                    ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {it.n}
            </div>
            <span
              className={`whitespace-nowrap text-sm ${active ? "font-semibold" : "text-muted-foreground"}`}
            >
              {it.label}
            </span>
            {idx < items.length - 1 && <span className="mx-1 h-px w-6 bg-border sm:w-10" />}
          </div>
        );
      })}
    </div>
  );
}
