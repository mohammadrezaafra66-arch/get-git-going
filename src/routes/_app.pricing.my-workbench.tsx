import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  Save,
  Minus,
  Plus,
  RotateCcw,
  ChevronRight,
  ChevronLeft,
  PackageCheck,
  PackageX,
  Package,
  TrendingUp,
  TrendingDown,
  Check,
  CircleDot,
  Tag,
  LifeBuoy,
  FileText,
} from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { EffectiveCurrenciesPanel } from "@/components/pricing/EffectiveCurrenciesPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole, hasPermissionEx } from "@/lib/rbac/roles";
import { useDebounce } from "@/hooks/use-debounce";
import { useIsMobile } from "@/hooks/use-mobile";
import { fetchBrandsLite, fetchCategoriesLite, fetchLabelsLite } from "@/lib/products/queries";
import {
  updateProductStock,
  upsertPurchasePrice,
  STOCK_STATUS_LABELS,
  STOCK_STATUS_OPTIONS,
  type StockStatus,
} from "@/lib/pricing/workbench";
import {
  fetchWorkbenchRowsV2,
  fetchAllProductOwners,
  type WorkbenchRowV2,
} from "@/lib/pricing/workbench-queries";
import {
  DEFAULT_WORKBENCH_FILTERS,
  hasValidSalePrice,
  PRODUCT_STATUS_LABEL,
  type WorkbenchFilters,
} from "@/lib/pricing/workbench-filters";
import { WorkbenchFiltersBar } from "@/components/pricing/workbench/WorkbenchFiltersBar";
import type { WorkbenchScope } from "@/components/pricing/workbench/WorkbenchFiltersBar";
import { HealthReportTab } from "@/components/pricing/workbench/HealthReportTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CURRENCY_LABELS } from "@/lib/pricing/constants";
import { formatNumber } from "@/lib/i18n/formatters";
import { publishProductPrices } from "@/lib/pricing/publish-prices";
import { QuickAddCustomerDialog } from "@/shared/components/QuickAddCustomerDialog";
import { ProductLabelsQuickDialog } from "@/components/products/ProductLabelsQuickDialog";

export const Route = createFileRoute("/_app/pricing/my-workbench")({
  component: WorkbenchPage,
});

const PAGE_SIZE = 25;

type Dirty = {
  price?: number;
  stock?: StockStatus;
};

