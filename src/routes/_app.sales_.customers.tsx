import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Pencil, Loader2 } from "lucide-react";

import { requirePermission } from "@/lib/rbac/route-guards";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/use-debounce";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toFaDigits } from "@/lib/i18n/formatters";

export const Route = createFileRoute("/_app/sales_/customers")({
  beforeLoad: async () => { await requirePermission("sales", "view"); },
  component: CustomersListPage,
});

const PAGE_SIZE = 20;

function CustomersListPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const debounced = useDebounce(search, 350);

  const { data, isFetching } = useQuery({
    queryKey: ["customers", "list", debounced, page],
    queryFn: async () => {
      let q = supabase
        .from("customers")
        .select("id, name, phone, city, is_active, created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      const term = debounced.trim().replace(/[%_]/g, "");
      if (term) {
        q = q.or(`name.ilike.%${term}%,phone.ilike.%${term}%`);
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
        title="مشتریان"
        description="مدیریت لیست مشتریان"
        actions={
          <Button asChild>
            <Link to="/sales/customers/create">
              <Plus className="ml-2 h-4 w-4" />
              مشتری جدید
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="p-4 space-y-4">
          <Input
            placeholder="جستجو نام یا تلفن..."
            value={search}
            onChange={(e) => { setPage(0); setSearch(e.target.value); }}
            className="max-w-sm"
          />

          {isFetching && (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
              <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال بارگذاری...
            </div>
          )}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>نام</TableHead>
                  <TableHead>تلفن</TableHead>
                  <TableHead>شهر</TableHead>
                  <TableHead className="w-24">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.rows ?? []).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell dir="ltr" className="text-right">{c.phone ? toFaDigits(c.phone) : "—"}</TableCell>
                    <TableCell>{c.city || "—"}</TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="ghost">
                        <Link to="/sales/customers/$customerId/edit" params={{ customerId: c.id }}>
                          <Pencil className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!isFetching && (data?.rows.length ?? 0) === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                      مشتری یافت نشد
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>مجموع: {toFaDigits(total)}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                قبلی
              </Button>
              <span className="self-center">
                صفحه {toFaDigits(page + 1)} از {toFaDigits(totalPages)}
              </span>
              <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
                بعدی
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}