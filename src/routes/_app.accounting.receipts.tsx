import { useState, useMemo } from "react";
import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Loader2, Check, ChevronsUpDown, Eye } from "lucide-react";

import { requireAnyRole } from "@/lib/rbac/route-guards";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { formatNumber, toFaDigits } from "@/lib/i18n/formatters";

import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
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
  const hasChild = matches.some((m) =>
    m.routeId === "/_app/accounting/receipts/create" ||
    m.routeId === "/_app/accounting/receipts/$receiptId"
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
          "id, amount, payment_date, payment_time, tracking_number, status, customer:customers(id, name)",
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
          <Button asChild>
            <Link to="/accounting/receipts/create">
              <Plus className="ml-2 h-4 w-4" />
              ثبت فیش جدید
            </Link>
          </Button>
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
                          <Check className={cn("ml-2 h-4 w-4", !customerId ? "opacity-100" : "opacity-0")} />
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
                            <Check className={cn("ml-2 h-4 w-4", c.id === customerId ? "opacity-100" : "opacity-0")} />
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
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
              <Input type="date" value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(0); }} />
            </div>
            <div className="space-y-1">
              <Label>تا تاریخ</Label>
              <Input type="date" value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(0); }} />
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
                    customer: { id: string; name: string } | null;
                  };
                  return (
                    <TableRow key={row.id}>
                      <TableCell>{row.customer?.name ?? "—"}</TableCell>
                      <TableCell className="font-medium">{formatNumber(Number(row.amount))}</TableCell>
                      <TableCell dir="ltr">{toFaDigits(row.payment_date)}</TableCell>
                      <TableCell dir="ltr">{toFaDigits(row.payment_time?.slice(0, 5) ?? "")}</TableCell>
                      <TableCell dir="ltr">{toFaDigits(row.tracking_number)}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[row.status] ?? "secondary"}>
                          {STATUS_LABEL[row.status] ?? row.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button asChild variant="outline" size="sm">
                          <Link
                            to="/accounting/receipts/$receiptId"
                            params={{ receiptId: row.id }}
                          >
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
            <Button variant="outline" size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}>
              قبلی
            </Button>
            <Button variant="outline" size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}>
              بعدی
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
