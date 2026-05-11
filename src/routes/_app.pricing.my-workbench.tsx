import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  Search,
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole } from "@/lib/rbac/roles";
import { useDebounce } from "@/hooks/use-debounce";
import { useIsMobile } from "@/hooks/use-mobile";
import { fetchBrandsLite } from "@/lib/products/queries";
import {
  fetchMyWorkbenchRows,
  updateProductStock,
  upsertPurchasePrice,
  STOCK_STATUS_LABELS,
  STOCK_STATUS_OPTIONS,
  type WorkbenchRow,
  type StockStatus,
} from "@/lib/pricing/workbench";
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
  const [brandId, setBrandId] = useState("all");
  const [stockFilter, setStockFilter] = useState<"all" | StockStatus>("all");
  const [showAll, setShowAll] = useState(false);
  const [page, setPage] = useState(0);
  const [stepPct, setStepPct] = useState<number>(1);
  const [dirty, setDirty] = useState<Record<string, Dirty>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<Record<string, number>>({});

  const brandsQ = useQuery({ queryKey: ["brands-lite"], queryFn: fetchBrandsLite, staleTime: 60_000 });

  const listQ = useQuery({
    queryKey: ["workbench-rows", user?.id, dSearch, brandId, stockFilter, showAll, page],
    enabled: !!user?.id,
    queryFn: () =>
      fetchMyWorkbenchRows({
        userId: user!.id,
        search: dSearch,
        brandId,
        stockStatus: stockFilter,
        showAll: showAll && isPrivileged,
        page,
        pageSize: PAGE_SIZE,
      }),
    staleTime: 15_000,
  });

  // reset dirty وقتی فیلتر/صفحه عوض میشه
  useEffect(() => {
    setDirty({});
  }, [dSearch, brandId, stockFilter, showAll, page]);

  const rows = listQ.data?.rows ?? [];
  const total = listQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const dirtyCount = useMemo(() => Object.keys(dirty).length, [dirty]);

  function setRowPrice(row: WorkbenchRow, value: number) {
    setDirty((d) => ({
      ...d,
      [row.id]: { ...d[row.id], price: Math.max(0, Math.round(value)) },
    }));
  }

  function setRowStock(row: WorkbenchRow, status: StockStatus) {
    setDirty((d) => ({
      ...d,
      [row.id]: { ...d[row.id], stock: status },
    }));
  }

  function bumpPrice(row: WorkbenchRow, deltaPct: number) {
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

  async function saveRow(row: WorkbenchRow) {
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
          }
          if (pubRes.failed > 0) {
            const firstErr = pubRes.results.find((r) => !r.ok)?.error;
            toast.warning(
              `بازمحاسبهٔ ${formatNumber(pubRes.failed)} قیمت فروش ناموفق بود${firstErr ? `: ${firstErr}` : ""}`,
            );
          }
          qc.invalidateQueries({ queryKey: ["product-price-history", row.id] });
          qc.invalidateQueries({ queryKey: ["product-computed-prices"] });
        } catch (pubErr: any) {
          // تغییر قیمت خرید قبلاً ذخیره شده — فقط هشدار بده.
          toast.warning(`بازمحاسبه قیمت فروش ناموفق بود: ${pubErr?.message ?? "خطای ناشناخته"}`);
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
        <QuickAddCustomerDialog />
      </div>

      <EffectiveCurrenciesPanel />

      {/* فیلترها */}
      <Card>
        <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-5">
          <div className="md:col-span-2">
            <Label className="mb-1 block text-xs">جستجو</Label>
            <div className="relative">
              <Search className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                placeholder="نام یا کد محصول..."
                className="pr-8"
              />
            </div>
          </div>
          <div>
            <Label className="mb-1 block text-xs">برند</Label>
            <Select value={brandId} onValueChange={(v) => { setBrandId(v); setPage(0); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه برندها</SelectItem>
                {(brandsQ.data ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-xs">موجودی</Label>
            <Select value={stockFilter} onValueChange={(v) => { setStockFilter(v as never); setPage(0); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه</SelectItem>
                {STOCK_STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-xs">گام تغییر قیمت</Label>
            <Select value={String(stepPct)} onValueChange={(v) => setStepPct(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
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
            <div className="flex items-end gap-2 md:col-span-5">
              <Switch checked={showAll} onCheckedChange={(v) => { setShowAll(v); setPage(0); }} id="show-all" />
              <Label htmlFor="show-all" className="text-sm">نمایش همه محصولات (مدیریتی)</Label>
            </div>
          )}
        </CardContent>
      </Card>

      {/* محتوا */}
      {listQ.isLoading ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          <Loader2 className="ms-2 h-4 w-4 animate-spin" /> در حال بارگذاری...
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            هیچ محصولی برای نمایش وجود ندارد.
            <br />
            {!showAll && "اگر مسئول هیچ محصولی نیستید، با مدیر تماس بگیرید."}
          </CardContent>
        </Card>
      ) : isMobile ? (
        <div className="space-y-3">
          {rows.map((row) => (
            <MobileCard
              key={row.id}
              row={row}
              dirty={dirty[row.id]}
              stepPct={stepPct}
              saving={saving === row.id}
              justSaved={!!savedFlash[row.id]}
              canLabel={canLabel}
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
                  <TableHead className="text-right">محصول</TableHead>
                  <TableHead className="text-right">برند</TableHead>
                  <TableHead className="text-right">قیمت خرید</TableHead>
                  <TableHead className="text-right">ارز</TableHead>
                  <TableHead className="text-right">موجودی</TableHead>
                  <TableHead className="text-right">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <DesktopRow
                    key={row.id}
                    row={row}
                    dirty={dirty[row.id]}
                    stepPct={stepPct}
                    saving={saving === row.id}
                    canLabel={canLabel}
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
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            <ChevronRight className="ms-1 h-4 w-4" /> قبلی
          </Button>
          <div className="text-muted-foreground">
            صفحه {formatNumber(page + 1)} از {formatNumber(totalPages)} — مجموع {formatNumber(total)} محصول
          </div>
          <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
            بعدی <ChevronLeft className="me-1 h-4 w-4" />
          </Button>
        </div>
      )}

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
        onOpenChange={(o) => { if (!o) setLabelTarget(null); }}
      />
    </div>
  );
}

/* ============================================================ */
/*                       Desktop Row                              */
/* ============================================================ */
function DesktopRow({
  row, dirty, stepPct, saving, canLabel, onLabel, onPrice, onBump, onStock, onClear, onSave,
}: {
  row: WorkbenchRow;
  dirty?: Dirty;
  stepPct: number;
  saving: boolean;
  canLabel: boolean;
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

  return (
    <TableRow className={isDirty ? "bg-amber-50 dark:bg-amber-950/20" : undefined}>
      <TableCell className="font-medium">
        <div>{row.name}</div>
        <div className="text-xs text-muted-foreground" dir="ltr">{row.sku ?? "—"}</div>
      </TableCell>
      <TableCell className="text-sm">{row.brand_name ?? "—"}</TableCell>
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
            onKeyDown={(e) => { if (e.key === "Enter") onSave(); }}
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
        {noSupplier && <div className="mt-1 text-[10px] text-muted-foreground">بدون تأمین‌کننده ثبت‌شده</div>}
      </TableCell>
      <TableCell className="text-xs">{(CURRENCY_LABELS as Record<string, string>)[(row.current_currency ?? row.base_currency) as string] ?? (row.current_currency ?? row.base_currency)}</TableCell>
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
      <TableCell>
        <div className="flex gap-1">
          <Button size="sm" variant="default" className="h-7" disabled={!isDirty || saving} onClick={onSave}>
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
  row, dirty, stepPct, saving, justSaved, canLabel, onLabel, onPrice, onBump, onStock, onClear, onSave,
}: {
  row: WorkbenchRow;
  dirty?: Dirty;
  stepPct: number;
  saving: boolean;
  justSaved: boolean;
  canLabel: boolean;
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
    currentStock === "available" ? <PackageCheck className="h-4 w-4 text-emerald-600" />
    : currentStock === "unavailable" ? <PackageX className="h-4 w-4 text-destructive" />
    : <Package className="h-4 w-4 text-amber-600" />;

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
            <div className="truncate font-medium">{row.name}</div>
            <div className="truncate text-xs text-muted-foreground" dir="ltr">
              {row.sku ?? "—"} {row.brand_name ? `· ${row.brand_name}` : ""}
            </div>
          </div>
          {statusBadge}
        </div>

        <div>
          <Label className="mb-1 flex items-center justify-between text-xs">
            <span>قیمت خرید ({(CURRENCY_LABELS as Record<string, string>)[(row.current_currency ?? row.base_currency) as string] ?? (row.current_currency ?? row.base_currency)})</span>
            {priceDelta !== 0 && (
              <span
                className={
                  priceDelta > 0
                    ? "flex items-center gap-1 text-emerald-600"
                    : "flex items-center gap-1 text-destructive"
                }
              >
                {priceDelta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {priceDelta > 0 ? "+" : ""}{priceDelta.toFixed(1)}٪
              </span>
            )}
          </Label>

          {/* Swipe area: large pressable price field */}
          <div
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            className="relative select-none touch-pan-y"
            style={{ transform: `translateX(${swipeDelta * 0.3}px)`, transition: swipeDelta === 0 ? "transform 0.2s" : "none" }}
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
              <TrendingDown className="h-3 w-3" />۱۰٪
            </Button>
            <Button variant="outline" size="sm" className="h-11 gap-1" onClick={() => onBump(-stepPct)}>
              <Minus className="h-3 w-3" />{stepPct}٪
            </Button>
            <Button variant="outline" size="sm" className="h-11 gap-1" onClick={() => onBump(stepPct)}>
              <Plus className="h-3 w-3" />{stepPct}٪
            </Button>
            <Button variant="outline" size="sm" className="h-11 gap-1" onClick={() => onBump(10)}>
              <TrendingUp className="h-3 w-3" />۱۰٪
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
              variant={currentStock !== "available" && currentStock !== "unavailable" ? "default" : "outline"}
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