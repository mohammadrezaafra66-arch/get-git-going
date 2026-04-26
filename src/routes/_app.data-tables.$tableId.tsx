import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRight, Plus, Loader2, ChevronLeft, ChevronRight, Inbox,
  Pencil, ArrowUp, ArrowDown, Eye, EyeOff,
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
import { useUserRoles } from "@/lib/rbac/useUserRoles";
import { toFaDigits, formatDateTimeFa } from "@/lib/i18n/formatters";
import {
  DYNAMIC_COLUMN_DATA_TYPES, DYNAMIC_COLUMN_DATA_TYPE_LABELS,
  DYNAMIC_TABLE_ROWS_PAGE_SIZE, COLUMN_KEY_REGEX,
  type DynamicColumnDataType,
} from "@/lib/data-tables/constants";

export const Route = createFileRoute("/_app/data-tables/$tableId")({
  beforeLoad: async () => { await requirePermission("data-tables", "view"); },
  component: DataTableDetailPage,
});

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
}

interface RowItem {
  id: string;
  row_number: number | string;
  created_at: string;
  is_active: boolean;
}

function DataTableDetailPage() {
  const { tableId } = Route.useParams();
  const { user } = useAuth();
  const { roles } = useUserRoles();
  const canEdit = roles.includes("admin") || roles.includes("manager");
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [showInactive, setShowInactive] = useState(false);
  const [addRowOpen, setAddRowOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [columnDialog, setColumnDialog] = useState<{ mode: "create" | "edit"; col?: ColumnRow } | null>(null);

  const tableQuery = useQuery({
    enabled: !!user && !!tableId,
    queryKey: ["dynamic-table", tableId],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dynamic_tables")
        .select("id, name, slug, description, is_active, created_at")
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
        .select("id, table_id, column_key, label, data_type, is_required, is_filterable, is_editable_by_bot, sort_order")
        .eq("table_id", tableId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ColumnRow[];
    },
  });
  const columns = colsQuery.data ?? [];

  const rowsQuery = useQuery({
    enabled: !!user && !!tableId,
    queryKey: ["dynamic-table-rows", tableId, page, showInactive],
    staleTime: 15_000,
    queryFn: async () => {
      const from = (page - 1) * DYNAMIC_TABLE_ROWS_PAGE_SIZE;
      const to = from + DYNAMIC_TABLE_ROWS_PAGE_SIZE - 1;

      let headQ = supabase
        .from("dynamic_table_rows")
        .select("id", { count: "exact", head: true })
        .eq("table_id", tableId);
      if (!showInactive) headQ = headQ.eq("is_active", true);
      const head = await headQ;
      if (head.error) throw head.error;
      const total = head.count ?? 0;

      let listQ = supabase
        .from("dynamic_table_rows")
        .select("id, row_number, created_at, is_active")
        .eq("table_id", tableId)
        .order("row_number", { ascending: true })
        .range(from, to);
      if (!showInactive) listQ = listQ.eq("is_active", true);
      const { data: rows, error: e1 } = await listQ;
      if (e1) throw e1;
      const rowIds = (rows ?? []).map((r) => r.id as string);

      const cellsByRow: Record<string, Record<string, string>> = {};
      if (rowIds.length) {
        const { data: cells, error: e2 } = await supabase
          .from("dynamic_table_cells")
          .select("row_id, column_id, value_text, value_number, value_boolean, value_date, value_datetime")
          .in("row_id", rowIds);
        if (e2) throw e2;
        const colTypes: Record<string, DynamicColumnDataType> = {};
        for (const c of columns) colTypes[c.id] = c.data_type;
        for (const c of cells ?? []) {
          const rid = c.row_id as string;
          const cid = c.column_id as string;
          const t = colTypes[cid];
          let v: any = "";
          if (t === "number") v = c.value_number ?? "";
          else if (t === "boolean") v = c.value_boolean === true ? "true" : c.value_boolean === false ? "false" : "";
          else if (t === "date") v = c.value_date ?? "";
          else if (t === "datetime") v = c.value_datetime ?? "";
          else v = c.value_text ?? "";
          if (!cellsByRow[rid]) cellsByRow[rid] = {};
          cellsByRow[rid][cid] = String(v);
        }
      }

      return { rows: (rows ?? []) as unknown as RowItem[], cellsByRow, total };
    },
  });

  const totalPages = Math.max(1, Math.ceil((rowsQuery.data?.total ?? 0) / DYNAMIC_TABLE_ROWS_PAGE_SIZE));

  // ---------- Mutations ----------
  const addRowMut = useMutation({
    mutationFn: async () => {
      const payload: Record<string, string> = {};
      for (const c of columns) {
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
      qc.invalidateQueries({ queryKey: ["dynamic-table-rows", tableId] });
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
    onSuccess: () => {
      toast.success("سلول به‌روزرسانی شد.");
      qc.invalidateQueries({ queryKey: ["dynamic-table-rows", tableId] });
    },
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
      qc.invalidateQueries({ queryKey: ["dynamic-table-rows", tableId] });
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

  const moveColumn = (idx: number, dir: -1 | 1) => {
    const arr = [...columns];
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    reorderMut.mutate(arr.map((c) => c.id));
  };

  const t = tableQuery.data;

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
            <Button onClick={() => setAddRowOpen(true)} disabled={!columns.length}>
              <Plus className="ml-2 h-4 w-4" />افزودن ردیف
            </Button>
          </div>
        }
      />

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

      {/* Rows */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border p-3">
            <span className="text-xs text-muted-foreground">
              مجموع: {toFaDigits(String(rowsQuery.data?.total ?? 0))}
            </span>
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={showInactive} onCheckedChange={(v) => { setShowInactive(v); setPage(1); }} />
              نمایش غیرفعال‌ها
            </label>
          </div>

          {rowsQuery.isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (rowsQuery.data?.rows ?? []).length === 0 ? (
            <div className="py-10">
              <EmptyState icon={Inbox} title="ردیفی ثبت نشده" description="با دکمه افزودن ردیف، اولین رکورد را وارد کنید." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-right font-medium">#</th>
                    {columns.map((c) => (
                      <th key={c.id} className="px-3 py-2 text-right font-medium">{c.label}</th>
                    ))}
                    <th className="px-3 py-2 text-right font-medium">ایجاد</th>
                    {canEdit && <th className="px-3 py-2 text-right font-medium">عملیات</th>}
                  </tr>
                </thead>
                <tbody>
                  {rowsQuery.data!.rows.map((r) => {
                    const inactive = !r.is_active;
                    return (
                      <tr key={r.id} className={`border-t border-border ${inactive ? "bg-muted/30 text-muted-foreground" : ""}`}>
                        <td className="px-3 py-2 font-mono text-xs">{toFaDigits(String(r.row_number))}</td>
                        {columns.map((c) => (
                          <td key={c.id} className="px-3 py-2">
                            <CellEditor
                              column={c}
                              rowId={r.id}
                              value={rowsQuery.data!.cellsByRow[r.id]?.[c.id] ?? ""}
                              canEdit={canEdit && !inactive}
                              onSave={(val) => cellMut.mutateAsync({ rowId: r.id, columnId: c.id, value: val })}
                            />
                          </td>
                        ))}
                        <td className="px-3 py-2 text-xs">{formatDateTimeFa(r.created_at)}</td>
                        {canEdit && (
                          <td className="px-3 py-2">
                            <Button size="icon" variant="ghost" title={inactive ? "فعال‌سازی" : "غیرفعال‌سازی"}
                              disabled={toggleRowMut.isPending}
                              onClick={() => toggleRowMut.mutate({ rowId: r.id, isActive: inactive })}>
                              {inactive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                            </Button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-end border-t border-border p-3 gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="text-xs">{toFaDigits(String(page))} / {toFaDigits(String(totalPages))}</span>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Add row dialog */}
      <Dialog open={addRowOpen} onOpenChange={setAddRowOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>افزودن ردیف</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {columns.map((c) => (
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
    </div>
  );
}

// =============== Inline cell editor ===============
function CellEditor({
  column, rowId, value, canEdit, onSave,
}: {
  column: ColumnRow;
  rowId: string;
  value: string;
  canEdit: boolean;
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
    if (column.data_type === "boolean") return value === "true" ? "بله" : "خیر";
    if (column.data_type === "datetime" || column.data_type === "date") return formatDateTimeFa(value);
    return value;
  }, [value, column.data_type]);

  if (!editing) {
    return (
      <div
        className={canEdit ? "cursor-pointer hover:bg-muted/40 rounded px-1 py-0.5 -mx-1" : ""}
        onDoubleClick={() => canEdit && setEditing(true)}
        title={canEdit ? "دابل‌کلیک برای ویرایش" : undefined}
      >
        {display}
      </div>
    );
  }

  const commit = async () => {
    if (draft === value) { setEditing(false); return; }
    setSaving(true);
    try { await onSave(draft); setEditing(false); }
    catch { /* toast handled by mutation */ }
    finally { setSaving(false); }
  };
  const cancel = () => { setDraft(value); setEditing(false); };

  if (column.data_type === "boolean") {
    return (
      <div className="flex items-center gap-1">
        <Select value={draft} onValueChange={setDraft}>
          <SelectTrigger className="h-8 w-28"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
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
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          else if (e.key === "Escape") cancel();
        }}
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
