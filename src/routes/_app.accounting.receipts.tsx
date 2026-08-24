import { useState, useMemo } from "react";
import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Plus,
  Loader2,
  Check,
  ChevronsUpDown,
  Eye,
  FileSpreadsheet,
  GraduationCap,
} from "lucide-react";

import { toast } from "sonner";

import { requireAnyRole } from "@/lib/rbac/route-guards";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { formatNumber, toFaDigits } from "@/lib/i18n/formatters";
import { isoToJalaliDisplay } from "@/lib/i18n/jalali";
import { receiptTypeLabel } from "@/lib/receipts/receipt-types";
import {
  ASAN_ADAPTERS,
  AsanLayoutNotConfiguredError,
  DEFAULT_EXPORT_OPTIONS,
  EXPORT_MODE_LABELS,
  type ExportMode,
} from "@/lib/export/export-modes";
import {
  RECEIPT_STATUS_FA,
  buildLineDetailReceiptRows,
  buildStandardReceiptRows,
  type ReceiptExportRecord,
  type ReceiptLineDetail,
} from "@/lib/export/receipt-export-rows";
import { JalaliDateInput } from "@/shared/components/JalaliDateInput";

import { PageHeader } from "@/components/common/PageHeader";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_app/accounting/receipts")({
  // M6/OG-24 — mirrors the requireAnyRole call below. The shared guard cannot decide
  // during SSR or while roles load, so RouteRoleGate in _app enforces this on the client.
  staticData: { gate: { kind: "anyRole", allowed: ["admin", "manager", "accountant"] } },
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager", "accountant"]);
  },
  component: ReceiptsLayout,
});

const PAGE_SIZE = 20;

const STATUS_LABEL: Record<string, string> = {
  pending_review: "در انتظار بررسی",
  approved: "تأییدشده",
  rejected: "ردشده",
};
const STATUS_VARIANT: Record<string, "secondary" | "default" | "destructive"> = {
  pending_review: "secondary",
  approved: "default",
  rejected: "destructive",
};

function ReceiptsLayout() {
  const matches = useMatches();
  // If a child route is active, render only the child (Outlet)
  const hasChild = matches.some(
    (m) =>
      m.routeId === "/_app/accounting/receipts/create" ||
      m.routeId === "/_app/accounting/receipts/$receiptId",
  );
  if (hasChild) return <Outlet />;
  return <ReceiptsListPage />;
}

