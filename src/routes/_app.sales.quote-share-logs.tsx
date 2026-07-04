import { createFileRoute } from "@tanstack/react-router";
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
  CheckCircle2,
  XCircle,
  Send,
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
  QUOTE_SHARE_STATUSES,
  QUOTE_SHARE_STATUS_LABELS,
  QUOTE_SHARE_LOGS_PAGE_SIZE,
  type QuoteShareChannel,
  type QuoteShareStatus,
} from "@/lib/sales/quote-share";

export const Route = createFileRoute("/_app/sales/quote-share-logs")({
  beforeLoad: async () => {
    await requirePermission("sales", "view");
  },
  component: QuoteShareLogsPage,
});

interface ShareLogRow {
  id: string;
  quote_id: string;
  channel: string;
  recipient: string;
  status: string;
  pdf_attached: boolean;
  message_text: string | null;
  attempted_by: string | null;
  attempted_at: string;
  quote_number?: string | null;
  attempted_by_name?: string | null;
}

function QuoteShareLogsPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const dSearch = useDebounce(search, 350);
  const [channel, setChannel] = useState<string>("__all");
  const [status, setStatus] = useState<string>("__all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [page, setPage] = useState(1);

  useMemo(() => {
    setPage(1);
  }, [dSearch, channel, status, dateFrom, dateTo]);

  const listQuery = useQuery({
    enabled: !!user,
    queryKey: ["sales-quote-share-logs", { dSearch, channel, status, dateFrom, dateTo, page }],
    staleTime: 30_000,
    queryFn: async () => {
      const from = (page - 1) * QUOTE_SHARE_LOGS_PAGE_SIZE;
      const to = from + QUOTE_SHARE_LOGS_PAGE_SIZE - 1;

      // If searching by quote number, resolve matching quote IDs first
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
        .from("sales_quote_share_logs")
        .select(
          "id, quote_id, channel, recipient, status, pdf_attached, message_text, attempted_by, attempted_at",
          { count: "exact" },
        )
        .order("attempted_at", { ascending: false })
        .range(from, to);

      if (channel !== "__all") q = q.eq("channel", channel);
      if (status !== "__all") q = q.eq("status", status);
      if (dateFrom) q = q.gte("attempted_at", new Date(dateFrom).toISOString());
      if (dateTo) {
        const d = new Date(dateTo);
        d.setHours(23, 59, 59, 999);
        q = q.lte("attempted_at", d.toISOString());
      }
      if (term.length >= 2) {
        const safe = term.replace(/[%_]/g, "");
        if (quoteIdsFilter && quoteIdsFilter.length > 0) {
          // Match recipient OR matching quote IDs
          q = q.or(`recipient.ilike.%${safe}%,quote_id.in.(${quoteIdsFilter.join(",")})`);
        } else {
          q = q.ilike("recipient", `%${safe}%`);
        }
      }

      const { data, error, count } = await q;
      if (error) throw error;
      const baseRows = (data ?? []) as Array<
        Omit<ShareLogRow, "quote_number" | "attempted_by_name">
      >;

      // Hydrate quote numbers
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

      // Hydrate attempted_by names
      const userIds = Array.from(
        new Set(baseRows.map((r) => r.attempted_by).filter((x): x is string => !!x)),
      );
      const userMap = new Map<string, string | null>();
      if (userIds.length > 0) {
        const pr = await supabase.from("profiles").select("id, full_name").in("id", userIds);
        if (!pr.error) {
          for (const p of pr.data ?? []) {
            userMap.set(p.id as string, (p.full_name as string | null) ?? null);
          }
        }
      }

      const rows: ShareLogRow[] = baseRows.map((r) => ({
        ...r,
        quote_number: quoteMap.get(r.quote_id) ?? null,
        attempted_by_name: r.attempted_by ? (userMap.get(r.attempted_by) ?? null) : null,
      }));
      return { rows, total: count ?? 0 };
    },
  });

  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / QUOTE_SHARE_LOGS_PAGE_SIZE));
  const rows = listQuery.data?.rows ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="سوابق ارسال پیش‌فاکتور"
        description="پیش‌نویس‌ها و سوابق آماده‌سازی ارسال پیش‌فاکتورها در پیام‌رسان‌ها"
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
                {QUOTE_SHARE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {QUOTE_SHARE_STATUS_LABELS[s]}
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
          title="سابقه‌ای یافت نشد."
          description="با ثبت پیش‌نویس ارسال از صفحه پیش‌فاکتور، اولین سابقه ایجاد می‌شود."
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
                        <th className="p-3 text-right font-medium">PDF</th>
                        <th className="p-3 text-right font-medium">ثبت‌کننده</th>
                        <th className="p-3 text-right font-medium">زمان</th>
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
                            <Badge variant="outline">
                              {QUOTE_SHARE_STATUS_LABELS[r.status as QuoteShareStatus] ?? r.status}
                            </Badge>
                          </td>
                          <td className="p-3 align-top">
                            {r.pdf_attached ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <XCircle className="h-4 w-4 text-muted-foreground" />
                            )}
                          </td>
                          <td className="p-3 align-top text-xs text-muted-foreground">
                            {r.attempted_by_name ?? "—"}
                          </td>
                          <td className="p-3 align-top text-[11px] text-muted-foreground">
                            {formatDateTimeFa(r.attempted_at)}
                          </td>
                          <td className="p-3 align-top">
                            <EnqueueButton row={r} />
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
                    <Badge variant="outline">
                      {QUOTE_SHARE_STATUS_LABELS[r.status as QuoteShareStatus] ?? r.status}
                    </Badge>
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
                    <span className="text-muted-foreground">PDF</span>
                    <span>{r.pdf_attached ? "بله" : "خیر"}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{r.attempted_by_name ?? "—"}</span>
                    <span>{formatDateTimeFa(r.attempted_at)}</span>
                  </div>
                  <EnqueueButton row={r} />
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            <div className="text-xs text-muted-foreground">
              صفحه {toFaDigits(page)} از {toFaDigits(totalPages)} — مجموع {formatNumber(total)}{" "}
              سابقه
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

function EnqueueButton({ row }: { row: ShareLogRow }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("ابتدا وارد حساب شوید.");
      // Check duplicate pending/processing
      const dup = await supabase
        .from("sales_quote_send_queue")
        .select("id, status")
        .eq("share_log_id", row.id)
        .in("status", ["pending", "processing"])
        .limit(1);
      if (dup.error) throw dup.error;
      if ((dup.data ?? []).length > 0) {
        throw new Error("این پیش‌نویس قبلاً در صف ارسال قرار گرفته است.");
      }
      const { error } = await supabase.from("sales_quote_send_queue").insert({
        share_log_id: row.id,
        quote_id: row.quote_id,
        channel: row.channel,
        recipient: row.recipient,
        message_text: row.message_text,
        pdf_attached: row.pdf_attached,
        status: "pending",
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("به صف ارسال اضافه شد.");
      qc.invalidateQueries({ queryKey: ["sales-quote-send-queue"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "خطا در افزودن به صف."),
  });

  if (row.status !== "draft") {
    return <span className="text-[11px] text-muted-foreground">—</span>;
  }

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
    >
      {mutation.isPending ? (
        <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" />
      ) : (
        <Send className="ml-1 h-3.5 w-3.5" />
      )}
      افزودن به صف ارسال
    </Button>
  );
}
