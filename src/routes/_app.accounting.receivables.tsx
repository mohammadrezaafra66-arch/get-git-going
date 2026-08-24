import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarIcon, Loader2, Search, X, Eye } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { toFaDigits, formatDateFa } from "@/lib/i18n/formatters";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";

import { PageHeader } from "@/components/common/PageHeader";
import { AgingBucketBadge, AgingBucketCards } from "@/components/accounting/AgingBuckets";
import type { AgingBucket } from "@/lib/accounting/aging";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

export const Route = createFileRoute("/_app/accounting/receivables")({
  // M6/OG-24 — mirrors the requireAnyRole call below. The shared guard cannot decide
  // during SSR or while roles load, so RouteRoleGate in _app enforces this on the client.
  staticData: { gate: { kind: "anyRole", allowed: ["admin", "manager", "accountant"] } },
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager", "accountant"]);
  },
  component: ReceivablesPage,
});

type DueFilter = "all" | "overdue" | "today" | "tomorrow" | "future" | AgingBucket;

type SummaryRow = {
  total_outstanding: number;
  overdue_outstanding: number;
  due_today: number;
  due_tomorrow: number;
  future_outstanding: number;
  items_count: number;
  bucket_current: number;
  bucket_d1_30: number;
  bucket_d31_60: number;
  bucket_d61_90: number;
  bucket_d90_plus: number;
  count_current: number;
  count_d1_30: number;
  count_d31_60: number;
  count_d61_90: number;
  count_d90_plus: number;
};

type ListRow = {
  customer_id: string | null;
  customer_name: string | null;
  invoice_id: string;
  invoice_number: string | null;
  invoice_type: string | null;
  invoice_status: string | null;
  due_date: string | null;
  total_amount: number | null;
  deposit_amount: number | null;
  confirmed_paid_amount: number | null;
  outstanding_amount: number | null;
  days_until_due: number | null;
  is_overdue: boolean | null;
  created_at: string;
  aging_bucket: string | null;
};

type DetailRow = {
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  invoice_id: string;
  invoice_number: string | null;
  invoice_type: string | null;
  invoice_status: string | null;
  issue_date: string | null;
  due_date: string | null;
  total_amount: number | null;
  deposit_amount: number | null;
  confirmed_paid_amount: number | null;
  outstanding_amount: number | null;
  is_overdue: boolean | null;
  receipt_id: string | null;
  receipt_amount: number | null;
  receipt_status: string | null;
  receipt_payment_date: string | null;
  receipt_tracking_number: string | null;
  receipt_bank_name: string | null;
};

const NA = "نامشخص";

function fmtMoney(n: number | null | undefined) {
  if (n == null) return NA;
  return `${toFaDigits(Math.round(Number(n)).toLocaleString("en-US"))} تومان`;
}
function fmtNum(n: number | null | undefined) {
  if (n == null) return toFaDigits("0");
  return toFaDigits(Number(n).toLocaleString("en-US"));
}
function fmtDate(s: string | null | undefined) {
  if (!s) return NA;
  try {
    return formatDateFa(s);
  } catch {
    return s;
  }
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger" | "warn" | "info" | "muted";
}) {
  const toneCls =
    tone === "danger"
      ? "text-destructive"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "info"
          ? "text-primary"
          : tone === "muted"
            ? "text-muted-foreground"
            : "";
  return (
    <Card>
      <CardContent className="p-4 space-y-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={cn("text-lg font-semibold", toneCls)}>{value}</div>
      </CardContent>
    </Card>
  );
}

