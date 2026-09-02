import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Search,
  Filter,
  Loader2,
  FileText,
  ChevronRight,
  ChevronLeft,
  Plus,
  Send,
  CheckCircle2,
  XCircle,
  Ban,
  Eye,
  FileDown,
  MessageCircle,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { PersianDatePicker } from "@/components/common/PersianDatePicker";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDebounce } from "@/hooks/use-debounce";
import { useAuth } from "@/lib/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { formatNumber, formatDateTimeFa, formatDateFa, toFaDigits } from "@/lib/i18n/formatters";
import { QuoteStatusBadge } from "@/components/sales/quotes/QuoteStatusBadge";
import { SALES_QUOTES_PAGE_SIZE, type SalesQuoteStatus } from "@/lib/sales/quotes";
import { downloadQuotePdf } from "@/lib/sales/quote-pdf";
import { ShareQuoteDialog } from "@/components/sales/quotes/ShareQuoteDialog";
import { QuoteAccountingMarkers } from "@/components/sales/quotes/QuoteAccountingMarkers";
import { useServerFn } from "@tanstack/react-start";
import { updateQuoteStatus } from "@/lib/sales/quote-status.functions";

const STATUS_LABELS_FA: Record<SalesQuoteStatus, string> = {
  draft: "پیش‌نویس",
  sent: "ارسال‌شده",
  accepted: "پذیرفته‌شده",
  rejected: "رد شده",
  canceled: "لغو شده",
};

export const Route = createFileRoute("/_app/sales/quotes/")({
  component: QuotesListPage,
});

interface QuoteRow {
  id: string;
  quote_number: string;
  customer_name: string;
  customer_id: string | null;
  customer_phone: string;
  salesperson_id: string | null;
  status: SalesQuoteStatus;
  final_amount: number;
  expires_at: string | null;
  created_at: string;
  accounting_registered_at: string | null;
  accounting_registered_by: string | null;
  accounting_sent_at: string | null;
  accounting_sent_by: string | null;
  accounting_registered_by_name?: string | null;
  accounting_sent_by_name?: string | null;
  reject_reason?: string | null;
  salesperson?: { id: string; full_name: string | null } | null;
}

