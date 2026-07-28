import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Upload, MessageSquare, Pencil } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { formatJalaliDateTime } from "@/lib/messenger/format";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  purchaseStatusLabel,
  purchaseStatusBadgeClass,
  toPersianDigits,
} from "@/lib/purchase/labels";
import type { PurchaseRequestRow } from "@/hooks/purchase/usePurchase";
import { PurchaseReceiptUploader } from "./PurchaseReceiptUploader";
import { PurchaseRequestEditDialog } from "./PurchaseRequestEditDialog";
import { PurchaseStatusActions } from "./PurchaseStatusActions";

function formatMoney(n: number | null): string {
  if (n == null) return "—";
  return `${toPersianDigits(Math.round(n).toLocaleString("en-US"))} تومان`;
}

export function PurchaseRequestCard({ request }: { request: PurchaseRequestRow }) {
  const { user } = useAuth();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const canUpload = request.status === "purchased" && !!user && request.assigned_to === user.id;
  // هم‌راستا با سیاست RLS (migration 219): فقط درخواست‌دهنده و فقط تا پیش از
  // تأیید. اگر گارد UI بازتر از RLS باشد، کاربر دکمه‌ای می‌بیند که بک‌اند ردش
  // می‌کند.
  const canEdit = request.status === "pending" && !!user && request.requested_by === user.id;

  return (
    <Card>
      <CardContent className="space-y-3 p-4" dir="rtl">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-medium">{request.product_name}</div>
            <div className="text-xs text-muted-foreground">
              {toPersianDigits(request.quantity)} {request.unit}
            </div>
          </div>
          <Badge variant="outline" className={purchaseStatusBadgeClass(request.status)}>
            {purchaseStatusLabel(request.status)}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div>
            <span className="block text-[10px]">درخواست‌دهنده</span>
            <span className="text-foreground">{request.requester_name ?? "—"}</span>
          </div>
          <div>
            <span className="block text-[10px]">مسئول</span>
            <span className="text-foreground">{request.assignee_name ?? "—"}</span>
          </div>
          <div>
            <span className="block text-[10px]">قیمت تخمینی</span>
            <span className="text-foreground">{formatMoney(request.expected_price)}</span>
          </div>
          <div>
            <span className="block text-[10px]">قیمت نهایی</span>
            <span className="text-foreground">{formatMoney(request.final_price)}</span>
          </div>
        </div>

        {request.notes && <div className="rounded-md bg-muted/40 p-2 text-xs">{request.notes}</div>}

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{formatJalaliDateTime(request.created_at)}</span>
          <div className="flex items-center gap-2">
            {request.inquiry_id && (
              <Button asChild variant="ghost" size="sm">
                <Link to="/messages">
                  <MessageSquare className="ml-1 h-4 w-4" />
                  استعلام مرتبط
                </Link>
              </Button>
            )}
            {request.receipt_count > 0 && (
              <Badge variant="secondary">{toPersianDigits(request.receipt_count)} رسید</Badge>
            )}
            {canEdit && (
              <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="ml-1 h-4 w-4" />
                ویرایش
              </Button>
            )}
            {canUpload && (
              <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)}>
                <Upload className="ml-1 h-4 w-4" />
                آپلود رسید
              </Button>
            )}
          </div>
        </div>

        {/*
          گذار وضعیت تا امروز فقط در «مدیریت خرید» (/admin/purchase، ویژهٔ ادمین)
          رندر می‌شد. نتیجه‌اش این بود که درخواستی که از همین صفحه ثبت می‌شد
          هیچ‌وقت به «خرید انجام شد» نمی‌رسید، و چون دکمهٔ آپلود رسید به همان
          وضعیت گره خورده، عملاً هرگز ظاهر نمی‌شد.
          خودِ کامپوننت با isManager || isAssignee محافظت می‌شود و برای بقیه
          null برمی‌گرداند، پس رندر کردنش اینجا دسترسی جدیدی باز نمی‌کند.
        */}
        <PurchaseStatusActions request={request} />
      </CardContent>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>آپلود رسید خرید</DialogTitle>
          </DialogHeader>
          <PurchaseReceiptUploader requestId={request.id} />
        </DialogContent>
      </Dialog>

      {canEdit && (
        <PurchaseRequestEditDialog request={request} open={editOpen} onOpenChange={setEditOpen} />
      )}
    </Card>
  );
}
