import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Plus, Loader2, ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { requirePermission } from "@/lib/rbac/route-guards";
import { useAuth } from "@/lib/auth/AuthProvider";
import { toFaDigits, formatDateTimeFa } from "@/lib/i18n/formatters";
import {
  DYNAMIC_COLUMN_DATA_TYPE_LABELS, DYNAMIC_TABLE_ROWS_PAGE_SIZE,
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

function DataTableDetailPage() {
  const { tableId } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});

  const tableQuery = useQuery({
    enabled: !!user && !!tableId,
    queryKey: ["dynamic-table", tableId],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dynamic_tables")
        .select("id, name, slug, description, is_active, created_at")
        .eq("id", tableId)
        .maybeSingle();
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
    queryKey: ["dynamic-table-rows", tableId, page],
    staleTime: 30_000,
    queryFn: async () => {
      const from = (page - 1) * DYNAMIC_TABLE_ROWS_PAGE_SIZE;
      const to = from + DYNAMIC_TABLE_ROWS_PAGE_SIZE - 1;

      const head = await supabase
        .from("dynamic_table_rows")
        .select("id", { count: "exact", head: true })
        .eq("table_id", tableId)
        .eq("is_active", true);
      if (head.error) throw head.error;
      const total = head.count ?? 0;

      const { data: rows, error: e1 } = await supabase
        .from("dynamic_table_rows")
        .select("id, row_number, created_at")
        .eq("table_id", tableId)
        .eq("is_active", true)
        .order("row_number", { ascending: true })
        .range(from, to);
      if (e1) throw e1;
      const rowIds = (rows ?? []).map((r) => r.id as string);

      let cellsByRow: Record<string, Record<string, string>> = {};
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
          else if (t === "boolean") v = c.value_boolean === true ? "بله" : c.value_boolean === false ? "خیر" : "";
          else if (t === "date") v = c.value_date ?? "";
          else if (t === "datetime") v = c.value_datetime ?? "";
          else v = c.value_text ?? "";
          if (!cellsByRow[rid]) cellsByRow[rid] = {};
          cellsByRow[rid][cid] = String(v);
        }
      }

      return { rows: rows ?? [], cellsByRow, total };
    },
  });

  const totalPages = Math.max(1, Math.ceil((rowsQuery.data?.total ?? 0) / DYNAMIC_TABLE_ROWS_PAGE_SIZE));

  const addMut = useMutation({
    mutationFn: async () => {
      const payload: Record<string, string> = {};
      for (const c of columns) {
        const v = (values[c.column_key] ?? "").trim();
        if (v) payload[c.column_key] = v;
        else if (c.is_required) throw new Error(`مقدار ستون «${c.label}» الزامی است.`);
      }
      const { error } = await supabase.rpc("create_dynamic_table_row", {
        p_table_id: tableId,
        p_values: payload,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ردیف افزوده شد.");
      setAddOpen(false);
      setValues({});
      qc.invalidateQueries({ queryKey: ["dynamic-table-rows", tableId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "خطا در افزودن ردیف"),
  });

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
            <Button onClick={() => setAddOpen(true)} disabled={!columns.length}>
              <Plus className="ml-2 h-4 w-4" />افزودن ردیف
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="p-4">
          <h2 className="font-semibold mb-3">ستون‌ها</h2>
          {colsQuery.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : columns.length === 0 ? (
            <p className="text-sm text-muted-foreground">ستونی تعریف نشده است.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {columns.map((c) => (
                <div key={c.id} className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5">
                  <span className="font-medium text-sm">{c.label}</span>
                  <span className="text-xs text-muted-foreground font-mono">{c.column_key}</span>
                  <Badge variant="outline">{DYNAMIC_COLUMN_DATA_TYPE_LABELS[c.data_type]}</Badge>
                  {c.is_filterable && <Badge variant="secondary">فیلترپذیر</Badge>}
                  {c.is_editable_by_bot && <Badge variant="secondary">ویرایش‌پذیر ربات</Badge>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
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
                  </tr>
                </thead>
                <tbody>
                  {rowsQuery.data!.rows.map((r) => (
                    <tr key={r.id as string} className="border-t border-border">
                      <td className="px-3 py-2 font-mono text-xs">{toFaDigits(String(r.row_number))}</td>
                      {columns.map((c) => (
                        <td key={c.id} className="px-3 py-2">
                          {rowsQuery.data!.cellsByRow[r.id as string]?.[c.id] ?? <span className="text-muted-foreground">—</span>}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-xs text-muted-foreground">{formatDateTimeFa(r.created_at as string)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-border p-3">
            <span className="text-xs text-muted-foreground">
              مجموع: {toFaDigits(String(rowsQuery.data?.total ?? 0))}
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="text-xs">{toFaDigits(String(page))} / {toFaDigits(String(totalPages))}</span>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
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
                  <Select
                    value={values[c.column_key] ?? ""}
                    onValueChange={(v) => setValues((s) => ({ ...s, [c.column_key]: v }))}
                  >
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
            <Button variant="outline" onClick={() => setAddOpen(false)}>انصراف</Button>
            <Button onClick={() => addMut.mutate()} disabled={addMut.isPending}>
              {addMut.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