function QuotesListPage() {
  const { user, roles } = useAuth();
  const isPrivileged =
    roles.includes("admin") || roles.includes("manager") || roles.includes("accountant");
  const isManagerial = roles.includes("admin") || roles.includes("manager");
  const isAccountant = roles.includes("accountant");
  const isSalesOnly = !isPrivileged && roles.includes("sales");
  const canCreate = roles.includes("admin") || roles.includes("manager") || roles.includes("sales");

  const [search, setSearch] = useState("");
  const dSearch = useDebounce(search, 350);
  const [status, setStatus] = useState<string>("__all");
  const [salespersonId, setSalespersonId] = useState<string>("__all");
  // Step 4 — a guest quote is one with no customer file: customer_id IS NULL. Kept as a separate
  // filter rather than folded into the status list, because it is orthogonal to status: a guest
  // quote can be a draft, sent, accepted or rejected like any other.
  const [linkFilter, setLinkFilter] = useState<string>("__all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [page, setPage] = useState(1);

  useMemo(() => {
    setPage(1);
  }, [dSearch, status, salespersonId, dateFrom, dateTo]);

  const { data: salespeople = [] } = useQuery({
    enabled: isPrivileged,
    queryKey: ["sales-quotes-salespeople"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const listQuery = useQuery({
    queryKey: [
      "sales-quotes",
      {
        dSearch,
        status,
        salespersonId,
        linkFilter,
        dateFrom,
        dateTo,
        page,
        userId: user?.id,
        isSalesOnly,
      },
    ],
    enabled: !!user,
    queryFn: async () => {
      const from = (page - 1) * SALES_QUOTES_PAGE_SIZE;
      const to = from + SALES_QUOTES_PAGE_SIZE - 1;
      let q = supabase
        .from("sales_quotes")
        .select(
          "id, quote_number, customer_name, customer_phone, customer_id, salesperson_id, status, final_amount, expires_at, created_at, accounting_registered_at, accounting_registered_by, accounting_sent_at, accounting_sent_by, reject_reason",
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .range(from, to);
      if (isSalesOnly && user) q = q.eq("salesperson_id", user.id);
      if (status !== "__all") q = q.eq("status", status as SalesQuoteStatus);
      if (linkFilter === "guest") q = q.is("customer_id", null);
      if (linkFilter === "linked") q = q.not("customer_id", "is", null);
      if (isPrivileged && salespersonId !== "__all") q = q.eq("salesperson_id", salespersonId);
      if (dateFrom) q = q.gte("created_at", new Date(dateFrom).toISOString());
      if (dateTo) {
        const d = new Date(dateTo);
        d.setHours(23, 59, 59, 999);
        q = q.lte("created_at", d.toISOString());
      }
      const term = dSearch.trim();
      if (term.length >= 2) {
        const safe = term.replace(/[%_]/g, "");
        q = q.or(
          `quote_number.ilike.%${safe}%,customer_name.ilike.%${safe}%,customer_phone.ilike.%${safe}%`,
        );
      }
      const { data, error, count } = await q;
      if (error) throw error;
      const baseRows = (data ?? []) as Array<Omit<QuoteRow, "salesperson">>;
      const profileIds = Array.from(
        new Set(
          baseRows
            .flatMap((r) => [r.salesperson_id, r.accounting_registered_by, r.accounting_sent_by])
            .filter((x): x is string => !!x),
        ),
      );
      let profileMap = new Map<string, string | null>();
      if (profileIds.length > 0) {
        const sr = await supabase.from("profiles").select("id, full_name").in("id", profileIds);
        if (!sr.error)
          profileMap = new Map(
            (sr.data ?? []).map((p) => [p.id as string, (p.full_name as string | null) ?? null]),
          );
      }
      const rows: QuoteRow[] = baseRows.map((r) => ({
        ...r,
        accounting_registered_by_name: r.accounting_registered_by
          ? (profileMap.get(r.accounting_registered_by) ?? null)
          : null,
        accounting_sent_by_name: r.accounting_sent_by
          ? (profileMap.get(r.accounting_sent_by) ?? null)
          : null,
        salesperson: r.salesperson_id
          ? { id: r.salesperson_id, full_name: profileMap.get(r.salesperson_id) ?? null }
          : null,
      }));
      return { rows, total: count ?? 0 };
    },
    staleTime: 30_000,
  });

  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / SALES_QUOTES_PAGE_SIZE));
  const rows = listQuery.data?.rows ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="پیش‌فاکتورهای فروش"
        description="ثبت و پیگیری پیش‌فاکتورهای داخلی فروش"
        actions={
          canCreate ? (
            <Button asChild size="sm">
              <Link to="/sales/quotes/new">
                <Plus className="ml-1 h-4 w-4" /> پیش‌فاکتور جدید
              </Link>
            </Button>
          ) : undefined
        }
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
                placeholder="شماره پیش‌فاکتور، نام مشتری یا شماره تماس"
                className="pr-9"
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue placeholder="وضعیت" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">همه وضعیت‌ها</SelectItem>
                <SelectItem value="draft">پیش‌نویس</SelectItem>
                <SelectItem value="sent">ارسال‌شده</SelectItem>
                <SelectItem value="accepted">پذیرفته‌شده</SelectItem>
                <SelectItem value="rejected">ردشده</SelectItem>
                <SelectItem value="canceled">لغوشده</SelectItem>
              </SelectContent>
            </Select>
            <Select value={linkFilter} onValueChange={setLinkFilter}>
              <SelectTrigger data-testid="quote-list-link-filter">
                <SelectValue placeholder="اتصال به پرونده" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">همه (متصل و مهمان)</SelectItem>
                <SelectItem value="guest">فقط مهمان</SelectItem>
                <SelectItem value="linked">فقط متصل به پرونده</SelectItem>
              </SelectContent>
            </Select>
            {isPrivileged && (
              <Select value={salespersonId} onValueChange={setSalespersonId}>
                <SelectTrigger>
                  <SelectValue placeholder="فروشنده" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">همه فروشنده‌ها</SelectItem>
                  {salespeople.map((p: { id: string; full_name: string | null }) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name ?? "—"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
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
          icon={FileText}
          title="پیش‌فاکتوری ثبت نشده است."
          description={
            canCreate
              ? "برای ثبت اولین پیش‌فاکتور، روی دکمه «پیش‌فاکتور جدید» کلیک کنید."
              : undefined
          }
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
                        <th className="p-3 text-right font-medium">شماره</th>
                        <th className="p-3 text-right font-medium">مشتری</th>
                        <th className="p-3 text-right font-medium">فروشنده</th>
                        <th className="p-3 text-right font-medium">وضعیت</th>
                        <th className="p-3 text-right font-medium">مبلغ نهایی</th>
                        <th className="p-3 text-right font-medium">تاریخ ایجاد</th>
                        <th className="p-3 text-right font-medium">اعتبار</th>
                        <th className="p-3 text-right font-medium">عملیات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rows.map((r) => (
                        <QuoteRowDesktop
                          key={r.id}
                          row={r}
                          isManagerial={isManagerial}
                          isAccountant={isAccountant}
                          isOwner={r.salesperson_id === user?.id}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="space-y-3 md:hidden">
            {rows.map((r) => (
              <QuoteCardMobile
                key={r.id}
                row={r}
                isManagerial={isManagerial}
                isAccountant={isAccountant}
                isOwner={r.salesperson_id === user?.id}
              />
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            <div className="text-xs text-muted-foreground">
              صفحه {toFaDigits(page)} از {toFaDigits(totalPages)} — مجموع {formatNumber(total)}{" "}
              پیش‌فاکتور
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

interface RowProps {
  row: QuoteRow;
  isManagerial: boolean;
  isAccountant: boolean;
  isOwner: boolean;
}

function useStatusActions(
  row: QuoteRow,
  isManagerial: boolean,
  isAccountant: boolean,
  isOwner: boolean,
) {
  const qc = useQueryClient();
  const updateQuoteStatusFn = useServerFn(updateQuoteStatus);
  const mutation = useMutation({
    mutationFn: async (payload: { next: SalesQuoteStatus; reason?: string }) => {
      await updateQuoteStatusFn({
        data: { id: row.id, next: payload.next, reason: payload.reason },
      });
    },
    onSuccess: () => {
      toast.success("وضعیت پیش‌فاکتور به‌روزرسانی شد.");
      qc.invalidateQueries({ queryKey: ["sales-quotes"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "خطا در تغییر وضعیت."),
  });

  const canSend = (isManagerial || isOwner) && row.status === "draft";
  const canAccept = isManagerial && row.status === "sent";
  const canReject = (isManagerial || isAccountant || isOwner) && row.status === "sent";
  const canCancel = (isManagerial || isOwner) && (row.status === "draft" || row.status === "sent");

  return { mutation, canSend, canAccept, canReject, canCancel };
}

function RowActions({ row, isManagerial, isAccountant, isOwner }: RowProps) {
  const { mutation, canSend, canAccept, canReject, canCancel } = useStatusActions(
    row,
    isManagerial,
    isAccountant,
    isOwner,
  );
  const [confirm, setConfirm] = useState<null | {
    next: SalesQuoteStatus;
    label: string;
    needsReason?: boolean;
    reasonLabel?: string;
    reasonPlaceholder?: string;
  }>(null);
  const [reason, setReason] = useState("");

  return (
    <>
      <div className="flex flex-wrap gap-1">
        <QuoteAccountingMarkers
          quoteId={row.id}
          state={{
            accounting_registered_at: row.accounting_registered_at,
            accounting_registered_by_name: row.accounting_registered_by_name,
            accounting_sent_at: row.accounting_sent_at,
            accounting_sent_by_name: row.accounting_sent_by_name,
          }}
        />
        {canSend && (
          <Button
            size="sm"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => setConfirm({ next: "sent", label: "ارسال پیش‌فاکتور" })}
          >
            <Send className="ml-1 h-3.5 w-3.5" /> ارسال
          </Button>
        )}
        {canAccept && (
          <Button
            size="sm"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => setConfirm({ next: "accepted", label: "پذیرش پیش‌فاکتور" })}
          >
            <CheckCircle2 className="ml-1 h-3.5 w-3.5" /> پذیرش
          </Button>
        )}
        {canReject && (
          <Button
            size="sm"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => {
              setReason("");
              setConfirm({
                next: "rejected",
                label: "رد پیش‌فاکتور",
                needsReason: true,
                reasonLabel: "دلیل رد پیش‌فاکتور *",
                reasonPlaceholder:
                  "دلیل کامل رد را بنویسید؛ این متن برای کارشناس فروش نمایش داده می‌شود.",
              });
            }}
          >
            <XCircle className="ml-1 h-3.5 w-3.5" /> رد
          </Button>
        )}
        {canCancel && (
          <Button
            size="sm"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => {
              setReason("");
              setConfirm({
                next: "canceled",
                label: "لغو پیش‌فاکتور",
                needsReason: true,
                reasonLabel: "دلیل لغو پیش‌فاکتور *",
                reasonPlaceholder: "دلیل لغو را بنویسید.",
              });
            }}
          >
            <Ban className="ml-1 h-3.5 w-3.5" /> لغو
          </Button>
        )}
        <ShareQuoteMenu row={row} />
      </div>
      <AlertDialog
        open={!!confirm}
        onOpenChange={(o) => {
          if (!o) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.label}</AlertDialogTitle>
            <AlertDialogDescription>
              آیا از این تغییر وضعیت مطمئن هستید؟ این عملیات ثبت می‌شود.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirm?.needsReason && (
            <div className="space-y-2 py-2">
              <label className="text-xs text-muted-foreground">{confirm.reasonLabel}</label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={confirm.reasonPlaceholder}
                rows={5}
                maxLength={2000}
              />
              <div className="text-[11px] text-muted-foreground">
                این توضیح در جزئیات پیش‌فاکتور ذخیره می‌شود.
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              disabled={Boolean(confirm?.needsReason && !reason.trim())}
              onClick={() => {
                if (!confirm) return;
                mutation.mutate({
                  next: confirm.next,
                  reason: confirm.needsReason ? reason.trim() || undefined : undefined,
                });
                setConfirm(null);
              }}
            >
              تایید
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function QuoteRowDesktop({ row, isManagerial, isAccountant, isOwner }: RowProps) {
  return (
    <tr className="hover:bg-muted/30">
      <td className="p-3 align-top font-mono text-xs">
        {/* Phase 6.6 — the detail route existed but nothing linked to it, so the
            page was unreachable by clicking. Only the number navigates; the five
            status-action buttons in the last column are left alone. */}
        <Link
          to="/sales/quotes/$quoteId"
          params={{ quoteId: row.id }}
          className="text-primary hover:underline"
        >
          {row.quote_number}
        </Link>
      </td>
      <td className="p-3 align-top">
        <div className="flex items-center gap-1.5">
          <div className="font-medium">{row.customer_name}</div>
          {!row.customer_id && (
            <Badge
              variant="outline"
              data-testid="quote-list-guest-badge"
              className="shrink-0 px-1 py-0 text-[10px] font-normal text-muted-foreground"
            >
              مهمان
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground" dir="ltr">
          {row.customer_phone}
        </div>
      </td>
      <td className="p-3 align-top text-xs text-muted-foreground">
        {row.salesperson?.full_name ?? "—"}
      </td>
      <td className="p-3 align-top">
        <QuoteStatusBadge status={row.status} />
      </td>
      <td className="p-3 align-top font-medium">
        {formatNumber(row.final_amount)}{" "}
        <span className="text-xs text-muted-foreground">تومان</span>
      </td>
      <td className="p-3 align-top text-[11px] text-muted-foreground">
        {formatDateTimeFa(row.created_at)}
      </td>
      <td className="p-3 align-top text-[11px] text-muted-foreground">
        {row.expires_at ? formatDateFa(row.expires_at) : "—"}
      </td>
      <td className="p-3 align-top">
        <RowActions
          row={row}
          isManagerial={isManagerial}
          isAccountant={isAccountant}
          isOwner={isOwner}
        />
      </td>
    </tr>
  );
}

function QuoteCardMobile({ row, isManagerial, isAccountant, isOwner }: RowProps) {
  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              to="/sales/quotes/$quoteId"
              params={{ quoteId: row.id }}
              className="font-mono text-xs text-primary hover:underline"
            >
              {row.quote_number}
            </Link>
            <div className="flex items-center gap-1.5">
              <div className="font-medium truncate">{row.customer_name}</div>
              {!row.customer_id && (
                <Badge
                  variant="outline"
                  data-testid="quote-list-guest-badge"
                  className="shrink-0 px-1 py-0 text-[10px] font-normal text-muted-foreground"
                >
                  مهمان
                </Badge>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground" dir="ltr">
              {row.customer_phone}
            </div>
          </div>
          <QuoteStatusBadge status={row.status} />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">مبلغ نهایی</span>
          <span className="font-medium">{formatNumber(row.final_amount)} تومان</span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{row.salesperson?.full_name ?? "—"}</span>
          <span>{formatDateTimeFa(row.created_at)}</span>
        </div>
        <RowActions
          row={row}
          isManagerial={isManagerial}
          isAccountant={isAccountant}
          isOwner={isOwner}
        />
      </CardContent>
    </Card>
  );
}

function ShareQuoteMenu({ row }: { row: QuoteRow }) {
  const [pdfLoading, setPdfLoading] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const handleDownloadPdf = async () => {
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
      const { data: quote, error: qErr } = await supabase
        .from("sales_quotes")
        .select(
          "id, quote_number, customer_name, customer_phone, customer_note, salesperson_id, status, subtotal_amount, discount_amount, final_amount, expires_at, created_at",
        )
        .eq("id", row.id)
        .maybeSingle();
      if (qErr) throw qErr;
      if (!quote) throw new Error("پیش‌فاکتور یافت نشد.");

      let salespersonName: string | null = row.salesperson?.full_name ?? null;
      if (!salespersonName && quote.salesperson_id) {
        const { data: sp } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", quote.salesperson_id)
          .maybeSingle();
        salespersonName = (sp?.full_name as string | null) ?? null;
      }

      const { data: itemRows, error: iErr } = await supabase
        .from("sales_quote_items")
        .select(
          "title_snapshot, free_item_name, sku_snapshot, quantity, unit_price, discount_amount, line_total, created_at",
        )
        .eq("quote_id", row.id)
        .order("created_at", { ascending: true });
      if (iErr) throw iErr;

      const items = (itemRows ?? []).map((it) => ({
        title: (it.title_snapshot as string | null) ?? (it.free_item_name as string | null) ?? "—",
        sku: (it.sku_snapshot as string | null) ?? null,
        quantity: Number(it.quantity ?? 0),
        unit_price: Number(it.unit_price ?? 0),
        discount_amount: Number(it.discount_amount ?? 0),
        line_total: Number(it.line_total ?? 0),
      }));

      await downloadQuotePdf({
        quote_number: quote.quote_number as string,
        customer_name: quote.customer_name as string,
        customer_phone: quote.customer_phone as string,
        salesperson_name: salespersonName,
        created_at: quote.created_at as string,
        expires_at: (quote.expires_at as string | null) ?? null,
        status_label:
          STATUS_LABELS_FA[quote.status as SalesQuoteStatus] ?? (quote.status as string),
        customer_note: (quote.customer_note as string | null) ?? null,
        items,
        subtotal_amount: Number(quote.subtotal_amount ?? 0),
        discount_amount: Number(quote.discount_amount ?? 0),
        final_amount: Number(quote.final_amount ?? 0),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در ساخت PDF پیش‌فاکتور");
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" disabled={pdfLoading}>
            {pdfLoading ? (
              <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="ml-1 h-3.5 w-3.5" />
            )}
            ارسال پیش‌فاکتور
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[200px]">
          <DropdownMenuItem asChild>
            <Link to="/sales/quotes/$quoteId" params={{ quoteId: row.id }}>
              <Eye className="ml-2 h-4 w-4" /> مشاهده پیش‌فاکتور
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={pdfLoading}
            onSelect={(e) => {
              e.preventDefault();
              void handleDownloadPdf();
            }}
          >
            {pdfLoading ? (
              <Loader2 className="ml-2 h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="ml-2 h-4 w-4" />
            )}
            <span className="flex-1">دانلود PDF</span>
            {pdfLoading && (
              <span className="text-[10px] text-muted-foreground">در حال آماده‌سازی…</span>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setShareOpen(true);
            }}
          >
            <MessageCircle className="ml-2 h-4 w-4" />
            <span className="flex-1">ارسال در پیام‌رسان</span>
            <span className="text-[10px] text-muted-foreground">پیش‌نویس</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ShareQuoteDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        quoteId={row.id}
        quoteNumber={row.quote_number}
        defaultRecipient={row.customer_phone}
      />
    </>
  );
}
