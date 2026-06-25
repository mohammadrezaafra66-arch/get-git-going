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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Loader2,
  XCircle,
} from "lucide-react";

import { useDebounce } from "@/hooks/use-debounce";
import { formatJalaliDateTime } from "@/lib/messenger/format";
import {
  useAllDeliveryReceipts,
  useDeliveryReceiptStats,
  type DeliveryReceiptRow,
} from "@/hooks/delivery-receipts/useDeliveryReceipts";
import {
  DELIVERY_RECEIPT_STATUS_FA,
  DELIVERY_RECEIPT_TYPE_FA,
  deliveryReceiptStatusBadgeClass,
  deliveryReceiptStatusLabel,
  deliveryReceiptTypeLabel,
  toPersianDigits,
} from "@/lib/delivery-receipts/labels";
import { DeliveryReceiptCard } from "@/components/delivery-receipts/DeliveryReceiptCard";
import { DeliveryReceiptReviewActions } from "@/components/delivery-receipts/DeliveryReceiptReviewActions";

export const Route = createFileRoute("/_app/admin/delivery-receipts")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager"]);
  },
  component: AdminDeliveryReceiptsPage,
});

const ALL = "__all__";
const PAGE_SIZE = 20;

function AdminDeliveryReceiptsPage() {
  const [type, setType] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [active, setActive] = useState<DeliveryReceiptRow | null>(null);

  const debouncedSearch = useDebounce(search, 300);
  const filters = useMemo(
    () => ({
      type: type === ALL ? null : type,
      status: status === ALL ? null : status,
      search: debouncedSearch,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [type, status, debouncedSearch, page],
  );

  const { data, isLoading, error } = useAllDeliveryReceipts(filters);
  const { data: stats } = useDeliveryReceiptStats();

  const rows = data?.rows ?? [];
  const hasMore = data?.hasMore ?? false;

  return (
    <div className="space-y-4 p-4 sm:p-6" dir="rtl">
      <PageHeader
        title="مدیریت رسیدهای تحویل"
        description="بررسی و تأیید بیجک باربری و رسید تحویل به مشتری"
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div className="text-sm text-muted-foreground">در انتظار تأیید</div>
            <div className="flex items-center gap-2 text-2xl font-bold">
              <ClipboardList className="h-5 w-5 text-amber-600" />
              {toPersianDigits(stats?.pending ?? 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div className="text-sm text-muted-foreground">تأیید شده امروز</div>
            <div className="flex items-center gap-2 text-2xl font-bold">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              {toPersianDigits(stats?.confirmedToday ?? 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div className="text-sm text-muted-foreground">رد شده</div>
            <div className="flex items-center gap-2 text-2xl font-bold">
              <XCircle className="h-5 w-5 text-red-600" />
              {toPersianDigits(stats?.rejected ?? 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div className="text-sm text-muted-foreground">منقضی شده</div>
            <div className="flex items-center gap-2 text-2xl font-bold">
              <AlertTriangle className="h-5 w-5 text-muted-foreground" />
              {toPersianDigits(stats?.expired ?? 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
          <div className="space-y-1">
            <Label>نوع</Label>
            <Select
              value={type}
              onValueChange={(v) => {
                setType(v);
                setPage(0);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>همه</SelectItem>
                {Object.entries(DELIVERY_RECEIPT_TYPE_FA).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
                {Object.entries(DELIVERY_RECEIPT_STATUS_FA).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>جست‌وجوی نام فایل</Label>
            <Input
              placeholder="نام فایل..."
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
            <div className="p-4 text-sm text-destructive">
              خطا: {(error as Error).message}
            </div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              موردی یافت نشد.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">نوع</TableHead>
                    <TableHead className="text-right">نام فایل</TableHead>
                    <TableHead className="text-right">آپلودکننده</TableHead>
                    <TableHead className="text-right">وضعیت</TableHead>
                    <TableHead className="text-right">مهلت</TableHead>
                    <TableHead className="text-right">تاریخ</TableHead>
                    <TableHead className="text-right">اقدام</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {deliveryReceiptTypeLabel(r.type)}
                      </TableCell>
                      <TableCell
                        className="max-w-[220px] truncate font-medium"
                        title={r.file_name}
                      >
                        {r.file_name}
                      </TableCell>
                      <TableCell>{r.uploader_name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={deliveryReceiptStatusBadgeClass(r.status)}
                        >
                          {deliveryReceiptStatusLabel(r.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatJalaliDateTime(r.review_deadline)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatJalaliDateTime(r.created_at)}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setActive(r)}
                        >
                          بررسی
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
            <DialogTitle>
              {active ? `بررسی رسید: ${active.file_name}` : ""}
            </DialogTitle>
          </DialogHeader>
          {active && (
            <div className="space-y-4">
              <DeliveryReceiptCard receipt={active} />
              <Separator />
              <DeliveryReceiptReviewActions receipt={active} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}