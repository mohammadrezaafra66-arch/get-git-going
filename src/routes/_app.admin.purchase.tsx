import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Loader2, ShoppingCart, ClipboardList, CheckCircle2, Truck } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { formatJalaliDateTime } from "@/lib/messenger/format";
import {
  useAllPurchaseRequests,
  usePurchaseStats,
  type PurchaseRequestRow,
} from "@/hooks/purchase/usePurchase";
import {
  PURCHASE_STATUS_FA,
  purchaseStatusLabel,
  purchaseStatusBadgeClass,
  toPersianDigits,
} from "@/lib/purchase/labels";
import { PurchaseStatusActions } from "@/components/purchase/PurchaseStatusActions";
import { PurchaseReceiptUploader } from "@/components/purchase/PurchaseReceiptUploader";
import { DefaultPurchaseAssigneeCard } from "@/components/purchase/DefaultPurchaseAssigneeCard";

export const Route = createFileRoute("/_app/admin/purchase")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager"]);
  },
  component: AdminPurchasePage,
});

const ALL = "__all__";
const PAGE_SIZE = 20;

function AdminPurchasePage() {
  const [status, setStatus] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [active, setActive] = useState<PurchaseRequestRow | null>(null);

  const debouncedSearch = useDebounce(search, 300);
  const filters = useMemo(
    () => ({
      status: status === ALL ? null : status,
      search: debouncedSearch,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [status, debouncedSearch, page],
  );

  const { data, isLoading, error } = useAllPurchaseRequests(filters);
  const { data: stats } = usePurchaseStats();

  const rows = data?.rows ?? [];
  const hasMore = data?.hasMore ?? false;

  return (
    <div className="space-y-4" dir="rtl">
      <PageHeader title="مدیریت خرید" description="مشاهده و رسیدگی به همه درخواست‌های خرید" />

      {/* Issue 219 / C4 — who new requests go to when nobody is named. */}
      <DefaultPurchaseAssigneeCard />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div className="text-sm text-muted-foreground">در انتظار</div>
            <div className="flex items-center gap-2 text-2xl font-bold">
              <ClipboardList className="h-5 w-5 text-amber-600" />
              {toPersianDigits(stats?.pending ?? 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div className="text-sm text-muted-foreground">تأیید شده</div>
            <div className="flex items-center gap-2 text-2xl font-bold">
              <CheckCircle2 className="h-5 w-5 text-blue-600" />
              {toPersianDigits(stats?.approved ?? 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div className="text-sm text-muted-foreground">خرید شده</div>
            <div className="flex items-center gap-2 text-2xl font-bold">
              <ShoppingCart className="h-5 w-5 text-violet-600" />
              {toPersianDigits(stats?.purchased ?? 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div className="text-sm text-muted-foreground">این هفته</div>
            <div className="flex items-center gap-2 text-2xl font-bold">
              <Truck className="h-5 w-5 text-primary" />
              {toPersianDigits(stats?.week ?? 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
          <div className="space-y-1">
            <Label>وضعیت</Label>
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v);
                setPage(0);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>همه</SelectItem>
                {Object.entries(PURCHASE_STATUS_FA).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>جست‌وجوی نام محصول</Label>
            <Input
              placeholder="نام محصول..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="ms-2 h-4 w-4 animate-spin" /> در حال بارگذاری...
            </div>
          ) : error ? (
            <div className="p-4 text-sm text-destructive">خطا: {(error as Error).message}</div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">موردی یافت نشد.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">محصول</TableHead>
                    <TableHead className="text-right">تعداد</TableHead>
                    <TableHead className="text-right">درخواست‌دهنده</TableHead>
                    <TableHead className="text-right">مسئول</TableHead>
                    <TableHead className="text-right">وضعیت</TableHead>
                    <TableHead className="text-right">تاریخ</TableHead>
                    <TableHead className="text-right">اقدام</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.product_name}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {toPersianDigits(r.quantity)} {r.unit}
                      </TableCell>
                      <TableCell>{r.requester_name ?? "—"}</TableCell>
                      <TableCell>{r.assignee_name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={purchaseStatusBadgeClass(r.status)}>
                          {purchaseStatusLabel(r.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatJalaliDateTime(r.created_at)}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => setActive(r)}>
                          مشاهده و اقدام
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">صفحه {toPersianDigits(page + 1)}</span>
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
            disabled={!hasMore}
            onClick={() => setPage((p) => p + 1)}
          >
            بعدی
          </Button>
        </div>
      </div>

      <Dialog open={active !== null} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent dir="rtl" className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{active ? `درخواست خرید: ${active.product_name}` : ""}</DialogTitle>
          </DialogHeader>
          {active && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="block text-xs text-muted-foreground">تعداد</span>
                  {toPersianDigits(active.quantity)} {active.unit}
                </div>
                <div>
                  <span className="block text-xs text-muted-foreground">وضعیت</span>
                  <Badge variant="outline" className={purchaseStatusBadgeClass(active.status)}>
                    {purchaseStatusLabel(active.status)}
                  </Badge>
                </div>
                <div>
                  <span className="block text-xs text-muted-foreground">درخواست‌دهنده</span>
                  {active.requester_name ?? "—"}
                </div>
                <div>
                  <span className="block text-xs text-muted-foreground">مسئول</span>
                  {active.assignee_name ?? "—"}
                </div>
              </div>
              {active.notes && (
                <div className="rounded-md bg-muted/40 p-2 text-xs">{active.notes}</div>
              )}
              <Separator />
              <PurchaseStatusActions request={active} />
              <Separator />
              <PurchaseReceiptUploader requestId={active.id} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
