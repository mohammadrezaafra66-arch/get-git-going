import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Search, Filter, Loader2, Inbox, ChevronRight, ChevronLeft,
  Ban, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useDebounce } from "@/hooks/use-debounce";
import { useAuth } from "@/lib/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { requirePermission } from "@/lib/rbac/route-guards";
import { formatNumber, formatDateTimeFa, toFaDigits } from "@/lib/i18n/formatters";
import {
  QUOTE_SHARE_CHANNELS, QUOTE_SHARE_CHANNEL_LABELS, type QuoteShareChannel,
} from "@/lib/sales/quote-share";
import {
  QUOTE_SEND_QUEUE_STATUSES, QUOTE_SEND_QUEUE_STATUS_LABELS,
  QUOTE_SEND_QUEUE_PAGE_SIZE, SIMULATED_ERROR_MESSAGE,
  type QuoteSendQueueStatus,
} from "@/lib/sales/quote-send-queue";

export const Route = createFileRoute("/_app/sales/send-queue")({
  beforeLoad: async () => { await requirePermission("sales", "view"); },
  component: SendQueuePage,
});

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
  const [page, setPage] = useState(1);

  useMemo(() => { setPage(1); }, [dSearch, channel, status, dateFrom, dateTo]);

  const listQuery = useQuery({
    enabled: !!user,
    queryKey: ["sales-quote-send-queue", { dSearch, channel, status, dateFrom, dateTo, page }],
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
          "id, quote_id, channel, recipient, status, attempts, max_attempts, last_error, scheduled_at, created_by, created_at",
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .range(from, to);

      if (channel !== "__all") q = q.eq("channel", channel);
      if (status !== "__all") q = q.eq("status", status);
      if (dateFrom) q = q.gte("created_at", new Date(dateFrom).toISOString());
      if (dateTo) {
        const d = new Date(dateTo); d.setHours(23, 59, 59, 999);
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
        const qr = await supabase.from("sales_quotes").select("id, quote_number").in("id", quoteIds);
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

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Filter className="h-4 w-4" /> فیلترها
          </div>
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
              <SelectTrigger><SelectValue placeholder="کانال" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">همه کانال‌ها</SelectItem>
                {QUOTE_SHARE_CHANNELS.map((c) => (
                  <SelectItem key={c} value={c}>{QUOTE_SHARE_CHANNEL_LABELS[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue placeholder="وضعیت" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">همه وضعیت‌ها</SelectItem>
                {QUOTE_SEND_QUEUE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{QUOTE_SEND_QUEUE_STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
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
                        <th className="p-3 text-right font-medium">آخرین خطا</th>
                        <th className="p-3 text-right font-medium">عملیات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rows.map((r) => (
                        <tr key={r.id} className="hover:bg-muted/30">
                          <td className="p-3 align-top font-mono text-xs">{r.quote_number ?? "—"}</td>
                          <td className="p-3 align-top">
                            {QUOTE_SHARE_CHANNEL_LABELS[r.channel as QuoteShareChannel] ?? r.channel}
                          </td>
                          <td className="p-3 align-top" dir="ltr">{r.recipient}</td>
                          <td className="p-3 align-top">
                            <Badge variant="outline">
                              {QUOTE_SEND_QUEUE_STATUS_LABELS[r.status] ?? r.status}
                            </Badge>
                          </td>
                          <td className="p-3 align-top text-xs">
                            {toFaDigits(r.attempts)} / {toFaDigits(r.max_attempts)}
                          </td>
                          <td className="p-3 align-top text-[11px] text-muted-foreground">
                            {formatDateTimeFa(r.scheduled_at)}
                          </td>
                          <td className="p-3 align-top text-[11px] text-destructive max-w-[180px] truncate" title={r.last_error ?? ""}>
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
                    <div className="font-mono text-xs text-muted-foreground">{r.quote_number ?? "—"}</div>
                    <Badge variant="outline">
                      {QUOTE_SEND_QUEUE_STATUS_LABELS[r.status] ?? r.status}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">کانال</span>
                    <span>{QUOTE_SHARE_CHANNEL_LABELS[r.channel as QuoteShareChannel] ?? r.channel}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">گیرنده</span>
                    <span dir="ltr">{r.recipient}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">تلاش‌ها</span>
                    <span>{toFaDigits(r.attempts)} / {toFaDigits(r.max_attempts)}</span>
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
              صفحه {toFaDigits(page)} از {toFaDigits(totalPages)} — مجموع {formatNumber(total)} رکورد
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                <ChevronRight className="h-4 w-4" /> قبلی
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
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
  row, isManagerial, isOwner,
}: { row: QueueRow; isManagerial: boolean; isOwner: boolean }) {
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

  if (!canCancel && !showSimulate) {
    return <span className="text-[11px] text-muted-foreground">—</span>;
  }

  const busy = cancelMut.isPending || successMut.isPending || failureMut.isPending;

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
    </div>
  );
}