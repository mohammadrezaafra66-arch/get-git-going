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
  AlertCircle,
} from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
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

  const [search, setSearch] = useState("");
  const dSearch = useDebounce(search, 300);
  const [brandId, setBrandId] = useState("all");
  const [stockFilter, setStockFilter] = useState<"all" | StockStatus>("all");
  const [showAll, setShowAll] = useState(false);
  const [page, setPage] = useState(0);
  const [stepPct, setStepPct] = useState<number>(1);
  const [dirty, setDirty] = useState<Record<string, Dirty>>({});
  const [saving, setSaving] = useState<string | null>(null);

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
          currency: row.current_currency ?? row.base_currency,
          supplierId: row.current_supplier_id,
          previousPriceId: row.current_price_id,
          previousPrice: row.current_price,
          actorId: user.id,
        });
      }
      // سپس موجودی
      if (change.stock && change.stock !== row.stock_status) {
        await updateProductStock(row.id, change.stock, user.id, row.stock_status);
      }
      toast.success(`«${row.name}» ذخیره شد`);
      clearRow(row.id);
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
                  <TableHead className="text-right">تنظیم سریع</TableHead>
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
    </div>
  );
}

/* ============================================================ */
/*                       Desktop Row                              */
/* ============================================================ */
function DesktopRow({
  row, dirty, stepPct, saving, onPrice, onBump, onStock, onClear, onSave,
}: {
  row: WorkbenchRow;
  dirty?: Dirty;
  stepPct: number;
  saving: boolean;
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
        <Input
          type="number"
          min={0}
          value={currentPrice || ""}
          onChange={(e) => onPrice(Number(e.target.value) || 0)}
          onKeyDown={(e) => { if (e.key === "Enter") onSave(); }}
          className="h-8 w-32 text-left"
          dir="ltr"
          disabled={noSupplier}
        />
        {noSupplier && <div className="mt-1 text-[10px] text-destructive">بدون تأمین‌کننده</div>}
      </TableCell>
      <TableCell className="text-xs">{CURRENCY_LABELS[row.current_currency ?? row.base_currency]}</TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => onBump(-stepPct)} disabled={noSupplier}>
            <Minus className="h-3 w-3" />
          </Button>
          <span className="min-w-[2.5rem] text-center text-xs text-muted-foreground">{stepPct}٪</span>
          <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => onBump(stepPct)} disabled={noSupplier}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
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
      <TableCell>
        <div className="flex gap-1">
          <Button size="sm" variant="default" className="h-7" disabled={!isDirty || saving} onClick={onSave}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          </Button>
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
  row, dirty, stepPct, saving, onPrice, onBump, onStock, onClear, onSave,
}: {
  row: WorkbenchRow;
  dirty?: Dirty;
  stepPct: number;
  saving: boolean;
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

  return (
    <Card className={isDirty ? "border-amber-400" : undefined}>
      <CardContent className="space-y-3 p-4">
        <div>
          <div className="font-medium">{row.name}</div>
          <div className="text-xs text-muted-foreground" dir="ltr">{row.sku ?? "—"} {row.brand_name ? `· ${row.brand_name}` : ""}</div>
        </div>

        <div>
          <Label className="mb-1 block text-xs">قیمت خرید ({CURRENCY_LABELS[row.current_currency ?? row.base_currency]})</Label>
          <Input
            type="number"
            inputMode="numeric"
            value={currentPrice || ""}
            onChange={(e) => onPrice(Number(e.target.value) || 0)}
            className="h-12 text-center text-lg"
            dir="ltr"
            disabled={noSupplier}
          />
          {noSupplier && <div className="mt-1 text-xs text-destructive">این محصول هنوز تأمین‌کننده ثبت‌شده ندارد.</div>}
          <div className="mt-2 grid grid-cols-4 gap-2">
            <Button variant="outline" size="sm" className="h-10" onClick={() => onBump(-10)} disabled={noSupplier}>−۱۰٪</Button>
            <Button variant="outline" size="sm" className="h-10" onClick={() => onBump(-stepPct)} disabled={noSupplier}>−{stepPct}٪</Button>
            <Button variant="outline" size="sm" className="h-10" onClick={() => onBump(stepPct)} disabled={noSupplier}>+{stepPct}٪</Button>
            <Button variant="outline" size="sm" className="h-10" onClick={() => onBump(10)} disabled={noSupplier}>+۱۰٪</Button>
          </div>
        </div>

        <div>
          <Label className="mb-1 block text-xs">موجودی</Label>
          <Select value={currentStock} onValueChange={(v) => onStock(v as StockStatus)}>
            <SelectTrigger className="h-11">
              <div className="flex items-center gap-2">{stockIcon}<SelectValue /></div>
            </SelectTrigger>
            <SelectContent>
              {STOCK_STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
              <SelectItem value="unknown">نامشخص</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2 pt-2">
          <Button className="flex-1 h-11" disabled={!isDirty || saving} onClick={onSave}>
            {saving ? <Loader2 className="ms-1 h-4 w-4 animate-spin" /> : <Save className="ms-1 h-4 w-4" />}
            ذخیره
          </Button>
          {isDirty && (
            <Button variant="outline" className="h-11" onClick={onClear}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="text-center text-[11px] text-muted-foreground">
          وضعیت فعلی: {STOCK_STATUS_LABELS[row.stock_status]} · قیمت قبلی: {row.current_price ? formatNumber(row.current_price) : "—"}
        </div>
      </CardContent>
    </Card>
  );
}