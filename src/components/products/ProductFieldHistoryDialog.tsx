import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, Loader2, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { FIELD_LABELS, type ProductAuditDiff } from "@/lib/products/audit";
import { formatDateTimeFa } from "@/lib/i18n/formatters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

/**
 * مورد ۱۳۲.۲ — تاریخچهٔ دقیق فیلدی محصول.
 *
 * رکوردهای `audit_logs` محصول را می‌خواند، همهٔ تغییرات را flatten می‌کند و هر
 * تغییر را به‌صورت یک ردیف نشان می‌دهد. با کلیک روی نام فیلد، فقط تاریخچهٔ همان
 * فیلد فیلتر می‌شود (تجربهٔ مشابه تاریخچهٔ سلول در Google Sheets).
 */

type ChangeKind = "field" | "label" | "attribute";

const KIND_LABELS: Record<ChangeKind, string> = {
  field: "فیلد",
  label: "برچسب",
  attribute: "ویژگی",
};

interface FlatChange {
  id: string;
  fieldKey: string;
  fieldLabel: string;
  from: string | null;
  to: string | null;
  kind: ChangeKind;
  actorName: string;
  createdAt: string;
}

const ALL = "__all";

interface AuditRow {
  id: string | number;
  actor_id: string | null;
  diff: unknown;
  created_at: string;
}

/** یک رکورد audit را به صفر یا چند ردیف تغییر تبدیل می‌کند. */
function flattenAuditRow(row: AuditRow, actorName: string): FlatChange[] {
  const diff = (row.diff ?? {}) as ProductAuditDiff;
  const out: FlatChange[] = [];
  const base = { actorName, createdAt: row.created_at };

  for (const [key, c] of Object.entries(diff.changes ?? {})) {
    if (!c) continue;
    out.push({
      ...base,
      id: `${row.id}:f:${key}`,
      fieldKey: key,
      fieldLabel: c.label ?? FIELD_LABELS[key] ?? key,
      from: c.from ?? null,
      to: c.to ?? null,
      kind: "field",
    });
  }

  for (const l of diff.labels?.added ?? []) {
    out.push({
      ...base,
      id: `${row.id}:la:${l.id}`,
      fieldKey: `label:${l.id}`,
      fieldLabel: "برچسب",
      from: null,
      to: l.title,
      kind: "label",
    });
  }
  for (const l of diff.labels?.removed ?? []) {
    out.push({
      ...base,
      id: `${row.id}:lr:${l.id}`,
      fieldKey: `label:${l.id}`,
      fieldLabel: "برچسب",
      from: l.title,
      to: null,
      kind: "label",
    });
  }

  for (const [key, c] of Object.entries(diff.attributes ?? {})) {
    if (!c) continue;
    out.push({
      ...base,
      id: `${row.id}:a:${key}`,
      fieldKey: `attr:${key}`,
      fieldLabel: c.label ?? key,
      from: c.from ?? null,
      to: c.to ?? null,
      kind: "attribute",
    });
  }

  return out;
}

