import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, CheckCircle2, XCircle, Ban, Search, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";
import { searchProducts } from "@/lib/pricing/queries";

export const Route = createFileRoute("/_app/market-matches")({
  component: MarketMatchesPage,
});

type MatchStatus = "pending" | "needs_review" | "approved" | "rejected" | "disabled";
type SourceName = "torob" | "purchista" | "other";

interface MatchRow {
  id: string;
  source_name: SourceName;
  source_product_url: string | null;
  source_product_id: string | null;
  source_title: string;
  normalized_source_title: string | null;
  afrakala_product_id: string | null;
  afrakala_product_name_snapshot: string | null;
  match_status: MatchStatus;
  confidence_score: number | null;
  matched_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reject_reason: string | null;
  notes: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

interface EventRow {
  id: string;
  event_type: string;
  actor: string;
  old_status: MatchStatus | null;
  new_status: MatchStatus | null;
  details: unknown;
  created_at: string;
}

const STATUS_LABELS: Record<MatchStatus, string> = {
  pending: "در انتظار",
  needs_review: "نیازمند بررسی",
  approved: "تایید‌شده",
  rejected: "رد‌شده",
  disabled: "غیرفعال",
};

const SOURCE_LABELS: Record<SourceName, string> = {
  torob: "ترب",
  purchista: "پورچیستا",
  other: "سایر",
};

const STATUS_VARIANT: Record<MatchStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  needs_review: "default",
  approved: "default",
  rejected: "destructive",
  disabled: "outline",
};

const PAGE_SIZE = 25;

