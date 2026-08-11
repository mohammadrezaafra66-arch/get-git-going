import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Search,
  Filter,
  Loader2,
  Inbox,
  ChevronRight,
  ChevronLeft,
  Ban,
  CheckCircle2,
  AlertTriangle,
  Play,
  Unlock,
  RotateCcw,
  ExternalLink,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { PersianDatePicker } from "@/components/common/PersianDatePicker";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useDebounce } from "@/hooks/use-debounce";
import { useAuth } from "@/lib/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { requirePermission } from "@/lib/rbac/route-guards";
import { formatNumber, formatDateTimeFa, toFaDigits } from "@/lib/i18n/formatters";
import {
  QUOTE_SHARE_CHANNELS,
  QUOTE_SHARE_CHANNEL_LABELS,
  type QuoteShareChannel,
} from "@/lib/sales/quote-share";
import {
  QUOTE_SEND_QUEUE_STATUSES,
  QUOTE_SEND_QUEUE_STATUS_LABELS,
  QUOTE_SEND_QUEUE_PAGE_SIZE,
  SIMULATED_ERROR_MESSAGE,
  type QuoteSendQueueStatus,
} from "@/lib/sales/quote-send-queue";

export const Route = createFileRoute("/_app/sales/send-queue")({
  beforeLoad: async () => {
    await requirePermission("sales", "view");
  },
  component: SendQueuePage,
});

export const STALE_LOCK_MINUTES = 10;

type QuickFilter = "none" | "pending" | "failed" | "processing" | "retry" | "stale";

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function staleCutoffIso(): string {
  return new Date(Date.now() - STALE_LOCK_MINUTES * 60_000).toISOString();
}

interface QueueRow {
  id: string;
  quote_id: string;
  channel: string;
  recipient: string;
  status: QuoteSendQueueStatus;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  scheduled_at: string;
  locked_at: string | null;
  processed_at: string | null;
  created_by: string | null;
  created_at: string;
  quote_number?: string | null;
}

