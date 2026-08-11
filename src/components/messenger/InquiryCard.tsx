import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShoppingCart, ArrowRightLeft, Loader2, Clock, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { formatJalaliDateTime } from "@/lib/messenger/format";
import { transferInquiry } from "@/lib/messenger/inquiries.functions";
import { useGroupRole, useGroupPurchasers } from "@/hooks/messenger/useGroupRole";
import type { InquiryRow, InquiryStatus } from "@/hooks/messenger/useInquiries";
import { InquiryReplyDialog } from "./InquiryReplyDialog";

const STATUS_STYLE: Record<InquiryStatus, { bg: string; label: string }> = {
  draft:               { bg: "#475569", label: "پیش‌نویس" },
  pending:             { bg: "#0F766E", label: "در انتظار پاسخ" },
  warning_5min:        { bg: "#8A5A00", label: "هشدار ۵ دقیقه" },
  danger_8min:         { bg: "#B54708", label: "هشدار ۸ دقیقه" },
  critical_10min:      { bg: "#B42318", label: "بحرانی ۱۰ دقیقه" },
  transfer_available:  { bg: "#B42318", label: "قابل انتقال" },
  transferred:         { bg: "#6D28D9", label: "منتقل شد" },
  answered:            { bg: "#0B6E4F", label: "پاسخ داده شد" },
  completed_on_time:   { bg: "#0B6E4F", label: "تکمیل به‌موقع" },
  completed_late:      { bg: "#C2410C", label: "تکمیل با تأخیر" },
  expired:             { bg: "#4B5563", label: "منقضی" },
  cancelled:           { bg: "#6B7280", label: "لغو" },
  rejected:            { bg: "#6B7280", label: "رد شد" },
};

// مهلت پیش‌فرض پاسخ به استعلام: ۱۰ دقیقه از زمان ایجاد
const DEADLINE_MINUTES = 10;

const ACTIVE_TIMER_STATUSES: ReadonlySet<InquiryStatus> = new Set<InquiryStatus>([
  "pending",
  "warning_5min",
  "danger_8min",
  "critical_10min",
  "transfer_available",
]);

function toPersianDigits(input: string | number): string {
  const map = ["۰","۱","۲","۳","۴","۵","۶","۷","۸","۹"];
  return String(input).replace(/\d/g, (d) => map[Number(d)]);
}

function formatRemaining(createdAt: string, nowMs: number): { text: string; expired: boolean } {
  const deadlineMs = new Date(createdAt).getTime() + DEADLINE_MINUTES * 60_000;
  const diffMs = deadlineMs - nowMs;
  if (diffMs <= 0) {
    const overdueMin = Math.floor(-diffMs / 60_000);
    return {
      text: overdueMin > 0
        ? `مهلت گذشت (${toPersianDigits(overdueMin)} دقیقه)`
        : "مهلت تمام شد",
      expired: true,
    };
  }
  const totalSec = Math.floor(diffMs / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min >= 1) {
    return { text: `مهلت: ${toPersianDigits(min)} دقیقه مانده`, expired: false };
  }
  return { text: `مهلت: ${toPersianDigits(sec)} ثانیه مانده`, expired: false };
}