function WorkbenchPage() {
  const { user, roles } = useAuth();
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const isPrivileged = hasAnyRole(roles, ["admin", "manager"]);
  const canLabel = hasAnyRole(roles, ["admin", "accountant"]);
  const [labelTarget, setLabelTarget] = useState<{ id: string; name: string } | null>(null);

  const [search, setSearch] = useState("");
  const dSearch = useDebounce(search, 300);
  const [filters, setFilters] = useState<WorkbenchFilters>(DEFAULT_WORKBENCH_FILTERS);
  const [showAll, setShowAll] = useState(false);
  const [page, setPage] = useState(0);
  const [showAllInOnePage, setShowAllInOnePage] = useState(false);
  const [stepPct, setStepPct] = useState<number>(1);
  const [dirty, setDirty] = useState<Record<string, Dirty>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<Record<string, number>>({});
  const [publishErrors, setPublishErrors] = useState<Record<string, string>>({});

  const brandsQ = useQuery({
    queryKey: ["brands-lite"],
    queryFn: fetchBrandsLite,
    staleTime: 60_000,
  });
  const catsQ = useQuery({
    queryKey: ["categories-lite"],
    queryFn: fetchCategoriesLite,
    staleTime: 60_000,
  });
  const labelsQ = useQuery({
    queryKey: ["labels-lite"],
    queryFn: fetchLabelsLite,
    staleTime: 60_000,
  });
  const ownersQ = useQuery({
    queryKey: ["product-owners-lite"],
    queryFn: fetchAllProductOwners,
    staleTime: 60_000,
  });

  const filtersWithSearch: WorkbenchFilters = useMemo(
    () => ({ ...filters, search: dSearch }),
    [filters, dSearch],
  );

  const effectivePageSize = showAllInOnePage ? 10_000 : PAGE_SIZE;

  const listQ = useQuery({
    queryKey: ["workbench-rows-v2", user?.id, filtersWithSearch, showAll, page, effectivePageSize],
    enabled: !!user?.id,
    queryFn: () =>
      fetchWorkbenchRowsV2({
        filters: filtersWithSearch,
        ownedOnly: showAll && isPrivileged ? null : { userId: user!.id },
        page,
        pageSize: effectivePageSize,
      }),
    staleTime: 15_000,
  });

  // reset dirty وقتی فیلتر/صفحه عوض میشه
  useEffect(() => {
    setDirty({});
  }, [filtersWithSearch, showAll, page, showAllInOnePage]);

  // reset page وقتی فیلتر تغییر کند
  useEffect(() => {
    setPage(0);
  }, [filtersWithSearch, showAll, showAllInOnePage]);

  const rows: WorkbenchRowV2[] = listQ.data?.rows ?? [];
  const total = listQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / effectivePageSize));
  const dirtyCount = useMemo(() => Object.keys(dirty).length, [dirty]);

  // Map English engine errors → Persian row-level messages.
  function mapPublishError(raw: string | null | undefined): string {
    const msg = (raw ?? "").toString();
    if (!msg) return "خطای ناشناخته در محاسبه قیمت فروش.";
    if (msg.includes("قانون") || /NO_RULE/i.test(msg)) {
      return "قانون قیمت‌گذاری منطبق برای این محصول وجود ندارد. نگاشت pricing_rules را بررسی کنید.";
    }
    if (msg.includes("نرخ") || /NO_(CURRENCY|SHIPPING)_RATE/i.test(msg)) {
      return "نرخ ارز فعال برای محاسبه قیمت فروش موجود نیست.";
    }
    if (msg.includes("قیمت خرید") || /NO_PURCHASE_PRICE/i.test(msg)) {
      return "قیمت خرید معتبر برای این محصول ثبت نشده است.";
    }
    return msg;
  }

  // Scope chips: derived from existing showAll + filters.ownerId, no new state.
  const scope: WorkbenchScope = !showAll ? "mine" : filters.ownerId === "none" ? "no-owner" : "all";

  function handleScopeChange(next: WorkbenchScope) {
    if (next === "mine") {
      setShowAll(false);
      setFilters((f) => ({ ...f, ownerId: "all" }));
    } else if (next === "all") {
      setShowAll(true);
      setFilters((f) => ({ ...f, ownerId: "all" }));
    } else {
      setShowAll(true);
      setFilters((f) => ({ ...f, ownerId: "none" }));
    }
    setPage(0);
  }

  function setRowPrice(row: WorkbenchRowV2, value: number) {
    setDirty((d) => ({
      ...d,
      [row.id]: { ...d[row.id], price: Math.max(0, Math.round(value)) },
    }));
  }

  function setRowStock(row: WorkbenchRowV2, status: StockStatus) {
    setDirty((d) => ({
      ...d,
      [row.id]: { ...d[row.id], stock: status },
    }));
  }

  function bumpPrice(row: WorkbenchRowV2, deltaPct: number) {
    const base = dirty[row.id]?.price ?? row.current_price ?? 0;
    if (base <= 0) return;
    const next = base * (1 + deltaPct / 100);
    setRowPrice(row, next);
  }

  function clearRow(rowId: string) {
    setDirty((d) => {
      const { [rowId]: _, ...rest } = d;
      return rest;
    });
  }

  async function saveRow(row: WorkbenchRowV2) {
    if (!user?.id) return;
    const change = dirty[row.id];
    if (!change) return;
    setSaving(row.id);
    try {
      // ابتدا قیمت (در صورت تغییر)
      if (change.price !== undefined && change.price !== row.current_price) {
        await upsertPurchasePrice({
          productId: row.id,
          newPrice: change.price,
          currency: (row.current_currency ?? row.base_currency) as "toman" | "usd" | "aed",
          supplierId: row.current_supplier_id,
          previousPriceId: row.current_price_id,
          previousPrice: row.current_price,
          actorId: user.id,
        });
        // بازمحاسبه و انتشار قیمت‌های فروش تا product_sale_price_history و
        // product_computed_prices به‌روز شوند و نمودار تاریخچه (Realtime) نقطهٔ جدید را ببیند.
        try {
          const pubRes = await publishProductPrices({
            productId: row.id,
            source: "workbench_save",
          });
          if (pubRes.succeeded > 0) {
            toast.success(`${formatNumber(pubRes.succeeded)} قیمت فروش به‌روزرسانی شد`);
            setPublishErrors((e) => {
              const { [row.id]: _, ...rest } = e;
              return rest;
            });
          }
          if (pubRes.failed > 0 && pubRes.succeeded === 0) {
            const firstErr = pubRes.results.find((r) => !r.ok)?.error;
            const fa = mapPublishError(firstErr);
            setPublishErrors((e) => ({ ...e, [row.id]: fa }));
            toast.warning(fa);
          } else if (pubRes.failed > 0) {
            const firstErr = pubRes.results.find((r) => !r.ok)?.error;
            toast.warning(
              `بازمحاسبهٔ ${formatNumber(pubRes.failed)} قیمت فروش ناموفق بود${firstErr ? `: ${mapPublishError(firstErr)}` : ""}`,
            );
          }
          qc.invalidateQueries({ queryKey: ["product-price-history", row.id] });
          qc.invalidateQueries({ queryKey: ["product-computed-prices"] });
        } catch (pubErr: any) {
          // تغییر قیمت خرید قبلاً ذخیره شده — فقط هشدار بده.
          const fa = mapPublishError(pubErr?.message);
          setPublishErrors((e) => ({ ...e, [row.id]: fa }));
          toast.warning(`بازمحاسبه قیمت فروش ناموفق بود: ${fa}`);
        }
      }
      // سپس موجودی
      if (change.stock && change.stock !== row.stock_status) {
        await updateProductStock(row.id, change.stock, user.id, row.stock_status);
      }
      toast.success(`«${row.name}» ذخیره شد`);
      clearRow(row.id);
      setSavedFlash((s) => ({ ...s, [row.id]: Date.now() }));
      setTimeout(() => {
        setSavedFlash((s) => {
          const { [row.id]: _, ...rest } = s;
          return rest;
        });
      }, 2000);
      qc.invalidateQueries({ queryKey: ["workbench-rows"] });
      qc.invalidateQueries({ queryKey: ["workbench-rows-v2"] });
      qc.invalidateQueries({ queryKey: ["workbench-health-report"] });
      // Ensure the sale price column refreshes immediately, regardless of staleTime.
      await qc.refetchQueries({ queryKey: ["workbench-rows-v2"], type: "active" });
    } catch (e: any) {
      toast.error(e?.message ?? "خطا در ذخیره");
    } finally {
      setSaving(null);
    }
  }

  async function saveAll() {
    const ids = Object.keys(dirty);
    if (ids.length === 0) return;
    let ok = 0;
    let fail = 0;
    for (const id of ids) {
      const row = rows.find((r) => r.id === id);
      if (!row) continue;
      try {
        await saveRow(row);
        ok++;
      } catch {
        fail++;
      }
    }
    toast.message(`ذخیره گروهی: ${ok} موفق، ${fail} ناموفق`);
  }

  return (
    <div className="space-y-5 pb-32">
      <PageHeader
        title="کارگاه قیمت من"
        description="ویرایش سریع قیمت خرید و موجودی محصولات تحت مسئولیت شما — مانند اکسل."
      />
      <div className="flex justify-end">
        {hasPermissionEx(roles, "pricing", "view") && (
          <Button asChild variant="outline" size="sm" className="me-2">
            <Link to="/pricing/sale-lists">
              <FileText className="ms-1 h-4 w-4" />
              لیست‌های قیمت فروش
            </Link>
          </Button>
        )}
        <Button asChild variant="outline" size="sm" className="me-2">
          <Link to="/pricing/attention">
            <LifeBuoy className="ms-1 h-4 w-4" />
            فرصت جبران
          </Link>
        </Button>
        <QuickAddCustomerDialog />
      </div>

      <EffectiveCurrenciesPanel />

      <Tabs defaultValue="workbench" className="w-full">
        <TabsList>
          <TabsTrigger value="workbench">کارگاه قیمت‌گذاری</TabsTrigger>
          <TabsTrigger value="health">گزارش سلامت قیمت/فروش</TabsTrigger>
        </TabsList>

        <TabsContent value="workbench" className="space-y-4">
          <WorkbenchFiltersBar
            filters={filters}
            onChange={(f) => {
              setFilters(f);
              setPage(0);
            }}
            brands={brandsQ.data ?? []}
            categories={catsQ.data ?? []}
            labels={labelsQ.data ?? []}
            owners={ownersQ.data ?? []}
            search={search}
            onSearchChange={(v) => {
              setSearch(v);
              setPage(0);
            }}
            scope={scope}
            onScopeChange={handleScopeChange}
            canShowAll={isPrivileged}
          />

          <Card>
            <CardContent className="flex flex-wrap items-end gap-3 p-4">
              <div className="min-w-[160px]">
                <Label className="mb-1 block text-xs">گام تغییر قیمت</Label>
                <Select value={String(stepPct)} onValueChange={(v) => setStepPct(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.5">۰٫۵٪</SelectItem>
                    <SelectItem value="1">۱٪</SelectItem>
                    <SelectItem value="2">۲٪</SelectItem>
                    <SelectItem value="5">۵٪</SelectItem>
                    <SelectItem value="10">۱۰٪</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isPrivileged && (
                <div className="flex items-center gap-2">
                  <Switch
                    checked={showAll}
                    onCheckedChange={(v) => {
                      setShowAll(v);
                      setPage(0);
                    }}
                    id="show-all"
                  />
                  <Label htmlFor="show-all" className="text-sm">
                    نمایش همه محصولات (مدیریتی)
                  </Label>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Switch
                  checked={showAllInOnePage}
                  onCheckedChange={(v) => {
                    setShowAllInOnePage(v);
                    setPage(0);
                  }}
                  id="show-all-one-page"
                />
                <Label htmlFor="show-all-one-page" className="text-sm">
                  نمایش همه در یک صفحه
                </Label>
              </div>
            </CardContent>
          </Card>

          {listQ.isLoading ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              <Loader2 className="ms-2 h-4 w-4 animate-spin" /> در حال بارگذاری...
            </div>
          ) : rows.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center text-sm text-muted-foreground">
                محصولی با این فیلترها پیدا نشد.
                <br />
                {!showAll && "اگر مسئول هیچ محصولی نیستید، با مدیر تماس بگیرید."}
              </CardContent>
            </Card>
          ) : isMobile ? (
            <div className="space-y-3">
              {rows.map((row, index) => (
                <MobileCard
                  key={row.id}
                  rowIndex={page * effectivePageSize + index + 1}
                  row={row}
                  dirty={dirty[row.id]}
                  stepPct={stepPct}
                  saving={saving === row.id}
                  justSaved={!!savedFlash[row.id]}
                  canLabel={canLabel}
                  publishError={publishErrors[row.id]}
                  onLabel={() => setLabelTarget({ id: row.id, name: row.name })}
                  onPrice={(v) => setRowPrice(row, v)}
                  onBump={(p) => bumpPrice(row, p)}
                  onStock={(s) => setRowStock(row, s)}
                  onClear={() => clearRow(row.id)}
                  onSave={() => saveRow(row)}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right w-12">ردیف</TableHead>
                      <TableHead className="text-right">محصول</TableHead>
                      <TableHead className="text-right">برند</TableHead>
                      <TableHead className="text-right">دسته</TableHead>
                      <TableHead className="text-right">قیمت خرید</TableHead>
                      <TableHead className="text-right">ارز</TableHead>
                      <TableHead className="text-right">قیمت فروش (نقدی)</TableHead>
                      <TableHead className="text-right">موجودی</TableHead>
                      <TableHead className="text-right">وضعیت</TableHead>
                      <TableHead className="text-right">مسئول / برچسب</TableHead>
                      <TableHead className="text-right">عملیات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, index) => (
                      <DesktopRow
                        key={row.id}
                        rowIndex={page * effectivePageSize + index + 1}
                        row={row}
                        dirty={dirty[row.id]}
                        stepPct={stepPct}
                        saving={saving === row.id}
                        canLabel={canLabel}
                        publishError={publishErrors[row.id]}
                        onLabel={() => setLabelTarget({ id: row.id, name: row.name })}
                        onPrice={(v) => setRowPrice(row, v)}
                        onBump={(p) => bumpPrice(row, p)}
                        onStock={(s) => setRowStock(row, s)}
                        onClear={() => clearRow(row.id)}
                        onSave={() => saveRow(row)}
                      />
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* صفحه‌بندی */}
          {total > effectivePageSize && (
            <div className="flex items-center justify-between text-sm">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronRight className="ms-1 h-4 w-4" /> قبلی
              </Button>
              <div className="text-muted-foreground">
                صفحه {formatNumber(page + 1)} از {formatNumber(totalPages)} — مجموع{" "}
                {formatNumber(total)} محصول
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                بعدی <ChevronLeft className="me-1 h-4 w-4" />
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="health">
          <HealthReportTab
            ownedOnly={showAll && isPrivileged ? null : user?.id ? { userId: user.id } : null}
          />
        </TabsContent>
      </Tabs>

      {/* نوار پایین: ذخیره همه */}
      {dirtyCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-3 shadow-lg backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-2">
            <div className="text-sm">
              <Badge variant="secondary">{formatNumber(dirtyCount)}</Badge> ردیف تغییر یافته
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setDirty({})}>
                <RotateCcw className="ms-1 h-4 w-4" /> لغو همه
              </Button>
              <Button size="sm" onClick={saveAll}>
                <Save className="ms-1 h-4 w-4" /> ذخیره همه
              </Button>
            </div>
          </div>
        </div>
      )}

      <ProductLabelsQuickDialog
        productId={labelTarget?.id ?? null}
        productName={labelTarget?.name ?? ""}
        open={!!labelTarget}
        onOpenChange={(o) => {
          if (!o) setLabelTarget(null);
        }}
      />
    </div>
  );
}

/* ============================================================ */
/*                       Desktop Row                              */
/* ============================================================ */
function DesktopRow({
  row,
  rowIndex,
  dirty,
  stepPct,
  saving,
  canLabel,
  publishError,
  onLabel,
  onPrice,
  onBump,
  onStock,
  onClear,
  onSave,
}: {
  row: WorkbenchRowV2;
  rowIndex: number;
  dirty?: Dirty;
  stepPct: number;
  saving: boolean;
  canLabel: boolean;
  publishError?: string;
  onLabel: () => void;
  onPrice: (v: number) => void;
  onBump: (pct: number) => void;
  onStock: (s: StockStatus) => void;
  onClear: () => void;
  onSave: () => void;
}) {
  const currentPrice = dirty?.price ?? row.current_price ?? 0;
  const currentStock = dirty?.stock ?? row.stock_status;
  const isDirty = !!dirty;
  const noSupplier = !row.current_supplier_id;
  const noSalePrice = !hasValidSalePrice(row.sale_price);
  const noOwner = row.owners.length === 0;
  const categoryLabel = row.parent_category_name
    ? `${row.parent_category_name} / ${row.category_name ?? ""}`
    : (row.category_name ?? "—");

  return (
    <TableRow className={isDirty ? "bg-amber-50 dark:bg-amber-950/20" : undefined}>
      <TableCell className="text-center text-sm text-muted-foreground">
        {formatNumber(rowIndex)}
      </TableCell>
      <TableCell className="font-medium">
        <div>{row.name}</div>
        <div className="text-xs text-muted-foreground" dir="ltr">
          {row.sku ?? "—"}
        </div>
      </TableCell>
      <TableCell className="text-sm">{row.brand_name ?? "—"}</TableCell>
      <TableCell
        className="text-xs text-muted-foreground max-w-[160px] truncate"
        title={categoryLabel}
      >
        {categoryLabel}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-2"
            onClick={() => onBump(-stepPct)}
            title={`کاهش ${stepPct}٪`}
          >
            <Minus className="h-3 w-3" />
          </Button>
          <Input
            type="number"
            min={0}
            value={currentPrice || ""}
            onChange={(e) => onPrice(Number(e.target.value) || 0)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave();
            }}
            className="h-8 w-32 text-center"
            dir="ltr"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-2"
            onClick={() => onBump(stepPct)}
            title={`افزایش ${stepPct}٪`}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        {noSupplier && (
          <div className="mt-1 text-[10px] text-muted-foreground">بدون تأمین‌کننده ثبت‌شده</div>
        )}
      </TableCell>
      <TableCell className="text-xs">
        {(CURRENCY_LABELS as Record<string, string>)[
          (row.current_currency ?? row.base_currency) as string
        ] ??
          row.current_currency ??
          row.base_currency}
      </TableCell>
      <TableCell className="text-xs">
        {hasValidSalePrice(row.sale_price) ? (
          <span className="inline-flex items-center gap-1">
            {formatNumber(row.sale_price as number)}
            {row.sale_price_from_baseline && (
              <span
                className="text-[10px] text-muted-foreground"
                title="برای این محصول قیمت تسویهٔ «پیش واریز» ثبت نشده؛ قیمت پایه نمایش داده شده است."
              >
                (پایه)
              </span>
            )}
          </span>
        ) : (
          <Badge variant="destructive" className="text-[10px]">
            بدون قیمت فروش
          </Badge>
        )}
        {publishError && (
          <div className="mt-1">
            <Badge variant="destructive" className="text-[10px]" title={publishError}>
              خطای محاسبه
            </Badge>
          </div>
        )}
      </TableCell>
      <TableCell>
        <Select value={currentStock} onValueChange={(v) => onStock(v as StockStatus)}>
          <SelectTrigger className="h-8 w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STOCK_STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
            <SelectItem value="unknown">نامشخص</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="text-xs">
        {row.status === "active" ? (
          <Badge variant="outline" className="border-emerald-500 text-emerald-700 text-[10px]">
            {PRODUCT_STATUS_LABEL.active}
          </Badge>
        ) : (
          <Badge variant="outline" className="border-amber-500 text-amber-700 text-[10px]">
            {PRODUCT_STATUS_LABEL[row.status]}
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-xs max-w-[180px]">
        <div className="space-y-1">
          {noOwner ? (
            <Badge variant="destructive" className="text-[10px]">
              بدون مسئول
            </Badge>
          ) : (
            <div
              className="truncate text-muted-foreground"
              title={row.owners.map((o) => o.full_name ?? o.user_id).join("، ")}
            >
              {row.owners.map((o) => o.full_name ?? o.user_id.slice(0, 6)).join("، ")}
            </div>
          )}
          {row.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {row.tags.slice(0, 3).map((t) => (
                <Badge
                  key={t.id}
                  style={{ backgroundColor: t.color, color: "white" }}
                  className="text-[10px]"
                >
                  {t.title}
                </Badge>
              ))}
              {row.tags.length > 3 && (
                <Badge variant="secondary" className="text-[10px]">
                  +{row.tags.length - 3}
                </Badge>
              )}
            </div>
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="default"
            className="h-7"
            disabled={!isDirty || saving}
            onClick={onSave}
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          </Button>
          {canLabel && (
            <Button size="sm" variant="outline" className="h-7" onClick={onLabel} title="برچسب‌زدن">
              <Tag className="h-3 w-3" />
            </Button>
          )}
          {isDirty && (
            <Button size="sm" variant="ghost" className="h-7" onClick={onClear}>
              <RotateCcw className="h-3 w-3" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

/* ============================================================ */
/*                       Mobile Card                              */
/* ============================================================ */
function MobileCard({
  row,
  rowIndex,
  dirty,
  stepPct,
  saving,
  justSaved,
  canLabel,
  publishError,
  onLabel,
  onPrice,
  onBump,
  onStock,
  onClear,
  onSave,
}: {
  row: WorkbenchRowV2;
  rowIndex: number;
  dirty?: Dirty;
  stepPct: number;
  saving: boolean;
  justSaved: boolean;
  canLabel: boolean;
  publishError?: string;
  onLabel: () => void;
  onPrice: (v: number) => void;
  onBump: (pct: number) => void;
  onStock: (s: StockStatus) => void;
  onClear: () => void;
  onSave: () => void;
}) {
  const currentPrice = dirty?.price ?? row.current_price ?? 0;
  const currentStock = dirty?.stock ?? row.stock_status;
  const isDirty = !!dirty;
  const noSupplier = !row.current_supplier_id;

  const stockIcon =
    currentStock === "available" ? (
      <PackageCheck className="h-4 w-4 text-emerald-600" />
    ) : currentStock === "unavailable" ? (
      <PackageX className="h-4 w-4 text-destructive" />
    ) : (
      <Package className="h-4 w-4 text-amber-600" />
    );

  // -------- Swipe gesture for ± price --------
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const [swipeDelta, setSwipeDelta] = useState(0);
  const SWIPE_THRESHOLD = 50; // px per step

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > Math.abs(dy)) {
      setSwipeDelta(Math.max(-120, Math.min(120, dx)));
    }
  }
  function onTouchEnd() {
    if (touchStartX.current === null) return;
    if (Math.abs(swipeDelta) >= SWIPE_THRESHOLD) {
      // RTL: swipe right (positive dx) = decrease, swipe left = increase
      // For better intuition: right swipe = +, left swipe = − (LTR semantic on numbers)
      const dir = swipeDelta > 0 ? 1 : -1;
      onBump(dir * stepPct);
    }
    touchStartX.current = null;
    touchStartY.current = null;
    setSwipeDelta(0);
  }

  // -------- Save status badge --------
  const statusBadge = saving ? (
    <Badge variant="secondary" className="gap-1">
      <Loader2 className="h-3 w-3 animate-spin" /> در حال ذخیره
    </Badge>
  ) : justSaved ? (
    <Badge className="gap-1 bg-emerald-600 text-white hover:bg-emerald-600">
      <Check className="h-3 w-3" /> ذخیره شد
    </Badge>
  ) : isDirty ? (
    <Badge variant="outline" className="gap-1 border-amber-500 text-amber-700 dark:text-amber-400">
      <CircleDot className="h-3 w-3" /> تغییر ذخیره‌نشده
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <Check className="h-3 w-3" /> همگام
    </Badge>
  );

  const priceDelta =
    isDirty && dirty?.price !== undefined && row.current_price
      ? ((dirty.price - row.current_price) / row.current_price) * 100
      : 0;

  return (
    <Card
      className={
        justSaved
          ? "border-emerald-500 transition-colors"
          : isDirty
            ? "border-amber-400 transition-colors"
            : "transition-colors"
      }
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">#{formatNumber(rowIndex)}</span>
              <span className="truncate font-medium">{row.name}</span>
            </div>
            <div className="truncate text-xs text-muted-foreground" dir="ltr">
              {row.sku ?? "—"} {row.brand_name ? `· ${row.brand_name}` : ""}
            </div>
          </div>
          {statusBadge}
        </div>

        {/* Meta: status + sale price + owner + tags */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {row.status === "active" ? (
            <Badge variant="outline" className="border-emerald-500 text-emerald-700 text-[10px]">
              {PRODUCT_STATUS_LABEL.active}
            </Badge>
          ) : (
            <Badge variant="outline" className="border-amber-500 text-amber-700 text-[10px]">
              {PRODUCT_STATUS_LABEL[row.status]}
            </Badge>
          )}
          {hasValidSalePrice(row.sale_price) ? (
            <Badge variant="secondary" className="text-[10px]">
              فروش نقدی: {formatNumber(row.sale_price as number)}
              {row.sale_price_from_baseline && " (پایه)"}
            </Badge>
          ) : (
            <Badge variant="destructive" className="text-[10px]">
              بدون قیمت فروش
            </Badge>
          )}
          {row.owners.length === 0 ? (
            <Badge variant="destructive" className="text-[10px]">
              بدون مسئول
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">
              مسئول: {row.owners.map((o) => o.full_name ?? o.user_id.slice(0, 6)).join("، ")}
            </Badge>
          )}
          {row.tags.slice(0, 4).map((t) => (
            <Badge
              key={t.id}
              style={{ backgroundColor: t.color, color: "white" }}
              className="text-[10px]"
            >
              {t.title}
            </Badge>
          ))}
          {row.tags.length > 4 && (
            <Badge variant="secondary" className="text-[10px]">
              +{row.tags.length - 4}
            </Badge>
          )}
        </div>
        {publishError && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-[11px] text-destructive">
            ⚠️ {publishError}
          </div>
        )}

        <div>
          <Label className="mb-1 flex items-center justify-between text-xs">
            <span>
              قیمت خرید (
              {(CURRENCY_LABELS as Record<string, string>)[
                (row.current_currency ?? row.base_currency) as string
              ] ??
                row.current_currency ??
                row.base_currency}
              )
            </span>
            {priceDelta !== 0 && (
              <span
                className={
                  priceDelta > 0
                    ? "flex items-center gap-1 text-emerald-600"
                    : "flex items-center gap-1 text-destructive"
                }
              >
                {priceDelta > 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {priceDelta > 0 ? "+" : ""}
                {priceDelta.toFixed(1)}٪
              </span>
            )}
          </Label>

          {/* Swipe area: large pressable price field */}
          <div
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            className="relative select-none touch-pan-y"
            style={{
              transform: `translateX(${swipeDelta * 0.3}px)`,
              transition: swipeDelta === 0 ? "transform 0.2s" : "none",
            }}
          >
            <Input
              type="number"
              inputMode="numeric"
              value={currentPrice || ""}
              onChange={(e) => onPrice(Number(e.target.value) || 0)}
              className="h-14 text-center text-xl font-semibold"
              dir="ltr"
            />
            {/* Swipe hint overlays */}
            {swipeDelta > 20 && (
              <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-emerald-600">
                <Plus className="h-6 w-6" />
              </div>
            )}
            {swipeDelta < -20 && (
              <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-destructive">
                <Minus className="h-6 w-6" />
              </div>
            )}
          </div>
          <div className="mt-1 text-center text-[10px] text-muted-foreground">
            {noSupplier
              ? "بدون تأمین‌کننده ثبت‌شده — می‌توانید مستقیم قیمت را وارد کنید"
              : "💡 برای تغییر سریع، کارت قیمت را به چپ یا راست بکشید"}
          </div>

          <div className="mt-2 grid grid-cols-4 gap-2">
            <Button variant="outline" size="sm" className="h-11 gap-1" onClick={() => onBump(-10)}>
              <TrendingDown className="h-3 w-3" />
              ۱۰٪
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-11 gap-1"
              onClick={() => onBump(-stepPct)}
            >
              <Minus className="h-3 w-3" />
              {stepPct}٪
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-11 gap-1"
              onClick={() => onBump(stepPct)}
            >
              <Plus className="h-3 w-3" />
              {stepPct}٪
            </Button>
            <Button variant="outline" size="sm" className="h-11 gap-1" onClick={() => onBump(10)}>
              <TrendingUp className="h-3 w-3" />
              ۱۰٪
            </Button>
          </div>
        </div>

        <div>
          <Label className="mb-1 block text-xs">موجودی</Label>
          <div className="grid grid-cols-3 gap-2">
            <Button
              type="button"
              variant={currentStock === "available" ? "default" : "outline"}
              className={
                currentStock === "available"
                  ? "h-12 gap-1 bg-emerald-600 hover:bg-emerald-700"
                  : "h-12 gap-1"
              }
              onClick={() => onStock("available")}
            >
              <PackageCheck className="h-4 w-4" />
              <span className="text-xs">موجود</span>
            </Button>
            <Button
              type="button"
              variant={currentStock === "unavailable" ? "default" : "outline"}
              className={
                currentStock === "unavailable"
                  ? "h-12 gap-1 bg-destructive hover:bg-destructive/90"
                  : "h-12 gap-1"
              }
              onClick={() => onStock("unavailable")}
            >
              <PackageX className="h-4 w-4" />
              <span className="text-xs">ناموجود</span>
            </Button>
            <Button
              type="button"
              variant={
                currentStock !== "available" && currentStock !== "unavailable"
                  ? "default"
                  : "outline"
              }
              className={
                currentStock !== "available" && currentStock !== "unavailable"
                  ? "h-12 gap-1 bg-amber-600 hover:bg-amber-700"
                  : "h-12 gap-1"
              }
              onClick={() => onStock("unknown" as StockStatus)}
            >
              <Package className="h-4 w-4" />
              <span className="text-xs">نامشخص</span>
            </Button>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            className={
              justSaved
                ? "h-12 flex-1 gap-2 bg-emerald-600 hover:bg-emerald-600"
                : "h-12 flex-1 gap-2"
            }
            disabled={(!isDirty || saving) && !justSaved}
            onClick={onSave}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> در حال ذخیره...
              </>
            ) : justSaved ? (
              <>
                <Check className="h-4 w-4" /> ذخیره شد
              </>
            ) : (
              <>
                <Save className="h-4 w-4" /> ذخیره تغییرات
              </>
            )}
          </Button>
          {canLabel && (
            <Button variant="outline" className="h-12" onClick={onLabel} title="برچسب‌زدن">
              <Tag className="h-4 w-4" />
            </Button>
          )}
          {isDirty && (
            <Button variant="outline" className="h-12" onClick={onClear} disabled={saving}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
          {stockIcon}
          <span>قبلی: {STOCK_STATUS_LABELS[row.stock_status]}</span>
          <span>·</span>
          <span>قیمت قبلی: {row.current_price ? formatNumber(row.current_price) : "—"}</span>
        </div>
      </CardContent>
    </Card>
  );
}