function SendQueuePage() {
  const { user, roles } = useAuth();
  const isManagerial = roles.includes("admin") || roles.includes("manager");

  const [search, setSearch] = useState("");
  const dSearch = useDebounce(search, 350);
  const [channel, setChannel] = useState<string>("__all");
  const [status, setStatus] = useState<string>("__all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("none");
  const [page, setPage] = useState(1);

  useMemo(() => {
    setPage(1);
  }, [dSearch, channel, status, dateFrom, dateTo, quickFilter]);

  const listQuery = useQuery({
    enabled: !!user,
    queryKey: [
      "sales-quote-send-queue",
      { dSearch, channel, status, dateFrom, dateTo, quickFilter, page },
    ],
    staleTime: 30_000,
    queryFn: async () => {
      const from = (page - 1) * QUOTE_SEND_QUEUE_PAGE_SIZE;
      const to = from + QUOTE_SEND_QUEUE_PAGE_SIZE - 1;

      let quoteIdsFilter: string[] | null = null;
      const term = dSearch.trim();
      if (term.length >= 2) {
        const safe = term.replace(/[%_]/g, "");
        const qr = await supabase
          .from("sales_quotes")
          .select("id")
          .ilike("quote_number", `%${safe}%`)
          .limit(200);
        if (qr.error) throw qr.error;
        quoteIdsFilter = (qr.data ?? []).map((q) => q.id as string);
      }

      let q = supabase
        .from("sales_quote_send_queue")
        .select(
          "id, quote_id, channel, recipient, status, attempts, max_attempts, last_error, scheduled_at, locked_at, processed_at, created_by, created_at",
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .range(from, to);

      if (channel !== "__all") q = q.eq("channel", channel);
      if (status !== "__all") q = q.eq("status", status);

      // Quick filters override / refine the status/attempts/lock filters
      if (quickFilter === "pending") q = q.eq("status", "pending");
      else if (quickFilter === "failed") q = q.eq("status", "failed");
      else if (quickFilter === "processing") q = q.eq("status", "processing");
      else if (quickFilter === "retry") {
        q = q.eq("status", "pending").gt("attempts", 0);
      } else if (quickFilter === "stale") {
        q = q.eq("status", "processing").lt("locked_at", staleCutoffIso());
      }

      if (dateFrom) q = q.gte("created_at", new Date(dateFrom).toISOString());
      if (dateTo) {
        const d = new Date(dateTo);
        d.setHours(23, 59, 59, 999);
        q = q.lte("created_at", d.toISOString());
      }
      if (term.length >= 2) {
        const safe = term.replace(/[%_]/g, "");
        if (quoteIdsFilter && quoteIdsFilter.length > 0) {
          q = q.or(`recipient.ilike.%${safe}%,quote_id.in.(${quoteIdsFilter.join(",")})`);
        } else {
          q = q.ilike("recipient", `%${safe}%`);
        }
      }

      const { data, error, count } = await q;
      if (error) throw error;
      const baseRows = (data ?? []) as Array<Omit<QueueRow, "quote_number">>;

      const quoteIds = Array.from(new Set(baseRows.map((r) => r.quote_id).filter(Boolean)));
      const quoteMap = new Map<string, string | null>();
      if (quoteIds.length > 0) {
        const qr = await supabase
          .from("sales_quotes")
          .select("id, quote_number")
          .in("id", quoteIds);
        if (!qr.error) {
          for (const r of qr.data ?? []) {
            quoteMap.set(r.id as string, (r.quote_number as string | null) ?? null);
          }
        }
      }

      const rows: QueueRow[] = baseRows.map((r) => ({
        ...r,
        quote_number: quoteMap.get(r.quote_id) ?? null,
      }));
      return { rows, total: count ?? 0 };
    },
  });

  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / QUOTE_SEND_QUEUE_PAGE_SIZE));
  const rows = listQuery.data?.rows ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="صف ارسال پیش‌فاکتور"
        description="مدیریت داخلی صف ارسال (بدون اتصال واقعی به پیام‌رسان‌ها)"
      />

      <StatusSummaryCard />
      <KpiCards />
      <ChannelStatusCard />
      <RecentErrorsCard />
      {isManagerial && <WorkerControlsCard />}

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Filter className="h-4 w-4" /> فیلترها
          </div>
          <QuickFilterChips value={quickFilter} onChange={setQuickFilter} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative sm:col-span-2 lg:col-span-2">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="شماره پیش‌فاکتور یا گیرنده"
                className="pr-9"
              />
            </div>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger>
                <SelectValue placeholder="کانال" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">همه کانال‌ها</SelectItem>
                {QUOTE_SHARE_CHANNELS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {QUOTE_SHARE_CHANNEL_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue placeholder="وضعیت" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">همه وضعیت‌ها</SelectItem>
                {QUOTE_SEND_QUEUE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {QUOTE_SEND_QUEUE_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <PersianDatePicker
              value={dateFrom || null}
              onChange={(v) => setDateFrom(v ?? "")}
              placeholder="از تاریخ"
            />
            <PersianDatePicker
              value={dateTo || null}
              onChange={(v) => setDateTo(v ?? "")}
              placeholder="تا تاریخ"
            />
          </div>
        </CardContent>
      </Card>

      {listQuery.isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال بارگذاری...
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="صف ارسال خالی است."
          description="از صفحه «سوابق ارسال پیش‌فاکتور» می‌توانید پیش‌نویس‌ها را به صف اضافه کنید."
        />
      ) : (
        <>
          <div className="hidden md:block">
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="p-3 text-right font-medium">شماره پیش‌فاکتور</th>
                        <th className="p-3 text-right font-medium">کانال</th>
                        <th className="p-3 text-right font-medium">گیرنده</th>
                        <th className="p-3 text-right font-medium">وضعیت</th>
                        <th className="p-3 text-right font-medium">تلاش‌ها</th>
                        <th className="p-3 text-right font-medium">زمان برنامه‌ریزی</th>
                        <th className="p-3 text-right font-medium">قفل شده در</th>
                        <th className="p-3 text-right font-medium">پردازش شده در</th>
                        <th className="p-3 text-right font-medium">آخرین خطا</th>
                        <th className="p-3 text-right font-medium">عملیات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rows.map((r) => (
                        <tr key={r.id} className="hover:bg-muted/30">
                          <td className="p-3 align-top font-mono text-xs">
                            {r.quote_number ?? "—"}
                          </td>
                          <td className="p-3 align-top">
                            {QUOTE_SHARE_CHANNEL_LABELS[r.channel as QuoteShareChannel] ??
                              r.channel}
                          </td>
                          <td className="p-3 align-top" dir="ltr">
                            {r.recipient}
                          </td>
                          <td className="p-3 align-top">
                            <StatusBadges row={r} />
                          </td>
                          <td className="p-3 align-top text-xs">
                            {toFaDigits(r.attempts)} / {toFaDigits(r.max_attempts)}
                          </td>
                          <td className="p-3 align-top text-[11px] text-muted-foreground">
                            {formatDateTimeFa(r.scheduled_at)}
                          </td>
                          <td className="p-3 align-top text-[11px] text-muted-foreground">
                            {r.locked_at ? formatDateTimeFa(r.locked_at) : "—"}
                          </td>
                          <td className="p-3 align-top text-[11px] text-muted-foreground">
                            {r.processed_at ? formatDateTimeFa(r.processed_at) : "—"}
                          </td>
                          <td
                            className="p-3 align-top text-[11px] text-destructive max-w-[180px] truncate"
                            title={r.last_error ?? ""}
                          >
                            {r.last_error ?? "—"}
                          </td>
                          <td className="p-3 align-top">
                            <QueueRowActions
                              row={r}
                              isManagerial={isManagerial}
                              isOwner={r.created_by === user?.id}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-3 md:hidden">
            {rows.map((r) => (
              <Card key={r.id}>
                <CardContent className="p-3 space-y-1.5 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-mono text-xs text-muted-foreground">
                      {r.quote_number ?? "—"}
                    </div>
                    <StatusBadges row={r} />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">کانال</span>
                    <span>
                      {QUOTE_SHARE_CHANNEL_LABELS[r.channel as QuoteShareChannel] ?? r.channel}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">گیرنده</span>
                    <span dir="ltr">{r.recipient}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">تلاش‌ها</span>
                    <span>
                      {toFaDigits(r.attempts)} / {toFaDigits(r.max_attempts)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{formatDateTimeFa(r.scheduled_at)}</span>
                  </div>
                  {r.last_error && (
                    <div className="rounded border border-destructive/30 bg-destructive/5 p-2 text-[11px] text-destructive">
                      {r.last_error}
                    </div>
                  )}
                  <QueueRowActions
                    row={r}
                    isManagerial={isManagerial}
                    isOwner={r.created_by === user?.id}
                  />
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            <div className="text-xs text-muted-foreground">
              صفحه {toFaDigits(page)} از {toFaDigits(totalPages)} — مجموع {formatNumber(total)}{" "}
              رکورد
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronRight className="h-4 w-4" /> قبلی
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                بعدی <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function QueueRowActions({
  row,
  isManagerial,
  isOwner,
}: {
  row: QueueRow;
  isManagerial: boolean;
  isOwner: boolean;
}) {
  const qc = useQueryClient();

  const cancelMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("sales_quote_send_queue")
        .update({ status: "canceled" })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("رکورد صف لغو شد.");
      qc.invalidateQueries({ queryKey: ["sales-quote-send-queue"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "خطا در لغو."),
  });

  const successMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("sales_quote_send_queue")
        .update({ status: "sent", processed_at: new Date().toISOString(), last_error: null })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ارسال موفق شبیه‌سازی شد.");
      qc.invalidateQueries({ queryKey: ["sales-quote-send-queue"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "خطا در شبیه‌سازی."),
  });

  const failureMut = useMutation({
    mutationFn: async () => {
      const newAttempts = row.attempts + 1;
      const reachedMax = newAttempts >= row.max_attempts;
      const { error } = await supabase
        .from("sales_quote_send_queue")
        .update({
          attempts: newAttempts,
          last_error: SIMULATED_ERROR_MESSAGE,
          status: reachedMax ? "failed" : "pending",
          processed_at: reachedMax ? new Date().toISOString() : null,
        })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("خطای ارسال شبیه‌سازی شد.");
      qc.invalidateQueries({ queryKey: ["sales-quote-send-queue"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "خطا در شبیه‌سازی."),
  });

  const isPending = row.status === "pending";
  const canCancel = isPending && (isManagerial || isOwner);
  const showSimulate = isPending && isManagerial;
  const canRequeue = row.status === "failed" && isManagerial;

  const requeueMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("requeue_failed_quote_send_item", {
        p_queue_id: row.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("رکورد به صف بازگردانده شد.");
      qc.invalidateQueries({ queryKey: ["sales-quote-send-queue"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "خطا در بازگردانی."),
  });

  if (!canCancel && !showSimulate && !canRequeue) {
    return <span className="text-[11px] text-muted-foreground">—</span>;
  }

  const busy =
    cancelMut.isPending || successMut.isPending || failureMut.isPending || requeueMut.isPending;

  return (
    <div className="flex flex-wrap gap-1">
      {showSimulate && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => successMut.mutate()}>
          <CheckCircle2 className="ml-1 h-3.5 w-3.5" /> شبیه‌سازی موفق
        </Button>
      )}
      {showSimulate && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => failureMut.mutate()}>
          <AlertTriangle className="ml-1 h-3.5 w-3.5" /> شبیه‌سازی خطا
        </Button>
      )}
      {canCancel && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => cancelMut.mutate()}>
          <Ban className="ml-1 h-3.5 w-3.5" /> لغو
        </Button>
      )}
      {canRequeue && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => requeueMut.mutate()}>
          <RotateCcw className="ml-1 h-3.5 w-3.5" /> بازگرداندن به pending
        </Button>
      )}
    </div>
  );
}

const SUMMARY_STATUSES: QuoteSendQueueStatus[] = [
  "pending",
  "processing",
  "sent",
  "failed",
  "canceled",
];

function StatusSummaryCard() {
  const summaryQuery = useQuery({
    queryKey: ["sales-quote-send-queue", "status-summary"],
    staleTime: 30_000,
    queryFn: async () => {
      const out: Record<QuoteSendQueueStatus, number> = {
        pending: 0,
        processing: 0,
        sent: 0,
        failed: 0,
        canceled: 0,
      };
      await Promise.all(
        SUMMARY_STATUSES.map(async (s) => {
          const { count, error } = await supabase
            .from("sales_quote_send_queue")
            .select("id", { count: "exact", head: true })
            .eq("status", s);
          if (error) throw error;
          out[s] = count ?? 0;
        }),
      );
      return out;
    },
  });

  const data = summaryQuery.data;
  return (
    <Card>
      <CardContent className="p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {SUMMARY_STATUSES.map((s) => (
            <div key={s} className="rounded-md border bg-muted/30 p-3">
              <div className="text-[11px] text-muted-foreground">
                {QUOTE_SEND_QUEUE_STATUS_LABELS[s]}
              </div>
              <div className="mt-1 text-lg font-semibold">{data ? toFaDigits(data[s]) : "…"}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function WorkerControlsCard() {
  const qc = useQueryClient();

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["sales-quote-send-queue"] });
  };

  const processNextMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("claim_next_quote_send_queue_item");
      if (error) throw error;
      const claimed = (data ?? null) as null | {
        id: string;
        attempts: number;
        max_attempts: number;
      };
      if (!claimed || !claimed.id) {
        return { kind: "none" as const };
      }
      // Simulate processing delay
      await new Promise((res) => setTimeout(res, 800));
      const success = Math.random() < 0.8;
      const { data: completed, error: cErr } = await supabase.rpc(
        "complete_quote_send_queue_item",
        {
          p_queue_id: claimed.id,
          p_success: success,
          p_error: success ? undefined : "Simulated send failure",
        },
      );
      if (cErr) throw cErr;
      const row = completed as { status: string } | null;
      return { kind: "done" as const, success, finalStatus: row?.status ?? null };
    },
    onSuccess: (res) => {
      if (res.kind === "none") {
        toast.info("موردی برای پردازش وجود ندارد.");
      } else if (res.success) {
        toast.success("ارسال شبیه‌سازی‌شده با موفقیت انجام شد.");
      } else if (res.finalStatus === "failed") {
        toast.error("ارسال پس از رسیدن به سقف تلاش‌ها ناموفق شد.");
      } else {
        toast.warning("خطای شبیه‌سازی‌شده ثبت شد و برای تلاش بعدی زمان‌بندی شد.");
      }
      invalidateAll();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "خطا در پردازش."),
  });

  const releaseStaleMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("release_stale_quote_send_locks");
      if (error) throw error;
      return (data ?? 0) as number;
    },
    onSuccess: (count) => {
      toast.success(`${toFaDigits(count)} رکورد قفل‌شده آزاد شد.`);
      invalidateAll();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "خطا در آزادسازی قفل‌ها."),
  });

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="text-sm font-medium">پردازشگر صف (شبیه‌سازی)</div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => processNextMut.mutate()}
            disabled={processNextMut.isPending}
          >
            {processNextMut.isPending ? (
              <Loader2 className="ml-1 h-4 w-4 animate-spin" />
            ) : (
              <Play className="ml-1 h-4 w-4" />
            )}
            پردازش یک مورد بعدی
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => releaseStaleMut.mutate()}
            disabled={releaseStaleMut.isPending}
          >
            {releaseStaleMut.isPending ? (
              <Loader2 className="ml-1 h-4 w-4 animate-spin" />
            ) : (
              <Unlock className="ml-1 h-4 w-4" />
            )}
            آزادسازی قفل‌های قدیمی
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          این پردازشگر داخلی است و هیچ پیام واقعی به پیام‌رسان‌ها ارسال نمی‌کند.
        </p>
      </CardContent>
    </Card>
  );
}

