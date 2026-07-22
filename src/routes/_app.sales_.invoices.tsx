import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Loader2, Eye } from "lucide-react";

import { requirePermission } from "@/lib/rbac/route-guards";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toFaDigits, formatNumber, formatDateFa } from "@/lib/i18n/formatters";
import { InvoiceAccountingMarkers } from "@/components/invoices/InvoiceAccountingMarkers";

export const Route = createFileRoute("/_app/sales_/invoices")({
  beforeLoad: async () => {
    await requirePermission("invoices", "view");
  },
  component: InvoicesListPage,
});

const PAGE_SIZE = 10;

function InvoicesListPage() {
  const { user, roles } = useAuth();
  const [page, setPage] = useState(0);
  const isPrivileged = roles.includes("admin") || roles.includes("manager");

  const { data, isFetching } = useQuery({
    queryKey: ["invoices", "pre_invoice", page, user?.id, isPrivileged],
    queryFn: async () => {
      let q = supabase
        .from("invoices")
        .select(
          "id, total_amount, status, created_at, created_by, accounting_registered_at, accounting_registered_by, accounting_sent_at, accounting_sent_by, customer:customers(name), price_type:sale_price_types(title)",
          { count: "exact" },
        )
        .eq("type", "pre_invoice")
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (!isPrivileged && user?.id) {
        q = q.eq("created_by", user.id);
      }
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
    staleTime: 30_000,
  });

  const total = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="پیش‌فاکتورها"
        description="فهرست پیش‌فاکتورهای ثبت‌شده"
        actions={
          <Button asChild>
            <Link to="/sales/invoices/create">
              <Plus className="ml-2 h-4 w-4" />
              پیش‌فاکتور جدید
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="p-4 space-y-4">
          {isFetching && (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
              <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال بارگذاری...
            </div>
          )}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>شناسه</TableHead>
                  <TableHead>مشتری</TableHead>
                  <TableHead>نوع قیمت</TableHead>
                  <TableHead>جمع کل</TableHead>
                  <TableHead>تاریخ</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>حسابداری</TableHead>
                  <TableHead className="text-left">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.rows ?? []).map((r) => {
                  const row = r as unknown as {
                    id: string;
                    total_amount: number;
                    status: string;
                    created_at: string;
                    customer: { name: string } | null;
                    price_type: { title: string } | null;
                    accounting_registered_at: string | null;
                    accounting_sent_at: string | null;
                  };
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">
                        {toFaDigits(row.id.slice(0, 8))}
                      </TableCell>
                      <TableCell>{row.customer?.name ?? "—"}</TableCell>
                      <TableCell>{row.price_type?.title ?? "—"}</TableCell>
                      <TableCell>{formatNumber(Number(row.total_amount))}</TableCell>
                      <TableCell>{formatDateFa(row.created_at)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {row.status === "draft" ? "پیش‌نویس" : row.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <InvoiceAccountingMarkers
                          invoiceId={row.id}
                          state={{
                            accounting_registered_at: row.accounting_registered_at,
                            accounting_sent_at: row.accounting_sent_at,
                          }}
                          invalidateKeys={[["invoices"]]}
                        />
                      </TableCell>
                      <TableCell className="text-left">
                        <Button asChild size="sm" variant="ghost">
                          <Link to="/sales/invoices/$invoiceId" params={{ invoiceId: row.id }}>
                            <Eye className="ml-1 h-4 w-4" /> مشاهده
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!isFetching && (data?.rows.length ?? 0) === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                      پیش‌فاکتوری یافت نشد
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>مجموع: {toFaDigits(total)}</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                قبلی
              </Button>
              <span className="self-center">
                صفحه {toFaDigits(page + 1)} از {toFaDigits(totalPages)}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                بعدی
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