export function InquiryCard({
  inquiry,
  currentUserId,
}: {
  inquiry: InquiryRow;
  currentUserId: string | null;
}) {
  const style = STATUS_STYLE[inquiry.status] ?? { bg: "#374151", label: inquiry.status };
  const [replyOpen, setReplyOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const isTimerActive = ACTIVE_TIMER_STATUSES.has(inquiry.status);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!isTimerActive) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, [isTimerActive]);

  const remaining = useMemo(
    () => (isTimerActive ? formatRemaining(inquiry.created_at, nowMs) : null),
    [isTimerActive, inquiry.created_at, nowMs],
  );

  const timerBg = remaining?.expired
    ? "#B42318"
    : inquiry.status === "warning_5min"
      ? "#8A5A00"
      : inquiry.status === "danger_8min"
        ? "#B54708"
        : inquiry.status === "critical_10min" || inquiry.status === "transfer_available"
          ? "#B42318"
          : "#0F766E";

  const { data: role } = useGroupRole(inquiry.group_id, currentUserId);
  const isAssignee = currentUserId === inquiry.assigned_to;
  const isPurchaser = role === "purchaser";
  const isMember = !!role;

  const canReply =
    (isAssignee || isPurchaser) &&
    inquiry.status !== "answered" &&
    inquiry.status !== "completed_on_time" &&
    inquiry.status !== "completed_late" &&
    inquiry.status !== "expired" &&
    inquiry.status !== "cancelled" &&
    inquiry.status !== "rejected";

  const canTransfer =
    isMember && (inquiry.status === "transfer_available" || inquiry.status === "critical_10min");

  return (
    <div
      dir="rtl"
      className="rounded-2xl border bg-card p-3 shadow-sm text-card-foreground"
      data-inquiry-id={inquiry.id}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">استعلام قیمت</span>
        </div>
        {remaining ? (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
            style={{ backgroundColor: timerBg }}
            title={`وضعیت: ${style.label}`}
          >
            <Clock className="h-3 w-3" />
            {remaining.text}
          </span>
        ) : (
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
            style={{ backgroundColor: style.bg }}
            title={style.label}
          >
            {style.label}
          </span>
        )}
      </div>

      <div className="mt-2 space-y-1">
        <div className="text-sm font-medium">{inquiry.product?.name ?? "—"}</div>
        {inquiry.product?.sku && (
          <div className="text-xs text-muted-foreground" dir="ltr">
            SKU: {inquiry.product.sku}
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
        <CalendarDays className="h-3 w-3" />
        <span>ایجاد: {formatJalaliDateTime(inquiry.created_at)}</span>
      </div>
      {remaining && (
        <div
          className="mt-1 text-[11px] text-muted-foreground"
          title="وضعیت فعلی استعلام"
        >
          وضعیت: {style.label}
        </div>
      )}

      {inquiry.replies && inquiry.replies.length > 0 && (
        <div className="mt-3 space-y-1.5 rounded-lg border bg-muted/40 p-2">
          {[...inquiry.replies]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .map((r) => (
              <div key={r.id} className="space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">قیمت اعلامی</span>
                  <span className="text-sm font-semibold" dir="ltr">
                    {toPersianDigits(Number(r.price).toLocaleString("en-US"))} تومان
                  </span>
                </div>
                {r.note && (
                  <div className="text-[11px] text-muted-foreground whitespace-pre-wrap break-words">
                    {r.note}
                  </div>
                )}
                <div className="text-[10px] text-muted-foreground" dir="ltr">
                  {formatJalaliDateTime(r.created_at)}
                </div>
              </div>
            ))}
        </div>
      )}

      {(canReply || canTransfer) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {canReply && (
            <Button size="sm" onClick={() => setReplyOpen(true)}>
              ثبت قیمت
            </Button>
          )}
          {canTransfer && (
            <Button size="sm" variant="outline" onClick={() => setTransferOpen(true)}>
              <ArrowRightLeft className="ml-1 h-3.5 w-3.5" /> انتقال
            </Button>
          )}
        </div>
      )}

      {replyOpen && (
        <InquiryReplyDialog
          open={replyOpen}
          onOpenChange={setReplyOpen}
          inquiryId={inquiry.id}
        />
      )}
      {transferOpen && (
        <TransferDialog
          open={transferOpen}
          onOpenChange={setTransferOpen}
          inquiry={inquiry}
        />
      )}
    </div>
  );
}

function TransferDialog({
  open,
  onOpenChange,
  inquiry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inquiry: InquiryRow;
}) {
  const [toUser, setToUser] = useState<string | null>(null);
  const { data: purchasers, isLoading } = useGroupPurchasers(inquiry.group_id);
  const candidates = (purchasers ?? []).filter((p) => p.user_id !== inquiry.assigned_to);
  const transferFn = useServerFn(transferInquiry);

  const submit = useMutation({
    mutationFn: async () => {
      if (!toUser) throw new Error("یک مسئول خرید را انتخاب کنید.");
      const res = await transferFn({
        data: { inquiry_id: inquiry.id, to_user: toUser },
      });
      if (!res.ok) throw new Error(res.error || "انتقال ناموفق بود.");
    },
    onSuccess: () => {
      toast.success("استعلام منتقل شد.");
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "خطا در انتقال.");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>انتقال استعلام به مسئول خرید دیگر</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {isLoading && (
            <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
              <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال بارگذاری…
            </div>
          )}
          {!isLoading && candidates.length === 0 && (
            <div className="py-4 text-center text-sm text-muted-foreground">
              مسئول خرید دیگری در این گروه وجود ندارد.
            </div>
          )}
          {!isLoading &&
            candidates.map((p) => (
              <button
                key={p.user_id}
                type="button"
                onClick={() => setToUser(p.user_id)}
                className={`block w-full rounded-md border px-3 py-2 text-right text-sm hover:bg-muted ${
                  toUser === p.user_id ? "border-primary bg-primary/10" : ""
                }`}
              >
                {p.full_name || "بدون نام"}
              </button>
            ))}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submit.isPending}>
            انصراف
          </Button>
          <Button onClick={() => submit.mutate()} disabled={submit.isPending || !toUser}>
            {submit.isPending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null}
            انتقال
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}