import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShoppingBag, Plus, Loader2 } from "lucide-react";

import { requirePermission } from "@/lib/rbac/route-guards";
import { supabase } from "@/integrations/supabase/client";
import { toFaDigits, formatDateFa } from "@/lib/i18n/formatters";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { RoleGuard } from "@/components/rbac/RoleGuard";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_app/purchases")({
  beforeLoad: async () => {
    await requirePermission("purchases", "view");
  },
  component: PurchasesPage,
});

type PurchaseRow = {
  id: string;
  number: string | null;
  purchase_date: string;
  supplier_id: string | null;
  product: { name: string | null } | null;
  supplier: { name: string | null } | null;
};

/**
 * Wave 1 / A6 — purchases list with «بدون تأمین‌کننده» filter.
 *
 * Filter is applied server-side (`supplier_id IS NULL`). The badge count comes
 * from an exact-count query so UI count equals
 * `SELECT count(*) FROM purchases WHERE supplier_id IS NULL`.
 */
function PurchasesPage() {
  const [noSupplierOnly, setNoSupplierOnly] = useState(false);

  /** Always fetch so the switch badge matches SQL even before the filter is on. */
  const noSupplierCountQ = useQuery({
    queryKey: ["purchases-no-supplier-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("purchases")
        .select("id", { count: "exact", head: true })
        .is("supplier_id", null);
      if (error) throw error;
      return count ?? 0;
    },
  });
  const noSupplierCount = noSupplierCountQ.data ?? 0;

  const listQ = useQuery({
    queryKey: ["purchases", "list", noSupplierOnly],
    queryFn: async () => {
      let q = supabase
        .from("purchases")
        .select(
          `
          id, number, purchase_date, supplier_id,
          product:products(name),
          supplier:suppliers(name)
        `,
        )
        .order("purchase_date", { ascending: false })
        .limit(200);
      if (noSupplierOnly) q = q.is("supplier_id", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as PurchaseRow[];
    },
  });

  const rows = listQ.data ?? [];
  const isLoading = listQ.isLoading || noSupplierCountQ.isLoading;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-start justify-between gap-3">
        <PageHeader title="خرید" description="ثبت و مدیریت سفارش‌های خرید از تأمین‌کنندگان" />
        <RoleGuard roles={["admin", "manager"]}>
          <Button asChild size="sm">
            <Link to="/purchases/create">
              <Plus className="ml-2 h-4 w-4" />
              ثبت خرید جدید
            </Link>
          </Button>
        </RoleGuard>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="flex items-center gap-2 rounded-md border px-3 py-1.5">
            <Switch
              checked={noSupplierOnly}
              onCheckedChange={setNoSupplierOnly}
              id="purchases-no-supplier"
              data-testid="filter-no-supplier"
            />
            <Label htmlFor="purchases-no-supplier" className="cursor-pointer text-xs">
              بدون تأمین‌کننده
              {noSupplierCount > 0 && (
                <Badge
                  variant="secondary"
                  className="mr-1.5"
                  data-testid="purchases-no-supplier-count"
                >
                  {toFaDigits(String(noSupplierCount))}
                </Badge>
              )}
            </Label>
          </div>
          {noSupplierOnly && (
            <div className="text-xs text-muted-foreground">
              {toFaDigits(String(noSupplierCount))} خرید بدون تأمین‌کننده
              {rows.length !== noSupplierCount
                ? ` (نمایش ${toFaDigits(String(rows.length))})`
                : ""}
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : listQ.isError ? (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">
            خطا در بارگذاری فهرست خریدها
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title={noSupplierOnly ? "خریدی بدون تأمین‌کننده نیست" : "هنوز خریدی ثبت نشده"}
          description={
            noSupplierOnly
              ? "همهٔ خریدهای موجود تأمین‌کننده دارند."
              : "برای ثبت یک خرید جدید روی دکمه «ثبت خرید جدید» کلیک کنید."
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">شناسه</TableHead>
                    <TableHead className="text-right">شماره</TableHead>
                    <TableHead className="text-right">تاریخ</TableHead>
                    <TableHead className="text-right">محصول</TableHead>
                    <TableHead className="text-right">تأمین‌کننده</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="max-w-[8rem] truncate font-mono text-[10px] text-muted-foreground">
                        {r.id}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.number ?? "—"}</TableCell>
                      <TableCell>
                        {toFaDigits(formatDateFa(new Date(r.purchase_date)))}
                      </TableCell>
                      <TableCell>{r.product?.name ?? "—"}</TableCell>
                      <TableCell>
                        {r.supplier_id ? (r.supplier?.name ?? "—") : "بدون تأمین‌کننده"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
