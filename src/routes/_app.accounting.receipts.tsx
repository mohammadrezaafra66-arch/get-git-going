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
import { JalaliDateInput } from "@/shared/components/JalaliDateInput";

import { PageHeader } from "@/components/common/PageHeader";
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

  const STATUS_FA: Record<string, string> = {
    pending_review: "در انتظار بررسی",
    approved: "تأییدشده",
    rejected: "ردشده",
  };

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
           receiver_name, receiver_phone, receiver_accounting_code, created_at, created_by,
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

      type Row = {
        id: string;
        amount: number;
        payment_date: string;
        payment_time: string | null;
        receipt_time: string | null;
        tracking_number: string;
        status: string;
        receipt_type: string;
        posting_status: string | null;
        posted_at: string | null;
        description: string | null;
        rejection_reason: string | null;
        bank_name: string | null;
        source_bank: string | null;
        destination_bank: string | null;
        payer_name: string;
        payer_phone: string | null;
        payer_accounting_code: string | null;
        receiver_name: string;
        receiver_phone: string | null;
        receiver_accounting_code: string | null;
        created_at: string;
        created_by: string | null;
        customer: {
          name: string | null;
          phone: string | null;
          accounting_code: string | null;
        } | null;
        destination_bank_account: { title: string | null } | null;
        // external_parties stores the display name in `full_name`; selecting
        // `name` made the whole export query fail.
        receiver_party: { full_name: string | null } | null;
      };

      const typed = data as unknown as Row[];

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

      const rows = typed.map((r) => {
        const receiverTarget = r.destination_bank_account?.title
          ? `بانک ما: ${r.destination_bank_account.title}`
          : r.receiver_party?.full_name
            ? `طرف خارجی: ${r.receiver_party.full_name}`
            : r.receiver_name || "—";
        return {
          "تاریخ ثبت (شمسی)": isoToJalaliDisplay(r.created_at?.slice(0, 10)),
          "تاریخ فیش (شمسی)": isoToJalaliDisplay(r.payment_date),
          "ساعت فیش": r.payment_time?.slice(0, 5) ?? "",
          "ثبت‌کننده (کاربر)": (r.created_by && creatorMap.get(r.created_by)) || "—",
          "مشتری مرتبط": r.customer?.name ?? "—",
          "تلفن مشتری": r.customer?.phone ?? "",
          "کد آسان مشتری": r.customer?.accounting_code ?? "",
          "واریزکننده (نام)": r.payer_name,
          "واریزکننده (تلفن)": r.payer_phone ?? "",
          "واریزکننده (کد آسان)": r.payer_accounting_code ?? "",
          "بانک مبدأ": r.source_bank ?? r.bank_name ?? "",
          گیرنده: receiverTarget,
          "گیرنده (نام روی فیش)": r.receiver_name,
          "گیرنده (تلفن)": r.receiver_phone ?? "",
          "گیرنده (کد آسان)": r.receiver_accounting_code ?? "",
          "بانک مقصد": r.destination_bank ?? "",
          "مبلغ (تومان)": Number(r.amount),
          "شماره پیگیری": r.tracking_number,
          "نوع فیش": receiptTypeLabel(r.receipt_type),
          وضعیت: STATUS_FA[r.status] ?? r.status,
          "وضعیت ثبت سند": r.posting_status ?? "",
          "تاریخ ثبت سند (شمسی)": r.posted_at ? isoToJalaliDisplay(r.posted_at.slice(0, 10)) : "",
          "علت رد": r.rejection_reason ?? "",
          توضیحات: r.description ?? "",
          "شناسه فیش": r.id,
        };
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = Object.keys(rows[0]).map((k) => ({
        wch: Math.min(40, Math.max(12, k.length + 4)),
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "فیش‌ها");
      const ts = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `payment-receipts-${ts}.xlsx`);
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
          "id, amount, payment_date, payment_time, tracking_number, status, receipt_type, customer:customers(id, name)",
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
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to="/accounting/receipts/training">
                <GraduationCap className="ml-2 h-4 w-4" />
                آموزش
              </Link>
            </Button>
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
                  };
                  return (
                    <TableRow key={row.id}>
                      <TableCell>{row.customer?.name ?? "—"}</TableCell>
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
