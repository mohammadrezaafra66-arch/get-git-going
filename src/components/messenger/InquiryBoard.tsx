import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ShoppingCart,
  ArrowRightLeft,
  Clock,
  Inbox,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatJalaliDateTime } from "@/lib/messenger/format";
import { transferInquiry } from "@/lib/messenger/inquiries.functions";
import { useGroupRole, useGroupPurchasers } from "@/hooks/messenger/useGroupRole";
import { useInquiries, type InquiryRow, type InquiryStatus } from "@/hooks/messenger/useInquiries";
import { tickInquiries } from "@/lib/messenger/inquiry-status";
import { InquiryReplyDialog } from "./InquiryReplyDialog";

const PRIORITY: Record<InquiryStatus, number> = {
  critical_10min: 0,
  transfer_available: 1,
  danger_8min: 2,
  warning_5min: 3,
  pending: 4,
  transferred: 5,
  answered: 6,
  completed_late: 7,
  completed_on_time: 8,
  expired: 9,
  rejected: 10,
  cancelled: 11,
  draft: 12,
};

const STATUS_BAR_COLOR: Record<InquiryStatus, string> = {
  critical_10min: "#B42318",
  transfer_available: "#B42318",
  danger_8min: "#B54708",
  warning_5min: "#8A5A00",
  pending: "#0F766E",
  transferred: "#6D28D9",
  answered: "#0B6E4F",
  completed_on_time: "#0B6E4F",
  completed_late: "#C2410C",
  expired: "#4B5563",
  cancelled: "#6B7280",
  rejected: "#6B7280",
  draft: "#475569",
};

