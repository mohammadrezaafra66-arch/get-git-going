import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Upload, MessageSquare, Pencil, UserCog } from "lucide-react";
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
import { PurchaseFulfillmentSummary } from "./PurchaseFulfillmentSummary";
import { PurchaseAssignDialog } from "./PurchaseAssignDialog";

function formatMoney(n: number | null): string {
  if (n == null) return "—";
  return `${toPersianDigits(Math.round(n).toLocaleString("en-US"))} تومان`;
}

export function PurchaseRequestCard({ request }: { request: PurchaseRequestRow }) {
  const { user, roles } = useAuth();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const canAssign =
    (roles.includes("admin") || roles.includes("manager")) && request.status !== "cancelled";
  // Issue 219 / C3: a partially supplied request has real purchases against it,
  // so its receipts are just as relevant as a fully supplied one's.
  const canUpload =
    (request.status === "purchased" || request.status === "partially_purchased") &&
    !!user &&
    request.assigned_to === user.id;
  // هم‌راستا با سیاست RLS (migration 219): فقط درخواست‌دهنده و فقط تا پیش از
  // تأیید. اگر گارد UI بازتر از RLS باشد، کاربر دکمه‌ای می‌بیند که بک‌اند ردش
  // می‌کند.
  const canEdit = request.status === "pending" && !!user && request.requested_by === user.id;

  return (
    // The id is exposed so a test can address one specific card. Cards are
    // otherwise only distinguishable by their notes text, which is not stable.
    <Card data-testid="purchase-request-card" data-request-id={request.id}>
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

        {/*
          min-w-0 + truncate: a grid child defaults to min-width:auto, so a long
          full name refuses to shrink and pushes the card past the viewport.
          Caught by the 768px mobile test.
        */}
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div className="min-w-0">
            <span className="block text-[10px]">درخواست‌دهنده</span>
            <span className="block truncate text-foreground">{request.requester_name ?? "—"}</span>
          </div>
          <div className="min-w-0">
            <span className="block text-[10px]">مسئول</span>
            {/*
              Issue 219 / C4 — an ownerless request says so, loudly. Before C4
              this could not happen: every request was silently handed to
              whichever manager happened to be the oldest row. Now "nobody" is a
              real state, and a dash would hide it.
            */}
            {request.assigned_to ? (
              <span className="block truncate text-foreground">{request.assignee_name ?? "—"}</span>
            ) : (
              <Badge
                variant="outline"
                data-testid="unassigned-badge"
                className="border-amber-300 bg-amber-100 text-[10px] text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
              >
                بدون مسئول
              </Badge>
            )}
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

        {/*
          Issue 219 / C3 — the registered purchase, shown where it was created.
          A dedicated purchase detail page is out of scope; this is the surface
          the final report chose instead. Financial columns are stripped
          server-side for roles that may not see them.
        */}
        <PurchaseFulfillmentSummary request={request} />

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{formatJalaliDateTime(request.created_at)}</span>
          {/*
            flex-wrap because C4 adds a fourth control here. Without it the row
            cannot break and the card overflows the viewport at 768px — which is
            exactly what the mobile test caught.
          */}
          <div className="flex flex-wrap items-center gap-2">
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
            {/*
              Issue 219 / C4. Admin/manager only, matching assign_purchase_request
              exactly — a specialist seeing a button the server would refuse is
              worse than not seeing one. Cancelled requests are excluded for the
              same reason: the RPC rejects them.
            */}
            {canAssign && (
              <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)}>
                <UserCog className="ml-1 h-4 w-4" />
                {request.assigned_to ? "تغییر مسئول" : "تعیین مسئول"}
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

      {canAssign && (
        <PurchaseAssignDialog request={request} open={assignOpen} onOpenChange={setAssignOpen} />
      )}
    </Card>
  );
}
