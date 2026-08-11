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
import { Switch } from "@/components/ui/switch";
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

export const Route = createFileRoute("/_app/accounting/payables")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager", "accountant"]);
  },
  component: PayablesPage,
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
  supplier_id: string | null;
  supplier_name: string | null;
  purchase_id: string;
  purchase_date: string | null;
  due_date: string | null;
  payment_term_days: number | null;
  purchase_total_amount: number | null;
  cash_price: number | null;
  currency: string | null;
  paid_at: string | null;
  outstanding_amount: number | null;
  is_paid: boolean | null;
  days_until_due: number | null;
  is_overdue: boolean | null;
  product_summary: string | null;
  created_at: string;
  aging_bucket: string | null;
};

type DetailRow = {
  supplier_id: string | null;
  supplier_name: string | null;
  purchase_id: string;
  purchase_date: string | null;
  due_date: string | null;
  payment_term_days: number | null;
  purchase_total_amount: number | null;
  cash_price: number | null;
  currency: string | null;
  paid_at: string | null;
  outstanding_amount: number | null;
  is_paid: boolean | null;
  is_overdue: boolean | null;
  item_id: string | null;
  product_id: string | null;
  product_name: string | null;
  item_quantity: number | null;
  item_unit_price: number | null;
  item_line_total: number | null;
};

const NA = "نامشخص";

