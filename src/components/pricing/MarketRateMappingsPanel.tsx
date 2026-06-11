import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Settings2, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatDateFa } from "@/lib/i18n/formatters";

type MappingStatus = "active" | "disabled" | "needs_approval" | "ambiguous";

function getMappingStatus(r: { is_enabled: boolean; note: string | null }): MappingStatus {
  const note = r.note ?? "";
  if (note.includes("مبهم")) return "ambiguous";
  if (note.includes("نیاز به تأیید")) return "needs_approval";
  return r.is_enabled ? "active" : "disabled";
}

const STATUS_META: Record<
  MappingStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  active: { label: "فعال", variant: "default" },
  disabled: { label: "غیرفعال", variant: "secondary" },
  needs_approval: { label: "نیاز به تأیید", variant: "destructive" },
  ambiguous: { label: "مبهم", variant: "destructive" },
};

function getMappingHint(r: MappingRow): string | null {
  const srcCode = r.source?.code ?? "";
  const indCode = r.indicator?.code ?? "";
  if (srcCode === "TGJU_API") return "TGJU هنوز fetcher تأییدشده ندارد.";
  if (
    srcCode === "NAVASAN_API" &&
    !r.is_enabled &&
    (indCode === "USD_TEHRAN_FREE" || indCode === "AED_TEHRAN")
  ) {
    return "فعال‌سازی فقط پس از تأیید نماد رسمی.";
  }
  return null;
}

type MappingRow = {
  id: string;
  source_id: string;
  indicator_id: string;
  source_symbol: string;
  normalize_multiplier: number;
  is_enabled: boolean;
  note: string | null;
  updated_at: string;
  source: { code: string; title_fa: string } | null;
  indicator: { code: string; title_fa: string } | null;
};

type EditState = {
  source_symbol: string;
  normalize_multiplier: string;
  is_enabled: boolean;
  note: string;
};

