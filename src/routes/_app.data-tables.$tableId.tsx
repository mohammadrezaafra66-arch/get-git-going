import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import { toast } from "sonner";
import {
  ArrowRight, Plus, Loader2, Inbox, Search, AlertTriangle,
  Pencil, ArrowUp, ArrowDown, Eye, EyeOff, Download,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { requirePermission } from "@/lib/rbac/route-guards";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useDebounce } from "@/hooks/use-debounce";
import { toFaDigits, formatDateTimeFa, formatDateFa, formatNumber } from "@/lib/i18n/formatters";
import {
  DYNAMIC_COLUMN_DATA_TYPES, DYNAMIC_COLUMN_DATA_TYPE_LABELS,
  COLUMN_KEY_REGEX, type DynamicColumnDataType,
} from "@/lib/data-tables/constants";
import { FiltersBar, type FilterRule, type FilterColumn } from "@/components/data-tables/FiltersBar";
import { buildCsv, downloadCsv, buildExportFilename, type ExportColumnDef, type ExportRow } from "@/lib/data-tables/csv-export";
import {
  DYNAMIC_TABLE_ACCESS_LEVEL_BADGE,
  DYNAMIC_TABLE_ACCESS_LEVEL_LABELS,
  type DynamicTableAccessLevel,
  DYNAMIC_TABLE_ACCESS_LEVELS,
  SELECTABLE_ROLES,
  TOROB_PURCHISTA_SLUG,
  TOROB_PURCHISTA_REFETCH_MS,
  FORMULA_KEY_LABELS,
  type DynamicFormulaKey,
  OBSERVATORY_SLUG,
  OBSERVATORY_REFETCH_MS,
  OBSERVATORY_READONLY_KEYS,
  OBSERVATORY_STATUS_META,
  getObservatoryScoreTier,
} from "@/lib/data-tables/constants";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/_app/data-tables/$tableId")({
  beforeLoad: async () => { await requirePermission("data-tables", "view"); },
  component: DataTableDetailPage,
});

const PAGE_SIZE = 200;
const ROW_H = 40;

interface ColumnRow {
  id: string;
  table_id: string;
  column_key: string;
  label: string;
  data_type: DynamicColumnDataType;
  is_required: boolean;
  is_filterable: boolean;
  is_editable_by_bot: boolean;
  sort_order: number;
  is_computed: boolean;
  formula_key: DynamicFormulaKey | null;
  formula_config: Record<string, unknown> | null;
}

const COMPUTED_TOOLTIP = "این مقدار توسط فرمول سیستم محاسبه می‌شود.";

interface RowItem {
  id: string;
  row_number: number;
  is_active: boolean;
  created_at: string;
  values: Record<string, unknown>;
}