function fmtMoney(n: number | null | undefined, currency?: string | null) {
  if (n == null) return NA;
  const cur = currency || "تومان";
  return `${toFaDigits(Math.round(Number(n)).toLocaleString("en-US"))} ${cur}`;
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
function shortId(s: string | null | undefined) {
  if (!s) return NA;
  return toFaDigits(s.slice(0, 8));
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

function PayablesPage() {
  const [fromDate, setFromDate] = useState<Date | undefined>();
  const [toDate, setToDate] = useState<Date | undefined>();
  const [dueFilter, setDueFilter] = useState<DueFilter>("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 400);
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);
  const [includePaid, setIncludePaid] = useState(false);
  const [detailPurchaseId, setDetailPurchaseId] = useState<string | null>(null);

  const fromIso = fromDate ? format(fromDate, "yyyy-MM-dd") : undefined;
  const toIso = toDate ? format(toDate, "yyyy-MM-dd") : undefined;

  const summaryQ = useQuery({
    queryKey: ["payables-summary", fromIso, toIso],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_payables_summary", {
        p_from_date: fromIso,
        p_to_date: toIso,
        p_supplier_id: undefined,
      });
      if (error) throw error;
      return (data as SummaryRow[] | null)?.[0] ?? null;
    },
    staleTime: 30_000,
  });

  const listQ = useQuery({
    queryKey: [
      "payables-list",
      fromIso,
      toIso,
      dueFilter,
      debouncedSearch,
      pageSize,
      page,
      includePaid,
    ],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_payables_list", {
        p_from_date: fromIso,
        p_to_date: toIso,
        p_supplier_id: undefined,
        p_due_filter: dueFilter,
        p_search: debouncedSearch || undefined,
        p_limit: pageSize,
        p_offset: page * pageSize,
        p_include_paid: includePaid,
      });
      if (error) throw error;
      return (data as ListRow[] | null) ?? [];
    },
    staleTime: 30_000,
  });

  const detailQ = useQuery({
    queryKey: ["payable-detail", detailPurchaseId],
    enabled: !!detailPurchaseId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_payable_detail", {
        p_supplier_id: undefined,
        p_purchase_id: detailPurchaseId ?? undefined,
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
      : "دریافت گزارش بدهی‌ها با خطا مواجه شد.";

  const summary = summaryQ.data;

  return (
    <div className="space-y-4 p-4" dir="rtl">
      <PageHeader
        title="بدهی‌های تأمین‌کنندگان"
        description="گزارش بدهی‌های قابل پرداخت بر اساس خریدهای ثبت‌شده و سررسید پرداخت."
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryCard
          label="کل بدهی‌ها"
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
        <div className="text-sm font-medium text-muted-foreground">سطل‌های سنی بدهی‌ها</div>
        <AgingBucketCards
          summary={summary as unknown as Record<string, unknown> | null}
          isLoading={summaryQ.isLoading}
          fmtMoney={(n) => fmtMoney(n)}
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
                  placeholder="نام تأمین‌کننده یا شناسه خرید"
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

          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Switch
                id="include-paid"
                checked={includePaid}
                onCheckedChange={(v) => {
                  setIncludePaid(!!v);
                  setPage(0);
                }}
              />
              <Label htmlFor="include-paid" className="cursor-pointer">
                نمایش پرداخت‌شده‌ها
              </Label>
            </div>
            {(fromDate || toDate || search || dueFilter !== "all" || includePaid) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFromDate(undefined);
                  setToDate(undefined);
                  setSearch("");
                  setDueFilter("all");
                  setIncludePaid(false);
                  setPage(0);
                }}
              >
                <X className="ml-1 h-4 w-4" /> پاک کردن فیلترها
              </Button>
            )}
          </div>
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
              بدهی‌ای برای نمایش وجود ندارد.
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">تأمین‌کننده</TableHead>
                      <TableHead className="text-right">شناسه خرید</TableHead>
                      <TableHead className="text-right">تاریخ خرید</TableHead>
                      <TableHead className="text-right">سررسید</TableHead>
                      <TableHead className="text-right">مدت پرداخت</TableHead>
                      <TableHead className="text-right">مبلغ خرید</TableHead>
                      <TableHead className="text-right">قیمت نقدی</TableHead>
                      <TableHead className="text-right">مانده</TableHead>
                      <TableHead className="text-right">سطل سنی</TableHead>
                      <TableHead className="text-right">وضعیت</TableHead>
                      <TableHead className="text-right">عملیات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {listQ.data!.map((r) => (
                      <TableRow key={r.purchase_id}>
                        <TableCell>{r.supplier_name || NA}</TableCell>
                        <TableCell className="font-mono">{shortId(r.purchase_id)}</TableCell>
                        <TableCell>{fmtDate(r.purchase_date)}</TableCell>
                        <TableCell>{fmtDate(r.due_date)}</TableCell>
                        <TableCell>
                          {r.payment_term_days != null
                            ? `${toFaDigits(String(r.payment_term_days))} روز`
                            : NA}
                        </TableCell>
                        <TableCell>{fmtMoney(r.purchase_total_amount, r.currency)}</TableCell>
                        <TableCell>{fmtMoney(r.cash_price, r.currency)}</TableCell>
                        <TableCell className="font-semibold">
                          {fmtMoney(r.outstanding_amount, r.currency)}
                        </TableCell>
                        <TableCell>
                          <AgingBucketBadge bucket={r.aging_bucket} />
                        </TableCell>
                        <TableCell>
                          {r.is_paid ? (
                            <Badge variant="secondary">پرداخت‌شده</Badge>
                          ) : r.is_overdue ? (
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
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setDetailPurchaseId(r.purchase_id)}
                          >
                            <Eye className="h-4 w-4 ml-1" /> جزئیات
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y">
                {listQ.data!.map((r) => (
                  <div key={r.purchase_id} className="p-3 space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">{r.supplier_name || NA}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          خرید {shortId(r.purchase_id)}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {r.is_paid ? (
                          <Badge variant="secondary">پرداخت‌شده</Badge>
                        ) : r.is_overdue ? (
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
                        <span className="font-semibold">
                          {fmtMoney(r.outstanding_amount, r.currency)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">مبلغ: </span>
                        {fmtMoney(r.purchase_total_amount, r.currency)}
                      </div>
                      <div>
                        <span className="text-muted-foreground">تاریخ خرید: </span>
                        {fmtDate(r.purchase_date)}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => setDetailPurchaseId(r.purchase_id)}
                    >
                      <Eye className="h-4 w-4 ml-1" /> جزئیات
                    </Button>
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
        open={!!detailPurchaseId}
        onOpenChange={(o) => {
          if (!o) setDetailPurchaseId(null);
        }}
      >
        <SheetContent side="left" className="w-full sm:max-w-lg overflow-y-auto" dir="rtl">
          <SheetHeader>
            <SheetTitle>جزئیات بدهی</SheetTitle>
            <SheetDescription>اطلاعات خرید و اقلام مربوطه</SheetDescription>
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
                const items = rows.filter((r) => r.item_id);
                return (
                  <>
                    <Card>
                      <CardContent className="p-3 space-y-1 text-sm">
                        <div>
                          <span className="text-muted-foreground">تأمین‌کننده: </span>
                          {head.supplier_name || NA}
                        </div>
                        <div>
                          <span className="text-muted-foreground">شناسه خرید: </span>
                          <span className="font-mono">{shortId(head.purchase_id)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">تاریخ خرید: </span>
                          {fmtDate(head.purchase_date)}
                        </div>
                        <div>
                          <span className="text-muted-foreground">سررسید: </span>
                          {fmtDate(head.due_date)}
                        </div>
                        <div>
                          <span className="text-muted-foreground">مدت پرداخت: </span>
                          {head.payment_term_days != null
                            ? `${toFaDigits(String(head.payment_term_days))} روز`
                            : NA}
                        </div>
                        {head.paid_at && (
                          <div>
                            <span className="text-muted-foreground">پرداخت‌شده در: </span>
                            {fmtDate(head.paid_at)}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3 space-y-1 text-sm">
                        <div>
                          <span className="text-muted-foreground">مبلغ خرید: </span>
                          {fmtMoney(head.purchase_total_amount, head.currency)}
                        </div>
                        <div>
                          <span className="text-muted-foreground">قیمت نقدی: </span>
                          {fmtMoney(head.cash_price, head.currency)}
                        </div>
                        <div>
                          <span className="text-muted-foreground">ارز: </span>
                          {head.currency || NA}
                        </div>
                        <div className="font-semibold text-base">
                          <span className="text-muted-foreground font-normal">مانده: </span>
                          {fmtMoney(head.outstanding_amount, head.currency)}
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          {head.is_paid && <Badge variant="secondary">پرداخت‌شده</Badge>}
                          {head.is_overdue && <Badge variant="destructive">معوق</Badge>}
                        </div>
                      </CardContent>
                    </Card>
                    <div>
                      <div className="text-sm font-medium mb-2">اقلام خرید</div>
                      {items.length === 0 ? (
                        <div className="text-sm text-muted-foreground">
                          اقلامی برای این خرید ثبت نشده است.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {items.map((it) => (
                            <Card key={it.item_id}>
                              <CardContent className="p-3 space-y-1 text-sm">
                                <div className="font-medium">{it.product_name || NA}</div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <span className="text-muted-foreground">تعداد: </span>
                                    {it.item_quantity != null
                                      ? toFaDigits(String(it.item_quantity))
                                      : NA}
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">قیمت واحد: </span>
                                    {fmtMoney(it.item_unit_price, head.currency)}
                                  </div>
                                  <div className="col-span-2">
                                    <span className="text-muted-foreground">جمع ردیف: </span>
                                    <span className="font-semibold">
                                      {fmtMoney(it.item_line_total, head.currency)}
                                    </span>
                                  </div>
                                </div>
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