export function MarketRateMappingsPanel() {
  const { roles } = useAuth();
  const canEdit = roles.some((r) => ["admin", "manager"].includes(r));
  const canView = canEdit || roles.includes("accountant");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MappingRow | null>(null);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "navasan" | "tgju" | "other">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | MappingStatus>("all");

  const q = useQuery({
    queryKey: ["market-rate-mappings"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_rate_source_mappings")
        .select(
          "id,source_id,indicator_id,source_symbol,normalize_multiplier,is_enabled,note,updated_at," +
            "source:market_rate_sources(code,title_fa)," +
            "indicator:market_indicators(code,title_fa)",
        )
        .order("updated_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as MappingRow[];
    },
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (q.data ?? []).filter((r) => {
      const srcCode = r.source?.code ?? "";
      if (sourceFilter === "navasan" && srcCode !== "NAVASAN_API") return false;
      if (sourceFilter === "tgju" && srcCode !== "TGJU_API") return false;
      if (sourceFilter === "other" && (srcCode === "NAVASAN_API" || srcCode === "TGJU_API"))
        return false;
      if (statusFilter !== "all" && getMappingStatus(r) !== statusFilter) return false;
      if (!term) return true;
      const hay = [
        r.source?.code,
        r.source?.title_fa,
        r.indicator?.code,
        r.indicator?.title_fa,
        r.source_symbol,
        r.note ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(term);
    });
  }, [q.data, search, sourceFilter, statusFilter]);

  const grouped = useMemo(() => {
    const m: Record<string, MappingRow[]> = {};
    filtered.forEach((r) => {
      const k = r.source?.title_fa ?? r.source?.code ?? "—";
      (m[k] ||= []).push(r);
    });
    return m;
  }, [filtered]);

  if (!canView) return null;

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Settings2 className="h-4 w-4" /> مدیریت نگاشت منابع نرخ
              </span>
              <Badge variant="secondary" className="text-xs">
                {open ? "بستن" : "باز کردن"}
              </Badge>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-3">
            <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-700 dark:text-amber-400">
              فعال‌سازی mapping مالی فقط پس از تأیید نماد رسمی مجاز است. حدس‌زدن نماد ممنوع.
            </p>

            <div className="grid gap-2 sm:grid-cols-3">
              <Input
                placeholder="جستجو در شاخص، نماد، یادداشت…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="text-xs"
              />
              <Select
                value={sourceFilter}
                onValueChange={(v) => setSourceFilter(v as typeof sourceFilter)}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="منبع" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه منابع</SelectItem>
                  <SelectItem value="navasan">نوسان</SelectItem>
                  <SelectItem value="tgju">TGJU</SelectItem>
                  <SelectItem value="other">سایر</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="وضعیت" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه وضعیت‌ها</SelectItem>
                  <SelectItem value="active">فعال</SelectItem>
                  <SelectItem value="disabled">غیرفعال</SelectItem>
                  <SelectItem value="needs_approval">نیاز به تأیید</SelectItem>
                  <SelectItem value="ambiguous">مبهم</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {q.isLoading ? (
              <div className="text-sm text-muted-foreground">در حال بارگذاری…</div>
            ) : !q.data || q.data.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                نگاشتی تعریف نشده است.
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                نگاشتی با این فیلترها یافت نشد.
              </div>
            ) : (
              Object.entries(grouped).map(([src, rows]) => (
                <div key={src} className="space-y-2">
                  <h3 className="text-sm font-semibold">{src}</h3>
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr>
                          <th className="px-2 py-2">شاخص</th>
                          <th className="px-2 py-2">نماد منبع</th>
                          <th className="px-2 py-2">ضریب</th>
                          <th className="px-2 py-2">وضعیت</th>
                          <th className="px-2 py-2">یادداشت</th>
                          <th className="px-2 py-2">به‌روزرسانی</th>
                          {canEdit && <th className="px-2 py-2"></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => {
                          const status = getMappingStatus(r);
                          const meta = STATUS_META[status];
                          const hint = getMappingHint(r);
                          return (
                            <tr key={r.id} className="border-t">
                              <td className="px-2 py-2">
                                <div className="font-medium">{r.indicator?.title_fa ?? "—"}</div>
                                <div className="text-[10px] text-muted-foreground">
                                  {r.indicator?.code}
                                </div>
                              </td>
                              <td className="px-2 py-2 font-mono">{r.source_symbol}</td>
                              <td className="px-2 py-2">{Number(r.normalize_multiplier)}</td>
                              <td className="px-2 py-2">
                                <div className="flex flex-col gap-1">
                                  <Badge variant={meta.variant} className="w-fit text-[10px]">
                                    {meta.label}
                                  </Badge>
                                  {hint && (
                                    <span className="text-[10px] text-muted-foreground">
                                      {hint}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td
                                className="px-2 py-2 max-w-[280px] truncate text-muted-foreground"
                                title={r.note ?? ""}
                              >
                                {r.note ?? "—"}
                              </td>
                              <td className="px-2 py-2 text-muted-foreground">
                                {formatDateFa(r.updated_at)}
                              </td>
                              {canEdit && (
                                <td className="px-2 py-2">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setEditing(r)}
                                    aria-label="ویرایش نگاشت"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>

      {canEdit && editing && (
        <EditMappingDialog
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["market-rate-mappings"] });
            setEditing(null);
          }}
        />
      )}
    </Card>
  );
}

function EditMappingDialog({
  row,
  onClose,
  onSaved,
}: {
  row: MappingRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [state, setState] = useState<EditState>({
    source_symbol: row.source_symbol,
    normalize_multiplier: String(row.normalize_multiplier ?? 1),
    is_enabled: row.is_enabled,
    note: row.note ?? "",
  });

  const needsConfirm =
    !row.is_enabled &&
    state.is_enabled &&
    ((row.note ?? "").includes("نیاز به تأیید") || (row.note ?? "").includes("مبهم"));

  const mut = useMutation({
    mutationFn: async () => {
      const sym = state.source_symbol.trim();
      if (!sym) throw new Error("نماد منبع نمی‌تواند خالی باشد");
      if (sym.length > 100) throw new Error("نماد منبع طولانی است");
      const mult = Number(state.normalize_multiplier);
      if (!Number.isFinite(mult) || mult <= 0)
        throw new Error("ضریب باید عددی بزرگ‌تر از صفر باشد");
      if (state.note.length > 500) throw new Error("یادداشت طولانی است");

      if (needsConfirm) {
        const ok = window.confirm(
          "این نگاشت قبلاً به‌عنوان «نیاز به تأیید/مبهم» علامت خورده است. آیا از فعال‌سازی آن مطمئن هستید؟",
        );
        if (!ok) throw new Error("فعال‌سازی توسط کاربر لغو شد");
      }

      // Secure RPC: enforces role check + writes audit log atomically (server-side)
      const { error } = await supabase.rpc("update_market_rate_source_mapping", {
        p_mapping_id: row.id,
        p_source_symbol: sym,
        p_normalize_multiplier: mult,
        p_is_enabled: state.is_enabled,
        p_note: state.note || "",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("نگاشت با موفقیت ذخیره شد");
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "خطا در ذخیره نگاشت"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            ویرایش نگاشت — {row.source?.title_fa} / {row.indicator?.title_fa}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>نماد منبع</Label>
            <Input
              value={state.source_symbol}
              onChange={(e) => setState((s) => ({ ...s, source_symbol: e.target.value }))}
              placeholder="مثلاً usd یا usd_sell"
              maxLength={100}
            />
          </div>
          <div className="space-y-1">
            <Label>ضریب نرمال‌سازی</Label>
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={state.normalize_multiplier}
              onChange={(e) => setState((s) => ({ ...s, normalize_multiplier: e.target.value }))}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border p-2">
            <div>
              <Label className="text-sm">فعال</Label>
              <p className="text-[10px] text-muted-foreground">
                فعال‌سازی فقط با نماد تأییدشده مجاز است.
              </p>
            </div>
            <Switch
              checked={state.is_enabled}
              onCheckedChange={(v) => setState((s) => ({ ...s, is_enabled: v }))}
            />
          </div>
          <div className="space-y-1">
            <Label>یادداشت</Label>
            <Textarea
              rows={2}
              maxLength={500}
              value={state.note}
              onChange={(e) => setState((s) => ({ ...s, note: e.target.value }))}
            />
          </div>
          {needsConfirm && (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
              توجه: این نگاشت با وضعیت «نیاز به تأیید/مبهم» ذخیره شده بود؛ هنگام ذخیره از شما تأیید
              گرفته خواهد شد.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mut.isPending}>
            انصراف
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "در حال ذخیره…" : "ذخیره"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