function StatusBadges({ row }: { row: QueueRow }) {
  const isStaleLock =
    row.status === "processing" &&
    row.locked_at !== null &&
    new Date(row.locked_at).getTime() < Date.now() - STALE_LOCK_MINUTES * 60_000;
  const isMaxAttempts = row.status === "failed" && row.attempts >= row.max_attempts;
  const isRetryPending = row.status === "pending" && row.attempts > 0;

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Badge variant={row.status === "processing" ? "default" : "outline"}>
        {QUOTE_SEND_QUEUE_STATUS_LABELS[row.status] ?? row.status}
      </Badge>
      {isStaleLock && (
        <Badge variant="destructive" className="text-[10px]">
          قفل قدیمی
        </Badge>
      )}
      {isMaxAttempts && (
        <Badge variant="destructive" className="text-[10px]">
          سقف تلاش
        </Badge>
      )}
      {isRetryPending && (
        <Badge variant="secondary" className="text-[10px]">
          در انتظار تلاش مجدد
        </Badge>
      )}
    </div>
  );
}

const QUICK_FILTERS: Array<{ key: QuickFilter; label: string }> = [
  { key: "pending", label: "فقط pending" },
  { key: "failed", label: "فقط failed" },
  { key: "processing", label: "فقط processing" },
  { key: "retry", label: "retry دارها" },
  { key: "stale", label: "قفل‌های قدیمی" },
];