function DataTableDetailPage() {
  const { tableId } = Route.useParams();
  const { user, roles } = useAuth();
  const isAdmin = (roles ?? []).includes("admin");
  // Structural changes (columns, access settings, soft-deletes)
  const canEdit = isAdmin || (roles ?? []).includes("manager");
  // Row data CRUD: admin & manager only (accountant & viewer are read-only per spec)
  const canEditRows = canEdit;
  // Export is allowed for everyone with view access (admin, manager, accountant, viewer)
  const canExport = canEdit || (roles ?? []).includes("accountant") || (roles ?? []).includes("viewer");
  // Only admin can change access_level / allowed_roles
  const canChangeAccess = isAdmin;
  const qc = useQueryClient();

  const [showInactive, setShowInactive] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput, 350);
  const [rules, setRules] = useState<FilterRule[]>([]);
  const debouncedRules = useDebounce(rules, 350);

  const [addRowOpen, setAddRowOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [columnDialog, setColumnDialog] = useState<{ mode: "create" | "edit"; col?: ColumnRow } | null>(null);
  const [accessDialogOpen, setAccessDialogOpen] = useState(false);

  // Spreadsheet keyboard grid state
  const [focused, setFocused] = useState<{ row: number; col: number } | null>(null);
  const [editingPos, setEditingPos] = useState<{ row: number; col: number; initial?: string } | null>(null);
  const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const cellKey = (r: number, c: number) => `${r}:${c}`;
  const setCellRef = useCallback((r: number, c: number) => (el: HTMLDivElement | null) => {
    const k = cellKey(r, c);
    if (el) cellRefs.current.set(k, el);
    else cellRefs.current.delete(k);
  }, []);
  const focusCell = useCallback((r: number, c: number) => {
    const el = cellRefs.current.get(cellKey(r, c));
    if (el) {
      el.focus({ preventScroll: false });
      setFocused({ row: r, col: c });
    }
  }, []);

  const tableQuery = useQuery({
    enabled: !!user && !!tableId,
    queryKey: ["dynamic-table", tableId],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dynamic_tables")
        .select("id, name, slug, description, is_active, created_at, access_level, allowed_roles")
        .eq("id", tableId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const colsQuery = useQuery({
    enabled: !!user && !!tableId,
    queryKey: ["dynamic-table-columns", tableId],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dynamic_table_columns")
        .select("id, table_id, column_key, label, data_type, is_required, is_filterable, is_editable_by_bot, sort_order, is_computed, formula_key, formula_config")
        .eq("table_id", tableId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown as Array<Partial<ColumnRow>>).map((c) => ({
        ...c,
        is_computed: Boolean(c.is_computed),
        formula_key: (c.formula_key ?? null) as DynamicFormulaKey | null,
        formula_config: (c.formula_config ?? null) as Record<string, unknown> | null,
      })) as ColumnRow[];
    },
  });
  const columns = colsQuery.data ?? [];

  const isTorobTable = (tableQuery.data?.slug ?? "") === TOROB_PURCHISTA_SLUG;
  const isObservatoryTable = (tableQuery.data?.slug ?? "") === OBSERVATORY_SLUG;
  const rpcName = (isTorobTable || isObservatoryTable)
    ? "query_dynamic_table_rows_v2"
    : "query_dynamic_table_rows";

  const isObservatoryReadOnly = useCallback(
    (col: ColumnRow) =>
      isObservatoryTable && OBSERVATORY_READONLY_KEYS.has(col.column_key),
    [isObservatoryTable],
  );

  const renderObservatoryDisplay = useCallback(
    (col: ColumnRow, raw: unknown): React.ReactNode | null => {
      if (!isObservatoryTable) return null;
      if (col.column_key === "competitive_price_status") {
        const key = typeof raw === "string" && raw ? raw : "unknown";
        const meta = OBSERVATORY_STATUS_META[key] ?? OBSERVATORY_STATUS_META.unknown;
        return (
          <Badge variant="outline" className={`${meta.className} text-[11px]`}>
            {meta.label}
          </Badge>
        );
      }
      if (col.column_key === "sales_opportunity_score") {
        if (raw === null || raw === undefined || raw === "") {
          return <span className="text-muted-foreground">—</span>;
        }
        const n = Number(raw);
        if (!Number.isFinite(n)) return <span className="text-muted-foreground">—</span>;
        const clamped = Math.max(0, Math.min(100, Math.round(n)));
        const tier = getObservatoryScoreTier(clamped);
        return (
          <span className="inline-flex items-center gap-1.5">
            <Badge variant="outline" className={`${tier.className} text-[11px]`}
              title={tier.label}>
              {toFaDigits(String(clamped))} از ۱۰۰
            </Badge>
            <span className="text-[11px] text-muted-foreground">{tier.label}</span>
          </span>
        );
      }
      if (col.column_key === "suggested_sales_message") {
        const text = typeof raw === "string" ? raw : raw == null ? "" : String(raw);
        if (!text) return <span className="text-muted-foreground">—</span>;
        return (
          <span className="block truncate text-xs leading-5" title={text}>
            {text}
          </span>
        );
      }
      return null;
    },
    [isObservatoryTable],
  );
  const filterableColumns: FilterColumn[] = useMemo(
    () => columns.filter((c) => c.is_filterable).map((c) => ({ id: c.id, label: c.label, data_type: c.data_type })),
    [columns]
  );

  // Sanitize rules sent to server (drop incomplete ones)
  const serverFilters = useMemo(() => {
    return debouncedRules
      .filter((r) => {
        if (!r.column_id || !r.op) return false;
        const col = columns.find((c) => c.id === r.column_id);
        if (!col) return false;
        if (col.data_type === "boolean") return true; // value not required
        if (col.data_type === "date" || col.data_type === "datetime") {
          return Boolean((r.value && r.value.length) || (r.value2 && r.value2.length));
        }
        return Boolean(r.value && r.value.length);
      })
      .map((r) => ({
        column_id: r.column_id,
        op: r.op,
        value: r.value ?? null,
        value2: r.value2 ?? null,
      }));
  }, [debouncedRules, columns]);

  // Infinite paged window via offset (single window of PAGE_SIZE for now; "load more" appends)
  const [pageCount, setPageCount] = useState(1);
  useEffect(() => { setPageCount(1); }, [tableId, search, showInactive, JSON.stringify(serverFilters)]);

  const rowsQuery = useQuery({
    enabled: !!user && !!tableId,
    queryKey: ["dynamic-table-rows-v2", tableId, search, showInactive, serverFilters, pageCount, rpcName],
    staleTime: 10_000,
    refetchInterval: isTorobTable
      ? TOROB_PURCHISTA_REFETCH_MS
      : isObservatoryTable
      ? OBSERVATORY_REFETCH_MS
      : false,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(rpcName, {
        p_table_id: tableId,
        p_filters: serverFilters as unknown as never,
        p_search: search.trim() ? search.trim() : undefined,
        p_show_inactive: showInactive,
        p_limit: PAGE_SIZE * pageCount,
        p_offset: 0,
      });
      if (error) throw error;
      const rows: RowItem[] = (data ?? []).map((r: any) => ({
        id: r.out_row_id as string,
        row_number: Number(r.out_row_number),
        is_active: !!r.out_is_active,
        created_at: (r.out_created_at as string) ?? "",
        values: (r.out_values ?? {}) as Record<string, unknown>,
      }));
      const total = data && data.length ? Number((data[0] as any).total_count ?? 0) : 0;
      return { rows, total };
    },
  });

  const totalRows = rowsQuery.data?.total ?? 0;
  const loadedRows = rowsQuery.data?.rows ?? [];
  const canLoadMore = loadedRows.length < totalRows;

  // ---------- Mutations ----------
  const invalidateRows = () => {
    qc.invalidateQueries({ queryKey: ["dynamic-table-rows-v2", tableId] });
  };

  const addRowMut = useMutation({
    mutationFn: async () => {
      const payload: Record<string, string> = {};
      for (const c of columns) {
        if (c.is_computed) continue;
        const v = (values[c.column_key] ?? "").trim();
        if (v) payload[c.column_key] = v;
        else if (c.is_required) throw new Error(`مقدار ستون «${c.label}» الزامی است.`);
      }
      const { error } = await supabase.rpc("create_dynamic_table_row", {
        p_table_id: tableId, p_values: payload,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ردیف افزوده شد.");
      setAddRowOpen(false); setValues({});
      invalidateRows();
    },
    onError: (e: any) => toast.error(e?.message ?? "خطا در افزودن ردیف"),
  });

  const cellMut = useMutation({
    mutationFn: async (vars: { rowId: string; columnId: string; value: string }) => {
      const { error } = await supabase.rpc("update_dynamic_table_cell", {
        p_row_id: vars.rowId, p_column_id: vars.columnId, p_value: vars.value,
      });
      if (error) throw error;
    },
    onSuccess: () => { invalidateRows(); },
    onError: (e: any) => toast.error(e?.message ?? "خطا در ذخیره سلول"),
  });

  const toggleRowMut = useMutation({
    mutationFn: async (vars: { rowId: string; isActive: boolean }) => {
      const { error } = await supabase.rpc("set_dynamic_table_row_active", {
        p_row_id: vars.rowId, p_is_active: vars.isActive,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.isActive ? "ردیف فعال شد." : "ردیف غیرفعال شد.");
      invalidateRows();
    },
    onError: (e: any) => toast.error(e?.message ?? "خطا"),
  });

  const reorderMut = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const { error } = await supabase.rpc("reorder_dynamic_table_columns", {
        p_table_id: tableId, p_ordered_ids: orderedIds,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dynamic-table-columns", tableId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "خطا در تغییر ترتیب"),
  });

  const exportMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("export_dynamic_table_rows", {
        p_table_id: tableId,
        p_filters: serverFilters as unknown as never,
        p_search: search.trim() ? search.trim() : undefined,
        p_show_inactive: showInactive,
        p_limit: 5000,
      });
      if (error) throw error;
      const list = (data ?? []) as Array<{
        total_count: number | string;
        exported_count: number | string;
        out_row_id: string;
        out_row_number: number | string;
        out_is_active: boolean;
        out_created_at: string;
        out_values: Record<string, unknown>;
      }>;
      const total = list.length ? Number(list[0].total_count ?? 0) : 0;
      const exported = list.length ? Number(list[0].exported_count ?? 0) : 0;
      const rows: ExportRow[] = list.map((r) => ({
        row_number: Number(r.out_row_number),
        is_active: !!r.out_is_active,
        values: (r.out_values ?? {}) as Record<string, unknown>,
      }));
      const cols: ExportColumnDef[] = columns.map((c) => ({
        column_key: c.column_key,
        label: c.label,
        data_type: c.data_type,
        sort_order: c.sort_order,
      }));
      const csv = buildCsv(cols, rows);
      const filename = buildExportFilename(tableQuery.data?.slug ?? null);
      downloadCsv(filename, csv);
      return { total, exported };
    },
    onSuccess: ({ total, exported }) => {
      if (total > exported) {
        toast.warning(
          `فقط ${toFaDigits(String(exported))} ردیف از ${toFaDigits(String(total))} ردیف خروجی گرفته شد. ابتدا با فیلتر، نتایج را محدود کنید.`,
        );
      } else {
        toast.success(`خروجی CSV آماده شد (${toFaDigits(String(exported))} ردیف).`);
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "خطا در ساخت خروجی"),
  });

  const moveColumn = (idx: number, dir: -1 | 1) => {
    const arr = [...columns];
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    reorderMut.mutate(arr.map((c) => c.id));
  };

  const t = tableQuery.data;

  // ---------- Virtualizer ----------
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: loadedRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 8,
  });

  // Auto-load more when nearing the end
  useEffect(() => {
    const items = rowVirtualizer.getVirtualItems();
    if (!items.length) return;
    const last = items[items.length - 1];
    if (canLoadMore && !rowsQuery.isFetching && last.index >= loadedRows.length - 20) {
      setPageCount((p) => p + 1);
    }
  }, [rowVirtualizer.getVirtualItems(), canLoadMore, rowsQuery.isFetching, loadedRows.length]);

  // Helper: stringify a pivoted value for editor input
  const stringifyValue = (col: ColumnRow, raw: unknown): string => {
    if (raw === null || raw === undefined) return "";
    if (col.data_type === "boolean") return raw === true ? "true" : raw === false ? "false" : "";
    return String(raw);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t?.name ?? "جزئیات جدول"}
        description={t?.slug ? `شناسه: ${t.slug}` : undefined}
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to="/data-tables"><ArrowRight className="ml-2 h-4 w-4" />بازگشت</Link>
            </Button>
            {canExport && (
              <Button
                variant="outline"
                onClick={() => exportMut.mutate()}
                disabled={exportMut.isPending || !columns.length}
                title="خروجی CSV بر اساس فیلتر و جستجوی فعلی"
              >
                {exportMut.isPending ? (
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="ml-2 h-4 w-4" />
                )}
                خروجی CSV
              </Button>
            )}
            {canEditRows ? (
              <Button onClick={() => setAddRowOpen(true)} disabled={!columns.length}>
                <Plus className="ml-2 h-4 w-4" />افزودن ردیف
              </Button>
            ) : (
              <Button disabled title="شما دسترسی انجام این عملیات را ندارید">
                <Plus className="ml-2 h-4 w-4" />افزودن ردیف
              </Button>
            )}
          </div>
        }
      />

      {t && (
        <div className="flex flex-wrap items-center gap-2 -mt-2">
          {(() => {
            const lvl = ((t as { access_level?: string }).access_level ?? "all") as DynamicTableAccessLevel;
            const cls = DYNAMIC_TABLE_ACCESS_LEVEL_BADGE[lvl]?.className ?? "";
            const allowed = (((t as { allowed_roles?: unknown }).allowed_roles ?? []) as string[]) || [];
            return (
              <>
                <Badge variant="outline" className={cls}>
                  سطح دسترسی: {DYNAMIC_TABLE_ACCESS_LEVEL_LABELS[lvl] ?? lvl}
                </Badge>
                {lvl === "custom" && allowed.length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    نقش‌ها: {allowed.map((r) => SELECTABLE_ROLES.find((x) => x.value === r)?.label ?? r).join("، ")}
                  </Badge>
                )}
                {canChangeAccess && (
                  <Button size="sm" variant="ghost" onClick={() => setAccessDialogOpen(true)}>
                    <Pencil className="ml-1 h-3.5 w-3.5" /> ویرایش دسترسی
                  </Button>
                )}
              </>
            );
          })()}
        </div>
      )}

      {isTorobTable && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-3 text-xs leading-6 text-foreground/90 space-y-0.5">
            <div>• این جدول توسط API ربات به‌روزرسانی می‌شود.</div>
            <div>• ستون‌های فرمولی از قیمت‌های داخلی افراکالا محاسبه می‌شوند.</div>
            <div>• بروزرسانی نمای جدول هر ۷ ثانیه انجام می‌شود.</div>
          </CardContent>
        </Card>
      )}

      {isObservatoryTable && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 space-y-2 text-xs leading-6 text-foreground/90">
            <div className="text-sm font-semibold text-foreground">
              رصدخانه قیمت محصولات افراکالا
            </div>
            <p className="text-foreground/80">
              این جدول قیمت داخلی افراکالا را با داده‌های بازار مثل ترب و
              پورچیستا مقایسه می‌کند و به تیم فروش کمک می‌کند محصولات رقابتی‌تر
              را سریع‌تر تشخیص دهند.
            </p>
            <ul className="space-y-0.5">
              <li>• داده‌های بازار توسط ربات به‌روزرسانی می‌شوند.</li>
              <li>• ستون‌های تحلیلی هنگام نمایش محاسبه می‌شوند و دستی ذخیره نمی‌شوند.</li>
              <li>• پیام پیشنهادی فروشنده فعلاً rule-based است و AI نیست.</li>
            </ul>
            <details className="mt-1">
              <summary className="cursor-pointer text-foreground/80 hover:text-foreground">
                توضیح ستون‌های کلیدی
              </summary>
              <ul className="mt-2 space-y-1 text-foreground/75">
                <li>
                  <b>شناسه محصول افراکالا:</b> از کارت محصول داخلی می‌آید و
                  نباید توسط کاربر یا ربات تغییر کند.
                </li>
                <li>
                  <b>میانگین قیمت بازار:</b> میانگین قیمت‌های ثبت‌شده از منابع
                  بازار مانند ترب و پورچیستا است.
                </li>
                <li>
                  <b>درصد اختلاف با میانگین بازار:</b> نشان می‌دهد حداقل قیمت
                  فروش افراکالا چند درصد با میانگین بازار اختلاف دارد.
                </li>
                <li>
                  <b>وضعیت رقابتی قیمت:</b> وضعیت ساده‌شده محصول نسبت به بازار؛
                  پایین‌تر، نزدیک یا بالاتر از بازار.
                </li>
                <li>
                  <b>امتیاز فرصت فروش:</b> امتیازی بین ۰ تا ۱۰۰ برای کمک به
                  تشخیص جذابیت فروش محصول.
                </li>
                <li>
                  <b>پیام پیشنهادی فروشنده:</b> جمله آماده برای کمک به فروشنده
                  در مذاکره با مشتری. فعلاً rule-based است و AI نیست.
                </li>
              </ul>
            </details>
            <div className="pt-1 text-[11px] text-muted-foreground">
              بروزرسانی نمای جدول هر ۱۰ ثانیه انجام می‌شود.
            </div>
          </CardContent>
        </Card>
      )}

      {/* Columns management */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">ستون‌ها</h2>
            {canEdit && (
              <Button size="sm" variant="outline" onClick={() => setColumnDialog({ mode: "create" })}>
                <Plus className="ml-2 h-4 w-4" />افزودن ستون
              </Button>
            )}
          </div>
          {colsQuery.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : columns.length === 0 ? (
            <p className="text-sm text-muted-foreground">ستونی تعریف نشده است.</p>
          ) : (
            <div className="space-y-2">
              {columns.map((c, idx) => (
                <div key={c.id} className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
                  <span className="font-medium text-sm">{c.label}</span>
                  <span className="text-xs text-muted-foreground font-mono">{c.column_key}</span>
                  <Badge variant="outline">{DYNAMIC_COLUMN_DATA_TYPE_LABELS[c.data_type]}</Badge>
                  {c.is_required && <Badge variant="secondary">الزامی</Badge>}
                  {c.is_filterable && <Badge variant="secondary">فیلترپذیر</Badge>}
                  {c.is_editable_by_bot && <Badge variant="secondary">ویرایش‌پذیر ربات</Badge>}
                  {c.is_computed && (
                    <Badge
                      variant="secondary"
                      className="bg-primary/15 text-primary border-primary/30"
                      title={
                        c.formula_key
                          ? `${COMPUTED_TOOLTIP} (${FORMULA_KEY_LABELS[c.formula_key] ?? c.formula_key})`
                          : COMPUTED_TOOLTIP
                      }
                    >
                      فرمولی
                    </Badge>
                  )}
                  {canEdit && (
                    <div className="ms-auto flex items-center gap-1">
                      <Button size="icon" variant="ghost" title="بالا"
                        disabled={idx === 0 || reorderMut.isPending}
                        onClick={() => moveColumn(idx, -1)}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" title="پایین"
                        disabled={idx === columns.length - 1 || reorderMut.isPending}
                        onClick={() => moveColumn(idx, 1)}>
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" title="ویرایش"
                        onClick={() => setColumnDialog({ mode: "edit", col: c })}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Search + filters + toggles */}
      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <div className="relative flex-1">
                <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="جستجو در شماره ردیف یا متن سلول‌ها…"
                  className="pr-8 h-9"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={showInactive} onCheckedChange={setShowInactive} />
              نمایش غیرفعال‌ها
            </label>
          </div>

          <FiltersBar columns={filterableColumns} rules={rules} onChange={setRules} />

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>کل نتایج: {toFaDigits(String(totalRows))}</span>
              <span>•</span>
              <span>نمایش: {toFaDigits(String(loadedRows.length))}</span>
              {rowsQuery.isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            </div>
            {canLoadMore && (
              <Button size="sm" variant="ghost" onClick={() => setPageCount((p) => p + 1)} disabled={rowsQuery.isFetching}>
                بارگذاری بیشتر
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Rows */}
      <Card>
        <CardContent className="p-0">
          {rowsQuery.isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : loadedRows.length === 0 ? (
            <div className="py-10">
              <EmptyState icon={Inbox} title="ردیفی یافت نشد"
                description={search || serverFilters.length ? "با فیلتر یا جستجوی فعلی نتیجه‌ای نیست." : "با دکمه افزودن ردیف، اولین رکورد را وارد کنید."} />
            </div>
          ) : (
            <>
              {/* Desktop virtualized grid */}
              <div className="hidden md:block">
                <div className="px-3 pt-3 text-[11px] text-muted-foreground">
                  راهنما: با کلیدهای جهت‌دار بین سلول‌ها حرکت کنید. تایپ یا Enter برای ویرایش، Esc برای لغو، Backspace برای پاک‌کردن.
                </div>
                <VirtualizedGrid
                  scrollRef={scrollRef}
                  virtualizer={rowVirtualizer}
                  columns={columns}
                  rows={loadedRows}
                  canEdit={canEditRows}
                  canDelete={canEdit}
                  focused={focused}
                  setFocused={setFocused}
                  editingPos={editingPos}
                  setEditingPos={setEditingPos}
                  setCellRef={setCellRef}
                  focusCell={focusCell}
                  cellMut={cellMut}
                  toggleRowMut={toggleRowMut}
                  stringifyValue={stringifyValue}
                  isCellReadOnly={isObservatoryReadOnly}
                  renderCellOverride={renderObservatoryDisplay}
                />
              </div>

              {/* Mobile card view */}
              <div className="md:hidden divide-y divide-border">
                {loadedRows.map((r) => {
                  const inactive = !r.is_active;
                  return (
                    <div key={r.id} className={`p-3 space-y-2 ${inactive ? "bg-muted/30" : ""}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs">#{toFaDigits(String(r.row_number))}</span>
                          {inactive && (
                            <Badge variant="outline" className="text-[10px] gap-1">
                              <AlertTriangle className="h-3 w-3" />غیرفعال
                            </Badge>
                          )}
                        </div>
                        {canEdit && (
                          <Button size="icon" variant="ghost" title={inactive ? "فعال‌سازی" : "غیرفعال‌سازی"}
                            disabled={toggleRowMut.isPending}
                            onClick={() => toggleRowMut.mutate({ rowId: r.id, isActive: inactive })}>
                            {inactive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                          </Button>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        {columns.map((c) => (
                          <div key={c.id} className="flex items-start justify-between gap-2 text-sm">
                            <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
                              {c.label}
                              {c.is_computed && (
                                <Badge
                                  variant="secondary"
                                  className="bg-primary/15 text-primary border-primary/30 text-[10px] py-0 px-1"
                                  title={COMPUTED_TOOLTIP}
                                >
                                  فرمولی
                                </Badge>
                              )}
                            </span>
                            <div className="text-end min-w-0">
                              <CellEditor
                                column={c}
                                value={stringifyValue(c, r.values[c.column_key])}
                                canEdit={canEditRows && !c.is_computed}
                                inactive={inactive}
                                onSave={(val) => cellMut.mutateAsync({ rowId: r.id, columnId: c.id, value: val })}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{formatDateTimeFa(r.created_at)}</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Add row dialog */}
      <Dialog open={addRowOpen} onOpenChange={setAddRowOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>افزودن ردیف</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {columns.filter((c) => !c.is_computed).map((c) => (
              <div key={c.id} className="space-y-1.5">
                <Label>
                  {c.label}
                  {c.is_required && <span className="text-destructive"> *</span>}
                </Label>
                {c.data_type === "boolean" ? (
                  <Select value={values[c.column_key] ?? ""}
                    onValueChange={(v) => setValues((s) => ({ ...s, [c.column_key]: v }))}>
                    <SelectTrigger><SelectValue placeholder="انتخاب کنید" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">بله</SelectItem>
                      <SelectItem value="false">خیر</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type={c.data_type === "number" ? "number" : c.data_type === "date" ? "date" : c.data_type === "datetime" ? "datetime-local" : "text"}
                    value={values[c.column_key] ?? ""}
                    onChange={(e) => setValues((s) => ({ ...s, [c.column_key]: e.target.value }))}
                    dir={c.data_type === "phone" || c.data_type === "number" ? "ltr" : undefined}
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddRowOpen(false)}>انصراف</Button>
            <Button onClick={() => addRowMut.mutate()} disabled={addRowMut.isPending}>
              {addRowMut.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Column dialog */}
      {columnDialog && (
        <ColumnDialog
          tableId={tableId}
          mode={columnDialog.mode}
          column={columnDialog.col}
          existingKeys={columns.map((c) => c.column_key)}
          onClose={() => setColumnDialog(null)}
          onDone={() => {
            setColumnDialog(null);
            qc.invalidateQueries({ queryKey: ["dynamic-table-columns", tableId] });
          }}
        />
      )}

      {/* Access dialog (admin only) */}
      {canChangeAccess && t && (
        <AccessDialog
          open={accessDialogOpen}
          onOpenChange={setAccessDialogOpen}
          tableId={tableId}
          initialAccessLevel={(((t as { access_level?: string }).access_level ?? "all") as DynamicTableAccessLevel)}
          initialAllowedRoles={((((t as { allowed_roles?: unknown }).allowed_roles ?? []) as string[]) || [])}
          onSaved={() => {
            setAccessDialogOpen(false);
            qc.invalidateQueries({ queryKey: ["dynamic-table", tableId] });
          }}
        />
      )}
    </div>
  );
}

// =============== Virtualized Grid ===============
type NavDir = "left" | "right" | "up" | "down" | "tab-next" | "tab-prev";
const COL_W = 160;
const ROWNUM_W = 90;
const ACT_W = 60;

function VirtualizedGrid({
  scrollRef, virtualizer, columns, rows, canEdit, canDelete,
  focused, setFocused, editingPos, setEditingPos,
  setCellRef, focusCell, cellMut, toggleRowMut, stringifyValue,
  isCellReadOnly, renderCellOverride,
}: {
  scrollRef: React.MutableRefObject<HTMLDivElement | null>;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  columns: ColumnRow[];
  rows: RowItem[];
  canEdit: boolean;
  canDelete: boolean;
  focused: { row: number; col: number } | null;
  setFocused: (v: { row: number; col: number } | null) => void;
  editingPos: { row: number; col: number; initial?: string } | null;
  setEditingPos: (v: { row: number; col: number; initial?: string } | null) => void;
  setCellRef: (r: number, c: number) => (el: HTMLDivElement | null) => void;
  focusCell: (r: number, c: number) => void;
  cellMut: { mutateAsync: (v: { rowId: string; columnId: string; value: string }) => Promise<void> };
  toggleRowMut: { isPending: boolean; mutate: (v: { rowId: string; isActive: boolean }) => void };
  stringifyValue: (col: ColumnRow, raw: unknown) => string;
  isCellReadOnly?: (col: ColumnRow) => boolean;
  renderCellOverride?: (col: ColumnRow, raw: unknown) => React.ReactNode | null;
}) {
  const totalWidth = ROWNUM_W + columns.length * COL_W + 130 + ACT_W; // created col ~130
  const items = virtualizer.getVirtualItems();
  const totalHeight = virtualizer.getTotalSize();

  return (
    <div
      ref={scrollRef}
      className="relative overflow-auto"
      style={{ height: 540 }}
    >
      <div style={{ width: totalWidth, position: "relative" }}>
        {/* Header */}
        <div
          className="sticky top-0 z-20 flex bg-muted text-muted-foreground text-xs font-medium border-b border-border"
          style={{ height: 36 }}
        >
          <div className="sticky right-0 z-30 bg-muted px-3 py-2 border-l border-border" style={{ width: ROWNUM_W }}>#</div>
          {columns.map((c) => (
            <div key={c.id} className="px-3 py-2 truncate" style={{ width: COL_W }}>{c.label}</div>
          ))}
          <div className="px-3 py-2" style={{ width: 130 }}>ایجاد</div>
          {canDelete && <div className="px-3 py-2" style={{ width: ACT_W }}>—</div>}
        </div>

        {/* Body (virtualized) */}
        <div style={{ height: totalHeight, position: "relative" }}>
          {items.map((vi) => {
            const r = rows[vi.index];
            if (!r) return null;
            const inactive = !r.is_active;
            const rowIdx = vi.index;
            return (
              <div
                key={r.id}
                className={`absolute left-0 right-0 flex border-b border-border text-sm ${inactive ? "bg-muted/30 text-muted-foreground" : "bg-card"}`}
                style={{ transform: `translateY(${vi.start}px)`, height: ROW_H }}
              >
                <div
                  className={`sticky right-0 z-10 px-3 py-2 font-mono text-xs whitespace-nowrap border-l border-border ${inactive ? "bg-muted/60" : "bg-card"}`}
                  style={{ width: ROWNUM_W }}
                >
                  {toFaDigits(String(r.row_number))}
                  {inactive && <AlertTriangle className="inline h-3 w-3 ms-1" />}
                </div>
                {columns.map((c, colIdx) => {
                  const raw = r.values[c.column_key];
                  const value = stringifyValue(c, raw);
                  const isFocused = focused?.row === rowIdx && focused?.col === colIdx;
                  const isEditing = editingPos?.row === rowIdx && editingPos?.col === colIdx;
                  const cellEditable =
                    canEdit && !c.is_computed && !(isCellReadOnly?.(c) ?? false);
                  const override = renderCellOverride?.(c, raw) ?? null;
                  return (
                    <GridCell
                      key={c.id}
                      ref={setCellRef(rowIdx, colIdx)}
                      column={c}
                      value={value}
                      width={COL_W}
                      canEdit={cellEditable}
                      inactive={inactive}
                      isFocused={isFocused}
                      isEditing={isEditing}
                      initialEditValue={isEditing ? editingPos?.initial : undefined}
                      displayOverride={override}
                      onFocusCell={() => setFocused({ row: rowIdx, col: colIdx })}
                      onRequestEdit={(initial) => {
                        if (!cellEditable) return;
                        setEditingPos({ row: rowIdx, col: colIdx, initial });
                      }}
                      onClearCell={async () => {
                        if (!cellEditable || !value) return;
                        await cellMut.mutateAsync({ rowId: r.id, columnId: c.id, value: "" });
                      }}
                      onCancelEdit={() => {
                        setEditingPos(null);
                        requestAnimationFrame(() => focusCell(rowIdx, colIdx));
                      }}
                      onCommitEdit={async (val, moveDown) => {
                        try {
                          if (val !== value) {
                            await cellMut.mutateAsync({ rowId: r.id, columnId: c.id, value: val });
                          }
                          setEditingPos(null);
                          requestAnimationFrame(() => {
                            const nextRow = moveDown && rowIdx + 1 < rows.length ? rowIdx + 1 : rowIdx;
                            focusCell(nextRow, colIdx);
                          });
                        } catch { /* toast handled */ }
                      }}
                      onNavigate={(dir) => {
                        const total = rows.length;
                        const cols = columns.length;
                        let nr = rowIdx, nc = colIdx;
                        if (dir === "right") nc = Math.min(cols - 1, colIdx + 1);
                        else if (dir === "left") nc = Math.max(0, colIdx - 1);
                        else if (dir === "down") nr = Math.min(total - 1, rowIdx + 1);
                        else if (dir === "up") nr = Math.max(0, rowIdx - 1);
                        else if (dir === "tab-next") {
                          if (colIdx + 1 < cols) nc = colIdx + 1;
                          else if (rowIdx + 1 < total) { nr = rowIdx + 1; nc = 0; }
                        } else if (dir === "tab-prev") {
                          if (colIdx - 1 >= 0) nc = colIdx - 1;
                          else if (rowIdx - 1 >= 0) { nr = rowIdx - 1; nc = cols - 1; }
                        }
                        if (nr !== rowIdx || nc !== colIdx) {
                          // ensure target row is rendered: scroll into view
                          virtualizer.scrollToIndex(nr, { align: "auto" });
                          requestAnimationFrame(() => focusCell(nr, nc));
                        }
                      }}
                    />
                  );
                })}
                <div className="px-3 py-2 text-xs whitespace-nowrap" style={{ width: 130 }}>
                  {formatDateTimeFa(r.created_at)}
                </div>
                {canDelete && (
                  <div className="px-1 py-1 flex items-center" style={{ width: ACT_W }}>
                    <Button size="icon" variant="ghost" title={inactive ? "فعال‌سازی" : "غیرفعال‌سازی"}
                      disabled={toggleRowMut.isPending}
                      onClick={() => toggleRowMut.mutate({ rowId: r.id, isActive: inactive })}>
                      {inactive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// =============== Spreadsheet grid cell (desktop, keyboard-driven) ===============
const GridCell = forwardRef<HTMLDivElement, {
  column: ColumnRow;
  value: string;
  width: number;
  canEdit: boolean;
  inactive: boolean;
  isFocused: boolean;
  isEditing: boolean;
  initialEditValue?: string;
  onFocusCell: () => void;
  onRequestEdit: (initial?: string) => void;
  onClearCell: () => Promise<void> | void;
  onCancelEdit: () => void;
  onCommitEdit: (value: string, moveDown: boolean) => Promise<void> | void;
  onNavigate: (dir: NavDir) => void;
}>(function GridCell(props, ref) {
  const {
    column, value, width, canEdit, inactive, isFocused, isEditing, initialEditValue,
    onFocusCell, onRequestEdit, onClearCell, onCancelEdit, onCommitEdit, onNavigate,
  } = props;

  const display = useMemo(() => {
    if (!value) return <span className="text-muted-foreground">—</span>;
    if (column.data_type === "boolean") return value === "true" ? "بله" : value === "false" ? "خیر" : "—";
    if (column.data_type === "datetime") return formatDateTimeFa(value);
    if (column.data_type === "date") return formatDateFa(value);
    if (column.data_type === "number") {
      const n = Number(value);
      return Number.isFinite(n) ? formatNumber(n) : value;
    }
    if (column.data_type === "phone") return <span dir="ltr">{toFaDigits(value)}</span>;
    return value;
  }, [value, column.data_type]);

  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (isEditing) return;
    const k = e.key;
    if (k === "ArrowRight") { e.preventDefault(); onNavigate("right"); return; }
    if (k === "ArrowLeft")  { e.preventDefault(); onNavigate("left"); return; }
    if (k === "ArrowUp")    { e.preventDefault(); onNavigate("up"); return; }
    if (k === "ArrowDown")  { e.preventDefault(); onNavigate("down"); return; }
    if (k === "Tab") { e.preventDefault(); onNavigate(e.shiftKey ? "tab-prev" : "tab-next"); return; }
    if (!canEdit) return;
    if (k === "Enter") { e.preventDefault(); onRequestEdit(); return; }
    if (k === "Backspace" || k === "Delete") { e.preventDefault(); void onClearCell(); return; }
    if (k === " " && column.data_type === "boolean") {
      e.preventDefault();
      const next = value === "true" ? "false" : value === "false" ? "" : "true";
      void onCommitEdit(next, false);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k.length !== 1) return;
    if (column.data_type === "boolean") return;
    if (column.data_type === "number" && !/[\d\-.,]/.test(k)) return;
    e.preventDefault();
    onRequestEdit(k);
  };

  const focusedClass = isFocused ? "outline outline-2 outline-primary outline-offset-[-2px] bg-primary/5" : "";
  const computed = column.is_computed;
  const titleText = computed
    ? "این مقدار توسط فرمول سیستم محاسبه می‌شود."
    : canEdit
    ? "Enter یا تایپ برای ویرایش، فلش‌ها برای حرکت"
    : undefined;
  return (
    <div
      ref={ref}
      tabIndex={0}
      role="gridcell"
      aria-readonly={!canEdit}
      onFocus={onFocusCell}
      onDoubleClick={() => canEdit && onRequestEdit()}
      onKeyDown={handleKey}
      className={`px-3 py-2 align-middle truncate focus:outline-none ${focusedClass} ${canEdit ? "cursor-text" : "cursor-default"} ${computed ? "bg-primary/5" : ""}`}
      style={{ width }}
      title={titleText}
    >
      {isEditing ? (
        <CellEditorInput
          column={column}
          initialValue={initialEditValue !== undefined ? initialEditValue : value}
          onCancel={onCancelEdit}
          onCommit={onCommitEdit}
        />
      ) : display}
    </div>
  );
});

function CellEditorInput({
  column, initialValue, onCancel, onCommit,
}: {
  column: ColumnRow;
  initialValue: string;
  onCancel: () => void;
  onCommit: (value: string, moveDown: boolean) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const el = inputRef.current;
    if (el && (el.type === "text" || el.type === "number")) {
      try { el.setSelectionRange(el.value.length, el.value.length); } catch { /* */ }
    }
  }, []);

  const commit = async (moveDown: boolean) => {
    if (saving) return;
    setSaving(true);
    try { await onCommit(draft, moveDown); } finally { setSaving(false); }
  };

  if (column.data_type === "boolean") {
    return (
      <div className="flex items-center gap-1">
        <Select value={draft || "__empty__"} onValueChange={(v) => setDraft(v === "__empty__" ? "" : v)}>
          <SelectTrigger className="h-7 w-24 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__empty__">—</SelectItem>
            <SelectItem value="true">بله</SelectItem>
            <SelectItem value="false">خیر</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="ghost" disabled={saving} onClick={() => commit(false)}>ذخیره</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>لغو</Button>
      </div>
    );
  }

  return (
    <Input
      ref={inputRef}
      className="h-7 w-full text-sm"
      type={column.data_type === "number" ? "number" : column.data_type === "date" ? "date" : column.data_type === "datetime" ? "datetime-local" : "text"}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { void commit(false); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); void commit(!e.ctrlKey && !e.metaKey); }
        else if (e.key === "Escape") { e.preventDefault(); onCancel(); }
      }}
      dir={column.data_type === "phone" || column.data_type === "number" ? "ltr" : undefined}
      disabled={saving}
    />
  );
}

// =============== Inline cell editor (mobile card view) ===============
function CellEditor({
  column, value, canEdit, inactive, onSave,
}: {
  column: ColumnRow;
  value: string;
  canEdit: boolean;
  inactive?: boolean;
  onSave: (val: string) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const display = useMemo(() => {
    if (!value) return <span className="text-muted-foreground">—</span>;
    if (column.data_type === "boolean") return value === "true" ? "بله" : value === "false" ? "خیر" : "—";
    if (column.data_type === "datetime") return formatDateTimeFa(value);
    if (column.data_type === "date") return formatDateFa(value);
    if (column.data_type === "number") {
      const n = Number(value);
      return Number.isFinite(n) ? formatNumber(n) : value;
    }
    if (column.data_type === "phone") return <span dir="ltr">{toFaDigits(value)}</span>;
    return value;
  }, [value, column.data_type]);

  if (!editing) {
    return (
      <div
        className={canEdit ? "cursor-pointer hover:bg-muted/40 rounded px-1 py-0.5 -mx-1" : ""}
        onDoubleClick={() => { if (canEdit) setEditing(true); }}
        title={canEdit ? (inactive ? "ردیف غیرفعال — قابل ویرایش" : "دابل‌کلیک برای ویرایش") : undefined}
      >
        {display}
      </div>
    );
  }

  const commit = async () => {
    if (draft === value) { setEditing(false); return; }
    setSaving(true);
    try { await onSave(draft); setEditing(false); }
    catch { /* */ } finally { setSaving(false); }
  };
  const cancel = () => { setDraft(value); setEditing(false); };

  if (column.data_type === "boolean") {
    return (
      <div className="flex items-center gap-1">
        <Select value={draft || "__empty__"} onValueChange={(v) => setDraft(v === "__empty__" ? "" : v)}>
          <SelectTrigger className="h-8 w-28"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__empty__">—</SelectItem>
            <SelectItem value="true">بله</SelectItem>
            <SelectItem value="false">خیر</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="ghost" disabled={saving} onClick={commit}>ذخیره</Button>
        <Button size="sm" variant="ghost" onClick={cancel}>لغو</Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        ref={inputRef}
        className="h-8 w-40"
        type={column.data_type === "number" ? "number" : column.data_type === "date" ? "date" : column.data_type === "datetime" ? "datetime-local" : "text"}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); else if (e.key === "Escape") cancel(); }}
        dir={column.data_type === "phone" || column.data_type === "number" ? "ltr" : undefined}
        disabled={saving}
      />
      {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
    </div>
  );
}

// =============== Column add/edit dialog ===============
function ColumnDialog({
  tableId, mode, column, existingKeys, onClose, onDone,
}: {
  tableId: string;
  mode: "create" | "edit";
  column?: ColumnRow;
  existingKeys: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [label, setLabel] = useState(column?.label ?? "");
  const [columnKey, setColumnKey] = useState(column?.column_key ?? "");
  const [dataType, setDataType] = useState<DynamicColumnDataType>(column?.data_type ?? "text");
  const [isRequired, setIsRequired] = useState(column?.is_required ?? false);
  const [isFilterable, setIsFilterable] = useState(column?.is_filterable ?? false);
  const [isEditableByBot, setIsEditableByBot] = useState(column?.is_editable_by_bot ?? false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!label.trim()) { toast.error("برچسب الزامی است."); return; }
    setBusy(true);
    try {
      if (mode === "create") {
        if (!COLUMN_KEY_REGEX.test(columnKey)) { toast.error("کلید ستون باید حروف کوچک، عدد و _ باشد."); return; }
        if (existingKeys.includes(columnKey)) { toast.error("این کلید قبلاً استفاده شده."); return; }
        const { error } = await supabase.rpc("add_dynamic_table_column", {
          p_table_id: tableId,
          p_column_key: columnKey,
          p_label: label.trim(),
          p_data_type: dataType,
          p_is_required: isRequired,
          p_is_filterable: isFilterable,
          p_is_editable_by_bot: isEditableByBot,
        });
        if (error) throw error;
        toast.success("ستون افزوده شد.");
      } else if (column) {
        const { error } = await supabase.rpc("update_dynamic_table_column", {
          p_column_id: column.id,
          p_label: label.trim(),
          p_is_required: isRequired,
          p_is_filterable: isFilterable,
          p_is_editable_by_bot: isEditableByBot,
        });
        if (error) throw error;
        toast.success("ستون به‌روزرسانی شد.");
      }
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "خطا");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "افزودن ستون" : "ویرایش ستون"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>برچسب</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          {mode === "create" ? (
            <>
              <div className="space-y-1.5">
                <Label>کلید ستون (column_key)</Label>
                <Input value={columnKey} onChange={(e) => setColumnKey(e.target.value)}
                  dir="ltr" placeholder="مثال: customer_phone" />
                <p className="text-xs text-muted-foreground">فقط حروف کوچک، عدد و _ — بعد از ساخت قابل تغییر نیست.</p>
              </div>
              <div className="space-y-1.5">
                <Label>نوع داده</Label>
                <Select value={dataType} onValueChange={(v) => setDataType(v as DynamicColumnDataType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DYNAMIC_COLUMN_DATA_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{DYNAMIC_COLUMN_DATA_TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">بعد از ساخت قابل تغییر نیست.</p>
              </div>
            </>
          ) : (
            <div className="rounded-md border border-border bg-muted/30 p-2 text-xs space-y-1">
              <div>کلید: <span className="font-mono">{column?.column_key}</span></div>
              <div>نوع: {column ? DYNAMIC_COLUMN_DATA_TYPE_LABELS[column.data_type] : ""}</div>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-border pt-3">
            <Label>الزامی</Label>
            <Switch checked={isRequired} onCheckedChange={setIsRequired} />
          </div>
          <div className="flex items-center justify-between">
            <Label>فیلترپذیر</Label>
            <Switch checked={isFilterable} onCheckedChange={setIsFilterable} />
          </div>
          <div className="flex items-center justify-between">
            <Label>ویرایش‌پذیر توسط ربات</Label>
            <Switch checked={isEditableByBot} onCheckedChange={setIsEditableByBot} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>انصراف</Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            ذخیره
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============== Access Dialog (admin only) ===============
function AccessDialog({
  open, onOpenChange, tableId, initialAccessLevel, initialAllowedRoles, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tableId: string;
  initialAccessLevel: DynamicTableAccessLevel;
  initialAllowedRoles: string[];
  onSaved: () => void;
}) {
  const [accessLevel, setAccessLevel] = useState<DynamicTableAccessLevel>(initialAccessLevel);
  const [allowedRoles, setAllowedRoles] = useState<string[]>(initialAllowedRoles);

  useEffect(() => {
    if (open) {
      setAccessLevel(initialAccessLevel);
      setAllowedRoles(initialAllowedRoles);
    }
  }, [open, initialAccessLevel, initialAllowedRoles]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (accessLevel === "custom" && allowedRoles.length === 0) {
        throw new Error("برای دسترسی سفارشی، حداقل یک نقش انتخاب کنید.");
      }
      const { error } = await supabase
        .from("dynamic_tables")
        .update({
          access_level: accessLevel,
          allowed_roles: accessLevel === "custom" ? allowedRoles : [],
        } as never)
        .eq("id", tableId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("سطح دسترسی به‌روزرسانی شد.");
      onSaved();
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "خطا در ذخیره‌سازی";
      toast.error(msg);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>ویرایش سطح دسترسی جدول</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>سطح دسترسی</Label>
            <Select value={accessLevel} onValueChange={(v) => setAccessLevel(v as DynamicTableAccessLevel)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DYNAMIC_TABLE_ACCESS_LEVELS.map((lvl) => (
                  <SelectItem key={lvl} value={lvl}>{DYNAMIC_TABLE_ACCESS_LEVEL_LABELS[lvl]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {accessLevel === "custom" && (
            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
              <Label className="text-xs">نقش‌های مجاز</Label>
              <div className="grid grid-cols-2 gap-2">
                {SELECTABLE_ROLES.map((r) => (
                  <label key={r.value} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={allowedRoles.includes(r.value)}
                      onCheckedChange={(v) =>
                        setAllowedRoles((prev) =>
                          v ? Array.from(new Set([...prev, r.value])) : prev.filter((x) => x !== r.value),
                        )
                      }
                    />
                    {r.label}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                مدیر کل و مدیر همیشه دسترسی دارند.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>انصراف</Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            ذخیره
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