const STATUS_LABEL: Record<InquiryStatus, string> = {
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

export const URGENT_STATUSES: ReadonlySet<InquiryStatus> = new Set<InquiryStatus>([
  "critical_10min",
  "transfer_available",
  "danger_8min",
  "warning_5min",
]);

const ACTIVE_TIMER_STATUSES: ReadonlySet<InquiryStatus> = new Set<InquiryStatus>([
  "pending",
  "warning_5min",
  "danger_8min",
  "critical_10min",
  "transfer_available",
]);

const DEADLINE_MINUTES = 10;

type BucketKey = "critical" | "warning" | "active" | "done" | "closed";

const STATUS_TO_BUCKET: Record<InquiryStatus, BucketKey> = {
  critical_10min: "critical",
  transfer_available: "critical",
  danger_8min: "warning",
  warning_5min: "warning",
  pending: "active",
  transferred: "active",
  draft: "active",
  answered: "done",
  completed_on_time: "done",
  completed_late: "done",
  expired: "closed",
  cancelled: "closed",
  rejected: "closed",
};

const BUCKET_CONFIG: Array<{
  key: BucketKey;
  label: string;
  emoji: string;
  defaultOpen: boolean;
  lockOpen: boolean;
  headerColor: string;
}> = [
  {
    key: "critical",
    label: "بحرانی",
    emoji: "🔴",
    defaultOpen: true,
    lockOpen: true,
    headerColor: "#B42318",
  },
  {
    key: "warning",
    label: "هشدار",
    emoji: "🟠",
    defaultOpen: true,
    lockOpen: true,
    headerColor: "#B54708",
  },
  {
    key: "active",
    label: "در انتظار",
    emoji: "🟡",
    defaultOpen: true,
    lockOpen: false,
    headerColor: "#0F766E",
  },
  {
    key: "done",
    label: "تکمیل‌شده",
    emoji: "✅",
    defaultOpen: false,
    lockOpen: false,
    headerColor: "#0B6E4F",
  },
  {
    key: "closed",
    label: "بسته‌شده",
    emoji: "⚫",
    defaultOpen: false,
    lockOpen: false,
    headerColor: "#4B5563",
  },
];

function toPersianDigits(input: string | number): string {
  const map = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return String(input).replace(/\d/g, (d) => map[Number(d)]);
}

function formatRemaining(createdAt: string, nowMs: number): { text: string; expired: boolean } {
  const deadlineMs = new Date(createdAt).getTime() + DEADLINE_MINUTES * 60_000;
  const diffMs = deadlineMs - nowMs;
  if (diffMs <= 0) {
    const overdueMin = Math.floor(-diffMs / 60_000);
    return {
      text: overdueMin > 0 ? `مهلت گذشت (${toPersianDigits(overdueMin)} دقیقه)` : "مهلت تمام شد",
      expired: true,
    };
  }
  const totalSec = Math.floor(diffMs / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min >= 1) return { text: `مهلت: ${toPersianDigits(min)} دقیقه مانده`, expired: false };
  return { text: `مهلت: ${toPersianDigits(sec)} ثانیه مانده`, expired: false };
}

export function InquiryBoard({
  groupId,
  currentUserId,
  active,
}: {
  groupId: string;
  currentUserId: string | null;
  active: boolean;
}) {
  const { data: inquiries, isLoading } = useInquiries(groupId);
  const qc = useQueryClient();

  const [openBuckets, setOpenBuckets] = useState<Record<BucketKey, boolean>>(() => {
    const initial = {} as Record<BucketKey, boolean>;
    BUCKET_CONFIG.forEach((b) => {
      initial[b.key] = b.defaultOpen;
    });
    return initial;
  });

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const run = async () => {
      try {
        await tickInquiries();
      } catch {
        // Best-effort SLA tick (backend may 42P10 inside expire_pending_documents).
      }
      if (!cancelled) qc.invalidateQueries({ queryKey: ["inquiries", groupId] });
    };
    void run();
    const id = window.setInterval(run, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [active, groupId, qc]);

  const grouped = useMemo(() => {
    const map = {} as Record<BucketKey, InquiryRow[]>;
    BUCKET_CONFIG.forEach((b) => {
      map[b.key] = [];
    });
    for (const inq of inquiries ?? []) {
      const bucket = STATUS_TO_BUCKET[inq.status] ?? "closed";
      map[bucket].push(inq);
    }
    for (const key of Object.keys(map) as BucketKey[]) {
      map[key].sort((a, b) => {
        const pa = PRIORITY[a.status] ?? 99;
        const pb = PRIORITY[b.status] ?? 99;
        if (pa !== pb) return pa - pb;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
    }
    return map;
  }, [inquiries]);

  const toggleBucket = (key: BucketKey) => {
    const config = BUCKET_CONFIG.find((b) => b.key === key);
    if (config?.lockOpen) return;
    setOpenBuckets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const hasAny = BUCKET_CONFIG.some((b) => (grouped[b.key]?.length ?? 0) > 0);

  if (!hasAny) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
        <Inbox className="h-10 w-10" />
        <p className="text-sm">هیچ استعلامی در این گروه ثبت نشده</p>
      </div>
    );
  }

  return (
    <div dir="rtl" className="flex flex-col gap-1 p-2">
      {BUCKET_CONFIG.map((config) => {
        const items = grouped[config.key] ?? [];
        if (items.length === 0) return null;
        const isOpen = openBuckets[config.key];
        return (
          <InquiryBucketSection
            key={config.key}
            config={config}
            items={items}
            isOpen={isOpen}
            onToggle={() => toggleBucket(config.key)}
            currentUserId={currentUserId}
          />
        );
      })}
    </div>
  );
}

function InquiryBucketSection({
  config,
  items,
  isOpen,
  onToggle,
  currentUserId,
}: {
  config: (typeof BUCKET_CONFIG)[number];
  items: InquiryRow[];
  isOpen: boolean;
  onToggle: () => void;
  currentUserId: string | null;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <button
        type="button"
        onClick={onToggle}
        disabled={config.lockOpen}
        className={`flex w-full items-center gap-2 px-3 py-2 text-right transition-colors ${
          config.lockOpen ? "cursor-default" : "hover:bg-muted/50 cursor-pointer"
        }`}
        aria-expanded={isOpen}
      >
        <span
          className="h-4 w-1 shrink-0 rounded-full"
          style={{ backgroundColor: config.headerColor }}
          aria-hidden="true"
        />
        <span className="text-sm">{config.emoji}</span>
        <span className="flex-1 text-right text-sm font-semibold">{config.label}</span>
        <span
          className="min-w-[1.5rem] rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold text-white"
          style={{ backgroundColor: config.headerColor }}
        >
          {toPersianDigits(items.length)}
        </span>
        {!config.lockOpen &&
          (isOpen ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ))}
      </button>
      {isOpen && (
        <div className="flex flex-col gap-2 border-t p-2">
          {items.map((inq) => (
            <CompactInquiryCard key={inq.id} inquiry={inq} currentUserId={currentUserId} />
          ))}
        </div>
      )}
    </div>
  );
}

function CompactInquiryCard({
  inquiry,
  currentUserId,
}: {
  inquiry: InquiryRow;
  currentUserId: string | null;
}) {
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

  const barColor = STATUS_BAR_COLOR[inquiry.status] ?? "#475569";
  const label = STATUS_LABEL[inquiry.status] ?? inquiry.status;
  const { data: role } = useGroupRole(inquiry.group_id, currentUserId);
  const isAssignee = currentUserId === inquiry.assigned_to;
  const isPurchaser = role === "purchaser";
  const isMember = !!role;

  const canReply =
    (isAssignee || isPurchaser) &&
    ![
      "answered",
      "completed_on_time",
      "completed_late",
      "expired",
      "cancelled",
      "rejected",
    ].includes(inquiry.status);

  const canTransfer = isMember && ["transfer_available", "critical_10min"].includes(inquiry.status);

  const timerBg = remaining?.expired ? "#B42318" : barColor;

  return (
    <div
      className="relative flex w-full overflow-hidden rounded-xl border bg-background text-card-foreground shadow-sm"
      data-inquiry-id={inquiry.id}
    >
      <div className="w-1 shrink-0" style={{ backgroundColor: barColor }} aria-hidden="true" />
      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <ShoppingCart className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate text-sm font-semibold">{inquiry.product?.name ?? "—"}</span>
          </div>
          {remaining ? (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
              style={{ backgroundColor: timerBg }}
            >
              <Clock className="h-3 w-3" />
              {remaining.text}
            </span>
          ) : (
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
              style={{ backgroundColor: barColor }}
            >
              {label}
            </span>
          )}
        </div>
        {inquiry.product?.sku && (
          <div className="text-[11px] text-muted-foreground" dir="ltr">
            SKU: {inquiry.product.sku}
          </div>
        )}
        <div className="text-[11px] text-muted-foreground">
          ایجاد: {formatJalaliDateTime(inquiry.created_at)}
        </div>
        {(canReply || canTransfer) && (
          <div className="mt-1 flex flex-wrap gap-2">
            {canReply && (
              <Button size="sm" className="h-7 px-2 text-xs" onClick={() => setReplyOpen(true)}>
                ثبت قیمت
              </Button>
            )}
            {canTransfer && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={() => setTransferOpen(true)}
              >
                <ArrowRightLeft className="ml-1 h-3 w-3" /> انتقال
              </Button>
            )}
          </div>
        )}
      </div>
      {replyOpen && (
        <InquiryReplyDialog open={replyOpen} onOpenChange={setReplyOpen} inquiryId={inquiry.id} />
      )}
      {transferOpen && (
        <CompactTransferDialog
          open={transferOpen}
          onOpenChange={setTransferOpen}
          inquiry={inquiry}
        />
      )}
    </div>
  );
}

function CompactTransferDialog({
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
      const res = await transferFn({ data: { inquiry_id: inquiry.id, to_user: toUser } });
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
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submit.isPending}>
            انصراف
          </Button>
          <Button onClick={() => submit.mutate()} disabled={submit.isPending || !toUser}>
            {submit.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            انتقال
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { toPersianDigits as inquiryBoardToPersianDigits };