function ReceivablesPage() {
  const [fromDate, setFromDate] = useState<Date | undefined>();
  const [toDate, setToDate] = useState<Date | undefined>();
  const [dueFilter, setDueFilter] = useState<DueFilter>("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 400);
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);
  const [detailInvoiceId, setDetailInvoiceId] = useState<string | null>(null);

  const fromIso = fromDate ? format(fromDate, "yyyy-MM-dd") : undefined;
  const toIso = toDate ? format(toDate, "yyyy-MM-dd") : undefined;

  const summaryQ = useQuery({
    queryKey: ["receivables-summary", fromIso, toIso],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_receivables_summary", {
        p_from_date: fromIso,
        p_to_date: toIso,
        p_customer_id: undefined,
      });
      if (error) throw error;
      const row = (data as SummaryRow[] | null)?.[0] ?? null;
      return row;
    },
    staleTime: 30_000,
  });

  const listQ = useQuery({
    queryKey: ["receivables-list", fromIso, toIso, dueFilter, debouncedSearch, pageSize, page],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_receivables_list", {
        p_from_date: fromIso,
        p_to_date: toIso,
        p_customer_id: undefined,
        p_due_filter: dueFilter,
        p_search: debouncedSearch || undefined,
        p_limit: pageSize,
        p_offset: page * pageSize,
      });
      if (error) throw error;
      return (data as ListRow[] | null) ?? [];
    },
    staleTime: 30_000,
  });

  const detailQ = useQuery({
    queryKey: ["receivable-detail", detailInvoiceId],
    enabled: !!detailInvoiceId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_receivable_detail", {
        p_customer_id: undefined,
        p_invoice_id: detailInvoiceId ?? undefined,
      });
      if (error) throw error;
      return (data as DetailRow[] | null) ?? [];
    },
  });

  const isForbidden = (e: unknown) => {
    const msg = (e as { message?: string } | null)?.message ?? "";
    return /forbidden|permission denied|42501/i.test(msg);
  };

  const errMsg = (e: unknown) =>
    isForbidden(e)
      ? "شما دسترسی مشاهده این گزارش را ندارید."
      : "دریافت گزارش مطالبات با خطا مواجه شد.";

  const summary = summaryQ.data;

  return (
    <div className="space-y-4 p-4" dir="rtl">
      <PageHeader
        title="مطالبات مشتریان"
        description="گزارش طلب‌های قابل وصول بر اساس فاکتورهای دارای تعهد."
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryCard
          label="کل مطالبات"
          value={summaryQ.isLoading ? "…" : fmtMoney(summary?.total_outstanding ?? 0)}
          tone="info"
        />
        <SummaryCard
          label="معوق"
          value={summaryQ.isLoading ? "…" : fmtMoney(summary?.overdue_outstanding ?? 0)}
          tone="danger"
        />
        <SummaryCard
          label="سررسید امروز"
          value={summaryQ.isLoading ? "…" : fmtMoney(summary?.due_today ?? 0)}
          tone="warn"
        />
        <SummaryCard
          label="سررسید فردا"
          value={summaryQ.isLoading ? "…" : fmtMoney(summary?.due_tomorrow ?? 0)}
          tone="warn"
        />
        <SummaryCard
          label="آینده"
          value={summaryQ.isLoading ? "…" : fmtMoney(summary?.future_outstanding ?? 0)}
          tone="muted"
        />
        <SummaryCard
          label="تعداد آیتم‌ها"
          value={summaryQ.isLoading ? "…" : fmtNum(summary?.items_count ?? 0)}
        />
      </div>

      {/* Aging buckets */}
      <div className="space-y-2">
        <div className="text-sm font-medium text-muted-foreground">سطل‌های سنی مطالبات</div>
        <AgingBucketCards
          summary={summary as unknown as Record<string, unknown> | null}
          isLoading={summaryQ.isLoading}
          fmtMoney={fmtMoney}
          activeBucket={dueFilter}
          onSelect={(b) => {
            setDueFilter((prev) => (prev === b ? "all" : b));
            setPage(0);
          }}
        />
      </div>

      {summaryQ.isError && <div className="text-sm text-destructive">{errMsg(summaryQ.error)}</div>}

      {/* Filters */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="space-y-1">
              <Label>از تاریخ</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal">
                    <CalendarIcon className="ml-2 h-4 w-4" />
                    {fromDate ? (
                      toFaDigits(format(fromDate, "yyyy/MM/dd"))
                    ) : (
                      <span className="text-muted-foreground">انتخاب</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={fromDate}
                    onSelect={(d) => {
                      setFromDate(d ?? undefined);
                      setPage(0);
                    }}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <Label>تا تاریخ</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal">
                    <CalendarIcon className="ml-2 h-4 w-4" />
                    {toDate ? (
                      toFaDigits(format(toDate, "yyyy/MM/dd"))
                    ) : (
                      <span className="text-muted-foreground">انتخاب</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={toDate}
                    onSelect={(d) => {
                      setToDate(d ?? undefined);
                      setPage(0);
                    }}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <Label>وضعیت سررسید</Label>
              <Select
                value={dueFilter}
                onValueChange={(v) => {
                  setDueFilter(v as DueFilter);
                  setPage(0);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه</SelectItem>
                  <SelectItem value="overdue">معوق</SelectItem>
                  <SelectItem value="today">امروز</SelectItem>
                  <SelectItem value="tomorrow">فردا</SelectItem>
                  <SelectItem value="future">آینده</SelectItem>
                  <SelectItem value="current">سطل: سررسید نشده</SelectItem>
                  <SelectItem value="d1_30">سطل: ۱ تا ۳۰ روز</SelectItem>
                  <SelectItem value="d31_60">سطل: ۳۱ تا ۶۰ روز</SelectItem>
                  <SelectItem value="d61_90">سطل: ۶۱ تا ۹۰ روز</SelectItem>
                  <SelectItem value="d90_plus">سطل: بیش از ۹۰ روز</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 lg:col-span-1">
              <Label>جستجو</Label>
              <div className="relative">
                <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pr-8"
                  placeholder="نام مشتری یا شماره فاکتور"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>تعداد در صفحه</Label>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v));
                  setPage(0);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">{toFaDigits("25")}</SelectItem>
                  <SelectItem value="50">{toFaDigits("50")}</SelectItem>
                  <SelectItem value="100">{toFaDigits("100")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {(fromDate || toDate || search || dueFilter !== "all") && (
            <div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFromDate(undefined);
                  setToDate(undefined);
                  setSearch("");
                  setDueFilter("all");
                  setPage(0);
                }}
              >
                <X className="ml-1 h-4 w-4" /> پاک کردن فیلترها
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {listQ.isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin ml-2" /> در حال بارگذاری…
            </div>
          ) : listQ.isError ? (
            <div className="p-6 text-sm text-destructive">{errMsg(listQ.error)}</div>
          ) : (listQ.data?.length ?? 0) === 0 ? (
            <div className="p-10 text-center text-muted-foreground">
              مطالبه‌ای برای نمایش وجود ندارد.
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">مشتری</TableHead>
                      <TableHead className="text-right">شماره فاکتور</TableHead>
                      <TableHead className="text-right">سررسید</TableHead>
                      <TableHead className="text-right">مبلغ کل</TableHead>
                      <TableHead className="text-right">پیش‌پرداخت</TableHead>
                      <TableHead className="text-right">پرداخت تأییدشده</TableHead>
                      <TableHead className="text-right">مانده</TableHead>
                      <TableHead className="text-right">سطل سنی</TableHead>
                      <TableHead className="text-right">وضعیت</TableHead>
                      <TableHead className="text-right">عملیات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {listQ.data!.map((r) => (
                      <TableRow key={r.invoice_id}>
                        <TableCell>{r.customer_name || NA}</TableCell>
                        <TableCell>
                          {r.invoice_number ? toFaDigits(r.invoice_number) : NA}
                        </TableCell>
                        <TableCell>{fmtDate(r.due_date)}</TableCell>
                        <TableCell>{fmtMoney(r.total_amount)}</TableCell>
                        <TableCell>{fmtMoney(r.deposit_amount)}</TableCell>
                        <TableCell>{fmtMoney(r.confirmed_paid_amount)}</TableCell>
                        <TableCell className="font-semibold">
                          {fmtMoney(r.outstanding_amount)}
                        </TableCell>
                        <TableCell>
                          <AgingBucketBadge bucket={r.aging_bucket} />
                        </TableCell>
                        <TableCell>
                          {r.is_overdue ? (
                            <Badge variant="destructive">معوق</Badge>
                          ) : r.due_date ? (
                            <Badge variant="secondary">
                              {toFaDigits(String(r.days_until_due ?? 0))} روز
                            </Badge>
                          ) : (
                            <Badge variant="outline">{NA}</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setDetailInvoiceId(r.invoice_id)}
                            >
                              <Eye className="h-4 w-4 ml-1" /> جزئیات
                            </Button>
                            {/* 2026-08-08: the "open the invoice page" icon link was removed
                                with the invoice routes (migration 323). The «جزئیات» button
                                beside it opens the same receivable in a dialog, so nothing
                                a user could reach is lost. */}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y">
                {listQ.data!.map((r) => (
                  <div key={r.invoice_id} className="p-3 space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">{r.customer_name || NA}</div>
                        <div className="text-xs text-muted-foreground">
                          فاکتور {r.invoice_number ? toFaDigits(r.invoice_number) : NA}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {r.is_overdue ? (
                          <Badge variant="destructive">معوق</Badge>
                        ) : (
                          <Badge variant="secondary">
                            {toFaDigits(String(r.days_until_due ?? 0))} روز
                          </Badge>
                        )}
                        <AgingBucketBadge bucket={r.aging_bucket} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">سررسید: </span>
                        {fmtDate(r.due_date)}
                      </div>
                      <div>
                        <span className="text-muted-foreground">مانده: </span>
                        <span className="font-semibold">{fmtMoney(r.outstanding_amount)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">کل: </span>
                        {fmtMoney(r.total_amount)}
                      </div>
                      <div>
                        <span className="text-muted-foreground">پرداخت‌شده: </span>
                        {fmtMoney(r.confirmed_paid_amount)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => setDetailInvoiceId(r.invoice_id)}
                      >
                        <Eye className="h-4 w-4 ml-1" /> جزئیات
                      </Button>
                      {/* 2026-08-08: mobile twin of the removed invoice icon link — see the
                          note in the table view above. */}
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between p-3 border-t">
                <div className="text-xs text-muted-foreground">
                  صفحه {toFaDigits(String(page + 1))}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    قبلی
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={(listQ.data?.length ?? 0) < pageSize}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    بعدی
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Detail Sheet */}
      <Sheet
        open={!!detailInvoiceId}
        onOpenChange={(o) => {
          if (!o) setDetailInvoiceId(null);
        }}
      >
        <SheetContent side="left" className="w-full sm:max-w-lg overflow-y-auto" dir="rtl">
          <SheetHeader>
            <SheetTitle>جزئیات مطالبه</SheetTitle>
            <SheetDescription>اطلاعات فاکتور و پرداخت‌های ثبت‌شده</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            {detailQ.isLoading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin ml-2" /> در حال بارگذاری…
              </div>
            ) : detailQ.isError ? (
              <div className="text-sm text-destructive">{errMsg(detailQ.error)}</div>
            ) : (detailQ.data?.length ?? 0) === 0 ? (
              <div className="text-sm text-muted-foreground">اطلاعاتی یافت نشد.</div>
            ) : (
              (() => {
                const rows = detailQ.data!;
                const head = rows[0];
                const payments = rows.filter((r) => r.receipt_id);
                return (
                  <>
                    <Card>
                      <CardContent className="p-3 space-y-1 text-sm">
                        <div>
                          <span className="text-muted-foreground">مشتری: </span>
                          {head.customer_name || NA}
                        </div>
                        {head.customer_phone && (
                          <div>
                            <span className="text-muted-foreground">تلفن: </span>
                            {toFaDigits(head.customer_phone)}
                          </div>
                        )}
                        <div>
                          <span className="text-muted-foreground">شماره فاکتور: </span>
                          {head.invoice_number ? toFaDigits(head.invoice_number) : NA}
                        </div>
                        <div>
                          <span className="text-muted-foreground">تاریخ صدور: </span>
                          {fmtDate(head.issue_date)}
                        </div>
                        <div>
                          <span className="text-muted-foreground">سررسید: </span>
                          {fmtDate(head.due_date)}
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3 space-y-1 text-sm">
                        <div>
                          <span className="text-muted-foreground">مبلغ کل: </span>
                          {fmtMoney(head.total_amount)}
                        </div>
                        <div>
                          <span className="text-muted-foreground">پیش‌پرداخت: </span>
                          {fmtMoney(head.deposit_amount)}
                        </div>
                        <div>
                          <span className="text-muted-foreground">پرداخت تأییدشده: </span>
                          {fmtMoney(head.confirmed_paid_amount)}
                        </div>
                        <div className="font-semibold text-base">
                          <span className="text-muted-foreground font-normal">مانده: </span>
                          {fmtMoney(head.outstanding_amount)}
                        </div>
                        {head.is_overdue && <Badge variant="destructive">معوق</Badge>}
                      </CardContent>
                    </Card>
                    <div>
                      <div className="text-sm font-medium mb-2">پرداخت‌های لینک‌شده</div>
                      {payments.length === 0 ? (
                        <div className="text-sm text-muted-foreground">
                          پرداختی برای این فاکتور ثبت نشده است.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {payments.map((p) => (
                            <Card key={p.receipt_id}>
                              <CardContent className="p-3 space-y-1 text-sm">
                                <div className="flex justify-between">
                                  <span className="font-semibold">
                                    {fmtMoney(p.receipt_amount)}
                                  </span>
                                  <Badge variant="outline">{p.receipt_status || NA}</Badge>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">تاریخ: </span>
                                  {fmtDate(p.receipt_payment_date)}
                                </div>
                                {p.receipt_tracking_number && (
                                  <div>
                                    <span className="text-muted-foreground">پیگیری: </span>
                                    {toFaDigits(p.receipt_tracking_number)}
                                  </div>
                                )}
                                {p.receipt_bank_name && (
                                  <div>
                                    <span className="text-muted-foreground">بانک: </span>
                                    {p.receipt_bank_name}
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                );
              })()
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