function QuickFilterChips({
  value,
  onChange,
}: {
  value: QuickFilter;
  onChange: (v: QuickFilter) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Button
        size="sm"
        variant={value === "none" ? "default" : "outline"}
        onClick={() => onChange("none")}
      >
        همه
      </Button>
      {QUICK_FILTERS.map((f) => (
        <Button
          key={f.key}
          size="sm"
          variant={value === f.key ? "default" : "outline"}
          onClick={() => onChange(f.key)}
        >
          {f.label}
        </Button>
      ))}
    </div>
  );
}

function KpiCard({
  label,
  value,
  isLoading,
  isError,
  tone,
}: {
  label: string;
  value: number | undefined;
  isLoading: boolean;
  isError: boolean;
  tone?: "default" | "warning" | "danger" | "success";
}) {
  const toneClass =
    tone === "warning"
      ? "text-amber-600 dark:text-amber-400"
      : tone === "danger"
        ? "text-destructive"
        : tone === "success"
          ? "text-emerald-600 dark:text-emerald-400"
          : "";
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${toneClass}`}>
        {isError ? (
          <span className="text-destructive text-xs">خطا</span>
        ) : isLoading || value === undefined ? (
          "…"
        ) : (
          toFaDigits(value)
        )}
      </div>
    </div>
  );
}

function KpiCards() {
  const todayIso = useMemo(() => startOfTodayIso(), []);

  const totalToday = useQuery({
    queryKey: ["sales-quote-send-queue", "kpi", "total-today", todayIso],
    staleTime: 30_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("sales_quote_send_queue")
        .select("id", { count: "exact", head: true })
        .gte("created_at", todayIso);
      if (error) throw error;
      return count ?? 0;
    },
  });
  const pendingToday = useQuery({
    queryKey: ["sales-quote-send-queue", "kpi", "pending-today", todayIso],
    staleTime: 30_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("sales_quote_send_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .gte("created_at", todayIso);
      if (error) throw error;
      return count ?? 0;
    },
  });
  const processingNow = useQuery({
    queryKey: ["sales-quote-send-queue", "kpi", "processing-now"],
    staleTime: 30_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("sales_quote_send_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "processing");
      if (error) throw error;
      return count ?? 0;
    },
  });
  const sentToday = useQuery({
    queryKey: ["sales-quote-send-queue", "kpi", "sent-today", todayIso],
    staleTime: 30_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("sales_quote_send_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "sent")
        .gte("created_at", todayIso);
      if (error) throw error;
      return count ?? 0;
    },
  });
  const failedToday = useQuery({
    queryKey: ["sales-quote-send-queue", "kpi", "failed-today", todayIso],
    staleTime: 30_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("sales_quote_send_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed")
        .gte("created_at", todayIso);
      if (error) throw error;
      return count ?? 0;
    },
  });
  const retryPending = useQuery({
    queryKey: ["sales-quote-send-queue", "kpi", "retry-pending"],
    staleTime: 30_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("sales_quote_send_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .gt("attempts", 0);
      if (error) throw error;
      return count ?? 0;
    },
  });
  const staleProcessing = useQuery({
    queryKey: ["sales-quote-send-queue", "kpi", "stale-processing"],
    staleTime: 30_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("sales_quote_send_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "processing")
        .lt("locked_at", staleCutoffIso());
      if (error) throw error;
      return count ?? 0;
    },
  });

  const kpis: Array<{
    label: string;
    q: typeof totalToday;
    tone?: "default" | "warning" | "danger" | "success";
  }> = [
    { label: "کل امروز", q: totalToday },
    { label: "pending امروز", q: pendingToday },
    { label: "processing فعلی", q: processingNow },
    { label: "sent امروز", q: sentToday, tone: "success" },
    { label: "failed امروز", q: failedToday, tone: "danger" },
    { label: "در انتظار تلاش مجدد", q: retryPending, tone: "warning" },
    { label: "قفل قدیمی (processing)", q: staleProcessing, tone: "warning" },
  ];

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-2 text-sm font-medium">KPI صف ارسال</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          {kpis.map((k) => (
            <KpiCard
              key={k.label}
              label={k.label}
              value={k.q.data}
              isLoading={k.q.isLoading}
              isError={k.q.isError}
              tone={k.tone}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ChannelStatusCard() {
  const todayIso = useMemo(() => startOfTodayIso(), []);

  const channelQuery = useQuery({
    queryKey: ["sales-quote-send-queue", "channel-summary", todayIso],
    staleTime: 30_000,
    queryFn: async () => {
      const result: Record<string, { pending: number; sent: number; failed: number }> = {};
      await Promise.all(
        QUOTE_SHARE_CHANNELS.map(async (c) => {
          const [p, s, f] = await Promise.all([
            supabase
              .from("sales_quote_send_queue")
              .select("id", { count: "exact", head: true })
              .eq("channel", c)
              .eq("status", "pending"),
            supabase
              .from("sales_quote_send_queue")
              .select("id", { count: "exact", head: true })
              .eq("channel", c)
              .eq("status", "sent")
              .gte("created_at", todayIso),
            supabase
              .from("sales_quote_send_queue")
              .select("id", { count: "exact", head: true })
              .eq("channel", c)
              .eq("status", "failed")
              .gte("created_at", todayIso),
          ]);
          result[c] = {
            pending: p.count ?? 0,
            sent: s.count ?? 0,
            failed: f.count ?? 0,
          };
        }),
      );
      return result;
    },
  });

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="text-sm font-medium">وضعیت کانال‌ها</div>
        {channelQuery.isError ? (
          <div className="text-xs text-destructive">خطا در بارگذاری.</div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {QUOTE_SHARE_CHANNELS.map((c) => {
              const v = channelQuery.data?.[c];
              return (
                <div key={c} className="rounded-md border p-2 text-xs">
                  <div className="mb-1 font-medium">{QUOTE_SHARE_CHANNEL_LABELS[c]}</div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>pending</span>
                    <span>{v ? toFaDigits(v.pending) : "…"}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-emerald-600 dark:text-emerald-400">
                    <span>sent امروز</span>
                    <span>{v ? toFaDigits(v.sent) : "…"}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-destructive">
                    <span>failed امروز</span>
                    <span>{v ? toFaDigits(v.failed) : "…"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface ErrorRow {
  id: string;
  quote_id: string;
  channel: string;
  recipient: string;
  status: QuoteSendQueueStatus;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  updated_at: string | null;
  created_at: string;
  quote_number?: string | null;
}

function RecentErrorsCard() {
  const errorsQuery = useQuery({
    queryKey: ["sales-quote-send-queue", "recent-errors"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_quote_send_queue")
        .select(
          "id, quote_id, channel, recipient, status, attempts, max_attempts, last_error, updated_at, created_at",
        )
        .or("status.eq.failed,and(status.eq.pending,last_error.not.is.null)")
        .not("last_error", "is", null)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(10);
      if (error) throw error;
      const rows = (data ?? []) as Array<Omit<ErrorRow, "quote_number">>;
      const ids = Array.from(new Set(rows.map((r) => r.quote_id).filter(Boolean)));
      const map = new Map<string, string | null>();
      if (ids.length > 0) {
        const qr = await supabase.from("sales_quotes").select("id, quote_number").in("id", ids);
        if (!qr.error) {
          for (const r of qr.data ?? []) {
            map.set(r.id as string, (r.quote_number as string | null) ?? null);
          }
        }
      }
      return rows.map((r) => ({ ...r, quote_number: map.get(r.quote_id) ?? null })) as ErrorRow[];
    },
  });

  const rows = errorsQuery.data ?? [];

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="text-sm font-medium">خطاهای اخیر ارسال</div>
        {errorsQuery.isError ? (
          <div className="text-xs text-destructive">خطا در بارگذاری.</div>
        ) : errorsQuery.isLoading ? (
          <div className="text-xs text-muted-foreground">در حال بارگذاری…</div>
        ) : rows.length === 0 ? (
          <div className="text-xs text-muted-foreground">خطای اخیری ثبت نشده است.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-[11px] text-muted-foreground">
                <tr>
                  <th className="p-2 text-right font-medium">شماره</th>
                  <th className="p-2 text-right font-medium">کانال</th>
                  <th className="p-2 text-right font-medium">گیرنده</th>
                  <th className="p-2 text-right font-medium">تلاش‌ها</th>
                  <th className="p-2 text-right font-medium">آخرین خطا</th>
                  <th className="p-2 text-right font-medium">به‌روزرسانی</th>
                  <th className="p-2 text-right font-medium">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="p-2 font-mono">{r.quote_number ?? "—"}</td>
                    <td className="p-2">
                      {QUOTE_SHARE_CHANNEL_LABELS[r.channel as QuoteShareChannel] ?? r.channel}
                    </td>
                    <td className="p-2" dir="ltr">
                      {r.recipient}
                    </td>
                    <td className="p-2">
                      {toFaDigits(r.attempts)} / {toFaDigits(r.max_attempts)}
                    </td>
                    <td
                      className="p-2 max-w-[220px] truncate text-destructive"
                      title={r.last_error ?? ""}
                    >
                      {r.last_error ?? "—"}
                    </td>
                    <td className="p-2 text-[11px] text-muted-foreground">
                      {formatDateTimeFa(r.updated_at ?? r.created_at)}
                    </td>
                    <td className="p-2">
                      <Link
                        to="/sales/quotes/$quoteId"
                        params={{ quoteId: r.quote_id }}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" /> جزئیات
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
