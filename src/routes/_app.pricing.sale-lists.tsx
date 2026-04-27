import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { FileText, Plus, Search, ChevronRight, ChevronLeft } from "lucide-react";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatNumber, formatDateFa } from "@/lib/i18n/formatters";
import { useDebounce } from "@/hooks/use-debounce";

const PAGE_SIZE = 20;

export const Route = createFileRoute("/_app/pricing/sale-lists")({
  beforeLoad: async () => { await requirePermission("pricing", "view"); },
  component: SaleListsPage,
});

interface SaleListRow {
  id: string;
  name: string;
  status: string;
  version_number: number;
  created_at: string;
  sale_price_type: { title: string } | null;
  items_count: { count: number }[];
}

function SaleListsPage() {
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const search = useDebounce(searchInput.trim(), 350);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["sale-lists", search, page],
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = supabase
        .from("sale_lists")
        .select(
          "id, name, status, version_number, created_at, sale_price_type:sale_price_types(title), items_count:sale_list_items(count)",
          { count: "exact" }
        )
        .order("created_at", { ascending: false })
        .range(from, to);
      if (search) {
        const safe = search.replace(/[%_]/g, "");
        q = q.ilike("name", `%${safe}%`);
      }
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as unknown as SaleListRow[], total: count ?? 0 };
    },
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <PageHeader
        title="لیست‌های فروش"
        description="مدیریت و انتشار لیست‌های رسمی فروش"
        actions={
          <Button asChild className="gap-2">
            <Link to="/pricing/sale-lists/new">
              <Plus className="h-4 w-4" />
              ایجاد لیست جدید
            </Link>
          </Button>
        }
      />

      <div className="flex items-center gap-2">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => { setSearchInput(e.target.value); setPage(1); }}
            placeholder="جستجو در نام لیست..."
            className="pr-9"
          />
        </div>
        {isFetching && <span className="text-xs text-muted-foreground">در حال به‌روزرسانی...</span>}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (<Skeleton key={i} className="h-12 w-full" />))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="هنوز هیچ لیست فروشی ساخته نشده است."
          description="پس از ایجاد اولین لیست فروش، در این صفحه قابل مشاهده خواهد بود."
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">نام لیست</TableHead>
                  <TableHead className="text-right">نوع قیمت فروش</TableHead>
                  <TableHead className="text-right">تعداد محصولات</TableHead>
                  <TableHead className="text-right">نسخه</TableHead>
                  <TableHead className="text-right">تاریخ ایجاد</TableHead>
                  <TableHead className="text-right">وضعیت</TableHead>
                  <TableHead className="text-right">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.sale_price_type?.title ?? "—"}</TableCell>
                    <TableCell>{formatNumber(r.items_count?.[0]?.count ?? 0)}</TableCell>
                    <TableCell>v{formatNumber(r.version_number)}</TableCell>
                    <TableCell>{formatDateFa(r.created_at)}</TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" disabled>مشاهده</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {rows.map((r) => (
              <Card key={r.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold">{r.name}</div>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div><span className="text-foreground">نوع قیمت:</span> {r.sale_price_type?.title ?? "—"}</div>
                    <div><span className="text-foreground">محصولات:</span> {formatNumber(r.items_count?.[0]?.count ?? 0)}</div>
                    <div><span className="text-foreground">نسخه:</span> v{formatNumber(r.version_number)}</div>
                    <div><span className="text-foreground">تاریخ:</span> {formatDateFa(r.created_at)}</div>
                  </div>
                  <div className="pt-1">
                    <Button variant="outline" size="sm" disabled className="w-full">مشاهده</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between gap-2 pt-2">
            <div className="text-xs text-muted-foreground">
              مجموع: {formatNumber(total)} لیست — صفحه {formatNumber(page)} از {formatNumber(totalPages)}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronRight className="h-4 w-4" /> قبلی
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                بعدی <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "published") {
    return <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400">منتشرشده</Badge>;
  }
  return <Badge variant="secondary">پیش‌نویس</Badge>;
}