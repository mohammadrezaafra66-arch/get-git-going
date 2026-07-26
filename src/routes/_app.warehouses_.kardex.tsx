import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Loader2, ScrollText, Search, X } from "lucide-react";

import { requireAnyRole } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { JalaliDateInput } from "@/shared/components/JalaliDateInput";
import { formatDateTimeFa, formatNumber, toFaDigits } from "@/lib/i18n/formatters";
import { useDebounce } from "@/hooks/use-debounce";
import {
  MOVEMENT_TYPE_FA,
  REF_TYPE_FA,
  fetchStockMovements,
  fetchWarehouses,
  type MovementType,
} from "@/lib/warehouses/queries";

// Item 183 / 8.8 — kardex report with Jalali date range + warehouse filter.
export const Route = createFileRoute("/_app/warehouses_/kardex")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager", "accountant", "purchase_specialist"]);
  },
  component: KardexPage,
});

const ALL = "__all__";

const TYPE_TONE: Record<MovementType, string> = {
  in: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
  transfer_in: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
  out: "border-destructive/50 text-destructive",
  transfer_out: "border-destructive/50 text-destructive",
  adjust: "border-amber-500/40 text-amber-700 dark:text-amber-400",
};

function KardexPage() {
  const [warehouseId, setWarehouseId] = useState<string>(ALL);
  const [movementType, setMovementType] = useState<string>(ALL);
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 350);

  const warehousesQ = useQuery({
    queryKey: ["warehouse-options"],
    queryFn: () => fetchWarehouses(true),
    staleTime: 60_000,
  });

  const rowsQ = useQuery({
    queryKey: ["kardex", warehouseId, fromDate, toDate],
    queryFn: () =>
      fetchStockMovements({
        warehouseId: warehouseId === ALL ? null : warehouseId,
        fromDate: fromDate || null,
        toDate: toDate || null,
        limit: 500,
      }),
    staleTime: 15_000,
  });

  // Product-name search and type filter are applied client-side over the fetched
  // page so the operator can narrow without another round trip.
  const rows = useMemo(() => {
    const all = rowsQ.data ?? [];
    const term = debouncedSearch.trim();
    return all.filter((r) => {
      if (movementType !== ALL && r.movement_type !== movementType) return false;
      if (term && !(r.product_name ?? "").includes(term)) return false;
      return true;
    });
  }, [rowsQ.data, movementType, debouncedSearch]);

  const totals = useMemo(() => {
    let inQty = 0;
    let outQty = 0;
    for (const r of rows) {
      const d = Number(r.delta ?? 0);
      if (d > 0) inQty += d;
      else outQty += -d;
    }
    return { inQty, outQty, net: inQty - outQty };
  }, [rows]);

  const hasFilters =
    warehouseId !== ALL || movementType !== ALL || !!fromDate || !!toDate || !!search;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/warehouses">
            <ArrowRight className="ml-2 h-4 w-4" /> بازگشت به انبارها
          </Link>
        </Button>
      </div>

      <PageHeader
        title="گزارش کاردکس (ورود و خروج کالا)"
        description="حرکت‌های ثبت‌شدهٔ موجودی به تفکیک انبار، با فیلتر بازهٔ تاریخ شمسی. هر تغییر موجودی یک ردیف اینجا دارد."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryTile label="مجموع ورود" value={formatNumber(totals.inQty)} tone="in" />
        <SummaryTile label="مجموع خروج" value={formatNumber(totals.outQty)} tone="out" />
        <SummaryTile label="خالص" value={formatNumber(totals.net)} tone="net" />
        <SummaryTile label="تعداد حرکت" value={formatNumber(rows.length)} tone="net" />
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1">
              <Label>انبار</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>همه انبارها</SelectItem>
                  {(warehousesQ.data ?? []).map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>نوع حرکت</Label>
              <Select value={movementType} onValueChange={setMovementType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>همه</SelectItem>
                  {(Object.keys(MOVEMENT_TYPE_FA) as MovementType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {MOVEMENT_TYPE_FA[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>از تاریخ</Label>
              <JalaliDateInput value={fromDate} onChange={setFromDate} />
            </div>
            <div className="space-y-1">
              <Label>تا تاریخ</Label>
              <JalaliDateInput value={toDate} onChange={setToDate} />
            </div>
            <div className="space-y-1">
              <Label>جستجوی نام کالا</Label>
              <div className="relative">
                <Search className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pr-8"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="نام محصول"
                />
              </div>
            </div>
          </div>

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setWarehouseId(ALL);
                setMovementType(ALL);
                setFromDate("");
                setToDate("");
                setSearch("");
              }}
            >
              <X className="ml-1 h-4 w-4" /> پاک کردن فیلترها
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {rowsQ.isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="ml-2 h-5 w-5 animate-spin" /> در حال بارگذاری…
            </div>
          ) : rowsQ.isError ? (
            <div className="p-6 text-sm text-destructive">دریافت گزارش کاردکس با خطا مواجه شد.</div>
          ) : rows.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={ScrollText}
                title="حرکتی برای نمایش نیست"
                description="با این فیلترها هیچ ورود/خروجی ثبت نشده است. بازهٔ تاریخ یا انبار را تغییر دهید."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">تاریخ</TableHead>
                    <TableHead className="text-right">کالا</TableHead>
                    <TableHead className="text-right">انبار</TableHead>
                    <TableHead className="text-right">نوع</TableHead>
                    <TableHead className="text-right">مقدار</TableHead>
                    <TableHead className="text-right">منبع</TableHead>
                    <TableHead className="text-right">انبار مرتبط</TableHead>
                    <TableHead className="text-right">توضیح</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const d = Number(r.delta ?? 0);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap">
                          {formatDateTimeFa(r.created_at)}
                        </TableCell>
                        <TableCell className="font-medium">{r.product_name ?? "—"}</TableCell>
                        <TableCell>{r.warehouse_name ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={TYPE_TONE[r.movement_type]}>
                            {MOVEMENT_TYPE_FA[r.movement_type] ?? r.movement_type}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className={
                            d < 0
                              ? "font-semibold text-destructive"
                              : "font-semibold text-emerald-700 dark:text-emerald-400"
                          }
                        >
                          {d < 0 ? "−" : "+"}
                          {formatNumber(Math.abs(d || Number(r.quantity)))}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.ref_type ? (REF_TYPE_FA[r.ref_type] ?? r.ref_type) : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.related_warehouse_name ?? "—"}
                        </TableCell>
                        <TableCell className="max-w-[14rem] truncate text-muted-foreground">
                          {r.note || "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="border-t p-3 text-xs text-muted-foreground">
                نمایش {toFaDigits(String(rows.length))} حرکت (حداکثر ۵۰۰ ردیف در هر بار).
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "in" | "out" | "net";
}) {
  const cls =
    tone === "in"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "out"
        ? "text-destructive"
        : "";
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-lg font-semibold ${cls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
