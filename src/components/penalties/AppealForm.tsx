import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { formatJalaliDateTime } from "@/lib/messenger/format";
import {
  penaltyTypeLabel,
  severityLabel,
  remainingAppealMs,
  formatRemaining,
  SEVERITY_CLASS,
} from "@/lib/penalties/labels";
import { useSubmitAppeal, type UserPenalty } from "@/hooks/penalties/usePenalties";
import { Loader2 } from "lucide-react";

const MIN_LEN = 50;

function toPersianDigits(s: string | number): string {
  const map = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return String(s).replace(/[0-9]/g, (d) => map[Number(d)]);
}

export function AppealForm({
  penalty,
  open,
  onOpenChange,
}: {
  penalty: UserPenalty | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = useState("");
  const [remainingMs, setRemainingMs] = useState(0);
  const mutation = useSubmitAppeal();

  useEffect(() => {
    if (!open || !penalty) return;
    setReason("");
    const tick = () => setRemainingMs(remainingAppealMs(penalty.created_at));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [open, penalty]);

  if (!penalty) return null;

  const expired = remainingMs <= 0;
  const tooShort = reason.trim().length < MIN_LEN;
  const disabled = expired || tooShort || mutation.isPending;

  const handleSubmit = () => {
    mutation.mutate(
      { penaltyId: penalty.id, reason: reason.trim() },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>ثبت اعتراض به کارت قرمز</DialogTitle>
          <DialogDescription>
            دلیل خود را به‌صورت شفاف و حداقل {toPersianDigits(MIN_LEN)} کاراکتر بنویسید.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{penaltyTypeLabel(penalty.type)}</span>
              <Badge variant="outline" className={SEVERITY_CLASS[penalty.severity]}>
                {severityLabel(penalty.severity)}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground">
              تاریخ ثبت: {formatJalaliDateTime(penalty.created_at)}
            </div>
          </div>

          <div
            className={
              expired
                ? "rounded-md border border-red-300 bg-red-50 dark:bg-red-950/40 p-2 text-xs text-red-800 dark:text-red-200"
                : "rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/40 p-2 text-xs text-amber-800 dark:text-amber-200"
            }
          >
            {formatRemaining(remainingMs)}
          </div>

          <div className="space-y-1">
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="دلیل اعتراض را بنویسید..."
              rows={5}
              disabled={expired || mutation.isPending}
              dir="rtl"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{tooShort ? `حداقل ${toPersianDigits(MIN_LEN)} کاراکتر لازم است` : "آماده ارسال"}</span>
              <span>
                {toPersianDigits(reason.trim().length)} / {toPersianDigits(MIN_LEN)}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            انصراف
          </Button>
          <Button onClick={handleSubmit} disabled={disabled}>
            {mutation.isPending && <Loader2 className="ms-2 h-4 w-4 animate-spin" />}
            ارسال اعتراض
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}