import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  updateSalesInteractionStatus,
  salesDeskErrorMessage,
  type SalesInteractionStatus,
} from "@/lib/sales-desk";
import { LostReasonDialog, type LostReasonSubmit } from "./LostReasonDialog";

type Props = {
  interactionId: string;
  currentStatus?: string;
  onUpdated?: (status: SalesInteractionStatus) => void;
  disabled?: boolean;
  /** Show reopen button when status is won/lost */
  allowReopen?: boolean;
};

/**
 * دکمه‌های نتیجه برای یک interaction باز (موفق شد / ناموفق شد / …).
 */
export function OutcomeButtons({
  interactionId,
  currentStatus,
  onUpdated,
  disabled,
  allowReopen = true,
}: Props) {
  const [lostOpen, setLostOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: (input: {
      status: SalesInteractionStatus;
      lost?: LostReasonSubmit;
    }) =>
      updateSalesInteractionStatus({
        id: interactionId,
        status: input.status,
        lostReasonId: input.lost?.lostReasonId,
        lostReasonNote: input.lost?.lostReasonNote,
        lostReasonOther: input.lost?.lostReasonOther,
      }),
    onSuccess: (_id, vars) => {
      toast.success("وضعیت به‌روز شد");
      setLostOpen(false);
      onUpdated?.(vars.status);
    },
    onError: (e: Error) =>
      toast.error(salesDeskErrorMessage(e.message) || "به‌روزرسانی ناموفق بود"),
  });

  if (currentStatus && currentStatus !== "open") {
    return (
      <div className="flex flex-wrap items-center gap-2" dir="rtl">
        <span className="text-xs text-muted-foreground">
          وضعیت: {salesInteractionStatusLabel(currentStatus)}
        </span>
        {allowReopen && (currentStatus === "won" || currentStatus === "lost") ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || mutation.isPending}
            onClick={() => mutation.mutate({ status: "open" })}
          >
            {mutation.isPending && mutation.variables?.status === "open" ? (
              <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" />
            ) : null}
            جاری
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-1.5" dir="rtl">
        <Button
          type="button"
          size="sm"
          variant="default"
          disabled={disabled || mutation.isPending}
          onClick={() => mutation.mutate({ status: "won" })}
        >
          {mutation.isPending && mutation.variables?.status === "won" ? (
            <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" />
          ) : null}
          موفق شد
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || mutation.isPending}
          onClick={() => setLostOpen(true)}
        >
          ناموفق شد
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={disabled || mutation.isPending}
          onClick={() => mutation.mutate({ status: "done" })}
        >
          {mutation.isPending && mutation.variables?.status === "done" ? (
            <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" />
          ) : null}
          انجام شد
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || mutation.isPending}
          onClick={() => mutation.mutate({ status: "cancelled" })}
        >
          {mutation.isPending && mutation.variables?.status === "cancelled" ? (
            <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" />
          ) : null}
          لغو
        </Button>
      </div>

      <LostReasonDialog
        open={lostOpen}
        onOpenChange={setLostOpen}
        pending={mutation.isPending && mutation.variables?.status === "lost"}
        onConfirm={(lost) => mutation.mutate({ status: "lost", lost })}
      />
    </>
  );
}

/** برچسب فارسی وضعیت تعامل — برای تایم‌لاین و دکمه‌ها مشترک. */
export function salesInteractionStatusLabel(s: string): string {
  switch (s) {
    case "won":
      return "موفق";
    case "lost":
      return "ناموفق";
    case "done":
      return "انجام‌شده";
    case "cancelled":
      return "لغو";
    case "open":
      return "جاری";
    default:
      return s;
  }
}