function MarketMatchesPage() {
  const { roles } = useAuth();
  const allowed = roles.includes("admin") || roles.includes("manager");

  const [rows, setRows] = useState<MatchRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<MatchStatus | "review_queue" | "all">(
    "review_queue",
  );
  const [sourceFilter, setSourceFilter] = useState<SourceName | "all">("all");
  const [search, setSearch] = useState("");
  const dSearch = useDebounce(search, 350);

  const [detail, setDetail] = useState<MatchRow | null>(null);

  const load = async () => {
    if (!allowed) return;
    setLoading(true);
    let q = supabase
      .from("market_product_matches")
      .select(
        "id,source_name,source_product_url,source_product_id,source_title,normalized_source_title,afrakala_product_id,afrakala_product_name_snapshot,match_status,confidence_score,matched_by,reviewed_by,reviewed_at,reject_reason,notes,last_seen_at,created_at,updated_at",
        { count: "exact" },
      )
      .order("updated_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (statusFilter === "review_queue") {
      q = q.in("match_status", ["pending", "needs_review"]);
    } else if (statusFilter !== "all") {
      q = q.eq("match_status", statusFilter);
    }
    if (sourceFilter !== "all") {
      q = q.eq("source_name", sourceFilter);
    }
    if (dSearch.trim()) {
      const safe = dSearch.trim().replace(/[%_]/g, "");
      q = q.or(
        `source_title.ilike.%${safe}%,source_product_id.ilike.%${safe}%,source_product_url.ilike.%${safe}%`,
      );
    }

    const { data, error, count } = await q;
    setLoading(false);
    if (error) {
      toast.error("خطا در بارگذاری: " + error.message);
      return;
    }
    setRows((data ?? []) as MatchRow[]);
    setTotal(count ?? 0);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter, sourceFilter, dSearch, allowed]);

  useEffect(() => {
    setPage(0);
  }, [statusFilter, sourceFilter, dSearch]);

  if (!allowed) {
    return (
      <div dir="rtl" className="p-6 text-sm text-muted-foreground">
        دسترسی غیرمجاز. فقط نقش‌های admin یا manager می‌توانند این صفحه را مشاهده کنند.
      </div>
    );
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div dir="rtl" className="space-y-4 p-4 md:p-6">
      <PageHeader
        title="بررسی تطبیق محصولات بازار"
        description="مدیریت candidateهای ربات‌ها برای نگاشت به محصولات داخلی افراکالا"
      />

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 md:flex-row md:items-end">
        <div className="flex-1">
          <Label className="text-xs">جستجو</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="عنوان، شناسه یا URL محصول بازار"
              className="pr-8"
            />
          </div>
        </div>
        <div className="w-full md:w-48">
          <Label className="text-xs">وضعیت</Label>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="review_queue">صف بررسی (pending+needs_review)</SelectItem>
              <SelectItem value="all">همه</SelectItem>
              <SelectItem value="pending">در انتظار</SelectItem>
              <SelectItem value="needs_review">نیازمند بررسی</SelectItem>
              <SelectItem value="approved">تایید‌شده</SelectItem>
              <SelectItem value="rejected">رد‌شده</SelectItem>
              <SelectItem value="disabled">غیرفعال</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-full md:w-40">
          <Label className="text-xs">منبع</Label>
          <Select
            value={sourceFilter}
            onValueChange={(v) => setSourceFilter(v as typeof sourceFilter)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همه</SelectItem>
              <SelectItem value="torob">ترب</SelectItem>
              <SelectItem value="purchista">پورچیستا</SelectItem>
              <SelectItem value="other">سایر</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "به‌روزرسانی"}
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">منبع</TableHead>
              <TableHead className="text-right">عنوان محصول بازار</TableHead>
              <TableHead className="text-right">شناسه/لینک</TableHead>
              <TableHead className="text-right">وضعیت</TableHead>
              <TableHead className="text-right">اطمینان</TableHead>
              <TableHead className="text-right">محصول افراکالا</TableHead>
              <TableHead className="text-right">آخرین مشاهده</TableHead>
              <TableHead className="text-right">عملیات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  <Loader2 className="inline h-4 w-4 animate-spin" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  رکوردی یافت نشد
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{SOURCE_LABELS[r.source_name] ?? r.source_name}</TableCell>
                  <TableCell className="max-w-xs truncate" title={r.source_title}>
                    {r.source_title}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.source_product_url ? (
                      <a
                        href={r.source_product_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        لینک <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : r.source_product_id ? (
                      <span className="font-mono">{r.source_product_id}</span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[r.match_status]}>
                      {STATUS_LABELS[r.match_status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {r.confidence_score != null ? Number(r.confidence_score).toFixed(1) : "—"}
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    {r.afrakala_product_name_snapshot ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.last_seen_at ? new Date(r.last_seen_at).toLocaleString("fa-IR") : "—"}
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => setDetail(r)}>
                      بررسی
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div>مجموع: {total.toLocaleString("fa-IR")} رکورد</div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page === 0 || loading}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            قبلی
          </Button>
          <span>
            صفحه {page + 1} از {pageCount}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page + 1 >= pageCount || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            بعدی
          </Button>
        </div>
      </div>

      {detail && (
        <MatchDetailDialog
          match={detail}
          onClose={() => setDetail(null)}
          onChanged={() => {
            setDetail(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

/* ----------------------------- Detail Dialog ----------------------------- */

function MatchDetailDialog({
  match,
  onClose,
  onChanged,
}: {
  match: MatchRow;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [productId, setProductId] = useState<string>(match.afrakala_product_id ?? "");
  const [productLabel, setProductLabel] = useState<string>(
    match.afrakala_product_name_snapshot ?? "",
  );
  const [productSearch, setProductSearch] = useState("");
  const dProductSearch = useDebounce(productSearch, 300);
  const [results, setResults] = useState<
    Array<{
      id: string;
      name: string;
      sku: string | null;
      brand?: { name: string | null } | null;
      category?: { name: string | null } | null;
    }>
  >([]);
  const [searching, setSearching] = useState(false);

  const [notes, setNotes] = useState<string>(match.notes ?? "");
  const [rejectReason, setRejectReason] = useState("");
  const [disableReason, setDisableReason] = useState("");
  const [busy, setBusy] = useState(false);

  const [events, setEvents] = useState<EventRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!dProductSearch.trim()) {
        setResults([]);
        return;
      }
      setSearching(true);
      try {
        const r = await searchProducts(dProductSearch, 20);
        if (!cancelled) setResults(r as typeof results);
      } catch (e: any) {
        if (!cancelled) toast.error("خطای جستجو: " + (e?.message ?? String(e)));
      } finally {
        if (!cancelled) setSearching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dProductSearch]);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("market_product_match_events")
        .select("id,event_type,actor,old_status,new_status,details,created_at")
        .eq("match_id", match.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) return;
      setEvents((data ?? []) as EventRow[]);
    })();
  }, [match.id]);

  const approve = async () => {
    if (!productId) {
      toast.error("ابتدا یک محصول داخلی انتخاب کنید");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("review_market_product_match_approve", {
      p_match_id: match.id,
      p_afrakala_product_id: productId,
      p_notes: notes || undefined,
    });
    setBusy(false);
    if (error) {
      toast.error("خطا در تایید: " + error.message);
      return;
    }
    toast.success("تطبیق تایید شد");
    onChanged();
  };

  const reject = async () => {
    if (!rejectReason.trim()) {
      toast.error("دلیل رد الزامی است");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("review_market_product_match_reject", {
      p_match_id: match.id,
      p_reject_reason: rejectReason.trim(),
      p_notes: notes || undefined,
    });
    setBusy(false);
    if (error) {
      toast.error("خطا در رد: " + error.message);
      return;
    }
    toast.success("تطبیق رد شد");
    onChanged();
  };

  const disable = async () => {
    if (!disableReason.trim()) {
      toast.error("دلیل غیرفعال‌سازی الزامی است");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("review_market_product_match_disable", {
      p_match_id: match.id,
      p_reason: disableReason.trim(),
      p_notes: notes || undefined,
    });
    setBusy(false);
    if (error) {
      toast.error("خطا در غیرفعال‌سازی: " + error.message);
      return;
    }
    toast.success("تطبیق غیرفعال شد");
    onChanged();
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent dir="rtl" className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>جزئیات تطبیق</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">منبع:</span>{" "}
              {SOURCE_LABELS[match.source_name]}
            </div>
            <div>
              <span className="text-muted-foreground">عنوان:</span> {match.source_title}
            </div>
            <div className="text-xs text-muted-foreground break-all">
              {match.normalized_source_title}
            </div>
            {match.source_product_url && (
              <div>
                <a
                  href={match.source_product_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {match.source_product_url}
                </a>
              </div>
            )}
            {match.source_product_id && (
              <div className="font-mono text-xs">ID: {match.source_product_id}</div>
            )}
            <div>
              <span className="text-muted-foreground">وضعیت فعلی:</span>{" "}
              <Badge variant={STATUS_VARIANT[match.match_status]}>
                {STATUS_LABELS[match.match_status]}
              </Badge>
            </div>
            <div>
              <span className="text-muted-foreground">اطمینان:</span>{" "}
              {match.confidence_score != null ? Number(match.confidence_score).toFixed(1) : "—"}
            </div>
            {match.afrakala_product_name_snapshot && (
              <div>
                <span className="text-muted-foreground">محصول فعلی:</span>{" "}
                {match.afrakala_product_name_snapshot}
              </div>
            )}
            {match.reject_reason && (
              <div className="text-destructive text-xs">دلیل: {match.reject_reason}</div>
            )}
          </div>

          <div className="space-y-2">
            <Label>محصول افراکالا</Label>
            {productLabel && (
              <div className="rounded border p-2 text-sm">
                <div className="font-medium">{productLabel}</div>
                <div className="text-xs text-muted-foreground font-mono">{productId}</div>
              </div>
            )}
            <Input
              placeholder="جستجو در محصولات (نام یا SKU)"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
            />
            {searching && (
              <div className="text-xs text-muted-foreground">
                <Loader2 className="inline h-3 w-3 animate-spin" /> در حال جستجو…
              </div>
            )}
            {results.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded border">
                {results.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setProductId(p.id);
                      setProductLabel(p.name);
                      setResults([]);
                      setProductSearch("");
                    }}
                    className="block w-full text-right p-2 text-sm hover:bg-muted border-b last:border-b-0"
                  >
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.sku ?? "بدون SKU"} • {p.brand?.name ?? "بدون برند"} •{" "}
                      {p.category?.name ?? "بدون دسته"}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <Label>یادداشت (اختیاری)</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>

        <div className="grid gap-4 md:grid-cols-3 border-t pt-4">
          <div className="space-y-2">
            <Button onClick={approve} disabled={busy || !productId} className="w-full">
              <CheckCircle2 className="h-4 w-4 ml-1" /> تایید تطبیق
            </Button>
            <p className="text-xs text-muted-foreground">انتخاب محصول الزامی</p>
          </div>
          <div className="space-y-2">
            <Input
              placeholder="دلیل رد (الزامی)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <Button
              onClick={reject}
              disabled={busy || !rejectReason.trim()}
              variant="destructive"
              className="w-full"
            >
              <XCircle className="h-4 w-4 ml-1" /> رد تطبیق
            </Button>
          </div>
          <div className="space-y-2">
            <Input
              placeholder="دلیل غیرفعال‌سازی"
              value={disableReason}
              onChange={(e) => setDisableReason(e.target.value)}
            />
            <Button
              onClick={disable}
              disabled={busy || !disableReason.trim()}
              variant="outline"
              className="w-full"
            >
              <Ban className="h-4 w-4 ml-1" /> غیرفعال‌سازی
            </Button>
          </div>
        </div>

        <div className="border-t pt-4">
          <div className="text-sm font-medium mb-2">رویدادها ({events.length})</div>
          <div className="max-h-60 overflow-y-auto space-y-1 text-xs">
            {events.length === 0 ? (
              <div className="text-muted-foreground">رویدادی ثبت نشده</div>
            ) : (
              events.map((ev) => (
                <div key={ev.id} className="flex items-center gap-2 rounded border p-2">
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {new Date(ev.created_at).toLocaleString("fa-IR")}
                  </span>
                  <Badge variant="outline">{ev.event_type}</Badge>
                  <span>{ev.actor}</span>
                  {ev.old_status && (
                    <span className="text-muted-foreground">{STATUS_LABELS[ev.old_status]} ← </span>
                  )}
                  {ev.new_status && (
                    <span className="font-medium">{STATUS_LABELS[ev.new_status]}</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            بستن
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