function ReceiptsListPage() {
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [customerId, setCustomerId] = useState<string>("");
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const debouncedCustomer = useDebounce(customerSearch, 350);
  const [exporting, setExporting] = useState(false);
  // D8-6: export mode + line-detail toggle. Both default to the pre-phase-11
  // behaviour, so an accountant who changes nothing gets the identical file.
  const [exportMode, setExportMode] = useState<ExportMode>(DEFAULT_EXPORT_OPTIONS.mode);
  const [includeLineDetail, setIncludeLineDetail] = useState(
    DEFAULT_EXPORT_OPTIONS.includeLineDetail,
  );

  // Moved to src/lib/export/receipt-export-rows.ts so the export mapping can be
  // gate-tested outside React. Same values as before.
  const STATUS_FA = RECEIPT_STATUS_FA;

  async function handleExportExcel() {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      let q = supabase
        .from("payment_receipts")
        .select(
          `id, amount, payment_date, payment_time, receipt_time, tracking_number, status,
           receipt_type, posting_status, posted_at, description, rejection_reason, bank_name,
           source_bank, destination_bank, payer_name, payer_phone, payer_accounting_code,
           receiver_name, receiver_phone, receiver_accounting_code, is_mobile_bank_screenshot,
           created_at, created_by,
           customer:customers(id, name, phone, accounting_code),
           destination_bank_account:bank_accounts!payment_receipts_destination_bank_account_id_fkey(id, title),
           receiver_party:external_parties!payment_receipts_receiver_party_id_fkey(id, full_name)`,
        )
        .order("created_at", { ascending: false })
        .limit(5000);

      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (customerId) q = q.eq("customer_id", customerId);
      if (dateFrom) q = q.gte("payment_date", dateFrom);
      if (dateTo) q = q.lte("payment_date", dateTo);

      const { data, error } = await q;
      if (error) throw error;
      if (!data || data.length === 0) {
        toast.error("داده‌ای برای خروجی وجود ندارد");
        return;
      }

      const typed = data as unknown as ReceiptExportRecord[];

      // Resolve creator names in a single batched query
      const creatorIds = Array.from(
        new Set(typed.map((r) => r.created_by).filter((x): x is string => Boolean(x))),
      );
      const creatorMap = new Map<string, string>();
      if (creatorIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", creatorIds);
        (profs ?? []).forEach((p) => {
          creatorMap.set(
            (p as { id: string }).id,
            (p as { full_name: string | null }).full_name ?? "",
          );
        });
      }

      // D8-6 — «خروجی آسان». Refuses rather than guessing a column layout that
      // would import silently into the owner's live accounting software.
      if (exportMode === "asan") {
        throw new AsanLayoutNotConfiguredError(ASAN_ADAPTERS.bank_receipt.label);
      }

      // Decisions 44–45 — product line detail, fetched only when asked for, so
      // the default path performs and behaves exactly as it did before.
      let lines: ReceiptLineDetail[] = [];
      if (includeLineDetail) {
        const { data: linkRows, error: linkErr } = await supabase
          .from("payment_receipt_links")
          .select(
            `receipt_id,
             quote:sales_quotes(quote_number,
               items:sales_quote_items(quantity, unit_price, line_total, title_snapshot,
                 sku_snapshot, free_item_name))`,
          )
          .in(
            "receipt_id",
            typed.map((r) => r.id),
          );
        if (linkErr) throw linkErr;
        type LinkRow = {
          receipt_id: string;
          quote: {
            quote_number: string | null;
            items: {
              quantity: number | null;
              unit_price: number | null;
              line_total: number | null;
              title_snapshot: string | null;
              sku_snapshot: string | null;
              free_item_name: string | null;
            }[];
          } | null;
        };
        lines = ((linkRows ?? []) as unknown as LinkRow[]).flatMap((lr) =>
          (lr.quote?.items ?? []).map((it) => ({
            receipt_id: lr.receipt_id,
            quote_number: lr.quote?.quote_number ?? null,
            product_code: it.sku_snapshot,
            product_name: it.title_snapshot ?? it.free_item_name,
            quantity: it.quantity,
            unit_price: it.unit_price,
            line_total: it.line_total,
          })),
        );
      }

      const rows = includeLineDetail
        ? buildLineDetailReceiptRows(typed, creatorMap, lines)
        : buildStandardReceiptRows(typed, creatorMap);

      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = Object.keys(rows[0]).map((k) => ({
        wch: Math.min(40, Math.max(12, k.length + 4)),
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "فیش‌ها");
      const ts = new Date().toISOString().slice(0, 10);
      // The default file keeps its original name; only the opt-in variant is
      // renamed, so an existing routine that expects this filename still works.
      XLSX.writeFile(
        wb,
        includeLineDetail ? `payment-receipts-lines-${ts}.xlsx` : `payment-receipts-${ts}.xlsx`,
      );
      toast.success(`خروجی اکسل آماده شد (${toFaDigits(String(rows.length))} ردیف)`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "خطای ناشناخته";
      toast.error(`دریافت خروجی ناموفق بود: ${msg}`);
    } finally {
      setExporting(false);
    }
  }

  const { data: customers = [] } = useQuery({
    queryKey: ["receipts-filter-customers", debouncedCustomer],
    queryFn: async () => {
      let q = supabase.from("customers").select("id, name").order("name").limit(20);
      const term = debouncedCustomer.trim().replace(/[%_]/g, "");
      if (term) q = q.ilike("name", `%${term}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });
  const selectedCustomer = customers.find((c) => c.id === customerId);

  const filterKey = useMemo(
    () => ({ statusFilter, dateFrom, dateTo, customerId, page }),
    [statusFilter, dateFrom, dateTo, customerId, page],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["payment-receipts", filterKey],
    queryFn: async () => {
      let q = supabase
        .from("payment_receipts")
        .select(
          // Phase-6 Gate A P6-m3 / owner answer (c) 2026-08-22. `customers.name` and
          // `persons.display_name` diverge on 22 of 27 customers here, and the Asan
          // export preview reads the person file — so one document showed two names on
          // two screens. Neither column is rewritten; this reader now agrees with the
          // export, and the person file is the source it agrees on because the journal,
          // the export and `create_receipt`'s own payer_name already use it.
          "id, amount, payment_date, payment_time, tracking_number, status, receipt_type, " +
            "customer:customers(id, name), " +
            "customer_person:persons!payment_receipts_customer_person_id_fkey(id, display_name)",
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (customerId) q = q.eq("customer_id", customerId);
      if (dateFrom) q = q.gte("payment_date", dateFrom);
      if (dateTo) q = q.lte("payment_date", dateTo);

      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const totalPages = Math.max(1, Math.ceil((data?.count ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="فیش‌های واریزی"
        description="مدیریت و بررسی فیش‌های واریزی مشتریان"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline">
              <Link to="/accounting/receipts/training">
                <GraduationCap className="ml-2 h-4 w-4" />
                آموزش
              </Link>
            </Button>

            {/* D8-6 — export mode. «معمولی» is the default and is unchanged. */}
            <Select value={exportMode} onValueChange={(v) => setExportMode(v as ExportMode)}>
              <SelectTrigger className="w-40" aria-label="حالت خروجی">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">{EXPORT_MODE_LABELS.standard}</SelectItem>
                <SelectItem value="asan">{EXPORT_MODE_LABELS.asan}</SelectItem>
              </SelectContent>
            </Select>

            {/* Decisions 44–45 — product line detail. */}
            <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs">
              <Checkbox
                checked={includeLineDetail}
                onCheckedChange={(v) => setIncludeLineDetail(v === true)}
                aria-label="جزئیات ردیف کالا"
              />
              جزئیات ردیف کالا
            </label>

            <Button
              type="button"
              variant="outline"
              onClick={handleExportExcel}
              disabled={exporting}
            >
              {exporting ? (
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="ml-2 h-4 w-4" />
              )}
              خروجی اکسل
            </Button>
            <Button asChild>
              <Link to="/accounting/receipts/create">
                <Plus className="ml-2 h-4 w-4" />
                ثبت فیش جدید
              </Link>
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <Label>مشتری</Label>
              <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full justify-between font-normal",
                      !selectedCustomer && "text-muted-foreground",
                    )}
                  >
                    {selectedCustomer ? selectedCustomer.name : "همه مشتریان"}
                    <ChevronsUpDown className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="جستجو..."
                      value={customerSearch}
                      onValueChange={setCustomerSearch}
                    />
                    <CommandList>
                      <CommandEmpty>مشتری یافت نشد</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="__all__"
                          onSelect={() => {
                            setCustomerId("");
                            setCustomerOpen(false);
                            setPage(0);
                          }}
                        >
                          <Check
                            className={cn(
                              "ml-2 h-4 w-4",
                              !customerId ? "opacity-100" : "opacity-0",
                            )}
                          />
                          همه مشتریان
                        </CommandItem>
                        {customers.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={c.id}
                            onSelect={() => {
                              setCustomerId(c.id);
                              setCustomerOpen(false);
                              setPage(0);
                            }}
                          >
                            <Check
                              className={cn(
                                "ml-2 h-4 w-4",
                                c.id === customerId ? "opacity-100" : "opacity-0",
                              )}
                            />
                            {c.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <Label>وضعیت</Label>
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v);
                  setPage(0);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه وضعیت‌ها</SelectItem>
                  <SelectItem value="pending_review">در انتظار بررسی</SelectItem>
                  <SelectItem value="approved">تأییدشده</SelectItem>
                  <SelectItem value="rejected">ردشده</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>از تاریخ</Label>
              <JalaliDateInput
                value={dateFrom}
                onChange={(iso) => {
                  setDateFrom(iso);
                  setPage(0);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label>تا تاریخ</Label>
              <JalaliDateInput
                value={dateTo}
                onChange={(iso) => {
                  setDateTo(iso);
                  setPage(0);
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (data?.rows.length ?? 0) === 0 ? (
            <div className="p-8 text-center text-muted-foreground">فیشی یافت نشد</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>مشتری</TableHead>
                  <TableHead>مبلغ (تومان)</TableHead>
                  <TableHead>تاریخ</TableHead>
                  <TableHead>ساعت</TableHead>
                  <TableHead>شماره پیگیری</TableHead>
                  <TableHead>نوع</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead className="w-20">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.rows.map((r) => {
                  const row = r as unknown as {
                    id: string;
                    amount: number;
                    payment_date: string;
                    payment_time: string;
                    tracking_number: string;
                    status: string;
                    receipt_type: string;
                    customer: { id: string; name: string } | null;
                    customer_person: { id: string; display_name: string } | null;
                  };
                  return (
                    <TableRow key={row.id}>
                      {/* The person file first, the legacy customer name only as a
                          fallback for a row that has no person yet. */}
                      <TableCell>
                        {row.customer_person?.display_name ?? row.customer?.name ?? "—"}
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatNumber(Number(row.amount))}
                      </TableCell>
                      <TableCell dir="ltr">{isoToJalaliDisplay(row.payment_date)}</TableCell>
                      <TableCell dir="ltr">
                        {toFaDigits(row.payment_time?.slice(0, 5) ?? "")}
                      </TableCell>
                      <TableCell dir="ltr">{toFaDigits(row.tracking_number)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {receiptTypeLabel(row.receipt_type)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[row.status] ?? "secondary"}>
                          {STATUS_LABEL[row.status] ?? row.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button asChild variant="outline" size="sm">
                          <Link to="/accounting/receipts/$receiptId" params={{ receiptId: row.id }}>
                            <Eye className="ml-1 h-4 w-4" />
                            جزئیات
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {(data?.count ?? 0) > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            صفحه {toFaDigits(page + 1)} از {toFaDigits(totalPages)}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              قبلی
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              بعدی
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