export function ProductFieldHistoryDialog({
  productId,
  open,
  onOpenChange,
}: {
  productId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [fieldFilter, setFieldFilter] = useState<string>(ALL);
  const [actorFilter, setActorFilter] = useState<string>(ALL);
  const [kindFilter, setKindFilter] = useState<string>(ALL);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["product-field-history", productId],
    enabled: open,
    queryFn: async (): Promise<{ changes: FlatChange[]; emptyDiffCount: number }> => {
      const { data: logs, error } = await supabase
        .from("audit_logs")
        .select("id, actor_id, diff, created_at")
        .eq("entity_type", "product")
        .eq("entity_id", productId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;

      const rows = (logs ?? []) as unknown as AuditRow[];
      const actorIds = Array.from(new Set(rows.map((l) => l.actor_id).filter(Boolean))) as string[];

      let profiles: { id: string; full_name: string | null }[] = [];
      if (actorIds.length > 0) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", actorIds);
        profiles = prof ?? [];
      }
      const nameMap = new Map(profiles.map((p) => [p.id, p.full_name ?? "—"]));

      const changes: FlatChange[] = [];
      let emptyDiffCount = 0;
      for (const row of rows) {
        const flat = flattenAuditRow(row, nameMap.get(row.actor_id ?? "") ?? "—");
        // رکوردهای قدیمی ممکن است diff ناقص یا خالی داشته باشند — نباید crash کند.
        if (flat.length === 0) emptyDiffCount += 1;
        else changes.push(...flat);
      }
      return { changes, emptyDiffCount };
    },
  });

  const allChanges = data?.changes ?? [];

  const fieldOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of allChanges) map.set(c.fieldKey, c.fieldLabel);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "fa"));
  }, [allChanges]);

  const actorOptions = useMemo(
    () => [...new Set(allChanges.map((c) => c.actorName))].sort((a, b) => a.localeCompare(b, "fa")),
    [allChanges],
  );

  const filtered = useMemo(() => {
    return allChanges.filter((c) => {
      if (fieldFilter !== ALL && c.fieldKey !== fieldFilter) return false;
      if (actorFilter !== ALL && c.actorName !== actorFilter) return false;
      if (kindFilter !== ALL && c.kind !== kindFilter) return false;
      if (fromDate && c.createdAt.slice(0, 10) < fromDate) return false;
      if (toDate && c.createdAt.slice(0, 10) > toDate) return false;
      return true;
    });
  }, [allChanges, fieldFilter, actorFilter, kindFilter, fromDate, toDate]);

  const hasActiveFilter =
    fieldFilter !== ALL || actorFilter !== ALL || kindFilter !== ALL || fromDate || toDate;

  const resetFilters = () => {
    setFieldFilter(ALL);
    setActorFilter(ALL);
    setKindFilter(ALL);
    setFromDate("");
    setToDate("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            تاریخچه دقیق تغییرات
          </DialogTitle>
          <DialogDescription>
            هر تغییر به‌صورت یک ردیف. برای دیدن تاریخچهٔ یک فیلد خاص، روی نام آن کلیک کنید.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[10rem] flex-1 space-y-1">
            <label className="text-xs text-muted-foreground">فیلد</label>
            <Select value={fieldFilter} onValueChange={setFieldFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>همهٔ فیلدها</SelectItem>
                {fieldOptions.map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[9rem] flex-1 space-y-1">
            <label className="text-xs text-muted-foreground">ویرایش‌کننده</label>
            <Select value={actorFilter} onValueChange={setActorFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>همه</SelectItem>
                {actorOptions.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[8rem] flex-1 space-y-1">
            <label className="text-xs text-muted-foreground">نوع تغییر</label>
            <Select value={kindFilter} onValueChange={setKindFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>همه</SelectItem>
                {(Object.keys(KIND_LABELS) as ChangeKind[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">از تاریخ</label>
            <Input
              type="date"
              dir="ltr"
              className="w-36"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">تا تاریخ</label>
            <Input
              type="date"
              dir="ltr"
              className="w-36"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>

          {hasActiveFilter && (
            <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
              <X className="ms-1 h-3.5 w-3.5" />
              حذف فیلترها
            </Button>
          )}
        </div>

        <div className="max-h-[55vh] overflow-auto rounded-md border">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              در حال بارگذاری...
            </div>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {allChanges.length === 0
                ? "تغییری ثبت نشده است."
                : "با این فیلترها تغییری یافت نشد."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>فیلد</TableHead>
                  <TableHead>مقدار قبلی</TableHead>
                  <TableHead>مقدار جدید</TableHead>
                  <TableHead>ویرایش‌کننده</TableHead>
                  <TableHead>زمان تغییر</TableHead>
                  <TableHead>نوع</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <button
                        type="button"
                        className="font-medium text-primary underline-offset-2 hover:underline"
                        onClick={() => setFieldFilter(c.fieldKey)}
                        title="فقط تاریخچهٔ همین فیلد"
                      >
                        {c.fieldLabel}
                      </button>
                    </TableCell>
                    <TableCell className="text-muted-foreground line-through">
                      {c.from ?? "—"}
                    </TableCell>
                    <TableCell className="font-medium">{c.to ?? "—"}</TableCell>
                    <TableCell className="text-xs">{c.actorName}</TableCell>
                    <TableCell className="text-xs">{formatDateTimeFa(c.createdAt)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {KIND_LABELS[c.kind]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {(data?.emptyDiffCount ?? 0) > 0 && (
          <p className="text-xs text-muted-foreground">
            برای برخی رکوردهای قدیمی، جزئیات تغییر ثبت نشده است.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
