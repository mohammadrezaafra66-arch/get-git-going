import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  updateSalesInteractionStatus,
  salesDeskErrorMessage,
  type SalesInteractionStatus,
} from "@/lib/sales-desk";
import type { DealCapabilities } from "@/lib/sales-desk/capabilities";
import { deleteSalesDeal } from "@/lib/sales-desk/pipelines";
import { LostReasonDialog, type LostReasonSubmit } from "./LostReasonDialog";

type Props = {
  interactionId: string;
  currentStatus?: string;
  onUpdated?: (status: SalesInteractionStatus) => void;
  disabled?: boolean;
  /** Show reopen button when status is won/lost */
  allowReopen?: boolean;
  kind?: string;
  capabilities?: DealCapabilities | null;
  /** Increment to open the lost-reason dialog (D9 banner). */
  lostOpenSignal?: number;
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
  kind,
  capabilities,
  lostOpenSignal,
}: Props) {
  const [lostOpen, setLostOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);

  useEffect(() => {
    if (lostOpenSignal && lostOpenSignal > 0) setLostOpen(true);
  }, [lostOpenSignal]);

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

  const isDeal = kind === "request" || !!capabilities;
  const canReopen = capabilities ? capabilities.can_reopen : allowReopen;
  const canWon = capabilities ? capabilities.can_set_won : true;
  const canLost = capabilities ? capabilities.can_set_lost : true;
  const canDelete = capabilities?.can_delete ?? false;

  if (currentStatus && currentStatus !== "open") {
    return (
      <div className="flex flex-wrap items-center gap-2" dir="rtl">
        <span className="text-xs text-muted-foreground">
          وضعیت: {salesInteractionStatusLabel(currentStatus)}
        </span>
        {canReopen && (currentStatus === "won" || currentStatus === "lost") ? (
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
            {isDeal ? "تبدیل به جاری" : "جاری"}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-1.5" dir="rtl">
        {canWon ? (
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
        ) : null}
        {canLost ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || mutation.isPending}
            onClick={() => setLostOpen(true)}
          >
            ناموفق شد
          </Button>
        ) : null}
        {!isDeal ? (
          <>
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
          </>
        ) : null}
        {canDelete ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled || deletePending}
            onClick={() => setDeleteOpen(true)}
          >
            {deletePending ? <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" /> : null}
            حذف
          </Button>
        ) : null}
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>آیا از حذف این معامله مطمئن هستید؟</AlertDialogTitle>
            <AlertDialogDescription className="sr-only">
              آیا از حذف این معامله مطمئن هستید؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              disabled={deletePending}
              onClick={(e) => {
                e.preventDefault();
                setDeletePending(true);
                deleteSalesDeal(interactionId)
                  .then(() => {
                    setDeleteOpen(false);
                    onUpdated?.("open");
                  })
                  .catch((err: Error) =>
                    toast.error(salesDeskErrorMessage(err.message) || "حذف ناموفق بود"),
                  )
                  .finally(() => setDeletePending(false));
              }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LostReasonDialog
        open={lostOpen}
        onOpenChange={setLostOpen}
        openActivityCount={capabilities?.open_activity_count ?? 0}
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
