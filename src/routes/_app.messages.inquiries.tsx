import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, MessageSquare, XCircle } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { requirePermission } from "@/lib/rbac/route-guards";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useAllInquiries } from "@/hooks/messenger/useAllInquiries";
import type { InquiryStatus } from "@/hooks/messenger/useInquiries";
import { updateInquiryStatus } from "@/lib/messenger/inquiry-status";
import { formatJalaliDateTime } from "@/lib/messenger/format";
import { formatNumber } from "@/lib/i18n/formatters";

export const Route = createFileRoute("/_app/messages/inquiries")({
  beforeLoad: async () => {
    await requirePermission("messages", "view");
  },
  component: InquiriesPage,
});

const STATUS_FA: Record<InquiryStatus, string> = {
  draft: "پیش‌نویس",
  pending: "در انتظار پاسخ",
  warning_5min: "هشدار ۵ دقیقه",
  danger_8min: "هشدار ۸ دقیقه",
  critical_10min: "بحرانی ۱۰ دقیقه",
  transfer_available: "قابل انتقال",
  transferred: "منتقل شد",
  answered: "پاسخ داده شد",
  completed_on_time: "تکمیل به‌موقع",
  completed_late: "تکمیل با تأخیر",
  expired: "منقضی",
  cancelled: "لغو",
  rejected: "رد شد",
};

const OPEN_STATUSES: InquiryStatus[] = [
  "pending",
  "warning_5min",
  "danger_8min",
  "critical_10min",
  "transfer_available",
  "transferred",
  "draft",
];

function InquiriesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, error } = useAllInquiries(true);
  const [filter, setFilter] = useState<"open" | "all" | "mine">("open");

  const rows = useMemo(() => {
    const all = data ?? [];
    if (filter === "all") return all;
    if (filter === "mine") {
      return all.filter((r) => r.requested_by === user?.id || r.assigned_to === user?.id);
    }
    return all.filter((r) => OPEN_STATUSES.includes(r.status));
  }, [data, filter, user?.id]);

  const cancelMut = useMutation({
    mutationFn: (id: string) => updateInquiryStatus(id, "cancelled"),
    onSuccess: () => {
      toast.success("استعلام لغو شد");
      qc.invalidateQueries({ queryKey: ["inquiries"] });
    },
    onError: (e: Error) => toast.error(e.message || "لغو ناموفق بود"),
  });

  return (
    <div className="container py-6 space-y-6" dir="rtl">
      <PageHeader
        title="استعلام‌های قیمت"
        description="فهرست استعلام‌های گروه‌های پیام‌رسان. تایمر SLA از بک‌اند (`tick_inquiries`) جلو می‌رود."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/messages">
              <MessageSquare className="ms-1 h-4 w-4" />
              باز کردن پیام‌رسان
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">باز</SelectItem>
            <SelectItem value="mine">مربوط به من</SelectItem>
            <SelectItem value="all">همه</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{formatNumber(rows.length)} مورد</span>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : error ? (
            <div className="text-sm text-destructive">{(error as Error).message}</div>
          ) : rows.length === 0 ? (
            <EmptyState
              title="استعلامی نیست"
              description="از داخل گروه پیام‌رسان می‌توانید استعلام قیمت ثبت کنید."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>محصول</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>ایجاد</TableHead>
                    <TableHead>پاسخ‌ها</TableHead>
                    <TableHead>عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const canCancel =
                      OPEN_STATUSES.includes(row.status) &&
                      (row.requested_by === user?.id || row.assigned_to === user?.id);
                    const latestPrice = [...(row.replies ?? [])].sort(
                      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
                    )[0];
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="font-medium">{row.product?.name ?? "—"}</div>
                          {row.product?.sku && (
                            <div className="text-xs text-muted-foreground" dir="ltr">
                              {row.product.sku}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{STATUS_FA[row.status]}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {formatJalaliDateTime(row.created_at)}
                        </TableCell>
                        <TableCell>
                          {latestPrice ? (
                            <span dir="ltr">{formatNumber(latestPrice.price)} تومان</span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          {canCancel ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={cancelMut.isPending}
                              onClick={() => cancelMut.mutate(row.id)}
                            >
                              <XCircle className="ms-1 h-3.5 w-3.5" />
                              لغو
                            </Button>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
